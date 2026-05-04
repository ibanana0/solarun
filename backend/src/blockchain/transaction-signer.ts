/**
 * Blockchain Transaction Signer
 * Handles building, signing, and submitting transactions to Solana
 *
 * Responsibilities:
 * - Load admin keypair from environment
 * - Build instructions for smart contract calls (process_refunds)
 * - Sign transactions with admin keypair
 * - Submit to Solana devnet RPC
 * - Handle transaction confirmations
 */

import 'dotenv/config';
import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction,
    SystemProgram,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as anchor from "@coral-xyz/anchor";
import { Program, type Idl } from "@coral-xyz/anchor";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";

import idl from "./solarun_temp.json" with { type: "json" };

// ============================================================================
// Configuration
// ============================================================================

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const ADMIN_KEYPAIR_PATH = process.env.ADMIN_KEYPAIR_PATH;
const PROGRAM_ID = process.env.SOLARUN_PROGRAM_ID;
const VAULT_ADDRESS = process.env.VAULT_ADDRESS;

// ============================================================================
// Initialize Connection & Admin Keypair
// ============================================================================

let connection: Connection | null = null;
let adminKeypair: Keypair | null = null;

/**
 * Initialize Solana connection and load admin keypair
 * Called once at backend startup
 */
export function initBlockchainClient() {
    try {
        // Initialize RPC connection
        connection = new Connection(SOLANA_RPC_URL, 'confirmed');
        console.log(`✅ Solana RPC connected: ${SOLANA_RPC_URL}`);

        // Load admin keypair from file
        if (!ADMIN_KEYPAIR_PATH) {
            throw new Error('ADMIN_KEYPAIR_PATH not set in .env');
        }

        const keypairPath = path.resolve(ADMIN_KEYPAIR_PATH);
        if (!fs.existsSync(keypairPath)) {
            throw new Error(`Admin keypair file not found: ${keypairPath}`);
        }

        const keypairData = fs.readFileSync(keypairPath, 'utf-8');
        const keypairArray = JSON.parse(keypairData);
        adminKeypair = Keypair.fromSecretKey(new Uint8Array(keypairArray));

        console.log(`✅ Admin keypair loaded`);
        console.log(`   Public key: ${adminKeypair.publicKey.toBase58()}`);

        // Validate configuration
        if (!PROGRAM_ID) {
            throw new Error('SOLARUN_PROGRAM_ID not set in .env');
        }

        console.log(`✅ Program ID: ${PROGRAM_ID}`);
    } catch (error) {
        console.error('❌ Failed to initialize blockchain client:', error);
        throw error;
    }
}

/**
 * Get the Solana connection (lazy initialize if needed)
 */
function getConnection(): Connection {
    if (!connection) {
        connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    }
    return connection;
}

/**
 * Get the admin keypair
 */
export function getAdminKeypair(): Keypair {
    if (!adminKeypair) {
        throw new Error('Admin keypair not initialized. Call initBlockchainClient() first.');
    }
    return adminKeypair;
}

// ============================================================================
// Transaction Builders
// ============================================================================

/**
 * Build instruction for process_refunds
 *
 * This instruction:
 * - Distributes prizes to top 4 finishers
 * - Distributes refunds to non-finishers
 * - Marks event as settled
 */
export interface ProcessRefundsParams {
    eventId: string;
    programId: string;
    vaultAddress: string;
    adminWallet: PublicKey;
    recipientWallets: PublicKey[];
    amounts: anchor.BN[];
    nonFinishers: string[];
    mint?: PublicKey; // Optional: will derive default if not provided
}

