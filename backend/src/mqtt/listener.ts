/**
 * MQTT Listener
 * 
 * Connects to an MQTT broker, subscribes to the race/checkpoint topic,
 * and routes incoming messages through the checkpoint validator.
 * On successful validation, queues a smart contract record_finish
 * instruction for sequential on-chain processing (avoids Devnet flooding).
 */
import mqtt from 'mqtt';
import { validateCheckpoint, type CheckpointMessage } from '../validator/checkpoint-validator';
import { recordFinishOnChain } from '../blockchain/transaction-signer';
import { supabase } from '../lib/supabase';

// ============================================================================
// Configuration
// ============================================================================

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'race/checkpoint';

// ============================================================================
// Sequential Transaction Queue
// ============================================================================

interface QueueItem {
    eventId: string;
    rfidUid: string;
    checkpointId: number;
    finishPosition: number;
    timestamp: number;
    runnerId?: string;
}

const txQueue: QueueItem[] = [];
let isProcessingQueue = false;

/**
 * Add an item to the on-chain transaction queue and start processing.
 */
function enqueueOnChainTx(item: QueueItem): void {
    txQueue.push(item);
    console.log(`[Queue] 📥 Enqueued: ${item.rfidUid} CP${item.checkpointId} (queue size: ${txQueue.length})`);
    processQueue(); // start processing if not already running
}

/**
 * Process the on-chain transaction queue sequentially (one at a time).
 * This prevents Devnet from being flooded with concurrent txs from the same signer.
 */
async function processQueue(): Promise<void> {
    if (isProcessingQueue) return; // Already processing
    isProcessingQueue = true;

    while (txQueue.length > 0) {
        const item = txQueue.shift()!;
        console.log(`\n[Queue] ⚡ Processing: ${item.rfidUid} CP${item.checkpointId} (${txQueue.length} remaining)`);

        try {
            const txSig = await recordFinishOnChain(
                item.eventId,
                item.rfidUid,
                item.checkpointId,
                item.finishPosition,
                item.timestamp,
            );

            // On-chain succeeded — save tx_signature to Supabase
            if (item.runnerId) {
                await supabase
                    .from('runners')
                    .update({ tx_signature: txSig })
                    .eq('id', item.runnerId);
            }

            console.log(`[Queue] 🔗 On-chain TX confirmed: ${txSig}`);

        } catch (chainErr: any) {
            console.error(`[Queue] ❌ On-chain failed for ${item.rfidUid} CP${item.checkpointId}: ${chainErr.message}`);
            // DB data (race_logs, runner status) is already saved by the validator.
            // The on-chain call failing is logged but doesn't revert DB changes.
            // In production, you'd want a reconciliation/retry job.
        }

        // Small delay between sequential txs to avoid RPC rate limiting
        if (txQueue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    isProcessingQueue = false;
}

// ============================================================================
// MQTT Client
// ============================================================================

let client: mqtt.MqttClient | null = null;

/**
 * Start the MQTT listener.
 * Connects to the broker, subscribes to the checkpoint topic,
 * and processes incoming messages.
 */
export function startMqttListener(): void {
    console.log(`[MQTT] Connecting to broker: ${MQTT_BROKER_URL}`);

    client = mqtt.connect(MQTT_BROKER_URL, {
        clientId: `solarun-backend-${Date.now()}`,
        clean: true,
        connectTimeout: 10000,
        reconnectPeriod: 5000,
    });

    // --- Connection Events ---

    client.on('connect', () => {
        console.log('[MQTT] ✅ Connected to broker');

        client!.subscribe(MQTT_TOPIC, { qos: 1 }, (err) => {
            if (err) {
                console.error(`[MQTT] ❌ Failed to subscribe to ${MQTT_TOPIC}:`, err.message);
            } else {
                console.log(`[MQTT] 📡 Subscribed to topic: ${MQTT_TOPIC}`);
            }
        });
    });

    client.on('reconnect', () => {
        console.log('[MQTT] 🔄 Reconnecting...');
    });

    client.on('error', (err) => {
        console.error('[MQTT] ❌ Error:', err.message);
    });

    client.on('close', () => {
        console.log('[MQTT] Connection closed');
    });

    client.on('offline', () => {
        console.log('[MQTT] ⚠️ Client is offline');
    });

    // Queue for incoming MQTT messages to prevent DB race conditions
    const messageQueue: { topic: string; raw: string }[] = [];
    let isProcessingMessages = false;

    async function processMessages() {
        if (isProcessingMessages) return;
        isProcessingMessages = true;

        while (messageQueue.length > 0) {
            const { topic, raw } = messageQueue.shift()!;
            console.log(`\n[MQTT] 📨 Received on "${topic}": ${raw}`);

            // Parse JSON
            let message: CheckpointMessage;
            try {
                message = JSON.parse(raw);
            } catch {
                console.error('[MQTT] ❌ Invalid JSON payload, skipping');
                continue;
            }

            // Validate required fields
            if (!message.rfid_uid || message.checkpoint_id === undefined || !message.timestamp) {
                console.error('[MQTT] ❌ Missing required fields (rfid_uid, checkpoint_id, timestamp)');
                continue;
            }

            // Run through checkpoint validator (validates + writes to DB immediately)
            try {
                const result = await validateCheckpoint(message);

                if (result.valid) {
                    console.log(`[MQTT] ✅ Checkpoint validated successfully`);

                    if (result.is_finish) {
                        console.log(`[MQTT] 🏁 FINISH detected! Position: #${result.finish_position}`);
                    }

                    // Enqueue the on-chain transaction (processed sequentially)
                    const eventId = message.event_id;
                    if (eventId) {
                        enqueueOnChainTx({
                            eventId,
                            rfidUid: message.rfid_uid,
                            checkpointId: message.checkpoint_id,
                            finishPosition: result.finish_position ?? 0,
                            timestamp: typeof message.timestamp === 'number'
                                ? message.timestamp
                                : new Date(message.timestamp).getTime(),
                            runnerId: result.runner_id,
                        });
                    }
                } else {
                    console.log(`[MQTT] ⚠️ Checkpoint rejected: ${result.error}`);
                }
            } catch (err) {
                console.error('[MQTT] ❌ Unexpected error processing checkpoint:', err);
            }
        }

        isProcessingMessages = false;
    }

    // --- Message Handler ---

    client.on('message', (topic: string, payload: Buffer) => {
        const raw = payload.toString();
        messageQueue.push({ topic, raw });
        processMessages();
    });
}

/**
 * Stop the MQTT listener and disconnect.
 */
export function stopMqttListener(): void {
    if (client) {
        client.end(true);
        client = null;
        console.log('[MQTT] Disconnected');
    }
}
