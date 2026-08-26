import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo, useRef } from "react";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { supabase } from "../../../../lib/supabaseClient";
import { updateExpenseDetailCache } from "../screens/ExpenseDetail";

interface WalletState {
  dbWalletTransactions: any[];
  dbWalletPaidTransactions: any[];
  dbWalletSettlements: any[];
  dbPlansLocal: any[];
  dbCirclesLocal: any[];
  dbPlanParticipantsLocal: any[];
  dbUsersLocal: any[];
  loading: boolean;
  error: string | null;
  walletBalance?: number;
  transactions?: any[];
  dbTransactions?: any[];
  setDbTransactions?: any;
  refreshTransactions: () => Promise<void>;
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
  const [dbCirclesLocal, setDbCirclesLocal] = useState<any[]>([]);
  const [dbPlanParticipantsLocal, setDbPlanParticipantsLocal] = useState<any[]>([]);
  const [dbUsersLocal, setDbUsersLocal] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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

      // 2. Query wallet_expenses with payer and plan joined
      const selectQuery = `
        *,
        payer:users!payer_id(id, full_name, profile_photo_path, username, public_id),
        plan:plans!plan_id(id, title, total_cost, cover_image)
      `;

      const { data: allExp, error: allErr } = await supabase
        .from("wallet_expenses")
        .select(selectQuery);

      if (allErr) {
        console.error("[Wallet ERROR] Supabase error in wallet_expenses query:", allErr);
        setError(allErr.message);
      }

      let expenses: any[] = allExp || [];

      // 2b. Direct query to wallet_expense_participants to guarantee participant rows reach state
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

      // 3. Query wallet_settlements with allocations and expense context
      const { data: settlementsData, error: settlementsErr } = await (supabase as any)
        .from("wallet_settlements")
        .select(`
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
        `)
        .order("created_at", { ascending: false });

      if (settlementsErr) {
        console.error("[Wallet ERROR] Supabase error fetching wallet_settlements:", settlementsErr);
      } else {
        setDbWalletSettlements(settlementsData || []);
      }

      // 4. Extract unique plan and user IDs to fetch additional context
      const expensePlanIds = (expenses || []).map((e: any) => e.plan_id).filter(Boolean);
      const payerIds = Array.from(new Set((expenses || []).map((e: any) => e.payer_id).filter(Boolean)));
      const settlementUserIds = (settlementsData || []).flatMap((s: any) => [s.payer_id, s.receiver_id]).filter(Boolean);
      const participantUserIds = Array.from(
        new Set(
          (expenses || [])
            .flatMap((e: any) => (e.participants || []).map((p: any) => p.user_id))
            .filter(Boolean)
        )
      );

      // Fetch all plan_participants first to discover all plans the active user is in
      const { data: participants } = await supabase.from("plan_participants").select("*");

      const userPlanIds = (participants || [])
        .filter((pp: any) => pp.user_id === activeUserUuid)
        .map((pp: any) => pp.plan_id)
        .filter(Boolean);

      const allPlanIds = Array.from(new Set([...expensePlanIds, ...userPlanIds]));

      const planParticipantUserIds = (participants || [])
        .filter((pp: any) => allPlanIds.includes(pp.plan_id))
        .map((pp: any) => pp.user_id)
        .filter(Boolean);

      const userIds = Array.from(
        new Set([...payerIds, ...participantUserIds, ...settlementUserIds, ...planParticipantUserIds, activeUserUuid].filter(Boolean))
      );

      const fetchPromises: Promise<any>[] = [
        userIds.length > 0
          ? Promise.resolve(supabase.from("users").select("*").in("id", userIds))
          : Promise.resolve(supabase.from("users").select("*")),
        allPlanIds.length > 0
          ? Promise.resolve(supabase.from("plans").select("*").in("id", allPlanIds))
          : Promise.resolve(supabase.from("plans").select("*")),
      ];

      const [{ data: users }, { data: plans }] = await Promise.all(fetchPromises);

      setDbUsersLocal(users || []);
      setDbPlansLocal(plans || []);
      setDbPlanParticipantsLocal(participants || []);
      setDbCirclesLocal([]);
    } catch (err: any) {
      console.error("[Wallet ERROR] Exception loading wallet data:", err);
      setError(err.message || "Failed to load wallet data");
    } finally {
      setLoading(false);
    }
  }, [activeUserUuid]);

  const hasInitialLoadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (hasInitialLoadedRef.current !== activeUserUuid) {
      hasInitialLoadedRef.current = activeUserUuid;
      refreshTransactions("initial_load");
    }

    const channelName = "wallet_expenses_changes";
    let realtimeCoalesceTimer: NodeJS.Timeout | null = null;

    const triggerCoalescedRefresh = (reason: string, sourceEvent: string) => {
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
        () => {
          triggerCoalescedRefresh("realtime", "plan_participants");
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
    dbCirclesLocal,
    dbPlanParticipantsLocal,
    dbUsersLocal,
    loading,
    error,
    refreshTransactions,
    updateExpenseInStore,
  }), [
    dbWalletTransactions, dbWalletPaidTransactions, dbWalletSettlements, dbPlansLocal, dbCirclesLocal, dbPlanParticipantsLocal, dbUsersLocal, loading, error, refreshTransactions, updateExpenseInStore
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

