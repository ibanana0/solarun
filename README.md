# SolaRun: IoT-Blockchain Marathon Platform

SolaRun is a Solana-based marathon race management system that integrates IoT RFID sensors with smart contracts for transparent registration, live tracking, and automated prize distribution.

## 🚀 Overview
SolaRun solves the issues of transparency and payment delays in sporting events by moving the entire race lifecycle on-chain. Using RFID sensors at every checkpoint, runner data is validated in real-time, and the final results automatically trigger prize distribution from a smart contract vault.

### Key Features:
- **Winner-Only Prize Pool:** Prizes are automatically distributed to the top 4 finishers (40%, 30%, 20%, 10%).
- **IoT-Blockchain Integration:** RFID checkpoints automatically transmit data to the backend, which records race completion on-chain.
- **Mock USDC & Yield:** Registration uses Mock USDC (SPL Token), which can be claimed directly via the in-app faucet.
- **Frictionless Onboarding:** Privy integration provides social login and embedded wallets for non-crypto users.
- **DeFi Staking:** Admins deposit a collateral (stake) to guarantee the event's integrity.

---

## 🔗 Smart Contract Addresses (Solana Devnet)

| Component | Address |
|-----------|---------|
| **Program ID** | `E8KF9A7PiYbi3UmZTDy4RFnJYsvjmo3oQ7NwTuGzR2C8` |
| **Mock USDC Mint** | `PDA ("mock_usdc_mint")` |
| **Global State** | `PDA ("global_state")` |
| **Vault Address** | `9aQ2pU9vK3xL8mN5bR2cF7gH1jK4qO8pZ9vX2yA3bC4` (Example from .env) |

---

## 🛠 Tech Stack

### Frontend
- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS + shadcn/ui
- **Auth/Wallet:** Privy SDK (Social Login + Embedded Wallet)
- **State Management:** TanStack Query (React Query)
- **Maps:** Leaflet.js (for marathon routes)

### Backend
- **Runtime:** Node.js (TypeScript)
- **Framework:** Express.js
- **Database:** Supabase (PostgreSQL + Realtime)
- **IoT Protocol:** MQTT (via HiveMQ / Mosquitto)
- **Scheduler:** Node-cron (for automated refund/prize processing)

### Smart Contract
- **Language:** Rust
- **Framework:** Anchor
- **Token:** SPL Token (Mock USDC)

### IoT (Hardware)
- **Microcontroller:** ESP32
- **Sensor:** RFID MFRC522
- **Communication:** WiFi + MQTT

---

## 🔄 Application Usage Flow

1. **Social Login:** Users log in using Email/Google via Privy. Privy automatically generates a Solana embedded wallet.
2. **Faucet:** Users claim free Mock USDC from the Profile/Faucet menu to pay for registration fees.
3. **Registration:** Users select an event on the "Explore" page and register by paying the Mock USDC fee.
4. **The Race (IoT):**
   - User taps RFID at the **Start** sensor (Checkpoint 0).
   - User taps at the **Intermediate Checkpoint** (Checkpoint 1).
   - User taps at the **Finish Line** (Checkpoint 2).
5. **Leaderboard:** Race results appear in real-time on the frontend via Supabase Realtime synchronization.
6. **Prize Claim:** Once the event is completed and verified, prizes are automatically sent to the winners' wallets via the `process_refunds` on-chain instruction.

---

## 🎥 Demo Flow (Simulation)

To test the system without physical hardware, we provide a simulation script:

1. **Setup:** Start the backend and frontend. Ensure Supabase is configured.
2. **Create Event:** Use the UI to create a new event with 3 checkpoints (0, 1, 2).
3. **Register Runners:** Register 5-10 runners (you can use the `backend/src/scripts/auto-register.ts` script).
4. **Simulate Race:** Run the simulation script:
   ```bash
   cd backend
   npx tsx src/simulate-full-race.ts
   ```
   or
   ```bash
   cd backend
   npx tsx src/scripts/interactive-mqtt-client.ts
   ```
   This script will publish MQTT messages as if RFID sensors were being tapped.
5. **Verify On-Chain:** Watch the event status change to `Completed` on the dashboard, and check the prize distribution transactions on Solscan (Devnet).

---

## 🧠 Business Logic

### 1. Checkpoint Validation
Runners must pass through checkpoints in sequential order:
- **0 (Start) ➔ 1 (Checkpoint) ➔ 2 (Finish)**
- Tapping at the wrong checkpoint or skipping the sequence will lead to automatic disqualification by the backend system.
- *Anti-Cheat:* A minimum 30-second delay is enforced between taps at the same sensor.

### 2. Prize Pool Distribution
Total registration funds in the vault (after protocol fees) are distributed to finishers with the following ratio:
- **1st Place:** 40%
- **2nd Place:** 30%
- **3rd Place:** 20%
- **4th Place:** 10%
If there are fewer than 4 finishers, the remaining prizes stay in the vault or are returned to the treasury as per event policy.

### 3. Staking & Security
- **Admin Stake:** Creators are required to deposit Mock USDC as collateral. If an event is cancelled unilaterally after registration opens, this stake is used to compensate participants.
- **Dispute Period:** Funds are held for a specific period after the race ends before they can be fully claimed to allow for manual verification in case of cheating reports.

---

© 2026 SolaRun Team. Built for Solana IoT Hackathon.
