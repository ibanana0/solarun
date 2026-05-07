import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
    const { data, error } = await supabase.from('runners').update({ status: 'finished', processing_started_at: null }).eq('status', 'running').select();
    console.log(data, error);
}
run();
