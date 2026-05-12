'use client';

import Link from 'next/link';
import { Zap, LogIn, LogOut, User, Shield, Copy, Check, AlertCircle, CheckCircle2, Info, Menu } from 'lucide-react';
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
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Sheet,
    SheetContent,
    SheetTrigger,
} from "@/components/ui/sheet";

function WalletInfoDetails({
    truncatedWallet,
    solBalance,
    usdcBalance,
    isCreator,
    mintExists,
    faucetLoading,
    handleInitializeMint,
    handleFaucet,
    handleCopyAddress,
    logout,
    copied
}: {
    truncatedWallet: string | null;
    solBalance: number;
    usdcBalance: number;
    isCreator: boolean;
    mintExists: boolean | null;
    faucetLoading: boolean;
    handleInitializeMint: () => Promise<void>;
    handleFaucet: () => Promise<void>;
    handleCopyAddress: () => void;
    logout: () => void;
    copied: boolean;
}) {
    return (
        <div className="flex flex-col gap-6 p-2 font-space-mono">
            <div className="flex flex-col gap-2 border-b-2 border-primary/10 pb-4">
                <span className="text-[10px] uppercase text-muted-foreground font-black tracking-tighter">LIQUIDITY_REPORT</span>
                <div className="flex justify-between items-end">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold">SOLANA</span>
                        <span className="text-[18px] font-black text-primary leading-none">{solBalance.toFixed(3)} SOL</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold">MOCK_USDC</span>
                        <span className="text-[18px] font-black text-blue-500 leading-none">{usdcBalance.toFixed(2)} USDC</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-3">
                <button
                    onClick={handleCopyAddress}
                    className="flex items-center justify-between px-4 py-3 border-2 border-primary/10 hover:border-primary transition-none group w-full bg-surface-variant/5"
                >
                    <div className="flex flex-col items-start">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold leading-none mb-1">WALLET_ADDRESS</span>
                        <span className="text-[12px] font-bold text-on-surface-variant group-hover:text-primary leading-none">
                            {truncatedWallet}
                        </span>
                    </div>
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 opacity-30 group-hover:opacity-100" />}
                </button>

                <div className="grid grid-cols-1 gap-2">
                    {isCreator && mintExists === false && (
                        <Button
                            onClick={handleInitializeMint}
                            disabled={faucetLoading}
                            variant="destructive"
                            className="rounded-none border-2 border-destructive font-black text-[12px] uppercase h-12"
                        >
                            INITIALIZE_MINT_AUTHORITY
                        </Button>
                    )}
                    <Button
                        onClick={handleFaucet}
                        disabled={faucetLoading || (mintExists === false)}
                        className="rounded-none border-2 border-blue-500 bg-transparent text-blue-500 hover:bg-blue-500 hover:text-white font-black text-[12px] uppercase h-12"
                    >
                        {faucetLoading ? 'DISPENSING...' : 'REQUEST_FAUCET_USDC'}
                    </Button>
                </div>
            </div>

            <Button
                variant="ghost"
                onClick={logout}
                className="w-full rounded-none border-2 border-transparent hover:border-destructive hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-none uppercase font-black text-[12px] h-12 flex items-center gap-2 justify-center"
            >
                <LogOut className="h-4 w-4" /> DISCONNECT_SESSION
            </Button>
        </div>
    );
}

function NavLinks({ authenticated, isCreator }: { authenticated: boolean; isCreator: boolean }) {
    return (
        <>
            <Link className="font-label-caps text-[12px] lg:text-[11px] text-on-surface-variant hover:text-primary transition-none uppercase tracking-widest font-bold" href="/">RACES</Link>
            <Link className="font-label-caps text-[12px] lg:text-[11px] text-on-surface-variant hover:text-primary transition-none uppercase tracking-widest font-bold" href="/events">EXPLORE</Link>
            {authenticated && isCreator && (
                <Link className="font-label-caps text-[12px] lg:text-[11px] text-on-surface-variant hover:text-primary transition-none uppercase tracking-widest font-bold flex items-center gap-1" href="/creator">
                    <Shield className="h-3 w-3" /> CREATOR_HUB
                </Link>
            )}
            {authenticated && (
                <Link className="font-label-caps text-[12px] lg:text-[11px] text-on-surface-variant hover:text-primary transition-none uppercase tracking-widest font-bold" href="/register">REGISTER</Link>
            )}
            {authenticated && (
                <Link className="font-label-caps text-[12px] lg:text-[11px] text-on-surface-variant hover:text-primary transition-none uppercase tracking-widest font-bold" href="/profile">PROFILE</Link>
            )}
        </>
    );
}

