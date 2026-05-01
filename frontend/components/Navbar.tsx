'use client';

import Link from 'next/link';
import { Zap, LogIn, LogOut, User, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export function Navbar() {
    const { ready, authenticated, solaRunUser, walletAddress, login, logout, isCreator } = useAuth();

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
                            {truncatedWallet && (
                                <span className="text-xs font-mono text-muted-foreground hidden sm:inline">
                                    {truncatedWallet}
                                </span>
                            )}
                            {solaRunUser?.role && (
                                <span className="text-xs bg-secondary px-2 py-0.5 rounded-full capitalize">
                                    {solaRunUser.role}
                                </span>
                            )}
                            <Button variant="outline" size="sm" onClick={() => {
                                // TODO: Implement faucet logic to call mint_mock_usdc
                                alert("Faucet triggered. This will mint Mock USDC to your wallet.");
                            }} className="text-blue-500 border-blue-500 hover:bg-blue-500/10 hidden sm:flex">
                                <Zap className="mr-1 h-3 w-3" /> Faucet USDC
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
