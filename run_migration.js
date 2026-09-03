import fs from 'fs';
import path from 'path';
import pkg from 'pg';
const { Client } = pkg;

const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...rest] = line.split('=');
  if (key && rest.length > 0) {
    envVars[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const dbUrl = envVars.DATABASE_URL || envVars.SUPABASE_DB_URL || envVars.DIRECT_URL;
console.log("Connecting using DB URL:", dbUrl ? dbUrl.replace(/:[^:@]+@/, ':****@') : 'undefined');

const projectRef = envVars.SUPABASE_URL ? envVars.SUPABASE_URL.replace('https://', '').split('.')[0] : 'wecmpncixopetvunkkyd';
const connectionString = dbUrl || `postgres://postgres:${encodeURIComponent('Supabase2026!')}@db.${projectRef}.supabase.co:5432/postgres`;

const sql = fs.readFileSync('supabase/migrations/20260902111100_drop_deprecated_plan_columns.sql', 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function run() {
  try {
    await client.connect();
    console.log("Connected to DB successfully!");
    await client.query(sql);
    console.log("Migration executed successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}

run();
