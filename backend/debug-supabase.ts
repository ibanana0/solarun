
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkRunner() {
  console.log('--- Debug: Searching for Runner ---');
  const { data, error } = await supabase
    .from('runners')
    .select('*')
    .eq('rfid_uid', 'Budi')
    .eq('event_id', '807dd642-9043-456d-b291-63a368bba48a');

  if (error) {
    console.error('❌ Error fetching data:', error.message);
    
    // Check if column exists by listing all runners
    console.log('\n--- Checking Table Schema (first 5 runners) ---');
    const { data: allRunners } = await supabase.from('runners').select('*').limit(5);
    if (allRunners && allRunners.length > 0) {
        console.log('Available Columns:', Object.keys(allRunners[0]));
    } else {
        console.log('Table is empty or unreachable.');
    }
    return;
  }

  if (data && data.length > 0) {
    console.log('✅ Runner Found:', data[0]);
  } else {
    console.log('⚠️ Runner not found with EXACT match "Budi".');
    
    // Case-insensitive check
    const { data: ilikeData } = await supabase
      .from('runners')
      .select('rfid_uid, full_name, event_id')
      .ilike('rfid_uid', 'Budi');
    
    if (ilikeData && ilikeData.length > 0) {
      console.log('\n💡 Found similar runners (Case-Insensitive):');
      ilikeData.forEach(r => console.log(`   - rfid_uid: "${r.rfid_uid}", Name: ${r.full_name}, Event: ${r.event_id}`));
    } else {
      console.log('\n❌ No similar runners found in the entire table.');
    }
  }
}

checkRunner();
