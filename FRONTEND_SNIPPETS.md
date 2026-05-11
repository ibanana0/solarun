# Frontend Implementation Snippets

## File 1: `frontend/app/event/[id]/page.tsx`

### SNIPPET 1: Add State Variables (After line 107 - after `const [isCopied, setIsCopied]`)

```typescript
  // Deposit status state
  const [depositStatus, setDepositStatus] = useState<{
    canStart: boolean;
    requiresDeposit: boolean;
    stakeStatus: string;
    stakeAmount: number;
    depositDeadline: string | null;
    isExpired: boolean;
  } | null>(null);
  const [isCheckingDeposit, setIsCheckingDeposit] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
```

### SNIPPET 2: Add useEffect for Deposit Check (After showDialog function)

```typescript
  // Check deposit status when page loads
  useEffect(() => {
    if (event?.id && isCreator) {
      checkDepositStatus();
    }
  }, [event?.id, isCreator]);
```

### SNIPPET 3: Add Helper Functions (After isCreator declaration, before handleStartRace)

```typescript
  const checkDepositStatus = async () => {
    if (!event) return;
    
    setIsCheckingDeposit(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/events/${event.id}/deposit-status`);
      const result = await response.json();
      
      if (result.success) {
        setDepositStatus(result.data);
      }
    } catch (error) {
      console.error('Failed to check deposit status:', error);
    } finally {
      setIsCheckingDeposit(false);
    }
  };

  const handleDeposit = async () => {
    if (!event || !program || !walletAddress) return;
    
    setIsDepositing(true);
    try {
      const { useStakingAndFees } = await import('@/hooks/useStakingAndFees');
      const { executeStakeEvent } = useStakingAndFees(program);
      
      const eventId = event.id.replace(/-/g, '');
      const stakeAmount = event.stake_amount || 0;
      
      // Derive addresses
      const [eventPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('event'), Buffer.from(eventId)],
        program.programId
      );
      
      const [mockUsdcMint] = PublicKey.findProgramAddressSync(
        [Buffer.from('mock_usdc_mint')],
        program.programId
      );
      
      const { getAssociatedTokenAddress } = await import('@solana/spl-token');
      const adminTokenAccount = await getAssociatedTokenAddress(
        mockUsdcMint,
        new PublicKey(walletAddress)
      );
      
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), eventPda.toBuffer()],
        program.programId
      );
      
      // Execute stake
      const txSig = await executeStakeEvent(
        eventId,
        stakeAmount,
        adminTokenAccount,
        vaultPda,
        mockUsdcMint
      );
      
      // Update DB
      await supabase
        .from('race_events')
        .update({ stake_status: 'staked' })
        .eq('id', event.id);
      
      showDialog(
        'Deposit Berhasil',
        `Deposit ${stakeAmount} USDC berhasil! Anda sekarang bisa memulai event.\n\nTX: ${txSig.slice(0, 20)}...`,
        'success'
      );
      
      // Refresh status
      await checkDepositStatus();
      await refetchEvent();
    } catch (error: any) {
      console.error('Deposit failed:', error);
      showDialog(
        'Deposit Gagal',
        `Gagal deposit: ${error.message}`,
        'error'
      );
    } finally {
      setIsDepositing(false);
    }
  };
```

### SNIPPET 4: Update handleStartRace (REPLACE existing function)

```typescript
  const handleStartRace = async () => {
    if (!program || !event) return;
    
    // Validate deposit status first
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(
        `${apiUrl}/api/events/${event.id}/validate-start`,
        { method: 'POST' }
      );
      const result = await response.json();
      
      if (!result.can_start) {
        showDialog(
          'Tidak Bisa Start',
          result.message || 'Event belum bisa dimulai. Silakan selesaikan deposit terlebih dahulu.',
          'warning'
        );
        return;
      }
    } catch (error) {
      console.error('Validation failed:', error);
      showDialog(
        'Error',
        'Gagal validasi status event. Silakan coba lagi.',
        'error'
      );
      return;
    }
    
    // Continue with existing handleStartRace logic
    showDialog(
      "Konfirmasi Start Race",
      "Apakah Anda yakin ingin memulai perlombaan ini? Sensor RFID akan mulai menerima tap.",
      "warning",
      async () => {
        setIsStarting(true);
        try {
          const cleanEventId = event.id.replace(/-/g, "");
          const [eventPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("event"), Buffer.from(cleanEventId)],
            program.programId,
          );
          const txSignature = await program.methods
            .startRace(cleanEventId)
            .accounts({
              admin: program.provider.publicKey,
              event: eventPda,
            } as any)
            .rpc();
          console.log("Race started on-chain:", txSignature);
          await supabase
            .from("race_events")
            .update({ status: "active", start_tx_signature: txSignature })
            .eq("id", event.id);
          showDialog("Berhasil!", `Race berhasil dimulai!`, "success");
          refetchEvent();
        } catch (error: any) {
          console.error("Failed to start race:", error);
          let msg = error.message || String(error);
          if (msg.includes("was not confirmed in 30.00 seconds")) {
            try {
              const cleanEventId = event.id.replace(/-/g, "");
              const [eventPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("event"), Buffer.from(cleanEventId)],
                program.programId,
              );
              const onChainData = await program.account.event.fetch(eventPda);
              if (
                onChainData.status.active ||
                onChainData.status.completed ||
                onChainData.status.settled
              ) {
                await supabase
                  .from("race_events")
                  .update({ status: "active" })
                  .eq("id", event.id);
                showDialog(
                  "Berhasil!",
                  "Race berhasil dimulai (Berhasil di-recover dari timeout jaringan)!",
                  "success",
                );
                refetchEvent();
                return;
              }
            } catch (fallbackErr) {
              console.error("Fallback check failed:", fallbackErr);
            }
          }
          if (msg.includes("Custom: 2006")) {
            msg =
              "Data event tidak kompatibel (Error 2006). Kemungkinan event ini dibuat dengan versi contract lama. Silakan buat event baru.";
          }
          showDialog("Gagal", `Gagal memulai race: ${msg}`, "error");
        } finally {
          setIsStarting(false);
        }
      },
      "Ya, Mulai Race",
      "Batal",
    );
  };
