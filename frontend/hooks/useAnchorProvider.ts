'use client';

import { useWallets } from '@privy-io/react-auth/solana';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { useMemo, useEffect, useState } from 'react';

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

export function useAnchorProvider() {
    const { wallets } = useWallets();
    const solanaWallet = wallets[0];
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
                    const currentWallet = wallets[0];
                    if (!currentWallet) throw new Error("No wallet connected");

                    const chainId = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'; // Devnet CAIP-2
                    
                    console.log("Anchor signTransaction request:", { 
                        type: tx instanceof Transaction ? 'Legacy' : 'Versioned',
                        chainId,
                        wallet: currentWallet.address
                    });
                    
                    const serialized = tx.serialize({ verifySignatures: false });
                    
                    const { signedTransaction } = await currentWallet.signTransaction({ 
                        transaction: serialized,
                        chainId
                    } as any);
                    
                    console.log("Transaction signed successfully by Privy.");
                    
                    // Reconstruct the transaction object to return to Anchor
                    let result: T;
                    if (tx instanceof Transaction) {
                        result = Transaction.from(signedTransaction) as unknown as T;
                        console.log("Signatures in legacy transaction:", (result as any).signatures.length);
                    } else {
                        result = VersionedTransaction.deserialize(signedTransaction) as unknown as T;
                        console.log("Signatures in versioned transaction:", (result as any).signatures.length);
                    }
                    
                    return result;
                },
                signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
                    const currentWallet = wallets[0];
                    if (!currentWallet) throw new Error("No wallet connected");
                    
                    const chainId = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
                    console.log(`Anchor signAllTransactions request for ${txs.length} txs.`);
                    
                    const signedTransactions: T[] = [];
                    
                    // Privy's signTransaction usually handles one at a time in some versions, 
                    // but ConnectedSolanaWallet might have signAllTransactions.
                    // Let's check if it exists, otherwise loop.
                    if ((currentWallet as any).signAllTransactions) {
                        const results = await (currentWallet as any).signAllTransactions(txs.map(tx => ({
                            transaction: tx.serialize({ verifySignatures: false }),
                            chainId
                        })));
                        
                        return results.map((res: any, i: number) => {
                            const data = res.signedTransaction;
                            return (txs[i] instanceof Transaction)
                                ? Transaction.from(data) as unknown as T
                                : VersionedTransaction.deserialize(data) as unknown as T;
                        });
                    } else {
                        // Fallback: sign one by one
                        for (const tx of txs) {
                            const { signedTransaction } = await currentWallet.signTransaction({
                                transaction: tx.serialize({ verifySignatures: false }),
                                chainId
                            } as any);
                            
                            signedTransactions.push(
                                (tx instanceof Transaction)
                                    ? Transaction.from(signedTransaction) as unknown as T
                                    : VersionedTransaction.deserialize(signedTransaction) as unknown as T
                            );
                        }
                        return signedTransactions;
                    }
                },
            };
            setAnchorWallet(wallet as any);
        };

        setupWallet();
    }, [solanaWallet]);

    const provider = useMemo(() => {
        if (!anchorWallet) return null;

        const connection = new Connection(RPC_URL, 'confirmed');
        return new AnchorProvider(connection, anchorWallet, {
            commitment: 'confirmed',
        });
    }, [anchorWallet]);

    return provider;
}
