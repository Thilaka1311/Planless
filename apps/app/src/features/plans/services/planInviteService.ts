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

/**
 * Retrieves the stored pending invite token (plan UUID) from localStorage.
 */
export function getStoredPendingInviteToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(PENDING_INVITE_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Persists the pending invite token (plan UUID) in localStorage.
 */
export function setStoredPendingInviteToken(token: string): void {
  if (typeof window === "undefined" || !token) return;
  try {
    localStorage.setItem(PENDING_INVITE_TOKEN_KEY, token.trim());
  } catch (e) {
    console.warn("[planInviteService] Failed to store pending invite token:", e);
  }
}

/**
 * Clears the stored pending invite token from localStorage.
 */
export function clearStoredPendingInviteToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
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
export async function claimPlanInviteRPC(planId: string): Promise<ClaimInviteResult> {
  if (!planId) {
    return { success: false, error: "Missing plan ID" };
  }

  const { data, error } = await supabase.rpc("claim_plan_invite" as any, {
    p_plan_id: planId.trim(),
  });

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

