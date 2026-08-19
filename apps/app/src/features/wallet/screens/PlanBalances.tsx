import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Plus, Check, CheckCircle2, ChevronRight } from "lucide-react";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { supabase } from "../../../../lib/supabaseClient";
import { ExpenseDetails, PlanBalancesDetail } from "./ExpenseDetail";
import { SettlementHistoryScreen, SettledExpenseItem } from "./SettlementHistory";
import { getParticipantFinancialState, isJoinedParticipantStatus } from "../services/walletService";

interface PlanDetailsScreenProps {
  planId?: string;
  expenseId?: string;
  onBack: () => void;
  onRefreshBalances: () => void;
  activeUserId: string;
  onSelectPlan: (planId: string) => void;
  onSelectExpense?: (expenseId: string) => void;
}

interface ExpenseGroupedRow {
  id: string;
  expenseTitle: string;
  totalAmount: number;
  payerId: string;
  payerName: string;
  userNetShare: number; // + if owed to user, - if user owes
  settledDisplayAmount: number; // original split / settlement amount before settlement
  isOwed: boolean;
  isSettled: boolean;
  participantCount: number;
  participantsPreview: { userId: string; name: string; avatar: string }[];
  extraParticipantsCount: number;
  subtitleText: string;
  createdAt: string;
  updatedAt: string;
  rawExpense: any;
}

