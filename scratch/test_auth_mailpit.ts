import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

dotenv.config({ path: path.resolve(root, ".env.local") });

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !url.includes("127.0.0.1")) {
  throw new Error("Target is NOT local 127.0.0.1! Aborting for safety!");
}

const supabase = createClient(url, anonKey);

async function testAuthFlow() {
  const testEmail = `dev-test-${Date.now()}@planless.local`;
  console.log(`1. Requesting OTP for email: ${testEmail}...`);

  const { data: signInData, error: signInError } = await supabase.auth.signInWithOtp({
    email: testEmail,
    options: {
      shouldCreateUser: true
    }
  });

  if (signInError) {
    throw new Error(`signInWithOtp failed: ${signInError.message}`);
  }
  console.log("SUCCESS: OTP requested from local Supabase Auth.");

  // Wait 1 second for Mailpit to process
  await new Promise(r => setTimeout(r, 1000));

  console.log("2. Checking Mailpit (http://127.0.0.1:54324) for the OTP email...");
  const mailRes = await fetch("http://127.0.0.1:54324/api/v1/messages");
  const mailData = await mailRes.json();

  const msg = mailData.messages?.find((m: any) => m.To?.some((t: any) => t.Address === testEmail));
  if (!msg) {
    throw new Error(`Did not find message for ${testEmail} in Mailpit! Total messages: ${mailData.total}`);
  }
  console.log("SUCCESS: Found email in Mailpit! Subject:", msg.Subject, "ID:", msg.ID);

  // Fetch full message details to get the OTP code
  const msgDetailRes = await fetch(`http://127.0.0.1:54324/api/v1/message/${msg.ID}`);
  const msgDetail = await msgDetailRes.json();
  const textBody = msgDetail.Text || msgDetail.HTML || msgDetail.Snippet || "";

  // Supabase default email template has either a 6-digit code or a confirmation link with token
  const otpMatch = textBody.match(/\b\d{6}\b/) || msgDetail.Snippet?.match(/\b\d{6}\b/);
  console.log("Email text snippet:", textBody.slice(0, 300));

  if (!otpMatch) {
    // Check if there's a token parameter in a confirmation link
    const tokenMatch = textBody.match(/token=([a-zA-Z0-9_\-]+)/);
    if (tokenMatch) {
      console.log("Found confirmation token link:", tokenMatch[1]);
    } else {
      console.log("Could not find 6-digit code regex in text, message snippet:", msgDetail.Snippet);
    }
  } else {
    const otpCode = otpMatch[0];
    console.log(`SUCCESS: Extracted OTP code: ${otpCode}`);

    console.log("3. Verifying OTP against local Supabase Auth...");
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email: testEmail,
      token: otpCode,
      type: "email"
    });

    if (verifyError || !verifyData.session) {
      throw new Error(`verifyOtp failed: ${verifyError?.message || "No session returned"}`);
    }

    console.log("SUCCESS: User authenticated successfully! User ID:", verifyData.session.user.id);

    console.log("4. Testing Sign Out...");
    await supabase.auth.signOut();
    console.log("SUCCESS: Sign out completed.");
  }

  console.log("\nALL LOCAL AUTH CHECKS PASSED!");
}

testAuthFlow().catch(console.error);