```

### SNIPPET 5: Add Deposit UI Component (Find the START RACE button section and ADD BEFORE IT)

Search for: `{isCreator && event && event.status === 'pending' && (`
Add this BEFORE that section:

```tsx
        {/* Deposit Section (only show if creator and deposit pending) */}
        {isCreator && depositStatus?.requiresDeposit && event?.status === 'pending' && (
          <div className="mb-xl border-2 border-orange-600 bg-orange-900/10 p-lg">
            <div className="flex items-start gap-md mb-md">
              <AlertCircle className="h-6 w-6 text-orange-500 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="font-headline-md text-headline-md text-orange-400 mb-sm">
                  DEPOSIT REQUIRED
                </h3>
                <p className="font-body-sm text-on-surface-variant mb-md">
                  Event ini memerlukan deposit sebesar{' '}
                  <span className="font-bold text-orange-400">
                    {event.stake_amount} USDC
                  </span>{' '}
                  sebelum bisa dimulai.
                </p>
                
                {depositStatus.depositDeadline && (
                  <div className="bg-background/50 border border-orange-700/50 p-sm mb-md">
                    <p className="font-label-caps text-label-caps text-on-surface-variant">
                      DEADLINE: {formatDate(depositStatus.depositDeadline)}
                    </p>
                    {depositStatus.isExpired && (
                      <p className="font-body-xs text-destructive mt-xs">
                        ⚠️ Deadline sudah terlewat. Event akan dibatalkan otomatis.
                      </p>
                    )}
                  </div>
                )}
                
                <Button
                  onClick={handleDeposit}
                  disabled={isDepositing || depositStatus.isExpired}
                  className="w-full bg-orange-600 hover:bg-orange-500 text-background"
                >
                  {isDepositing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Memproses Deposit...
                    </>
                  ) : (
                    <>
                      <Coins className="mr-2 h-4 w-4" />
                      Deposit {event.stake_amount} USDC Sekarang
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
```

### SNIPPET 6: Update START RACE Button (REPLACE existing button)

Find the START RACE button and replace it with:

```tsx
        {isCreator && event && event.status === 'pending' && (
          <Button
            onClick={handleStartRace}
            disabled={
              isStarting || 
              !depositStatus?.canStart ||
              (event.stake_amount > 0 && event.stake_status !== 'staked')
            }
            className="w-full bg-green-600 hover:bg-green-500 text-background font-headline-sm py-lg border-2 border-green-500"
          >
            {isStarting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                MEMULAI RACE...
              </>
            ) : depositStatus?.canStart ? (
              <>
                <PlayCircle className="mr-2 h-5 w-5" />
                START RACE
              </>
            ) : (
              <>
                <AlertCircle className="mr-2 h-5 w-5" />
                DEPOSIT REQUIRED FIRST
              </>
            )}
          </Button>
        )}
```

### SNIPPET 7: Add Missing Import (At the top with other imports)

```typescript
import { useEffect } from "react";
import { Coins } from "lucide-react"; // Add Coins to existing lucide-react import
```

---

## File 2: `frontend/app/creator/create/page.tsx`

### SNIPPET 8: Update Supabase Insert (Find the `await supabase.from('race_events').insert()` section)

FIND this part in the handleSubmit function (around line 190-220):

```typescript
const stakeAmount = parseFloat(stakeAmountUsdc);

// Sync to Supabase
const { data, error: insertError } = await supabase
    .from('race_events')
    .insert({
```

And UPDATE the insert object to include:

```typescript
      const stakeAmount = parseFloat(stakeAmountUsdc);

      // Calculate deposit deadline (24 hours before start time)
      const depositDeadline = stakeAmount > 0 
        ? new Date(startDateTime.getTime() - 24 * 60 * 60 * 1000)
        : null;

      // Sync to Supabase
      const { data, error: insertError } = await supabase
        .from("race_events")
        .insert({
          id: rawUuid,
          name: name.trim(),
          description: description.trim() || null,
          location_name: locationName.trim() || null,
          registration_fee_sol: fee,
          max_participants: max,
          status: "pending",
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          creator_wallet: walletAddress,
          tx_signature: txSignature,
          vault_address: vaultPda.toBase58(),
          checkpoints_config:
            checkpointsConfig.length > 0 ? checkpointsConfig : null,
          route_coordinates:
            routeCoordinates.length > 0 ? routeCoordinates : null,
          route_distance_meters:
            routeDistanceMeters > 0 ? routeDistanceMeters : null,
          stake_amount: stakeAmount > 0 ? stakeAmount : 0,
          stake_status: "pending",
          deposit_deadline: depositDeadline ? depositDeadline.toISOString() : null, // NEW LINE
          protocol_fee_bps: PROTOCOL_FEE_BPS,
          is_completed: false,
          treasury_fee_collected: 0,
        })
        .select("id, name, tx_signature")
        .single();
```

---

## Implementation Instructions

1. Open `frontend/app/event/[id]/page.tsx`
2. Add snippets 1-7 in order (follow the comments for placement)
3. Open `frontend/app/creator/create/page.tsx`
4. Add snippet 8 (update the insert statement)
5. Save all files
6. Restart frontend dev server

**Total time:** ~10 minutes copy-paste

---

**Status:** All code snippets ready to implement!
