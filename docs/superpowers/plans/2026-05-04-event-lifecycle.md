# Event Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a hybrid manual/cut-off event lifecycle, removing `end_time` constraint during creation, allowing manual race start, and a hybrid race end mechanism.

**Architecture:** We are updating the frontend forms and backend scheduler. `start_time` becomes UI-only. `end_time` is replaced by `duration_hours` for calculating a sensor cutoff. Race start is a manual button invoking the `start_race` contract instruction. Race end involves a cutoff for sensors, followed by a manual button click to change the status to `completed`, which triggers the refund scheduler.

**Tech Stack:** Next.js (Frontend), Node.js/Express (Backend), Supabase, Anchor/Solana

---

### Task 1: Update Database Schema & Types

**Files:**
- Modify: `docs/superpowers/specs/2026-05-04-event-lifecycle-design.md` (Update schema documentation)
- Modify: `backend/src/lib/supabase.ts` (or wherever types are defined)

- [ ] **Step 1: Update Supabase schema (Conceptual/SQL)**
    We need to represent the schema changes. Since we don't have a direct SQL execution tool here, document the required SQL change.
    ```sql
    -- SQL to run in Supabase SQL Editor
    ALTER TABLE race_events DROP COLUMN end_time;
    ALTER TABLE race_events ADD COLUMN duration_hours NUMERIC DEFAULT 2;
    ```

- [ ] **Step 2: Update TypeScript types**
    Find the `Database` or `Event` type definition and replace `end_time` with `duration_hours`.
    *(Note: Assuming standard Supabase type generation, this step might involve running a type generator if one exists, or manually updating the type file if it's hand-written).*

- [ ] **Step 3: Commit**
    ```bash
    git add .
    git commit -m "chore: update event schema to replace end_time with duration_hours"
    ```

### Task 2: Frontend - Update Create Event Form

**Files:**
- Modify: `frontend/app/creator/create/page.tsx`

- [ ] **Step 1: Remove end_time calculation**
    Remove the `endDateTime` calculation and related inputs if any existed previously (we already changed this to duration in the previous step, but ensure the payload sent to Supabase is updated).

- [ ] **Step 2: Update payload sent to Supabase**
    Change the insert statement.
    ```typescript
    // Replace: end_time: endDateTime.toISOString(),
    // With: duration_hours: duration,
    ```

- [ ] **Step 3: Update `initializeEvent` instruction call**
    The smart contract currently expects `end_time`. We need to pass a dummy value or update the contract later. For now, pass `0` or calculate the `endDateTime` just for the contract call (since the contract needs it currently, though it won't be used for backend scheduling). Let's calculate it just for the contract to avoid breaking the IDL right now, or update the contract. Assuming we keep the contract signature for now and just pass a derived end time based on `duration_hours`.
    ```typescript
    const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 60 * 1000);
    // ... in program.methods.initializeEvent ...
    new anchor.BN(Math.floor(endDateTime.getTime() / 1000))
    ```

- [ ] **Step 4: Commit**
    ```bash
    git add frontend/app/creator/create/page.tsx
    git commit -m "feat: update create event form to use duration_hours"
    ```

### Task 3: Frontend - Implement "Start Race" Button

**Files:**
- Modify: `frontend/app/event/[id]/page.tsx` (or the creator dashboard)

- [ ] **Step 1: Add "Start Race" button UI**
    Add a button visible only to the creator when the status is `pending`.

- [ ] **Step 2: Implement `start_race` logic**
    ```typescript
    const handleStartRace = async () => {
        // Call program.methods.startRace(eventId)
        // ... signing logic ...
        // Upon success, update Supabase event status to 'active'
        // await supabase.from('race_events').update({ status: 'active' }).eq('id', eventId);
    };
    ```

- [ ] **Step 3: Commit**
    ```bash
    git add frontend/app/event/[id]/page.tsx
    git commit -m "feat: implement manual start race button"
    ```

### Task 4: Backend - Update Checkpoint Validator (Cut-off Logic)

**Files:**
- Modify: `backend/src/validator/checkpoint-validator.ts`

- [ ] **Step 1: Fetch event details during validation**
    When a checkpoint is received, fetch the event's `status`, `start_time` (or the time it became `active`), and `duration_hours`.

- [ ] **Step 2: Implement cut-off logic**
    ```typescript
    // If event is 'active', check if current time > start_time + duration_hours
    // We need to know when it actually started. 
    // Wait, the design says: "Sensor Cut-off = Actual Time of Button Press + duration_hours".
    // This requires storing the 'actual_start_time' in Supabase when "Start Race" is clicked.
    ```
    *Correction based on design:* We need an `actual_start_time` field. Let's add it.

    ```typescript
    // In validator:
    // const cutoffTime = new Date(event.actual_start_time).getTime() + (event.duration_hours * 60 * 60 * 1000);
    // if (Date.now() > cutoffTime) { return { valid: false, error: "Race duration has ended" }; }
    ```

- [ ] **Step 3: Commit**
    ```bash
    git add backend/src/validator/checkpoint-validator.ts
    git commit -m "feat: implement sensor cutoff logic based on actual start time and duration"
    ```

### Task 5: Frontend - Implement "Finalize & Distribute Prizes" Button

**Files:**
- Modify: `frontend/app/event/[id]/page.tsx` (or creator dashboard)

- [ ] **Step 1: Add "Finalize" button UI**
    Visible only to the creator when status is `active`.

- [ ] **Step 2: Implement finalize logic**
    ```typescript
    const handleFinalize = async () => {
        // Update Supabase event status to 'completed'
        // await supabase.from('race_events').update({ status: 'completed' }).eq('id', eventId);
        // This will trigger the backend refund scheduler on its next cron tick
    };
    ```

- [ ] **Step 3: Commit**
    ```bash
    git add frontend/app/event/[id]/page.tsx
    git commit -m "feat: implement manual finalize event button"
    ```

### Task 6: Backend - Update Refund Scheduler

**Files:**
- Modify: `backend/src/scheduler/refund-scheduler.ts`

- [ ] **Step 1: Change query criteria**
    Remove the `end_time` check. The scheduler should now look for events with `status = 'completed'`.
    ```typescript
    // Replace:
    // .eq('status', 'active')
    // .lte('end_time', now.toISOString());
    
    // With:
    // .eq('status', 'completed')
    ```

- [ ] **Step 2: Commit**
    ```bash
    git add backend/src/scheduler/refund-scheduler.ts
    git commit -m "feat: update refund scheduler to trigger on completed status"
    ```