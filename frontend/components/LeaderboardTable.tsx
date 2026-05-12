"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Trophy, Clock, ChevronRight, ExternalLink } from "lucide-react";
import type { RunnerWithLogs } from "@/hooks/useRunners";

// Prize distribution ratios for positions 1-4
const PRIZE_RATIOS = [0, 0.4, 0.3, 0.2, 0.1] as const; // index 0 unused

function calcPrize(
  position: number | null,
  totalRunners: number,
  registrationFeeSol: number,
  stakeAmount: number,
  protocolFeeBps: number,
  prizeNetUsdc: number | null | undefined,
): string {
  if (!position || position > 4) return "\u2014";
  // If actual distributed amount is stored, use it
  if (prizeNetUsdc != null) return `${prizeNetUsdc.toFixed(2)} USDC`;
  // Otherwise calculate an estimated prize from pool size
  const totalPool = totalRunners * registrationFeeSol + stakeAmount;
  const protocolFee = (totalPool * protocolFeeBps) / 10000;
  const netPool = totalPool - protocolFee;
  const ratio = PRIZE_RATIOS[position as 1 | 2 | 3 | 4] ?? 0;
  const prize = netPool * ratio;
  if (prize <= 0) return "\u2014";
  return `~${prize.toFixed(2)} USDC`;
}

const CHECKPOINT_LABELS: Record<number, string> = {
  0: "Start",
  1: "Checkpoint 1",
  2: "Finish",
};

interface EventSummary {
  registration_fee_sol: number;
  max_participants: number;
  stake_amount?: number;
  protocol_fee_bps?: number;
  status: string;
}

interface LeaderboardTableProps {
  runners: RunnerWithLogs[];
  isLoading: boolean;
  event: EventSummary | null;
}

