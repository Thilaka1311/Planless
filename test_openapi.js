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

const url = `${envVars.SUPABASE_URL}/rest/v1/?apikey=${envVars.SUPABASE_SERVICE_ROLE_KEY}`;

async function run() {
  const res = await fetch(url);
  const spec = await res.json();
  const paths = Object.keys(spec.paths || {}).filter(p => p.includes('rpc'));
  console.log("Exposed RPC paths in PostgREST schema cache:\n");
  paths.forEach(p => {
    if (p.includes('manage_completed_plan') || p.includes('execute') || p.includes('sql')) {
      console.log(p, JSON.stringify(spec.paths[p], null, 2));
    }
  });
}

run();
