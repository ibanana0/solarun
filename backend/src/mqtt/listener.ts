/**
 * MQTT Listener
 * 
 * Connects to an MQTT broker, subscribes to the race/checkpoint topic,
 * and routes incoming messages through the checkpoint validator.
 */
import mqtt from 'mqtt';
import { validateCheckpoint, type CheckpointMessage } from '../validator/checkpoint-validator';

// ============================================================================
// Configuration
// ============================================================================

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'race/checkpoint';

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

    // --- Message Handler ---

    client.on('message', async (topic: string, payload: Buffer) => {
        const raw = payload.toString();
        console.log(`\n[MQTT] 📨 Received on "${topic}": ${raw}`);

        // Parse JSON
        let message: CheckpointMessage;
        try {
            message = JSON.parse(raw);
        } catch {
            console.error('[MQTT] ❌ Invalid JSON payload, skipping');
            return;
        }

        // Validate required fields
        if (!message.rfid_uid || message.checkpoint_id === undefined || !message.timestamp) {
            console.error('[MQTT] ❌ Missing required fields (rfid_uid, checkpoint_id, timestamp)');
            return;
        }

        // Run through checkpoint validator
        try {
            const result = await validateCheckpoint(message);

            if (result.valid) {
                console.log(`[MQTT] ✅ Checkpoint validated successfully`);
                if (result.is_finish) {
                    console.log(`[MQTT] 🏁 FINISH detected! Position: #${result.finish_position}`);
                    // TODO (Phase 1.7): Call smart contract record_finish() here
                }
            } else {
                console.log(`[MQTT] ⚠️ Checkpoint rejected: ${result.error}`);
            }
        } catch (err) {
            console.error('[MQTT] ❌ Unexpected error processing checkpoint:', err);
        }
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
