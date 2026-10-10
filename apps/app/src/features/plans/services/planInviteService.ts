import { supabase } from "../../../../lib/supabaseClient";
import { isUuid } from "../utils/planUtils";
import { getPlanSlug, generateBaseSlug } from "../utils/planSlugUtils";

const BASE_URL = "https://planless.app";

export const PENDING_INVITE_TOKEN_KEY = "planless_pending_invite_token";

/**
 * Sanitizes and extracts the canonical Plan identifier (UUID, public_id, or slug)
 * from a raw input string, URL, or combined share text payload.
 * Strips human-readable share text (e.g. "Join <Title> on Planless"),
 * URL paths, query parameters, and hashes.
 */
export function cleanPlanIdentifier(input?: string | null): string {
  if (!input) return "";
  let decoded = "";
  try {
    decoded = decodeURIComponent(String(input));
  } catch {
    decoded = String(input);
  }

  // 1. If a 36-character UUID is present anywhere in the string, extract that exact canonical UUID
  const uuidMatch = decoded.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
  if (uuidMatch && isUuid(uuidMatch[1])) {
    return uuidMatch[1].toLowerCase();
  }

  // 2. If a /join/<token> path pattern is present, isolate the token part
  const joinMatch = decoded.match(/\/join\/([^\s?#/]+)/i);
  if (joinMatch && joinMatch[1]) {
    decoded = joinMatch[1];
  }

  // 3. Remove query parameters and hashes (?ref=..., #...)
  const withoutQuery = decoded.split(/[?#]/)[0];

  // 4. Strip leading/trailing slashes, whitespace, and take the first whitespace-separated token
  const trimmed = withoutQuery.replace(/^[\/\s]+|[\/\s]+$/g, "").trim();
  const firstToken = trimmed.split(/\s+/)[0] || "";

  return firstToken.replace(/^[\/\s]+|[\/\s]+$/g, "").trim();
}

/**
 * Returns the full sharable invite URL for a plan using its UUID.
 */
export function buildInviteUrl(planId: string): string {
  const cleanId = cleanPlanIdentifier(planId);
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/join/${cleanId}`;
  }
  return `${BASE_URL}/join/${cleanId}`;
}

/**
 * Extracts a plan invite token (plan UUID or slug) from a URL or pathname (e.g. /join/<plan_id>).
 * Strips any human-readable share text (e.g. "Join <Title> on Planless").
 */
export function extractInviteTokenFromPath(pathname?: string | null): string | null {
  if ((pathname === undefined || pathname === null) && typeof window !== "undefined") {
    pathname = window.location.pathname;
  }
  if (!pathname) return null;

  // Verify that the pathname actually points to a /join/ destination
  // Paths like "/home", "/plans", "/create", "/chats" must NOT match.
  const hasJoinSegment = /\/join(\/|$|\s|%20)/i.test(pathname) || /^[/\s]*join(\/|$|\s|%20)/i.test(pathname);
  if (!hasJoinSegment) {
    return null;
  }

  const cleaned = cleanPlanIdentifier(pathname);
  return cleaned || null;
}

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    return null;
  }
  return null;
}

/**
 * Retrieves the stored pending invite token (plan UUID) from localStorage.
 */
export function getStoredPendingInviteToken(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PENDING_INVITE_TOKEN_KEY);
    return raw ? cleanPlanIdentifier(raw) || raw : null;
  } catch {
    return null;
  }
}

/**
 * Persists the pending invite token (plan UUID) in localStorage.
 */
export function setStoredPendingInviteToken(token: string): void {
  const storage = getStorage();
  if (!storage || !token) return;
  const cleanToken = cleanPlanIdentifier(token) || token.trim();
  try {
    storage.setItem(PENDING_INVITE_TOKEN_KEY, cleanToken);
  } catch (e) {
    console.warn("[planInviteService] Failed to store pending invite token:", e);
  }
}

/**
 * Clears the stored pending invite token from localStorage.
 */
export function clearStoredPendingInviteToken(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(PENDING_INVITE_TOKEN_KEY);
  } catch (e) {
    console.warn("[planInviteService] Failed to clear pending invite token:", e);
  }
}

export interface ClaimInviteResult {
  success: boolean;
  plan_id?: string;
  rsvp_status?: "INVITED" | "JOINED" | "WAITLISTED" | "SKIPPED" | string;
  assigned_group?: "GOING" | "WAITLIST" | null;
  waitlist_position?: number | null;
  plan_size?: number | null;
  new_plan_size?: number | null;
  already_participating?: boolean;
  error?: string;
}

/**
 * Invokes the claim_plan_invite RPC in Supabase to atomically claim a plan invite
 * using the plan UUID. Returns the resulting RSVP state, assigned group, waitlist position,
 * and plan size.
 */
export async function claimPlanInviteRPC(
  planId: string,
  customClient?: any
): Promise<ClaimInviteResult> {
  if (!planId) {
    return { success: false, error: "Missing plan ID" };
  }

  const client = customClient || supabase;
  let targetId = cleanPlanIdentifier(planId) || planId.trim();

  // If identifier is not already a UUID (e.g. slug or public_id), resolve to canonical UUID
  if (!isUuid(targetId)) {
    try {
      const canonical = await findCanonicalPlan(targetId, client);
      if (canonical?.id) {
        targetId = canonical.id;
      }
    } catch {
      // Retain targetId as fallback
    }
  }

  const { data, error } = await client.rpc("claim_plan_invite" as any, {
    p_plan_id: targetId,
  });

  if (error) {
    console.error("[planInviteService] claimPlanInviteRPC failed:", error);
    return { success: false, error: error.message };
  }

  const res = data as ClaimInviteResult;
  return {
    success: Boolean(res?.success),
    plan_id: res?.plan_id || targetId,
    rsvp_status: res?.rsvp_status,
    assigned_group: res?.assigned_group,
    waitlist_position: res?.waitlist_position,
    plan_size: res?.plan_size !== undefined ? res.plan_size : (res?.new_plan_size !== undefined ? res.new_plan_size : null),
    already_participating: Boolean(res?.already_participating),
  };
}

export type ParticipantResolutionStatus =
  | "NO_PARTICIPANT"
  | "INVITED"
  | "JOINED"
  | "WAITLISTED"
  | "SKIPPED"
  | "HOST"
  | "PLAN_NOT_FOUND"
  | "PLAN_INACTIVE";

export interface ParticipantResolution {
  status: ParticipantResolutionStatus;
  planId: string;
  participant?: {
    role: string;
    rsvp_status: string;
    assigned_group?: string | null;
    waitlist_position?: number | null;
  } | null;
  plan?: {
    id: string;
    status: string;
    title?: string;
    public_id?: string;
  } | null;
  error?: string;
}

export type InviteDestination = "HOME" | "PLAN_PREVIEW" | "INVALID";

export interface InviteDestinationResult {
  destination: InviteDestination;
  status: ParticipantResolutionStatus;
  planId: string;
  claimResult?: ClaimInviteResult;
  error?: string;
}

export interface CanonicalPlanRecord {
  id: string;
  status: string;
  title: string;
  public_id?: string;
  participant_filtering?: string;
  allow_participant_invites?: boolean;
}

/**
 * Robustly resolves any plan identifier (canonical UUID, public_id, or URL-safe slug)
 * to the canonical database Plan record and UUID.
 */
export async function findCanonicalPlan(
  identifier: string,
  customClient?: any
): Promise<CanonicalPlanRecord | null> {
  const client = customClient || supabase;
  if (!identifier) return null;
  const clean = cleanPlanIdentifier(identifier);
  if (!clean) return null;

  // 1. Direct UUID lookup (O(1) primary key match)
  if (isUuid(clean)) {
    try {
      const { data, error } = await client
        .from("plans")
        .select("id, status, title, public_id, participant_filtering, allow_participant_invites")
        .eq("id", clean)
        .maybeSingle();
      if (!error && data) {
        return data as CanonicalPlanRecord;
      }
    } catch {
      // Fall through to secondary lookups
    }
  }

  // 2. Direct public_id lookup (e.g. p_1789466614872)
  try {
    const { data: byPublicId, error: pubErr } = await client
      .from("plans")
      .select("id, status, title, public_id")
      .eq("public_id", clean)
      .maybeSingle();

    if (!pubErr && byPublicId) {
      return byPublicId as CanonicalPlanRecord;
    }
  } catch {
    // Fall through
  }

  // 3. Slug lookup against active LIVE plans
  try {
    const { data: livePlans, error: liveErr } = await client
      .from("plans")
      .select("id, status, title, public_id")
      .eq("status", "LIVE");

    if (!liveErr && livePlans && livePlans.length > 0) {
      const lowerClean = clean.toLowerCase();
      const matched = livePlans.find((p: any) => {
        const computedSlug = getPlanSlug({ id: p.id, dbUuid: p.id, title: p.title, publicId: p.public_id }, livePlans);
        if (computedSlug.toLowerCase() === lowerClean) return true;
        if (generateBaseSlug(p.title).toLowerCase() === lowerClean) return true;
        return false;
      });
      if (matched) {
        return matched as CanonicalPlanRecord;
      }
    }
  } catch {
    // Fall through
  }

  // 4. Slug lookup across all plans (to preserve inactive status rather than 404)
  try {
    const { data: allPlans, error: allErr } = await client
      .from("plans")
      .select("id, status, title, public_id");

    if (!allErr && allPlans && allPlans.length > 0) {
      const lowerClean = clean.toLowerCase();
      const matched = allPlans.find((p: any) => {
        const computedSlug = getPlanSlug({ id: p.id, dbUuid: p.id, title: p.title, publicId: p.public_id }, allPlans);
        if (computedSlug.toLowerCase() === lowerClean) return true;
        if (generateBaseSlug(p.title).toLowerCase() === lowerClean) return true;
        return false;
      });
      if (matched) {
        return matched as CanonicalPlanRecord;
      }
    }
  } catch {
    // Fall through
  }

  return null;
}

/**
 * Resolves the authenticated user's participant state for a specific plan
 * against public.plan_participants BEFORE any navigation or claim decision is made.
 */
export async function resolveUserPlanParticipant(
  planId: string,
  userId?: string,
  customClient?: any
): Promise<ParticipantResolution> {
  const client = customClient || supabase;
  const cleanId = cleanPlanIdentifier(planId);
  if (!cleanId) {
    return { status: "PLAN_NOT_FOUND", planId: "", error: "Missing plan ID" };
  }

  // 1. Resolve canonical database plan
  const canonicalPlan = await findCanonicalPlan(cleanId, client);
  if (!canonicalPlan) {
    console.warn(`[InviteFlow] Plan lookup failed: Plan not found for identifier "${cleanId}"`);
    return { status: "PLAN_NOT_FOUND", planId: cleanId, error: "Plan not found" };
  }

  const canonicalPlanId = canonicalPlan.id;
  const isPlanLive = canonicalPlan.status === "LIVE";

  console.log(`[InviteFlow] Parsed invite identifier: "${cleanId}" -> Resolved Plan ID: "${canonicalPlanId}" ("${canonicalPlan.title}"), status: ${canonicalPlan.status}`);

  if (!isPlanLive) {
    return { status: "PLAN_INACTIVE", planId: canonicalPlanId, plan: canonicalPlan, error: "Plan is not active" };
  }

  // 2. Resolve caller user ID
  let resolvedUserId = (userId && isUuid(userId)) ? userId : undefined;
  if (!resolvedUserId) {
    try {
      const { data: authData } = await client.auth.getUser();
      resolvedUserId = authData?.user?.id;
    } catch {
      // Ignore auth fetch error, checked below
    }
  }

  if (!resolvedUserId) {
    return { status: "NO_PARTICIPANT", planId: canonicalPlanId, plan: canonicalPlan, error: "Not authenticated" };
  }

  // 3. Check if user already has a participant record for this plan
  const { data: partData, error: partError } = await client
    .from("plan_participants")
    .select("role, rsvp_status, assigned_group, waitlist_position")
    .eq("plan_id", canonicalPlanId)
    .eq("user_id", resolvedUserId)
    .maybeSingle();

  if (!partError && partData) {
    const roleNorm = (partData.role || "").toUpperCase();
    if (roleNorm === "HOST") {
      return { status: "HOST", planId: canonicalPlanId, participant: partData, plan: canonicalPlan };
    }

    const rsvpNorm = (partData.rsvp_status || "").toUpperCase();
    if (rsvpNorm === "JOINED") {
      return { status: "JOINED", planId: canonicalPlanId, participant: partData, plan: canonicalPlan };
    }
    if (rsvpNorm === "WAITLISTED") {
      return { status: "WAITLISTED", planId: canonicalPlanId, participant: partData, plan: canonicalPlan };
    }
    if (rsvpNorm === "SKIPPED") {
      return { status: "SKIPPED", planId: canonicalPlanId, participant: partData, plan: canonicalPlan };
    }
    if (rsvpNorm === "INVITED") {
      return { status: "INVITED", planId: canonicalPlanId, participant: partData, plan: canonicalPlan };
    }

    // Default existing participant fallback
    return { status: "INVITED", planId: canonicalPlanId, participant: partData, plan: canonicalPlan };
  }

  return { status: "NO_PARTICIPANT", planId: canonicalPlanId, plan: canonicalPlan };
}

/**
 * Copies an invite URL to clipboard with cross-browser fallback support (desktop & mobile HTTP/HTTPS).
 */
export async function copyInviteUrlToClipboard(url: string): Promise<boolean> {
  if (!url) return false;
  if (typeof window !== "undefined" && navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Fall through to textarea fallback
    }
  }
  if (typeof document !== "undefined") {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      return successful;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Resolves the destination for an invite link based on the user's participant state:
 * - NO_PARTICIPANT: Claims the invite atomically via RPC -> destination: HOME
 * - INVITED: Keeps existing state -> destination: HOME
 * - JOINED, WAITLISTED, SKIPPED, HOST: Does not claim/modify state -> destination: PLAN_PREVIEW
 * - INACTIVE / NOT FOUND: destination: INVALID
 */
export async function resolveInviteDestination(
  planId: string,
  userId?: string,
  customClient?: any
): Promise<InviteDestinationResult> {
  const client = customClient || supabase;
  const cleanId = cleanPlanIdentifier(planId);
  const resolution = await resolveUserPlanParticipant(cleanId, userId, client);

  // Case: Existing participant who is already INVITED
  // Navigate directly to Home screen where the card appears
  if (resolution.status === "INVITED") {
    return {
      destination: "HOME",
      status: resolution.status,
      planId: resolution.planId,
    };
  }

  // Case B: Existing participant who is already part of the plan with an attendance state:
  // HOST, JOINED, WAITLISTED, or SKIPPED
  // Retain existing state and open their plan details in Plan Preview
  if (
    resolution.status === "HOST" ||
    resolution.status === "JOINED" ||
    resolution.status === "WAITLISTED" ||
    resolution.status === "SKIPPED"
  ) {
    return {
      destination: "PLAN_PREVIEW",
      status: resolution.status,
      planId: resolution.planId,
    };
  }

  // Case A: No participant record yet
  // Atomically claim the invite via RPC:
  // Any user who opens a shared plan link is placed in the INVITED state regardless of capacity/limits.
  // Navigate directly to the Home screen (destination: HOME) where the invited plan appears immediately.
  if (resolution.status === "NO_PARTICIPANT") {
    if (resolution.error === "Not authenticated") {
      return {
        destination: "INVALID",
        status: "NO_PARTICIPANT",
        planId: resolution.planId,
        error: "Not authenticated",
      };
    }
    const claimResult = await claimPlanInviteRPC(resolution.planId, client);
    if (claimResult.success) {
      const finalStatus = (claimResult.rsvp_status as ParticipantResolutionStatus) || "INVITED";
      // If RPC detected caller is already participating with an attendance state, open Plan Preview
      if (
        claimResult.already_participating &&
        (finalStatus === "HOST" || finalStatus === "JOINED" || finalStatus === "WAITLISTED" || finalStatus === "SKIPPED")
      ) {
        return {
          destination: "PLAN_PREVIEW",
          status: finalStatus,
          planId: resolution.planId,
          claimResult,
        };
      }

      return {
        destination: "HOME",
        status: "INVITED",
        planId: resolution.planId,
        claimResult,
      };
    } else {
      return {
        destination: "INVALID",
        status: "PLAN_INACTIVE",
        planId: resolution.planId,
        claimResult,
        error: claimResult.error,
      };
    }
  }

  // Invalid, cancelled, completed, or not found
  return {
    destination: "INVALID",
    status: resolution.status,
    planId: resolution.planId,
    error: resolution.error || "Plan unavailable",
  };
}

