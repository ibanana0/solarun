'use client';

import Link from 'next/link';
import { useEvents } from '@/hooks/useEvent';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Trophy, Loader2, Activity, Lock, Wallet } from 'lucide-react';
import type { RaceEvent } from '@/lib/supabase';

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric',
    });
}

function EventCard({ event }: { event: RaceEvent }) {
    return (
        <Link
            href={`/event/${event.id}`}
            className="block border-b-2 border-r-0 last:border-b-0 md:border-b-0 md:border-r-2 md:last:border-r-0 border-primary p-xl hover:bg-surface-container transition-none group relative overflow-hidden"
        >
            <div className="absolute top-0 right-0 p-2">
                <StatusBadge status={event.status} />
            </div>
            <h3 className="font-headline-md text-headline-md text-primary mb-md uppercase truncate pr-16">
                {event.name}
            </h3>
            <div className="space-y-2 font-body-sm text-body-sm text-on-surface-variant">
                <div className="flex justify-between border-b border-surface-container-highest pb-1">
                    <span>FEE</span>
                    <span className="text-primary font-bold">{event.registration_fee_sol} USDC</span>
                </div>
                <div className="flex justify-between border-b border-surface-container-highest pb-1">
                    <span>DATE</span>
                    <span className="text-primary">{formatDate(event.start_time)}</span>
                </div>
                <div className="flex justify-between border-b border-surface-container-highest pb-1">
                    <span>CAPACITY</span>
                    <span className="text-primary">{event.max_participants} RUNNERS</span>
                </div>
            </div>
            <div className="mt-6 flex justify-end">
                <span className="font-label-caps text-[10px] text-primary group-hover:underline">VIEW_RACE // ↗</span>
            </div>
        </Link>
    );
}

