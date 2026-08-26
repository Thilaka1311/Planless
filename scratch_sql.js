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
const sql = fs.readFileSync('supabase/migrations/20260825155000_update_manage_completed_plan_participants.sql', 'utf8');

async function test() {
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: sql });
  console.log("SQL Data:", data);
  if (error) console.error("Error:", JSON.stringify(error, null, 2));
}

test();
