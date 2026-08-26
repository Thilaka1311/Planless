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
  console.log("Calling RPC manage_completed_plan_participants with 4 parameters...");

  const { data, error } = await supabase.rpc('manage_completed_plan_participants', {
    p_plan_id: planId,
    p_users_to_add: [],
    p_users_to_remove: [],
    p_expense_mode: 'NONE'
  });

  console.log("RPC Data:", data);
  if (error) {
    console.error("RPC Error:", JSON.stringify(error, null, 2));
  } else {
    console.log("RPC Call SUCCEEDED!");
  }
}

run();
