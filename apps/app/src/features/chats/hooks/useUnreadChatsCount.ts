import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { Plan, DbPlanParticipant } from "../../../core/types";
import { subscribeToChatReadEvents } from "../utils/chatReads";
import { getCachedUnreadInfo } from "./useChatCache";

export interface UseUnreadChatsCountParams {
  userUuid: string | null;
  activeUserId?: string | null;
  plans?: Plan[];
  dbPlanParticipants?: DbPlanParticipant[];
}

/**
 * Checks whether a plan is currently active/current.
 * Excludes COMPLETED, CANCELLED, and CANCELED plans.
 */
export function isPlanActive(plan?: { status?: string; is_cancelled?: boolean; is_completed?: boolean } | null): boolean {
  if (!plan) return false;
  if (plan.is_cancelled || plan.is_completed) return false;
  const status = (plan.status || "").toUpperCase().trim();
  if (status === "COMPLETED" || status === "CANCELLED" || status === "CANCELED") {
    return false;
  }
  return true;
}

/**
 * Checks whether a user is an involved participant (host or member) of a plan.
 */
export function isUserInvolvedInPlan(
  plan: Plan,
  allMyUserIds: Set<string>,
  participantMap?: Map<string, DbPlanParticipant>
): boolean {
  if (!allMyUserIds || allMyUserIds.size === 0) return true;

  if (participantMap) {
    const myParticipant = participantMap.get(plan.id) || (plan.dbUuid ? participantMap.get(plan.dbUuid) : undefined);
    if (myParticipant) return true;
  }

  const isHost =
    Boolean(plan.creatorId && allMyUserIds.has(plan.creatorId)) ||
    Boolean(plan.hostId && allMyUserIds.has(plan.hostId)) ||
    Boolean((plan as any).host_id && allMyUserIds.has((plan as any).host_id)) ||
    Boolean((plan as any).created_by && allMyUserIds.has((plan as any).created_by));

  if (isHost) return true;

  const isMember = (plan.members || []).some((m) => {
    const mId = m.userId || m.userUuid || (m as any).user_id || (m as any).id;
    return Boolean(mId && allMyUserIds.has(mId));
  });

  return isMember;
}

/**
 * Canonical source/filter logic matching ChatsScreen:
 * Filters plans strictly to those currently visible in the Chats screen:
 * - Must NOT be cancelled (CANCELLED / CANCELED / is_cancelled)
 * - Must NOT be completed/past (COMPLETED / is_completed)
 * - Current user must be involved as host, member, or participant
 */
export function getVisibleChatPlans(
  plans: Plan[],
  allMyUserIds: Set<string>,
  dbPlanParticipants?: DbPlanParticipant[]
): Plan[] {
  if (!plans || plans.length === 0) return [];

  const participantMap = new Map<string, DbPlanParticipant>();
  if (dbPlanParticipants && dbPlanParticipants.length > 0 && allMyUserIds && allMyUserIds.size > 0) {
    dbPlanParticipants.forEach((pp) => {
      if (pp.user_id && allMyUserIds.has(pp.user_id) && pp.plan_id) {
        participantMap.set(pp.plan_id, pp);
      }
    });
  }

  return plans.filter((p) => {
    if (!isPlanActive(p)) return false;
    return isUserInvolvedInPlan(p, allMyUserIds, participantMap);
  });
}

/**
 * Calculates the NUMBER OF VISIBLE CHAT CONVERSATIONS with at least one unread message
 * for the bottom navigation Chat badge.
 *
 * Rules:
 * - Only includes chats that are currently shown on the Chats screen.
 * - Completed, cancelled, and past plans contribute 0.
 * - Each chat/conversation contributes a maximum of 1 to the badge,
 *   regardless of how many unread messages it has.
 * - If a chat has no unread messages, it contributes 0.
 * - Example: Chat A (5 unread) + Chat B (3 unread) + Chat C (1 unread) → badge = 3 (NOT 9).
 */
