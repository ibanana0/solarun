# SolaRun Staking Security Analysis 🔐
**Status**: CRITICAL ISSUES IDENTIFIED ⚠️  
**Date**: 2026-05-11  
**Priority**: HIGH  

---

## Executive Summary

Analisis menyeluruh terhadap sistem staking SolaRun mengungkapkan **beberapa kerentanan kritis** yang memungkinkan event creator melakukan fraud:

1. **❌ Staking Amount Tidak Terbatas** - Creator dapat set staking amount sembarang (bahkan 0)
2. **❌ Tidak Ada Validasi Minimum Stake** - Tidak ada enforced minimum stake ratio terhadap prize pool
3. **❌ Tidak Ada Lockup Period** - Stake dapat di-return segera tanpa menunggu period dispute
4. **❌ Tidak Ada Mekanisme Slash Otomatis** - Slash hanya manual, tidak ada trigger otomatis untuk fraud detection
5. **❌ Prize Pool Tidak Terlindungi** - Admin dapat manipulasi vault sebelum refund processing
6. **❌ Fee Distribution Masih Manual** - Bergantung pada backend crank, bukan on-chain execution terprogram

---

## 🔍 Detailed Analysis by Layer

### 1. SMART CONTRACT LEVEL

#### 1.1 Issue: Staking Amount tidak ada Validasi Minimum

**File**: `stake_event.rs`

```rust
pub fn handler(
    ctx: Context<StakeEvent>,
    event_id: String,
    stake_amount: u64,
) -> Result<()> {
    require!(stake_amount > 0, ErrorCode::InsufficientStake);  // ⚠️ ONLY checks > 0!
    
    let event = &mut ctx.accounts.event;
    require!(event.stake_amount == 0, ErrorCode::StakeAlreadyDeposited);

    // Transfer tokens from admin to vault (as stake)
    let cpi_accounts = Transfer {
        from: ctx.accounts.admin_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.admin.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    anchor_spl::token::transfer(cpi_ctx, stake_amount)?;

    event.stake_amount = stake_amount;  // ⚠️ ACCEPTS ANY AMOUNT!
    Ok(())
}
```

**Problem**:
- Creator dapat set `stake_amount = 1 satoshi` (0.000001 USDC)
- Tidak ada enforcement bahwa stake harus >= X% dari expected prize pool
- Contoh: Event dengan 100 peserta × 5 USDC/orang = 500 USDC prize pool, tapi creator stake hanya 1 satoshi?
- **Scam Vector**: Admin stake minimal, ambil semua deposits, not return hadiah

**Risk Level**: 🔴 CRITICAL

---

#### 1.2 Issue: Tidak Ada Minimum Stake Ratio Check

**Current Architecture**:
- Event account hanya store `stake_amount` (what was staked)
- Tidak ada comparison dengan `registration_fee` atau `max_participants`
- Tidak ada formula enforcement seperti: `stake >= registration_fee × max_participants × 0.1` (10% safety margin)

**Example Exploit**:
```
Event Setup:
- max_participants: 1000
- registration_fee: 5 USDC
- Expected vault: 5000 USDC (if full)
- Admin stakes: 0.01 USDC

Scam Scenario:
1. 50 participants register (250 USDC vault)
2. Admin disappears, event cancelled
3. Vault balance: 250 USDC participant deposits
4. Admin stake slashed: 0.01 USDC returned to treasury
5. Participants get: ~4.99 USDC back instead of 5 USDC
```

**Risk Level**: 🔴 CRITICAL

---

#### 1.3 Issue: Stake Lockup Period Tidak Ada

**Current Flow**:
```
Event Created (stake_status = pending)
    ↓
Admin stakes (stake_status = staked)
    ↓
Event completes (stake_status = returned)
    ↓
Admin dapat claim dan transfer keluar SEGERA
```

**Problem**:
- Tidak ada delay antara event completion dan stake return
- Tidak ada dispute window (e.g., 7 days)
- Participant tidak ada waktu untuk file complaint
- Admin dapat lari dengan stake sebelum masalah terdeteksi

**Recommended Lock**: 
- Minimum 7 days dispute period before stake release
- Can only be released oleh oracle atau governance, tidak langsung by admin

**Risk Level**: 🔴 CRITICAL

---

#### 1.4 Issue: Slash Mechanism Manual, Bukan Otomatis

