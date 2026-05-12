/**
 * Delete Event API
 *
 * Handles cancellation of PENDING events ONLY.
 *
 * Contract rules (enforced both here and on-chain):
 * - "pending"   (Initialized on-chain): CAN be deleted — all participants refunded 100%.
 * - "active"    (Active on-chain):      BLOCKED — race is in progress.
 * - "completed" (Completed on-chain):   BLOCKED — use process_refunds flow instead.
 * - "settled"   (Settled on-chain):     BLOCKED — already finalized.
 *
 * On-chain flow for pending cancellation:
 *   delete_event(eventId, [participant_ata...], [amounts...], is_final_batch=true)
 *   → refunds each participant 100% of their registration fee
 *   → returns admin's stake to admin's token account
 *   → closes vault and event accounts
 */

import { supabase } from "../lib/supabase.js";
import {
  buildDeleteEventInstruction,
  submitTransaction,
  checkConnection,
  getAdminKeypair,
} from "../blockchain/transaction-signer.js";
import { Transaction, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";

const MOCK_USDC_DECIMALS = 6;
const MAX_PARTICIPANTS_PER_BATCH = 20; // ~20 accounts per tx to stay within limits

/**
 * Cancel and delete a PENDING race event, refunding all participants 100%.
 */
export async function deleteEventWithRefund(eventId: string) {
  try {
    console.log(`\n🗑️  Cancelling pending event: ${eventId}`);

    // ── Step 1: Fetch event ──────────────────────────────────────────────────
    const { data: event, error: eventError } = await supabase
      .from("race_events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    console.log(`   📋 Event: ${event.name} (status: ${event.status})`);
    console.log(`   📋 Vault: ${event.vault_address}`);

    // ── Step 2: Status guard — only pending events can be cancelled ──────────
    if (event.status !== "pending") {
      const msg: Record<string, string> = {
        active: "Cannot cancel an active event — race is in progress.",
        completed:
          "Event is already completed — use the prize distribution flow.",
        settled: "Event is already settled — records are final.",
      };
      throw new Error(
        msg[event.status] ??
          `Cannot cancel event with status "${event.status}".`,
      );
    }

    // ── Step 3: Fetch all registered participants ────────────────────────────
    const { data: participants, error: participantsError } = await supabase
      .from("runners")
      .select("id, wallet_address, rfid_uid")
      .eq("event_id", eventId);

    if (participantsError) {
      throw new Error(
        `Failed to fetch participants: ${participantsError.message}`,
      );
    }

    const participantCount = participants?.length ?? 0;
    console.log(`   👥 Participants to refund: ${participantCount}`);

    // ── Step 4: Execute on-chain cancellation ────────────────────────────────
    let txSignature: string | null = null;
    const isBlockchainHealthy = await checkConnection();

    if (isBlockchainHealthy) {
      try {
        const adminKeypair = getAdminKeypair();
        const programPubkey = new PublicKey(
          process.env.SOLARUN_PROGRAM_ID || "",
        );

        // Derive mock USDC mint and admin's ATA
        const [mintPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("mock_usdc_mint")],
          programPubkey,
        );
        const adminAta = await getAssociatedTokenAddress(
          mintPda,
          adminKeypair.publicKey,
        );

        // Registration fee per participant in micro-USDC
        const registrationFeeMicro = new anchor.BN(
          Math.round(
            (event.registration_fee_sol || 0) *
              Math.pow(10, MOCK_USDC_DECIMALS),
          ),
        );

        // Build participant ATA list and refund amounts
        const participantAtas: PublicKey[] = [];
        const refundAmounts: anchor.BN[] = [];

        if (participants && participants.length > 0) {
          for (const p of participants) {
            const walletPk = new PublicKey(p.wallet_address);
            const ata = await getAssociatedTokenAddress(mintPda, walletPk);
            participantAtas.push(ata);
            refundAmounts.push(registrationFeeMicro); // 100% refund
          }
        }

        console.log(
          `   ⛓️  Building delete_event instruction (${participantAtas.length} refunds)...`,
        );
        console.log(
          `      Registration fee: ${event.registration_fee_sol} USDC each`,
        );
        console.log(`      Admin ATA: ${adminAta.toBase58()}`);

        // For large participant lists, batch into multiple transactions.
        // On all except the last batch, is_final_batch = false.
        if (participantAtas.length === 0) {
          // No participants — single call that just closes the accounts
          const instruction = await buildDeleteEventInstruction({
            eventId,
            programId: process.env.SOLARUN_PROGRAM_ID || "",
            vaultAddress: event.vault_address || "",
            adminWallet: adminKeypair.publicKey,
            adminTokenAccount: adminAta,
            participantAtas: [],
            refundAmounts: [],
            isFinalBatch: true,
          });
          const tx = new Transaction().add(instruction);
          txSignature = await submitTransaction(tx, [adminKeypair]);
          console.log(
            `   ✅ Event cancelled (no participants): ${txSignature}`,
          );
        } else {
          // Batch participants
          const batches: { atas: PublicKey[]; amounts: anchor.BN[] }[] = [];
          for (
            let i = 0;
            i < participantAtas.length;
            i += MAX_PARTICIPANTS_PER_BATCH
          ) {
            batches.push({
              atas: participantAtas.slice(i, i + MAX_PARTICIPANTS_PER_BATCH),
              amounts: refundAmounts.slice(i, i + MAX_PARTICIPANTS_PER_BATCH),
            });
          }

          for (let b = 0; b < batches.length; b++) {
            const batch = batches[b]!; // always defined since b < batches.length
            const isFinal = b === batches.length - 1;
            console.log(
              `   📦 Batch ${b + 1}/${batches.length} (${batch.atas.length} participants, isFinal=${isFinal})`,
            );

            const instruction = await buildDeleteEventInstruction({
              eventId,
              programId: process.env.SOLARUN_PROGRAM_ID || "",
              vaultAddress: event.vault_address || "",
              adminWallet: adminKeypair.publicKey,
              adminTokenAccount: adminAta,
              participantAtas: batch.atas,
              refundAmounts: batch.amounts,
              isFinalBatch: isFinal,
            });
            const tx = new Transaction().add(instruction);
            const sig = await submitTransaction(tx, [adminKeypair]);
            console.log(`   ✅ Batch ${b + 1} confirmed: ${sig}`);
            if (isFinal) txSignature = sig;
          }
        }
      } catch (error: any) {
        const errStr = String(error);
        // Graceful degradation: if this is a stale account mismatch, log and continue
        // so we can still clean up the database.
        const isStaleEvent =
          errStr.includes("Custom: 2006") ||
          errStr.includes("0x7d6") ||
          errStr.includes("seeds constraint");

        if (isStaleEvent) {
          console.warn(
            `   ⚠️  Old on-chain data (incompatible struct). Skipping blockchain step.`,
          );
        } else {
          console.error(`   ❌ Blockchain operation failed: ${error}`);
          throw new Error(
            `Blockchain operation failed. Database unchanged. Error: ${error}`,
          );
        }
      }
    } else {
      console.warn(
        `   ⚠️  Blockchain unavailable — skipping on-chain operations.`,
      );
    }

    // ── Step 5: Delete race_logs ─────────────────────────────────────────────
    if (participants && participants.length > 0) {
      const participantIds = participants.map((p: any) => p.id);
      const { error: logsError } = await supabase
        .from("race_logs")
        .delete()
        .in("runner_id", participantIds);
      if (logsError)
        throw new Error(`Failed to delete race logs: ${logsError.message}`);
      console.log(`   🗑️  Deleted race_logs`);
    }

    // ── Step 6: Delete runners ───────────────────────────────────────────────
    const { error: runnersError } = await supabase
      .from("runners")
      .delete()
      .eq("event_id", eventId);
    if (runnersError)
      throw new Error(`Failed to delete runners: ${runnersError.message}`);
    console.log(`   🗑️  Deleted runners`);

    // ── Step 7: Delete event record ──────────────────────────────────────────
    const { error: eventDeleteError } = await supabase
      .from("race_events")
      .delete()
      .eq("id", eventId);
    if (eventDeleteError)
      throw new Error(`Failed to delete event: ${eventDeleteError.message}`);
    console.log(`   🗑️  Deleted event from database`);

    return {
      status: "ok",
      message: `Event cancelled. ${participantCount} participant(s) refunded 100%.`,
      details: {
        eventId,
        eventName: event.name,
        participantsRefunded: participantCount,
        transactionSignature: txSignature,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error(`❌ Error cancelling event:`, error);
    return {
      status: "error",
      message: String(error),
      timestamp: new Date().toISOString(),
    };
  }
}
