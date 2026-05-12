import "dotenv/config";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program, type Idl } from "@coral-xyz/anchor";
import * as fs from "fs";

import idl from "../blockchain/solarun_temp.json" with { type: "json" };

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(process.env.SOLARUN_PROGRAM_ID!);
const ADMIN_KEYPAIR_PATH = process.env.ADMIN_KEYPAIR_PATH || "./admin-keypair.json";

async function main() {
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");

  // Load admin keypair
  const secretKeyString = fs.readFileSync(ADMIN_KEYPAIR_PATH, "utf8");
  const secretKeyBytes = Uint8Array.from(JSON.parse(secretKeyString));
  const adminKeypair = Keypair.fromSecretKey(secretKeyBytes);

  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const program = new Program(
    { ...idl, address: PROGRAM_ID.toBase58() } as Idl,
    provider,
  );

  const [globalStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    PROGRAM_ID,
  );

  console.log("Initializing Global State...");
  console.log("Global State PDA:", globalStatePda.toBase58());
  console.log("Treasury Address (Admin):", adminKeypair.publicKey.toBase58());

  try {
    const tx = await (program.methods as any)
      .initializeGlobalState(adminKeypair.publicKey, 500) // 5% fee
      .accounts({
        initializer: adminKeypair.publicKey,
        globalState: globalStatePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("✅ Global state initialized! Tx:", tx);
  } catch (err: any) {
    if (err.message && err.message.includes("already in use")) {
      console.log("✅ Global state is already initialized!");
    } else {
      console.error("❌ Failed to initialize global state:", err.message || err);
    }
  }
}

main().catch(console.error);
