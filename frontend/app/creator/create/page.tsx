'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, Loader2, CalendarDays, LogIn, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';

export default function CreateEventPage() {
    const { ready, authenticated, login, isCreator, walletAddress, loading: authLoading } = useAuth();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [feeSol, setFeeSol] = useState('0.1');
    const [maxParticipants, setMaxParticipants] = useState('100');
    const [startDate, setStartDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [durationHours, setDurationHours] = useState('2');

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createdEvent, setCreatedEvent] = useState<{ id: string; name: string; tx_signature?: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (!name.trim()) { setError('Nama event harus diisi.'); return; }
        if (!startDate || !startTime) { setError('Tanggal dan jam mulai harus diisi.'); return; }
        if (!walletAddress) { setError('Wallet belum tersedia. Coba login ulang.'); return; }

        const fee = parseFloat(feeSol);
        if (isNaN(fee) || fee <= 0) { setError('Biaya registrasi harus lebih dari 0.'); return; }

        const max = parseInt(maxParticipants);
        if (isNaN(max) || max < 2) { setError('Jumlah peserta minimal 2.'); return; }

        const duration = parseFloat(durationHours);
        if (isNaN(duration) || duration <= 0) { setError('Durasi harus lebih dari 0 jam.'); return; }

        // Build timestamps
        const startDateTime = new Date(`${startDate}T${startTime}`);
        if (isNaN(startDateTime.getTime())) { setError('Format tanggal/jam tidak valid.'); return; }

        const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 60 * 1000);
        
        // Mock transaction signature for Phase 2.3
        const mockTxSignature = `3${Array.from({length: 87}, () => "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Math.floor(Math.random() * 58)]).join('')}`;

        setSubmitting(true);
        try {
            const { data, error: insertError } = await supabase
                .from('race_events')
                .insert({
                    name: name.trim(),
                    description: description.trim() || null,
                    registration_fee_sol: fee,
                    max_participants: max,
                    status: 'pending',
                    start_time: startDateTime.toISOString(),
                    end_time: endDateTime.toISOString(),
                    creator_wallet: walletAddress,
                    tx_signature: mockTxSignature,
                })
                .select('id, name, tx_signature')
                .single();

            if (insertError) {
                setError(`Gagal membuat event: ${insertError.message}`);
                return;
            }

            setCreatedEvent(data);
        } catch {
            setError('Terjadi kesalahan. Coba lagi.');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Loading auth state ──
    if (!ready || authLoading) {
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
                        <CardTitle>Login Diperlukan</CardTitle>
                        <CardDescription>
                            Kamu perlu login terlebih dahulu untuk membuat event marathon.
                        </CardDescription>
                        <Button onClick={login} className="w-full">
                            <LogIn className="mr-2 h-4 w-4" /> Login dengan Google / Email
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ── Not a creator ──
    if (!isCreator) {
        return (
            <div className="container max-w-md py-12">
                <Card>
                    <CardContent className="pt-6 text-center space-y-4">
                        <ShieldAlert className="h-12 w-12 mx-auto opacity-40 text-orange-500" />
                        <CardTitle>Akses Ditolak</CardTitle>
                        <CardDescription>
                            Hanya pengguna dengan role <strong>Creator</strong> yang bisa membuat event.
                            Akun kamu saat ini terdaftar sebagai <strong>Runner</strong>.
                        </CardDescription>
                        <p className="text-xs text-muted-foreground">
                            Hubungi admin untuk mengubah role kamu menjadi Creator.
                        </p>
                        <Button variant="outline" asChild>
                            <Link href="/">Kembali ke Home</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ── Success state ──
    if (createdEvent) {
        return (
            <div className="container max-w-lg py-12">
                <Card>
                    <CardContent className="pt-6 text-center space-y-4">
                        <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
                        <CardTitle>Event Berhasil Dibuat! 🎉</CardTitle>
                        <CardDescription>
                            <strong>{createdEvent.name}</strong> sudah tersedia. Peserta sekarang bisa mendaftar.
                        </CardDescription>
                        <p className="text-xs text-muted-foreground font-mono break-all">
                            Event ID: {createdEvent.id}
                        </p>
                        {createdEvent.tx_signature && (
                            <div className="mt-4 p-4 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-left space-y-2">
                                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-medium">
                                    <ShieldAlert className="h-4 w-4" />
                                    <span>Transparansi On-Chain</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Event telah tercatat di blockchain Solana. Kamu dapat memverifikasinya melalui link Blockscan di bawah ini.
                                </p>
                                <a 
                                    href={`https://explorer.solana.com/tx/${createdEvent.tx_signature}?cluster=devnet`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-block mt-1 text-xs text-blue-600 dark:text-blue-400 font-mono hover:underline truncate w-full"
                                >
                                    ↗ Verifikasi di Solana Explorer
                                </a>
                            </div>
                        )}
                        <div className="flex gap-2 justify-center pt-2">
                            <Button asChild>
                                <Link href={`/event/${createdEvent.id}`}>Lihat Event</Link>
                            </Button>
                            <Button variant="outline" asChild>
                                <Link href="/creator">Dashboard Creator</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ── Form ──
    return (
        <div className="container max-w-lg py-8 space-y-6">
            <Button variant="ghost" size="sm" asChild>
                <Link href="/creator">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
                </Link>
            </Button>

            <Card>
                <CardHeader>
                    <CardTitle>Buat Event Marathon Baru</CardTitle>
                    <CardDescription>
                        Isi detail event. Setelah dibuat, peserta bisa langsung mendaftar.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Event Name */}
                        <div className="space-y-2">
                            <Label htmlFor="name">Nama Event *</Label>
                            <Input
                                id="name"
                                placeholder="Contoh: SolaRun Marathon Jakarta 2026"
                                value={name}
                                onChange={(e) => { setName(e.target.value); setError(null); }}
                                disabled={submitting}
                            />
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <Label htmlFor="description">Deskripsi</Label>
                            <Textarea
                                id="description"
                                placeholder="Deskripsi event (opsional)"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                disabled={submitting}
                                rows={3}
                            />
                        </div>

                        {/* Fee + Max participants */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="fee">Biaya Registrasi (SOL)</Label>
                                <Input
                                    id="fee"
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    placeholder="0.1"
                                    value={feeSol}
                                    onChange={(e) => { setFeeSol(e.target.value); setError(null); }}
                                    disabled={submitting}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="max">Maks Peserta</Label>
                                <Input
                                    id="max"
                                    type="number"
                                    min="2"
                                    placeholder="100"
                                    value={maxParticipants}
                                    onChange={(e) => { setMaxParticipants(e.target.value); setError(null); }}
                                    disabled={submitting}
                                />
                            </div>
                        </div>

                        {/* Start date & time */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="start_date">Tanggal Mulai *</Label>
                                <Input
                                    id="start_date"
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => { setStartDate(e.target.value); setError(null); }}
                                    disabled={submitting}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="start_time">Jam Mulai *</Label>
                                <Input
                                    id="start_time"
                                    type="time"
                                    value={startTime}
                                    onChange={(e) => { setStartTime(e.target.value); setError(null); }}
                                    disabled={submitting}
                                />
                            </div>
                        </div>

                        {/* Duration */}
                        <div className="space-y-2">
                            <Label htmlFor="duration">Durasi Event (jam)</Label>
                            <Input
                                id="duration"
                                type="number"
                                step="0.5"
                                min="0.5"
                                placeholder="2"
                                value={durationHours}
                                onChange={(e) => { setDurationHours(e.target.value); setError(null); }}
                                disabled={submitting}
                            />
                            <p className="text-xs text-muted-foreground">
                                Event akan otomatis berakhir setelah durasi ini. Refund scheduler akan memproses hasil setelah event selesai.
                            </p>
                        </div>

                        {/* Creator wallet (read-only) */}
                        <div className="space-y-2">
                            <Label>Creator Wallet</Label>
                            <Input
                                disabled
                                value={walletAddress ?? 'Memuat wallet...'}
                                className="text-muted-foreground text-xs font-mono"
                            />
                            <p className="text-xs text-muted-foreground">
                                Event ini akan ditautkan ke wallet creator kamu.
                            </p>
                        </div>

                        {error && (
                            <p className="text-sm text-destructive">{error}</p>
                        )}

                        <Button type="submit" className="w-full" disabled={submitting}>
                            {submitting ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Membuat Event...</>
                            ) : (
                                <><CalendarDays className="mr-2 h-4 w-4" /> Buat Event</>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
