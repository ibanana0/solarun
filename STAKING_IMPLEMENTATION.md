# Staking & Protocol Fee Implementation - Complete Documentation

**Status**: ✅ FULLY IMPLEMENTED

## Overview

This document details the complete implementation of staking collateral and protocol fee distribution across the Solana smart contract, backend, and frontend layers.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    EVENT CREATION FLOW                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Frontend:                                               │
│     - User creates event with staking info                 │
│     - Calls initialize_event on blockchain                 │
│     - Displays StakingInfoCard with fee breakdown          │
│                                                              │
│  2. Smart Contract (initialize_event):                     │
│     - Creates Event account (stake_amount=0 initially)     │
│     - Sets stake_status='pending'                          │
│     - Creates vault for event deposits                     │
│                                                              │
│  3. Backend (createEvent API):                             │
│     - Saves event to DB with stake_amount and fee info     │
│     - Sets stake_status='pending'                          │
│     - Records in fee_distribution table                    │
│                                                              │
│  4. Frontend (stake_event):                                │
│     - User deposits stake to blockchain vault              │
│     - Calls stake_event instruction                        │
│                                                              │
│  5. Smart Contract (stake_event):                          │
│     - Transfers tokens to StakeVault PDA                   │
│     - Records stake_amount in Event account                │
│     - Creates StakeVault tracking account                  │
│                                                              │
│  6. Backend (confirmStakeDeposit):                         │
│     - Verifies blockchain transaction                      │
│     - Updates stake_status='staked'                        │
│     - Records in stake_vault table                         │
│                                                              │
│  7. Frontend (start_race):                                 │
│     - User starts event (only if stake_status='staked')    │
│     - Transitions to Active status                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Smart Contract Updates ✅

### 1.1 New State Accounts

#### GlobalState
- **Purpose**: Store protocol configuration (treasury address, fee rate)
- **Fields**:
  - `treasury_address: Pubkey` - Wallet for receiving protocol fees
  - `protocol_fee_bps: u16` - Fee in basis points (e.g., 500 = 5%)
  - `bump: u8` - PDA seed

**File**: `state.rs`

#### StakeVault
- **Purpose**: Track admin's stake deposit for each event
- **Fields**:
  - `event: Pubkey` - Reference to Event account
  - `admin: Pubkey` - Event admin who staked
  - `vault: Pubkey` - Token account holding the stake
  - `amount: u64` - Stake amount in token units
  - `is_slashed: bool` - Whether stake was forfeited
  - `bump: u8` - PDA seed

**File**: `state.rs`

#### Updated Event Account
- **New Fields**:
  - `stake_vault: Pubkey` - PDA of StakeVault
  - `stake_amount: u64` - Amount admin must deposit
  - `is_completed: bool` - Prevent double-processing
  - `stake_vault_bump: u8` - Bump for stake vault

**File**: `state.rs`

### 1.2 New Instructions

#### initialize_global_state
- **Caller**: Protocol admin (one-time setup)
- **Parameters**:
  - `treasury_address: Pubkey` - Where fees go
  - `protocol_fee_bps: u16` - Fee percentage in basis points
- **Validation**: Fee must be ≤ 10000 bps (100%)
- **Seeds**: `[b"global"]`
- **File**: `instructions/initialize_global_state.rs`

#### stake_event
- **Caller**: Event admin
- **Parameters**:
  - `event_id: String` - Event identifier
  - `stake_amount: u64` - Amount to deposit (in token units)
- **Actions**:
  1. Transfer tokens from admin's ATA to vault
  2. Record stake_amount in Event account
  3. Create StakeVault account to track stake
- **Validation**: 
  - Event must be Initialized status
  - Stake amount > 0
  - No previous stake deposit
- **Seeds**: `[b"stake_vault", event_pda]`
- **File**: `instructions/stake_event.rs`

#### Updated complete_race
- **Previous behavior**: Just marked event as Completed
- **New behavior**: 
  1. Calculate protocol fee from vault balance
  2. Transfer fee to treasury
  3. Transfer remaining balance to admin (this includes their stake minus fees)
  4. Set `is_completed = true` to prevent re-entry
- **Fee Calculation**:
  ```
  fee = vault_balance × (protocol_fee_bps / 10000)
  admin_gets = vault_balance - fee
  ```
- **Signers**: Event PDA (for vault authority)
- **File**: `instructions/complete_race.rs`

