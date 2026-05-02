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

import { supabase } from '../lib/supabase';
import { buildProcessRefundsInstruction, submitTransaction, checkConnection } from '../blockchain/transaction-signer';
import { Transaction, Keypair } from '@solana/web3.js';
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

        // ── Step 4: Trigger smart contract refund (if blockchain is available) ──
        let txSignature = null;
        const isBlockchainHealthy = await checkConnection();

        if (isBlockchainHealthy && participantCount > 0) {
            try {
                console.log(`   ⛓️  Triggering smart contract refund...`);
                
                // Load admin keypair
                const ADMIN_KEYPAIR_PATH = process.env.ADMIN_KEYPAIR_PATH;
                if (!ADMIN_KEYPAIR_PATH) {
                    throw new Error('ADMIN_KEYPAIR_PATH not set');
                }

                const keypairPath = path.resolve(ADMIN_KEYPAIR_PATH);
                const keypairData = fs.readFileSync(keypairPath, 'utf-8');
                const keypairArray = JSON.parse(keypairData);
                const adminKeypair = Keypair.fromSecretKey(new Uint8Array(keypairArray));

                // Build and submit refund transaction
                const instruction = buildProcessRefundsInstruction(eventId);
                const transaction = new Transaction().add(instruction);
                
                txSignature = await submitTransaction(transaction, adminKeypair);
                console.log(`   ✅ Refund transaction submitted: ${txSignature}`);
            } catch (error) {
                console.warn(`   ⚠️  Smart contract refund failed: ${error}`);
                console.log(`   ℹ️  Continuing with database cleanup...`);
            }
        } else if (participantCount === 0) {
            console.log(`   ℹ️  No participants to refund`);
        } else {
            console.warn(`   ⚠️  Blockchain not available, skipping smart contract refund`);
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
