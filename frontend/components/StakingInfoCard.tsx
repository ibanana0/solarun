/**
 * Staking Info Card Component
 * Displays stake requirement and fee breakdown for event creation
 */

'use client';

import { AlertCircle, DollarSign, Percent, Shield } from 'lucide-react';

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

    const minRecommendedStake = (registrationFee * maxParticipants * 0.05);
    const maxRecommendedStake = (registrationFee * maxParticipants * 2.0);

    return (
        <div className="border-2 border-primary p-lg space-y-lg">
            <h3 className="font-headline-md text-headline-md text-primary uppercase border-b-2 border-primary pb-sm">
                💰 STAKING & EARNINGS
            </h3>

            {/* ── Stake Requirement Warning ────────────────────────── */}
            <div className="bg-orange-900/20 border border-orange-700 p-md rounded-sm space-y-sm">
                <div className="flex items-start gap-sm">
                    <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
                    <div className="space-y-xs">
                        <p className="font-label-caps text-label-caps text-orange-500 uppercase">⚠️ Minimum Stake Required</p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                            Your stake must be between <span className="font-bold text-orange-400">{minRecommendedStake.toFixed(2)}</span> and 
                            <span className="font-bold text-orange-400"> {maxRecommendedStake.toFixed(2)} USDC</span>.
                        </p>
                        <p className="font-body-xs text-body-xs text-on-surface-variant">
                            This ensures adequate collateral to cover participant refunds.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Staking Information ──────────────────────────────── */}
            <div className="space-y-sm">
                <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Stake Details</p>
                <div className="grid grid-cols-2 gap-gutter border-2 border-outline-variant p-md space-y-sm">
                    <div className="flex items-center justify-between col-span-2">
                        <span className="font-body-sm text-on-surface-variant">Your Stake:</span>
                        <span className="font-data-lg text-primary">{stakeAmount.toFixed(2)} USDC</span>
                    </div>
                    <div className="flex items-center justify-between col-span-2">
                        <span className="font-body-sm text-on-surface-variant">Registration Fee/Person:</span>
                        <span className="font-data-lg text-primary">{registrationFee.toFixed(2)} USDC</span>
                    </div>
                    <div className="flex items-center justify-between col-span-2">
                        <span className="font-body-sm text-on-surface-variant">Max Participants:</span>
                        <span className="font-data-lg text-primary">{maxParticipants}</span>
                    </div>
                </div>
            </div>

            {/* ── Protocol Fee ──────────────────────────────────────── */}
            <div className="space-y-sm">
                <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Protocol Fee</p>
                <div className="grid grid-cols-2 gap-gutter border-2 border-outline-variant p-md">
                    <div className="flex items-center justify-between">
                        <span className="font-body-sm text-on-surface-variant">Fee Rate:</span>
                        <span className="font-data-lg text-primary">{feePercentage}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="font-body-sm text-on-surface-variant">({protocolFeeBps} bps)</span>
                        <span className="font-body-xs text-on-surface-variant">basis points</span>
                    </div>
                </div>
            </div>

            {/* ── Earnings Estimate (Worst Case: 2 Participants) ───── */}
            <div className="bg-surface-container p-md space-y-sm">
                <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                    📊 Minimum Earnings Estimate (2 Participants)
                </p>
                <div className="space-y-xs text-body-sm">
                    <div className="flex justify-between">
                        <span className="text-on-surface-variant">Deposits (2 × {registrationFee} USDC):</span>
                        <span className="text-primary font-data-sm">{minTotalDeposits.toFixed(2)} USDC</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-on-surface-variant">+ Your Stake:</span>
                        <span className="text-primary font-data-sm">{stakeAmount.toFixed(2)} USDC</span>
                    </div>
                    <div className="border-t border-outline-variant pt-xs flex justify-between font-label-caps">
                        <span className="text-on-surface-variant">Gross Amount:</span>
                        <span className="text-primary font-data-md">{minGrossAmount.toFixed(2)} USDC</span>
                    </div>
                    <div className="flex justify-between text-error">
                        <span className="text-on-surface-variant">- Protocol Fee ({feePercentage}%):</span>
                        <span className="font-data-sm">-{minFeeAmount.toFixed(2)} USDC</span>
                    </div>
                    <div className="border-t border-primary pt-xs flex justify-between bg-primary/10 p-xs font-headline-sm">
                        <span className="text-primary">You Receive:</span>
                        <span className="text-primary font-data-md">{minNetAmount.toFixed(2)} USDC</span>
                    </div>
                </div>
            </div>

            {/* ── Earnings Estimate (Full House) ────────────────── */}
            <div className="bg-surface-container p-md space-y-sm">
                <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                    📈 Maximum Earnings Estimate ({estimatedParticipants} Participants)
                </p>
                <div className="space-y-xs text-body-sm">
                    <div className="flex justify-between">
                        <span className="text-on-surface-variant">Deposits ({estimatedParticipants} × {registrationFee} USDC):</span>
                        <span className="text-primary font-data-sm">{totalDeposits.toFixed(2)} USDC</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-on-surface-variant">+ Your Stake:</span>
                        <span className="text-primary font-data-sm">{stakeAmount.toFixed(2)} USDC</span>
                    </div>
                    <div className="border-t border-outline-variant pt-xs flex justify-between font-label-caps">
                        <span className="text-on-surface-variant">Gross Amount:</span>
                        <span className="text-primary font-data-md">{grossAmount.toFixed(2)} USDC</span>
                    </div>
                    <div className="flex justify-between text-error">
                        <span className="text-on-surface-variant">- Protocol Fee ({feePercentage}%):</span>
                        <span className="font-data-sm">-{feeAmount.toFixed(2)} USDC</span>
                    </div>
                    <div className="border-t border-success pt-xs flex justify-between bg-success/10 p-xs font-headline-sm">
                        <span className="text-success">You Receive:</span>
                        <span className="text-success font-data-md">{netAmount.toFixed(2)} USDC</span>
                    </div>
                </div>
            </div>

            {/* ── Risk Notice ────────────────────────────────────── */}
            <div className="bg-red-900/10 border border-red-700/50 p-md rounded-sm space-y-xs">
                <p className="font-label-caps text-label-caps text-red-600 uppercase flex items-center gap-xs">
                    <Shield className="h-3.5 w-3.5" />
                    Slash Risk
                </p>
                <p className="font-body-xs text-body-xs text-on-surface-variant">
                    If the event is cancelled or fails, your stake ({stakeAmount.toFixed(2)} USDC) will be transferred to the treasury as a penalty.
                </p>
            </div>
        </div>
    );
}
