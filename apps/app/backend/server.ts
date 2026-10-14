import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load .env from monorepo root whether run directly via tsx (from apps/app/backend) or via dist/server.mjs (from apps/app/dist)
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env.local"), override: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
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
import moviesRouter from "./routes/movies";
import { createProxyMiddleware } from "http-proxy-middleware";
import fs from "fs";
import { spawn, type ChildProcess } from "child_process";
import { getAppleAppSiteAssociation, getAndroidAssetLinks } from "./config/deepLinkConfig";


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
  app.use("/api/movies", moviesRouter);


  // Deep linking endpoints for iOS Universal Links and Android App Links
  app.get(["/.well-known/apple-app-site-association", "/apple-app-site-association"], (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(getAppleAppSiteAssociation());
  });

  app.get("/.well-known/assetlinks.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(getAndroidAssetLinks());
  });

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
    // In development mode, serve a lean Service Worker that activates immediately
    // without failing Workbox precache checks on non-existent production asset hashes,
    // while maintaining full background Web Push notification and click handling.
    app.get(["/manifest.webmanifest", "/manifest.json"], (req, res) => {
      res.setHeader("Content-Type", "application/manifest+json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.sendFile(path.resolve(process.cwd(), "apps/app/public/manifest.webmanifest"));
    });

    app.get(["/sw.js", "/sw.js.map"], (req, res) => {
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Service-Worker-Allowed", "/");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.send(`
// Planless Development Service Worker (Web Push Enabled)
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch listener: Required for Chromium / Android PWA installability criteria
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Helper to calculate total unreads across all active conversation notifications and update app badge
async function updateAppBadge() {
  if (!('setAppBadge' in self.navigator)) return;
  try {
    const activeNotifications = await self.registration.getNotifications();
    const chatNotifs = activeNotifications.filter(
      (n) => n.tag && n.tag.startsWith('plan-chat-')
    );
    const totalUnreads = chatNotifs.reduce((sum, n) => {
      const count = typeof n.data?.unreadCount === 'number' ? n.data.unreadCount : 1;
      return sum + count;
    }, 0);
    if (totalUnreads > 0) {
      await self.navigator.setAppBadge(totalUnreads);
    } else if ('clearAppBadge' in self.navigator) {
      await self.navigator.clearAppBadge();
    }
  } catch {}
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // When a user opens and reads a plan chat, immediately clear that plan's notification
  if (event.data && event.data.type === 'CLEAR_CHAT_NOTIFICATION' && event.data.planId) {
    const planIdToClear = event.data.planId;
    event.waitUntil(
      (async () => {
        try {
          const activeNotifications = await self.registration.getNotifications();
          const targetTag = \`plan-chat-\${planIdToClear}\`;
          for (const notif of activeNotifications) {
            if (
              notif.tag === targetTag ||
              (notif.data?.planId === planIdToClear && notif.tag.startsWith('plan-chat-'))
            ) {
              notif.close();
            }
          }
          await updateAppBadge();
        } catch (err) {
          console.warn('[SW] Error clearing chat notification:', err);
        }
      })()
    );
  }
});

// Background Push Notification Event
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'Planless',
      body: event.data.text() || 'New update available',
    };
  }

  const notificationType = payload.notificationType || payload.data?.notificationType || '';
  const tag = payload.tag || 'planless-notification';

  event.waitUntil(
    (async () => {
      const origin = (self.location && self.location.origin) ? self.location.origin : '';
      const badge = origin ? \`\${origin}/favicon-32x32.png\` : '/favicon-32x32.png';

      async function verifyAndResolveIcon(iconUrl) {
        const fallbackAsset = origin ? \`\${origin}/assets/planimagedefault.webp\` : '/assets/planimagedefault.webp';
        if (!iconUrl || typeof iconUrl !== 'string') {
          return fallbackAsset;
        }

        let finalUrl = iconUrl;
        if (origin) {
          if (finalUrl.startsWith('/')) {
            try { finalUrl = new URL(finalUrl, origin).href; } catch {}
          } else {
            try {
              const parsed = new URL(finalUrl);
              if (parsed.origin !== origin && (parsed.pathname.startsWith('/assets/') || parsed.pathname.startsWith('/storage/'))) {
                finalUrl = \`\${origin}\${parsed.pathname}\${parsed.search}\`;
              }
            } catch {}
          }
        }

        try {
          const res = await fetch(finalUrl, { method: 'HEAD', cache: 'force-cache' });
          if (!res.ok) {
            console.warn(\`[SW] Notification icon failed check (\${res.status}), using fallback:\`, finalUrl);
            return fallbackAsset;
          }
        } catch {
          try {
            await fetch(finalUrl, { mode: 'no-cors', cache: 'force-cache' });
          } catch {
            console.warn('[SW] Notification icon network error, using fallback:', finalUrl);
            return fallbackAsset;
          }
        }

        return finalUrl;
      }

      // =========================================================================
      // SCENARIO 1: PLAN INVITATIONS (Must NEVER be merged with chat messages)
      // =========================================================================
      if (notificationType === 'PLAN_INVITATION' || tag.startsWith('plan-invite-')) {
        const title = payload.title || 'Planless';
        const body = payload.body || '';
        const icon = await verifyAndResolveIcon(payload.icon || payload.data?.avatar);
        const url = payload.data?.url || payload.url || (payload.data?.planId ? \`/plans?id=\${payload.data.planId}\` : '/');

        const now = Date.now();
        let existingInvite;
        try {
          const activeNotifications = await self.registration.getNotifications();
          existingInvite = activeNotifications.find((n) => n.tag === tag);
        } catch {}

        const lastAlertTime = existingInvite?.data?.lastAlertTime || 0;
        const isRapid = existingInvite !== undefined && (now - lastAlertTime < 8000);
        const shouldRenotify = !isRapid;

        const inviteOptions = {
          body,
          icon,
          badge,
          tag,
          timestamp: payload.timestamp || now,
          renotify: shouldRenotify,
          data: {
            url,
            planId: payload.data?.planId,
            notificationType: 'PLAN_INVITATION',
            ...payload.data,
            receivedAt: now,
            lastAlertTime: shouldRenotify ? now : lastAlertTime,
          },
          ...(shouldRenotify ? { vibrate: [100, 50, 100] } : {}),
        };

        await self.registration.showNotification(title, inviteOptions);
        return;
      }

      // =========================================================================
      // SCENARIO 2: CHAT MESSAGES (Conversation-Level Notifications)
      // =========================================================================
      if (
        notificationType === 'CHAT_MESSAGE' ||
        tag.startsWith('plan-chat-')
      ) {
        const pId = payload.data?.planId || (tag.startsWith('plan-chat-') ? tag.replace('plan-chat-', '') : '');
        const conversationTag = pId ? \`plan-chat-\${pId}\` : (tag.startsWith('plan-chat-') ? tag : 'plan-chat-default');

        // Check active notifications currently sitting in the Android notification shade
        let existingNotif;
        try {
          const activeNotifications = await self.registration.getNotifications();
          existingNotif = activeNotifications.find((n) => n.tag === conversationTag);
        } catch (e) {
          console.warn('[SW] Could not read active notifications:', e);
        }

        // Stale push check: Ignore delayed pushes that have an older timestamp than existing notification
        if (
          existingNotif &&
          payload.timestamp &&
          existingNotif.data?.receivedAt &&
          payload.timestamp < existingNotif.data.receivedAt
        ) {
          console.log('[SW] Stale push ignored for conversation:', pId);
          return;
        }

        const unreadCount = typeof payload.data?.unreadCount === 'number'
          ? payload.data.unreadCount
          : (Array.isArray(payload.data?.messages) ? payload.data.messages.length : 1);

        // If unread count is 0 or less, dismiss this conversation's notification and update badge
        if (unreadCount <= 0) {
          if (existingNotif) {
            existingNotif.close();
          }
          await updateAppBadge();
          return;
        }

        // Anti-spam alert cooldown: if this conversation alerted recently (< 8000ms), update silently in place
        const now = Date.now();
        const lastAlertTime = existingNotif?.data?.lastAlertTime || 0;
        const isRapidMessage = existingNotif !== undefined && (now - lastAlertTime < 8000);
        const shouldRenotify = !isRapidMessage;
        const nextAlertTime = shouldRenotify ? now : lastAlertTime;

        const planTitle = payload.data?.planTitle || 'Plan';
        let finalTitle = payload.title || '';
        let finalBody = payload.body || '';

        // Fallback title formatting if missing or generic
        if (!finalTitle || finalTitle === 'Planless') {
          finalTitle = unreadCount === 1
            ? \`\${planTitle} • 1 unread message\`
            : \`\${planTitle} • \${unreadCount} unread messages\`;
        }

        // Fallback body formatting if missing but messages exist (compact 5 recent messages)
        if (!finalBody && Array.isArray(payload.data?.messages) && payload.data.messages.length > 0) {
          if (unreadCount === 1) {
            const m = payload.data.messages[0];
            finalBody = \`\${m.senderName || 'Friend'}: \${m.content || ''}\`;
          } else {
            finalBody = payload.data.messages
              .slice(-5)
              .map((m) => \`\${m.senderName || 'Friend'}: \${m.content || ''}\`)
              .join('\\n');
          }
        }

        const finalIcon = await verifyAndResolveIcon(payload.icon || payload.data?.avatar);
        const finalUrl = payload.data?.url || (pId ? \`/chats?id=\${pId}\` : '/chats');
        const actions = pId
          ? [
              {
                action: \`open_chat_\${pId}\`,
                title: 'Open Chat',
              },
            ]
          : [];

        const chatOptions = {
          body: finalBody,
          icon: finalIcon,
          badge,
          tag: conversationTag,
          timestamp: payload.timestamp || now,
          renotify: shouldRenotify,
          data: {
            url: finalUrl,
            planId: pId,
            planTitle,
            unreadCount,
            notificationType: 'CHAT_MESSAGE',
            messages: payload.data?.messages || [],
            receivedAt: now,
            lastAlertTime: nextAlertTime,
          },
          ...(shouldRenotify ? { vibrate: [100, 50, 100] } : {}),
          actions,
        };

        await self.registration.showNotification(finalTitle, chatOptions);
        await updateAppBadge();
        return;
      }

      // =========================================================================
      // SCENARIO 3: FALLBACK NOTIFICATION (Plan Lifecycle, Participation, Friend Requests)
      // =========================================================================
      const defaultTitle = payload.title || 'Planless';
      const defaultBody = payload.body || '';
      const defaultIcon = await verifyAndResolveIcon(payload.icon || payload.data?.avatar);
      const finalUrl = payload.data?.url || payload.url || (payload.data?.planId ? \`/plans?id=\${payload.data.planId}\` : '/');

      const now = Date.now();
      let existingFallback;
      try {
        const activeNotifications = await self.registration.getNotifications();
        existingFallback = activeNotifications.find((n) => n.tag === tag);
      } catch {}

      const lastAlertTime = existingFallback?.data?.lastAlertTime || 0;
      const isRapid = existingFallback !== undefined && (now - lastAlertTime < 8000);
      const shouldRenotify = !isRapid;

      await self.registration.showNotification(defaultTitle, {
        body: defaultBody,
        icon: defaultIcon,
        badge,
        tag,
        timestamp: payload.timestamp || now,
        renotify: shouldRenotify,
        data: {
          url: finalUrl,
          notificationType,
          ...payload.data,
          receivedAt: now,
          lastAlertTime: shouldRenotify ? now : lastAlertTime,
        },
        ...(shouldRenotify ? { vibrate: [100, 50, 100] } : {}),
      });
    })()
  );
});

// Notification Click Handler (focus or open target URL)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url = event.notification.data?.url || '/';
  if (event.action && event.action.startsWith('open_chat_')) {
    const planId = event.action.replace('open_chat_', '');
    url = \`/chats?id=\${planId}\`;
  } else if (
    event.notification.data?.notificationType === 'CHAT_MESSAGE' &&
    event.notification.data?.planId &&
    (!url || url === '/chats')
  ) {
    url = \`/chats?id=\${event.notification.data.planId}\`;
  } else if (
    event.notification.data?.notificationType !== 'CHAT_MESSAGE' &&
    event.notification.data?.planId &&
    (!url || url === '/')
  ) {
    url = \`/plans?id=\${event.notification.data.planId}\`;
  }

  event.waitUntil(
    (async () => {
      await updateAppBadge();
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && url) {
            return client.navigate(url);
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })()
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification dismissed by user:', event.notification.tag);
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
    const distPath = fs.existsSync(path.join(process.cwd(), "dist", "index.html"))
      ? path.join(process.cwd(), "dist")
      : path.resolve(__dirname, "../dist");

    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          // Never cache the service worker, HTML files, or webmanifest so browser can always detect updates
          if (
            filePath.endsWith("sw.js") ||
            filePath.endsWith("index.html") ||
            filePath.endsWith(".webmanifest") ||
            filePath.endsWith("version.json")
          ) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            res.setHeader("Pragma", "no-cache");
            res.setHeader("Expires", "0");
          } else if (filePath.includes("/assets/")) {
            // Hashed assets can be safely cached long-term
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          } else if (
            filePath.endsWith(".ico") ||
            filePath.endsWith(".png") ||
            filePath.endsWith(".jpg") ||
            filePath.endsWith(".jpeg") ||
            filePath.endsWith(".webp") ||
            filePath.endsWith(".svg") ||
            filePath.endsWith(".woff2") ||
            filePath.endsWith(".otf") ||
            filePath.endsWith(".ttf")
          ) {
            // Standard cache policy for non-hashed static icons and media
            res.setHeader("Cache-Control", "public, max-age=86400");
          }
        },
      })
    );

    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
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
    if (env.NODE_ENV !== "production") {
      ensureNgrokTunnel(PORT);
      ensureEdgeFunctions();
    }
  });
}

let edgeFunctionsProcess: ChildProcess | null = null;

async function ensureEdgeFunctions() {
  if (process.env.NODE_ENV === "production") return;
  // Check if edge functions are already serving on local Supabase Kong gateway
  try {
    const ping = await fetch("http://127.0.0.1:54321/functions/v1/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "PING" }),
    });
    if (ping.status === 200) {
      console.log("⚡ [Supabase] Edge functions (send-push, maps) active on local port 54321");
      return;
    }
  } catch {}

  // Spawn local Supabase Edge Functions runtime
  try {
    console.log("⚡ [Supabase] Spawning local Edge Functions runtime...");
    edgeFunctionsProcess = spawn("npx", ["supabase", "functions", "serve", "--env-file", "./supabase/functions/.env"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${process.env.PATH || ""}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
      },
    });

    edgeFunctionsProcess.stderr?.on("data", (chunk: Buffer) => {
      const msg = chunk.toString();
      if (msg.includes("error") || msg.includes("Error")) {
        console.warn(`[Supabase Functions] ${msg.trim()}`);
      }
    });

    edgeFunctionsProcess.on("exit", () => {
      edgeFunctionsProcess = null;
    });

    const cleanup = () => {
      if (edgeFunctionsProcess && !edgeFunctionsProcess.killed) {
        try {
          edgeFunctionsProcess.kill("SIGTERM");
        } catch {}
      }
    };
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
    process.once("exit", cleanup);
  } catch (err: any) {
    console.warn(`[Supabase Functions] Could not spawn local functions: ${err.message}`);
  }
}

let ngrokProcess: ChildProcess | null = null;

async function getNgrokTunnelUrl(): Promise<string | null> {
  for (const p of [4040, 4041]) {
    try {
      const res = await fetch(`http://127.0.0.1:${p}/api/tunnels`);
      if (res.ok) {
        const data: any = await res.json();
        const tunnel = data.tunnels?.find((t: any) => t.proto === "https") || data.tunnels?.[0];
        if (tunnel?.public_url) return tunnel.public_url;
      }
    } catch {}
  }
  return null;
}

async function ensureNgrokTunnel(port: number) {
  if (process.env.DISABLE_NGROK === "true") return;

  // 1. Check if ngrok is already running on 4040/4041
  let url = await getNgrokTunnelUrl();
  if (url) {
    console.log(`\n🚀 [ngrok] Public tunnel active: ${url}\n`);
    return;
  }


  // 2. Spawn ngrok process with explicit authtoken if provided
  try {
    const authtoken = process.env.NGROK_AUTHTOKEN;
    const ngrokArgs = ["http", String(port)];
    if (authtoken) {
      ngrokArgs.push("--authtoken", authtoken);
    }

    const ngrokBin = process.env.NGROK_BIN || "ngrok";
    ngrokProcess = spawn(ngrokBin, ngrokArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${process.env.PATH || ""}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
      },
    });

    ngrokProcess.stderr?.on("data", (chunk: Buffer) => {
      const msg = chunk.toString();
      if (msg.includes("ERR_") || msg.toLowerCase().includes("authentication failed")) {
        console.warn(`[ngrok] ${msg.trim()}`);
      }
    });

    ngrokProcess.on("error", (err) => {
      console.warn(`[ngrok] Could not launch ngrok: ${err.message}`);
    });

    ngrokProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.warn(`[ngrok] Process exited with code ${code}`);
      }
      ngrokProcess = null;
    });

    const cleanup = () => {
      if (ngrokProcess && !ngrokProcess.killed) {
        try {
          ngrokProcess.kill("SIGTERM");
        } catch {}
      }
    };
    process.once("SIGINT", () => {
      cleanup();
      process.exit(0);
    });
    process.once("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });
    process.once("exit", cleanup);

    // 3. Poll for the tunnel URL up to 10 seconds
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      url = await getNgrokTunnelUrl();
      if (url) {
        console.log(`\n🚀 [ngrok] Public tunnel active: ${url}\n`);
        return;
      }
    }
    console.warn("[ngrok] Tunnel started but public URL not resolved yet. Check http://127.0.0.1:4040");
  } catch (err: any) {
    console.warn(`[ngrok] Failed to launch ngrok: ${err.message}`);
  }
}

startServer();