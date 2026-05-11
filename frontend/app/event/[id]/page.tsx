"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  PlayCircle,
  CheckCircle2,
  Copy,
  Check,
  AlertCircle,
  Info,
  ChevronRight,
  Calendar,
  MapPin,
  Map,
  ExternalLink,
} from "lucide-react";
import { useEvent } from "@/hooks/useEvent";
import { useRunners } from "@/hooks/useRunners";
import { useAuth } from "@/hooks/useAuth";
import { useProgram } from "@/hooks/useProgram";
import { supabase } from "@/lib/supabase";
import { PublicKey } from "@solana/web3.js";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import dynamic from "next/dynamic";
const RouteViewer = dynamic(() => import("@/components/RouteViewer"), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] w-full animate-pulse bg-muted flex items-center justify-center border-2 border-primary">
      <p className="font-mono text-muted-foreground">Memuat Peta...</p>
    </div>
  ),
});
import { Button } from "@/components/ui/button";
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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr);
  return (
    d
      .toLocaleDateString("en-US", { month: "short", day: "2-digit" })
      .toUpperCase() +
    " // " +
    d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) +
    " WIB"
  );
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "PENDING",
    active: "LIVE",
    completed: "COMPLETED",
    settled: "SETTLED",
    Initialized: "PENDING",
    Active: "LIVE",
    Completed: "COMPLETED",
    Settled: "SETTLED",
  };
  return map[status] ?? status.toUpperCase();
}

function isLive(status: string) {
  return status === "active" || status === "Active";
}

