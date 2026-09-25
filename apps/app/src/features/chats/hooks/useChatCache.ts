import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { DbPlanActivity, DbPlanParticipant, SystemMessageType } from "../../../core/types";

export interface ChatMessage {
  id: string;
  plan_id: string;
  sender_id: string;
  message_type: "text" | "system" | "poll" | "cost";
  system_message_type?: SystemMessageType | null;
  content: string;
  created_at: string;
  updated_at?: string | null;
}

export interface PlanUnreadInfo {
  firstUnreadId: string | null;
  latestUnreadId: string | null;
  count: number;
  lastReadAt: string | null;
  lastReadMessageId: string | null;
}

interface PlanCacheItem<T> {
  data: T;
  loading: boolean;
  lastSynced: number;
}

interface PlanCacheStore {
  messages: Map<string, PlanCacheItem<ChatMessage[]>>;
  participants: Map<string, PlanCacheItem<DbPlanParticipant[]>>;
  activities: Map<string, PlanCacheItem<DbPlanActivity[]>>;
  unreadInfo: Map<string, PlanUnreadInfo>;
}

// Module-level shared in-memory cache stores
const planCache: PlanCacheStore = {
  messages: new Map(),
  participants: new Map(),
  activities: new Map(),
  unreadInfo: new Map(),
};

// Global listeners maps for reactive re-renders
const listeners = {
  messages: new Map<string, Set<() => void>>(),
  participants: new Map<string, Set<() => void>>(),
  activities: new Map<string, Set<() => void>>(),
  unreadInfo: new Map<string, Set<() => void>>(),
};

const notifyListeners = (category: keyof PlanCacheStore, planUuid: string) => {
  const categoryListeners = listeners[category]?.get(planUuid);
  if (categoryListeners) {
    categoryListeners.forEach((fn) => fn());
  }
};

/**
 * Access cached messages synchronously without triggering network fetch
 */
export const getCachedMessages = (planUuid: string): ChatMessage[] => {
  if (!planUuid) return [];
  return planCache.messages.get(planUuid)?.data || [];
};

/**
 * Access cached unread info synchronously without triggering network fetch
 */
export const getCachedUnreadInfo = (planUuid: string): PlanUnreadInfo | undefined => {
  if (!planUuid) return undefined;
  return planCache.unreadInfo.get(planUuid);
};

/**
 * Save or update cached unread info for a plan
 */
export const setCachedUnreadInfo = (planUuid: string, info: PlanUnreadInfo) => {
  if (!planUuid) return;
  planCache.unreadInfo.set(planUuid, info);
  notifyListeners("unreadInfo", planUuid);
};

/**
 * Reset unread info for a plan when marked as read
 */
export const markPlanChatReadInCache = (planUuid: string, latestMessageId?: string | null) => {
  if (!planUuid) return;
  const existing = planCache.unreadInfo.get(planUuid);
  planCache.unreadInfo.set(planUuid, {
    count: 0,
    firstUnreadId: null,
    latestUnreadId: null,
    lastReadAt: new Date().toISOString(),
    lastReadMessageId: latestMessageId || existing?.lastReadMessageId || null,
  });
  notifyListeners("unreadInfo", planUuid);
};

/**
 * Append or update a message in cache in realtime (called globally across the app)
 */
export const appendMessageToCache = (newMsg: ChatMessage, currentUserId?: string) => {
  if (!newMsg || !newMsg.plan_id) return;
  const planUuid = newMsg.plan_id;

  // 1. Update message list cache
  let currentCache = planCache.messages.get(planUuid);
  if (!currentCache) {
    currentCache = {
      data: [newMsg],
      loading: false,
      lastSynced: Date.now(),
    };
    planCache.messages.set(planUuid, currentCache);
  } else {
    const alreadyExists = currentCache.data.some(
      (m) =>
        m.id === newMsg.id ||
        (m.id.startsWith("temp-") && m.content === newMsg.content && m.sender_id === newMsg.sender_id)
    );

    if (alreadyExists) {
      currentCache.data = currentCache.data.map((m) =>
        m.id.startsWith("temp-") && m.content === newMsg.content && m.sender_id === newMsg.sender_id
          ? newMsg
          : m
      );
    } else {
      currentCache.data = [...currentCache.data, newMsg];
    }
    currentCache.lastSynced = Date.now();
  }
  notifyListeners("messages", planUuid);

  // 2. Update unread cache if message is from another participant
  const isFromOther = !currentUserId || newMsg.sender_id !== currentUserId;
  const isEligible = ["text", "cost", "poll"].includes(newMsg.message_type);

  if (isFromOther && isEligible) {
    const unread = planCache.unreadInfo.get(planUuid);
    if (unread) {
      planCache.unreadInfo.set(planUuid, {
        ...unread,
        count: unread.count + 1,
        firstUnreadId: unread.count === 0 ? newMsg.id : unread.firstUnreadId,
        latestUnreadId: newMsg.id,
      });
    } else {
      planCache.unreadInfo.set(planUuid, {
        count: 1,
        firstUnreadId: newMsg.id,
        latestUnreadId: newMsg.id,
        lastReadAt: null,
        lastReadMessageId: null,
      });
    }
    notifyListeners("unreadInfo", planUuid);
  }
};

