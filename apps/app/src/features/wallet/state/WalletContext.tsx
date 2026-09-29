import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo, useRef } from "react";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { supabase } from "../../../../lib/supabaseClient";
import { updateExpenseDetailCache } from "../screens/ExpenseDetail";

interface WalletState {
  dbWalletTransactions: any[];
  dbWalletPaidTransactions: any[];
  dbWalletSettlements: any[];
  dbPlansLocal: any[];
  dbPlanParticipantsLocal: any[];
  dbUsersLocal: any[];
  loading: boolean;
  error: string | null;
  walletBalance?: number;
  transactions?: any[];
  dbTransactions?: any[];
  setDbTransactions?: any;
  refreshTransactions: (reason?: string, sourceEvent?: string) => Promise<void>;
  ensureLoaded: () => Promise<void>;
  isLoaded: boolean;
  updateExpenseInStore: (expenseId: string, updatedFields: {
    title?: string;
    total_amount?: number;
    plan_id?: string;
    participants?: any[];
  }) => void;
}

const WalletContext = createContext<WalletState | undefined>(undefined);

export const WalletProvider = ({
  children,
  userId = ""
}: {
  children: ReactNode;
  userId?: string;
}) => {
  const { activeUserUuid } = useProfileStore();

  const [dbWalletTransactions, setDbWalletTransactions] = useState<any[]>([]);
  const [dbWalletPaidTransactions, setDbWalletPaidTransactions] = useState<any[]>([]);
  const [dbWalletSettlements, setDbWalletSettlements] = useState<any[]>([]);
  const [dbPlansLocal, setDbPlansLocal] = useState<any[]>([]);
  const dbPlansLocalRef = useRef<any[]>([]);
  dbPlansLocalRef.current = dbPlansLocal;
  const [dbPlanParticipantsLocal, setDbPlanParticipantsLocal] = useState<any[]>([]);
  const [dbUsersLocal, setDbUsersLocal] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const isLoadedRef = useRef<boolean>(false);
  const loadedUserRef = useRef<string | null>(null);

  const updateExpenseInStore = useCallback((expenseId: string, updatedFields: {
    title?: string;
    total_amount?: number;
    plan_id?: string;
    participants?: any[];
  }) => {
    setDbWalletTransactions((prevExpenses) => {
      return prevExpenses.map((exp) => {
        if (exp.id !== expenseId) return exp;
        const nextTitle = updatedFields.title ?? exp.title;
        const nextTotalAmount = updatedFields.total_amount ?? exp.total_amount;
        const nextPlanId = updatedFields.plan_id ?? exp.plan_id;
        const nextParticipants = updatedFields.participants ?? exp.participants ?? exp.wallet_expense_participants;

        return {
          ...exp,
          title: nextTitle,
          total_amount: nextTotalAmount,
          plan_id: nextPlanId,
          participants: nextParticipants,
          wallet_expense_participants: nextParticipants,
        };
      });
    });

    // Synchronize in-memory expense detail cache
    updateExpenseDetailCache(expenseId, updatedFields);
  }, []);

  const refreshTransactions = useCallback(async (reason: string = "initial_load", sourceEvent: string = "") => {
    setLoading(true);
    setError(null);

    try {
      let resolvedUuid = activeUserUuid;

      // 1. If activeUserUuid is short or public_id format (e.g. "U001" or "U000198"), resolve Postgres UUID
      const isUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (activeUserUuid && !isUuidRegex.test(activeUserUuid)) {
        const { data: userMatch, error: userMatchErr } = await supabase
          .from("users")
          .select("id")
          .or(`public_id.eq.${activeUserUuid},user_id.eq.${activeUserUuid},username.eq.${activeUserUuid}`)
          .maybeSingle();

        if (userMatchErr) {
          console.error("[Wallet ERROR] Error resolving Postgres UUID:", {
            message: userMatchErr.message,
            code: userMatchErr.code,
            details: userMatchErr.details,
            hint: userMatchErr.hint
          });
        }
        if (userMatch?.id) {
          resolvedUuid = userMatch.id;
        }
      }

      // Early exit if no valid active user UUID
      if (!resolvedUuid) {
        setDbWalletTransactions([]);
        setDbWalletPaidTransactions([]);
        setDbWalletSettlements([]);
        setDbPlansLocal([]);
        setDbPlanParticipantsLocal([]);
        setDbUsersLocal([]);
        setLoading(false);
        return;
      }

      // 2. Discover relevant plan and expense associations concurrently
      // - Query user's plan participation (fast index scan on user_id)
      // - Query user's settlements (payer or receiver)
      // - Query user's expense participant allocations (expenses where user owes / shares cost)
      const settlementsSelectQuery = `
        *,
        allocations:wallet_settlement_allocations(
          id,
          amount,
          expense_participant_id,
          expense_participant:wallet_expense_participants(
            id,
            expense_id,
            expense:wallet_expenses(
              id,
              title,
              expense_type
            )
          )
        )
      `;

      const [myPartRes, settlementsRes, myExpPartsRes] = await Promise.all([
        supabase
          .from("plan_participants")
          .select("plan_id")
          .eq("user_id", resolvedUuid),
        (supabase as any)
          .from("wallet_settlements")
          .select(settlementsSelectQuery)
          .or(`payer_id.eq.${resolvedUuid},receiver_id.eq.${resolvedUuid}`)
          .order("created_at", { ascending: false }),
        supabase
          .from("wallet_expense_participants")
          .select("expense_id")
          .eq("user_id", resolvedUuid),
      ]);

      if (myPartRes.error) {
        console.error("[Wallet ERROR] Error fetching user plan_participants:", myPartRes.error);
      }
      if (settlementsRes.error) {
        console.error("[Wallet ERROR] Error fetching wallet_settlements:", settlementsRes.error);
      }
      if (myExpPartsRes.error) {
        console.error("[Wallet ERROR] Error fetching user wallet_expense_participants:", myExpPartsRes.error);
      }

      const settlementsData = settlementsRes.data || [];
      setDbWalletSettlements(settlementsData);

      const userPlanIds = Array.from(
        new Set((myPartRes.data || []).map((pp: any) => pp.plan_id).filter(Boolean))
      );
      const settlementPlanIds = (settlementsData || []).map((s: any) => s.plan_id).filter(Boolean);
      const candidatePlanIds = Array.from(new Set([...userPlanIds, ...settlementPlanIds]));
      const userExpenseIds = Array.from(
        new Set((myExpPartsRes.data || []).map((ep: any) => ep.expense_id).filter(Boolean))
      );

      // 3. Query wallet_expenses scoped to the active user's participation, payer role, and relevant plans
      const selectQuery = `
        *,
        payer:users!payer_id(id, full_name, profile_photo_path, username, public_id),
        plan:plans!plan_id(id, title, total_cost, cover_image)
      `;

      const expenseOrFilters: string[] = [`payer_id.eq.${resolvedUuid}`];
      if (candidatePlanIds.length > 0) {
        expenseOrFilters.push(`plan_id.in.(${candidatePlanIds.join(",")})`);
      }
      if (userExpenseIds.length > 0) {
        expenseOrFilters.push(`id.in.(${userExpenseIds.join(",")})`);
      }

      const { data: allExp, error: allErr } = await supabase
        .from("wallet_expenses")
        .select(selectQuery)
        .or(expenseOrFilters.join(","));

      if (allErr) {
        console.error("[Wallet ERROR] Supabase error in wallet_expenses query:", allErr);
        setError(allErr.message);
      }

      let expenses: any[] = allExp || [];

      // 3b. Query wallet_expense_participants scoped strictly to the fetched expense IDs
      const expIds: string[] = expenses.map((e: any) => e.id).filter(Boolean);
      let expParticipants: any[] = [];

      if (expIds.length > 0) {
        const { data: ptData, error: ptErr } = await supabase
          .from("wallet_expense_participants")
          .select("*")
          .in("expense_id", expIds);

        if (ptErr) {
          console.error("[Wallet ERROR] Supabase error fetching wallet_expense_participants:", ptErr);
        } else {
          expParticipants = ptData || [];
        }
      }

      // Attach fetched participants directly to each expense object
      expenses = expenses.map((exp: any) => {
        const matchingParts = expParticipants.filter((pt: any) => pt.expense_id === exp.id);
        return {
          ...exp,
          participants: matchingParts,
          wallet_expense_participants: matchingParts,
        };
      });

      setDbWalletTransactions(expenses || []);

      // Synchronize in-memory expense detail cache for all refreshed expenses from DB / Realtime
      (expenses || []).forEach((exp: any) => {
        if (exp && exp.id) {
          updateExpenseDetailCache(exp.id, {
            title: exp.title,
            total_amount: exp.total_amount,
            plan_id: exp.plan_id,
            participants: exp.participants || exp.wallet_expense_participants,
          });
        }
      });

      setDbWalletPaidTransactions([]);

      // 4. Scope plan_participants strictly to all relevant plans (candidate plans + any expense plans)
      const expensePlanIds = (expenses || []).map((e: any) => e.plan_id).filter(Boolean);
      const allPlanIds = Array.from(new Set([...candidatePlanIds, ...expensePlanIds]));

      let participants: any[] = [];
      if (allPlanIds.length > 0) {
        const { data: planParts, error: planPartsErr } = await supabase
          .from("plan_participants")
          .select("*")
          .in("plan_id", allPlanIds);

        if (planPartsErr) {
          console.error("[Wallet ERROR] Supabase error fetching plan_participants for relevant plans:", planPartsErr);
        } else {
          participants = planParts || [];
        }
      }

      // 5. Scope users and plans to relevant entities only, with empty-state safety (no global fallback scans)
      const payerIds = Array.from(new Set((expenses || []).map((e: any) => e.payer_id).filter(Boolean)));
      const settlementUserIds = (settlementsData || []).flatMap((s: any) => [s.payer_id, s.receiver_id]).filter(Boolean);
      const participantUserIds = Array.from(
        new Set(
          (expenses || [])
            .flatMap((e: any) => (e.participants || []).map((p: any) => p.user_id))
            .filter(Boolean)
        )
      );
      const planParticipantUserIds = (participants || []).map((pp: any) => pp.user_id).filter(Boolean);

      const userIds = Array.from(
        new Set([...payerIds, ...participantUserIds, ...settlementUserIds, ...planParticipantUserIds, resolvedUuid].filter(Boolean))
      );

      const fetchPromises: Promise<any>[] = [
        userIds.length > 0
          ? Promise.resolve(supabase.from("users").select("*").in("id", userIds))
          : Promise.resolve({ data: [] }),
        allPlanIds.length > 0
          ? Promise.resolve(supabase.from("plans").select("*").in("id", allPlanIds))
          : Promise.resolve({ data: [] }),
      ];

      const [{ data: users }, { data: plans }] = await Promise.all(fetchPromises);

      setDbUsersLocal(users || []);
      setDbPlansLocal(plans || []);
      setDbPlanParticipantsLocal(participants || []);
      loadedUserRef.current = activeUserUuid || null;
      isLoadedRef.current = true;
      setIsLoaded(true);
    } catch (err: any) {
      console.error("[Wallet ERROR] Exception loading wallet data:", err);
      setError(err.message || "Failed to load wallet data");
    } finally {
      setLoading(false);
    }
  }, [activeUserUuid]);

  const ensureLoaded = useCallback(async () => {
    if (isLoadedRef.current && loadedUserRef.current === activeUserUuid) {
      return;
    }
    await refreshTransactions("ensure_loaded");
  }, [activeUserUuid, refreshTransactions]);

  // Reset wallet state when active user changes or logs out
  useEffect(() => {
    if (loadedUserRef.current && loadedUserRef.current !== activeUserUuid) {
      loadedUserRef.current = null;
      isLoadedRef.current = false;
      setIsLoaded(false);
      setDbWalletTransactions([]);
      setDbWalletPaidTransactions([]);
      setDbWalletSettlements([]);
      setDbPlansLocal([]);
      setDbPlanParticipantsLocal([]);
      setDbUsersLocal([]);
    }
  }, [activeUserUuid]);

  useEffect(() => {
    const channelName = `wallet_expenses_changes:${activeUserUuid || "anonymous"}`;
    let realtimeCoalesceTimer: NodeJS.Timeout | null = null;

    const triggerCoalescedRefresh = (reason: string, sourceEvent: string) => {
      // Defer realtime updates if wallet data has not been initially loaded for the active user
      if (!isLoadedRef.current) return;

      if (realtimeCoalesceTimer) clearTimeout(realtimeCoalesceTimer);
      realtimeCoalesceTimer = setTimeout(() => {
        realtimeCoalesceTimer = null;
        refreshTransactions(reason, sourceEvent);
      }, 50);
    };

    // Subscribe to realtime updates on wallet_expenses, wallet_expense_participants, wallet_settlements, and plan_participants
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallet_expenses" },
        () => {
          triggerCoalescedRefresh("realtime", "wallet_expenses");
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallet_expense_participants" },
        () => {
          triggerCoalescedRefresh("realtime", "wallet_expense_participants");
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallet_settlements" },
        () => {
          triggerCoalescedRefresh("realtime", "wallet_settlements");
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plan_participants" },
        (payload: any) => {
          const newRec = payload.new;
          const oldRec = payload.old;
          const participantUserId = newRec?.user_id || oldRec?.user_id;
          const participantPlanId = newRec?.plan_id || oldRec?.plan_id;
          const isMe = Boolean(activeUserUuid && participantUserId === activeUserUuid);
          const isMyPlan = Boolean(participantPlanId && dbPlansLocalRef.current.some(p => p.id === participantPlanId));
          if (isMe || isMyPlan) {
            triggerCoalescedRefresh("realtime", "plan_participants");
          }
        }
      )
      .subscribe();

    return () => {
      if (realtimeCoalesceTimer) clearTimeout(realtimeCoalesceTimer);
      supabase.removeChannel(channel);
    };
  }, [refreshTransactions, activeUserUuid]);

  const contextValue = useMemo(() => ({
    dbWalletTransactions,
    dbWalletPaidTransactions,
    dbWalletSettlements,
    dbPlansLocal,
    dbPlanParticipantsLocal,
    dbUsersLocal,
    loading,
    error,
    refreshTransactions,
    ensureLoaded,
    isLoaded,
    updateExpenseInStore,
  }), [
    dbWalletTransactions, dbWalletPaidTransactions, dbWalletSettlements, dbPlansLocal, dbPlanParticipantsLocal, dbUsersLocal, loading, error, refreshTransactions, ensureLoaded, isLoaded, updateExpenseInStore
  ]);

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWalletStore = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWalletStore must be used within a WalletProvider");
  }
  return context;
};

