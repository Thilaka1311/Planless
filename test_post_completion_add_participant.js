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

async function runTests() {
  const planId = 'f7290039-4ac9-430c-9131-326c6d56c36e';
  console.log('=== STARTING POST-COMPLETION ADD PARTICIPANT TESTS ===\n');

  // Find a real user who is NOT currently a participant in this plan
  const { data: existingParts } = await supabase
    .from('plan_participants')
    .select('user_id')
    .eq('plan_id', planId);

  const existingUserIds = new Set((existingParts || []).map(p => p.user_id));

  const { data: users } = await supabase
    .from('users')
    .select('id')
    .limit(20);

  const nonPartUser = users.find(u => !existingUserIds.has(u.id));

  if (!nonPartUser) {
    console.error('No non-participant user found for testing.');
    return;
  }

  const testUserId = nonPartUser.id;
  console.log('Using real test user_id:', testUserId);

  // Initial plan state
  const { data: planInit } = await supabase
    .from('plans')
    .select('id, max_participants, attended_participants, total_cost')
    .eq('id', planId)
    .single();

  console.log('Initial Plan State:', planInit);

  // ----------------------------------------------------
  // Test 1: Brand new participant addition
  // ----------------------------------------------------
  const { error: upsertErr } = await supabase
    .from('plan_participants')
    .upsert({
      plan_id: planId,
      user_id: testUserId,
      role: 'PARTICIPANT',
      rsvp_status: 'JOINED',
      final_attendance: 'ATTENDED',
      final_state: 'JOINED',
      skip_reason: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'plan_id,user_id' });

  if (upsertErr) console.error('Upsert Err:', upsertErr);

  const { data: partsAfterAdd } = await supabase
    .from('plan_participants')
    .select('user_id, rsvp_status, final_attendance, final_state, skip_reason')
    .eq('plan_id', planId);

  const attendedCountAdd = partsAfterAdd.filter(p => p.final_attendance === 'ATTENDED').length;

  const newMax = Math.max(planInit.max_participants, attendedCountAdd);
  const { data: planAfterAdd } = await supabase
    .from('plans')
    .update({
      max_participants: newMax,
      attended_participants: attendedCountAdd
    })
    .eq('id', planId)
    .select('id, max_participants, attended_participants')
    .single();

  const user1Row = partsAfterAdd.find(p => p.user_id === testUserId);
  console.log('\nAfter Adding Brand New User:');
  console.log('Plan Counters:', planAfterAdd);
  console.log('User Row:', user1Row);
  console.log('PASS Test 1 (Brand New User):', 
    user1Row.rsvp_status === 'JOINED' &&
    user1Row.final_attendance === 'ATTENDED' &&
    user1Row.final_state === 'JOINED' &&
    user1Row.skip_reason === null &&
    planAfterAdd.max_participants === 5 &&
    planAfterAdd.attended_participants === 5
  );

  // ----------------------------------------------------
  // Test 2: Previously SKIPPED user addition
  // ----------------------------------------------------
  await supabase
    .from('plan_participants')
    .update({
      rsvp_status: 'SKIPPED',
      final_attendance: 'DID_NOT_ATTEND',
      final_state: 'SKIPPED',
      skip_reason: 'TEST_SKIPPED'
    })
    .eq('plan_id', planId)
    .eq('user_id', testUserId);

  // Now re-add testUserId
  await supabase
    .from('plan_participants')
    .upsert({
      plan_id: planId,
      user_id: testUserId,
      role: 'PARTICIPANT',
      rsvp_status: 'JOINED',
      final_attendance: 'ATTENDED',
      final_state: 'JOINED',
      skip_reason: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'plan_id,user_id' });

  const { data: partsAfterReadd } = await supabase
    .from('plan_participants')
    .select('user_id, rsvp_status, final_attendance, final_state, skip_reason')
    .eq('plan_id', planId);

  const readdedUserRow = partsAfterReadd.find(p => p.user_id === testUserId);
  const totalUserRows = partsAfterReadd.filter(p => p.user_id === testUserId).length;

  console.log('\nAfter Re-Adding Previously SKIPPED User:');
  console.log('Re-added User Row:', readdedUserRow);
  console.log('Total Rows for Test User:', totalUserRows);
  console.log('PASS Test 2 (Re-add SKIPPED User without duplicate):',
    totalUserRows === 1 &&
    readdedUserRow.rsvp_status === 'JOINED' &&
    readdedUserRow.final_attendance === 'ATTENDED' &&
    readdedUserRow.final_state === 'JOINED' &&
    readdedUserRow.skip_reason === null
  );

  // ----------------------------------------------------
  // Cleanup test data & restore original state
  // ----------------------------------------------------
  await supabase
    .from('plan_participants')
    .delete()
    .eq('plan_id', planId)
    .eq('user_id', testUserId);

  const { data: finalParts } = await supabase
    .from('plan_participants')
    .select('user_id')
    .eq('plan_id', planId)
    .eq('final_attendance', 'ATTENDED');

  await supabase
    .from('plans')
    .update({
      max_participants: finalParts.length,
      attended_participants: finalParts.length
    })
    .eq('id', planId);

  console.log('\nCleaned up test user data. Restored plan counters to:', finalParts.length);
}

runTests();
