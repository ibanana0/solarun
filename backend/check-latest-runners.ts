import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
    const { data: events } = await supabase.from('race_events').select('*').order('created_at', { ascending: false }).limit(1);
    console.log("LATEST EVENT:", events?.[0]?.name, events?.[0]?.status);
    
    if (events && events.length > 0) {
        const { data: runners } = await supabase.from('runners').select('rfid_uid, status, finish_position, tx_signature').eq('event_id', events[0].id);
        console.log("RUNNERS:");
        console.table(runners);
    }
}
run();