export default function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const {
    data: event,
    isLoading: eventLoading,
    error: eventError,
    refetch: refetchEvent,
  } = useEvent(id);
  const { data: runners, isLoading: runnersLoading } = useRunners(id);
  const { walletAddress } = useAuth();
  const program = useProgram();

  const [isStarting, setIsStarting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

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

  const isCreator = walletAddress === event?.creator_wallet;

  const handleStartRace = async () => {
    if (!program || !event) return;
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

  const handleFinalize = async () => {
    if (!program || !event) return;
    showDialog(
      "Konfirmasi Finalisasi",
      "Apakah Anda yakin ingin memfinalisasi event? Ini akan memicu pembagian hadiah otomatis.",
      "warning",
      async () => {
        setIsFinalizing(true);
        try {
          const cleanEventId = event.id.replace(/-/g, "");
          const [eventPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("event"), Buffer.from(cleanEventId)],
            program.programId,
          );
          const txSignature = await program.methods
            .completeRace(cleanEventId)
            .accounts({
              admin: program.provider.publicKey,
              event: eventPda,
            } as any)
            .rpc();
          console.log("Race completed on-chain:", txSignature);
          await supabase
            .from("race_events")
            .update({ status: "completed", finalize_tx_signature: txSignature })
            .eq("id", event.id);
          await supabase
            .from("runners")
            .update({ status: "disqualified" })
            .eq("event_id", event.id)
            .neq("status", "finished");
          showDialog(
            "Berhasil!",
            `Event berhasil difinalisasi!\nPeserta yang belum finish telah dinyatakan DNF.\nSistem akan mulai membagikan hadiah.\n\nTX: ${txSignature}`,
            "success",
          );
          refetchEvent();
        } catch (error: any) {
          console.error("Failed to finalize race:", error);
          let msg = error.message || String(error);
          if (msg.includes("was not confirmed in 30.00 seconds")) {
            try {
              const cleanEventId = event.id.replace(/-/g, "");
              const [eventPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("event"), Buffer.from(cleanEventId)],
                program.programId,
              );
              const onChainData = await program.account.event.fetch(eventPda);
              if (onChainData.status.completed || onChainData.status.settled) {
                await supabase
                  .from("race_events")
                  .update({ status: "completed" })
                  .eq("id", event.id);
                await supabase
                  .from("runners")
                  .update({ status: "disqualified" })
                  .eq("event_id", event.id)
                  .neq("status", "finished");
                showDialog(
                  "Berhasil!",
                  "Event berhasil difinalisasi (Berhasil di-recover dari timeout jaringan)!",
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
          showDialog("Gagal", `Gagal finalisasi race: ${msg}`, "error");
        } finally {
          setIsFinalizing(false);
        }
      },
      "Ya, Finalisasi",
      "Batal",
    );
  };

  const totalRunners = runners?.length ?? 0;
  const finishedCount =
    runners?.filter((r) => r.status === "finished").length ?? 0;
  const runningCount =
    runners?.filter((r) => r.status === "running").length ?? 0;
  const poolSize = totalRunners * (event?.registration_fee_sol ?? 0);

  /* ── Loading State ──────────────────────────────────────────── */
  if (eventLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <Loader2 className="h-12 w-12 animate-spin mb-4" />
        <p className="font-label-caps text-label-caps uppercase">
          SYNCING_EVENT_DATA...
        </p>
      </div>
    );
  }

  /* ── Error State ─────────────────────────────────────────────── */
  if (eventError || !event) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <p className="text-destructive font-label-caps text-label-caps uppercase">
          EVENT_NOT_FOUND
        </p>
        <Button
          asChild
          variant="outline"
          className="rounded-none border-2 border-primary font-label-caps text-label-caps"
        >
          <Link href="/">← BACK TO RACES</Link>
        </Button>
      </div>
    );
  }

  const isEventOpen = event.status === "pending";
  const statusLabel = getStatusLabel(event.status);
  const live = isLive(event.status);

  return (
    <div className="bg-background text-on-background selection:bg-primary selection:text-background min-h-screen flex flex-col">
      <main className="flex-grow px-margin py-xl max-w-screen-2xl mx-auto w-full">
        {/* ── Breadcrumbs & Event Info ───────────────────────── */}
        <div className="mb-lg flex flex-col md:flex-row md:items-end justify-between gap-md">
          <div>
            <nav className="flex items-center gap-sm font-label-caps text-label-caps text-on-surface-variant mb-xs">
              <Link href="/" className="hover:text-primary transition-none">
                RACES
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-primary">{event.name.toUpperCase()}</span>
            </nav>
            <div className="flex items-center gap-gutter flex-wrap">
              <h1 className="font-headline-lg text-headline-lg uppercase">
                {event.name.toUpperCase()}
              </h1>
              <div
                className={`border-2 border-primary px-sm py-xs flex items-center gap-xs ${live ? "" : "opacity-60"}`}
              >
                {live && (
                  <span className="w-2 h-2 bg-primary block animate-pulse" />
                )}
                <span className="font-label-caps text-label-caps">
                  {statusLabel}
                </span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(event.id);
                  setIsCopied(true);
                  setTimeout(() => setIsCopied(false), 2000);
                }}
                className="border-2 border-primary/20 hover:border-primary px-sm py-xs flex items-center gap-xs transition-none"
                title="Copy Event ID"
              >
                {isCopied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3 opacity-50" />
                )}
                <span className="font-label-caps text-[10px]">
                  {isCopied ? "COPIED" : "COPY_ID"}
                </span>
              </button>
            </div>
            <div className="flex items-center gap-sm mt-sm">
              <p className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDateShort(event.start_time)}
              </p>
              {event.location_name && (
                <>
                  <span className="text-on-surface-variant/30">|</span>
                  <p className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {event.location_name}
                  </p>
                </>
              )}
            </div>
            {event.checkpoints_config &&
              event.checkpoints_config.length > 0 && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${event.checkpoints_config[0].lat},${event.checkpoints_config[0].lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-xs font-label-caps text-[10px] text-green-400 hover:text-green-300 border border-green-800 px-sm py-xs transition-none mt-sm"
                >
                  <Map className="h-3.5 w-3.5" />
                  VIEW ON GOOGLE MAPS
                </a>
              )}
            <div className="mt-sm flex gap-sm flex-wrap">
              {event.tx_signature && (
                <a
                  href={`https://explorer.solana.com/tx/${event.tx_signature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-xs font-label-caps text-[10px] text-blue-400 hover:text-blue-300 border border-blue-800 px-sm py-xs transition-none"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  INIT TX
                </a>
              )}
              {event.start_tx_signature && (
                <a
                  href={`https://explorer.solana.com/tx/${event.start_tx_signature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-xs font-label-caps text-[10px] text-orange-400 hover:text-orange-300 border border-orange-800 px-sm py-xs transition-none"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  START TX
                </a>
              )}
              {event.finalize_tx_signature && (
                <a
                  href={`https://explorer.solana.com/tx/${event.finalize_tx_signature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-xs font-label-caps text-[10px] text-purple-400 hover:text-purple-300 border border-purple-800 px-sm py-xs transition-none"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  FINALIZE TX
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ── Prize Pool Banner ──────────────────────────────── */}
        <section className="border-2 border-primary p-lg mb-xl flex flex-col md:flex-row justify-between items-center gap-lg">
          <div className="w-full md:w-auto">
            <p className="font-label-caps text-label-caps text-on-surface-variant mb-xs">
              TOTAL VAULT / PRIZE POOL
            </p>
            <div className="font-display-xl text-display-xl uppercase">
              {poolSize.toFixed(2)}{" "}
              <span className="text-on-surface-variant text-[40px]">USDC</span>
            </div>
          </div>
          <div className="w-full md:w-auto flex flex-col gap-sm">
            {isEventOpen && !isCreator && (
              <Button
                asChild
                className="w-full md:w-64 py-lg font-headline-md text-headline-md bg-primary text-background border-2 border-primary transition-none active:translate-y-1 h-auto rounded-none"
              >
                <Link href={`/register?event=${event.id}`}>REGISTER</Link>
              </Button>
            )}
            {isCreator && (
              <div className="w-full md:w-64 border-2 border-primary/40 px-sm py-xs flex items-center gap-xs bg-primary/5">
                <span className="font-label-caps text-label-caps text-primary/70 text-[10px]">
                  ⚙ YOU_ARE_THE_CREATOR
                </span>
              </div>
            )}
            {/* Creator Actions */}
            {isCreator && event.status === "pending" && (
              <Button
                onClick={handleStartRace}
                disabled={isStarting}
                className="w-full md:w-64 py-md font-label-caps text-label-caps bg-transparent text-primary border-2 border-primary hover:bg-primary hover:text-background transition-none active:translate-y-1 h-auto rounded-none"
              >
                {isStarting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="mr-2 h-4 w-4" />
                )}
                START RACE
              </Button>
            )}
            {isCreator && event.status === "active" && (
              <Button
                onClick={handleFinalize}
                disabled={isFinalizing}
                className="w-full md:w-64 py-md font-label-caps text-label-caps bg-transparent text-primary border-2 border-primary hover:bg-primary hover:text-background transition-none active:translate-y-1 h-auto rounded-none"
              >
                {isFinalizing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                FINALIZE & DISTRIBUTE
              </Button>
            )}
          </div>
        </section>

        {/* ── Main Content Split ─────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-xl">
          {/* Left: Telemetry Map */}
          <div className="md:col-span-7 flex flex-col gap-gutter">
            <div className="flex justify-between items-end border-b-2 border-primary pb-sm">
              <h2 className="font-headline-md text-headline-md">
                LIVE TELEMETRY
              </h2>
              <span className="font-label-caps text-label-caps text-on-surface-variant">
                MAP_VIEW_01 // ASYNC_UPDATES
              </span>
            </div>
            <div className="h-[500px]">
              <RouteViewer
                checkpoints={event?.checkpoints_config || []}
                routeCoordinates={event?.route_coordinates || []}
                runners={runners ?? []}
              />
            </div>
          </div>

          {/* Right: Leaderboard */}
          <div className="md:col-span-5 flex flex-col gap-gutter">
            <div className="flex justify-between items-end border-b-2 border-primary pb-sm">
              <h2 className="font-headline-md text-headline-md">LEADERBOARD</h2>
              <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-xs">
                {live && (
                  <span className="w-2 h-2 bg-primary block animate-pulse" />
                )}
                REALTIME
              </span>
            </div>
            <LeaderboardTable
              runners={runners ?? []}
              isLoading={runnersLoading}
            />
            {isEventOpen && !isCreator && (
              <Button
                asChild
                className="w-full py-md border-2 border-primary font-label-caps text-label-caps bg-transparent text-primary hover:bg-primary hover:text-on-primary transition-none active:translate-y-1 h-auto rounded-none"
              >
                <Link href={`/register?event=${event.id}`}>
                  REGISTER AS PARTICIPANT
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* ── Global Metrics Ticker ──────────────────────────── */}
        <div className="mt-xl grid grid-cols-2 md:grid-cols-4 border-2 border-primary divide-x-2 divide-primary">
          <div className="p-lg">
            <p className="font-label-caps text-label-caps text-on-surface-variant">
              TOTAL_RUNNERS
            </p>
            <p className="font-data-lg text-data-lg">{totalRunners}</p>
          </div>
          <div className="p-lg">
            <p className="font-label-caps text-label-caps text-on-surface-variant">
              FINISHED
            </p>
            <p className="font-data-lg text-data-lg">{finishedCount}</p>
          </div>
          <div className="p-lg">
            <p className="font-label-caps text-label-caps text-on-surface-variant">
              RUNNING_NOW
            </p>
            <p className="font-data-lg text-data-lg">{runningCount}</p>
          </div>
          <div className="p-lg">
            <p className="font-label-caps text-label-caps text-on-surface-variant">
              ENTRY_FEE
            </p>
            <p className="font-data-lg text-data-lg">
              {event.registration_fee_sol} USDC
            </p>
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="flex flex-col md:flex-row justify-between items-center w-full px-margin py-lg gap-gutter border-t-2 border-primary mt-xl bg-background">
        <div className="font-body-sm text-body-sm text-on-surface-variant uppercase opacity-60">
          © 2026 SOLARUN PROTOCOL // ALL PERFORMANCE DATA ON-CHAIN
        </div>
        <div className="flex gap-lg items-center flex-wrap justify-center">
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

      {/* ── Alert Dialog (unchanged logic) ────────────────────── */}
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
