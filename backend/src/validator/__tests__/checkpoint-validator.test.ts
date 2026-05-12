import { validateCheckpoint } from '../checkpoint-validator';
import { mockSupabase } from '../../mocks/supabase.mock';

jest.mock('../../lib/supabase', () => ({
    supabase: require('../../mocks/supabase.mock').mockSupabase,
}));

describe('Checkpoint Validator', () => {
    beforeEach(() => {
        mockSupabase.reset();
        
        mockSupabase.setMockData('race_events', [
            { id: 'event-1', status: 'active' }
        ]);

        mockSupabase.setMockData('runners', [
            { id: 'runner-1', rfid_uid: 'CHIP_123', event_id: 'event-1', status: 'registered', finish_position: null },
            { id: 'runner-2', rfid_uid: 'CHIP_456', event_id: 'event-1', status: 'finished', finish_position: 1 },
        ]);
        
        mockSupabase.setMockData('race_logs', []);
    });

    it('should reject missing rfid_uid', async () => {
        const result = await validateCheckpoint({
            rfid_uid: '',
            checkpoint_id: 0,
            timestamp: new Date().toISOString(),
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Missing or empty rfid_uid');
    });

    it('should reject invalid checkpoint_id', async () => {
        const result = await validateCheckpoint({
            rfid_uid: 'CHIP_123',
            checkpoint_id: 5,
            timestamp: new Date().toISOString(),
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid checkpoint_id');
    });

    it('should reject if runner not found', async () => {
        const result = await validateCheckpoint({
            rfid_uid: 'CHIP_UNKNOWN',
            checkpoint_id: 0,
            timestamp: new Date().toISOString(),
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Runner not found');
    });

    it('should reject if runner already finished', async () => {
        const result = await validateCheckpoint({
            rfid_uid: 'CHIP_456',
            checkpoint_id: 2,
            timestamp: new Date().toISOString(),
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('has already finished');
    });

    it('should accept valid start checkpoint (0)', async () => {
        const result = await validateCheckpoint({
            rfid_uid: 'CHIP_123',
            checkpoint_id: 0,
            timestamp: new Date().toISOString(),
        });
        expect(result.valid).toBe(true);
        expect(result.is_finish).toBe(false);
        
        const runners = mockSupabase.getMockData('runners');
        expect(runners[0].status).toBe('running');
    });

    it('should reject out-of-order checkpoint (skip 1, jump to 2)', async () => {
        mockSupabase.getMockData('runners')[0].status = 'running';
        mockSupabase.getMockData('race_logs').push({
            id: 'log-1', runner_id: 'runner-1', checkpoint_id: 0, timestamp: new Date(Date.now() - 60000).toISOString()
        });

        const result = await validateCheckpoint({
            rfid_uid: 'CHIP_123',
            checkpoint_id: 2,
            timestamp: new Date().toISOString(),
        });

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid checkpoint order');
    });

    it('should reject duplicate taps within 30s', async () => {
        // Runner has already started (checkpoint 0) and is at checkpoint 1
        mockSupabase.getMockData('runners')[0].status = 'running';
        const now = new Date();

        // Previous logs: start (cp 0) done long ago, checkpoint 1 just now
        mockSupabase.setMockData('race_logs', [
            { id: 'log-0', runner_id: 'runner-1', checkpoint_id: 0, timestamp: new Date(now.getTime() - 120000).toISOString() },
            { id: 'log-1', runner_id: 'runner-1', checkpoint_id: 1, timestamp: now.toISOString() }, // checkpoint 1 just happened
        ]);

        // Try to tap checkpoint 1 again within 30s (duplicate)
        const result = await validateCheckpoint({
            rfid_uid: 'CHIP_123',
            checkpoint_id: 1,
            timestamp: new Date(now.getTime() + 1000).toISOString(), // 1 second later
        });

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Duplicate tap');
    });


    it('should accept valid finish checkpoint (2) and assign position', async () => {
        mockSupabase.getMockData('runners')[0].status = 'running';
        const now = new Date();
        mockSupabase.getMockData('race_logs').push({
            id: 'log-1', runner_id: 'runner-1', checkpoint_id: 1, timestamp: new Date(now.getTime() - 60000).toISOString()
        });

        const result = await validateCheckpoint({
            rfid_uid: 'CHIP_123',
            checkpoint_id: 2,
            timestamp: now.toISOString(),
        });

        expect(result.valid).toBe(true);
        expect(result.is_finish).toBe(true);
        expect(result.finish_position).toBe(2); // Since runner-2 is already finished with position 1
        
        const runners = mockSupabase.getMockData('runners');
        expect(runners[0].status).toBe('finished');
        expect(runners[0].finish_position).toBe(2);
    });
});