export function calculateUnreadChatsCount(
  unreadMap: Record<string, number>,
  plans?: Plan[],
  allMyUserIds?: Set<string>,
  dbPlanParticipants?: DbPlanParticipant[]
): number {
  if (!unreadMap || Object.keys(unreadMap).length === 0) return 0;
  if (!plans || plans.length === 0) return 0;

  const effectiveUserIds = allMyUserIds || new Set<string>();
  const visiblePlans = getVisibleChatPlans(plans, effectiveUserIds, dbPlanParticipants);

  let visibleChatsWithUnread = 0;
  const seenPlanKeys = new Set<string>();

  for (const plan of visiblePlans) {
    const planKey = plan.dbUuid || plan.id;
    if (!planKey || seenPlanKeys.has(planKey)) {
      continue;
    }
    seenPlanKeys.add(planKey);
    if (plan.id) seenPlanKeys.add(plan.id);
    if (plan.dbUuid) seenPlanKeys.add(plan.dbUuid);

    let count = 0;
    if (plan.dbUuid && typeof unreadMap[plan.dbUuid] === "number") {
      count = Math.max(count, unreadMap[plan.dbUuid]);
    }
    if (plan.id && typeof unreadMap[plan.id] === "number") {
      count = Math.max(count, unreadMap[plan.id]);
    }

    // Each visible chat with unread messages contributes strictly 1 to the badge
    if (count > 0) {
      visibleChatsWithUnread += 1;
    }
  }

  return visibleChatsWithUnread;
}

/**
 * Pure helper: Computes next unread map when a new chat message arrives.
 */
export function handleIncomingMessageToUnreadMap(
  prev: Record<string, number>,
  newMsg: { plan_id: string; sender_id: string; message_type: string },
  userUuid: string | null,
  allMyUserIds: Set<string>,
  involvedPlanIds?: Set<string>
): Record<string, number> {
  if (!newMsg || !newMsg.plan_id) return prev;
  const isSystem = newMsg.message_type === "system";
  if (!isSystem && !["text", "cost", "poll"].includes(newMsg.message_type)) return prev;

  const isMe = Boolean(userUuid && (newMsg.sender_id === userUuid || allMyUserIds.has(newMsg.sender_id)));
  if (!isSystem && isMe) return prev;

  // If involved plans set is populated, ensure message belongs to a plan the user is involved in
  if (involvedPlanIds && involvedPlanIds.size > 0 && !involvedPlanIds.has(newMsg.plan_id)) {
    return prev;
  }

  const current = prev[newMsg.plan_id] || 0;
  return {
    ...prev,
    [newMsg.plan_id]: current + 1,
  };
}

/**
 * Pure helper: Resets a chat's unread count to 0 when marked as read.
 */
export function handleChatReadInUnreadMap(
  prev: Record<string, number>,
  readPlanId: string,
  plans?: Plan[]
): Record<string, number> {
  const keysToReset = new Set<string>();
  if (prev[readPlanId] !== undefined) {
    keysToReset.add(readPlanId);
  }
  if (plans) {
    const matchedPlan = plans.find((p) => p.id === readPlanId || p.dbUuid === readPlanId);
    if (matchedPlan) {
      if (matchedPlan.id && prev[matchedPlan.id] !== undefined) keysToReset.add(matchedPlan.id);
      if (matchedPlan.dbUuid && prev[matchedPlan.dbUuid] !== undefined) keysToReset.add(matchedPlan.dbUuid);
    }
  }

  if (keysToReset.size === 0) {
    const fallbackKey = Object.keys(prev).find((k) => k === readPlanId);
    if (fallbackKey && prev[fallbackKey] > 0) {
      return { ...prev, [fallbackKey]: 0 };
    }
    return prev;
  }

  let hasChange = false;
  const next = { ...prev };
  keysToReset.forEach((k) => {
    if (next[k] !== 0) {
      next[k] = 0;
      hasChange = true;
    }
  });

  return hasChange ? next : prev;
}

/**
 * Custom React Hook: useUnreadChatsCount
 *
 * Computes the NUMBER OF VISIBLE CHAT CONVERSATIONS with unread messages
 * for the bottom navigation Chat badge.
 *
 * Each conversation contributes max 1 to the badge regardless of message count.
 * Example: Chat A (5 unread) + Chat B (3 unread) = badge of 2, not 8.
 *
 * Strictly synchronized with the ChatsScreen visible plan filtering logic.
 * Updates reactively via Realtime and local synchronous chat read events.
 */
