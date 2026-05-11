# SolaRun System Integrity & Prize Distribution Design

**Date:** 2026-05-04  
**Status:** Draft / Approved  
**Topic:** Hardening Smart Contract State & Implementing Robust Prize Distribution

---

## 1. Objective

The goal is to transition SolaRun from a simulated refund state to a robust, scalable, and secure production-ready system. This includes hardening the on-chain state machine to prevent late registrations, implementing precise prize calculations for Mock USDC (6 decimals), and ensuring idempotent batch refund execution.

---

## 2. Architecture & Components

### 2.1 On-Chain State Machine (Anchor)
The `Event` account will be updated to include a deterministic state engine and participant limits.

- **Status Enum:** `Initialized`, `Active`, `Completed`, `Settled`.
- **State Guards:**
    - `register_participant`: Allowed only when status is `Initialized`.
    - `record_finish`: Allowed only when status is `Active`.
    - `process_refunds`: Allowed only when status is `Completed`.
- **Account Updates:**
    - Add `max_participants: u32` to `Event` struct.
    - Add `participant_count: u32` to `Event` struct.

### 2.2 Backend Prize Calculator (Node.js)
- **Math:** Use `anchor.BN` (bn.js) for all calculations to maintain consistency with the Anchor client and prevent floating-point errors.
- **USDC Decimals:** Explicitly handle 6 decimals (1 USDC = 1,000,000 units).
- **Ratios:** 50% (1st), 30% (2nd), 15% (3rd), 5% (4th).

### 2.3 Idempotent Batch Refund (Hybrid Model)
- **Pattern:** Push Model with Batching (10-15 participants per transaction).
- **Compute Budget:** Request 1.4M Compute Units (CU) via `ComputeBudgetProgram` to avoid CU limit exhaustion during batch CPI transfers.
- **Idempotency Strategy (Opsi B+):**
    - **Primary:** Map `runner_id` -> `signature` in Supabase.
    - **Secondary:** Use a reconciliation worker to verify signature status via `getSignatureStatuses` or `getSignaturesForAddress`.
    - **Check-Before-Execution:** Verify if a runner has already been paid in the database or via on-chain history before including them in a new batch.

---

## 3. Data Flow

### 3.1 IoT-to-Web3 Bridge (Optimistic UI)
1. **IoT Trigger:** RFID reader publishes to MQTT.
2. **Backend Listener:** Receives message, validates checkpoint.
3. **Optimistic Update:**
    - Update Supabase status to "Finishing...".
    - Set `processing_started_at` timestamp.
4. **On-Chain Sync:** Backend sends `record_finish` to Solana devnet.
5. **Finalization:** Once confirmed, update Supabase status to "Finished".
6. **Cleanup:** Cron job reverts "Finishing..." status to "Failed/Pending" if it exceeds 60 seconds.

### 3.2 Prize Distribution Flow
1. **Admin Trigger:** Admin calls `end_race` instruction (Status: `Active` -> `Completed`).
2. **Batch Generation:** Backend calculates prizes for all runners using `BN`.
3. **Transaction Batching:** Group runners into batches of 10-15.
4. **Final Batch (Vault Draining):** 
    - The final `process_refunds` call sets `is_final_batch = true`.
    - Smart Contract transfers all remaining vault balance to the 1st place finisher (handling rounding dust).
    - Smart Contract closes the vault and event accounts (reclaiming SOL rent).

---

## 4. Error Handling & Security

| Risk | Mitigation |
| :--- | :--- |
| **Late Registration** | On-chain guard: `require!(event.status == EventStatus::Initialized)`. |
| **Double Spending** | Signature mapping in DB + RPC verification before retrying a batch. |
| **Compute Unit Exhaustion** | Explicitly request 1.4M CU and limit batch size to 15 recipients. |
| **Floating Point Errors** | Use `anchor.BN` for all currency math. |
| **Stuck UI Status** | `processing_started_at` polling and cleanup worker. |

---

## 5. Testing Strategy

1. **Unit Tests (Anchor):** 
    - Test state transitions (`Initialized` -> `Active` -> `Completed`).
    - Verify `register_participant` fails if status is `Active`.
    - Verify `process_refunds` fails if status is `Active`.
2. **Integration Tests (Backend):**
    - Mock a 100-runner event and test batching logic (10 batches of 10).
    - Test "Vault Draining" logic with simulated rounding dust.
    - Test reconciliation worker by simulating a failed DB update after a successful TX.
