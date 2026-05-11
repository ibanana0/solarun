# SolaRun System Integrity & Prize Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a production-ready prize distribution system with on-chain state guards, BigInt math, and idempotent batch processing.

**Architecture:** 
- **Anchor (On-Chain):** deterministic state machine (`Initialized` -> `Active` -> `Completed` -> `Settled`) and participant limits.
- **Node.js (Backend):** Prize calculator using `anchor.BN`, transaction batcher with Compute Budget optimization, and a reconciliation worker for idempotency.
- **Next.js (Frontend):** Real-time status guards and optimistic UI with failure cleanup.

**Tech Stack:** Anchor (Rust), Solana Web3.js, @coral-xyz/anchor (BN), Supabase, Next.js.

---

### Task 1: Smart Contract State & Error Updates

**Files:**
- Modify: `contracts/programs/solarun_temp/src/state.rs`
- Modify: `contracts/programs/solarun_temp/src/error.rs`

- [ ] **Step 1: Update `Event` struct in `state.rs`**
Add `max_participants` and ensure correct alignment.
```rust
// contracts/programs/solarun_temp/src/state.rs

#[account]
pub struct Event {
    pub event_id: String,           // UUID, max 36 chars
    pub vault: Pubkey,              // PDA vault token account address
    pub admin: Pubkey,              // Event creator
    pub mint: Pubkey,               // Mock USDC mint address
    pub status: EventStatus,        // Initialized, Active, Completed, Settled
    pub participant_count: u32,     // Total registered
    pub max_participants: u32,      // NEW: Maximum participants allowed
    pub total_deposits: u64,        // Total USDC in vault (token units)
    pub registration_fee: u64,      // Fee per participant (token units)
    pub start_time: i64,            // Unix timestamp
    pub end_time: i64,              // Unix timestamp
    pub bump: u8,                   // PDA bump seed
    pub vault_bump: u8,             // PDA vault bump seed
}
```

- [ ] **Step 2: Add specific error codes in `error.rs`**
```rust
// contracts/programs/solarun_temp/src/error.rs

#[error_code]
pub enum ErrorCode {
    // ... existing ...
    #[msg("Event must be in Initialized status to register")]
    EventNotInitialized,
    #[msg("Event must be in Active status to record finish")]
    EventNotActiveForFinish,
    #[msg("Event must be in Completed status to process refunds")]
    EventNotCompletedForRefund,
    #[msg("Maximum participants reached")]
    MaxParticipantsReached,
}
```

- [ ] **Step 3: Commit updates**
```bash
git add contracts/programs/solarun_temp/src/state.rs contracts/programs/solarun_temp/src/error.rs
git commit -m "contract: add max_participants to state and new error codes"
```

---

### Task 2: Implement State Transitions & Guards

**Files:**
- Modify: `contracts/programs/solarun_temp/src/instructions/initialize.rs`
- Modify: `contracts/programs/solarun_temp/src/instructions/register_participant.rs`
- Create: `contracts/programs/solarun_temp/src/instructions/start_race.rs`
- Create: `contracts/programs/solarun_temp/src/instructions/complete_race.rs`
- Modify: `contracts/programs/solarun_temp/src/lib.rs`

- [ ] **Step 1: Update `initialize_event` handler**
Update to accept `max_participants` (replacing the unused `_vault_capacity`).
```rust
// contracts/programs/solarun_temp/src/instructions/initialize.rs

pub fn handler(
    ctx: Context<InitializeEvent>,
    event_id: String,
    max_participants: u32, 
    registration_fee: u64,
    start_time: i64,
    end_time: i64,
) -> Result<()> {
    // ... validation ...
    let event = &mut ctx.accounts.event;
    // ... basic fields ...
    event.max_participants = max_participants;
    event.participant_count = 0;
    event.status = EventStatus::Initialized;
    // ... rest of fields ...
    Ok(())
}
```

- [ ] **Step 2: Update `register_participant` guard**
Enforce `Initialized` status and `max_participants` limit.
```rust
// contracts/programs/solarun_temp/src/instructions/register_participant.rs

pub fn handler(...) -> Result<()> {
    let event = &mut ctx.accounts.event;
    
    require!(event.status == EventStatus::Initialized, ErrorCode::EventNotInitialized);
    require!(event.participant_count < event.max_participants, ErrorCode::MaxParticipantsReached);
    
    // ... increment count and transfer logic ...
    event.participant_count += 1;
    Ok(())
}
```

- [ ] **Step 3: Create `start_race` instruction**
Changes status from `Initialized` to `Active`.
```rust
// contracts/programs/solarun_temp/src/instructions/start_race.rs
use anchor_lang::prelude::*;
use crate::{Event, EventStatus};
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct StartRace<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump,
        constraint = event.admin == admin.key() @ ErrorCode::UnauthorizedAdmin,
    )]
    pub event: Account<'info, Event>,
}

pub fn handler(ctx: Context<StartRace>, _event_id: String) -> Result<()> {
    let event = &mut ctx.accounts.event;
    require!(event.status == EventStatus::Initialized, ErrorCode::EventAlreadyStarted);
    event.status = EventStatus::Active;
    Ok(())
}
```