export function Navbar() {
    const ADMIN_WALLET = 'A7PqEe2t83XkEmVT3ToaTr5pubUAKwMGyAZdg69gUsyv';
    const { ready, authenticated, walletAddress, login, logout, isCreator: authIsCreator } = useAuth();
    const { solBalance, usdcBalance, refresh: refreshBalance } = useBalance();

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

            await program.methods
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
        const init = async () => {
            if (program) {
                await checkMint();
            }
        };
        init();
    }, [program]);

    const truncatedWallet = walletAddress
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : null;

    const walletInfoProps = {
        truncatedWallet,
        solBalance,
        usdcBalance,
        isCreator,
        mintExists,
        faucetLoading,
        handleInitializeMint,
        handleFaucet,
        handleCopyAddress,
        logout,
        copied
    };

    return (
        <header className="fixed top-0 z-50 w-full bg-background border-b-2 border-primary flex justify-between items-center px-6 sm:px-10 py-4 h-24 font-space-mono">
            <Link href="/" className="font-headline-lg text-[32px] sm:text-[48px] text-primary tracking-tighter uppercase leading-none hover:opacity-80 transition-none shrink-0">
                SOLARUN
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-8">
                <NavLinks authenticated={authenticated} isCreator={isCreator} />
            </nav>

            <div className="flex items-center gap-4">
                {!ready ? (
                    <div className="font-label-caps text-[12px] border-2 border-primary/20 px-8 py-3 text-muted-foreground transition-none uppercase tracking-widest animate-pulse">
                        SYNCING_STATE...
                    </div>
                ) : !authenticated ? (
                    <button
                        onClick={login}
                        className="font-label-caps text-[12px] border-2 border-primary px-8 py-3 text-primary hover:bg-primary hover:text-background transition-none active:translate-y-1 uppercase tracking-widest font-bold"
                    >
                        CONNECT_WALLET
                    </button>
                ) : (
                    <>
                        {/* Desktop Wallet Popover */}
                        <div className="hidden lg:block">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button className="flex items-center gap-3 px-5 py-3 border-2 border-primary hover:bg-primary hover:text-background transition-none uppercase font-black text-[12px] tracking-widest group">
                                        <User className="h-4 w-4 opacity-50 group-hover:opacity-100" />
                                        {truncatedWallet}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 rounded-none border-2 border-primary bg-background p-4 mt-2" align="end">
                                    <WalletInfoDetails {...walletInfoProps} />
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Mobile Navigation Sheet */}
                        <div className="lg:hidden">
                            <Sheet>
                                <SheetTrigger asChild>
                                    <button className="p-3 border-2 border-primary text-primary hover:bg-primary hover:text-background transition-none active:translate-y-1">
                                        <Menu className="h-6 w-6" />
                                    </button>
                                </SheetTrigger>
                                <SheetContent side="right" className="w-full sm:w-[400px] border-l-2 border-primary bg-background p-0">
                                    <div className="flex flex-col h-full pt-20 px-8 font-space-mono">
                                        <div className="mb-8 border-b-2 border-primary/10 pb-4">
                                            <span className="text-[10px] text-muted-foreground uppercase font-black tracking-tighter">NAVIGATION</span>
                                        </div>
                                        <nav className="flex flex-col gap-6 mb-12">
                                            <Link className="font-headline-sm text-3xl text-primary uppercase tracking-tighter hover:pl-2 transition-all" href="/">RACES</Link>
                                            <Link className="font-headline-sm text-3xl text-primary uppercase tracking-tighter hover:pl-2 transition-all" href="/events">EXPLORE</Link>
                                            {authenticated && isCreator && (
                                                <Link className="font-headline-sm text-3xl text-primary uppercase tracking-tighter flex items-center gap-3 hover:pl-2 transition-all" href="/creator">
                                                    <Shield className="h-6 w-6" /> CREATOR_HUB
                                                </Link>
                                            )}
                                            <Link className="font-headline-sm text-3xl text-primary uppercase tracking-tighter hover:pl-2 transition-all" href="/register">REGISTER</Link>
                                            <Link className="font-headline-sm text-3xl text-primary uppercase tracking-tighter hover:pl-2 transition-all" href="/profile">PROFILE</Link>
                                        </nav>
                                        
                                        <div className="mt-auto pb-12">
                                            <WalletInfoDetails {...walletInfoProps} />
                                        </div>
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </div>
                    </>
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
