# SolaRun Project Guide

SolaRun is a Solana-based marathon race management system that integrates IoT RFID sensors with blockchain smart contracts for transparent registration, live tracking, and automated prize distribution. Use MCP context7.

## Project Structure

- `backend/`: Node.js Express server (TypeScript) - Handles MQTT messages, validates checkpoints, and interacts with Supabase/Solana.
- `contracts/`: Anchor-based Solana smart contracts (Rust) - Manages event state, registrations, and prize distribution.
- `frontend/`: Next.js application (TypeScript) - Provides the user interface for event listing, registration, and live leaderboard.
- `scripts/`: Utility scripts for development.

## Core Technologies

- **Blockchain:** Solana, Anchor Framework
- **Backend:** Node.js, Express, TypeScript, MQTT, Supabase
- **Frontend:** Next.js 16, Tailwind CSS, shadcn/ui, TanStack Query
- **IoT:** MQTT protocol for RFID checkpoint data

## Architecture Overview

1.  **IoT Sensors:** RFID readers (e.g., ESP32) publish checkpoint data to an MQTT broker.
2.  **Backend MQTT Listener:** Subscribes to the `race/checkpoint` topic and receives payloads.
3.  **Checkpoint Validator:** Validates checkpoint sequence (0: Start, 1: Intermediate, 2: Finish), prevents duplicate taps, and updates runner status.
4.  **Supabase:** Stores event data, runner status, and race logs. Provides real-time updates for the leaderboard.
5.  **Refund Scheduler:** A cron job that checks for completed events and triggers the Solana smart contract for prize distribution.
6.  **Solana Smart Contract:** Distributes Mock USDC to the top 4 finishers based on their positions.

## Key Commands

### Root
- No root-level scripts; navigate to subdirectories.

### Backend (`/backend`)
- `npm install`: Install dependencies.
- `npm run dev`: Start development server with watch mode.
- `npm start`: Start production server.
- `npm test`: Run Jest tests.
- `npx tsx src/test-validator.ts`: Simulate a full race flow (MQTT checkpoints).
- `npx tsx src/test-refund-scheduler.ts`: Test the refund scheduler logic.

### Contracts (`/contracts`)
- `yarn install`: Install dependencies.
- `anchor build`: Build the smart contract.
- `anchor test`: Run contract tests (uses local validator).

### Frontend (`/frontend`)
- `npm install`: Install dependencies.
- `npm run dev`: Start Next.js development server.
- `npm run build`: Build for production.

## Configuration

### Backend (`backend/.env`)
Required variables include:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: Supabase credentials.
- `MQTT_BROKER_URL`: URL for the MQTT broker.
- `SOLANA_RPC_URL`, `ADMIN_KEYPAIR_PATH`: Solana connection details.

### Frontend (`frontend/.env.local`)
Required variables include:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase public credentials.

## Development Conventions

### Checkpoint Validation
- **Sequence:** Runners must hit checkpoints in order (0 -> 1 -> 2).
- **Duplicate Taps:** Multiple taps at the same checkpoint within 30 seconds are ignored.
- **Positions:** Finish positions are automatically assigned in the order runners hit the final checkpoint (ID 2).

### Smart Contract Logic
- The contract uses a vault-based system to hold registration fees in Mock USDC.
- Prize distribution ratio: 1st (40%), 2nd (30%), 3rd (20%), 4th (10%).

### Database Schema (Supabase)
- `race_events`: Event metadata and status (`pending`, `active`, `completed`, `settled`).
- `runners`: Participant data, chip UID, and status (`registered`, `running`, `finished`, `disqualified`).
- `race_logs`: History of checkpoint taps.

## Simulation & Testing

To test the full system without hardware:
1.  Ensure Supabase is configured and tables are created.
2.  Start the backend: `cd backend && npm run dev`.
3.  Run the simulation script: `cd backend && npx tsx src/test-validator.ts`.
4.  Observe real-time updates on the frontend leaderboard.
5.  Wait for the scheduler or manually trigger refunds via `POST /admin/trigger-refunds`.

# **📋 SolaRun Project Context**

## **Complete Technical Specification for IoT Engineer**

**Project:** SolaRun (Solana-IoT Marathon Platform)

**Status:** ✅ **V1 COMPLETE** — Phase 2.1 & 2.2 done. Ready for Phase 2.3 (Real Wallet Simulation).


**Timeline:** 2 weeks (April 29 - May 13, 2026)

