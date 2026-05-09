'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, LogIn, ShieldAlert, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
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

import { useProgram } from '@/hooks/useProgram';
import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { v4 as uuidv4 } from 'uuid';
import dynamic from 'next/dynamic';

const AdminMapBuilder = dynamic(() => import('@/components/AdminMapBuilder'), {
    ssr: false,
    loading: () => (
        <div className="aspect-video bg-surface-container border-2 border-primary flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
        </div>
    ),
});

export default function CreateEventPage() {
    const { ready, authenticated, login, isCreator, walletAddress, loading: authLoading } = useAuth();
    const program = useProgram();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [feeUsdc, setFeeUsdc] = useState('10');
    const [maxParticipants, setMaxParticipants] = useState('100');
    const [startDate, setStartDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [durationHours, setDurationHours] = useState('2');

    // Route config – auto-updated from AdminMapBuilder
    const [checkpointsConfig, setCheckpointsConfig] = useState<any[]>([]);
    const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
    const [routeDistanceMeters, setRouteDistanceMeters] = useState<number>(0);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createdEvent, setCreatedEvent] = useState<{ id: string; name: string; tx_signature?: string } | null>(null);

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
        open: false, title: '', description: '', type: 'info'
    });

    const showDialog = (title: string, description: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', onConfirm?: () => void, actionText = 'OK', cancelText?: string) => {
        setDialog({ open: true, title, description, type, onConfirm, actionText, cancelText });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (!name.trim()) { setError('EVENT_NAME is required.'); return; }
        if (!startDate || !startTime) { setError('GENESIS_DATE and START_TIME are required.'); return; }
        if (!walletAddress || !program) { setError('Wallet/Program not available. Try reconnecting.'); return; }

        const fee = parseFloat(feeUsdc);
        if (isNaN(fee) || fee <= 0) { setError('PROTOCOL_FEE must be greater than 0.'); return; }

        const max = parseInt(maxParticipants);
        if (isNaN(max) || max < 2) { setError('MAX_PARTICIPANTS must be at least 2.'); return; }

        const duration = parseFloat(durationHours);
        if (isNaN(duration) || duration <= 0) { setError('EVENT_DURATION must be greater than 0.'); return; }

        // Build timestamps
        const startDateTime = new Date(`${startDate}T${startTime}`);
        if (isNaN(startDateTime.getTime())) { setError('Invalid date/time format.'); return; }

        if (startDateTime.getTime() < Date.now()) {
            setError('Start time must be in the future.');
            return;
        }

        const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 60 * 1000);
        const rawUuid = uuidv4();
        const eventId = rawUuid.replace(/-/g, '');

        setSubmitting(true);
        try {
            const programId = program.programId;
            const admin = program.provider.publicKey;

            // Derive PDAs
            const [eventPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('event'), Buffer.from(eventId)],
                programId
            );
            const [vaultPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('vault'), eventPda.toBuffer()],
                programId
            );
            const [mockUsdcMint] = PublicKey.findProgramAddressSync(
                [Buffer.from('mock_usdc_mint')],
                programId
            );

            // Execute On-Chain Transaction
            const txSignature = await program.methods
                .initializeEvent(
                    eventId,
                    new anchor.BN(max),
                    new anchor.BN(fee * 1_000_000),
                    new anchor.BN(Math.floor(startDateTime.getTime() / 1000)),
                    new anchor.BN(Math.floor(endDateTime.getTime() / 1000))
                )
                .accounts({
                    admin,
                    event: eventPda,
                    vault: vaultPda,
                    mockUsdcMint,
                    systemProgram: anchor.web3.SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                } as any)
                .rpc();

            console.log("On-chain event initialized:", txSignature);

            // Sync to Supabase
            const { data, error: insertError } = await supabase
                .from('race_events')
                .insert({
                    id: rawUuid,
                    name: name.trim(),
                    description: description.trim() || null,
                    registration_fee_sol: fee,
                    max_participants: max,
                    status: 'pending',
                    start_time: startDateTime.toISOString(),
                    end_time: endDateTime.toISOString(),
                    creator_wallet: walletAddress,
                    tx_signature: txSignature,
                    vault_address: vaultPda.toBase58(),
                    checkpoints_config: checkpointsConfig.length > 0 ? checkpointsConfig : null,
                    route_coordinates: routeCoordinates.length > 0 ? routeCoordinates : null,
                    route_distance_meters: routeDistanceMeters > 0 ? routeDistanceMeters : null,
                })
                .select('id, name, tx_signature')
                .single();

            if (insertError) {
                showDialog("DB_ERROR", `On-chain success, but failed to sync to database: ${insertError.message}`, "error");
                return;
            }

            setCreatedEvent(data);
            showDialog("EVENT_DEPLOYED", `Event "${data.name}" has been successfully initialized on-chain.`, "success");
        } catch (err: any) {
            console.error("Failed to create event:", err);
            showDialog("DEPLOY_FAILED", `Transaction error: ${err.message || 'Unknown error. Retry.'}`, "error");
        } finally {
            setSubmitting(false);
        }
    };

    // ── Loading auth state ──
    if (!ready || authLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-on-surface-variant">
                <Loader2 className="h-12 w-12 animate-spin mb-4" />
                <p className="font-label-caps text-label-caps uppercase">SYNCING_AUTH_STATE...</p>
            </div>
        );
    }

    // ── Not logged in ──
    if (!authenticated) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-margin">
                <LogIn className="h-16 w-16 opacity-30" />
                <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">AUTHENTICATION_REQUIRED</p>
                <button
                    onClick={login}
                    className="border-2 border-primary px-xl py-md font-label-caps text-label-caps hover:bg-primary hover:text-background transition-none"
                >
                    CONNECT WALLET
                </button>
            </div>
        );
    }

    // ── Not a creator ──
    if (!isCreator) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-margin">
                <ShieldAlert className="h-16 w-16 opacity-30 text-orange-500" />
                <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">ACCESS_DENIED // CREATOR_ROLE_REQUIRED</p>
                <Link
                    href="/"
                    className="border-2 border-primary px-xl py-md font-label-caps text-label-caps hover:bg-primary hover:text-background transition-none"
                >
                    ← BACK TO RACES
                </Link>
            </div>
        );
    }

    // ── Success state ──
    if (createdEvent) {
        return (
            <div className="bg-background text-on-background min-h-screen flex flex-col">
                <main className="flex-grow px-margin py-xl max-w-7xl mx-auto w-full flex flex-col items-center justify-center gap-xl">
                    <div className="border-2 border-primary p-xl text-center space-y-lg max-w-xl w-full">
                        <span className="material-symbols-outlined text-[64px] text-primary block" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        <h1 className="font-headline-lg text-headline-lg uppercase">EVENT_DEPLOYED</h1>
                        <p className="font-body-sm text-body-sm text-on-surface-variant uppercase">
                            {createdEvent.name} has been successfully initialized on-chain.
                        </p>
                        <p className="font-body-sm text-xs text-on-surface-variant font-mono break-all">
                            ID: {createdEvent.id}
                        </p>
                        {createdEvent.tx_signature && (
                            <a
                                href={`https://explorer.solana.com/tx/${createdEvent.tx_signature}?cluster=devnet`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-xs font-label-caps text-[10px] text-blue-400 hover:text-blue-300 border border-blue-800 px-sm py-xs transition-none"
                            >
                                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                VERIFY ON BLOCKSCAN
                            </a>
                        )}
                        <div className="flex gap-gutter justify-center pt-md">
                            <Link
                                href={`/event/${createdEvent.id}`}
                                className="border-2 border-primary px-lg py-sm font-label-caps text-label-caps hover:bg-primary hover:text-background transition-none"
                            >
                                VIEW EVENT
                            </Link>
                            <Link
                                href="/creator"
                                className="border-2 border-primary/40 px-lg py-sm font-label-caps text-label-caps text-on-surface-variant hover:border-primary transition-none"
                            >
                                DASHBOARD
                            </Link>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    // ── Main Form ──
    return (
        <div className="bg-background text-on-background selection:bg-primary selection:text-background min-h-screen flex flex-col">
            <main className="flex-grow px-margin py-xl max-w-7xl mx-auto w-full">

                {/* Hero Section */}
                <div className="mb-xl">
                    <nav className="flex items-center gap-sm font-label-caps text-label-caps text-on-surface-variant mb-md">
                        <Link href="/creator" className="hover:text-primary transition-none">DASHBOARD</Link>
                        <span className="material-symbols-outlined text-[12px]">chevron_right</span>
                        <span className="text-primary">CREATE_EVENT</span>
                    </nav>
                    <h1 className="font-display-xl text-display-xl uppercase leading-[0.8] mb-md">
                        DEPLOY_NEW<br />_PROTOCOL
                    </h1>
                    <div className="flex items-center gap-sm flex-wrap">
                        <div className="bg-primary text-background px-md py-xs font-label-caps text-label-caps">STABLE_VERSION_2.5.0</div>
                        <div className="border-2 border-primary px-md py-xs font-label-caps text-label-caps">ON-CHAIN_VERIFIED</div>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-xl">
                        {/* ── Left Column: Primary Config ────────────────── */}
                        <div className="lg:col-span-7 space-y-xl">
                            <section className="space-y-lg">
                                {/* Creator Address */}
                                <div className="flex flex-col gap-sm">
                                    <label className="font-label-caps text-label-caps text-on-surface-variant">CREATOR_ADDRESS</label>
                                    <input
                                        className="w-full border-2 border-outline-variant bg-transparent p-md font-body-sm text-on-surface-variant cursor-not-allowed"
                                        readOnly
                                        type="text"
                                        value={walletAddress ?? 'LOADING...'}
                                    />
                                </div>

                                {/* Event Name */}
                                <div className="flex flex-col gap-sm">
                                    <label className="font-label-caps text-label-caps">EVENT_NAME</label>
                                    <input
                                        className="w-full border-2 border-primary bg-transparent p-md font-body-lg text-primary focus:border-primary focus:outline-none"
                                        placeholder="ENTER_RACE_IDENTIFIER"
                                        type="text"
                                        value={name}
                                        onChange={(e) => { setName(e.target.value); setError(null); }}
                                        disabled={submitting}
                                    />
                                </div>

                                {/* Race Specifications */}
                                <div className="flex flex-col gap-sm">
                                    <label className="font-label-caps text-label-caps">RACE_SPECIFICATIONS</label>
                                    <textarea
                                        className="w-full border-2 border-primary bg-transparent p-md font-body-sm text-primary focus:border-primary focus:outline-none resize-none"
                                        placeholder="DEFINE_OBJECTIVES_AND_REWARDS"
                                        rows={6}
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        disabled={submitting}
                                    />
                                </div>

                                {/* Date / Time / Duration */}
                                <div className="grid grid-cols-3 gap-gutter">
                                    <div className="flex flex-col gap-sm">
                                        <label className="font-label-caps text-label-caps">GENESIS_DATE</label>
                                        <input
                                            className="w-full border-2 border-primary bg-transparent p-md font-body-sm text-primary focus:outline-none"
                                            type="date"
                                            min={new Date().toISOString().split('T')[0]}
                                            value={startDate}
                                            onChange={(e) => { setStartDate(e.target.value); setError(null); }}
                                            disabled={submitting}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-sm">
                                        <label className="font-label-caps text-label-caps">START_TIME_UTC</label>
                                        <input
                                            className="w-full border-2 border-primary bg-transparent p-md font-body-sm text-primary focus:outline-none"
                                            type="time"
                                            value={startTime}
                                            onChange={(e) => { setStartTime(e.target.value); setError(null); }}
                                            disabled={submitting}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-sm">
                                        <label className="font-label-caps text-label-caps">EVENT_DURATION</label>
                                        <input
                                            className="w-full border-2 border-primary bg-transparent p-md font-body-sm text-primary focus:outline-none"
                                            type="number"
                                            step="0.5"
                                            min="0.5"
                                            placeholder="2"
                                            value={durationHours}
                                            onChange={(e) => { setDurationHours(e.target.value); setError(null); }}
                                            disabled={submitting}
                                        />
                                    </div>
                                </div>

                                {/* Fee & Max Participants */}
                                <div className="grid grid-cols-2 gap-gutter">
                                    <div className="flex flex-col gap-sm">
                                        <label className="font-label-caps text-label-caps">PROTOCOL_FEE_USDC</label>
                                        <div className="relative">
                                            <input
                                                className="w-full border-2 border-primary bg-transparent p-md font-data-lg text-primary focus:outline-none"
                                                placeholder="0.00"
                                                step="0.01"
                                                min="0.01"
                                                type="number"
                                                value={feeUsdc}
                                                onChange={(e) => { setFeeUsdc(e.target.value); setError(null); }}
                                                disabled={submitting}
                                            />
                                            <span className="absolute right-md top-1/2 -translate-y-1/2 font-label-caps text-label-caps opacity-50">USDC</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-sm">
                                        <label className="font-label-caps text-label-caps">MAX_PARTICIPANTS</label>
                                        <input
                                            className="w-full border-2 border-primary bg-transparent p-md font-data-lg text-primary focus:outline-none"
                                            type="number"
                                            min="2"
                                            placeholder="100"
                                            value={maxParticipants}
                                            onChange={(e) => { setMaxParticipants(e.target.value); setError(null); }}
                                            disabled={submitting}
                                        />
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* ── Right Column: Geospatial Config ───────────── */}
                        <div className="lg:col-span-5 space-y-xl">
                            <section className="border-2 border-primary p-lg space-y-lg">
                                <h3 className="font-headline-md text-headline-md border-b-2 border-primary pb-sm uppercase">
                                    GEOSPATIAL_CONFIG
                                </h3>
                                <AdminMapBuilder
                                    onRouteChange={(checkpoints, route, distance) => {
                                        setCheckpointsConfig(checkpoints);
                                        setRouteCoordinates(route);
                                        setRouteDistanceMeters(distance);
                                    }}
                                    disabled={submitting}
                                />
                            </section>
                        </div>
                    </div>

                    {/* ── Error display ─────────────────────────────────── */}
                    {error && (
                        <div className="mt-lg border-2 border-error p-md flex items-center gap-sm">
                            <AlertCircle className="h-4 w-4 text-error flex-shrink-0" />
                            <p className="font-label-caps text-label-caps text-error">{error}</p>
                        </div>
                    )}

                    {/* ── Primary Action ────────────────────────────────── */}
                    <div className="mt-xl">
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full bg-background border-2 border-primary py-xl font-display-xl text-headline-lg hover:bg-primary hover:text-background transition-none active:translate-y-2 group flex items-center justify-between px-xl disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span>{submitting ? 'DEPLOYING...' : 'INITIALIZE EVENT'}</span>
                            {submitting ? (
                                <Loader2 className="h-12 w-12 animate-spin" />
                            ) : (
                                <span className="material-symbols-outlined text-[64px]">terminal</span>
                            )}
                        </button>
                        <p className="font-label-caps text-label-caps text-center mt-md text-on-surface-variant">
                            WARNING: THIS ACTION IS IRREVERSIBLE AND WILL CONSUME SOL GAS
                        </p>
                    </div>
                </form>
            </main>

            {/* ── Footer ───────────────────────────────────────────── */}
            <footer className="bg-background border-t-2 border-primary flex flex-col md:flex-row justify-between items-center w-full px-margin py-lg gap-gutter mt-xl">
                <div className="font-headline-md text-headline-md text-primary">SOLARUN</div>
                <div className="font-body-sm text-body-sm text-on-surface-variant text-center md:text-left">
                    © 2026 SOLARUN PROTOCOL // ALL PERFORMANCE DATA ON-CHAIN
                </div>
                <div className="flex gap-lg">
                    <a className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none" href="#">DOCS</a>
                    <a className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none" href="https://github.com/Ibanana/solarun" target="_blank" rel="noreferrer">GITHUB</a>
                    <a className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none" href="#">AUDIT</a>
                    <a className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none" href="#">PRIVACY</a>
                </div>
            </footer>

            {/* ── Alert Dialog ──────────────────────────────────────── */}
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
                        <AlertDialogDescription className="text-on-surface-variant uppercase text-[12px] tracking-wider leading-relaxed whitespace-pre-line">
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
        </div>
    );
}
