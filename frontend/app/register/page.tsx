"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  Loader2,
  LogIn,
  Copy,
  Check,
  Ticket,
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useEvents, useEvent } from "@/hooks/useEvent";
import { useRunners } from "@/hooks/useRunners";
import { useAuth } from "@/hooks/useAuth";
import { useBalance } from "@/hooks/useBalance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DEMO_CHIP_UIDS = [
  "CHIP_A1B2C3",
  "CHIP_D4E5F6",
  "CHIP_G7H8I9",
  "CHIP_J0K1L2",
  "CHIP_M3N4O5",
  "CHIP_P6Q7R8",
  "CHIP_S9T0U1",
  "CHIP_V2W3X4",
];

import { useProgram } from "@/hooks/useProgram";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { v4 as uuidv4 } from "uuid";

function RegisterPageContent() {
  const searchParams = useSearchParams();
  const eventIdFromUrl = searchParams.get("event");

  const { ready, authenticated, walletAddress, login } = useAuth();
  const { data: events, isLoading: eventsLoading } = useEvents();
  const { data: eventDetails, isLoading: eventDetailsLoading } = useEvent(
    eventIdFromUrl || "",
  );
  const [eventId, setEventId] = useState(eventIdFromUrl || "");
  const { data: runners } = useRunners(eventId);
  const { usdcBalance, solBalance, loading: balanceLoading } = useBalance();
  const program = useProgram();

  const [fullName, setFullName] = useState("");
  const [chipUid, setChipUid] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    eventId: string;
    txSignature?: string;
  } | null>(null);
  const [usedChips, setUsedChips] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // Dialog state
  const [dialog, setDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    type: "success" | "error" | "info" | "warning";
    onConfirm?: () => void;
    cancelText?: string;
    actionText?: string;
  }>({
    open: false,
    title: "",
    description: "",
    type: "info",
  });

  const showDialog = (
    title: string,
    description: string,
    type: "success" | "error" | "info" | "warning" = "info",
    onConfirm?: () => void,
    actionText = "OK",
    cancelText?: string,
  ) => {
    setDialog({
      open: true,
      title,
      description,
      type,
      onConfirm,
      actionText,
      cancelText,
    });
  };

  // Get current event object for status/capacity checks
  const event = eventIdFromUrl
    ? eventDetails
    : events?.find((e) => e.id === eventId);

  // Creator check — creator cannot register as a participant in their own event
  const isCreator = !!(
    walletAddress &&
    event?.creator_wallet &&
    walletAddress === event.creator_wallet
  );

  // Balance checks
  const feeRequired = event?.registration_fee_sol || 0;
  const hasEnoughUsdc = usdcBalance >= feeRequired;
  const hasEnoughSol = solBalance > 0.005; // reasonable minimum for gas
  const isBalanceSufficient = hasEnoughUsdc && hasEnoughSol;

  const canRegister =
    !isCreator &&
    event?.status === "pending" &&
    (runners?.length ?? 0) < event.max_participants &&
    isBalanceSufficient;

  // Sync eventId with URL param if it changes
  useEffect(() => {
    if (eventIdFromUrl) {
      setEventId(eventIdFromUrl);
    }
  }, [eventIdFromUrl]);

  useEffect(() => {
    if (!eventId) return;
    supabase
      .from("runners")
      .select("chip_uid")
      .eq("event_id", eventId)
      .then(({ data }) => setUsedChips(data?.map((r) => r.chip_uid) ?? []));
  }, [eventId]);

  const handleCopyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const availableChips = DEMO_CHIP_UIDS.filter(
    (uid) => !usedChips.includes(uid),
  );
  const activeEvents = events?.filter((e) => e.status === "pending") ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError("Nama lengkap harus diisi.");
      return;
    }
    if (!chipUid) {
      setError("Pilih Chip UID.");
      return;
    }
    if (!eventId) {
      setError("Pilih event terlebih dahulu.");
      return;
    }
    if (!walletAddress || !program) {
      setError("Wallet/Program belum tersedia. Coba login ulang.");
      return;
    }
    if (isCreator) {
      setError(
        "Creator event tidak dapat mendaftar sebagai peserta di eventnya sendiri.",
      );
      return;
    }

    const runnerUuid = uuidv4();
    const runnerId = runnerUuid.replace(/-/g, "");
    const blockchainEventId = eventId.replace(/-/g, "");

    setSubmitting(true);
    try {
      // 1. Prepare On-Chain Instruction
      const programId = program.programId;
      const runner = program.provider.publicKey;

      if (!runner) {
        showDialog("Error", "Provider publicKey tidak tersedia.", "error");
        setSubmitting(false);
        return;
      }

      // --- Derive PDAs ---
      const [eventPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(blockchainEventId)],
        program.programId,
      );
      const [participantPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("participant"), eventPda.toBuffer(), Buffer.from(chipUid)],
        programId,
      );

      // ============================================================
      // LOGIKA PEMERIKSAAN ON-CHAIN
      // ============================================================
      const existingAccount =
        await program.provider.connection.getAccountInfo(participantPda);

      if (existingAccount !== null) {
        // Jika accountInfo tidak null, berarti PDA ini sudah ada (sudah di-init)
        showDialog(
          "Chip Sudah Terdaftar",
          "Chip ini sudah terdaftar untuk event ini di blockchain.",
          "warning",
        );
        setSubmitting(false);
        return;
      }
      // ============================================================

      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), eventPda.toBuffer()],
        program.programId,
      );
      const [mockUsdcMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("mock_usdc_mint")],
        programId,
      );

      // Derive User ATA
      const userAta = await getAssociatedTokenAddress(mockUsdcMint, runner);

      // 2. Execute On-Chain Transaction
      const txSignature = await program.methods
        .registerParticipant(
          blockchainEventId,
          chipUid,
          runner,
          fullName.trim(),
          runnerUuid,
        )
        .accounts({
          runner,
          participant: participantPda,
          event: eventPda,
          vault: vaultPda,
          runnerTokenAccount: userAta,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      console.log("On-chain registration successful:", txSignature);

      // 3. Sync to Off-Chain (Supabase)
      const { error: insertError } = await supabase.from("runners").insert({
        id: runnerUuid,
        full_name: fullName.trim(),
        chip_uid: chipUid,
        event_id: eventId,
        wallet_address: walletAddress,
        status: "registered",
        finish_position: null,
        tx_signature: txSignature,
      });

      if (insertError) {
        const msg =
          insertError.code === "23505"
            ? "Chip UID ini sudah digunakan. Pilih chip lain."
            : `Berhasil di blockchain, tapi gagal simpan ke DB: ${insertError.message}`;
        showDialog("Error Pendaftaran", msg, "error");
        return;
      }
      setSuccess({ eventId, txSignature: txSignature });
      showDialog(
        "Pendaftaran Berhasil!",
        "Pendaftaran kamu telah berhasil diproses secara on-chain.",
        "success",
      );
    } catch (err: any) {
      console.error("Failed to register:", err);
      showDialog(
        "Pendaftaran Gagal",
        `Terjadi kesalahan: ${err.message || "Coba lagi."}`,
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Not ready ──
  if (!ready) {
    return (
      <div className="container max-w-md py-12 text-center">
        <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Not logged in ──
  if (!authenticated) {
    return (
      <div className="container max-w-md py-12">
        <Card>
          <CardContent className="pt-6 space-y-4 text-center">
            <LogIn className="w-12 h-12 mx-auto opacity-40" />
            <CardTitle>Login untuk Mendaftar</CardTitle>
            <CardDescription>
              Kamu perlu login terlebih dahulu sebelum bisa mendaftar event
              marathon.
            </CardDescription>
            <Button onClick={login} className="w-full">
              <LogIn className="w-4 h-4 mr-2" /> Login dengan Google / Email
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Form ──
  return (
    <div className="container max-w-md py-8 space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/">
          <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
        </Link>
      </Button>

      {/* ── Creator Restriction Banner ── */}
      {isCreator && event && (
        <Card className="border-2 border-orange-500/50 bg-orange-500/5">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <CardTitle className="text-base text-orange-600 dark:text-orange-400">
                  Kamu adalah Creator Event Ini
                </CardTitle>
                <CardDescription className="text-xs">
                  Creator tidak diizinkan mendaftar sebagai peserta di event
                  yang dibuatnya sendiri. Hal ini untuk menjaga fairness dan
                  kepercayaan peserta lain.
                </CardDescription>
              </div>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/event/${event.id}`}>
                ← Kembali ke Dashboard Event
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {success ? (
        <Card>
          <CardContent className="pt-6 space-y-4 text-center">
            <CheckCircle className="w-12 h-12 mx-auto text-green-500" />
            <CardTitle>Pendaftaran Berhasil! 🎉</CardTitle>
            <CardDescription>
              Ambil chip RFID kamu di lokasi race dan mulai berlari!
            </CardDescription>
            {success.txSignature && (
              <div className="p-4 mt-4 space-y-2 text-sm text-left border border-green-200 rounded-lg bg-green-50/50 dark:bg-green-950/20 dark:border-green-900">
                <div className="flex items-center gap-2 font-medium text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  <span>Pendaftaran Tersimpan On-Chain</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Biaya pendaftaran (USDC/SOL) telah berhasil ditransfer ke
                  vault smart contract.
                </p>
                <a
                  href={`https://explorer.solana.com/tx/${success.txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block w-full mt-1 font-mono text-xs text-green-600 truncate dark:text-green-400 hover:underline"
                >
                  ↗ Verifikasi di Solana Explorer
                </a>
              </div>
            )}
            <div className="flex justify-center gap-2 pt-2">
              <Button asChild>
                <Link href={`/event/${success.eventId}`}>
                  Lihat Leaderboard
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/">Kembali ke Home</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Daftar Event Marathon</CardTitle>
            <CardDescription>
              Isi form di bawah untuk mendaftarkan diri.
            </CardDescription>

            <div className="pt-4 mt-4 border-t">
              <button
                onClick={handleCopyAddress}
                className="flex items-center justify-between w-full p-2 text-left transition-colors border border-transparent rounded-md bg-secondary/50 hover:bg-secondary group hover:border-border"
                title="Salin alamat wallet"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase text-muted-foreground font-bold leading-none mb-1">
                    Your Wallet
                  </span>
                  <span className="font-mono text-xs break-all text-muted-foreground group-hover:text-foreground">
                    {walletAddress}
                  </span>
                </div>
                <div className="flex-shrink-0 ml-2">
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 transition-opacity opacity-50 text-muted-foreground group-hover:text-foreground group-hover:opacity-100" />
                  )}
                </div>
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Event Information */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">Event Details</Label>
                {eventIdFromUrl ? (
                  eventDetailsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Memuat detail event...</span>
                    </div>
                  ) : eventDetails ? (
                    <div className="p-4 space-y-3 border rounded-lg bg-primary/5 border-primary/10">
                      <div className="flex items-start gap-3">
                        <div className="p-2 mt-1 rounded-md bg-primary/10">
                          <Ticket className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold leading-tight">
                            {eventDetails.name}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                            {eventDetails.description || "Tidak ada deskripsi."}
                          </p>
                        </div>
                      </div>
                      <Separator className="bg-primary/10" />
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Biaya Registrasi
                        </span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          {eventDetails.registration_fee_sol} USDC
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-destructive">
                      Event tidak ditemukan.
                    </p>
                  )
                ) : (
                  <div className="space-y-2">
                    {eventsLoading ? (
                      <p className="text-sm text-muted-foreground">
                        Memuat events...
                      </p>
                    ) : activeEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Tidak ada event aktif saat ini.
                      </p>
                    ) : (
                      <Select
                        value={eventId}
                        onValueChange={(v) => {
                          setEventId(v);
                          setChipUid("");
                          setError(null);
                        }}
                      >
                        <SelectTrigger id="event_id">
                          <SelectValue placeholder="Pilih event..." />
                        </SelectTrigger>
                        <SelectContent>
                          {activeEvents.map((event) => (
                            <SelectItem key={event.id} value={event.id}>
                              {event.name} ({event.registration_fee_sol} USDC)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>

              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="full_name">Nama Lengkap</Label>
                <Input
                  id="full_name"
                  placeholder="Your Name"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setError(null);
                  }}
                  disabled={submitting}
                  autoComplete="name"
                />
              </div>

              {/* Chip UID */}
              <div className="space-y-2">
                <Label htmlFor="chip_uid">Chip RFID UID</Label>
                <Select
                  value={chipUid}
                  onValueChange={(v) => {
                    setChipUid(v);
                    setError(null);
                  }}
                  disabled={!eventId}
                >
                  <SelectTrigger id="chip_uid">
                    <SelectValue
                      placeholder={
                        !eventId ? "Pilih event dulu" : "Pilih Chip UID..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableChips.map((uid) => (
                      <SelectItem key={uid} value={uid}>
                        {uid}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Chip ini digunakan untuk identifikasi di setiap checkpoint.
                  {eventId && ` (${availableChips.length} tersedia)`}
                </p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              {event && event.status === "pending" && !isBalanceSufficient && (
                <div className="p-3 text-sm border rounded-lg bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-300">
                  <p className="font-semibold mb-1">⚠️ Saldo Tidak Mencukupi</p>
                  <ul className="list-disc pl-4 space-y-1 text-xs">
                    {!hasEnoughUsdc && (
                      <li>
                        Saldo Mock USDC: {usdcBalance.toFixed(2)} (Butuh{" "}
                        {feeRequired})
                      </li>
                    )}
                    {!hasEnoughSol && (
                      <li>
                        Saldo SOL (Gas): {solBalance.toFixed(3)} (Butuh &gt;
                        0.005 SOL)
                      </li>
                    )}
                  </ul>
                  <p className="mt-2 text-xs opacity-80">
                    Gunakan tombol "Faucet USDC" di menu atas jika butuh Mock
                    USDC.
                  </p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={
                  !canRegister ||
                  submitting ||
                  eventsLoading ||
                  (eventIdFromUrl ? !eventDetails : activeEvents.length === 0)
                }
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                    Mendaftarkan...
                  </>
                ) : event &&
                  runners &&
                  runners.length >= event.max_participants ? (
                  "Event Full"
                ) : event?.status !== "pending" &&
                  event?.status !== undefined ? (
                  "Registration Closed"
                ) : !isBalanceSufficient && event ? (
                  "Saldo Kurang"
                ) : (
                  "Daftar Sekarang"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              {dialog.type === "success" && (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              {dialog.type === "error" && (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
              {dialog.type === "warning" && (
                <AlertCircle className="h-5 w-5 text-orange-500" />
              )}
              {dialog.type === "info" && (
                <Info className="h-5 w-5 text-blue-500" />
              )}
              <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              {dialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {dialog.cancelText && (
              <AlertDialogCancel>{dialog.cancelText}</AlertDialogCancel>
            )}
            <AlertDialogAction onClick={() => dialog.onConfirm?.()}>
              {dialog.actionText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="container max-w-md py-12 text-center">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
        </div>
      }
    >
      <RegisterPageContent />
    </Suspense>
  );
}
