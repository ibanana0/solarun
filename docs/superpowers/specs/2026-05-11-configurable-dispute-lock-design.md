# Design Spec: Configurable Dispute Lock Duration

## Goal
Implement a configurable dispute lock duration for SolaRun events to enable fast, demo-friendly testing while maintaining production-grade 7-day security for live events.

## Architectural Changes

### 1. Smart Contract (`contracts/`)
- Update `Event` state: Add `dispute_lock_seconds: i64` to store the duration configured at initialization.
- Update `initialize_event` instruction: Add `dispute_lock_seconds` parameter.
- Update `complete_race` instruction: Use `event.dispute_lock_seconds` instead of the hardcoded 7-day constant.

### 2. Backend (`backend/`)
- Update `api/createEvent.ts`: Accept `dispute_lock_seconds` from frontend and pass to the blockchain transaction.
- Add `DISPUTE_LOCK_DURATION_SECONDS` environment variable as a fallback/default for non-demo environments if needed.

### 3. Frontend (`frontend/`)
- Update `app/creator/create/page.tsx`: Include a "Dispute Lock Duration" field (with a default of 7 days, but overridable in dev/demo environments).
- Ensure UI countdown timer reads `dispute_lock_until` from the blockchain `Event` account to reflect the accurate lock time.

## Trade-offs
- **Pros**: Extreme flexibility for demos and different types of races; per-event configuration is more granular than global.
- **Cons**: Requires migration of existing event initialization flow; requires update to frontend UI.

## Testing Strategy
1. **Unit Test**: Initialize event with 60s lock, complete race, verify `dispute_lock_until` is `current_time + 60`.
2. **Integration Test**: Complete event, poll frontend until 60s expires, verify claim button enables.
3. **Regression Test**: Ensure production events default to 7 days.
