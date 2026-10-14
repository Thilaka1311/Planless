import { supabase } from "../../../../lib/supabaseClient";
import { isUuid } from "./planUtils";

export interface VerifyPlanHostOptions {
  planId: string;
  matchedPlan?: any;
  userId?: string | null;
  dbPlanParticipants?: any[];
  resolveUserUuid?: (id: string) => string;
  rpcCheck?: (planUuid: string, userUuid: string) => Promise<boolean>;
  getAuthUserUuid?: () => Promise<string | null>;
}

/**
 * Authoritatively verifies whether the active user is an authorized host of a plan.
 * 
 * In Planless, host authorization is governed by:
 * 1. Plan-level mapping (isOwner flag, hostId, or joined member with role === 'HOST')
 * 2. Canonical dbPlanParticipants state (role === 'HOST' AND rsvp_status === 'JOINED')
 * 3. Authoritative database RPC fallback (`public.is_plan_host(plan_id, user_id)`)
 * 
 * Non-hosts, participants without joined RSVP status, or unauthorized users return false.
 */
export async function verifyPlanHostAuthorization({
  planId,
  matchedPlan,
  userId,
  dbPlanParticipants = [],
  resolveUserUuid,
  rpcCheck,
  getAuthUserUuid,
}: VerifyPlanHostOptions): Promise<boolean> {
  const activeUserUuidResolved = (resolveUserUuid && userId ? resolveUserUuid(userId) : userId) || userId || "";
  if (!activeUserUuidResolved) {
    return false;
  }

  const planUuid = matchedPlan?.dbUuid || matchedPlan?.id || planId;

  // 1. Direct match on plan object properties
  if (matchedPlan) {
    if (matchedPlan.isOwner === true) {
      return true;
    }

    const hostUuid = resolveUserUuid
      ? resolveUserUuid(matchedPlan.hostId || matchedPlan.creatorId || "")
      : (matchedPlan.hostId || matchedPlan.creatorId || "");

    if (hostUuid && (hostUuid === activeUserUuidResolved || hostUuid === userId)) {
      return true;
    }

    if (matchedPlan.members && Array.isArray(matchedPlan.members)) {
      const isHostMember = matchedPlan.members.some((m: any) => {
        const mUid = resolveUserUuid
          ? resolveUserUuid(m.userId || m.userUuid || m.id || "")
          : (m.userId || m.userUuid || m.id || "");

        const isHostRole = m.isHost === true || m.role === "HOST";
        const isJoined = !m.rsvp_status || m.rsvp_status === "JOINED" || m.joinState === "JOINED";
        const matchesUser =
          (mUid && (mUid === activeUserUuidResolved || mUid === userId)) ||
          (m.userId && (m.userId === activeUserUuidResolved || m.userId === userId)) ||
          (m.userUuid && (m.userUuid === activeUserUuidResolved || m.userUuid === userId)) ||
          (m.id && (m.id === activeUserUuidResolved || m.id === userId));

        return isHostRole && isJoined && Boolean(matchesUser);
      });

      if (isHostMember) {
        return true;
      }
    }
  }

  // 2. Canonical dbPlanParticipants state (source of truth in Planless)
  if (dbPlanParticipants && dbPlanParticipants.length > 0) {
    const participantRecord = dbPlanParticipants.find((pp: any) => {
      const matchesPlan = pp.plan_id === planUuid || pp.plan_id === planId;
      if (!matchesPlan) return false;

      const ppUserResolved = resolveUserUuid ? resolveUserUuid(pp.user_id) : pp.user_id;
      return (
        pp.user_id === activeUserUuidResolved ||
        pp.user_id === userId ||
        ppUserResolved === activeUserUuidResolved ||
        ppUserResolved === userId
      );
    });

    if (participantRecord) {
      return participantRecord.role === "HOST" && participantRecord.rsvp_status === "JOINED";
    }
  }

  // 3. Authoritative database RPC fallback if local state is missing, stale, or unhydrated
  try {
    let candidateUserId = isUuid(activeUserUuidResolved) ? activeUserUuidResolved : undefined;

    if (!candidateUserId) {
      if (getAuthUserUuid) {
        const fetchedId = await getAuthUserUuid();
        if (fetchedId && isUuid(fetchedId)) {
          candidateUserId = fetchedId;
        }
      } else {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user?.id && isUuid(authData.user.id)) {
          candidateUserId = authData.user.id;
        }
      }
    }

    if (candidateUserId && isUuid(candidateUserId) && isUuid(planUuid)) {
      if (rpcCheck) {
        return await rpcCheck(planUuid, candidateUserId);
      }

      const { data, error } = await supabase.rpc("is_plan_host", {
        p_plan_id: planUuid,
        p_user_id: candidateUserId,
      });

      if (!error && typeof data === "boolean") {
        return data;
      }
    }
  } catch (err) {
    console.warn("[verifyPlanHostAuthorization] is_plan_host RPC check failed:", err);
  }

  return false;
}
