/**
 * Earnings Breakdown Card Component
 * Displays detailed earnings information for an event in the EO dashboard
 */

"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp,
  Zap,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";

interface EarningsBreakdownCardProps {
  eventId: string;
  eventName: string;
  status: "pending" | "active" | "completed" | "settled";
  registrationFeePerPerson: number;
  stakeAmount: number;
  participantCount: number;
  protocolFeeBps: number;
  isCompleted: boolean;
  stakeStatus: "pending" | "staked" | "returned" | "slashed";
  treasuryFeeCollected?: number;
  disputeLockUntil?: string | null;
  onClaim?: (eventId: string) => Promise<string | void>; // Returns tx signature on success
}

export default function EarningsBreakdownCard({
  eventId,
  eventName,
  status,
  registrationFeePerPerson,
  stakeAmount,
  participantCount,
  protocolFeeBps,
  isCompleted,
  stakeStatus,
  treasuryFeeCollected = 0,
  disputeLockUntil,
  onClaim,
}: EarningsBreakdownCardProps) {
  const [claiming, setClaiming] = useState(false);
  const [claimTxSig, setClaimTxSig] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000); // update every minute
    return () => clearInterval(timer);
  }, []);
  // Calculations
  const totalDeposits = registrationFeePerPerson * participantCount;
  const grossAmount = totalDeposits + stakeAmount;
  const feeAmount = Math.floor((grossAmount * protocolFeeBps) / 10000);
  const netAmount = grossAmount - feeAmount;
  const feePercentage = (protocolFeeBps / 100).toFixed(2);

  // Dispute lock logic
  const unlockDate = disputeLockUntil ? new Date(disputeLockUntil) : null;
  const isLockedByDispute = unlockDate ? now < unlockDate : false;
  const disputeLockEnded = unlockDate ? now >= unlockDate : false;
  const isCompletedOrSettled = status === "completed" || status === "settled";

  // Determine if funds are claimable
  // Note: previously it was stakeStatus === "returned", but the creator needs to claim when "staked"
  const canClaim = isCompletedOrSettled && stakeStatus === "staked" && disputeLockEnded;
  const isSlashed = stakeStatus === "slashed";

  return (
    <div className="border-2 border-primary p-lg space-y-lg hover-card transition-all">
      <div className="flex items-center justify-between">
        <h3 className="font-headline-md text-headline-md text-primary uppercase">
          💰 Earnings Breakdown
        </h3>
        <span
          className={`font-label-caps text-label-caps px-sm py-xs border ${
            isSlashed
              ? "border-error bg-error/10 text-error"
              : canClaim
                ? "border-success bg-success/10 text-success"
                : "border-on-surface-variant text-on-surface-variant"
          }`}
        >
          {stakeStatus.toUpperCase()}
        </span>
      </div>

      {/* ── Net Amount (Claimable) ───────────────────────── */}
      <div className="bg-success/10 border-2 border-success p-md rounded-sm space-y-sm">
        <p className="font-label-caps text-label-caps text-success uppercase">
          Your Net Earnings
        </p>
        <div className="flex justify-between items-baseline">
          <span className="font-headline-sm text-headline-sm text-success">
            Available to Claim
          </span>
          <span className="font-display-md text-display-md text-success">
            {netAmount.toFixed(2)} USDC
          </span>
        </div>
        <p className="font-body-xs text-body-xs text-on-surface-variant">
          This includes your original stake ({stakeAmount.toFixed(2)} USDC)
          minus the protocol fee.
        </p>
      </div>

      {/* ── Stake Status Indicator ───────────────────────── */}
      <div className="space-y-sm">
        <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
          Stake Status
        </p>
        <div
          className={`p-md border-l-4 space-y-xs ${
            stakeStatus === "pending"
              ? "bg-on-surface-variant/5 border-l-on-surface-variant"
              : stakeStatus === "staked"
                ? "bg-blue-900/10 border-l-blue-500"
                : stakeStatus === "returned"
                  ? "bg-success/10 border-l-success"
                  : "bg-error/10 border-l-error"
          }`}
        >
          <div className="flex items-center gap-sm">
            {stakeStatus === "pending" && (
              <Clock className="h-4 w-4 text-on-surface-variant" />
            )}
            {stakeStatus === "staked" && (
              <AlertCircle className="h-4 w-4 text-blue-500" />
            )}
            {stakeStatus === "returned" && (
              <CheckCircle className="h-4 w-4 text-success" />
            )}
            {stakeStatus === "slashed" && (
              <AlertCircle className="h-4 w-4 text-error" />
            )}
            <span className="font-body-sm font-bold uppercase">
              {stakeStatus === "pending" && "Awaiting Deposit"}
              {stakeStatus === "staked" &&
                isCompletedOrSettled &&
                isLockedByDispute &&
                "Deposited & Dispute Locked"}
              {stakeStatus === "staked" &&
                isCompletedOrSettled &&
                !isLockedByDispute &&
                "Ready to Claim"}
              {stakeStatus === "staked" &&
                !isCompletedOrSettled &&
                "Deposited & Locked"}
              {stakeStatus === "returned" && "Returned to You"}
              {stakeStatus === "slashed" && "Forfeited as Penalty"}
            </span>
          </div>
          <p className="font-body-xs text-on-surface-variant">
            {stakeStatus === "pending" &&
              "You must call stake_event on blockchain before starting."}
            {stakeStatus === "staked" &&
              !isCompletedOrSettled &&
              "Your stake is locked in the smart contract until event completion."}
            {stakeStatus === "staked" &&
              isCompletedOrSettled &&
              isLockedByDispute &&
              unlockDate &&
              `Your stake is locked in the smart contract until the 7-day dispute period ends on ${unlockDate.toLocaleDateString()} at ${unlockDate.toLocaleTimeString()}.`}
            {stakeStatus === "staked" &&
              isCompletedOrSettled &&
              !isLockedByDispute &&
              "Dispute period ended. You can now claim your stake and earnings."}
            {stakeStatus === "returned" &&
              "Your stake has been returned (minus protocol fee)."}
            {stakeStatus === "slashed" &&
              "Your stake was forfeited due to event cancellation/failure."}
          </p>
        </div>
      </div>

      {/* ── Collapsible Breakdown ───────────────────────── */}
      <Collapsible
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        className="space-y-sm"
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between uppercase font-label-caps text-xs border-outline-variant hover:bg-surface-container transition-none"
          >
            <span>
              {isDetailsOpen ? "Hide Details" : "View Breakdown Details"}
            </span>
            {isDetailsOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-lg pt-md">
          {/* ── Revenue Sources ────────────────────────────────── */}
          <div className="space-y-sm">
            <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              Revenue Sources
            </p>
            <div className="space-y-xs bg-surface-container p-md rounded-sm">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-sm">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <span className="font-body-sm text-on-surface-variant">
                    Registration Deposits ({participantCount} participants)
                  </span>
                </div>
                <span className="font-data-md text-success">
                  +{totalDeposits.toFixed(2)} USDC
                </span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-sm">
                  <Zap className="h-4 w-4 text-orange-500" />
                  <span className="font-body-sm text-on-surface-variant">
                    Your Stake
                  </span>
                </div>
                <span className="font-data-md text-orange-500">
                  +{stakeAmount.toFixed(2)} USDC
                </span>
              </div>
              <div className="border-t border-outline-variant pt-xs flex justify-between font-label-caps">
                <span className="text-on-surface-variant">Gross Amount</span>
                <span className="font-data-md text-primary">
                  {grossAmount.toFixed(2)} USDC
                </span>
              </div>
            </div>
          </div>

          {/* ── Fee Breakdown ────────────────────────────────────── */}
          <div className="space-y-sm">
            <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              Protocol Fee Deduction
            </p>
            <div className="space-y-xs bg-surface-container p-md rounded-sm border border-error/30">
              <div className="flex justify-between items-center">
                <span className="font-body-sm text-on-surface-variant">
                  Protocol Fee Rate
                </span>
                <span className="font-data-md text-error">
                  {feePercentage}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-body-sm text-on-surface-variant">
                  Calculated from: {grossAmount.toFixed(2)} USDC ×{" "}
                  {protocolFeeBps} bps
                </span>
                <span className="font-data-md text-error">
                  -{feeAmount.toFixed(2)} USDC
                </span>
              </div>
              {treasuryFeeCollected > 0 && (
                <div className="flex justify-between items-center text-on-surface-variant text-body-xs">
                  <span>Fee Sent to Treasury</span>
                  <span className="text-error">
                    {treasuryFeeCollected.toFixed(2)} USDC
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Summary Table ─────────────────────────────────── */}
          <div className="border-2 border-outline-variant p-md space-y-xs">
            <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-md">
              Summary
            </p>
            <div className="space-y-xs text-sm">
              <div className="flex justify-between py-xs">
                <span className="text-on-surface-variant">Event Status:</span>
                <span className="font-bold text-primary uppercase">
                  {status}
                </span>
              </div>
              <div className="flex justify-between py-xs">
                <span className="text-on-surface-variant">
                  Total Participants:
                </span>
                <span className="font-data-md">{participantCount}</span>
              </div>
              <div className="flex justify-between py-xs border-t border-outline-variant pt-xs">
                <span className="text-on-surface-variant">Gross Vault:</span>
                <span className="font-data-md text-primary">
                  {grossAmount.toFixed(2)} USDC
                </span>
              </div>
              <div className="flex justify-between py-xs text-error">
                <span className="text-on-surface-variant">
                  Protocol Fee ({feePercentage}%):
                </span>
                <span className="font-data-md">
                  -{feeAmount.toFixed(2)} USDC
                </span>
              </div>
              <div className="flex justify-between py-xs border-t-2 border-primary pt-xs font-headline-sm">
                <span className="text-primary">Net to You:</span>
                <span className="text-primary font-data-lg">
                  {netAmount.toFixed(2)} USDC
                </span>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Action Button ─────────────────────────────────── */}
      {isCompletedOrSettled && stakeStatus === "staked" && (
        <div className="space-y-sm">
          <Button
            variant={canClaim ? "default" : "secondary"}
            className="w-full uppercase"
            onClick={async () => {
              if (!onClaim) return;
              setClaiming(true);
              setClaimError(null);
              try {
                const txSig = await onClaim(eventId);
                if (txSig) setClaimTxSig(txSig as string);
              } catch (err: any) {
                setClaimError(err?.message || "Claim failed");
              } finally {
                setClaiming(false);
              }
            }}
            disabled={claiming || !onClaim || !canClaim}
          >
            {claiming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> CLAIMING...
              </>
            ) : !canClaim ? (
              <>Locked (Dispute Period)</>
            ) : (
              <>Claim {netAmount.toFixed(2)} USDC</>
            )}
          </Button>
          {claimTxSig && (
            <a
              href={`https://explorer.solana.com/tx/${claimTxSig}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-xs font-label-caps text-[10px] text-blue-400 hover:text-blue-300 border border-blue-800 px-sm py-xs transition-none"
            >
              <ExternalLink className="h-3 w-3" /> VIEW ON SOLSCAN
            </a>
          )}
          {claimError && (
            <p className="font-body-xs text-error text-center">{claimError}</p>
          )}
        </div>
      )}

      {isSlashed && (
        <div className="bg-error/10 border border-error p-md text-center">
          <p className="font-label-caps text-label-caps text-error uppercase">
            Stake Slashed
          </p>
          <p className="font-body-xs text-on-surface-variant mt-xs">
            Your stake was transferred to treasury as a penalty.
          </p>
        </div>
      )}

      {status === "active" && stakeStatus === "staked" && (
        <div className="bg-blue-900/10 border border-blue-700 p-md text-center">
          <p className="font-label-caps text-label-caps text-blue-500 uppercase">
            Event In Progress
          </p>
          <p className="font-body-xs text-on-surface-variant mt-xs">
            Awaiting completion to process fee distribution.
          </p>
        </div>
      )}
    </div>
  );
}
