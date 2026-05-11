# SolaRun Staking Security Fixes - Detailed Action Plan 🔧

**Timeline**: 1 Week (Critical Phase)  
**Owner**: Security & Development Team  
**Status**: READY FOR IMPLEMENTATION  

---

## 🚨 Critical Fixes (Days 1-3)

### Fix #1: Add Minimum Stake Validation

**Objective**: Enforce minimum stake = 5% of max pool, maximum stake = 200% of max pool

#### Step 1.1: Update Smart Contract Error Codes

**File**: `contracts/programs/solarun_temp/src/error.rs`

```rust
#[error_code]
pub enum ErrorCode {
    // ... existing errors ...
    
    #[msg("Stake amount is below minimum required")]
    StakeTooLow,
    
    #[msg("Stake amount exceeds maximum allowed")]
    StakeTooHigh,
}
```

**Action**:
- [ ] Add error codes above before `pub enum ErrorCode` closing brace
- [ ] Verify error.rs compiles: `cargo build-sbf`

#### Step 1.2: Update stake_event Instruction

**File**: `contracts/programs/solarun_temp/src/instructions/stake_event.rs`

Replace the handler function with:

```rust
pub fn handler(
    ctx: Context<StakeEvent>,
    event_id: String,
    stake_amount: u64,
) -> Result<()> {
    // Basic check
    require!(stake_amount > 0, ErrorCode::InsufficientStake);

    let event = &mut ctx.accounts.event;
    require!(event.stake_amount == 0, ErrorCode::StakeAlreadyDeposited);

    // NEW: Calculate minimum and maximum stake
    // Min stake = 5% of max possible pool
    // Max stake = 200% of max possible pool
    let expected_max_pool = event.registration_fee
        .checked_mul(event.max_participants as u64)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    let min_stake = expected_max_pool
        .checked_mul(5)
        .and_then(|x| x.checked_div(100))
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    let max_stake = expected_max_pool
        .checked_mul(200)
        .and_then(|x| x.checked_div(100))
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    // NEW: Enforce min/max bounds
    require!(stake_amount >= min_stake, ErrorCode::StakeTooLow);
    require!(stake_amount <= max_stake, ErrorCode::StakeTooHigh);

    msg!("Stake validation: min={}, actual={}, max={}", min_stake, stake_amount, max_stake);

    // Transfer tokens from admin to vault (as stake)
    let cpi_accounts = Transfer {
        from: ctx.accounts.admin_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.admin.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    anchor_spl::token::transfer(cpi_ctx, stake_amount)?;

    // Record stake in event account
    event.stake_amount = stake_amount;
    event.stake_vault = ctx.accounts.stake_vault.key();

    // Initialize StakeVault account
    let stake_vault = &mut ctx.accounts.stake_vault;
    stake_vault.event = event.key();
    stake_vault.admin = ctx.accounts.admin.key();
    stake_vault.vault = ctx.accounts.vault.key();
    stake_vault.amount = stake_amount;
    stake_vault.is_slashed = false;
    stake_vault.bump = ctx.bumps.stake_vault;

    emit!(StakeDeposited {
        event_id: event_id.clone(),
        admin: ctx.accounts.admin.key(),
        amount: stake_amount,
    });

    msg!("Stake deposited: event={}, amount={}", event_id, stake_amount);
    Ok(())
}
```

**Action**:
- [ ] Update `stake_event.rs` with new validation logic
- [ ] Verify compiles: `cd contracts && cargo build-sbf`
- [ ] Check for errors

#### Step 1.3: Update Backend Staking Service

**File**: `backend/src/lib/staking-service.ts`

Add new validation function:

```typescript
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
```

Update `recordStakeDeposit` to validate:

```typescript
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
```

**Action**:
- [ ] Add `validateStakeAmount` function above `recordStakeDeposit`
- [ ] Update `recordStakeDeposit` to call validation
- [ ] Test: `npm test` (if tests exist)
- [ ] Manual test: Try to create event with 0.001 USDC stake (should fail)

#### Step 1.4: Update Frontend Create Event Form

**File**: `frontend/app/creator/create/page.tsx`

Add validation before creating event:

