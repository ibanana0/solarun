/**
 * SolaRun Full Race Simulation Script
 * 
 * Simulates:
 * 1. Event Creation
 * 2. Runner Registration
 * 3. Race Progression (Start -> Mid -> Finish)
 * 4. Event Completion & Refund Processing
 * 
 * Run: npx tsx src/simulate-full-race.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Keypair } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import { validateCheckpoint } from './validator/checkpoint-validator';
import { manualTriggerRefunds } from './scheduler/refund-scheduler';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function simulate() {
    console.log('🚀 STARTING FULL RACE SIMULATION\n');

    // 1. CREATE EVENT
    console.log('Step 1: Creating "SolaRun Simulation Race"...');
    const startTime = new Date(Date.now() + 2000); // starts in 2s
    const endTime = new Date(startTime.getTime() + 5000); // ends 5s after start

    const { data: event, error: eventError } = await supabase
        .from('race_events')
        .insert({
            name: 'SolaRun Simulation Race',
            description: 'Automated E2E Simulation',
            registration_fee_sol: 0.1,
            status: 'active',
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            max_participants: 10
        })
        .select()
        .single();

    if (eventError) throw eventError;
    console.log(`✅ Event created: ${event.id}\n`);

    // 2. REGISTER RUNNERS (Using real keypairs)
    console.log('Step 2: Registering 3 Runners with Real Wallets...');
    const runnerNames = ['Alice Pemenang', 'Bob Runner', 'Charlie Finish'];
    const chips = ['SIM_CHIP_001', 'SIM_CHIP_002', 'SIM_CHIP_003'];
    
    const runners = [];
    for (let i = 0; i < runnerNames.length; i++) {
        // Load generated keypair
        const walletPath = path.join(process.cwd(), '..', 'sim-wallets', `runner${i + 1}.json`);
        let walletAddress = `DEV_WALLET_${i + 1}`; // fallback
        try {
            const secretKeyString = fs.readFileSync(walletPath, 'utf-8');
            const secretKeyBytes = Uint8Array.from(JSON.parse(secretKeyString));
            const keypair = Keypair.fromSecretKey(secretKeyBytes);
            walletAddress = keypair.publicKey.toBase58();
        } catch (e) {
            console.warn(`⚠️ Could not load wallet ${walletPath}. Using fallback.`);
        }

        const { data: runner, error: rError } = await supabase
            .from('runners')
            .insert({
                full_name: runnerNames[i],
                chip_uid: chips[i],
                wallet_address: walletAddress,
                event_id: event.id,
                status: 'registered'
            })
            .select()
            .single();
        if (rError) throw rError;
        runners.push(runner);
        console.log(`   👤 Registered: ${runner.full_name} (${runner.chip_uid})`);
    }
    console.log('');

    // 3. START RACE (Checkpoint 0)
    console.log('Step 3: Race Started! Runners hitting Start Checkpoint (0)...');
    for (const r of runners) {
        await validateCheckpoint({ rfid_uid: r.chip_uid, checkpoint_id: 0, timestamp: new Date().toISOString() });
        console.log(`   🏁 ${r.full_name} started.`);
    }
    await sleep(1000);

    // 4. MID POINT (Checkpoint 1)
    console.log('\nStep 4: Runners passing Mid-Point (1)...');
    for (const r of runners) {
        await validateCheckpoint({ rfid_uid: r.chip_uid, checkpoint_id: 1, timestamp: new Date().toISOString() });
        console.log(`   📍 ${r.full_name} passed intermediate point.`);
    }
    await sleep(1000);

    // 5. FINISH LINE (Checkpoint 2)
    console.log('\nStep 5: Runners crossing Finish Line (2)!');
    // Alice 1st, Bob 2nd, Charlie 3rd
    for (let i = 0; i < runners.length; i++) {
        const r = runners[i];
        const res = await validateCheckpoint({ rfid_uid: r.chip_uid, checkpoint_id: 2, timestamp: new Date().toISOString() });
        console.log(`   🏆 ${r.full_name} FINISHED #${res.finish_position}`);
        await sleep(500);
    }

    // 6. PROCESS REFUNDS
    console.log('\nStep 6: Simulating Event Completion...');
    console.log('   (Setting status to completed to trigger scheduler logic)');
    await supabase.from('race_events').update({ status: 'completed' }).eq('id', event.id);
    
    console.log('   Triggering Refund Scheduler...');
    await manualTriggerRefunds();

    // 7. VERIFY RESULTS
    console.log('\nStep 7: Verifying Final State...');
    const { data: finalEvent } = await supabase.from('race_events').select('status').eq('id', event.id).single();
    const { data: finalRunners } = await supabase.from('runners').select('full_name, status, finish_position').eq('event_id', event.id).order('finish_position');

    console.log(`   Event Status: ${finalEvent?.status}`);
    finalRunners?.forEach(r => {
        console.log(`   - ${r.full_name}: ${r.status} #${r.finish_position}`);
    });

    console.log('\n✨ SIMULATION COMPLETE!');
}

simulate().catch(e => {
    console.error('\n❌ Simulation Failed:', e.message);
});
