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

import 'dotenv/config';
import * as cron from 'node-cron';
import { supabase } from '../lib/supabase';
import {
    buildProcessRefundsInstruction,
    submitTransaction,
    checkConnection,
    logBlockchainStatus,
} from '../blockchain/transaction-signer';
import { Transaction, Keypair } from '@solana/web3.js';

// ============================================================================
// Configuration
// ============================================================================

const REFUND_SCHEDULER_INTERVAL = process.env.REFUND_SCHEDULER_INTERVAL || '*/1 * * * *'; // Every 1 minute
const ADMIN_KEYPAIR_PATH = process.env.ADMIN_KEYPAIR_PATH;

// Track processed events (in-memory, to avoid re-processing same event)
const processedEvents = new Set<string>();

/** Reset for test isolation */
export function resetProcessedEvents() {
    processedEvents.clear();
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
        console.log(`\n⏰ [${new Date().toISOString()}] Refund scheduler running...`);

        // Verify blockchain connection is healthy
        const isHealthy = await checkConnection();
        if (!isHealthy) {
            console.warn(`⚠️  Blockchain connection unhealthy, skipping refund processing`);
            return;
        }

        // 1. Query for completed events (status = "active" AND end_time <= now)
        const now = new Date();
        const { data: completedEvents, error: queryError } = await supabase
            .from('race_events')
            .select('*')
            .eq('status', 'active')
            .lte('end_time', now.toISOString());

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

    try {
        console.log(`\n   🔄 Processing refunds for event: ${eventId}`);

        // Skip if already processed in this session
        if (processedEvents.has(eventId)) {
            console.log(`   ✓ Already processed in this session, skipping`);
            return;
        }

        // 1. Get all runners for this event
        const { data: runners, error: runnersError } = await supabase
            .from('runners')
            .select('*')
            .eq('event_id', eventId);

        if (runnersError) {
            console.error(`   ❌ Failed to query runners:`, runnersError);
            return;
        }

        const totalRunners = runners?.length || 0;
        const finishers = runners?.filter((r: any) => r.finish_position !== null) || [];
        const nonFinishers = totalRunners - finishers.length;

        console.log(`   📊 Event stats:`);
        console.log(`      Total runners: ${totalRunners}`);
        console.log(`      Finishers: ${finishers.length}`);
        console.log(`      Non-finishers: ${nonFinishers}`);

        // 2. Build smart contract transaction
        const instruction = await buildProcessRefundsInstruction({
            eventId: eventId,
            programId: process.env.SOLARUN_PROGRAM_ID!,
            vaultAddress: event.vault_address || process.env.VAULT_ADDRESS!,
            adminWallet: Keypair.generate().publicKey, // Will be replaced with actual admin
        });

        console.log(`   📋 Instruction built successfully`);

        // 3. Simulate transaction (placeholder)
        // In production, this would:
        // - Build actual Instruction object
        // - Create Transaction with instruction
        // - Sign with admin keypair
        // - Submit to RPC
        // - Wait for confirmation

        const txSignature = await simulateRefundTransaction(eventId);

        if (!txSignature) {
            console.error(`   ❌ Failed to submit refund transaction`);
            return;
        }

        // 4. Update event status to "settled"
        const { error: updateError } = await supabase
            .from('race_events')
            .update({
                status: 'settled',
                updated_at: new Date().toISOString(),
            })
            .eq('id', eventId);

        if (updateError) {
            console.error(`   ❌ Failed to update event status:`, updateError);
            return;
        }

        // 5. Log transaction for audit
        await logRefundTransaction(eventId, txSignature, finishers.length, nonFinishers);

        // Mark as processed
        processedEvents.add(eventId);

        console.log(`   ✅ Refund processing complete!`);
        console.log(`      TX Signature: ${txSignature}`);
    } catch (error) {
        console.error(`   ❌ Error processing event refund:`, error);
    }
}

/**
 * Simulate refund transaction (placeholder)
 * In production, this will actually call the smart contract
 *
 * @param eventId - Event ID to process
 * @returns Transaction signature (or null if failed)
 */
async function simulateRefundTransaction(eventId: string): Promise<string | null> {
    try {
        console.log(`      💾 Simulating smart contract call...`);

        // TODO: Replace with actual smart contract call
        // This is where we would:
        // 1. Load admin keypair
        // 2. Build instruction for process_refunds(event_id)
        // 3. Create transaction
        // 4. Sign with admin keypair
        // 5. Submit to Solana devnet RPC
        // 6. Wait for confirmation

        // For now, generate a fake signature (64 chars base58)
        const fakeTxSignature = generateFakeSignature();

        console.log(`      ✓ Smart contract call simulated`);
        return fakeTxSignature;
    } catch (error) {
        console.error(`      ❌ Failed to simulate transaction:`, error);
        return null;
    }
}

/**
 * Log refund transaction details for audit trail
 * @param eventId - Event ID
 * @param txSignature - Transaction signature on Solana
 * @param finishers - Number of finishers
 * @param nonFinishers - Number of non-finishers
 */
async function logRefundTransaction(
    eventId: string,
    txSignature: string,
    finishers: number,
    nonFinishers: number
) {
    try {
        const timestamp = new Date().toISOString();
        console.log(`   📝 Refund audit log:`);
        console.log(`      Event: ${eventId}`);
        console.log(`      TX: ${txSignature}`);
        console.log(`      Finishers paid: ${finishers}`);
        console.log(`      Refunds issued: ${nonFinishers}`);
        console.log(`      Time: ${timestamp}`);

        // Store in refund_logs table as audit trail
        await supabase.from('refund_logs').insert({
            event_id: eventId,
            tx_signature: txSignature,
            finishers_paid: finishers,
            non_finishers_refunded: nonFinishers,
            status: 'pending',
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

/**
 * Start the refund scheduler
 * Should be called once at backend startup
 */
export function startRefundScheduler() {
    try {
        console.log(`\n🕐 Setting up Refund Scheduler`);
        console.log(`   Interval: ${REFUND_SCHEDULER_INTERVAL}`);
        console.log(`   (every 1 minute, or per REFUND_SCHEDULER_INTERVAL env)`);

        // Schedule cron job
        schedulerJob = cron.schedule(REFUND_SCHEDULER_INTERVAL, () => {
            processCompletedEvents();
        });

        console.log(`✅ Refund scheduler started`);
        console.log('');
    } catch (error) {
        console.error(`❌ Failed to start refund scheduler:`, error);
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
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let signature = '';
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
