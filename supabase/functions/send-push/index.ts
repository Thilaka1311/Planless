import { corsHeaders } from "../maps/shared/cors.ts";
// @ts-ignore
import webpush from "npm:web-push@3.6.7";
// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

declare const Deno: any;

// 1. Initialize VAPID Keys from environment
const VAPID_PUBLIC_KEY =
  Deno.env.get("VAPID_PUBLIC_KEY") ||
  "BP0zSZXwnl0p9_nvQM5Z5w48Klde00b0rGkN84maT_qgnTfH5dJ0WkT3pET6SX5E2ccHNs_0SwStdmcE3EFdAAg";
const VAPID_PRIVATE_KEY =
  Deno.env.get("VAPID_PRIVATE_KEY") ||
  "6BQm3OBw7oCpg7PAri9nhxwRGyS8Wh3vksV0FOvldQI";
const VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") || "mailto:support@planless.life";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// 2. Initialize Supabase Admin client
function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://wecmpncixopetvunkkyd.supabase.co";
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_KEY") ||
    "";
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

interface PushPayload {
  userIds?: string[];
  userId?: string;
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  image?: string;
  avatar?: string;
  inviterId?: string;
  inviterName?: string;
  notificationType?: string;
  planId?: string;
  appUrl?: string;
  testType?: string;
  data?: Record<string, any>;
  action?: string;
  subscription?: any;
  // Database Webhook & Event support
  event?: string;
  record?: any;
  table?: string;
  actorId?: string;
  senderId?: string;
  targetUserId?: string;
  targetUserIds?: string[];
  recipientId?: string;
  requesterId?: string;
  accepterId?: string;
  rsvpStatus?: string;
  previousStatus?: string;
  skipReason?: string;
  attendingUserIds?: string[];
  changes?: {
    dateChanged?: boolean;
    timeChanged?: boolean;
    venueChanged?: boolean;
    newDate?: string;
    newTime?: string;
    newVenue?: string;
    description?: string;
  };
  idempotencyKey?: string;
}

// In-memory idempotency cache (10s TTL for rapid testing and reliable delivery)
const processedEventCache = new Map<string, number>();

function isDuplicateEvent(key: string | undefined): boolean {
  if (!key) return false;
  const now = Date.now();
  const lastTime = processedEventCache.get(key);
  if (lastTime && now - lastTime < 10000) {
    return true;
  }
  processedEventCache.set(key, now);
  // Prune entries older than 1 minute
  if (processedEventCache.size > 500) {
    for (const [k, t] of processedEventCache.entries()) {
      if (now - t > 60000) processedEventCache.delete(k);
    }
  }
  return false;
}


/**
 * Resolves a user's avatar image into an absolute, device-accessible HTTPS URL.
 * Hierarchy:
 * 1. Fully-qualified HTTPS URL
 * 2. Supabase Storage bucket 'avatars' (e.g. avatars/{userId}/avatar.webp or {userId}/avatar)
 * 3. Default avatar fallback
 */
function resolveUserAvatarUrl(
  profilePhotoPath: string | null | undefined,
  publicBaseUrl: string
): string | null {
  if (!profilePhotoPath || !profilePhotoPath.trim()) return null;
  const raw = profilePhotoPath.trim();

  // 1. Fully-qualified external URL
  if (raw.startsWith("https://") || raw.startsWith("http://")) {
    return raw;
  }

  // 2. Supabase Storage bucket path in 'avatars'
  const remoteSupabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const isRemoteSupabase =
    remoteSupabaseUrl.startsWith("https://") &&
    !remoteSupabaseUrl.includes("127.0.0.1") &&
    !remoteSupabaseUrl.includes("localhost") &&
    !remoteSupabaseUrl.includes("kong");
  const storageHost = isRemoteSupabase ? remoteSupabaseUrl : publicBaseUrl;

  const objectKey = raw.startsWith("avatars/")
    ? raw.slice("avatars/".length)
    : raw;

  return `${storageHost}/storage/v1/object/public/avatars/${objectKey}`;
}

/**
 * Resolves a plan's actual image into an absolute, device-accessible HTTPS URL.
 * Hierarchy:
 * 1. Plan's actual uploaded cover image (cover_image or cover_card_image)
 * 2. Existing valid venue image (Google Places photo proxy)
 * 3. Contextual category artwork fallback
 */
function resolvePlanImageUrl(plan: any, publicBaseUrl: string): string | null {
  if (!plan) return null;
  const rawCover = (plan.cover_image || plan.cover_card_image || "").trim();
  const remoteSupabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const isRemoteSupabase =
    remoteSupabaseUrl.startsWith("https://") &&
    !remoteSupabaseUrl.includes("127.0.0.1") &&
    !remoteSupabaseUrl.includes("localhost") &&
    !remoteSupabaseUrl.includes("kong");
  const storageHost = isRemoteSupabase ? remoteSupabaseUrl : publicBaseUrl;

  // 1. Prefer actual uploaded plan cover image
  if (rawCover) {
    // 1A. Already a fully-qualified HTTP/HTTPS URL (e.g. TMDB movie poster, external CDN)
    if (rawCover.startsWith("https://") || rawCover.startsWith("http://")) {
      return rawCover;
    }

    // 1B. Supabase Storage bucket path in 'plan-images'
    if (
      rawCover.startsWith("plan-images/") ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(rawCover) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i.test(rawCover)
    ) {
      const objectKey = rawCover.startsWith("plan-images/")
        ? rawCover.slice("plan-images/".length)
        : rawCover;
      return `${storageHost}/storage/v1/object/public/plan-images/${objectKey}`;
    }

    // 2. Existing valid venue image (Google Places proxy)
    if (rawCover.startsWith("/functions/v1/maps")) {
      return `${storageHost}${rawCover}`;
    }

    // 1C. Static asset path mapped to public assets
    if (rawCover.startsWith("/assets/") || rawCover.startsWith("/src/assets/")) {
      const lower = rawCover.toLowerCase();
      if (lower.includes("sport") || lower.includes("football") || lower.includes("badminton")) {
        return `${publicBaseUrl}/assets/categories/sports.png`;
      }
      if (lower.includes("movie") || lower.includes("cinema")) {
        return `${publicBaseUrl}/assets/categories/movies.png`;
      }
      if (lower.includes("dining") || lower.includes("restaurant") || lower.includes("food")) {
        return `${publicBaseUrl}/assets/categories/dining.png`;
      }
      if (lower.includes("activity") || lower.includes("game") || lower.includes("bowling")) {
        return `${publicBaseUrl}/assets/categories/activity.png`;
      }
    }
  }

  // 3. Category image fallback (Contextual plan category artwork)
  const category = (plan.category || "").toLowerCase().trim();
  if (
    category === "sports" ||
    category === "sport" ||
    category === "football" ||
    category === "badminton"
  ) {
    return `${publicBaseUrl}/assets/categories/sports.png`;
  }
  if (
    category === "movies" ||
    category === "movie" ||
    category === "cinema"
  ) {
    return `${publicBaseUrl}/assets/categories/movies.png`;
  }
  if (
    category === "dining" ||
    category === "restaurants" ||
    category === "restaurant" ||
    category === "cafe" ||
    category === "food"
  ) {
    return `${publicBaseUrl}/assets/categories/dining.png`;
  }
  if (
    category === "activities" ||
    category === "activity" ||
    category === "recreation" ||
    category === "games" ||
    category === "bowling"
  ) {
    return `${publicBaseUrl}/assets/categories/activity.png`;
  }

  // Fall back gracefully to app icon: do not display Planless logo as large image if plan has no artwork
  return null;
}

