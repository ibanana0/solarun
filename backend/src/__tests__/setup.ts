/**
 * Jest Test Setup
 * Configures mocks and test environment
 */

// Mock environment variables
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.ADMIN_KEYPAIR_PATH = './test-keypair.json';
process.env.SOLARUN_PROGRAM_ID = 'TestProgramId11111111111111111111111111111111';
process.env.VAULT_ADDRESS = 'TestVaultAddress1111111111111111111111111111111';
process.env.MQTT_BROKER_URL = 'mqtt://localhost:1883';
process.env.MQTT_TOPIC = 'race/checkpoint';
process.env.REFUND_SCHEDULER_INTERVAL = '*/1 * * * *';

// Suppress console logs during tests
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    // Keep error for debugging
    error: jest.fn(),
};

// Add custom matchers if needed
expect.extend({
    toBeValidUUID(received: string) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const pass = uuidRegex.test(received);
        return {
            pass,
            message: () => `Expected ${received} to be a valid UUID`,
        };
    },
    toBeWithinRange(received: number, floor: number, ceiling: number) {
        const pass = received >= floor && received <= ceiling;
        return {
            pass,
            message: () =>
                pass
                    ? `Expected ${received} not to be within range ${floor} - ${ceiling}`
                    : `Expected ${received} to be within range ${floor} - ${ceiling}`,
        };
    },
});

declare global {
    namespace jest {
        interface Matchers<R> {
            toBeValidUUID(): R;
            toBeWithinRange(floor: number, ceiling: number): R;
        }
    }
}