- [ ] **Step 4: Create `complete_race` instruction**
Changes status from `Active` to `Completed`.
```rust
// contracts/programs/solarun_temp/src/instructions/complete_race.rs
use anchor_lang::prelude::*;
use crate::{Event, EventStatus};
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct CompleteRace<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump,
        constraint = event.admin == admin.key() @ ErrorCode::UnauthorizedAdmin,
    )]
    pub event: Account<'info, Event>,
}

pub fn handler(ctx: Context<CompleteRace>, _event_id: String) -> Result<()> {
    let event = &mut ctx.accounts.event;
    require!(event.status == EventStatus::Active, ErrorCode::FinishEventNotActive);
    event.status = EventStatus::Completed;
    Ok(())
}
```

- [ ] **Step 5: Register new instructions in `lib.rs`**
```rust
// contracts/programs/solarun_temp/src/lib.rs
pub mod instructions;
use instructions::*;

#[program]
pub mod solarun_temp {
    // ... existing ...
    pub fn start_race(ctx: Context<StartRace>, event_id: String) -> Result<()> {
        instructions::start_race::handler(ctx, event_id)
    }
    pub fn complete_race(ctx: Context<CompleteRace>, event_id: String) -> Result<()> {
        instructions::complete_race::handler(ctx, event_id)
    }
}
```

---

### Task 3: Backend Prize Calculator & Batcher

**Files:**
- Create: `backend/src/lib/prize-calculator.ts`
- Modify: `backend/src/blockchain/transaction-signer.ts`
- Modify: `backend/src/scheduler/refund-scheduler.ts`

- [ ] **Step 1: Implement `PrizeCalculator` using `BN`**
```typescript
// backend/src/lib/prize-calculator.ts
import { BN } from "@coral-xyz/anchor";

export interface PrizeShare {
    wallet: string;
    amount: BN;
}

export function calculatePrizePool(totalVault: BN, winners: string[]): PrizeShare[] {
    const ratios = [50n, 30n, 15n, 5n]; // 50%, 30%, 15%, 5%
    return winners.slice(0, 4).map((wallet, index) => ({
        wallet,
        amount: totalVault.mul(new BN(ratios[index])).div(new BN(100))
    }));
}
```

- [ ] **Step 2: Add `ComputeBudget` and `is_final_batch` to `transaction-signer.ts`**
```typescript
// backend/src/blockchain/transaction-signer.ts
import { ComputeBudgetProgram } from "@solana/web3.js";

// ... inside buildProcessRefundsInstruction ...
const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
// Add to transaction alongside processRefunds instruction
```

- [ ] **Step 3: Implement Idempotency Reconciliation in `refund-scheduler.ts`**
```typescript
// backend/src/scheduler/refund-scheduler.ts

async function isRunnerPaid(runnerId: string, eventId: string): Promise<boolean> {
    const { data } = await supabase
        .from('runners')
        .select('tx_signature')
        .eq('id', runnerId)
        .single();
    
    if (data?.tx_signature) {
        // Use connection from client
        const status = await connection.getSignatureStatus(data.tx_signature);
        return status.value?.confirmationStatus === 'finalized';
    }
    return false;
}
```

---

### Task 4: Frontend Guards & Optimistic UI Cleanup

**Files:**
- Modify: `frontend/app/register/page.tsx`
- Create: `backend/src/workers/optimistic-cleanup.ts`

- [ ] **Step 1: Disable registration based on status**
```typescript
// frontend/app/register/page.tsx
const canRegister = event?.status === 'Initialized' && (runners?.length ?? 0) < event.max_participants;

<Button disabled={!canRegister || submitting}>
    {event?.status !== 'Initialized' ? 'Registration Closed' : 'Daftar Sekarang'}
</Button>
```

- [ ] **Step 2: Implement Optimistic Cleanup Worker**
```typescript
// backend/src/workers/optimistic-cleanup.ts
import { supabase } from '../lib/supabase';

export async function cleanupStuckTransactions() {
    const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();
    
    await supabase
        .from('runners')
        .update({ status: 'running' }) // Rollback from "Finishing..."
        .eq('status', 'Finishing...')
        .lt('processing_started_at', sixtySecondsAgo);
}
```

---

### Task 5: End-to-End Verification

- [ ] **Step 1: Run Anchor tests**
Verify state guards.
```bash
anchor test
```

- [ ] **Step 2: Verify Backend Batching**
Run a simulated 20-runner refund batch.
```bash
npx tsx src/test-refund-scheduler.ts --batch-size 10
```
