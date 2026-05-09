'use client';

import Link from 'next/link';
import { useEvents } from '@/hooks/useEvent';
import { Loader2, Trophy, Lock, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RaceEvent } from '@/lib/supabase';
import { useState, useEffect } from 'react';

/* ── Helpers ─────────────────────────────────────────────────── */

function formatStartTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();

    // If the event is in the past, show the date
    if (diffMs < 0) {
        return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }).toUpperCase()
            + ' // '
            + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    // If the event is in the future, show countdown
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    return `T-MINUS ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getStatusLabel(status: RaceEvent['status']): string {
    const map: Record<string, string> = {
        pending: 'LIVE_ENTRY',
        active: 'RACE_ACTIVE',
        completed: 'RACE_COMPLETE',
        settled: 'SETTLED',
        Initialized: 'LIVE_ENTRY',
        Active: 'RACE_ACTIVE',
        Completed: 'RACE_COMPLETE',
        Settled: 'SETTLED',
    };
    return map[status] ?? status.toUpperCase();
}

function isSettled(status: RaceEvent['status']): boolean {
    return status === 'settled' || status === 'Settled';
}

function isCompleted(status: RaceEvent['status']): boolean {
    return status === 'completed' || status === 'Completed' || isSettled(status);
}

/* ── Race Card Component ─────────────────────────────────────── */

function RaceCard({ event }: { event: RaceEvent }) {
    const settled = isSettled(event.status);
    const completed = isCompleted(event.status);

    // Compute an estimated prize pool = fee × max participants
    const prizePool = (event.registration_fee_sol * event.max_participants).toFixed(0);

    // Live countdown state
    const [timeDisplay, setTimeDisplay] = useState(formatStartTime(event.start_time));
    useEffect(() => {
        const diffMs = new Date(event.start_time).getTime() - Date.now();
        if (diffMs < 0) return; // No countdown for past events
        const interval = setInterval(() => {
            setTimeDisplay(formatStartTime(event.start_time));
        }, 1000);
        return () => clearInterval(interval);
    }, [event.start_time]);

    return (
        <div
            className={`border-2 border-primary p-lg flex flex-col gap-lg relative transition-none
                ${settled ? 'bg-surface-container-lowest' : 'hover:bg-surface-container-lowest'}`}
        >
            {/* Header row: status + name | prize pool */}
            <div className={`flex justify-between items-start ${settled ? 'opacity-40' : ''}`}>
                <div>
                    <span className="font-label-caps text-label-caps px-sm py-xs border-2 border-primary inline-block mb-md">
                        {getStatusLabel(event.status)}
                    </span>
                    <h2 className="font-headline-md text-headline-md leading-none uppercase">
                        {event.name}
                    </h2>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                    <div className="font-label-caps text-label-caps text-on-surface-variant">PRIZE_POOL</div>
                    <div className="font-data-lg text-data-lg">{completed ? '—' : `${prizePool} USDC`}</div>
                </div>
            </div>

            {/* Data row: start time | participants */}
            <div className={`grid grid-cols-2 gap-gutter ${settled ? 'opacity-50' : ''}`}>
                <div>
                    <div className="font-label-caps text-label-caps text-on-surface-variant">START_TIME</div>
                    <div className="font-body-lg text-body-lg font-bold">{timeDisplay}</div>
                </div>
                <div className="text-right">
                    <div className="font-label-caps text-label-caps text-on-surface-variant">CAPACITY</div>
                    <div className="font-body-lg text-body-lg font-bold">{event.max_participants} RUNNERS</div>
                </div>
            </div>

            {/* Entry fee indicator */}
            <div className={`flex justify-between items-center border-t border-surface-container-highest pt-sm ${settled ? 'opacity-30' : ''}`}>
                <span className="font-label-caps text-label-caps text-on-surface-variant">ENTRY_FEE</span>
                <span className="font-data-lg text-data-lg">{event.registration_fee_sol} USDC</span>
            </div>

            {/* CTA button */}
            <Button
                asChild
                className={`w-full border-2 py-md font-label-caps text-label-caps transition-none active:translate-y-1 h-auto rounded-none bg-transparent 
                    ${settled 
                        ? 'border-outline text-on-surface-variant hover:bg-surface-container hover:text-primary' 
                        : 'border-primary text-primary hover:bg-primary hover:text-on-primary'}`}
            >
                <Link href={`/event/${event.id}`}>
                    {settled ? 'VIEW ARCHIVE' : completed ? 'VIEW RESULTS' : (event.status === 'active' || event.status === 'Active') ? 'WATCH LIVE' : 'ENTER RACE'}
                </Link>
            </Button>
        </div>
    );
}

/* ── Sidebar Filter (UI-only) ───────────────────────────────── */

function FilterSidebar({
    statusFilter,
    setStatusFilter,
}: {
    statusFilter: string;
    setStatusFilter: (val: string) => void;
}) {
    const statuses = [
        { value: 'all', label: 'ALL RACES' },
        { value: 'pending', label: 'OPEN ENTRY' },
        { value: 'active', label: 'ACTIVE RACES' },
        { value: 'completed', label: 'COMPLETED' },
        { value: 'settled', label: 'SETTLED' },
    ];

    return (
        <aside className="w-full md:w-80 flex-shrink-0 flex flex-col gap-lg">
            <div className="border-2 border-primary p-lg">
                <div className="font-headline-md text-headline-md mb-lg">FILTERS</div>

                {/* Filter Section: Status */}
                <div className="mb-xl">
                    <label className="font-label-caps text-label-caps text-on-surface-variant block mb-md">
                        RACE STATUS
                    </label>
                    <div className="flex flex-col gap-sm">
                        {statuses.map((s) => (
                            <label key={s.value} className="flex items-center gap-sm cursor-pointer group">
                                <input
                                    type="radio"
                                    name="status-filter"
                                    checked={statusFilter === s.value}
                                    onChange={() => setStatusFilter(s.value)}
                                    className="appearance-none w-5 h-5 border-2 border-primary checked:bg-primary focus:ring-0 cursor-pointer"
                                />
                                <span className="font-label-caps text-label-caps group-hover:text-primary">
                                    {s.label}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Filter Section: Entry Fee */}
                <div className="mb-xl">
                    <label className="font-label-caps text-label-caps text-on-surface-variant block mb-md">
                        MAX ENTRY FEE (USDC)
                    </label>
                    <input
                        className="w-full bg-transparent border-b-2 border-primary py-sm font-data-lg text-data-lg focus:outline-none placeholder:text-surface-container-highest"
                        placeholder="0.00"
                        type="text"
                        readOnly
                    />
                </div>

                {/* Filter Section: Prize Pool */}
                <div>
                    <label className="font-label-caps text-label-caps text-on-surface-variant block mb-md">
                        MIN PRIZE POOL (USDC)
                    </label>
                    <div className="grid grid-cols-2 gap-sm">
                        <button className="border-2 border-primary py-xs font-label-caps text-label-caps hover:bg-primary hover:text-on-primary transition-none">
                            10+
                        </button>
                        <button className="border-2 border-primary py-xs font-label-caps text-label-caps hover:bg-primary hover:text-on-primary transition-none">
                            50+
                        </button>
                        <button className="border-2 border-primary py-xs font-label-caps text-label-caps hover:bg-primary hover:text-on-primary transition-none">
                            100+
                        </button>
                        <button className="border-2 border-primary py-xs font-label-caps text-label-caps hover:bg-primary hover:text-on-primary transition-none">
                            500+
                        </button>
                    </div>
                </div>
            </div>

            {/* Info block */}
            <div className="border-2 border-primary p-lg bg-surface-container-low">
                <Terminal className="h-6 w-6 mb-sm" />
                <p className="font-body-sm text-body-sm leading-tight text-on-surface-variant">
                    ALL RACE DATA IS VALIDATED VIA SOLANA SMART CONTRACTS AND RFID CHECKPOINT TELEMETRY.
                </p>
            </div>
        </aside>
    );
}

/* ── Main Page Component ─────────────────────────────────────── */

export default function EventsPage() {
    const { data: events, isLoading, error } = useEvents();
    const [statusFilter, setStatusFilter] = useState('all');
    const [syncTime, setSyncTime] = useState('');

    // Set sync timestamp on mount
    useEffect(() => {
        const now = new Date();
        setSyncTime(
            now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
            + ' WIB'
        );
    }, [events]);

    // Filter events by status
    const filteredEvents = events?.filter((event) => {
        if (statusFilter === 'all') return true;
        const normalizedStatus = event.status.toLowerCase();
        return normalizedStatus === statusFilter;
    });

    return (
        <div className="bg-background text-on-background selection:bg-primary selection:text-background min-h-screen">
            <main className="px-margin pt-xl pb-xl flex flex-col md:flex-row gap-gutter">
                {/* Sidebar */}
                <FilterSidebar statusFilter={statusFilter} setStatusFilter={setStatusFilter} />

                {/* Race Discovery Content */}
                <section className="flex-grow">
                    {/* Header */}
                    <div className="flex justify-between items-end mb-lg border-b-2 border-primary pb-sm">
                        <h1 className="font-display-xl text-headline-lg uppercase">DISCOVERY_CANVAS</h1>
                        <div className="font-label-caps text-label-caps pb-xs text-on-surface-variant">
                            LATEST_SYNC: {syncTime}
                        </div>
                    </div>

                    {/* Loading state */}
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center py-xl text-muted-foreground border-2 border-primary/20">
                            <Loader2 className="h-12 w-12 animate-spin mb-4" />
                            <p className="font-label-caps text-label-caps uppercase">SYNCING_PROTOCOL_DATA...</p>
                        </div>
                    )}

                    {/* Error state */}
                    {error && (
                        <div className="text-center py-xl border-2 border-destructive p-xl">
                            <p className="text-destructive font-bold uppercase mb-4 font-label-caps text-label-caps">
                                FAILED_TO_SYNC_PROTOCOL_DATA
                            </p>
                            <Button
                                variant="outline"
                                className="rounded-none border-2 border-primary"
                                onClick={() => window.location.reload()}
                            >
                                RETRY_SYNC
                            </Button>
                        </div>
                    )}

                    {/* Empty state */}
                    {!isLoading && !error && filteredEvents?.length === 0 && (
                        <div className="text-center py-xl border-2 border-primary/20 p-xl">
                            <Trophy className="h-16 w-16 mx-auto mb-6 opacity-20" />
                            <p className="font-label-caps text-label-caps uppercase opacity-40 tracking-widest">
                                NO_RACES_FOUND // ADJUST_FILTERS
                            </p>
                        </div>
                    )}

                    {/* Bento Grid / Race Cards */}
                    {!isLoading && filteredEvents && filteredEvents.length > 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
                            {filteredEvents.map((event) => (
                                <RaceCard key={event.id} event={event} />
                            ))}
                        </div>
                    )}
                </section>
            </main>

            {/* Footer */}
            <footer className="flex flex-col md:flex-row justify-between items-center w-full px-margin py-lg gap-gutter bg-background border-t-2 border-primary">
                <div className="font-headline-md text-headline-md text-primary">SOLARUN</div>
                <div className="font-body-sm text-body-sm text-on-surface-variant text-center md:text-left uppercase opacity-60">
                    © 2026 SOLARUN PROTOCOL // ALL PERFORMANCE DATA ON-CHAIN
                </div>
                <nav className="flex gap-lg flex-wrap justify-center">
                    <a className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none" href="#">DOCS</a>
                    <a className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none" href="https://github.com/Ibanana/solarun" target="_blank" rel="noreferrer">GITHUB</a>
                    <a className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none" href="#">AUDIT</a>
                    <a className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none" href="#">PRIVACY</a>
                </nav>
            </footer>
        </div>
    );
}
