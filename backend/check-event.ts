
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkEvent() {
  const targetId = '807dd642-9043-456d-b291-63a368bba48a';
  console.log('--- Debug: Checking Event Status ---');
  
  const { data: event, error: eventErr } = await supabase
    .from('race_events')
    .select('*')
    .eq('id', targetId)
    .maybeSingle();

  if (eventErr) {
    console.error('❌ Error fetching event:', eventErr.message);
    return;
  }

  if (!event) {
    console.log('❌ EVENT NOT FOUND in Database:', targetId);
    
    console.log('\n--- Searching for LATEST ACTIVE events instead ---');
    const { data: activeEvents } = await supabase
      .from('race_events')
      .select('id, name, status')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(3);
    
    if (activeEvents && activeEvents.length > 0) {
      activeEvents.forEach(e => console.log(`   - ID: ${e.id}, Name: ${e.name}, Status: ${e.status}`));
    } else {
      console.log('No active events found.');
    }
  } else {
    console.log(`✅ Event Found: ${event.name} [Status: ${event.status}]`);
    
    console.log('\n--- Registered Runners for this Event ---');
    const { data: runners } = await supabase
      .from('runners')
      .select('rfid_uid, full_name')
      .eq('event_id', targetId);
    
    if (runners && runners.length > 0) {
      runners.forEach(r => console.log(`   - rfid_uid: "${r.rfid_uid}", Name: ${r.full_name}`));
    } else {
      console.log('No runners registered for this specific event.');
    }
  }
}

checkEvent();
