import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...rest] = line.split('=');
  if (key && rest.length > 0) {
    envVars[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const supabase = createClient(envVars.SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const planId = 'f7290039-4ac9-430c-9131-326c6d56c36e';
  
  // Get host of the plan
  const { data: plan } = await supabase.from('plans').select('host_id').eq('id', planId).single();
  console.log("Plan Host ID:", plan.host_id);

  // Generate a JWT for the host user using service role / auth admin
  const { data: userObj, error: userErr } = await supabase.auth.admin.getUserById(plan.host_id);
  if (userErr) {
    console.error("User fetch err:", userErr);
    return;
  }

  // Generate link or session for the user
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: userObj.user.email,
  });

  if (linkErr) {
    console.error("Link err:", linkErr);
    return;
  }

  // Create a user-authenticated client using token
  const userSupabase = createClient(envVars.SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${linkData.properties.hashed_token}`
      }
    }
  });

  // Call RPC with all 4 parameters
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('manage_completed_plan_participants', {
    p_plan_id: planId,
    p_users_to_add: [],
    p_users_to_remove: [],
    p_expense_mode: 'NONE'
  });

  console.log("RPC Call directly via REST (service role):", { data: rpcRes, error: rpcErr });
}

run();
