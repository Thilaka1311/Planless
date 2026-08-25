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
  
  // 1. Calculate actual ATTENDED count
  const { data: participants, error: partsErr } = await supabase
    .from('plan_participants')
    .select('plan_id, user_id, final_attendance')
    .eq('plan_id', planId);

  if (partsErr) {
    console.error('Error fetching participants:', partsErr);
    return;
  }

  const attendedCount = participants.filter(p => p.final_attendance === 'ATTENDED').length;
  console.log(`Calculated ATTENDED count for plan ${planId}: ${attendedCount}`);

  // 2. Update plans row
  const { data: updatedPlan, error: updateErr } = await supabase
    .from('plans')
    .update({ attended_participants: attendedCount })
    .eq('id', planId)
    .select('id, max_participants, attended_participants')
    .single();

  if (updateErr) {
    console.error('Error updating plan:', updateErr);
  } else {
    console.log('Successfully updated plan:', updatedPlan);
  }
}

run();
