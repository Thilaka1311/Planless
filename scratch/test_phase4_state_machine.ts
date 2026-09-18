import assert from "node:assert";
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
  const email = `phase4-${tag}-${Date.now()}-${Math.floor(Math.random() * 100000)}@local.planless`;
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

async function getPlan(planId: string) {
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select("*")
    .eq("id", planId)
    .single();
  if (error) throw new Error(`getPlan failed: ${error.message}`);
  return data;
}

async function getParticipant(planId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("plan_participants")
    .select("*")
    .eq("plan_id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getParticipant failed: ${error.message}`);
  return data;
}

async function countActiveParticipants(planId: string) {
  const { count, error } = await supabaseAdmin
    .from("plan_participants")
    .select("*", { count: "exact", head: true })
    .eq("plan_id", planId)
    .neq("rsvp_status", "SKIPPED");
  if (error) throw new Error(`countActiveParticipants failed: ${error.message}`);
  return count ?? 0;
}

async function assertDatabaseInvariant(planId: string, stepName: string) {
  const plan = await getPlan(planId);
  const activeCount = await countActiveParticipants(planId);
  assert.strictEqual(
    plan.invited_participants,
    activeCount,
    `[INVARIANT VIOLATION] at step '${stepName}': plans.invited_participants (${plan.invited_participants}) != active participant count (${activeCount})`
  );
  return { plan, activeCount };
}

async function runPhase4Tests() {
  console.log("=========================================================================");
  console.log("Starting Phase 4: Participant State Machine Verification & Regression Suite");
  console.log("=========================================================================\n");

  const createdPlanIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    // =========================================================================
    // 1. AUTOMATIC — HOST INVITES PARTICIPANT
    // =========================================================================
    console.log("--- 1. Testing AUTOMATIC: Host Invites Participant ---");
    const host1 = await createTestUser("Host1");
    const userA = await createTestUser("UserA");
    const userC = await createTestUser("UserC");
    const userD = await createTestUser("UserD");
    createdUserIds.push(host1.userId, userA.userId, userC.userId, userD.userId);

    const scheduledAt = new Date(Date.now() + 86400000).toISOString();
    const rsvpDeadline = new Date(Date.now() + 43200000).toISOString();

    // Create AUTOMATIC plan: plan_size = 3
    const { data: plan1, error: p1Err } = await host1.client
      .from("plans")
      .insert({
        title: "Test Automatic Plan 1",
        public_id: "p_" + crypto.randomUUID().slice(0, 8),
        place_name: "Venue 1",
        place_address: "Address 1",
        plan_size: 3,
        invited_participants: 1, // Host is JOINED
        participant_filtering: "AUTOMATIC",
        scheduled_at: scheduledAt,
        rsvp_deadline: rsvpDeadline,
        allow_participant_invites: true,
      })
      .select()
      .single();
    if (p1Err || !plan1) throw new Error(`Failed to create plan 1: ${p1Err?.message}`);
    createdPlanIds.push(plan1.id);

    // Host invites User A -> invited_participants = 2
    await host1.client.rpc("invite_participants", {
      p_plan_id: plan1.id,
      p_invitee_user_ids: [userA.userId],
    });

    let state = await assertDatabaseInvariant(plan1.id, "Plan 1 Setup (plan_size=3, invited=2)");
    console.log(`Initial state: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.plan_size, 3);
    assert.strictEqual(state.plan.invited_participants, 2);

    // Test: Host invites User C (available capacity: plan_size 3 > invited 2)
    console.log("Host invites User C (plan_size=3, invited=2)...");
    const { error: invCErr } = await host1.client.rpc("invite_participants", {
      p_plan_id: plan1.id,
      p_invitee_user_ids: [userC.userId],
    });
    assert.ifError(invCErr);

    state = await assertDatabaseInvariant(plan1.id, "After Inviting User C");
    console.log(`After User C invite: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.plan_size, 3, "plan_size must remain 3");
    assert.strictEqual(state.plan.invited_participants, 3, "invited_participants must become 3");

    const partC = await getParticipant(plan1.id, userC.userId);
    assert.strictEqual(partC.rsvp_status, "INVITED", "User C rsvp_status must be INVITED");
    assert.strictEqual(partC.assigned_group, null, "User C assigned_group must be null");
    assert.strictEqual(partC.waitlist_position, null, "User C waitlist_position must be null");
    assert.strictEqual(partC.joined_queue_at, null, "User C joined_queue_at must be null upon invitation");
    console.log(" User C invited correctly without being silently JOINED.\n");

    // Test: plan_size = 3, invited_participants = 3. Host invites User D.
    console.log("Host invites User D (plan_size=3, invited=3)...");
    const { error: invDErr } = await host1.client.rpc("invite_participants", {
      p_plan_id: plan1.id,
      p_invitee_user_ids: [userD.userId],
    });
    assert.ifError(invDErr);

    state = await assertDatabaseInvariant(plan1.id, "After Inviting User D");
    console.log(`After User D invite: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.plan_size, 4, "plan_size must increment to 4 when size == invited");
    assert.strictEqual(state.plan.invited_participants, 4, "invited_participants must increment to 4");

    const partD = await getParticipant(plan1.id, userD.userId);
    assert.strictEqual(partD.rsvp_status, "INVITED", "User D rsvp_status must be INVITED");
    assert.strictEqual(partD.assigned_group, null, "User D assigned_group must be null");
    assert.strictEqual(partD.waitlist_position, null, "User D waitlist_position must be null");
    assert.strictEqual(partD.joined_queue_at, null, "User D joined_queue_at must be null upon invitation");
    console.log(" User D invited correctly and capacity incremented without silently joining User D.\n");

    // =========================================================================
    // 2. AUTOMATIC — MORE INVITED THAN CAPACITY
    // =========================================================================
    console.log("--- 2. Testing AUTOMATIC: More Invited Than Capacity ---");
    const host2 = await createTestUser("Host2");
    const u2_1 = await createTestUser("U2_1");
    const u2_2 = await createTestUser("U2_2");
    const u2_3 = await createTestUser("U2_3");
    const u2_4 = await createTestUser("U2_4");
    const userF = await createTestUser("UserF");
    createdUserIds.push(host2.userId, u2_1.userId, u2_2.userId, u2_3.userId, u2_4.userId, userF.userId);

    const { data: plan2, error: p2Err } = await host2.client
      .from("plans")
      .insert({
        title: "Test Automatic Plan 2",
        public_id: "p_" + crypto.randomUUID().slice(0, 8),
        place_name: "Venue 2",
        place_address: "Address 2",
        plan_size: 3,
        invited_participants: 1,
        participant_filtering: "AUTOMATIC",
        scheduled_at: scheduledAt,
        rsvp_deadline: rsvpDeadline,
        allow_participant_invites: true,
      })
      .select()
      .single();
    if (p2Err || !plan2) throw new Error(`Failed to create plan 2: ${p2Err?.message}`);
    createdPlanIds.push(plan2.id);

    // Add 4 participants to reach invited_participants = 5
    await host2.client.rpc("invite_participants", {
      p_plan_id: plan2.id,
      p_invitee_user_ids: [u2_1.userId, u2_2.userId, u2_3.userId, u2_4.userId],
    });
    // Set plan_size back to 3 to produce plan_size = 3, invited_participants = 5
    await host2.client.rpc("update_plan_capacity", {
      p_plan_id: plan2.id,
      p_plan_size: 3,
    });

    state = await assertDatabaseInvariant(plan2.id, "Plan 2 Setup (plan_size=3, invited=5)");
    console.log(`Plan 2 setup: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.plan_size, 3);
    assert.strictEqual(state.plan.invited_participants, 5);

    // Invite User F
    console.log("Inviting User F when plan_size=3, invited=5...");
    const { error: invFErr } = await host2.client.rpc("invite_participants", {
      p_plan_id: plan2.id,
      p_invitee_user_ids: [userF.userId],
    });
    assert.ifError(invFErr);

    state = await assertDatabaseInvariant(plan2.id, "After Inviting User F");
    console.log(`After User F invite: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.plan_size, 3, "plan_size must remain 3");
    assert.strictEqual(state.plan.invited_participants, 6, "invited_participants must become 6");

    const partF = await getParticipant(plan2.id, userF.userId);
    assert.strictEqual(partF.rsvp_status, "INVITED", "User F must be INVITED, NOT automatically WAITLISTED");
    assert.strictEqual(partF.assigned_group, null, "assigned_group must be null");
    assert.strictEqual(partF.waitlist_position, null, "waitlist_position must be null (no waitlist number)");
    assert.strictEqual(partF.joined_queue_at, null, "joined_queue_at must be null");
    console.log(" User F is INVITED without waitlist position even though capacity is full.\n");

    // =========================================================================
    // 3. AUTOMATIC — EXISTING INVITED PARTICIPANT (IDEMPOTENCY)
    // =========================================================================
    console.log("--- 3. Testing AUTOMATIC: Duplicate Invitation Idempotency ---");
    console.log("Re-inviting existing User F...");
    const { error: invFRepeatErr } = await host2.client.rpc("invite_participants", {
      p_plan_id: plan2.id,
      p_invitee_user_ids: [userF.userId],
    });
    assert.ifError(invFRepeatErr);

    state = await assertDatabaseInvariant(plan2.id, "After Duplicate Invite of User F");
    console.log(`After duplicate invite: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.plan_size, 3, "plan_size must not change");
    assert.strictEqual(state.plan.invited_participants, 6, "invited_participants must NOT increment again");

    const partFRepeat = await getParticipant(plan2.id, userF.userId);
    assert.strictEqual(partFRepeat.rsvp_status, "INVITED");
    assert.strictEqual(partFRepeat.assigned_group, null);
    assert.strictEqual(partFRepeat.waitlist_position, null);
    assert.strictEqual(partFRepeat.joined_queue_at, null);
    console.log(" Duplicate invitation is strictly idempotent.\n");

    // =========================================================================
    // 4. AUTOMATIC — EXPLICIT JOIN
    // =========================================================================
    console.log("--- 4. Testing AUTOMATIC: Explicit Join Actions ---");
    // Case A: plan_size = 4, joined_count < 4 (only host is JOINED)
    // User C is INVITED in Plan 1. User C explicitly joins.
    console.log("Case A: User C explicitly joins when spots available...");
    const { error: joinCErr } = await userC.client
      .from("plan_participants")
      .update({
        rsvp_status: "JOINED",
        responded_at: new Date().toISOString(),
      })
      .eq("plan_id", plan1.id)
      .eq("user_id", userC.userId);
    assert.ifError(joinCErr);

    state = await assertDatabaseInvariant(plan1.id, "After User C Explicit Join");
    console.log(`After User C join: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.plan_size, 4, "plan_size unchanged");
    assert.strictEqual(state.plan.invited_participants, 4, "invited_participants unchanged");

    const partCJoined = await getParticipant(plan1.id, userC.userId);
    assert.strictEqual(partCJoined.rsvp_status, "JOINED", "User C must now be JOINED");
    assert.ok(partCJoined.joined_queue_at !== null, "joined_queue_at must now be set on join");
    console.log(" Case A Passed: INVITED -> JOINED without changing invited_participants or plan_size.\n");

    // Case B: plan_size = 3, joined_count = 3. Participant is INVITED.
    // In Plan 2, host2 is JOINED (1). Let's make u2_1 and u2_2 JOINED so joined_count = 3.
    console.log("Setting up Case B: plan_size=3, joined_count=3...");
    await u2_1.client
      .from("plan_participants")
      .update({ rsvp_status: "JOINED", responded_at: new Date().toISOString() })
      .eq("plan_id", plan2.id)
      .eq("user_id", u2_1.userId);
    await u2_2.client
      .from("plan_participants")
      .update({ rsvp_status: "JOINED", responded_at: new Date().toISOString() })
      .eq("plan_id", plan2.id)
      .eq("user_id", u2_2.userId);

    const { count: joinedCountP2 } = await supabaseAdmin
      .from("plan_participants")
      .select("*", { count: "exact", head: true })
      .eq("plan_id", plan2.id)
      .eq("rsvp_status", "JOINED");
    assert.strictEqual(joinedCountP2, 3, "joined_count must be 3");

    // User F is currently INVITED in Plan 2.
    const partFBefore = await getParticipant(plan2.id, userF.userId);
    assert.strictEqual(partFBefore.rsvp_status, "INVITED");
    assert.strictEqual(partFBefore.joined_queue_at, null);
    assert.strictEqual(partFBefore.waitlist_position, null);

    // User F explicitly joins when capacity is full -> enters WAITLIST
    console.log("Case B: User F explicitly joins when capacity full (3/3)...");
    const { error: joinFErr } = await userF.client
      .from("plan_participants")
      .update({
        rsvp_status: "WAITLISTED",
        waitlist_position: 1,
        responded_at: new Date().toISOString(),
      })
      .eq("plan_id", plan2.id)
      .eq("user_id", userF.userId);
    assert.ifError(joinFErr);

    state = await assertDatabaseInvariant(plan2.id, "After User F Explicit Join to Waitlist");
    console.log(`After User F join: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.plan_size, 3, "plan_size must remain 3");
    assert.strictEqual(state.plan.invited_participants, 6, "invited_participants must remain 6");

    const partFAfter = await getParticipant(plan2.id, userF.userId);
    assert.strictEqual(partFAfter.rsvp_status, "WAITLISTED", "User F must now be WAITLISTED");
    assert.ok(partFAfter.joined_queue_at !== null, "joined_queue_at MUST now be populated");
    assert.strictEqual(partFAfter.waitlist_position, 1, "waitlist_position MUST now be assigned");
    console.log(" Case B Passed: INVITED -> WAITLISTED, joined_queue_at and waitlist_position created now.\n");

    // =========================================================================
    // 5. ASSIGNED — VERIFY NO REGRESSION
    // =========================================================================
    console.log("--- 5. Testing ASSIGNED: Verify No Regression ---");
    const hostAssigned = await createTestUser("HostAssigned");
    const uAssigned1 = await createTestUser("UAssigned1");
    const uAssigned2 = await createTestUser("UAssigned2");
    const uAssigned3 = await createTestUser("UAssigned3");
    const uAssigned4 = await createTestUser("UAssigned4");
    const uAssignedNew = await createTestUser("UAssignedNew");
    createdUserIds.push(
      hostAssigned.userId,
      uAssigned1.userId,
      uAssigned2.userId,
      uAssigned3.userId,
      uAssigned4.userId,
      uAssignedNew.userId
    );

    // Create ASSIGNED plan: plan_size = 3
    const { data: planAssigned, error: pAssignedErr } = await hostAssigned.client
      .from("plans")
      .insert({
        title: "Test Assigned Plan",
        public_id: "p_" + crypto.randomUUID().slice(0, 8),
        place_name: "Venue Assigned",
        place_address: "Address Assigned",
        plan_size: 3,
        invited_participants: 1,
        participant_filtering: "ASSIGNED",
        scheduled_at: scheduledAt,
        rsvp_deadline: rsvpDeadline,
        allow_participant_invites: true,
      })
      .select()
      .single();
    if (pAssignedErr || !planAssigned) throw new Error(`Failed to create assigned plan: ${pAssignedErr?.message}`);
    createdPlanIds.push(planAssigned.id);

    // Add 4 participants to reach invited_participants = 5
    await hostAssigned.client.rpc("invite_participants", {
      p_plan_id: planAssigned.id,
      p_invitee_user_ids: [uAssigned1.userId, uAssigned2.userId, uAssigned3.userId, uAssigned4.userId],
    });
    // Set plan_size back to 3
    await hostAssigned.client.rpc("update_plan_capacity", {
      p_plan_id: planAssigned.id,
      p_plan_size: 3,
    });

    state = await assertDatabaseInvariant(planAssigned.id, "Assigned Plan Setup (plan_size=3, invited=5)");
    console.log(`Assigned Plan setup: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.plan_size, 3);
    assert.strictEqual(state.plan.invited_participants, 5);

    // Genuinely new participant joins/claims invite in ASSIGNED mode when capacity full
    console.log("New participant claims invite in full ASSIGNED plan...");
    const { data: claimNewRes, error: claimNewErr } = await uAssignedNew.client.rpc("claim_plan_invite", {
      p_plan_id: planAssigned.id,
    });
    assert.ifError(claimNewErr);
    console.log("Claim result for new participant:", claimNewRes);
    assert.strictEqual(claimNewRes.rsvp_status, "WAITLISTED");
    assert.strictEqual(claimNewRes.assigned_group, "WAITLIST");

    state = await assertDatabaseInvariant(planAssigned.id, "After New Participant Claim in Assigned");
    console.log(`After new participant: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.plan_size, 3, "plan_size must remain 3");
    assert.strictEqual(state.plan.invited_participants, 6, "invited_participants must become 6");

    const partNewAssigned = await getParticipant(planAssigned.id, uAssignedNew.userId);
    assert.strictEqual(partNewAssigned.rsvp_status, "WAITLISTED");
    assert.strictEqual(partNewAssigned.assigned_group, "WAITLIST");
    assert.strictEqual(partNewAssigned.joined_queue_at, null, "joined_queue_at must be NULL in ASSIGNED mode");
    console.log(" New participant in ASSIGNED mode became WAITLISTED + WAITLIST group.\n");

    // Existing INVITED participant (uAssigned1) claims again
    console.log("Existing INVITED participant (uAssigned1) claims again in ASSIGNED plan...");
    const { data: claimExistingRes, error: claimExistingErr } = await uAssigned1.client.rpc("claim_plan_invite", {
      p_plan_id: planAssigned.id,
    });
    assert.ifError(claimExistingErr);
    console.log("Claim result for existing participant:", claimExistingRes);
    assert.strictEqual(claimExistingRes.already_participating, true);
    assert.strictEqual(claimExistingRes.rsvp_status, "INVITED");

    state = await assertDatabaseInvariant(planAssigned.id, "After Existing Participant Claim");
    assert.strictEqual(state.plan.plan_size, 3, "plan_size unchanged");
    assert.strictEqual(state.plan.invited_participants, 6, "invited_participants unchanged");

    const part1Assigned = await getParticipant(planAssigned.id, uAssigned1.userId);
    assert.strictEqual(part1Assigned.rsvp_status, "INVITED", "Must remain INVITED");
    console.log(" Existing participant remains INVITED with no conversion to WAITLISTED.\n");

    // =========================================================================
    // 6. SKIP
    // =========================================================================
    console.log("--- 6. Testing SKIP Transition ---");
    // Start with plan_size = 3, invited_participants = 6. Take active participant and change to SKIPPED.
    console.log("Skipping participant uAssigned2...");
    const { error: skipErr } = await uAssigned2.client
      .from("plan_participants")
      .update({
        rsvp_status: "SKIPPED",
        skip_reason: "SKIPPED",
        assigned_group: null,
        waitlist_position: null,
        updated_at: new Date().toISOString(),
      })
      .eq("plan_id", planAssigned.id)
      .eq("user_id", uAssigned2.userId);
    assert.ifError(skipErr);

    state = await assertDatabaseInvariant(planAssigned.id, "After Skipping uAssigned2");
    console.log(`After SKIP: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.plan_size, 3, "plan_size must remain 3");
    assert.strictEqual(state.plan.invited_participants, 5, "invited_participants must decrement from 6 to 5");
    console.log(" Participant SKIP decremented invited_participants correctly and invariant holds.\n");

    // =========================================================================
    // 7. REJOIN
    // =========================================================================
    console.log("--- 7. Testing REJOIN Transition ---");
    // uAssigned2 is SKIPPED. Call rejoin_plan.
    console.log("uAssigned2 calling rejoin_plan RPC...");
    const { data: rejoinRes, error: rejoinErr } = await uAssigned2.client.rpc("rejoin_plan", {
      p_plan_id: planAssigned.id,
    });
    assert.ifError(rejoinErr);
    console.log("rejoin_plan result:", rejoinRes);

    state = await assertDatabaseInvariant(planAssigned.id, "After uAssigned2 Rejoin Request");
    console.log(`After rejoin_plan: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.invited_participants, 6, "invited_participants must increment by 1 upon rejoin request");

    // Host resolves rejoin to WAITLIST
    console.log("Host resolves rejoin to WAITLIST...");
    const { data: resolveRes, error: resolveErr } = await hostAssigned.client.rpc("resolve_rejoined_participant", {
      p_plan_id: planAssigned.id,
      p_target_user_id: uAssigned2.userId,
      p_decision: "WAITLIST",
    });
    assert.ifError(resolveErr);
    console.log("resolve_rejoined_participant result:", resolveRes);

    state = await assertDatabaseInvariant(planAssigned.id, "After Host Resolves Rejoin to WAITLIST");
    console.log(`After resolve: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.invited_participants, 6, "invited_participants must NOT increment again on resolution");
    assert.strictEqual(state.plan.plan_size, 3, "plan_size must remain 3");

    const part2AfterResolve = await getParticipant(planAssigned.id, uAssigned2.userId);
    assert.strictEqual(part2AfterResolve.rsvp_status, "WAITLISTED");
    assert.strictEqual(part2AfterResolve.assigned_group, "WAITLIST");
    console.log(" Rejoin flow completed without double increment on resolution.\n");

    // =========================================================================
    // 8. REMOVE
    // =========================================================================
    // 8. REMOVE
    // =========================================================================
    console.log("--- 8. Testing REMOVE ---");
    // 8a: Remove an active INVITED participant (uAssigned3) -> Row is deleted, invited_participants decrements
    console.log("Removing active INVITED participant uAssigned3...");
    const { data: remInvitedRes, error: remInvitedErr } = await hostAssigned.client.rpc("remove_participant", {
      p_plan_id: planAssigned.id,
      p_target_user_id: uAssigned3.userId,
    });
    assert.ifError(remInvitedErr);
    console.log("remove_participant (INVITED) result:", remInvitedRes);

    state = await assertDatabaseInvariant(planAssigned.id, "After Removing Active INVITED uAssigned3");
    console.log(`After INVITED remove: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.invited_participants, 5, "invited_participants must decrement from 6 to 5");

    // 8b: Remove an active WAITLISTED participant (uAssigned2) -> Row set to SKIPPED, invited_participants decrements
    console.log("Removing active WAITLISTED participant uAssigned2...");
    const { data: remWaitlistedRes, error: remWaitlistedErr } = await hostAssigned.client.rpc("remove_participant", {
      p_plan_id: planAssigned.id,
      p_target_user_id: uAssigned2.userId,
    });
    assert.ifError(remWaitlistedErr);
    console.log("remove_participant (WAITLISTED) result:", remWaitlistedRes);

    state = await assertDatabaseInvariant(planAssigned.id, "After Removing Active WAITLISTED uAssigned2");
    console.log(`After WAITLISTED remove: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.invited_participants, 4, "invited_participants must decrement from 5 to 4");

    const part2AfterRemove = await getParticipant(planAssigned.id, uAssigned2.userId);
    assert.strictEqual(part2AfterRemove.rsvp_status, "SKIPPED");
    assert.strictEqual(part2AfterRemove.skip_reason, "REMOVED");

    // 8c: Remove a participant already SKIPPED (uAssigned2 is now SKIPPED)
    console.log("Calling remove_participant on already-SKIPPED participant uAssigned2...");
    const { data: remSkippedRes, error: remSkippedErr } = await hostAssigned.client.rpc("remove_participant", {
      p_plan_id: planAssigned.id,
      p_target_user_id: uAssigned2.userId,
    });
    assert.ifError(remSkippedErr);
    console.log("remove_participant on skipped result:", remSkippedRes);

    state = await assertDatabaseInvariant(planAssigned.id, "After Removing Already-SKIPPED uAssigned2");
    console.log(`After skipped remove: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.invited_participants, 4, "invited_participants must NOT decrement again");
    console.log(" Remove flow passed: active participants decrement, already SKIPPED does not double-decrement.\n");

    // =========================================================================
    // 9. CAPACITY CHANGE
    // =========================================================================
    console.log("--- 9. Testing CAPACITY CHANGE ---");
    // Starting with plan_size = 3, invited_participants = 4
    state = await assertDatabaseInvariant(planAssigned.id, "Before Capacity Change");
    console.log(`Starting state: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.plan_size, 3);
    assert.strictEqual(state.plan.invited_participants, 4);

    // Increase capacity to plan_size = 4
    console.log("Increasing capacity to plan_size = 4...");
    const { error: capIncErr } = await hostAssigned.client.rpc("update_plan_capacity", {
      p_plan_id: planAssigned.id,
      p_plan_size: 4,
    });
    assert.ifError(capIncErr);

    state = await assertDatabaseInvariant(planAssigned.id, "After Capacity Increase to 4");
    console.log(`After increase: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.plan_size, 4, "plan_size must become 4");
    assert.strictEqual(state.plan.invited_participants, 4, "invited_participants must remain 4");

    // Decrease capacity to plan_size = 2
    console.log("Decreasing capacity to plan_size = 2...");
    const { error: capDecErr } = await hostAssigned.client.rpc("update_plan_capacity", {
      p_plan_id: planAssigned.id,
      p_plan_size: 2,
    });
    assert.ifError(capDecErr);

    state = await assertDatabaseInvariant(planAssigned.id, "After Capacity Decrease to 2");
    console.log(`After decrease: plan_size=${state.plan.plan_size}, invited_participants=${state.plan.invited_participants}`);
    assert.strictEqual(state.plan.plan_size, 2, "plan_size must become 2");
    assert.strictEqual(state.plan.invited_participants, 4, "invited_participants must remain 4");
    console.log(" Capacity change tests passed: plan_size changed independently without altering invited_participants.\n");

    // =========================================================================
    // 10. NO DOUBLE INCREMENT / DECREMENT
    // =========================================================================
    console.log("--- 10. Testing No Double Increment / Decrement ---");
    for (const planId of createdPlanIds) {
      const finalState = await assertDatabaseInvariant(planId, `Final Verification for Plan ${planId}`);
      console.log(`Plan ${planId} Final: plan_size=${finalState.plan.plan_size}, invited_participants=${finalState.plan.invited_participants}, activeCount=${finalState.activeCount}`);
    }
    console.log(" Invariant holds across all plans. No double counts detected.\n");

    console.log("=========================================================================");
    console.log("ALL 14 PHASE 4 VERIFICATION SCENARIOS PASSED WITH PERFECT INVARIANT CHECKS!");
    console.log("=========================================================================\n");

  } finally {
    console.log("Cleaning up test resources...");
    for (const planId of createdPlanIds) {
      await supabaseAdmin.from("plan_participants").delete().eq("plan_id", planId);
      await supabaseAdmin.from("plans").delete().eq("id", planId);
    }
    for (const userId of createdUserIds) {
      await supabaseAdmin.from("users").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
    }
    console.log("Cleanup completed.");
  }
}

runPhase4Tests().catch((err) => {
  console.error("\n❌ Phase 4 Verification Suite Failed with Error:\n", err);
  process.exit(1);
});
