import assert from "node:assert";
import { createClient } from "/Users/thilak/Documents/Planless/Planless Repo /Planless-2.0/apps/app/node_modules/@supabase/supabase-js/dist/index.cjs";
import {
  resolveUserPlanParticipant,
  resolveInviteDestination,
  claimPlanInviteRPC,
  extractInviteTokenFromPath,
  getStoredPendingInviteToken,
  setStoredPendingInviteToken,
  clearStoredPendingInviteToken,
  PENDING_INVITE_TOKEN_KEY
} from "../apps/app/src/features/plans/services/planInviteService.ts";

const LOCAL_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY);

async function createTestUser(tag: string) {
  const userId = crypto.randomUUID();
  const email = `nav_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@planless.test`;
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

async function createTestPlan(hostId: string) {
  const planId = crypto.randomUUID();
  const { error } = await admin.from("plans").insert({
    id: planId,
    public_id: "P_" + planId.slice(0, 8),
    title: "Deep Link Navigation Test Plan",
    place_name: "Nav Test Lounge",
    place_address: "100 Innovation Way",
    status: "LIVE",
    plan_size: 10,
    max_participants: 10,
    participant_filtering: "AUTOMATIC",
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
  });
  if (error) throw error;

  // Insert host as HOST with JOINED rsvp
  await admin.from("plan_participants").insert({
    plan_id: planId,
    user_id: hostId,
    role: "HOST",
    rsvp_status: "JOINED",
    responded_at: new Date().toISOString(),
    delivery_status: "DELIVERED",
  });

  return planId;
}

// In-memory localStorage shim for Node environment
const storageShim: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => storageShim[k] ?? null,
  setItem: (k: string, v: string) => { storageShim[k] = String(v); },
  removeItem: (k: string) => { delete storageShim[k]; },
  clear: () => { Object.keys(storageShim).forEach(k => delete storageShim[k]); },
};

