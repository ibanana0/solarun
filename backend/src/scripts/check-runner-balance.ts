import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import fs from 'fs';

async function check() {
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Read runner 1 pubkey from sim-wallets
    const keypairPath = '/Users/ibanana/Documents/coding/coding_my/web3/solarun/backend/sim-wallets/runner1.json';
    if (!fs.existsSync(keypairPath)) {
        console.log("No runner1.json found");
        return;
    }
    
    const secretKeyString = fs.readFileSync(keypairPath, 'utf-8');
    const secretKeyArray = Uint8Array.from(JSON.parse(secretKeyString));
    // Since we don't want to import Keypair here (requires anchor/solana web3 import), we'll just extract the public key.
    // The public key is the last 32 bytes of the 64-byte secret key array.
    const publicKeyBytes = secretKeyArray.slice(32, 64);
    const pubkey = new PublicKey(publicKeyBytes);
    
    console.log(`Runner 1 Wallet: ${pubkey.toBase58()}`);
    
    const solBalance = await connection.getBalance(pubkey);
    console.log(`SOL Balance: ${solBalance / 1e9} SOL`);
    
    // Find mock usdc mint
    // The program ID is 9E1BTHP1EP9UQbbXJKZ8Laj7PxXw1vhxJTeFpEEjfYZn
    const programId = new PublicKey('9E1BTHP1EP9UQbbXJKZ8Laj7PxXw1vhxJTeFpEEjfYZn');
    const [mintPda] = PublicKey.findProgramAddressSync([Buffer.from("mock_usdc_mint")], programId);
    
    console.log(`Mock USDC Mint: ${mintPda.toBase58()}`);
    
    const ata = await getAssociatedTokenAddress(mintPda, pubkey);
    try {
        const balance = await connection.getTokenAccountBalance(ata);
        console.log(`Mock USDC Balance: ${balance.value.uiAmount} USDC`);
    } catch (e: any) {
        console.log(`Mock USDC Balance: 0 (Account not found)`);
    }
}

check();
