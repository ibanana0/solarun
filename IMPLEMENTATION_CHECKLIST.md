# Staking & Protocol Fee - Implementation Checklist

Quick reference for integrating all components. **Estimated time: 2-3 days for full integration**.

---

## 📋 Smart Contract (Estimated: 3-4 hours)

### ✅ Already Completed
- [x] GlobalState account struct
- [x] StakeVault account struct
- [x] Event account updated with stake fields
- [x] initialize_global_state instruction
- [x] stake_event instruction
- [x] complete_race instruction (with fee distribution)
- [x] slash_and_refund instruction
- [x] All error codes added
- [x] lib.rs updated with new instructions

### 📝 Manual Integration Steps

1. **Rebuild Smart Contract**:
   ```bash
   cd contracts
   cargo build-sbf
   ```
   ⏱️ Takes ~5-10 minutes

2. **Deploy to Devnet** (if needed):
   ```bash
   solana program deploy target/sbf-solana-solana/release/solarun_temp.so --url devnet
   ```
   ⏱️ ~30 seconds

3. **Initialize Global State** (one-time):
   - Call `initialize_global_state`
   - Parameters:
     - `treasury_address`: Your treasury wallet
     - `protocol_fee_bps`: 500 (5%) or desired rate
   - Keep the transaction signature for audit

4. **Run Tests** (optional but recommended):
   ```bash
   cargo test --package solarun_temp
   ```
   ⏱️ ~2 minutes

---

## 🗄️ Database (Estimated: 2-3 hours)

### ✅ Already Completed
- [x] SQL migration file created (phase_2_6_staking.sql)

### 📝 Manual Integration Steps

1. **Run Migration**:
   - Go to Supabase Dashboard → SQL Editor
   - Copy-paste contents of `phase_2_6_staking.sql`
   - Execute
   - ✅ Verify: Check Tables list includes:
     - race_events (new columns: stake_amount, stake_status, etc.)
     - stake_vault (new table)
     - fee_distribution (new table)
     - protocol_config (new table)

2. **Initialize Protocol Config**:
   ```sql
   UPDATE protocol_config 
   SET treasury_address = 'YOUR_TREASURY_WALLET_ADDRESS'
   WHERE id = 1;
   ```

3. **Verify RLS Policies**:
   - Check Service Role can read/write all tables
   - Check Public can read (but not write)

---

## 🔌 Backend (Estimated: 4-6 hours)

### ✅ Already Completed
- [x] staking-service.ts created
- [x] fee-distribution-service.ts created
- [x] createEvent.ts API endpoint created
- [x] eventCompletionListener.ts created

### 📝 Manual Integration Steps

1. **Install Dependencies**:
   ```bash
   cd backend
   npm install
   # Should already have @supabase/supabase-js
   ```

2. **Create Express Routes** (not yet created):
   ```typescript
   // src/api/routes.ts
   import express from 'express';
   import { createEvent, confirmStakeDeposit } from './api/createEvent';
   import { handleEventCompletion } from './api/eventCompletionListener';

   const router = express.Router();

   // Event creation
   router.post('/events/create', async (req, res) => {
       try {
           const result = await createEvent(req.body);
           res.json(result);
       } catch (error) {
           res.status(400).json({ error: error.message });
       }
   });

   // Confirm stake after blockchain tx
   router.post('/events/:eventId/confirm-stake', async (req, res) => {
       try {
           const { adminWallet, stakeAmount, txSignature } = req.body;
           await confirmStakeDeposit(
               req.params.eventId,
               adminWallet,
               stakeAmount,
               txSignature
           );
           res.json({ success: true });
       } catch (error) {
           res.status(400).json({ error: error.message });
       }
   });

   // Event completion webhook (from IoT system)
   router.post('/events/complete', async (req, res) => {
       try {
           const result = await handleEventCompletion(req.body);
           res.json(result);
       } catch (error) {
           res.status(400).json({ error: error.message });
       }
   });

   export default router;
   ```