**Target Network:** Solana Devnet


**IoT Role:** Hardware checkpoint sensor integration

---

## **1. PROJECT OVERVIEW**

### **Vision**

SolaRun adalah platform marathon berbasis blockchain Solana yang mengintegrasikan IoT (RFID sensors) untuk otomasi distribusi hadiah. Sistem ini memungkinkan atlet untuk:

- Mendaftar event marathon dengan bayar tiket (SOL)
- Menjalani race dengan validasi checkpoint melalui RFID sensor
- Secara otomatis menerima hadiah/refund berdasarkan finish position via smart contract
- Melihat leaderboard realtime dan yield estimation

**Key Innovation:**

- **Winner-Only Prize Pool:** Pemenang (Finishers) mendapatkan porsi dari pool hadiah (Biaya registrasi + yield), sementara non-pemenang tidak mendapatkan pengembalian (uang masuk ke pool).
- **Transparent Prize Distribution:** Hadiah didistribusikan otomatis via smart contract menggunakan sistem Claim/Pull (mengurangi beban gas admin).
- **DeFi & Mock USDC Integration:** Biaya registrasi menggunakan Mock USDC (SPL Token) agar mudah dipahami oleh user baru (harga stabil). Dana ini di-stake ke DeFi untuk generate yield tambahan bagi para pemenang.
- **Smart Contract Lifecycle Management:** Dilengkapi dengan fitur `delete_event` untuk menutup akun event yang dibatalkan, mengembalikan (refund) dana peserta, dan mengklaim kembali biaya rent (lamports).
- **Built-in Faucet untuk Testing:** Menyediakan instruksi `mint_mock_usdc` di dalam smart contract yang dapat dipanggil langsung melalui tombol "Faucet" di frontend untuk keperluan testing dan demo.
- **IoT-Blockchain Bridge:** RFID checkpoints directly trigger on-chain transactions (instant, transparent).
- **Frictionless Web3 Onboarding:** Integrasi Privy memungkinkan pelari awam mendaftar menggunakan akun Google/Email. Sistem akan otomatis membuatkan *embedded Solana wallet* di belakang layar tanpa perlu pusing mengelola *seed phrase*.
- **Role-Based Access Control (RBAC):** Pemisahan otorisasi antara *Creator* (pembuat event) dan *Runner* (peserta) yang disinkronisasi melalui tabel `users` di Supabase untuk menjaga keamanan dan privasi data.
- **Blockscan Transparency Links:** Semua transaksi utama (pembuatan event, registrasi, distribusi hadiah, klaim hadiah) menyediakan link Blockscan/Solscan langsung ke pengguna untuk menjamin transparansi operasional dan alur dana secara on-chain.
- **Interactive Demo Simulation:** Menyediakan skrip simulasi gabungan (otomatis & manual interaktif) khusus untuk demo IoT, memungkinkan presentasi secara realtime.

---

## **2. TECHNICAL STACK (OVERVIEW)**

