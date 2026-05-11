/**
 * Create Event API Endpoint
 * Handles event creation with staking requirement tracking
 * 
 * This endpoint:
 * 1. Creates event record in database (with stake_amount and protocol_fee_bps fields)
 * 2. Tracks that admin must call stake_event on blockchain before starting
 * 3. Records stake information once blockchain tx is confirmed
 */

import { supabase } from '../lib/supabase';
import { recordStakeDeposit, updateEventStakeStatus } from '../lib/staking-service';
import { getProtocolConfig } from '../lib/fee-distribution-service';

export interface CreateEventRequest {
    event_id: string;         // UUID from frontend
    name: string;
    description?: string;
    max_participants: number;
    registration_fee_usdc: number;  // In USDC (e.g., 1.5 = 1.5 USDC)
    stake_amount_usdc: number;  // Amount admin must stake (in USDC)
    start_time: string;      // ISO 8601 timestamp
    end_time: string;        // ISO 8601 timestamp
    admin_wallet: string;    // Event creator's wallet
    vault_address?: string;  // Blockchain vault PDA address (optional - set later)
}

export interface CreateEventResponse {
    success: boolean;
    event_id: string;
    message: string;
    required_stake_amount: number;
    protocol_fee_bps: number;
    protocol_fee_percentage: string;
}

/**
 * Create a new event in the database
 * 
 * Backend should save:
 * - stake_amount: What the admin must deposit on blockchain
 * - stake_status: 'pending' initially (becomes 'staked' after blockchain confirmation)
 * - protocol_fee_bps: From global config
 * - is_completed: false initially
 * 
 * Frontend must then:
 * 1. Call initialize_event on blockchain to create Event account
 * 2. Call stake_event on blockchain to deposit stake into StakeVault
 * 3. Call start_race to begin the event
 * 
 * Backend verifies blockchain tx and updates stake_status to 'staked'
 */
export async function createEvent(
    request: CreateEventRequest
): Promise<CreateEventResponse> {
    try {
        // Get protocol configuration
        const protocolConfig = await getProtocolConfig();
        if (!protocolConfig) {
            throw new Error('Protocol configuration not initialized');
        }

        // Convert USDC to token units (assuming 6 decimals for USDC)
        const USDC_DECIMALS = 6;
        const registrationFeeTokens = Math.floor(request.registration_fee_usdc * Math.pow(10, USDC_DECIMALS));
        const stakeAmountTokens = Math.floor(request.stake_amount_usdc * Math.pow(10, USDC_DECIMALS));

        // Create event record in database
        const { data: event, error } = await supabase
            .from('race_events')
            .insert({
                id: request.event_id,
                name: request.name,
                description: request.description || null,
                registration_fee_sol: request.registration_fee_usdc,
                vault_address: request.vault_address || null,
                status: 'pending',
                start_time: new Date(request.start_time).toISOString(),
                end_time: new Date(request.end_time).toISOString(),
                stake_amount: request.stake_amount_usdc,
                stake_status: 'pending', // Will change to 'staked' after blockchain confirmation
                protocol_fee_bps: protocolConfig.protocol_fee_bps,
                is_completed: false,
                treasury_fee_collected: 0,
            })
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to create event: ${error.message}`);
        }

        const feePercentage = (protocolConfig.protocol_fee_bps / 100).toFixed(2);

        return {
            success: true,
            event_id: request.event_id,
            message: `Event created successfully. Admin must stake ${request.stake_amount_usdc} USDC before starting.`,
            required_stake_amount: request.stake_amount_usdc,
            protocol_fee_bps: protocolConfig.protocol_fee_bps,
            protocol_fee_percentage: feePercentage,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[createEvent] ${errorMessage}`);
        throw error;
    }
}

/**
 * Confirm stake deposit on blockchain
 * Called by backend after verifying blockchain transaction
 * 
 * This updates:
 * - stake_status: 'pending' -> 'staked'
 * - Creates entry in stake_vault table
 */
export async function confirmStakeDeposit(
    eventId: string,
    adminWallet: string,
    stakeAmount: number,
    txSignature: string
): Promise<void> {
    try {
        // Record stake in stake_vault table
        await recordStakeDeposit(eventId, adminWallet, stakeAmount);

        // Update event stake_status
        await updateEventStakeStatus(eventId, 'staked');

        // Log the confirmation
        console.log(`[confirmStakeDeposit] Event ${eventId} stake confirmed | tx: ${txSignature}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[confirmStakeDeposit] ${errorMessage}`);
        throw error;
    }
}

/**
 * Get event details including stake and fee information
 */
export async function getEventDetails(eventId: string) {
    const { data: event, error } = await supabase
        .from('race_events')
        .select(
            `
            *,
            stake_vault!stake_vault_event_id(id, stake_amount, is_slashed, returned_at)
            `
        )
        .eq('id', eventId)
        .single();

    if (error) {
        throw new Error(`Failed to get event details: ${error.message}`);
    }

    return event;
}

/**
 * Update event vault address after blockchain initialization
 */
export async function updateEventVaultAddress(
    eventId: string,
    vaultAddress: string
): Promise<void> {
    const { error } = await supabase
        .from('race_events')
        .update({ vault_address: vaultAddress })
        .eq('id', eventId);

    if (error) {
        throw new Error(`Failed to update vault address: ${error.message}`);
    }
}
