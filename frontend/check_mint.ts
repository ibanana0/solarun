import { PublicKey, Connection } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('9E1BTHP1EP9UQbbXJKZ8Laj7PxXw1vhxJTeFpEEjfYZn');

const [mockUsdcMint] = PublicKey.findProgramAddressSync(
    [Buffer.from('mock_usdc_mint')],
    PROGRAM_ID
);

console.log('Mock USDC Mint:', mockUsdcMint.toBase58());

async function check() {
    const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
    const acc = await conn.getAccountInfo(mockUsdcMint);
    console.log('Account exists:', !!acc);
}

check();
