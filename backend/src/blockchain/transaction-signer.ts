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
    sendAndConfirmTransaction,
    SystemProgram,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

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
function getAdminKeypair(): Keypair {
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
 *
 * @param eventId - UUID of the event to process refunds for
 * @returns Instruction object (for now, placeholder)
 *
 * NOTE: Full implementation requires:
 * - IDL (Interface Definition Language) from smart contract
 * - Proper account setup (vault, event PDA, token accounts, etc.)
 * - This is a V1 skeleton; will be expanded when SC is ready
 */
export interface ProcessRefundsParams {
    eventId: string;
    programId: string;
    vaultAddress: string;
    adminWallet: PublicKey;
}

export async function buildProcessRefundsInstruction(
    params: ProcessRefundsParams
): Promise<any> {
    const { eventId, vaultAddress, adminWallet } = params;

    console.log(`📋 Building process_refunds instruction:`);
    console.log(`   Event ID: ${eventId}`);
    console.log(`   Vault: ${vaultAddress}`);
    console.log(`   Admin: ${adminWallet.toBase58()}`);

    // TODO: Replace with actual instruction builder when IDL is available
    // For now, this is a placeholder that logs the parameters
    // The actual implementation will:
    // 1. Parse event_id as UUID and derive event PDA
    // 2. Get vault account (check balance, authority, etc.)
    // 3. Build instruction data (instruction discriminator + event_id)
    // 4. Return Instruction with proper accounts & signers

    return {
        eventId,
        vaultAddress,
        adminWallet: adminWallet.toBase58(),
        // actual instruction details will be added here
    };
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

        // Sign transaction
        transaction.sign(...signers);

        // Submit
        const signature = await conn.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
        });

        console.log(`✅ Transaction submitted: ${signature}`);

        // Wait for confirmation (30 second timeout)
        const confirmation = await conn.confirmTransaction(signature, 'confirmed');

        if (confirmation.value.err) {
            console.error(`❌ Transaction failed:`, confirmation.value.err);
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        console.log(`✅ Transaction confirmed!`);
        return signature;
    } catch (error) {
        console.error(`❌ Failed to submit transaction:`, error);
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
