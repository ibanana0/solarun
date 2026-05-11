# Dispute Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `dispute_lock_seconds` parameter to the `createEvent` API to allow customizable dispute resolution periods, with a default of 7 days (or 60 seconds in DEMO_MODE).

**Architecture:** Update `CreateEventRequest` interface and `createEvent` function logic to determine and save the new column value to the `race_events` database table.

**Tech Stack:** Node.js, TypeScript, Supabase.

---

### Task 1: Update CreateEventRequest interface

**Files:**
- Modify: `backend/src/api/createEvent.ts`

- [ ] **Step 1: Add field to interface**

```typescript
export interface CreateEventRequest {
    event_id: string;
    name: string;
    description?: string;
    max_participants: number;
    registration_fee_usdc: number;
    stake_amount_usdc: number;
    start_time: string;
    end_time: string;
    admin_wallet: string;
    vault_address?: string;
    dispute_lock_seconds?: number; // Add this field
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/api/createEvent.ts
git commit -m "feat: add dispute_lock_seconds to CreateEventRequest"
```

### Task 2: Implement dispute_lock_seconds logic

**Files:**
- Modify: `backend/src/api/createEvent.ts`

- [ ] **Step 1: Update createEvent function logic**

```typescript
export async function createEvent(
    request: CreateEventRequest
): Promise<CreateEventResponse> {
    try {
        // ... protocolConfig setup ...

        // NEW LOGIC: Determine dispute_lock_seconds
        let disputeLockSeconds = request.dispute_lock_seconds;
        if (process.env.DEMO_MODE === 'true') {
            disputeLockSeconds = 60;
        } else if (disputeLockSeconds === undefined) {
            disputeLockSeconds = 7 * 24 * 60 * 60; // 7 days default
        }

        // ... existing conversion logic ...

        // Create event record in database
        const { data: event, error } = await supabase
            .from('race_events')
            .insert({
                // ... other fields ...
                stake_amount: request.stake_amount_usdc,
                dispute_lock_seconds: disputeLockSeconds, // Insert new value
                stake_status: 'pending',
                // ...
            })
            // ...
```

- [ ] **Step 2: Verify changes by checking for build errors**

Run: `cd backend && npm run build` (or similar project build command if applicable)

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/createEvent.ts
git commit -m "feat: implement dispute_lock_seconds logic in createEvent"
```

---

Plan complete. I am ready to begin execution using `executing-plans` (or `subagent-driven-development` if you prefer).

Which approach do you prefer?
