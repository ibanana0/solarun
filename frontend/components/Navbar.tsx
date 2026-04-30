import Link from 'next/link';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Navbar() {
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
                    <Button variant="ghost" asChild>
                        <Link href="/creator">Creator</Link>
                    </Button>
                    <Button asChild>
                        <Link href="/register">Daftar</Link>
                    </Button>
                </nav>
            </div>
        </header>
    );
}

