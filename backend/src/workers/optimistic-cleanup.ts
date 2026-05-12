import { supabase } from "../lib/supabase";

/**
 * Optimistic Cleanup Worker
 *
 * Clears stale processing_started_at timestamps for runners stuck in "running" state.
 * This handles cases where the backend started processing a finish but failed to complete.
 * After 60 seconds, we clear the timestamp so the system can retry.
 *
 * Note: The "Finishing..." status is a frontend-only optimistic UI state, not stored in DB.
 * Valid runner_status enum values: registered | running | finished | disqualified
 */
export async function cleanupStuckTransactions() {
  console.log("[Cleanup Worker] Running stuck transaction cleanup...");

  const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();

  // Find runners still in "running" state with old processing_started_at timestamp
  const { data, error } = await supabase
    .from("runners")
    .update({ processing_started_at: null })
    .eq("status", "running")
    .not("processing_started_at", "is", null)
    .lt("processing_started_at", sixtySecondsAgo)
    .select();

  if (error) {
    console.error(
      "[Cleanup Worker] Error cleaning up stuck transactions:",
      error.message,
    );
  } else if (data && data.length > 0) {
    console.log(
      `[Cleanup Worker] Cleared ${data.length} stale processing timestamps (runners still running).`,
    );
  } else {
    console.log("[Cleanup Worker] No stuck transactions found.");
  }
}