3. **Update Main Server File** (src/index.ts):
   ```typescript
   import routes from './api/routes';
   app.use('/api', routes);
   ```

4. **Test Backend Endpoints**:
   ```bash
   # Test create event
   curl -X POST http://localhost:3000/api/events/create \
     -H "Content-Type: application/json" \
     -d '{
       "event_id": "test-event-123",
       "name": "Test Race",
       "max_participants": 100,
       "registration_fee_usdc": 5,
       "stake_amount_usdc": 10,
       "start_time": "2026-05-11T10:00:00Z",
       "end_time": "2026-05-11T12:00:00Z",
       "admin_wallet": "YOUR_WALLET_ADDRESS"
     }'
   ```

---

## 🎨 Frontend (Estimated: 5-7 hours)

### ✅ Already Completed
- [x] useStakingAndFees.ts hook created
- [x] StakingInfoCard.tsx component created
- [x] EarningsBreakdownCard.tsx component created

### 📝 Manual Integration Steps

1. **Install Dependencies**:
   ```bash
   cd frontend
   npm install
   # Should already have all packages
   ```

2. **Import Components in Creator/Create Page**:
   ```typescript
   // app/creator/create/page.tsx
   import StakingInfoCard from '@/components/StakingInfoCard';
   import { useStakingAndFees } from '@/hooks/useStakingAndFees';

   // In component:
   const { executeStakeEvent, estimateEarnings } = useStakingAndFees(program);

   // In form JSX:
   <div className="lg:col-span-5">
       <StakingInfoCard
           stakeAmount={parseFloat(stakeAmountUsdc || '0')}
           registrationFee={parseFloat(feeUsdc || '0')}
           maxParticipants={parseInt(maxParticipants)}
           protocolFeeBps={500}  // Get from backend
           estimatedParticipants={50}
       />
   </div>
   ```

3. **Add Stake Deposit Step**:
   After `initialize_event` succeeds, show:
   ```typescript
   if (createdEvent) {
       return (
           <div className="space-y-md">
               <p>Event created! Now deposit stake...</p>
               <button onClick={handleStakeDeposit}>
                   Deposit {stakeAmountUsdc} USDC Stake
               </button>
           </div>
       );
   }

   const handleStakeDeposit = async () => {
       try {
           const tx = await executeStakeEvent(
               eventId,
               parseFloat(stakeAmountUsdc),
               adminTokenAccount,
               vaultAddress,
               mintAddress
           );
           
           // Confirm with backend
           await confirmStakeDeposit(eventId, walletAddress, tx);
           
           setMessage('Stake deposited! You can now start the event.');
       } catch (error) {
           setError(error.message);
       }
   };
   ```

4. **Import Component in Creator Dashboard**:
   ```typescript
   // app/creator/page.tsx
   import EarningsBreakdownCard from '@/components/EarningsBreakdownCard';

   // In event list rendering:
   {events.map((event) => (
       <EarningsBreakdownCard
           eventId={event.id}
           eventName={event.name}
           status={event.status}
           registrationFeePerPerson={event.registration_fee_sol}
           stakeAmount={event.stake_amount}
           participantCount={event.participant_count}
           protocolFeeBps={event.protocol_fee_bps}
           isCompleted={event.is_completed}
           stakeStatus={event.stake_status}
       />
   ))}
   ```

5. **Test Flow**:
   - Create event → should show StakingInfoCard
   - Deposit stake → should call executeStakeEvent
   - Check dashboard → should show EarningsBreakdownCard
   - Verify earnings calculation

---

## 🧪 Testing Sequence (Estimated: 2-3 hours)

### 1. Smart Contract Testing
```bash
cd contracts
npm run test  # If tests exist
# Or run in test environment
```

