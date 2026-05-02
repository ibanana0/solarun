'use client';

import Link from 'next/link';
import { Zap, LogIn, LogOut, User, Shield, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useBalance } from '@/hooks/useBalance';
import { useProgram } from '@/hooks/useProgram';
import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useState, useEffect } from 'react';

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
            console.log("Checking if Mock USDC Mint exists...");
            const [mockUsdcMint] = PublicKey.findProgramAddressSync(
                [Buffer.from('mock_usdc_mint')],
                program.programId
            );
            const account = await program.provider.connection.getAccountInfo(mockUsdcMint);
            const exists = !!account;
            console.log(`Mock USDC Mint exists: ${exists}`);
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
        
        // Re-check existence to avoid duplicate attempts
        const exists = await checkMint();
        if (exists) {
            alert("Mock USDC Mint already exists!");
            return;
        }

        setFaucetLoading(true);
        try {
            const admin = new PublicKey(walletAddress);
            const [mockUsdcMint] = PublicKey.findProgramAddressSync([Buffer.from('mock_usdc_mint')], program.programId);
            const [mintAuthority] = PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], program.programId);

            console.log("Initializing Mock USDC Mint...");
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

            console.log("Init Mint Transaction successful:", txSignature);
            alert("Mock USDC Mint initialized successfully!");
            await checkMint();
            refreshBalance();
        } catch (err: any) {
            console.error("Failed to initialize mint:", err);
            const errorMsg = err.message || "";
            if (errorMsg.includes("already been processed") || errorMsg.includes("already processed")) {
                console.log("Transaction already processed, likely succeeded. Re-checking mint status...");
                const nowExists = await checkMint();
                if (nowExists) {
                    alert("Mock USDC Mint is now active!");
                    refreshBalance();
                } else {
                    alert("Transaction was already processed, but mint not found. Please refresh the page.");
                }
            } else {
                alert(`Failed: ${err.message}`);
            }
        } finally {
            setFaucetLoading(false);
        }
    };

    const handleFaucet = async () => {
        if (!program || !walletAddress) return;

        if (mintExists === false) {
            if (isCreator) {
                if (confirm("Mock USDC Mint not initialized. Initialize it now?")) {
                    await handleInitializeMint();
                    return;
                }
            } else {
                alert("Mock USDC Mint is not initialized yet. Please ask the admin.");
                return;
            }
        }

        setFaucetLoading(true);
        try {
            const owner = new PublicKey(walletAddress);
            const programId = program.programId;

            // Derive Mock USDC Mint
            const [mockUsdcMint] = PublicKey.findProgramAddressSync(
                [Buffer.from('mock_usdc_mint')],
                programId
            );

            // Derive Mint Authority
            const [mintAuthority] = PublicKey.findProgramAddressSync(
                [Buffer.from('mint_authority')],
                programId
            );

            // Derive User ATA
            const userAta = await getAssociatedTokenAddress(mockUsdcMint, owner);

            // Call faucet instruction (mint 100 USDC)
            const amount = new anchor.BN(100 * 1_000_000); // 100 USDC
            
            await program.methods
                .mintMockUsdc(amount)
                .accounts({
                    user: owner,
                    mockUsdcMint,
                    mintAuthority,
                    userTokenAccount: userAta, // Corrected key name from IDL
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    systemProgram: anchor.web3.SystemProgram.programId,
                } as any)
                .rpc();

            alert("Successfully minted 100 Mock USDC!");
            refreshBalance();
        } catch (err: any) {
            console.error("Faucet failed:", err);
            if (err.message?.includes("Account does not exist") || err.message?.includes("0xbc4")) {
                alert("Error: Mock USDC Mint not initialized. If you are the admin, initialize it first.");
                setMintExists(false);
            } else if (err.message?.includes("already been processed")) {
                alert("Transaksi sedang diproses atau sudah selesai. Silakan cek saldo Anda dalam beberapa saat.");
                refreshBalance();
            } else {
                alert(`Faucet failed: ${err.message}`);
            }
        } finally {
            setFaucetLoading(false);
        }
    };

    // Check mint existence when program is ready
    useEffect(() => {
        if (program) {
            checkMint();
        }
    }, [program]);

    const truncatedWallet = walletAddress
        ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
        : null;

    return (
        <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-16 items-center justify-between">
                <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
                    <Zap className="h-5 w-5" />
                    SolaRun
                </Link>
                <nav className="flex items-center gap-2">
                    <Button variant="ghost" asChild>
                        <Link href="/">Events</Link>
                    </Button>

                    {authenticated && isCreator && (
                        <Button variant="ghost" asChild>
                            <Link href="/creator">
                                <Shield className="mr-1 h-4 w-4" />
                                Creator
                            </Link>
                        </Button>
                    )}

                    {authenticated && (
                        <Button variant="ghost" asChild>
                            <Link href="/register">Daftar</Link>
                        </Button>
                    )}

                    {!ready ? (
                        <Button variant="outline" size="sm" disabled>
                            <User className="mr-1 h-4 w-4" /> Loading...
                        </Button>
                    ) : !authenticated ? (
                        <Button size="sm" onClick={login}>
                            <LogIn className="mr-1 h-4 w-4" /> Login
                        </Button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <div className="flex flex-col items-end mr-2 hidden md:flex">
                                <span className="text-[10px] uppercase text-muted-foreground font-bold leading-none">Balance</span>
                                <div className="flex gap-2">
                                    <span className="text-xs font-mono">{solBalance.toFixed(3)} SOL</span>
                                    <span className="text-xs font-mono text-blue-500">{usdcBalance.toFixed(2)} USDC</span>
                                </div>
                            </div>
                            
                            {truncatedWallet && (
                                <button 
                                    onClick={handleCopyAddress}
                                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/50 hover:bg-secondary transition-colors group border border-transparent hover:border-border"
                                    title="Salin alamat wallet"
                                >
                                    <span className="text-xs font-mono text-muted-foreground group-hover:text-foreground">
                                        {truncatedWallet}
                                    </span>
                                    {copied ? (
                                        <Check className="h-3 w-3 text-green-500" />
                                    ) : (
                                        <Copy className="h-3 w-3 text-muted-foreground group-hover:text-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
                                    )}
                                </button>
                            )}
                            {solaRunUser?.role && (
                                <span className="text-xs bg-secondary px-2 py-0.5 rounded-full capitalize">
                                    {solaRunUser.role}
                                </span>
                            )}
                            {isCreator && mintExists === false && (
                                <Button 
                                    variant="destructive" 
                                    size="sm" 
                                    onClick={handleInitializeMint}
                                    disabled={faucetLoading}
                                    className="hidden sm:flex"
                                >
                                    <Shield className="mr-1 h-3 w-3" /> Init Mint
                                </Button>
                            )}
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={handleFaucet} 
                                disabled={faucetLoading || (mintExists === false && !isCreator)}
                                className="text-blue-500 border-blue-500 hover:bg-blue-500/10 hidden sm:flex"
                            >
                                <Zap className={`mr-1 h-3 w-3 ${faucetLoading ? 'animate-pulse' : ''}`} /> 
                                {faucetLoading ? 'Processing...' : 'Faucet USDC'}
                            </Button>
                            <Button variant="outline" size="sm" onClick={logout}>
                                <LogOut className="mr-1 h-4 w-4" /> Logout
                            </Button>
                        </div>
                    )}
                </nav>
            </div>
        </header>
    );
}