```typescript
// In handleSubmit function, after stakeAmount is parsed:

const stakeAmount = parseFloat(stakeAmountUsdc);

// NEW: Validate stake amount
const fee = parseFloat(feeUsdc);
const max = parseInt(maxParticipants);
const expectedMaxPool = fee * max;
const minStake = expectedMaxPool * 0.05;
const maxStake = expectedMaxPool * 2.0;

if (stakeAmount > 0) {  // Only validate if stake provided
    if (stakeAmount < minStake) {
        setError(`Stake amount must be at least ${minStake.toFixed(6)} USDC (5% of max pool)`);
        return;
    }
    if (stakeAmount > maxStake) {
        setError(`Stake amount cannot exceed ${maxStake.toFixed(6)} USDC (200% of max pool)`);
        return;
    }
}
```

Also update `StakingInfoCard` to show recommended stake:

```typescript
// In StakingInfoCard.tsx, add after state setup:

const minRecommendedStake = (registrationFee * maxParticipants * 0.05);
const maxRecommendedStake = (registrationFee * maxParticipants * 2.0);
```

Then add warning in UI:

```typescript
<div className="bg-orange-900/20 border border-orange-700 p-md rounded-sm space-y-sm">
    <div className="flex items-start gap-sm">
        <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-xs">
            <p className="font-label-caps text-label-caps text-orange-500 uppercase">⚠️ Minimum Stake Required</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
                Your stake must be between <span className="font-bold text-orange-400">{minRecommendedStake.toFixed(2)}</span> and 
                <span className="font-bold text-orange-400"> {maxRecommendedStake.toFixed(2)} USDC</span>.
            </p>
            <p className="font-body-xs text-body-xs text-on-surface-variant">
                This ensures adequate collateral to cover participant refunds.
            </p>
        </div>
    </div>
</div>
```

**Action**:
- [ ] Add validation logic to `handleSubmit`
- [ ] Update `StakingInfoCard` to show min/max recommendations
- [ ] Test frontend: Try to create event with insufficient stake (should show error)

**Testing**:
```typescript
// Test case 1: Min stake violation
const fee = 5;
const maxParticipants = 100;
const expectedPool = 500;
const minStake = 25;  // 5% of 500
// Attempt: stakeAmount = 24.99 USDC -> Should FAIL

// Test case 2: Max stake violation  
const maxStake = 1000;  // 200% of 500
// Attempt: stakeAmount = 1000.01 USDC -> Should FAIL

// Test case 3: Valid stake
// Attempt: stakeAmount = 100 USDC -> Should SUCCEED
```

---

### Fix #2: Add Dispute Lock Period

**Objective**: Prevent stake release for 7 days after event completion

#### Step 2.1: Update Event State

**File**: `contracts/programs/solarun_temp/src/state.rs`

Add to Event struct:

```rust
#[account]
pub struct Event {
    // ... existing fields ...
    pub dispute_lock_until: i64,        // UTC timestamp when stake can be released
}
```

Update `Event` initialization in `initialize.rs`:

```rust
pub fn handler(
    ctx: Context<InitializeEvent>,
    event_id: String,
    max_participants: u32,
    registration_fee: u64,
    start_time: i64,
    end_time: i64,
) -> Result<()> {
    // ... existing validation ...
    
    let event = &mut ctx.accounts.event;
    // ... existing fields ...
    event.dispute_lock_until = 0;  // No lock initially
    
    // ... rest
}
```

#### Step 2.2: Add Dispute Lock Enforcement

Update `complete_race.rs`:

```rust
pub fn handler(ctx: Context<CompleteRace>, _event_id: String) -> Result<()> {
    // ... existing code ...
    
    let event = &mut ctx.accounts.event;
    
    // NEW: Set 7-day dispute lock period
    let seven_days_seconds: i64 = 7 * 24 * 60 * 60;
    let current_time = Clock::get()?.unix_timestamp;
    event.dispute_lock_until = current_time + seven_days_seconds;
    
    event.is_completed = true;
    event.status = EventStatus::Completed;
    
    emit!(RaceCompleted {
        event_id: event.event_id.clone(),
        vault_balance,
        fee_amount,
        prize_pool_remaining,
        dispute_lock_until: event.dispute_lock_until,  // Add to event
    });
    
    msg!("Race completed with 7-day dispute lock until {}", event.dispute_lock_until);
    Ok(())
}
```

