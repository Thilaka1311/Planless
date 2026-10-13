import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env files before exporting env config
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env.local"), override: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../../../../.env"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../../../../.env.local"), override: true });

export interface BackendEnv {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  GEMINI_API_KEY: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RESEND_API_KEY?: string;
  NODE_ENV?: string;
  GOOGLE_MAPS_API_KEY?: string;
  TMDB_API_KEY?: string;
  TMDB_ACCESS_TOKEN?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
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
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  TMDB_ACCESS_TOKEN: process.env.TMDB_ACCESS_TOKEN,
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
};