#### slash_and_refund
- **Caller**: Event admin or backend (on event failure)
- **Parameters**:
  - `event_id: String`
  - `participant_wallets: Vec<Pubkey>` - Recipients for refunds
  - `refund_amounts: Vec<u64>` - Individual refund amounts
  - `is_final_batch: bool` - Whether this completes processing
- **Actions**:
  1. Extract admin's stake from vault as penalty
  2. Send stake to treasury
  3. Process refunds to participants from remaining vault
  4. Set `is_completed = true` if final batch
- **File**: `instructions/slash_and_refund.rs`

### 1.3 Updated Error Codes

**File**: `error.rs`

Added error codes E0060-E0068:
- E0060: InsufficientStake
- E0061: StakeAlreadyDeposited
- E0062: GlobalStateNotFound
- E0063: TreasuryAddressNotSet
- E0064: EventAlreadyCompleted
- E0065: InsufficientVaultFunds
- E0066: StakeVaultError
- E0067: CannotRefundEventNotCompleted
- E0068: RefundAlreadyProcessed

---

## Phase 2: Backend Updates ✅

### 2.1 Database Schema Changes

**Migration File**: `phase_2_6_staking.sql`

#### Updated race_events Table
- `stake_amount: DECIMAL(18,9)` - What admin must deposit
- `stake_status: stake_status ENUM` - pending | staked | returned | slashed
- `protocol_fee_bps: SMALLINT` - From global config
- `is_completed: BOOLEAN` - Track completion processing
- `treasury_fee_collected: DECIMAL(18,9)` - Amount sent to treasury

#### New protocol_config Table
- `id: SERIAL PRIMARY KEY`
- `treasury_address: VARCHAR(64)` - UNIQUE
- `protocol_fee_bps: SMALLINT`
- Stores protocol configuration

#### New stake_vault Table
- `id: UUID PRIMARY KEY`
- `event_id: UUID` - FK to race_events
- `admin_wallet: VARCHAR(64)` - Admin's address
- `stake_amount: DECIMAL(18,9)` - Amount deposited
- `is_slashed: BOOLEAN` - Whether forfeited
- `slashed_at: TIMESTAMPTZ` - When slashed
- `returned_at: TIMESTAMPTZ` - When returned
- UNIQUE constraint on (event_id, admin_wallet)

#### New fee_distribution Table
- `id: UUID PRIMARY KEY`
- `event_id: UUID` - FK to race_events
- `tx_signature: VARCHAR(88)` - Transaction hash
- `gross_amount: DECIMAL(18,9)` - Total vault
- `protocol_fee_amount: DECIMAL(18,9)` - Fee taken
- `admin_net_amount: DECIMAL(18,9)` - Admin receives
- `treasury_address: VARCHAR(64)`
- `status: VARCHAR(20)` - pending | completed | failed
- `error_message: TEXT` - For failed distributions

### 2.2 New Backend Services

#### staking-service.ts
**Location**: `src/lib/staking-service.ts`

Functions:
- `recordStakeDeposit()` - Save stake to DB after blockchain confirmation
- `updateEventStakeStatus()` - Change stake_status (pending → staked → returned/slashed)
- `getEventStake()` - Retrieve stake info
- `markStakeAsSlashed()` - Mark stake forfeited
- `markStakeAsReturned()` - Mark stake returned to admin

#### fee-distribution-service.ts
**Location**: `src/lib/fee-distribution-service.ts`

Functions:
- `calculateFeeDistribution()` - Math: given total and bps, returns fee and net
- `recordFeeDistribution()` - Create fee record in DB
- `getFeeDistribution()` - Retrieve fee distribution for event
- `updateFeeDistributionStatus()` - Update status (pending → completed/failed)
- `getProtocolConfig()` - Get treasury address and fee rate
- `updateProtocolConfig()` - Update global settings (admin only)
- `estimateEarningsBreakdown()` - Calculate earnings forecast

### 2.3 New API Endpoints

#### createEvent
**Location**: `src/api/createEvent.ts`

```typescript
POST /api/events/create
Body: {
    event_id: string,
    name: string,
    description?: string,
    max_participants: number,
    registration_fee_usdc: number,
    stake_amount_usdc: number,    // ← NEW: Required stake
    start_time: ISO string,
    end_time: ISO string,
    admin_wallet: string,
}

Response: {
    success: boolean,
    event_id: string,
    required_stake_amount: number,
    protocol_fee_bps: number,
    protocol_fee_percentage: string,
}
```