/**
 * Manually invalidate or clear cache for a specific plan or all plans
 */
export const invalidatePlanCache = (planUuid?: string, category?: keyof PlanCacheStore) => {
  if (planUuid) {
    if (category) {
      planCache[category].delete(planUuid);
      notifyListeners(category, planUuid);
    } else {
      planCache.messages.delete(planUuid);
      planCache.participants.delete(planUuid);
      planCache.activities.delete(planUuid);
      planCache.unreadInfo.delete(planUuid);
      notifyListeners("messages", planUuid);
      notifyListeners("participants", planUuid);
      notifyListeners("activities", planUuid);
      notifyListeners("unreadInfo", planUuid);
    }
  } else {
    planCache.messages.clear();
    planCache.participants.clear();
    planCache.activities.clear();
    planCache.unreadInfo.clear();
    listeners.messages.forEach((set) => set.forEach((fn) => fn()));
    listeners.participants.forEach((set) => set.forEach((fn) => fn()));
    listeners.activities.forEach((set) => set.forEach((fn) => fn()));
    listeners.unreadInfo.forEach((set) => set.forEach((fn) => fn()));
  }
};

// Alias for backwards compatibility
export const invalidateChatCache = (planUuid?: string) => invalidatePlanCache(planUuid, "messages");

/**
 * Custom React Hook: useChatCache
 * Single source of truth for persistent in-memory chat messages and Realtime sync.
 */
