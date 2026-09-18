import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import assert from "assert";
dotenv.config({ path: ".env.local" });

const url = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;

const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function createTestUser(tag: string) {
  const email = `test_invite_${Date.now()}_${tag}@test.com`;
  const password = "Password123!";

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
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

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: signInData, error: signInErr } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signInData.session) {
    throw new Error(`Failed to sign in as test user: ${signInErr?.message}`);
  }

  return { userId, email, client: userClient };
}

async function runReproduction() {
  console.log("=== Reproducing invite_participants RPC Behavior ===");
  const host = await createTestUser("Host");
  const invitee1 = await createTestUser("Invitee1");
  const invitee2 = await createTestUser("Invitee2");

  // Create an ASSIGNED plan like Doomsday
  const { data: plan, error: planErr } = await host.client
    .from("plans")
    .insert({
      title: "Test Assigned Plan",
      public_id: "p_" + crypto.randomUUID().slice(0, 8),
      place_name: "Venue 1",
      place_address: "Address 1",
      plan_size: 3,
      invited_participants: 1,
      participant_filtering: "ASSIGNED",
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
      allow_participant_invites: true,
    })
    .select()
    .single();
  assert.ifError(planErr);

  // Host is automatically or manually added
  await supabaseAdmin.from("plan_participants").upsert({
    plan_id: plan.id,
    user_id: host.userId,
    role: "HOST",
    rsvp_status: "JOINED",
    assigned_group: "GOING",
  });

  // Reproduction Test: Pass p_assigned_group: []
  console.log("\n1. Testing with p_assigned_group: [] (Current Frontend Call):");
  const badRes = await host.client.rpc("invite_participants", {
    p_plan_id: plan.id,
    p_invitee_user_ids: [invitee1.userId],
    p_assigned_group: [] as any,
  });
  console.log("Bad Request RPC Error:", JSON.stringify(badRes.error, null, 2));
  assert.ok(badRes.error, "Must produce error");
  assert.strictEqual(badRes.error.code, "22P02");

  // Correct Call: Pass p_assigned_group: 'GOING'
  console.log("\n2. Testing with p_assigned_group: 'GOING' (Corrected Call):");
  const goodResGoing = await host.client.rpc("invite_participants", {
    p_plan_id: plan.id,
    p_invitee_user_ids: [invitee1.userId],
    p_assigned_group: "GOING",
  });
  console.log("Good Request (GOING) Result:", goodResGoing.data);
  assert.ifError(goodResGoing.error);

  // Correct Call: Pass p_assigned_group: 'WAITLIST'
  console.log("\n3. Testing with p_assigned_group: 'WAITLIST' (Corrected Call):");
  const goodResWaitlist = await host.client.rpc("invite_participants", {
    p_plan_id: plan.id,
    p_invitee_user_ids: [invitee2.userId],
    p_assigned_group: "WAITLIST",
  });
  console.log("Good Request (WAITLIST) Result:", goodResWaitlist.data);
  assert.ifError(goodResWaitlist.error);

  // Cleanup
  await supabaseAdmin.from("plans").delete().eq("id", plan.id);
  await supabaseAdmin.auth.admin.deleteUser(host.userId);
  await supabaseAdmin.auth.admin.deleteUser(invitee1.userId);
  await supabaseAdmin.auth.admin.deleteUser(invitee2.userId);
  console.log("\n=== Reproduction and Verification Finished Successfully ===");
}

runReproduction().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
