'use client';

import Link from 'next/link';
import { Plus, Users, Trophy, Eye, ArrowLeft, Loader2 } from 'lucide-react';
import { useEvents } from '@/hooks/useEvent';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
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

function EventRow({ event }: { event: RaceEvent }) {
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
                </div>
            </TableCell>
        </TableRow>
    );
}

export default function CreatorDashboard() {
    const { data: events, isLoading, error } = useEvents();

    const totalEvents = events?.length ?? 0;
    const activeEvents = events?.filter((e) => e.status === 'active').length ?? 0;
    const completedEvents = events?.filter((e) => e.status === 'completed' || e.status === 'settled').length ?? 0;

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
                                    <EventRow key={event.id} event={event} />
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>
        </div>
    );
}