```
┌─────────────────────────────────────────────────────────────┐
│                      USER LAYER                             │
├─────────────────────────────────────────────────────────────┤
│ Frontend: Next.js 14 (TypeScript)                           │
│ UI: Tailwind CSS + Shadcn/UI                               │
│ State: TanStack Query (React Query)                         │
│ Auth & Wallet: Privy (Social Login + Embedded Wallet)       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                   BACKEND LAYER                             │
├─────────────────────────────────────────────────────────────┤
│ Runtime: Node.js (TypeScript)                              │
│ Framework: Express.js                                       │
│ Async Queue: Bull/node-cron (for refund scheduler)         │
│ MQTT: mqtt (v5.0, TLS supported)                           │
│ Database: Supabase (PostgreSQL)                            │
│ Realtime: Supabase Realtime                                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                   BLOCKCHAIN LAYER                          │
├─────────────────────────────────────────────────────────────┤
│ Network: Solana Devnet                                      │
│ Framework: Anchor (Rust)                                    │
│ Program: solarun-program (account vault + distribution)     │
│ Capabilities: PDA Signer, CPI Transfers, SPL Token (USDC)   │
│ Instructions: Init, Register, Start, Finish, Refund, Delete, Faucet │
│ Wallet: Admin keypair for TX signing, Privy for runner TX   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                     IoT LAYER (YOUR PART)                   │
├─────────────────────────────────────────────────────────────┤
│ Microcontroller: ESP32 (WiFi + MQTT)                        │
│ Sensor: MFRC522 RFID Reader                                 │
│ Protocol: MQTT v5.0 (publish to HiveMQ/Mosquitto)          │
│ Clock: NTP sync (optional, local timestamp OK for MVP)     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## **3. IOT HARDWARE SPECIFICATION**

### **3.1 Hardware Components**

| Component | Model | Purpose | Specs |
| --- | --- | --- | --- |
| **Microcontroller** | ESP32 (WROOM-32) | Main processor | WiFi, BLE, 4MB Flash, 520KB RAM |
| **RFID Reader** | MFRC522 | Read participant chips | 13.56 MHz, SPI interface |
| **RFID Chip** | MIFARE Classic 1K | Participant ID | ISO/IEC 14443 Type A, UID = 4-7 bytes |
| **Power Supply** | USB Power Bank / 5V adapter | Power ESP32 | Minimum 2A recommended |
| **Housing** | Weatherproof enclosure (IP65) | Protect electronics | For outdoor marathon |
| **Antenna** | Built-in MFRC522 antenna | Read range | ~10 cm (adjustable with settings) |

**Total BOM Cost:** ~$50-80 per sensor unit

### **3.2 RFID Chip Specification**

Each marathon participant receives one RFID chip (pre-programmed or assigned at registration):

```
┌─────────────────────────────────────────┐
│       MFRC522 RFID Chip Format          │
├─────────────────────────────────────────┤
│ Chip UID: 08:1A:2B:3C (example)         │
│ This UID maps to:                       │
│   - Participant wallet address          │
│   - Runner ID in Supabase               │
│   - Full name + event                   │
│                                         │
│ Data stored in chip (optional):         │
│   - Participant name (20 bytes)         │
│   - Wallet address (44 bytes)           │
│   - Event ID (16 bytes)                 │
│                                         │
│ For MVP: Store minimal, use             │
│ chip UID as lookup key only             │
└─────────────────────────────────────────┘
```

---

## **4. IOT WORKFLOW & MESSAGING**

### **4.1 Single Sensor, Multi-Mode Operation**

**Hardware Setup:** 1 sensor, 3 different physical locations (start, checkpoint, finish)

Each checkpoint will use the **same hardware**, but operates in different modes based on **event timing** + **software configuration**:

```
┌────────────────────────────────────────────┐
│   Single RFID Sensor, Multi-Mode Logic     │
├────────────────────────────────────────────┤
│ Mode 1: START                              │
│  - Location: Marathon start line           │
│  - Triggers: When participant taps chip    │
│  - Status: Mark runner as "running"        │
│  - Message: {checkpoint_id: 0, ...}        │
│                                            │
│ Mode 2: CHECKPOINT (Intermediate)          │
│  - Location: Halfway point (or multiple)   │
│  - Triggers: When participant taps chip    │
│  - Status: Validate order (must have done  │
│    start before)                           │
│  - Message: {checkpoint_id: 1, ...}        │
│                                            │
│ Mode 3: FINISH                             │
│  - Location: Marathon finish line          │
│  - Triggers: When participant taps chip    │
│  - Status: Mark runner as "finished"       │
│  - Message: {checkpoint_id: 2, ...}        │
│  - Special: Assign finish_position based   │
│    on order received                       │
│                                            │
│ Configuration: Stored in ESP32 EEPROM     │
│ or via configuration endpoint              │
└────────────────────────────────────────────┘
```

### **4.2 Data Flow: ESP32 → Backend → DB → Smart Contract**

```
SEQUENCE DIAGRAM:

Participant                ESP32 RFID               Backend             Supabase         Smart Contract
    │                           │                       │                   │                   │
    ├─── Tap chip ─────────────>│                       │                   │                   │
    │                           │                       │                   │                   │
    │                           ├─ Read UID ────────────│                   │                   │
    │                           ├─ Get local time ──────│                   │                   │
    │                           ├─ Publish MQTT ──────────────────────────>│                   │
    │                           │    {chip_uid, checkpoint_id, timestamp}   │                   │
    │                           │                       │                   │                   │
    │                           │                       ├─ Validate ────────│                   │
    │                           │                       │  checkpoint order │                   │
    │                           │                       │                   │                   │
    │                           │                       ├─ Insert race_log──│                   │
    │                           │                       │                   │                   │
    │                           │                       ├─ If finish ──────────────────────────>│
    │                           │                       │  trigger record_finish()              │
    │                           │                       │                   │                   │
    │                           │                       │                   │  Update finish   │
    │                           │                       │<─ Query finish pos─────────────────────│
    │                           │                       │                   │                   │
    │<──── Display in app ──────────────────────────────────────────────────│                   │
    │     "You finished 2nd!" + Blockscan URL                          │                   │                   │
    │
    │ (After event end)
    │
    │                           │                       ├─ Trigger refund ────────────────────>│
    │                           │                       │   process_refunds()                  │
    │                           │                       │                   │                   │
    │<──── Prize/Refund received ────────────────────────────────────────────────────────────<─│
    │      (SOL in wallet)
