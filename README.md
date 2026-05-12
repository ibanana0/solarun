# SolaRun: IoT-Blockchain Marathon Platform

SolaRun adalah platform manajemen balap maraton berbasis Solana yang mengintegrasikan sensor RFID IoT dengan smart contract untuk pendaftaran yang transparan, pelacakan langsung (live tracking), dan distribusi hadiah otomatis.

## 🚀 Overview
SolaRun memecahkan masalah transparansi dan keterlambatan pembayaran dalam event olahraga dengan memindahkan seluruh siklus hidup balapan ke on-chain. Dengan menggunakan sensor RFID di setiap checkpoint, data pelari divalidasi secara real-time dan hasil akhir memicu distribusi hadiah otomatis dari vault smart contract.

### Fitur Utama:
- **Winner-Only Prize Pool:** Hadiah didistribusikan kepada 4 pemenang teratas (40%, 30%, 20%, 10%).
- **IoT-Blockchain Integration:** Checkpoint RFID secara otomatis mengirim data ke backend yang kemudian mencatat penyelesaian balapan on-chain.
- **Mock USDC & Yield:** Pendaftaran menggunakan Mock USDC (SPL Token) yang dapat di-faucet langsung di aplikasi.
- **Frictionless Onboarding:** Integrasi Privy untuk social login dan embedded wallet bagi pengguna non-kripto.
- **DeFi Staking:** Admin menyetor jaminan (stake) untuk menjamin keberlangsungan event.

---

## 🔗 Smart Contract Addresses (Solana Devnet)

| Component | Address |
|-----------|---------|
| **Program ID** | `E8KF9A7PiYbi3UmZTDy4RFnJYsvjmo3oQ7NwTuGzR2C8` |
| **Mock USDC Mint** | *(PDA: `mock_usdc_mint` dari Program ID)* |
| **Global State** | *(PDA: `global_state`)* |

---

## 🛠 Tech Stack

### Frontend
- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS + shadcn/ui
- **Auth/Wallet:** Privy SDK (Social Login + Embedded Wallet)
- **State Management:** TanStack Query (React Query)
- **Maps:** Leaflet.js (untuk rute maraton)

### Backend
- **Runtime:** Node.js (TypeScript)
- **Framework:** Express.js
- **Database:** Supabase (PostgreSQL + Realtime)
- **IoT Protocol:** MQTT (via HiveMQ / Mosquitto)
- **Scheduler:** Node-cron (untuk pengolahan refund otomatis)

### Smart Contract
- **Language:** Rust
- **Framework:** Anchor
- **Token:** SPL Token (Mock USDC)

### IoT (Hardware)
- **Microcontroller:** ESP32
- **Sensor:** RFID MFRC522
- **Communication:** WiFi + MQTT

---

## 🔄 Flow Penggunaan Aplikasi

1. **Social Login:** User masuk menggunakan Email/Google melalui Privy. Privy otomatis membuatkan wallet Solana.
2. **Faucet:** User mengklaim Mock USDC gratis dari menu Profile/Faucet untuk biaya pendaftaran.
3. **Pendaftaran:** User memilih event di halaman "Explore" dan mendaftar dengan membayar sejumlah Mock USDC.
4. **Balapan (IoT):**
   - User melakukan tap RFID di sensor **Start** (Checkpoint 0).
   - User melakukan tap di **Intermediate Checkpoint** (Checkpoint 1).
   - User melakukan tap di **Finish Line** (Checkpoint 2).
5. **Leaderboard:** Hasil balapan muncul secara real-time di frontend melalui sinkronisasi Supabase Realtime.
6. **Klaim Hadiah:** Setelah event selesai dan diverifikasi, hadiah otomatis dikirim ke wallet pemenang melalui instruksi `process_refunds` on-chain.

---

## 🎥 Flow Demo (Simulasi)

Untuk keperluan demo tanpa hardware fisik, kami menyediakan skrip simulasi:

1. **Setup:** Jalankan backend dan frontend. Pastikan Supabase sudah terkonfigurasi.
2. **Create Event:** Gunakan UI untuk membuat event baru dengan 3 checkpoint (0, 1, 2).
3. **Register Runners:** Daftarkan 5-10 pelari (bisa menggunakan skrip `backend/src/scripts/spawn-dummy-users.ts`).
4. **Simulate Race:** Jalankan skrip simulasi:
   ```bash
   cd backend
   npx tsx src/simulate-full-race.ts
   ```
   Skrip ini akan mempublikasikan pesan MQTT seolah-olah sensor RFID sedang di-tap.
5. **Verify On-Chain:** Lihat status event berubah menjadi `Completed` di dashboard, dan periksa transaksi distribusi hadiah di Solscan (Devnet).

---

## 🧠 Logika Bisnis

### 1. Validasi Checkpoint
Runner harus melewati checkpoint secara berurutan:
- **0 (Start) ➔ 1 (Checkpoint) ➔ 2 (Finish)**
- Tap di checkpoint yang salah atau melompati urutan akan menyebabkan diskualifikasi otomatis oleh sistem backend.
- *Anti-Cheat:* Delay minimum antara tap di sensor yang sama adalah 30 detik.

### 2. Distribusi Hadiah (Prize Pool)
Total dana pendaftaran di vault (setelah dipotong fee protokol) dibagikan kepada finisher dengan rasio:
- **Juara 1:** 40%
- **Juara 2:** 30%
- **Juara 3:** 20%
- **Juara 4:** 10%
Jika finisher kurang dari 4, sisa hadiah akan tetap berada di vault atau dikembalikan ke treasury sesuai kebijakan event.

### 3. Staking & Keamanan
- **Admin Stake:** Creator wajib melakukan deposit Mock USDC sebagai jaminan. Jika event dibatalkan secara sepihak setelah pendaftaran dibuka, dana stake ini dapat digunakan untuk kompensasi peserta.
- **Dispute Period:** Dana ditahan selama periode tertentu setelah balapan selesai sebelum dapat diklaim sepenuhnya untuk memungkinkan verifikasi manual jika ada kecurangan.

---

© 2026 SolaRun Team. Built for Solana IoT Hackathon.