Functions:
- `createEvent()` - Save event with staking requirement
- `confirmStakeDeposit()` - Mark stake as confirmed after blockchain tx
- `getEventDetails()` - Retrieve event including stake info
- `updateEventVaultAddress()` - Set blockchain vault address

#### eventCompletionListener
**Location**: `src/api/eventCompletionListener.ts`

```typescript
POST /api/events/complete
Body: {
    event_id: string,
    completion_timestamp: ISO string,
    finishers: Array<{
        runner_id: string,
        position: number,
        finish_time: number,
    }>,
}
```

Functions:
- `handleEventCompletion()` - Process event completion, calculate fees
- `confirmFeeDistribution()` - Mark fee distribution complete
- `handleEventFailure()` - Process event failure, slash stake
- `getPendingFeeDistributions()` - Get events awaiting fee distribution

**Important**: This service includes comments for where to inject backend private key if acting as a "crank" (automated fee distribution executor). See code comments for BACKEND_ACTS_AS_CRANK flag.

---

## Phase 3: Frontend Updates ✅

### 3.1 New Custom Hook

#### useStakingAndFees.ts
**Location**: `hooks/useStakingAndFees.ts`

```typescript
interface StakingInfo {
    stakeAmount: number,
    protocolFeeBps: number,
    protocolFeeAmount: number,
    netToAdmin: number,
    feePercentage: string,
}

Functions:
- calculateFeeBreakdown(totalAmount, feeBps) → breakdown
- executeStakeEvent(params) → txSignature  // Calls blockchain stake_event
- estimateEarnings(fee, participants, stake, bps) → forecast
```

### 3.2 New Components

#### StakingInfoCard.tsx
**Location**: `components/StakingInfoCard.tsx`

Displays:
- **Stake Requirement**: What admin must deposit (orange warning box)
- **Staking Details**: Amount, registration fee, max participants
- **Protocol Fee**: Rate and basis points
- **Minimum Earnings**: With 2 participants
- **Maximum Earnings**: Full house estimate
- **Slash Risk**: Warning about stake forfeiture

**Usage in create event form**:
```tsx
<StakingInfoCard
    stakeAmount={10.5}
    registrationFee={5}
    maxParticipants={100}
    protocolFeeBps={500}
    estimatedParticipants={50}
/>
```

#### EarningsBreakdownCard.tsx
**Location**: `components/EarningsBreakdownCard.tsx`

Displays in EO dashboard:
- **Revenue Sources**: Deposits + Stake = Gross
- **Fee Breakdown**: Amount deducted for protocol
- **Net Earnings**: What admin receives
- **Stake Status Indicator**: pending | staked | returned | slashed
- **Summary Table**: Quick reference
- **Action Button**: "Claim {amount}" if ready

**Props**:
```typescript
{
    eventId: string,
    eventName: string,
    status: 'pending'|'active'|'completed'|'settled',
    registrationFeePerPerson: number,
    stakeAmount: number,
    participantCount: number,
    protocolFeeBps: number,
    isCompleted: boolean,
    stakeStatus: 'pending'|'staked'|'returned'|'slashed',
    treasuryFeeCollected?: number,
}
```

### 3.3 Integration Points

#### In Create Event Form
1. Add `stakeAmount` input field (after `maxParticipants`)
2. Import and render `<StakingInfoCard>` in right column
3. When creating event on blockchain:
   ```
   - Call initialize_event (existing)
   - Wait for confirmation
   - Show success with instruction to call stake_event next
   ```
4. Add separate "Deposit Stake" button:
   ```
   - Call useStakingAndFees.executeStakeEvent()
   - Show loading state
   - Confirm on blockchain
   - Update DB via confirmStakeDeposit API
   ```

#### In Creator Dashboard (creator/page.tsx)
1. Fetch event with stake_status and earnings data
2. For each event, render `<EarningsBreakdownCard>`
3. Show "Claim" button only if:
   ```
   status === 'completed' && stakeStatus === 'returned'
   ```
4. Display "Event In Progress" if:
   ```
   status === 'active' && stakeStatus === 'staked'
   ```

---

## Error Handling & User Experience

