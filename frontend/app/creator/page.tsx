'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus, Trophy, Eye, ArrowLeft, Loader2, LogIn, ShieldAlert, Trash } from 'lucide-react';
import { useCreatorEvents } from '@/hooks/useEvent';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { RaceEvent } from '@/lib/supabase';

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function EventRow({ event, onEventDeleted }: { event: RaceEvent; onEventDeleted?: () => void }) {
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDeleteEvent = async () => {
        if (!confirm('Are you sure you want to delete this event? This will refund all participants.')) {
            return;
        }

        setIsDeleting(true);

        try {
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
            const response = await fetch(`${backendUrl}/api/events/${event.id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            const data = await response.json();

            if (response.ok) {
                alert(`✅ Event deleted successfully!\n\nParticipants refunded: ${data.details?.participantsRefunded || 0}`);
                onEventDeleted?.();
            } else {
                alert(`❌ Failed to delete event: ${data.message}`);
            }
        } catch (error) {
            alert(`❌ Error deleting event: ${error}`);
            console.error('Delete event error:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <TableRow>
            <TableCell className="font-medium max-w-[200px] truncate">
                {event.name}
            </TableCell>
            <TableCell>
                <StatusBadge status={event.status} />
            </TableCell>
            <TableCell className="text-right">
                {event.registration_fee_sol} SOL
            </TableCell>
            <TableCell className="text-right">
                {event.max_participants}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
                {formatDate(event.start_time)}
            </TableCell>
            <TableCell className="text-right">
                <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href={`/event/${event.id}`}>
                            <Eye className="h-4 w-4" />
                        </Link>
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={handleDeleteEvent}
                        disabled={isDeleting}
                    >
                        {isDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Trash className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
}

export default function CreatorDashboard() {
    const { ready, authenticated, login, isCreator, walletAddress, loading: authLoading } = useAuth();
    const { data: events, isLoading, error, refetch } = useCreatorEvents(walletAddress);

    const totalEvents = events?.length ?? 0;
    const activeEvents = events?.filter((e) => e.status === 'active').length ?? 0;
    const completedEvents = events?.filter((e) => e.status === 'completed' || e.status === 'settled').length ?? 0;

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
                            Kamu perlu login terlebih dahulu untuk mengakses Creator Dashboard.
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
                            Halaman ini hanya bisa diakses oleh pengguna dengan role <strong>Creator</strong>.
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

    // ── Creator Dashboard ──
    return (
        <div className="container py-8 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="space-y-1">
                    <Button variant="ghost" size="sm" asChild className="mb-2">
                        <Link href="/">
                            <ArrowLeft className="mr-2 h-4 w-4" /> Home
                        </Link>
                    </Button>
                    <h1 className="text-2xl font-bold tracking-tight">Creator Dashboard</h1>
                    <p className="text-muted-foreground text-sm">
                        Kelola event marathon yang kamu buat
                    </p>
                </div>
                <Button asChild>
                    <Link href="/creator/create">
                        <Plus className="mr-2 h-4 w-4" /> Buat Event Baru
                    </Link>
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Total Event
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold">{totalEvents}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Aktif
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold">{activeEvents}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Selesai
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold">{completedEvents}</p>
                    </CardContent>
                </Card>
            </div>

            <Separator />

            {/* Events Table */}
            <div className="space-y-4">
                <h2 className="text-lg font-semibold">Daftar Event</h2>

                {isLoading && (
                    <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Memuat events...
                    </div>
                )}

                {error && (
                    <p className="text-center py-8 text-destructive">Gagal memuat events.</p>
                )}

                {!isLoading && !error && events && events.length === 0 && (
                    <Card>
                        <CardContent className="py-12 text-center space-y-3">
                            <Trophy className="h-10 w-10 mx-auto opacity-30" />
                            <p className="text-muted-foreground">Belum ada event. Buat event pertama kamu!</p>
                            <Button asChild>
                                <Link href="/creator/create">
                                    <Plus className="mr-2 h-4 w-4" /> Buat Event
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {!isLoading && events && events.length > 0 && (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nama Event</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Biaya</TableHead>
                                    <TableHead className="text-right">Maks</TableHead>
                                    <TableHead>Mulai</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {events.map((event) => (
                                    <EventRow
                                        key={event.id}
                                        event={event}
                                        onEventDeleted={() => refetch?.()}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>
        </div>
    );
}
