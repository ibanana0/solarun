import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { Trophy, Clock } from 'lucide-react';
import type { RunnerWithLogs } from '@/hooks/useRunners';

const CHECKPOINT_LABELS: Record<number, string> = {
    0: 'Start',
    1: 'Checkpoint 1',
    2: 'Finish',
};

interface LeaderboardTableProps {
    runners: RunnerWithLogs[];
    isLoading: boolean;
}

function formatTimeOnly(dateStr: string | null) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleTimeString('id-ID', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

export function LeaderboardTable({ runners, isLoading }: LeaderboardTableProps) {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
                <p>Memuat data leaderboard...</p>
            </div>
        );
    }

    if (runners.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <Trophy className="h-10 w-10 opacity-30" />
                <p>Belum ada peserta yang terdaftar.</p>
            </div>
        );
    }

    const sorted = [...runners].sort((a, b) => {
        // 1. Finished runners first, sorted by position
        if (a.finish_position !== null && b.finish_position !== null)
            return a.finish_position - b.finish_position;
        if (a.finish_position !== null) return -1;
        if (b.finish_position !== null) return 1;
        
        // 2. Then sort by checkpoint (higher is better)
        if (a.last_checkpoint_id !== b.last_checkpoint_id) {
            return b.last_checkpoint_id - a.last_checkpoint_id;
        }

        // 3. If at the same checkpoint, sort by time (earlier is better)
        if (a.last_checkpoint_time && b.last_checkpoint_time) {
            return new Date(a.last_checkpoint_time).getTime() - new Date(b.last_checkpoint_time).getTime();
        }

        // Fallbacks
        if (a.status === 'running' && b.status !== 'running') return -1;
        if (b.status === 'running' && a.status !== 'running') return 1;
        return 0;
    });

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-16">#</TableHead>
                        <TableHead>Nama Peserta</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Checkpoint</TableHead>
                        <TableHead>Waktu (Real)</TableHead>
                        <TableHead>Wallet</TableHead>
                        <TableHead className="text-right">On-Chain Tx</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sorted.map((runner, index) => {
                        const rank = runner.finish_position ?? index + 1;
                        const isTrophy = runner.finish_position !== null && runner.finish_position <= 3;
                        return (
                            <TableRow key={runner.id}>
                                <TableCell className="font-medium">
                                    {isTrophy ? (
                                        <Trophy className="h-4 w-4 text-yellow-500" />
                                    ) : (
                                        rank
                                    )}
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="font-medium">{runner.full_name}</span>
                                        <span className="text-xs text-muted-foreground font-mono">
                                            {runner.chip_uid}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <StatusBadge status={runner.status} />
                                </TableCell>
                                <TableCell className="font-medium text-sm">
                                    {runner.last_checkpoint_id >= 0 
                                        ? CHECKPOINT_LABELS[runner.last_checkpoint_id] || `CP${runner.last_checkpoint_id}`
                                        : '—'}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm font-mono flex items-center gap-1.5 mt-2.5">
                                    {runner.last_checkpoint_time && <Clock className="h-3 w-3 opacity-50" />}
                                    {formatTimeOnly(runner.last_checkpoint_time)}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                    {runner.wallet_address.slice(0, 6)}...{runner.wallet_address.slice(-4)}
                                </TableCell>
                                <TableCell className="text-right">
                                    {runner.tx_signature ? (
                                        <a
                                            href={`https://explorer.solana.com/tx/${runner.tx_signature}?cluster=devnet`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-mono text-xs underline decoration-blue-500/30 underline-offset-2"
                                            title="Verifikasi Transaksi"
                                        >
                                            View Tx
                                        </a>
                                    ) : (
                                        <span className="text-muted-foreground text-xs opacity-50">—</span>
                                    )}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
