import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function checkRunners(eventId: string) {
    console.log(`\n🔍 Checking runners for Event ID: ${eventId}...`);
    
    // Check if event exists first
    const { data: event, error: eventError } = await supabase
        .from('race_events')
        .select('name, status')
        .eq('id', eventId)
        .single();
        
    if (eventError) {
        console.error(`❌ Event not found or invalid ID format:`, eventError.message);
        process.exit(1);
    }
    
    console.log(`📋 Event: ${event.name} (Status: ${event.status})`);

    const { data: runners, error: runnersError } = await supabase
        .from('runners')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

    if (runnersError) {
        console.error('❌ Error fetching runners:', runnersError.message);
        process.exit(1);
    }

    if (!runners || runners.length === 0) {
        console.log('⚠️  No runners registered for this event.');
    } else {
        console.log(`✅ Found ${runners.length} registered runners:\n`);
        console.log('No | Name            | Chip UID    | Status     | Position | TX Signature');
        console.log('---+-----------------+-------------+------------+----------+------------------');
        runners.forEach((r, idx) => {
            const pos = r.finish_position ? `#${r.finish_position}`.padEnd(8) : '-'.padEnd(8);
            const tx = r.tx_signature ? r.tx_signature.slice(0, 16) + '...' : '-';
            console.log(
                `${String(idx + 1).padEnd(2)} | ${(r.full_name || '').padEnd(15)} | ${(r.chip_uid || '').padEnd(11)} | ${(r.status || '').padEnd(10)} | ${pos} | ${tx}`
            );
        });
    }
    
    console.log('\n✅ Check complete.');
    process.exit(0);
}

rl.question('Enter Event ID to check: ', (answer) => {
    const eventId = answer.trim();
    if (!eventId) {
        console.error('❌ Event ID cannot be empty!');
        process.exit(1);
    }
    checkRunners(eventId);
});