export async function buildProcessRefundsInstruction(
    params: ProcessRefundsParams
): Promise<anchor.web3.TransactionInstruction> {
    const { eventId, vaultAddress, adminWallet, programId, recipientWallets, amounts, nonFinishers, mint } = params;

    // 1. Pembersihan UUID (Remove dashes)
    const cleanEventId = eventId.replace(/-/g, '');

    try {
        console.log(`\n📋 Building processRefunds instruction...`);
        console.log(`   Event ID: ${cleanEventId}`);
        console.log(`   Program ID: ${programId}`);
        console.log(`   Vault: ${vaultAddress}`);
        console.log(`   Admin: ${adminWallet.toBase58()}`);

        const provider = new anchor.AnchorProvider(
            getConnection(),
            new anchor.Wallet(getAdminKeypair()),
            { commitment: "confirmed" }
        );

        const program = new Program(
            { ...idl, address: programId } as Idl, 
            provider
        );

        // 2. Derivasi Event PDA menggunakan cleanEventId
        const [eventPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("event"), Buffer.from(cleanEventId)],
            program.programId
        );
        console.log(`   Event PDA: ${eventPda.toBase58()}`);

        // 3. Tentukan Mint Address (Gunakan yang dioper atau derive default mock_usdc_mint)
        let mintAddress: PublicKey;
        if (mint) {
            mintAddress = mint;
        } else {
            const [mintPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("mock_usdc_mint")],
                program.programId
            );
            mintAddress = mintPda;
        }
        console.log(`   Mint: ${mintAddress.toBase58()}`);

        // 4. Kalkulasi ATAs (Associated Token Accounts) untuk setiap penerima
        // Akun-akun ini harus dikirim sebagai remainingAccounts agar transfer berhasil
        console.log(`   🔍 Building recipient ATAs...`);
        const remainingAccounts = await Promise.all(
            recipientWallets.map(async (wallet, index) => {
                const ata = await getAssociatedTokenAddress(mintAddress, wallet);
                console.log(`      Recipient ${index + 1}/${recipientWallets.length}: ${wallet.toBase58()}`);
                console.log(`         ATA: ${ata.toBase58()}`);
                return {
                    pubkey: ata,
                    isWritable: true,
                    isSigner: false,
                };
            })
        );

        console.log(`   ✓ Built ${remainingAccounts.length} recipient accounts`);

        // 5. Gunakan MethodsBuilder dengan 5 argumen sesuai IDL
        const instruction = await (program.methods as any)
            .processRefunds(
                cleanEventId,
                [], // finishers: Vec<FinisherData>
                nonFinishers, // non_finishers: Vec<string>
                recipientWallets, // recipient_wallets: Vec<PublicKey>
                amounts  // amounts: Vec<u64>
            )
            .accounts({
                admin: adminWallet,
                event: eventPda,
                vault: new PublicKey(vaultAddress),
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .remainingAccounts(remainingAccounts) // SANGAT PENTING: Mencegah Error 6020
            .instruction();

        console.log(`✅ Instruction built successfully`);
        console.log(`   Size: ${instruction.data.length} bytes`);
        return instruction;
    } catch (error) {
        console.error('❌ Error building processRefunds instruction:', error);
        if (error instanceof Error) {
            console.error(`   Message: ${error.message}`);
            if ('stack' in error) console.error(`   Stack: ${error.stack}`);
        }
        throw error;
    }
}

/**
 * Submit a transaction to Solana
 *
 * @param transaction - Transaction object to submit
 * @param signers - Array of keypairs that must sign
 * @returns Transaction signature (if successful)
 */
