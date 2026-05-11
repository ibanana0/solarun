/**
 * Auto-Cancel Scheduler Service
 * Automatically cancels events where deposit deadline has expired
 */

import { supabase } from '../lib/supabase';
import * as cron from 'node-cron';

export interface CancelledEvent {
    event_id: string;
    event_name: string;
    creator_wallet: string;
    cancelled_reason: string;
}

export async function checkAndCancelExpiredDeposits(): Promise<CancelledEvent[]> {
    try {
        console.log('[AutoCancel] Checking for expired deposit deadlines...');

        const { data, error } = await supabase.rpc('auto_cancel_expired_deposits');

        if (error) {
            console.error('[AutoCancel] Error calling auto_cancel_expired_deposits:', error);
            throw error;
        }

        const cancelledEvents: CancelledEvent[] = (data || []).map((row: any) => ({
            event_id: row.event_id,
            event_name: row.event_name,
            creator_wallet: row.creator_wallet,
            cancelled_reason: row.cancelled_reason,
        }));

        if (cancelledEvents.length > 0) {
            console.log(`[AutoCancel] Cancelled ${cancelledEvents.length} event(s):`);
            cancelledEvents.forEach(event => {
                console.log(`  - ${event.event_name} (${event.event_id})`);
            });
        } else {
            console.log('[AutoCancel] No events to cancel.');
        }

        return cancelledEvents;
    } catch (error) {
        console.error('[AutoCancel] Unexpected error:', error);
        throw error;
    }
}

export async function getEventsApproachingDeadline(hoursThreshold: number = 12): Promise<any[]> {
    try {
        const { data, error } = await supabase
            .from('pending_deposit_events')
            .select('*')
            .gte('hours_until_deadline', 0)
            .lte('hours_until_deadline', hoursThreshold)
            .eq('is_expired', false);

        if (error) {
            console.error('[AutoCancel] Error fetching approaching deadlines:', error);
            throw error;
        }

        return data || [];
    } catch (error) {
        console.error('[AutoCancel] Error in getEventsApproachingDeadline:', error);
        throw error;
    }
}

export async function manualCancelEvent(
    eventId: string,
    reason: string = 'admin_cancel'
): Promise<void> {
    try {
        const { error } = await supabase
            .from('race_events')
            .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancellation_reason: reason,
            })
            .eq('id', eventId);

        if (error) {
            console.error(`[AutoCancel] Error manually cancelling event ${eventId}:`, error);
            throw error;
        }

        console.log(`[AutoCancel] Event ${eventId} manually cancelled. Reason: ${reason}`);
    } catch (error) {
        console.error('[AutoCancel] Error in manualCancelEvent:', error);
        throw error;
    }
}

export function startAutoCancelScheduler(cronExpression: string = '*/5 * * * *'): void {
    console.log(`[AutoCancel] Starting scheduler with expression: ${cronExpression}`);

    cron.schedule(cronExpression, async () => {
        try {
            console.log(`[AutoCancel] Running scheduled check at ${new Date().toISOString()}`);
            await checkAndCancelExpiredDeposits();
        } catch (error) {
            console.error('[AutoCancel] Error in scheduled task:', error);
        }
    });

    console.log('[AutoCancel] Scheduler started successfully');
}

export async function triggerManualCheck(): Promise<CancelledEvent[]> {
    console.log('[AutoCancel] Manual check triggered');
    return await checkAndCancelExpiredDeposits();
}
