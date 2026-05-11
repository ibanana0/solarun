# Quick Method Reference - SolaRun

## 🚨 TL;DR

**Frontend (TypeScript/React):** Use **camelCase**  
**Backend (Node.js/TypeScript):** Use **snake_case**

---

## Method Naming Cheat Sheet

| IDL Name | Frontend Call | Backend Call |
|----------|--------------|--------------|
| `initialize_event` | ✅ `initializeEvent()` | ✅ `initialize_event()` |
| `register_participant` | ✅ `registerParticipant()` | ✅ `register_participant()` |
| `stake_event` | ✅ `stakeEvent()` | ✅ `stake_event()` |
| `record_finish` | ✅ `recordFinish()` | ✅ `record_finish()` |
| `process_refunds` | ✅ `processRefunds()` | ✅ `process_refunds()` |
| `mint_mock_usdc` | ✅ `mintMockUsdc()` | ✅ `mint_mock_usdc()` |
| `delete_event` | ✅ `deleteEvent()` | ✅ `delete_event()` |
| `close_participant` | ✅ `closeParticipant()` | ✅ `close_participant()` |

---

## Example Usage

### Frontend (app/creator/create/page.tsx)
```typescript
// ✅ CORRECT
const method = (program.methods as any).initializeEvent(
  eventId,
  new anchor.BN(maxParticipants),
  registrationFee,
  startTime,
  endTime,
  disputeLockSeconds,
);

// ❌ WRONG
const method = (program.methods as any).initialize_event(...); // TypeError!
```

### Frontend (hooks/useStakingAndFees.ts)
```typescript
// ✅ CORRECT
const txSignature = await program.methods
  .stakeEvent(eventId, stakeAmountTokens)
  .accounts({ ... })
  .rpc();

// ❌ WRONG
const txSignature = await program.methods
  .stake_event(eventId, stakeAmountTokens) // TypeError!
```

### Backend (transaction-signer.ts)
```typescript
// ✅ CORRECT
const tx = await (program.methods as any)
  .initialize_event(
    cleanEventId,
    new anchor.BN(maxParticipants),
    registrationFee,
    startTime,
    endTime,
    disputeLockSeconds,
  )
  .accounts({ ... })
  .rpc();

// ❌ WRONG (backend harus pakai snake_case)
const tx = await (program.methods as any)
  .initializeEvent(...) // Akan error!
```

---

## Common Errors & Quick Fixes

### ❌ Error: `program.methods.initialize_event is not a function`
**Cause:** Using snake_case di frontend  
**Fix:** Change to `initializeEvent` (camelCase)

### ❌ Error: `program.methods.stake_event is not a function`
**Cause:** Using snake_case di frontend  
**Fix:** Change to `stakeEvent` (camelCase)

### ❌ Error: `program is null`
**Cause:** Privy belum connected  
**Fix:** Ensure user logged in via Privy

### ❌ Error: "admin not provided"
**Cause:** IDL mismatch atau cache issue  
**Fix:** 
```bash
cd frontend
rm -rf .next node_modules/.cache
npm run dev
```

---

## Why This Happens?

Anchor's TypeScript client automatically converts Rust's snake_case instruction names to JavaScript's camelCase convention:

- **Rust/IDL:** `initialize_event` → **TypeScript:** `initializeEvent()`
- **Rust/IDL:** `stake_event` → **TypeScript:** `stakeEvent()`

This is standard Anchor behavior and happens **only in frontend** because:
- Frontend uses browser-based TypeScript/JavaScript
- Backend uses Node.js which follows Anchor's raw naming

---

## Files Updated

✅ `frontend/app/creator/create/page.tsx` - initializeEvent  
✅ `frontend/app/register/page.tsx` - registerParticipant  
✅ `frontend/hooks/useStakingAndFees.ts` - stakeEvent  
✅ `backend/src/blockchain/transaction-signer.ts` - snake_case (unchanged)  

---

**Last Updated:** 2026-05-11  
**Status:** All methods verified and working ✅