**Test Cases**:
- [ ] GlobalState initialized with correct fees
- [ ] Stake correctly transferred to vault
- [ ] complete_race distributes fees correctly
- [ ] is_completed prevents double-execution
- [ ] slash_and_refund processes refunds

### 2. Backend Testing
```bash
cd backend
npm test
# Or test endpoints manually with curl
```

**Test Cases**:
- [ ] createEvent saves to DB
- [ ] confirmStakeDeposit updates status
- [ ] calculateFeeDistribution returns correct amounts
- [ ] Protocol config retrieved properly

### 3. Frontend Testing
```bash
cd frontend
npm run dev
```

**Test Cases**:
- [ ] StakingInfoCard displays values correctly
- [ ] useStakingAndFees hook executes without errors
- [ ] EarningsBreakdownCard shows breakdown
- [ ] Create event form integrates StakingInfoCard
- [ ] Dashboard displays EarningsBreakdownCard
- [ ] RPC errors display friendly messages

### 4. End-to-End Testing
1. Create event on frontend
2. Verify saved in Supabase
3. Deposit stake on frontend
4. Verify stake_status changed to 'staked'
5. Start event
6. Complete event
7. Verify fee distribution in fee_distribution table
8. Check EarningsBreakdownCard shows "claimable"

---

## 🚨 Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Stake already deposited" | Calling stake_event twice | Clear browser cache, create new event |
| "InsufficientVaultFunds" | Fee calculation wrong | Check protocolFeeBps calculation |
| "Event not found" | Event ID format mismatch | Ensure UUID format consistency |
| RPC timeout | Network congestion | Retry, increase timeout |
| Stake doesn't appear in DB | confirmStakeDeposit not called | Call API after tx confirms |
| Fee calculation doesn't match | Rounding errors | Use floor() for int calculations |
| Stake status stuck on "pending" | Transaction failed silently | Check blockchain explorer |

---

## 📊 Monitoring & Observability

### Add Logging Points

**Smart Contract**:
```rust
msg!("Stake deposited: event={}, amount={}", event_id, stake_amount);
msg!("Fee distributed: treasury={}, amount={}", treasury, fee_amount);
```

**Backend**:
```typescript
console.log('[recordStakeDeposit]', { eventId, adminWallet, amount });
console.error('[handleEventCompletion] Failed:', error.message);
```

**Frontend**:
```typescript
console.log('[executeStakeEvent] Success:', txSignature);
console.error('[StakingInfoCard] RPC Error:', error);
```

### Database Queries for Monitoring

```sql
-- Recent stake deposits
SELECT * FROM stake_vault ORDER BY created_at DESC LIMIT 10;

-- Pending fee distributions
SELECT * FROM fee_distribution WHERE status = 'pending';

-- Total protocol fees collected
SELECT SUM(protocol_fee_amount) as total_fees FROM fee_distribution WHERE status = 'completed';

-- Events by stake status
SELECT stake_status, COUNT(*) FROM race_events GROUP BY stake_status;
```

---

## 📦 Deployment Checklist

- [ ] Smart contract deployed to mainnet
- [ ] GlobalState initialized with real treasury address
- [ ] Database migrations run on prod
- [ ] Backend routes deployed and tested
- [ ] Frontend updated with all components
- [ ] Environment variables set (SUPABASE_URL, KEYS, etc.)
- [ ] Error handling verified for all RPC failures
- [ ] Logging configured for monitoring
- [ ] Documentation updated
- [ ] Internal testing completed
- [ ] User acceptance testing done
- [ ] Go-live checklist signed off

---

## 📞 Support

For issues, questions, or clarifications:
1. Check STAKING_IMPLEMENTATION.md for detailed docs
2. Review error codes in smart contract
3. Check backend service comments for crank setup
4. Test endpoint with curl before frontend integration
5. Monitor blockchain explorer for transaction details

---

**Last Updated**: 2026-05-10
**Version**: 2.6.0
**Next Phase**: Backend crank automation, governance DAO
