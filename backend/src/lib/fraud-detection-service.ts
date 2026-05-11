/**
 * Fraud Detection Service
 * Monitors events for suspicious activity and triggers automatic slashing
 */

import { supabase } from './supabase';
import { markStakeAsSlashed } from './staking-service';
import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');

/**
 * Check vault balance against expected amount
 * Tolerance: 1% variance (for rounding/fees)
 */
export async function verifyVaultIntegrity(eventId: string): Promise<{
    isValid: boolean;
    onChainBalance: number;
    expectedBalance: number;
    variance: number;
    message: string;
}> {
    try {
        // Get event details
        const { data: event, error: eventError } = await supabase
            .from('race_events')
            .select('id, vault_address, total_deposits, stake_amount, admin_wallet, is_completed')
            .eq('id', eventId)
            .single();
        
        if (eventError) {
            throw new Error(`Failed to fetch event: ${eventError.message}`);
        }
        
        if (!event.vault_address) {
            return {
                isValid: false,
                onChainBalance: 0,
                expectedBalance: 0,
                variance: 0,
                message: 'Vault address not found'
            };
        }
        
        // Query on-chain vault balance
        const vaultPubkey = new PublicKey(event.vault_address);
        const tokenAccount = await connection.getTokenAccountBalance(vaultPubkey);
        const onChainBalance = tokenAccount.value.uiAmount || 0;
        
        // Expected balance = participant deposits + admin stake (before any fee taken)
        const expectedBalance = event.total_deposits + event.stake_amount;
        
        // Allow 1% variance (rounding, fees)
        const tolerance = expectedBalance * 0.01;
        const variance = expectedBalance === 0 ? 0 : ((onChainBalance - expectedBalance) / expectedBalance) * 100;
        
        const isValid = Math.abs(onChainBalance - expectedBalance) <= tolerance;
        
        return {
            isValid,
            onChainBalance,
            expectedBalance,
            variance,
            message: isValid 
                ? `Vault integrity OK (variance: ${variance.toFixed(2)}%)`
                : `Vault integrity FAILED: on-chain=${onChainBalance}, expected=${expectedBalance}`
        };
    } catch (error) {
        throw new Error(`Vault integrity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Auto-detect and slash fraudulent events
 * Runs as scheduled task (hourly)
 */
export async function autoDetectAndSlashFraud() {
    try {
        console.log('[autoDetectAndSlashFraud] Starting fraud detection scan...');
        
        // Find events marked as Completed but within dispute window (within 48 hours)
        const { data: suspiciousEvents, error: queryError } = await supabase
            .from('race_events')
            .select('id, vault_address, total_deposits, stake_amount, admin_wallet, is_completed, status')
            .eq('is_completed', true)
            .gt('updated_at', new Date(Date.now() - 48 * 3600 * 1000).toISOString());
        
        if (queryError) {
            throw new Error(`Failed to query events: ${queryError.message}`);
        }
        
        console.log(`[autoDetectAndSlashFraud] Found ${suspiciousEvents?.length || 0} recently completed events`);
        
        for (const event of suspiciousEvents || []) {
            try {
                // Check vault integrity
                const integrity = await verifyVaultIntegrity(event.id);
                
                if (!integrity.isValid) {
                    console.warn(`[autoDetectAndSlashFraud] FRAUD DETECTED in event ${event.id}`);
                    console.warn(`  Variance: ${integrity.variance.toFixed(2)}%`);
                    console.warn(`  On-chain: ${integrity.onChainBalance}, Expected: ${integrity.expectedBalance}`);
                    
                    // Trigger slash
                    await markStakeAsSlashed(event.id, event.admin_wallet);
                    
                    console.log(`[autoDetectAndSlashFraud] Stake SLASHED for event ${event.id}`);
                    
                    // Log incident
                    await logFraudDetection(event.id, event.admin_wallet, integrity);
                } else {
                    console.log(`[autoDetectAndSlashFraud] Event ${event.id} integrity OK`);
                }
            } catch (error) {
                console.error(`[autoDetectAndSlashFraud] Error checking event ${event.id}:`, error);
                // Continue with next event
            }
        }
        
        console.log('[autoDetectAndSlashFraud] Scan complete');
    } catch (error) {
        console.error('[autoDetectAndSlashFraud] Fatal error:', error);
    }
}

/**
 * Log fraud detection incident
 */
async function logFraudDetection(
    eventId: string,
    adminWallet: string,
    integrity: Awaited<ReturnType<typeof verifyVaultIntegrity>>
): Promise<void> {
    // Could log to separate audit table or external service
    console.log({
        type: 'FRAUD_DETECTED',
        eventId,
        adminWallet,
        onChainBalance: integrity.onChainBalance,
        expectedBalance: integrity.expectedBalance,
        variance: integrity.variance,
        timestamp: new Date().toISOString()
    });
}

/**
 * Verify vault before fee distribution
 * MUST be called before any financial operations
 */
export async function requireValidVault(eventId: string): Promise<void> {
    const integrity = await verifyVaultIntegrity(eventId);
    
    if (!integrity.isValid) {
        throw new Error(
            `Vault integrity check failed for event ${eventId}: ${integrity.message}`
        );
    }
}

/**
 * Whitelist of expected vault balance mismatches
 * (e.g., after treasury takes fee)
 */
export async function verifyVaultAfterFeeDistribution(
    eventId: string,
    feeAmount: number
): Promise<boolean> {
    try {
        const { data: event } = await supabase
            .from('race_events')
            .select('vault_address, total_deposits, stake_amount, treasury_fee_collected')
            .eq('id', eventId)
            .single();
        
        const vaultPubkey = new PublicKey(event.vault_address);
        const tokenAccount = await connection.getTokenAccountBalance(vaultPubkey);
        const onChainBalance = tokenAccount.value.uiAmount || 0;
        
        // After fee distribution, vault should have:
        // total_deposits + stake - fee
        const expectedAfterFee = event.total_deposits + event.stake_amount - feeAmount;
        const tolerance = expectedAfterFee * 0.01;
        
        const isValid = Math.abs(onChainBalance - expectedAfterFee) <= tolerance;
        
        if (!isValid) {
            console.error('[verifyVaultAfterFeeDistribution] Balance mismatch after fee:',
                { onChainBalance, expectedAfterFee, variance: Math.abs(onChainBalance - expectedAfterFee) });
        }
        
        return isValid;
    } catch (error) {
        throw new Error(`Post-fee verification failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
}
