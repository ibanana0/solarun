/**
 * Checkpoint Validator
 * 
 * Validates incoming RFID checkpoint data against business rules:
 * 1. Runner must exist in DB for the active event
 * 2. Checkpoint order must be sequential (0 → 1 → 2, no skipping)
 * 3. No duplicate taps within 30 seconds
 * 4. Status transitions: registered → running → finished
 */
import { supabase } from '../lib/supabase';

// ============================================================================
// Types
// ============================================================================

export interface CheckpointMessage {
    rfid_uid: string;
    checkpoint_id: number;
    timestamp: string | number; // ISO 8601 string or epoch ms
    event_id?: string; // optional, defaults to active event
}

export interface ValidationResult {
    valid: boolean;
    error?: string;
    runner_id?: string;
    is_finish?: boolean;
    finish_position?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DUPLICATE_TAP_THRESHOLD_SECONDS = 30;
const CHECKPOINT_START = 0;

// ============================================================================
// Validator
// ============================================================================

/**
 * Validate a checkpoint message and process it if valid.
 * Returns a ValidationResult indicating success or failure with reason.
 */
export async function validateCheckpoint(msg: CheckpointMessage): Promise<ValidationResult> {
    const { checkpoint_id } = msg;
    const rfid_uid = (msg.rfid_uid || '').trim(); // Remove .toUpperCase() to support case-sensitivity

    // Normalize timestamp: accept both epoch ms (number) and ISO string
    const timestamp = typeof msg.timestamp === 'number'
        ? new Date(msg.timestamp).toISOString()
        : msg.timestamp;

    // --- Input validation ---
    if (!rfid_uid || rfid_uid.length !== 4) {
        console.log(`[Validator] Validation failed: rfid_uid must be exactly 4 characters. Received: "${msg.rfid_uid}"`);
        return { valid: false, error: 'rfid_uid must be exactly 4 characters' };
    }

    if (checkpoint_id < CHECKPOINT_START) {
        console.log(`[Validator] Validation failed: Invalid checkpoint_id: ${checkpoint_id}`);
        return { valid: false, error: `Invalid checkpoint_id: ${checkpoint_id}. Cannot be negative.` };
    }

    if (!timestamp) {
        console.log(`[Validator] Validation failed: Missing timestamp`);
        return { valid: false, error: 'Missing timestamp' };
    }

    // --- Find runner by rfid_uid ---
    // Strategy: 
    // 1. Try to find the runner in the specific event_id provided by sensor
    // 2. Fallback: If not found or event_id missing, search for this rfid_uid in ANY currently ACTIVE event

    let runner = null;

    if (msg.event_id) {
        const { data: specificRunners } = await supabase
            .from('runners')
            .select('id, status, rfid_uid, event_id, finish_position')
            .eq('rfid_uid', rfid_uid)
            .eq('event_id', msg.event_id)
            .limit(1);

        if (specificRunners && specificRunners.length > 0) {
            runner = specificRunners[0];
            console.log(`[Validator] 🎯 Found runner ${rfid_uid} in specific event: ${msg.event_id}`);
        }
    }

    if (!runner) {
        // FALLBACK: Search in any active event
        console.log(`[Validator] 🔍 Runner not found in specific event. Searching for "${rfid_uid}" in all ACTIVE events...`);

        const { data: activeRunners, error: fallbackError } = await supabase
            .from('runners')
            .select('id, status, rfid_uid, event_id, finish_position, race_events!inner(status)')
            .eq('rfid_uid', rfid_uid)
            .eq('race_events.status', 'active')
            .limit(1);

        if (fallbackError) {
            console.error('[Validator] Fallback query error:', fallbackError.message);
        }

        if (activeRunners && activeRunners.length > 0) {
            runner = activeRunners[0];
            console.log(`[Validator] ✨ Smart Match Success: Found runner ${rfid_uid} in active event: ${runner.event_id}`);
        }
    }

    if (!runner) {
        return { valid: false, error: `Runner "${rfid_uid}" is not registered in any active event.` };
    }

    // --- Check Event Cut-off Logic & Checkpoints ---
    const { data: event, error: eventError } = await supabase
        .from('race_events')
        .select('status, end_time, checkpoints_config')
        .eq('id', runner.event_id)
        .maybeSingle();

    if (eventError || !event) {
        return { valid: false, error: `Failed to query event for runner` };
    }

    if (event.status !== 'active') {
        return { valid: false, error: `Event is not active (current status: ${event.status})` };
    }

    if (event.end_time) {
        const cutoffTime = new Date(event.end_time).getTime();
        if (Date.now() > cutoffTime) {
            console.log(`[Validator] Cutoff reached for event ${runner.event_id}. Tap rejected.`);
            return { valid: false, error: "Race duration has ended" };
        }
    }

    // Determine max checkpoint
    let maxCheckpoint = 2; // Default fallback
    if (event.checkpoints_config && Array.isArray(event.checkpoints_config)) {
        maxCheckpoint = Math.max(0, event.checkpoints_config.length - 1);
    }
    
    if (checkpoint_id > maxCheckpoint) {
        console.log(`[Validator] Validation failed: Invalid checkpoint_id: ${checkpoint_id} (Max is ${maxCheckpoint})`);
        return { valid: false, error: `Invalid checkpoint_id: ${checkpoint_id}. Max is ${maxCheckpoint}.` };
    }
    
    const isFinishCheckpoint = checkpoint_id === maxCheckpoint;

    // --- Check runner is not already finished or disqualified ---
    if (runner.status === 'finished') {
        return { valid: false, error: `Runner ${rfid_uid} has already finished` };
    }

    if (runner.status === 'disqualified') {
        return { valid: false, error: `Runner ${rfid_uid} is disqualified` };
    }

    // --- Check duplicate taps (same checkpoint within 30s) — check BEFORE order to give specific error ---
    const dupResult = await checkDuplicateTap(runner.id, checkpoint_id, timestamp);
    if (!dupResult.valid) {
        return dupResult;
    }

    // --- Validate checkpoint order ---
    const orderResult = await validateCheckpointOrder(runner.id, checkpoint_id);
    if (!orderResult.valid) {
        return orderResult;
    }

    // --- All validations passed — record the checkpoint ---
    const recordResult = await recordCheckpoint(runner.id, runner.event_id, rfid_uid, checkpoint_id, timestamp, isFinishCheckpoint);
    return recordResult;
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Validate that checkpoints arrive in order (0 → 1 → 2).
 * Cannot skip checkpoints.
 */
async function validateCheckpointOrder(runnerId: string, checkpointId: number): Promise<ValidationResult> {
    // Get the latest checkpoint for this runner
    const { data: lastLog, error } = await supabase
        .from('race_logs')
        .select('checkpoint_id')
        .eq('runner_id', runnerId)
        .order('checkpoint_id', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('[Validator] DB error querying race_logs:', error.message);
        return { valid: false, error: `Database error: ${error.message}` };
    }

    const lastCheckpoint = lastLog?.checkpoint_id ?? -1; // -1 = no checkpoints yet

    // Must be the next sequential checkpoint
    if (checkpointId !== lastCheckpoint + 1) {
        return {
            valid: false,
            error: `Invalid checkpoint order: received ${checkpointId}, expected ${lastCheckpoint + 1}`,
        };
    }

    return { valid: true };
}

/**
 * Reject duplicate taps: same runner, same checkpoint, within 30 seconds.
 */
async function checkDuplicateTap(runnerId: string, checkpointId: number, timestamp: string): Promise<ValidationResult> {
    const cutoffTime = new Date(new Date(timestamp).getTime() - DUPLICATE_TAP_THRESHOLD_SECONDS * 1000).toISOString();

    const { data: recentLogs, error } = await supabase
        .from('race_logs')
        .select('id')
        .eq('runner_id', runnerId)
        .eq('checkpoint_id', checkpointId)
        .gte('timestamp', cutoffTime)
        .limit(1);

    if (error) {
        console.error('[Validator] DB error checking duplicates:', error.message);
        return { valid: false, error: `Database error: ${error.message}` };
    }

    if (recentLogs && recentLogs.length > 0) {
        return {
            valid: false,
            error: `Duplicate tap: runner already tapped checkpoint ${checkpointId} within ${DUPLICATE_TAP_THRESHOLD_SECONDS}s`,
        };
    }

    return { valid: true };
}

/**
 * Record a valid checkpoint:
 * 1. Insert into race_logs
 * 2. Update runner status (registered → running, or running → finished)
 * 3. If finish checkpoint, assign finish_position
 */
async function recordCheckpoint(
    runnerId: string,
    eventId: string,
    rfidUid: string,
    checkpointId: number,
    timestamp: string,
    isFinish: boolean
): Promise<ValidationResult> {
    // 1. Insert race log
    const { error: logError } = await supabase
        .from('race_logs')
        .insert({
            runner_id: runnerId,
            checkpoint_id: checkpointId,
            timestamp: timestamp,
        });

    if (logError) {
        console.error('[Validator] Failed to insert race_log:', logError.message);
        return { valid: false, error: `Failed to record checkpoint: ${logError.message}` };
    }

    // 2. Update runner status based on checkpoint
    const isStart = checkpointId === CHECKPOINT_START;

    if (isStart) {
        // Mark runner as "running"
        const { error } = await supabase
            .from('runners')
            .update({ status: 'running' })
            .eq('id', runnerId);

        if (error) {
            console.error('[Validator] Failed to update runner status to running:', error.message);
        }

        console.log(`[Validator] ✅ Runner ${rfidUid} started (checkpoint ${checkpointId})`);
        return { valid: true, runner_id: runnerId, is_finish: false };
    }

    if (isFinish) {
        // Auto-assign finish_position based on how many have already finished in this event
        const { count, error: countError } = await supabase
            .from('runners')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', eventId)
            .eq('status', 'finished');

        if (countError) {
            console.error('[Validator] Failed to count finishers:', countError.message);
        }

        const finishPosition = (count ?? 0) + 1;

        // Mark runner as "finished" with position
        const { error } = await supabase
            .from('runners')
            .update({
                status: 'finished',
                finish_position: finishPosition,
            })
            .eq('id', runnerId);

        if (error) {
            console.error('[Validator] Failed to update runner status to finished:', error.message);
        }

        console.log(`[Validator] 🏁 Runner ${rfidUid} FINISHED in position #${finishPosition}`);
        return { valid: true, runner_id: runnerId, is_finish: true, finish_position: finishPosition };
    }

    // Intermediate checkpoint
    console.log(`[Validator] ✅ Runner ${rfidUid} passed checkpoint ${checkpointId}`);
    return { valid: true, runner_id: runnerId, is_finish: false };
}
