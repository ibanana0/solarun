'use client';

import { useWallets } from '@privy-io/react-auth/solana';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { useMemo, useEffect, useState } from 'react';
import { useAuth } from './useAuth';

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

export function useAnchorProvider() {
    const { wallets } = useWallets();
    const { walletAddress } = useAuth();
    
    // Find the wallet that matches the active wallet address from useAuth, 
    // or fallback to the first available wallet
    const solanaWallet = useMemo(() => {
        if (!wallets.length) return null;
        if (walletAddress) {
            const matched = wallets.find(w => w.address === walletAddress);
            if (matched) return matched;
        }
        return wallets[0];
    }, [wallets, walletAddress]);

    const [anchorWallet, setAnchorWallet] = useState<Wallet | null>(null);

    useEffect(() => {
        if (!solanaWallet) {
            setAnchorWallet(null);
            return;
        }

        const setupWallet = async () => {
            const wallet = {
                publicKey: new PublicKey(solanaWallet.address),
                signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
                    // Find the wallet that matches the anchor identity
                    const currentWallet = wallets.find(w => w.address === solanaWallet.address) || solanaWallet;
                    if (!currentWallet) throw new Error("No wallet connected");

                    const chainId = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
                    
                    console.log("Anchor signTransaction request:", { 
                        type: tx instanceof Transaction ? 'Legacy' : 'Versioned',
                        wallet: currentWallet.address
                    });
                    
                    const serialized = tx.serialize({ verifySignatures: false });
                    
                    const result = await currentWallet.signTransaction({ 
                        transaction: serialized,
                        chainId
                    } as any);

                    const signedData = (result as any).signedTransaction || result;
                    const signedBytes = typeof signedData === 'string' 
                        ? Buffer.from(signedData, 'base64') 
                        : signedData;
                    
                    if (tx instanceof Transaction) {
                        const newTx = Transaction.from(signedBytes);
                        
                        // Copy metadata to ensure Anchor's confirmation logic works
                        if (!newTx.feePayer && tx.feePayer) newTx.feePayer = tx.feePayer;
                        if (!newTx.recentBlockhash && tx.recentBlockhash) newTx.recentBlockhash = tx.recentBlockhash;

                        return newTx as unknown as T;
                    } else {
                        return VersionedTransaction.deserialize(signedBytes) as unknown as T;
                    }
                },
                signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
                    const currentWallet = wallets.find(w => w.address === solanaWallet.address) || solanaWallet;
                    if (!currentWallet) throw new Error("No wallet connected");
                    
                    const chainId = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
                    const signedTransactions: T[] = [];
                    
                    for (const tx of txs) {
                        const { signedTransaction } = await currentWallet.signTransaction({
                            transaction: tx.serialize({ verifySignatures: false }),
                            chainId
                        } as any);
                        
                        const signedBytes = typeof signedTransaction === 'string' 
                            ? Buffer.from(signedTransaction, 'base64') 
                            : signedTransaction;

                        if (tx instanceof Transaction) {
                            const newTx = Transaction.from(signedBytes);
                            if (!newTx.feePayer && tx.feePayer) newTx.feePayer = tx.feePayer;
                            if (!newTx.recentBlockhash && tx.recentBlockhash) newTx.recentBlockhash = tx.recentBlockhash;
                            signedTransactions.push(newTx as unknown as T);
                        } else {
                            signedTransactions.push(VersionedTransaction.deserialize(signedBytes) as unknown as T);
                        }
                    }
                    return signedTransactions;
                },
            };
            setAnchorWallet(wallet as any);
        };

        setupWallet();
    }, [solanaWallet, wallets]);

    const provider = useMemo(() => {
        if (!anchorWallet) return null;

        const connection = new Connection(RPC_URL, 'confirmed');
        return new AnchorProvider(connection, anchorWallet, {
            commitment: 'confirmed',
        });
    }, [anchorWallet]);

    return provider;
}
