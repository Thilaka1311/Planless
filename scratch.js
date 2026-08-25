import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env
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

async function test() {
  const { data, error } = await supabase.rpc('manage_completed_plan_participants', {
    p_plan_id: 'f7290039-4ac9-430c-9131-326c6d56c36e', // from user output
    p_users_to_add: [],
    p_users_to_remove: []
  });
  console.log("Data:", data);
  console.log("Error:", JSON.stringify(error, null, 2));
}

test();
