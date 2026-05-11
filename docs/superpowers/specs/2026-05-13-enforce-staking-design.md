// Design for Enforcing Mandatory Staking in SolaRun
// ===============================================

## Overview
Currently, the SolaRun program allows starting a race without verifying if the admin has deposited a mandatory stake. This proposal enforces a mandatory staking check in the `start_race` instruction.

## Implementation Details

### 1. Smart Contract Modification
In `contracts/programs/solarun_temp/src/instructions/start_race.rs`, modify the `handler` function:
- Add a check to ensure `event.stake_amount > 0`.
- If the check fails, return `ErrorCode::InsufficientStake`.

### 2. Backend Verification
- In `backend/src/api/createEvent.ts`, confirm the `confirmStakeDeposit` function correctly handles the status transition of the event to `staked` (if applicable) and that this is consistent with the contract's expectations.

## Trade-offs
- Enforcing mandatory staking adds an extra step to race setup.
- This protects participants by ensuring collateral is present if the race fails or is cancelled.

## Approval Requested
Does this design for enforcing mandatory staking meet the project requirements?