export function useChatCache(targetPlanUuid: string) {
  const [, setTick] = useState(0);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (!targetPlanUuid) return;

    if (!listeners.messages.has(targetPlanUuid)) {
      listeners.messages.set(targetPlanUuid, new Set());
    }

    const rerender = () => setTick((t) => t + 1);
    listeners.messages.get(targetPlanUuid)!.add(rerender);

    return () => {
      const planListeners = listeners.messages.get(targetPlanUuid);
      if (planListeners) {
        planListeners.delete(rerender);
        if (planListeners.size === 0) {
          listeners.messages.delete(targetPlanUuid);
        }
      }
    };
  }, [targetPlanUuid]);

  const cachedState = targetPlanUuid ? planCache.messages.get(targetPlanUuid) : undefined;
  const messages = cachedState?.data || [];
  // If cache already has data, don't show loading screen - render cache-first immediately!
  const loading = cachedState ? (cachedState.loading && cachedState.data.length === 0) : true;

  const fetchMessages = useCallback(
    async (force = false) => {
      if (!targetPlanUuid || isFetchingRef.current) return;

      const existing = planCache.messages.get(targetPlanUuid);
      const now = Date.now();

      // Don't spam fetches if synced less than 1.5 seconds ago
      if (existing && !force && existing.lastSynced > 0 && now - existing.lastSynced < 1500) {
        return;
      }

      isFetchingRef.current = true;

      if (!existing) {
        planCache.messages.set(targetPlanUuid, {
          data: [],
          loading: true,
          lastSynced: 0,
        });
        notifyListeners("messages", targetPlanUuid);
      }

      try {
        const { data, error } = await supabase
          .from("plan_messages")
          .select("id, plan_id, sender_id, message_type, content, created_at, updated_at, system_message_type")
          .eq("plan_id", targetPlanUuid)
          .order("created_at", { ascending: true });

        if (error) {
          console.error("[useChatCache] Error fetching plan_messages:", error);
        } else if (data) {
          const current = planCache.messages.get(targetPlanUuid);
          const currentData = current?.data || [];
          const optimisticMsgs = currentData.filter((m) => m.id.startsWith("temp-"));
          const serverMsgs = data as ChatMessage[];
          const merged = [...serverMsgs, ...optimisticMsgs];

          const isDifferent =
            currentData.length !== merged.length ||
            (currentData.length > 0 && merged.length > 0 && currentData[currentData.length - 1].id !== merged[merged.length - 1].id);

          planCache.messages.set(targetPlanUuid, {
            data: merged,
            loading: false,
            lastSynced: Date.now(),
          });

          if (isDifferent || !current || current.loading) {
            notifyListeners("messages", targetPlanUuid);
          }
        }
      } catch (err) {
        console.error("[useChatCache] Exception fetching plan_messages:", err);
      } finally {
        isFetchingRef.current = false;
        const state = planCache.messages.get(targetPlanUuid);
        if (state && state.loading) {
          state.loading = false;
          notifyListeners("messages", targetPlanUuid);
        }
      }
    },
    [targetPlanUuid]
  );

  useEffect(() => {
    fetchMessages();

    if (!targetPlanUuid) return;

    const channel = supabase.channel(`plan_messages_room:${targetPlanUuid}`);

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "plan_messages",
          filter: `plan_id=eq.${targetPlanUuid}`,
        },
        (payload) => {
          const eventType = payload.eventType;
          const currentCache = planCache.messages.get(targetPlanUuid);
          if (!currentCache) return;

          if (eventType === "INSERT") {
            const newMsg = payload.new as ChatMessage;
            if (newMsg.plan_id !== targetPlanUuid) return;

            const alreadyExists = currentCache.data.some(
              (m) =>
                m.id === newMsg.id ||
                (m.id.startsWith("temp-") && m.content === newMsg.content && m.sender_id === newMsg.sender_id)
            );

            if (alreadyExists) {
              currentCache.data = currentCache.data.map((m) =>
                m.id.startsWith("temp-") && m.content === newMsg.content && m.sender_id === newMsg.sender_id
                  ? newMsg
                  : m
              );
            } else {
              currentCache.data = [...currentCache.data, newMsg];
            }

            currentCache.lastSynced = Date.now();
            notifyListeners("messages", targetPlanUuid);
          } else if (eventType === "UPDATE") {
            const updatedMsg = payload.new as ChatMessage;
            if (updatedMsg.plan_id !== targetPlanUuid) return;

            currentCache.data = currentCache.data.map((m) =>
              m.id === updatedMsg.id ? updatedMsg : m
            );
            currentCache.lastSynced = Date.now();
            notifyListeners("messages", targetPlanUuid);
          } else if (eventType === "DELETE") {
            const oldMsg = payload.old as { id?: string };
            if (!oldMsg.id) return;

            currentCache.data = currentCache.data.filter((m) => m.id !== oldMsg.id);
            currentCache.lastSynced = Date.now();
            notifyListeners("messages", targetPlanUuid);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          const errMsg = err?.message || String(err || "");
          if (!errMsg.includes("socket closed") && !errMsg.includes("1006")) {
            console.warn("[useChatCache] Realtime channel subscription issue, refetching...", errMsg);
          }
          fetchMessages(true);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetPlanUuid, fetchMessages]);

  const appendOptimisticMessage = useCallback(
    (message: ChatMessage) => {
      if (!targetPlanUuid) return;
      const currentCache = planCache.messages.get(targetPlanUuid);
      if (currentCache) {
        currentCache.data = [...currentCache.data, message];
        notifyListeners("messages", targetPlanUuid);
      }
    },
    [targetPlanUuid]
  );

  const removeOptimisticMessage = useCallback(
    (tempId: string) => {
      if (!targetPlanUuid) return;
      const currentCache = planCache.messages.get(targetPlanUuid);
      if (currentCache) {
        currentCache.data = currentCache.data.filter((m) => m.id !== tempId);
        notifyListeners("messages", targetPlanUuid);
      }
    },
    [targetPlanUuid]
  );

  const replaceOptimisticMessage = useCallback(
    (tempId: string, realMsg: ChatMessage) => {
      if (!targetPlanUuid) return;
      const currentCache = planCache.messages.get(targetPlanUuid);
      if (currentCache) {
        currentCache.data = currentCache.data.map((m) => (m.id === tempId ? realMsg : m));
        notifyListeners("messages", targetPlanUuid);
      }
    },
    [targetPlanUuid]
  );

  return {
    messages,
    loading,
    refetch: () => fetchMessages(true),
    appendOptimisticMessage,
    removeOptimisticMessage,
    replaceOptimisticMessage,
  };
}

/**
 * Custom React Hook: useActivityCache
 * [TEMPORARILY DISABLED]: Plan Activity system is disabled.
 * Zero database queries and zero realtime channel subscriptions.
 */
