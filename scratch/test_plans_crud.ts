import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

dotenv.config({ path: path.resolve(root, ".env.local") });

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !url.includes("127.0.0.1")) {
  throw new Error("Target is NOT local 127.0.0.1! Aborting for safety!");
}

const supabase = createClient(url, serviceKey);

async function testPlansCrud() {
  console.log("1. Testing read/write against local 'plans' table...");
  const testPlanId = "11111111-1111-1111-1111-111111111111";

  // Insert a test plan
  const { data: inserted, error: insertError } = await supabase.from("plans").insert({
    id: testPlanId,
    public_id: "pln_local_test",
    title: "Localhost Development Test Plan",
    place_name: "Local Cafe",
    place_address: "123 Local Street",
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
    max_participants: 10,
    plan_size: 6
  }).select();

  if (insertError) {
    throw new Error(`Insert to plans failed: ${insertError.message}`);
  }
  console.log("SUCCESS: Inserted test plan into local 'plans' table:", inserted[0]?.title);
  console.log("Plan Size:", inserted[0]?.plan_size, "Max Participants:", inserted[0]?.max_participants);

  // Read back
  const { data: fetched, error: fetchError } = await supabase.from("plans").select("*").eq("id", testPlanId).single();
  if (fetchError) {
    throw new Error(`Fetch plan failed: ${fetchError.message}`);
  }
  console.log("SUCCESS: Read test plan from local DB! Title:", fetched.title, "plan_size:", fetched.plan_size);

  // Update plan_size
  const { data: updated, error: updateError } = await supabase.from("plans").update({
    plan_size: 7
  }).eq("id", testPlanId).select().single();

  if (updateError) {
    throw new Error(`Update plan failed: ${updateError.message}`);
  }
  console.log("SUCCESS: Updated local plan_size to:", updated.plan_size);

  // Clean up
  const { error: deleteError } = await supabase.from("plans").delete().eq("id", testPlanId);
  if (deleteError) {
    throw new Error(`Delete plan failed: ${deleteError.message}`);
  }
  console.log("SUCCESS: Deleted test plan from local 'plans' table.");

  // Confirm empty
  const { count } = await supabase.from("plans").select("*", { count: "exact", head: true });
  console.log("SUCCESS: Remaining plans in local DB:", count);

  console.log("\nALL PLANS CRUD TESTS PASSED AGAINST LOCAL SUPABASE!");
}

testPlansCrud().catch(console.error);