```

### **4.3 MQTT Message Format**

**Topic:** `race/checkpoint`

**Publish Interval:** Every tap (estimated ~30-60 per minute during peak race time)

**Message Payload (JSON):**

```json
{
  "event_id": "550e8400-e29b-41d4-a716-446655440000",
  "rfid_uid": "08:1A:2B:3C",
  "checkpoint_id": 0,
  "timestamp": 1714425600000,
  "sensor_id": "checkpoint_1",
  "device_id": "esp32_001"
}
```

**Field Descriptions:**

| Field | Type | Required | Example | Notes |
| --- | --- | --- | --- | --- |
| event_id | UUID | Yes | 550e8400... | Which marathon event |
| rfid_uid | String | Yes | 08:1A:2B:3C | Participant chip UID |
| checkpoint_id | Int | Yes | 0, 1, 2 | 0=start, 1+=checkpoint, 2=finish |
| timestamp | Long (ms) | Yes | 1714425600000 | **Local ESP32 time**, NOT UTC |
| sensor_id | String | No | checkpoint_1 | Identifies which physical sensor |
| device_id | String | No | esp32_001 | Device identifier for debugging |

**Message Size:** ~200-300 bytes (JSON)

**Frequency:** ~30-60 msgs/min during race (for 100 participants = ~100-200 msgs/min total)

**Latency Target:** <100ms from tap to MQTT publish

---

## **5. ESP32 SOFTWARE SPECIFICATION**

### **5.1 Core Responsibilities**

Your ESP32 firmware must:

1. ✅ **RFID Reading**
    - Initialize MFRC522 reader via SPI
    - Detect chip tap (card present)
    - Read UID from chip
    - Return UID as hex string (e.g., "08:1A:2B:3C")
2. ✅ **Local Time Management**
    - Sync time via NTP (optional, but recommended)
    - Store local timestamp in milliseconds
    - Include timestamp in MQTT message
    - Timestamp used for finish order + velocity check
3. ✅ **MQTT Publishing**
    - Connect to MQTT broker (HiveMQ cloud or local Mosquitto)
    - Publish to `race/checkpoint` topic
    - Serialize JSON payload correctly
    - Handle network disconnection gracefully
4. ✅ **Configuration Management**
    - Store configuration in EEPROM:
        - WiFi SSID + password
        - MQTT broker address + port
        - Event ID
        - Checkpoint ID (which mode: 0=start, 1=cp, 2=finish)
    - Allow over-the-air update of config (POST endpoint or MQTT)
5. ✅ **Error Handling**
    - Retry MQTT publish if failed
    - Log errors to serial console (for debugging)
    - Beep/LED feedback on successful read (UX)
    - Handle duplicate reads (same chip within 30 sec) - optional debounce

### **5.2 Hardware Connections (SPI)**

```
MFRC522 RFID Reader ←→ ESP32 Pins
───────────────────────────────────
PIN 1 (SDA)        ←→ GPIO 5   (CS)
PIN 2 (SCK)        ←→ GPIO 18  (SCK)
PIN 3 (MOSI)       ←→ GPIO 23  (MOSI)
PIN 4 (MISO)       ←→ GPIO 19  (MISO)
PIN 5 (IRQ)        ←→ GPIO 17  (optional)
PIN 6 (GND)        ←→ GND
PIN 7 (RST)        ←→ GPIO 22  (RESET)
PIN 8 (3.3V)       ←→ 3.3V

Suggested SPI Bus: HSPI (SPI2)
SPI Clock Speed: 1-5 MHz (MFRC522 supports up to 10 MHz)
```

### **5.3 Pseudocode / High-Level Logic**

```cpp
// main.cpp (pseudocode)

#include <MFRC522.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>

// Config
const char* ssid = "WiFi_SSID";
const char* password = "WiFi_Password";
const char* mqtt_broker = "broker.hivemq.com";
const int mqtt_port = 1883;
const char* mqtt_topic = "race/checkpoint";

