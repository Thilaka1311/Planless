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

const supabase = createClient(url, serviceKey);

async function runTests() {
  console.log("=== Testing Participant Removal for Invited Participants ===");

  const createdUserIds: string[] = [];
  const createdPlanIds: string[] = [];

  // Helper to create test user
  async function createTestUser(tag: string) {
    const email = `test-user-${tag}-${Date.now()}@local.planless`;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: `Test User ${tag}` },
    });
    if (error || !data.user) {
      throw new Error(`Failed to create test user: ${error?.message}`);
    }
    const userId = data.user.id;
    createdUserIds.push(userId);

    const randomSuffix = Math.floor(Math.random() * 10000000);
    const { error: userErr } = await supabase.from("users").upsert({
      id: userId,
      public_id: `usr_${randomSuffix}`,
      username: `u_${randomSuffix}`,
      full_name: `Test User ${tag}`,
    });
    if (userErr) {
      throw new Error(`Failed to insert into users table: ${userErr.message}`);
    }

    return userId;
  }

  // Helper to create test client authenticated as a specific user
  function getClientForUser(userId: string) {
    // Generate a signed token or use service role client with auth context via RPC
    // Supabase RPCs with auth.uid() can be called using set_config or supabase client
    // With service role, we can execute the RPC function by impersonating via auth or directly calling the RPC function
    return supabase;
  }

  try {
    const hostId = await createTestUser("host");
    const userA = await createTestUser("user_a_invited");
    const userB = await createTestUser("user_b_joined");
    const userC = await createTestUser("user_c_waitlist");
    const userD = await createTestUser("user_d_paid_inv");

    console.log("✓ Created test users:", { hostId, userA, userB, userC, userD });

    // -------------------------------------------------------------
    // TEST 1: Remove Invited Participant
    // -------------------------------------------------------------
    console.log("\n--- TEST 1: Remove Invited Participant ---");
    const plan1Res = await supabase.from("plans").insert({
      title: "Test Plan 1 - Remove Invited",
      place_name: "Local Cafe",
      place_address: "123 Test Street",
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
      max_participants: 5,
      plan_size: 5,
      participant_filtering: "AUTOMATIC",
      public_id: `pln_t1_${Date.now()}`.slice(0, 20),
    }).select().single();
    if (plan1Res.error || !plan1Res.data) throw new Error(`Failed to create plan: ${plan1Res.error?.message}`);
    const plan1Id = plan1Res.data.id;
    createdPlanIds.push(plan1Id);

    // Add host as JOINED
    const hostPartRes = await supabase.from("plan_participants").insert({
      plan_id: plan1Id,
      user_id: hostId,
      role: "HOST",
      rsvp_status: "JOINED",
    });
    if (hostPartRes.error) throw new Error(`Failed to insert host participant: ${hostPartRes.error.message}`);

    // Add User A as INVITED (skip_reason = null)
    const userAPartRes = await supabase.from("plan_participants").insert({
      plan_id: plan1Id,
      user_id: userA,
      role: "PARTICIPANT",
      rsvp_status: "INVITED",
      skip_reason: null,
    });
    if (userAPartRes.error) throw new Error(`Failed to insert User A: ${userAPartRes.error.message}`);

    // Verify DB state before removal
    const beforeA = await supabase.from("plan_participants").select("*").eq("plan_id", plan1Id).eq("user_id", userA);
    assert.strictEqual(beforeA.data?.length, 1, "User A should have 1 row in plan_participants before removal");
    assert.strictEqual(beforeA.data![0].rsvp_status, "INVITED", "User A rsvp_status should be INVITED");
    assert.strictEqual(beforeA.data![0].skip_reason, null, "User A skip_reason should be null");
    console.log("✓ Before removal: User A is INVITED with skip_reason = null");

    // Host removes User A via RPC
    // Execute remove_participant as host
    const rpcRes1 = await supabase.rpc("remove_participant", {
      p_plan_id: plan1Id,
      p_target_user_id: userA,
    });
    // If called via service role, auth.uid() might be null unless we call via authenticated client or wrapper
    // Let's check RPC result:
    if (rpcRes1.error) {
      // In service role, auth.uid() is null so remove_participant raises 'Not authenticated'.
      // Let's run a test transaction with set_config('request.jwt.claims', ...) to simulate host authentication:
      const rawRes = await supabase.rpc("remove_participant", {
        p_plan_id: plan1Id,
        p_target_user_id: userA,
      });
      console.log("Service role RPC call result:", rawRes);
    }

    // To test remove_participant cleanly with auth.uid(), let's use an authenticated client for host:
    const { data: sessionData, error: sessionErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: (await supabase.auth.admin.getUserById(hostId)).data.user!.email!,
    });
    
    // Or simpler: sign in as host or set auth claim:
    // Let's sign in as host
    const hostEmail = (await supabase.auth.admin.getUserById(hostId)).data.user!.email!;
    // Set host password
    await supabase.auth.admin.updateUserById(hostId, { password: "TestPassword123!" });
    
    const hostClient = createClient(url, process.env.VITE_SUPABASE_ANON_KEY || "dummy", {
      auth: { persistSession: false }
    });
    const signInRes = await hostClient.auth.signInWithPassword({
      email: hostEmail,
      password: "TestPassword123!"
    });
    assert.ok(signInRes.data.session, "Host must sign in successfully");
    console.log("✓ Host signed in successfully");

    // Call remove_participant as host
    const hostRemoveRes1 = await hostClient.rpc("remove_participant", {
      p_plan_id: plan1Id,
      p_target_user_id: userA,
    });
    if (hostRemoveRes1.error) throw new Error(`remove_participant failed: ${hostRemoveRes1.error.message}`);
    console.log("✓ Host called remove_participant for User A. Result:", hostRemoveRes1.data);
    assert.strictEqual(hostRemoveRes1.data.success, true);
    assert.strictEqual(hostRemoveRes1.data.skip_reason, null, "skip_reason should be null for invited participant");

    // Query DB state after removal
    const afterA = await supabase.from("plan_participants").select("*").eq("plan_id", plan1Id).eq("user_id", userA);
    assert.strictEqual(afterA.data?.length, 0, "User A row must be COMPLETELY DELETED from plan_participants");
    console.log("✓ PASSED TEST 1: User A row is completely deleted (0 rows). No SKIPPED status, no skip_reason.");

    // -------------------------------------------------------------
    // TEST 2: Remove Joined Participant (Regression Check)
    // -------------------------------------------------------------
    console.log("\n--- TEST 2: Remove Joined Participant (Regression Check) ---");
    // Add User B as JOINED
    await supabase.from("plan_participants").insert({
      plan_id: plan1Id,
      user_id: userB,
      role: "PARTICIPANT",
      rsvp_status: "JOINED",
    });

    const hostRemoveRes2 = await hostClient.rpc("remove_participant", {
      p_plan_id: plan1Id,
      p_target_user_id: userB,
    });
    if (hostRemoveRes2.error) throw new Error(`remove_participant failed for joined user: ${hostRemoveRes2.error.message}`);
    console.log("✓ Host called remove_participant for User B. Result:", hostRemoveRes2.data);
    assert.strictEqual(hostRemoveRes2.data.success, true);
    assert.strictEqual(hostRemoveRes2.data.skip_reason, "REMOVED");

    const afterB = await supabase.from("plan_participants").select("*").eq("plan_id", plan1Id).eq("user_id", userB);
    assert.strictEqual(afterB.data?.length, 1, "User B row must still exist as SKIPPED");
    assert.strictEqual(afterB.data![0].rsvp_status, "SKIPPED", "User B rsvp_status must be SKIPPED");
    assert.strictEqual(afterB.data![0].skip_reason, "REMOVED", "User B skip_reason must be REMOVED");
    console.log("✓ PASSED TEST 2: Joined User B removal preserves existing behavior (SKIPPED with skip_reason = REMOVED).");

    // -------------------------------------------------------------
    // TEST 3: Remove Waitlisted Participant (Regression Check)
    // -------------------------------------------------------------
    console.log("\n--- TEST 3: Remove Waitlisted Participant (Regression Check) ---");
    // Add User C as WAITLISTED
    await supabase.from("plan_participants").insert({
      plan_id: plan1Id,
      user_id: userC,
      role: "PARTICIPANT",
      rsvp_status: "WAITLISTED",
    });

    const hostRemoveRes3 = await hostClient.rpc("remove_participant", {
      p_plan_id: plan1Id,
      p_target_user_id: userC,
    });
    if (hostRemoveRes3.error) throw new Error(`remove_participant failed for waitlisted user: ${hostRemoveRes3.error.message}`);
    console.log("✓ Host called remove_participant for User C. Result:", hostRemoveRes3.data);
    assert.strictEqual(hostRemoveRes3.data.success, true);
    assert.strictEqual(hostRemoveRes3.data.skip_reason, "REMOVED");

    const afterC = await supabase.from("plan_participants").select("*").eq("plan_id", plan1Id).eq("user_id", userC);
    assert.strictEqual(afterC.data?.length, 1, "User C row must still exist as SKIPPED");
    assert.strictEqual(afterC.data![0].rsvp_status, "SKIPPED", "User C rsvp_status must be SKIPPED");
    assert.strictEqual(afterC.data![0].skip_reason, "REMOVED", "User C skip_reason must be REMOVED");
    console.log("✓ PASSED TEST 3: Waitlisted User C removal preserves existing behavior (SKIPPED with skip_reason = REMOVED).");

    // -------------------------------------------------------------
    // TEST 4: Paid Plan - Remove Invited Participant & Recalculate
    // -------------------------------------------------------------
    console.log("\n--- TEST 4: Paid Plan - Remove Invited Participant & Recalculate ---");
    const plan2Res = await supabase.from("plans").insert({
      title: "Test Plan 2 - Paid Plan",
      place_name: "Local Cafe",
      place_address: "123 Test Street",
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
      total_cost: 60.00,
      max_participants: 3,
      plan_size: 3,
      participant_filtering: "AUTOMATIC",
      public_id: `pln_t2_${Date.now()}`.slice(0, 20),
    }).select().single();
    if (plan2Res.error || !plan2Res.data) throw new Error(`Failed to create paid plan: ${plan2Res.error?.message}`);
    const plan2Id = plan2Res.data.id;
    createdPlanIds.push(plan2Id);

    // Host (JOINED) + User D (INVITED)
    await supabase.from("plan_participants").insert([
      { plan_id: plan2Id, user_id: hostId, role: "HOST", rsvp_status: "JOINED" },
      { plan_id: plan2Id, user_id: userD, role: "PARTICIPANT", rsvp_status: "INVITED" },
    ]);

    // Recalculate expenses
    await supabase.rpc("recalculate_wallet_expenses", { p_plan_id: plan2Id });

    // Host removes User D (INVITED)
    const hostRemoveRes4 = await hostClient.rpc("remove_participant", {
      p_plan_id: plan2Id,
      p_target_user_id: userD,
    });
    if (hostRemoveRes4.error) throw new Error(`remove_participant failed for User D: ${hostRemoveRes4.error.message}`);
    assert.strictEqual(hostRemoveRes4.data.success, true);
    assert.strictEqual(hostRemoveRes4.data.skip_reason, null);

    // Recalculate expenses again
    await supabase.rpc("recalculate_wallet_expenses", { p_plan_id: plan2Id });

    // Verify User D is deleted from plan_participants
    const afterD = await supabase.from("plan_participants").select("*").eq("plan_id", plan2Id).eq("user_id", userD);
    assert.strictEqual(afterD.data?.length, 0, "User D must be deleted from plan_participants");

    // Verify wallet_expense_participants contains ONLY host
    const expenseRow = await supabase.from("wallet_expenses").select("id").eq("plan_id", plan2Id).single();
    if (expenseRow.data) {
      const expParticipants = await supabase.from("wallet_expense_participants").select("*").eq("expense_id", expenseRow.data.id);
      const userDInExpenses = expParticipants.data?.find(ep => ep.user_id === userD);
      assert.strictEqual(userDInExpenses, undefined, "User D must not have an entry in wallet_expense_participants");
    }
    console.log("✓ PASSED TEST 4: Paid plan invited participant removal deleted row, recorded no skip, and clean wallet recalculation.");

    // -------------------------------------------------------------
    // TEST 5: Automatic Plan Size Decrease on Removing Invited
    // -------------------------------------------------------------
    console.log("\n--- TEST 5: Automatic Plan Size Decrease on Removing Invited ---");
    const userE = await createTestUser("user_e_inv");
    const userF = await createTestUser("user_f_inv");

    const plan3Res = await supabase.from("plans").insert({
      title: "Test Plan 3 - Auto Plan Size Decrease",
      place_name: "Local Cafe",
      place_address: "123 Test Street",
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      rsvp_deadline: new Date(Date.now() + 43200000).toISOString(),
      max_participants: 3,
      plan_size: 3,
      participant_filtering: "AUTOMATIC",
      public_id: `pln_t3_${Date.now()}`.slice(0, 20),
    }).select().single();
    if (plan3Res.error || !plan3Res.data) throw new Error(`Failed to create plan 3: ${plan3Res.error?.message}`);
    const plan3Id = plan3Res.data.id;
    createdPlanIds.push(plan3Id);

    // Host (JOINED), User E (INVITED), User F (INVITED) -> Total 3 invited = plan_size 3
    await supabase.from("plan_participants").insert([
      { plan_id: plan3Id, user_id: hostId, role: "HOST", rsvp_status: "JOINED" },
      { plan_id: plan3Id, user_id: userE, role: "PARTICIPANT", rsvp_status: "INVITED" },
      { plan_id: plan3Id, user_id: userF, role: "PARTICIPANT", rsvp_status: "INVITED" },
    ]);

    // Removal flow:
    // 1. Remove participant User E
    const hostRemoveRes5 = await hostClient.rpc("remove_participant", {
      p_plan_id: plan3Id,
      p_target_user_id: userE,
    });
    if (hostRemoveRes5.error) throw new Error(`remove_participant failed for User E: ${hostRemoveRes5.error.message}`);
    assert.strictEqual(hostRemoveRes5.data.success, true);
    assert.strictEqual(hostRemoveRes5.data.skip_reason, null);

    // 2. Decrease plan capacity to 2 (since plan_size == invitedCount and no waitlist)
    const capRes = await hostClient.rpc("update_plan_capacity", {
      p_plan_id: plan3Id,
      p_max_participants: 2,
    });
    if (capRes.error) throw new Error(`update_plan_capacity failed: ${capRes.error.message}`);

    // Verify User E is deleted
    const afterE = await supabase.from("plan_participants").select("*").eq("plan_id", plan3Id).eq("user_id", userE);
    assert.strictEqual(afterE.data?.length, 0, "User E must be deleted from plan_participants");

    // Verify updated plan capacity is 2
    const updatedPlan3 = await supabase.from("plans").select("plan_size, max_participants").eq("id", plan3Id).single();
    assert.strictEqual(updatedPlan3.data?.plan_size, 2, "Plan size must decrease to 2");

    // Verify remaining participants: Host (JOINED), User F (INVITED)
    const remainingPlan3 = await supabase.from("plan_participants").select("user_id, rsvp_status").eq("plan_id", plan3Id);
    assert.strictEqual(remainingPlan3.data?.length, 2);
    const userFRow = remainingPlan3.data?.find(p => p.user_id === userF);
    assert.strictEqual(userFRow?.rsvp_status, "INVITED");
    console.log("✓ PASSED TEST 5: Automatic mode capacity decrease and invited participant deletion verified.");

    console.log("\n=======================================================");
    console.log("ALL 4 DATABASE TESTS PASSED SUCCESSFULLY!");
    console.log("=======================================================");

  } finally {
    // Cleanup
    console.log("\nCleaning up test data...");
    for (const planId of createdPlanIds) {
      await supabase.from("plans").delete().eq("id", planId);
    }
    for (const userId of createdUserIds) {
      await supabase.from("users").delete().eq("id", userId);
      await supabase.auth.admin.deleteUser(userId);
    }
    console.log("✓ Cleaned up test data.");
  }
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
