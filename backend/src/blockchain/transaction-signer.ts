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

import "dotenv/config";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as anchor from "@coral-xyz/anchor";
import { Program, type Idl } from "@coral-xyz/anchor";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";

import idl from "./solarun_temp.json" with { type: "json" };

// ============================================================================
// Configuration
// ============================================================================

const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
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
    connection = new Connection(SOLANA_RPC_URL, "confirmed");
    console.log(`✅ Solana RPC connected: ${SOLANA_RPC_URL}`);

    // Load admin keypair from file
    if (!ADMIN_KEYPAIR_PATH) {
      throw new Error("ADMIN_KEYPAIR_PATH not set in .env");
    }

    const keypairPath = path.resolve(ADMIN_KEYPAIR_PATH);
    if (!fs.existsSync(keypairPath)) {
      throw new Error(`Admin keypair file not found: ${keypairPath}`);
    }

    const keypairData = fs.readFileSync(keypairPath, "utf-8");
    const keypairArray = JSON.parse(keypairData);
    adminKeypair = Keypair.fromSecretKey(new Uint8Array(keypairArray));

    console.log(`✅ Admin keypair loaded`);
    console.log(`   Public key: ${adminKeypair.publicKey.toBase58()}`);

    // Validate configuration
    if (!PROGRAM_ID) {
      throw new Error("SOLARUN_PROGRAM_ID not set in .env");
    }

    console.log(`✅ Program ID: ${PROGRAM_ID}`);
  } catch (error) {
    console.error("❌ Failed to initialize blockchain client:", error);
    throw error;
  }
}

/**
 * Get the Solana connection (lazy initialize if needed)
 */
export function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(SOLANA_RPC_URL, "confirmed");
  }
  return connection;
}

/**
 * Get the admin keypair
 */
export function getAdminKeypair(): Keypair {
  if (!adminKeypair) {
    throw new Error(
      "Admin keypair not initialized. Call initBlockchainClient() first.",
    );
  }
  return adminKeypair;
}

/**
 * Fetch Event account data from on-chain
 */
export async function getEventAccount(eventId: string): Promise<any> {
  const cleanEventId = eventId.replace(/-/g, "");
  const programId = process.env.SOLARUN_PROGRAM_ID;

  if (!programId) throw new Error("SOLARUN_PROGRAM_ID not set");

  const provider = new anchor.AnchorProvider(
    getConnection(),
    new anchor.Wallet(getAdminKeypair()),
    { commitment: "confirmed" },
  );

  const program = new Program({ ...idl, address: programId } as Idl, provider);

  const [eventPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(cleanEventId)],
    program.programId,
  );

  return await program.account.event.fetch(eventPda);
}

/**
 * Fetch the actual SPL token balance of the event vault from on-chain.
 *
 * This is the source of truth for how much USDC is available to distribute
 * in process_refunds(). It reflects the real balance AFTER the protocol fee
 * has been deducted by complete_race(), unlike event.totalDeposits which is
 * never decremented.
 *
 * @param eventId  - Raw event UUID (with or without dashes)
 * @param vaultAddress - On-chain vault token account address (base58 string)
 * @returns BN representing the raw token amount (6 decimals for Mock USDC)
 */
export async function getVaultBalance(
  eventId: string,
  vaultAddress: string,
): Promise<anchor.BN> {
  if (!vaultAddress)
    throw new Error("vaultAddress is required to fetch vault balance");
  const conn = getConnection();
  try {
    const balance = await conn.getTokenAccountBalance(
      new PublicKey(vaultAddress),
    );
    return new anchor.BN(balance.value.amount);
  } catch (err) {
    console.error(
      `❌ Failed to fetch vault balance for event ${eventId}:`,
      err,
    );
    throw err;
  }
}

// ============================================================================
// Transaction Builders
// ============================================================================

/**
 * Build instructions for process_refunds
 *
 * This instruction:
 * - Distributes prizes to top 4 finishers
 * - Distributes refunds to non-finishers
 * - Marks event as settled (if isFinalBatch is true)
 */
