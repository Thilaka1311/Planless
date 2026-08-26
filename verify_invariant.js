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

async function verify() {
  const planId = 'f7290039-4ac9-430c-9131-326c6d56c36e';
  
  const { data: plan, error: pErr } = await supabase
    .from('plans')
    .select('id, max_participants, attended_participants')
    .eq('id', planId)
    .single();

  const { data: participants, error: ppErr } = await supabase
    .from('plan_participants')
    .select('plan_id, user_id, final_attendance')
    .eq('plan_id', planId);

  const calculatedAttended = participants.filter(p => p.final_attendance === 'ATTENDED').length;

  console.log('--- DATABASE INVARIANT VERIFICATION ---');
  console.log('Plan ID:', plan.id);
  console.log('max_participants:', plan.max_participants);
  console.log('attended_participants:', plan.attended_participants);
  console.log('calculated_attended_participants:', calculatedAttended);
  console.log('Invariant match:', plan.attended_participants === calculatedAttended);
}

verify();
