'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useEvents } from '@/hooks/useEvent';
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

function generateDemoWallet(): string {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let addr = '';
    for (let i = 0; i < 44; i++) addr += chars[Math.floor(Math.random() * chars.length)];
    return addr;
}

export default function RegisterPage() {
    const { data: events, isLoading: eventsLoading } = useEvents();

    const [fullName, setFullName] = useState('');
    const [chipUid, setChipUid] = useState('');
    const [eventId, setEventId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ eventId: string } | null>(null);
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

        setSubmitting(true);
        try {
            const { error: insertError } = await supabase.from('runners').insert({
                full_name: fullName.trim(),
                chip_uid: chipUid,
                event_id: eventId,
                wallet_address: generateDemoWallet(),
                status: 'registered',
                finish_position: null,
            });
            if (insertError) {
                setError(insertError.code === '23505'
                    ? 'Chip UID ini sudah digunakan. Pilih chip lain.'
                    : `Gagal mendaftar: ${insertError.message}`
                );
                return;
            }
            setSuccess({ eventId });
        } catch {
            setError('Terjadi kesalahan. Coba lagi.');
        } finally {
            setSubmitting(false);
        }
    };

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
                                                {event.name} ({event.registration_fee_sol} SOL)
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

                        {/* Wallet note */}
                        <div className="space-y-2">
                            <Label>Wallet Address (V1 Demo)</Label>
                            <Input disabled value="Akan digenerate otomatis (Devnet Demo)" className="text-muted-foreground text-xs" />
                            <p className="text-xs text-muted-foreground">
                                Di V2, kamu akan menghubungkan wallet Solana asli.
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
