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

if (!url || !url.includes("127.0.0.1")) {
  throw new Error("Target is NOT local 127.0.0.1! Aborting for safety!");
}
if (!serviceKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY!");
}

const supabaseAdmin = createClient(url, serviceKey);

async function createTestUser(tag: string) {
  const email = `test-user-${tag}-${Date.now()}-${Math.floor(Math.random() * 100000)}@local.planless`;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: "Password123!",
    email_confirm: true,
    user_metadata: { full_name: `Test User ${tag}` },
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
    full_name: `Test User ${tag}`,
  });

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.user.id}` } },
  });

  // Login to get user session client
  const userClient = createClient(url, process.env.VITE_SUPABASE_ANON_KEY!);
  const { data: signInData, error: signInErr } = await userClient.auth.signInWithPassword({
    email,
    password: "Password123!",
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

async function countActiveParticipants(planId: string) {
  const { count, error } = await supabaseAdmin
    .from("plan_participants")
    .select("*", { count: "exact", head: true })
    .eq("plan_id", planId)
    .neq("rsvp_status", "SKIPPED");
  if (error) throw new Error(`countActiveParticipants failed: ${error.message}`);
  return count ?? 0;
}

async function runTests() {
  console.log("=== Running Phase 2 Verification Suite ===\n");

  const createdPlanIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    // ------------------------------------------------------------------------
    // SCENARIO A:
    // plan_size = 5, invited_participants = 2
    // Invite one new participant:
    // plan_size = 5, invited_participants = 3
    // ------------------------------------------------------------------------
    console.log("--- Testing Scenario A ---");
    const hostA = await createTestUser("HostA");
    const p1A = await createTestUser("P1A");
    const p2A = await createTestUser("P2A");
    createdUserIds.push(hostA.userId, p1A.userId, p2A.userId);

    // Create plan by host
    const scheduledAt = new Date(Date.now() + 86400000).toISOString();
    const rsvpDeadline = new Date(Date.now() + 43200000).toISOString();
    const randSuffixA = Math.floor(Math.random() * 1000000);

    const { data: newPlanA, error: planAErr } = await hostA.client
      .from("plans")
      .insert({
        title: `Scenario A Plan ${randSuffixA}`,
        public_id: `plan_a_${randSuffixA}`,
        place_name: "Venue A",
        place_address: "Address A",
        scheduled_at: scheduledAt,
        rsvp_deadline: rsvpDeadline,
        plan_size: 5,
        invited_participants: 1, // Host is inserted as JOINED by trigger
        allow_participant_invites: true,
      })
      .select()
      .single();

    if (planAErr || !newPlanA) throw new Error(`Failed to create plan A: ${planAErr?.message}`);
    createdPlanIds.push(newPlanA.id);

    // Add p1A as INVITED to get invited_participants = 2
    const { error: invP1Err } = await hostA.client.rpc("invite_participants", {
      p_plan_id: newPlanA.id,
      p_invitee_user_ids: [p1A.userId],
    });
    if (invP1Err) throw new Error(`Failed to invite p1A: ${invP1Err.message}`);

    let planA = await getPlan(newPlanA.id);
    let activeA = await countActiveParticipants(newPlanA.id);
    console.log(`Initial Scenario A State: plan_size=${planA.plan_size}, invited_participants=${planA.invited_participants}, active_count=${activeA}`);
    assert.strictEqual(planA.plan_size, 5, "Initial plan_size should be 5");
    assert.strictEqual(planA.invited_participants, 2, "Initial invited_participants should be 2");
    assert.strictEqual(activeA, 2, "Initial active count should be 2");

    // Now invite one new participant (p2A)
    const { error: invP2Err } = await hostA.client.rpc("invite_participants", {
      p_plan_id: newPlanA.id,
      p_invitee_user_ids: [p2A.userId],
    });
    if (invP2Err) throw new Error(`Failed to invite p2A: ${invP2Err.message}`);

    planA = await getPlan(newPlanA.id);
    activeA = await countActiveParticipants(newPlanA.id);
    console.log(`After Invite Scenario A State: plan_size=${planA.plan_size}, invited_participants=${planA.invited_participants}, active_count=${activeA}`);
    assert.strictEqual(planA.plan_size, 5, "Scenario A: plan_size must remain 5");
    assert.strictEqual(planA.invited_participants, 3, "Scenario A: invited_participants must become 3");
    assert.strictEqual(activeA, 3, "Scenario A: active participant count must be 3");
    assert.strictEqual(planA.invited_participants, activeA, "Scenario A: invited_participants must match active count");
    console.log(" Scenario A PASSED!\n");

    // ------------------------------------------------------------------------
    // SCENARIO B:
    // plan_size = 3, invited_participants = 3
    // Invite one new participant:
    // plan_size = 4, invited_participants = 4
    // ------------------------------------------------------------------------
    console.log("--- Testing Scenario B ---");
    const hostB = await createTestUser("HostB");
    const p1B = await createTestUser("P1B");
    const p2B = await createTestUser("P2B");
    const p3B = await createTestUser("P3B");
    createdUserIds.push(hostB.userId, p1B.userId, p2B.userId, p3B.userId);

    const randSuffixB = Math.floor(Math.random() * 1000000);
    const { data: newPlanB, error: planBErr } = await hostB.client
      .from("plans")
      .insert({
        title: `Scenario B Plan ${randSuffixB}`,
        public_id: `plan_b_${randSuffixB}`,
        place_name: "Venue B",
        place_address: "Address B",
        scheduled_at: scheduledAt,
        rsvp_deadline: rsvpDeadline,
        plan_size: 3,
        invited_participants: 1,
        allow_participant_invites: true,
      })
      .select()
      .single();

    if (planBErr || !newPlanB) throw new Error(`Failed to create plan B: ${planBErr?.message}`);
    createdPlanIds.push(newPlanB.id);

    // Invite p1B and p2B to reach invited_participants = 3
    const { error: invBInitErr } = await hostB.client.rpc("invite_participants", {
      p_plan_id: newPlanB.id,
      p_invitee_user_ids: [p1B.userId, p2B.userId],
    });
    if (invBInitErr) throw new Error(`Failed to initialize plan B: ${invBInitErr.message}`);

    let planB = await getPlan(newPlanB.id);
    let activeB = await countActiveParticipants(newPlanB.id);
    console.log(`Initial Scenario B State: plan_size=${planB.plan_size}, invited_participants=${planB.invited_participants}, active_count=${activeB}`);
    assert.strictEqual(planB.plan_size, 3, "Initial plan_size should be 3");
    assert.strictEqual(planB.invited_participants, 3, "Initial invited_participants should be 3");
    assert.strictEqual(activeB, 3, "Initial active count should be 3");

    // Now invite one new participant (p3B)
    const { error: invP3BErr } = await hostB.client.rpc("invite_participants", {
      p_plan_id: newPlanB.id,
      p_invitee_user_ids: [p3B.userId],
    });
    if (invP3BErr) throw new Error(`Failed to invite p3B: ${invP3BErr.message}`);

    planB = await getPlan(newPlanB.id);
    activeB = await countActiveParticipants(newPlanB.id);
    console.log(`After Invite Scenario B State: plan_size=${planB.plan_size}, invited_participants=${planB.invited_participants}, active_count=${activeB}`);
    assert.strictEqual(planB.plan_size, 4, "Scenario B: plan_size must become 4");
    assert.strictEqual(planB.invited_participants, 4, "Scenario B: invited_participants must become 4");
    assert.strictEqual(activeB, 4, "Scenario B: active participant count must be 4");
    assert.strictEqual(planB.invited_participants, activeB, "Scenario B: invited_participants must match active count");
    console.log(" Scenario B PASSED!\n");

    // ------------------------------------------------------------------------
    // SCENARIO C:
    // plan_size = 3, invited_participants = 5
    // Invite one new participant:
    // plan_size = 3, invited_participants = 6
    // ------------------------------------------------------------------------
    console.log("--- Testing Scenario C ---");
    const hostC = await createTestUser("HostC");
    const p1C = await createTestUser("P1C");
    const p2C = await createTestUser("P2C");
    const p3C = await createTestUser("P3C");
    const p4C = await createTestUser("P4C");
    const p5C = await createTestUser("P5C");
    createdUserIds.push(hostC.userId, p1C.userId, p2C.userId, p3C.userId, p4C.userId, p5C.userId);

    const randSuffixC = Math.floor(Math.random() * 1000000);
    const { data: newPlanC, error: planCErr } = await hostC.client
      .from("plans")
      .insert({
        title: `Scenario C Plan ${randSuffixC}`,
        public_id: `plan_c_${randSuffixC}`,
        place_name: "Venue C",
        place_address: "Address C",
        scheduled_at: scheduledAt,
        rsvp_deadline: rsvpDeadline,
        plan_size: 3,
        invited_participants: 1,
        allow_participant_invites: true,
      })
      .select()
      .single();

    if (planCErr || !newPlanC) throw new Error(`Failed to create plan C: ${planCErr?.message}`);
    createdPlanIds.push(newPlanC.id);

    // Add 4 participants (p1C..p4C) to reach invited_participants = 5
    // Notice when plan_size was 3 and invited reached 3, further additions leave plan_size at 3 or let's set plan_size back to 3
    await hostC.client.rpc("invite_participants", {
      p_plan_id: newPlanC.id,
      p_invitee_user_ids: [p1C.userId, p2C.userId, p3C.userId, p4C.userId],
    });
    // Explicitly set plan_size to 3 to achieve the requested state: plan_size = 3, invited_participants = 5
    await hostC.client.rpc("update_plan_capacity", {
      p_plan_id: newPlanC.id,
      p_plan_size: 3,
    });

    let planC = await getPlan(newPlanC.id);
    let activeC = await countActiveParticipants(newPlanC.id);
    console.log(`Initial Scenario C State: plan_size=${planC.plan_size}, invited_participants=${planC.invited_participants}, active_count=${activeC}`);
    assert.strictEqual(planC.plan_size, 3, "Initial plan_size should be 3");
    assert.strictEqual(planC.invited_participants, 5, "Initial invited_participants should be 5");
    assert.strictEqual(activeC, 5, "Initial active count should be 5");

    // Now invite one new participant (p5C)
    const { error: invP5CErr } = await hostC.client.rpc("invite_participants", {
      p_plan_id: newPlanC.id,
      p_invitee_user_ids: [p5C.userId],
    });
    if (invP5CErr) throw new Error(`Failed to invite p5C: ${invP5CErr.message}`);

    planC = await getPlan(newPlanC.id);
    activeC = await countActiveParticipants(newPlanC.id);
    console.log(`After Invite Scenario C State: plan_size=${planC.plan_size}, invited_participants=${planC.invited_participants}, active_count=${activeC}`);
    assert.strictEqual(planC.plan_size, 3, "Scenario C: plan_size must remain 3");
    assert.strictEqual(planC.invited_participants, 6, "Scenario C: invited_participants must become 6");
    assert.strictEqual(activeC, 6, "Scenario C: active participant count must be 6");
    assert.strictEqual(planC.invited_participants, activeC, "Scenario C: invited_participants must match active count");
    console.log(" Scenario C PASSED!\n");

    // ------------------------------------------------------------------------
    // SCENARIO D:
    // plan_size = 3, invited_participants = 5
    // One participant becomes SKIPPED:
    // plan_size = 3, invited_participants = 4
    // ------------------------------------------------------------------------
    console.log("--- Testing Scenario D ---");
    const hostD = await createTestUser("HostD");
    const p1D = await createTestUser("P1D");
    const p2D = await createTestUser("P2D");
    const p3D = await createTestUser("P3D");
    const p4D = await createTestUser("P4D");
    createdUserIds.push(hostD.userId, p1D.userId, p2D.userId, p3D.userId, p4D.userId);

    const randSuffixD = Math.floor(Math.random() * 1000000);
    const { data: newPlanD, error: planDErr } = await hostD.client
      .from("plans")
      .insert({
        title: `Scenario D Plan ${randSuffixD}`,
        public_id: `plan_d_${randSuffixD}`,
        place_name: "Venue D",
        place_address: "Address D",
        scheduled_at: scheduledAt,
        rsvp_deadline: rsvpDeadline,
        plan_size: 3,
        invited_participants: 1,
        allow_participant_invites: true,
      })
      .select()
      .single();

    if (planDErr || !newPlanD) throw new Error(`Failed to create plan D: ${planDErr?.message}`);
    createdPlanIds.push(newPlanD.id);

    await hostD.client.rpc("invite_participants", {
      p_plan_id: newPlanD.id,
      p_invitee_user_ids: [p1D.userId, p2D.userId, p3D.userId, p4D.userId],
    });
    await hostD.client.rpc("update_plan_capacity", {
      p_plan_id: newPlanD.id,
      p_plan_size: 3,
    });

    let planD = await getPlan(newPlanD.id);
    let activeD = await countActiveParticipants(newPlanD.id);
    console.log(`Initial Scenario D State: plan_size=${planD.plan_size}, invited_participants=${planD.invited_participants}, active_count=${activeD}`);
    assert.strictEqual(planD.plan_size, 3, "Initial plan_size should be 3");
    assert.strictEqual(planD.invited_participants, 5, "Initial invited_participants should be 5");

    // One participant (p1D) becomes SKIPPED via leave_plan or rsvp_status update
    const { error: skipErr } = await p1D.client.rpc("leave_plan", {
      p_plan_id: newPlanD.id,
    });
    if (skipErr) throw new Error(`Failed to leave plan: ${skipErr.message}`);

    planD = await getPlan(newPlanD.id);
    activeD = await countActiveParticipants(newPlanD.id);
    console.log(`After SKIPPED Scenario D State: plan_size=${planD.plan_size}, invited_participants=${planD.invited_participants}, active_count=${activeD}`);
    assert.strictEqual(planD.plan_size, 3, "Scenario D: plan_size must remain 3");
    assert.strictEqual(planD.invited_participants, 4, "Scenario D: invited_participants must become 4");
    assert.strictEqual(activeD, 4, "Scenario D: active participant count must be 4");
    assert.strictEqual(planD.invited_participants, activeD, "Scenario D: invited_participants must match active count");
    console.log(" Scenario D PASSED!\n");

    // ------------------------------------------------------------------------
    // SCENARIO E:
    // plan_size = 3, invited_participants = 5
    // One JOINED participant moves to WAITLISTED:
    // plan_size = 2, invited_participants = 5
    // ------------------------------------------------------------------------
    console.log("--- Testing Scenario E ---");
    const hostE = await createTestUser("HostE");
    const p1E = await createTestUser("P1E");
    const p2E = await createTestUser("P2E");
    const p3E = await createTestUser("P3E");
    const p4E = await createTestUser("P4E");
    createdUserIds.push(hostE.userId, p1E.userId, p2E.userId, p3E.userId, p4E.userId);

    const randSuffixE = Math.floor(Math.random() * 1000000);
    const { data: newPlanE, error: planEErr } = await hostE.client
      .from("plans")
      .insert({
        title: `Scenario E Plan ${randSuffixE}`,
        public_id: `plan_e_${randSuffixE}`,
        place_name: "Venue E",
        place_address: "Address E",
        scheduled_at: scheduledAt,
        rsvp_deadline: rsvpDeadline,
        plan_size: 3,
        invited_participants: 1,
        participant_filtering: "ASSIGNED",
        allow_participant_invites: true,
      })
      .select()
      .single();

    if (planEErr || !newPlanE) throw new Error(`Failed to create plan E: ${planEErr?.message}`);
    createdPlanIds.push(newPlanE.id);

    // Make p1E JOINED, others INVITED
    await hostE.client.rpc("invite_participants", {
      p_plan_id: newPlanE.id,
      p_invitee_user_ids: [p1E.userId],
      p_assigned_group: "GOING",
    });
    // Set p1E to JOINED
    await supabaseAdmin
      .from("plan_participants")
      .update({ rsvp_status: "JOINED" })
      .eq("plan_id", newPlanE.id)
      .eq("user_id", p1E.userId);

    // Add p2E..p4E as INVITED
    await hostE.client.rpc("invite_participants", {
      p_plan_id: newPlanE.id,
      p_invitee_user_ids: [p2E.userId, p3E.userId, p4E.userId],
      p_assigned_group: "WAITLIST",
    });

    await hostE.client.rpc("update_plan_capacity", {
      p_plan_id: newPlanE.id,
      p_plan_size: 3,
    });

    let planE = await getPlan(newPlanE.id);
    let activeE = await countActiveParticipants(newPlanE.id);
    console.log(`Initial Scenario E State: plan_size=${planE.plan_size}, invited_participants=${planE.invited_participants}, active_count=${activeE}`);
    assert.strictEqual(planE.plan_size, 3, "Initial plan_size should be 3");
    assert.strictEqual(planE.invited_participants, 5, "Initial invited_participants should be 5");

    // Call move_participant_to_waitlist_and_decrease_capacity on p1E (JOINED -> WAITLISTED)
    const { error: moveWaitlistErr } = await hostE.client.rpc(
      "move_participant_to_waitlist_and_decrease_capacity",
      {
        p_plan_id: newPlanE.id,
        p_target_user_id: p1E.userId,
      }
    );
    if (moveWaitlistErr) throw new Error(`Failed move_participant_to_waitlist_and_decrease_capacity: ${moveWaitlistErr.message}`);

    planE = await getPlan(newPlanE.id);
    activeE = await countActiveParticipants(newPlanE.id);
    console.log(`After Move Scenario E State: plan_size=${planE.plan_size}, invited_participants=${planE.invited_participants}, active_count=${activeE}`);
    assert.strictEqual(planE.plan_size, 2, "Scenario E: plan_size must become 2");
    assert.strictEqual(planE.invited_participants, 5, "Scenario E: invited_participants must remain 5");
    assert.strictEqual(activeE, 5, "Scenario E: active participant count must remain 5");
    assert.strictEqual(planE.invited_participants, activeE, "Scenario E: invited_participants must match active count");
    console.log(" Scenario E PASSED!\n");

    // ------------------------------------------------------------------------
    // SCENARIO F:
    // plan_size = 3, invited_participants = 5
    // One WAITLISTED participant becomes JOINED:
    // plan_size = 3, invited_participants = 5
    // ------------------------------------------------------------------------
    console.log("--- Testing Scenario F ---");
    const hostF = await createTestUser("HostF");
    const p1F = await createTestUser("P1F");
    const p2F = await createTestUser("P2F");
    const p3F = await createTestUser("P3F");
    const p4F = await createTestUser("P4F");
    createdUserIds.push(hostF.userId, p1F.userId, p2F.userId, p3F.userId, p4F.userId);

    const randSuffixF = Math.floor(Math.random() * 1000000);
    const { data: newPlanF, error: planFErr } = await hostF.client
      .from("plans")
      .insert({
        title: `Scenario F Plan ${randSuffixF}`,
        public_id: `plan_f_${randSuffixF}`,
        place_name: "Venue F",
        place_address: "Address F",
        scheduled_at: scheduledAt,
        rsvp_deadline: rsvpDeadline,
        plan_size: 3,
        invited_participants: 1,
        participant_filtering: "ASSIGNED",
        allow_participant_invites: true,
      })
      .select()
      .single();

    if (planFErr || !newPlanF) throw new Error(`Failed to create plan F: ${planFErr?.message}`);
    createdPlanIds.push(newPlanF.id);

    // Add p1F as WAITLISTED, p2F..p4F as INVITED
    await hostF.client.rpc("invite_participants", {
      p_plan_id: newPlanF.id,
      p_invitee_user_ids: [p1F.userId],
      p_assigned_group: "WAITLIST",
    });
    await supabaseAdmin
      .from("plan_participants")
      .update({ rsvp_status: "WAITLISTED" })
      .eq("plan_id", newPlanF.id)
      .eq("user_id", p1F.userId);

    await hostF.client.rpc("invite_participants", {
      p_plan_id: newPlanF.id,
      p_invitee_user_ids: [p2F.userId, p3F.userId, p4F.userId],
      p_assigned_group: "WAITLIST",
    });

    await hostF.client.rpc("update_plan_capacity", {
      p_plan_id: newPlanF.id,
      p_plan_size: 3,
    });

    let planF = await getPlan(newPlanF.id);
    let activeF = await countActiveParticipants(newPlanF.id);
    console.log(`Initial Scenario F State: plan_size=${planF.plan_size}, invited_participants=${planF.invited_participants}, active_count=${activeF}`);
    assert.strictEqual(planF.plan_size, 3, "Initial plan_size should be 3");
    assert.strictEqual(planF.invited_participants, 5, "Initial invited_participants should be 5");

    // Move WAITLISTED participant (p1F) to JOINED via move_waitlist_to_going
    const { error: moveGoingErr } = await hostF.client.rpc("move_waitlist_to_going", {
      p_plan_id: newPlanF.id,
      p_target_user_id: p1F.userId,
    });
    if (moveGoingErr) throw new Error(`Failed move_waitlist_to_going: ${moveGoingErr.message}`);

    planF = await getPlan(newPlanF.id);
    activeF = await countActiveParticipants(newPlanF.id);
    console.log(`After Move Scenario F State: plan_size=${planF.plan_size}, invited_participants=${planF.invited_participants}, active_count=${activeF}`);
    assert.strictEqual(planF.plan_size, 3, "Scenario F: plan_size must remain 3");
    assert.strictEqual(planF.invited_participants, 5, "Scenario F: invited_participants must remain 5");
    assert.strictEqual(activeF, 5, "Scenario F: active participant count must remain 5");
    assert.strictEqual(planF.invited_participants, activeF, "Scenario F: invited_participants must match active count");
    console.log(" Scenario F PASSED!\n");

    // ------------------------------------------------------------------------
    // ADDITIONAL TEST: update_plan_capacity must NOT change invited_participants
    // ------------------------------------------------------------------------
    console.log("--- Testing update_plan_capacity ---");
    const { error: capUpdateErr } = await hostF.client.rpc("update_plan_capacity", {
      p_plan_id: newPlanF.id,
      p_plan_size: 8,
    });
    if (capUpdateErr) throw new Error(`update_plan_capacity failed: ${capUpdateErr.message}`);

    const planFCap = await getPlan(newPlanF.id);
    console.log(`After Capacity Update State: plan_size=${planFCap.plan_size}, invited_participants=${planFCap.invited_participants}`);
    assert.strictEqual(planFCap.plan_size, 8, "plan_size must be updated to 8");
    assert.strictEqual(planFCap.invited_participants, 5, "invited_participants must NOT change on capacity update");
    console.log(" update_plan_capacity test PASSED!\n");

    // ------------------------------------------------------------------------
    // ADDITIONAL TEST: Duplicate invitations must NOT increment count
    // ------------------------------------------------------------------------
    console.log("--- Testing duplicate invitation idempotency ---");
    const { error: dupInvErr } = await hostF.client.rpc("invite_participants", {
      p_plan_id: newPlanF.id,
      p_invitee_user_ids: [p1F.userId, p2F.userId], // already active participants
    });
    if (dupInvErr) throw new Error(`Duplicate invite call failed: ${dupInvErr.message}`);

    const planFDup = await getPlan(newPlanF.id);
    console.log(`After Duplicate Invite: plan_size=${planFDup.plan_size}, invited_participants=${planFDup.invited_participants}`);
    assert.strictEqual(planFDup.invited_participants, 5, "invited_participants must NOT increment on duplicate invite");
    assert.strictEqual(planFDup.plan_size, 8, "plan_size must NOT change on duplicate invite");
    console.log(" Duplicate invitation test PASSED!\n");

    // ------------------------------------------------------------------------
    // ADDITIONAL TEST: Removal count maintenance
    // ------------------------------------------------------------------------
    console.log("--- Testing participant removal count maintenance ---");
    // p1F is JOINED; remove them via remove_participant
    const { error: remErr } = await hostF.client.rpc("remove_participant", {
      p_plan_id: newPlanF.id,
      p_target_user_id: p1F.userId,
    });
    if (remErr) throw new Error(`remove_participant failed: ${remErr.message}`);

    let planFRem = await getPlan(newPlanF.id);
    let activeFRem = await countActiveParticipants(newPlanF.id);
    console.log(`After active participant removed: invited_participants=${planFRem.invited_participants}, active_count=${activeFRem}`);
    assert.strictEqual(planFRem.invited_participants, 4, "invited_participants must decrement from 5 to 4");
    assert.strictEqual(activeFRem, 4, "active count must be 4");

    // Now removing an already SKIPPED participant must NOT decrement further
    const { error: remSkippedErr } = await hostF.client.rpc("remove_participant", {
      p_plan_id: newPlanF.id,
      p_target_user_id: p1F.userId,
    });
    if (remSkippedErr) throw new Error(`remove_participant on skipped failed: ${remSkippedErr.message}`);

    planFRem = await getPlan(newPlanF.id);
    activeFRem = await countActiveParticipants(newPlanF.id);
    console.log(`After SKIPPED participant removed: invited_participants=${planFRem.invited_participants}, active_count=${activeFRem}`);
    assert.strictEqual(planFRem.invited_participants, 4, "invited_participants must NOT decrement again");
    assert.strictEqual(activeFRem, 4, "active count must remain 4");
    console.log(" Participant removal count maintenance test PASSED!\n");

    console.log("=========================================");
    console.log("ALL SCENARIOS AND TESTS PASSED PERFECTLY!");
    console.log("=========================================");
  } finally {
    // Cleanup test data
    console.log("\nCleaning up test plans and users...");
    for (const planId of createdPlanIds) {
      await supabaseAdmin.from("plans").delete().eq("id", planId);
    }
    for (const userId of createdUserIds) {
      await supabaseAdmin.from("users").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }
    console.log("Cleanup completed.");
  }
}

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
