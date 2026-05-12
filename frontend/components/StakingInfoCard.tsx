/**
 * Staking Info Card Component
 * Displays stake requirement and fee breakdown for event creation
 */

"use client";

import { AlertCircle, DollarSign, Percent, Shield } from "lucide-react";

interface StakingInfoCardProps {
  stakeAmount: number; // In USDC
  registrationFee: number; // Per participant in USDC
  maxParticipants: number;
  protocolFeeBps: number; // e.g., 500 = 5%
  estimatedParticipants?: number; // For earnings estimate
}

export default function StakingInfoCard({
  stakeAmount,
  registrationFee,
  maxParticipants,
  protocolFeeBps,
  estimatedParticipants = 50, // Default estimate
}: StakingInfoCardProps) {
  // Calculate breakdown
  const totalDeposits = registrationFee * estimatedParticipants;
  const grossAmount = totalDeposits + stakeAmount;
  const feeAmount = Math.floor((grossAmount * protocolFeeBps) / 10000);
  const netAmount = grossAmount - feeAmount;
  const feePercentage = (protocolFeeBps / 100).toFixed(2);

  const minTotalDeposits = registrationFee * 2; // Min 2 participants
  const minGrossAmount = minTotalDeposits + stakeAmount;
  const minFeeAmount = Math.floor((minGrossAmount * protocolFeeBps) / 10000);
  const minNetAmount = minGrossAmount - minFeeAmount;

  const requiredStake = registrationFee * maxParticipants * 0.5; // Fixed 50% of max prize pool

  return (
    <div className="border-2 border-primary p-lg space-y-lg hover-card transition-all">
      <h3 className="font-headline-md text-headline-md text-primary uppercase border-b-2 border-primary pb-sm">
        💰 STAKING & EARNINGS
      </h3>

      {/* ── Stake Requirement Warning ────────────────────────── */}
      <div className="bg-orange-900/20 border border-orange-700 p-md rounded-sm space-y-sm">
        <div className="flex items-start gap-sm">
          <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-xs">
            <p className="font-label-caps text-label-caps text-orange-500 uppercase">
              ⚠️ Fixed Stake Required
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Required:{" "}
              <span className="font-bold text-orange-400">
                {requiredStake.toFixed(2)} USDC
              </span>{" "}
              (50% of max prize pool)
            </p>
            <p className="font-body-xs text-body-xs text-on-surface-variant">
              This fixed collateral ensures the creator is committed to running
              the event.
            </p>
          </div>
        </div>
      </div>

      {/* ── Staking Information ──────────────────────────────── */}
      <div className="space-y-sm">
        <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
          Stake Details
        </p>
        <div className="grid grid-cols-2 gap-gutter border-2 border-outline-variant p-md space-y-sm">
          <div className="flex items-center justify-between col-span-2">
            <span className="font-body-sm text-on-surface-variant">
              Your Stake:
            </span>
            <span className="font-data-lg text-primary">
              {stakeAmount.toFixed(2)} USDC
            </span>
          </div>
          <div className="flex items-center justify-between col-span-2">
            <span className="font-body-sm text-on-surface-variant">
              Registration Fee/Person:
            </span>
            <span className="font-data-lg text-primary">
              {registrationFee.toFixed(2)} USDC
            </span>
          </div>
          <div className="flex items-center justify-between col-span-2">
            <span className="font-body-sm text-on-surface-variant">
              Max Participants:
            </span>
            <span className="font-data-lg text-primary">{maxParticipants}</span>
          </div>
        </div>
      </div>

      {/* ── Protocol Fee ──────────────────────────────────────── */}
      <div className="space-y-sm">
        <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
          Protocol Fee
        </p>
        <div className="grid grid-cols-2 gap-gutter border-2 border-outline-variant p-md">
          <div className="flex items-center justify-between">
            <span className="font-body-sm text-on-surface-variant">
              Fee Rate:
            </span>
            <span className="font-data-lg text-primary">{feePercentage}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-body-sm text-on-surface-variant">
              ({protocolFeeBps} bps)
            </span>
            <span className="font-body-xs text-orange-400 font-semibold">
              → Developer Treasury
            </span>
          </div>
        </div>
      </div>

      {/* ── Fee Flow Explanation (Phase 3) ──────────────────── */}
      <div className="bg-blue-900/10 border border-blue-700/50 p-md rounded-sm space-y-xs">
        <p className="font-label-caps text-label-caps text-blue-400 uppercase">
          How Fees Flow
        </p>
        <ul className="space-y-xs">
          <li className="font-body-xs text-body-xs text-on-surface-variant">
            • Registration fee (per runner) → Prize pool for top finishers
          </li>
          <li className="font-body-xs text-body-xs text-on-surface-variant">
            • Protocol fee ({feePercentage}% of total pool) → Developer treasury
          </li>
          <li className="font-body-xs text-body-xs text-orange-400 font-semibold">
            • Creator does NOT receive registration fees — only stake returned
            after event settles
          </li>
        </ul>
      </div>

      {/* ── Risk Notice ────────────────────────────────────── */}
      <div className="bg-red-900/10 border border-red-700/50 p-md rounded-sm space-y-xs">
        <p className="font-label-caps text-label-caps text-red-600 uppercase flex items-center gap-xs">
          <Shield className="h-3.5 w-3.5" />
          Slash Risk
        </p>
        <p className="font-body-xs text-body-xs text-on-surface-variant">
          If the event is cancelled or fails, your stake (
          {stakeAmount.toFixed(2)} USDC) will be transferred to the treasury as
          a penalty.
        </p>
      </div>
    </div>
  );
}
