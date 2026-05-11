# Configurable Dispute Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a configurable `dispute_lock_seconds` in the SolaRun smart contract to allow demo-friendly lock durations while maintaining production security.

**Architecture:**
1. Update `Event` state to include `dispute_lock_seconds`.
2. Update `initialize_event` instruction to accept this value.
3. Update `complete_race` to use `event.dispute_lock_seconds` for calculating `dispute_lock_until`.

**Tech Stack:** Anchor (Rust), TypeScript, Node.js

---

### Task 1: Update State Account

**Files:**
- Modify: `contracts/programs/solarun_temp/src/state.rs`

- [ ] **Step 1: Add `dispute_lock_seconds` to Event struct**

```rust
#[account]
pub struct Event {
    // ... existing fields ...
    pub dispute_lock_until: i64,
    pub dispute_lock_seconds: i64, // ADDED
    pub bump: u8,
    // ...
}
```

### Task 2: Update Initialization Logic

**Files:**
- Modify: `contracts/programs/solarun_temp/src/instructions/initialize.rs`

- [ ] **Step 1: Update handler signature and logic**

```rust
pub fn handler(
    ctx: Context<InitializeEvent>,
    event_id: String,
    max_participants: u32,
    registration_fee: u64,
    start_time: i64,
    end_time: i64,
    dispute_lock_seconds: i64, // ADDED
) -> Result<()> {
    // ... validation ...
    let event = &mut ctx.accounts.event;
    // ...
    event.dispute_lock_until = 0;
    event.dispute_lock_seconds = dispute_lock_seconds; // ADDED
    // ...
}
```

### Task 3: Update Race Completion

**Files:**
- Modify: `contracts/programs/solarun_temp/src/instructions/complete_race.rs`

- [ ] **Step 1: Replace hardcoded 7 days with config**

```rust
// ... inside handler ...
let event = &mut ctx.accounts.event;
    
let current_time = Clock::get()?.unix_timestamp;
event.dispute_lock_until = current_time + event.dispute_lock_seconds; // DYNAMIC LOCK
// ...
```

### Task 4: Testing & Verification

**Files:**
- Modify/Create: `contracts/programs/solarun_temp/tests/test_lock_duration.rs`

- [ ] **Step 1: Write test to verify configurable lock**
Verify that initializing with 60s sets `dispute_lock_until` to `now + 60`.

- [ ] **Step 2: Run test**
Run: `anchor test --test test_lock_duration`
Expected: PASS
