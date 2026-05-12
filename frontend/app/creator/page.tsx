"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Plus,
  Trophy,
  Eye,
  ArrowLeft,
  Loader2,
  LogIn,
  ShieldAlert,
  Trash,
  CheckCircle2,
  AlertCircle,
  Info,
  DollarSign,
} from "lucide-react";
import { useCreatorEvents } from "@/hooks/useEvent";
import { useAuth } from "@/hooks/useAuth";
import { useProgram } from "@/hooks/useProgram";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { supabase } from "@/lib/supabase";
import { StatusBadge } from "@/components/StatusBadge";
import EarningsBreakdownCard from "@/components/EarningsBreakdownCard";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import type { RaceEvent } from "@/lib/supabase";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface DialogState {
  open: boolean;
  title: string;
  description: string;
  type: "success" | "error" | "info" | "warning";
  onConfirm?: () => void;
  cancelText?: string;
  actionText?: string;
}

function EventRow({
  event,
  onEventDeleted,
  showDialog,
}: {
  event: RaceEvent;
  onEventDeleted?: () => void;
  showDialog: (
    title: string,
    description: string,
    type: "success" | "error" | "info" | "warning",
    onConfirm?: () => void,
    actionText?: string,
    cancelText?: string,
  ) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteEvent = async () => {
    showDialog(
      "Delete Event",
      "Are you sure you want to delete this event? All participants will automatically receive a refund.",
      "warning",
      async () => {
        setIsDeleting(true);
        try {
          const backendUrl =
            process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
          const response = await fetch(`${backendUrl}/api/events/${event.id}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
          });

          const data = await response.json();

          if (response.ok) {
            showDialog(
              "Success!",
              `Event deleted successfully!\n\nParticipants refunded: ${data.details?.participantsRefunded || 0}`,
              "success",
              () => onEventDeleted?.(),
            );
          } else {
            showDialog(
              "Failed",
              `Failed to delete event: ${data.message}`,
              "error",
            );
          }
        } catch (error) {
          showDialog("Error", `An error occurred: ${error}`, "error");
          console.error("Delete event error:", error);
        } finally {
          setIsDeleting(false);
        }
      },
      "Yes, Delete",
      "Cancel",
    );
  };

  return (
    <TableRow>
      <TableCell className="font-medium max-w-[200px] truncate">
        {event.name}
      </TableCell>
      <TableCell>
        <StatusBadge status={event.status} />
      </TableCell>
      <TableCell className="text-right">
        {event.registration_fee_sol} SOL
      </TableCell>
      <TableCell className="text-right">{event.max_participants}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(event.start_time)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex gap-1 justify-end">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/event/${event.id}`}>
              <Eye className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDeleteEvent}
            disabled={isDeleting || event.status !== "pending"}
            title={
              event.status === "active"
                ? "Cannot delete an active event — race in progress"
                : event.status === "completed" || event.status === "settled"
                  ? "Cannot delete a completed event"
                  : "Cancel & Delete Event (refunds all participants)"
            }
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash className="h-4 w-4" />
            )}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function CreatorDashboard() {
  const {
    ready,
    authenticated,
    login,
    isCreator,
    walletAddress,
    loading: authLoading,
  } = useAuth();
  const {
    data: events,
    isLoading,
    error,
    refetch,
  } = useCreatorEvents(walletAddress);
  const program = useProgram();

  const totalEvents = events?.length ?? 0;
  const activeEvents = events?.filter((e) => e.status === "active").length ?? 0;
  const completedEvents =
    events?.filter((e) => e.status === "completed" || e.status === "settled")
      .length ?? 0;

  // Dialog state
  const [dialog, setDialog] = useState<DialogState>({
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

  const handleClaimStake = async (eventId: string) => {
    if (!program || !walletAddress) {
      throw new Error("Wallet not connected");
    }

    const cleanEventId = eventId.replace(/-/g, "");
    const programId = program.programId;
    const admin = new PublicKey(walletAddress);
    
    // Derived accounts
    const [eventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(cleanEventId)],
      programId
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), eventPda.toBuffer()],
      programId
    );
    const [mockUsdcMint] = PublicKey.findProgramAddressSync(
      [Buffer.from("mock_usdc_mint")],
      programId
    );
    const adminTokenAccount = await getAssociatedTokenAddress(
      mockUsdcMint,
      admin
    );

    // Call releaseStake
    const method = (program.methods as any).releaseStake(cleanEventId);
    const txSignature = await method.accounts({
      admin,
      event: eventPda,
      vault: vaultPda,
      adminTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).rpc();

    // Update state in Supabase
    await supabase
      .from("race_events")
      .update({ stake_status: "returned" })
      .eq("id", eventId);

    refetch?.(); // Refresh dashboard data

    return txSignature;
  };

  // ── Loading auth state ──
  if (!ready || authLoading) {
    return (
      <div className="container max-w-md py-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  // ── Not logged in ──
  if (!authenticated) {
    return (
      <div className="container max-w-md py-12">
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <LogIn className="h-12 w-12 mx-auto opacity-40" />
            <CardTitle>Login Required</CardTitle>
            <CardDescription>
              You need to log in to access the Creator Dashboard.
            </CardDescription>
            <Button onClick={login} className="w-full">
              <LogIn className="mr-2 h-4 w-4" /> Login with Google / Email
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Creator Dashboard ──
  return (
    <div className="container py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" asChild className="mb-2">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" /> Home
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            Creator Dashboard
          </h1>
          <p className="text-muted-foreground text-sm">
            Manage your marathon events
          </p>
        </div>
        <Button asChild>
          <Link href="/creator/create">
            <Plus className="mr-2 h-4 w-4" /> Create New Event
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Total Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalEvents}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeEvents}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{completedEvents}</p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Events Table */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Event List</h2>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading events...
          </div>
        )}

        {error && (
          <p className="text-center py-8 text-destructive">
            Failed to load events.
          </p>
        )}

        {!isLoading && !error && events && events.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <Trophy className="h-10 w-10 mx-auto opacity-30" />
              <p className="text-muted-foreground">
                No events yet. Create your first event!
              </p>
              <Button asChild>
                <Link href="/creator/create">
                  <Plus className="mr-2 h-4 w-4" /> Create Event
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && events && events.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    onEventDeleted={() => refetch?.()}
                    showDialog={showDialog}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Earnings Breakdown Section (Phase 2.6) */}
      {!isLoading &&
        events &&
        events.some(
          (e) =>
            (e.status === "completed" ||
              e.status === "settled" ||
              e.status === "active") &&
            (e.stake_amount ?? 0) > 0,
        ) && (
          <>
            <Separator />
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <DollarSign className="h-5 w-5" /> Earnings Breakdown
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {events
                  .filter((e) => (e.stake_amount ?? 0) > 0)
                  .map((event) => (
                    <EarningsBreakdownCard
                      key={`earnings-${event.id}`}
                      eventId={event.id}
                      eventName={event.name}
                      status={
                        event.status as
                          | "pending"
                          | "active"
                          | "completed"
                          | "settled"
                      }
                      registrationFeePerPerson={event.registration_fee_sol}
                      stakeAmount={event.stake_amount ?? 0}
                      participantCount={event.max_participants}
                      protocolFeeBps={event.protocol_fee_bps ?? 500}
                      isCompleted={event.is_completed ?? false}
                      stakeStatus={event.stake_status ?? "pending"}
                      treasuryFeeCollected={event.treasury_fee_collected ?? 0}
                      disputeLockUntil={
                        (event.status === "completed" || event.status === "settled")
                          ? new Date(
                              new Date(event.updated_at || event.end_time || event.created_at).getTime() + 7 * 24 * 60 * 60 * 1000
                            ).toISOString()
                          : null
                      }
                      onClaim={handleClaimStake}
                    />
                  ))}
              </div>
            </div>
          </>
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