async function runTests() {
  console.log("=========================================================================");
  console.log("Starting Invite by Link Navigation & State Handling Verification");
  console.log("=========================================================================\n");

  // 1. Setup test environment
  console.log("Creating test users and plan...");
  const host = await createTestUser("Host");
  const invitedUser = await createTestUser("Invited");
  const joinedUser = await createTestUser("Joined");
  const waitlistedUser = await createTestUser("Waitlisted");
  const skippedUser = await createTestUser("Skipped");
  const newUser = await createTestUser("NewParticipant");

  const planId = await createTestPlan(host.userId);

  // Seed participants
  await admin.from("plan_participants").insert([
    {
      plan_id: planId,
      user_id: invitedUser.userId,
      role: "PARTICIPANT",
      rsvp_status: "INVITED",
      delivery_status: "DELIVERED",
    },
    {
      plan_id: planId,
      user_id: joinedUser.userId,
      role: "PARTICIPANT",
      rsvp_status: "JOINED",
      delivery_status: "DELIVERED",
      responded_at: new Date().toISOString(),
    },
    {
      plan_id: planId,
      user_id: waitlistedUser.userId,
      role: "PARTICIPANT",
      rsvp_status: "WAITLISTED",
      assigned_group: "WAITLIST",
      waitlist_position: 1,
      delivery_status: "DELIVERED",
      responded_at: new Date().toISOString(),
    },
    {
      plan_id: planId,
      user_id: skippedUser.userId,
      role: "PARTICIPANT",
      rsvp_status: "SKIPPED",
      delivery_status: "DELIVERED",
      responded_at: new Date().toISOString(),
    },
  ]);
  console.log("   ✓ Test data seeded successfully.\n");

  // TEST 1: No participant row -> Home
  console.log("--- Test 1: No participant row for this user + plan ---");
  const resNew = await resolveInviteDestination(planId, newUser.userId, newUser.client);
  console.log("   Resolution for new user:", resNew);
  assert.strictEqual(resNew.destination, "HOME", "Destination must be HOME");
  assert.strictEqual(resNew.status, "NO_PARTICIPANT", "Status must be NO_PARTICIPANT");
  assert(resNew.claimResult?.success, "Invite must be claimed successfully");

  // Check participant record in DB
  const { data: dbNewPart } = await admin
    .from("plan_participants")
    .select("role, rsvp_status")
    .eq("plan_id", planId)
    .eq("user_id", newUser.userId)
    .single();
  assert.strictEqual(dbNewPart?.rsvp_status, "INVITED", "New user should now be INVITED");
  assert.strictEqual(dbNewPart?.role, "PARTICIPANT", "Role should be PARTICIPANT");
  console.log("   ✓ Test 1 Passed: New user claimed invite -> INVITED state -> destination: HOME.\n");

  // TEST 2: Existing INVITED participant -> Home
  console.log("--- Test 2: Existing INVITED participant ---");
  const resInvited = await resolveInviteDestination(planId, invitedUser.userId, invitedUser.client);
  console.log("   Resolution for existing INVITED:", resInvited);
  assert.strictEqual(resInvited.destination, "HOME", "Destination must be HOME");
  assert.strictEqual(resInvited.status, "INVITED", "Status must be INVITED");

  // Verify INVITED state was kept unchanged
  const { data: dbInvitedPart } = await admin
    .from("plan_participants")
    .select("role, rsvp_status")
    .eq("plan_id", planId)
    .eq("user_id", invitedUser.userId)
    .single();
  assert.strictEqual(dbInvitedPart?.rsvp_status, "INVITED", "INVITED state must remain unchanged");
  console.log("   ✓ Test 2 Passed: Existing INVITED kept unchanged -> destination: HOME.\n");

  // TEST 3: Existing JOINED participant -> specific Plan Preview
  console.log("--- Test 3: Existing JOINED participant ---");
  const resJoined = await resolveInviteDestination(planId, joinedUser.userId, joinedUser.client);
  console.log("   Resolution for existing JOINED:", resJoined);
  assert.strictEqual(resJoined.destination, "PLAN_PREVIEW", "Destination must be PLAN_PREVIEW");
  assert.strictEqual(resJoined.status, "JOINED", "Status must be JOINED");
  assert.strictEqual(resJoined.planId, planId, "planId must match exactly");

  // Verify state was not touched
  const { data: dbJoinedPart } = await admin
    .from("plan_participants")
    .select("role, rsvp_status")
    .eq("plan_id", planId)
    .eq("user_id", joinedUser.userId)
    .single();
  assert.strictEqual(dbJoinedPart?.rsvp_status, "JOINED", "JOINED state must remain untouched");
  console.log("   ✓ Test 3 Passed: Existing JOINED user never redirected to Home -> destination: PLAN_PREVIEW.\n");

  // TEST 4: Existing WAITLISTED participant -> specific Plan Preview
  console.log("--- Test 4: Existing WAITLISTED participant ---");
  const resWaitlist = await resolveInviteDestination(planId, waitlistedUser.userId, waitlistedUser.client);
  console.log("   Resolution for existing WAITLISTED:", resWaitlist);
  assert.strictEqual(resWaitlist.destination, "PLAN_PREVIEW", "Destination must be PLAN_PREVIEW");
  assert.strictEqual(resWaitlist.status, "WAITLISTED", "Status must be WAITLISTED");
  assert.strictEqual(resWaitlist.planId, planId, "planId must match exactly");

  // Verify state was not touched
  const { data: dbWaitPart } = await admin
    .from("plan_participants")
    .select("role, rsvp_status, assigned_group, waitlist_position")
    .eq("plan_id", planId)
    .eq("user_id", waitlistedUser.userId)
    .single();
  assert.strictEqual(dbWaitPart?.rsvp_status, "WAITLISTED", "WAITLISTED state must remain untouched");
  assert.strictEqual(dbWaitPart?.waitlist_position, 1, "Waitlist position must remain 1");
  console.log("   ✓ Test 4 Passed: Existing WAITLISTED user never redirected to Home -> destination: PLAN_PREVIEW.\n");

  // TEST 5: Existing SKIPPED participant -> specific Plan Preview
  console.log("--- Test 5: Existing SKIPPED participant ---");
  const resSkipped = await resolveInviteDestination(planId, skippedUser.userId, skippedUser.client);
  console.log("   Resolution for existing SKIPPED:", resSkipped);
  assert.strictEqual(resSkipped.destination, "PLAN_PREVIEW", "Destination must be PLAN_PREVIEW");
  assert.strictEqual(resSkipped.status, "SKIPPED", "Status must be SKIPPED");
  assert.strictEqual(resSkipped.planId, planId, "planId must match exactly");

  // Verify state was not touched
  const { data: dbSkippedPart } = await admin
    .from("plan_participants")
    .select("role, rsvp_status")
    .eq("plan_id", planId)
    .eq("user_id", skippedUser.userId)
    .single();
  assert.strictEqual(dbSkippedPart?.rsvp_status, "SKIPPED", "SKIPPED state must remain untouched");
  console.log("   ✓ Test 5 Passed: Existing SKIPPED user never redirected to Home -> destination: PLAN_PREVIEW.\n");

  // TEST 6: Host -> specific Plan Preview
  console.log("--- Test 6: Host opening invite link ---");
  const resHost = await resolveInviteDestination(planId, host.userId, host.client);
  console.log("   Resolution for Host:", resHost);
  assert.strictEqual(resHost.destination, "PLAN_PREVIEW", "Destination must be PLAN_PREVIEW");
  assert.strictEqual(resHost.status, "HOST", "Status must be HOST");
  assert.strictEqual(resHost.planId, planId, "planId must match exactly");
  console.log("   ✓ Test 6 Passed: Host opening link opens Plan Preview without error -> destination: PLAN_PREVIEW.\n");

  // TEST 7: Unauthenticated user completing onboarding -> same state-based destination
  console.log("--- Test 7: Unauthenticated user completing onboarding ---");
  
  // 7a. Unauthenticated landing: token captured into localStorage
  clearStoredPendingInviteToken();
  assert.strictEqual(getStoredPendingInviteToken(), null);

  const incomingPath = `/join/${planId}`;
  const extractedToken = extractInviteTokenFromPath(incomingPath);
  assert.strictEqual(extractedToken, planId);
  setStoredPendingInviteToken(extractedToken!);
  assert.strictEqual(getStoredPendingInviteToken(), planId);

  // 7b. User completes sign-up and onboarding
  const onboardedUser = await createTestUser("OnboardingComplete");
  const storedPendingToken = getStoredPendingInviteToken();
  assert.strictEqual(storedPendingToken, planId, "Token must survive authentication and onboarding");

  // 7c. Post-onboarding destination resolution executes for newly authenticated user
  const resPostOnboard = await resolveInviteDestination(storedPendingToken!, onboardedUser.userId, onboardedUser.client);
  console.log("   Post-onboarding resolution:", resPostOnboard);
  assert.strictEqual(resPostOnboard.destination, "HOME", "Newly onboarded user must be routed to HOME");
  assert.strictEqual(resPostOnboard.status, "NO_PARTICIPANT");
  assert(resPostOnboard.claimResult?.success);

  // 7d. If returning user was already JOINED and logged in via OTP
  setStoredPendingInviteToken(planId);
  const resReturningJoined = await resolveInviteDestination(getStoredPendingInviteToken()!, joinedUser.userId, joinedUser.client);
  assert.strictEqual(resReturningJoined.destination, "PLAN_PREVIEW", "Returning JOINED user must reach PLAN_PREVIEW");
  clearStoredPendingInviteToken();

  console.log("   ✓ Test 7 Passed: Token preserved through auth/onboarding; resolves correct destination.\n");

  // TEST 8: Inactive / Cancelled / Invalid plan handling
  console.log("--- Test 8: Cancelled / Invalid plan handling ---");
  const cancelledPlanId = crypto.randomUUID();
  const { error: insertCancelledErr } = await admin.from("plans").insert({
    id: cancelledPlanId,
    public_id: "P_" + cancelledPlanId.slice(0, 8),
    title: "Cancelled Plan",
    place_name: "Cancelled Venue",
    place_address: "123 Cancelled St",
    status: "CANCELLED",
    plan_size: 5,
    max_participants: 5,
    participant_filtering: "AUTOMATIC",
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
  });
  if (insertCancelledErr) {
    console.error("Failed to insert cancelled plan:", insertCancelledErr);
    throw insertCancelledErr;
  }

  const resCancelled = await resolveInviteDestination(cancelledPlanId, newUser.userId, newUser.client);
  assert.strictEqual(resCancelled.destination, "INVALID", "Cancelled plan must resolve to INVALID");
  assert.strictEqual(resCancelled.status, "PLAN_INACTIVE");

  const resInvalid = await resolveInviteDestination("invalid-non-existent-uuid", newUser.userId, newUser.client);
  assert.strictEqual(resInvalid.destination, "INVALID", "Non-existent plan must resolve to INVALID");
  assert.strictEqual(resInvalid.status, "PLAN_NOT_FOUND");
  console.log("   ✓ Test 8 Passed: Inactive and non-existent plans resolve to INVALID without side effects.\n");

  console.log("=========================================================================");
  console.log("ALL 8 VERIFICATION TESTS PASSED SUCCESSFULLY!");
  console.log("=========================================================================");
}

runTests().catch((err) => {
  console.error("Verification failed with error:", err);
  process.exit(1);
});
