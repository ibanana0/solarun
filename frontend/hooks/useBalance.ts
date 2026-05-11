'use client';

import { useEffect, useState, useCallback } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { useAuth } from './useAuth';

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('E8KF9A7PiYbi3UmZTDy4RFnJYsvjmo3oQ7NwTuGzR2C8');

export function useBalance() {
    const { walletAddress, authenticated } = useAuth();
    const [solBalance, setSolBalance] = useState<number>(0);
    const [usdcBalance, setUsdcBalance] = useState<number>(0);
    const [loading, setLoading] = useState(false);

    const fetchBalances = useCallback(async () => {
        if (!walletAddress) return;

        setLoading(true);
        try {
            const connection = new Connection(RPC_URL, 'confirmed');
            const owner = new PublicKey(walletAddress);

            // 1. Fetch SOL Balance
            const sol = await connection.getBalance(owner);
            setSolBalance(sol / LAMPORTS_PER_SOL);

            // 2. Fetch Mock USDC Balance
            // Derive Mint Address
            const [mockUsdcMint] = PublicKey.findProgramAddressSync(
                [Buffer.from('mock_usdc_mint')],
                PROGRAM_ID
            );

            // Derive ATA
            const ata = await getAssociatedTokenAddress(mockUsdcMint, owner);

            try {
                const account = await getAccount(connection, ata);
                setUsdcBalance(Number(account.amount) / 1_000_000); // 6 decimals
            } catch (err) {
                // ATA might not exist yet
                setUsdcBalance(0);
            }
        } catch (err) {
            console.error('Failed to fetch balances:', err);
        } finally {
            setLoading(false);
        }
    }, [walletAddress]);

    useEffect(() => {
        if (authenticated && walletAddress) {
            fetchBalances();
            
            // Setup polling every 30 seconds
            const interval = setInterval(fetchBalances, 30000);
            return () => clearInterval(interval);
        } else {
            setSolBalance(0);
            setUsdcBalance(0);
        }
    }, [authenticated, walletAddress, fetchBalances]);

    return {
        solBalance,
        usdcBalance,
        loading,
        refresh: fetchBalances,
    };
}
