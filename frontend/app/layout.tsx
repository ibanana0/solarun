import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/lib/providers';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
    title: 'SolaRun – Blockchain Marathon Platform',
    description: 'Platform marathon berbasis Solana dengan distribusi hadiah otomatis menggunakan smart contract dan sensor IoT RFID.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="id">
            <body>
                <Providers>
                    <Navbar />
                    <main className="min-h-screen pt-16">
                        {children}
                    </main>
                </Providers>
            </body>
        </html>
    );
}
