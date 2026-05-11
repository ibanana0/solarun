/**
 * Event Completion Listener / Webhook Handler
 * Triggered when IoT system determines event is complete
 * 
 * Responsibilities:
 * 1. Mark event as ready for completion in database
 * 2. Execute or queue fee distribution on blockchain (complete_race instruction)
 * 3. Update database with results
 * 
 * IMPORTANT: Backend can act as a "crank" to execute fee distribution
 * This requires the backend to have a private key with SOL for gas fees
 */

import { supabase } from '../lib/supabase';
import { updateFeeDistributionStatus, recordFeeDistribution, getProtocolConfig } from '../lib/fee-distribution-service';
import { markStakeAsReturned } from '../lib/staking-service';
import { requireValidVault } from '../lib/fraud-detection-service';

export interface EventCompletionRequest {
    event_id: string;
    completion_timestamp: string;  // When IoT detected completion
    finishers: Array<{
        runner_id: string;
        position: number;
        finish_time: number;
    }>;
}

export interface EventCompletionResponse {
    success: boolean;
    message: string;
    event_id: string;
    fee_distribution_status: string;
    next_steps?: string;
}

/**
 * Handle event completion webhook from IoT system
 * 
 * Flow:
 * 1. Update event status to "completed" in database
 * 2. Record finish times and positions
 * 3. Calculate fee distribution
 * 4. Either:
 *    a) Execute fee distribution on-chain immediately (if backend is crank)
 *    b) Queue for processing and return to frontend for manual execution
 * 5. Update database with results
 */
