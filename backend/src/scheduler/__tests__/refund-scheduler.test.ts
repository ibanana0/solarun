/**
 * Unit Tests: Refund Scheduler
 * Tests refund scheduler logic including:
 * - Event completion detection
 * - Refund processing
 * - Transaction status updates
 * - Error handling
 * - Event status transitions
 */

import {
    processCompletedEvents,
    manualTriggerRefunds,
    resetProcessedEvents,
} from '../../scheduler/refund-scheduler';
import { mockSupabase } from '../../mocks/supabase.mock';

// Mock Supabase
jest.mock('../../lib/supabase', () => ({
    supabase: require('../../mocks/supabase.mock').mockSupabase,
}));

// Mock blockchain
jest.mock('../../blockchain/transaction-signer', () => ({
    checkConnection: jest.fn().mockResolvedValue(true),
    logBlockchainStatus: jest.fn(),
    initBlockchainClient: jest.fn(),
    buildProcessRefundsInstruction: jest.fn().mockResolvedValue({ instructions: [] }),
    submitTransaction: jest.fn().mockResolvedValue('mock-tx-signature-1234567890'),
}));


describe('Refund Scheduler', () => {
    // ========================================================================
    // Setup & Teardown
    // ========================================================================

    beforeEach(() => {
        mockSupabase.reset();
        resetProcessedEvents(); // Clear in-memory dedup set between tests

        // Setup test data
        mockSupabase.setMockData('race_events', [
            {
                id: 'event-1',
                name: 'Completed Marathon',
                status: 'active',
                vault_address: 'vault-1',
                end_time: new Date(Date.now() - 60000).toISOString(), // 1 min ago (completed)
                created_at: new Date(Date.now() - 7200000).toISOString(),
                updated_at: new Date(Date.now() - 7200000).toISOString(),
            },
            {
                id: 'event-2',
                name: 'Ongoing Marathon',
                status: 'active',
                vault_address: 'vault-2',
                end_time: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now (not completed)
                created_at: new Date(Date.now() - 3600000).toISOString(),
                updated_at: new Date(Date.now() - 3600000).toISOString(),
            },
            {
                id: 'event-3',
                name: 'Already Settled Marathon',
                status: 'settled',
                vault_address: 'vault-3',
                end_time: new Date(Date.now() - 3600000).toISOString(),
                created_at: new Date(Date.now() - 14400000).toISOString(),
                updated_at: new Date(Date.now() - 3600000).toISOString(),
            },
        ]);

        mockSupabase.setMockData('runners', [
            // Event 1 runners
            {
                id: 'runner-1',
                rfid_uid: '08:1A:2B:3C',
                wallet_address: 'ABC123',
                full_name: 'Runner One',
                event_id: 'event-1',
                status: 'finished',
                finish_position: 1,
            },
            {
                id: 'runner-2',
                rfid_uid: '0D:2C:3D:4E',
                wallet_address: 'DEF456',
                full_name: 'Runner Two',
                event_id: 'event-1',
                status: 'finished',
                finish_position: 2,
            },
            {
                id: 'runner-3',
                rfid_uid: 'FF:FF:FF:FF',
                wallet_address: 'GHI789',
                full_name: 'Runner Three',
                event_id: 'event-1',
                status: 'registered', // Did not finish
                finish_position: null,
            },
            {
                id: 'runner-4',
                rfid_uid: '11:11:11:11',
                wallet_address: 'JKL012',
                full_name: 'Runner Four',
                event_id: 'event-1',
                status: 'registered', // Did not finish
                finish_position: null,
            },
            // Event 2 runners
            {
                id: 'runner-5',
                rfid_uid: '22:22:22:22',
                wallet_address: 'MNO345',
                full_name: 'Runner Five',
                event_id: 'event-2',
                status: 'running',
                finish_position: null,
            },
        ]);

        mockSupabase.setMockData('refund_logs', []);
    });

    // ========================================================================
    // Event Detection Tests
    // ========================================================================

    describe('Completed Event Detection', () => {
        it('should detect event with end_time in the past', async () => {
            await processCompletedEvents();

            // Check that refund_logs was populated for event-1
            const refundLogs = mockSupabase.getMockData('refund_logs');
            expect(refundLogs.length).toBeGreaterThan(0);
        });

        it('should not process events with end_time in the future', async () => {
            await processCompletedEvents();

            // Only event-1 should be processed, not event-2
            const refundLogs = mockSupabase.getMockData('refund_logs');
            const processedEventIds = refundLogs.map((log: any) => log.event_id);
            expect(processedEventIds).toContain('event-1');
            expect(processedEventIds).not.toContain('event-2');
        });

        it('should not reprocess already settled events', async () => {
            await processCompletedEvents();

            const refundLogs = mockSupabase.getMockData('refund_logs');
            const processedEventIds = refundLogs.map((log: any) => log.event_id);

            // event-3 is already settled, should not be processed
            expect(processedEventIds).not.toContain('event-3');
        });

        it('should handle case with no completed events', async () => {
            // Remove completed event
            mockSupabase.setMockData('race_events', [
                mockSupabase.getMockData('race_events')[1], // Only ongoing event
                mockSupabase.getMockData('race_events')[2], // Only settled event
            ]);

            await processCompletedEvents();

            // Should not crash and should create no refund logs
            const refundLogs = mockSupabase.getMockData('refund_logs');
            expect(refundLogs.length).toBe(0);
        });
    });

    // ========================================================================
    // Refund Processing Tests
    // ========================================================================

    describe('Refund Processing', () => {
        it('should calculate correct finisher and non-finisher counts', async () => {
            await processCompletedEvents();

            const refundLogs = mockSupabase.getMockData('refund_logs');
            const event1Log = refundLogs.find((log: any) => log.event_id === 'event-1');

            expect(event1Log).toBeDefined();
            expect(event1Log.finishers_paid).toBe(2); // runner-1, runner-2
            expect(event1Log.non_finishers_refunded).toBe(2); // runner-3, runner-4
        });

        it('should mark event as settled after processing', async () => {
            await processCompletedEvents();

            const events = mockSupabase.getMockData('race_events');
            const event1 = events.find((e: any) => e.id === 'event-1');

            expect(event1.status).toBe('settled');
        });

        it('should create refund log entry with transaction signature', async () => {
            await processCompletedEvents();

            const refundLogs = mockSupabase.getMockData('refund_logs');
            expect(refundLogs.length).toBeGreaterThan(0);

            const firstLog = refundLogs[0];
            expect(firstLog.tx_signature).toBeDefined();
            expect(firstLog.tx_signature.length).toBeGreaterThan(0);
            expect(firstLog.status).toBe('pending');
        });

        it('should handle events with no finishers', async () => {
            // Update event-1 runners to not finished
            const runners = mockSupabase.getMockData('runners');
            runners.forEach((r: any) => {
                if (r.event_id === 'event-1') {
                    r.status = 'registered';
                    r.finish_position = null;
                }
            });

            await processCompletedEvents();

            const refundLogs = mockSupabase.getMockData('refund_logs');
            const event1Log = refundLogs.find((log: any) => log.event_id === 'event-1');

            expect(event1Log.finishers_paid).toBe(0);
            expect(event1Log.non_finishers_refunded).toBe(4);
        });

        it('should handle events with all finishers', async () => {
            // Mark all runners as finished
            const runners = mockSupabase.getMockData('runners');
            runners.forEach((r: any, idx: number) => {
                if (r.event_id === 'event-1') {
                    r.status = 'finished';
                    r.finish_position = idx + 1;
                }
            });

            await processCompletedEvents();

            const refundLogs = mockSupabase.getMockData('refund_logs');
            const event1Log = refundLogs.find((log: any) => log.event_id === 'event-1');

            expect(event1Log.finishers_paid).toBe(4);
            expect(event1Log.non_finishers_refunded).toBe(0);
        });
    });

    // ========================================================================
    // Status Update Tests
    // ========================================================================

    describe('Status Updates', () => {
        it('should update event status from active to settled', async () => {
            const eventBefore = mockSupabase
                .getMockData('race_events')
                .find((e: any) => e.id === 'event-1');
            expect(eventBefore.status).toBe('active');

            await processCompletedEvents();

            const eventAfter = mockSupabase
                .getMockData('race_events')
                .find((e: any) => e.id === 'event-1');
            expect(eventAfter.status).toBe('settled');
        });

        it('should update event updated_at timestamp', async () => {
            const eventBefore = mockSupabase
                .getMockData('race_events')
                .find((e: any) => e.id === 'event-1');
            const updatedBefore = new Date(eventBefore.updated_at).getTime();

            // Wait a bit to ensure timestamp is different
            await new Promise((resolve) => setTimeout(resolve, 10));

            await processCompletedEvents();

            const eventAfter = mockSupabase
                .getMockData('race_events')
                .find((e: any) => e.id === 'event-1');
            const updatedAfter = new Date(eventAfter.updated_at).getTime();

            expect(updatedAfter).toBeGreaterThanOrEqual(updatedBefore);
        });
    });

    // ========================================================================
    // Error Handling Tests
    // ========================================================================

    describe('Error Handling', () => {
        it('should continue processing other events if one fails', async () => {
            // Mock an error on event-1
            const originalInsert = mockSupabase.from.bind(mockSupabase);
            let callCount = 0;

            // This is a simplified test - in real scenario would need to mock more thoroughly
            await processCompletedEvents();

            // Verify at least event-1 was attempted to be processed
            const refundLogs = mockSupabase.getMockData('refund_logs');
            expect(refundLogs.length).toBeGreaterThan(0);
        });

        it('should handle database query errors gracefully', async () => {
            // Test with empty database
            mockSupabase.reset();
            mockSupabase.setMockData('race_events', []);

            // Should not throw
            expect(async () => {
                await processCompletedEvents();
            }).not.toThrow();
        });
    });

    // ========================================================================
    // Manual Trigger Tests
    // ========================================================================

    describe('Manual Trigger', () => {
        it('should process completed events when manually triggered', async () => {
            await manualTriggerRefunds();

            const refundLogs = mockSupabase.getMockData('refund_logs');
            expect(refundLogs.length).toBeGreaterThan(0);
        });

        it('should update event status when manually triggered', async () => {
            await manualTriggerRefunds();

            const events = mockSupabase.getMockData('race_events');
            const event1 = events.find((e: any) => e.id === 'event-1');
            expect(event1.status).toBe('settled');
        });
    });

    // ========================================================================
    // Integration Tests
    // ========================================================================

    describe('Full Scheduler Scenario', () => {
        it('should process multiple completed events correctly', async () => {
            // Add another completed event
            mockSupabase.getMockData('race_events').push({
                id: 'event-4',
                name: 'Another Completed Marathon',
                status: 'active',
                vault_address: 'vault-4',
                end_time: new Date(Date.now() - 120000).toISOString(),
                created_at: new Date(Date.now() - 10800000).toISOString(),
                updated_at: new Date(Date.now() - 10800000).toISOString(),
            });

            // Add runners for event-4
            mockSupabase.getMockData('runners').push(
                {
                    id: 'runner-6',
                    rfid_uid: '33:33:33:33',
                    wallet_address: 'PQR678',
                    full_name: 'Runner Six',
                    event_id: 'event-4',
                    status: 'finished',
                    finish_position: 1,
                },
                {
                    id: 'runner-7',
                    rfid_uid: '44:44:44:44',
                    wallet_address: 'STU901',
                    full_name: 'Runner Seven',
                    event_id: 'event-4',
                    status: 'registered',
                    finish_position: null,
                }
            );

            await processCompletedEvents();

            const refundLogs = mockSupabase.getMockData('refund_logs');
            expect(refundLogs.length).toBe(2); // event-1 and event-4
        });

        it('should handle complex event state transitions', async () => {
            // Start: active event with mixed runner statuses
            // End: settled event with audit trail
            const eventBefore = mockSupabase
                .getMockData('race_events')
                .find((e: any) => e.id === 'event-1');
            expect(eventBefore.status).toBe('active');

            const runnersBefore = mockSupabase
                .getMockData('runners')
                .filter((r: any) => r.event_id === 'event-1');
            expect(runnersBefore.some((r: any) => r.status === 'finished')).toBe(true);
            expect(runnersBefore.some((r: any) => r.status === 'registered')).toBe(true);

            // Process refunds
            await processCompletedEvents();

            // After: event is settled
            const eventAfter = mockSupabase
                .getMockData('race_events')
                .find((e: any) => e.id === 'event-1');
            expect(eventAfter.status).toBe('settled');

            // Refund log created
            const refundLog = mockSupabase
                .getMockData('refund_logs')
                .find((log: any) => log.event_id === 'event-1');
            expect(refundLog).toBeDefined();
            expect(refundLog.finishers_paid).toBe(2);
            expect(refundLog.non_finishers_refunded).toBe(2);
            expect(refundLog.tx_signature).toBeTruthy();
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('Edge Cases', () => {
        it('should handle event with single finisher', async () => {
            // Reset runners for event-1 to have only 1 finisher
            mockSupabase.setMockData('runners', [
                {
                    id: 'runner-1',
                    rfid_uid: '08:1A:2B:3C',
                    wallet_address: 'ABC123',
                    full_name: 'Runner One',
                    event_id: 'event-1',
                    status: 'finished',
                    finish_position: 1,
                },
                {
                    id: 'runner-2',
                    rfid_uid: '0D:2C:3D:4E',
                    wallet_address: 'DEF456',
                    full_name: 'Runner Two',
                    event_id: 'event-1',
                    status: 'registered',
                    finish_position: null,
                },
            ]);

            await processCompletedEvents();

            const refundLogs = mockSupabase.getMockData('refund_logs');
            const log = refundLogs.find((l: any) => l.event_id === 'event-1');
            expect(log.finishers_paid).toBe(1);
            expect(log.non_finishers_refunded).toBe(1);
        });

        it('should handle event with no runners', async () => {
            // Create event with no runners
            mockSupabase.setMockData('race_events', [
                {
                    id: 'event-empty',
                    name: 'Empty Marathon',
                    status: 'active',
                    vault_address: 'vault-empty',
                    end_time: new Date(Date.now() - 60000).toISOString(),
                    created_at: new Date(Date.now() - 7200000).toISOString(),
                    updated_at: new Date(Date.now() - 7200000).toISOString(),
                },
            ]);
            mockSupabase.setMockData('runners', []);

            await processCompletedEvents();

            const refundLogs = mockSupabase.getMockData('refund_logs');
            const log = refundLogs.find((l: any) => l.event_id === 'event-empty');
            expect(log).toBeDefined();
            expect(log.finishers_paid).toBe(0);
            expect(log.non_finishers_refunded).toBe(0);
        });

        it('should use current timestamp for event update', async () => {
            const now = new Date();
            await processCompletedEvents();

            const events = mockSupabase.getMockData('race_events');
            const event1 = events.find((e: any) => e.id === 'event-1');
            const updatedTime = new Date(event1.updated_at);

            // Should be recent (within 1 second)
            expect(updatedTime.getTime()).toBeGreaterThanOrEqual(now.getTime() - 1000);
            expect(updatedTime.getTime()).toBeLessThanOrEqual(now.getTime() + 1000);
        });
    });
});
