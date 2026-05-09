import 'dotenv/config';
import * as mqtt from 'mqtt';
import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Program, type Idl } from '@coral-xyz/anchor';

import idl from '../blockchain/solarun_temp.json' with { type: "json" };

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const topic = process.env.MQTT_TOPIC || 'race/checkpoint';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.SOLARUN_PROGRAM_ID!);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let eventId = '';
let cleanEventId = '';

interface CheckpointDef {
    id: number;
    label: string;
    command: string; // CLI command name (e.g., 'start', 'cp1', 'finish')
}

interface RunnerState {
    name: string;
    chipUid: string;
    walletAddress: string;
    dbRunnerId: string;       // Supabase runner ID (for race_logs lookup)
    lastCheckpoint: number;   // -1 = not started, 0 = started, etc.
    status: string;           // display status label
    finishPosition: number | null;
}

let runners: RunnerState[] = [];
let checkpointDefs: CheckpointDef[] = [];
let CP_LABELS: Record<number, string> = {};
let mqttClient: mqtt.MqttClient;

// ============================================================================
// On-Chain + DB Hybrid State Loading
// ============================================================================

function resolveStatus(statusObj: any): { label: string; value: number } {
    if (statusObj.registered !== undefined) return { label: 'Registered', value: 0 };
    if (statusObj.running !== undefined) return { label: 'Running', value: 1 };
    if (statusObj.finished !== undefined) return { label: 'Finished', value: 2 };
    if (statusObj.disqualified !== undefined) return { label: 'Disqualified', value: 3 };
    if (statusObj.refunded !== undefined) return { label: 'Refunded', value: 4 };
    return { label: 'Unknown', value: -1 };
}

