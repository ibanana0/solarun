# IDL Synchronization Guide

## Overview

SolaRun menggunakan Anchor framework untuk smart contract Solana. IDL (Interface Definition Language) harus selalu sinkron antara backend dan frontend.

## File IDL Locations

- **Source of Truth:** `backend/src/blockchain/solarun_temp.json`
- **Frontend Copy:** `frontend/lib/solarun_idl.json`

## Verifikasi Sinkronisasi

Cek apakah IDL sudah sinkron:

```bash
# Compare checksums
md5sum backend/src/blockchain/solarun_temp.json frontend/lib/solarun_idl.json

# Should output identical hashes:
# ef9c7fef04b32128fb7172f6cd6b863a *backend/src/blockchain/solarun_temp.json
# ef9c7fef04b32128fb7172f6cd6b863a *frontend/lib/solarun_idl.json
```

## Manual Sync Process

Jika IDL tidak sinkron:

```bash
# Copy from backend to frontend
cp backend/src/blockchain/solarun_temp.json frontend/lib/solarun_idl.json

# Clear Next.js cache
cd frontend && rm -rf .next node_modules/.cache

# Restart dev server
npm run dev
```

## Naming Convention: snake_case vs camelCase

### IDL File (JSON)
Semua instruksi di IDL menggunakan **snake_case**:
```json
{
  "name": "initialize_event",
  "name": "register_participant",
  "name": "record_finish",
  "name": "process_refunds"
}
```

### Backend (TypeScript/Node.js)
Backend tetap menggunakan **snake_case**:
```typescript
await program.methods.initialize_event(...)
await program.methods.register_participant(...)
```

### Frontend (TypeScript/React)
Anchor **auto-converts** snake_case ke camelCase di TypeScript:
```typescript
// ✅ BENAR - Gunakan camelCase di frontend
await program.methods.initializeEvent(...)        // initialize_event
await program.methods.registerParticipant(...)    // register_participant
await program.methods.stakeEvent(...)             // stake_event
await program.methods.recordFinish(...)           // record_finish
await program.methods.processRefunds(...)         // process_refunds

// ❌ SALAH - Jangan gunakan snake_case di frontend
await program.methods.initialize_event(...)  // TypeError!
await program.methods.stake_event(...)       // TypeError!
```

## Program ID

Current deployed program:
```
E8KF9A7PiYbi3UmZTDy4RFnJYsvjmo3oQ7NwTuGzR2C8
```

Ensure this matches in:
- `.env` files (SOLARUN_PROGRAM_ID)
- IDL JSON (`address` field)

## Troubleshooting

### Error: "program.methods.initialize_event is not a function"

**Cause:** Frontend cache belum ter-refresh setelah update IDL.

**Solution:**
```bash
cd frontend
rm -rf .next node_modules/.cache
npm run dev
```

### Error: "admin not provided"

**Cause:** IDL mismatch atau accounts structure berubah.

**Solution:**
1. Verify IDL is synced (see above)
2. Check accounts list matches smart contract
3. Ensure admin signer is included in accounts

### Error: "Transaction simulation failed"

**Possible Causes:**
- Insufficient SOL for gas
- Wrong PDA derivation
- Program account mismatch

**Debug:**
1. Check console for detailed error logs
2. Use Solana Explorer to inspect transaction
3. Verify PDAs are correctly derived

## Available Instructions

Instruksi yang tersedia di smart contract:

| IDL (snake_case) | Frontend (camelCase) | Backend (snake_case) | Description |
|------------------|---------------------|---------------------|-------------|
| `initialize_event` | `initializeEvent()` | `initialize_event()` | Buat event baru dengan vault USDC |
| `register_participant` | `registerParticipant()` | `register_participant()` | Daftar peserta ke event |
| `record_finish` | `recordFinish()` | `record_finish()` | Catat finish checkpoint |
| `process_refunds` | `processRefunds()` | `process_refunds()` | Distribusi hadiah/refund |
| `stake_event` | `stakeEvent()` | `stake_event()` | Deposit stake creator |
| `close_participant` | `closeParticipant()` | `close_participant()` | Tutup PDA participant |
| `delete_event` | `deleteEvent()` | `delete_event()` | Hapus event yang dibatalkan |
| `mint_mock_usdc` | `mintMockUsdc()` | `mint_mock_usdc()` | Mint Mock USDC untuk testing |

## Best Practices

1. **Always sync IDL** setelah rebuild smart contract
2. **Clear cache** setelah update IDL
3. **Use camelCase** di frontend, snake_case di backend
4. **Verify checksums** untuk memastikan file identik
5. **Test locally** sebelum deploy ke production

## Automated Sync (Future)

Consider adding to `package.json`:

```json
{
  "scripts": {
    "sync-idl": "cp backend/src/blockchain/solarun_temp.json frontend/lib/solarun_idl.json && echo 'IDL synced successfully'",
    "dev:clean": "npm run sync-idl && cd frontend && rm -rf .next && npm run dev"
  }
}
```

## References

- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [SolaRun Smart Contract](./contracts/programs/solarun_temp/)

---

**Last Updated:** 2026-05-11
**IDL Version:** 0.1.0
**Program Address:** E8KF9A7PiYbi3UmZTDy4RFnJYsvjmo3oQ7NwTuGzR2C8
