import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
    // We cannot easily run DDL commands (ALTER TABLE) via supabase-js REST api.
    // However, the user is likely running local migrations or using the dashboard.
    // Let's try to execute a raw SQL query using rpc if available.
    // Wait, let's just create a small script that tries to update a row to see if the columns exist.
    const { data, error } = await supabase.from('runners').select('last_checkpoint, last_checkpoint_at').limit(1);
    console.log(data, error);
}
run();
