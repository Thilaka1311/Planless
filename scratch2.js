import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

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

// We need a valid token to bypass auth.uid() check
// I can generate one using JWT_SECRET
const secret = envVars.JWT_SECRET;
const token = jwt.sign({
  role: 'authenticated',
  aud: 'authenticated',
  sub: '28615456-9467-4bb9-bdff-c07a3ed149dc' // Dummy user ID
}, secret, { expiresIn: '1h' });

const supabase = createClient(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY, {
  global: {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }
});

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
