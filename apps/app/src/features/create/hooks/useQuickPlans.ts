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
    setQuickPlans(getCachedQuickPlans(userId));
    setQuickPlanLists(getCachedQuickPlanLists(userId));

    let isMounted = true;
    setLoading(true);

    Promise.all([
      fetchUserQuickPlanLists(userId),
      fetchUserQuickPlans(userId),
    ])
      .then(([freshLists, freshPlans]) => {
        if (isMounted) {
          setQuickPlanLists(freshLists);
          setQuickPlans(freshPlans);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    const handleUpdate = () => {
      if (isMounted && userId) {
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
      setQuickPlans(getCachedQuickPlans(userId));
      setQuickPlanLists(getCachedQuickPlanLists(userId));
    },
    [userId]
  );

  const createList = useCallback(
    async (input: CreateQuickPlanListInput) => {
      const created = await apiCreateQuickPlanList(input);
      if (userId) {
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
      setQuickPlanLists(getCachedQuickPlanLists(userId));
      return updated;
    },
    [userId]
  );

  const deleteList = useCallback(
    async (listId: string) => {
      if (!userId) return;
      await apiDeleteQuickPlanList(listId, userId);
      setQuickPlanLists(getCachedQuickPlanLists(userId));
      setQuickPlans(getCachedQuickPlans(userId));
    },
    [userId]
  );

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [freshLists, freshPlans] = await Promise.all([
        fetchUserQuickPlanLists(userId),
        fetchUserQuickPlans(userId),
      ]);
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
