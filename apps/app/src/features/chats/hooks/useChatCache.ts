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

interface PlanCacheItem<T> {
  data: T;
  loading: boolean;
  lastSynced: number;
}

interface PlanCacheStore {
  messages: Map<string, PlanCacheItem<ChatMessage[]>>;
  participants: Map<string, PlanCacheItem<DbPlanParticipant[]>>;
  activities: Map<string, PlanCacheItem<DbPlanActivity[]>>;
}

// Module-level shared in-memory cache stores
const planCache: PlanCacheStore = {
  messages: new Map(),
  participants: new Map(),
  activities: new Map(),
};

// Global listeners maps for reactive re-renders
const listeners = {
  messages: new Map<string, Set<() => void>>(),
  participants: new Map<string, Set<() => void>>(),
  activities: new Map<string, Set<() => void>>(),
};

const notifyListeners = (category: keyof PlanCacheStore, planUuid: string) => {
  const categoryListeners = listeners[category].get(planUuid);
  if (categoryListeners) {
    categoryListeners.forEach((fn) => fn());
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
      notifyListeners("messages", planUuid);
      notifyListeners("participants", planUuid);
      notifyListeners("activities", planUuid);
    }
  } else {
    planCache.messages.clear();
    planCache.participants.clear();
    planCache.activities.clear();
    listeners.messages.forEach((set) => set.forEach((fn) => fn()));
    listeners.participants.forEach((set) => set.forEach((fn) => fn()));
    listeners.activities.forEach((set) => set.forEach((fn) => fn()));
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
  const loading = cachedState ? cachedState.loading : true;

  const fetchMessages = useCallback(
    async (force = false) => {
      if (!targetPlanUuid || isFetchingRef.current) return;

      const existing = planCache.messages.get(targetPlanUuid);
      if (existing && !force && existing.lastSynced > 0) {
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
          planCache.messages.set(targetPlanUuid, {
            data: data as ChatMessage[],
            loading: false,
            lastSynced: Date.now(),
          });
          notifyListeners("messages", targetPlanUuid);
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
 * Single source of truth for persistent in-memory activity timeline events and Realtime sync.
 */
export function useActivityCache(targetPlanUuid: string) {
  const [, setTick] = useState(0);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (!targetPlanUuid) return;

    if (!listeners.activities.has(targetPlanUuid)) {
      listeners.activities.set(targetPlanUuid, new Set());
    }

    const rerender = () => setTick((t) => t + 1);
    listeners.activities.get(targetPlanUuid)!.add(rerender);

    return () => {
      const planListeners = listeners.activities.get(targetPlanUuid);
      if (planListeners) {
        planListeners.delete(rerender);
        if (planListeners.size === 0) {
          listeners.activities.delete(targetPlanUuid);
        }
      }
    };
  }, [targetPlanUuid]);

  const cachedState = targetPlanUuid ? planCache.activities.get(targetPlanUuid) : undefined;
  const rawActivities = cachedState?.data || [];
  const loading = cachedState ? cachedState.loading : true;

  const fetchActivities = useCallback(
    async (force = false) => {
      if (!targetPlanUuid || isFetchingRef.current) return;

      const existing = planCache.activities.get(targetPlanUuid);
      if (existing && !force && existing.lastSynced > 0) {
        return;
      }

      isFetchingRef.current = true;

      if (!existing) {
        planCache.activities.set(targetPlanUuid, {
          data: [],
          loading: true,
          lastSynced: 0,
        });
        notifyListeners("activities", targetPlanUuid);
      }

      try {
        const { data, error } = await supabase
          .from("plan_activity")
          .select("*")
          .eq("plan_id", targetPlanUuid)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("[useActivityCache] Error fetching plan_activity:", error);
        } else if (data) {
          planCache.activities.set(targetPlanUuid, {
            data: data as DbPlanActivity[],
            loading: false,
            lastSynced: Date.now(),
          });
          notifyListeners("activities", targetPlanUuid);
        }
      } catch (err) {
        console.error("[useActivityCache] Exception fetching plan_activity:", err);
      } finally {
        isFetchingRef.current = false;
        const state = planCache.activities.get(targetPlanUuid);
        if (state && state.loading) {
          state.loading = false;
          notifyListeners("activities", targetPlanUuid);
        }
      }
    },
    [targetPlanUuid]
  );

  useEffect(() => {
    fetchActivities();

    if (!targetPlanUuid) return;

    const channel = supabase.channel(`plan_activity_room:${targetPlanUuid}`);

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "plan_activity",
          filter: `plan_id=eq.${targetPlanUuid}`,
        },
        (payload) => {
          const eventType = payload.eventType;
          const currentCache = planCache.activities.get(targetPlanUuid);
          if (!currentCache) return;

          if (eventType === "INSERT") {
            const newAct = payload.new as DbPlanActivity;
            if (newAct.plan_id !== targetPlanUuid) return;

            if (!currentCache.data.some((a) => a.id === newAct.id)) {
              currentCache.data = [newAct, ...currentCache.data];
              currentCache.lastSynced = Date.now();
              notifyListeners("activities", targetPlanUuid);
            }
          } else if (eventType === "UPDATE") {
            const updatedAct = payload.new as DbPlanActivity;
            if (updatedAct.plan_id !== targetPlanUuid) return;

            currentCache.data = currentCache.data.map((a) =>
              a.id === updatedAct.id ? updatedAct : a
            );
            currentCache.lastSynced = Date.now();
            notifyListeners("activities", targetPlanUuid);
          } else if (eventType === "DELETE") {
            const oldAct = payload.old as { id?: string };
            if (!oldAct.id) return;

            currentCache.data = currentCache.data.filter((a) => a.id !== oldAct.id);
            currentCache.lastSynced = Date.now();
            notifyListeners("activities", targetPlanUuid);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          const errMsg = err?.message || String(err || "");
          if (!errMsg.includes("socket closed") && !errMsg.includes("1006")) {
            console.warn("[useActivityCache] Realtime channel subscription issue, refetching...", errMsg);
          }
          fetchActivities(true);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetPlanUuid, fetchActivities]);

  return {
    rawActivities,
    loading,
    refetch: () => fetchActivities(true),
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

