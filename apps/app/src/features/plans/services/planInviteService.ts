import { supabase } from "../../../../lib/supabaseClient";

const BASE_URL = "https://planless.app";

export const PENDING_INVITE_TOKEN_KEY = "planless_pending_invite_token";

/**
 * Returns the full sharable invite URL for a plan using its UUID.
 */
export function buildInviteUrl(planId: string): string {
  const cleanId = planId.trim();
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/join/${cleanId}`;
  }
  return `${BASE_URL}/join/${cleanId}`;
}

/**
 * Extracts a plan invite token (plan UUID) from a URL or pathname (e.g. /join/<plan_id>).
 */
export function extractInviteTokenFromPath(pathname?: string | null): string | null {
  if ((pathname === undefined || pathname === null) && typeof window !== "undefined") {
    pathname = window.location.pathname;
  }
  if (!pathname) return null;
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts[0]?.toLowerCase() === "join" && parts[1]) {
    return decodeURIComponent(parts[1]).trim() || null;
  }
  return null;
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
    return storage.getItem(PENDING_INVITE_TOKEN_KEY);
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
  try {
    storage.setItem(PENDING_INVITE_TOKEN_KEY, token.trim());
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
  plan_size?: number;
  new_plan_size?: number;
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
  console.log('[INVITE_TRACE] claimPlanInviteRPC: calling RPC claim_plan_invite with p_plan_id=', planId.trim());
  const { data, error } = await client.rpc("claim_plan_invite" as any, {
    p_plan_id: planId.trim(),
  });

  console.log('[INVITE_TRACE] claimPlanInviteRPC: raw response data=', JSON.stringify(data), '| error=', error ? JSON.stringify(error) : null);

  if (error) {
    console.error("[planInviteService] claimPlanInviteRPC failed:", error);
    return { success: false, error: error.message };
  }

  const res = data as ClaimInviteResult;
  return {
    success: Boolean(res?.success),
    plan_id: res?.plan_id || planId.trim(),
    rsvp_status: res?.rsvp_status,
    assigned_group: res?.assigned_group,
    waitlist_position: res?.waitlist_position,
    plan_size: res?.plan_size ?? res?.new_plan_size,
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
  const cleanId = planId ? planId.trim() : "";
  if (!cleanId) {
    return { status: "PLAN_NOT_FOUND", planId: "", error: "Missing plan ID" };
  }

  let resolvedUserId = userId;
  if (!resolvedUserId) {
    try {
      const { data: authData } = await client.auth.getUser();
      resolvedUserId = authData?.user?.id;
      console.log('[INVITE_TRACE] resolveUserPlanParticipant: no userId passed, got from auth.getUser()=', resolvedUserId);
    } catch {
      // Ignore auth fetch error, checked below
    }
  } else {
    console.log('[INVITE_TRACE] resolveUserPlanParticipant: planId=', cleanId, '| userId=', resolvedUserId);
  }

  if (!resolvedUserId) {
    return { status: "NO_PARTICIPANT", planId: cleanId, error: "Not authenticated" };
  }

  // 1. Check if user already has a participant record for this plan
  const { data: partData, error: partError } = await client
    .from("plan_participants")
    .select("role, rsvp_status, assigned_group, waitlist_position")
    .eq("plan_id", cleanId)
    .eq("user_id", resolvedUserId)
    .maybeSingle();

  console.log('[INVITE_TRACE] resolveUserPlanParticipant: plan_participants query result: partData=', JSON.stringify(partData), '| partError=', partError ? JSON.stringify(partError) : null);

  if (!partError && partData) {
    const roleNorm = (partData.role || "").toUpperCase();
    if (roleNorm === "HOST") {
      return { status: "HOST", planId: cleanId, participant: partData };
    }

    const rsvpNorm = (partData.rsvp_status || "").toUpperCase();
    if (rsvpNorm === "JOINED") {
      return { status: "JOINED", planId: cleanId, participant: partData };
    }
    if (rsvpNorm === "WAITLISTED") {
      return { status: "WAITLISTED", planId: cleanId, participant: partData };
    }
    if (rsvpNorm === "SKIPPED") {
      return { status: "SKIPPED", planId: cleanId, participant: partData };
    }
    if (rsvpNorm === "INVITED") {
      return { status: "INVITED", planId: cleanId, participant: partData };
    }

    // Default existing participant fallback
    return { status: "INVITED", planId: cleanId, participant: partData };
  }

  // 2. No participant row: verify plan exists and is active
  const { data: planData, error: planError } = await client
    .from("plans")
    .select("id, status, title")
    .eq("id", cleanId)
    .maybeSingle();

  if (planError || !planData) {
    return { status: "PLAN_NOT_FOUND", planId: cleanId, error: "Plan not found" };
  }

  if (planData.status !== "LIVE") {
    return { status: "PLAN_INACTIVE", planId: cleanId, plan: planData, error: "Plan is not active" };
  }

  return { status: "NO_PARTICIPANT", planId: cleanId, plan: planData };
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
 * - NO_PARTICIPANT: Claims the invite atomically via RPC -> destination: PLAN_PREVIEW
 * - INVITED: Keeps INVITED unchanged -> destination: HOME
 * - JOINED, WAITLISTED, SKIPPED, HOST: Does not claim/modify state -> destination: PLAN_PREVIEW
 * - INACTIVE / NOT FOUND: destination: INVALID
 */
export async function resolveInviteDestination(
  planId: string,
  userId?: string,
  customClient?: any
): Promise<InviteDestinationResult> {
  const client = customClient || supabase;
  const resolution = await resolveUserPlanParticipant(planId, userId, client);

  // Cases 3, 4, 5, 6: Existing JOINED / WAITLISTED / SKIPPED / HOST
  // Never redirect to Home. Open that specific plan's Plan Preview screen.
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

  // Case 2: Existing INVITED participant
  // Keep INVITED unchanged. Navigate to Home and show that particular plan.
  if (resolution.status === "INVITED") {
    return {
      destination: "HOME",
      status: "INVITED",
      planId: resolution.planId,
    };
  }

  // Case: No participant row
  // Claim the invite per invite_link.md:
  // When a person opens an invite link without an existing participant row,
  // their RSVP status must ALWAYS be INVITED -> destination: HOME.
  if (resolution.status === "NO_PARTICIPANT") {
    const claimResult = await claimPlanInviteRPC(resolution.planId, client);
    if (claimResult.success) {
      const isWaitlisted = claimResult.rsvp_status === "WAITLISTED";
      return {
        destination: isWaitlisted ? "PLAN_PREVIEW" : "HOME",
        status: (claimResult.rsvp_status as ParticipantResolutionStatus) || "INVITED",
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