async function fetchHybridState() {
    console.log(`\n📡 Fetching state for event ${eventId}...`);

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const provider = new anchor.AnchorProvider(
        connection,
        new anchor.Wallet(Keypair.generate()),
        { commitment: 'confirmed' }
    );
    const program = new Program({ ...idl, address: PROGRAM_ID.toBase58() } as Idl, provider);

    // 1. Check event status on-chain
    const [eventPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(cleanEventId)],
        PROGRAM_ID
    );

    let eventAccount: any;
    try {
        eventAccount = await program.account.event.fetch(eventPda);
    } catch {
        console.error('❌ Event not found on blockchain.');
        process.exit(1);
    }

    const eventStatus = eventAccount.status.initialized ? 'Initialized'
        : eventAccount.status.active ? 'Active'
        : eventAccount.status.completed ? 'Completed'
        : eventAccount.status.settled ? 'Settled'
        : 'Unknown';

    if (eventStatus === 'Initialized') {
        console.error(`\n❌ Event is still in "Initialized" (pending) status on-chain.`);
        console.error(`   💡 Please click "Start Race" in the Creator Dashboard first.`);
        process.exit(1);
    }

    if (eventStatus === 'Completed' || eventStatus === 'Settled') {
        console.error(`\n❌ Event is already "${eventStatus}" on-chain.`);
        console.error(`   You cannot send checkpoints to a finished event.`);
        process.exit(1);
    }

    console.log(`✅ Event status on-chain: ${eventStatus}`);

    // 2. Fetch event details from Supabase (to get checkpoints_config)
    const { data: eventData, error: eventDbError } = await supabase
        .from('race_events')
        .select('checkpoints_config')
        .eq('id', eventId)
        .single();

    // Build checkpoint definitions from event config
    const cpConfig: Array<{ id: number; label: string }> = eventData?.checkpoints_config ?? [];

    if (cpConfig.length < 2) {
        // Fallback to default 3 checkpoints if no config
        console.log('⚠️  No checkpoints_config found in DB, using default 3-checkpoint layout.');
        checkpointDefs = [
            { id: 0, label: 'Start', command: 'start' },
            { id: 1, label: 'Mid', command: 'cp1' },
            { id: 2, label: 'Finish', command: 'finish' },
        ];
    } else {
        checkpointDefs = cpConfig.map((cp, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === cpConfig.length - 1;
            const command = isFirst ? 'start' : isLast ? 'finish' : `cp${idx}`;
            return { id: cp.id, label: cp.label || (isFirst ? 'Start' : isLast ? 'Finish' : `CP${idx}`), command };
        });
    }

    // Build label map
    CP_LABELS = {};
    checkpointDefs.forEach(def => { CP_LABELS[def.id] = def.label; });

    console.log(`📍 Event has ${checkpointDefs.length} checkpoints: ${checkpointDefs.map(d => `${d.command}(CP${d.id}:${d.label})`).join(' → ')}`);

    // 3. Fetch runners from Supabase (to get chip_uid + runner_id mapping)
    const { data: dbRunners, error } = await supabase
        .from('runners')
        .select('id, full_name, chip_uid, wallet_address, status, finish_position')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

    if (error || !dbRunners || dbRunners.length === 0) {
        console.error('❌ No runners found. Run auto-register.ts first.');
        process.exit(1);
    }

    console.log(`✅ Found ${dbRunners.length} registered runners. Loading hybrid state...\n`);

    // 3. For each runner: read on-chain PDA + Supabase race_logs
    runners = [];
    for (const r of dbRunners) {
        let onChainStatus = 'Registered';
        let lastCp = -1;
        let finishPos: number | null = null;

        // --- Source A: On-chain PDA (major status: Registered / Running / Finished) ---
        try {
            const [participantPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("participant"), eventPda.toBuffer(), Buffer.from(r.chip_uid)],
                PROGRAM_ID
            );

            const pAccount = await program.account.participant.fetch(participantPda);
            const resolved = resolveStatus(pAccount.status);
            onChainStatus = resolved.label;
            finishPos = pAccount.finishPosition ?? null;

            // Running on-chain means at least CP0 was recorded
            if (resolved.value >= 1) lastCp = 0;
            if (resolved.value === 2) lastCp = 2;
        } catch {
            // PDA not found — fall back to DB
        }

        // --- Source B: Supabase race_logs (detailed checkpoint: 0, 1, 2) ---
        const { data: lastLog } = await supabase
            .from('race_logs')
            .select('checkpoint_id')
            .eq('runner_id', r.id)
            .order('checkpoint_id', { ascending: false })
            .limit(1);

        if (lastLog && lastLog.length > 0) {
            const dbLastCp = lastLog[0].checkpoint_id;
            // Use the HIGHER of on-chain vs DB (in case one source is ahead)
            lastCp = Math.max(lastCp, dbLastCp);
        }

        // Also use DB status/position as fallback if on-chain is behind
        if (onChainStatus === 'Registered' && r.status === 'running') {
            onChainStatus = 'Running';
        }
        if (onChainStatus !== 'Finished' && r.status === 'finished') {
            onChainStatus = 'Finished';
            finishPos = r.finish_position;
        }

        // Derive a better status label based on lastCp
        let displayStatus = onChainStatus;
        if (onChainStatus === 'Running' && lastCp > 0) {
            const cpLabel = CP_LABELS[lastCp] ?? `CP${lastCp}`;
            displayStatus = `Running (${cpLabel})`;
        }

        runners.push({
            name: r.full_name,
            chipUid: r.chip_uid,
            walletAddress: r.wallet_address,
            dbRunnerId: r.id,
            lastCheckpoint: lastCp,
            status: displayStatus,
            finishPosition: finishPos,
        });
    }

    printStatus();
}

// ============================================================================
// Display
// ============================================================================

function printStatus() {
    console.log('\n┌────┬──────────────┬──────────────┬────────────────┬──────────┐');
    console.log('│ #  │ Name         │ Chip         │ Status         │ Position │');
    console.log('├────┼──────────────┼──────────────┼────────────────┼──────────┤');
    runners.forEach((r, idx) => {
        const num = String(idx + 1).padStart(2);
        const name = r.name.padEnd(12).slice(0, 12);
        const chip = r.chipUid.padEnd(12).slice(0, 12);
        const status = r.status.padEnd(14).slice(0, 14);
        const pos = r.finishPosition ? `#${r.finishPosition}`.padEnd(8) : '   -    ';
        console.log(`│ ${num} │ ${name} │ ${chip} │ ${status} │ ${pos} │`);
    });
    console.log('└────┴──────────────┴──────────────┴────────────────┴──────────┘');
}