**Current Implementation** (`slash_and_refund.rs`):
```rust
pub fn handler(
    ctx: Context<SlashAndRefund>,
    event_id: String,
    participant_wallets: Vec<Pubkey>,
    refund_amounts: Vec<u64>,
    is_final_batch: bool,
) -> Result<()> {
    // Manual slash by admin atau backend
    // NO automatic trigger
    // NO oracle verification
    // NO dispute resolution
    
    stake_vault.is_slashed = true;
    stake_vault.slashed_at = Clock::get()?.unix_timestamp;
}
```

**Problem**:
- Slash hanya terjadi jika backend/admin manually call `slash_and_refund`
- Tidak ada automated detection untuk:
  - Event cancelled without legitimate reason
  - Participants refund tidak diproses dalam timeframe
  - Vault balance mismatch dengan expected total
  - Admin attempt unauthorized withdrawal

**Example Exploit**:
```
1. Admin creates event, stakes 1 USDC
2. 100 people register, deposit 500 USDC
3. Event completes, admin initiates complete_race
4. Treasury takes 25 USDC fee (5%)
5. Prize pool remaining: 475 USDC
6. Backend manually distributes prizes (if it bothers)
7. But admin ALSO manually transfers 475 USDC to self-owned wallet
8. Slash mechanism: NEVER triggered, because no one called slash_and_refund
```

**Risk Level**: 🔴 CRITICAL

---

### 2. BACKEND LEVEL

#### 2.1 Issue: Staking Service Tidak Ada Minimum Validation

**File**: `staking-service.ts`

```typescript
export async function recordStakeDeposit(
    eventId: string,
    adminWallet: string,
    stakeAmount: number
): Promise<StakeVaultData> {
    const { data, error } = await supabase
        .from('stake_vault')
        .insert({
            event_id: eventId,
            admin_wallet: adminWallet,
            stake_amount: stakeAmount,  // ⚠️ NO VALIDATION!
            is_slashed: false,
        })
        .select()
        .single();
    
    // Accepts ANY amount
}
```

**Problem**:
- Backend just records whatever amount was staked
- No check against event's `registration_fee` and `max_participants`
- No min/max thresholds enforced
- Can't prevent creator from staking 0.000001 USDC

**Fix Needed**:
```typescript
export async function recordStakeDeposit(
    eventId: string,
    adminWallet: string,
    stakeAmount: number
): Promise<StakeVaultData> {
    // Get event details
    const { data: event, error: eventError } = await supabase
        .from('race_events')
        .select('registration_fee_sol, max_participants')
        .eq('id', eventId)
        .single();
    
    if (eventError) throw eventError;
    
    // Calculate minimum required stake
    const minStakeAmount = event.registration_fee_sol * event.max_participants * 0.05; // 5% of max pool
    const maxStakeAmount = event.registration_fee_sol * event.max_participants * 2.0; // Max 2x pool
    
    if (stakeAmount < minStakeAmount) {
        throw new Error(`Stake amount ${stakeAmount} is below minimum ${minStakeAmount}`);
    }
    
    if (stakeAmount > maxStakeAmount) {
        throw new Error(`Stake amount ${stakeAmount} exceeds maximum ${maxStakeAmount}`);
    }
    
    // Record validated stake
    return supabase.from('stake_vault').insert({...}).single();
}
```

**Risk Level**: 🔴 CRITICAL

---

#### 2.2 Issue: Vault Balance Tracking Tidak Robust

**Current Fee Distribution** (`fee-distribution-service.ts`):
```typescript
export function calculateFeeDistribution(
    totalAmount: number,
    feeBps: number
): { feeAmount: number; netAmount: number } {
    const feeAmount = Math.floor((totalAmount * feeBps) / 10000);
    const netAmount = totalAmount - feeAmount;
    return { feeAmount, netAmount };  // ⚠️ Trusts totalAmount parameter!
}
```

**Problem**:
- Backend calculates fees based on `totalAmount` parameter (from client!)
- NO verification against actual vault balance on-chain
- If admin manipulates parameter, calculation is wrong
- Example: 
  - Actual vault: 1000 USDC
  - Admin reports: 500 USDC (underreports)
  - Fee taken: 25 USDC (5% of 500)
  - Admin gains: 25 USDC extra