// Hardware setup
MFRC522 rfid(5, 22);  // CS=5, RST=22
WiFiClient espClient;
PubSubClient client(espClient);

// State
String event_id = "550e8400-e29b-41d4-a716-446655440000";
int checkpoint_id = 0;  // 0=start, 1=cp, 2=finish
unsigned long last_read_time = 0;
const unsigned long debounce_ms = 30000;  // 30 sec debounce

void setup() {
  Serial.begin(115200);

  // Init RFID
  SPI.begin();
  rfid.PCD_Init();

  // Init WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("WiFi connected");

  // Init MQTT
  client.setServer(mqtt_broker, mqtt_port);
  connect_mqtt();

  // Sync time via NTP
  sync_time();
}

void loop() {
  // Keep MQTT connection alive
  if (!client.connected()) {
    connect_mqtt();
  }
  client.loop();

  // Check for RFID chip
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    String uid = get_uid_as_string();
    unsigned long now = millis();

    // Simple debounce: ignore reads within 30 sec of last
    if (now - last_read_time < debounce_ms) {
      Serial.println("Duplicate read, ignoring");
      rfid.PICC_HaltA();
      return;
    }

    last_read_time = now;

    // Get local time
    time_t now_time = time(nullptr);
    unsigned long timestamp_ms = now_time * 1000;

    // Build JSON payload
    DynamicJsonDocument doc(512);
    doc["event_id"] = event_id;
    doc["rfid_uid"] = uid;
    doc["checkpoint_id"] = checkpoint_id;
    doc["timestamp"] = timestamp_ms;
    doc["sensor_id"] = "checkpoint_1";
    doc["device_id"] = "esp32_001";

    // Serialize to string
    String payload;
    serializeJson(doc, payload);

    // Publish to MQTT
    bool published = client.publish(mqtt_topic, payload.c_str());
    if (published) {
      Serial.println("Published: " + payload);
      blink_led(100);  // Success feedback
    } else {
      Serial.println("Publish failed, retrying...");
      delay(1000);
      client.publish(mqtt_topic, payload.c_str());
    }

    rfid.PICC_HaltA();
  }

  delay(100);  // Polling interval
}

void connect_mqtt() {
  while (!client.connected()) {
    if (client.connect("ESP32_SolaRun")) {
      Serial.println("MQTT connected");
    } else {
      Serial.print("Failed, rc=" + String(client.state()));
      delay(5000);
    }
  }
}

void sync_time() {
  // NTP sync (optional, improves accuracy)
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.println("Waiting for NTP time sync...");
  time_t now = time(nullptr);
  while (now < 24 * 3600) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
  }
  Serial.println("Time synced");
}

String get_uid_as_string() {
  // Convert RFID UID to hex string "08:1A:2B:3C"
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (i > 0) uid += ":";
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  return uid;
}

void blink_led(int ms) {
  digitalWrite(LED_PIN, HIGH);
  delay(ms);
  digitalWrite(LED_PIN, LOW);
}
```

### **5.4 Configuration Management**

Allow configuration to be updated without reprogramming:

```
Option 1: EEPROM Storage (Persistent)
────────────────────────────────
Store in ESP32 EEPROM:
- WiFi SSID (32 bytes)
- WiFi password (64 bytes)
- MQTT broker (50 bytes)
- Event ID (36 bytes UUID)
- Checkpoint ID (1 byte)

Format: Simple key-value or JSON

Option 2: Over-the-Air Configuration
────────────────────────────────
Expose HTTP endpoint on ESP32:
  POST /config
  Body: {
    "ssid": "...",
    "password": "...",
    "mqtt_broker": "...",
    "event_id": "...",
    "checkpoint_id": 0
  }

Option 3: MQTT Configuration Topic (Recommended for V2)
────────────────────────────────
Subscribe to: race/config/{device_id}
Receive commands to update config without restart
```

---

## **6. INTEGRATION WITH BACKEND**

### **6.1 Backend MQTT Listener (What Your Data Triggers)**

Backend will:

```tsx
// Backend subscribes to "race/checkpoint"
// When receives message:

