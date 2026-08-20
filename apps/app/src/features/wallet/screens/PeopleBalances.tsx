import React, { useState, useMemo, useRef } from "react";
import { ArrowLeft, Plus, Check, Edit2, CheckCircle2, ChevronDown, ChevronUp, ChevronRight, AlertCircle, HandCoins, ArrowUpRight, ArrowDownLeft, Trash2, BanknoteArrowUp, MoreVertical } from "lucide-react";
import { WalletRelationship, ExpenseBreakdown, settleWalletExpenseParticipant, settleWalletRelationship, deleteWalletExpense, updateWalletExpense, isJoinedParticipantStatus } from "../services/walletService";
import { useWalletStore } from "../state/WalletContext";
import { usePlansStore } from "../../plans/state/PlansContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { supabase } from "../../../../lib/supabaseClient";
import { ExpenseDetails, PlanBalancesDetail } from "./ExpenseDetail";
import { SettlementHistoryScreen, SettledExpenseItem } from "./SettlementHistory";
import { AddCost } from "../components/AddCost";
import { EditCost } from "../components/EditCost";

interface RelationshipDetailsScreenProps {
  relationship: WalletRelationship;
  onBack: () => void;
  onRefreshBalances: () => void;
  activeUserId: string;
  onSelectPlan: (planId: string) => void;
  onSelectExpense?: (expenseId: string, planId: string) => void;
}

