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

if (!url.includes("127.0.0.1")) {
  throw new Error("Target is NOT local 127.0.0.1! Aborting for safety!");
}

const supabase = createClient(url, serviceKey!);

async function runTests() {
  console.log("=== STARTING OVERDUE PLAN LIFECYCLE TESTS ===");

  // Setup test host user
  const email = `test-host-${Date.now()}@local.planless`;
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true
  });
  if (authErr) throw authErr;
  const hostId = authUser.user.id;

  await supabase.from("users").upsert({
    id: hostId,
    public_id: `host_${Date.now().toString().slice(-6)}`,
    username: "test_host",
    full_name: "Test Host"
  });

  const createdPlanIds: string[] = [];

  try {
    // ----------------------------------------------------
    // TEST 1: Future live plan remains LIVE
    // ----------------------------------------------------
    console.log("\n[TEST 1] Future live plan remains LIVE...");
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: plan1, error: p1Err } = await supabase.from("plans").insert({
      title: "Future Live Plan",
      place_id: "test_loc",
      place_name: "Central Park",
      place_address: "New York",
      scheduled_at: futureDate,
      rsvp_deadline: futureDate,
      status: "LIVE",
      total_cost: 0
    }).select().single();
    if (p1Err) throw p1Err;
    createdPlanIds.push(plan1.id);

    // Add host participant
    await supabase.from("plan_participants").insert({
      plan_id: plan1.id,
      user_id: hostId,
      role: "HOST",
      rsvp_status: "JOINED"
    });

    if (plan1.status !== "LIVE") {
      throw new Error(`Expected plan1 to be LIVE, got: ${plan1.status}`);
    }
    console.log("✓ PASS: Future plan status is LIVE:", plan1.status);

    // ----------------------------------------------------
    // TEST 2: Current/past live plan becomes OVERDUE
    // ----------------------------------------------------
    console.log("\n[TEST 2] Past live plan automatically becomes OVERDUE...");
    const pastDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: plan2, error: p2Err } = await supabase.from("plans").insert({
      title: "Past Live Plan",
      place_id: "test_loc",
      place_name: "Central Park",
      place_address: "New York",
      scheduled_at: pastDate,
      rsvp_deadline: pastDate,
      status: "LIVE", // Trigger should transition this to OVERDUE automatically!
      total_cost: 0
    }).select().single();
    if (p2Err) throw p2Err;
    createdPlanIds.push(plan2.id);

    await supabase.from("plan_participants").insert({
      plan_id: plan2.id,
      user_id: hostId,
      role: "HOST",
      rsvp_status: "JOINED"
    });

    if (plan2.status !== "OVERDUE") {
      throw new Error(`Expected plan2 to be OVERDUE automatically, got: ${plan2.status}`);
    }
    console.log("✓ PASS: Past live plan was automatically transitioned to OVERDUE:", plan2.status);

    // Test sync_overdue_plans RPC
    console.log("Testing sync_overdue_plans RPC...");
    const { error: syncErr } = await supabase.rpc("sync_overdue_plans");
    if (syncErr) throw syncErr;
    console.log("✓ PASS: sync_overdue_plans RPC executed successfully.");

    // ----------------------------------------------------
    // TEST 3: Overdue plan -> Completed
    // ----------------------------------------------------
    console.log("\n[TEST 3] Overdue plan transitions to COMPLETED...");
    // Create Supabase client authenticated as the host
    const hostClient = createClient(url, process.env.VITE_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false }
    });
    // Generate host session
    const { data: sessionData, error: sessErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email
    });
    if (sessErr) throw sessErr;
    const token = sessionData.properties.email_otp;
    const { data: verifyData, error: verifyErr } = await hostClient.auth.verifyOtp({
      email,
      token,
      type: "magiclink"
    });
    if (verifyErr) throw verifyErr;

    // Call complete_plan on plan2 (which is OVERDUE)
    const { data: compResult, error: compErr } = await hostClient.rpc("complete_plan", {
      p_plan_id: plan2.id,
      p_attendance_input: [{ user_id: hostId, attendance: "ATTENDED" }],
      p_expense_mode: "NONE"
    });
    if (compErr) throw compErr;

    // Verify in DB
    const { data: plan2AfterComp } = await supabase.from("plans").select("status").eq("id", plan2.id).single();
    if (plan2AfterComp?.status !== "COMPLETED") {
      throw new Error(`Expected plan2 to be COMPLETED, got: ${plan2AfterComp?.status}`);
    }
    console.log("✓ PASS: Overdue plan successfully transitioned to COMPLETED:", plan2AfterComp.status);

    // ----------------------------------------------------
    // TEST 4: Overdue plan -> Cancelled
    // ----------------------------------------------------
    console.log("\n[TEST 4] Overdue plan transitions to CANCELLED...");
    const { data: plan3, error: p3Err } = await supabase.from("plans").insert({
      title: "Overdue Plan To Cancel",
      place_id: "test_loc",
      place_name: "Central Park",
      place_address: "New York",
      scheduled_at: pastDate,
      rsvp_deadline: pastDate,
      status: "LIVE",
      total_cost: 0
    }).select().single();
    if (p3Err) throw p3Err;
    createdPlanIds.push(plan3.id);

    await supabase.from("plan_participants").insert({
      plan_id: plan3.id,
      user_id: hostId,
      role: "HOST",
      rsvp_status: "JOINED"
    });

    if (plan3.status !== "OVERDUE") {
      throw new Error(`Expected plan3 to be OVERDUE, got: ${plan3.status}`);
    }

    // Host cancels plan3
    const { data: cancelResult, error: cancelErr } = await hostClient.rpc("cancel_plan", {
      p_plan_id: plan3.id
    });
    if (cancelErr) throw cancelErr;

    const { data: plan3AfterCancel } = await supabase.from("plans").select("status").eq("id", plan3.id).single();
    if (plan3AfterCancel?.status !== "CANCELLED") {
      throw new Error(`Expected plan3 to be CANCELLED, got: ${plan3AfterCancel?.status}`);
    }
    console.log("✓ PASS: Overdue plan successfully transitioned to CANCELLED:", plan3AfterCancel.status);

    // ----------------------------------------------------
    // TEST 5: Completed plan remains COMPLETED
    // ----------------------------------------------------
    console.log("\n[TEST 5] Completed plan remains COMPLETED and cannot be cancelled or become overdue...");
    // Attempt to cancel plan2 (which is COMPLETED)
    const { error: cancelCompErr } = await hostClient.rpc("cancel_plan", {
      p_plan_id: plan2.id
    });
    if (!cancelCompErr) {
      throw new Error("Expected cancelling a COMPLETED plan to fail, but it succeeded!");
    }
    console.log("✓ PASS: Cancelling COMPLETED plan was rejected:", cancelCompErr.message);

    // Attempt to update status to OVERDUE or trigger overdue on plan2
    const { data: plan2Check } = await supabase.from("plans").select("status").eq("id", plan2.id).single();
    if (plan2Check?.status !== "COMPLETED") {
      throw new Error(`Expected plan2 to remain COMPLETED, got: ${plan2Check?.status}`);
    }
    console.log("✓ PASS: Completed plan remains COMPLETED:", plan2Check.status);

    // ----------------------------------------------------
    // TEST 6: Cancelled plan remains CANCELLED
    // ----------------------------------------------------
    console.log("\n[TEST 6] Cancelled plan remains CANCELLED and cannot be completed or become overdue...");
    // Attempt to complete plan3 (which is CANCELLED)
    const { error: compCancelledErr } = await hostClient.rpc("complete_plan", {
      p_plan_id: plan3.id,
      p_attendance_input: [{ user_id: hostId, attendance: "ATTENDED" }],
      p_expense_mode: "NONE"
    });
    if (!compCancelledErr) {
      throw new Error("Expected completing a CANCELLED plan to fail, but it succeeded!");
    }
    console.log("✓ PASS: Completing CANCELLED plan was rejected:", compCancelledErr.message);

    const { data: plan3Check } = await supabase.from("plans").select("status").eq("id", plan3.id).single();
    if (plan3Check?.status !== "CANCELLED") {
      throw new Error(`Expected plan3 to remain CANCELLED, got: ${plan3Check?.status}`);
    }
    console.log("✓ PASS: Cancelled plan remains CANCELLED:", plan3Check.status);

    console.log("\n========================================================");
    console.log("ALL 6 LIFECYCLE TESTS PASSED PERFECTLY!");
    console.log("========================================================");

  } finally {
    // Cleanup
    for (const id of createdPlanIds) {
      await supabase.from("plan_participants").delete().eq("plan_id", id);
      await supabase.from("plans").delete().eq("id", id);
    }
    await supabase.from("users").delete().eq("id", hostId);
    await supabase.auth.admin.deleteUser(hostId);
  }
}

runTests().catch(err => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
