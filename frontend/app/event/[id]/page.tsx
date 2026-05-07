'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, Trophy, Clock, Wallet, Loader2, PlayCircle, CheckCircle2, Copy, Check } from 'lucide-react';
import { useEvent } from '@/hooks/useEvent';
import { useRunners } from '@/hooks/useRunners';
import { useAuth } from '@/hooks/useAuth';
import { useProgram } from '@/hooks/useProgram';
import { supabase } from '@/lib/supabase';
import { PublicKey } from '@solana/web3.js';
import { StatusBadge } from '@/components/StatusBadge';
import { LeaderboardTable } from '@/components/LeaderboardTable';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { data: event, isLoading: eventLoading, error: eventError, refetch: refetchEvent } = useEvent(id);
    const { data: runners, isLoading: runnersLoading } = useRunners(id);
    const { walletAddress } = useAuth();
    const program = useProgram();

    const [isStarting, setIsStarting] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const isCreator = walletAddress === event?.creator_wallet;

    const handleStartRace = async () => {
        if (!program || !event) return;
        if (!confirm('Apakah Anda yakin ingin memulai perlombaan ini? Sensor RFID akan mulai menerima tap.')) return;
        
        setIsStarting(true);
        try {
            const cleanEventId = event.id.replace(/-/g, '');
            
            // Derive Event PDA correctly
            const [eventPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('event'), Buffer.from(cleanEventId)],
                program.programId
            );

            const txSignature = await program.methods
                .startRace(cleanEventId)
                .accounts({
                    admin: program.provider.publicKey,
                    event: eventPda,
                } as any)
                .rpc();
                
            console.log("Race started on-chain:", txSignature);
            
            // Update Supabase to match on-chain state
            await supabase.from('race_events').update({ 
                status: 'active'
            }).eq('id', event.id);
            
            alert(`✅ Race berhasil dimulai!\n\nTX: ${txSignature}`);
            refetchEvent();
        } catch (error: any) {
            console.error("Failed to start race:", error);
            let msg = error.message || String(error);
            
            // --- Fallback check for RPC Timeout ---
            if (msg.includes('was not confirmed in 30.00 seconds')) {
                try {
                    console.log("Checking on-chain status after timeout...");
                    const cleanEventId = event.id.replace(/-/g, '');
                    const [eventPda] = PublicKey.findProgramAddressSync(
                        [Buffer.from('event'), Buffer.from(cleanEventId)],
                        program.programId
                    );
                    const onChainData = await program.account.event.fetch(eventPda);
                    
                    if (onChainData.status.active || onChainData.status.completed || onChainData.status.settled) {
                        console.log("Transaction actually succeeded on-chain!");
                        await supabase.from('race_events').update({ status: 'active' }).eq('id', event.id);
                        alert(`✅ Race berhasil dimulai (Berhasil di-recover dari timeout jaringan)!\n\nMohon tunggu sesaat, tampilan akan di-refresh.`);
                        refetchEvent();
                        return;
                    }
                } catch (fallbackErr) {
                    console.error("Fallback check failed:", fallbackErr);
                }
            }

            if (msg.includes('Custom: 2006')) {
                msg = "Data event tidak kompatibel (Error 2006). Kemungkinan event ini dibuat dengan versi contract lama. Silakan buat event baru.";
            }
            alert(`❌ Gagal memulai race: ${msg}`);
        } finally {
            setIsStarting(false);
        }
    };

    const handleFinalize = async () => {
        if (!program || !event) return;
        if (!confirm('Apakah Anda yakin ingin memfinalisasi event? Ini akan memicu pembagian hadiah otomatis.')) return;
        
        setIsFinalizing(true);
        try {
            const cleanEventId = event.id.replace(/-/g, '');
            
            // Derive Event PDA correctly
            const [eventPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('event'), Buffer.from(cleanEventId)],
                program.programId
            );

            // 1. Finalize on-chain
            const txSignature = await program.methods
                .completeRace(cleanEventId)
                .accounts({
                    admin: program.provider.publicKey,
                    event: eventPda,
                } as any)
                .rpc();
                
            console.log("Race completed on-chain:", txSignature);

            // 2. Update Supabase Event Status
            await supabase.from('race_events').update({ status: 'completed' }).eq('id', event.id);

            // 3. Mark non-finishers as disqualified (DNF)
            await supabase.from('runners')
                .update({ status: 'disqualified' })
                .eq('event_id', event.id)
                .neq('status', 'finished');

            alert(`✅ Event berhasil difinalisasi!\nPeserta yang belum finish telah dinyatakan DNF.\nSistem akan mulai membagikan hadiah.\n\nTX: ${txSignature}`);
            refetchEvent();
        } catch (error: any) {
            console.error("Failed to finalize race:", error);
            let msg = error.message || String(error);

            // --- Fallback check for RPC Timeout ---
            if (msg.includes('was not confirmed in 30.00 seconds')) {
                try {
                    console.log("Checking on-chain status after timeout...");
                    const cleanEventId = event.id.replace(/-/g, '');
                    const [eventPda] = PublicKey.findProgramAddressSync(
                        [Buffer.from('event'), Buffer.from(cleanEventId)],
                        program.programId
                    );
                    const onChainData = await program.account.event.fetch(eventPda);
                    
                    if (onChainData.status.completed || onChainData.status.settled) {
                        console.log("Transaction actually succeeded on-chain!");
                        await supabase.from('race_events').update({ status: 'completed' }).eq('id', event.id);
                        
                        await supabase.from('runners')
                            .update({ status: 'disqualified' })
                            .eq('event_id', event.id)
                            .neq('status', 'finished');

                        alert(`✅ Event berhasil difinalisasi (Berhasil di-recover dari timeout jaringan)!\nSistem akan mulai membagikan hadiah.`);
                        refetchEvent();
                        return;
                    }
                } catch (fallbackErr) {
                    console.error("Fallback check failed:", fallbackErr);
                }
            }

            if (msg.includes('Custom: 2006')) {
                msg = "Data event tidak kompatibel (Error 2006). Kemungkinan event ini dibuat dengan versi contract lama. Silakan buat event baru.";
            }
            alert(`❌ Gagal finalisasi race: ${msg}`);
        } finally {
            setIsFinalizing(false);
        }
    };

    const totalRunners = runners?.length ?? 0;
    const finishedCount = runners?.filter((r) => r.status === 'finished').length ?? 0;
    const runningCount = runners?.filter((r) => r.status === 'running').length ?? 0;
    const poolSize = totalRunners * (event?.registration_fee_sol ?? 0);

    if (eventLoading) {
        return (
            <div className="container py-16 text-center text-muted-foreground">
                Memuat data event...
            </div>
        );
    }

    if (eventError || !event) {
        return (
            <div className="container py-16 text-center space-y-4">
                <p className="text-destructive font-medium">Event tidak ditemukan.</p>
                <Button variant="outline" asChild>
                    <Link href="/">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Home
                    </Link>
                </Button>
            </div>
        );
    }

    const isEventOpen = event.status === 'active' || event.status === 'pending';

    return (
        <div className="container py-8 space-y-8">
            {/* Back */}
            <Button variant="ghost" size="sm" asChild>
                <Link href="/">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Semua Event
                </Link>
            </Button>

            {/* Header */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={event.status} />
                    {runningCount > 0 && (
                        <span className="text-sm text-muted-foreground">
                            {runningCount} peserta sedang berlari
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold tracking-tight">{event.name}</h1>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-xs flex items-center gap-1"
                        onClick={() => {
                            navigator.clipboard.writeText(event.id);
                            setIsCopied(true);
                            setTimeout(() => setIsCopied(false), 2000);
                        }}
                    >
                        {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {isCopied ? "Tersalin!" : "Copy Event ID"}
                    </Button>
                </div>
                {event.tx_signature && (
                    <a
                        href={`https://explorer.solana.com/tx/${event.tx_signature}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-2.5 py-1 rounded-md w-fit transition-colors"
                    >
                        🔗 Verifikasi Event di Blockscan
                    </a>
                )}
                {event.description && (
                    <p className="text-muted-foreground max-w-xl">{event.description}</p>
                )}
                {isEventOpen && (
                    <Button asChild>
                        <Link href={`/register?event=${event.id}`}>Daftar Event Ini</Link>
                    </Button>
                )}
                
                {/* Creator Actions */}
                {isCreator && (
                    <div className="flex gap-2 mt-4 p-4 bg-secondary/30 rounded-lg border border-border">
                        {event.status === 'pending' && (
                            <Button onClick={handleStartRace} disabled={isStarting} className="bg-green-600 hover:bg-green-700 text-white">
                                {isStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                                Start Race
                            </Button>
                        )}
                        {event.status === 'active' && (
                            <Button onClick={handleFinalize} disabled={isFinalizing} className="bg-blue-600 hover:bg-blue-700 text-white">
                                {isFinalizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                                Finalize & Distribute Prizes
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                            <Users className="h-3 w-3" /> Peserta
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">
                            {totalRunners}
                            <span className="text-sm font-normal text-muted-foreground">/{event.max_participants}</span>
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                            <Wallet className="h-3 w-3" /> Prize Pool
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{poolSize.toFixed(2)} SOL</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                            <Trophy className="h-3 w-3" /> Finish
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{finishedCount}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Mulai
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm font-medium leading-tight">{formatDate(event.start_time)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Selesai
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm font-medium leading-tight text-destructive">
                            {formatDate(event.end_time)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Separator />

            {/* Leaderboard */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">🏆 Leaderboard</h2>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        Live Realtime
                    </span>
                </div>
                <LeaderboardTable runners={runners ?? []} isLoading={runnersLoading} />
            </div>
        </div>
    );
}
