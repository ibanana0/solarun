/**
 * Spawn Dummy Users Script
 *
 * Membuat N dummy runner di Supabase + registrasi on-chain untuk hybrid demo.
 * Dummy users memiliki chip UID "dummy-XXX" agar mudah dibedakan dari user asli.
 *
 * CATATAN: Script ini HANYA untuk demo/devnet. Jangan dipakai di mainnet.
 *
 * Run:
 *   npx tsx src/scripts/spawn-dummy-users.ts
 *
 * Lalu masukkan Event ID saat diminta.
 */

import 'dotenv/config';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Program, type Idl } from '@coral-xyz/anchor';
import {
    getAssociatedTokenAddress,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { supabase } from '../lib/supabase';

// @ts-ignore
import idl from '../blockchain/solarun_temp.json' with { type: 'json' };

// ============================================================================
// Config
// ============================================================================

const SOLANA_RPC_URL  = process.env.SOLANA_RPC_URL  || 'https://api.devnet.solana.com';
const PROGRAM_ID      = new PublicKey(process.env.SOLARUN_PROGRAM_ID!);
const SIM_WALLETS_DIR = process.env.SIM_WALLETS_DIR  || './sim-wallets';
const DUMMY_COUNT     = 9; // default, bisa diubah

const DUMMY_NAMES = [
    'Budi Santoso',   'Siti Rahayu',   'Agus Wijaya',
    'Dewi Kusuma',    'Eko Prasetyo',  'Fitriani Putri',
    'Gunawan Hadi',   'Heni Susanti',  'Irwan Fauzi',
    'Joko Susilo',    'Kartini Wulan', 'Luki Pratama',
    'Mega Sari',      'Novi Andriani', 'Oscar Lubis',
];

// ============================================================================
// Helpers
// ============================================================================

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function createRunnerProgram(connection: Connection, keypair: Keypair): Program {
    const wallet   = new anchor.Wallet(keypair);
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    return new Program({ ...idl, address: PROGRAM_ID.toBase58() } as Idl, provider);
}

// ============================================================================
// Main
// ============================================================================

async function spawnDummies(eventId: string) {
    const cleanEventId = eventId.replace(/-/g, '');
    const connection   = new Connection(SOLANA_RPC_URL, 'confirmed');

    console.log('\n════════════════════════════════════════════════════');
    console.log('   SolaRun — Spawn Dummy Runners for Hybrid Demo');
    console.log('════════════════════════════════════════════════════\n');
    console.log(`📌 Event ID    : ${eventId}`);
    console.log(`📌 Dummy Count : ${DUMMY_COUNT}`);
    console.log(`📌 RPC         : ${SOLANA_RPC_URL}\n`);

    // ── 1. Verifikasi event ada di Supabase & on-chain ────────────────────

    const { data: eventDb, error: evErr } = await supabase
        .from('race_events')
        .select('id, name, status, max_participants')
        .eq('id', eventId)
        .single();

    if (evErr || !eventDb) {
        console.error(`❌ Event tidak ditemukan di Supabase: ${evErr?.message}`);
        process.exit(1);
    }
    console.log(`✅ Event ditemukan: "${eventDb.name}" [${eventDb.status}]`);

    // Cek status — hanya boleh pada 'pending' (Initialized on-chain)
    if (!['pending', 'active'].includes(eventDb.status)) {
        console.error(`❌ Event status "${eventDb.status}" tidak mendukung registrasi.`);
        process.exit(1);
    }

    // Ambil fee dari on-chain
    const readProvider = new anchor.AnchorProvider(
        connection,
        new anchor.Wallet(Keypair.generate()),
        { commitment: 'confirmed' }
    );
    const readProgram = new Program({ ...idl, address: PROGRAM_ID.toBase58() } as Idl, readProvider);
    const [eventPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('event'), Buffer.from(cleanEventId)],
        PROGRAM_ID
    );

    let registrationFee = 0;
    try {
        const onChain: any = await readProgram.account.event.fetch(eventPda);
        registrationFee = onChain.registrationFee.toNumber();
        console.log(`✅ Registration fee (on-chain): ${registrationFee} raw USDC\n`);
    } catch (e) {
        console.warn('⚠️  Tidak bisa fetch on-chain event. Melanjutkan dengan fee=0 (DB-only mode).');
    }

    // ── 2. Cek jumlah runner yang sudah ada ───────────────────────────────

    const { count: existingCount } = await supabase
        .from('runners')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId);

    const alreadyRegistered = existingCount ?? 0;
    const maxPax  = eventDb.max_participants ?? 100;
    const canSpawn = Math.min(DUMMY_COUNT, maxPax - alreadyRegistered);

    console.log(`📊 Sudah terdaftar : ${alreadyRegistered} runner`);
    console.log(`📊 Maks peserta    : ${maxPax}`);
    console.log(`📊 Akan di-spawn   : ${canSpawn} dummy runner\n`);

    if (canSpawn <= 0) {
        console.log('⚠️  Event sudah penuh atau DUMMY_COUNT = 0. Tidak ada yang di-spawn.');
        process.exit(0);
    }

    // Pastikan direktori sim-wallets ada
    const walletsDir = path.resolve(SIM_WALLETS_DIR, 'dummies');
    if (!fs.existsSync(walletsDir)) fs.mkdirSync(walletsDir, { recursive: true });

    // PDA yang dipakai bersama
    const [mintPda]      = PublicKey.findProgramAddressSync([Buffer.from('mock_usdc_mint')], PROGRAM_ID);
    const [mintAuthPda]  = PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], PROGRAM_ID);
    const [vaultPda]     = PublicKey.findProgramAddressSync([Buffer.from('vault'), eventPda.toBuffer()], PROGRAM_ID);

    // ── 3. Spawn setiap dummy ─────────────────────────────────────────────

    let successCount = 0;
    let skipCount    = 0;
    let failCount    = 0;

    for (let i = 0; i < canSpawn; i++) {
        const idx     = alreadyRegistered + i + 1;
        const chipUid = `dummy-${idx.toString().padStart(3, '0')}`;
        const name    = DUMMY_NAMES[i % DUMMY_NAMES.length]!;

        console.log(`─────────────────────────────────────────────────────`);
        console.log(`[${i + 1}/${canSpawn}] Spawning "${name}" | chip: ${chipUid}`);

        // Cek duplikat di Supabase
        const { data: existingRunner } = await supabase
            .from('runners')
            .select('id')
            .eq('chip_uid', chipUid)
            .eq('event_id', eventId)
            .maybeSingle();

        if (existingRunner) {
            console.log(`   ⚠️  Sudah ada di Supabase, skip.`);
            skipCount++;
            continue;
        }

        // ── Load / buat keypair dummy ──────────────────────────────────

        const walletPath = path.join(walletsDir, `dummy-runner-${idx}.json`);
        let keypair: Keypair;

        if (fs.existsSync(walletPath)) {
            keypair = Keypair.fromSecretKey(
                Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
            );
            console.log(`   🔑 Wallet lama: ${keypair.publicKey.toBase58()}`);
        } else {
            keypair = Keypair.generate();
            fs.writeFileSync(walletPath, JSON.stringify(Array.from(keypair.secretKey)));
            console.log(`   🆕 Wallet baru: ${keypair.publicKey.toBase58()}`);
        }

        // ── Airdrop SOL jika kurang ────────────────────────────────────

        let sol = await connection.getBalance(keypair.publicKey);
        if (sol < 50_000_000) {
            console.log(`   💧 SOL kurang (${(sol / 1e9).toFixed(4)}), requesting airdrop...`);
            try {
                const sig = await connection.requestAirdrop(keypair.publicKey, 1_000_000_000);
                const lb  = await connection.getLatestBlockhash();
                await connection.confirmTransaction({ blockhash: lb.blockhash, lastValidBlockHeight: lb.lastValidBlockHeight, signature: sig });
                sol = await connection.getBalance(keypair.publicKey);
                console.log(`   ✅ Airdrop OK. SOL: ${(sol / 1e9).toFixed(4)}`);
            } catch (err: any) {
                console.error(`   ❌ Airdrop gagal: ${err.message}. Skip runner ini.`);
                failCount++;
                continue;
            }
            await sleep(1200); // delay antar airdrop
        } else {
            console.log(`   ✅ SOL: ${(sol / 1e9).toFixed(4)}`);
        }

        // ── Mint Mock USDC jika diperlukan ────────────────────────────

        const runnerProgram = createRunnerProgram(connection, keypair);
        const userAta       = await getAssociatedTokenAddress(mintPda, keypair.publicKey);

        if (registrationFee > 0) {
            let usdcBal = 0;
            try {
                const acc = await connection.getTokenAccountBalance(userAta);
                usdcBal   = parseInt(acc.value.amount);
            } catch { /* ATA belum ada */ }

            if (usdcBal < registrationFee) {
                console.log(`   💰 Mint Mock USDC (butuh ${registrationFee}, punya ${usdcBal})...`);
                try {
                    const mintTx = await (runnerProgram.methods as any)
                        .mintMockUsdc(new anchor.BN(registrationFee * 10))
                        .accounts({
                            user: keypair.publicKey,
                            mockUsdcMint: mintPda,
                            mintAuthority: mintAuthPda,
                            userTokenAccount: userAta,
                            systemProgram: SystemProgram.programId,
                            tokenProgram: TOKEN_PROGRAM_ID,
                            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                        })
                        .rpc();
                    console.log(`   ✅ Mint OK. TX: ${mintTx.slice(0, 20)}...`);
                } catch (err: any) {
                    console.error(`   ❌ Mint gagal: ${err.message}`);
                    failCount++;
                    continue;
                }
            } else {
                console.log(`   ✅ Mock USDC: ${usdcBal}`);
            }
        }

        // ── Registrasi on-chain ────────────────────────────────────────

        const [participantPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('participant'), eventPda.toBuffer(), Buffer.from(chipUid)],
            PROGRAM_ID
        );

        let regTx: string | undefined;
        try {
            regTx = await (runnerProgram.methods as any)
                .registerParticipant(
                    cleanEventId,
                    chipUid,
                    keypair.publicKey,
                    name,
                    `dummy_${idx}`
                )
                .accounts({
                    runner: keypair.publicKey,
                    event: eventPda,
                    participant: participantPda,
                    runnerTokenAccount: userAta,
                    vault: vaultPda,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .rpc();
            console.log(`   ✅ On-chain registration OK. TX: ${regTx.slice(0, 20)}...`);
        } catch (err: any) {
            if (err.message?.includes('already in use')) {
                console.log(`   ⚠️  Sudah terdaftar on-chain, lanjut ke Supabase.`);
            } else {
                console.error(`   ❌ On-chain registration gagal: ${err.message}`);
                failCount++;
                continue;
            }
        }

        // ── Insert ke Supabase ─────────────────────────────────────────

        const { error: dbErr } = await supabase.from('runners').insert({
            event_id:       eventId,
            chip_uid:       chipUid,
            wallet_address: keypair.publicKey.toBase58(),
            full_name:      name,
            status:         'registered',
            tx_signature:   regTx ?? null,
        });

        if (dbErr) {
            if (dbErr.code === '23505') {
                console.log(`   ⚠️  Sudah ada di Supabase (duplicate key).`);
                skipCount++;
            } else {
                console.error(`   ❌ Supabase error: ${dbErr.message}`);
                failCount++;
                continue;
            }
        } else {
            console.log(`   ✅ Tersimpan di Supabase.`);
        }

        successCount++;
        await sleep(300); // sedikit delay antar iterasi
    }

    // ── 4. Ringkasan ──────────────────────────────────────────────────────

    console.log('\n════════════════════════════════════════════════════');
    console.log(`✅  Berhasil   : ${successCount}`);
    console.log(`⏭️  Skip       : ${skipCount} (sudah ada)`);
    console.log(`❌  Gagal      : ${failCount}`);
    console.log('════════════════════════════════════════════════════');

    // Tampilkan daftar semua runner setelah spawn
    const { data: allRunners } = await supabase
        .from('runners')
        .select('chip_uid, full_name, status')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

    console.log('\n📋 Daftar Lengkap Runner di Event:');
    console.log('─────────────────────────────────────────────────────');
    allRunners?.forEach((r, idx) => {
        const isReal  = !r.chip_uid.startsWith('dummy-') && !r.chip_uid.startsWith('CHIP_SIM');
        const badge   = isReal ? '🔴 REAL ' : '🤖 DUMMY';
        console.log(`   ${String(idx + 1).padStart(2)}. [${badge}] ${r.chip_uid.padEnd(12)} — ${r.full_name} [${r.status}]`);
    });

    console.log('\n💡 Next: jalankan simulate-dummy-progress.ts untuk simulasi checkpoint.\n');
    process.exit(0);
}

// ── Entry point ───────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Masukkan Event ID: ', (answer) => {
    rl.close();
    const eventId = answer.trim();
    if (!eventId) {
        console.error('❌ Event ID tidak boleh kosong!');
        process.exit(1);
    }
    spawnDummies(eventId).catch(err => {
        console.error('\n❌ Script error:', err.message ?? err);
        process.exit(1);
    });
});