**Fix Needed**:
```typescript
export async function calculateFeeDistributionWithVerification(
    eventId: string,
    feeBps: number
): Promise<{ feeAmount: number; netAmount: number; vaultBalance: number }> {
    // Query on-chain vault balance
    const vaultBalance = await getOnChainVaultBalance(eventId);
    
    // Verify against DB
    const { data: event } = await supabase
        .from('race_events')
        .select('total_deposits, vault_address')
        .eq('id', eventId)
        .single();
    
    // Allow 1% variance due to rounding
    const expectedMax = event.total_deposits * 1.01;
    const expectedMin = event.total_deposits * 0.99;
    
    if (vaultBalance < expectedMin || vaultBalance > expectedMax) {
        throw new Error(
            `Vault balance mismatch: on-chain=${vaultBalance}, expected=${event.total_deposits}`
        );
    }
    
    const feeAmount = Math.floor((vaultBalance * feeBps) / 10000);
    const netAmount = vaultBalance - feeAmount;
    
    return { feeAmount, netAmount, vaultBalance };
}
```

**Risk Level**: 🔴 CRITICAL

---

#### 2.3 Issue: Event Completion Listener Tidak Enforce State

**File**: `eventCompletionListener.ts`

```typescript
export async function handleEventCompletion(payload: {
    event_id: string;
    completion_timestamp?: number;
    finishers?: Array<{ runner_id: string; position: number }>;
}): Promise<EventCompletionResponse> {
    // No check if event is actually completed on-chain
    // No verification of finisher list
    // No validation of state transitions
    
    // Backend just trusts the payload!
}
```

**Problem**:
- Event completion dapat di-trigger dari backend tanpa on-chain verification
- Tidak ada check apakah `is_completed` flag actually set on-chain
- Backend dapat manually trigger fee distribution tanpa blockchain confirmation
- Admin dapat call completion endpoint bypassing blockchain logic

**Risk Level**: 🔴 CRITICAL

---

### 3. FRONTEND LEVEL

#### 3.1 Issue: No Stake Amount Validation Before Submission

**File**: `app/creator/create/page.tsx`

```typescript
const handleSubmit = async (e: React.FormEvent) => {
    // ...validation for name, date, etc...
    
    const stakeAmount = parseFloat(stakeAmountUsdc);  // ⚠️ No validation!
    
    // Direct insert to DB
    const { data, error: insertError } = await supabase
        .from('race_events')
        .insert({
            stake_amount: stakeAmount > 0 ? stakeAmount : 0,  // ⚠️ Accepts 0!
            stake_status: 'pending',
            // ...
        })
        .select()
        .single();
}
```

**Problem**:
- Frontend allows any stake amount (including 0)
- No warning to creator if stake is suspiciously low
- No calculation of recommended stake based on event parameters
- StakingInfoCard only shows informational breakdown, not enforcement

**Risk Level**: 🟡 MEDIUM (Backend should catch this)

---

#### 3.2 Issue: No Real-time Vault Balance Verification

**EarningsBreakdownCard.tsx**:
```typescript
export default function EarningsBreakdownCard({
    eventId,
    registrationFeePerPerson,
    stakeAmount,
    participantCount,
    // ...
}) {
    // Calculations based on LOCAL participant count
    const totalDeposits = registrationFeePerPerson * participantCount;
    const grossAmount = totalDeposits + stakeAmount;  // ⚠️ Trusts local data!
    const feeAmount = Math.floor((grossAmount * protocolFeeBps) / 10000);
    const netAmount = grossAmount - feeAmount;
}
```

**Problem**:
- Card calculates earnings based on `participantCount` from props
- Does NOT query actual vault balance from on-chain
- If admin manually drained vault, frontend still shows incorrect calculation
- Creator sees inflated earnings potential

**Risk Level**: 🟡 MEDIUM

---

### 4. DATABASE LEVEL

#### 4.1 Issue: No Unique Constraints on Critical Fields

**File**: `phase_2_6_staking.sql`

```sql
CREATE TABLE stake_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES race_events(id),
    admin_wallet VARCHAR(64) NOT NULL,
    stake_amount DECIMAL(18, 9) NOT NULL,
    UNIQUE(event_id, admin_wallet)  // ✅ Good
);
```

✅ This is actually correct - unique constraint prevents duplicate stakes.

But missing:
```sql
ALTER TABLE race_events ADD CONSTRAINT min_stake_check
    CHECK (stake_amount >= registration_fee_sol * max_participants * 0.05);
    -- Enforce minimum stake is 5% of max pool
```

**Risk Level**: 🟡 MEDIUM

---

