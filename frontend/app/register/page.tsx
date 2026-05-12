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
  const [rfidUid, setRfidUid] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{
    eventId: string;
    txSignature?: string;
  } | null>(null);
  const [usedRfids, setUsedRfids] = useState<string[]>([]);
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
      .select("rfid_uid")
      .eq("event_id", eventId)
      .then(({ data }) => setUsedRfids(data?.map((r) => r.rfid_uid) ?? []));
  }, [eventId]);

  const handleCopyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const availableChips = DEMO_CHIP_UIDS.filter(
    (uid) => !usedRfids.includes(uid),
  );
  const activeEvents = events?.filter((e) => e.status === "pending") ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || fullName.length !== 4) {
      showDialog(
        "Validation Error",
        "Please enter exactly a 4-character name.",
        "error",
      );
      return;
    }
    if (usedRfids.includes(fullName)) {
      showDialog(
        "Validation Error",
        "This name is already registered for this event. Please choose another 4-character name.",
        "error",
      );
      return;
    }
    if (!eventId) {
      showDialog("Validation Error", "Please select an event first.", "error");
      return;
    }
    if (!walletAddress || !program) {
      showDialog(
        "Error",
        "Wallet/Program not available. Please log in again.",
        "error",
      );
      return;
    }
    if (isCreator) {
      showDialog(
        "Error",
        "Event creators cannot register as participants in their own event.",
        "error",
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
        showDialog("Error", "Provider publicKey not available.", "error");
        setSubmitting(false);
        return;
      }

      // --- Derive PDAs ---
      const [eventPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(blockchainEventId)],
        program.programId,
      );
      const [participantPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("participant"), eventPda.toBuffer(), Buffer.from(rfidUid)],
        programId,
      );

      // ============================================================
      // LOGIKA PEMERIKSAAN ON-CHAIN
      // ============================================================
      const existingAccount =
        await program.provider.connection.getAccountInfo(participantPda);

      if (existingAccount !== null) {
        showDialog(
          "Chip Already Registered",
          "This chip is already registered for this event on the blockchain.",
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
      // Note: Anchor auto-converts snake_case to camelCase in TypeScript
      const txSignature = await program.methods
        .registerParticipant(
          blockchainEventId,
          rfidUid,
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
        rfid_uid: rfidUid,
        event_id: eventId,
        wallet_address: walletAddress,
        status: "registered",
        finish_position: null,
        tx_signature: txSignature,
      });

      if (insertError) {
        const msg =
          insertError.code === "23505"
            ? "Chip UID already in use. Please select a different chip."
            : `Saved on-chain, but failed to save to DB: ${insertError.message}`;
        showDialog("Registration Error", msg, "error");
        return;
      }
      setSuccess({ eventId, txSignature: txSignature });
      showDialog(
        "Registration Successful!",
        "Your registration has been processed on-chain.",
        "success",
      );
    } catch (err: any) {
      console.error("Failed to register:", err);
      showDialog(
        "Registration Failed",
        `An error occurred: ${err.message || "Please try again."}`,
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
            <CardTitle>Login to Register</CardTitle>
            <CardDescription>
              You need to log in before you can register for a marathon event.
            </CardDescription>
            <Button onClick={login} className="w-full">
              <LogIn className="w-4 h-4 mr-2" /> Login with Google / Email
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
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
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
                  You are the Creator of This Event
                </CardTitle>
                <CardDescription className="text-xs">
                  Creators are not allowed to register as participants in their
                  own events. This ensures fairness and trust for all other
                  participants.
                </CardDescription>
              </div>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/event/${event.id}`}>← Back to Event Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {success ? (
        <Card>
          <CardContent className="pt-6 space-y-4 text-center">
            <CheckCircle className="w-12 h-12 mx-auto text-green-500" />
            <CardTitle>Registration Successful! 🎉</CardTitle>
            <CardDescription>
              Pick up your RFID chip at the race location and start running!
            </CardDescription>
            {success.txSignature && (
              <div className="p-4 mt-4 space-y-2 text-sm text-left border border-green-200 rounded-lg bg-green-50/50 dark:bg-green-950/20 dark:border-green-900">
                <div className="flex items-center gap-2 font-medium text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  <span>Registration Saved On-Chain</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Registration fee (USDC/SOL) has been successfully transferred
                  to the smart contract vault.
                </p>
                <a
                  href={`https://explorer.solana.com/tx/${success.txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block w-full mt-1 font-mono text-xs text-green-600 truncate dark:text-green-400 hover:underline"
                >
                  ↗ Verify on Solana Explorer
                </a>
              </div>
            )}
            <div className="flex justify-center gap-2 pt-2">
              <Button asChild>
                <Link href={`/event/${success.eventId}`}>View Leaderboard</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/">Back to Home</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Register for Marathon Event</CardTitle>
            <CardDescription>
              Fill in the form below to register.
            </CardDescription>

            <div className="pt-4 mt-4 border-t">
              <button
                onClick={handleCopyAddress}
                className="flex items-center justify-between w-full p-2 text-left transition-colors border border-transparent rounded-md bg-secondary/50 hover:bg-secondary group hover:border-border"
                title="Copy wallet address"
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
                            {eventDetails.description || "No description."}
                          </p>
                        </div>
                      </div>
                      <Separator className="bg-primary/10" />
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Registration Fee
                        </span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          {eventDetails.registration_fee_sol} USDC
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-destructive">Event not found.</p>
                  )
                ) : (
                  <div className="space-y-2">
                    {eventsLoading ? (
                      <p className="text-sm text-muted-foreground">
                        Loading events...
                      </p>
                    ) : activeEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No active events at the moment.
                      </p>
                    ) : (
                      <Select
                        value={eventId}
                        onValueChange={(v) => {
                          setEventId(v);
                          setRfidUid("");
                        }}
                      >
                        <SelectTrigger id="event_id">
                          <SelectValue placeholder="Select an event..." />
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

              {/* Full Name / RFID ID */}
              <div className="space-y-2">
                <Label htmlFor="full_name">Participant Name (Exactly 4 Characters)</Label>
                <Input
                  id="full_name"
                  placeholder="e.g. Budi"
                  value={fullName}
                  maxLength={4}
                  onChange={(e) => {
                    const name = e.target.value;
                    setFullName(name);
                    setRfidUid(name); // Name is the Chip UID
                  }}
                  disabled={submitting}
                  autoComplete="name"
                />
                <p className="text-xs text-muted-foreground">
                  Your name will be used as your RFID ID. It must be exactly 4 characters and unique. (Case-sensitive)
                </p>
              </div>

              {usedRfids.includes(fullName) && fullName.length === 4 && (
                <div className="flex items-center gap-2 p-2 text-xs border rounded bg-destructive/10 border-destructive/20 text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  <span>This name is already registered for this event. Please use a slightly different name.</span>
                </div>
              )}

              {fullName.length > 0 && fullName.length !== 4 && (
                <div className="flex items-center gap-2 p-2 text-xs border rounded bg-orange-500/10 border-orange-500/20 text-orange-600 dark:text-orange-400">
                  <Info className="w-4 h-4" />
                  <span>Name must be exactly 4 characters (currently {fullName.length}).</span>
                </div>
              )}

              {event && event.status === "pending" && !isBalanceSufficient && (
                <div className="p-3 text-sm border rounded-lg bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-300">
                  <p className="font-semibold mb-1">⚠️ Insufficient Balance</p>
                  <ul className="list-disc pl-4 space-y-1 text-xs">
                    {!hasEnoughUsdc && (
                      <li>
                        Mock USDC Balance: {usdcBalance.toFixed(2)} (Need{" "}
                        {feeRequired})
                      </li>
                    )}
                    {!hasEnoughSol && (
                      <li>
                        SOL Balance (Gas): {solBalance.toFixed(3)} (Need &gt;
                        0.005 SOL)
                      </li>
                    )}
                  </ul>
                  <p className="mt-2 text-xs opacity-80">
                    Use the "Faucet USDC" button in the menu above if you need
                    Mock USDC.
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
                    Registering...
                  </>
                ) : event &&
                  runners &&
                  runners.length >= event.max_participants ? (
                  "Event Full"
                ) : event?.status !== "pending" &&
                  event?.status !== undefined ? (
                  "Registration Closed"
                ) : !isBalanceSufficient && event ? (
                  "Insufficient Balance"
                ) : (
                  "Register Now"
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
