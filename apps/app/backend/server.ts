import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load .env from the monorepo root (3 levels up from apps/app/backend/)
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local"), override: true });
// Also attempt apps/app/.env and .env.local as local overrides
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });
import { env } from "./config/env";
import express from "express";
import http from "http";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import dbRouter from "./routes/db";
import aiRouter from "./routes/ai";
import paymentsRouter from "./routes/payments";
import adminRouter from "./routes/admin";
import { createProxyMiddleware } from "http-proxy-middleware";


const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Lazy initialization of Gemini client helper
let aiClient: GoogleGenAI | null = null;
export function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Lazy initialization of Supabase client helper
let supabaseClient: any = null;
export function getSupabaseClient(token?: string) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_KEY;

  if (token) {
    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
  }

  if (!supabaseClient) {
    if (url && key) {
      supabaseClient = createClient(url, key);
    }
  }
  return supabaseClient;
}

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export function normalizePhone(phone: string) {
  return String(phone).replace(/[^0-9+]/g, "");
}

export async function findUserByPhone(client: any, phone: string) {
  const normalizedPhone = normalizePhone(phone).replace(/[^0-9]/g, "");
  const { data, error } = await client.from("users").select("*");
  if (error) {
    throw error;
  }
  if (!Array.isArray(data)) {
    return null;
  }
  return data.find((row: any) => {
    if (!row.phone_number) {
      return false;
    }
    const rowPhone = String(row.phone_number).replace(/[^0-9]/g, "");
    return rowPhone === normalizedPhone;
  }) || null;
}

async function startServer() {
  const app = express();

  // Supabase Local Gateway Reverse Proxy
  // Forwards Supabase Auth, REST, Storage, Realtime, and Functions traffic directly
  // to the local Kong gateway (port 54321). This allows mobile devices connecting via ngrok
  // to reach the local Supabase stack seamlessly without needing a separate ngrok tunnel.
  // Mounted BEFORE express.json() to prevent request body consumption on POST/PUT requests.
  const supabaseGatewayTarget = "http://127.0.0.1:54321";
  const supabaseProxy = createProxyMiddleware({
    target: supabaseGatewayTarget,
    changeOrigin: true,
    xfwd: true,
  });

  // Preserve full URL paths (/auth/v1, /rest/v1, etc.) without Express stripping the prefix
  app.use((req, res, next) => {
    if (
      req.url.startsWith("/auth/v1") ||
      req.url.startsWith("/rest/v1") ||
      req.url.startsWith("/storage/v1") ||
      req.url.startsWith("/realtime/v1") ||
      req.url.startsWith("/functions/v1")
    ) {
      return supabaseProxy(req, res, next);
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));

  // 1. API ROUTES FIRST
  
  // Checks system config status for Supabase integration dashboard
  app.get("/api/config-status", (req, res) => {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_KEY;
    res.json({
      configured: !!(url && key),
      supabase_url: url,
      supabase_has_key: !!key
    });
  });

  app.use("/api/db", dbRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/admin", adminRouter);


  // Health check API
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  const httpServer = http.createServer(app);

  // Support WebSocket upgrade for Supabase Realtime subscriptions
  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/realtime/v1")) {
      (supabaseProxy as any).upgrade?.(req, socket, head);
    }
  });

  // 2. VITE MIDDLEWARE (DEV) OR STATIC CHASSIS (PROD)
  if (env.NODE_ENV !== "production") {
    // In development mode, serve an unregistering service worker script for /sw.js.
    // It silently unregisters any active service worker and clears caches without forcing
    // disruptive page reload loops while modules are in flight.
    app.get(["/sw.js", "/sw.js.map"], (req, res) => {
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.send(`
        self.addEventListener('install', () => self.skipWaiting());
        self.addEventListener('activate', (event) => {
          event.waitUntil(
            self.registration.unregister()
              .then(() => self.caches.keys())
              .then((keys) => Promise.all(keys.map((k) => self.caches.delete(k))))
          );
        });
      `);
    });

    // Disable HTTP browser caching for dev responses
    app.use((req, res, next) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      next();
    });

    const vite = await createViteServer({
      configFile: path.resolve(__dirname, "../vite.config.ts"),
      root: path.resolve(__dirname, ".."),
      server: { 
        middlewareMode: true,
        host: "0.0.0.0",
        hmr: {
          server: httpServer,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Seeding default canonical users into Supabase on startup if they don't exist
  async function seedDefaultUsers() {
    const client = getSupabaseClient();
    if (!client) {
      console.log("[Supabase Seed] Supabase client not configured yet.");
      return;
    }

    const defaultUsers = [
      { name: "Thilaka", phone: "9901598018" },
      { name: "Maanas", phone: "7892436109" },
      { name: "Bhaavya", phone: "7892186131" },
      { name: "Renjith", phone: "8073466546" },
    ];

    console.log("[Supabase Seed] Checking and seeding default users...");
    for (const item of defaultUsers) {
      try {
        const existing = await findUserByPhone(client, item.phone);
        if (!existing) {
          const userId = crypto.randomUUID();
          const username = item.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "").slice(0, 15) || `user${Math.floor(Math.random() * 9000 + 1000)}`;
          const cleanPhone = normalizePhone(item.phone);

          const newUser = {
            user_id: userId,
            username,
            full_name: item.name,
            phone_number: cleanPhone,
            profile_photo: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(item.name)}`,
            bio: "Always spontaneous, never planless.",
            college_or_work: "SRM Chennai",
            created_at: new Date().toISOString(),
            wallet_balance: 0,
            active_status: true,
          };

          const { error } = await client.from("users").insert([newUser]);
          if (error) {
            console.error(`[Supabase Seed] Failed to seed ${item.name}:`, error.message);
          } else {
            console.log(`[Supabase Seed] Seeded user ${item.name} successfully!`);
          }
        } else {
          console.log(`[Supabase Seed] User ${item.name} already exists. Skipping.`);
        }
      } catch (e: any) {
        console.error(`[Supabase Seed] Exception seeding ${item.name}:`, e.message || e);
      }
    }
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Planless Fullstack App server booted on http://localhost:${PORT}`);
    // seedDefaultUsers();
  });
}

startServer();