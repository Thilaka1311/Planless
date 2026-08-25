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

async function inspect() {
  const planId = 'f7290039-4ac9-430c-9131-326c6d56c36e';
  const { data: plan, error: planErr } = await supabase
    .from('plans')
    .select('id, title, status, max_participants, attended_participants, total_cost')
    .eq('id', planId)
    .single();

  console.log('Plan:', plan);

  const { data: participants, error: partsErr } = await supabase
    .from('plan_participants')
    .select('plan_id, user_id, rsvp_status, final_attendance, final_state, skip_reason')
    .eq('plan_id', planId);

  console.log('Participants:', participants);

  const attendedCount = participants ? participants.filter(p => p.final_attendance === 'ATTENDED').length : 0;
  console.log('Calculated Attended Count:', attendedCount);
}

inspect();