export async function submitTransaction(
    transaction: Transaction,
    signers: Keypair[]
): Promise<string> {
    const conn = getConnection();

    try {
        console.log(`📤 Submitting transaction...`);

        // Get latest blockhash
        const { blockhash } = await conn.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = signers[0].publicKey;

        // Sign transaction
        console.log(`   🔐 Signing with ${signers.length} signer(s)...`);
        transaction.sign(...signers);

        // Serialize and validate
        const serialized = transaction.serialize();
        console.log(`   📦 Serialized transaction size: ${serialized.length} bytes`);

        // Submit
        console.log(`   📡 Sending raw transaction to RPC...`);
        const signature = await conn.sendRawTransaction(serialized, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
        });

        console.log(`✅ Transaction submitted: ${signature}`);

        // Wait for confirmation (30 second timeout)
        console.log(`   ⏳ Waiting for confirmation...`);
        const confirmation = await conn.confirmTransaction(signature, 'confirmed');

        if (confirmation.value.err) {
            console.error(`❌ Transaction failed on-chain:`, confirmation.value.err);
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        console.log(`✅ Transaction confirmed!`);
        console.log(`   Slot: ${confirmation.context.slot}`);
        
        // Optional: Fetch transaction for additional details
        try {
            const txInfo = await conn.getTransaction(signature, { commitment: 'confirmed' });
            if (txInfo?.meta?.err) {
                console.error(`❌ Transaction execution error:`, txInfo.meta.err);
                throw new Error(`Transaction execution failed: ${JSON.stringify(txInfo.meta.err)}`);
            }
            if (txInfo?.meta?.computeUnitsConsumed) {
                console.log(`   Compute units: ${txInfo.meta.computeUnitsConsumed}`);
            }
        } catch (fetchErr) {
            // Not critical if we can't fetch details
            console.warn(`   ⚠️  Could not fetch transaction details:`, fetchErr);
        }
        
        return signature;
    } catch (error) {
        console.error(`❌ Failed to submit transaction:`, error);
        if (error instanceof Error) {
            console.error(`   Error message: ${error.message}`);
            console.error(`   Error stack: ${error.stack}`);
        }
        throw error;
    }
}

/**
 * Check connection health (ping RPC)
 */
export async function checkConnection(): Promise<boolean> {
    try {
        const conn = getConnection();
        const version = await conn.getVersion();
        console.log(`✅ Solana RPC healthy: ${version['solana-core']}`);
        return true;
    } catch (error) {
        console.error(`❌ Solana RPC unreachable:`, error);
        return false;
    }
}

// ============================================================================
// Delete Event Instruction Builder
// ============================================================================

/**
 * Build instruction for delete_event
 *
 * This instruction:
 * - Transfers remaining USDC from vault to admin's token account
 * - Closes the vault token account (rent → admin)
 * - Closes the event PDA (rent → admin, via `close = admin`)
 */
export interface DeleteEventParams {
    eventId: string;
    programId: string;
    vaultAddress: string;
    adminWallet: PublicKey;
    adminTokenAccount: PublicKey;
}

export async function buildDeleteEventInstruction(
    params: DeleteEventParams
): Promise<anchor.web3.TransactionInstruction> {
    const { eventId, vaultAddress, adminWallet, programId, adminTokenAccount } = params;

    const cleanEventId = eventId.replace(/-/g, '');

    try {
        console.log(`\n📋 Building deleteEvent instruction...`);
        console.log(`   Event ID: ${cleanEventId}`);
        console.log(`   Admin: ${adminWallet.toBase58()}`);
        console.log(`   Admin Token Account: ${adminTokenAccount.toBase58()}`);

        const provider = new anchor.AnchorProvider(
            getConnection(),
            new anchor.Wallet(getAdminKeypair()),
            { commitment: "confirmed" }
        );

        const program = new Program(
            { ...idl, address: programId } as Idl,
            provider
        );

        const [eventPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("event"), Buffer.from(cleanEventId)],
            program.programId
        );
        console.log(`   Event PDA: ${eventPda.toBase58()}`);

        const instruction = await (program.methods as any)
            .deleteEvent(cleanEventId)
            .accounts({
                admin: adminWallet,
                event: eventPda,
                vault: new PublicKey(vaultAddress),
                adminTokenAccount: adminTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .instruction();

        console.log(`✅ deleteEvent instruction built successfully`);
        console.log(`   Size: ${instruction.data.length} bytes`);
        return instruction;
    } catch (error) {
        console.error('❌ Error building deleteEvent instruction:', error);
        throw error;
    }
}

// ============================================================================
// Debug / Testing
// ============================================================================

/**
 * Log blockchain client status (for debugging)
 */
export function logBlockchainStatus() {
    console.log('\n📊 Blockchain Client Status:');
    console.log(`   RPC URL: ${SOLANA_RPC_URL}`);
    console.log(`   Program ID: ${PROGRAM_ID || '⚠️  Not set'}`);
    console.log(`   Admin Wallet: ${adminKeypair?.publicKey.toBase58() || '⚠️  Not loaded'}`);
    console.log(`   Vault Address: ${VAULT_ADDRESS || '⚠️  Not set'}`);
    console.log('');
}
