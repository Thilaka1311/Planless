import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { Plan } from "../../../core/types";
import { subscribeToChatReadEvents } from "../utils/chatReads";

export interface UseUnreadChatsCountParams {
  userUuid: string | null;
  activeUserId?: string | null;
  plans?: Plan[];
}

/**
 * Calculates the number of separate chat conversations that contain unread messages.
 * Rule: Count each Plan chat at most once, regardless of how many unread messages it contains.
 * Example: Chat A (5 unreads), Chat B (2 unreads), Chat C (1 unread) => 3 unread chats.
 */
export function calculateUnreadChatsCount(unreadMap: Record<string, number>): number {
  return Object.values(unreadMap).filter((count) => count > 0).length;
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
  if (!["text", "cost", "poll"].includes(newMsg.message_type)) return prev;

  const isMe = Boolean(userUuid && (newMsg.sender_id === userUuid || allMyUserIds.has(newMsg.sender_id)));
  if (isMe) return prev;

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
  readPlanId: string
): Record<string, number> {
  const targetKey = prev[readPlanId] !== undefined ? readPlanId : Object.keys(prev).find((k) => k === readPlanId);
  if (!targetKey || prev[targetKey] === 0) return prev;
  return {
    ...prev,
    [targetKey]: 0,
  };
}

/**
 * Custom React Hook: useUnreadChatsCount
 * 
 * Computes the number of distinct chat conversations that contain unread messages
 * for the current user (NOT the total number of unread messages).
 * 
 * Reuses existing plan_chat_reads and get_user_chat_summaries RPC architecture.
 * Updates reactively via Realtime and local synchronous chat read events.
 */
export function useUnreadChatsCount({
  userUuid,
  activeUserId,
  plans = [],
}: UseUnreadChatsCountParams): number {
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

  const allMyUserIds = useMemo(() => {
    const ids = new Set<string>();
    if (userUuid) ids.add(userUuid);
    if (activeUserId) ids.add(activeUserId);
    return ids;
  }, [userUuid, activeUserId]);

  // Set of plan IDs (app ID and dbUuid) where the user is an involved participant (host or member)
  const involvedPlanIds = useMemo(() => {
    const set = new Set<string>();
    for (const plan of plans) {
      const isHost =
        Boolean(plan.creatorId && allMyUserIds.has(plan.creatorId)) ||
        Boolean(plan.hostId && allMyUserIds.has(plan.hostId));

      const isMember = (plan.members || []).some((m) => {
        const mId = m.userId || m.userUuid || (m as any).user_id;
        return Boolean(mId && allMyUserIds.has(mId));
      });

      if (isHost || isMember) {
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
          setUnreadMap(map);
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
            setUnreadMap((prev) => handleChatReadInUnreadMap(prev, readRecord.plan_id));
          }
        }
      )
      .subscribe();

    // 4. Synchronous local chat read event (clears badge immediately when chat is opened)
    const unsubscribeLocalReads = subscribeToChatReadEvents((readPlanId) => {
      setUnreadMap((prev) => handleChatReadInUnreadMap(prev, readPlanId));
    });

    return () => {
      isMounted = false;
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(readsChannel);
      unsubscribeLocalReads();
    };
  }, [userUuid, allMyUserIds, involvedPlanIds]);

  // Compute number of separate chat conversations that contain unread messages
  const unreadChatsCount = useMemo(() => {
    return calculateUnreadChatsCount(unreadMap);
  }, [unreadMap]);

  return unreadChatsCount;
}
