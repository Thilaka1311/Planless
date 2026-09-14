import assert from "node:assert";
import { createClient } from "/Users/thilak/Documents/Planless/Planless Repo /Planless-2.0/apps/app/node_modules/@supabase/supabase-js/dist/index.cjs";

const LOCAL_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY);
const anon = createClient(LOCAL_URL, ANON_KEY);

async function runTests() {
  console.log("=================================================");
  console.log("Starting Refactored Invite by Link Test Suite...");
  console.log("=================================================");

  // Verify that plan_invites table does NOT exist
  console.log("\n[Test 0] Checking that public.plan_invites is dropped...");
  const { error: tableCheckErr } = await admin.from("plan_invites").select("*").limit(1);
  assert(tableCheckErr, "Expected error when querying dropped plan_invites table");
  console.log("✓ public.plan_invites is confirmed dropped! Error:", tableCheckErr.message);

  // Generate unique test user IDs
  const hostId = crypto.randomUUID();
  const newUser1Id = crypto.randomUUID();
  const newUser2Id = crypto.randomUUID();
  const joinedUserId = crypto.randomUUID();
  const waitlistUserId = crypto.randomUUID();
  const skippedUserId = crypto.randomUUID();
  const concurrentUser1Id = crypto.randomUUID();
  const concurrentUser2Id = crypto.randomUUID();

  const planLiveId = crypto.randomUUID();
  const planCompletedId = crypto.randomUUID();
  const planCancelledId = crypto.randomUUID();

  const allUsers = [
    { id: hostId, email: `host_${Date.now()}@test.com` },
    { id: newUser1Id, email: `new1_${Date.now()}@test.com` },
    { id: newUser2Id, email: `new2_${Date.now()}@test.com` },
    { id: joinedUserId, email: `joined_${Date.now()}@test.com` },
    { id: waitlistUserId, email: `waitlist_${Date.now()}@test.com` },
    { id: skippedUserId, email: `skipped_${Date.now()}@test.com` },
    { id: concurrentUser1Id, email: `concurrent1_${Date.now()}@test.com` },
    { id: concurrentUser2Id, email: `concurrent2_${Date.now()}@test.com` },
  ];

  for (const u of allUsers) {
    await admin.auth.admin.createUser({
      id: u.id,
      email: u.email,
      password: "TestPassword123!",
      email_confirm: true,
    });
    await admin.from("users").upsert({
      id: u.id,
      public_id: "PUB_" + u.id.slice(0, 8),
      full_name: "Test User " + u.id.slice(0, 4),
      profile_completed: true,
    });
  }

  // Create test clients for each user
  const clientForUser = (userId: string) => {
    return createClient(LOCAL_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: {
        headers: {
          // Provide JWT using admin token generation
        }
      }
    });
  };

  // Generate user JWTs
  const getUserClient = async (email: string) => {
    const client = createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: "TestPassword123!",
    });
    if (error || !data.session) throw new Error("Sign in failed: " + error?.message);
    return client;
  };

  const hostClient = await getUserClient(allUsers[0].email);
  const newUser1Client = await getUserClient(allUsers[1].email);
  const newUser2Client = await getUserClient(allUsers[2].email);
  const joinedUserClient = await getUserClient(allUsers[3].email);
  const waitlistUserClient = await getUserClient(allUsers[4].email);
  const skippedUserClient = await getUserClient(allUsers[5].email);
  const concurrentClient1 = await getUserClient(allUsers[6].email);
  const concurrentClient2 = await getUserClient(allUsers[7].email);

  // Seed plans: LIVE (capacity 5), COMPLETED, CANCELLED
  await admin.from("plans").insert([
    {
      id: planLiveId,
      public_id: "PLAN_" + planLiveId.slice(0, 8),
      title: "LIVE Test Plan",
      place_name: "Central Park",
      place_address: "NYC",
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
      status: "LIVE",
      plan_size: 5,
      max_participants: 5,
    },
    {
      id: planCompletedId,
      public_id: "PLAN_" + planCompletedId.slice(0, 8),
      title: "COMPLETED Test Plan",
      place_name: "Met Museum",
      place_address: "NYC",
      scheduled_at: new Date(Date.now() - 86400000).toISOString(),
      rsvp_deadline: new Date(Date.now() - 90000000).toISOString(),
      status: "COMPLETED",
      plan_size: 5,
      max_participants: 5,
    },
    {
      id: planCancelledId,
      public_id: "PLAN_" + planCancelledId.slice(0, 8),
      title: "CANCELLED Test Plan",
      place_name: "Broadway",
      place_address: "NYC",
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
      status: "CANCELLED",
      plan_size: 5,
      max_participants: 5,
    },
  ]);

  // Add Host participant to LIVE plan
  await admin.from("plan_participants").insert({
    plan_id: planLiveId,
    user_id: hostId,
    role: "HOST",
    rsvp_status: "JOINED",
    delivery_status: "DELIVERED",
  });

  // Add Host to other plans
  await admin.from("plan_participants").insert([
    { plan_id: planCompletedId, user_id: hostId, role: "HOST", rsvp_status: "JOINED", delivery_status: "DELIVERED" },
    { plan_id: planCancelledId, user_id: hostId, role: "HOST", rsvp_status: "JOINED", delivery_status: "DELIVERED" },
  ]);

  // Add pre-existing participants to LIVE plan
  await admin.from("plan_participants").insert([
    { plan_id: planLiveId, user_id: joinedUserId, role: "PARTICIPANT", rsvp_status: "JOINED", delivery_status: "DELIVERED" },
    { plan_id: planLiveId, user_id: waitlistUserId, role: "PARTICIPANT", rsvp_status: "WAITLISTED", waitlist_position: 1, delivery_status: "DELIVERED" },
    { plan_id: planLiveId, user_id: skippedUserId, role: "PARTICIPANT", rsvp_status: "SKIPPED", delivery_status: "DELIVERED" },
  ]);

  console.log("\n[Test 1] Unauthenticated caller rejection...");
  const { error: unauthErr } = await anon.rpc("claim_plan_invite", { p_plan_id: planLiveId });
  assert(unauthErr, "Unauthenticated claim should fail");
  console.log("✓ Rejected unauthenticated call:", unauthErr.message);

  console.log("\n[Test 2] Invalid/nonexistent plan UUID rejection...");
  const fakeId = crypto.randomUUID();
  const { error: fakeErr } = await newUser1Client.rpc("claim_plan_invite", { p_plan_id: fakeId });
  assert(fakeErr, "Nonexistent plan should fail");
  assert(fakeErr.message.toLowerCase().includes("not found") || fakeErr.message.toLowerCase().includes("invalid"));
  console.log("✓ Rejected nonexistent plan ID:", fakeErr.message);

  console.log("\n[Test 3] Completed plan link rejection...");
  const { error: compErr } = await newUser1Client.rpc("claim_plan_invite", { p_plan_id: planCompletedId });
  assert(compErr, "Completed plan should fail");
  assert(compErr.message.toLowerCase().includes("not active"));
  console.log("✓ Rejected completed plan:", compErr.message);

  console.log("\n[Test 4] Cancelled plan link rejection...");
  const { error: cancErr } = await newUser1Client.rpc("claim_plan_invite", { p_plan_id: planCancelledId });
  assert(cancErr, "Cancelled plan should fail");
  assert(cancErr.message.toLowerCase().includes("not active"));
  console.log("✓ Rejected cancelled plan:", cancErr.message);

  console.log("\n[Test 5] Host cannot claim invite for own plan...");
  const { error: hostClaimErr } = await hostClient.rpc("claim_plan_invite", { p_plan_id: planLiveId });
  assert(hostClaimErr, "Host self-claim should fail");
  assert(hostClaimErr.message.toLowerCase().includes("host cannot claim"));
  console.log("✓ Rejected host self-claim:", hostClaimErr.message);

  console.log("\n[Test 6] First unique claim for LIVE plan (newUser1)...");
  // Check initial plan_size
  const { data: beforePlan } = await admin.from("plans").select("plan_size, max_participants").eq("id", planLiveId).single();
  assert.strictEqual(beforePlan.plan_size, 5);
  assert.strictEqual(beforePlan.max_participants, 5);

  const { data: claimResult1, error: claimErr1 } = await newUser1Client.rpc("claim_plan_invite", { p_plan_id: planLiveId });
  assert(!claimErr1, "claimErr1: " + claimErr1?.message);
  assert.strictEqual(claimResult1.success, true);
  assert.strictEqual(claimResult1.rsvp_status, "INVITED");
  assert.strictEqual(claimResult1.already_participating, false);
  assert.strictEqual(claimResult1.new_plan_size, 6);

  // Check plan_size incremented from 5 to 6
  const { data: afterPlan1 } = await admin.from("plans").select("plan_size, max_participants").eq("id", planLiveId).single();
  assert.strictEqual(afterPlan1.plan_size, 6, "plan_size must increment to 6");
  assert.strictEqual(afterPlan1.max_participants, 6, "max_participants must be >= plan_size (6)");

  // Check participant row in database
  const { data: partRow1 } = await admin.from("plan_participants").select("*").eq("plan_id", planLiveId).eq("user_id", newUser1Id).single();
  assert.strictEqual(partRow1.role, "PARTICIPANT");
  assert.strictEqual(partRow1.rsvp_status, "INVITED");
  assert.strictEqual(partRow1.assigned_group, null);
  assert.strictEqual(partRow1.waitlist_position, null);
  console.log("✓ First unique claim created INVITED participant and incremented plan_size: 5 → 6");

  console.log("\n[Test 7] Repeated claim by same user (newUser1 idempotency)...");
  const { data: claimResult1Repeat, error: claimErr1Repeat } = await newUser1Client.rpc("claim_plan_invite", { p_plan_id: planLiveId });
  assert(!claimErr1Repeat, "repeat claim error: " + claimErr1Repeat?.message);
  assert.strictEqual(claimResult1Repeat.success, true);
  assert.strictEqual(claimResult1Repeat.already_participating, true);

  // Ensure plan_size did NOT increment again
  const { data: afterPlan1Repeat } = await admin.from("plans").select("plan_size, max_participants").eq("id", planLiveId).single();
  assert.strictEqual(afterPlan1Repeat.plan_size, 6, "plan_size must remain 6 on repeated claim");
  console.log("✓ Repeated claim is idempotent and did NOT double-increment capacity (plan_size remains 6)");

  console.log("\n[Test 8] Second unique claim (newUser2)...");
  const { data: claimResult2, error: claimErr2 } = await newUser2Client.rpc("claim_plan_invite", { p_plan_id: planLiveId });
  assert(!claimErr2, "claimErr2: " + claimErr2?.message);
  assert.strictEqual(claimResult2.success, true);
  assert.strictEqual(claimResult2.new_plan_size, 7);

  const { data: afterPlan2 } = await admin.from("plans").select("plan_size, max_participants").eq("id", planLiveId).single();
  assert.strictEqual(afterPlan2.plan_size, 7, "plan_size must increment to 7");
  assert.strictEqual(afterPlan2.max_participants, 7, "max_participants must be >= plan_size (7)");
  console.log("✓ Second unique claim incremented plan_size: 6 → 7");

  console.log("\n[Test 9] Existing JOINED user claims invite link...");
  const { data: joinedClaim, error: joinedClaimErr } = await joinedUserClient.rpc("claim_plan_invite", { p_plan_id: planLiveId });
  assert(!joinedClaimErr, "joinedClaimErr: " + joinedClaimErr?.message);
  assert.strictEqual(joinedClaim.success, true);
  assert.strictEqual(joinedClaim.rsvp_status, "JOINED");
  assert.strictEqual(joinedClaim.already_participating, true);

  const { data: joinedPart } = await admin.from("plan_participants").select("rsvp_status").eq("plan_id", planLiveId).eq("user_id", joinedUserId).single();
  assert.strictEqual(joinedPart.rsvp_status, "JOINED", "JOINED status must be strictly preserved");

  const { data: planAfterJoined } = await admin.from("plans").select("plan_size").eq("id", planLiveId).single();
  assert.strictEqual(planAfterJoined.plan_size, 7, "plan_size must not change for existing JOINED user");
  console.log("✓ Existing JOINED participant preserved, capacity unchanged (7)");

  console.log("\n[Test 10] Existing WAITLISTED user claims invite link...");
  const { data: waitlistClaim, error: waitlistClaimErr } = await waitlistUserClient.rpc("claim_plan_invite", { p_plan_id: planLiveId });
  assert(!waitlistClaimErr, "waitlistClaimErr: " + waitlistClaimErr?.message);
  assert.strictEqual(waitlistClaim.success, true);
  assert.strictEqual(waitlistClaim.rsvp_status, "WAITLISTED");
  assert.strictEqual(waitlistClaim.already_participating, true);

  const { data: waitlistPart } = await admin.from("plan_participants").select("rsvp_status, waitlist_position").eq("plan_id", planLiveId).eq("user_id", waitlistUserId).single();
  assert.strictEqual(waitlistPart.rsvp_status, "WAITLISTED", "WAITLISTED status must be preserved");
  assert.strictEqual(waitlistPart.waitlist_position, 1, "waitlist position must be preserved");

  const { data: planAfterWaitlist } = await admin.from("plans").select("plan_size").eq("id", planLiveId).single();
  assert.strictEqual(planAfterWaitlist.plan_size, 7, "plan_size must not change for existing WAITLISTED user");
  console.log("✓ Existing WAITLISTED participant preserved, capacity unchanged (7)");

  console.log("\n[Test 11] Existing SKIPPED user claims invite link...");
  const { data: skippedClaim, error: skippedClaimErr } = await skippedUserClient.rpc("claim_plan_invite", { p_plan_id: planLiveId });
  assert(!skippedClaimErr, "skippedClaimErr: " + skippedClaimErr?.message);
  assert.strictEqual(skippedClaim.success, true);
  assert.strictEqual(skippedClaim.rsvp_status, "SKIPPED");
  assert.strictEqual(skippedClaim.already_participating, true);

  const { data: skippedPart } = await admin.from("plan_participants").select("rsvp_status").eq("plan_id", planLiveId).eq("user_id", skippedUserId).single();
  assert.strictEqual(skippedPart.rsvp_status, "SKIPPED", "SKIPPED status must be preserved");

  const { data: planAfterSkipped } = await admin.from("plans").select("plan_size").eq("id", planLiveId).single();
  assert.strictEqual(planAfterSkipped.plan_size, 7, "plan_size must not change for existing SKIPPED user");
  console.log("✓ Existing SKIPPED participant preserved, capacity unchanged (7)");

  console.log("\n[Test 12] Concurrent claims by distinct users (concurrentUser1 and concurrentUser2)...");
  const [resC1, resC2] = await Promise.all([
    concurrentClient1.rpc("claim_plan_invite", { p_plan_id: planLiveId }),
    concurrentClient2.rpc("claim_plan_invite", { p_plan_id: planLiveId }),
  ]);

  assert(!resC1.error, "Concurrent claim 1 error: " + resC1.error?.message);
  assert(!resC2.error, "Concurrent claim 2 error: " + resC2.error?.message);

  const { data: planAfterConcurrent } = await admin.from("plans").select("plan_size, max_participants").eq("id", planLiveId).single();
  assert.strictEqual(planAfterConcurrent.plan_size, 9, "Both concurrent claims must atomically increment capacity: 7 + 2 = 9");
  console.log("✓ Concurrent claims succeeded without race condition. plan_size is now 9");

  console.log("\n[Test 13] Checking for no duplicate participant rows...");
  const { data: allParticipants } = await admin.from("plan_participants").select("user_id").eq("plan_id", planLiveId);
  const userIds = allParticipants.map(p => p.user_id);
  const uniqueUserIds = new Set(userIds);
  assert.strictEqual(userIds.length, uniqueUserIds.size, "No duplicate participant rows must exist");
  console.log(`✓ Total participants: ${userIds.length}, unique user IDs: ${uniqueUserIds.size} (zero duplicates)`);

  console.log("\n=================================================");
  console.log("ALL 13 TESTS PASSED SUCCESSFULLY! 🎉");
  console.log("=================================================\n");
}

runTests().catch(err => {
  console.error("\n❌ Test failed with error:", err);
  process.exit(1);
});