export default function HomePage() {
    const { data: events, isLoading, error } = useEvents();

    return (
        <div className="bg-background text-on-background selection:bg-primary selection:text-background">

            {/* ── Hero Section ─────────────────────────────────────────── */}
            <section className="relative min-h-[870px] flex flex-col justify-center items-center text-center px-margin py-xl overflow-hidden">
                {/* Background image */}
                <div className="absolute inset-0 z-0 opacity-10 pointer-events-none">
                    <img
                        alt="Athletic focus background"
                        className="w-full h-full object-cover"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuCfPGtiONVPXnfMEgV_oX-x1gZGIegpuLvUU09ksHDpMNIBtbAX_6-Ypetjj4HiQksODWoqOqczlE46wn9BUmp8dN6wFb1a5EcHq-2JcnP5iuvCY1wvwjo34ONG8m6ILrNyW5zFw6HKpYyC3VmqmrmChUi7YVBfHYcxTK1xAJigl8Y2BpegUBRWWFXt4WBVO-pCNnOPZdI2pJx_u5neSCVhnixnihydrNy-nLVmg_R4lRysKfdBqbgK7WQbY9unyDu0nLfmHBtfuL4"
                    />
                </div>

                <div className="relative z-10 max-w-6xl">
                    <h1 className="font-display-xl text-display-xl text-primary mb-md uppercase break-words sm:break-normal">
                        RUN THE PROTOCOL
                    </h1>
                    <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto mb-xl tracking-widest uppercase">
                        DECENTRALIZED ATHLETICS POWERED BY SOLANA AND IOT TELEMETRY.
                    </p>
                    <div className="flex flex-col md:flex-row gap-gutter justify-center">
                        <Button
                            asChild
                            className="bg-primary text-background border-2 border-primary px-xl py-lg font-label-caps text-label-caps hover:bg-transparent hover:text-primary transition-none active:translate-y-1 h-auto rounded-none"
                        >
                            <Link href="/register">ENTER RACE</Link>
                        </Button>
                        <Button
                            asChild
                            variant="outline"
                            className="border-2 border-primary text-primary px-xl py-lg font-label-caps text-label-caps hover:bg-primary hover:text-background transition-none active:translate-y-1 h-auto rounded-none"
                        >
                            <a href="#events">VIEW RACES</a>
                        </Button>
                    </div>
                </div>

                {/* Bottom-left network status badge */}
                <div className="absolute left-margin bottom-margin hidden md:block text-primary">
                    <div className="font-label-caps text-[10px] mb-xs uppercase">NETWORK STATUS</div>
                    <div className="flex items-center gap-xs">
                        <span className="w-2 h-2 bg-primary animate-pulse" />
                        <span className="font-label-caps text-label-caps">SOLANA DEVNET // SYNCED</span>
                    </div>
                </div>
            </section>

            {/* ── Value Prop Grid ───────────────────────────────────────── */}
            <section className="px-margin py-xl border-t-2 border-primary">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-2 border-primary">
                    {/* Col 1 – Precision Telemetry */}
                    <div className="p-xl border-b-2 md:border-b-0 md:border-r-2 border-primary hover:bg-surface-container transition-none group">
                        <div className="mb-lg">
                            <Activity className="text-primary h-12 w-12" />
                        </div>
                        <h3 className="font-headline-md text-headline-md text-primary mb-md uppercase">PRECISION TELEMETRY</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                            MQTT-tracked IoT data streams performance metrics directly from RFID sensors to the blockchain in real-time. Zero manipulation.
                        </p>
                    </div>

                    {/* Col 2 – Automated Vaults */}
                    <div className="p-xl border-b-2 md:border-b-0 md:border-r-2 border-primary hover:bg-surface-container transition-none group">
                        <div className="mb-lg">
                            <Lock className="text-primary h-12 w-12" />
                        </div>
                        <h3 className="font-headline-md text-headline-md text-primary mb-md uppercase">AUTOMATED VAULTS</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                            Prize pools are locked in audited smart contracts. Funds are only accessible by verified finishers through cryptographic proof.
                        </p>
                    </div>

                    {/* Col 3 – Trustless Payouts */}
                    <div className="p-xl hover:bg-surface-container transition-none group">
                        <div className="mb-lg">
                            <Wallet className="text-primary h-12 w-12" />
                        </div>
                        <h3 className="font-headline-md text-headline-md text-primary mb-md uppercase">TRUSTLESS PAYOUTS</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                            Instant distribution upon race completion. No intermediaries, no approval delays. Code is the final referee.
                        </p>
                    </div>
                </div>
            </section>

            {/* ── Feature Split ─────────────────────────────────────────── */}
            <section className="px-margin py-xl flex flex-col md:flex-row gap-xl items-stretch">
                {/* Live Telemetry panel */}
                <div className="flex-1 border-2 border-primary p-xl relative">
                    <div className="absolute -top-4 left-lg bg-background px-sm font-label-caps text-label-caps text-primary">
                        LIVE_TELEMETRY
                    </div>
                    <div className="flex flex-col gap-lg">
                        <div className="flex justify-between border-b border-surface-container-highest pb-sm">
                            <span className="text-on-surface-variant font-label-caps text-label-caps">SYSTEM_STATUS</span>
                            <span className="text-primary font-data-lg text-data-lg">OPERATIONAL</span>
                        </div>
                        <div className="flex justify-between border-b border-surface-container-highest pb-sm">
                            <span className="text-on-surface-variant font-label-caps text-label-caps">ACTIVE_CHECKPOINTS</span>
                            <span className="text-primary font-data-lg text-data-lg">3 NODES</span>
                        </div>
                        <div className="flex justify-between border-b border-surface-container-highest pb-sm">
                            <span className="text-on-surface-variant font-label-caps text-label-caps">RFID_PROTOCOL</span>
                            <span className="text-primary font-data-lg text-data-lg">MQTT v5</span>
                        </div>
                    </div>
                </div>

                {/* CTA panel */}
                <div className="flex-1 bg-primary p-xl text-background flex flex-col justify-between">
                    <h2 className="font-headline-lg text-headline-lg uppercase leading-none">JOIN THE ELITE RANKINGS</h2>
                    <div className="mt-xl">
                        <p className="font-body-lg text-body-lg mb-lg uppercase tracking-wider">
                            Participate in high-stakes decentralized marathon events with athletes worldwide.
                        </p>
                        <Button
                            asChild
                            className="bg-background text-primary px-xl py-md font-label-caps text-label-caps hover:bg-surface-container hover:text-primary border-2 border-transparent transition-none h-auto rounded-none"
                        >
                            <a href="#events">VIEW ACTIVE RACES</a>
                        </Button>
                    </div>
                </div>
            </section>

            {/* ── Active Races Section ──────────────────────────────────── */}
            <section id="events" className="px-margin py-xl border-t-2 border-primary">
                <div className="mb-lg">
                    <h2 className="font-headline-lg text-headline-lg uppercase">ACTIVE_RACES</h2>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 tracking-widest uppercase">
                        Select a race and enter the decentralized track.
                    </p>
                </div>

                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-xl text-muted-foreground">
                        <Loader2 className="h-12 w-12 animate-spin mb-4" />
                        <p className="font-label-caps text-label-caps uppercase">FETCHING_EVENTS...</p>
                    </div>
                )}

                {error && (
                    <div className="text-center py-xl border-2 border-destructive p-xl">
                        <p className="text-destructive font-bold uppercase mb-4">FAILED_TO_LOAD_PROTOCOL_DATA</p>
                        <Button variant="outline" className="rounded-none" onClick={() => window.location.reload()}>
                            RETRY_CONNECTION
                        </Button>
                    </div>
                )}

                {!isLoading && !error && events?.length === 0 && (
                    <div className="text-center py-xl border-2 border-primary/20 p-xl">
                        <Trophy className="h-16 w-16 mx-auto mb-6 opacity-20" />
                        <p className="font-label-caps text-label-caps uppercase opacity-40 tracking-widest">NO_ACTIVE_RACES_FOUND</p>
                    </div>
                )}

                {!isLoading && events && events.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-2 border-primary">
                        {events.map((event) => (
                            <EventCard key={event.id} event={event} />
                        ))}
                    </div>
                )}
            </section>

            {/* ── Live Action Ticker ───────────────────────────────────── */}
            <div className="w-full bg-background border-y-2 border-primary py-sm overflow-hidden whitespace-nowrap">
                <div className="inline-block animate-marquee font-label-caps text-label-caps text-primary tracking-widest">
                    SOLARUN PROTOCOL LIVE // POWERED BY SOLANA DEVNET // RFID CHECKPOINTS ACTIVE // PRIZE DISTRIBUTION AUTOMATED // SMART CONTRACT VERIFIED //&nbsp;
                    SOLARUN PROTOCOL LIVE // POWERED BY SOLANA DEVNET // RFID CHECKPOINTS ACTIVE // PRIZE DISTRIBUTION AUTOMATED // SMART CONTRACT VERIFIED //&nbsp;
                </div>
            </div>

            {/* ── Footer ───────────────────────────────────────────────── */}
            <footer className="flex flex-col md:flex-row justify-between items-center w-full px-margin py-lg gap-gutter border-t-2 border-primary bg-background">
                <div className="font-headline-md text-headline-md text-primary uppercase">SOLARUN</div>
                <div className="flex gap-lg flex-wrap justify-center">
                    <a
                        className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none"
                        href="#"
                    >
                        DOCS
                    </a>
                    <a
                        className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none"
                        href="https://github.com/Ibanana/solarun"
                        target="_blank"
                        rel="noreferrer"
                    >
                        GITHUB
                    </a>
                    <a
                        className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none"
                        href="#"
                    >
                        AUDIT
                    </a>
                    <a
                        className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none"
                        href="#"
                    >
                        PRIVACY
                    </a>
                </div>
                <div className="font-body-sm text-body-sm text-on-surface-variant text-center md:text-right uppercase opacity-60">
                    © 2026 SOLARUN PROTOCOL // ALL PERFORMANCE DATA ON-CHAIN
                </div>
            </footer>
        </div>
    );
}