#### 4.2 Issue: Protocol Config Immutable

```sql
INSERT INTO protocol_config (treasury_address, protocol_fee_bps)
VALUES ('Treasury_Address_Placeholder_Update_ME', 500)
ON CONFLICT (treasury_address) DO NOTHING;
```

**Problem**:
- Only 1 protocol config row in DB
- Can be updated anytime (no version history)
- No audit trail of who changed fees and when
- Admins could change fees retroactively

**Suggested Fix**:
```sql
CREATE TABLE protocol_config_history (
    id SERIAL PRIMARY KEY,
    treasury_address VARCHAR(64),
    protocol_fee_bps SMALLINT,
    changed_by VARCHAR(64),  -- admin wallet
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    FOREIGN KEY (event_id) REFERENCES race_events(id)
);
```

**Risk Level**: 🟡 MEDIUM

---

## 🎯 Critical Scam Scenarios

### Scenario 1: "Rug Pull" Attack

```
Week 1:
  - Admin creates event: 100 max participants, 5 USDC fee, 0.01 USDC stake
  - Marketing: "Exciting marathon with 500 USDC prize pool!"
  
Week 2:
  - 100 people register, 500 USDC vault balance
  - Admin calls complete_race (no participants finished)
  - Treasury fee: 25 USDC (5%)
  - Prize pool remaining: 475 USDC
  
Week 3:
  - Event marked as "Completed"
  - backend.handleEventCompletion() processes "no refunds needed"
  - Admin wallet balance: 475 + 0.01 = 475.01 USDC
  - Participants: 0 USDC refunded
  - No slash triggered
  
Week 4:
  - Complaint filed: No refunds given
  - Investigation: Admin stake was only 0.01 USDC
  - Slash triggered (too late): Admin slashed 0.01 USDC
  - Participants still get nothing
  - Damage: 475 USDC stolen
```

---

### Scenario 2: "Flash Loan" Manipulation

```
Assumption: If vault integration with DeFi planned

Event setup: 100 people, 500 USDC vault
  1. Admin takes flash loan: 10,000 USDC
  2. Deposits to vault (temporarily inflates balance)
  3. Calls process_refunds with fake higher vault_balance
  4. Fee calculated on inflated amount (huge surplus)
  5. Repays flash loan
  6. Keeps surplus as "earnings"
```

---

### Scenario 3: "Slow Bleed" Attack

```
Event active for 3 months
  - Week 1: 50 registrations = 250 USDC
  - Admin partially claims earnings "early"
  - Weeks 2-12: More registrations = 500 USDC total
  - Vault becomes: 500 USDC (but claimed 100 USDC already)
  - At completion: Admin claims both stake AND remaining balance
  - No mechanism to audit intermediate withdrawals
```

---

## ✅ Recommended Fixes (Priority Order)

### 🔴 CRITICAL (Deploy within 1 week)

#### 1. Add Minimum Stake Validation (On-chain + Backend)

**On-chain** (`stake_event.rs`):
```rust
pub fn handler(
    ctx: Context<StakeEvent>,
    event_id: String,
    stake_amount: u64,
) -> Result<()> {
    let event = &mut ctx.accounts.event;
    
    // Calculate minimum stake: 5% of max possible pool
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
    
    require!(stake_amount >= min_stake, ErrorCode::StakeTooLow);
    require!(stake_amount <= max_stake, ErrorCode::StakeTooHigh);
    
    // ... rest of handler
}
```

**Backend** (`staking-service.ts`):
```typescript
export async function validateStakeAmount(
    eventId: string,
    stakeAmount: number
): Promise<{ isValid: boolean; minAmount: number; maxAmount: number }> {
    const { data: event } = await supabase
        .from('race_events')
        .select('registration_fee_sol, max_participants')
        .eq('id', eventId)
        .single();
    
    const expectedPool = event.registration_fee_sol * event.max_participants;
    const minStake = expectedPool * 0.05;  // 5% minimum
    const maxStake = expectedPool * 2.0;   // 2x maximum
    
    return {
        isValid: stakeAmount >= minStake && stakeAmount <= maxStake,
        minAmount: minStake,
        maxAmount: maxStake
    };
}
```

---

#### 2. Add Dispute Lock Period (On-chain)

**New State Field**:
```rust
pub struct Event {
    // ... existing fields
    pub dispute_lock_until: i64,  // UTC timestamp when stake can be released
    pub locked_until_bump: u8,
}
```

