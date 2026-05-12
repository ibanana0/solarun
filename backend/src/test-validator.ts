/**
 * MQTT Simulation Test Script
 *
 * Tests the checkpoint validator directly WITHOUT requiring an MQTT broker.
 * Simulates the full flow: start → checkpoint 1 → finish for multiple runners.
 *
 * Run: npx tsx src/test-validator.ts
 */
import "dotenv/config";
import {
  validateCheckpoint,
  type CheckpointMessage,
} from "./validator/checkpoint-validator";
import { supabase } from "./lib/supabase";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testValidatorFlow() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  SolaRun Checkpoint Validator — Integration Test  ");
  console.log("═══════════════════════════════════════════════════\n");

  // --- Get active event and runners ---
  const { data: runners, error } = await supabase
    .from("runners")
    .select("rfid_uid, full_name, status, event_id")
    .order("rfid_uid");

  if (error || !runners || runners.length === 0) {
    console.error(
      "❌ Failed to fetch runners:",
      error?.message || "No runners found.",
    );
    return;
  }

  console.log(`📋 Found ${runners.length} runners in DB:\n`);
  runners.forEach((r) =>
    console.log(`   ${r.rfid_uid} — ${r.full_name} [${r.status}]`),
  );

  // --- Reset runners to "registered" and clear race_logs for clean test ---
  console.log(
    '\n🔄 Resetting runners to "registered" and clearing race_logs...',
  );
  await supabase.from("race_logs").delete().neq("id", 0); // delete all
  await supabase
    .from("runners")
    .update({ status: "registered", finish_position: null })
    .neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("   ✅ Reset complete\n");

  // We'll test with the first 3 runners
  const testRunners = runners.slice(0, 3);

  // Determine max checkpoints from the event of the first runner
  const { data: eventData } = await supabase
    .from("race_events")
    .select("checkpoints_config")
    .eq("id", testRunners[0]!.event_id)
    .single();

  let maxCheckpoint = 2; // Default fallback
  if (
    eventData?.checkpoints_config &&
    Array.isArray(eventData.checkpoints_config)
  ) {
    maxCheckpoint = Math.max(0, eventData.checkpoints_config.length - 1);
  }

  console.log(
    `🏁 Event has ${maxCheckpoint + 1} checkpoints configured. Finish line is CP ${maxCheckpoint}.\n`,
  );

  // =========================================================================
  // TEST 1: Valid start checkpoint (checkpoint_id = 0)
  // =========================================================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  TEST 1: Start Checkpoint (checkpoint_id = 0)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  for (const runner of testRunners) {
    const msg: CheckpointMessage = {
      rfid_uid: runner.rfid_uid,
      checkpoint_id: 0,
      timestamp: new Date().toISOString(),
    };
    const result = await validateCheckpoint(msg);
    console.log(
      `   ${runner.rfid_uid}: ${result.valid ? "✅ PASS" : `❌ FAIL — ${result.error}`}`,
    );
  }

  // =========================================================================
  // TEST 2: Invalid — skip checkpoint (try finish directly after start)
  // =========================================================================
  if (maxCheckpoint > 1) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(
      `  TEST 2: Skip Checkpoint (0 → ${maxCheckpoint}, should FAIL)`,
    );
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const skipMsg: CheckpointMessage = {
      rfid_uid: testRunners[0]!.rfid_uid,
      checkpoint_id: maxCheckpoint, // skipping intermediate
      timestamp: new Date().toISOString(),
    };
    const skipResult = await validateCheckpoint(skipMsg);
    console.log(
      `   ${testRunners[0]!.rfid_uid}: ${skipResult.valid ? "❌ UNEXPECTED PASS" : `✅ Correctly rejected — ${skipResult.error}`}`,
    );
  }

  // =========================================================================
  // TEST 3: Duplicate tap (same checkpoint within 30s)
  // =========================================================================
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  TEST 3: Duplicate Tap (checkpoint 0 again, should FAIL)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const dupMsg: CheckpointMessage = {
    rfid_uid: testRunners[0]!.rfid_uid,
    checkpoint_id: 0, // same as already recorded
    timestamp: new Date().toISOString(),
  };
  const dupResult = await validateCheckpoint(dupMsg);
  console.log(
    `   ${testRunners[0]!.rfid_uid}: ${dupResult.valid ? "❌ UNEXPECTED PASS" : `✅ Correctly rejected — ${dupResult.error}`}`,
  );

  // =========================================================================
  // TEST 4: Valid intermediate checkpoints (1 to maxCheckpoint - 1)
  // =========================================================================
  for (let cp = 1; cp < maxCheckpoint; cp++) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(
      `  TEST 4.${cp}: Intermediate Checkpoint (checkpoint_id = ${cp})`,
    );
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    for (const runner of testRunners) {
      const msg: CheckpointMessage = {
        rfid_uid: runner.rfid_uid,
        checkpoint_id: cp,
        timestamp: new Date().toISOString(),
      };
      const result = await validateCheckpoint(msg);
      console.log(
        `   ${runner.rfid_uid}: ${result.valid ? "✅ PASS" : `❌ FAIL — ${result.error}`}`,
      );
    }
  }

  // =========================================================================
  // TEST 5: Finish checkpoint
  // =========================================================================
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  TEST 5: Finish Checkpoint (checkpoint_id = ${maxCheckpoint})`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  for (let i = 0; i < testRunners.length; i++) {
    const runner = testRunners[i]!;
    const msg: CheckpointMessage = {
      rfid_uid: runner.rfid_uid,
      checkpoint_id: maxCheckpoint,
      timestamp: new Date().toISOString(),
    };
    const result = await validateCheckpoint(msg);
    console.log(
      `   ${runner.rfid_uid}: ${result.valid ? `✅ FINISHED #${result.finish_position}` : `❌ FAIL — ${result.error}`}`,
    );
    await sleep(100); // slight delay between finishers
  }

  // =========================================================================
  // TEST 6: Already finished runner tries to tap again
  // =========================================================================
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  TEST 6: Already Finished Runner (should FAIL)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const alreadyFinished: CheckpointMessage = {
    rfid_uid: testRunners[0]!.rfid_uid,
    checkpoint_id: maxCheckpoint,
    timestamp: new Date().toISOString(),
  };
  const finishedResult = await validateCheckpoint(alreadyFinished);
  console.log(
    `   ${testRunners[0]!.rfid_uid}: ${finishedResult.valid ? "❌ UNEXPECTED PASS" : `✅ Correctly rejected — ${finishedResult.error}`}`,
  );

  // =========================================================================
  // TEST 7: Unknown RFID
  // =========================================================================
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  TEST 7: Unknown RFID (should FAIL)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const unknownMsg: CheckpointMessage = {
    rfid_uid: "UNKNOWN_CHIP",
    checkpoint_id: 0,
    timestamp: new Date().toISOString(),
  };
  const unknownResult = await validateCheckpoint(unknownMsg);
  console.log(
    `   UNKNOWN_CHIP: ${unknownResult.valid ? "❌ UNEXPECTED PASS" : `✅ Correctly rejected — ${unknownResult.error}`}`,
  );

  // =========================================================================
  // Verify final state in DB
  // =========================================================================
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  FINAL DB STATE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const { data: finalRunners } = await supabase
    .from("runners")
    .select("rfid_uid, full_name, status, finish_position")
    .order("rfid_uid");

  console.log("   Runners:");
  finalRunners?.forEach((r) => {
    const pos = r.finish_position ? ` (#${r.finish_position})` : "";
    console.log(`   ${r.rfid_uid} — ${r.full_name} [${r.status}]${pos}`);
  });

  const { data: logs } = await supabase
    .from("race_logs")
    .select("runner_id, checkpoint_id, timestamp")
    .order("timestamp");

  console.log(`\n   Race Logs: ${logs?.length ?? 0} entries recorded`);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  ✅ All validator tests complete!");
  console.log("═══════════════════════════════════════════════════\n");
}

testValidatorFlow()
  .catch(console.error)
  .finally(() => process.exit(0));
