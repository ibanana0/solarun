# Quick Reference Card - Staking & Protocol Fees

Print this and keep it handy during integration! 📋

---

## 🔧 Smart Contract Instructions

### initialize_global_state
**When**: Once at deployment  
**Caller**: Admin  
**Parameters**: `treasury_address`, `protocol_fee_bps` (e.g., 500 = 5%)

### initialize_event  
**When**: Event organizer creates event  
**Caller**: Admin  
**Parameters**: `event_id`, `max_participants`, `registration_fee`, `start_time`, `end_time`

### stake_event ⭐ NEW
**When**: After initialize_event, before start_race  
**Caller**: Admin  
**Parameters**: `event_id`, `stake_amount`  
**Action**: Transfers tokens to vault, records in StakeVault

### start_race
**When**: Ready to accept participants  
**Caller**: Admin  
**Action**: Transitions Event.status to Active

### complete_race ⭐ UPDATED
**When**: Event finished, time to distribute fees  
**Caller**: Admin  
**Action**: Calculates fee, sends to treasury, returns net to admin  
**Safety**: Sets `is_completed = true` (prevents double-call)

### slash_and_refund ⭐ NEW
**When**: Event failed/cancelled  
**Caller**: Admin/Backend  
**Action**: Sends stake to treasury, refunds participants

---

## 💾 Database Tables

### race_events (NEW COLUMNS)
- `stake_amount`: USDC admin must deposit
- `stake_status`: pending | staked | returned | slashed
- `protocol_fee_bps`: Fee % from config
- `is_completed`: Whether fee distribution done
- `treasury_fee_collected`: Amount sent to treasury

### stake_vault (NEW)
Tracks each admin's stake per event
- `event_id`, `admin_wallet`, `stake_amount`
- `is_slashed`, `slashed_at`, `returned_at`

### fee_distribution (NEW)
Audit trail of all fee distributions
- `event_id`, `gross_amount`, `protocol_fee_amount`, `admin_net_amount`
- `status`: pending | completed | failed
- `tx_signature`: Blockchain tx hash

### protocol_config (NEW)
Global settings
- `treasury_address`, `protocol_fee_bps`

---

## 📡 Backend API Endpoints

### POST /api/events/create
```json
{
  "event_id": "uuid",
  "name": "Event Name",
  "stake_amount_usdc": 10.5,
  "registration_fee_usdc": 5,
  "max_participants": 100,
  "start_time": "2026-05-11T10:00:00Z",
  "end_time": "2026-05-11T12:00:00Z",
  "admin_wallet": "wallet_address"
}
```

### POST /api/events/:eventId/confirm-stake
```json
{
  "adminWallet": "wallet_address",
  "stakeAmount": 10.5,
  "txSignature": "transaction_hash"
}
```

### POST /api/events/complete
```json
{
  "event_id": "uuid",
  "completion_timestamp": "2026-05-11T12:30:00Z",
  "finishers": [
    { "runner_id": "id", "position": 1, "finish_time": 3600 }
  ]
}
```

---

## 🎨 Frontend Components

### StakingInfoCard
```tsx
<StakingInfoCard
  stakeAmount={10.5}
  registrationFee={5}
  maxParticipants={100}
  protocolFeeBps={500}  // 5%
  estimatedParticipants={50}
/>
```
Shows: Stake requirement, fee breakdown, earnings estimates

### EarningsBreakdownCard
```tsx
<EarningsBreakdownCard
  eventId="uuid"
  eventName="Event Name"
  status="completed"
  registrationFeePerPerson={5}
  stakeAmount={10.5}
  participantCount={50}
  protocolFeeBps={500}
  isCompleted={true}
  stakeStatus="returned"
/>
```
Shows: Revenue, fees, net earnings, claim button

### useStakingAndFees
```tsx
const { executeStakeEvent, estimateEarnings } = useStakingAndFees(program);

const tx = await executeStakeEvent(
  eventId, stakeAmount, adminTokenAccount, vaultAddress, mint
);

const forecast = estimateEarnings(fee, participants, stake, bps);
// Returns: { totalDeposits, stakeAmount, grossAmount, protocolFeeAmount, netToAdmin }
```

---

## 🧮 Fee Math

```
Fee Amount = Gross × (basis_points / 10000)
Net Amount = Gross - Fee Amount
```

