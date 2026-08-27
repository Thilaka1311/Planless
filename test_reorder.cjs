const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
  // Read env
  const envContent = fs.readFileSync('.env', 'utf-8');
  const env = {};
  envContent.split('\n').forEach(line => {
    if (line.includes('=')) {
      const [k, ...v] = line.split('=');
      env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
    }
  });

  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'] || env['VITE_SUPABASE_URL'];
  const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY']; // need service role for direct DB check
  
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing supabase credentials");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Find a plan with ASSIGNED waitlist and waitlist members
  const { data: plans } = await supabase
    .from('plans')
    .select('id, waitlist_order_mode, participant_filtering')
    .eq('participant_filtering', 'ASSIGNED')
    .limit(10);
    
  if (!plans || plans.length === 0) {
    console.log("No assigned plans found");
    return;
  }

  let testPlanId = null;
  let testUsers = [];

  for (const plan of plans) {
    const { data: pp } = await supabase
      .from('plan_participants')
      .select('user_id, waitlist_position, rsvp_status, assigned_group')
      .eq('plan_id', plan.id)
      .eq('assigned_group', 'WAITLIST');
      
    if (pp && pp.length >= 2) {
      testPlanId = plan.id;
      testUsers = pp;
      break;
    }
  }

  if (!testPlanId) {
    console.log("No assigned plan with >= 2 waitlist members found");
    return;
  }

  console.log("Test Plan ID:", testPlanId);
  console.log("Current Waitlist:");
  testUsers.sort((a,b) => (a.waitlist_position || 0) - (b.waitlist_position || 0));
  testUsers.forEach(u => console.log(`${u.user_id} -> ${u.waitlist_position}`));

  // 2. Reverse the order
  const newOrder = testUsers.map(u => u.user_id).reverse();
  console.log("\nNew Order to Send:", newOrder);

  // 3. Call RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc('reorder_waitlist', {
    p_plan_id: testPlanId,
    p_ordered_user_ids: newOrder
  });

  if (rpcError) {
    console.error("RPC Error:", rpcError);
  } else {
    console.log("RPC Success:", rpcData);
  }

  // 4. Verify DB
  const { data: verifyPp } = await supabase
    .from('plan_participants')
    .select('user_id, waitlist_position')
    .eq('plan_id', testPlanId)
    .eq('assigned_group', 'WAITLIST')
    .in('user_id', newOrder);
    
  console.log("\nDB After RPC:");
  verifyPp.sort((a,b) => (a.waitlist_position || 0) - (b.waitlist_position || 0));
  verifyPp.forEach(u => console.log(`${u.user_id} -> ${u.waitlist_position}`));
}

main();
