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

const supabase = createClient(url, anonKey);

async function testRealtime() {
  console.log("Testing local Realtime channel connection...");
  const channel = supabase.channel("room-test");

  const status = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve("TIMEOUT"), 5000);
    channel.subscribe((status) => {
      console.log("Realtime subscription status:", status);
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve("SUBSCRIBED");
      }
    });
  });

  await channel.unsubscribe();
  if (status === "SUBSCRIBED") {
    console.log("SUCCESS: Realtime channel connected locally!");
  } else {
    console.error("FAILED: Realtime status:", status);
  }
}

testRealtime().catch(console.error);