Update `RaceCompleted` event:

```rust
#[event]
pub struct RaceCompleted {
    pub event_id: String,
    pub vault_balance: u64,
    pub fee_amount: u64,
    pub prize_pool_remaining: u64,
    pub dispute_lock_until: i64,  // NEW
}
```

#### Step 2.3: Add New Instruction for Stake Release

**File**: Create `contracts/programs/solarun_temp/src/instructions/release_stake.rs`

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};
use crate::{Event, EventStatus};
use crate::error::ErrorCode;

/// Release admin's stake after dispute lock period
/// Only callable after 7 days have passed since event completion
#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct ReleaseStake<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump,
        constraint = event.admin == admin.key() @ ErrorCode::UnauthorizedAdmin,
        constraint = event.status == EventStatus::Completed @ ErrorCode::FinishEventNotActive,
    )]
    pub event: Account<'info, Event>,

    /// Event vault (source of stake return)
    #[account(
        mut,
        seeds = [b"vault", event.key().as_ref()],
        bump = event.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Admin's token account (destination)
    #[account(
        mut,
        token::mint = vault.mint,
        token::authority = admin
    )]
    pub admin_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<ReleaseStake>,
    event_id: String,
) -> Result<()> {
    let event = &ctx.accounts.event;
    let current_time = Clock::get()?.unix_timestamp;

    // Check if dispute lock period has passed
    require!(
        current_time >= event.dispute_lock_until,
        ErrorCode::StakeLocked
    );

    let stake_amount = event.stake_amount;
    require!(stake_amount > 0, ErrorCode::NoStakeToRelease);

    // Event PDA is the vault authority
    let signer_seeds: &[&[u8]] = &[
        b"event",
        event_id.as_bytes(),
        &[event.bump],
    ];
    let signer = &[signer_seeds];

    // Transfer stake back to admin
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.admin_token_account.to_account_info(),
        authority: ctx.accounts.event.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer,
    );
    anchor_spl::token::transfer(cpi_ctx, stake_amount)?;

    emit!(StakeReleased {
        event_id: event_id.clone(),
        admin: ctx.accounts.admin.key(),
        amount: stake_amount,
        released_at: current_time,
    });

    msg!("Stake released: event={}, amount={}", event_id, stake_amount);
    Ok(())
}

#[event]
pub struct StakeReleased {
    pub event_id: String,
    pub admin: Pubkey,
    pub amount: u64,
    pub released_at: i64,
}
```

#### Step 2.4: Add Error Code

Update `contracts/programs/solarun_temp/src/error.rs`:

```rust
#[error_code]
pub enum ErrorCode {
    // ... existing ...
    
    #[msg("Stake is locked during dispute period")]
    StakeLocked,
    
    #[msg("No stake to release")]
    NoStakeToRelease,
}
```

#### Step 2.5: Update lib.rs to Export New Instruction

**File**: `contracts/programs/solarun_temp/src/instructions.rs`

```rust
pub mod release_stake;
```

**File**: `contracts/programs/solarun_temp/src/lib.rs`

Add to program:

```rust
#[program]
pub mod solarun_temp {
    use super::*;

    // ... existing instructions ...

    pub fn release_stake(ctx: Context<ReleaseStake>, event_id: String) -> Result<()> {
        release_stake::handler(ctx, event_id)
    }
}
```

#### Step 2.6: Test Smart Contract

**Action**:
- [ ] Build: `cd contracts && cargo build-sbf`
- [ ] Test lock mechanism:
  ```typescript
  // Try to release stake immediately after completion -> Should FAIL
  // Wait 7 days -> Should SUCCEED
  ```

---

### Fix #3: Add Automatic Fraud Detection

**Objective**: Backend detects vault balance mismatches and auto-slashes

#### Step 3.1: Create Auto-Slash Service

**File**: Create `backend/src/lib/fraud-detection-service.ts`

```typescript
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
        const variance = ((onChainBalance - expectedBalance) / expectedBalance) * 100;
        
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
```

#### Step 3.2: Add Scheduled Task

**File**: Update `backend/src/scheduler/refund-scheduler.ts` (or create if not exists)

```typescript
import { CronJob } from 'cron';
import { autoDetectAndSlashFraud } from '../lib/fraud-detection-service';