mqtt.on('message', (topic, payload) => {
  const data = JSON.parse(payload);
  // {event_id, rfid_uid, checkpoint_id, timestamp}

  // 1. Lookup runner by rfid_uid in Supabase
  const runner = await supabase
    .from('runners')
    .select('*')
    .eq('chip_uid', data.rfid_uid)
    .single();

  // 2. Validate checkpoint order
  const last_checkpoint = await supabase
    .from('race_logs')
    .select('checkpoint_id')
    .eq('runner_id', runner.id)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  if (last_checkpoint && last_checkpoint.checkpoint_id >= data.checkpoint_id) {
    console.log("Invalid order, rejecting");
    return;
  }

  // 3. Insert into race_logs
  await supabase.from('race_logs').insert({
    runner_id: runner.id,
    checkpoint_id: data.checkpoint_id,
    timestamp: new Date(data.timestamp),
  });

  // 4. Update runner status
  if (data.checkpoint_id === 0) {
    await supabase
      .from('runners')
      .update({ status: 'running' })
      .eq('id', runner.id);
  } else if (data.checkpoint_id === 2) {
    // FINISH: assign position and call smart contract
    const finish_position = await get_finish_position(runner.id);
    await supabase
      .from('runners')
      .update({
        status: 'finished',
        finish_position: finish_position
      })
      .eq('id', runner.id);

    // 5. Call smart contract
    await call_smart_contract_record_finish(
      runner.wallet_address,
      finish_position
    );
  }
});
```

### **6.2 Data Expectations for Backend**

Backend expects:

| Field | Type | Validation |
| --- | --- | --- |
| event_id | UUID | Must match current event |
| rfid_uid | String | Must exist in runners table |
| checkpoint_id | Int | 0 (start), 1 (intermediate), 2 (finish) |
| timestamp | Long (ms) | Must be within race duration |

**Error Handling:**

- Invalid event_id → log error, ignore
- Unknown rfid_uid → log error, ignore
- Out-of-order checkpoint → reject, mark runner as disqualified
- Duplicate read → ignore (backend dedupe, or ESP32 debounce)

### **6.3 Testing Integration (For You + Backend Developer)**

**Test Scenario (before race day):**

```
Step 1: Setup
- Deploy backend locally (or staging)
- Connect ESP32 to test MQTT broker
- Create test event in Supabase
- Register 5 test runners with chip UIDs

Step 2: Simulate Race
a) ESP32 reads chip, publishes to MQTT
b) Backend receives → inserts race_log
c) Check Supabase: race_logs table should show entry
d) Frontend leaderboard updates (if realtime enabled)

Step 3: Validate Checkpoint Order
a) Tap same chip out-of-order (e.g., checkpoint 2 before 0)
b) Backend should reject
c) Check: runner marked as "disqualified"

Step 4: Test Finish
a) Tap chip at finish (checkpoint 2)
b) Backend calls smart contract
c) Check: finish_position assigned, runner marked "finished"
d) Smart contract TX succeeds on devnet

Expected Result: 5 minutes from first tap to smart contract execution
```

---

## **7. MQTT BROKER SETUP (FOR YOU)**

### **7.1 Option A: HiveMQ Cloud (Recommended for Dev)**

```
Pros:
- Free tier: 100 connections, 100 MB/month
- Reliable, production-tested
- Easy setup, no infrastructure

Setup:
1. Sign up at <https://www.hivemq.cloud>
2. Create cluster (free tier)
3. Get credentials: broker.hivemq.com:8883 (TLS)
4. Connect ESP32 using credentials

Code:
  const char* mqtt_broker = "broker.hivemq.com";
  const int mqtt_port = 8883;  // TLS port
  const char* mqtt_user = "...";
  const char* mqtt_pass = "...";
  client.setServer(mqtt_broker, mqtt_port);
  client.connect("ESP32_SolaRun", mqtt_user, mqtt_pass);
```

### **7.2 Option B: Mosquitto Local (For Testing)**

```
Pros:
- Free, open-source
- No latency, full control
- Good for development

Setup on backend server:
  apt-get install mosquitto mosquitto-clients
  systemctl start mosquitto

Test from ESP32:
  const char* mqtt_broker = "192.168.1.100";  // Backend IP
  const int mqtt_port = 1883;