/**
 * Formats a single chat message preview concisely.
 */
function formatMessagePreview(msg: any): string {
  if (msg.message_type === "cost") {
    try {
      const parsed = typeof msg.content === "string" ? JSON.parse(msg.content) : msg.content;
      if (parsed?.title) {
        return `Added expense: ${parsed.title}${parsed.amount ? ` (₹${parsed.amount})` : ""}`;
      }
    } catch {}
    return "Added an expense to the plan";
  }
  if (msg.message_type === "poll") {
    try {
      const parsed = typeof msg.content === "string" ? JSON.parse(msg.content) : msg.content;
      if (parsed?.question) {
        return `Created poll: ${parsed.question}`;
      }
    } catch {}
    return "Created a new poll";
  }
  const raw = (msg.content || "").trim();
  if (!raw) return "Sent a message";
  return raw.length > 90 ? `${raw.slice(0, 87)}...` : raw;
}

interface FormattedChatPush {
  title: string;
  body: string;
  icon: string;
  badge: string;
  tag: string;
  timestamp: number;
  notificationType?: string;
  data: Record<string, any>;
}

/**
 * Builds a WhatsApp-style multi-message notification payload tailored for a specific recipient.
 * Excludes any messages sent by the recipient themself.
 */
function formatChatPayloadForRecipient({
  recipientUserId,
  planTitle,
  planId,
  recentMessages,
  senderMap,
  publicBaseUrl,
  tag,
  url,
  extraData,
}: {
  recipientUserId: string;
  planTitle: string;
  planId: string;
  recentMessages: any[];
  senderMap: Map<string, { name: string; avatarUrl: string }>;
  publicBaseUrl: string;
  tag: string;
  url: string;
  extraData?: Record<string, any>;
}): FormattedChatPush | null {
  // 1. Exclude messages sent by this recipient so they don't receive their own text
  const eligible = recentMessages.filter((m) => m.sender_id !== recipientUserId);
  if (eligible.length === 0) {
    return null;
  }

  const defaultAvatar = `${publicBaseUrl}/assets/default_avatar.webp`;
  const appBadge = `${publicBaseUrl}/favicon-32x32.png`;

  // Start with up to 8 recent messages (sufficient for full Android expanded shade, removing 4-message cap)
  let messagesToShow = eligible.slice(-8);

  const buildPayload = (msgs: any[]): FormattedChatPush => {
    const latestMsg = msgs[msgs.length - 1];
    const latestSenderInfo = senderMap.get(latestMsg.sender_id) || { name: "Friend", avatarUrl: defaultAvatar };
    const resolvedIcon = latestSenderInfo.avatarUrl || defaultAvatar;

    // Compact message items: omit redundant per-message avatar URLs and timestamps to stay safely within FCM 4KB limit
    const formattedMessages = msgs.map((m) => {
      const sInfo = senderMap.get(m.sender_id) || { name: "Friend", avatarUrl: defaultAvatar };
      return {
        id: m.id,
        senderName: sInfo.name,
        content: formatMessagePreview(m),
      };
    });

    let resolvedTitle: string;
    let resolvedBody: string;

    if (msgs.length === 1) {
      const singleMsg = msgs[0];
      const sInfo = senderMap.get(singleMsg.sender_id) || { name: "Friend", avatarUrl: defaultAvatar };
      const text = formatMessagePreview(singleMsg);
      resolvedTitle = `${sInfo.name} • ${planTitle}`;
      resolvedBody = text;
    } else {
      resolvedTitle = `${planTitle} • ${msgs.length} messages`;
      const lines = msgs.map((m) => {
        const sInfo = senderMap.get(m.sender_id) || { name: "Friend", avatarUrl: defaultAvatar };
        const text = formatMessagePreview(m);
        const sName = sInfo.name.length > 20 ? `${sInfo.name.slice(0, 19)}…` : sInfo.name;
        return `${sName}: ${text}`;
      });
      resolvedBody = lines.join("\n");
    }

    return {
      title: resolvedTitle,
      body: resolvedBody,
      icon: resolvedIcon,
      badge: appBadge,
      tag: "plan-chats",
      timestamp: Date.now(),
      notificationType: "CHAT_MESSAGE",
      data: {
        url,
        planId,
        notificationType: "CHAT_MESSAGE",
        avatar: resolvedIcon,
        ...extraData,
        groups: {
          [planId]: {
            planId,
            planTitle,
            messages: formattedMessages,
            latestAvatar: resolvedIcon,
          },
        },
      },
    };
  };

  let candidate = buildPayload(messagesToShow);

  // Dynamic payload size guard: FCM limit is 4096 bytes. Ensure unencrypted JSON stays safely under 3072 bytes.
  while (messagesToShow.length > 2 && new TextEncoder().encode(JSON.stringify(candidate)).length > 3072) {
    messagesToShow = messagesToShow.slice(1);
    candidate = buildPayload(messagesToShow);
  }

  return candidate;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const payload: PushPayload = await req.json().catch(() => ({}));

    // Resolve public HTTPS base URL accessible from Android devices
    const originHeader = req.headers.get("origin") || req.headers.get("referer");
    let publicBaseUrl = (payload.appUrl || originHeader || "").trim();
    if (publicBaseUrl) {
      try {
        publicBaseUrl = new URL(publicBaseUrl).origin;
      } catch {
        publicBaseUrl = "";
      }
    }
    // If empty or local, default to active public Cloudflare tunnel
    if (!publicBaseUrl || publicBaseUrl.includes("localhost") || publicBaseUrl.includes("127.0.0.1")) {
      publicBaseUrl = Deno.env.get("PUBLIC_BASE_URL") || "https://disclose-purchasing-unfortunately-comics.trycloudflare.com";
    }

    // SCENARIO 1: Automated Scheduled Reminders Check (Disabled per requirement)
    if (payload.action === "check-reminders") {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Plan Reminder (2-hour) push notification flow disabled",
          totalRemindersSent: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let targetUserIds: string[] = [];
    let title = payload.title || "Planless";
    let body = payload.body || "You have a new update";
    let url = payload.url || "/";
    let tag = payload.tag || "planless-notification";
    let planId = payload.planId || null;
    let imageUrl: string | null = payload.image || null;
    let avatarUrl: string | null = payload.avatar || null;
    let notificationType = payload.notificationType || "PLAN_REMINDER";
    let chatContext: {
      planTitle: string;
      planId: string;
      recentMessages: any[];
      senderMap: Map<string, { name: string; avatarUrl: string }>;
      tag: string;
      url: string;
    } | null = null;

    // Check idempotency key if provided, or construct default idempotency key for state-changing events
    const effectiveIdempotencyKey = payload.idempotencyKey || (
      payload.event
        ? `${payload.event}:${payload.planId || ""}:${payload.actorId || payload.userId || ""}:${payload.targetUserId || ""}:${payload.rsvpStatus || ""}`
        : undefined
    );
    if (payload.action !== "test" && effectiveIdempotencyKey && isDuplicateEvent(effectiveIdempotencyKey)) {
      console.log(`[send-push] Duplicate event suppressed by idempotency: ${effectiveIdempotencyKey}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "Duplicate event suppressed by idempotency",
          deliveredCount: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }


    // SCENARIO 1B: Register / Update Push Subscription (Admin service fallback)
    if (payload.action === "register-subscription" && payload.subscription) {
      const sub = payload.subscription;
      const { error: upsertErr } = await supabase
        .from("user_push_subscriptions")
        .upsert(
          {
            user_id: sub.user_id,
            endpoint: sub.endpoint,
            p256dh: sub.p256dh,
            auth: sub.auth,
            user_agent: sub.user_agent,
            platform: sub.platform,
            is_active: true,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" }
        );

      if (upsertErr) {
        return new Response(JSON.stringify({ success: false, error: upsertErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, message: "Subscription registered successfully" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SCENARIO 2: Test Notification (Compact WhatsApp format with sender avatar)
    if (payload.action === "test") {
      const target = payload.userId;
      if (!target) {
        return new Response(JSON.stringify({ error: "Missing userId for test push" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targetUserIds = [target];
      tag = "test-notification";
      url = "/";
      imageUrl = null; // Do not use large banner

      if (payload.testType === "invite") {
        tag = "plan-invite-0623a5f5-37b0-4c54-8a1f-437397fd66f4";
        notificationType = "PLAN_INVITATION";
        url = "/plans?id=0623a5f5-37b0-4c54-8a1f-437397fd66f4";

        const { data: sampleUser } = await supabase
          .from("users")
          .select("full_name, profile_photo_path")
          .not("profile_photo_path", "is", null)
          .limit(1)
          .maybeSingle();

        const inviterName = sampleUser?.full_name || "Maanastej";
        title = `${inviterName} • Sunday Football`;
        body = "Invited you to join • Turf Club";
        avatarUrl =
          resolveUserAvatarUrl(sampleUser?.profile_photo_path, publicBaseUrl) ||
          `${publicBaseUrl}/assets/default_avatar.webp`;
      } else if (payload.testType === "multi-group") {
        // Multi-group test: 4 messages across 2 distinct groups
        tag = "plan-chats";
        url = "/chats";
        notificationType = "CHAT_MESSAGE";

        const mandaadiPlanId = "0623a5f5-37b0-4c54-8a1f-437397fd66f4";
        const smashGuysPlanId = "a5c5ca11-0ebf-4179-9c04-3a38acf19bf1";

        const sampleUserIds = [
          "f69ab638-0873-4b99-9966-42ac497d0bbe", // Maanastej
          "030e6575-709b-4a13-9c92-30f0dac2a877", // Bhaavya
          "06064726-079a-438f-919f-a8be1da70831", // Renjith
          "dc3f841d-cb5c-4f11-97b7-6f81a7114ee8", // Chris
        ];
        const { data: testUsers } = await supabase
          .from("users")
          .select("id, full_name, profile_photo_path")
          .in("id", sampleUserIds);

        const testSenderMap = new Map<string, { name: string; avatarUrl: string }>();
        for (const u of testUsers || []) {
          testSenderMap.set(u.id, {
            name: (u.full_name || "Friend").trim(),
            avatarUrl:
              resolveUserAvatarUrl(u.profile_photo_path, publicBaseUrl) ||
              `${publicBaseUrl}/assets/default_avatar.webp`,
          });
        }

        const defaultAvatar = `${publicBaseUrl}/assets/default_avatar.webp`;
        const mLatestAvatar = testSenderMap.get("030e6575-709b-4a13-9c92-30f0dac2a877")?.avatarUrl || defaultAvatar;
        const sLatestAvatar = testSenderMap.get("dc3f841d-cb5c-4f11-97b7-6f81a7114ee8")?.avatarUrl || defaultAvatar;

        const multiGroups = {
          [mandaadiPlanId]: {
            planId: mandaadiPlanId,
            planTitle: "Mandaadi",
            messages: [
              {
                id: "mandaadi-1",
                senderName: testSenderMap.get("f69ab638-0873-4b99-9966-42ac497d0bbe")?.name || "Maanastej",
                senderAvatar: testSenderMap.get("f69ab638-0873-4b99-9966-42ac497d0bbe")?.avatarUrl || defaultAvatar,
                content: "Are you guys coming to Mandaadi?",
                createdAt: new Date(Date.now() - 120000).toISOString(),
              },
              {
                id: "mandaadi-2",
                senderName: testSenderMap.get("030e6575-709b-4a13-9c92-30f0dac2a877")?.name || "Bhaavya",
                senderAvatar: testSenderMap.get("030e6575-709b-4a13-9c92-30f0dac2a877")?.avatarUrl || defaultAvatar,
                content: "Yes, booked the tickets!",
                createdAt: new Date(Date.now() - 60000).toISOString(),
              },
            ],
            latestAvatar: mLatestAvatar,
          },
          [smashGuysPlanId]: {
            planId: smashGuysPlanId,
            planTitle: "Smash Guys",
            messages: [
              {
                id: "smash-1",
                senderName: testSenderMap.get("06064726-079a-438f-919f-a8be1da70831")?.name || "Renjith",
                senderAvatar: testSenderMap.get("06064726-079a-438f-919f-a8be1da70831")?.avatarUrl || defaultAvatar,
                content: "Court 3 is booked for 7 PM",
                createdAt: new Date(Date.now() - 30000).toISOString(),
              },
              {
                id: "smash-2",
                senderName: testSenderMap.get("dc3f841d-cb5c-4f11-97b7-6f81a7114ee8")?.name || "Chris",
                senderAvatar: testSenderMap.get("dc3f841d-cb5c-4f11-97b7-6f81a7114ee8")?.avatarUrl || defaultAvatar,
                content: "I'll bring extra shuttlecocks",
                createdAt: new Date().toISOString(),
              },
            ],
            latestAvatar: sLatestAvatar,
          },
        };

        title = "4 messages from 2 groups";
        body = "Mandaadi:\n  Maanastej: Are you guys coming to Mandaadi?\n  Bhaavya: Yes, booked the tickets!\n\nSmash Guys:\n  Renjith: Court 3 is booked for 7 PM\n  Chris: I'll bring extra shuttlecocks";
        avatarUrl = sLatestAvatar;
        payload.data = {
          ...payload.data,
          notificationType: "CHAT_MESSAGE",
          groups: multiGroups,
          totalMessages: 4,
          groupCount: 2,
        };
      } else if (payload.testType === "group-chat") {
        // Test 6 messages in the same plan chat (validating cap removal >4)
        const samplePlanTitle = "Mandaadi";
        const samplePlanId = "0623a5f5-37b0-4c54-8a1f-437397fd66f4";
        tag = "plan-chats";
        url = `/chats?id=${samplePlanId}`;
        notificationType = "CHAT_MESSAGE";
        planId = samplePlanId;

        const sampleUserIds = [
          "f69ab638-0873-4b99-9966-42ac497d0bbe", // Maanastej
          "030e6575-709b-4a13-9c92-30f0dac2a877", // Bhaavya
          "06064726-079a-438f-919f-a8be1da70831", // Renjith
        ];
        const { data: testUsers } = await supabase
          .from("users")
          .select("id, full_name, profile_photo_path")
          .in("id", sampleUserIds);

        const testSenderMap = new Map<string, { name: string; avatarUrl: string }>();
        for (const u of testUsers || []) {
          testSenderMap.set(u.id, {
            name: (u.full_name || "Friend").trim(),
            avatarUrl:
              resolveUserAvatarUrl(u.profile_photo_path, publicBaseUrl) ||
              `${publicBaseUrl}/assets/default_avatar.webp`,
          });
        }

        const mockMessages = [
          {
            id: "mock-1",
            sender_id: "f69ab638-0873-4b99-9966-42ac497d0bbe",
            content: "Are you guys coming to Mandaadi?",
            message_type: "text",
            created_at: new Date(Date.now() - 300000).toISOString(),
          },
          {
            id: "mock-2",
            sender_id: "030e6575-709b-4a13-9c92-30f0dac2a877",
            content: "Yes, booked the tickets!",
            message_type: "text",
            created_at: new Date(Date.now() - 240000).toISOString(),
          },
          {
            id: "mock-3",
            sender_id: "06064726-079a-438f-919f-a8be1da70831",
            content: "See you at the entrance at 6",
            message_type: "text",
            created_at: new Date(Date.now() - 180000).toISOString(),
          },
          {
            id: "mock-4",
            sender_id: "f69ab638-0873-4b99-9966-42ac497d0bbe",
            content: "I am bringing the popcorn vouchers",
            message_type: "text",
            created_at: new Date(Date.now() - 120000).toISOString(),
          },
          {
            id: "mock-5",
            sender_id: "030e6575-709b-4a13-9c92-30f0dac2a877",
            content: "Nice! Let's meet at Screen 2",
            message_type: "text",
            created_at: new Date(Date.now() - 60000).toISOString(),
          },
          {
            id: "mock-6",
            sender_id: "06064726-079a-438f-919f-a8be1da70831",
            content: "Almost there, 5 mins away",
            message_type: "text",
            created_at: new Date().toISOString(),
          },
        ];

        chatContext = {
          planTitle: samplePlanTitle,
          planId: samplePlanId,
          recentMessages: mockMessages,
          senderMap: testSenderMap,
          tag,
          url,
        };

        const previewForLog = formatChatPayloadForRecipient({
          recipientUserId: target,
          planTitle: samplePlanTitle,
          planId: samplePlanId,
          recentMessages: mockMessages,
          senderMap: testSenderMap,
          publicBaseUrl,
          tag,
          url,
        });
        if (previewForLog) {
          title = previewForLog.title;
          body = previewForLog.body;
          avatarUrl = previewForLog.icon;
        }
      } else if (payload.testType === "join") {
        tag = "plan-join-test";
        notificationType = "PLAN_JOIN";
        url = "/plans?id=0623a5f5-37b0-4c54-8a1f-437397fd66f4";
        const { data: sampleUser } = await supabase
          .from("users")
          .select("full_name, profile_photo_path")
          .eq("id", "f69ab638-0873-4b99-9966-42ac497d0bbe")
          .maybeSingle();
        const joinerName = sampleUser?.full_name || "Maanastej";
        title = `${joinerName} • Sunday Football`;
        body = "Joined your plan";
        avatarUrl = resolveUserAvatarUrl(sampleUser?.profile_photo_path, publicBaseUrl) || `${publicBaseUrl}/assets/default_avatar.webp`;
      } else if (payload.testType === "waitlist-join") {
        tag = "plan-waitlist-test";
        notificationType = "WAITLIST_JOIN";
        url = "/plans?id=0623a5f5-37b0-4c54-8a1f-437397fd66f4";
        const { data: sampleUser } = await supabase
          .from("users")
          .select("full_name, profile_photo_path")
          .eq("id", "030e6575-709b-4a13-9c92-30f0dac2a877")
          .maybeSingle();
        const joinerName = sampleUser?.full_name || "Bhaavya";
        title = `${joinerName} • Sunday Football`;
        body = "Joined the waitlist";
        avatarUrl = resolveUserAvatarUrl(sampleUser?.profile_photo_path, publicBaseUrl) || `${publicBaseUrl}/assets/default_avatar.webp`;
      } else if (payload.testType === "waitlist-promo") {
        tag = "waitlist-promo-test";
        notificationType = "WAITLIST_PROMOTION";
        url = "/plans?id=0623a5f5-37b0-4c54-8a1f-437397fd66f4";
        title = "You're in! • Sunday Football";
        body = "A spot opened up";
        avatarUrl = `${publicBaseUrl}/assets/categories/sports.png`;
      } else if (payload.testType === "leave") {
        tag = "plan-leave-test";
        notificationType = "PLAN_LEAVE";
        url = "/plans?id=0623a5f5-37b0-4c54-8a1f-437397fd66f4";
        const { data: sampleUser } = await supabase
          .from("users")
          .select("full_name, profile_photo_path")
          .eq("id", "06064726-079a-438f-919f-a8be1da70831")
          .maybeSingle();
        const leaverName = sampleUser?.full_name || "Renjith";
        title = `${leaverName} • Sunday Football`;
        body = "Left the plan";
        avatarUrl = resolveUserAvatarUrl(sampleUser?.profile_photo_path, publicBaseUrl) || `${publicBaseUrl}/assets/default_avatar.webp`;
      } else if (payload.testType === "cancel") {
        tag = "plan-cancel-test";
        notificationType = "PLAN_CANCELLED";
        url = "/plans?id=0623a5f5-37b0-4c54-8a1f-437397fd66f4";
        title = "Cancelled • Sunday Football";
        body = "The host cancelled this plan";
        avatarUrl = `${publicBaseUrl}/assets/categories/sports.png`;
      } else if (payload.testType === "reschedule") {
        tag = "plan-reschedule-test";
        notificationType = "PLAN_RESCHEDULED";
        url = "/plans?id=0623a5f5-37b0-4c54-8a1f-437397fd66f4";
        title = "Updated • Sunday Football";
        body = "Time changed to 6:30 PM";
        avatarUrl = `${publicBaseUrl}/assets/categories/sports.png`;
      } else if (payload.testType === "host-role") {
        tag = "host-role-test";
        notificationType = "HOST_ASSIGNED";
        url = "/plans?id=0623a5f5-37b0-4c54-8a1f-437397fd66f4";
        title = "Host Role • Sunday Football";
        body = "You've been made a co-host";
        avatarUrl = `${publicBaseUrl}/assets/categories/sports.png`;
      } else if (payload.testType === "removal") {
        tag = "participant-removal-test";
        notificationType = "PARTICIPANT_REMOVED";
        url = "/plans?id=0623a5f5-37b0-4c54-8a1f-437397fd66f4";
        title = "Sunday Football";
        body = "You've been removed from this plan";
        avatarUrl = `${publicBaseUrl}/assets/categories/sports.png`;
      } else if (payload.testType === "completed") {
        tag = "plan-completed-test";
        notificationType = "PLAN_COMPLETED";
        url = "/plans?id=0623a5f5-37b0-4c54-8a1f-437397fd66f4";
        title = "Plan Completed • Sunday Football";
        body = "Thanks for joining!";
        avatarUrl = `${publicBaseUrl}/assets/categories/sports.png`;
      } else if (payload.testType === "friend-request") {
        tag = "friend-request-test";
        notificationType = "FRIEND_REQUEST_SENT";
        url = "/profile";
        const { data: sampleUser } = await supabase
          .from("users")
          .select("full_name, profile_photo_path")
          .eq("id", "c3dc4291-f7d7-4cf5-88f3-6be5cdb71353") // Thilak
          .maybeSingle();
        const senderName = sampleUser?.full_name || "Thilak";
        title = "New Friend Request";
        body = `${senderName} sent you a friend request`;
        avatarUrl = resolveUserAvatarUrl(sampleUser?.profile_photo_path, publicBaseUrl) || `${publicBaseUrl}/assets/default_avatar.webp`;
      } else if (payload.testType === "friend-accepted") {
        tag = "friend-accepted-test";
        notificationType = "FRIEND_REQUEST_ACCEPTED";
        url = "/profile";
        const { data: sampleUser } = await supabase
          .from("users")
          .select("full_name, profile_photo_path")
          .eq("id", "f69ab638-0873-4b99-9966-42ac497d0bbe") // Maanastej
          .maybeSingle();
        const accepterName = sampleUser?.full_name || "Maanastej";
        title = "Friend Request Accepted";
        body = `${accepterName} accepted your request`;
        avatarUrl = resolveUserAvatarUrl(sampleUser?.profile_photo_path, publicBaseUrl) || `${publicBaseUrl}/assets/default_avatar.webp`;
      } else {
        // Default: chat message test with sender profile avatar
        const { data: sampleUser } = await supabase
          .from("users")
          .select("full_name, profile_photo_path")
          .eq("id", "f69ab638-0873-4b99-9966-42ac497d0bbe") // Maanastej
          .maybeSingle();

        const senderName = sampleUser?.full_name || "Maanastej";
        title = `${senderName} • Mandaadi`;
        body = "Movie starts in 15 mins! See you there";
        avatarUrl =
          resolveUserAvatarUrl(sampleUser?.profile_photo_path, publicBaseUrl) ||
          `${publicBaseUrl}/assets/default_avatar.webp`;
      }
    }

    // SCENARIO 3: Chat Message Event (Clean WhatsApp layout)
    else if (
      (payload.table === "plan_messages" || payload.event === "CHAT_MESSAGE") &&
      payload.record
    ) {
      const record = payload.record;
      // Requirement 5: Disable shared expense and poll push notifications
      if (record?.message_type === "cost" || record?.message_type === "poll") {
        return new Response(
          JSON.stringify({
            success: true,
            message: `Push notification disabled for message_type: ${record.message_type}`,
            deliveredCount: 0,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const senderId = record.sender_id;
      planId = record.plan_id;
      notificationType = "CHAT_MESSAGE";
      tag = "plan-chats";
      url = `/chats?id=${planId}`;

      // Fetch sender details, plan metadata, participants, and recent messages in parallel
      const [
        { data: senderData },
        { data: planData },
        { data: participants },
        { data: recentMsgsRaw },
      ] = await Promise.all([
        supabase
          .from("users")
          .select("full_name, profile_photo_path")
          .eq("id", senderId)
          .maybeSingle(),
        supabase
          .from("plans")
          .select("id, title, cover_image, cover_card_image, category, place_name")
          .eq("id", planId)
          .maybeSingle(),
        supabase
          .from("plan_participants")
          .select("user_id")
          .eq("plan_id", planId)
          .neq("rsvp_status", "SKIPPED")
          .neq("user_id", senderId),
        supabase
          .from("plan_messages")
          .select("id, content, message_type, sender_id, created_at")
          .eq("plan_id", planId)
          .order("created_at", { ascending: false })
          .limit(20), // Remove 4-message cap: query up to 20 recent messages
      ]);

      const rawPlanTitle = (planData?.title || "Plan").trim();
      const planTitle = rawPlanTitle.length > 25 ? `${rawPlanTitle.slice(0, 24)}…` : rawPlanTitle;
      targetUserIds = (participants || []).map((p: any) => p.user_id);

      // Ensure the newly triggered message record is included in recent messages
      let allMsgs = [...(recentMsgsRaw || [])];
      if (record && !allMsgs.some((m) => m.id === record.id)) {
        allMsgs.unshift(record);
      }
      // Order chronologically: oldest to newest
      const chronologicalMessages = allMsgs.reverse();

      // Collect all distinct sender IDs from recent messages
      const senderIds = Array.from(
        new Set([senderId, ...chronologicalMessages.map((m) => m.sender_id)])
      ).filter(Boolean);

      const { data: sendersData } = await supabase
        .from("users")
        .select("id, full_name, profile_photo_path")
        .in("id", senderIds);

      const senderMap = new Map<string, { name: string; avatarUrl: string }>();
      for (const u of sendersData || []) {
        senderMap.set(u.id, {
          name: (u.full_name || "Friend").trim(),
          avatarUrl:
            resolveUserAvatarUrl(u.profile_photo_path, publicBaseUrl) ||
            `${publicBaseUrl}/assets/default_avatar.webp`,
        });
      }
      if (senderData && !senderMap.has(senderId)) {
        senderMap.set(senderId, {
          name: (senderData.full_name || "Friend").trim(),
          avatarUrl:
            resolveUserAvatarUrl(senderData.profile_photo_path, publicBaseUrl) ||
            `${publicBaseUrl}/assets/default_avatar.webp`,
        });
      }

      chatContext = {
        planTitle,
        planId: planId || "",
        recentMessages: chronologicalMessages,
        senderMap,
        tag,
        url,
      };

      // Set fallback values for preview and logging
      const defaultPreview = formatChatPayloadForRecipient({
        recipientUserId: "",
        planTitle,
        planId: planId || "",
        recentMessages: chronologicalMessages,
        senderMap,
        publicBaseUrl,
        tag,
        url,
      });
      if (defaultPreview) {
        title = defaultPreview.title;
        body = defaultPreview.body;
        avatarUrl = defaultPreview.icon;
      }
      imageUrl = null;
    }

    // SCENARIO 4: Plan Invitation Event (Clean WhatsApp layout with plan image)
    else if (payload.event === "PLAN_INVITATION" && payload.planId && payload.userIds) {
      planId = payload.planId;
      notificationType = "PLAN_INVITATION";
      tag = `plan-invite-${planId}`;
      url = `/plans?id=${planId}`;
      targetUserIds = payload.userIds.filter(Boolean);

      // Fetch plan details
      const { data: planData } = await supabase
        .from("plans")
        .select("id, title, place_name, cover_image, cover_card_image, category")
        .eq("id", planId)
        .maybeSingle();

      // Resolve inviter name and profile photo
      let inviterName = payload.inviterName ? payload.inviterName.trim() : "";
      let inviterPhotoPath: string | null = null;
      let effectiveInviterId = payload.inviterId;

      if (!effectiveInviterId) {
        const { data: hostParticipant } = await supabase
          .from("plan_participants")
          .select("user_id")
          .eq("plan_id", planId)
          .eq("role", "HOST")
          .maybeSingle();
        effectiveInviterId = hostParticipant?.user_id;
      }

      if (effectiveInviterId) {
        const { data: inviterUser } = await supabase
          .from("users")
          .select("full_name, profile_photo_path")
          .eq("id", effectiveInviterId)
          .maybeSingle();
        if (inviterUser) {
          if (!inviterName && inviterUser.full_name) {
            inviterName = inviterUser.full_name.trim();
          }
          inviterPhotoPath = inviterUser.profile_photo_path;
        }
      }

      const rawPlanTitle = (planData?.title || "Plan").trim();
      const planTitle = rawPlanTitle.length > 25 ? `${rawPlanTitle.slice(0, 24)}…` : rawPlanTitle;
      const placeName = planData?.place_name?.trim() || "";

      if (inviterName) {
        title = `${inviterName} • ${planTitle}`;
        body = placeName
          ? `Invited you to join • ${placeName}`
          : "Invited you to join this plan";
      } else {
        title = `Invited • ${planTitle}`;
        body = placeName
          ? `Join your friends • ${placeName}`
          : "Tap to view details and RSVP";
      }

      avatarUrl =
        resolveUserAvatarUrl(inviterPhotoPath, publicBaseUrl) ||
        resolvePlanImageUrl(planData, publicBaseUrl) ||
        `${publicBaseUrl}/assets/default_avatar.webp`;
      imageUrl = null;
    }

    // SCENARIO 5: Plan Participation Join / Waitlist Join Event
    else if ((payload.event === "PLAN_JOIN" || payload.event === "WAITLIST_JOIN") && payload.planId) {
      planId = payload.planId;
      const actorId = payload.actorId || payload.userId;
      const isWaitlist = payload.rsvpStatus === "WAITLISTED" || payload.event === "WAITLIST_JOIN";
      url = `/plans?id=${planId}`;
      tag = isWaitlist ? `plan-waitlist-${planId}-${actorId || "user"}` : `plan-join-${planId}-${actorId || "user"}`;
      notificationType = isWaitlist ? "WAITLIST_JOIN" : "PLAN_JOIN";

      const [{ data: pData }, { data: aUser }, { data: hosts }] = await Promise.all([
        supabase.from("plans").select("id, title, cover_image, cover_card_image, category").eq("id", planId).maybeSingle(),
        actorId ? supabase.from("users").select("id, full_name, profile_photo_path").eq("id", actorId).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("plan_participants").select("user_id").eq("plan_id", planId).eq("role", "HOST").neq("rsvp_status", "SKIPPED"),
      ]);

      const rawPlanTitle = (pData?.title || "Plan").trim();
      const planTitle = rawPlanTitle.length > 25 ? `${rawPlanTitle.slice(0, 24)}…` : rawPlanTitle;
      const rawJoinerName = (aUser?.full_name || "Someone").trim();
      const joinerName = rawJoinerName.length > 20 ? `${rawJoinerName.slice(0, 19)}…` : rawJoinerName;

      title = `${joinerName} • ${planTitle}`;
      body = isWaitlist ? "Joined the waitlist" : "Joined your plan";
      avatarUrl =
        resolveUserAvatarUrl(aUser?.profile_photo_path, publicBaseUrl) ||
        resolvePlanImageUrl(pData, publicBaseUrl) ||
        `${publicBaseUrl}/assets/default_avatar.webp`;
      imageUrl = null;

      // Filter out actor so hosts who join don't notify themselves
      targetUserIds = (hosts || []).map((h: any) => h.user_id).filter((uid: string) => uid && uid !== actorId);
    }

    // SCENARIO 6: Waitlist Promotion Event
    else if (payload.event === "WAITLIST_PROMOTION" && payload.planId) {
      planId = payload.planId;
      const targetUser = payload.targetUserId || payload.userId;
      targetUserIds = targetUser ? [targetUser] : (payload.userIds || []).filter(Boolean);
      url = `/plans?id=${planId}`;
      tag = `waitlist-promo-${planId}-${targetUser || "user"}`;
      notificationType = "WAITLIST_PROMOTION";

      const { data: pData } = await supabase
        .from("plans")
        .select("id, title, cover_image, cover_card_image, category")
        .eq("id", planId).maybeSingle();

      const rawPlanTitle = (pData?.title || "Plan").trim();
      const planTitle = rawPlanTitle.length > 25 ? `${rawPlanTitle.slice(0, 24)}…` : rawPlanTitle;

      title = `You're in! • ${planTitle}`;
      body = "A spot opened up";
      avatarUrl =
        resolvePlanImageUrl(pData, publicBaseUrl) ||
        `${publicBaseUrl}/pwa-192x192.png`;
      imageUrl = null;
    }

    // SCENARIO 7: Plan Leave / Decline Event
    else if (payload.event === "PLAN_LEAVE" && payload.planId) {
      planId = payload.planId;
      const actorId = payload.actorId || payload.userId;
      const prevStatus = payload.previousStatus || payload.data?.previousStatus;
      url = `/plans?id=${planId}`;
      tag = `plan-leave-${planId}-${actorId || "user"}`;
      notificationType = "PLAN_LEAVE";

      const [{ data: pData }, { data: aUser }, { data: hosts }] = await Promise.all([
        supabase.from("plans").select("id, title, cover_image, cover_card_image, category").eq("id", planId).maybeSingle(),
        actorId ? supabase.from("users").select("id, full_name, profile_photo_path").eq("id", actorId).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("plan_participants").select("user_id").eq("plan_id", planId).eq("role", "HOST").neq("rsvp_status", "SKIPPED"),
      ]);

      const rawPlanTitle = (pData?.title || "Plan").trim();
      const planTitle = rawPlanTitle.length > 25 ? `${rawPlanTitle.slice(0, 24)}…` : rawPlanTitle;
      const rawLeaverName = (aUser?.full_name || "Someone").trim();
      const leaverName = rawLeaverName.length > 20 ? `${rawLeaverName.slice(0, 19)}…` : rawLeaverName;

      title = `${leaverName} • ${planTitle}`;
      body = prevStatus === "INVITED" ? "Declined the invitation" : "Left the plan";
      avatarUrl =
        resolveUserAvatarUrl(aUser?.profile_photo_path, publicBaseUrl) ||
        resolvePlanImageUrl(pData, publicBaseUrl) ||
        `${publicBaseUrl}/assets/default_avatar.webp`;
      imageUrl = null;

      targetUserIds = (hosts || []).map((h: any) => h.user_id).filter((uid: string) => uid && uid !== actorId);
    }

    // SCENARIO 8: Plan Cancellation Event
    else if (payload.event === "PLAN_CANCELLED" && payload.planId) {
      planId = payload.planId;
      const actorId = payload.actorId || payload.userId;
      url = `/plans?id=${planId}`;
      tag = `plan-cancelled-${planId}`;
      notificationType = "PLAN_CANCELLED";

      const [{ data: pData }, { data: participants }] = await Promise.all([
        supabase.from("plans").select("id, title, cover_image, cover_card_image, category").eq("id", planId).maybeSingle(),
        supabase.from("plan_participants").select("user_id, rsvp_status").eq("plan_id", planId),
      ]);

      const rawPlanTitle = (pData?.title || "Plan").trim();
      const planTitle = rawPlanTitle.length > 25 ? `${rawPlanTitle.slice(0, 24)}…` : rawPlanTitle;

      title = `Cancelled • ${planTitle}`;
      body = "The host cancelled this plan";
      avatarUrl =
        resolvePlanImageUrl(pData, publicBaseUrl) ||
        `${publicBaseUrl}/pwa-192x192.png`;
      imageUrl = null;

      // Eligible participants pre-cancellation (excluding host who performed the cancellation)
      targetUserIds = (participants || [])
        .filter((p: any) => p.user_id !== actorId && (p.rsvp_status === "JOINED" || p.rsvp_status === "WAITLISTED" || p.rsvp_status === "INVITED"))
        .map((p: any) => p.user_id)
        .filter(Boolean);
    }

    // SCENARIO 9: Plan Rescheduling Event
    else if (payload.event === "PLAN_RESCHEDULED" && payload.planId) {
      planId = payload.planId;
      const actorId = payload.actorId || payload.userId;
      const changes = payload.changes || {};
      url = `/plans?id=${planId}`;
      tag = `plan-rescheduled-${planId}`;
      notificationType = "PLAN_RESCHEDULED";

      const [{ data: pData }, { data: participants }] = await Promise.all([
        supabase.from("plans").select("id, title, cover_image, cover_card_image, category").eq("id", planId).maybeSingle(),
        supabase.from("plan_participants").select("user_id").eq("plan_id", planId).eq("rsvp_status", "JOINED"),
      ]);

      const rawPlanTitle = (pData?.title || "Plan").trim();
      const planTitle = rawPlanTitle.length > 25 ? `${rawPlanTitle.slice(0, 24)}…` : rawPlanTitle;

      title = `Updated • ${planTitle}`;
      if (changes.description) {
        body = changes.description;
      } else if (changes.timeChanged && !changes.dateChanged && !changes.venueChanged) {
        body = changes.newTime ? `Time changed to ${changes.newTime}` : "Time updated";
      } else if (changes.dateChanged && !changes.timeChanged && !changes.venueChanged) {
        body = changes.newDate ? `Date changed to ${changes.newDate}` : "Date updated";
      } else if (changes.dateChanged && changes.timeChanged && !changes.venueChanged) {
        body = (changes.newDate && changes.newTime) ? `Rescheduled to ${changes.newDate} at ${changes.newTime}` : "Date and time updated";
      } else if (changes.venueChanged && !changes.dateChanged && !changes.timeChanged) {
        body = changes.newVenue ? `Venue changed to ${changes.newVenue}` : "Venue updated";
      } else if (changes.venueChanged && (changes.dateChanged || changes.timeChanged)) {
        body = "Time and venue updated";
      } else {
        body = "Plan schedule updated";
      }

      avatarUrl =
        resolvePlanImageUrl(pData, publicBaseUrl) ||
        `${publicBaseUrl}/pwa-192x192.png`;
      imageUrl = null;

      targetUserIds = (participants || []).map((p: any) => p.user_id).filter((uid: string) => uid && uid !== actorId);
    }

    // SCENARIO 10: Host Role Assignment Event
    else if (payload.event === "HOST_ASSIGNED" && payload.planId) {
      planId = payload.planId;
      const targetUser = payload.targetUserId || payload.userId;
      url = `/plans?id=${planId}`;
      tag = `host-role-${planId}-${targetUser || "user"}`;
      notificationType = "HOST_ASSIGNED";

      const { data: pData } = await supabase
        .from("plans")
        .select("id, title, cover_image, cover_card_image, category")
        .eq("id", planId)
        .maybeSingle();

      const rawPlanTitle = (pData?.title || "Plan").trim();
      const planTitle = rawPlanTitle.length > 25 ? `${rawPlanTitle.slice(0, 24)}…` : rawPlanTitle;

      title = `Host Role • ${planTitle}`;
      body = "You've been made a co-host";
      avatarUrl =
        resolvePlanImageUrl(pData, publicBaseUrl) ||
        `${publicBaseUrl}/pwa-192x192.png`;
      imageUrl = null;

      targetUserIds = targetUser ? [targetUser] : [];
    }

    // SCENARIO 11: Participant Removal Event
    else if (payload.event === "PARTICIPANT_REMOVED" && payload.planId) {
      planId = payload.planId;
      const targetUser = payload.targetUserId || payload.userId;
      url = `/plans?id=${planId}`;
      tag = `participant-removed-${planId}-${targetUser || "user"}`;
      notificationType = "PARTICIPANT_REMOVED";

      const { data: pData } = await supabase
        .from("plans")
        .select("id, title, cover_image, cover_card_image, category")
        .eq("id", planId)
        .maybeSingle();

      const rawPlanTitle = (pData?.title || "Plan").trim();
      const planTitle = rawPlanTitle.length > 25 ? `${rawPlanTitle.slice(0, 24)}…` : rawPlanTitle;

      title = `${planTitle}`;
      body = "You've been removed from this plan";
      avatarUrl =
        resolvePlanImageUrl(pData, publicBaseUrl) ||
        `${publicBaseUrl}/pwa-192x192.png`;
      imageUrl = null;

      targetUserIds = targetUser ? [targetUser] : [];
    }

    // SCENARIO 12: Plan Completed Event
    else if (payload.event === "PLAN_COMPLETED" && payload.planId) {
      planId = payload.planId;
      const actorId = payload.actorId || payload.userId;
      url = `/plans?id=${planId}`;
      tag = `plan-completed-${planId}`;
      notificationType = "PLAN_COMPLETED";

      const [{ data: pData }, { data: participants }] = await Promise.all([
        supabase.from("plans").select("id, title, cover_image, cover_card_image, category").eq("id", planId).maybeSingle(),
        supabase.from("plan_participants").select("user_id, attendance, rsvp_status").eq("plan_id", planId),
      ]);

      const rawPlanTitle = (pData?.title || "Plan").trim();
      const planTitle = rawPlanTitle.length > 25 ? `${rawPlanTitle.slice(0, 24)}…` : rawPlanTitle;

      title = `Plan Completed • ${planTitle}`;
      body = "Thanks for joining!";
      avatarUrl =
        resolvePlanImageUrl(pData, publicBaseUrl) ||
        `${publicBaseUrl}/pwa-192x192.png`;
      imageUrl = null;

      if (payload.attendingUserIds && Array.isArray(payload.attendingUserIds)) {
        targetUserIds = payload.attendingUserIds.filter((uid: string) => uid && uid !== actorId);
      } else {
        targetUserIds = (participants || [])
          .filter((p: any) => p.user_id !== actorId && (p.attendance === "ATTENDED" || (p.attendance !== "DID_NOT_ATTEND" && p.rsvp_status === "JOINED")))
          .map((p: any) => p.user_id)
          .filter(Boolean);
      }
    }

    // SCENARIO 13: Friend Request Sent Event
    else if (payload.event === "FRIEND_REQUEST_SENT") {
      const actorId = payload.actorId || payload.senderId || payload.userId;
      const targetUser = payload.targetUserId || payload.recipientId;
      url = "/profile";
      tag = `friend-request-${actorId || "sender"}-${targetUser || "recipient"}`;
      notificationType = "FRIEND_REQUEST_SENT";

      const { data: senderUser } = actorId
        ? await supabase.from("users").select("id, full_name, profile_photo_path").eq("id", actorId).maybeSingle()
        : { data: null };

      const rawSenderName = (senderUser?.full_name || "Someone").trim();
      const senderName = rawSenderName.length > 25 ? `${rawSenderName.slice(0, 24)}…` : rawSenderName;

      title = "New Friend Request";
      body = `${senderName} sent you a friend request`;
      avatarUrl =
        resolveUserAvatarUrl(senderUser?.profile_photo_path, publicBaseUrl) ||
        `${publicBaseUrl}/assets/default_avatar.webp`;
      imageUrl = null;

      targetUserIds = (targetUser && targetUser !== actorId) ? [targetUser] : [];
    }

    // SCENARIO 14: Friend Request Accepted Event
    else if (payload.event === "FRIEND_REQUEST_ACCEPTED") {
      const actorId = payload.actorId || payload.accepterId || payload.userId;
      const targetUser = payload.targetUserId || payload.requesterId;
      url = "/profile";
      tag = `friend-accepted-${targetUser || "requester"}-${actorId || "accepter"}`;
      notificationType = "FRIEND_REQUEST_ACCEPTED";

      const { data: accepterUser } = actorId
        ? await supabase.from("users").select("id, full_name, profile_photo_path").eq("id", actorId).maybeSingle()
        : { data: null };

      const rawAccepterName = (accepterUser?.full_name || "Someone").trim();
      const accepterName = rawAccepterName.length > 25 ? `${rawAccepterName.slice(0, 24)}…` : rawAccepterName;

      title = "Friend Request Accepted";
      body = `${accepterName} accepted your request`;
      avatarUrl =
        resolveUserAvatarUrl(accepterUser?.profile_photo_path, publicBaseUrl) ||
        `${publicBaseUrl}/assets/default_avatar.webp`;
      imageUrl = null;

      targetUserIds = (targetUser && targetUser !== actorId) ? [targetUser] : [];
    }

    // SCENARIO 15: Direct Explicit userIds list
    else {
      if (payload.userIds && Array.isArray(payload.userIds)) {
        targetUserIds = payload.userIds.filter(Boolean);
      } else if (payload.userId) {
        targetUserIds = [payload.userId];
      }
      if (payload.planId) {
        const { data: planData } = await supabase
          .from("plans")
          .select("id, title, cover_image, cover_card_image, category")
          .eq("id", payload.planId)
          .maybeSingle();
        imageUrl = resolvePlanImageUrl(planData, publicBaseUrl);
      }
    }

    if (targetUserIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No recipients to notify",
          deliveredCount: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Query active push subscriptions for all target recipients
    const { data: subscriptions, error: subError } = await supabase
      .from("user_push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", targetUserIds)
      .eq("is_active", true);

    if (subError) {
      console.error("[send-push] Error querying subscriptions:", subError);
      return new Response(JSON.stringify({ error: subError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active push device subscriptions found for recipients",
          deliveredCount: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Dispatch Web Push to all devices with clean WhatsApp layout (no oversized image banner)
    const planlessAppIcon = `${publicBaseUrl}/pwa-192x192.png`;
    const chosenIcon = avatarUrl || imageUrl || planlessAppIcon;

    // Safe diagnostic log of resolved payload (no credentials or tokens printed)
    console.log(`[send-push] Dispatching push notification:`, {
      hasChatContext: !!chatContext,
      title,
      body,
      icon: chosenIcon,
      hasAvatar: !!avatarUrl,
      publicBaseUrl,
      recipientCount: targetUserIds.length,
      subscriptionCount: subscriptions.length,
    });

    let deliveredCount = 0;
    const expiredSubIds: string[] = [];

    const deliveryPromises = (subscriptions || []).map(async (sub: any) => {
      let payloadForSub: FormattedChatPush | any;

      if (chatContext) {
        payloadForSub = formatChatPayloadForRecipient({
          recipientUserId: sub.user_id,
          planTitle: chatContext.planTitle,
          planId: chatContext.planId,
          recentMessages: chatContext.recentMessages,
          senderMap: chatContext.senderMap,
          publicBaseUrl,
          tag: chatContext.tag,
          url: chatContext.url,
          extraData: payload.data,
        });

        if (!payloadForSub) {
          // No incoming messages from other participants for this user
          return;
        }
      } else {
        payloadForSub = {
          title,
          body,
          icon: chosenIcon,
          badge: `${publicBaseUrl}/favicon-32x32.png`,
          tag,
          timestamp: Date.now(),
          notificationType,
          data: {
            url,
            planId,
            notificationType,
            avatar: chosenIcon,
            ...payload.data,
          },
        };
      }

      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(payloadForSub),
          { TTL: 86400 } // 24 hours delivery window
        );
        deliveredCount++;
      } catch (pushErr: any) {
        console.warn(`[send-push] Push failed for subscription ${sub.id}:`, {
          status: pushErr?.statusCode,
          message: pushErr?.message,
          body: pushErr?.body,
        });
        // Prune subscription if browser revoked permission or endpoint expired (404/410)
        if (pushErr?.statusCode === 404 || pushErr?.statusCode === 410) {
          expiredSubIds.push(sub.id);
        }
      }
    });

    await Promise.allSettled(deliveryPromises);

    // Clean up expired subscriptions
    if (expiredSubIds.length > 0) {
      await supabase
        .from("user_push_subscriptions")
        .update({ is_active: false })
        .in("id", expiredSubIds);
      console.log(`[send-push] Pruned ${expiredSubIds.length} expired subscriptions`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        deliveredCount,
        recipientCount: targetUserIds.length,
        subscriptionCount: subscriptions.length,
        prunedCount: expiredSubIds.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[send-push] Uncaught error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
