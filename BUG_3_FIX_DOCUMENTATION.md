# Bug #3 Fix Documentation: Prize Distribution Root Cause

## Problem Summary

**The Root Cause:** The `refund-scheduler.ts` was checking the wrong column to determine if a runner had been paid.

- **Incorrect behavior:** `isRunnerPaid()` checked `tx_signature` (set by `record_finish` on-chain checkpoint)
- **Result:** All runners with successful checkpoints were marked as "already paid"
- **Impact:** `processRefunds()` would skip ALL runners → **prizes never get distributed**

## Root Cause Analysis

### Data Flow Issue

```
Runner finishes race
    ↓
MQTT listener → record_finish() on-chain
    ↓
Smart contract stores transaction in runners.tx_signature ← Sets this!
    ↓
Refund scheduler runs
    ↓
isRunnerPaid() checks tx_signature  ← WRONG! This is checkpoint, not prize!
    ↓
Thinks runner is already paid → SKIPS them
    ↓
Prizes NEVER distributed ❌
```

### Why It Happened

- `tx_signature` is meant to track the **checkpoint recording transaction** (when finish was recorded on-chain)
- But the scheduler reused this same column to track the **prize distribution transaction**
- This created a logical collision: a runner could have `tx_signature` from checkpoint but NOT be paid yet

## Solution Implemented

### Schema Change

Added new column `prize_tx_signature` to `runners` table:

```sql
ALTER TABLE runners ADD COLUMN prize_tx_signature VARCHAR(88);
```

This creates a clear separation:
- `tx_signature` → Checkpoint transaction (from `record_finish`)
- `prize_tx_signature` → Prize distribution transaction (from `processRefunds`)

### Code Changes

#### 1. `isRunnerPaid()` Fix

**Before:**
```typescript
async function isRunnerPaid(runnerId: string): Promise<boolean> {
    const { data } = await supabase
        .from('runners')
        .select('tx_signature')  // ❌ Wrong column
        .eq('id', runnerId)
        .single();
    
    if (data?.tx_signature) {  // ❌ Checking checkpoint, not prize
        const status = await conn.getSignatureStatus(data.tx_signature);
        return status.value?.confirmationStatus === 'finalized';
    }
    return false;
}
```

**After:**
```typescript
async function isRunnerPaid(runnerId: string): Promise<boolean> {
    const { data } = await supabase
        .from('runners')
        .select('prize_tx_signature')  // ✅ Correct column
        .eq('id', runnerId)
        .single();
    
    if (data?.prize_tx_signature) {  // ✅ Checking actual prize distribution
        const status = await conn.getSignatureStatus(data.prize_tx_signature);
        return status.value?.confirmationStatus === 'finalized';
    }
    return false;
}
```

#### 2. `updateRunnersTxSignature()` Fix

**Before:**
```typescript
async function updateRunnersTxSignature(runnerIds: string[], txSignature: string) {
    await supabase
        .from('runners')
        .update({ tx_signature: txSignature })  // ❌ Overwriting checkpoint data
        .in('id', runnerIds);
}
```

**After:**
```typescript
async function updateRunnersTxSignature(runnerIds: string[], txSignature: string) {
    await supabase
        .from('runners')
        .update({ prize_tx_signature: txSignature })  // ✅ New dedicated column
        .in('id', runnerIds);
}
```

## How to Verify the Fix Works

### Pre-Fix Verification (Current State)

Run this query to see the problem:
```sql
-- Check runners with tx_signature but no prize_tx_signature
SELECT id, chip_uid, wallet_address, tx_signature, prize_tx_signature 
FROM runners 
WHERE event_id = 'YOUR_EVENT_ID' 
AND tx_signature IS NOT NULL 
AND prize_tx_signature IS NULL;

-- These runners appeared "paid" but never received prizes!
```

### Post-Fix Verification (After Migration)

1. **Run the migration:**
   ```bash
   supabase db reset  # or apply the migration to your environment
   ```

2. **Verify column exists:**
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'runners' 
   AND column_name IN ('tx_signature', 'prize_tx_signature');
   ```

3. **Run scheduler with test event:**
   ```bash
   npm run test:refund-scheduler
   ```

4. **Verify correct columns are updated:**
   ```sql
   -- After scheduler runs, prize_tx_signature should be populated
   SELECT id, chip_uid, finish_position, tx_signature, prize_tx_signature 
   FROM runners 
   WHERE event_id = 'TEST_EVENT_ID'
   ORDER BY finish_position;
   ```

   Expected results:
   - ✅ `tx_signature` should remain unchanged (from checkpoint)
   - ✅ `prize_tx_signature` should contain prize distribution transaction
   - ✅ For winners: both should be populated and different values
   - ✅ For non-finishers: only `prize_tx_signature` might be set

5. **Verify on-chain balances updated:**
   ```bash
   # Check wallet balances to confirm prizes were transferred
   solana balance <winner_wallet_address>
   ```

### Test Scenarios

#### Scenario 1: First-time Prize Distribution (Clean State)

**Setup:**
- Event completed, no previous prize runs
- 10 runners finished, 4 to be paid prizes

**Expected:**
1. `isRunnerPaid()` returns false for all (no `prize_tx_signature`)
2. Scheduler processes all 10 runners
3. Batch transaction submitted successfully
4. All 10 runners get `prize_tx_signature` set
5. Winners' wallets receive SOL

#### Scenario 2: Idempotency (Scheduler Runs Twice)

**Setup:**
- Event already processed once
- Scheduler runs again

**Expected:**
1. First runner check: `isRunnerPaid()` returns true (has `prize_tx_signature`)
2. All runners marked as already processed
3. No new batch submitted
4. Log shows "All runners already processed"

#### Scenario 3: Partial Failure + Retry

**Setup:**
- Event processed, only batch 1 of 3 succeeded
- Scheduler runs again

**Expected:**
1. First 4 winners have `prize_tx_signature` → marked as paid
2. Non-winners don't have `prize_tx_signature` → will be processed in new batch
3. Only non-winners included in retry batch
4. All eventually processed

## Idempotency Guarantee

The fix maintains idempotency through:

1. **Column-based tracking:** `prize_tx_signature` is the source of truth
2. **On-chain verification:** Checks if signature is finalized on Solana
3. **Deterministic batching:** Winners always in first batch (if not paid)
4. **Refund logs:** Backup audit trail of all batch transactions

This prevents duplicate payments even if scheduler crashes and restarts.

## Related Issues

- **Bug #1:** Race condition on `finish_position` (already fixed with sequential queue)
- **Bug #2:** Leaderboard sorting will be fixed once `finish_position` is accurate
- **Bug #3:** Root cause of prizes not being distributed (fixed by this PR) ✅

## Migration Path

### For Deployed Systems

1. Apply migration: `phase_2_4_prize_tracking.sql`
2. Redeploy backend with updated scheduler code
3. Verify column added: `SELECT COUNT(*) FROM runners WHERE prize_tx_signature IS NULL;`
4. Test with dry-run event before production
5. Monitor logs for first prize distribution run

### For New Deployments

- Migration automatically runs during initial `supabase db push`
- No manual steps needed

---

**Author:** Debugging session on Prize Distribution Issue  
**Status:** ✅ Fix implemented and documented  
**Next Steps:** Deploy to staging, run tests, then production