export const PlanDetailsScreen: React.FC<PlanDetailsScreenProps> = ({
  planId,
  expenseId,
  onBack,
  onRefreshBalances,
  activeUserId,
  onSelectPlan,
  onSelectExpense,
}) => {
  const { activeUserUuid } = useProfileStore();

  // Selected expense ID for navigating to Plan balances Detail view
  const [selectedExpenseIdForDetail, setSelectedExpenseIdForDetail] = useState<string | null>(null);
  const [showSettlementHistory, setShowSettlementHistory] = useState(false);

  // Dedicated Database State
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [planDetails, setPlanDetails] = useState<{ id: string; title: string; cover_image?: string } | null>(null);
  const [dbExpenses, setDbExpenses] = useState<any[]>([]);
  const [dbParticipants, setDbParticipants] = useState<any[]>([]);
  const [dbProfiles, setDbProfiles] = useState<any[]>([]);
  const [userPostgresUuid, setUserPostgresUuid] = useState<string>("");
  const [financiallyIncludedUserIds, setFinanciallyIncludedUserIds] = useState<Set<string>>(new Set());
  const [joinedUserIds, setJoinedUserIds] = useState<Set<string>>(new Set());
  const [hasLoadedPlanParticipants, setHasLoadedPlanParticipants] = useState(false);

  // Add Cost modal state
  const [showAddCostSheet, setShowAddCostSheet] = useState(false);
  const [costTitle, setCostTitle] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [submittingCost, setSubmittingCost] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Dedicated Supabase Data Fetcher for Plan Balances
  const loadPlanData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);

    try {
      // 1. Resolve current user's Postgres UUID
      let userUuid = activeUserId || activeUserUuid || "";
      const isUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (userUuid && !isUuidRegex.test(userUuid)) {
        const { data: uMatch } = await supabase
          .from("users")
          .select("id")
          .or(`public_id.eq.${userUuid},user_id.eq.${userUuid},username.eq.${userUuid}`)
          .maybeSingle();

        if (uMatch?.id) {
          userUuid = uMatch.id;
        }
      }

      setUserPostgresUuid(userUuid);

      // 2. Resolve target Plan ID
      let resolvedPlanId = planId || "";
      if (!resolvedPlanId && expenseId) {
        const { data: expMatch } = await supabase
          .from("wallet_expenses")
          .select("plan_id")
          .eq("id", expenseId)
          .maybeSingle();
        if (expMatch?.plan_id) {
          resolvedPlanId = expMatch.plan_id;
        }
      }

      if (!resolvedPlanId) {
        const { data: pFirst } = await supabase.from("plans").select("id").limit(1).maybeSingle();
        if (pFirst?.id) resolvedPlanId = pFirst.id;
      }

      if (!resolvedPlanId) {
        setDataLoading(false);
        return;
      }

      // 3. Fetch Plan Details
      const { data: planRec } = await supabase
        .from("plans")
        .select("id, title, cover_image")
        .eq("id", resolvedPlanId)
        .maybeSingle();

      if (planRec) {
        setPlanDetails(planRec);
      }

      // 4. Fetch all wallet_expenses for this plan_id
      const { data: rawExpData, error: expErr } = await supabase
        .from("wallet_expenses")
        .select("*")
        .eq("plan_id", resolvedPlanId);

      if (expErr) throw expErr;

      const fetchedExp = rawExpData || [];
      setDbExpenses(fetchedExp);

      // 5. Fetch all wallet_expense_participants for these expenses
      const expIds = fetchedExp.map((e: any) => e.id).filter(Boolean);
      let fetchedPts: any[] = [];

      if (expIds.length > 0) {
        const { data: rawPtData, error: ptErr } = await supabase
          .from("wallet_expense_participants")
          .select("*")
          .in("expense_id", expIds);

        if (ptErr) throw ptErr;
        fetchedPts = rawPtData || [];
      }

      setDbParticipants(fetchedPts);

      // 5b. Fetch plan_participants to build financiallyIncludedUserIds set
      const { data: rawPlanPts } = await supabase
        .from("plan_participants")
        .select("user_id, rsvp_status, skip_reason")
        .eq("plan_id", resolvedPlanId);

      const includedSet = new Set<string>();
      const joinedSet = new Set<string>();
      (rawPlanPts || []).forEach((p: any) => {
        const finState = getParticipantFinancialState(p.rsvp_status || p.status, p.skip_reason || p.skipReason);
        if (finState === "ACTIVE") {
          joinedSet.add(p.user_id);
          includedSet.add(p.user_id);
        } else if (finState === "PAYMENT_KEPT") {
          includedSet.add(p.user_id);
        }
      });
      // Always include users with existing split entries so historical splits contribute consistently
      fetchedPts.forEach((pt: any) => {
        if (pt.user_id) includedSet.add(pt.user_id);
      });
      setFinanciallyIncludedUserIds(includedSet);
      setJoinedUserIds(joinedSet);
      setHasLoadedPlanParticipants(true);

      // 6. Fetch profiles for all involved users
      const payerUserIds = fetchedExp.map((e: any) => e.payer_id).filter(Boolean);
      const ptUserIds = fetchedPts.map((p: any) => p.user_id).filter(Boolean);
      const allUserIds = Array.from(new Set([...payerUserIds, ...ptUserIds, userUuid]));

      if (allUserIds.length > 0) {
        const { data: profData } = await supabase
          .from("users")
          .select("id, full_name, profile_photo_path, username, public_id")
          .in("id", allUserIds);

        setDbProfiles(profData || []);
      }
    } catch (err: any) {
      console.error("[PlanBalances] Error loading plan wallet data:", err);
      setDataError(err.message || "Failed to load plan wallet data.");
    } finally {
      setDataLoading(false);
    }
  }, [planId, expenseId, activeUserId, activeUserUuid]);

  useEffect(() => {
    loadPlanData();

    const targetPlan = planId || "";
    const channel = supabase
      .channel(`plan-balances-${targetPlan || "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_expenses" }, () => loadPlanData())
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_expense_participants" }, () => loadPlanData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPlanData, planId]);

  // Group data by EXPENSE & calculate net overall balance
  const { planNetBalance, groupedExpenseRows } = useMemo(() => {
    if (!userPostgresUuid || dbExpenses.length === 0) {
      return { planNetBalance: 0, groupedExpenseRows: [] };
    }

    const profMap = new Map<string, any>();
    dbProfiles.forEach((p) => profMap.set(p.id, p));

    const isMe = (uid: string) => {
      if (!uid) return false;
      const clean = (v: string) => String(v).trim().toLowerCase();
      return clean(uid) === clean(userPostgresUuid);
    };

    let totalNetBalance = 0;
    const rows: ExpenseGroupedRow[] = [];

    dbExpenses.forEach((exp) => {
      const payerIsMe = isMe(exp.payer_id);
      const payerUser = profMap.get(exp.payer_id);
      const payerName = payerIsMe ? "You" : payerUser?.full_name || payerUser?.username || "Payer";

      const rawTitle = exp.title ? String(exp.title).trim() : "";
      const isPlanJoining =
        exp.expense_type === "PLAN_EXPENSE" ||
        rawTitle === "Plan Fee" ||
        rawTitle === "Plan Expense" ||
        (!rawTitle && !exp.message_id);
      const expenseTitle = isPlanJoining ? "Plan Fee" : (rawTitle || "Shared Expense");

      const expPts = dbParticipants.filter((p) => {
        if (p.expense_id !== exp.id) return false;
        // Strictly exclude users who are not financially included in plan_participants
        if (hasLoadedPlanParticipants && !financiallyIncludedUserIds.has(p.user_id)) {
          return false;
        }
        const isPayer = p.user_id === exp.payer_id || (payerIsMe && isMe(p.user_id));
        if (!isPayer) {
          const amountOwed = Number(p.amount_owed || 0);
          const pStatus = String(p.status || "PENDING").toUpperCase();
          if (amountOwed <= 0 && pStatus !== "SETTLED") {
            return false;
          }
        }
        return true;
      });
      const isUserInvolved = payerIsMe || expPts.some((p) => isMe(p.user_id));

      if (!isUserInvolved) return; // Only show expenses where user is financially involved

      let userNetShare = 0;
      let originalNetShare = 0;
      let hasDebtors = expPts.length > 0;
      let allDebtorsSettled = hasDebtors;

      expPts.forEach((pt) => {
        const ptIsMe = isMe(pt.user_id);
        const amountOwed = Number(pt.amount_owed || 0);
        const ptStatus = String(pt.status || "PENDING").toUpperCase();
        const isPtSettled = ptStatus === "SETTLED";
        const remaining = isPtSettled ? 0 : amountOwed;

        if (!isPtSettled) {
          allDebtorsSettled = false;
        }

        if (payerIsMe && !ptIsMe) {
          userNetShare += remaining;
          originalNetShare += amountOwed;
        } else if (!payerIsMe && ptIsMe) {
          userNetShare -= remaining;
          originalNetShare -= amountOwed;
        }
      });

      // An expense is fully settled when all debtor participants have settled their shares, or expense status is SETTLED, or user's net share is 0
      const isFullySettled = String(exp.status || "").toUpperCase() === "SETTLED" || (hasDebtors && allDebtorsSettled) || userNetShare === 0;
      const settledDisplayAmount = Math.abs(originalNetShare) || Number(exp.total_amount || 0);

      totalNetBalance += userNetShare;

      // Construct Subtitle Payment Context:
      // - If user owes money (userNetShare < 0): "Paid by <Payer Name>"
      // - If user is owed money (userNetShare > 0) or settled: list debtors
      let subtitleText = "";
      if (userNetShare < 0 && !payerIsMe) {
        subtitleText = `Paid by ${payerName}`;
      } else {
        const otherPts = expPts.filter((pt) => !isMe(pt.user_id));
        const displayPts = otherPts.length > 0 ? otherPts : expPts;

        const names = displayPts.slice(0, 2).map((pt) => {
          const u = profMap.get(pt.user_id);
          return isMe(pt.user_id) ? "You" : u?.full_name || u?.username || "Participant";
        });

        const extraCount = displayPts.length > 2 ? displayPts.length - 2 : 0;
        if (extraCount > 0) {
          subtitleText = `${names.join(", ")} + ${extraCount} ${extraCount === 1 ? 'other' : 'others'}`;
        } else {
          subtitleText = names.join(", ");
        }
      }

      // Build participant avatars preview list
      const otherPts = expPts.filter((pt) => !isMe(pt.user_id));
      const displayPts = otherPts.length > 0 ? otherPts : expPts;

      const fullParticipantList = displayPts.map((pt) => {
        const u = profMap.get(pt.user_id);
        return {
          userId: pt.user_id,
          name: isMe(pt.user_id) ? "You" : u?.full_name || u?.username || "Participant",
          avatar: u?.profile_photo_path || "",
        };
      });

      const first3 = fullParticipantList.slice(0, 3);
      const extraCount = fullParticipantList.length > 3 ? fullParticipantList.length - 3 : 0;

      rows.push({
        id: exp.id,
        expenseTitle,
        totalAmount: Number(exp.total_amount || 0),
        payerId: exp.payer_id,
        payerName,
        userNetShare,
        settledDisplayAmount,
        isOwed: userNetShare > 0 || (userNetShare === 0 && payerIsMe),
        isSettled: isFullySettled,
        participantCount: expPts.length,
        participantsPreview: first3,
        extraParticipantsCount: extraCount,
        subtitleText,
        createdAt: exp.created_at || new Date().toISOString(),
        updatedAt: exp.updated_at || exp.created_at || new Date().toISOString(),
        rawExpense: exp,
      });
    });

    // Sort newest first
    rows.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

    return { planNetBalance: totalNetBalance, groupedExpenseRows: rows };
  }, [dbExpenses, dbParticipants, dbProfiles, userPostgresUuid, financiallyIncludedUserIds, hasLoadedPlanParticipants]);

  const planTitle = planDetails?.title || "Plan";
  const planCover = planDetails?.cover_image || undefined;

  const absNetBalance = Math.abs(planNetBalance);
  const isOwed = planNetBalance > 0;
  const isSettled = planNetBalance === 0;

  // Available participants for Add Cost (ONLY active JOINED participants!)
  const availablePlanParticipants = useMemo(() => {
    return dbProfiles
      .filter((p) => joinedUserIds.has(p.id))
      .map((p) => {
        const isUserMe = p.id === userPostgresUuid;
        return {
          id: p.id,
          name: isUserMe ? "You" : p.full_name || p.username || "Participant",
          avatar: p.profile_photo_path || "",
        };
      });
  }, [dbProfiles, userPostgresUuid, joinedUserIds]);

  // Open Add Cost Sheet
  const handleOpenAddCostSheet = () => {
    setFormError(null);
    setCostTitle("");
    setCostAmount("");
    setSelectedParticipantIds(availablePlanParticipants.map((p) => p.id));
    setShowAddCostSheet(true);
  };

  const toggleParticipantSelection = (uid: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const parsedAmount = parseFloat(costAmount) || 0;
  const isValidAmount = parsedAmount > 0;
  const isFormValid = costTitle.trim().length > 0 && isValidAmount && selectedParticipantIds.length > 0;
  const perPersonShare = selectedParticipantIds.length > 0 && isValidAmount
    ? Math.round((parsedAmount / selectedParticipantIds.length) * 100) / 100
    : 0;

  // Add Cost Submit Handler
  const handleAddCostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || submittingCost || !userPostgresUuid || !planDetails) return;

    setSubmittingCost(true);
    setFormError(null);

    try {
      const validJoinedUserIds = selectedParticipantIds.filter((uid) => joinedUserIds.has(uid));
      const finalParticipants = Array.from(new Set([userPostgresUuid, ...validJoinedUserIds]));

      const { error: rpcError } = await (supabase as any).rpc("insert_cost_expense", {
        p_plan_id: planDetails.id,
        p_message_id: null,
        p_payer_id: userPostgresUuid,
        p_title: costTitle.trim(),
        p_total_amount: parsedAmount,
        p_participant_ids: finalParticipants,
      });

      if (rpcError) {
        console.error("[PlanBalances] insert_cost_expense failed:", rpcError);
        setFormError(rpcError.message || "Failed to create expense.");
        setSubmittingCost(false);
        return;
      }

      setShowAddCostSheet(false);
      setCostTitle("");
      setCostAmount("");
      setSelectedParticipantIds([]);
      await loadPlanData();
      await onRefreshBalances();
    } catch (err: any) {
      console.error("[PlanBalances] Exception adding cost:", err);
      setFormError(err.message || "An error occurred.");
    } finally {
      setSubmittingCost(false);
    }
  };

  // If an expense is selected for detail view, render ExpenseDetails screen
  if (selectedExpenseIdForDetail) {
    return (
      <ExpenseDetails
        expenseId={selectedExpenseIdForDetail}
        source="plan"
        onBack={() => {
          setSelectedExpenseIdForDetail(null);
        }}
        onRefreshBalances={async () => {
          await loadPlanData();
          await onRefreshBalances();
        }}
        activeUserId={activeUserId}
      />
    );
  }

  if (showSettlementHistory) {
    const settledItems: SettledExpenseItem[] = groupedExpenseRows
      .filter((r) => r.isSettled || r.userNetShare === 0)
      .map((r) => ({
        id: r.id,
        title: r.expenseTitle,
        planTitle: planDetails?.title,
        planCover: planDetails?.cover_image,
        amount: r.settledDisplayAmount || r.totalAmount || 0,
        settledDate: r.updatedAt || r.createdAt || new Date().toISOString(),
        planId: planDetails?.id || planId,
      }));

    return (
      <SettlementHistoryScreen
        contextType="plan"
        planTitle={planDetails?.title}
        planCover={planDetails?.cover_image}
        settledExpenses={settledItems}
        onBack={() => setShowSettlementHistory(false)}
        onSelectExpense={(expId) => {
          setSelectedExpenseIdForDetail(expId);
        }}
      />
    );
  }

  return (
    <div
      id="subview_plan_balances"
      className="w-full h-full flex flex-col overflow-y-auto scrollbar-none px-6 pt-3 pb-20 text-left bg-[#050505] select-none animate-fade-in"
    >
      {/* HEADER BAR — TOP LEFT "Plan balances" */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer border border-zinc-900/60"
          aria-label="Back to Wallet"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-display font-semibold text-zinc-100 tracking-tight">
            Plan balances
          </h2>
        </div>
      </div>

      {/* PLAN AVATAR & BALANCE HERO (PLAN COVER IMAGE REMAINS HERE IN THE HEADER) */}
      <div className="flex flex-col items-center text-center py-6 mt-2 space-y-3">
        <div className="relative">
          {planCover ? (
            <DiscoveryImages
              src={planCover}
              alt={planTitle}
              className="w-20 h-20 rounded-2xl object-cover ring-2 ring-white/10 shadow-xl"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-zinc-900 ring-2 ring-white/10 flex items-center justify-center text-xs text-zinc-650 font-black">
              PLAN
            </div>
          )}
        </div>

        <div className="space-y-1">
          <h3 className="font-display font-bold text-xl text-zinc-100">
            {planTitle}
          </h3>
          <p className="text-zinc-500 font-sans text-xs font-medium uppercase tracking-wider">
            {isSettled
              ? "SETTLED UP"
              : isOwed
                ? "YOU ARE OWED"
                : "YOU OWE"}
          </p>
          {!isSettled && (
            <div className="flex items-center justify-center gap-2 mt-1">
              <h1
                className={`font-sans font-black text-4xl leading-none ${
                  isOwed ? "text-emerald-400" : "text-[#FF6B2C]"
                }`}
              >
                ₹{absNetBalance.toLocaleString("en-IN")}
              </h1>
            </div>
          )}
        </div>
      </div>

      {/* EXPENSES SECTION HEADER */}
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-sm font-display font-semibold text-zinc-300">
          Expenses
        </h3>
        <button
          type="button"
          onClick={handleOpenAddCostSheet}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF6B2C]/10 border border-[#FF6B2C]/30 text-[#FF6B2C] hover:bg-[#FF6B2C]/20 rounded-xl text-xs font-semibold transition cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Cost</span>
        </button>
      </div>

      {/* EXPENSES CONTENT CONTAINER */}
      <div className="flex-1 flex flex-col justify-between">
        {/* EXPENSES LISTING */}
        <div className="divide-y divide-white/[0.04]">
          {dataLoading ? (
            <div className="py-12 text-center bg-zinc-950/20 border border-dashed border-zinc-900 rounded-[24px] space-y-2">
              <div className="w-5 h-5 border-2 border-[#FF6B2C] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-zinc-500 font-sans">Loading plan wallet data…</p>
            </div>
          ) : dataError ? (
            <div className="p-4 text-center bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-sans">
              {dataError}
            </div>
          ) : groupedExpenseRows.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 font-sans">
              No expenses for this plan yet
            </div>
          ) : (
            groupedExpenseRows.map((row) => {
              const isRowSettled = row.isSettled || row.userNetShare === 0;
              const expenseIsOwed = row.userNetShare > 0;
              const absShare = Math.abs(row.userNetShare);
              const displayAmount = isRowSettled ? row.settledDisplayAmount : absShare;

              return (
                <div
                  key={row.id}
                  onClick={() => {
                    setSelectedExpenseIdForDetail(row.id);
                  }}
                  className={`py-3.5 flex items-center text-left group transition-all cursor-pointer px-1 select-none hover:bg-white/[0.01] ${
                    isRowSettled ? "opacity-60" : "opacity-100"
                  }`}
                >
                  {/* COLUMN 1: Fixed-Width Avatar Column (w-[105px] shrink-0) */}
                  <div className="w-[105px] shrink-0 flex items-center pr-3">
                    <div className="flex items-center -space-x-2">
                      {row.participantsPreview.map((p, idx) => (
                        <UserAvatar
                          key={p.userId}
                          src={p.avatar}
                          alt={p.name}
                          size="w-8 h-8"
                          className={`ring-2 ring-black rounded-full shrink-0 ${isRowSettled ? "grayscale-30" : ""}`}
                          style={{ zIndex: 10 - idx }}
                        />
                      ))}
                    </div>
                    {row.extraParticipantsCount > 0 && (
                      <span className="text-[9.5px] font-mono font-bold text-zinc-300 bg-zinc-900 border border-white/[0.1] px-1.5 py-0.5 rounded-full ml-1 shrink-0">
                        +{row.extraParticipantsCount}
                      </span>
                    )}
                  </div>

                  {/* COLUMN 2: Flexible Content Column (Title & Subtitle) */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h5 className={`font-sans text-[13.5px] truncate leading-tight ${
                      isRowSettled ? "font-medium text-zinc-400 group-hover:text-zinc-200" : "font-semibold text-white group-hover:text-white"
                    }`}>
                      {row.expenseTitle}
                    </h5>

                    {/* Payment Context Subtitle */}
                    {isRowSettled ? (
                      <>
                        {planTitle && (
                          <span className="text-[11.5px] font-sans font-medium text-zinc-500 block truncate leading-tight mt-0.5">
                            {planTitle}
                          </span>
                        )}
                        <span className="text-[10px] font-sans text-zinc-550 block truncate leading-tight mt-0.5">
                          Settled up
                        </span>
                      </>
                    ) : (
                      <span className="text-[11.5px] font-sans font-medium text-zinc-300 block truncate leading-tight mt-0.5">
                        {row.subtitleText}
                      </span>
                    )}
                  </div>

                  {/* COLUMN 3: Far-Right Amount Column (w-[90px] shrink-0 text-right) */}
                  <div className="w-[90px] shrink-0 text-right flex items-center justify-end">
                    {isRowSettled ? (
                      <span className="font-mono text-sm font-medium tracking-tight text-zinc-400">
                        ₹{displayAmount.toLocaleString("en-IN")}
                      </span>
                    ) : (
                      <span
                        className={`font-mono text-sm font-bold tracking-tight ${
                          expenseIsOwed ? "text-emerald-400" : "text-[#FF6B2C]"
                        }`}
                      >
                        {expenseIsOwed ? "+" : "-"}₹{absShare.toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* SETTLEMENT HISTORY NAVIGATION LINK (Anchored at bottom) */}
        <div className="pt-4 border-t border-white/[0.06] mt-auto pb-2">
          <button
            type="button"
            onClick={() => setShowSettlementHistory(true)}
            className="w-full flex items-center justify-between h-14 px-1 text-left group cursor-pointer transition-colors hover:bg-white/[0.01]"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-sans font-medium text-sm text-zinc-200 group-hover:text-white transition-colors">
                Settlement History
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
          </button>
        </div>
      </div>

      {/* ADD COST BOTTOM SHEET */}
      {showAddCostSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-md bg-zinc-950 border-t border-zinc-800 rounded-t-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3 shrink-0">
              <h3 className="text-lg font-display font-bold text-white">Add Cost</h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddCostSheet(false);
                  setFormError(null);
                }}
                className="text-zinc-500 hover:text-white text-xs font-semibold"
              >
                Close
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-sans">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddCostSubmit} className="space-y-4 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={costTitle}
                  onChange={(e) => setCostTitle(e.target.value)}
                  placeholder="e.g., Water, Dinner, Carpool"
                  className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Total Amount (₹)
                </label>
                <input
                  type="number"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                  min="1"
                  step="any"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Split Between ({selectedParticipantIds.length})
                  </label>
                  {isValidAmount && selectedParticipantIds.length > 0 && (
                    <span className="text-xs font-mono font-semibold text-[#FF6B2C]">
                      ₹{perPersonShare} / person
                    </span>
                  )}
                </div>

                <div className="space-y-2 max-h-44 overflow-y-auto scrollbar-none">
                  {availablePlanParticipants.map((p) => {
                    const isSelected = selectedParticipantIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleParticipantSelection(p.id)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer text-left ${isSelected
                            ? "bg-zinc-900 border-[#FF6B2C]/60 text-white"
                            : "bg-zinc-900/40 border-zinc-800/60 text-zinc-400 hover:bg-zinc-900/80"
                          }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar src={p.avatar} alt={p.name} size="w-8 h-8" className="shrink-0" />
                          <span className="font-sans font-medium text-xs truncate">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-zinc-400">
                            {isSelected ? `₹${perPersonShare}` : "₹0"}
                          </span>
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center border transition ${isSelected
                                ? "bg-[#FF6B2C] border-[#FF6B2C] text-white"
                                : "border-zinc-700 bg-transparent text-transparent"
                              }`}
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={!isFormValid || submittingCost}
                  className="w-full h-12 rounded-xl bg-[#FF6B2C] text-white font-semibold text-sm hover:bg-[#e05a1f] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B2C]/20"
                >
                  {submittingCost ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Adding Cost...</span>
                    </>
                  ) : (
                    <span>Add Cost</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
