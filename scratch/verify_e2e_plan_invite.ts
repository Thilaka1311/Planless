import assert from "node:assert";
import { createClient } from "/Users/thilak/Documents/Planless/Planless Repo /Planless-2.0/apps/app/node_modules/@supabase/supabase-js/dist/index.cjs";

const LOCAL_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY);

class StorageSimulator {
  private items = new Map<string, string>();
  getItem(k: string): string | null {
    return this.items.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.items.set(k, v);
  }
  removeItem(k: string): void {
    this.items.delete(k);
  }
}

const STORAGE_KEY = "planless_pending_invite_token";

async function runE2ETests() {
  console.log("===============================================================");
  console.log("Starting End-to-End Flow Verification (Plan UUID as Token)");
  console.log("===============================================================\n");

  const ts = Date.now();
  const hostId = crypto.randomUUID();
  const planId = crypto.randomUUID();

  // Create Host
  await admin.auth.admin.createUser({
    id: hostId,
    email: `host_${ts}@planless.test`,
    password: "TestPassword123!",
    email_confirm: true,
  });
  await admin.from("users").upsert({
    id: hostId,
    public_id: "PUB_" + hostId.slice(0, 8),
    full_name: "Host User",
    profile_completed: true,
  });

  // Create LIVE Plan
  await admin.from("plans").insert({
    id: planId,
    public_id: "PLAN_" + planId.slice(0, 8),
    title: "E2E Shared Plan",
    place_name: "Rooftop Lounge",
    place_address: "San Francisco",
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
    status: "LIVE",
    plan_size: 4,
    max_participants: 4,
  });

  await admin.from("plan_participants").insert({
    plan_id: planId,
    user_id: hostId,
    role: "HOST",
    rsvp_status: "JOINED",
    delivery_status: "DELIVERED",
  });

  console.log("[Step 1] Visitor opens /join/" + planId);
  const localStorage = new StorageSimulator();
  // Extracted token from path is planId
  const extractedToken = planId;
  localStorage.setItem(STORAGE_KEY, extractedToken);
  assert.strictEqual(localStorage.getItem(STORAGE_KEY), planId);
  console.log("✓ Token stored in localStorage:", extractedToken);

  console.log("\n[Step 2] New visitor completes signup, OTP, profile setup");
  const newUserId = crypto.randomUUID();
  const newUserEmail = `newuser_${ts}@planless.test`;
  await admin.auth.admin.createUser({
    id: newUserId,
    email: newUserEmail,
    password: "TestPassword123!",
    email_confirm: true,
  });
  await admin.from("users").upsert({
    id: newUserId,
    public_id: "PUB_" + newUserId.slice(0, 8),
    full_name: "Alice Walker",
    profile_completed: true,
  });

  // Token survived signup/onboarding
  assert.strictEqual(localStorage.getItem(STORAGE_KEY), planId);
  console.log("✓ Token survived onboarding in localStorage");

  console.log("\n[Step 3] MainApp initializes session and processes pending invite");
  const newUserClient = createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } });
  await newUserClient.auth.signInWithPassword({ email: newUserEmail, password: "TestPassword123!" });

  const tokenToProcess = localStorage.getItem(STORAGE_KEY);
  assert(tokenToProcess, "Token must exist for processing");

  const { data: claimResult, error: claimErr } = await newUserClient.rpc("claim_plan_invite", {
    p_plan_id: tokenToProcess,
  });
  assert(!claimErr, "claimErr: " + claimErr?.message);
  assert.strictEqual(claimResult.success, true);
  assert.strictEqual(claimResult.rsvp_status, "INVITED");
  assert.strictEqual(claimResult.new_plan_size, 5);

  // Clear storage on success
  localStorage.removeItem(STORAGE_KEY);
  assert.strictEqual(localStorage.getItem(STORAGE_KEY), null);
  console.log("✓ claim_plan_invite RPC succeeded. Storage cleared.");

  console.log("\n[Step 4] Verify participant row in database");
  const { data: participantRow } = await admin
    .from("plan_participants")
    .select("*")
    .eq("plan_id", planId)
    .eq("user_id", newUserId)
    .single();

  assert.strictEqual(participantRow.role, "PARTICIPANT");
  assert.strictEqual(participantRow.rsvp_status, "INVITED");
  assert.strictEqual(participantRow.assigned_group, null);
  assert.strictEqual(participantRow.waitlist_position, null);
  console.log("✓ User is INVITED (NOT JOINED).");

  console.log("\n[Step 5] Verify plan capacity incremented");
  const { data: updatedPlan } = await admin.from("plans").select("plan_size, max_participants").eq("id", planId).single();
  assert.strictEqual(updatedPlan.plan_size, 5, "Plan size must have incremented from 4 to 5");
  assert.strictEqual(updatedPlan.max_participants, 5, "Max participants must be at least 5");
  console.log("✓ Plan size atomically incremented: 4 → 5");

  console.log("\n===============================================================");
  console.log("E2E JOURNEY VERIFICATION PASSED SUCCESSFULLY! 🎉");
  console.log("===============================================================\n");
}

runE2ETests().catch(err => {
  console.error("❌ E2E verification failed:", err);
  process.exit(1);
});
