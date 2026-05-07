import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function migrate() {
    console.log('Adding prize_tx_signature column to runners table...');
    
    // Use rpc to execute raw SQL (Supabase supports this via pg_net or direct SQL)
    // However, supabase-js doesn't support raw SQL directly.
    // We'll use a workaround: try to update with the new column to see if it exists
    
    const { data: testData, error: testError } = await supabase
        .from('runners')
        .select('prize_tx_signature')
        .limit(1);
    
    if (testError) {
        if (testError.message.includes('prize_tx_signature')) {
            console.log('Column does not exist yet. Please add it manually via Supabase Dashboard:');
            console.log('');
            console.log('Go to: Supabase Dashboard → SQL Editor → Run this:');
            console.log('');
            console.log('ALTER TABLE runners ADD COLUMN IF NOT EXISTS prize_tx_signature TEXT;');
            console.log('');
            console.log('Then run this script again to verify.');
        } else {
            console.error('Unexpected error:', testError.message);
        }
    } else {
        console.log('✅ Column prize_tx_signature already exists!');
    }
}

migrate();
