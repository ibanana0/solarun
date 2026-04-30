'use client';

import Link from 'next/link';
import { ArrowRight, Zap, CheckCircle, Users, Trophy } from 'lucide-react';
import { useEvents } from '@/hooks/useEvent';
import { StatusBadge } from '@/components/StatusBadge';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { RaceEvent } from '@/lib/supabase';

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric',
    });
}

function EventCard({ event }: { event: RaceEvent }) {
    return (
        <Link href={`/event/${event.id}`} className="block hover:opacity-90 transition-opacity">
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{event.name}</CardTitle>
                        <StatusBadge status={event.status} />
                    </div>
                    {event.description && (
                        <CardDescription className="line-clamp-2">
                            {event.description}
                        </CardDescription>
                    )}
                </CardHeader>
                <CardFooter className="gap-4 text-sm text-muted-foreground border-t pt-4">
                    <span><strong className="text-foreground">{event.registration_fee_sol} SOL</strong> / Biaya</span>
                    <span><strong className="text-foreground">{formatDate(event.start_time)}</strong></span>
                    <span><strong className="text-foreground">{event.max_participants}</strong> Maks.</span>
                </CardFooter>
            </Card>
        </Link>
    );
}

export default function HomePage() {
    const { data: events, isLoading, error } = useEvents();

    return (
        <div className="container py-8 space-y-12">
            {/* Hero */}
            <section className="text-center space-y-4 py-12">
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                    Marathon Transparan dengan{' '}
                    <span className="underline decoration-primary">Blockchain</span>
                </h1>
                <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                    Daftar event marathon, berlari melewati checkpoint RFID, dan terima hadiah otomatis via smart contract Solana.
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                    <Button asChild size="lg">
                        <Link href="/register">
                            Daftar Sekarang <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                    <Button variant="outline" size="lg" asChild>
                        <a href="#events">Lihat Event</a>
                    </Button>
                </div>
            </section>

            <Separator />

            {/* How it works */}
            <section className="space-y-6">
                <div className="text-center space-y-1">
                    <h2 className="text-2xl font-semibold tracking-tight">Cara Kerja</h2>
                    <p className="text-muted-foreground">Tiga langkah dari daftar hingga terima hadiah</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-4xl font-bold text-muted-foreground/30">01</CardTitle>
                            <CardTitle className="text-base">Daftar & Bayar</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Daftarkan diri ke event marathon. Biaya registrasi masuk ke prize pool bersama.
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-4xl font-bold text-muted-foreground/30">02</CardTitle>
                            <CardTitle className="text-base">Berlari & Tap RFID</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Tap chip RFID di setiap checkpoint. Sistem IoT mencatat waktu secara akurat dan real-time.
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-4xl font-bold text-muted-foreground/30">03</CardTitle>
                            <CardTitle className="text-base">Menang & Klaim</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Smart contract mendistribusikan hadiah dari pool langsung ke wallet pemenang — transparan dan otomatis.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </section>

            <Separator />

            {/* Events */}
            <section id="events" className="space-y-6">
                <div className="text-center space-y-1">
                    <h2 className="text-2xl font-semibold tracking-tight">Event Marathon</h2>
                    <p className="text-muted-foreground">Pilih event dan mulai berlari</p>
                </div>

                {isLoading && (
                    <p className="text-center text-muted-foreground py-8">Memuat events...</p>
                )}
                {error && (
                    <p className="text-center text-destructive py-8">Gagal memuat event. Coba refresh halaman.</p>
                )}
                {!isLoading && !error && events?.length === 0 && (
                    <div className="text-center py-16 text-muted-foreground">
                        <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p>Belum ada event tersedia.</p>
                    </div>
                )}
                {!isLoading && events && events.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {events.map((event) => (
                            <EventCard key={event.id} event={event} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
