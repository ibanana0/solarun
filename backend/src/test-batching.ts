
import 'dotenv/config';
import { supabase } from './lib/supabase';
import { manualTriggerRefunds } from './scheduler/refund-scheduler';
import { 
    initBlockchainClient, 
    initializeEventOnChain, 
    startRaceOnChain, 
    completeRaceOnChain 
} from './blockchain/transaction-signer';
import { Keypair } from '@solana/web3.js';
import * as anchor from "@coral-xyz/anchor";
import { v4 as uuidv4 } from 'uuid';

async function testBatching() {
    console.log('🚀 Starting Batching Verification Test');
    
    initBlockchainClient();

    const eventId = uuidv4();
    console.log(`📡 Generated Event ID: ${eventId}`);

    // 1. Initialize On-Chain
    console.log('⏳ Initializing event on-chain...');
    const startTime = new anchor.BN(Math.floor(Date.now() / 1000) - 3600); // 1 hour ago
    const endTime = new anchor.BN(Math.floor(Date.now() / 1000) - 1800); // 30 mins ago
    
    const { vaultAddress } = await initializeEventOnChain(
        eventId,
        100,
        new anchor.BN(1000000), // 1 USDC
        startTime,
        endTime
    );
    console.log(`✅ Event initialized on-chain. Vault: ${vaultAddress}`);

    // 2. Start Race On-Chain
    console.log('⏳ Starting race on-chain...');
    await startRaceOnChain(eventId);
    console.log('✅ Race started on-chain');

    // 3. Complete Race On-Chain
    console.log('⏳ Completing race on-chain...');
    await completeRaceOnChain(eventId);
    console.log('✅ Race completed on-chain');

    // 4. Create in DB
    const { data: event, error: eventError } = await supabase
        .from('race_events')
        .insert({
            id: eventId,
            name: 'Batching Test Race',
            status: 'active', // Set to active so scheduler picks it up
            end_time: new Date(Date.now() - 10000).toISOString(),
            vault_address: vaultAddress,
        })
        .select()
        .single();

    if (eventError) {
        console.error('❌ Failed to create event in DB:', eventError);
        return;
    }
    console.log(`✅ Created test event in DB: ${event.id}`);

    // 5. Create 20 runners
    console.log('⏳ Registering 20 runners...');
    const runners = [];
    for (let i = 0; i < 20; i++) {
        // chip_uid must be <= 20 chars
        // Using "B" + index + last 6 of timestamp
        const chip_uid = `B${i}_${Date.now().toString().slice(-6)}`;
        
        runners.push({
            event_id: event.id,
            full_name: `Runner ${i}`,
            chip_uid: chip_uid,
            wallet_address: Keypair.generate().publicKey.toBase58(),
            status: 'registered'
        });
    }

    const { error: runnersError } = await supabase.from('runners').insert(runners);
    if (runnersError) {
        console.error('❌ Failed to create runners:', runnersError);
        return;
    }
    console.log('✅ Registered 20 runners');

    // 6. Trigger refunds
    console.log('🔄 Triggering manual refunds...');
    // manualTriggerRefunds calls processCompletedEvents which checks for status='completed'
    await manualTriggerRefunds();

    // 7. Verify
    const { data: finalEvent } = await supabase
        .from('race_events')
        .select('status')
        .eq('id', event.id)
        .single();
    
    console.log(`🏁 Final Event Status: ${finalEvent?.status}`);
    
    const { data: processedRunners } = await supabase
        .from('runners')
        .select('id, tx_signature')
        .eq('event_id', event.id);
    
    const withTx = processedRunners?.filter(r => r.tx_signature) || [];
    console.log(`📊 Runners with TX signatures: ${withTx.length}/20`);

    // Check refund logs for batches
    const { data: logs } = await supabase
        .from('refund_logs')
        .select('*')
        .eq('event_id', event.id);
    
    console.log(`📦 Number of batches processed (from refund_logs): ${logs?.length || 0}`);
    
    if ((logs?.length || 0) >= 2) {
        console.log('✅ SUCCESS: At least 2 batches were processed!');
    } else {
        console.log('❌ FAILURE: Expected at least 2 batches (Batch size for non-winners is 10).');
    }
}

testBatching().catch(console.error);