```

---

## **8. IOT TIMELINE (WITHIN 2-WEEK SPRINT)**

### **Week 1: Core Hardware (Days 1-7)**

| Day | Tasks | Deliverable |
| --- | --- | --- |
| 1-2 | Setup ESP32 dev env, RFID reader wiring | Blink LED test |
| 3 | RFID reading + UID parsing | Can read chip UID from serial |
| 4 | WiFi + MQTT connection | Can connect to broker |
| 5 | JSON payload construction + publish | Can publish test message to MQTT |
| 6 | Configuration management (EEPROM) | Can update config without reprogramming |
| 7 | Integration test with backend | Tap chip → backend receives → DB updated |

**Deliverable:** Working ESP32 + RFID reading + MQTT publishing

### **Week 2: Testing & Deployment (Days 8-14)**

| Day | Tasks | Deliverable |
| --- | --- | --- |
| 8 | Durability testing (100+ taps) | No crashes, stable operation |
| 9 | Handle network disconnection | Auto-reconnect to MQTT broker |
| 10 | Time sync + timestamp accuracy | Timestamp within ±2 sec |
| 11-12 | Integration with backend + smart contract | Full flow: tap → MQTT → backend → SC |
| 13 | Demo scenario (3-5 runs) | Record demo of checkpoint reads |
| 14 | Buffer + troubleshooting | Ready for hackathon |

**Deliverable:** Production-ready ESP32 firmware + documented deployment guide

---

## **9. DATA SCHEMA (BACKEND DATABASE)**

Your MQTT messages will populate these Supabase tables:

### **runners table**

```sql
CREATE TABLE runners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chip_uid VARCHAR UNIQUE NOT NULL,        -- From ESP32 RFID read
  wallet_address VARCHAR UNIQUE NOT NULL,   -- Solana wallet
  full_name VARCHAR NOT NULL,
  event_id UUID NOT NULL REFERENCES race_events(id),
  status ENUM ('registered', 'running', 'finished', 'disqualified'),
  finish_position INTEGER,                  -- 1, 2, 3, 4, 5, ... NULL if not finished
  tx_signature VARCHAR,                     -- Blockscan URL for registration/claim transaction
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### **race_logs table**

```sql
CREATE TABLE race_logs (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  runner_id UUID NOT NULL REFERENCES runners(id),
  checkpoint_id INTEGER NOT NULL,          -- 0=start, 1+=checkpoint, 2=finish
  timestamp TIMESTAMPTZ NOT NULL,          -- From ESP32 timestamp
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Your Role:** Publish MQTT message with `chip_uid`, `checkpoint_id`, `timestamp`

**Backend Role:** Validate + insert into these tables

---

## **10. DEMO SCENARIO (FOR HACKATHON)**

Your IoT hardware will be used in 5-minute video demo:

```
Demo Flow:
──────────

[00:00-00:30] Show Hardware Setup
- Display ESP32 + RFID sensor
- Show "Checkpoint 1" label/sign
- Explain: "This sensor detects participants via RFID chip"

[00:30-01:00] Live Tap Demonstration
- Participant 1 taps chip at start → RFID beeps + LED blinks
- Check serial output: "UID detected: 08:1A:2B:3C"
- Show MQTT message in terminal: topic "race/checkpoint"

[01:00-01:30] Leaderboard Update
- Switch to frontend leaderboard
- Show participant appears as "Running"
- Explain: "Participant's status updates realtime from ESP32"

[01:30-02:00] Finish Line
- Participant taps chip at finish → RFID reads successfully
- Participant moves from "Running" → "Finished" with position
- Show smart contract TX on devnet explorer

[02:00-02:30] Relay to Other Participants
- Repeat taps for 3-4 more "participants" (same chip or different)
- Show leaderboard updating with all finishers
- Show yield + prize calculation

Expected: Smooth, no crashes, clear feedback from hardware
```

---

## **11. DELIVERABLES FOR YOUR IoT WORK**

### **By Day 7 (End of Week 1):**

- [ ]  ESP32 firmware (Arduino IDE .ino file)
- [ ]  README with wiring diagram + pinout
- [ ]  Tested MQTT publishing (log messages to terminal)
- [ ]  Configuration guide (how to set WiFi, MQTT broker, event_id)

### **By Day 14 (End of Week 2):**

- [ ]  Production firmware (stable, error handling)
- [ ]  Deployment guide (step-by-step setup for non-technical person)
- [ ]  Test logs (100+ successful reads without crash)
- [ ]  Demo video (3-5 sec showing RFID tap → MQTT publish)
- [ ]  Troubleshooting guide (common issues + solutions)

---

## **12. CONTACT POINTS WITH BACKEND/FRONTEND TEAMS**

### **Communication Protocol**

**What You Send to Backend:**

- MQTT topic: `race/checkpoint`
- Message format: JSON (see section 4.3)
- Frequency: ~30-60 per minute
- Latency: <100 ms

**What You Receive from Backend:**

- Configuration updates (if implementing MQTT config)
- Status feedback (optional, e.g., "event started" → trigger mode change)

**Testing Collaboration:**

- Backend team will listen to your MQTT messages
- Frontend team will display results
- Coordinate timing for integration tests (Day 7, Day 11)

**Sync Points:**

- Day 3: Agree on MQTT message format (finalize JSON schema)
- Day 7: First integration test (backend + IoT)
- Day 11: Full integration test (backend + IoT + frontend + SC)
- Day 13: Demo rehearsal (all parts working together)

---

## **13. INFRASTRUCTURE CHECKLIST**

Before race day, ensure:

```
HARDWARE:
☐ ESP32 powered on + WiFi connected
☐ MFRC522 initialized + detecting chips
☐ RFID read range ~10cm (adjust antenna tuning if needed)
☐ LED/Buzzer feedback working
☐ No loose wires or solder joints

