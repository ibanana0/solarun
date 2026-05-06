import { supabase } from '../lib/supabase';

/**
 * Optimistic Cleanup Worker
 * 
 * Reverts runners stuck in "Finishing..." state for more than 60 seconds back to "running".
 * This handles cases where the MQTT finish signal was received and the UI updated optimistically,
 * but the backend process or blockchain transaction failed to complete.
 */
export async function cleanupStuckTransactions() {
    console.log('[Cleanup Worker] Running stuck transaction cleanup...');
    
    const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();
    
    const { data, error } = await supabase
        .from('runners')
        .update({ status: 'running' })
        .eq('status', 'Finishing...')
        .lt('processing_started_at', sixtySecondsAgo)
        .select();

    if (error) {
        console.error('[Cleanup Worker] Error cleaning up stuck transactions:', error.message);
    } else if (data && data.length > 0) {
        console.log(`[Cleanup Worker] Successfully reverted ${data.length} stuck runners to "running" state.`);
    } else {
        console.log('[Cleanup Worker] No stuck transactions found.');
    }
}