**Modify `complete_race` and `process_refunds`**:
```rust
pub fn handler(ctx: Context<CompleteRace>, _event_id: String) -> Result<()> {
    let event = &mut ctx.accounts.event;
    
    // Set 7-day lock period
    let seven_days_seconds = 7 * 24 * 60 * 60;
    let current_time = Clock::get()?.unix_timestamp;
    event.dispute_lock_until = current_time + seven_days_seconds;
    
    // Mark completed but DON'T release stake yet
    event.is_completed = true;
    
    // ... fee distribution logic
}
```

**New Instruction** `release_stake_after_lock`:
```rust
pub fn handler(ctx: Context<ReleaseStake>) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    require!(
        current_time >= ctx.accounts.event.dispute_lock_until,
        ErrorCode::StakeLocked
    );
    
    // Transfer stake back to admin
    // ... transfer logic
}
```

---

#### 3. Add Automatic Slash Trigger (Backend Cron)

```typescript
// New scheduled task: runs every hour
export async function autoDetectAndSlashFraud() {
    // Find events marked Completed but within dispute window
    const { data: suspiciousEvents } = await supabase
        .from('race_events')
        .select('id, vault_address, total_deposits, stake_amount, is_completed')
        .eq('is_completed', true)
        .lt('completed_at', new Date(Date.now() - 48*3600*1000).toISOString());
    
    for (const event of suspiciousEvents) {
        // Query on-chain vault balance
        const onChainBalance = await getVaultBalance(event.vault_address);
        
        // Expected: total_deposits + stake (before fee)
        const expected = event.total_deposits + event.stake_amount;
        
        // If mismatch detected, trigger slash
        if (onChainBalance < expected * 0.95) { // Allow 5% variance
            await markStakeAsSlashed(event.id, event.admin_wallet);
            console.log(`[AUTO-SLASH] Event ${event.id} fraudulent - slashing stake`);
        }
    }
}
```

---

#### 4. Implement Vault Balance Verification Hook

```typescript
// Before ANY fee distribution
export async function verifyVaultIntegrity(eventId: string): Promise<boolean> {
    // Get on-chain vault balance
    const onChainBalance = await connection.getTokenAccountBalance(vaultAddress);
    
    // Get expected from DB
    const { data: event } = await supabase
        .from('race_events')
        .select('total_deposits, vault_address')
        .eq('id', eventId)
        .single();
    
    const tolerance = 0.01; // Allow 1% rounding variance
    const expectedMin = event.total_deposits * (1 - tolerance);
    const expectedMax = event.total_deposits * (1 + tolerance);
    
    const balanceValid = 
        onChainBalance.value >= expectedMin && 
        onChainBalance.value <= expectedMax;
    
    if (!balanceValid) {
        // BLOCK fee distribution
        throw new Error(
            `Vault integrity check failed: ` +
            `on-chain=${onChainBalance.value}, expected=${event.total_deposits}`
        );
    }
    
    return true;
}

// Call before complete_race or process_refunds
await verifyVaultIntegrity(eventId);
```

---

### 🟡 HIGH (Deploy within 2 weeks)

#### 5. Add Protocol Config Version History

```typescript
CREATE TABLE protocol_config_audit (
    id SERIAL PRIMARY KEY,
    treasury_address VARCHAR(64),
    protocol_fee_bps SMALLINT,
    changed_by VARCHAR(64),  -- admin signature
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    reason VARCHAR(256),
    tx_signature VARCHAR(88)  -- on-chain record
);
```

#### 6. Add Real-time Vault Balance Queries

```typescript
// New API endpoint
router.get('/api/events/:eventId/vault-balance', async (req, res) => {
    const vaultAddress = await getVaultAddressForEvent(req.params.eventId);
    const onChainBalance = await connection.getTokenAccountBalance(vaultAddress);
    const { data: event } = await supabase
        .from('race_events')
        .select('total_deposits')
        .eq('id', req.params.eventId)
        .single();
    
    res.json({
        onChainBalance: onChainBalance.value,
        expectedBalance: event.total_deposits,
        variance: (onChainBalance.value - event.total_deposits) / event.total_deposits,
        matches: Math.abs(variance) < 0.01
    });
});
```

---

### 🟢 MEDIUM (Deploy within 1 month)

#### 7. Implement Governance Slash Mechanism

