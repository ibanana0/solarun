import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function test() {
    const { data, error } = await supabase.from('race_events').insert({
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Event',
        description: 'Test',
        registration_fee_sol: 10,
        max_participants: 100,
        status: 'Initialized',
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        creator_wallet: 'A7PqEe2t83XkEmVT3ToaTr5pubUAKwMGyAZdg69gUsyv',
        tx_signature: 'fake_sig',
        vault_address: 'fake_vault'
    }).select();
    
    console.log(error);
}
test();
