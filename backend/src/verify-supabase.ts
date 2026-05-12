/**
 * Supabase Connection Verification Script
 * Run: npx tsx src/verify-supabase.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pdetefmmvwqoxhknumbf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function verify() {
    console.log('🔗 Connecting to Supabase...');
    console.log(`   URL: ${SUPABASE_URL}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Test 1: Query race_events
    console.log('\n📋 Test 1: Query race_events...');
    const { data: events, error: eventsError } = await supabase
        .from('race_events')
        .select('*');

    if (eventsError) {
        console.error('   ❌ FAILED:', eventsError.message);
        return;
    }
    console.log(`   ✅ Found ${events.length} event(s)`);
    events.forEach(e => console.log(`      - ${e.name} [${e.status}]`));

    // Test 2: Query runners
    console.log('\n🏃 Test 2: Query runners...');
    const { data: runners, error: runnersError } = await supabase
        .from('runners')
        .select('*');

    if (runnersError) {
        console.error('   ❌ FAILED:', runnersError.message);
        return;
    }
    console.log(`   ✅ Found ${runners.length} runner(s)`);
    runners.forEach(r => console.log(`      - ${r.full_name} (${r.rfid_uid}) [${r.status}]`));

    // Test 3: Query race_logs
    console.log('\n📝 Test 3: Query race_logs...');
    const { data: logs, error: logsError } = await supabase
        .from('race_logs')
        .select('*');

    if (logsError) {
        console.error('   ❌ FAILED:', logsError.message);
        return;
    }
    console.log(`   ✅ Found ${logs.length} log(s) (expected 0 for fresh setup)`);

    console.log('\n🎉 All Supabase tables verified successfully!');
}

verify().catch(console.error);