function printHelp() {
    console.log(`\n============= SIMULATION COMMANDS =============`);
    checkpointDefs.forEach(def => {
        console.log(`${def.command} all`.padEnd(17) + `: ${def.label} (CP${def.id}) for ALL runners`);
    });
    checkpointDefs.forEach(def => {
        console.log(`${def.command} <id>`.padEnd(17) + `: ${def.label} (CP${def.id}) for runner #<id>`);
    });
    console.log(`status           : Show runner list with current status`);
    console.log(`refresh          : Re-fetch state from blockchain + DB`);
    console.log(`help             : Show this help menu`);
    console.log(`exit/quit        : Exit simulator`);
    console.log(`=================================================\n`);
}

// ============================================================================
// Checkpoint Logic
// ============================================================================

function getExpectedCheckpointId(runner: RunnerState): number {
    // Find the next checkpoint in sequence based on checkpointDefs
    const currentIdx = checkpointDefs.findIndex(d => d.id === runner.lastCheckpoint);
    if (currentIdx === -1) return checkpointDefs[0]?.id ?? 0; // Not started -> first CP
    if (currentIdx >= checkpointDefs.length - 1) return -1;   // Already at last CP
    return checkpointDefs[currentIdx + 1].id;
}

function isLastCheckpoint(checkpointId: number): boolean {
    return checkpointDefs.length > 0 && checkpointDefs[checkpointDefs.length - 1].id === checkpointId;
}

function canSendCheckpoint(runner: RunnerState, checkpointId: number): string | null {
    if (runner.status.startsWith('Finished')) {
        return `${runner.name} has already finished (Position #${runner.finishPosition}).`;
    }
    if (runner.status === 'Disqualified') {
        return `${runner.name} is disqualified.`;
    }

    const expected = getExpectedCheckpointId(runner);
    if (expected === -1) {
        return `${runner.name} has already completed all checkpoints.`;
    }
    if (checkpointId !== expected) {
        const expectedLabel = CP_LABELS[expected] ?? `CP${expected}`;
        const requestedLabel = CP_LABELS[checkpointId] ?? `CP${checkpointId}`;
        return `${runner.name}: Cannot skip to ${requestedLabel}. Must do ${expectedLabel} first (current: ${runner.lastCheckpoint === -1 ? 'Not started' : `CP${runner.lastCheckpoint}`}).`;
    }

    return null; // OK
}

function sendCheckpoint(runner: RunnerState, runnerIndex: number, checkpointId: number): boolean {
    const err = canSendCheckpoint(runner, checkpointId);
    if (err) {
        console.log(`❌ ${err}`);
        return false;
    }

    const payload = {
        event_id: eventId,
        rfid_uid: runner.chipUid,
        checkpoint_id: checkpointId,
        timestamp: Date.now(),
        sensor_id: `sim_sensor_cp${checkpointId}`,
        device_id: `sim_cli_01`
    };

    mqttClient.publish(topic, JSON.stringify(payload), (pubErr) => {
        if (pubErr) {
            console.error(`❌ MQTT publish failed for ${runner.name}:`, pubErr.message);
        } else {
            const label = CP_LABELS[checkpointId] ?? `CP${checkpointId}`;
            console.log(`📡 [MQTT] Sent: ${runner.name} -> ${label} (CP${checkpointId})`);

            // Update local state optimistically
            runner.lastCheckpoint = checkpointId;
            if (isLastCheckpoint(checkpointId)) {
                runner.status = 'Finished';
                const finishedCount = runners.filter(r => r.status.startsWith('Finished')).length;
                runner.finishPosition = finishedCount;
            } else if (checkpointId === checkpointDefs[0]?.id) {
                runner.status = 'Running';
            } else {
                const cpLabel = CP_LABELS[checkpointId] ?? `CP${checkpointId}`;
                runner.status = `Running (${cpLabel})`;
            }
        }
    });

    return true;
}

