"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Loader2,
  LogIn,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Info,
  ExternalLink,
  ChevronRight,
  Terminal,
  Coins,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

import { useProgram } from "@/hooks/useProgram";
import { useStakingAndFees } from "@/hooks/useStakingAndFees";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { v4 as uuidv4 } from "uuid";
import dynamic from "next/dynamic";
import StakingInfoCard from "@/components/StakingInfoCard";

const AdminMapBuilder = dynamic(() => import("@/components/AdminMapBuilder"), {
  ssr: false,
  loading: () => (
    <div className="aspect-video bg-surface-container border-2 border-primary flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
    </div>
  ),
});

export default function CreateEventPage() {
  const {
    ready,
    authenticated,
    login,
    isCreator,
    walletAddress,
    loading: authLoading,
  } = useAuth();
  const program = useProgram();
  const { executeStakeEvent, stakingLoading, stakingError } =
    useStakingAndFees(program);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [locationName, setLocationName] = useState("");
  const [feeUsdc, setFeeUsdc] = useState("10");
  const [maxParticipants, setMaxParticipants] = useState("100");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [durationHours, setDurationHours] = useState("2");
  const [disputeLockHours, setDisputeLockHours] = useState("24");
  const PROTOCOL_FEE_BPS = 500; // 5% protocol fee → goes to developer treasury
  // Stake collateral = 50% of total prize pool (fee × max participants)
  // Required to prevent event creator fraud / abandoned events.
  const STAKE_PCT = 50;
  const computedStakeUsdc = (
    ((parseFloat(feeUsdc) || 0) *
      (parseInt(maxParticipants) || 0) *
      STAKE_PCT) /
    100
  ).toFixed(2);

  // Route config – auto-updated from AdminMapBuilder
  const [checkpointsConfig, setCheckpointsConfig] = useState<any[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
  const [routeDistanceMeters, setRouteDistanceMeters] = useState<number>(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdEvent, setCreatedEvent] = useState<{
    id: string;
    name: string;
    tx_signature?: string;
    rawUuid?: string;
    eventId?: string;
    vaultPda?: string;
  } | null>(null);
  const [stakingStep, setStakingStep] = useState(false);
  const [stakeCompleted, setStakeCompleted] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!name.trim()) {
      setError("EVENT_NAME is required.");
      return;
    }
    if (!startDate || !startTime) {
      setError("GENESIS_DATE and START_TIME are required.");
      return;
    }
    if (!walletAddress || !program) {
      setError("Wallet/Program not available. Try reconnecting.");
      return;
    }

    const fee = parseFloat(feeUsdc);
    if (isNaN(fee) || fee <= 0) {
      setError("PROTOCOL_FEE must be greater than 0.");
      return;
    }

    const max = parseInt(maxParticipants);
    if (isNaN(max) || max < 2) {
      setError("MAX_PARTICIPANTS must be at least 2.");
      return;
    }

    const duration = parseFloat(durationHours);
    if (isNaN(duration) || duration <= 0) {
      setError("EVENT_DURATION must be greater than 0.");
      return;
    }

    const lockHours = parseFloat(disputeLockHours);
    if (isNaN(lockHours) || lockHours < 0) {
      setError("DISPUTE_LOCK must be 0 or more.");
      return;
    }

    const stakeAmount = parseFloat(computedStakeUsdc);

    // Build timestamps
    const startDateTime = new Date(`${startDate}T${startTime}`);
    if (isNaN(startDateTime.getTime())) {
      setError("Invalid date/time format.");
      return;
    }

    if (startDateTime.getTime() < Date.now()) {
      setError("Start time must be in the future.");
      return;
    }

    const endDateTime = new Date(
      startDateTime.getTime() + duration * 60 * 60 * 1000,
    );
    const rawUuid = uuidv4();
    const eventId = rawUuid.replace(/-/g, "");

    setSubmitting(true);
    try {
      const programId = program.programId;
      // Robustly get the admin public key from the walletAddress string
      const admin = new PublicKey(walletAddress);

      // Derive PDAs
      const [eventPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(eventId)],
        programId,
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), eventPda.toBuffer()],
        programId,
      );
      const [mockUsdcMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("mock_usdc_mint")],
        programId,
      );

      console.log("Creating event with:", {
        eventId,
        max,
        fee: fee * 1_000_000,
        start: Math.floor(startDateTime.getTime() / 1000),
        end: Math.floor(endDateTime.getTime() / 1000),
        lock: lockHours * 3600,
        admin: admin.toBase58(),
      });

      // Execute On-Chain Transaction
      // Note: Anchor auto-converts snake_case to camelCase in TypeScript
      const method = (program.methods as any).initializeEvent(
        eventId,
        new anchor.BN(max),
        new anchor.BN(fee * 1_000_000),
        new anchor.BN(Math.floor(startDateTime.getTime() / 1000)),
        new anchor.BN(Math.floor(endDateTime.getTime() / 1000)),
        new anchor.BN(Math.floor(lockHours * 3600)), // 6th argument: dispute_lock_seconds
      );

      const txSignature = await method
        .accounts({
          admin: admin,
          event: eventPda,
          vault: vaultPda,
          mockUsdcMint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      console.log("On-chain event initialized:", txSignature);

      const stakeAmount = parseFloat(computedStakeUsdc);

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
          protocol_fee_bps: PROTOCOL_FEE_BPS,
          is_completed: false,
          treasury_fee_collected: 0,
        })
        .select("id, name, tx_signature")
        .single();

      if (insertError) {
        showDialog(
          "DB_ERROR",
          `On-chain success, but failed to sync to database: ${insertError.message}`,
          "error",
        );
        return;
      }

      setCreatedEvent({
        ...data,
        rawUuid,
        eventId,
        vaultPda: vaultPda.toBase58(),
      });

      if (stakeAmount > 0) {
        setStakingStep(true);
        showDialog(
          "EVENT_DEPLOYED",
          `Event "${data.name}" initialized on-chain.\n\nNext step: Deposit your stake of ${computedStakeUsdc} USDC to activate.`,
          "success",
        );
      } else {
        showDialog(
          "EVENT_DEPLOYED",
          `Event "${data.name}" has been successfully initialized on-chain.`,
          "success",
        );
      }
    } catch (err: any) {
      console.error("Failed to create event:", err);

      // Extract meaningful error information from the opaque object
      let errMsg = "Unknown error";
      if (err instanceof Error) {
        errMsg = err.message;
      } else if (err && typeof err === "object") {
        errMsg = JSON.stringify(err, Object.getOwnPropertyNames(err));
      }

      const friendlyMsg = errMsg.includes("insufficient funds")
        ? "Insufficient SOL for gas fees. Please fund your wallet."
        : errMsg.includes("User rejected")
          ? "Transaction was rejected by user."
          : `Transaction error: ${errMsg}`;
      showDialog("DEPLOY_FAILED", friendlyMsg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading auth state ──
  if (!ready || authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-on-surface-variant">
        <Loader2 className="h-12 w-12 animate-spin mb-4" />
        <p className="font-label-caps text-label-caps uppercase">
          SYNCING_AUTH_STATE...
        </p>
      </div>
    );
  }

  // ── Not logged in ──
  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-margin">
        <LogIn className="h-16 w-16 opacity-30" />
        <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">
          AUTHENTICATION_REQUIRED
        </p>
        <button
          onClick={login}
          className="border-2 border-primary px-xl py-md font-label-caps text-label-caps hover:bg-primary hover:text-background transition-none"
        >
          CONNECT WALLET
        </button>
      </div>
    );
  }

  // ── Stake Deposit Handler ──
  const handleStakeDeposit = async () => {
    if (
      !createdEvent?.eventId ||
      !createdEvent?.vaultPda ||
      !program ||
      !walletAddress
    )
      return;
    setSubmitting(true);
    try {
      const programId = program.programId;
      const admin = new PublicKey(walletAddress);
      const [mockUsdcMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("mock_usdc_mint")],
        programId,
      );
      const adminTokenAccount = await getAssociatedTokenAddress(
        mockUsdcMint,
        admin,
      );
      const vaultPubkey = new PublicKey(createdEvent.vaultPda);

      const txSig = await executeStakeEvent(
        createdEvent.eventId,
        parseFloat(computedStakeUsdc),
        adminTokenAccount,
        vaultPubkey,
        mockUsdcMint,
      );

      // Update stake_status in Supabase
      await supabase
        .from("race_events")
        .update({ stake_status: "staked" })
        .eq("id", createdEvent.id);

      setStakeCompleted(true);
      setStakingStep(false);
      showDialog(
        "STAKE_DEPOSITED",
        `Stake of ${computedStakeUsdc} USDC deposited successfully.\n\nTx: ${txSig?.slice(0, 20)}...`,
        "success",
      );
    } catch (err: any) {
      console.error("Stake deposit failed:", err);
      const errMsg = err?.message || "Unknown error";
      const friendlyMsg = errMsg.includes("insufficient")
        ? "Insufficient USDC balance. Use the Faucet to mint Mock USDC first."
        : errMsg.includes("User rejected")
          ? "Transaction was rejected by user."
          : `Stake deposit error: ${errMsg}`;
      showDialog("STAKE_FAILED", friendlyMsg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success state (with optional staking step) ──
  if (createdEvent) {
    return (
      <div className="bg-background text-on-background min-h-screen flex flex-col">
        <main className="flex-grow px-margin py-xl max-w-7xl mx-auto w-full flex flex-col items-center justify-center gap-xl">
          <div className="border-2 border-primary p-xl text-center space-y-lg max-w-xl w-full">
            {stakingStep && !stakeCompleted ? (
              <>
                <Coins className="h-16 w-16 text-orange-500 mx-auto" />
                <h1 className="font-headline-lg text-headline-lg uppercase">
                  DEPOSIT_STAKE
                </h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant uppercase">
                  Event &quot;{createdEvent.name}&quot; created. Deposit your
                  stake to activate.
                </p>
                <div className="bg-orange-900/20 border border-orange-700 p-md text-left space-y-xs">
                  <p className="font-label-caps text-label-caps text-orange-500">
                    STAKE_AMOUNT
                  </p>
                  <p className="font-data-lg text-orange-400">
                    {computedStakeUsdc} USDC
                  </p>
                  <p className="font-body-xs text-on-surface-variant">
                    This collateral is locked until event completion.
                  </p>
                </div>
                <button
                  onClick={handleStakeDeposit}
                  disabled={submitting || stakingLoading}
                  className="w-full bg-orange-600 text-background py-md font-label-caps text-label-caps hover:bg-orange-500 transition-none uppercase disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-sm"
                >
                  {submitting || stakingLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> DEPOSITING
                      STAKE...
                    </>
                  ) : (
                    <>
                      <Coins className="h-4 w-4" /> DEPOSIT {computedStakeUsdc}{" "}
                      USDC STAKE
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setStakingStep(false);
                  }}
                  className="w-full border border-primary/40 py-sm font-label-caps text-label-caps text-on-surface-variant hover:border-primary transition-none uppercase text-xs"
                >
                  SKIP FOR NOW
                </button>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
                <h1 className="font-headline-lg text-headline-lg uppercase">
                  EVENT_DEPLOYED
                </h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant uppercase">
                  {createdEvent.name} has been successfully initialized
                  on-chain.
                  {stakeCompleted && " Stake deposited ✓"}
                </p>
                <p className="font-body-sm text-xs text-on-surface-variant font-mono break-all">
                  ID: {createdEvent.id}
                </p>
                {createdEvent.tx_signature && (
                  <a
                    href={`https://explorer.solana.com/tx/${createdEvent.tx_signature}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-xs font-label-caps text-[10px] text-blue-400 hover:text-blue-300 border border-blue-800 px-sm py-xs transition-none"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    VERIFY ON BLOCKSCAN
                  </a>
                )}
                <div className="flex gap-gutter justify-center pt-md">
                  <Link
                    href={`/event/${createdEvent.id}`}
                    className="border-2 border-primary px-lg py-sm font-label-caps text-label-caps hover:bg-primary hover:text-background transition-none"
                  >
                    VIEW EVENT
                  </Link>
                  <Link
                    href="/creator"
                    className="border-2 border-primary/40 px-lg py-sm font-label-caps text-label-caps text-on-surface-variant hover:border-primary transition-none"
                  >
                    DASHBOARD
                  </Link>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── Main Form ──
  return (
    <div className="bg-background text-on-background selection:bg-primary selection:text-background min-h-screen flex flex-col">
      <main className="flex-grow px-margin py-xl max-w-7xl mx-auto w-full">
        {/* Hero Section */}
        <div className="mb-xl">
          <nav className="flex items-center gap-sm font-label-caps text-label-caps text-on-surface-variant mb-md">
            <Link
              href="/creator"
              className="hover:text-primary transition-none"
            >
              DASHBOARD
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-primary">CREATE_EVENT</span>
          </nav>
          <h1 className="font-display-xl text-display-xl uppercase leading-[0.8] mb-md">
            DEPLOY_NEW
            <br />
            _PROTOCOL
          </h1>
          <div className="flex items-center gap-sm flex-wrap">
            <div className="bg-primary text-background px-md py-xs font-label-caps text-label-caps">
              STABLE_VERSION_2.5.0
            </div>
            <div className="border-2 border-primary px-md py-xs font-label-caps text-label-caps">
              ON-CHAIN_VERIFIED
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-xl">
            {/* ── Left Column: Primary Config ────────────────── */}
            <div className="lg:col-span-7 space-y-xl">
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
                {/* Creator Address */}
                <div className="flex flex-col gap-sm lg:col-span-2">
                  <Label className="font-label-caps text-label-caps text-on-surface-variant">
                    CREATOR_ADDRESS
                  </Label>
                  <Input
                    className="w-full border-2 border-outline-variant bg-transparent p-md h-auto font-body-sm text-on-surface-variant cursor-not-allowed rounded-none"
                    readOnly
                    type="text"
                    value={walletAddress ?? "LOADING..."}
                  />
                </div>

                {/* Event Name */}
                <div className="flex flex-col gap-sm">
                  <Label className="font-label-caps text-label-caps">
                    EVENT_NAME
                  </Label>
                  <Input
                    className="w-full border-2 border-primary bg-transparent p-md h-auto font-body-lg text-primary focus:border-primary focus:outline-none rounded-none"
                    placeholder="ENTER_RACE_IDENTIFIER"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError(null);
                    }}
                    disabled={submitting}
                  />
                </div>

                {/* Event Location */}
                <div className="flex flex-col gap-sm">
                  <Label className="font-label-caps text-label-caps">
                    LOCATION_NAME
                  </Label>
                  <Input
                    className="w-full border-2 border-primary bg-transparent p-md h-auto font-body-lg text-primary focus:border-primary focus:outline-none rounded-none"
                    placeholder="E.G. MONAS, JAKARTA"
                    type="text"
                    value={locationName}
                    onChange={(e) => {
                      setLocationName(e.target.value);
                      setError(null);
                    }}
                    disabled={submitting}
                  />
                </div>

                {/* Race Specifications */}
                <div className="flex flex-col gap-sm lg:col-span-2">
                  <Label className="font-label-caps text-label-caps">
                    RACE_SPECIFICATIONS
                  </Label>
                  <Textarea
                    className="w-full border-2 border-primary bg-transparent p-md font-body-sm text-primary focus:border-primary focus:outline-none resize-none rounded-none"
                    placeholder="DEFINE_OBJECTIVES_AND_REWARDS"
                    rows={6}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                {/* Date / Time / Duration / Lock */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter lg:col-span-2">
                  <div className="flex flex-col gap-sm">
                    <Label className="font-label-caps text-label-caps">
                      GENESIS_DATE
                    </Label>
                    <Input
                      className="w-full border-2 border-primary bg-transparent p-md h-auto font-body-sm text-primary focus:outline-none rounded-none"
                      type="date"
                      min={new Date().toISOString().split("T")[0]}
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setError(null);
                      }}
                      disabled={submitting}
                    />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <Label className="font-label-caps text-label-caps">
                      START_TIME_UTC
                    </Label>
                    <Input
                      className="w-full border-2 border-primary bg-transparent p-md h-auto font-body-sm text-primary focus:outline-none rounded-none"
                      type="time"
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value);
                        setError(null);
                      }}
                      disabled={submitting}
                    />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <Label className="font-label-caps text-label-caps">
                      EVENT_DURATION (HRS)
                    </Label>
                    <Input
                      className="w-full border-2 border-primary bg-transparent p-md h-auto font-body-sm text-primary focus:outline-none rounded-none"
                      type="number"
                      step="0.5"
                      min="0.5"
                      placeholder="2"
                      value={durationHours}
                      onChange={(e) => {
                        setDurationHours(e.target.value);
                        setError(null);
                      }}
                      disabled={submitting}
                    />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <Label className="font-label-caps text-label-caps">
                      DISPUTE_LOCK (HRS)
                    </Label>
                    <Input
                      className="w-full border-2 border-primary bg-transparent p-md h-auto font-body-sm text-primary focus:outline-none rounded-none"
                      type="number"
                      min="0"
                      placeholder="24"
                      value={disputeLockHours}
                      onChange={(e) => {
                        setDisputeLockHours(e.target.value);
                        setError(null);
                      }}
                      disabled={submitting}
                    />
                  </div>
                </div>

                {/* Fee & Max Participants */}
                <div className="grid grid-cols-2 gap-gutter lg:col-span-2">
                  <div className="flex flex-col gap-sm">
                    <Label className="font-label-caps text-label-caps">
                      PROTOCOL_FEE_USDC
                    </Label>
                    <div className="relative">
                      <Input
                        className="w-full border-2 border-primary bg-transparent p-md h-auto font-data-lg text-primary focus:outline-none rounded-none pr-xl"
                        placeholder="0.00"
                        step="0.01"
                        min="0.01"
                        type="number"
                        value={feeUsdc}
                        onChange={(e) => {
                          setFeeUsdc(e.target.value);
                          setError(null);
                        }}
                        disabled={submitting}
                      />
                      <span className="absolute right-md top-1/2 -translate-y-1/2 font-label-caps text-label-caps opacity-50">
                        USDC
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-sm">
                    <Label className="font-label-caps text-label-caps">
                      MAX_PARTICIPANTS
                    </Label>
                    <Input
                      className="w-full border-2 border-primary bg-transparent p-md h-auto font-data-lg text-primary focus:outline-none rounded-none"
                      type="number"
                      min="2"
                      placeholder="100"
                      value={maxParticipants}
                      onChange={(e) => {
                        setMaxParticipants(e.target.value);
                        setError(null);
                      }}
                      disabled={submitting}
                    />
                  </div>
                </div>

                {/* Stake Collateral — Fixed 50% of total prize pool */}
                <div className="flex flex-col gap-sm lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label className="font-label-caps text-label-caps">
                      STAKE_COLLATERAL
                    </Label>
                    <span className="font-label-caps text-[10px] bg-orange-600 text-background px-xs py-1">
                      REQUIRED · 50% PRIZE POOL
                    </span>
                  </div>

                  {/* Read-only computed display */}
                  <div className="border-2 border-orange-600 bg-orange-900/10 p-md flex items-center justify-between">
                    <div>
                      <p className="font-label-caps text-[10px] text-on-surface-variant mb-xs">
                        {STAKE_PCT}% × {feeUsdc} USDC × {maxParticipants}{" "}
                        participants
                      </p>
                      <p className="font-label-caps text-label-caps text-on-surface-variant">
                        REQUIRED_STAKE
                      </p>
                    </div>
                    <span className="font-data-lg text-orange-400">
                      {computedStakeUsdc}{" "}
                      <span className="text-orange-600 text-sm">USDC</span>
                    </span>
                  </div>

                  {/* Anti-scam warning */}
                  <div className="border border-orange-600/40 bg-orange-950/20 p-sm flex items-start gap-xs">
                    <AlertCircle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                    <p className="font-body-xs text-body-xs text-on-surface-variant">
                      Stake is locked in the smart contract until the event is
                      settled. If the event is cancelled or abandoned, the stake
                      is sent to the treasury as a penalty.
                      <span className="text-orange-400 font-semibold">
                        {" "}
                        Creator does NOT receive registration fees — only stake
                        is returned after a successful event.
                      </span>
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* ── Right Column: Geospatial Config ───────────── */}
            <div className="lg:col-span-5 space-y-xl">
              <section className="border-2 border-primary p-lg space-y-lg">
                <h3 className="font-headline-md text-headline-md border-b-2 border-primary pb-sm uppercase">
                  GEOSPATIAL_CONFIG
                </h3>
                <AdminMapBuilder
                  onRouteChange={(checkpoints, route, distance) => {
                    setCheckpointsConfig(checkpoints);
                    setRouteCoordinates(route);
                    setRouteDistanceMeters(distance);

                    // Auto-fill location if not set yet and we have a START checkpoint
                    if (checkpoints.length > 0 && !locationName) {
                      const start = checkpoints[0];
                      fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${start.lat}&lon=${start.lng}`,
                      )
                        .then((res) => res.json())
                        .then((data) => {
                          const city =
                            data.address?.city ||
                            data.address?.town ||
                            data.address?.village ||
                            data.address?.county ||
                            "";
                          const country = data.address?.country || "";
                          if (city) {
                            setLocationName(
                              `${city}${country ? `, ${country}` : ""}`.toUpperCase(),
                            );
                          }
                        })
                        .catch(() => {
                          /* ignore fetch errors */
                        });
                    }
                  }}
                  disabled={submitting}
                />
              </section>

              {/* StakingInfoCard (Phase 2.6) */}
              {parseFloat(computedStakeUsdc) > 0 && (
                <StakingInfoCard
                  stakeAmount={parseFloat(computedStakeUsdc) || 0}
                  registrationFee={parseFloat(feeUsdc) || 0}
                  maxParticipants={parseInt(maxParticipants) || 2}
                  protocolFeeBps={PROTOCOL_FEE_BPS}
                  estimatedParticipants={Math.min(
                    parseInt(maxParticipants) || 50,
                    50,
                  )}
                />
              )}
            </div>
          </div>

          {/* ── Error display ─────────────────────────────────── */}
          {error && (
            <div className="mt-lg border-2 border-error p-md flex items-center gap-sm">
              <AlertCircle className="h-4 w-4 text-error flex-shrink-0" />
              <p className="font-label-caps text-label-caps text-error">
                {error}
              </p>
            </div>
          )}

          {/* ── Primary Action ────────────────────────────────── */}
          <div className="mt-xl">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-background border-2 border-primary py-xl font-display-xl text-headline-lg hover:bg-primary hover:text-background transition-none active:translate-y-2 group flex items-center justify-between px-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{submitting ? "DEPLOYING..." : "INITIALIZE EVENT"}</span>
              {submitting ? (
                <Loader2 className="h-12 w-12 animate-spin" />
              ) : (
                <Terminal className="h-16 w-16" />
              )}
            </button>
            <p className="font-label-caps text-label-caps text-center mt-md text-on-surface-variant">
              WARNING: THIS ACTION IS IRREVERSIBLE AND WILL CONSUME SOL GAS
            </p>
          </div>
        </form>
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="bg-background border-t-2 border-primary flex flex-col md:flex-row justify-between items-center w-full px-margin py-lg gap-gutter mt-xl">
        <div className="font-headline-md text-headline-md text-primary">
          SOLARUN
        </div>
        <div className="font-body-sm text-body-sm text-on-surface-variant text-center md:text-left">
          © 2026 SOLARUN PROTOCOL // ALL PERFORMANCE DATA ON-CHAIN
        </div>
        <div className="flex gap-lg">
          <a
            className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none"
            href="#"
          >
            DOCS
          </a>
          <a
            className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none"
            href="https://github.com/Ibanana/solarun"
            target="_blank"
            rel="noreferrer"
          >
            GITHUB
          </a>
          <a
            className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none"
            href="#"
          >
            AUDIT
          </a>
          <a
            className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none"
            href="#"
          >
            PRIVACY
          </a>
        </div>
      </footer>

      {/* ── Alert Dialog ──────────────────────────────────────── */}
      <AlertDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent className="rounded-none border-2 border-primary bg-background font-space-mono">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 mb-2">
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
              <AlertDialogTitle className="font-anton uppercase tracking-widest">
                {dialog.title}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-on-surface-variant uppercase text-[12px] tracking-wider leading-relaxed whitespace-pre-line">
              {dialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 gap-4">
            {dialog.cancelText && (
              <AlertDialogCancel className="rounded-none border-2 border-primary px-8 py-2 font-label-caps text-[12px] uppercase hover:bg-primary hover:text-background transition-none">
                {dialog.cancelText}
              </AlertDialogCancel>
            )}
            <AlertDialogAction
              onClick={() => dialog.onConfirm?.()}
              className="rounded-none bg-primary text-background px-8 py-2 font-label-caps text-[12px] uppercase hover:bg-transparent hover:text-primary border-2 border-primary transition-none"
            >
              {dialog.actionText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
