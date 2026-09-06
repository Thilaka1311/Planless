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

async function runAll() {
  await testUrl("http://127.0.0.1:54321", "Direct Local Kong Gateway");
  await testUrl("http://localhost:3000", "Localhost:3000 Reverse Proxy");
  await testUrl("https://motto-tulip-uniquely.ngrok-free.dev", "Ngrok Tunnel (Mobile Phone)");
}

runAll();