// Run fraud detection every hour
export const fraudDetectionCron = new CronJob(
    '0 * * * *', // Every hour at minute 0
    async () => {
        console.log('[fraudDetectionCron] Starting hourly fraud detection...');
        try {
            await autoDetectAndSlashFraud();
        } catch (error) {
            console.error('[fraudDetectionCron] Error:', error);
        }
    },
    null,
    true  // auto-start
);

export function startFraudDetectionScheduler() {
    console.log('[startFraudDetectionScheduler] Fraud detection scheduler started');
    fraudDetectionCron.start();
}

export function stopFraudDetectionScheduler() {
    console.log('[stopFraudDetectionScheduler] Fraud detection scheduler stopped');
    fraudDetectionCron.stop();
}
```

Add to main `backend/src/index.ts`:

```typescript
import { startFraudDetectionScheduler } from './scheduler/refund-scheduler';

// Start all schedulers
startFraudDetectionScheduler();
```

#### Step 3.3: Add Vault Check to Fee Distribution

**File**: Update `backend/src/api/eventCompletionListener.ts`

```typescript
import { requireValidVault, verifyVaultAfterFeeDistribution } from '../lib/fraud-detection-service';

export async function handleEventCompletion(payload: {
    event_id: string;
    completion_timestamp?: number;
    finishers?: Array<{ runner_id: string; position: number }>;
}): Promise<EventCompletionResponse> {
    const eventId = payload.event_id;
    
    // CRITICAL: Verify vault before any fee distribution
    await requireValidVault(eventId);
    
    // ... rest of fee distribution ...
    
    // After fee taken, verify again
    const feeAmount = ...; // Calculate fee
    const feeValid = await verifyVaultAfterFeeDistribution(eventId, feeAmount);
    
    if (!feeValid) {
        throw new Error('Vault integrity check failed after fee distribution');
    }
    
    return { success: true, ... };
}
```

**Action**:
- [ ] Create `fraud-detection-service.ts` with functions above
- [ ] Update scheduler to run hourly
- [ ] Add vault checks to fee distribution
- [ ] Test: Manually drain vault, run scheduler -> Should detect & slash

---

## ✅ Testing & Validation (Days 4-5)

### Test Plan

#### Test Case 1: Minimum Stake Validation

```typescript
// backend/src/__tests__/staking-validation.test.ts

describe('Staking Validation', () => {
    test('should reject stake below minimum', async () => {
        const event = await createTestEvent(100, 5);  // 100 max, 5 USDC fee
        // Min stake = 100 * 5 * 0.05 = 25 USDC
        
        const result = await validateStakeAmount(event.id, 24.99);
        expect(result.isValid).toBe(false);
        expect(result.reason).toContain('below minimum');
    });
    
    test('should accept stake at minimum', async () => {
        const event = await createTestEvent(100, 5);
        const result = await validateStakeAmount(event.id, 25);
        expect(result.isValid).toBe(true);
    });
    
    test('should reject stake above maximum', async () => {
        const event = await createTestEvent(100, 5);
        // Max stake = 100 * 5 * 2.0 = 1000 USDC
        
        const result = await validateStakeAmount(event.id, 1000.01);
        expect(result.isValid).toBe(false);
        expect(result.reason).toContain('exceeds maximum');
    });
    
    test('should accept stake at maximum', async () => {
        const event = await createTestEvent(100, 5);
        const result = await validateStakeAmount(event.id, 1000);
        expect(result.isValid).toBe(true);
    });
});
```

#### Test Case 2: Dispute Lock

```typescript
test('should prevent stake release before lock expires', async () => {
    const event = await createAndCompleteEvent();
    
    // Try to release immediately
    const result = await releaseStake(event.id);
    expect(result).toThrow('StakeLocked');
});

test('should allow stake release after lock expires', async () => {
    const event = await createAndCompleteEvent();
    
    // Wait 7 days (or mock time)
    const futureTime = Date.now() + (7 * 24 * 60 * 60 * 1000);
    jest.useFake