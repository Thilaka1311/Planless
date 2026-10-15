import { useState, useEffect, useCallback } from "react";
import { QuickPlan, QuickPlanList } from "../../../core/types";
import {
  getCachedQuickPlans,
  getCachedQuickPlanLists,
  fetchUserQuickPlans,
  fetchUserQuickPlanLists,
  createQuickPlan as apiCreateQuickPlan,
  deleteQuickPlan as apiDeleteQuickPlan,
  createQuickPlanList as apiCreateQuickPlanList,
  updateQuickPlanList as apiUpdateQuickPlanList,
  deleteQuickPlanList as apiDeleteQuickPlanList,
  CreateQuickPlanInput,
  CreateQuickPlanListInput,
  QUICK_PLANS_UPDATED_EVENT,
} from "../services/quickPlanService";

const QUICK_PLANS_CACHE_TTL_MS = 30000; // 30-second TTL window
const lastFetchTimestamps = new Map<string, number>();
const inFlightFetches = new Map<string, Promise<[QuickPlanList[], QuickPlan[]]>>();

export function invalidateQuickPlansFetchCache(userId?: string) {
  if (userId) {
    lastFetchTimestamps.delete(userId);
    inFlightFetches.delete(userId);
  } else {
    lastFetchTimestamps.clear();
    inFlightFetches.clear();
  }
}

export function useQuickPlans(userId?: string) {
  const [quickPlans, setQuickPlans] = useState<QuickPlan[]>(() => {
    if (!userId) return [];
    return getCachedQuickPlans(userId);
  });

  const [quickPlanLists, setQuickPlanLists] = useState<QuickPlanList[]>(() => {
    if (!userId) return [];
    return getCachedQuickPlanLists(userId);
  });

  const [loading, setLoading] = useState(false);

  // Sync state with local cache immediately when userId becomes available
  useEffect(() => {
    if (!userId) {
      setQuickPlans([]);
      setQuickPlanLists([]);
      return;
    }
    // Synchronously hydrate from disk/memory cache
    setQuickPlans(getCachedQuickPlans(userId));
    setQuickPlanLists(getCachedQuickPlanLists(userId));

    // If data was fetched within TTL window, reuse existing data without network spam
    const lastFetch = lastFetchTimestamps.get(userId) || 0;
    const isFresh = Date.now() - lastFetch < QUICK_PLANS_CACHE_TTL_MS;
    if (isFresh && !inFlightFetches.has(userId)) {
      return;
    }

    let isMounted = true;
    setLoading(true);

    let fetchPromise = inFlightFetches.get(userId);
    if (!fetchPromise) {
      fetchPromise = Promise.all([
        fetchUserQuickPlanLists(userId),
        fetchUserQuickPlans(userId),
      ])
        .then((result) => {
          lastFetchTimestamps.set(userId, Date.now());
          inFlightFetches.delete(userId);
          return result;
        })
        .catch((err) => {
          inFlightFetches.delete(userId);
          throw err;
        });
      inFlightFetches.set(userId, fetchPromise);
    }

    fetchPromise
      .then(([freshLists, freshPlans]) => {
        if (isMounted) {
          setQuickPlanLists(freshLists);
          setQuickPlans(freshPlans);
        }
      })
      .catch((err) => {
        console.warn("[useQuickPlans] Background refresh failed, continuing with cache:", err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    const handleUpdate = () => {
      if (isMounted && userId) {
        lastFetchTimestamps.delete(userId);
        inFlightFetches.delete(userId);
        setQuickPlans(getCachedQuickPlans(userId));
        setQuickPlanLists(getCachedQuickPlanLists(userId));
      }
    };

    window.addEventListener(QUICK_PLANS_UPDATED_EVENT, handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener(QUICK_PLANS_UPDATED_EVENT, handleUpdate);
    };
  }, [userId]);

  const createPlan = useCallback(
    async (input: CreateQuickPlanInput, participantIds: string[] = []) => {
      const created = await apiCreateQuickPlan(input, participantIds);
      if (userId) {
        invalidateQuickPlansFetchCache(userId);
        setQuickPlans(getCachedQuickPlans(userId));
        setQuickPlanLists(getCachedQuickPlanLists(userId));
      }
      return created;
    },
    [userId]
  );

  const deletePlan = useCallback(
    async (quickPlanId: string) => {
      if (!userId) return;
      await apiDeleteQuickPlan(quickPlanId, userId);
      invalidateQuickPlansFetchCache(userId);
      setQuickPlans(getCachedQuickPlans(userId));
      setQuickPlanLists(getCachedQuickPlanLists(userId));
    },
    [userId]
  );

  const createList = useCallback(
    async (input: CreateQuickPlanListInput) => {
      const created = await apiCreateQuickPlanList(input);
      if (userId) {
        invalidateQuickPlansFetchCache(userId);
        setQuickPlanLists(getCachedQuickPlanLists(userId));
      }
      return created;
    },
    [userId]
  );

  const updateList = useCallback(
    async (listId: string, updates: { name?: string; description?: string | null }) => {
      if (!userId) return;
      const updated = await apiUpdateQuickPlanList(listId, userId, updates);
      invalidateQuickPlansFetchCache(userId);
      setQuickPlanLists(getCachedQuickPlanLists(userId));
      return updated;
    },
    [userId]
  );

  const deleteList = useCallback(
    async (listId: string) => {
      if (!userId) return;
      await apiDeleteQuickPlanList(listId, userId);
      invalidateQuickPlansFetchCache(userId);
      setQuickPlanLists(getCachedQuickPlanLists(userId));
      setQuickPlans(getCachedQuickPlans(userId));
    },
    [userId]
  );

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      invalidateQuickPlansFetchCache(userId);
      const [freshLists, freshPlans] = await Promise.all([
        fetchUserQuickPlanLists(userId),
        fetchUserQuickPlans(userId),
      ]);
      lastFetchTimestamps.set(userId, Date.now());
      setQuickPlanLists(freshLists);
      setQuickPlans(freshPlans);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return {
    quickPlans,
    quickPlanLists,
    loading,
    createQuickPlan: createPlan,
    deleteQuickPlan: deletePlan,
    createList,
    updateList,
    deleteList,
    refresh,
  };
}