export const RelationshipDetailsScreen: React.FC<RelationshipDetailsScreenProps> = ({
  relationship,
  onBack,
  onRefreshBalances,
  activeUserId,
  onSelectPlan,
  onSelectExpense,
}) => {
  const { dbPlansLocal, dbPlanParticipantsLocal, dbUsersLocal, dbWalletPaidTransactions } = useWalletStore();
  const { refreshPlans } = usePlansStore();

  // Selected expense ID for PlanBalancesDetail navigation
  const [selectedExpenseIdForDetail, setSelectedExpenseIdForDetail] = useState<string | null>(null);

  // Add Cost & Edit Cost modal states
  const [showAddCostSheet, setShowAddCostSheet] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseBreakdown | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);

  // Overall Settle Up sheet state
  const [showOverallSettleSheet, setShowOverallSettleSheet] = useState(false);
  const [submittingOverallSettle, setSubmittingOverallSettle] = useState(false);
  const [overallSettleError, setOverallSettleError] = useState<string | null>(null);
  const [showSettlementHistory, setShowSettlementHistory] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollThreshold = 90;
  const progress = Math.min(1, Math.max(0, scrollTop / scrollThreshold));

  // Settle Up state
  const [submittingSettle, setSubmittingSettle] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  // Delete Expense state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [submittingDelete, setSubmittingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Long-press timer ref
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  // Resolve current active user and target relationship person user IDs
  const otherUserId = relationship.userId;

  // Filter plans relevant to BOTH current user and this relationship person (or plans the user is in)
  const relevantPlans = useMemo(() => {
    if (!dbPlansLocal || dbPlansLocal.length === 0) return [];

    const activeUserPlans = (dbPlanParticipantsLocal || [])
      .filter((pp) => (pp.user_id === activeUserId || pp.user_id === otherUserId) && ["JOINED", "WAITLISTED"].includes(String(pp.rsvp_status || "").toUpperCase()))
      .map((pp) => pp.plan_id);

    const planSet = new Set(activeUserPlans);
    return dbPlansLocal.filter((p) => planSet.size === 0 || planSet.has(p.id));
  }, [dbPlansLocal, dbPlanParticipantsLocal, activeUserId, otherUserId]);

  const isOwed = relationship.netBalance >= 0;
  const absNetBalance = Math.abs(relationship.netBalance);
  const formattedNetBalance = absNetBalance.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const handleCardClick = (expense: ExpenseBreakdown) => {
    if (!expense?.id) {
      console.warn("[PeopleBalances] Expense row missing valid wallet_expenses.id");
      return;
    }
    setSelectedExpenseIdForDetail(expense.id);
  };

  const handleOpenAddCostSheet = () => {
    setShowAddCostSheet(true);
  };

  const handleOpenEditSheet = () => {
    if (!selectedExpense) return;
    setShowActionMenu(false);
    setShowEditSheet(true);
  };

  // Open Settle Confirmation modal
  const handleOpenSettleModal = () => {
    if (!selectedExpense) return;
    setShowActionMenu(false);
    setSettleError(null);
    setShowSettleModal(true);
  };

  // Execute Settle Up (Individual expense)
  const handleConfirmSettle = async () => {
    if (!selectedExpense || submittingSettle) return;

    if (selectedExpense.role !== "creditor") {
      setSettleError("Only the creditor can settle this expense.");
      return;
    }

    setSubmittingSettle(true);
    setSettleError(null);

    try {
      const participantUserId = otherUserId;

      const success = await settleWalletExpenseParticipant({
        expenseId: selectedExpense.id,
        participantUserId,
      });

      if (!success) {
        setSettleError("Failed to record settlement. Please try again.");
        setSubmittingSettle(false);
        return;
      }

      setShowSettleModal(false);
      setSelectedExpense(null);
      await onRefreshBalances();
    } catch (err: any) {
      console.error("[RelationshipDetailsScreen] Exception settling expense:", err);
      setSettleError(err.message || "Failed to settle expense.");
    } finally {
      setSubmittingSettle(false);
    }
  };

  // Open Overall Settle Up sheet
  const handleOpenOverallSettleSheet = () => {
    if (absNetBalance <= 0) return;
    setOverallSettleError(null);
    setShowOverallSettleSheet(true);
  };

  // Execute settlement across all outstanding expenses for this relationship atomically via RPC
  const handleConfirmOverallSettle = async () => {
    if (submittingOverallSettle || absNetBalance <= 0) return;

    setSubmittingOverallSettle(true);
    setOverallSettleError(null);

    try {
      const success = await settleWalletRelationship(otherUserId);

      if (!success) {
        setOverallSettleError("Failed to record settlements. Please try again.");
        setSubmittingOverallSettle(false);
        return;
      }

      setShowOverallSettleSheet(false);
      await onRefreshBalances();
    } catch (err: any) {
      console.error("[RelationshipDetailsScreen] Exception performing overall settle up:", err);
      setOverallSettleError(err.message || "Failed to complete settlement.");
    } finally {
      setSubmittingOverallSettle(false);
    }
  };

  // Open Delete Expense confirmation modal
  const handleOpenDeleteModal = () => {
    if (!selectedExpense) return;
    setDeleteError(null);
    setShowActionMenu(false);
    setShowDeleteModal(true);
  };

  // Execute deletion of selected expense atomically via RPC
  const handleConfirmDelete = async () => {
    if (!selectedExpense || submittingDelete) return;

    setSubmittingDelete(true);
    setDeleteError(null);

    try {
      await deleteWalletExpense(selectedExpense.id);
      setShowDeleteModal(false);
      setSelectedExpense(null);
      await onRefreshBalances();
    } catch (err: any) {
      console.error("[RelationshipDetailsScreen] Exception deleting expense:", err);
      setDeleteError(err.message || "Failed to delete expense.");
    } finally {
      setSubmittingDelete(false);
    }
  };

  // Render ExpenseDetails if an expense is tapped
  if (selectedExpenseIdForDetail) {
    return (
      <ExpenseDetails
        expenseId={selectedExpenseIdForDetail}
        source="people"
        onBack={() => {
          setSelectedExpenseIdForDetail(null);
        }}
        onRefreshBalances={async () => {
          await onRefreshBalances();
        }}
        activeUserId={activeUserId}
      />
    );
  }

  if (showSettlementHistory) {
    const settledItems: SettledExpenseItem[] = (relationship.expenses || [])
      .filter((e) => e.status === "SETTLED" || e.participantStatus === "SETTLED")
      .map((e) => ({
        id: e.id,
        title: e.expenseTitle || e.title || "Plan Fee",
        planTitle: e.planTitle,
        planCover: e.planCover,
        amount: e.yourShare || e.totalAmount || 0,
        settledDate: e.updatedAt || e.date || new Date().toISOString(),
        planId: e.planId,
        isPaymentKept: e.isPaymentKept,
      }));

    return (
      <SettlementHistoryScreen
        contextType="person"
        personName={relationship.fullName}
        personAvatar={relationship.profilePhoto}
        settledExpenses={settledItems}
        onBack={() => setShowSettlementHistory(false)}
        onSelectExpense={(expId, pId) => {
          setSelectedExpenseIdForDetail(expId);
        }}
      />
    );
  }

  return (
    <div
      id="subview_relationship_details"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="w-full h-full flex flex-col overflow-y-auto scrollbar-none px-6 pt-0 pb-36 text-left bg-[#050505] relative"
    >
      {/* Sticky Header Bar with Back Button, Centered Compact User Name, & Three Dots Menu */}
      <div className="sticky top-0 z-20 bg-[#050505]/90 backdrop-blur-md -mx-6 px-6 pt-3 pb-3 flex items-center justify-between border-b border-white/[0.04]">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer border border-zinc-900/60 shrink-0"
          aria-label="Back to Wallet"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Compact Centered Header Name (Perfectly synchronized with profile photo fade) */}
        <div
          className="flex-1 min-w-0 px-2 text-center transition-all duration-75"
          style={{
            opacity: progress,
            transform: `translateY(${(1 - progress) * 6}px)`,
            pointerEvents: progress > 0.5 ? "auto" : "none",
          }}
        >
          <h3 className="font-sans font-bold text-base text-zinc-100 truncate">
            {relationship.fullName}
          </h3>
        </div>

        <button
          type="button"
          onClick={() => setShowHeaderMenu(true)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer border border-zinc-900/60 shrink-0"
          aria-label="More options"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {/* Relationship Header Banner / Profile Hero Section */}
      <div className="flex flex-col items-center text-center py-1 mt-1 space-y-2">
        {/* Profile Photo - Synchronized opacity & transform complement */}
        <div
          className="transition-all duration-75 origin-top"
          style={{
            opacity: 1 - progress,
            transform: `translateY(-${progress * 12}px) scale(${1 - progress * 0.15})`,
          }}
        >
          <UserAvatar
            src={relationship.profilePhoto}
            alt={relationship.fullName}
            size="w-20 h-20"
            className="ring-2 ring-white/10"
          />
        </div>

        {/* Main Content Info (Name fades smoothly as sticky name fades in, while OWES YOU, Balance & Settle Up stay unaffected) */}
        <div className="space-y-1">
          <h3
            className="font-sans font-bold text-xl text-zinc-100 transition-all duration-75"
            style={{
              opacity: 1 - progress,
              transform: `translateY(-${progress * 6}px)`,
            }}
          >
            {relationship.fullName}
          </h3>
          <p className="text-zinc-500 font-sans text-xs font-medium uppercase tracking-wider">
            {absNetBalance === 0 ? "SETTLED UP" : isOwed ? "OWES YOU" : "YOU OWE"}
          </p>
          {absNetBalance > 0 && (
            <>
              <div className="flex items-center justify-center gap-2 mt-1">
                <h1
                  className={`font-sans font-black text-4xl leading-none ${isOwed ? "text-emerald-400" : "text-[#FF6B2C]"
                    }`}
                >
                  {formattedNetBalance}
                </h1>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleOpenOverallSettleSheet}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-white/[0.1] text-xs font-sans font-semibold text-zinc-200 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  <HandCoins className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Settle Up</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Expenses Timeline container */}
      <div className="flex-1 flex flex-col pt-1 mt-2">

        {/* Expenses Timeline */}
        {(() => {
          const allExpenses = relationship.expenses || [];
          const activeExpenses = allExpenses.filter((e) => {
            const isSettled = e.status === "SETTLED" || e.participantStatus === "SETTLED";
            return !isSettled;
          });

          const settledExpenses = allExpenses.filter((e) => {
            const isSettled = e.status === "SETTLED" || e.participantStatus === "SETTLED";
            return isSettled;
          });

          const sortedActive = [...activeExpenses].sort((a, b) => {
            const timeA = new Date(a.updatedAt || a.date).getTime();
            const timeB = new Date(b.updatedAt || b.date).getTime();
            return timeB - timeA;
          });

          const sortedSettled = [...settledExpenses].sort((a, b) => {
            const timeA = new Date(a.updatedAt || a.date).getTime();
            const timeB = new Date(b.updatedAt || b.date).getTime();
            return timeB - timeA;
          });

          // Group active expenses by Month + Year section (e.g. "August 2026")
          const groupedActive = (() => {
            const groups: { sectionTitle: string; yearMonthKey: string; expenses: typeof sortedActive }[] = [];
            const map = new Map<string, typeof sortedActive>();

            sortedActive.forEach((expense) => {
              const dateStr = expense.updatedAt || (expense as any).updated_at || expense.date || (expense as any).created_at;
              const d = dateStr ? new Date(dateStr) : new Date();
              const validD = isNaN(d.getTime()) ? new Date() : d;
              const fullMonth = validD.toLocaleString("en-US", { month: "long" });
              const year = validD.getFullYear();
              const key = `${year}-${String(validD.getMonth() + 1).padStart(2, "0")}`;
              const sectionTitle = `${fullMonth} ${year}`;

              if (!map.has(key)) {
                map.set(key, []);
                groups.push({ sectionTitle, yearMonthKey: key, expenses: map.get(key)! });
              }
              map.get(key)!.push(expense);
            });

            return groups;
          })();

          return (
            <div className="flex-1 flex flex-col space-y-3">
              {/* Active Expenses List grouped by Month */}
              {sortedActive.length === 0 ? (
                <div className="py-5 text-center text-xs text-zinc-500 font-sans">
                  {settledExpenses.length > 0 ? "No outstanding expenses" : "No expense history yet"}
                </div>
              ) : (
                groupedActive.map((group) => (
                  <div key={`month-group-${group.yearMonthKey}`} className="space-y-0 text-left">
                    {/* Month / Year Section Header */}
                    <div className="py-2.5 pt-3 text-left border-b border-white/[0.04]">
                      <h4 className="font-sans font-semibold text-xs text-zinc-400 tracking-wide">
                        {group.sectionTitle}
                      </h4>
                    </div>

                    <div className="divide-y divide-white/[0.04]">
                      {group.expenses.map((expense) => {
                        const expenseIsOwed = expense.role === "creditor";
                        const formattedShare = expense.yourShare.toLocaleString("en-IN", {
                          style: "currency",
                          currency: "INR",
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        });

                        const dateStr = expense.updatedAt || (expense as any).updated_at || expense.date || (expense as any).created_at;
                        const d = dateStr ? new Date(dateStr) : new Date();
                        const validD = isNaN(d.getTime()) ? new Date() : d;
                        const monthUpper = validD.toLocaleString("en-US", { month: "short" }).toUpperCase();
                        const dayStr = String(validD.getDate()).padStart(2, "0");

                        return (
                          <div
                            key={`active-expense-${expense.id}`}
                            onClick={() => handleCardClick(expense)}
                            className="w-full flex items-center justify-between py-3.5 text-left group transition-all cursor-pointer px-0.5 select-none hover:bg-white/[0.01]"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {/* VERTICAL DATE COLUMN (Leftmost element, month on top, day below) */}
                              <div className="w-8 shrink-0 flex flex-col items-center justify-center text-center select-none mr-0.5">
                                <span className="text-[9.5px] font-sans font-semibold tracking-wider text-zinc-500 uppercase leading-none">
                                  {monthUpper}
                                </span>
                                <span className="text-[13px] font-sans font-bold text-zinc-300 leading-none mt-1">
                                  {dayStr}
                                </span>
                              </div>

                              {expense.planCover ? (
                                <DiscoveryImages
                                  src={expense.planCover}
                                  alt={expense.planTitle}
                                  className="w-10 h-10 rounded-lg object-cover bg-zinc-900 border border-white/[0.05] shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/[0.05] shrink-0 flex items-center justify-center text-[10px] text-zinc-650 font-black">
                                  PLAN
                                </div>
                              )}

                              <div className="min-w-0 flex flex-col justify-center flex-1 pr-3">
                                <h5 className="font-sans font-semibold text-[13.5px] truncate leading-tight text-zinc-100 group-hover:text-white">
                                  {expense.expenseTitle || expense.title || "Plan Fee"}
                                </h5>
                                <span className="text-[11.5px] font-sans font-medium text-zinc-400 block truncate leading-tight mt-0.5">
                                  {expense.planTitle}
                                </span>
                                <span className="text-[10px] font-sans text-zinc-550 block truncate leading-tight mt-0.5">
                                  {(() => {
                                    const otherPlanPart = (dbPlanParticipantsLocal || []).find(
                                      (p: any) =>
                                        String(p.plan_id || p.planId || "").trim().toLowerCase() === String(expense.planId || "").trim().toLowerCase() &&
                                        String(p.user_id || p.userId || "").trim().toLowerCase() === String(relationship.userId || "").trim().toLowerCase()
                                    );
                                    const otherRsvpStatus = String(otherPlanPart?.rsvp_status || otherPlanPart?.status || "").trim().toUpperCase();
                                    const isOtherSkipped = otherRsvpStatus === "SKIPPED";

                                    const expTotalAmt = Number(expense.totalAmount || 0);
                                    const formattedTotalAmt = expTotalAmt > 0
                                      ? `₹${expTotalAmt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                      : "";

                                    const baseText = expense.isPaymentKept
                                      ? "Payment kept"
                                      : expenseIsOwed
                                        ? `You paid ${formattedTotalAmt}`.trim()
                                        : `${relationship.fullName} paid ${formattedTotalAmt}`.trim();

                                    return isOtherSkipped ? `${baseText} · Left plan` : baseText;
                                  })()}
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0 min-w-max pl-2 flex items-center justify-end">
                              <span
                                className={`font-sans text-sm font-bold tracking-tight ${
                                  expenseIsOwed ? "text-emerald-400" : "text-[#FF6B2C]"
                                }`}
                              >
                                {expenseIsOwed ? "+" : "-"}
                                {formattedShare}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })()}
      </div>

      {/* HEADER THREE-DOTS MENU BOTTOM SHEET */}
      {showHeaderMenu && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-xs animate-fade-in"
          onClick={() => setShowHeaderMenu(false)}
        >
          <div
            className="w-full max-w-md bg-zinc-950 border-t border-zinc-800/80 rounded-t-3xl p-6 shadow-2xl space-y-4 text-left animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3 shrink-0">
              <h3 className="text-base font-sans font-bold text-white">Options</h3>
              <button
                type="button"
                onClick={() => setShowHeaderMenu(false)}
                className="text-zinc-400 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-2 py-1">
              <button
                type="button"
                onClick={() => {
                  setShowHeaderMenu(false);
                  setShowSettlementHistory(true);
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 transition-all cursor-pointer group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-sans font-semibold text-sm text-zinc-100 group-hover:text-white transition-colors">
                      Settlement History
                    </h4>
                    <p className="text-[11px] font-sans text-zinc-400">
                      View past settled payments and expenses
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING ADD COST ACTION BUTTON */}
      <button
        type="button"
        onClick={handleOpenAddCostSheet}
        className="fixed bottom-[102px] right-6 z-30 w-13 h-13 rounded-full bg-[#FF6B2C] hover:bg-[#e05a1f] active:scale-95 text-white flex items-center justify-center shadow-lg shadow-[#FF6B2C]/30 transition-all cursor-pointer border border-white/10"
        aria-label="Add Cost"
      >
        <BanknoteArrowUp className="w-6 h-6 stroke-[2.2]" />
      </button>

      {/* EDIT COST BOTTOM SHEET COMPONENT */}
      <EditCost
        isOpen={showEditSheet}
        selectedExpense={selectedExpense}
        onClose={() => {
          setShowEditSheet(false);
          setSelectedExpense(null);
        }}
        onOptimisticUpdate={(opt) => {
          onRefreshBalances();
        }}
        onRefreshBalances={onRefreshBalances}
        activeUserId={activeUserId}
        relevantPlans={relevantPlans}
        dbPlanParticipants={dbPlanParticipantsLocal}
        dbUsers={dbUsersLocal}
      />

      {/* ADD COST BOTTOM SHEET COMPONENT */}
      <AddCost
        isOpen={showAddCostSheet}
        onClose={() => setShowAddCostSheet(false)}
        onRefreshBalances={onRefreshBalances}
        activeUserId={activeUserId}
        relevantPlans={relevantPlans}
        dbPlanParticipants={dbPlanParticipantsLocal}
        dbUsers={dbUsersLocal}
        otherUserId={otherUserId}
      />

      {/* DELETE EXPENSE CONFIRMATION MODAL */}
      {showDeleteModal && selectedExpense && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => {
            if (!submittingDelete) {
              setShowDeleteModal(false);
              setSelectedExpense(null);
              setDeleteError(null);
            }
          }}
        >
          <div
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-sans font-bold text-white">Delete Expense?</h3>
                <p className="text-xs text-zinc-400 font-sans mt-0.5">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 font-sans leading-relaxed">
              Are you sure you want to delete <strong className="text-white font-semibold">{selectedExpense.expenseTitle || selectedExpense.planTitle}</strong>? This expense will be removed and wallet balances will be updated.
            </p>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-sans">
                {deleteError}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={submittingDelete}
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedExpense(null);
                  setDeleteError(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.06] text-xs font-sans font-semibold text-zinc-300 hover:text-white transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingDelete}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-sans font-semibold text-white transition cursor-pointer disabled:opacity-50"
              >
                {submittingDelete ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

