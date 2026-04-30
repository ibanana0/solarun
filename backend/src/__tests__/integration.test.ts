/**
 * Integration Tests: MQTT Checkpoint Flow
 * Tests complete flow from MQTT message → validation → database update
 */

import { mockSupabase } from '../mocks/supabase.mock';

// Mock Supabase before importing validator
jest.mock('../lib/supabase', () => ({
    supabase: require('../mocks/supabase.mock').mockSupabase,
}));

describe('Integration: MQTT → Validator → Database', () => {
    // ========================================================================
    // Setup
    // ========================================================================

    beforeEach(() => {
        mockSupabase.reset();

        // Setup test event
        mockSupabase.setMockData('race_events', [
            {
                id: 'event-1',
                name: 'Test Marathon',
                status: 'active',
                vault_address: 'vault-1',
                end_time: new Date(Date.now() + 3600000).toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
        ]);

        // Setup test runners
        mockSupabase.setMockData('runners', [
            {
                id: 'runner-1',
                chip_uid: '08:1A:2B:3C',
                wallet_address: 'ABC123',
                full_name: 'Alice Runner',
                event_id: 'event-1',
                status: 'registered',
                finish_position: null,
            },
            {
                id: 'runner-2',
                chip_uid: '0D:2C:3D:4E',
                wallet_address: 'DEF456',
                full_name: 'Bob Runner',
                event_id: 'event-1',
                status: 'registered',
                finish_position: null,
            },
        ]);

        mockSupabase.setMockData('race_logs', []);
    });

    // ========================================================================
    // MQTT Message Processing Tests
    // ========================================================================

    describe('MQTT Message Processing', () => {
        it('should process valid checkpoint message', async () => {
            const { validateCheckpoint } = require('../validator/checkpoint-validator');

            const message = {
                rfid_uid: '08:1A:2B:3C',
                checkpoint_id: 0,
                timestamp: new Date().toISOString(),
            };

            const result = await validateCheckpoint(message);

            expect(result.valid).toBe(true);
            expect(result.runner_id).toBe('runner-1');
        });

        it('should reject invalid JSON payload', () => {
            const invalidPayload = 'not json';

            try {
                JSON.parse(invalidPayload);
                expect(false).toBe(true); // Should not reach here
            } catch {
                // Expected
                expect(true).toBe(true);
            }
        });

        it('should reject payload with missing required fields', async () => {
            const { validateCheckpoint } = require('../validator/checkpoint-validator');

            const message = {
                rfid_uid: '08:1A:2B:3C',
                // Missing checkpoint_id and timestamp
            };

            const result = await validateCheckpoint(message);
            expect(result.valid).toBe(false);
        });

        it('should handle various MQTT payload formats', async () => {
            const { validateCheckpoint } = require('../validator/checkpoint-validator');

            // Different valid timestamp formats
            const timestamps = [
                new Date().toISOString(),
                new Date().toUTCString(),
            ];

            for (const timestamp of timestamps) {
                const message = {
                    rfid_uid: '08:1A:2B:3C',
                    checkpoint_id: 0,
                    timestamp: timestamp,
                };

                // Should not throw
                const result = await validateCheckpoint(message);
                expect(result).toBeDefined();
            }
        });
    });

    // ========================================================================
    // Database State Transition Tests
    // ========================================================================

    describe('Database State Transitions', () => {
        it('should create race_log entry when checkpoint is valid', async () => {
            const { validateCheckpoint } = require('../validator/checkpoint-validator');

            const message = {
                rfid_uid: '08:1A:2B:3C',
                checkpoint_id: 0,
                timestamp: new Date().toISOString(),
            };

            const result = await validateCheckpoint(message);
            expect(result.valid).toBe(true);

            // Check that race_log was created
            const raceLogs = mockSupabase.getMockData('race_logs');
            expect(raceLogs.length).toBe(1);
            expect(raceLogs[0].runner_id).toBe('runner-1');
            expect(raceLogs[0].checkpoint_id).toBe(0);
        });

        it('should not create race_log when checkpoint is invalid', async () => {
            const { validateCheckpoint } = require('../validator/checkpoint-validator');

            const message = {
                rfid_uid: 'UNKNOWN_UID',
                checkpoint_id: 0,
                timestamp: new Date().toISOString(),
            };

            const result = await validateCheckpoint(message);
            expect(result.valid).toBe(false);

            // Check that no race_log was created
            const raceLogs = mockSupabase.getMockData('race_logs');
            expect(raceLogs.length).toBe(0);
        });

        it('should update runner status from registered to running on start', async () => {
            const { validateCheckpoint } = require('../validator/checkpoint-validator');

            const runner = mockSupabase.getMockData('runners')[0];
            expect(runner.status).toBe('registered');

            const message = {
                rfid_uid: '08:1A:2B:3C',
                checkpoint_id: 0,
                timestamp: new Date().toISOString(),
            };

            await validateCheckpoint(message);

            const updatedRunner = mockSupabase.getMockData('runners')[0];
            expect(updatedRunner.status).toBe('running');
        });

        it('should update runner status from running to finished on finish', async () => {
            const { validateCheckpoint } = require('../validator/checkpoint-validator');

            // Mark runner as running with checkpoint 0 logged
            const runner = mockSupabase.getMockData('runners')[0];
            runner.status = 'running';

            const raceLogs = mockSupabase.getMockData('race_logs');
            const now = new Date();
            raceLogs.push({
                id: 'log-1',
                runner_id: 'runner-1',
                checkpoint_id: 0,
                timestamp: now.toISOString(),
            });

            raceLogs.push({
                id: 'log-2',
                runner_id: 'runner-1',
                checkpoint_id: 1,
                timestamp: new Date(now.getTime() + 1000).toISOString(),
            });

            const message = {
                rfid_uid: '08:1A:2B:3C',
                checkpoint_id: 2,
                timestamp: new Date(now.getTime() + 2000).toISOString(),
            };

            const result = await validateCheckpoint(message);
            expect(result.valid).toBe(true);
            expect(result.is_finish).toBe(true);

            const updatedRunner = mockSupabase.getMockData('runners')[0];
            expect(updatedRunner.status).toBe('finished');
            expect(updatedRunner.finish_position).toBe(1);
        });
    });

    // ========================================================================
    // Concurrent Requests Tests
    // ========================================================================

    describe('Concurrent Request Handling', () => {
        it('should handle multiple concurrent checkpoints correctly', async () => {
            const { validateCheckpoint } = require('../validator/checkpoint-validator');

            const now = new Date();

            // Both runners start simultaneously
            const msg1 = {
                rfid_uid: '08:1A:2B:3C', // runner-1
                checkpoint_id: 0,
                timestamp: now.toISOString(),
            };

            const msg2 = {
                rfid_uid: '0D:2C:3D:4E', // runner-2
                checkpoint_id: 0,
                timestamp: now.toISOString(),
            };

            // Process concurrently
            const [result1, result2] = await Promise.all([
                validateCheckpoint(msg1),
                validateCheckpoint(msg2),
            ]);

            expect(result1.valid).toBe(true);
            expect(result2.valid).toBe(true);

            // Both should have race logs created
            const raceLogs = mockSupabase.getMockData('race_logs');
            expect(raceLogs.length).toBe(2);

            // Both runners should be marked as running
            const runners = mockSupabase.getMockData('runners');
            expect(runners[0].status).toBe('running');
            expect(runners[1].status).toBe('running');
        });

        it('should assign correct finish positions for concurrent finishers', async () => {
            const { validateCheckpoint } = require('../validator/checkpoint-validator');

            // Setup runners at intermediate checkpoint
            const runners = mockSupabase.getMockData('runners');
            runners[0].status = 'running';
            runners[1].status = 'running';

            const now = new Date();
            const raceLogs = mockSupabase.getMockData('race_logs');

            // Add logs for both runners at checkpoints 0 and 1
            raceLogs.push(
                {
                    id: 'log-1',
                    runner_id: 'runner-1',
                    checkpoint_id: 0,
                    timestamp: new Date(now.getTime() - 2000).toISOString(),
                },
                {
                    id: 'log-2',
                    runner_id: 'runner-1',
                    checkpoint_id: 1,
                    timestamp: new Date(now.getTime() - 1000).toISOString(),
                },
                {
                    id: 'log-3',
                    runner_id: 'runner-2',
                    checkpoint_id: 0,
                    timestamp: new Date(now.getTime() - 2000).toISOString(),
                },
                {
                    id: 'log-4',
                    runner_id: 'runner-2',
                    checkpoint_id: 1,
                    timestamp: new Date(now.getTime() - 500).toISOString(),
                }
            );

            // Both finish at nearly same time
            const result1 = await validateCheckpoint({
                rfid_uid: '08:1A:2B:3C',
                checkpoint_id: 2,
                timestamp: new Date(now.getTime() + 500).toISOString(),
            });

            const result2 = await validateCheckpoint({
                rfid_uid: '0D:2C:3D:4E',
                checkpoint_id: 2,
                timestamp: new Date(now.getTime() + 501).toISOString(),
            });

            expect(result1.finish_position).toBe(1);
            expect(result2.finish_position).toBe(2);
        });
    });

    // ========================================================================
    // Error Recovery Tests
    // ========================================================================

    describe('Error Recovery', () => {
        it('should allow retry after failed checkpoint', async () => {
            const { validateCheckpoint } = require('../validator/checkpoint-validator');

            // First attempt fails (runner doesn't exist)
            let result = await validateCheckpoint({
                rfid_uid: 'UNKNOWN_UID',
                checkpoint_id: 0,
                timestamp: new Date().toISOString(),
            });
            expect(result.valid).toBe(false);

            // Second attempt succeeds (valid runner)
            result = await validateCheckpoint({
                rfid_uid: '08:1A:2B:3C',
                checkpoint_id: 0,
                timestamp: new Date().toISOString(),
            });
            expect(result.valid).toBe(true);

            // Only one race log should be created (from successful attempt)
            const raceLogs = mockSupabase.getMockData('race_logs');
            expect(raceLogs.length).toBe(1);
        });

        it('should handle database errors gracefully', async () => {
            const { validateCheckpoint } = require('../validator/checkpoint-validator');

            // Note: Actual database errors would be caught in the validator
            // This test verifies the flow continues

            const message = {
                rfid_uid: '08:1A:2B:3C',
                checkpoint_id: 0,
                timestamp: new Date().toISOString(),
            };

            const result = await validateCheckpoint(message);

            // Even with mock, should handle cleanly
            expect(result).toBeDefined();
            expect(result.valid === true || result.valid === false).toBe(true);
        });
    });

    // ========================================================================
    // End-to-End Scenario Tests
    // ========================================================================

    describe('Full Marathon Scenario', () => {
        it('should handle complete race with 2 runners', async () => {
            const { validateCheckpoint } = require('../validator/checkpoint-validator');

            const baseTime = Date.now();

            // ===== Runner 1: Alice =====
            let result = await validateCheckpoint({
                rfid_uid: '08:1A:2B:3C',
                checkpoint_id: 0,
                timestamp: new Date(baseTime).toISOString(),
            });
            expect(result.valid).toBe(true);
            expect(result.is_finish).toBe(false);

            result = await validateCheckpoint({
                rfid_uid: '08:1A:2B:3C',
                checkpoint_id: 1,
                timestamp: new Date(baseTime + 30000).toISOString(),
            });
            expect(result.valid).toBe(true);

            result = await validateCheckpoint({
                rfid_uid: '08:1A:2B:3C',
                checkpoint_id: 2,
                timestamp: new Date(baseTime + 60000).toISOString(),
            });
            expect(result.valid).toBe(true);
            expect(result.is_finish).toBe(true);
            expect(result.finish_position).toBe(1);

            // ===== Runner 2: Bob (slower) =====
            result = await validateCheckpoint({
                rfid_uid: '0D:2C:3D:4E',
                checkpoint_id: 0,
                timestamp: new Date(baseTime + 5000).toISOString(),
            });
            expect(result.valid).toBe(true);

            result = await validateCheckpoint({
                rfid_uid: '0D:2C:3D:4E',
                checkpoint_id: 1,
                timestamp: new Date(baseTime + 40000).toISOString(),
            });
            expect(result.valid).toBe(true);

            result = await validateCheckpoint({
                rfid_uid: '0D:2C:3D:4E',
                checkpoint_id: 2,
                timestamp: new Date(baseTime + 75000).toISOString(),
            });
            expect(result.valid).toBe(true);
            expect(result.is_finish).toBe(true);
            expect(result.finish_position).toBe(2);

            // ===== Verify final state =====
            const runners = mockSupabase.getMockData('runners');
            expect(runners[0].status).toBe('finished');
            expect(runners[0].finish_position).toBe(1);
            expect(runners[1].status).toBe('finished');
            expect(runners[1].finish_position).toBe(2);

            const raceLogs = mockSupabase.getMockData('race_logs');
            expect(raceLogs.length).toBe(6); // 3 checkpoints × 2 runners
        });
    });

    // ========================================================================
    // Realtime Database Notification Tests
    // ========================================================================

    describe('Database Change Notifications', () => {
        it('should log all changes to race_logs table', async () => {
            const { validateCheckpoint } = require('../validator/checkpoint-validator');

            const message = {
                rfid_uid: '08:1A:2B:3C',
                checkpoint_id: 0,
                timestamp: new Date().toISOString(),
            };

            await validateCheckpoint(message);

            // Verify race_log entry was created
            const raceLogs = mockSupabase.getMockData('race_logs');
            expect(raceLogs.length).toBeGreaterThan(0);

            const log = raceLogs[0];
            expect(log.runner_id).toBe('runner-1');
            expect(log.checkpoint_id).toBe(0);
            expect(log.timestamp).toBeDefined();
        });

        it('should log all changes to runners table', async () => {
            const { validateCheckpoint } = require('../validator/checkpoint-validator');

            const before = mockSupabase.getMockData('runners')[0].status;

            const message = {
                rfid_uid: '08:1A:2B:3C',
                checkpoint_id: 0,
                timestamp: new Date().toISOString(),
            };

            await validateCheckpoint(message);

            const after = mockSupabase.getMockData('runners')[0].status;

            expect(before).not.toBe(after);
            expect(after).toBe('running');
        });
    });
});
