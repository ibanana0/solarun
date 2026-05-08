import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/lib/providers';
import { Navbar } from '@/components/Navbar';
import { Anton, Space_Mono } from 'next/font/google';

const anton = Anton({
    weight: '400',
    subsets: ['latin'],
    variable: '--font-anton',
    display: 'swap',
});

const spaceMono = Space_Mono({
    weight: ['400', '700'],
    subsets: ['latin'],
    variable: '--font-space-mono',
    display: 'swap',
});

export const metadata: Metadata = {
    title: 'SolaRun – Blockchain Marathon Platform',
    description: 'Platform marathon berbasis Solana dengan distribusi hadiah otomatis menggunakan smart contract dan sensor IoT RFID.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="id" className={`${anton.variable} ${spaceMono.variable} dark`}>
            <body className="font-space-mono">
                <Providers>
                    <Navbar />
                    <main className="min-h-screen pt-24">
                        {children}
                    </main>
                </Providers>
            </body>
        </html>
    );
}