NETWORK:
☐ WiFi signal strong at checkpoint location
☐ MQTT broker accessible (HiveMQ cloud or local Mosquitto)
☐ Firewall allows MQTT port (1883 or 8883)
☐ Internet latency <100ms from ESP32 to broker

INTEGRATION:
☐ Backend MQTT listener running (logs show incoming messages)
☐ Supabase reachable from backend
☐ Smart contract deployed to Solana devnet
☐ Admin keypair accessible for TX signing

TESTING:
☐ Test 10+ consecutive taps (no drops)
☐ Test restart scenario (WiFi re-connect)
☐ Test same chip at different checkpoints (order validation)
☐ Test invalid/unknown chip (graceful failure)

MONITORING:
☐ Check MQTT message frequency (expect ~X msgs/min during peak)
☐ Monitor ESP32 memory (avoid crashes)
☐ Monitor backend logs (errors, duplicates, rejections)
```

---

## **14. ESTIMATED EFFORT & TIMELINE**

| Task | Hours | Days |
| --- | --- | --- |
| ESP32 setup + RFID wiring | 3 | 0.5 |
| RFID reading + UID parsing | 4 | 1 |
| WiFi + MQTT connection | 5 | 1 |
| JSON payload + publish | 3 | 0.5 |
| Configuration management | 3 | 0.5 |
| Testing + debugging | 8 | 2 |
| **Total** | **26 hours** | **~3.5 days** |

**Reality:** ~2 weeks at part-time (8-10 hours/week), or ~3-4 days full-time

**Buffer:** Day 14 for troubleshooting + improvements

---

## **15. REFERENCES & RESOURCES**

### **Libraries & Frameworks**

- **MFRC522 Library:** https://github.com/miguelbalboa/rfid
- **Arduino-paho-mqtt:** https://github.com/knolleary/pubsubclient
- **ArduinoJson:** https://github.com/bblanchon/ArduinoJson
- **ESP32 Board Support:** https://github.com/espressif/arduino-esp32

### **Documentation**

- MFRC522 Datasheet: https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf
- MQTT Specification: https://mqtt.org/mqtt-specification
- HiveMQ Documentation: https://docs.hivemq.com/

### **Tools**

- MQTT Explorer: http://mqtt-explorer.com/ (debug MQTT messages)
- Mosquitto: https://mosquitto.org/ (local broker)
- Arduino IDE: https://www.arduino.cc/en/software

---

## **16. PROJECT CONTEXT SUMMARY**

**Your Role:** Build IoT hardware (ESP32 + RFID) that:

1. Detects marathon participants via RFID chip tap
2. Publishes tap events to MQTT broker
3. Backend receives → validates → records → calls smart contract
4. Smart contract distributes prizes automatically

**Key Success Factors:**

- ✅ Reliable RFID reading (no missed taps)
- ✅ Stable MQTT publishing (no message loss)
- ✅ Accurate timestamps (for finish order)
- ✅ Error handling (network disconnects, invalid chips)
- ✅ Clear documentation (for field deployment)

**Timeline:** 2 weeks (Part of larger 14-day hackathon push)

**Budget:** ~$50-80 per sensor unit

**Status:** MVP (1 sensor, 3 modes) → V2 (multiple sensors, advanced features)

---

**Good luck! Questions? Coordinate with the main dev team. You're building the critical bridge between physical world (marathon) and digital world (blockchain)! 🏃🔗** 🚀