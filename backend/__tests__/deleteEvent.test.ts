/**
 * Test: Delete Event Endpoint
 * Tests the DELETE /api/events/:id endpoint functionality
 * including refund logic and database cleanup
 */

import request from 'supertest';
import { supabase } from '../src/lib/supabase';
import crypto from 'crypto';

// Note: This test requires a running backend server
// Run with: npm test -- deleteEvent.test.ts

const BACKEND_URL = 'http://localhost:3001';
const TEST_EVENT_ID = crypto.randomUUID();

describe('DELETE /api/events/:id', () => {
    // Setup: Create a test event with participants
    beforeAll(async () => {
        console.log('Setting up test event and participants...');

        // Create test event
        const { error: eventError } = await supabase
            .from('race_events')
            .insert([
                {
                    id: TEST_EVENT_ID,
                    name: 'Test Event for Deletion',
                    description: 'This event will be deleted during testing',
                    registration_fee_sol: 0.1,
                    vault_address: 'test-vault-address',
                    status: 'pending',
                    start_time: new Date().toISOString(),
                    duration_hours: 2,
                    creator_wallet: 'test-creator-wallet',
                    max_participants: 10,
                },
            ]);

        if (eventError) {
            throw new Error(`Failed to create test event: ${eventError.message}`);
        }

        // Create test participants
        const { error: participantsError } = await supabase
            .from('runners')
            .insert([
                {
                    chip_uid: 'TEST_CHIP_001',
                    wallet_address: 'wallet_001',
                    full_name: 'Test Runner 1',
                    event_id: TEST_EVENT_ID,
                    status: 'registered',
                    finish_position: null,
                },
                {
                    chip_uid: 'TEST_CHIP_002',
                    wallet_address: 'wallet_002',
                    full_name: 'Test Runner 2',
                    event_id: TEST_EVENT_ID,
                    status: 'registered',
                    finish_position: null,
                },
            ]);

        if (participantsError) {
            throw new Error(`Failed to create test participants: ${participantsError.message}`);
        }

        console.log('✓ Test setup complete');
    });

    test('DELETE /api/events/:id should delete event and refund participants', async () => {
        // Verify event exists before deletion
        const { data: eventBefore } = await supabase
            .from('race_events')
            .select('*')
            .eq('id', TEST_EVENT_ID)
            .single();

        expect(eventBefore).toBeDefined();
        expect(eventBefore?.name).toBe('Test Event for Deletion');

        // Call delete endpoint
        const response = await request(BACKEND_URL)
            .delete(`/api/events/${TEST_EVENT_ID}`)
            .set('Content-Type', 'application/json');

        // Verify response
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
        expect(response.body.message).toContain('deleted successfully');
        expect(response.body.details.participantsRefunded).toBe(2);

        console.log('Response:', response.body);

        // Verify event is deleted from database
        const { data: eventAfter, error: eventError } = await supabase
            .from('race_events')
            .select('*')
            .eq('id', TEST_EVENT_ID)
            .single();

        // Event should be deleted (either returns null or error)
        expect(eventAfter).toBeNull();

        // Verify participants are deleted
        const { data: participantsAfter } = await supabase
            .from('runners')
            .select('*')
            .eq('event_id', TEST_EVENT_ID);

        expect(participantsAfter).toEqual([]);

        console.log('✓ Event and participants successfully deleted');
    });

    test('DELETE /api/events/:id with non-existent event should return error', async () => {
        const nonExistentId = crypto.randomUUID();

        const response = await request(BACKEND_URL)
            .delete(`/api/events/${nonExistentId}`)
            .set('Content-Type', 'application/json');

        expect(response.status).toBe(400);
        expect(response.body.status).toBe('error');
        expect(response.body.message).toContain('not found');

        console.log('✓ Non-existent event correctly returns error');
    });

    test('DELETE /api/events/:id without event ID should return 400', async () => {
        const response = await request(BACKEND_URL)
            .delete(`/api/events/`)
            .set('Content-Type', 'application/json');

        // 404 expected for missing parameter in route
        expect([400, 404]).toContain(response.status);

        console.log('✓ Missing event ID correctly returns error');
    });

    // Cleanup
    afterAll(async () => {
        console.log('Cleaning up test data...');
        
        // Make sure event and participants are deleted
        await supabase.from('runners').delete().eq('event_id', TEST_EVENT_ID);
        await supabase.from('race_events').delete().eq('id', TEST_EVENT_ID);

        console.log('✓ Cleanup complete');
    });
});