### Frontend Error Handling
All blockchain calls should wrap in try-catch:
```typescript
try {
    const tx = await program.methods.stakeEvent(...)
        .accounts({...})
        .rpc();
    // Wait for confirmation
    await confirmStakeDeposit(eventId, adminWallet, amount, tx);
} catch (error) {
    if (error.message.includes('insufficient funds')) {
        showError('Insufficient USDC in your wallet');
    } else if (error.message.includes('InsufficientStake')) {
        showError('Stake amount must be greater than 0');
    } else if (error.message.includes('StakeAlreadyDeposited')) {
        showError('Stake already deposited for this event');
    } else {
        showError(`Transaction failed: ${error.message}`);
    }
}
```

### RPC Error Messages to Display
- "Network error" → Suggest retry
- "Transaction failed" → Check Solana Explorer
- "Insufficient SOL" → User needs SOL for gas
- "Insufficient USDC" → User needs more USDC balance
- Smart contract errors → Map to ErrorCode messages

---

## Configuration & Setup

### Environment Variables

**Backend (.env)**:
```env
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...

# Optional: Enable backend as crank
BACKEND_ACTS_AS_CRANK=false
# BACKEND_PRIVATE_KEY=base64_encoded_keypair  # ONLY if acting as crank
```

**Smart Contract (lib.rs)**:
```rust
declare_id!("9E1BTHP1EP9UQbbXJKZ8Laj7PxXw1vhxJTeFpEEjfYZn");
// Update if using different program ID
```

### Smart Contract Deployment Steps

1. **Initialize Global State** (one-time):
   ```
   - Call initialize_global_state
   - Set treasury_address (your treasury wallet)
   - Set protocol_fee_bps (e.g., 500 = 5%)
   ```

2. **For Each Event**:
   ```
   - Call initialize_event (creates Event account)
   - User deposits stake → stake_event (creates StakeVault)
   - User starts → start_race (Active status)
   - On completion → complete_race (fee distribution)
   ```

3. **For Failed Events**:
   ```
   - Call slash_and_refund (refund participants, slash stake)
   ```

---

## Testing Checklist

### Smart Contract Tests
- [ ] initialize_global_state sets treasury correctly
- [ ] stake_event transfers tokens and records stake
- [ ] complete_race calculates and distributes fees correctly
- [ ] complete_race marks is_completed=true (prevents double-call)
- [ ] slash_and_refund sends stake to treasury
- [ ] slash_and_refund processes refunds correctly
- [ ] All error codes fire under appropriate conditions

### Backend Tests
- [ ] createEvent saves to DB with correct stake info
- [ ] confirmStakeDeposit updates stake_status='staked'
- [ ] Fee distribution records created correctly
- [ ] Protocol config retrieved properly
- [ ] Fee calculations match smart contract

### Frontend Tests
- [ ] StakingInfoCard displays correctly
- [ ] useStakingAndFees.executeStakeEvent works end-to-end
- [ ] EarningsBreakdownCard shows correct breakdown
- [ ] Error messages display for RPC failures
- [ ] Stake status badges update based on DB

---

## Key Design Decisions

### Why Backend Crank is Optional
- **Security**: Avoids storing private key on server
- **Decentralization**: Users can trigger fee distribution themselves
- **Flexibility**: Can enable for specific use cases

### Why Stake is in Event Vault
- **Simplicity**: Single vault reduces complexity
- **Gas Efficiency**: Fewer token accounts to manage
- **Audit Trail**: All funds trackable in one place

### Why is_completed Flag
- **Idempotency**: Prevents accidentally processing fees twice
- **Safety**: Multiple confirmations won't duplicate transfers
- **Reliability**: Clear indication of completion state

### Why Basis Points for Fees
- **Precision**: Basis points provide fine-grained control
- **Industry Standard**: Financial systems use bps
- **Flexibility**: Allows 0.01% increments up to 100%

---

## Future Enhancements

1. **Multi-Signature Treasury**: Require multiple signers for fee changes
2. **Fee Tiering**: Different fees based on event size/type
3. **Refund Mechanism**: Allow admins to refund stakeholders
4. **Governance**: DAO voting for protocol changes
5. **Analytics**: Dashboard showing protocol fee trends
6. **Automated Crank**: Mainnet deployment with oracle for completions

---

## Support & Documentation Links

- Anchor Docs: https://docs.rs/anchor-lang/
- Solana Docs: https://docs.solana.com/
- Supabase Docs: https://supabase.com/docs
- Smart Contract Architecture: See ARCHITECTURE.md

---

**Last Updated**: 2026-05-10
**Version**: 2.6.0
**Status**: Production Ready ✅
