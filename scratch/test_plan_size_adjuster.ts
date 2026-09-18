import assert from "node:assert";
import crypto from "node:crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

dotenv.config({ path: path.resolve(root, ".env.local") });

const url = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !url.includes("127.0.0.1")) {
  throw new Error("Target is NOT local 127.0.0.1! Aborting for safety!");
}
if (!serviceKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY!");
}

const supabaseAdmin = createClient(url, serviceKey);

async function createTestUser(tag: string) {
  const email = `test-cap-${tag}-${Date.now()}-${Math.floor(Math.random() * 100000)}@local.planless`;
  const password = "Password123!";
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `User ${tag}` },
  });
  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message}`);
  }
  const userId = data.user.id;

  const randomSuffix = Math.floor(Math.random() * 10000000);
  await supabaseAdmin.from("users").upsert({
    id: userId,
    public_id: `usr_${randomSuffix}`,
    username: `u_${randomSuffix}`,
    full_name: `User ${tag}`,
  });

  const userClient = createClient(url, anonKey!);
  const { data: signInData, error: signInErr } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signInData.session) {
    throw new Error(`Failed to sign in as test user: ${signInErr?.message}`);
  }

  return { userId, email, client: userClient };
}

async function runTests() {
  console.log("=== Starting Plan Size Adjuster Capacity Tests ===");

  // 1. AUTOMATIC MODE TEST
  console.log("\n--- TEST 1: Automatic Mode Capacity Adjustment ---");
  const hostAuto = await createTestUser("HostAuto");
  const userAuto1 = await createTestUser("UserAuto1");
  const userAuto2 = await createTestUser("UserAuto2");

  const { data: planAutoData, error: planAutoErr } = await hostAuto.client.from("plans").insert({
    title: "Automatic Plan Capacity Test",
    public_id: "p_" + crypto.randomUUID().slice(0, 8),
    place_name: "Venue Auto",
    place_address: "Address Auto",
    plan_size: 2,
    invited_participants: 1,
    participant_filtering: "AUTOMATIC",
    status: "LIVE",
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
  }).select().single();
  assert(!planAutoErr && planAutoData, `Error creating auto plan: ${planAutoErr?.message}`);
  const planAutoId = planAutoData.id;

  // Add host (JOINED)
  await supabaseAdmin.from("plan_participants").insert({
    plan_id: planAutoId,
    user_id: hostAuto.userId,
    role: "HOST",
    rsvp_status: "JOINED",
    joined_queue_at: new Date(Date.now() - 30000).toISOString(),
  });

  // Add userAuto1 (JOINED) - fills spot 2 of 2
  await supabaseAdmin.from("plan_participants").insert({
    plan_id: planAutoId,
    user_id: userAuto1.userId,
    role: "PARTICIPANT",
    rsvp_status: "JOINED",
    joined_queue_at: new Date(Date.now() - 20000).toISOString(),
  });

  // Add userAuto2 (WAITLISTED) - overflow into waitlist
  await supabaseAdmin.from("plan_participants").insert({
    plan_id: planAutoId,
    user_id: userAuto2.userId,
    role: "PARTICIPANT",
    rsvp_status: "WAITLISTED",
    joined_queue_at: new Date(Date.now() - 10000).toISOString(),
  });

  console.log("Initial Auto state: 2 Joined, 1 Waitlisted, Capacity = 2");

  // Host increases capacity to 3 via update_plan_capacity RPC
  const { data: incRes, error: incErr } = await hostAuto.client.rpc("update_plan_capacity", {
    p_plan_id: planAutoId,
    p_plan_size: 3,
    p_auto_promote: true,
  });
  assert(!incErr, `Error increasing auto capacity: ${incErr?.message}`);
  console.log("Increase result:", incRes);

  // Verify UserAuto2 was auto-promoted to JOINED
  const { data: afterIncParts } = await supabaseAdmin
    .from("plan_participants")
    .select("user_id, rsvp_status")
    .eq("plan_id", planAutoId);

  const u2AfterInc = afterIncParts?.find((p) => p.user_id === userAuto2.userId);
  assert.strictEqual(u2AfterInc?.rsvp_status, "JOINED", "UserAuto2 should be auto-promoted to JOINED");
  console.log("✓ UserAuto2 was auto-promoted to JOINED in Automatic mode");

  // Host decreases capacity back to 2 via update_plan_capacity RPC
  const { data: decRes, error: decErr } = await hostAuto.client.rpc("update_plan_capacity", {
    p_plan_id: planAutoId,
    p_plan_size: 2,
    p_auto_promote: true,
  });
  assert(!decErr, `Error decreasing auto capacity: ${decErr?.message}`);
  console.log("Decrease result:", decRes);

  const { data: afterDecParts } = await supabaseAdmin
    .from("plan_participants")
    .select("user_id, rsvp_status, role")
    .eq("plan_id", planAutoId);

  const hostAfterDec = afterDecParts?.find((p) => p.user_id === hostAuto.userId);
  const u1AfterDec = afterDecParts?.find((p) => p.user_id === userAuto1.userId);
  const u2AfterDec = afterDecParts?.find((p) => p.user_id === userAuto2.userId);

  assert.strictEqual(hostAfterDec?.rsvp_status, "JOINED", "Host must remain JOINED");
  assert.strictEqual(u1AfterDec?.rsvp_status, "JOINED", "UserAuto1 (earlier queue) must remain JOINED");
  assert.strictEqual(u2AfterDec?.rsvp_status, "WAITLISTED", "UserAuto2 (latest queue) must be demoted to WAITLISTED");
  console.log("✓ Host protected and latest joined demoted to WAITLISTED in Automatic mode");


  // 2. ASSIGNED MODE TEST
  console.log("\n--- TEST 2: Assigned Mode Capacity Adjustment ---");
  const hostAssigned = await createTestUser("HostAssigned");
  const userAssigned1 = await createTestUser("UserAssigned1");
  const userAssigned2 = await createTestUser("UserAssigned2");

  const { data: planAssignedData, error: planAssignedErr } = await hostAssigned.client.from("plans").insert({
    title: "Assigned Plan Capacity Test",
    public_id: "p_" + crypto.randomUUID().slice(0, 8),
    place_name: "Venue Assigned",
    place_address: "Address Assigned",
    plan_size: 2,
    invited_participants: 1,
    participant_filtering: "ASSIGNED",
    status: "LIVE",
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
  }).select().single();
  assert(!planAssignedErr && planAssignedData, `Error creating assigned plan: ${planAssignedErr?.message}`);
  const planAssignedId = planAssignedData.id;

  // Host in GOING
  await supabaseAdmin.from("plan_participants").insert({
    plan_id: planAssignedId,
    user_id: hostAssigned.userId,
    role: "HOST",
    rsvp_status: "JOINED",
    assigned_group: "GOING",
  });

  // UserAssigned1 in GOING
  await supabaseAdmin.from("plan_participants").insert({
    plan_id: planAssignedId,
    user_id: userAssigned1.userId,
    role: "PARTICIPANT",
    rsvp_status: "JOINED",
    assigned_group: "GOING",
  });

  // UserAssigned2 in WAITLIST
  await supabaseAdmin.from("plan_participants").insert({
    plan_id: planAssignedId,
    user_id: userAssigned2.userId,
    role: "PARTICIPANT",
    rsvp_status: "WAITLISTED",
    assigned_group: "WAITLIST",
    waitlist_position: 1,
  });

  console.log("Initial Assigned state: Host (Going), User1 (Going), User2 (Waitlist #1), Capacity = 2");

  // Host adjusts capacity up to 5 via update_plan_capacity with p_auto_promote: false
  // (which is what PlanParticipantManagementWrapper now passes for Assigned capacity increases)
  const { data: incAssignedRes, error: incAssignedErr } = await hostAssigned.client.rpc("update_plan_capacity", {
    p_plan_id: planAssignedId,
    p_plan_size: 5,
    p_auto_promote: false,
  });
  assert(!incAssignedErr, `Error increasing assigned capacity: ${incAssignedErr?.message}`);
  console.log("Assigned Increase result:", incAssignedRes);

  // Verify plan_size is updated to 5
  const { data: planAfter } = await supabaseAdmin
    .from("plans")
    .select("plan_size")
    .eq("id", planAssignedId)
    .single();
  assert.strictEqual(planAfter?.plan_size, 5, "Plan size must be updated to 5");
  console.log("✓ Plan capacity updated to 5");

  // Verify UserAssigned2 is STILL in WAITLIST (NOT auto-promoted)
  const { data: partsAfter } = await supabaseAdmin
    .from("plan_participants")
    .select("user_id, rsvp_status, assigned_group, waitlist_position")
    .eq("plan_id", planAssignedId);

  const u2After = partsAfter?.find((p) => p.user_id === userAssigned2.userId);
  assert.strictEqual(u2After?.rsvp_status, "WAITLISTED", "UserAssigned2 must remain WAITLISTED");
  assert.strictEqual(u2After?.assigned_group, "WAITLIST", "UserAssigned2 must remain in WAITLIST assigned group");
  assert.strictEqual(u2After?.waitlist_position, 1, "UserAssigned2 waitlist position must remain 1");
  console.log("✓ UserAssigned2 remained safely on WAITLIST with position 1 without unexpected promotion");

  const goingCount = partsAfter?.filter((p) => p.assigned_group === "GOING").length;
  assert.strictEqual(goingCount, 2, "Going count must remain 2");
  console.log("✓ Going count remained exactly 2");

  console.log("\n=== ALL TESTS PASSED SUCCESSFULLY! ===");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
