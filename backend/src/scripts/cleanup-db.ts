import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function cleanup() {
    console.log('🧹 Cleaning up race_events and runners...');
    
    // Delete in correct order to satisfy FK constraints
    await supabase.from('race_logs').delete().neq('id', 0);
    await supabase.from('runners').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('race_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    console.log('✅ Database cleaned successfully.');
}

cleanup().catch(console.error);
