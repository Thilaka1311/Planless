import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Plus, Check, CheckCircle2, ChevronRight, BanknoteArrowUp, MoreVertical } from "lucide-react";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { supabase } from "../../../../lib/supabaseClient";
import { ExpenseDetails, PlanBalancesDetail } from "./ExpenseDetail";
import { getParticipantFinancialState, isJoinedParticipantStatus, getEffectiveExpenseDate } from "../services/walletService";
import { AddCost } from "./AddCost";

const formatSmartINR = (amount: number): string => {
  const absVal = Math.abs(amount);
  const rounded = Math.round(absVal * 100) / 100;
  if (Number.isInteger(rounded)) {
    return `₹${rounded.toLocaleString("en-IN")}`;
  }
  return `₹${rounded.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

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
  payerAvatar: string;
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

  const [selectedExpenseIdForDetail, setSelectedExpenseIdForDetail] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const avatarOpacity = Math.max(0, 1 - scrollTop / 75);
  const stickyProgress = Math.min(1, Math.max(0, (scrollTop - 75) / 30));

  // Dedicated Database State
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [planDetails, setPlanDetails] = useState<{ id: string; title: string; cover_image?: string } | null>(null);
  const [dbExpenses, setDbExpenses] = useState<any[]>([]);
  const [dbParticipants, setDbParticipants] = useState<any[]>([]);
  const [dbPlanParticipants, setDbPlanParticipants] = useState<any[]>([]);
  const [dbProfiles, setDbProfiles] = useState<any[]>([]);
  const [userPostgresUuid, setUserPostgresUuid] = useState<string>("");
  const [financiallyIncludedUserIds, setFinanciallyIncludedUserIds] = useState<Set<string>>(new Set());
  const [joinedUserIds, setJoinedUserIds] = useState<Set<string>>(new Set());
  const [hasLoadedPlanParticipants, setHasLoadedPlanParticipants] = useState(false);

  // Add Cost modal state
  const [showAddCostSheet, setShowAddCostSheet] = useState(false);

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

      // 5b. Fetch plan_participants to build financiallyIncludedUserIds set and participant list
      const { data: rawPlanPts } = await supabase
        .from("plan_participants")
        .select("user_id, plan_id, rsvp_status, skip_reason, status")
        .eq("plan_id", resolvedPlanId);

      setDbPlanParticipants(rawPlanPts || []);

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

      // 6. Fetch profiles for all involved users (payers, split participants, joined plan members, current user)
      const payerUserIds = fetchedExp.map((e: any) => e.payer_id).filter(Boolean);
      const ptUserIds = fetchedPts.map((p: any) => p.user_id).filter(Boolean);
      const planPtUserIds = (rawPlanPts || []).map((p: any) => p.user_id).filter(Boolean);
      const allUserIds = Array.from(new Set([...payerUserIds, ...ptUserIds, ...planPtUserIds, userUuid]));

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
      const payerAvatar = payerUser?.profile_photo_path || "";

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

      const expTotalAmt = Number(exp.total_amount || 0);
      const formattedTotalAmt = expTotalAmt > 0
        ? formatSmartINR(expTotalAmt)
        : "";

      let subtitleText = "";
      if (payerIsMe) {
        subtitleText = `You paid ${formattedTotalAmt}`.trim();
      } else {
        subtitleText = `${payerName} paid ${formattedTotalAmt}`.trim();
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
        payerAvatar,
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

    // Sort newest first based on effective date (pending: created_at, settled: updated_at)
    rows.sort((a, b) => getEffectiveExpenseDate(b).getTime() - getEffectiveExpenseDate(a).getTime());

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
    setShowAddCostSheet(true);
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

  // Full Screen Skeleton Loading State
  if (dataLoading) {
    return (
      <div
        id="subview_plan_balances_skeleton"
        className="w-full h-full flex flex-col overflow-y-auto scrollbar-none px-6 pt-0 pb-36 text-left bg-[#050505] select-none animate-fade-in relative"
      >
        {/* Sticky Header Bar — Back Arrow */}
        <div className="sticky top-0 z-50 -mx-6 px-6 pt-3 pb-3 flex items-center justify-between h-16 bg-[#050505]/90 backdrop-blur-md">
          <button
            type="button"
            onClick={onBack}
            className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0 z-50 active:scale-95"
            aria-label="Back to Wallet"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Centered Fixed Circular Plan Avatar Skeleton */}
        <div className="absolute left-1/2 -translate-x-1/2 top-11 z-40">
          <div className="w-25 h-25 rounded-full bg-zinc-800/80 ring-2 ring-white/10 shadow-lg animate-pulse" />
        </div>

        {/* Plan Title Skeleton */}
        <div className="w-48 h-5 bg-zinc-800/80 rounded-md mx-auto mt-24 shrink-0 self-center animate-pulse" />

        {/* Plan Balance Status & Amount Skeleton */}
        <div className="flex flex-col items-center text-center shrink-0 relative z-10 space-y-2 mt-4">
          <div className="w-24 h-3 bg-zinc-800/60 rounded animate-pulse" />
          <div className="w-36 h-9 bg-zinc-800/80 rounded-xl mt-1 animate-pulse" />
        </div>

        {/* Month Section Header Skeleton */}
        <div className="py-2.5 pt-6 text-left border-b border-white/[0.04] shrink-0">
          <div className="w-28 h-3.5 bg-zinc-800/60 rounded animate-pulse" />
        </div>

        {/* 6 Skeleton Expense Rows */}
        <div className="space-y-0 divide-y divide-white/[0.04] mt-1">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={`plan-skeleton-row-${i}`} className="py-3.5 flex items-center justify-between px-0.5 animate-pulse">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Date Skeleton */}
                <div className="w-8 shrink-0 flex flex-col items-center justify-center space-y-1">
                  <div className="w-6 h-2 bg-zinc-800/60 rounded" />
                  <div className="w-4 h-3 bg-zinc-800/80 rounded" />
                </div>

                {/* Avatar Skeleton */}
                <div className="w-8 h-8 rounded-full bg-zinc-800/80 shrink-0" />

                {/* Title & Subtitle Skeleton */}
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="w-28 h-3.5 bg-zinc-800/80 rounded" />
                  <div className="w-36 h-3 bg-zinc-800/60 rounded" />
                </div>
              </div>

              {/* Amount Skeleton */}
              <div className="w-14 h-4 bg-zinc-800/80 rounded shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      id="subview_plan_balances"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="w-full h-full flex flex-col overflow-y-auto scrollbar-none px-6 pt-0 pb-36 text-left bg-[#050505] select-none animate-fade-in relative"
    >
      {/* Sticky Header Bar with Back Button & Centered Fixed Plan Avatar */}
      <div
        className="sticky top-0 z-50 -mx-6 px-6 pt-3 pb-3 flex items-center justify-between pointer-events-none transition-colors duration-150 relative h-16"
        style={{
          backgroundColor: `rgba(5, 5, 5, ${stickyProgress})`,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0 z-50 pointer-events-auto active:scale-95"
          aria-label="Back to Wallet"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Centered Fixed Plan Avatar (Fixed 25x25 / 100px x 100px, Pinned at top-11, translateY = 0, dissolves away in place) */}
        <div
          className="absolute left-1/2 -translate-x-1/2 top-11 transition-opacity duration-75 pointer-events-none z-40"
          style={{
            opacity: avatarOpacity,
          }}
        >
          {planCover ? (
            <DiscoveryImages
              src={planCover}
              alt={planTitle}
              className="w-25 h-25 rounded-full object-cover ring-2 ring-white/10 shadow-lg aspect-square overflow-hidden"
            />
          ) : (
            <div className="w-25 h-25 rounded-full bg-zinc-900 ring-2 ring-white/10 flex items-center justify-center text-xs text-zinc-650 font-black aspect-square overflow-hidden">
              PLAN
            </div>
          )}
        </div>
      </div>

      {/* THE SINGLE PLAN-NAME ELEMENT - Scrolls upward and pins natively at sticky top-[15px] z-50 */}
      <h3 className="sticky top-[15px] z-50 font-sans font-bold text-base text-zinc-100 leading-tight text-center truncate px-12 mt-24 pointer-events-auto shrink-0 self-center">
        {planTitle}
      </h3>

      {/* Plan Balance Hero Section */}
      <div className={`flex flex-col items-center text-center shrink-0 relative z-10 ${isSettled ? "my-4" : "pb-3 space-y-1.5"}`}>
        <p className="text-zinc-500 font-sans text-xs font-medium uppercase tracking-wider">
          {isSettled
            ? "SETTLED UP"
            : isOwed
              ? "YOU ARE OWED"
              : "YOU OWE"}
        </p>
        {!isSettled && (
          <div className="flex items-center justify-center gap-2 mt-1">
            <h1 className="font-sans font-black text-3xl sm:text-4xl leading-none text-white">
              {formatSmartINR(absNetBalance)}
            </h1>
          </div>
        )}
      </div>

      {/* EXPENSES CONTENT CONTAINER */}
      <div className="flex-1 flex flex-col pt-1 mt-2">
        {/* Expenses Timeline */}
        {dataError ? (
          <div className="py-8 text-center text-xs text-rose-400 font-sans bg-rose-500/10 border border-rose-500/20 rounded-xl my-4">
            {dataError}
          </div>
        ) : groupedExpenseRows.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500 font-sans">
            No expenses for this plan yet
          </div>
        ) : (
          (() => {
            // Group expenses by Month + Year section (e.g. "August 2026")
            const groupedPlanExpenses = (() => {
              const groups: { sectionTitle: string; yearMonthKey: string; rows: typeof groupedExpenseRows }[] = [];
              const map = new Map<string, typeof groupedExpenseRows>();

              groupedExpenseRows.forEach((row) => {
                const validD = getEffectiveExpenseDate(row);
                const fullMonth = validD.toLocaleString("en-US", { month: "long" });
                const year = validD.getFullYear();
                const key = `${year}-${String(validD.getMonth() + 1).padStart(2, "0")}`;
                const sectionTitle = `${fullMonth} ${year}`;

                if (!map.has(key)) {
                  map.set(key, []);
                  groups.push({ sectionTitle, yearMonthKey: key, rows: map.get(key)! });
                }
                map.get(key)!.push(row);
              });

              return groups;
            })();

            return (
              <div className="space-y-3">
                {groupedPlanExpenses.map((group) => (
                  <div key={`plan-month-group-${group.yearMonthKey}`} className="space-y-0 text-left">
                    {/* Month / Year Section Header */}
                    <div className="py-2.5 pt-3 text-left">
                      <h4 className="font-sans font-semibold text-xs text-zinc-400 tracking-wide">
                        {group.sectionTitle}
                      </h4>
                    </div>

                    <div className="space-y-0">
                      {group.rows.map((row) => {
                        const isRowSettled = row.isSettled || row.userNetShare === 0;
                        const expenseIsOwed = row.userNetShare > 0;
                        const absShare = Math.abs(row.userNetShare);
                        const displayAmount = isRowSettled ? row.settledDisplayAmount : absShare;

                        const validD = getEffectiveExpenseDate(row);
                        const monthUpper = validD.toLocaleString("en-US", { month: "short" }).toUpperCase();
                        const dayStr = String(validD.getDate()).padStart(2, "0");

                        return (
                          <div
                            key={row.id}
                            onClick={() => {
                              setSelectedExpenseIdForDetail(row.id);
                            }}
                            className={`py-3.5 flex items-center text-left group transition-all cursor-pointer px-0.5 select-none hover:bg-white/[0.01] ${isRowSettled ? "opacity-45" : "opacity-100"
                              }`}
                          >
                            {/* VERTICAL DATE COLUMN (Leftmost element, month on top, day below) */}
                            <div className="w-8 shrink-0 flex flex-col items-center justify-center text-center select-none mr-0.5">
                              <span className="text-[9.5px] font-sans font-semibold tracking-wider text-zinc-500 uppercase leading-none">
                                {monthUpper}
                              </span>
                              <span className="text-[13px] font-sans font-bold text-zinc-300 leading-none mt-1">
                                {dayStr}
                              </span>
                            </div>

                            {/* COLUMN 1: Payer Avatar Only */}
                            <div className="w-10 shrink-0 flex items-center justify-center mr-2">
                              <UserAvatar
                                src={row.payerAvatar}
                                alt={row.payerName}
                                size="w-8 h-8"
                                className={`ring-2 ring-black rounded-full shrink-0 ${isRowSettled ? "grayscale-30" : ""}`}
                              />
                            </div>

                            {/* COLUMN 2: Flexible Content Column (Title & Subtitle) */}
                            <div className="flex-1 min-w-0 flex flex-col justify-center pr-3">
                              <h5 className={`font-sans text-[13.5px] truncate leading-tight ${isRowSettled ? "font-medium text-zinc-400 group-hover:text-zinc-200" : "font-semibold text-white group-hover:text-white"
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

                            {/* COLUMN 3: Far-Right Amount Column */}
                            <div className="shrink-0 text-right min-w-max pl-2 flex items-center justify-end">
                              {isRowSettled ? (
                                <span className="font-sans text-xs font-semibold text-zinc-500">
                                  Settled Up
                                </span>
                              ) : (
                                <span className="font-sans text-sm font-bold tracking-tight text-white">
                                  {formatSmartINR(absShare)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
        )}
      </div>

      {/* FLOATING ADD COST ACTION BUTTON */}
      <button
        type="button"
        onClick={handleOpenAddCostSheet}
        className="fixed bottom-[102px] right-6 z-30 w-13 h-13 rounded-full bg-[#FF6B2C] hover:bg-[#e05a1f] active:scale-95 text-white flex items-center justify-center shadow-lg shadow-[#FF6B2C]/30 transition-all cursor-pointer border border-white/10"
        aria-label="Add Cost"
      >
        <BanknoteArrowUp className="w-6 h-6 stroke-[2.2]" />
      </button>

      {/* ADD COST FULL SCREEN COMPONENT */}
      <AddCost
        isOpen={showAddCostSheet}
        onClose={() => setShowAddCostSheet(false)}
        onRefreshBalances={async () => {
          await loadPlanData();
          await onRefreshBalances();
        }}
        activeUserId={userPostgresUuid || activeUserId}
        initialPlanId={planDetails?.id || planId}
        relevantPlans={planDetails ? [{ id: planDetails.id, title: planDetails.title, cover_image: planDetails.cover_image }] : []}
        dbPlanParticipants={dbPlanParticipants}
        dbUsers={dbProfiles}
        dbProfiles={dbProfiles}
      />
    </div>
  );
};
