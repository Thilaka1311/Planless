import assert from "node:assert";
import { createClient } from "/Users/thilak/Documents/Planless/Planless Repo /Planless-2.0/apps/app/node_modules/@supabase/supabase-js/dist/index.cjs";

const LOCAL_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY);

async function createTestUser(tag: string) {
  const userId = crypto.randomUUID();
  const email = `test_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@planless.test`;
  const password = "TestPassword123!";

  const { error: authError } = await admin.auth.admin.createUser({
    id: userId,
    email,
    password,
    email_confirm: true,
  });
  if (authError) throw authError;

  await admin.from("users").upsert({
    id: userId,
    public_id: "U_" + userId.slice(0, 8),
    full_name: `User ${tag}`,
    profile_completed: true,
  });

  const client = createClient(LOCAL_URL, ANON_KEY);
  const { data: sessionData, error: loginError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (loginError || !sessionData?.session) throw loginError;

  return { userId, client };
}

async function createTestPlan(hostId: string, options: {
  plan_size: number;
  max_participants: number;
  participant_filtering?: "AUTOMATIC" | "ASSIGNED";
  title?: string;
}) {
  const planId = crypto.randomUUID();
  const { error } = await admin.from("plans").insert({
    id: planId,
    public_id: "P_" + planId.slice(0, 8),
    title: options.title || "Capacity Test Plan",
    place_name: "Test Place",
    place_address: "123 Test St",
    status: "LIVE",
    plan_size: options.plan_size,
    max_participants: options.max_participants,
    participant_filtering: options.participant_filtering || "AUTOMATIC",
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
  });
  if (error) throw error;

  // Insert host as JOINED
  await admin.from("plan_participants").insert({
    plan_id: planId,
    user_id: hostId,
    role: "HOST",
    rsvp_status: "JOINED",
    assigned_group: options.participant_filtering === "ASSIGNED" ? "GOING" : null,
    responded_at: new Date().toISOString(),
    delivery_status: "DELIVERED",
  });

  return planId;
}

async function runPhase2CapacityQueueVerification() {
  console.log("=========================================================================");
  console.log("Starting Phase 2: Invite-Link Capacity & Queue State Machine Verification");
  console.log("=========================================================================\n");

  // Create common host
  const host = await createTestUser("host");

  // ---------------------------------------------------------------------------
  // Scenario 1: Size == invited -> INVITED + plan_size increases exactly once
  // ---------------------------------------------------------------------------
  console.log("--- Scenario 1: Size == invited -> INVITED + plan_size increases ---");
  const plan1Id = await createTestPlan(host.userId, {
    plan_size: 2,
    max_participants: 2,
    participant_filtering: "AUTOMATIC",
    title: "Scenario 1 Plan",
  });

  // Add 1 invited participant -> total non-skipped invited = 2 (Host JOINED + User INVITED)
  const user1A = await createTestUser("1A");
  await admin.from("plan_participants").insert({
    plan_id: plan1Id,
    user_id: user1A.userId,
    role: "PARTICIPANT",
    rsvp_status: "INVITED",
    delivery_status: "DELIVERED",
  });

  // User 1B claims invite -> size (2) == invited (2) -> Case A
  const user1B = await createTestUser("1B");
  const { data: res1, error: err1 } = await user1B.client.rpc("claim_plan_invite", {
    p_plan_id: plan1Id,
  });
  assert.ifError(err1);
  console.log("Claim result:", res1);
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.rsvp_status, "INVITED");
  assert.strictEqual(res1.assigned_group, null);
  assert.strictEqual(res1.waitlist_position, null);
  assert.strictEqual(res1.plan_size, 3, "plan_size must increment from 2 to 3");

  const { data: dbPlan1 } = await admin.from("plans").select("plan_size, max_participants").eq("id", plan1Id).single();
  assert.strictEqual(dbPlan1?.plan_size, 3, "Database plan_size must be 3");
  assert.ok(dbPlan1!.max_participants >= 3, "max_participants must be >= 3");
  console.log(" Scenario 1 Passed: Size == invited resulted in INVITED and plan_size incremented to 3.\n");

  // ---------------------------------------------------------------------------
  // Scenario 2: ASSIGNED + size < invited -> WAITLISTED + WAITLIST group + size unchanged
  // ---------------------------------------------------------------------------
  console.log("--- Scenario 2: ASSIGNED + size < invited -> WAITLISTED + WAITLIST group ---");
  const plan2Id = await createTestPlan(host.userId, {
    plan_size: 2,
    max_participants: 5,
    participant_filtering: "ASSIGNED",
    title: "Scenario 2 Plan",
  });

  // Add 2 invited participants in ASSIGNED -> total invited = 3 (Host + 2 invited), size = 2 < 3
  const user2A = await createTestUser("2A");
  const user2B = await createTestUser("2B");
  await admin.from("plan_participants").insert([
    {
      plan_id: plan2Id,
      user_id: user2A.userId,
      role: "PARTICIPANT",
      rsvp_status: "INVITED",
      assigned_group: "GOING",
      delivery_status: "DELIVERED",
    },
    {
      plan_id: plan2Id,
      user_id: user2B.userId,
      role: "PARTICIPANT",
      rsvp_status: "INVITED",
      assigned_group: "GOING",
      delivery_status: "DELIVERED",
    },
  ]);

  const user2C = await createTestUser("2C");
  const { data: res2, error: err2 } = await user2C.client.rpc("claim_plan_invite", {
    p_plan_id: plan2Id,
  });
  assert.ifError(err2);
  console.log("Claim result:", res2);
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.rsvp_status, "WAITLISTED");
  assert.strictEqual(res2.assigned_group, "WAITLIST");
  assert.strictEqual(res2.waitlist_position, 1);
  assert.strictEqual(res2.plan_size, 2, "plan_size must remain 2");

  const { data: dbPart2C } = await admin.from("plan_participants").select("*").eq("plan_id", plan2Id).eq("user_id", user2C.userId).single();
  assert.strictEqual(dbPart2C?.rsvp_status, "WAITLISTED");
  assert.strictEqual(dbPart2C?.assigned_group, "WAITLIST");
  assert.strictEqual(dbPart2C?.joined_queue_at, null, "joined_queue_at must be NULL in ASSIGNED mode");
  assert.strictEqual(dbPart2C?.waitlist_position, 1);

  const { data: dbPlan2 } = await admin.from("plans").select("plan_size").eq("id", plan2Id).single();
  assert.strictEqual(dbPlan2?.plan_size, 2, "plan_size must not change");
  console.log(" Scenario 2 Passed: ASSIGNED overflow became WAITLISTED with WAITLIST group, joined_queue_at NULL, position 1, and plan_size unchanged.\n");

  // ---------------------------------------------------------------------------
  // Scenario 3: AUTOMATIC + size < invited + available spot -> JOINED + size unchanged
  // ---------------------------------------------------------------------------
  console.log("--- Scenario 3: AUTOMATIC + size < invited + spot available -> JOINED ---");
  const plan3Id = await createTestPlan(host.userId, {
    plan_size: 3,
    max_participants: 6,
    participant_filtering: "AUTOMATIC",
    title: "Scenario 3 Plan",
  });

  // Host is JOINED (joined_count = 1). Add 3 INVITED users -> invited_count = 4.
  // size (3) < invited (4). But joined_count (1) < size (3) (2 spots available).
  const user3A = await createTestUser("3A");
  const user3B = await createTestUser("3B");
  const user3C = await createTestUser("3C");
  await admin.from("plan_participants").insert([
    { plan_id: plan3Id, user_id: user3A.userId, role: "PARTICIPANT", rsvp_status: "INVITED", delivery_status: "DELIVERED" },
    { plan_id: plan3Id, user_id: user3B.userId, role: "PARTICIPANT", rsvp_status: "INVITED", delivery_status: "DELIVERED" },
    { plan_id: plan3Id, user_id: user3C.userId, role: "PARTICIPANT", rsvp_status: "INVITED", delivery_status: "DELIVERED" },
  ]);

  const user3D = await createTestUser("3D");
  const { data: res3, error: err3 } = await user3D.client.rpc("claim_plan_invite", {
    p_plan_id: plan3Id,
  });
  assert.ifError(err3);
  console.log("Claim result:", res3);
  assert.strictEqual(res3.success, true);
  assert.strictEqual(res3.rsvp_status, "JOINED");
  assert.strictEqual(res3.assigned_group, null);
  assert.strictEqual(res3.waitlist_position, null);
  assert.strictEqual(res3.plan_size, 3, "plan_size must remain 3");

  const { data: dbPart3D } = await admin.from("plan_participants").select("*").eq("plan_id", plan3Id).eq("user_id", user3D.userId).single();
  assert.strictEqual(dbPart3D?.rsvp_status, "JOINED");
  assert.ok(dbPart3D?.joined_queue_at != null, "joined_queue_at must be populated");
  assert.ok(dbPart3D?.responded_at != null, "responded_at must be populated");
  console.log(" Scenario 3 Passed: Available spot in AUTOMATIC resulted in JOINED and plan_size unchanged.\n");

  // ---------------------------------------------------------------------------
  // Scenario 4: AUTOMATIC + size < invited + no spot -> WAITLISTED + size unchanged
  // ---------------------------------------------------------------------------
  console.log("--- Scenario 4: AUTOMATIC + size < invited + no spot -> WAITLISTED ---");
  const plan4Id = await createTestPlan(host.userId, {
    plan_size: 2,
    max_participants: 6,
    participant_filtering: "AUTOMATIC",
    title: "Scenario 4 Plan",
  });

  // Host is JOINED (joined_count = 1). Add 1 JOINED participant -> joined_count = 2 (capacity full).
  // Add 2 INVITED participants -> invited_count = 4. size (2) < invited (4).
  const user4A = await createTestUser("4A");
  const user4B = await createTestUser("4B");
  const user4C = await createTestUser("4C");
  await admin.from("plan_participants").insert([
    { plan_id: plan4Id, user_id: user4A.userId, role: "PARTICIPANT", rsvp_status: "JOINED", delivery_status: "DELIVERED" },
    { plan_id: plan4Id, user_id: user4B.userId, role: "PARTICIPANT", rsvp_status: "INVITED", delivery_status: "DELIVERED" },
    { plan_id: plan4Id, user_id: user4C.userId, role: "PARTICIPANT", rsvp_status: "INVITED", delivery_status: "DELIVERED" },
  ]);

  const user4D = await createTestUser("4D");
  const { data: res4, error: err4 } = await user4D.client.rpc("claim_plan_invite", {
    p_plan_id: plan4Id,
  });
  assert.ifError(err4);
  console.log("Claim result:", res4);
  assert.strictEqual(res4.success, true);
  assert.strictEqual(res4.rsvp_status, "WAITLISTED");
  assert.strictEqual(res4.assigned_group, null);
  assert.strictEqual(res4.waitlist_position, 1);
  assert.strictEqual(res4.plan_size, 2, "plan_size must remain 2");

  const { data: dbPart4D } = await admin.from("plan_participants").select("*").eq("plan_id", plan4Id).eq("user_id", user4D.userId).single();
  assert.strictEqual(dbPart4D?.rsvp_status, "WAITLISTED");
  assert.ok(dbPart4D?.joined_queue_at != null, "joined_queue_at must be populated");
  assert.strictEqual(dbPart4D?.waitlist_position, 1);
  console.log(" Scenario 4 Passed: No spot in AUTOMATIC resulted in WAITLISTED with position 1 and plan_size unchanged.\n");

  // ---------------------------------------------------------------------------
  // Scenario 5: Existing INVITED participants remain INVITED
  // ---------------------------------------------------------------------------
  console.log("--- Scenario 5: Existing INVITED participants remain INVITED ---");
  const { data: checkPart2A } = await admin.from("plan_participants").select("rsvp_status").eq("plan_id", plan2Id).eq("user_id", user2A.userId).single();
  assert.strictEqual(checkPart2A?.rsvp_status, "INVITED", "User 2A must still be INVITED");

  const { data: checkPart3A } = await admin.from("plan_participants").select("rsvp_status").eq("plan_id", plan3Id).eq("user_id", user3A.userId).single();
  assert.strictEqual(checkPart3A?.rsvp_status, "INVITED", "User 3A must still be INVITED");

  const { data: checkPart4B } = await admin.from("plan_participants").select("rsvp_status").eq("plan_id", plan4Id).eq("user_id", user4B.userId).single();
  assert.strictEqual(checkPart4B?.rsvp_status, "INVITED", "User 4B must still be INVITED");
  console.log(" Scenario 5 Passed: Existing INVITED participants were untouched across all scenarios.\n");

  // ---------------------------------------------------------------------------
  // Scenario 6: Existing JOINED/WAITLISTED/SKIPPED remain unchanged
  // ---------------------------------------------------------------------------
  console.log("--- Scenario 6: Existing JOINED/WAITLISTED/SKIPPED remain unchanged ---");
  // user4A is JOINED, user4D is WAITLISTED. Let's add a SKIPPED participant to plan4.
  const user4E = await createTestUser("4E");
  await admin.from("plan_participants").insert({
    plan_id: plan4Id,
    user_id: user4E.userId,
    role: "PARTICIPANT",
    rsvp_status: "SKIPPED",
    skip_reason: "LEFT",
    delivery_status: "DELIVERED",
  });

  // Call claim_plan_invite as user4A (JOINED)
  const { data: res6A } = await user4A.client.rpc("claim_plan_invite", { p_plan_id: plan4Id });
  assert.strictEqual(res6A.already_participating, true);
  assert.strictEqual(res6A.rsvp_status, "JOINED");

  // Call claim_plan_invite as user4D (WAITLISTED)
  const { data: res6D } = await user4D.client.rpc("claim_plan_invite", { p_plan_id: plan4Id });
  assert.strictEqual(res6D.already_participating, true);
  assert.strictEqual(res6D.rsvp_status, "WAITLISTED");

  // Call claim_plan_invite as user4E (SKIPPED)
  const { data: res6E } = await user4E.client.rpc("claim_plan_invite", { p_plan_id: plan4Id });
  assert.strictEqual(res6E.already_participating, true);
  assert.strictEqual(res6E.rsvp_status, "SKIPPED");
  console.log(" Scenario 6 Passed: Existing states JOINED, WAITLISTED, and SKIPPED preserved idempotently.\n");

  // ---------------------------------------------------------------------------
  // Scenario 7: Repeated claim creates no duplicate and does not increase capacity
  // ---------------------------------------------------------------------------
  console.log("--- Scenario 7: Repeated claim creates no duplicate and does not increase capacity ---");
  const { data: plan1BeforeRepeat } = await admin.from("plans").select("plan_size").eq("id", plan1Id).single();
  const sizeBefore = plan1BeforeRepeat?.plan_size;

  const { data: res7Repeat } = await user1B.client.rpc("claim_plan_invite", { p_plan_id: plan1Id });
  assert.strictEqual(res7Repeat.already_participating, true);
  assert.strictEqual(res7Repeat.rsvp_status, "INVITED");

  const { data: plan1AfterRepeat } = await admin.from("plans").select("plan_size").eq("id", plan1Id).single();
  assert.strictEqual(plan1AfterRepeat?.plan_size, sizeBefore, "Plan size must not increase on repeated claim");

  const { count: rowCount } = await admin.from("plan_participants").select("*", { count: "exact", head: true }).eq("plan_id", plan1Id).eq("user_id", user1B.userId);
  assert.strictEqual(rowCount, 1, "Must have exactly 1 participant row");
  console.log(" Scenario 7 Passed: Repeated claim is idempotent and does not increase capacity.\n");

  // ---------------------------------------------------------------------------
  // Scenario 8: Concurrent claims cannot double-increment capacity
  // ---------------------------------------------------------------------------
  console.log("--- Scenario 8: Concurrent claims cannot double-increment capacity ---");
  const plan8Id = await createTestPlan(host.userId, {
    plan_size: 2,
    max_participants: 10,
    participant_filtering: "AUTOMATIC",
    title: "Scenario 8 Plan",
  });
  // Add 1 participant -> invited_count = 2, size = 2 (Case A: size == invited)
  const user8Init = await createTestUser("8Init");
  await admin.from("plan_participants").insert({
    plan_id: plan8Id,
    user_id: user8Init.userId,
    role: "PARTICIPANT",
    rsvp_status: "INVITED",
    delivery_status: "DELIVERED",
  });

  const [u8A, u8B, u8C] = await Promise.all([
    createTestUser("8A"),
    createTestUser("8B"),
    createTestUser("8C"),
  ]);

  // Execute concurrent claims simultaneously
  const results = await Promise.all([
    u8A.client.rpc("claim_plan_invite", { p_plan_id: plan8Id }),
    u8B.client.rpc("claim_plan_invite", { p_plan_id: plan8Id }),
    u8C.client.rpc("claim_plan_invite", { p_plan_id: plan8Id }),
  ]);

  for (const r of results) {
    assert.ifError(r.error);
    assert.strictEqual(r.data.success, true);
    console.log(`Concurrent claim: status=${r.data.rsvp_status}, resulting plan_size=${r.data.plan_size}`);
  }

  // Verify final plan_size: initial was 2. With 3 sequential claimants under Case A (each size == invited),
  // final plan_size must be exactly 2 + 3 = 5.
  const { data: dbPlan8 } = await admin.from("plans").select("plan_size, max_participants").eq("id", plan8Id).single();
  assert.strictEqual(dbPlan8?.plan_size, 5, "plan_size must be exactly 5 after 3 concurrent claims");

  const { count: finalCount8 } = await admin.from("plan_participants").select("*", { count: "exact", head: true }).eq("plan_id", plan8Id).neq("rsvp_status", "SKIPPED");
  assert.strictEqual(finalCount8, 5, "Total invited count must be 5 (Host + 1 initial + 3 claims)");
  console.log(" Scenario 8 Passed: Concurrent claims safely serialized via row lock with accurate capacity tracking.\n");

  console.log("=========================================================================");
  console.log("ALL 8 VERIFICATION SCENARIOS PASSED SUCCESSFULLY!");
  console.log("=========================================================================");
}

runPhase2CapacityQueueVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