export async function handleEventCompletion(
    request: EventCompletionRequest
): Promise<EventCompletionResponse> {
    try {
        // 1. Verify event exists and is active
        const { data: event, error: eventError } = await supabase
            .from('race_events')
            .select('*')
            .eq('id', request.event_id)
            .single();

        if (eventError) {
            throw new Error(`Event not found: ${request.event_id}`);
        }

        if (event.status !== 'active') {
            throw new Error(`Event is not active. Current status: ${event.status}`);
        }

        // CRITICAL: Verify vault before any fee distribution
        await requireValidVault(request.event_id);

        // 2. Update event status to completed
        const { error: updateError } = await supabase
            .from('race_events')
            .update({
                status: 'completed',
                updated_at: new Date().toISOString(),
            })
            .eq('id', request.event_id);

        if (updateError) {
            throw new Error(`Failed to update event status: ${updateError.message}`);
        }

        // 3. Record finisher information
        await recordFinishers(request.event_id, request.finishers);

        // 4. Calculate expected fee distribution
        const protocolConfig = await getProtocolConfig();
        if (!protocolConfig) {
            throw new Error('Protocol configuration not found');
        }

        const totalVault = event.total_deposits + event.stake_amount;
        const feeAmount = Math.floor((totalVault * protocolConfig.protocol_fee_bps) / 10000);
        const adminNetAmount = totalVault - feeAmount;

        // 5. Create fee distribution record (pending blockchain execution)
        try {
            await recordFeeDistribution(
                request.event_id,
                'PENDING', // Will be updated with actual tx signature
                totalVault,
                feeAmount,
                adminNetAmount,
                protocolConfig.treasury_address,
                'pending'
            );
        } catch (recordError) {
            console.error(`Failed to record fee distribution: ${recordError}`);
            // Don't fail completely - continue
        }

        // ========================================================================
        // CRITICAL SECTION: Fee Distribution Execution
        // ========================================================================
        // 
        // OPTION 1: Backend acts as CRANK (executes transaction)
        // - Requires: private key stored in .env (BACKEND_PRIVATE_KEY)
        // - Execute: complete_race instruction to split fees
        // - WARNING: Private key exposure risk - use secure vault in production
        //
        // OPTION 2: Queue for Manual Execution
        // - Frontend or admin initiates fee distribution manually
        // - Backend queues the event for processing
        // - Less immediate but more secure
        //
        // Currently configured for: OPTION 2 (queued)
        // To enable OPTION 1: Set BACKEND_ACTS_AS_CRANK=true in .env
        // And provide BACKEND_PRIVATE_KEY in .env
        // ========================================================================

        const backendActsAsCrank = process.env.BACKEND_ACTS_AS_CRANK === 'true';

        if (backendActsAsCrank) {
            // TODO: Implement blockchain execution
            // 1. Load backend private key from secure location
            //    const backendPrivateKey = process.env.BACKEND_PRIVATE_KEY;
            //    if (!backendPrivateKey) throw new Error('Backend private key not configured');
            //
            // 2. Create Anchor provider with backend keypair
            //    const backendKeypair = Keypair.fromSecretKey(Buffer.from(backendPrivateKey, 'base64'));
            //    const provider = new AnchorProvider(connection, new Wallet(backendKeypair), {});
            //
            // 3. Execute complete_race instruction
            //    const tx = await program.methods.completeRace(request.event_id)
            //        .accounts({...})
            //        .rpc();
            //
            // 4. Wait for confirmation and update database
            //    await updateFeeDistributionStatus(request.event_id, 'completed', tx);
            //    await markStakeAsReturned(request.event_id, event.admin);

            console.log(`[handleEventCompletion] Backend crank execution not yet implemented`);

            return {
                success: true,
                message: 'Event completed. Fee distribution pending blockchain execution.',
                event_id: request.event_id,
                fee_distribution_status: 'pending',
                next_steps: 'Backend should execute complete_race instruction (crank functionality)',
            };
        } else {
            // Option 2: Queue for manual execution
            return {
                success: true,
                message: 'Event completed successfully. Awaiting fee distribution.',
                event_id: request.event_id,
                fee_distribution_status: 'pending',
                next_steps: 'Frontend or admin should call complete_race on blockchain to distribute fees',
            };
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[handleEventCompletion] ${errorMessage}`);
        
        // Try to update fee distribution status to failed
        try {
            await updateFeeDistributionStatus(
                request.event_id,
                'failed',
                undefined,
                errorMessage
            );
        } catch (updateError) {
            console.error(`Failed to update fee distribution status: ${updateError}`);
        }

        throw error;
    }
}

/**
 * Record finish times and positions for participants
 */
async function recordFinishers(
    eventId: string,
    finishers: Array<{
        runner_id: string;
        position: number;
        finish_time: number;
    }>
): Promise<void> {
    for (const finisher of finishers) {
        const { error } = await supabase
            .from('runners')
            .update({
                status: 'finished',
                finish_position: finisher.position,
                updated_at: new Date().toISOString(),
            })
            .eq('id', finisher.runner_id);

        if (error) {
            console.error(`Failed to update finisher ${finisher.runner_id}: ${error.message}`);
        }
    }
}

/**
 * Get pending fee distributions (for manual execution)
 * Frontend can call this to see which events need fee distribution
 */
export async function getPendingFeeDistributions() {
    const { data, error } = await supabase
        .from('fee_distribution')
        .select(`
            *,
            race_events!fee_distribution_event_id(
                id, name, admin, total_deposits, stake_amount, status
            )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error) {
        throw new Error(`Failed to get pending distributions: ${error.message}`);
    }

    return data;
}

/**
 * Confirm fee distribution on blockchain
 * Called after manual complete_race execution
 */
export async function confirmFeeDistribution(
    eventId: string,
    txSignature: string,
    adminWallet: string
): Promise<void> {
    try {
        // Update fee distribution record with tx signature
        await updateFeeDistributionStatus(
            eventId,
            'completed',
            txSignature
        );

        // Mark stake as returned
        await markStakeAsReturned(eventId, adminWallet);

        console.log(`[confirmFeeDistribution] Fee distribution confirmed | event: ${eventId} | tx: ${txSignature}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[confirmFeeDistribution] ${errorMessage}`);
        throw error;
    }
}

/**
 * Handle failed event (refund participants, slash admin stake)
 * Called when event needs to be cancelled or fails
 */
export async function handleEventFailure(
    eventId: string,
    failureReason: string
): Promise<void> {
    try {
        const { error } = await supabase
            .from('race_events')
            .update({
                status: 'completed', // Mark as completed but indicate failure reason elsewhere
                updated_at: new Date().toISOString(),
            })
            .eq('id', eventId);

        if (error) {
            throw new Error(`Failed to mark event as failed: ${error.message}`);
        }

        // TODO: Queue slash_and_refund instruction
        // This should refund all participants and slash admin stake to treasury
        console.log(`[handleEventFailure] Event failure processed: ${failureReason}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[handleEventFailure] ${errorMessage}`);
        throw error;
    }
}
