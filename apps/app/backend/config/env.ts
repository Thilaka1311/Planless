import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env files before exporting env config
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../../.env.local"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });

export interface BackendEnv {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  GEMINI_API_KEY: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RESEND_API_KEY?: string;
  NODE_ENV?: string;
  GOOGLE_MAPS_API_KEY?: string;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`CRITICAL STARTUP ERROR: Missing required backend environment variable "${name}".`);
  }
  return value;
}

export const env: BackendEnv = {
  SUPABASE_URL: getRequiredEnv("SUPABASE_URL"),
  SUPABASE_KEY: getRequiredEnv("SUPABASE_KEY"),
  GEMINI_API_KEY: getRequiredEnv("GEMINI_API_KEY"),
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  NODE_ENV: process.env.NODE_ENV,
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
};