function formatTimeOnly(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function LeaderboardTable({
  runners,
  isLoading,
  event,
}: LeaderboardTableProps) {
  const [selectedRunner, setSelectedRunner] = useState<RunnerWithLogs | null>(
    null,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <p>Loading leaderboard data...</p>
      </div>
    );
  }

  if (runners.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
        <Trophy className="h-10 w-10 opacity-30" />
        <p>No registered participants yet.</p>
      </div>
    );
  }

  // Derive pool parameters with safe defaults
  const regFee = event?.registration_fee_sol ?? 0;
  const stakeAmt = event?.stake_amount ?? 0;
  const protocolBps = event?.protocol_fee_bps ?? 500;
  const totalRunners = runners.length;

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
      return (
        new Date(a.last_checkpoint_time).getTime() -
        new Date(b.last_checkpoint_time).getTime()
      );
    }

    // Fallbacks
    if (a.status === "running" && b.status !== "running") return -1;
    if (b.status === "running" && a.status !== "running") return 1;
    return 0;
  });

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Participant Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Checkpoint</TableHead>
              <TableHead>Time (Real)</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead className="text-right">Prize</TableHead>
              <TableHead className="text-right">On-Chain Tx</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((runner, index) => {
              const rank = runner.finish_position ?? index + 1;
              const isTrophy =
                runner.finish_position !== null && runner.finish_position <= 3;
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
                        {runner.rfid_uid}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={runner.status} />
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {runner.last_checkpoint_id >= 0
                      ? CHECKPOINT_LABELS[runner.last_checkpoint_id] ||
                        `CP${runner.last_checkpoint_id}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm font-mono flex items-center gap-1.5 mt-2.5">
                    {runner.last_checkpoint_time && (
                      <Clock className="h-3 w-3 opacity-50" />
                    )}
                    {formatTimeOnly(runner.last_checkpoint_time)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {runner.wallet_address.slice(0, 6)}...
                    {runner.wallet_address.slice(-4)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {(() => {
                      const prizeStr = calcPrize(
                        runner.finish_position,
                        totalRunners,
                        regFee,
                        stakeAmt,
                        protocolBps,
                        runner.prize_amount_net_usdc,
                      );
                      if (prizeStr === "\u2014") {
                        return (
                          <span className="text-muted-foreground opacity-50">
                            {prizeStr}
                          </span>
                        );
                      }
                      const isActual = !prizeStr.startsWith("~");
                      return (
                        <span
                          className={
                            isActual
                              ? "text-yellow-400 font-semibold"
                              : "text-emerald-400"
                          }
                        >
                          {prizeStr}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    {runner.tx_signature ? (
                      <span className="text-blue-500 text-xs flex items-center justify-end gap-1 font-medium">
                        Detail <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs opacity-50">
                        —
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!selectedRunner}
        onOpenChange={(open) => !open && setSelectedRunner(null)}
      >
        <DialogContent className="sm:max-w-[425px] border-2 border-primary bg-background rounded-none">
          <DialogHeader>
            <DialogTitle className="font-display-sm text-display-sm uppercase border-b-2 border-primary pb-sm">
              RUNNER HISTORY
            </DialogTitle>
          </DialogHeader>
          {selectedRunner && (
            <div className="flex flex-col gap-md py-sm">
              <div className="flex justify-between items-center border-b border-primary/20 pb-sm">
                <span className="font-label-caps text-label-caps text-muted-foreground">
                  NAME
                </span>
                <span className="font-medium">{selectedRunner.full_name}</span>
              </div>
              <div className="flex flex-col gap-xs border-b border-primary/20 pb-sm">
                <span className="font-label-caps text-label-caps text-muted-foreground">
                  ON-CHAIN TRANSACTIONS
                </span>
                <div className="flex flex-col gap-xs mt-1">
                  {selectedRunner.tx_signature ? (
                    <a
                      href={`https://explorer.solana.com/tx/${selectedRunner.tx_signature}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex justify-between items-center bg-blue-950/30 p-2 border border-blue-900/50 hover:bg-blue-900/40 transition-colors"
                    >
                      <span className="text-xs text-blue-400 font-mono">
                        REGISTRATION TX
                      </span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      No Registration TX
                    </span>
                  )}
                  {selectedRunner.prize_tx_signature ? (
                    <a
                      href={`https://explorer.solana.com/tx/${selectedRunner.prize_tx_signature}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex justify-between items-center bg-yellow-950/30 p-2 border border-yellow-900/50 hover:bg-yellow-900/40 transition-colors mt-xs"
                    >
                      <span className="text-xs text-yellow-500 font-mono">
                        PRIZE/REFUND TX
                      </span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    selectedRunner.status === "finished" && (
                      <span className="text-xs text-muted-foreground italic mt-xs">
                        Prize TX Pending
                      </span>
                    )
                  )}
                </div>
              </div>
              {/* Prize breakdown — only for top-4 finishers */}
              {selectedRunner.finish_position != null &&
                selectedRunner.finish_position <= 4 &&
                event != null &&
                (() => {
                  const totalPool = totalRunners * regFee + stakeAmt;
                  const protocolFeeAmt = (totalPool * protocolBps) / 10000;
                  const netPool = totalPool - protocolFeeAmt;
                  const ratio =
                    PRIZE_RATIOS[
                      selectedRunner.finish_position as 1 | 2 | 3 | 4
                    ] ?? 0;
                  const estimatedPrize = netPool * ratio;
                  const actualPrize = selectedRunner.prize_amount_net_usdc;
                  return (
                    <div className="flex flex-col gap-xs border-b border-primary/20 pb-sm">
                      <span className="font-label-caps text-label-caps text-muted-foreground">
                        PRIZE BREAKDOWN
                      </span>
                      <div className="flex flex-col gap-1 mt-1 bg-muted/20 p-3 border border-border">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            Gross Pool ({totalRunners} × {regFee.toFixed(2)}
                            {stakeAmt > 0
                              ? ` + ${stakeAmt.toFixed(2)} stake`
                              : ""}
                            )
                          </span>
                          <span className="font-mono">
                            {totalPool.toFixed(2)} USDC
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            Protocol Fee ({(protocolBps / 100).toFixed(1)}%)
                          </span>
                          <span className="font-mono text-red-400">
                            &minus;{protocolFeeAmt.toFixed(2)} USDC
                          </span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-border pt-1">
                          <span className="text-muted-foreground">
                            Net Pool
                          </span>
                          <span className="font-mono">
                            {netPool.toFixed(2)} USDC
                          </span>
                        </div>
                        <div className="flex justify-between text-xs font-semibold mt-1">
                          <span>
                            Your Prize (#{selectedRunner.finish_position} ·{" "}
                            {(ratio * 100).toFixed(0)}%)
                          </span>
                          <span
                            className={
                              actualPrize != null
                                ? "font-mono text-yellow-400"
                                : "font-mono text-emerald-400"
                            }
                          >
                            {actualPrize != null
                              ? `${actualPrize.toFixed(2)} USDC`
                              : `~${estimatedPrize.toFixed(2)} USDC`}
                          </span>
                        </div>
                        {actualPrize == null && (
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            Estimated — final amount confirmed after race
                            settlement.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              <div className="flex flex-col gap-xs pt-xs">
                <span className="font-label-caps text-label-caps text-muted-foreground">
                  CHECKPOINT HISTORY (OFF-CHAIN)
                </span>
                {!selectedRunner.race_logs ||
                selectedRunner.race_logs.length === 0 ? (
                  <span className="text-sm text-muted-foreground italic py-2">
                    No checkpoints crossed yet.
                  </span>
                ) : (
                  <div className="flex flex-col gap-2 mt-2">
                    {[...selectedRunner.race_logs]
                      .sort((a, b) => b.checkpoint_id - a.checkpoint_id)
                      .map((log) => (
                        <div
                          key={log.checkpoint_id}
                          className="flex justify-between items-center bg-muted/30 p-2 border border-border"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-primary" />
                            <span className="text-sm font-medium">
                              {CHECKPOINT_LABELS[log.checkpoint_id] ||
                                `CP${log.checkpoint_id}`}
                            </span>
                          </div>
                          <span className="text-xs font-mono text-muted-foreground">
                            {new Date(log.timestamp).toLocaleTimeString(
                              "en-US",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              },
                            )}
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