export function useActivityCache(_targetPlanUuid: string) {
  return {
    rawActivities: [] as DbPlanActivity[],
    loading: false,
    refetch: async () => {},
  };
}

/**
 * Custom React Hook: useParticipantsCache
 * Single source of truth for persistent in-memory plan participants and Realtime sync.
 */
export function useParticipantsCache(targetPlanUuid: string) {
  const [, setTick] = useState(0);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (!targetPlanUuid) return;

    if (!listeners.participants.has(targetPlanUuid)) {
      listeners.participants.set(targetPlanUuid, new Set());
    }

    const rerender = () => setTick((t) => t + 1);
    listeners.participants.get(targetPlanUuid)!.add(rerender);

    return () => {
      const planListeners = listeners.participants.get(targetPlanUuid);
      if (planListeners) {
        planListeners.delete(rerender);
        if (planListeners.size === 0) {
          listeners.participants.delete(targetPlanUuid);
        }
      }
    };
  }, [targetPlanUuid]);

  const cachedState = targetPlanUuid ? planCache.participants.get(targetPlanUuid) : undefined;
  const participants = cachedState?.data || [];
  const loading = cachedState ? cachedState.loading : true;

  const fetchParticipants = useCallback(
    async (force = false) => {
      if (!targetPlanUuid || isFetchingRef.current) return;

      const existing = planCache.participants.get(targetPlanUuid);
      if (existing && !force && existing.lastSynced > 0) {
        return;
      }

      isFetchingRef.current = true;

      if (!existing) {
        planCache.participants.set(targetPlanUuid, {
          data: [],
          loading: true,
          lastSynced: 0,
        });
        notifyListeners("participants", targetPlanUuid);
      }

      try {
        const { data, error } = await supabase
          .from("plan_participants")
          .select("*")
          .eq("plan_id", targetPlanUuid);

        if (error) {
          console.error("[useParticipantsCache] Error fetching plan_participants:", error);
        } else if (data) {
          planCache.participants.set(targetPlanUuid, {
            data: data as unknown as DbPlanParticipant[],
            loading: false,
            lastSynced: Date.now(),
          });
          notifyListeners("participants", targetPlanUuid);
        }
      } catch (err) {
        console.error("[useParticipantsCache] Exception fetching plan_participants:", err);
      } finally {
        isFetchingRef.current = false;
        const state = planCache.participants.get(targetPlanUuid);
        if (state && state.loading) {
          state.loading = false;
          notifyListeners("participants", targetPlanUuid);
        }
      }
    },
    [targetPlanUuid]
  );

  useEffect(() => {
    fetchParticipants();

    if (!targetPlanUuid) return;

    const channel = supabase.channel(`plan_participants_room:${targetPlanUuid}`);

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "plan_participants",
          filter: `plan_id=eq.${targetPlanUuid}`,
        },
        (payload) => {
          const eventType = payload.eventType;
          const currentCache = planCache.participants.get(targetPlanUuid);
          if (!currentCache) return;

          if (eventType === "INSERT") {
            const newPart = payload.new as DbPlanParticipant;
            if (newPart.plan_id !== targetPlanUuid) return;

            if (!currentCache.data.some((p) => p.id === newPart.id)) {
              currentCache.data = [...currentCache.data, newPart];
              currentCache.lastSynced = Date.now();
              notifyListeners("participants", targetPlanUuid);
            }
          } else if (eventType === "UPDATE") {
            const updatedPart = payload.new as DbPlanParticipant;
            if (updatedPart.plan_id !== targetPlanUuid) return;

            currentCache.data = currentCache.data.map((p) =>
              p.id === updatedPart.id ? updatedPart : p
            );
            currentCache.lastSynced = Date.now();
            notifyListeners("participants", targetPlanUuid);
          } else if (eventType === "DELETE") {
            const oldPart = payload.old as { id?: string };
            if (!oldPart.id) return;

            currentCache.data = currentCache.data.filter((p) => p.id !== oldPart.id);
            currentCache.lastSynced = Date.now();
            notifyListeners("participants", targetPlanUuid);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          const errMsg = err?.message || String(err || "");
          if (!errMsg.includes("socket closed") && !errMsg.includes("1006")) {
            console.warn("[useParticipantsCache] Realtime channel subscription issue, refetching...", errMsg);
          }
          fetchParticipants(true);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetPlanUuid, fetchParticipants]);

  return {
    participants,
    loading,
    refetch: () => fetchParticipants(true),
  };
}

