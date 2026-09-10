import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;

console.log("Connecting to Supabase URL:", supabaseUrl);

async function testUrl(targetUrl: string, name: string) {
  console.log(`\nTesting ${name} (${targetUrl})...`);
  const client = createClient(targetUrl, supabaseKey);
  const { data, error } = await client.functions.invoke("maps", {
    body: { action: "autocomplete", input: "Bangalore", sessiontoken: "test-token-123" }
  });

  if (error) {
    console.error(`[${name}] Functions error:`, error);
    return false;
  }

  console.log(`[${name}] Status:`, data?.status);
  console.log(`[${name}] Predictions count:`, data?.predictions?.length);
  if (data?.predictions?.length > 0) {
    console.log(`[${name}] First prediction:`, data.predictions[0].description);
  }
  return true;
}

async function testFullFlow() {
  const client = createClient("http://127.0.0.1:54321", supabaseKey);

  // 1. Autocomplete
  console.log("\n1. Testing Autocomplete for 'Chennai'...");
  const { data: autoData, error: autoErr } = await client.functions.invoke("maps", {
    body: { action: "autocomplete", input: "Chennai", sessiontoken: "sess-123" },
  });
  if (autoErr) {
    console.error("Autocomplete failed:", autoErr);
  } else {
    console.log("Autocomplete status:", autoData?.status);
    console.log("Found predictions:", autoData?.predictions?.length);
    console.log("First suggestion:", autoData?.predictions?.[0]?.description);
  }

  // 2. Place Details
  const placeId = autoData?.predictions?.[0]?.place_id;
  if (placeId) {
    console.log(`\n2. Testing Place Details for place_id '${placeId}'...`);
    const { data: detailData, error: detailErr } = await client.functions.invoke("maps", {
      body: { action: "place-details", placeid: placeId, sessiontoken: "sess-123" },
    });
    if (detailErr) {
      console.error("Place details failed:", detailErr);
    } else {
      console.log("Place details status:", detailData?.status);
      console.log("Place Name:", detailData?.result?.name);
      console.log("Formatted Address:", detailData?.result?.formatted_address);
      console.log("Location:", detailData?.result?.geometry?.location);
    }
  }

  // 3. Error Handling - Missing input
  console.log("\n3. Testing Error Handling on Missing input...");
  const { data: errData, error: expectedErr } = await client.functions.invoke("maps", {
    body: { action: "autocomplete", input: "" },
  });
  if (expectedErr) {
    let message = expectedErr.message;
    if (expectedErr.context) {
      const body = await expectedErr.context.json();
      message = body?.error || body?.message || message;
    }
    console.log("Successfully extracted detailed error message:", message);
  }
}

testFullFlow();
