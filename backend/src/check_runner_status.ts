import { supabase } from './lib/supabase';

async function main() {
  // Probe runner_status enum by trying invalid value
  const { error } = await supabase
    .from('runners')
    .insert({ status: '__probe_enum__' } as any);
  
  console.log('runner_status enum error:');
  console.log(JSON.stringify(error, null, 2));

  // Check race_events.name column type
  const { data } = await supabase.from('race_events').select('name').limit(1);
  console.log('\nrace_events.name sample:', data?.[0]);
}

main();
