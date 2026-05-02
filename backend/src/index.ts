/**
 * SolaRun Backend — Main Entry Point
 * 
 * Starts:
 * 1. Express API server
 * 2. MQTT checkpoint listener
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { startMqttListener } from './mqtt/listener';
import { startRefundScheduler, stopRefundScheduler, manualTriggerRefunds } from './scheduler/refund-scheduler';
import { initBlockchainClient, logBlockchainStatus } from './blockchain/transaction-signer';
import { deleteEventWithRefund } from './api/deleteEvent';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================================
// Health check endpoint
// ============================================================================

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'solarun-backend',
        timestamp: new Date().toISOString(),
    });
});

// ============================================================================
// Debug / Admin Endpoints
// ============================================================================

/**
 * Manually trigger refund processing (for testing/debugging)
 * POST /admin/trigger-refunds
 */
app.post('/admin/trigger-refunds', async (_req, res) => {
    try {
        console.log(`\n📌 Admin endpoint: manual refund trigger`);
        await manualTriggerRefunds();
        res.json({
            status: 'ok',
            message: 'Refund processing triggered',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: String(error),
        });
    }
});

/**
 * Get blockchain status (for debugging)
 * GET /admin/blockchain-status
 */
app.get('/admin/blockchain-status', (_req, res) => {
    try {
        logBlockchainStatus();
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: String(error),
        });
    }
});

// ============================================================================
// Event Management Endpoints
// ============================================================================

/**
 * Delete a race event and refund all participants
 * DELETE /api/events/:id
 * 
 * Response:
 * {
 *   status: 'ok' | 'error',
 *   message: string,
 *   details: {
 *     eventId: string,
 *     eventName: string,
 *     participantsRefunded: number,
 *     transactionSignature: string | null,
 *     timestamp: string
 *   }
 * }
 */
app.delete('/api/events/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id) {
            return res.status(400).json({
                status: 'error',
                message: 'Event ID is required',
            });
        }

        console.log(`\n📌 Delete event endpoint called: ${id}`);
        const result = await deleteEventWithRefund(id);
        
        const statusCode = result.status === 'ok' ? 200 : 400;
        res.status(statusCode).json(result);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: String(error),
        });
    }
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, async () => {
    console.log(`\n🚀 SolaRun Backend running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   Delete Event: DELETE http://localhost:${PORT}/api/events/:id`);
    console.log(`   Blockchain Status: http://localhost:${PORT}/admin/blockchain-status`);
    console.log(`   Trigger Refunds: POST http://localhost:${PORT}/admin/trigger-refunds`);
    console.log('');

    // Initialize blockchain client
    try {
        initBlockchainClient();
    } catch (error) {
        console.warn(`⚠️  Warning: Blockchain client initialization failed:`, error);
        console.log(`   (This is OK for local testing without .env config)`);
    }

    // Start MQTT listener
    startMqttListener();

    // Start refund scheduler
    startRefundScheduler();

    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log(`\n👋 SIGTERM received, shutting down...`);
        stopRefundScheduler();
        process.exit(0);
    });

    process.on('SIGINT', () => {
        console.log(`\n👋 SIGINT received, shutting down...`);
        stopRefundScheduler();
        process.exit(0);
    });
});
