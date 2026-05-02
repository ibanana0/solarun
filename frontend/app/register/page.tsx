'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, Loader2, LogIn } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useEvents } from '@/hooks/useEvent';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';

const DEMO_CHIP_UIDS = [
    'CHIP_A1B2C3', 'CHIP_D4E5F6', 'CHIP_G7H8I9', 'CHIP_J0K1L2',
    'CHIP_M3N4O5', 'CHIP_P6Q7R8', 'CHIP_S9T0U1', 'CHIP_V2W3X4',
];

import { useProgram } from '@/hooks/useProgram';
import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { v4 as uuidv4 } from 'uuid';

export default function RegisterPage() {
    const { ready, authenticated, walletAddress, login } = useAuth();
    const { data: events, isLoading: eventsLoading } = useEvents();
    const program = useProgram();

    const [fullName, setFullName] = useState('');
    const [chipUid, setChipUid] = useState('');
    const [eventId, setEventId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ eventId: string; txSignature?: string } | null>(null);
    const [usedChips, setUsedChips] = useState<string[]>([]);

    useEffect(() => {
        if (!eventId) return;
        supabase
            .from('runners')
            .select('chip_uid')
            .eq('event_id', eventId)
            .then(({ data }) => setUsedChips(data?.map((r) => r.chip_uid) ?? []));
    }, [eventId]);

    const availableChips = DEMO_CHIP_UIDS.filter((uid) => !usedChips.includes(uid));
    const activeEvents = events?.filter((e) => e.status === 'active' || e.status === 'pending') ?? [];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!fullName.trim()) { setError('Nama lengkap harus diisi.'); return; }
        if (!chipUid) { setError('Pilih Chip UID.'); return; }
        if (!eventId) { setError('Pilih event terlebih dahulu.'); return; }
        if (!walletAddress || !program) { setError('Wallet/Program belum tersedia. Coba login ulang.'); return; }

        const runnerUuid = uuidv4();
        const selectedEvent = activeEvents.find(e => e.id === eventId);
        if (!selectedEvent) { setError('Event tidak ditemukan.'); return; }

        setSubmitting(true);
        try {
            // 1. Prepare On-Chain Instruction
            const programId = program.programId;
            const runner = new PublicKey(walletAddress);

            // Derive PDAs
            const [participantPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('participant'), Buffer.from(eventId), Buffer.from(runnerUuid)],
                programId
            );
            const [eventPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('event'), Buffer.from(eventId)],
                programId
            );
            const [vaultPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('vault'), Buffer.from(eventId)],
                programId
            );
            const [mockUsdcMint] = PublicKey.findProgramAddressSync(
                [Buffer.from('mock_usdc_mint')],
                programId
            );

            // Derive User ATA
            const userAta = await getAssociatedTokenAddress(mockUsdcMint, runner);

            // 2. Execute On-Chain Transaction
            const txSignature = await program.methods
                .registerParticipant(
                    eventId,
                    chipUid,
                    runner,
                    fullName.trim(),
                    runnerUuid
                )
                .accounts({
                    runner,
                    participant: participantPda,
                    event: eventPda,
                    vault: vaultPda,
                    runnerTokenAccount: userAta, // Corrected key name from IDL
                    systemProgram: anchor.web3.SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                } as any)
                .rpc();

            console.log("On-chain registration successful:", txSignature);

            // 3. Sync to Off-Chain (Supabase)
            const { error: insertError } = await supabase.from('runners').insert({
                id: runnerUuid,
                full_name: fullName.trim(),
                chip_uid: chipUid,
                event_id: eventId,
                wallet_address: walletAddress,
                status: 'registered',
                finish_position: null,
                tx_signature: txSignature,
            });

            if (insertError) {
                setError(insertError.code === '23505'
                    ? 'Chip UID ini sudah digunakan. Pilih chip lain.'
                    : `Berhasil di blockchain, tapi gagal simpan ke DB: ${insertError.message}`
                );
                return;
            }
            setSuccess({ eventId, txSignature: txSignature });
        } catch (err: any) {
            console.error("Failed to register:", err);
            setError(`Terjadi kesalahan: ${err.message || 'Coba lagi.'}`);
        } finally {
            setSubmitting(false);
        }
    };

    // ── Not ready ──
    if (!ready) {
        return (
            <div className="container max-w-md py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            </div>
        );
    }

    // ── Not logged in ──
    if (!authenticated) {
        return (
            <div className="container max-w-md py-12">
                <Card>
                    <CardContent className="pt-6 text-center space-y-4">
                        <LogIn className="h-12 w-12 mx-auto opacity-40" />
                        <CardTitle>Login untuk Mendaftar</CardTitle>
                        <CardDescription>
                            Kamu perlu login terlebih dahulu sebelum bisa mendaftar event marathon.
                        </CardDescription>
                        <Button onClick={login} className="w-full">
                            <LogIn className="mr-2 h-4 w-4" /> Login dengan Google / Email
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ── Success ──
    if (success) {
        return (
            <div className="container max-w-md py-12">
                <Card>
                    <CardContent className="pt-6 text-center space-y-4">
                        <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
                        <CardTitle>Pendaftaran Berhasil! 🎉</CardTitle>
                        <CardDescription>
                            Ambil chip RFID kamu di lokasi race dan mulai berlari!
                        </CardDescription>
                        {success.txSignature && (
                            <div className="mt-4 p-4 bg-green-50/50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg text-sm text-left space-y-2">
                                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium">
                                    <CheckCircle className="h-4 w-4" />
                                    <span>Pendaftaran Tersimpan On-Chain</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Biaya pendaftaran (USDC/SOL) telah berhasil ditransfer ke vault smart contract.
                                </p>
                                <a 
                                    href={`https://explorer.solana.com/tx/${success.txSignature}?cluster=devnet`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-block mt-1 text-xs text-green-600 dark:text-green-400 font-mono hover:underline truncate w-full"
                                >
                                    ↗ Verifikasi di Solana Explorer
                                </a>
                            </div>
                        )}
                        <div className="flex gap-2 justify-center pt-2">
                            <Button asChild>
                                <Link href={`/event/${success.eventId}`}>Lihat Leaderboard</Link>
                            </Button>
                            <Button variant="outline" asChild>
                                <Link href="/">Kembali ke Home</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ── Form ──
    return (
        <div className="container max-w-md py-8 space-y-6">
            <Button variant="ghost" size="sm" asChild>
                <Link href="/">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
                </Link>
            </Button>

            <Card>
                <CardHeader>
                    <CardTitle>Daftar Event Marathon</CardTitle>
                    <CardDescription>
                        Isi form di bawah untuk mendaftarkan diri. Chip RFID diberikan saat check-in di lokasi.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Full Name */}
                        <div className="space-y-2">
                            <Label htmlFor="full_name">Nama Lengkap</Label>
                            <Input
                                id="full_name"
                                placeholder="Contoh: Budi Santoso"
                                value={fullName}
                                onChange={(e) => { setFullName(e.target.value); setError(null); }}
                                disabled={submitting}
                                autoComplete="name"
                            />
                        </div>

                        {/* Event Selection */}
                        <div className="space-y-2">
                            <Label htmlFor="event_id">Pilih Event</Label>
                            {eventsLoading ? (
                                <p className="text-sm text-muted-foreground">Memuat events...</p>
                            ) : activeEvents.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Tidak ada event aktif saat ini.</p>
                            ) : (
                                <Select value={eventId} onValueChange={(v) => { setEventId(v); setChipUid(''); setError(null); }}>
                                    <SelectTrigger id="event_id">
                                        <SelectValue placeholder="Pilih event..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {activeEvents.map((event) => (
                                            <SelectItem key={event.id} value={event.id}>
                                                {event.name} ({event.registration_fee_sol} USDC)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        {/* Chip UID */}
                        <div className="space-y-2">
                            <Label htmlFor="chip_uid">Chip RFID UID</Label>
                            <Select
                                value={chipUid}
                                onValueChange={(v) => { setChipUid(v); setError(null); }}
                                disabled={!eventId}
                            >
                                <SelectTrigger id="chip_uid">
                                    <SelectValue placeholder={!eventId ? 'Pilih event dulu' : 'Pilih Chip UID...'} />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableChips.map((uid) => (
                                        <SelectItem key={uid} value={uid}>{uid}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Chip ini digunakan untuk identifikasi di setiap checkpoint.
                                {eventId && ` (${availableChips.length} tersedia)`}
                            </p>
                        </div>

                        {/* Wallet address (from Privy) */}
                        <div className="space-y-2">
                            <Label>Wallet Address (Privy)</Label>
                            <Input
                                disabled
                                value={walletAddress ?? 'Memuat wallet...'}
                                className="text-muted-foreground text-xs font-mono"
                            />
                            <p className="text-xs text-muted-foreground">
                                Wallet ini otomatis dibuat oleh Privy saat kamu login. Hadiah akan dikirim ke alamat ini.
                            </p>
                        </div>

                        {error && (
                            <p className="text-sm text-destructive">{error}</p>
                        )}

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={submitting || eventsLoading || activeEvents.length === 0}
                        >
                            {submitting ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mendaftarkan...</>
                            ) : 'Daftar Sekarang'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