export function useUnreadChatsCount({
  userUuid,
  activeUserId,
  plans = [],
  dbPlanParticipants,
}: UseUnreadChatsCountParams): number {
  const allMyUserIds = useMemo(() => {
    const ids = new Set<string>();
    if (userUuid) ids.add(userUuid);
    if (activeUserId) ids.add(activeUserId);
    return ids;
  }, [userUuid, activeUserId]);

  // Seed state immediately from in-memory cache for instantaneous local-first render
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>(() => {
    const initialMap: Record<string, number> = {};
    for (const p of plans || []) {
      const pid = p.dbUuid || p.id;
      const unread = getCachedUnreadInfo(pid);
      if (unread && typeof unread.count === "number") {
        initialMap[pid] = unread.count;
      }
    }
    return initialMap;
  });

  // Set of plan IDs (app ID and dbUuid) where the user is an involved participant (host or member)
  const involvedPlanIds = useMemo(() => {
    const set = new Set<string>();
    for (const plan of plans) {
      if (isUserInvolvedInPlan(plan, allMyUserIds)) {
        if (plan.id) set.add(plan.id);
        if (plan.dbUuid) set.add(plan.dbUuid);
      }
    }
    return set;
  }, [plans, allMyUserIds]);

  useEffect(() => {
    if (!userUuid) {
      setUnreadMap({});
      return;
    }

    let isMounted = true;

    // 1. Initial fetch from canonical get_user_chat_summaries RPC
    const fetchSummaries = async () => {
      try {
        const { data, error } = await supabase.rpc("get_user_chat_summaries", {
          p_user_id: userUuid,
        });

        if (error) {
          console.error("[useUnreadChatsCount] Error fetching chat summaries:", error);
          return;
        }

        if (data && Array.isArray(data) && isMounted) {
          const map: Record<string, number> = {};
          for (const row of data) {
            if (row.plan_id) {
              const count = Number(row.unread_count || 0);
              map[row.plan_id] = count;
            }
          }
          setUnreadMap((prev) => ({ ...prev, ...map }));
        }
      } catch (err) {
        console.error("[useUnreadChatsCount] Exception fetching chat summaries:", err);
      }
    };

    fetchSummaries();

    // 2. Realtime subscription to plan_messages (new incoming messages)
    const messagesChannel = supabase
      .channel("public:plan_messages_unread_badge")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "plan_messages",
        },
        (payload) => {
          const newMsg = payload.new as any;
          if (!newMsg) return;

          setUnreadMap((prev) =>
            handleIncomingMessageToUnreadMap(prev, newMsg, userUuid, allMyUserIds, involvedPlanIds)
          );
        }
      )
      .subscribe();

    // 3. Realtime subscription to plan_chat_reads for current user
    const readsChannel = supabase
      .channel(`public:plan_chat_reads_badge:${userUuid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "plan_chat_reads",
          filter: `user_id=eq.${userUuid}`,
        },
        (payload) => {
          const readRecord = payload.new as any;
          if (readRecord && readRecord.plan_id) {
            setUnreadMap((prev) => handleChatReadInUnreadMap(prev, readRecord.plan_id, plans));
          }
        }
      )
      .subscribe();

    // 4. Synchronous local chat read event (clears badge immediately when chat is opened)
    const unsubscribeLocalReads = subscribeToChatReadEvents((readPlanId) => {
      setUnreadMap((prev) => handleChatReadInUnreadMap(prev, readPlanId, plans));
    });

    return () => {
      isMounted = false;
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(readsChannel);
      unsubscribeLocalReads();
    };
  }, [userUuid, allMyUserIds, involvedPlanIds, plans]);

  // Compute number of visible chat conversations strictly matching ChatsScreen
  const unreadChatsCount = useMemo(() => {
    return calculateUnreadChatsCount(unreadMap, plans, allMyUserIds, dbPlanParticipants);
  }, [unreadMap, plans, allMyUserIds, dbPlanParticipants]);

  return unreadChatsCount;
}
