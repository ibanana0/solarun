'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle, Loader2, LogIn, Copy, Check, Ticket } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useEvents, useEvent } from '@/hooks/useEvent';
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
import { Separator } from '@/components/ui/separator';

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
    const searchParams = useSearchParams();
    const eventIdFromUrl = searchParams.get('event');
    
    const { ready, authenticated, walletAddress, login } = useAuth();
    const { data: events, isLoading: eventsLoading } = useEvents();
    const { data: eventDetails, isLoading: eventDetailsLoading } = useEvent(eventIdFromUrl || '');
    const program = useProgram();

    const [fullName, setFullName] = useState('');
    const [chipUid, setChipUid] = useState('');
    const [eventId, setEventId] = useState(eventIdFromUrl || '');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ eventId: string; txSignature?: string } | null>(null);
    const [usedChips, setUsedChips] = useState<string[]>([]);
    const [copied, setCopied] = useState(false);

    // Sync eventId with URL param if it changes
    useEffect(() => {
        if (eventIdFromUrl) {
            setEventId(eventIdFromUrl);
        }
    }, [eventIdFromUrl]);

    useEffect(() => {
        if (!eventId) return;
        supabase
            .from('runners')
            .select('chip_uid')
            .eq('event_id', eventId)
            .then(({ data }) => setUsedChips(data?.map((r) => r.chip_uid) ?? []));
    }, [eventId]);

    const handleCopyAddress = () => {
        if (walletAddress) {
            navigator.clipboard.writeText(walletAddress);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

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
        const runnerId = runnerUuid.replace(/-/g, '');
        const blockchainEventId = eventId.replace(/-/g, '');

        setSubmitting(true);
        try {
            // 1. Prepare On-Chain Instruction
            const programId = program.programId;
            const runner = program.provider.publicKey;

            // --- Derive PDAs ---
            const [eventPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('event'), Buffer.from(blockchainEventId)],
                program.programId
            );
            const [participantPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('participant'), eventPda.toBuffer(), Buffer.from(chipUid)],
                programId
            );

            // ============================================================
            // LOGIKA PEMERIKSAAN ON-CHAIN
            // ============================================================
            const existingAccount = await program.provider.connection.getAccountInfo(participantPda);
            
            if (existingAccount !== null) {
                // Jika accountInfo tidak null, berarti PDA ini sudah ada (sudah di-init)
                setError('Chip ini sudah terdaftar untuk event ini di blockchain.');
                setSubmitting(false);
                return;
            }
            // ============================================================

            const [vaultPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('vault'), eventPda.toBuffer()],
                program.programId
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
                    blockchainEventId,
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
                    runnerTokenAccount: userAta,
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
                <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
            </div>
        );
    }

    // ── Not logged in ──
    if (!authenticated) {
        return (
            <div className="container max-w-md py-12">
                <Card>
                    <CardContent className="pt-6 space-y-4 text-center">
                        <LogIn className="w-12 h-12 mx-auto opacity-40" />
                        <CardTitle>Login untuk Mendaftar</CardTitle>
                        <CardDescription>
                            Kamu perlu login terlebih dahulu sebelum bisa mendaftar event marathon.
                        </CardDescription>
                        <Button onClick={login} className="w-full">
                            <LogIn className="w-4 h-4 mr-2" /> Login dengan Google / Email
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
                    <CardContent className="pt-6 space-y-4 text-center">
                        <CheckCircle className="w-12 h-12 mx-auto text-green-500" />
                        <CardTitle>Pendaftaran Berhasil! 🎉</CardTitle>
                        <CardDescription>
                            Ambil chip RFID kamu di lokasi race dan mulai berlari!
                        </CardDescription>
                        {success.txSignature && (
                            <div className="p-4 mt-4 space-y-2 text-sm text-left border border-green-200 rounded-lg bg-green-50/50 dark:bg-green-950/20 dark:border-green-900">
                                <div className="flex items-center gap-2 font-medium text-green-600 dark:text-green-400">
                                    <CheckCircle className="w-4 h-4" />
                                    <span>Pendaftaran Tersimpan On-Chain</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Biaya pendaftaran (USDC/SOL) telah berhasil ditransfer ke vault smart contract.
                                </p>
                                <a
                                    href={`https://explorer.solana.com/tx/${success.txSignature}?cluster=devnet`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-block w-full mt-1 font-mono text-xs text-green-600 truncate dark:text-green-400 hover:underline"
                                >
                                    ↗ Verifikasi di Solana Explorer
                                </a>
                            </div>
                        )}
                        <div className="flex justify-center gap-2 pt-2">
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
                    <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
                </Link>
            </Button>

            <Card>
                <CardHeader className="pb-4">
                    <CardTitle>Daftar Event Marathon</CardTitle>
                    <CardDescription>
                        Isi form di bawah untuk mendaftarkan diri.
                    </CardDescription>
                    
                    <div className="pt-4 mt-4 border-t">
                        <button 
                            onClick={handleCopyAddress}
                            className="flex items-center justify-between w-full p-2 text-left transition-colors border border-transparent rounded-md bg-secondary/50 hover:bg-secondary group hover:border-border"
                            title="Salin alamat wallet"
                        >
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase text-muted-foreground font-bold leading-none mb-1">Your Wallet</span>
                                <span className="font-mono text-xs break-all text-muted-foreground group-hover:text-foreground">
                                    {walletAddress}
                                </span>
                            </div>
                            <div className="flex-shrink-0 ml-2">
                                {copied ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                ) : (
                                    <Copy className="w-4 h-4 transition-opacity opacity-50 text-muted-foreground group-hover:text-foreground group-hover:opacity-100" />
                                )}
                            </div>
                        </button>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Event Information */}
                        <div className="space-y-2">
                            <Label className="text-muted-foreground">Event Details</Label>
                            {eventIdFromUrl ? (
                                eventDetailsLoading ? (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Memuat detail event...</span>
                                    </div>
                                ) : eventDetails ? (
                                    <div className="p-4 space-y-3 border rounded-lg bg-primary/5 border-primary/10">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 mt-1 rounded-md bg-primary/10">
                                                <Ticket className="w-4 h-4 text-primary" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-semibold leading-tight">{eventDetails.name}</h3>
                                                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                                    {eventDetails.description || 'Tidak ada deskripsi.'}
                                                </p>
                                            </div>
                                        </div>
                                        <Separator className="bg-primary/10" />
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Biaya Registrasi</span>
                                            <span className="font-bold text-blue-600 dark:text-blue-400">
                                                {eventDetails.registration_fee_sol} USDC
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-destructive">Event tidak ditemukan.</p>
                                )
                            ) : (
                                <div className="space-y-2">
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
                            )}
                        </div>

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

                        {error && (
                            <p className="text-sm text-destructive">{error}</p>
                        )}

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={submitting || eventsLoading || (eventIdFromUrl ? !eventDetails : activeEvents.length === 0)}
                        >
                            {submitting ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Mendaftarkan...</>
                            ) : 'Daftar Sekarang'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
