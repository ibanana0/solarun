import { supabase } from './lib/supabase';

async function main() {
  // Check race_events columns + sample data
  const { data: re } = await supabase.from('race_events').select('*').limit(1);
  console.log('\n=== race_events columns ===');
  if (re && re[0]) {
    Object.keys(re[0]).forEach(k => console.log(`  ${k}: ${JSON.stringify((re[0] as any)[k])}`));
  } else {
    console.log('  (no rows, trying insert to get column error)');
  }

  // Check runners columns + sample data  
  const { data: ru } = await supabase.from('runners').select('*').limit(1);
  console.log('\n=== runners columns ===');
  if (ru && ru[0]) {
    Object.keys(ru[0]).forEach(k => console.log(`  ${k}: ${JSON.stringify((ru[0] as any)[k])}`));
  } else {
    console.log('  (no rows)');
  }

  // Check all enum values by querying information_schema via raw SQL through a known function
  // Use a trick: try to insert an invalid status to get the enum values in the error message
  const { error: enumErr } = await supabase
    .from('race_events')
    .insert({ status: '__probe__' } as any);
  console.log('\n=== event_status enum error (shows valid values) ===');
  console.log(JSON.stringify(enumErr, null, 2));

  const { error: stakeErr } = await supabase
    .from('race_events')
    .update({ stake_status: '__probe__' } as any)
    .eq('id', '00000000-0000-0000-0000-000000000000');
  console.log('\n=== stake_status enum error (shows valid values) ===');
  console.log(JSON.stringify(stakeErr, null, 2));

  const { error: runnerErr } = await supabase
    .from('runners')
    .insert({ status: '__probe__' } as any);
  console.log('\n=== runner_status enum error (shows valid values) ===');
  console.log(JSON.stringify(runnerErr, null, 2));
}

main().catch(console.error);
