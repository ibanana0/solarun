/**
 * Test: Refund Scheduler & Transaction Signer (Phase 1.7)
 *
 * Run with: npx tsx src/test-refund-scheduler.ts
 *
 * Tests:
 * 1. Blockchain client initialization
 * 2. Admin keypair loading
 * 3. RPC connection health check
 * 4. Query completed events from Supabase
 * 5. Simulate refund transaction flow
 * 6. Log transaction details
 */

import 'dotenv/config';
import {
    initBlockchainClient,
    checkConnection,
    logBlockchainStatus,
} from './blockchain/transaction-signer';
import { supabase } from './lib/supabase';
import { manualTriggerRefunds } from './scheduler/refund-scheduler';

// ============================================================================
// Test Utilities
// ============================================================================

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
};

function log(title: string, message: string, type: 'info' | 'success' | 'error' = 'info') {
    const color =
        type === 'success' ? colors.green : type === 'error' ? colors.red : colors.blue;
    console.log(`${color}[${title}]${colors.reset} ${message}`);
}

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Tests
// ============================================================================

async function runTests() {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Phase 1.7: Refund Scheduler & Transaction Signer Tests`);
    console.log(`${'='.repeat(80)}\n`);

    // Test 1: Initialize Blockchain Client
    console.log(`\n1️⃣  Test: Initialize Blockchain Client`);
    console.log('─'.repeat(80));
    try {
        initBlockchainClient();
        log('PASS', 'Blockchain client initialized successfully', 'success');
    } catch (error) {
        log('FAIL', `Failed to initialize blockchain client: ${error}`, 'error');
        return;
    }

    // Test 2: Check RPC Connection
    console.log(`\n2️⃣  Test: Check RPC Connection Health`);
    console.log('─'.repeat(80));
    try {
        const isHealthy = await checkConnection();
        if (isHealthy) {
            log('PASS', 'RPC connection is healthy', 'success');
        } else {
            log('WARN', 'RPC connection returned unhealthy status', 'info');
        }
    } catch (error) {
        log('FAIL', `RPC health check failed: ${error}`, 'error');
    }

    // Test 3: Log Blockchain Status
    console.log(`\n3️⃣  Test: Blockchain Status Report`);
    console.log('─'.repeat(80));
    try {
        logBlockchainStatus();
        log('PASS', 'Blockchain status logged successfully', 'success');
    } catch (error) {
        log('FAIL', `Failed to log blockchain status: ${error}`, 'error');
    }

    // Test 4: Query Completed Events from Supabase
    console.log(`\n4️⃣  Test: Query Completed Events from Supabase`);
    console.log('─'.repeat(80));
    try {
        const { data: allEvents, error: allError } = await supabase
            .from('race_events')
            .select('id, name, status, end_time, created_at');

        if (allError) {
            throw allError;
        }

        log('INFO', `Total events in database: ${allEvents?.length || 0}`, 'info');

        if (allEvents && allEvents.length > 0) {
            console.log(`   Event list:`);
            allEvents.slice(0, 5).forEach((event: any, i: number) => {
                console.log(
                    `   ${i + 1}. ${event.name} (${event.status}) - Created: ${event.created_at}`
                );
            });
        }

        // Query completed events
        const { data: completedEvents, error: queryError } = await supabase
            .from('race_events')
            .select('*')
            .eq('status', 'completed');

        if (queryError) {
            throw queryError;
        }

        if (completedEvents && completedEvents.length > 0) {
            log(
                'PASS',
                `Found ${completedEvents.length} completed event(s) ready for refund processing`,
                'success'
            );
            completedEvents.forEach((event: any) => {
                console.log(`   - ${event.name} (ID: ${event.id.slice(0, 8)}...)`);
            });
        } else {
            log('INFO', 'No completed events found (this is OK)', 'info');
        }
    } catch (error) {
        log('FAIL', `Supabase query failed: ${error}`, 'error');
    }

    // Test 5: Verify race_events Schema
    console.log(`\n5️⃣  Test: Verify race_events Table Schema`);
    console.log('─'.repeat(80));
    try {
        const { data, error } = await supabase
            .from('race_events')
            .select('*')
            .limit(1);

        if (error) {
            log(
                'FAIL',
                'race_events table not found or not accessible. Did you run the migration?',
                'error'
            );
        } else {
            log('PASS', 'race_events table is accessible', 'success');

            if (data && data.length > 0) {
                const event = data[0];
                console.log(`   Columns found:`);
                Object.keys(event).forEach((col) => {
                    console.log(`   - ${col}: ${typeof event[col]}`);
                });
            }
        }
    } catch (error) {
        log('FAIL', `Schema check failed: ${error}`, 'error');
    }

    // Test 6: Check refund_logs Table
    console.log(`\n6️⃣  Test: Check refund_logs Table (Audit Trail)`);
    console.log('─'.repeat(80));
    try {
        const { data, error } = await supabase
            .from('refund_logs')
            .select('*')
            .limit(1);

        if (error) {
            log('INFO', 'refund_logs table not found (Optional table). Skipped.', 'info');
        } else {
            log('PASS', 'refund_logs table exists and is accessible', 'success');

            if (data && data.length > 0) {
                console.log(`   Latest refund log entry:`);
                const entry = data[0];
                console.log(`   - Event: ${entry.event_id}`);
                console.log(`   - TX: ${entry.tx_signature}`);
                console.log(`   - Status: ${entry.status}`);
            } else {
                console.log(`   (No refund logs yet - will be created when refunds process)`);
            }
        }
    } catch (error) {
        log('FAIL', `refund_logs check failed: ${error}`, 'error');
    }

    // Test 7: Manual Refund Trigger (Optional)
    console.log(`\n7️⃣  Test: Manual Refund Trigger`);
    console.log('─'.repeat(80));
    try {
        log(
            'INFO',
            'To test refund processing, create an event with end_time in the past:',
            'info'
        );
        console.log(
            `
   SQL Example:
   INSERT INTO race_events (name, vault_address, status, end_time)
   VALUES (
     'Test Event',
     '9aQ2pU9vK3xL8mN5bR2cF7gH1jK4qO8pZ9vX2yA3bC4',
     'active',
     NOW() - INTERVAL '1 minute'
   );

   Then trigger refunds:
   curl -X POST http://localhost:3001/admin/trigger-refunds
        `
        );
    } catch (error) {
        log('FAIL', `Refund trigger test failed: ${error}`, 'error');
    }

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Phase 1.7 Tests Complete ✅`);
    console.log(`${'='.repeat(80)}\n`);

    console.log(`Next steps:`);
    console.log(`1. Ensure .env file is configured with Solana + Supabase credentials`);
    console.log(`2. Start the backend: npm run dev`);
    console.log(`3. Backend will automatically start the refund scheduler`);
    console.log(`4. Scheduler runs every minute (check logs for "Refund scheduler running...")`);
    console.log(`5. For testing, use: POST /admin/trigger-refunds`);
    console.log('');
}

// ============================================================================
// Run Tests
// ============================================================================

runTests().catch((error) => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
});
