'use client';

import Link from 'next/link';
import { Zap, LogIn, LogOut, User, Shield, Copy, Check, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useBalance } from '@/hooks/useBalance';
import { useProgram } from '@/hooks/useProgram';
import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useState, useEffect } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function Navbar() {
    const ADMIN_WALLET = 'A7PqEe2t83XkEmVT3ToaTr5pubUAKwMGyAZdg69gUsyv';
    const { ready, authenticated, solaRunUser, walletAddress, login, logout, isCreator: authIsCreator } = useAuth();
    const { solBalance, usdcBalance, refresh: refreshBalance, loading: balanceLoading } = useBalance();
    
    // Fallback creator check if Supabase sync is delayed
    const isCreator = authIsCreator || (walletAddress === ADMIN_WALLET);
    
    const program = useProgram();
    const [faucetLoading, setFaucetLoading] = useState(false);
    const [mintExists, setMintExists] = useState<boolean | null>(null);
    const [copied, setCopied] = useState(false);

    // Dialog state
    const [dialog, setDialog] = useState<{
        open: boolean;
        title: string;
        description: string;
        type: 'success' | 'error' | 'info' | 'warning';
        onConfirm?: () => void;
        cancelText?: string;
        actionText?: string;
    }>({
        open: false,
        title: '',
        description: '',
        type: 'info'
    });

    const showDialog = (title: string, description: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', onConfirm?: () => void, actionText = 'OK', cancelText?: string) => {
        setDialog({ open: true, title, description, type, onConfirm, actionText, cancelText });
    };

    const handleCopyAddress = () => {
        if (walletAddress) {
            navigator.clipboard.writeText(walletAddress);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const checkMint = async () => {
        if (!program) return;
        try {
            const [mockUsdcMint] = PublicKey.findProgramAddressSync(
                [Buffer.from('mock_usdc_mint')],
                program.programId
            );
            const account = await program.provider.connection.getAccountInfo(mockUsdcMint);
            const exists = !!account;
            setMintExists(exists);
            return exists;
        } catch (err) {
            console.error("Error checking mint:", err);
            setMintExists(false);
            return false;
        }
    };

    const handleInitializeMint = async () => {
        if (!program || !walletAddress) return;
        
        const exists = await checkMint();
        if (exists) {
            showDialog("MINT_EXISTS", "Mock USDC Mint already exists on-chain.", "info");
            return;
        }

        setFaucetLoading(true);
        try {
            const admin = new PublicKey(walletAddress);
            const [mockUsdcMint] = PublicKey.findProgramAddressSync([Buffer.from('mock_usdc_mint')], program.programId);
            const [mintAuthority] = PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], program.programId);

            const txSignature = await program.methods
                .createMockMint()
                .accounts({
                    admin,
                    mockUsdcMint,
                    mintAuthority,
                    systemProgram: anchor.web3.SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                } as any)
                .rpc();

            showDialog("SUCCESS", "Mock USDC Mint initialized successfully.", "success");
            await checkMint();
            refreshBalance();
        } catch (err: any) {
            console.error("Failed to initialize mint:", err);
            const errorMsg = err.message || "";
            if (errorMsg.includes("already been processed") || errorMsg.includes("already processed")) {
                const nowExists = await checkMint();
                if (nowExists) {
                    showDialog("MINT_ACTIVE", "Mock USDC Mint is now active.", "success");
                    refreshBalance();
                } else {
                    showDialog("ERROR", "Transaction processed but mint not found. Refresh requested.", "error");
                }
            } else {
                showDialog("FAILED", `Initialization failed: ${err.message}`, "error");
            }
        } finally {
            setFaucetLoading(false);
        }
    };

    const handleFaucet = async () => {
        if (!program || !walletAddress) return;

        if (mintExists === false) {
            if (isCreator) {
                showDialog(
                    "MINT_NOT_READY", 
                    "Mock USDC Mint not initialized. Initialize now?", 
                    "warning", 
                    () => handleInitializeMint(),
                    "INITIALIZE",
                    "CANCEL"
                );
                return;
            } else {
                showDialog("INFO", "Mock USDC Mint not initialized by admin. Please contact support.", "info");
                return;
            }
        }

        setFaucetLoading(true);
        try {
            const owner = new PublicKey(walletAddress);
            const programId = program.programId;

            const [mockUsdcMint] = PublicKey.findProgramAddressSync([Buffer.from('mock_usdc_mint')], programId);
            const [mintAuthority] = PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], programId);
            const userAta = await getAssociatedTokenAddress(mockUsdcMint, owner);
            const amount = new anchor.BN(100 * 1_000_000); // 100 USDC
            
            await program.methods
                .mintMockUsdc(amount)
                .accounts({
                    user: owner,
                    mockUsdcMint,
                    mintAuthority,
                    userTokenAccount: userAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    systemProgram: anchor.web3.SystemProgram.programId,
                } as any)
                .rpc();

            showDialog("SUCCESS", "100 Mock USDC minted to your wallet.", "success");
            refreshBalance();
        } catch (err: any) {
            console.error("Faucet failed:", err);
            if (err.message?.includes("Account does not exist") || err.message?.includes("0xbc4")) {
                showDialog("ERROR", "Mint not initialized. Admin action required.", "error");
                setMintExists(false);
            } else if (err.message?.includes("already been processed")) {
                showDialog("INFO", "Transaction processing or already complete. Check balance shortly.", "info");
                refreshBalance();
            } else {
                showDialog("FAILED", `Faucet failed: ${err.message}`, "error");
            }
        } finally {
            setFaucetLoading(false);
        }
    };

    useEffect(() => {
        if (program) {
            checkMint();
        }
    }, [program]);

    const truncatedWallet = walletAddress
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : null;

    return (
        <header className="fixed top-0 z-50 w-full bg-background border-b-2 border-primary flex justify-between items-center px-10 py-4 h-24 font-space-mono">
            <Link href="/" className="font-headline-lg text-[32px] sm:text-[48px] text-primary tracking-tighter uppercase leading-none hover:opacity-80 transition-none">
                SOLARUN
            </Link>
            
            <nav className="hidden lg:flex items-center gap-8">
                <Link className="font-label-caps text-[12px] text-on-surface-variant hover:text-primary transition-none uppercase tracking-widest" href="/">RACES</Link>
                {authenticated && isCreator && (
                    <Link className="font-label-caps text-[12px] text-on-surface-variant hover:text-primary transition-none uppercase tracking-widest flex items-center gap-1" href="/creator">
                        <Shield className="h-3 w-3" /> CREATOR_HUB
                    </Link>
                )}
                {authenticated && (
                    <Link className="font-label-caps text-[12px] text-on-surface-variant hover:text-primary transition-none uppercase tracking-widest" href="/register">REGISTER</Link>
                )}
            </nav>

            <div className="flex items-center gap-4">
                {authenticated && (
                    <div className="hidden md:flex flex-col items-end border-r-2 border-primary/20 pr-4 mr-2">
                        <span className="text-[10px] uppercase text-muted-foreground font-bold leading-none mb-1 tracking-tighter">LIQUIDITY</span>
                        <div className="flex gap-3">
                            <span className="text-[12px] font-bold text-primary">{solBalance.toFixed(3)} SOL</span>
                            <span className="text-[12px] font-bold text-blue-500">{usdcBalance.toFixed(2)} USDC</span>
                        </div>
                    </div>
                )}

                {!ready ? (
                    <button disabled className="font-label-caps text-[12px] border-2 border-primary/20 px-8 py-3 text-muted-foreground transition-none uppercase">
                        INITIALIZING...
                    </button>
                ) : !authenticated ? (
                    <button 
                        onClick={login}
                        className="font-label-caps text-[12px] border-2 border-primary px-8 py-3 text-primary hover:bg-primary hover:text-background transition-none active:translate-y-1 uppercase tracking-widest"
                    >
                        CONNECT WALLET
                    </button>
                ) : (
                    <div className="flex items-center gap-2">
                        {isCreator && mintExists === false && (
                            <button 
                                onClick={handleInitializeMint}
                                disabled={faucetLoading}
                                className="hidden xl:flex font-label-caps text-[10px] border-2 border-destructive px-4 py-2 text-destructive hover:bg-destructive hover:text-white transition-none uppercase"
                            >
                                INIT_MINT
                            </button>
                        )}
                        <button 
                            onClick={handleFaucet} 
                            disabled={faucetLoading || (mintExists === false && !isCreator)}
                            className="hidden xl:flex font-label-caps text-[10px] border-2 border-blue-500 px-4 py-2 text-blue-500 hover:bg-blue-500 hover:text-white transition-none uppercase"
                        >
                            {faucetLoading ? 'PROCESSING...' : 'FAUCET_USDC'}
                        </button>
                        
                        <button 
                            onClick={handleCopyAddress}
                            className="flex items-center gap-2 px-3 py-2 border-2 border-primary/10 hover:border-primary transition-none group"
                            title="Copy Address"
                        >
                            <span className="text-[12px] font-bold text-on-surface-variant group-hover:text-primary">
                                {truncatedWallet}
                            </span>
                            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 opacity-30 group-hover:opacity-100" />}
                        </button>

                        <button 
                            onClick={logout}
                            className="p-2 border-2 border-transparent hover:border-destructive text-on-surface-variant hover:text-destructive transition-none"
                            title="Logout"
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    </div>
                )}
            </div>
            
            <AlertDialog open={dialog.open} onOpenChange={(open) => setDialog(prev => ({ ...prev, open }))}>
                <AlertDialogContent className="rounded-none border-2 border-primary bg-background font-space-mono">
                    <AlertDialogHeader>
                        <div className="flex items-center gap-2 mb-2">
                            {dialog.type === 'success' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                            {dialog.type === 'error' && <AlertCircle className="h-5 w-5 text-destructive" />}
                            {dialog.type === 'warning' && <AlertCircle className="h-5 w-5 text-orange-500" />}
                            {dialog.type === 'info' && <Info className="h-5 w-5 text-blue-500" />}
                            <AlertDialogTitle className="font-anton uppercase tracking-widest">{dialog.title}</AlertDialogTitle>
                        </div>
                        <AlertDialogDescription className="text-on-surface-variant uppercase text-[12px] tracking-wider leading-relaxed">
                            {dialog.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-6 gap-4">
                        {dialog.cancelText && (
                            <AlertDialogCancel className="rounded-none border-2 border-primary px-8 py-2 font-label-caps text-[12px] uppercase hover:bg-primary hover:text-background transition-none">
                                {dialog.cancelText}
                            </AlertDialogCancel>
                        )}
                        <AlertDialogAction 
                            onClick={() => dialog.onConfirm?.()}
                            className="rounded-none bg-primary text-background px-8 py-2 font-label-caps text-[12px] uppercase hover:bg-transparent hover:text-primary border-2 border-primary transition-none"
                        >
                            {dialog.actionText}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </header>
    );
}
