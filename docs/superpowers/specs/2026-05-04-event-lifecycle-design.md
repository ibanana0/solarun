# System Design: Event Lifecycle (Start & End Race Logic)

**Date:** 2026-05-04
**Status:** Approved

## 1. Overview
This document defines the new operational lifecycle for a SolaRun marathon event. It addresses the removal of a hard-coded `end_time` during event creation, replacing it with a manual start trigger and a hybrid completion process to ensure administrative control and sensor accuracy.

## 2. Phase 1: Event Creation & Registration
*   **Database Changes:** 
    *   The `start_time` field remains, but is strictly used as **UI informational text** (e.g., "Gather at 07:00 AM").
    *   The `end_time` field is **removed** from the creation form.
    *   A new field `duration_hours` (e.g., 2 hours) is introduced.
*   **Status:** The event is created with the status `pending` (mapped to `Initialized` on the smart contract). Runners can register.

## 3. Phase 2: Start Race (Manual Murni)
*   **Trigger:** The race does NOT start automatically based on the clock. It strictly requires the Admin/Creator to click a **"Start Race"** button on the frontend dashboard.
*   **Action:** 
    *   Frontend triggers the `start_race` instruction on the Solana smart contract, signing the transaction.
    *   Once confirmed, the backend/webhook updates the database status to `active`.
    *   **Dynamic Expiration Calculation:** Upon successful start, the backend calculates the strict sensor cutoff time: `Sensor Cut-off = Actual Time of Button Press + duration_hours`.
*   **Sensor Behavior:** The IoT Checkpoint Validator will **reject** any RFID taps if the event status is not `active`.

## 4. Phase 3: During the Race (Cut-off Sensor)
*   As long as the event is `active` and the current time is before the `Sensor Cut-off`, RFID taps at checkpoints (0, 1, 2) are processed normally.
*   **Cut-off Trigger:** Once the current time exceeds the `Sensor Cut-off` time, the Checkpoint Validator will automatically reject any further RFID taps (e.g., throwing a "Race duration has ended" error). However, the event status remains `active`.

## 5. Phase 4: End Race & Prize Distribution (Hybrid)
*   **Trigger:** The backend *Refund Scheduler* **NO LONGER** relies on `end_time` to automatically process refunds.
*   **Administrative Verification:** The event remains in `active` state (even if sensors are cut off) to allow judges to review the leaderboard, disqualify cheaters, or handle disputes.
*   **Action (Manual Finalization):** The Admin must explicitly click a **"Finalize & Distribute Prizes"** button on the dashboard.
*   **Execution:**
    *   Clicking the button updates the event status to `completed` in the database.
    *   The *Refund Scheduler* detects the `completed` status and begins the batching process (calling `process_refunds` on the smart contract).
    *   Once all batches (including non-finishers) are processed, the status changes to `settled`.

## 6. Summary of Status Transitions
1.  `pending` (Registration Open) -> Admin clicks "Start Race" -> `active`
2.  `active` (Race Ongoing) -> Time > Cut-off -> Sensors stop accepting taps, but status remains `active`.
3.  `active` (Under Review) -> Admin clicks "Finalize" -> `completed`
4.  `completed` (Processing Prizes) -> Scheduler finishes batches -> `settled`