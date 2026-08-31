import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function main() {
  const envContent = fs.readFileSync('.env', 'utf-8');
  const env = {};
  envContent.split('\n').forEach(line => {
    if (line.includes('=')) {
      const [k, ...v] = line.split('=');
      env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
    }
  });

  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'] || env['VITE_SUPABASE_URL'];
  const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY']; 
  
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing supabase credentials");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Use the same plan ID as before
  const testPlanId = "71504c32-66a2-410e-a9d8-e473708cc339";

  const { data: pp } = await supabase
    .from('plan_participants')
    .select('user_id, waitlist_position')
    .eq('plan_id', testPlanId)
    .eq('assigned_group', 'WAITLIST');

  if (!pp) {
      console.log("No data");
      return;
  }

  const newOrder = pp.map(p => p.user_id).reverse();
  console.log("Calling RPC with:", newOrder);

  const { data: rpcData, error: rpcError } = await supabase.rpc('reorder_waitlist', {
    p_plan_id: testPlanId,
    p_ordered_user_ids: newOrder
  });

  console.log("RPC Error:", rpcError);
  console.log("RPC Data:", rpcData);

  const { data: verifyPp } = await supabase
    .from('plan_participants')
    .select('user_id, waitlist_position')
    .eq('plan_id', testPlanId)
    .eq('assigned_group', 'WAITLIST');
    
  verifyPp.sort((a,b) => (a.waitlist_position || 0) - (b.waitlist_position || 0));
  verifyPp.forEach(u => console.log(`${u.user_id} -> ${u.waitlist_position}`));
}

main();
