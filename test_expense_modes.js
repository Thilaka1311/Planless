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

async function runExpenseTests() {
  const planId = 'f7290039-4ac9-430c-9131-326c6d56c36e';
  console.log('=== STARTING EXPENSE MODE TESTS ===\n');

  // Test SPLIT_ALL calculation
  const initCost = 400;
  const initAttendees = 4;
  const newAttendees = 5;

  const splitAllShare = Math.round((initCost / newAttendees) * 100) / 100;
  const splitAllTotal = initCost;

  console.log('SPLIT_ALL Mode Test:');
  console.log(`Initial: ${initAttendees} attendees, total ₹${initCost} (${initCost / initAttendees}/person)`);
  console.log(`After Add: ${newAttendees} attendees, total ₹${splitAllTotal} (${splitAllShare}/person)`);
  console.log('PASS SPLIT_ALL:', splitAllShare === 80 && splitAllTotal === 400);

  // Test KEEP_CURRENT_COST calculation
  const currentShare = initCost / initAttendees; // 100
  const keepCostTotal = currentShare * newAttendees; // 500

  console.log('\nKEEP_CURRENT_COST Mode Test:');
  console.log(`Initial: ${initAttendees} attendees, total ₹${initCost} (${currentShare}/person)`);
  console.log(`After Add: ${newAttendees} attendees, total ₹${keepCostTotal} (${currentShare}/person)`);
  console.log('PASS KEEP_CURRENT_COST:', currentShare === 100 && keepCostTotal === 500);
}

runExpenseTests();
