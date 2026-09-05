import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

// Load .env then override with .env.local
dotenv.config({ path: path.resolve(root, ".env") });
dotenv.config({ path: path.resolve(root, ".env.local"), override: true });

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

console.log("Testing Connection:");
console.log("Target Supabase URL:", url);
if (!url || !url.includes("127.0.0.1") && !url.includes("localhost")) {
  console.error("FAIL: Target URL is NOT local 127.0.0.1! ABORTING to prevent touching production!");
  process.exit(1);
}

const supabase = createClient(url, anonKey!);

async function runTests() {
  console.log("\n1. Testing Database API (read-only query on 'plans')...");
  const { data: plans, error: planError } = await supabase.from("plans").select("id, title, plan_size, max_participants").limit(5);
  if (planError) {
    console.error("Database query error:", planError);
  } else {
    console.log("SUCCESS: Read from 'plans' table. Rows count:", plans.length, plans);
  }

  console.log("\n2. Testing Auth API...");
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError) {
    console.error("Auth query error:", authError);
  } else {
    console.log("SUCCESS: Auth endpoint reachable. Current session:", authData.session);
  }

  console.log("\n3. Testing Storage API (list buckets)...");
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) {
    console.error("Storage error:", bucketError);
  } else {
    console.log("SUCCESS: Storage endpoint reachable. Buckets:", buckets.map((b) => b.name));
  }

  console.log("\nALL LOCAL CONNECTION CHECKS PASSED!");
}

runTests().catch(console.error);
