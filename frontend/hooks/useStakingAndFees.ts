/**
 * Hook for staking and fee management
 * Calculates fees, estimates earnings, and manages stake transactions
 */

import { useState, useCallback } from "react";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export interface StakingInfo {
  stakeAmount: number; // In USDC (e.g., 10.5)
  protocolFeeBps: number; // Basis points (e.g., 500 = 5%)
  protocolFeeAmount: number; // Calculated fee amount
  netToAdmin: number; // Amount returned to admin after fees
  feePercentage: string; // Human-readable percentage
}

export function useStakingAndFees(program: any) {
  const [stakingLoading, setStakingLoading] = useState(false);
  const [stakingError, setStakingError] = useState<string | null>(null);

  /**
   * Calculate fee breakdown given vault total and protocol fee BPS
   */
  const calculateFeeBreakdown = useCallback(
    (totalAmount: number, feeBps: number): Omit<StakingInfo, "stakeAmount"> => {
      const feeAmount = Math.floor((totalAmount * feeBps) / 10000);
      const netAmount = totalAmount - feeAmount;
      const feePercentage = (feeBps / 100).toFixed(2);

      return {
        protocolFeeBps: feeBps,
        protocolFeeAmount: feeAmount,
        netToAdmin: netAmount,
        feePercentage,
      };
    },
    [],
  );

  /**
   * Execute stake_event instruction on blockchain
   * Called after event creation, before start_race
   *
   * This transfers admin's tokens to the stake vault
   */
  const executeStakeEvent = useCallback(
    async (
      eventId: string,
      stakeAmountUsdc: number,
      adminTokenAccount: PublicKey,
      vaultAddress: PublicKey,
      mintAddress: PublicKey,
    ): Promise<string> => {
      if (!program) throw new Error("Program not initialized");

      setStakingLoading(true);
      setStakingError(null);

      try {
        // Convert USDC to token units (6 decimals)
        const USDC_DECIMALS = 6;
        const stakeAmountTokens = new anchor.BN(
          Math.floor(stakeAmountUsdc * Math.pow(10, USDC_DECIMALS)),
        );

        // Derive PDAs
        const [eventPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("event"), Buffer.from(eventId)],
          program.programId,
        );

        const [stakeVaultPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("stake_vault"), eventPda.toBuffer()],
          program.programId,
        );

        // Execute stake_event instruction
        // Note: Anchor auto-converts snake_case to camelCase in TypeScript
        const txSignature = await program.methods
          .stakeEvent(eventId, stakeAmountTokens)
          .accounts({
            admin: program.provider.publicKey,
            event: eventPda,
            stakeVault: stakeVaultPda,
            adminTokenAccount,
            vault: vaultAddress,
            mint: mintAddress,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          } as any)
          .rpc();

        console.log("[executeStakeEvent] Success:", txSignature);
        return txSignature;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown error during staking";
        setStakingError(message);
        console.error("[executeStakeEvent] Failed:", message);
        throw error;
      } finally {
        setStakingLoading(false);
      }
    },
    [program],
  );

  /**
   * Estimate total earnings after fees
   * Shows admin what they'll receive from gross vault balance
   */
  const estimateEarnings = useCallback(
    (
      registrationFeePerPerson: number,
      participantCount: number,
      stakeAmount: number,
      feeBps: number,
    ) => {
      const totalDeposits = registrationFeePerPerson * participantCount;
      const grossAmount = totalDeposits + stakeAmount;
      const breakdown = calculateFeeBreakdown(grossAmount, feeBps);

      return {
        totalDeposits,
        stakeAmount,
        grossAmount,
        ...breakdown,
      };
    },
    [calculateFeeBreakdown],
  );

  return {
    stakingLoading,
    stakingError,
    calculateFeeBreakdown,
    executeStakeEvent,
    estimateEarnings,
  };
}