export interface ProcessRefundsParams {
  eventId: string;
  programId: string;
  vaultAddress: string;
  adminWallet: PublicKey;
  recipientWallets: PublicKey[];
  amounts: anchor.BN[];
  nonFinishers: string[];
  isFinalBatch: boolean;
  mint?: PublicKey; // Optional: will derive default if not provided
}

export async function buildProcessRefundsInstructions(
  params: ProcessRefundsParams,
): Promise<anchor.web3.TransactionInstruction[]> {
  const {
    eventId,
    vaultAddress,
    adminWallet,
    programId,
    recipientWallets,
    amounts,
    nonFinishers,
    isFinalBatch,
    mint,
  } = params;

  // 1. Pembersihan UUID (Remove dashes)
  const cleanEventId = eventId.replace(/-/g, "");

  try {
    console.log(`\n📋 Building processRefunds instructions...`);
    console.log(`   Event ID: ${cleanEventId}`);
    console.log(`   Program ID: ${programId}`);
    console.log(`   Vault: ${vaultAddress}`);
    console.log(`   Admin: ${adminWallet.toBase58()}`);
    console.log(`   Final Batch: ${isFinalBatch}`);

    const provider = new anchor.AnchorProvider(
      getConnection(),
      new anchor.Wallet(getAdminKeypair()),
      { commitment: "confirmed" },
    );

    const program = new Program(
      { ...idl, address: programId } as Idl,
      provider,
    );

    // 2. Derivasi Event PDA menggunakan cleanEventId
    const [eventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(cleanEventId)],
      program.programId,
    );
    console.log(`   Event PDA: ${eventPda.toBase58()}`);

    // 3. Tentukan Mint Address (Gunakan yang dioper atau derive default mock_usdc_mint)
    let mintAddress: PublicKey;
    if (mint) {
      mintAddress = mint;
    } else {
      const [mintPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("mock_usdc_mint")],
        program.programId,
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
        console.log(
          `      Recipient ${index + 1}/${recipientWallets.length}: ${wallet.toBase58()}`,
        );
        console.log(`         ATA: ${ata.toBase58()}`);
        return {
          pubkey: ata,
          isWritable: true,
          isSigner: false,
        };
      }),
    );

    console.log(`   ✓ Built ${remainingAccounts.length} recipient accounts`);

    // 5. Add Compute Budget Instruction to handle large batches
    const computeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_400_000,
    });

    // 6. Gunakan MethodsBuilder dengan 6 argumen sesuai IDL yang sudah diupdate
    const mainInstruction = await (program.methods as any)
      .processRefunds(
        cleanEventId,
        [], // finishers: Vec<FinisherData>
        nonFinishers, // non_finishers: Vec<string>
        recipientWallets, // recipient_wallets: Vec<PublicKey>
        amounts, // amounts: Vec<u64>
        isFinalBatch, // Sesuai update di SC
      )
      .accounts({
        admin: adminWallet,
        event: eventPda,
        vault: new PublicKey(vaultAddress),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(remainingAccounts) // SANGAT PENTING: Mencegah Error 6020
      .instruction();

    console.log(`✅ Instructions built successfully`);
    return [computeBudgetInstruction, mainInstruction];
  } catch (error) {
    console.error("❌ Error building processRefunds instructions:", error);
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`);
      if ("stack" in error) console.error(`   Stack: ${error.stack}`);
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
  signers: Keypair[],
): Promise<string> {
  const conn = getConnection();

  try {
    console.log(`📤 Submitting transaction...`);

    // Get latest blockhash
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signers[0].publicKey;

    // Sign transaction
    console.log(`   🔐 Signing with ${signers.length} signer(s)...`);
    transaction.sign(...signers);

    // Serialize and validate
    const serialized = transaction.serialize();
    console.log(
      `   📦 Serialized transaction size: ${serialized.length} bytes`,
    );

    // Submit
    console.log(`   📡 Sending raw transaction to RPC...`);
    const signature = await conn.sendRawTransaction(serialized, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Transaction submitted: ${signature}`);

    // Wait for confirmation (30 second timeout)
    console.log(`   ⏳ Waiting for confirmation...`);
    const confirmation = await conn.confirmTransaction(signature, "confirmed");

    if (confirmation.value.err) {
      console.error(`❌ Transaction failed on-chain:`, confirmation.value.err);
      throw new Error(
        `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
      );
    }

    console.log(`✅ Transaction confirmed!`);
    console.log(`   Slot: ${confirmation.context.slot}`);

    // Optional: Fetch transaction for additional details
    try {
      const txInfo = await conn.getTransaction(signature, {
        commitment: "confirmed",
      });
      if (txInfo?.meta?.err) {
        console.error(`❌ Transaction execution error:`, txInfo.meta.err);
        throw new Error(
          `Transaction execution failed: ${JSON.stringify(txInfo.meta.err)}`,
        );
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
    console.log(`✅ Solana RPC healthy: ${version["solana-core"]}`);
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
  params: DeleteEventParams,
): Promise<anchor.web3.TransactionInstruction> {
  const { eventId, vaultAddress, adminWallet, programId, adminTokenAccount } =
    params;

  const cleanEventId = eventId.replace(/-/g, "");

  try {
    console.log(`\n📋 Building deleteEvent instruction...`);
    console.log(`   Event ID: ${cleanEventId}`);
    console.log(`   Admin: ${adminWallet.toBase58()}`);
    console.log(`   Admin Token Account: ${adminTokenAccount.toBase58()}`);

    const provider = new anchor.AnchorProvider(
      getConnection(),
      new anchor.Wallet(getAdminKeypair()),
      { commitment: "confirmed" },
    );

    const program = new Program(
      { ...idl, address: programId } as Idl,
      provider,
    );

    const [eventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(cleanEventId)],
      program.programId,
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
    console.error("❌ Error building deleteEvent instruction:", error);
    throw error;
  }
}

// ============================================================================
// Close Participant Instruction Builder
// ============================================================================

export interface CloseParticipantParams {
  eventId: string;
  programId: string;
  adminWallet: PublicKey;
  chipUid: string;
}

export async function buildCloseParticipantInstruction(
  params: CloseParticipantParams,
): Promise<anchor.web3.TransactionInstruction> {
  const { eventId, adminWallet, programId, chipUid } = params;

  const cleanEventId = eventId.replace(/-/g, "");

  try {
    const provider = new anchor.AnchorProvider(
      getConnection(),
      new anchor.Wallet(getAdminKeypair()),
      { commitment: "confirmed" },
    );

    const program = new Program(
      { ...idl, address: programId } as Idl,
      provider,
    );

    const [eventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(cleanEventId)],
      program.programId,
    );

    const [participantPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("participant"), eventPda.toBuffer(), Buffer.from(chipUid)],
      program.programId,
    );

    const instruction = await (program.methods as any)
      .closeParticipant(cleanEventId, chipUid)
      .accounts({
        admin: adminWallet,
        event: eventPda,
        participant: participantPda,
      })
      .instruction();

    return instruction;
  } catch (error) {
    console.error(
      `❌ Error building closeParticipant instruction for chip ${chipUid}:`,
      error,
    );
    throw error;
  }
}

// ============================================================================
// Record Finish (Checkpoint) On-Chain
// ============================================================================

const TX_CONFIRM_TIMEOUT_MS = 60_000; // 60s instead of default 30s
const TX_MAX_RETRIES = 3;

/**
 * Small delay utility for sequential processing.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call the smart contract's record_finish instruction.
 * This records checkpoint progress (start/mid/finish) on-chain.
 *
 * Uses skipPreflight + manual confirmation polling to survive Devnet
 * congestion and avoid the default 30-second timeout.
 *
 * The backend (admin) is the signer — the smart contract verifies
 * that backend.key() == event.admin.
 */
export async function recordFinishOnChain(
  eventId: string,
  chipUid: string,
  checkpointId: number,
  finishPosition: number,
  timestamp: number,
): Promise<string> {
  const cleanEventId = eventId.replace(/-/g, "");
  const programId = process.env.SOLARUN_PROGRAM_ID;
  if (!programId) throw new Error("SOLARUN_PROGRAM_ID not set");

  const admin = getAdminKeypair();
  const connection = getConnection();
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed", skipPreflight: true },
  );

  const program = new Program({ ...idl, address: programId } as Idl, provider);

  const [eventPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(cleanEventId)],
    program.programId,
  );

  const [participantPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("participant"), eventPda.toBuffer(), Buffer.from(chipUid)],
    program.programId,
  );

  console.log(`[Blockchain] 📡 Calling record_finish on-chain...`);
  console.log(
    `   Event: ${cleanEventId}, Chip: ${chipUid}, CP: ${checkpointId}, Pos: ${finishPosition}`,
  );

  // Build the transaction instruction manually for retry control
  const instruction = await (program.methods as any)
    .recordFinish(
      cleanEventId,
      chipUid,
      checkpointId,
      finishPosition,
      new anchor.BN(timestamp),
    )
    .accounts({
      backend: admin.publicKey,
      event: eventPda,
      participant: participantPda,
    })
    .instruction();

  // Retry loop
  for (let attempt = 1; attempt <= TX_MAX_RETRIES; attempt++) {
    try {
      // Get a fresh blockhash for each attempt
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");

      const tx = new Transaction();
      tx.add(instruction);
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = admin.publicKey;
      tx.sign(admin);

      // Send with skipPreflight to avoid simulation timeout
      const rawTx = tx.serialize();
      const txSig = await connection.sendRawTransaction(rawTx, {
        skipPreflight: true,
        maxRetries: 2,
      });

      console.log(
        `[Blockchain]    Attempt ${attempt}/${TX_MAX_RETRIES} — TX sent: ${txSig.slice(0, 20)}...`,
      );

      // Wait for confirmation with extended timeout
      const confirmation = await connection.confirmTransaction(
        {
          signature: txSig,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed",
      );

      if (confirmation.value.err) {
        console.error(
          `[Blockchain] ❌ TX confirmed but failed on-chain:`,
          confirmation.value.err,
        );
        throw new Error(
          `Transaction confirmed with error: ${JSON.stringify(confirmation.value.err)}`,
        );
      }

      console.log(`[Blockchain] ✅ record_finish confirmed! TX: ${txSig}`);
      return txSig;
    } catch (err: any) {
      const isTimeout =
        err.message?.includes("was not confirmed") ||
        err.message?.includes("block height exceeded");

      if (isTimeout && attempt < TX_MAX_RETRIES) {
        console.warn(
          `[Blockchain] ⏳ Attempt ${attempt} timed out. Retrying in 2s...`,
        );
        await delay(2000);
        continue;
      }

      // Final attempt failed or non-timeout error
      throw err;
    }
  }

  throw new Error("record_finish: All retry attempts exhausted");
}

/**
 * Fetch a single participant's on-chain data by event ID and chip UID.
 */
export async function getParticipantOnChain(
  eventId: string,
  chipUid: string,
): Promise<any | null> {
  const cleanEventId = eventId.replace(/-/g, "");
  const programId = process.env.SOLARUN_PROGRAM_ID;
  if (!programId) throw new Error("SOLARUN_PROGRAM_ID not set");

  const provider = new anchor.AnchorProvider(
    getConnection(),
    new anchor.Wallet(getAdminKeypair()),
    { commitment: "confirmed" },
  );

  const program = new Program({ ...idl, address: programId } as Idl, provider);

  const [eventPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(cleanEventId)],
    program.programId,
  );

  const [participantPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("participant"), eventPda.toBuffer(), Buffer.from(chipUid)],
    program.programId,
  );

  try {
    return await program.account.participant.fetch(participantPda);
  } catch {
    return null;
  }
}

// ============================================================================
// Debug / Testing
// ============================================================================

export async function completeRaceOnChain(
  eventId: string,
  treasuryAta: PublicKey,
): Promise<string> {
  const cleanEventId = eventId.replace(/-/g, "");
  const programId = process.env.SOLARUN_PROGRAM_ID;
  if (!programId) throw new Error("SOLARUN_PROGRAM_ID not set");

  const provider = new anchor.AnchorProvider(
    getConnection(),
    new anchor.Wallet(getAdminKeypair()),
    { commitment: "confirmed" },
  );

  const program = new Program({ ...idl, address: programId } as Idl, provider);

  const [eventPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(cleanEventId)],
    program.programId,
  );

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), eventPda.toBuffer()],
    program.programId,
  );

  const [globalStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId,
  );

  const tx = await (program.methods as any)
    .completeRace(cleanEventId)
    .accounts({
      admin: getAdminKeypair().publicKey,
      event: eventPda,
      globalState: globalStatePda,
      vault: vaultPda,
      treasuryAccount: treasuryAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  return tx;
}

export async function startRaceOnChain(eventId: string): Promise<string> {
  const cleanEventId = eventId.replace(/-/g, "");
  const programId = process.env.SOLARUN_PROGRAM_ID;
  if (!programId) throw new Error("SOLARUN_PROGRAM_ID not set");

  const provider = new anchor.AnchorProvider(
    getConnection(),
    new anchor.Wallet(getAdminKeypair()),
    { commitment: "confirmed" },
  );

  const program = new Program({ ...idl, address: programId } as Idl, provider);

  const [eventPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(cleanEventId)],
    program.programId,
  );

  const tx = await (program.methods as any)
    .startRace(cleanEventId)
    .accounts({
      admin: getAdminKeypair().publicKey,
      event: eventPda,
    })
    .rpc();

  return tx;
}

export async function initializeEventOnChain(
  eventId: string,
  maxParticipants: number,
  registrationFee: anchor.BN,
  startTime: anchor.BN,
  endTime: anchor.BN,
  disputeLockSeconds: anchor.BN = new anchor.BN(86400),
): Promise<{ signature: string; vaultAddress: string }> {
  const cleanEventId = eventId.replace(/-/g, "");
  const programId = process.env.SOLARUN_PROGRAM_ID;
  if (!programId) throw new Error("SOLARUN_PROGRAM_ID not set");

  const provider = new anchor.AnchorProvider(
    getConnection(),
    new anchor.Wallet(getAdminKeypair()),
    { commitment: "confirmed" },
  );

  const program = new Program({ ...idl, address: programId } as Idl, provider);

  const [eventPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(cleanEventId)],
    program.programId,
  );

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), eventPda.toBuffer()],
    program.programId,
  );

  const [mintPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mock_usdc_mint")],
    program.programId,
  );

  console.log(`   Initializing on-chain for Event ID (clean): ${cleanEventId}`);
  console.log(`   Event PDA: ${eventPda.toBase58()}`);
  console.log(`   Vault PDA: ${vaultPda.toBase58()}`);

  const tx = await (program.methods as any)
    .initializeEvent(
      cleanEventId,
      new anchor.BN(maxParticipants),
      registrationFee,
      startTime,
      endTime,
      disputeLockSeconds,
    )
    .accounts({
      admin: getAdminKeypair().publicKey,
      event: eventPda,
      mockUsdcMint: mintPda,
      vault: vaultPda,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  return { signature: tx, vaultAddress: vaultPda.toBase58() };
}

/**
 * Log blockchain client status (for debugging)
 */
export function logBlockchainStatus() {
  console.log("\n📊 Blockchain Client Status:");
  console.log(`   RPC URL: ${SOLANA_RPC_URL}`);
  console.log(`   Program ID: ${PROGRAM_ID || "⚠️  Not set"}`);
  console.log(
    `   Admin Wallet: ${adminKeypair?.publicKey.toBase58() || "⚠️  Not loaded"}`,
  );
  console.log(`   Vault Address: ${VAULT_ADDRESS || "⚠️  Not set"}`);
  console.log("");
}