// ============================================================================
// Command Processing
// ============================================================================

function processCommand(cmd: string) {
    const parts = cmd.trim().toLowerCase().split(/\s+/);
    const action = parts[0];
    const target = parts[1];

    if (!action) {
        startPrompt();
        return;
    }

    if (action === 'exit' || action === 'quit') {
        console.log('👋 Exiting MQTT Simulator...');
        mqttClient.end();
        process.exit(0);
    }

    if (action === 'help') {
        printHelp();
        startPrompt();
        return;
    }

    if (action === 'status') {
        printStatus();
        startPrompt();
        return;
    }

    if (action === 'refresh') {
        console.log('🔄 Refreshing state from blockchain + DB...');
        fetchHybridState().then(() => startPrompt());
        return;
    }

    // Resolve command to checkpoint ID dynamically
    const matchedDef = checkpointDefs.find(d => d.command === action);
    if (!matchedDef) {
        console.log('❌ Unknown command. Type "help" for available commands.');
        startPrompt();
        return;
    }
    const checkpointId = matchedDef.id;

    if (!target) {
        console.log('❌ You must specify a target (e.g., "start all" or "finish 1").');
        startPrompt();
        return;
    }

    if (target === 'all') {
        const label = CP_LABELS[checkpointId] ?? `CP${checkpointId}`;
        console.log(`\n🚀 Sending ${label} (CP${checkpointId}) for ALL runners...`);
        let sentCount = 0;
        runners.forEach((runner, i) => {
            setTimeout(() => {
                if (sendCheckpoint(runner, i, checkpointId)) sentCount++;
            }, i * 300);
        });
        setTimeout(() => {
            console.log(`\n✅ Sent ${sentCount}/${runners.length} checkpoint messages.`);
            startPrompt();
        }, runners.length * 300 + 500);
        return;
    }

    const idx = parseInt(target) - 1;
    if (isNaN(idx) || idx < 0 || idx >= runners.length) {
        console.log(`❌ Invalid runner ID. Must be between 1 and ${runners.length}. Type "status" to see list.`);
        startPrompt();
        return;
    }

    sendCheckpoint(runners[idx], idx, checkpointId);
    setTimeout(startPrompt, 300);
}

function startPrompt() {
    rl.question('MQTT-Sim> ', (answer) => {
        processCommand(answer);
    });
}

// ============================================================================
// MQTT Connection
// ============================================================================

function connectMqtt() {
    console.log(`\n🔌 Connecting to MQTT Broker at ${brokerUrl}...`);

    mqttClient = mqtt.connect(brokerUrl, {
        clientId: `solarun-sim-${Date.now()}`,
        clean: true,
        connectTimeout: 10000,
        reconnectPeriod: 5000,
    });

    mqttClient.on('connect', () => {
        console.log('✅ Connected to MQTT Broker!');
        printHelp();
        startPrompt();
    });

    mqttClient.on('error', (err) => {
        console.error(`❌ MQTT Connection Error: ${err.message}`);
        console.error(`   💡 Make sure the MQTT broker at ${brokerUrl} is reachable.`);
    });

    let reconnectCount = 0;
    mqttClient.on('reconnect', () => {
        reconnectCount++;
        if (reconnectCount <= 3) {
            console.log(`[MQTT] 🔄 Reconnecting... (attempt ${reconnectCount})`);
        }
        if (reconnectCount === 4) {
            console.error(`[MQTT] ❌ Failed to connect after 3 attempts. Exiting.`);
            mqttClient.end();
            process.exit(1);
        }
    });
}

// ============================================================================
// Entry Point
// ============================================================================

console.log('=============================================');
console.log('    SolaRun Interactive MQTT Simulator       ');
console.log('    (Hybrid: On-Chain + DB State)            ');
console.log('=============================================\n');

rl.question('Enter Event ID: ', async (answer) => {
    eventId = answer.trim();
    if (!eventId) {
        console.error('❌ Event ID cannot be empty!');
        process.exit(1);
    }
    cleanEventId = eventId.replace(/-/g, '');

    await fetchHybridState();
    connectMqtt();
});
