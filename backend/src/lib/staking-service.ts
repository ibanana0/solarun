/**
 * Staking Service
 * Handles stake deposit tracking and vault management for events
 */

import { supabase } from './supabase';

export interface StakeVaultData {
    id: string;
    event_id: string;
    admin_wallet: string;
    stake_amount: number; // In token units (lamports/decimals)
    is_slashed: boolean;
    created_at: string;
    updated_at: string;
}

/**
 * Validate stake amount against event parameters
 * Min: 5% of max pool
 * Max: 200% of max pool
 */
export async function validateStakeAmount(
    eventId: string,
    stakeAmount: number
): Promise<{ isValid: boolean; minAmount: number; maxAmount: number; reason?: string }> {
    try {
        const { data: event, error: eventError } = await supabase
            .from('race_events')
            .select('registration_fee_sol, max_participants')
            .eq('id', eventId)
            .single();
        
        if (eventError) {
            throw new Error(`Failed to get event: ${eventError.message}`);
        }
        
        // Calculate bounds
        const expectedMaxPool = event.registration_fee_sol * event.max_participants;
        const minStakeAmount = expectedMaxPool * 0.05;  // 5%
        const maxStakeAmount = expectedMaxPool * 2.0;   // 200%
        
        const isValid = stakeAmount >= minStakeAmount && stakeAmount <= maxStakeAmount;
        
        if (!isValid) {
            let reason = '';
            if (stakeAmount < minStakeAmount) {
                reason = `below minimum ${minStakeAmount.toFixed(6)} USDC`;
            } else if (stakeAmount > maxStakeAmount) {
                reason = `exceeds maximum ${maxStakeAmount.toFixed(6)} USDC`;
            }
            
            console.warn(`[validateStakeAmount] Invalid stake for event ${eventId}: ${reason}`);
        }
        
        return {
            isValid,
            minAmount: minStakeAmount,
            maxAmount: maxStakeAmount,
            reason: !isValid ? `Stake amount ${reason}` : undefined
        };
    } catch (error) {
        throw new Error(`Stake validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Record stake deposit in database after blockchain confirmation
 * Called after successful stake_event instruction on-chain
 */
export async function recordStakeDeposit(
    eventId: string,
    adminWallet: string,
    stakeAmount: number
): Promise<StakeVaultData> {
    // NEW: Validate stake amount
    const validation = await validateStakeAmount(eventId, stakeAmount);
    
    if (!validation.isValid) {
        throw new Error(`${validation.reason}`);
    }

    const { data, error } = await supabase
        .from('stake_vault')
        .insert({
            event_id: eventId,
            admin_wallet: adminWallet,
            stake_amount: stakeAmount,
            is_slashed: false,
        })
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to record stake deposit: ${error.message}`);
    }

    console.log(`[recordStakeDeposit] Recorded stake for event ${eventId}: ${stakeAmount} USDC`);
    return data as StakeVaultData;
}

/**
 * Update event stake_status after successful deposit
 */
export async function updateEventStakeStatus(
    eventId: string,
    status: 'pending' | 'staked' | 'returned' | 'slashed'
): Promise<void> {
    const { error } = await supabase
        .from('race_events')
        .update({ stake_status: status })
        .eq('id', eventId);

    if (error) {
        throw new Error(`Failed to update event stake status: ${error.message}`);
    }
}

/**
 * Get stake information for an event
 */
export async function getEventStake(eventId: string): Promise<StakeVaultData | null> {
    const { data, error } = await supabase
        .from('stake_vault')
        .select()
        .eq('event_id', eventId)
        .single();

    if (error && error.code === 'PGRST116') {
        // Not found - return null
        return null;
    }

    if (error) {
        throw new Error(`Failed to get stake info: ${error.message}`);
    }

    return data as StakeVaultData;
}

/**
 * Mark stake as slashed (after slash_and_refund instruction)
 */
export async function markStakeAsSlashed(
    eventId: string,
    adminWallet: string
): Promise<void> {
    const { error } = await supabase
        .from('stake_vault')
        .update({
            is_slashed: true,
            slashed_at: new Date().toISOString(),
        })
        .eq('event_id', eventId)
        .eq('admin_wallet', adminWallet);

    if (error) {
        throw new Error(`Failed to mark stake as slashed: ${error.message}`);
    }

    // Also update event status
    await updateEventStakeStatus(eventId, 'slashed');
}

/**
 * Mark stake as returned (after successful completion_race with fee distribution)
 */
export async function markStakeAsReturned(
    eventId: string,
    adminWallet: string
): Promise<void> {
    const { error } = await supabase
        .from('stake_vault')
        .update({
            returned_at: new Date().toISOString(),
        })
        .eq('event_id', eventId)
        .eq('admin_wallet', adminWallet);

    if (error) {
        throw new Error(`Failed to mark stake as returned: ${error.message}`);
    }

    // Also update event status
    await updateEventStakeStatus(eventId, 'returned');
}
