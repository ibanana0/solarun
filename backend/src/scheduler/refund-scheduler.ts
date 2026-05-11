/**
 * Refund Scheduler
 * Runs periodically to process refunds for completed events
 *
 * Workflow:
 * 1. Check for events where current_time >= event.end_time
 * 2. For each completed event: trigger smart contract process_refunds()
 * 3. Update event status to "settled"
 * 4. Log transaction signature for auditing
 */

import "dotenv/config";
import * as cron from "node-cron";
import { supabase } from "../lib/supabase";
import { autoDetectAndSlashFraud } from '../lib/fraud-detection-service';
import {
  buildProcessRefundsInstructions,
  submitTransaction,
  checkConnection,
  logBlockchainStatus,
  getConnection,
  getAdminKeypair,
  getEventAccount,
  getVaultBalance,
} from "../blockchain/transaction-signer";
import { Transaction, Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { calculatePrizePool } from "../lib/prize-calculator";
import { cleanupStuckTransactions } from "../workers/optimistic-cleanup";

// ============================================================================
// Configuration
// ============================================================================

const REFUND_SCHEDULER_INTERVAL =
  process.env.REFUND_SCHEDULER_INTERVAL || "*/1 * * * *"; // Every 1 minute
const BATCH_SIZE_WINNERS = 4;
const BATCH_SIZE_NON_FINISHERS = 10;

// Track processed events (in-memory, to avoid re-processing same event)
const processedEvents = new Set<string>();

/** Reset for test isolation */
export function resetProcessedEvents() {
  processedEvents.clear();
}

/**
 * Check if a runner has already been paid/processed for an event (via prize distribution)
 *
 * BUGFIX: Checks prize_tx_signature (from processRefunds), NOT tx_signature
 * (which is from record_finish checkpoint). This is the correct source of truth
 * for whether a runner has received their prize.
 *
 * @param runnerId - Runner ID
 * @returns true if prize distribution confirmed on-chain
 */
async function isRunnerPaid(runnerId: string): Promise<boolean> {
  const { data } = await supabase
    .from("runners")
    .select("prize_tx_signature")
    .eq("id", runnerId)
    .single();

  if (data?.prize_tx_signature) {
    try {
      const conn = getConnection();
      const status = await conn.getSignatureStatus(data.prize_tx_signature);
      // If signature exists and is finalized, they are paid
      return status.value?.confirmationStatus === "finalized";
    } catch (e) {
      console.warn(
        `      ⚠️  Failed to check prize signature status for ${runnerId}:`,
        e,
      );
      return false;
    }
  }
  return false;
}

// ============================================================================
// Refund Processing Logic
// ============================================================================

/**
 * Check for completed events and process refunds
 * Called by the cron scheduler every minute
 */
export async function processCompletedEvents() {
  try {
    console.log(
      `\n⏰ [${new Date().toISOString()}] Refund scheduler running...`,
    );

    // Verify blockchain connection is healthy
    const isHealthy = await checkConnection();
    if (!isHealthy) {
      console.warn(
        `⚠️  Blockchain connection unhealthy, skipping refund processing`,
      );
      return;
    }

    // 1. Query for completed events (status = "completed")
    // Manual finalize button sets status to 'completed'
    const { data: completedEvents, error: queryError } = await supabase
      .from("race_events")
      .select("*")
      .eq("status", "completed");

    if (queryError) {
      console.error(`❌ Failed to query completed events:`, queryError);
      return;
    }

    if (!completedEvents || completedEvents.length === 0) {
      console.log(`   ✓ No completed events to process`);
      return;
    }

    console.log(`   📋 Found ${completedEvents.length} completed event(s)`);

    // 2. Process each completed event
    for (const event of completedEvents) {
      await processEventRefund(event);
    }
  } catch (error) {
    console.error(`❌ Error in processCompletedEvents:`, error);
  }
}

/**
 * Process refund for a single event
 * @param event - Race event from Supabase
 */
async function processEventRefund(event: any) {
  const eventId = event.id;
  const programId = process.env.SOLARUN_PROGRAM_ID!;
  const vaultAddress = event.vault_address || process.env.VAULT_ADDRESS;

  try {
    console.log(`\n   🔄 Processing refunds for event: ${eventId}`);

    // Skip if already processed in this session
    if (processedEvents.has(eventId)) {
      console.log(`   ✓ Already processed in this session, skipping`);
      return;
    }

    // SECURITY: Verify vault integrity before processing any refunds
    try {
      const { verifyVaultIntegrity } = await import('../lib/fraud-detection-service');
      const integrity = await verifyVaultIntegrity(eventId);
      if (!integrity.isValid) {
        console.error(`   🚨 VAULT INTEGRITY FAILED for event ${eventId}: ${integrity.message}`);
        console.error(`   ⛔ Skipping refund processing — possible fraud detected`);
        return;
      }
      console.log(`   🛡️ Vault integrity verified: ${integrity.message}`);
    } catch (vaultError) {
      console.warn(`   ⚠️ Vault integrity check skipped (non-fatal):`, vaultError);
      // Continue — vault check is best-effort if vault_address is missing
    }

    // 1. Get all runners for this event
    const { data: allRunners, error: runnersError } = await supabase
      .from("runners")
      .select("*")
      .eq("event_id", eventId);

    if (runnersError) {
      console.error(`   ❌ Failed to query runners:`, runnersError);
      return;
    }

    if (!allRunners || allRunners.length === 0) {
      console.log(`   ✓ No runners found for this event`);
      // Still mark as settled? Maybe not.
      return;
    }

    // 2. Filter out already processed runners (idempotency)
    console.log(
      `   🔍 Checking idempotency for ${allRunners.length} runners...`,
    );
    const runnersToProcess = [];
    for (const runner of allRunners) {
      const paid = await isRunnerPaid(runner.id);
      if (!paid) {
        runnersToProcess.push(runner);
      }
    }

    if (runnersToProcess.length === 0) {
      console.log(`   ✓ All runners already processed`);
      // Mark event as settled if it wasn't already
      await markEventSettled(eventId);
      processedEvents.add(eventId);
      return;
    }

    console.log(`   📊 Found ${runnersToProcess.length} runners to process`);

    // 3. Prize Calculation
    // Fetch the ACTUAL vault token balance from on-chain.
    // After complete_race(), only the protocol fee has been deducted, so the
    // remaining vault balance IS the prize pool available for distribution.
    // Using totalDeposits would be WRONG here — that value is never decremented
    // when fees are taken, so it would exceed the actual vault balance and cause
    // a VaultEmpty error (or an over-transfer) in process_refunds.
    console.log(`   🔍 Fetching on-chain vault balance for prize pool...`);
    const vaultAddress = event.vault_address || process.env.VAULT_ADDRESS;
    const totalVault = await getVaultBalance(eventId, vaultAddress);
    console.log(
      `   💰 Actual prize pool (vault balance): ${totalVault.toString()} (raw units)`,
    );

    if (totalVault.isZero()) {
      console.warn(
        `   ⚠️  Vault is empty — no prizes to distribute for event ${eventId}`,
      );
      await markEventSettled(eventId);
      processedEvents.add(eventId);
      return;
    }

    // Identify top 4 finishers (among ALL runners, not just unpaid ones)
    const finishers = allRunners
      .filter((r: any) => r.finish_position !== null)
      .sort((a: any, b: any) => a.finish_position - b.finish_position);

    const top4Finishers = finishers.slice(0, 4);
    const prizeShares = calculatePrizePool(
      totalVault,
      top4Finishers.map((f: any) => f.wallet_address),
    );

    console.log(`   🏆 Prize distribution:`);
    prizeShares.forEach((share, i) => {
      console.log(
        `      ${i + 1}. ${share.wallet}: ${share.amount.toString()} (raw)`,
      );
    });

    // 4. Batching Logic
    // Winners are top 4 who are NOT YET PAID
    const unpaidWinners = runnersToProcess.filter(
      (r) => r.finish_position !== null && r.finish_position <= 4,
    );
    // Non-finishers are those who didn't finish OR finished 5+
    const nonWinnersToProcess = runnersToProcess.filter(
      (r) => r.finish_position === null || r.finish_position > 4,
    );

    console.log(
      `   📦 Batching: ${unpaidWinners.length} winners, ${nonWinnersToProcess.length} non-winners`,
    );

    // We'll put all winners in the first batch if they fit
    // And distribute non-finishers across batches
    let currentNonWinnerIdx = 0;
    let batchCount = 0;

    while (
      currentNonWinnerIdx < nonWinnersToProcess.length ||
      batchCount === 0
    ) {
      batchCount++;
      const isFirstBatch = batchCount === 1;
      const batchWinners = isFirstBatch ? unpaidWinners : [];
      const batchNonWinners = nonWinnersToProcess.slice(
        currentNonWinnerIdx,
        currentNonWinnerIdx + BATCH_SIZE_NON_FINISHERS,
      );
      currentNonWinnerIdx += BATCH_SIZE_NON_FINISHERS;

      const isFinalBatch = currentNonWinnerIdx >= nonWinnersToProcess.length;

      console.log(
        `   🚀 Processing batch ${batchCount} (Final: ${isFinalBatch})`,
      );

      const recipientWallets: PublicKey[] = [];
      const amounts: BN[] = [];
      const nonFinishersChipUids: string[] = [];
      const runnerIdsInBatch: string[] = [];

      // Add winners to this batch
      for (const winner of batchWinners) {
        const prize = prizeShares.find(
          (p) => p.wallet === winner.wallet_address,
        );
        if (prize) {
          recipientWallets.push(new PublicKey(winner.wallet_address));
          amounts.push(prize.amount);
          runnerIdsInBatch.push(winner.id);
        }
      }

      // Add non-winners to this batch (they get 0 prize but update status in SC)
      for (const runner of batchNonWinners) {
        nonFinishersChipUids.push(runner.chip_uid);
        runnerIdsInBatch.push(runner.id);
      }

      if (recipientWallets.length === 0 && nonFinishersChipUids.length === 0) {
        if (isFinalBatch) {
          await markEventSettled(eventId);
        }
        break;
      }

      // Build and submit transaction
      const instructions = await buildProcessRefundsInstructions({
        eventId: eventId,
        programId: programId,
        vaultAddress: vaultAddress,
        adminWallet: getAdminKeypair().publicKey,
        recipientWallets,
        amounts,
        nonFinishers: nonFinishersChipUids,
        isFinalBatch,
      });

      const transaction = new Transaction().add(...instructions);
      const txSignature = await submitTransaction(transaction, [
        getAdminKeypair(),
      ]);

      console.log(`   ✅ Batch ${batchCount} confirmed: ${txSignature}`);

      // Update Supabase with tx signature for audit and idempotency
      await updateRunnersTxSignature(runnerIdsInBatch, txSignature);

      // Log for audit
      await logRefundTransaction(
        eventId,
        txSignature,
        batchWinners.length,
        batchNonWinners.length,
      );

      if (isFinalBatch) {
        await markEventSettled(eventId);
        processedEvents.add(eventId);
        console.log(`   ✅ Event ${eventId} fully settled!`);
      }
    }
  } catch (error) {
    console.error(`   ❌ Error processing event refund:`, error);
  }
}

/**
 * Update event status to "settled" in Supabase
 */
async function markEventSettled(eventId: string) {
  const { error } = await supabase
    .from("race_events")
    .update({
      status: "settled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (error) {
    console.error(`   ❌ Failed to update event status to settled:`, error);
  } else {
    console.log(`   ✓ Event status updated to settled`);
  }
}

/**
 * Update multiple runners with their prize distribution transaction signature
 * This is used for idempotency checking - to know which runners were included
 * in which prize distribution batch.
 */
async function updateRunnersTxSignature(
  runnerIds: string[],
  txSignature: string,
) {
  const { error } = await supabase
    .from("runners")
    .update({ prize_tx_signature: txSignature })
    .in("id", runnerIds);

  if (error) {
    console.error(
      `   ❌ Failed to update runners with prize tx signature:`,
      error,
    );
  }
}

/**
 * Log refund transaction details for audit trail
 */
async function logRefundTransaction(
  eventId: string,
  txSignature: string,
  finishers: number,
  nonFinishers: number,
) {
  try {
    const timestamp = new Date().toISOString();
    // Store in refund_logs table as audit trail
    await supabase.from("refund_logs").insert({
      event_id: eventId,
      tx_signature: txSignature,
      finishers_paid: finishers,
      non_finishers_refunded: nonFinishers,
      status: "confirmed",
      created_at: timestamp,
    });
  } catch (error) {
    console.error(`   ❌ Failed to log refund transaction:`, error);
  }
}

// ============================================================================
// Cron Scheduler Setup
// ============================================================================

let schedulerJob: cron.ScheduledTask | null = null;
let fraudDetectionJob: cron.ScheduledTask | null = null;

/**
 * Start the refund scheduler
 * Should be called once at backend startup
 */
export function startRefundScheduler() {
  try {
    console.log(`\n🕐 Setting up Refund Scheduler`);
    console.log(`   Interval: ${REFUND_SCHEDULER_INTERVAL}`);
    console.log(`   (every 1 minute, or per REFUND_SCHEDULER_INTERVAL env)`);

    // Schedule cron job for refunds
    schedulerJob = cron.schedule(REFUND_SCHEDULER_INTERVAL, () => {
      processCompletedEvents();
    });

    // Schedule cron job for optimistic cleanup (stuck transactions)
    cron.schedule("*/1 * * * *", () => {
      console.log(
        `\n🧹 [${new Date().toISOString()}] Running optimistic cleanup...`,
      );
      cleanupStuckTransactions();
    });

    // Schedule cron job for fraud detection (runs every hour)
    fraudDetectionJob = cron.schedule("0 * * * *", async () => {
      console.log(
        `\n🛡️ [${new Date().toISOString()}] Running fraud detection...`,
      );
      await autoDetectAndSlashFraud();
    });

    console.log(`✅ Refund scheduler started`);
    console.log(`✅ Fraud detection scheduler started (Hourly)`);
    console.log("");
  } catch (error) {
    console.error(`❌ Failed to start schedulers:`, error);
    throw error;
  }
}

/**
 * Stop the refund scheduler (cleanup)
 */
export function stopRefundScheduler() {
  if (schedulerJob) {
    schedulerJob.stop();
    console.log(`✅ Refund scheduler stopped`);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a fake Solana transaction signature (for testing)
 * Real signatures are 88 characters (base58)
 */
function generateFakeSignature(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let signature = "";
  for (let i = 0; i < 88; i++) {
    signature += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return signature;
}

/**
 * Manual trigger for testing (can be called via API endpoint)
 */
export async function manualTriggerRefunds() {
  console.log(`\n🚀 Manual refund trigger initiated`);
  await processCompletedEvents();
}
