'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { Trophy, Clock, ChevronRight, ExternalLink } from 'lucide-react';
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
    const [selectedRunner, setSelectedRunner] = useState<RunnerWithLogs | null>(null);

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
        <>
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
                                <TableRow 
                                    key={runner.id} 
                                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                                    onClick={() => setSelectedRunner(runner)}
                                >
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
                                            <span className="text-blue-500 text-xs flex items-center justify-end gap-1 font-medium">
                                                Detail <ChevronRight className="h-3.5 w-3.5" />
                                            </span>
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

            <Dialog open={!!selectedRunner} onOpenChange={(open) => !open && setSelectedRunner(null)}>
                <DialogContent className="sm:max-w-[425px] border-2 border-primary bg-background rounded-none">
                    <DialogHeader>
                        <DialogTitle className="font-display-sm text-display-sm uppercase border-b-2 border-primary pb-sm">
                            RIWAYAT RUNNER
                        </DialogTitle>
                    </DialogHeader>
                    {selectedRunner && (
                        <div className="flex flex-col gap-md py-sm">
                            <div className="flex justify-between items-center border-b border-primary/20 pb-sm">
                                <span className="font-label-caps text-label-caps text-muted-foreground">NAMA</span>
                                <span className="font-medium">{selectedRunner.full_name}</span>
                            </div>
                            <div className="flex flex-col gap-xs border-b border-primary/20 pb-sm">
                                <span className="font-label-caps text-label-caps text-muted-foreground">ON-CHAIN TRANSACTIONS</span>
                                <div className="flex flex-col gap-xs mt-1">
                                    {selectedRunner.tx_signature ? (
                                        <a href={`https://explorer.solana.com/tx/${selectedRunner.tx_signature}?cluster=devnet`} target="_blank" rel="noreferrer" className="flex justify-between items-center bg-blue-950/30 p-2 border border-blue-900/50 hover:bg-blue-900/40 transition-colors">
                                            <span className="text-xs text-blue-400 font-mono">REGISTRATION TX</span>
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                    ) : (
                                        <span className="text-xs text-muted-foreground italic">No Registration TX</span>
                                    )}
                                    {selectedRunner.prize_tx_signature ? (
                                        <a href={`https://explorer.solana.com/tx/${selectedRunner.prize_tx_signature}?cluster=devnet`} target="_blank" rel="noreferrer" className="flex justify-between items-center bg-yellow-950/30 p-2 border border-yellow-900/50 hover:bg-yellow-900/40 transition-colors mt-xs">
                                            <span className="text-xs text-yellow-500 font-mono">PRIZE/REFUND TX</span>
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                    ) : (
                                        selectedRunner.status === 'finished' && <span className="text-xs text-muted-foreground italic mt-xs">Prize TX Pending</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col gap-xs pt-xs">
                                <span className="font-label-caps text-label-caps text-muted-foreground">CHECKPOINT HISTORY (OFF-CHAIN)</span>
                                {(!selectedRunner.race_logs || selectedRunner.race_logs.length === 0) ? (
                                    <span className="text-sm text-muted-foreground italic py-2">Belum ada checkpoint yang dilewati.</span>
                                ) : (
                                    <div className="flex flex-col gap-2 mt-2">
                                        {[...selectedRunner.race_logs]
                                            .sort((a, b) => b.checkpoint_id - a.checkpoint_id)
                                            .map((log) => (
                                            <div key={log.checkpoint_id} className="flex justify-between items-center bg-muted/30 p-2 border border-border">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-primary" />
                                                    <span className="text-sm font-medium">
                                                        {CHECKPOINT_LABELS[log.checkpoint_id] || `CP${log.checkpoint_id}`}
                                                    </span>
                                                </div>
                                                <span className="text-xs font-mono text-muted-foreground">
                                                    {new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