**Examples**:
- 260 USDC, 500 bps (5%) = 13 fee, 247 net
- 100 USDC, 250 bps (2.5%) = 2.5 fee, 97.5 net
- 1000 USDC, 1000 bps (10%) = 100 fee, 900 net

---

## ⚠️ Gotchas

| Issue | Fix |
|-------|-----|
| Stake shows "pending" forever | Call `confirmStakeDeposit` API after blockchain tx |
| "StakeAlreadyDeposited" error | Each event needs its own stake (fresh Event account) |
| Fee doesn't match calculation | Use floor() for integer math, not regular division |
| Claim button doesn't show | Check `status === 'completed' && stakeStatus === 'returned'` |
| RPC fails silently | Wrap in try-catch, check tx on Solana Explorer |

---

## 🔍 Debugging Queries

```sql
-- Check recent stakes
SELECT event_id, admin_wallet, stake_amount, is_slashed FROM stake_vault 
ORDER BY created_at DESC LIMIT 5;

-- Find pending fee distributions
SELECT event_id, status, error_message FROM fee_distribution 
WHERE status = 'pending';

-- Check event stake status
SELECT id, name, stake_status, status, is_completed FROM race_events 
WHERE id = 'your_event_id';

-- Calculate total protocol fees
SELECT SUM(protocol_fee_amount) FROM fee_distribution 
WHERE status = 'completed';
```

---

## 🚀 Integration Sequence

```
1. Build smart contract
   └─> cargo build-sbf

2. Deploy contract
   └─> solana program deploy ...

3. Initialize global state
   └─> Call initialize_global_state with treasury address

4. Run database migration
   └─> Run phase_2_6_staking.sql in Supabase

5. Add backend routes
   └─> Import and mount eventCompletionListener, createEvent

6. Update frontend form
   └─> Import StakingInfoCard, useStakingAndFees
   └─> Add stake deposit step after initialize_event

7. Update dashboard
   └─> Import EarningsBreakdownCard
   └─> Fetch event with stake info

8. Test end-to-end
   └─> Create → Stake → Start → Complete → Verify fees distributed

9. Deploy to mainnet
   └─> Update program IDs, treasury address, environment vars
```

---

## 📊 Monitoring Alerts

**Set up alerts for**:
- [ ] New entries in `fee_distribution` with `status = 'failed'`
- [ ] Stake vault with `is_slashed = true`
- [ ] Events with `is_completed = false` after event end_time
- [ ] Sudden spikes in `protocol_fee_amount`
- [ ] RPC errors in backend logs

---

## 🆘 Common Errors

| Error | Meaning | Solution |
|-------|---------|----------|
| E0060 | Insufficient stake | stake_amount must be > 0 |
| E0061 | Already staked | Don't call stake_event twice for same event |
| E0064 | Already completed | Don't call complete_race twice (is_completed=true) |
| E0065 | Vault not funded | Check vault balance before fees |
| "Insufficient funds" (RPC) | Admin wallet empty | Top up SOL or USDC |
| "Account not found" | PDA not created | Call initialize_event first |

---

## 📝 Environment Variables

```env
# Backend
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_key
BACKEND_ACTS_AS_CRANK=false  # Set to true only if running crank service

# Frontend
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com  # or mainnet
NEXT_PUBLIC_PROGRAM_ID=9E1BTHP1EP9UQbbXJKZ8Laj7PxXw1vhxJTeFpEEjfYZn
```

---

## 💡 Pro Tips

✅ Always call `confirmStakeDeposit` after stake_event tx confirms
✅ Use basis points (not percentages) for fee config
✅ Test with small numbers first (5 USDC stake, 1 USDC fees)
✅ Monitor fee_distribution table during launch
✅ Have treasury wallet ready before initialize_global_state
✅ Keep transaction signatures for audit trail
✅ Test on devnet thoroughly before mainnet

---

## 📚 Doc Files

- **STAKING_IMPLEMENTATION.md** - Full technical docs (read this first!)
- **IMPLEMENTATION_CHECKLIST.md** - Integration steps (follow this to build)
- **PROJECT_SUMMARY.md** - Overview & stats
- **This file** - Quick reference (print it!)

---

*Last Updated: 2026-05-10 | Version 2.6.0*
