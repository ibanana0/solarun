import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Program, type Idl } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

import idl from '../blockchain/solarun_temp.json' with { type: "json" };

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.SOLARUN_PROGRAM_ID!);
const SIM_WALLETS_DIR = process.env.SIM_WALLETS_DIR || './sim-wallets';

const RUNNER_NAMES = [
    'Runner 1', 'Runner 2', 'Runner 3', 'Runner 4', 'Runner 5',
    'Runner 6', 'Runner 7', 'Runner 8', 'Runner 9', 'Runner 10'
];

/**
 * Create an AnchorProvider + Program using a specific keypair as the fee payer.
 * This is critical — the provider wallet is used as the transaction fee payer.
 */
function createRunnerProgram(connection: Connection, keypair: Keypair): Program {
    const wallet = new anchor.Wallet(keypair);
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    return new Program({ ...idl, address: PROGRAM_ID.toBase58() } as Idl, provider);
}

async function run(eventId: string) {
    const cleanEventId = eventId.replace(/-/g, '');
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

    console.log(`\n🚀 Starting On-Chain registration for event ${eventId}...`);

    // Use a read-only provider just to fetch the event account
    const readProvider = new anchor.AnchorProvider(connection, new anchor.Wallet(Keypair.generate()), { commitment: 'confirmed' });
    const readProgram = new Program({ ...idl, address: PROGRAM_ID.toBase58() } as Idl, readProvider);

    // Fetch Event data from Blockchain
    const [eventPda] = PublicKey.findProgramAddressSync([Buffer.from("event"), Buffer.from(cleanEventId)], PROGRAM_ID);
    let eventAccount: any;
    try {
        eventAccount = await readProgram.account.event.fetch(eventPda);
    } catch (e) {
        console.error(`❌ Event not found on Blockchain. Make sure Event ID is correct and event is initialized on-chain.`);
        process.exit(1);
    }

    // Check on-chain event status — registration only allowed when Initialized
    const STATUS_MAP: Record<number, string> = { 0: 'Initialized', 1: 'Active', 2: 'Completed', 3: 'Settled' };
    const statusValue = eventAccount.status.initialized ? 0
        : eventAccount.status.active ? 1
        : eventAccount.status.completed ? 2
        : eventAccount.status.settled ? 3
        : -1;
    const statusLabel = STATUS_MAP[statusValue] ?? 'Unknown';

    if (statusValue !== 0) {
        console.error(`\n❌ Event is currently in "${statusLabel}" status on-chain.`);
        console.error(`   Registration is only allowed when the event is in "Initialized" (pending) status.`);
        console.error(`   ℹ️  Please create a NEW event from the Creator Dashboard and use that Event ID.`);
        process.exit(1);
    }
    console.log(`✅ On-Chain Event status: ${statusLabel} (ready for registration)`);

    const feeAmount = eventAccount.registrationFee.toNumber();
    console.log(`✅ Registration Fee: ${feeAmount} Mock USDC (raw)`);

    const simWalletsDir = path.resolve(SIM_WALLETS_DIR);
    if (!fs.existsSync(simWalletsDir)) {
        fs.mkdirSync(simWalletsDir, { recursive: true });
    }
    console.log(`📁 Wallet directory: ${simWalletsDir}`);

    const [mintPda] = PublicKey.findProgramAddressSync([Buffer.from("mock_usdc_mint")], PROGRAM_ID);
    const [mintAuthPda] = PublicKey.findProgramAddressSync([Buffer.from("mint_authority")], PROGRAM_ID);
    const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault"), eventPda.toBuffer()], PROGRAM_ID);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < 10; i++) {
        console.log(`\n===================================================`);
        console.log(`[${i + 1}/10] Registering ${RUNNER_NAMES[i]}...`);
        console.log(`===================================================`);
        const chipUid = `CHIP_SIM_${(i + 1).toString().padStart(2, '0')}`;
        const walletPath = path.join(simWalletsDir, `runner${i + 1}.json`);

        // --- Load or create runner keypair ---
        let runnerKeypair: Keypair;
        if (fs.existsSync(walletPath)) {
            const secretKeyBytes = Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf-8')));
            runnerKeypair = Keypair.fromSecretKey(secretKeyBytes);
            console.log(`🔑 Using existing wallet: ${runnerKeypair.publicKey.toBase58()}`);
        } else {
            runnerKeypair = Keypair.generate();
            fs.writeFileSync(walletPath, JSON.stringify(Array.from(runnerKeypair.secretKey)));
            console.log(`🆕 Created new wallet: ${runnerKeypair.publicKey.toBase58()}`);
        }

        // --- Step 1: Check SOL Balance & Auto Airdrop ---
        let solBalance = await connection.getBalance(runnerKeypair.publicKey);
        if (solBalance < 50_000_000) { // Need at least 0.05 SOL for rent + gas
            console.log(`⚠️  Insufficient SOL (${(solBalance / 1e9).toFixed(4)} SOL). Requesting airdrop of 1 SOL...`);
            try {
                const airdropSig = await connection.requestAirdrop(runnerKeypair.publicKey, 1_000_000_000);
                const latestBlockHash = await connection.getLatestBlockhash();
                await connection.confirmTransaction({
                    blockhash: latestBlockHash.blockhash,
                    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
                    signature: airdropSig,
                });
                solBalance = await connection.getBalance(runnerKeypair.publicKey);
                console.log(`✅ Airdrop successful! Balance: ${(solBalance / 1e9).toFixed(4)} SOL`);
            } catch (airdropErr: any) {
                console.error(`❌ Airdrop failed: ${airdropErr.message}`);
                console.error(`💡 Manually fund: solana airdrop 1 ${runnerKeypair.publicKey.toBase58()} --url devnet`);
                failCount++;
                continue;
            }
            // Small delay to avoid rate limiting between airdrops
            await new Promise(r => setTimeout(r, 1500));
        } else {
            console.log(`✅ SOL balance: ${(solBalance / 1e9).toFixed(4)} SOL`);
        }

        // --- Create a program instance with THIS runner as fee payer ---
        const runnerProgram = createRunnerProgram(connection, runnerKeypair);

        // --- Step 2: Check Mock USDC Balance & Mint if needed ---
        const userAta = await getAssociatedTokenAddress(mintPda, runnerKeypair.publicKey);
        let usdcBalance = 0;
        try {
            const tokenAcc = await connection.getTokenAccountBalance(userAta);
            usdcBalance = parseInt(tokenAcc.value.amount);
        } catch (e) {
            // ATA doesn't exist yet, balance is 0
        }

        if (usdcBalance < feeAmount) {
            console.log(`⚠️  Insufficient Mock USDC (${usdcBalance}). Minting...`);
            try {
                const mintAmount = new anchor.BN(feeAmount * 10); // Mint 10x fee for buffer
                const mintTx = await (runnerProgram.methods as any).mintMockUsdc(mintAmount)
                    .accounts({
                        user: runnerKeypair.publicKey,
                        mockUsdcMint: mintPda,
                        mintAuthority: mintAuthPda,
                        userTokenAccount: userAta,
                        systemProgram: SystemProgram.programId,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    })
                    .rpc();
                console.log(`✅ Minted Mock USDC! TX: ${mintTx}`);
            } catch (mintErr: any) {
                // Try to get detailed logs
                let logs = '';
                try { logs = (await mintErr.getLogs?.()) || ''; } catch {}
                console.error(`❌ Failed to mint Mock USDC: ${mintErr.message}`);
                if (logs) console.error(`   Logs: ${logs}`);
                failCount++;
                continue;
            }
        } else {
            console.log(`✅ Mock USDC balance: ${usdcBalance}`);
        }

        // --- Step 3: Register On-Chain ---
        const [participantPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("participant"), eventPda.toBuffer(), Buffer.from(chipUid)],
            PROGRAM_ID
        );

        let regTx: string | undefined;
        try {
            console.log(`⏳ Submitting on-chain registration...`);
            regTx = await (runnerProgram.methods as any).registerParticipant(
                cleanEventId,
                chipUid,
                runnerKeypair.publicKey,
                RUNNER_NAMES[i],
                `user_${i + 1}`
            ).accounts({
                runner: runnerKeypair.publicKey,
                event: eventPda,
                participant: participantPda,
                runnerTokenAccount: userAta,
                vault: vaultPda,
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();
            console.log(`✅ Registered on-chain! TX: ${regTx}`);
        } catch (regErr: any) {
            if (regErr.message.includes('already in use')) {
                console.log(`⚠️  Already registered on-chain (skipping).`);
            } else {
                let logs = '';
                try { logs = (await regErr.getLogs?.()) || ''; } catch {}
                console.error(`❌ On-chain registration failed: ${regErr.message}`);
                if (logs) console.error(`   Logs: ${logs}`);
                failCount++;
                continue;
            }
        }

        // --- Step 4: Insert into Supabase ---
        const { error } = await supabase.from('runners').insert({
            event_id: eventId,
            chip_uid: chipUid,
            wallet_address: runnerKeypair.publicKey.toBase58(),
            full_name: RUNNER_NAMES[i],
            status: 'registered',
            tx_signature: regTx
        });

        if (error) {
            if (error.code === '23505') {
                console.log(`⚠️  Already exists in Supabase (skipping).`);
            } else {
                console.error(`❌ Supabase insert failed:`, error.message);
            }
        } else {
            console.log(`✅ Saved to Supabase.`);
        }

        successCount++;
    }

    console.log(`\n===================================================`);
    console.log(`🎉 Auto-Register Complete! Success: ${successCount}/10, Failed: ${failCount}/10`);
    console.log(`===================================================`);
    process.exit(0);
}

rl.question('Enter Event ID: ', (answer) => {
    const eventId = answer.trim();
    if (!eventId) {
        console.error('❌ Event ID cannot be empty!');
        process.exit(1);
    }
    run(eventId);
});
