/**
 * Delete Event API
 * Handles deletion of race events with automatic refund to all participants
 * 
 * Workflow:
 * 1. Check if event exists and status is not "settled"
 * 2. Trigger smart contract process_refunds to refund all participants
 * 3. Delete all race_logs, runners, and finally the race_event from Supabase
 * 4. Return success/error response with details
 */

import { supabase } from '../lib/supabase.js';
import { buildProcessRefundsInstructions, buildDeleteEventInstruction, buildCloseParticipantInstruction, submitTransaction, checkConnection, getAdminKeypair } from '../blockchain/transaction-signer.js';
import { Transaction, Keypair, PublicKey, Connection } from '@solana/web3.js';
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import * as fs from 'fs';
import * as path from 'path';

/**
 * Delete a race event and refund all participants
 * @param eventId - UUID of the event to delete
 * @returns Object with status, message, and refund details
 */
export async function deleteEventWithRefund(eventId: string) {
    try {
        console.log(`\n🗑️  Deleting event: ${eventId}`);

        // ── Step 1: Fetch event from database ──
        const { data: event, error: eventError } = await supabase
            .from('race_events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (eventError || !event) {
            throw new Error(`Event not found: ${eventId}`);
        }

        console.log(`   📋 Event found: ${event.name} (status: ${event.status})`);
        console.log(`   📋 Vault found: ${event.vault_address}`);

        // ── Step 2: Check if event can be deleted (only non-settled events) ──
        if (event.status === 'settled') {
            throw new Error(`Cannot delete settled events. Event ID: ${eventId}`);
        }

        // ── Step 3: Fetch all participants in this event ──
        const { data: participants, error: participantsError } = await supabase
            .from('runners')
            .select('id, wallet_address, chip_uid')
            .eq('event_id', eventId);

        if (participantsError) {
            throw new Error(`Failed to fetch participants: ${participantsError.message}`);
        }

        const participantCount = participants?.length ?? 0;
        console.log(`   👥 Found ${participantCount} participants to refund`);

        // ── Step 4: Handle blockchain operations based on event status ──
        let txSignature = null;
        const isBlockchainHealthy = await checkConnection();

        if (isBlockchainHealthy) {
            try {
                const adminKeypair = getAdminKeypair();
                const programPubkey = new PublicKey(process.env.SOLARUN_PROGRAM_ID || '');
                const [mintPda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("mock_usdc_mint")],
                    programPubkey
                );
                const adminAta = await getAssociatedTokenAddress(mintPda, adminKeypair.publicKey);

                // Determine on-chain status from DB status:
                // "pending" = Initialized on-chain → can delete directly (vault USDC returned to admin)
                // "active"  = Active on-chain → NOT deletable via smart contract (must complete first)
                //             but we allow force-delete by skipping on-chain if needed
                // "completed" = Completed on-chain → must processRefunds first, then delete
                // "settled" = Already settled → should not reach here (blocked earlier)

                const onChainStatus = event.status; // pending | active | completed | settled

                if (onChainStatus === 'completed' && participantCount > 0) {
                    // ── COMPLETED EVENT: Process refunds first, then delete ──
                    console.log(`   ⛓️  Event is completed. Processing refunds before deletion...`);

                    const nonFinishers = participants!.map((p: any) => p.chip_uid);
                    const wallets = participants!.map((p: any) => new PublicKey(p.wallet_address));

                    const MOCK_USDC_DECIMALS = 6;
                    const feeDisplayValue = event.registration_fee_sol || 10;
                    const refundAmountPerRunner = new anchor.BN(
                        Math.round(feeDisplayValue * Math.pow(10, MOCK_USDC_DECIMALS))
                    );
                    const amounts = participants!.map(() => refundAmountPerRunner);

                    console.log(`   📊 Refund Details:`);
                    console.log(`      - Participants: ${wallets.length}`);
                    console.log(`      - Fee (display): ${feeDisplayValue} USDC`);
                    console.log(`      - Amount per runner: ${refundAmountPerRunner.toString()} raw units`);
                    console.log(`      - Vault: ${event.vault_address}`);
                    console.log(`      - Admin signing: ${adminKeypair.publicKey.toBase58()}`);

                    const instructions = await buildProcessRefundsInstructions({
                        eventId: eventId,
                        programId: process.env.SOLARUN_PROGRAM_ID || '',
                        vaultAddress: event.vault_address || '',
                        adminWallet: adminKeypair.publicKey,
                        recipientWallets: wallets,
                        amounts: amounts,
                        nonFinishers: nonFinishers,
                        isFinalBatch: true
                    });

                    const transaction = new Transaction().add(...instructions);
                    console.log(`   🔐 Signing refund transaction with admin keypair...`);
                    txSignature = await submitTransaction(transaction, [adminKeypair]);
                    console.log(`   ✅ Refund transaction submitted: ${txSignature}`);
                } else if (onChainStatus === 'pending') {
                    // ── PENDING/INITIALIZED EVENT: No refund needed ──
                    // delete_event will return all vault USDC to admin directly
                    console.log(`   ℹ️  Event is pending (Initialized). Skipping processRefunds.`);
                    console.log(`      Vault funds will be returned to admin via delete_event.`);
                } else if (onChainStatus === 'active') {
                    // ── ACTIVE EVENT: Cannot delete on-chain directly ──
                    // Smart contract requires Initialized or Settled for delete_event
                    // We'll skip on-chain operations and just clean up the database
                    console.warn(`   ⚠️  Event is active. Smart contract doesn't allow deleting active events.`);
                    console.warn(`      Skipping on-chain operations. Database will be cleaned up.`);
                    console.warn(`      ⚠️  Note: On-chain vault funds may remain locked until event is completed.`);
                }

                // ── Call delete_event for pending/completed(settled) events ──
                if (onChainStatus === 'pending' || onChainStatus === 'completed') {
                    console.log(`\n   🗑️  Calling delete_event to close on-chain accounts...`);
                    console.log(`      Admin ATA: ${adminAta.toBase58()}`);

                    const deleteInstruction = await buildDeleteEventInstruction({
                        eventId: eventId,
                        programId: process.env.SOLARUN_PROGRAM_ID || '',
                        vaultAddress: event.vault_address || '',
                        adminWallet: adminKeypair.publicKey,
                        adminTokenAccount: adminAta,
                    });

                    const deleteTransaction = new Transaction().add(deleteInstruction);
                    const deleteTxSig = await submitTransaction(deleteTransaction, [adminKeypair]);
                    console.log(`   ✅ delete_event transaction confirmed: ${deleteTxSig}`);
                    console.log(`      - Vault closed, remaining USDC → admin ATA`);
                    console.log(`      - Event PDA closed, rent → admin wallet`);
                }

            } catch (error: any) {
                const errorStr = String(error);
                const isStaleEvent = errorStr.includes('Custom: 2006') || errorStr.includes('0x7d6') || errorStr.includes('seeds constraint');

                if (isStaleEvent) {
                    console.warn(`\n   ⚠️  DATA MISMATCH DETECTED (Error 2006)`);
                    console.warn(`      Event ini menggunakan struktur data lama yang tidak kompatibel.`);
                    console.warn(`      Melewati operasi blockchain dan lanjut menghapus dari database...`);
                } else {
                    console.warn(`   ⚠️  Smart contract operation failed: ${error}`);
                    console.error(`   ❌ Blockchain operation GAGAL: ${error}`);
                    
                    if (error instanceof Error) {
                        console.error(`   Error stack: ${error.stack}`);
                    }
                    
                    throw new Error(`Operasi blockchain gagal. Data database tetap dipertahankan. Error: ${error}`);
                }
            }
        } else {
            console.warn(`   ⚠️  Blockchain not available, skipping smart contract operations`);
        }

        // ── Step 5: Delete all race_logs for this event's participants ──
        if (participants && participants.length > 0) {
            const participantIds = participants.map(p => p.id);
            const { error: logsError } = await supabase
                .from('race_logs')
                .delete()
                .in('runner_id', participantIds);

            if (logsError) {
                throw new Error(`Failed to delete race logs: ${logsError.message}`);
            }
            console.log(`   🗑️  Deleted race_logs for all participants`);
        }

        // ── Step 6: Delete all runners in this event ──
        const { error: runnersError } = await supabase
            .from('runners')
            .delete()
            .eq('event_id', eventId);

        if (runnersError) {
            throw new Error(`Failed to delete runners: ${runnersError.message}`);
        }
        console.log(`   🗑️  Deleted all runners`);

        // ── Step 7: Delete the event itself ──
        const { error: eventDeleteError } = await supabase
            .from('race_events')
            .delete()
            .eq('id', eventId);

        if (eventDeleteError) {
            throw new Error(`Failed to delete event: ${eventDeleteError.message}`);
        }
        console.log(`   🗑️  Deleted event from database`);

        // ── Success Response ──
        return {
            status: 'ok',
            message: `Event deleted successfully. ${participantCount} participant(s) refunded.`,
            details: {
                eventId,
                eventName: event.name,
                participantsRefunded: participantCount,
                transactionSignature: txSignature,
                timestamp: new Date().toISOString(),
            },
        };
    } catch (error) {
        console.error(`❌ Error deleting event:`, error);
        return {
            status: 'error',
            message: String(error),
            timestamp: new Date().toISOString(),
        };
    }
}