```rust
// Multi-sig authority for slash decisions
pub struct SlashGovernance {
    pub signers: Vec<Pubkey>,
    pub threshold: u8,
}

// Require 2-of-3 multi-sig for manual slash
pub fn slash_with_governance(
    ctx: Context<SlashWithGovernance>,
    // ... signer accounts, signatures
) -> Result<()> {
    require!(
        valid_signature_threshold_reached,
        ErrorCode::InsufficientSignatures
    );
}
```

---

## 📊 Implementation Roadmap

| Priority | Fix | Layer | Est. Hours | Status |
|----------|-----|-------|-----------|--------|
| 🔴 | Min Stake Validation | SC + Backend | 4 | TODO |
| 🔴 | Dispute Lock Period | SC | 3 | TODO |
| 🔴 | Auto Slash Detection | Backend | 3 | TODO |
| 🔴 | Vault Integrity Check | SC + Backend | 3 | TODO |
| 🟡 | Config Audit Trail | Backend + DB | 2 | TODO |
| 🟡 | Real-time Balance API | Backend | 2 | TODO |
| 🟡 | Frontend Validation | Frontend | 2 | TODO |
| 🟢 | Multi-sig Governance | SC + Backend | 6 | TODO |
| 🟢 | Slash Dispute Process | SC + Backend | 4 | TODO |

**Total**: ~29 hours (~1 week full-time)

---

## 🧪 Testing Checklist

### Unit Tests

- [ ] Test stake validation: min/max boundaries
- [ ] Test dispute lock: can't release before timelock
- [ ] Test auto-slash: detects balance mismatch
- [ ] Test fee calculation: uses verified vault balance
- [ ] Test vault integrity: rejects if on-chain ≠ DB

### Integration Tests

```typescript
// Test: Creator stakes 0.001 USDC (should fail)
expect(async () => {
    await createEventWithStake(100, 5, 0.001);
}).toThrow("StakeTooLow");

// Test: Event completes, stake locked for 7 days
await completeRace(eventId);
expect(async () => {
    await releaseStake(eventId);
}).toThrow("StakeLocked");

// Test: Vault balance mismatch triggers auto-slash
await manuallyDrainVault(eventId, 100); // Drain 100 USDC
await autoSlashCheck();
expect(event.stake_status).toBe("slashed");

// Test: Fee distribution fails if vault integrity check fails
await tamperWithVaultRecord(eventId, 1000);
expect(async () => {
    await processFeeDistribution(eventId);
}).toThrow("VaultIntegrityCheckFailed");
```

---

## 🔒 Security Best Practices Going Forward

1. **On-chain enforcement > Backend enforcement > Frontend enforcement**
   - Stake validation MUST be on-chain
   - Backend should verify, not trust client
   - Frontend is last resort (UX)

2. **All financial operations must be atomic**
   - Stake deposit, fee calculation, prize distribution in one TX when possible
   - If multi-step, use state flags to prevent partial execution

3. **Implement oracle verification**
   - Use Switchboard or Pyth for off-chain data
   - Verify vault balance via oracle, not just backend

4. **Add dispute resolution mechanism**
   - 7-day window for participants to file complaints
   - Multi-sig governance to review and slash
   - Transparent slash history on-chain

5. **Enable comprehensive audit logging**
   - Log all vault operations
   - Include timestamps, amounts, signers
   - Make queryable by participants

---

## 📞 Questions for Product Team

1. **What's acceptable minimum stake?** 
   - Currently: 5% of max pool (configurable)
   - Too high? Risk won't cover bad events

2. **How long dispute window?**
   - Currently: 7 days
   - Too short? Can't investigate
   - Too long? Blocks creator payouts

3. **Who decides slashing?**
   - Protocol admin only? (centralized)
   - Multi-sig? (governance)
   - DAO vote? (decentralized)

4. **Should we integrate DeFi yield?**
   - Mentioned in GEMINI.md but not implemented
   - Additional complexity & risk (smart contract security)
   - Recommend delay to v2

---

## ✍️ Sign-Off

This analysis identifies systemic gaps in staking enforcement that could enable significant fraud. **Recommend implementing Critical fixes before mainnet deployment.**

Next steps:
1. Review this analysis with security team
2. Prioritize fixes (above roadmap)
3. Implement & test in staging
4. Conduct external audit (if possible)
5. Deploy to devnet for longer testing
6. Only then consider mainnet

**Status**: ⏳ AWAITING REVIEW & REMEDIATION

