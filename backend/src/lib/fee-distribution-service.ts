/**
 * Fee Distribution Service
 * Handles protocol fee calculations and tracking
 */

import { supabase } from './supabase';

export interface FeeDistributionRecord {
    id: string;
    event_id: string;
    tx_signature: string;
    gross_amount: number;
    protocol_fee_amount: number;
    admin_net_amount: number;
    treasury_address: string;
    status: 'pending' | 'completed' | 'failed';
    error_message?: string;
    created_at: string;
    updated_at: string;
}

/**
 * Calculate protocol fee from total amount
 * @param totalAmount - Gross amount to split
 * @param feeBps - Fee in basis points (e.g., 500 = 5%)
 * @returns Object with fee and net amounts
 */
export function calculateFeeDistribution(
    totalAmount: number,
    feeBps: number
): { feeAmount: number; netAmount: number } {
    const feeAmount = Math.floor((totalAmount * feeBps) / 10000);
    const netAmount = totalAmount - feeAmount;
    return { feeAmount, netAmount };
}

/**
 * Record fee distribution transaction
 * Called when fees are successfully distributed to treasury
 */
export async function recordFeeDistribution(
    eventId: string,
    txSignature: string,
    grossAmount: number,
    protocolFeeAmount: number,
    adminNetAmount: number,
    treasuryAddress: string,
    status: 'pending' | 'completed' | 'failed' = 'pending',
    errorMessage?: string
): Promise<FeeDistributionRecord> {
    const { data, error } = await supabase
        .from('fee_distribution')
        .insert({
            event_id: eventId,
            tx_signature: txSignature,
            gross_amount: grossAmount,
            protocol_fee_amount: protocolFeeAmount,
            admin_net_amount: adminNetAmount,
            treasury_address: treasuryAddress,
            status,
            error_message: errorMessage || null,
        })
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to record fee distribution: ${error.message}`);
    }

    return data as FeeDistributionRecord;
}

/**
 * Get fee distribution for an event
 */
export async function getFeeDistribution(eventId: string): Promise<FeeDistributionRecord | null> {
    const { data, error } = await supabase
        .from('fee_distribution')
        .select()
        .eq('event_id', eventId)
        .single();

    if (error && error.code === 'PGRST116') {
        // Not found
        return null;
    }

    if (error) {
        throw new Error(`Failed to get fee distribution: ${error.message}`);
    }

    return data as FeeDistributionRecord;
}

/**
 * Update fee distribution status and transaction signature
 */
export async function updateFeeDistributionStatus(
    eventId: string,
    status: 'pending' | 'completed' | 'failed',
    txSignature?: string,
    errorMessage?: string
): Promise<void> {
    const updateData: any = { status };
    if (txSignature) updateData.tx_signature = txSignature;
    if (errorMessage) updateData.error_message = errorMessage;

    const { error } = await supabase
        .from('fee_distribution')
        .update(updateData)
        .eq('event_id', eventId);

    if (error) {
        throw new Error(`Failed to update fee distribution status: ${error.message}`);
    }
}

/**
 * Get protocol configuration from database
 */
export async function getProtocolConfig(): Promise<{
    treasury_address: string;
    protocol_fee_bps: number;
} | null> {
    const { data, error } = await supabase
        .from('protocol_config')
        .select('treasury_address, protocol_fee_bps')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error && error.code === 'PGRST116') {
        return null;
    }

    if (error) {
        throw new Error(`Failed to get protocol config: ${error.message}`);
    }

    return data;
}

/**
 * Update protocol configuration (treasury address and fee)
 * Only callable by admin
 */
export async function updateProtocolConfig(
    treasuryAddress: string,
    protocolFeeBps: number
): Promise<void> {
    if (protocolFeeBps < 0 || protocolFeeBps > 10000) {
        throw new Error('Protocol fee must be between 0 and 10000 basis points');
    }

    const { error } = await supabase
        .from('protocol_config')
        .update({
            treasury_address: treasuryAddress,
            protocol_fee_bps: protocolFeeBps,
        })
        .eq('id', 1); // Assuming single config row

    if (error) {
        throw new Error(`Failed to update protocol config: ${error.message}`);
    }
}

/**
 * Estimate earnings breakdown for an event
 * Shows admin what they'll receive after fees
 */
export function estimateEarningsBreakdown(
    totalVaultBalance: number,
    protocolFeeBps: number
): {
    gross: number;
    protocolFee: number;
    netToAdmin: number;
    feePercentage: number;
} {
    const { feeAmount, netAmount } = calculateFeeDistribution(totalVaultBalance, protocolFeeBps);
    const feePercentage = (protocolFeeBps / 100).toFixed(2);

    return {
        gross: totalVaultBalance,
        protocolFee: feeAmount,
        netToAdmin: netAmount,
        feePercentage: parseFloat(feePercentage as string),
    };
}
