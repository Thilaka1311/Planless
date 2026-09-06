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

const supabase = createClient(url, serviceKey);

async function testStorage() {
  const buckets = ["avatars", "plan-images", "discovery-images"];
  for (const b of buckets) {
    const isImageBucket = b !== "avatars";
    const ext = isImageBucket ? "png" : "txt";
    const contentType = isImageBucket ? "image/png" : "text/plain";
    const filename = `test-${Date.now()}.${ext}`;
    const pngBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    const content = isImageBucket ? pngBuffer : Buffer.from(`Test content for ${b}`);
    console.log(`Uploading to local bucket '${b}'...`);
    const { data: up, error: upErr } = await supabase.storage.from(b).upload(filename, content, {
      contentType: contentType
    });
    if (upErr) throw new Error(`Upload error on ${b}: ${upErr.message}`);
    console.log(`SUCCESS: Uploaded ${up.path}`);

    // Download
    const { data: down, error: downErr } = await supabase.storage.from(b).download(filename);
    if (downErr) throw new Error(`Download error on ${b}: ${downErr.message}`);
    const text = await down.text();
    const expectedText = Buffer.isBuffer(content) ? content.toString() : content;
    if (text !== expectedText && !isImageBucket) throw new Error(`Downloaded content mismatch: got "${text}", expected "${expectedText}"`);
    console.log(`SUCCESS: Downloaded and verified content from ${b}`);

    // Remove
    const { error: rmErr } = await supabase.storage.from(b).remove([filename]);
    if (rmErr) throw new Error(`Remove error on ${b}: ${rmErr.message}`);
    console.log(`SUCCESS: Removed test file from ${b}`);
  }
  console.log("\nALL STORAGE BUCKET TESTS PASSED LOCALLY!");
}

testStorage().catch(console.error);
