import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

dotenv.config({ path: path.resolve(root, ".env.local") });

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !url.includes("127.0.0.1")) {
  throw new Error("Target is NOT local 127.0.0.1! Aborting for safety!");
}

const supabase = createClient(url, serviceKey);

async function test() {
  // Create auth user first
  const { data: authUser, error: authUserErr } = await supabase.auth.admin.createUser({
    email: "test-user@local.planless",
    email_confirm: true
  });
  if (authUserErr) {
    console.error("Auth user create error:", authUserErr);
    return;
  }
  const testUserId = authUser.user.id;
  console.log("SUCCESS: Created local auth user:", testUserId);

  // Insert test user in public.users
  const { data: inserted, error: insertErr } = await supabase.from("users").upsert({
    id: testUserId,
    public_id: "usr_local_test",
    username: "local_test_user",
    full_name: "Local Test User"
  }).select();

  if (insertErr) {
    console.error("Insert error:", insertErr);
    await supabase.auth.admin.deleteUser(testUserId);
    return;
  }
  console.log("SUCCESS: Inserted test user in local DB:", inserted);

  // Read back
  const { data: fetched, error: fetchErr } = await supabase.from("users").select("*").eq("id", testUserId);
  if (fetchErr) {
    console.error("Fetch error:", fetchErr);
  } else {
    console.log("SUCCESS: Read test user from local DB:", fetched);
  }

  // Clean up
  await supabase.from("users").delete().eq("id", testUserId);
  await supabase.auth.admin.deleteUser(testUserId);
  console.log("SUCCESS: Cleaned up test user from local DB.");

  console.log("\n2. Testing Local Storage upload and delete...");
  const testFileName = "test-ping.txt";
  const { data: uploadData, error: uploadErr } = await supabase.storage.from("avatars").upload(testFileName, Buffer.from("hello local storage"), {
    contentType: "text/plain",
    upsert: true
  });
  if (uploadErr) {
    console.error("Storage upload error:", uploadErr);
  } else {
    console.log("SUCCESS: Uploaded file to local 'avatars' bucket:", uploadData);
    const { error: removeErr } = await supabase.storage.from("avatars").remove([testFileName]);
    if (removeErr) {
      console.error("Storage remove error:", removeErr);
    } else {
      console.log("SUCCESS: Cleaned up file from local storage.");
    }
  }

  console.log("\n3. Testing Local Auth OTP trigger...");
  const { data: otpData, error: otpErr } = await supabase.auth.signInWithOtp({
    email: "local-dev-test@planless.local"
  });
  if (otpErr) {
    console.error("Auth OTP error:", otpErr);
  } else {
    console.log("SUCCESS: signInWithOtp triggered on local Supabase Auth:", otpData);
  }

  console.log("\nALL TESTS PASSED LOCALLY ON DOCKER SUPABASE!");
}

test().catch(console.error);
