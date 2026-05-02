# SolaRun — Blockchain Marathon Platform (V1)

**SolaRun** is a Solana-based marathon race management system that combines IoT RFID sensors with blockchain smart contracts to enable transparent event registration, live leaderboard tracking, and automated prize distribution.

---

## Architecture Overview

```
IoT RFID Sensor (ESP32)
       │ (MQTT over TCP/IP)
       ▼
MQTT Broker (HiveMQ / Mosquitto)
       │
       ▼
Backend (Express + TypeScript)
  ├── MQTT Listener       → validates checkpoint data
  ├── Checkpoint Validator → updates runner status in Supabase
  └── Refund Scheduler    → triggers smart contract on event completion
       │
       ▼
Supabase (PostgreSQL + Realtime)
       │
       ▼
Frontend (Next.js 16 + shadcn/ui)
  ├── Landing Page        → event listing
  ├── Registration Page   → runner sign-up + RFID chip assignment
  └── Event Detail Page   → live leaderboard (Supabase Realtime)
       │
       ▼
Solana Smart Contract (Anchor)
  └── process_refunds()   → distributes prize pool to top 4 finishers
```

---

## Prerequisites

- Node.js 18+
- npm
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) (for smart contract)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (devnet)
- Supabase account (free tier works)
- MQTT broker: [HiveMQ Cloud](https://www.hivemq.com/) (free) or local Mosquitto

---

## Project Structure

```
solarun/
├── contracts/          # Anchor smart contract (Rust)
│   └── programs/solarun/src/lib.rs
├── backend/            # Node.js backend (TypeScript)
│   ├── src/
│   │   ├── index.ts            # Express server entry point
│   │   ├── mqtt/listener.ts    # MQTT checkpoint listener
│   │   ├── validator/          # Checkpoint validation logic
│   │   ├── scheduler/          # Refund scheduler (cron)
│   │   ├── blockchain/         # Solana transaction builder
│   │   └── __tests__/          # Jest unit tests
│   └── .env.example
└── frontend/           # Next.js frontend (TypeScript)
    ├── app/
    │   ├── page.tsx            # Landing page
    │   ├── register/page.tsx   # Registration form
    │   └── event/[id]/page.tsx # Event detail + leaderboard
    ├── components/             # shadcn/ui components
    ├── hooks/                  # TanStack Query hooks
    └── lib/supabase.ts         # Supabase client
```

---

## Setup: Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the following schema:

```sql
-- Events
CREATE TABLE race_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  registration_fee_sol NUMERIC DEFAULT 0.1,
  vault_address TEXT,
  max_participants INTEGER DEFAULT 100,
  status TEXT DEFAULT 'pending', -- pending | active | completed | settled
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Runners
CREATE TABLE runners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  chip_uid TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  event_id UUID REFERENCES race_events(id),
  status TEXT DEFAULT 'registered', -- registered | running | finished | disqualified
  finish_position INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Race logs (checkpoint history)
CREATE TABLE race_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id UUID REFERENCES runners(id),
  checkpoint_id INTEGER NOT NULL, -- 0=start, 1=intermediate, 2=finish
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Realtime for runners table (for live leaderboard)
ALTER PUBLICATION supabase_realtime ADD TABLE runners;
```

3. Get your Supabase **Project URL** and **service_role key** from **Settings → API**.

---

## Setup: Smart Contract (Anchor)

```bash
cd contracts

# Install dependencies
yarn install

# Build the contract
anchor build

# Run contract tests (local validator)
anchor test
```

> **Note (V1):** The contract in V1 is a skeleton with simulated transaction signing. Real USDC distribution is planned for V2 (Phase 2.2).

---

## Setup: Backend

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

Edit `.env`:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# MQTT Broker
MQTT_BROKER_URL=mqtt://localhost:1883
# Or for HiveMQ Cloud:
# MQTT_BROKER_URL=mqtts://your-cluster.hivemq.cloud:8883
# MQTT_USERNAME=your_username
# MQTT_PASSWORD=your_password

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
ADMIN_KEYPAIR_PATH=/path/to/admin-keypair.json
SOLARUN_PROGRAM_ID=your_program_id

# Scheduler
REFUND_SCHEDULER_INTERVAL=*/1 * * * *
```

### Run Tests

```bash
npm test
# Expected: 43 passed, 43 total ✅
```

### Start Backend

```bash
npx tsx src/index.ts
```

Backend will start on `http://localhost:3001` with:
- `GET /health` — health check
- `GET /admin/blockchain-status` — blockchain connection info
- `POST /admin/trigger-refunds` — manually trigger refund processing

---

## Setup: Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy environment file
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### Start Frontend

```bash
npm run dev
# Opens at http://localhost:3000
```

### Build for Production

```bash
npm run build
```

---

## Simulating MQTT Checkpoints (No Hardware)

Use the built-in test script to simulate the full race flow:

```bash
cd backend
npx tsx src/test-validator.ts
```

This simulates:
1. Chip start tap (checkpoint 0) for 3 runners
2. Intermediate checkpoint tap (checkpoint 1)
3. Finish checkpoint tap (checkpoint 2) → assigns positions #1, #2, #3
4. Edge cases: duplicate tap, out-of-order tap, unknown chip, already-finished

The script resets runners and race_logs before running to ensure a clean state.

---

## Simulating Refund Processing

```bash
# 1. Start backend
cd backend && npx tsx src/index.ts

# 2. Set event end_time to the past (in another terminal)
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('race_events').update({ status: 'active', end_time: new Date(Date.now() - 60000).toISOString() }).eq('id', 'YOUR_EVENT_ID').then(console.log);
"

# 3. Trigger refund via API
curl -X POST http://localhost:3001/admin/trigger-refunds
```

Expected result: event status changes to `settled` in Supabase.

---

## API Endpoints (Backend)

### Admin Endpoints

#### Get Health Status
```http
GET /health
```
Response: `{ status: 'ok', service: 'solarun-backend', timestamp: '...' }`

#### Get Blockchain Status
```http
GET /admin/blockchain-status
```
Response: Logs blockchain connection info and returns `{ status: 'ok' }`

#### Manually Trigger Refunds
```http
POST /admin/trigger-refunds
```
Response: `{ status: 'ok', message: 'Refund processing triggered', timestamp: '...' }`

### Event Management Endpoints

#### Delete Event & Refund Participants
```http
DELETE /api/events/:id
```

**Description:** Deletes a race event and automatically refunds all registered participants.

**Parameters:**
- `id` (path) — UUID of the event to delete

**Response (Success):**
```json
{
  "status": "ok",
  "message": "Event deleted successfully. 5 participant(s) refunded.",
  "details": {
    "eventId": "550e8400-e29b-41d4-a716-446655440000",
    "eventName": "Marathon 2026",
    "participantsRefunded": 5,
    "transactionSignature": "5sQ4r8vZ9xA2jK1qL3mN4oP5rS6tU7vW8xY9zA0bC1dE2fG3hI4jK5lM6nO7pQ8r",
    "timestamp": "2026-05-02T10:30:45.123Z"
  }
}
```

**Response (Error):**
```json
{
  "status": "error",
  "message": "Event not found: invalid-event-id",
  "timestamp": "2026-05-02T10:30:45.123Z"
}
```

**Workflow:**
1. ✅ Verify event exists and is not already settled
2. ✅ Fetch all registered participants
3. ✅ Call smart contract `process_refunds()` to refund participants (if blockchain available)
4. ✅ Delete all `race_logs` entries for the event's participants
5. ✅ Delete all `runners` (participants) for the event
6. ✅ Delete the `race_events` record itself

**Restrictions:**
- ❌ Cannot delete events with status `settled` (already processed)
- ✅ Can delete events with status: `pending`, `active`, `completed`

**Frontend Usage:**
```typescript
const handleDeleteEvent = async (eventId: string) => {
  const response = await fetch(`/api/events/${eventId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await response.json();
  
  if (response.ok) {
    alert(`✅ Deleted! Refunded ${data.details.participantsRefunded} participants.`);
    // Refresh event list
  } else {
    alert(`❌ Error: ${data.message}`);
  }
};
```

---

## MQTT Payload Format


IoT sensors (ESP32) publish to topic `solarun/checkpoint` using this JSON format:

```json
{
  "rfid_uid": "A1:B2:C3:D4",
  "checkpoint_id": 1,
  "timestamp": "2026-04-30T10:00:00.000Z",
  "event_id": "optional-event-uuid"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `rfid_uid` | string | RFID chip UID (format: `XX:XX:XX:XX`) |
| `checkpoint_id` | number | `0` = Start, `1` = Intermediate, `2` = Finish |
| `timestamp` | string | ISO 8601 timestamp from sensor |
| `event_id` | string? | Optional — if omitted, validator uses the active event |

---

## Prize Distribution (V1)

In V1, prize distribution is **simulated** (skeleton smart contract). The current logic:

- Top 4 finishers (by `finish_position`) receive prize shares
- Non-finishers do not receive any prize
- Distribution ratio: 40% / 30% / 20% / 10% for positions 1–4

**V2 (Phase 2.2)** will implement real USDC distribution using Anchor and a Pull Pattern where winners claim their prize directly.

---

## V1 Known Limitations

| Limitation | Planned Fix |
|------------|-------------|
| Wallet address is randomly generated (devnet demo) | V2: Real Solana wallet connection (Phantom) |
| Smart contract prize distribution is simulated | V2: Real USDC distribution via Anchor |
| No admin UI for event management | V2: Admin dashboard |
| MQTT broker must be running separately | V2: Hosted MQTT broker integration |
| Single intermediate checkpoint only | V2: Configurable checkpoint count |

---

## Development Notes

- **Supabase Realtime** is used for live leaderboard updates — no polling needed
- **TanStack Query** manages frontend data fetching and cache
- **shadcn/ui** with Tailwind CSS for UI components (default theme, no customization)
- **Jest** for unit and integration tests — 43 tests, all passing
- All blockchain calls in V1 use a **simulated TX signature** — no real SOL is transferred

---

## GitHub Commit Tag

```bash
git add -A
git commit -m "feat: SolaRun V1 Complete 🎉"
git tag v1.0.0
git push origin main --tags
```
