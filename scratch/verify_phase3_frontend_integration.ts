import assert from "node:assert";
import { createClient } from "/Users/thilak/Documents/Planless/Planless Repo /Planless-2.0/apps/app/node_modules/@supabase/supabase-js/dist/index.cjs";
import {
  claimPlanInviteRPC,
  buildInviteUrl,
  extractInviteTokenFromPath,
  getStoredPendingInviteToken,
  setStoredPendingInviteToken,
  PENDING_INVITE_TOKEN_KEY,
  ClaimInviteResult
} from "/Users/thilak/Documents/Planless/Planless Repo /Planless-2.0/apps/app/src/features/plans/services/planInviteService.ts";
import { normalizeStatus } from "/Users/thilak/Documents/Planless/Planless Repo /Planless-2.0/apps/app/lib/participantStatus.ts";

const LOCAL_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY);

async function createTestUser(tag: string) {
  const userId = crypto.randomUUID();
  const email = `phase3_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@planless.test`;
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

  return { userId, client, email };
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
    title: options.title || "Phase 3 Plan",
    place_name: "Test Venue",
    place_address: "123 Venue Rd",
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

// Simulates how PlansContext filter plans for Home feed
function simulateHomeFeedFilter(plans: any[], dbParticipants: any[], userId: string) {
  const myPps = dbParticipants.filter((p: any) => p.user_id === userId);
  return plans.filter((plan: any) => {
    const statusNorm = (plan.status || "").toLowerCase();
    if (statusNorm !== "active" && statusNorm !== "live") return false;
    const pp = myPps.find((p: any) => p.plan_id === (plan.dbUuid || plan.id));
    if (!pp) return false;
    const rsvp = normalizeStatus(pp.rsvp_status);
    const isHost = pp.role === "HOST";
    return !isHost && rsvp === "INVITED";
  });
}

// Simulates how PlansScreen categorizes plans (Joined vs Waitlisted vs Skipped)
function simulatePlansHubCategorization(dbParticipants: any[], planId: string, userId: string) {
  const myPp = dbParticipants.find((p: any) => p.plan_id === planId && p.user_id === userId);
  if (!myPp) return null;
  const rsvp = normalizeStatus(myPp.rsvp_status);
  return {
    isJoined: rsvp === "JOINED",
    isWaitlisted: rsvp === "WAITLISTED",
    isSkipped: rsvp === "SKIPPED" || rsvp === "REJOINED",
    isInvited: rsvp === "INVITED",
    assignedGroup: myPp.assigned_group,
    waitlistPosition: myPp.waitlist_position,
  };
}

async function runPhase3Verification() {
  console.log("=========================================================================");
  console.log("Starting Phase 3: Frontend Integration & State Handling Verification");
  console.log("=========================================================================\n");

  const host = await createTestUser("host");

  // ---------------------------------------------------------------------------
  // 1. Verify planInviteService types and URL helpers
  // ---------------------------------------------------------------------------
  console.log("--- 1. Testing planInviteService API & Type Contract ---");
  const testPlanId = crypto.randomUUID();
  const builtUrl = buildInviteUrl(testPlanId);
  assert.ok(builtUrl.includes(`/join/${testPlanId}`), "buildInviteUrl must contain /join/<planId>");
  assert.strictEqual(extractInviteTokenFromPath(`/join/${testPlanId}`), testPlanId);
  assert.strictEqual(extractInviteTokenFromPath(`/join/${testPlanId}/`), testPlanId);
  assert.strictEqual(extractInviteTokenFromPath(`/home`), null);
  console.log(" planInviteService URL extraction & building verified.\n");

  // ---------------------------------------------------------------------------
  // 2. Scenario A: Claim resulting in INVITED -> Renders as Invited on Home Feed
  // ---------------------------------------------------------------------------
  console.log("--- 2. Testing Result: INVITED ---");
  const planAId = await createTestPlan(host.userId, {
    plan_size: 2,
    max_participants: 2,
    participant_filtering: "AUTOMATIC",
    title: "Plan A - Size == Invited",
  });
  // Add 1 participant -> size 2 == invited 2
  const userAInit = await createTestUser("AInit");
  await admin.from("plan_participants").insert({
    plan_id: planAId,
    user_id: userAInit.userId,
    role: "PARTICIPANT",
    rsvp_status: "INVITED",
    delivery_status: "DELIVERED",
  });

  const userClaimantA = await createTestUser("ClaimantA");
  // Call RPC using the claimant's authenticated client
  const { data: rawResA, error: errA } = await userClaimantA.client.rpc("claim_plan_invite", {
    p_plan_id: planAId,
  });
  assert.ifError(errA);
  const resA: ClaimInviteResult = rawResA as ClaimInviteResult;
  console.log("Claim Result A:", resA);

  assert.strictEqual(resA.success, true);
  assert.strictEqual(resA.rsvp_status, "INVITED");
  assert.strictEqual(resA.already_participating, false);
  assert.strictEqual(resA.plan_size, 3);

  // Fetch updated data simulating refreshPlans()
  const { data: dbPlansA } = await admin.from("plans").select("*");
  const { data: dbPpsA } = await admin.from("plan_participants").select("*");
  const homeFeedPlansA = simulateHomeFeedFilter(dbPlansA || [], dbPpsA || [], userClaimantA.userId);
  const foundOnHomeA = homeFeedPlansA.some(p => p.id === planAId || p.dbUuid === planAId);
  assert.strictEqual(foundOnHomeA, true, "Plan A MUST appear on Home Feed as an INVITED invitation");

  const hubCategoryA = simulatePlansHubCategorization(dbPpsA || [], planAId, userClaimantA.userId);
  assert.strictEqual(hubCategoryA?.isInvited, true);
  assert.strictEqual(hubCategoryA?.isJoined, false);
  assert.strictEqual(hubCategoryA?.isWaitlisted, false);
  console.log(" Result INVITED renders on Home feed and is categorized correctly as INVITED.\n");

  // ---------------------------------------------------------------------------
  // 3. Scenario B: Claim resulting in WAITLISTED -> Categorized as WAITLISTED
  // ---------------------------------------------------------------------------
  console.log("--- 3. Testing Result: WAITLISTED (ASSIGNED overflow) ---");
  const planBId = await createTestPlan(host.userId, {
    plan_size: 2,
    max_participants: 5,
    participant_filtering: "ASSIGNED",
    title: "Plan B - Assigned Overflow",
  });
  // Add 2 participants -> size 2 < invited 3
  const userB1 = await createTestUser("B1");
  const userB2 = await createTestUser("B2");
  await admin.from("plan_participants").insert([
    { plan_id: planBId, user_id: userB1.userId, role: "PARTICIPANT", rsvp_status: "INVITED", assigned_group: "GOING", delivery_status: "DELIVERED" },
    { plan_id: planBId, user_id: userB2.userId, role: "PARTICIPANT", rsvp_status: "INVITED", assigned_group: "GOING", delivery_status: "DELIVERED" },
  ]);

  const userClaimantB = await createTestUser("ClaimantB");
  const { data: rawResB, error: errB } = await userClaimantB.client.rpc("claim_plan_invite", {
    p_plan_id: planBId,
  });
  assert.ifError(errB);
  const resB: ClaimInviteResult = rawResB as ClaimInviteResult;
  console.log("Claim Result B:", resB);

  assert.strictEqual(resB.success, true);
  assert.strictEqual(resB.rsvp_status, "WAITLISTED");
  assert.strictEqual(resB.assigned_group, "WAITLIST");
  assert.strictEqual(resB.waitlist_position, 1);
  assert.strictEqual(resB.plan_size, 2);

  const { data: dbPlansB } = await admin.from("plans").select("*");
  const { data: dbPpsB } = await admin.from("plan_participants").select("*");
  const homeFeedPlansB = simulateHomeFeedFilter(dbPlansB || [], dbPpsB || [], userClaimantB.userId);
  const foundOnHomeB = homeFeedPlansB.some(p => p.id === planBId || p.dbUuid === planBId);
  assert.strictEqual(foundOnHomeB, false, "Plan B MUST NOT appear on Home Feed invitation cards (user is WAITLISTED)");

  const hubCategoryB = simulatePlansHubCategorization(dbPpsB || [], planBId, userClaimantB.userId);
  assert.strictEqual(hubCategoryB?.isWaitlisted, true, "Must appear under WAITLISTED in Plans hub");
  assert.strictEqual(hubCategoryB?.waitlistPosition, 1, "Must have waitlist_position = 1");
  assert.strictEqual(hubCategoryB?.assignedGroup, "WAITLIST");
  console.log(" Result WAITLISTED is excluded from Home feed, categorized under WAITLISTED with position 1.\n");

  // ---------------------------------------------------------------------------
  // 4. Scenario C: Claim resulting in JOINED -> Categorized as JOINED
  // ---------------------------------------------------------------------------
  console.log("--- 4. Testing Result: JOINED (AUTOMATIC with spot available) ---");
  const planCId = await createTestPlan(host.userId, {
    plan_size: 3,
    max_participants: 6,
    participant_filtering: "AUTOMATIC",
    title: "Plan C - Auto Spot Available",
  });
  // Add 3 INVITED -> size 3 < invited 4, joined_count = 1 < 3
  const userC1 = await createTestUser("C1");
  const userC2 = await createTestUser("C2");
  const userC3 = await createTestUser("C3");
  await admin.from("plan_participants").insert([
    { plan_id: planCId, user_id: userC1.userId, role: "PARTICIPANT", rsvp_status: "INVITED", delivery_status: "DELIVERED" },
    { plan_id: planCId, user_id: userC2.userId, role: "PARTICIPANT", rsvp_status: "INVITED", delivery_status: "DELIVERED" },
    { plan_id: planCId, user_id: userC3.userId, role: "PARTICIPANT", rsvp_status: "INVITED", delivery_status: "DELIVERED" },
  ]);

  const userClaimantC = await createTestUser("ClaimantC");
  const { data: rawResC, error: errC } = await userClaimantC.client.rpc("claim_plan_invite", {
    p_plan_id: planCId,
  });
  assert.ifError(errC);
  const resC: ClaimInviteResult = rawResC as ClaimInviteResult;
  console.log("Claim Result C:", resC);

  assert.strictEqual(resC.success, true);
  assert.strictEqual(resC.rsvp_status, "JOINED");
  assert.strictEqual(resC.assigned_group, null);
  assert.strictEqual(resC.waitlist_position, null);
  assert.strictEqual(resC.plan_size, 3);

  const { data: dbPlansC } = await admin.from("plans").select("*");
  const { data: dbPpsC } = await admin.from("plan_participants").select("*");

  const homeFeedPlansC = simulateHomeFeedFilter(dbPlansC || [], dbPpsC || [], userClaimantC.userId);
  const foundOnHomeC = homeFeedPlansC.some(p => p.id === planCId || p.dbUuid === planCId);
  assert.strictEqual(foundOnHomeC, false, "Plan C MUST NOT appear on Home Feed invitation cards (user is already JOINED)");

  const hubCategoryC = simulatePlansHubCategorization(dbPpsC || [], planCId, userClaimantC.userId);
  assert.strictEqual(hubCategoryC?.isJoined, true, "Must appear under JOINED in Plans hub");
  assert.strictEqual(hubCategoryC?.isWaitlisted, false);
  console.log(" Result JOINED is excluded from Home feed and categorized under JOINED in Plans hub.\n");

  // ---------------------------------------------------------------------------
  // 5. Existing States Remain Unchanged & Idempotency
  // ---------------------------------------------------------------------------
  console.log("--- 5. Testing Existing States & Idempotency ---");
  // Repeat claim for User Claimant A
  const { data: rawRepeatA } = await userClaimantA.client.rpc("claim_plan_invite", {
    p_plan_id: planAId,
  });
  const repeatA = rawRepeatA as ClaimInviteResult;
  assert.strictEqual(repeatA.already_participating, true);
  assert.strictEqual(repeatA.rsvp_status, "INVITED");

  // Repeat claim for User Claimant B (WAITLISTED)
  const { data: rawRepeatB } = await userClaimantB.client.rpc("claim_plan_invite", {
    p_plan_id: planBId,
  });
  const repeatB = rawRepeatB as ClaimInviteResult;
  assert.strictEqual(repeatB.already_participating, true);
  assert.strictEqual(repeatB.rsvp_status, "WAITLISTED");
  assert.strictEqual(repeatB.waitlist_position, 1);

  // Repeat claim for User Claimant C (JOINED)
  const { data: rawRepeatC } = await userClaimantC.client.rpc("claim_plan_invite", {
    p_plan_id: planCId,
  });
  const repeatC = rawRepeatC as ClaimInviteResult;
  assert.strictEqual(repeatC.already_participating, true);
  assert.strictEqual(repeatC.rsvp_status, "JOINED");

  // Check row counts to verify no duplicates were inserted
  const { count: countA } = await admin.from("plan_participants").select("*", { count: "exact", head: true }).eq("plan_id", planAId).eq("user_id", userClaimantA.userId);
  assert.strictEqual(countA, 1, "Exactly 1 participant row for User A");

  const { count: countB } = await admin.from("plan_participants").select("*", { count: "exact", head: true }).eq("plan_id", planBId).eq("user_id", userClaimantB.userId);
  assert.strictEqual(countB, 1, "Exactly 1 participant row for User B");

  const { count: countC } = await admin.from("plan_participants").select("*", { count: "exact", head: true }).eq("plan_id", planCId).eq("user_id", userClaimantC.userId);
  assert.strictEqual(countC, 1, "Exactly 1 participant row for User C");
  console.log(" Idempotency and existing participant states preserved.\n");

  console.log("=========================================================================");
  console.log("PHASE 3 FRONTEND INTEGRATION VERIFICATION PASSED SUCCESSFULLY!");
  console.log("=========================================================================");
}

runPhase3Verification().catch((err) => {
  console.error("Phase 3 verification failed:", err);
  process.exit(1);
});
