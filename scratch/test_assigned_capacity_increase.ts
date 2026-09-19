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

async function runTests() {
  console.log("=========================================================================");
  console.log("STARTING ASSIGNED-MODE CAPACITY INCREASE VERIFICATION TESTS");
  console.log("=========================================================================\n");

  const createdPlanIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // TEST A: Assigned plan with WAITLISTED participant
    // - capacity increases
    // - participant becomes JOINED + GOING
    // -------------------------------------------------------------------------
    console.log("--- TEST A: WAITLISTED participant promotion ---");
    const hostA = await createTestUser("HostA");
    const userA1 = await createTestUser("UserA1");
    const userA2 = await createTestUser("UserA2");

    // Create assigned plan with plan_size = 2, invited_participants = 1 (host joined)
    const { data: planAData, error: planAErr } = await hostA.client
      .from("plans")
      .insert({
        title: "Test Plan A - Waitlisted Promotion",
        public_id: "p_" + crypto.randomUUID().slice(0, 8),
        place_name: "Venue A",
        place_address: "Address A",
        status: "LIVE",
        participant_filtering: "ASSIGNED",
        plan_size: 2,
        invited_participants: 1,
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
        allow_participant_invites: true,
      })
      .select()
      .single();
    if (planAErr || !planAData) throw new Error(`Failed to create plan A: ${planAErr?.message}`);
    const planAId = planAData.id;
    createdPlanIds.push(planAId);

    // Host was inserted by trigger, ensure assigned_group is GOING
    await supabaseAdmin
      .from("plan_participants")
      .update({ assigned_group: "GOING" })
      .eq("plan_id", planAId)
      .eq("user_id", hostA.userId);

    // Host invites User A1 to GOING (plan_size 2, invited 2)
    await hostA.client.rpc("invite_participants", {
      p_plan_id: planAId,
      p_invitee_user_ids: [userA1.userId],
      p_assigned_group: "GOING",
    });
    // User A1 accepts -> JOINED
    await userA1.client
      .from("plan_participants")
      .update({ rsvp_status: "JOINED" })
      .eq("plan_id", planAId)
      .eq("user_id", userA1.userId);

    // Plan A Going group is now full (2/2).
    // Host invites User A2 to WAITLIST
    await hostA.client.rpc("invite_participants", {
      p_plan_id: planAId,
      p_invitee_user_ids: [userA2.userId],
      p_assigned_group: "WAITLIST",
    });
    // User A2 accepts while on waitlist -> becomes WAITLISTED
    await userA2.client
      .from("plan_participants")
      .update({ rsvp_status: "WAITLISTED", waitlist_position: 1 })
      .eq("plan_id", planAId)
      .eq("user_id", userA2.userId);

    await assertDatabaseInvariant(planAId, "Test A Setup");

    const partA2Before = await getParticipant(planAId, userA2.userId);
    assert.strictEqual(partA2Before.rsvp_status, "WAITLISTED");
    assert.strictEqual(partA2Before.assigned_group, "WAITLIST");
    assert.strictEqual(partA2Before.waitlist_position, 1);

    // Increase capacity from 2 to 3
    console.log("Increasing capacity from 2 to 3...");
    const { data: capARes, error: capAErr } = await hostA.client.rpc("update_plan_capacity", {
      p_plan_id: planAId,
      p_plan_size: 3,
    });
    assert.ifError(capAErr);
    console.log("update_plan_capacity returned:", capARes);
    assert.strictEqual(capARes.promoted_count, 1, "Expected 1 participant promoted");

    // Verify User A2 is now JOINED + GOING with waitlist_position NULL
    const partA2After = await getParticipant(planAId, userA2.userId);
    assert.strictEqual(partA2After.rsvp_status, "JOINED", "Participant must become JOINED");
    assert.strictEqual(partA2After.assigned_group, "GOING", "assigned_group must become GOING");
    assert.strictEqual(partA2After.waitlist_position, null, "waitlist_position must be cleared");

    // Verify host is untouched
    const hostAPart = await getParticipant(planAId, hostA.userId);
    assert.strictEqual(hostAPart.role, "HOST");
    assert.strictEqual(hostAPart.rsvp_status, "JOINED");
    assert.strictEqual(hostAPart.assigned_group, "GOING");

    // Invariants
    const stateA = await assertDatabaseInvariant(planAId, "After Test A capacity increase");
    assert.strictEqual(stateA.plan.plan_size, 3);
    assert.strictEqual(stateA.plan.invited_participants, 3);
    console.log(" Test A PASSED!\n");

    // -------------------------------------------------------------------------
    // TEST B: Assigned plan with INVITED participant on waitlist
    // - capacity increases
    // - participant remains INVITED
    // - only assigned_group changes to GOING
    // -------------------------------------------------------------------------
    console.log("--- TEST B: INVITED participant on waitlist promotion ---");
    const hostB = await createTestUser("HostB");
    const userB1 = await createTestUser("UserB1");
    const userB2 = await createTestUser("UserB2");

    const { data: planBData, error: planBErr } = await hostB.client
      .from("plans")
      .insert({
        title: "Test Plan B - Invited Waitlist Promotion",
        public_id: "p_" + crypto.randomUUID().slice(0, 8),
        place_name: "Venue B",
        place_address: "Address B",
        status: "LIVE",
        participant_filtering: "ASSIGNED",
        plan_size: 2,
        invited_participants: 1,
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
        allow_participant_invites: true,
      })
      .select()
      .single();
    if (planBErr || !planBData) throw new Error(`Failed to create plan B: ${planBErr?.message}`);
    const planBId = planBData.id;
    createdPlanIds.push(planBId);

    await supabaseAdmin
      .from("plan_participants")
      .update({ assigned_group: "GOING" })
      .eq("plan_id", planBId)
      .eq("user_id", hostB.userId);

    // User B1: GOING (accepted -> JOINED)
    await hostB.client.rpc("invite_participants", {
      p_plan_id: planBId,
      p_invitee_user_ids: [userB1.userId],
      p_assigned_group: "GOING",
    });
    await userB1.client
      .from("plan_participants")
      .update({ rsvp_status: "JOINED" })
      .eq("plan_id", planBId)
      .eq("user_id", userB1.userId);

    // User B2: INVITED + WAITLIST (has NOT responded yet)
    await hostB.client.rpc("invite_participants", {
      p_plan_id: planBId,
      p_invitee_user_ids: [userB2.userId],
      p_assigned_group: "WAITLIST",
    });

    await assertDatabaseInvariant(planBId, "Test B Setup");

    const partB2Before = await getParticipant(planBId, userB2.userId);
    assert.strictEqual(partB2Before.rsvp_status, "INVITED");
    assert.strictEqual(partB2Before.assigned_group, "WAITLIST");

    // Increase capacity from 2 to 3
    console.log("Increasing capacity from 2 to 3...");
    const { data: capBRes, error: capBErr } = await hostB.client.rpc("update_plan_capacity", {
      p_plan_id: planBId,
      p_plan_size: 3,
    });
    assert.ifError(capBErr);
    console.log("update_plan_capacity returned:", capBRes);
    assert.strictEqual(capBRes.promoted_count, 1, "Expected 1 participant promoted");

    // Verify User B2 remains INVITED, but assigned_group became GOING!
    const partB2After = await getParticipant(planBId, userB2.userId);
    assert.strictEqual(partB2After.rsvp_status, "INVITED", "CRITICAL RULE: INVITED participant MUST remain INVITED");
    assert.strictEqual(partB2After.assigned_group, "GOING", "assigned_group MUST become GOING");
    assert.strictEqual(partB2After.waitlist_position, null, "waitlist_position must be cleared");

    // Invariants
    const stateB = await assertDatabaseInvariant(planBId, "After Test B capacity increase");
    assert.strictEqual(stateB.plan.plan_size, 3);
    assert.strictEqual(stateB.plan.invited_participants, 3);
    console.log(" Test B PASSED!\n");

    // -------------------------------------------------------------------------
    // TEST C: Mixed waitlist (WAITLISTED and INVITED)
    // - verify each participant follows the correct rule
    // -------------------------------------------------------------------------
    console.log("--- TEST C: Mixed waitlist promotion rules ---");
    const hostC = await createTestUser("HostC");
    const userC1 = await createTestUser("UserC1"); // in GOING
    const userC2 = await createTestUser("UserC2"); // in WAITLIST, WAITLISTED (pos 1)
    const userC3 = await createTestUser("UserC3"); // in WAITLIST, INVITED (pos 2)

    const { data: planCData, error: planCErr } = await hostC.client
      .from("plans")
      .insert({
        title: "Test Plan C - Mixed Waitlist",
        public_id: "p_" + crypto.randomUUID().slice(0, 8),
        place_name: "Venue C",
        place_address: "Address C",
        status: "LIVE",
        participant_filtering: "ASSIGNED",
        plan_size: 2,
        invited_participants: 1,
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
        allow_participant_invites: true,
      })
      .select()
      .single();
    if (planCErr || !planCData) throw new Error(`Failed to create plan C: ${planCErr?.message}`);
    const planCId = planCData.id;
    createdPlanIds.push(planCId);

    await supabaseAdmin
      .from("plan_participants")
      .update({ assigned_group: "GOING" })
      .eq("plan_id", planCId)
      .eq("user_id", hostC.userId);

    // Host invites User C1 to GOING
    await hostC.client.rpc("invite_participants", {
      p_plan_id: planCId,
      p_invitee_user_ids: [userC1.userId],
      p_assigned_group: "GOING",
    });
    await userC1.client
      .from("plan_participants")
      .update({ rsvp_status: "JOINED" })
      .eq("plan_id", planCId)
      .eq("user_id", userC1.userId);

    // Host invites C2 and C3 to WAITLIST
    await hostC.client.rpc("invite_participants", {
      p_plan_id: planCId,
      p_invitee_user_ids: [userC2.userId, userC3.userId],
      p_assigned_group: "WAITLIST",
    });
    // User C2 accepts -> WAITLISTED with position 1
    await userC2.client
      .from("plan_participants")
      .update({ rsvp_status: "WAITLISTED", waitlist_position: 1 })
      .eq("plan_id", planCId)
      .eq("user_id", userC2.userId);
    // User C3 remains INVITED with position 2
    await supabaseAdmin
      .from("plan_participants")
      .update({ waitlist_position: 2 })
      .eq("plan_id", planCId)
      .eq("user_id", userC3.userId);

    await assertDatabaseInvariant(planCId, "Test C Setup");

    // Increase capacity from 2 to 4 (2 spots opened: both C2 and C3 promoted)
    console.log("Increasing capacity from 2 to 4...");
    const { data: capCRes, error: capCErr } = await hostC.client.rpc("update_plan_capacity", {
      p_plan_id: planCId,
      p_plan_size: 4,
    });
    assert.ifError(capCErr);
    assert.strictEqual(capCRes.promoted_count, 2, "Expected 2 participants promoted");

    // C2 was WAITLISTED -> must become JOINED + GOING
    const partC2After = await getParticipant(planCId, userC2.userId);
    assert.strictEqual(partC2After.rsvp_status, "JOINED", "WAITLISTED participant must become JOINED");
    assert.strictEqual(partC2After.assigned_group, "GOING", "WAITLISTED participant must be assigned GOING");
    assert.strictEqual(partC2After.waitlist_position, null);

    // C3 was INVITED -> must remain INVITED + GOING
    const partC3After = await getParticipant(planCId, userC3.userId);
    assert.strictEqual(partC3After.rsvp_status, "INVITED", "INVITED participant must remain INVITED");
    assert.strictEqual(partC3After.assigned_group, "GOING", "INVITED participant must be assigned GOING");
    assert.strictEqual(partC3After.waitlist_position, null);

    // Invariants
    const stateC = await assertDatabaseInvariant(planCId, "After Test C capacity increase");
    assert.strictEqual(stateC.plan.plan_size, 4);
    assert.strictEqual(stateC.plan.invited_participants, 4);
    console.log(" Test C PASSED!\n");

    // -------------------------------------------------------------------------
    // TEST D: Multiple newly available spots with priority order
    // - promote correct number in priority order
    // - remaining participants are renumbered without gaps
    // -------------------------------------------------------------------------
    console.log("--- TEST D: Multiple spots and strict priority order ---");
    const hostD = await createTestUser("HostD");
    const userD1 = await createTestUser("UserD1"); // pos 1
    const userD2 = await createTestUser("UserD2"); // pos 2
    const userD3 = await createTestUser("UserD3"); // pos 3
    const userD4 = await createTestUser("UserD4"); // pos 4

    const { data: planDData, error: planDErr } = await hostD.client
      .from("plans")
      .insert({
        title: "Test Plan D - Multi-spot Priority Promotion",
        public_id: "p_" + crypto.randomUUID().slice(0, 8),
        place_name: "Venue D",
        place_address: "Address D",
        status: "LIVE",
        participant_filtering: "ASSIGNED",
        plan_size: 1, // only host is going
        invited_participants: 1,
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
        allow_participant_invites: true,
      })
      .select()
      .single();
    if (planDErr || !planDData) throw new Error(`Failed to create plan D: ${planDErr?.message}`);
    const planDId = planDData.id;
    createdPlanIds.push(planDId);

    // Host in GOING
    await supabaseAdmin
      .from("plan_participants")
      .update({ assigned_group: "GOING" })
      .eq("plan_id", planDId)
      .eq("user_id", hostD.userId);

    // Invite D1..D4 to WAITLIST
    await hostD.client.rpc("invite_participants", {
      p_plan_id: planDId,
      p_invitee_user_ids: [userD1.userId, userD2.userId, userD3.userId, userD4.userId],
      p_assigned_group: "WAITLIST",
    });

    // Set statuses and positions:
    // D1: WAITLISTED, pos 1
    // D2: INVITED, pos 2
    // D3: WAITLISTED, pos 3
    // D4: INVITED, pos 4
    await userD1.client
      .from("plan_participants")
      .update({ rsvp_status: "WAITLISTED", waitlist_position: 1 })
      .eq("plan_id", planDId)
      .eq("user_id", userD1.userId);
    await supabaseAdmin
      .from("plan_participants")
      .update({ waitlist_position: 2 })
      .eq("plan_id", planDId)
      .eq("user_id", userD2.userId);
    await userD3.client
      .from("plan_participants")
      .update({ rsvp_status: "WAITLISTED", waitlist_position: 3 })
      .eq("plan_id", planDId)
      .eq("user_id", userD3.userId);
    await supabaseAdmin
      .from("plan_participants")
      .update({ waitlist_position: 4 })
      .eq("plan_id", planDId)
      .eq("user_id", userD4.userId);

    await assertDatabaseInvariant(planDId, "Test D Setup");

    // Increase capacity by 2 spots (from 1 to 3)
    console.log("Increasing capacity from 1 to 3 (opening 2 spots)...");
    const { data: capDRes, error: capDErr } = await hostD.client.rpc("update_plan_capacity", {
      p_plan_id: planDId,
      p_plan_size: 3,
    });
    assert.ifError(capDErr);
    assert.strictEqual(capDRes.promoted_count, 2, "Expected exactly 2 participants promoted");

    // D1 (pos 1) -> promoted to JOINED + GOING
    const pD1 = await getParticipant(planDId, userD1.userId);
    assert.strictEqual(pD1.rsvp_status, "JOINED");
    assert.strictEqual(pD1.assigned_group, "GOING");
    assert.strictEqual(pD1.waitlist_position, null);

    // D2 (pos 2) -> promoted to INVITED + GOING
    const pD2 = await getParticipant(planDId, userD2.userId);
    assert.strictEqual(pD2.rsvp_status, "INVITED");
    assert.strictEqual(pD2.assigned_group, "GOING");
    assert.strictEqual(pD2.waitlist_position, null);

    // D3 (was pos 3) -> remains in WAITLIST, renumbered to pos 1
    const pD3 = await getParticipant(planDId, userD3.userId);
    assert.strictEqual(pD3.rsvp_status, "WAITLISTED");
    assert.strictEqual(pD3.assigned_group, "WAITLIST");
    assert.strictEqual(pD3.waitlist_position, 1, "D3 should become waitlist position 1");

    // D4 (was pos 4) -> remains in WAITLIST, renumbered to pos 2
    const pD4 = await getParticipant(planDId, userD4.userId);
    assert.strictEqual(pD4.rsvp_status, "INVITED");
    assert.strictEqual(pD4.assigned_group, "WAITLIST");
    assert.strictEqual(pD4.waitlist_position, 2, "D4 should become waitlist position 2");

    // Invariants
    const stateD = await assertDatabaseInvariant(planDId, "After Test D capacity increase");
    assert.strictEqual(stateD.plan.plan_size, 3);
    assert.strictEqual(stateD.plan.invited_participants, 5);
    console.log(" Test D PASSED!\n");

    // -------------------------------------------------------------------------
    // TEST E: Host displacement invariant and invited_participants verification
    // -------------------------------------------------------------------------
    console.log("--- TEST E: Host invariant and invited_participants stability ---");
    // On plan D, increase capacity again to 5 (fill all remaining waitlist spots)
    console.log("Increasing capacity on Plan D to 5...");
    const { data: capD2Res, error: capD2Err } = await hostD.client.rpc("update_plan_capacity", {
      p_plan_id: planDId,
      p_plan_size: 5,
    });
    assert.ifError(capD2Err);
    assert.strictEqual(capD2Res.promoted_count, 2, "Expected remaining 2 participants promoted");

    // Verify host is still host and in GOING
    const hostDPart = await getParticipant(planDId, hostD.userId);
    assert.strictEqual(hostDPart.role, "HOST", "Host role must NEVER be displaced or demoted");
    assert.strictEqual(hostDPart.rsvp_status, "JOINED");
    assert.strictEqual(hostDPart.assigned_group, "GOING");

    // Verify all 5 are in GOING
    const finalStateD = await assertDatabaseInvariant(planDId, "Final Plan D check");
    assert.strictEqual(finalStateD.plan.plan_size, 5);
    assert.strictEqual(finalStateD.plan.invited_participants, 5);
    assert.strictEqual(finalStateD.activeCount, 5);
    console.log(" Test E PASSED!\n");

    console.log("=========================================================================");
    console.log("ALL ASSIGNED-MODE CAPACITY INCREASE TESTS PASSED SUCCESSFULLY!");
    console.log("=========================================================================\n");
  } finally {
    console.log("Cleaning up test plans...");
    for (const id of createdPlanIds) {
      await supabaseAdmin.from("plan_participants").delete().eq("plan_id", id);
      await supabaseAdmin.from("plans").delete().eq("id", id);
    }
    console.log("Cleaned up.\n");
  }
}

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
