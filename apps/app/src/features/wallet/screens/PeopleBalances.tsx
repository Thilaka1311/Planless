import React, { useState, useMemo, useRef } from "react";
import { ArrowLeft, Plus, Check, Edit2, CheckCircle2, ChevronDown, ChevronUp, ChevronRight, AlertCircle, HandCoins, ArrowUpRight, ArrowDownLeft, Trash2, BanknoteArrowUp, MoreVertical, AlertTriangle, Banknote, createLucideIcon } from "lucide-react";

// Lucide BanknoteCheck Icon Definition
export const BanknoteCheck = createLucideIcon("BanknoteCheck", [
  ["rect", { width: "20", height: "12", x: "2", y: "6", rx: "2", key: "r1" }],
  ["circle", { cx: "9", cy: "12", r: "2", key: "c1" }],
  ["path", { d: "M5 12h.01", key: "p1" }],
  ["path", { d: "m14 11 2 2 4-4", key: "p2" }],
]);
import { WalletRelationship, ExpenseBreakdown, WalletSettlement, createWalletSettlement, deleteWalletSettlement, deleteWalletExpense, updateWalletExpense, isJoinedParticipantStatus, getEffectiveExpenseDate } from "../services/walletService";
import { useWalletStore } from "../state/WalletContext";
import { usePlansStore } from "../../plans/state/PlansContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { supabase } from "../../../../lib/supabaseClient";
import { ExpenseDetails, PlanBalancesDetail } from "./ExpenseDetail";
import { AddCost } from "./AddCost";
import { EditCost } from "./EditCost";
import { SettleUpScreen } from "./SettleUpScreen";

interface RelationshipDetailsScreenProps {
  relationship: WalletRelationship;
  onBack: () => void;
  onRefreshBalances: () => void;
  activeUserId: string;
  onSelectPlan: (planId: string) => void;
  onSelectExpense?: (expenseId: string, planId: string) => void;
  onToggleBottomNav?: (hidden: boolean) => void;
}

export const RelationshipDetailsScreen: React.FC<RelationshipDetailsScreenProps> = ({
  relationship,
  onBack,
  onRefreshBalances,
  activeUserId,
  onSelectPlan,
  onSelectExpense,
  onToggleBottomNav,
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

  // Settle Up full-screen navigation state
  const [showSettleUpScreen, setShowSettleUpScreen] = useState(false);

  // Delete Settlement state
  const [confirmDeleteSettlementId, setConfirmDeleteSettlementId] = useState<string | null>(null);
  const [deletingSettlementId, setDeletingSettlementId] = useState<string | null>(null);
  const [deleteSettlementError, setDeleteSettlementError] = useState<string | null>(null);

  const [scrollTop, setScrollTop] = useState(0);
  const avatarOpacity = Math.max(0, 1 - scrollTop / 75);
  const stickyProgress = Math.min(1, Math.max(0, (scrollTop - 75) / 30));

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
  const formattedNetBalance = (() => {
    const rounded = Math.round(absNetBalance * 100) / 100;
    if (Number.isInteger(rounded)) {
      return `₹${rounded.toLocaleString("en-IN")}`;
    }
    return `₹${rounded.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  })();

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



  // Navigate to Settle Up full screen
  const handleOpenSettleUpScreen = () => {
    if (absNetBalance <= 0) return;
    setShowSettleUpScreen(true);
  };


  // Execute deletion of settlement atomically via RPC
  const handleConfirmDeleteSettlement = async (settlementId: string) => {
    if (deletingSettlementId) return;
    setDeletingSettlementId(settlementId);
    setDeleteSettlementError(null);

    try {
      const res = await deleteWalletSettlement(settlementId);
      if (!res.success) {
        setDeleteSettlementError(res.error || "Failed to delete settlement.");
        return;
      }
      setConfirmDeleteSettlementId(null);
      await onRefreshBalances();
    } catch (err: any) {
      console.error("[RelationshipDetailsScreen] Error deleting settlement:", err);
      setDeleteSettlementError(err.message || "Failed to delete settlement.");
    } finally {
      setDeletingSettlementId(null);
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

  // Navigate to Settle Up full screen
  if (showSettleUpScreen) {
    return (
      <SettleUpScreen
        relationship={relationship}
        activeUserId={activeUserId}
        onBack={() => {
          onToggleBottomNav?.(false);
          setShowSettleUpScreen(false);
        }}
        onSettled={async () => {
          onToggleBottomNav?.(false);
          setShowSettleUpScreen(false);
          await onRefreshBalances();
        }}
        onMount={() => onToggleBottomNav?.(true)}
      />
    );
  }

  // Render ExpenseDetails if an expense is tapped
  if (selectedExpenseIdForDetail) {
    return (
      <ExpenseDetails
        expenseId={selectedExpenseIdForDetail}
        onBack={() => setSelectedExpenseIdForDetail(null)}
        onRefreshBalances={onRefreshBalances}
      />
    );
  }

  return (
    <div
      id="subview_relationship_details"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="w-full h-full flex flex-col overflow-y-auto scrollbar-none px-6 pt-0 pb-36 text-left bg-[#050505] relative"
    >
      {/* Sticky Header Bar with Back Button, Centered Fixed Profile Avatar, & Three Dots Menu */}
      <div
        className="sticky top-0 z-50 -mx-6 px-6 pt-3 pb-3 flex items-center justify-between pointer-events-none transition-colors duration-150 relative h-16"
        style={{
          backgroundColor: `rgba(5, 5, 5, ${stickyProgress})`,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0 z-50 pointer-events-auto"
          aria-label="Back to Wallet"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Centered Fixed Profile Avatar (Fixed 25x25 / 100px x 100px, Pinned at top-11 for breathing room, translateY = 0, dissolves away in place) */}
        <div
          className="absolute left-1/2 -translate-x-1/2 top-11 transition-opacity duration-75 pointer-events-none z-40"
          style={{
            opacity: avatarOpacity,
          }}
        >
          <UserAvatar
            src={relationship.profilePhoto}
            alt={relationship.fullName}
            size="w-25 h-25"
            className="ring-2 ring-white/10 shadow-lg"
          />
        </div>

        <div className="w-8 shrink-0 pointer-events-none" />
      </div>

      {/* THE SINGLE USER-NAME ELEMENT - Scrolls upward and pins natively at sticky top-[15px] z-50 */}
      <h3 className="sticky top-[15px] z-50 font-sans font-bold text-base text-zinc-100 leading-tight text-center truncate px-12 mt-24 pointer-events-auto shrink-0 self-center">
        {relationship.fullName}
      </h3>

      {/* Relationship Header Banner / Profile Hero Section */}
      <div className={`flex flex-col items-center text-center shrink-0 relative z-10 ${absNetBalance === 0 ? "my-4" : "pb-3 space-y-1.5"}`}>
        {absNetBalance === 0 ? (
          <span className="inline-flex items-center px-3.5 py-1 rounded-full bg-zinc-900 border border-white/[0.1] text-xs font-sans font-semibold text-white shadow-sm">
            Settled up
          </span>
        ) : (
          <p className="text-zinc-500 font-sans text-[10px] font-semibold uppercase tracking-widest pt-0.5">
            {isOwed ? "OWES YOU" : "YOU OWE"}
          </p>
        )}
        {absNetBalance > 0 && (
          <>
            <div className="flex items-center justify-center gap-2 mt-0.5">
              <h1 className="font-sans font-extrabold text-2xl sm:text-3xl leading-none text-white">
                {formattedNetBalance}
              </h1>
            </div>
            <div className="pt-1">
              <button
                type="button"
                onClick={handleOpenSettleUpScreen}
                className="inline-flex items-center px-3.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-white/[0.1] text-xs font-sans font-semibold text-zinc-200 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <span>Settle Up</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Timeline container */}
      <div className={`flex-1 flex flex-col ${absNetBalance === 0 ? "pt-0 mt-0" : "pt-1 mt-1"}`}>

        {/* Unified Expenses & Settlements Timeline */}
        {(() => {
          type TimelineItem =
            | { id: string; type: "expense"; date: Date; expense: ExpenseBreakdown }
            | { id: string; type: "settlement"; date: Date; settlement: WalletSettlement };

          const allExpenses = relationship.expenses || [];
          const allSettlements = relationship.settlements || [];

          const items: TimelineItem[] = [];

          allExpenses.forEach((exp) => {
            items.push({
              id: `exp-${exp.id}`,
              type: "expense",
              date: getEffectiveExpenseDate(exp),
              expense: exp,
            });
          });

          allSettlements.forEach((st) => {
            items.push({
              id: `st-${st.id}`,
              type: "settlement",
              date: new Date(st.created_at || Date.now()),
              settlement: st,
            });
          });

          const sortedItems = items.sort((a, b) => b.date.getTime() - a.date.getTime());

          // Group timeline items by Month + Year section (e.g. "August 2026")
          const groupedTimeline = (() => {
            const groups: { sectionTitle: string; yearMonthKey: string; items: typeof sortedItems }[] = [];
            const map = new Map<string, typeof sortedItems>();

            sortedItems.forEach((item) => {
              const validD = item.date;
              const fullMonth = validD.toLocaleString("en-US", { month: "long" });
              const year = validD.getFullYear();
              const key = `${year}-${String(validD.getMonth() + 1).padStart(2, "0")}`;
              const sectionTitle = `${fullMonth} ${year}`;

              if (!map.has(key)) {
                map.set(key, []);
                groups.push({ sectionTitle, yearMonthKey: key, items: map.get(key)! });
              }
              map.get(key)!.push(item);
            });

            return groups;
          })();

          return (
            <div className="flex-1 flex flex-col space-y-3">
              {/* Timeline List grouped by Month */}
              {sortedItems.length === 0 ? (
                <div className="py-5 text-center text-xs text-zinc-500 font-sans">
                  No activity history yet
                </div>
              ) : (
                groupedTimeline.map((group) => (
                  <div key={`month-group-${group.yearMonthKey}`} className="space-y-0 text-left">
                    {/* Month / Year Section Header */}
                    <div className="py-2.5 pt-3 text-left">
                      <h4 className="font-sans font-semibold text-xs text-zinc-400 tracking-wide">
                        {group.sectionTitle}
                      </h4>
                    </div>

                    <div className="space-y-0.5 pt-1">
                      {group.items.map((item) => {
                        const validD = item.date;
                        const monthUpper = validD.toLocaleString("en-US", { month: "short" }).toUpperCase();
                        const dayStr = String(validD.getDate()).padStart(2, "0");

                        if (item.type === "expense") {
                          const expense = item.expense;
                          const isSettled = expense.status === "SETTLED" || expense.participantStatus === "SETTLED";
                          const expenseIsOwed = expense.role === "creditor";
                          const shareNum = Number(expense.yourShare || 0);
                          const isShareWhole = shareNum % 1 === 0;
                          const formattedShare = `₹${shareNum.toLocaleString("en-IN", {
                            minimumFractionDigits: isShareWhole ? 0 : 2,
                            maximumFractionDigits: 2,
                          })}`;

                          return (
                            <div
                              key={`expense-item-${expense.id}`}
                              onClick={() => handleCardClick(expense)}
                              className={`w-full flex items-center justify-between py-3.5 text-left group transition-all cursor-pointer px-0.5 select-none hover:bg-white/[0.01] ${isSettled ? "opacity-45" : "opacity-100"
                                }`}
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                {/* VERTICAL DATE COLUMN */}
                                <div className="w-8 shrink-0 flex flex-col items-center justify-center text-center select-none mr-0.5">
                                  <span className={`text-[9.5px] font-sans font-semibold tracking-wider uppercase leading-none ${isSettled ? "text-zinc-600" : "text-zinc-500"
                                    }`}>
                                    {monthUpper}
                                  </span>
                                  <span className={`text-[13px] font-sans font-bold leading-none mt-1 ${isSettled ? "text-zinc-600" : "text-zinc-500"
                                    }`}>
                                    {dayStr}
                                  </span>
                                </div>

                                {expense.planCover ? (
                                  <DiscoveryImages
                                    src={expense.planCover}
                                    alt={expense.planTitle}
                                    className={`w-10 h-10 rounded-full object-cover bg-zinc-900 border border-white/[0.05] shrink-0 ${isSettled ? "opacity-60 grayscale-[0.3]" : ""
                                      }`}
                                  />
                                ) : (
                                  <div className={`w-10 h-10 rounded-full bg-zinc-900 border border-white/[0.05] shrink-0 flex items-center justify-center text-[10px] font-black ${isSettled ? "text-zinc-700 opacity-60" : "text-zinc-650"
                                    }`}>
                                    PLAN
                                  </div>
                                )}

                                <div className="min-w-0 flex flex-col justify-center flex-1 pr-3">
                                  <h5 className={`font-sans text-[13.5px] truncate leading-tight ${isSettled
                                    ? "font-medium text-zinc-500 group-hover:text-zinc-400"
                                    : "font-semibold text-zinc-100 group-hover:text-white"
                                    }`}>
                                    {expense.expenseTitle || (expense as any).title || "Plan Fee"}
                                  </h5>
                                  <span className={`text-[11.5px] font-sans font-medium block truncate leading-tight mt-0.5 ${isSettled ? "text-zinc-600" : "text-zinc-400"
                                    }`}>
                                    {expense.planTitle}
                                  </span>
                                  <span className={`text-[10px] font-sans block truncate leading-tight mt-0.5 ${isSettled ? "text-zinc-600" : "text-zinc-550"
                                    }`}>
                                    {(() => {
                                      const otherPlanPart = (dbPlanParticipantsLocal || []).find(
                                        (p: any) =>
                                          String(p.plan_id || p.planId || "").trim().toLowerCase() === String(expense.planId || "").trim().toLowerCase() &&
                                          String(p.user_id || p.userId || "").trim().toLowerCase() === String(relationship.userId || "").trim().toLowerCase()
                                      );
                                      const otherRsvpStatus = String(otherPlanPart?.rsvp_status || otherPlanPart?.status || "").trim().toUpperCase();
                                      const isOtherSkipped = otherRsvpStatus === "SKIPPED";

                                      const baseText = expense.isPaymentKept
                                        ? "Payment kept"
                                        : expenseIsOwed
                                          ? `${relationship.fullName} owes you`
                                          : `You owe ${relationship.fullName}`;

                                      return isOtherSkipped ? `${baseText} · Left plan` : baseText;
                                    })()}
                                  </span>
                                </div>
                              </div>

                              <div className="text-right shrink-0 min-w-max pl-2 flex items-center justify-end">
                                {isSettled ? (
                                  <span className="font-sans text-xs font-semibold text-zinc-500">
                                    Settled up
                                  </span>
                                ) : (
                                  <span className="font-sans text-sm font-bold tracking-tight text-zinc-100">
                                    {formattedShare}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // SETTLEMENT TIMELINE ROW
                        const st = item.settlement;
                        const isPayerMe = st.payer_id === activeUserId;
                        const amountNum = Number(st.amount || 0);
                        const isWhole = amountNum % 1 === 0;
                        const formattedAmount = `₹${amountNum.toLocaleString("en-IN", {
                          minimumFractionDigits: isWhole ? 0 : 2,
                          maximumFractionDigits: 2,
                        })}`;

                        return (
                          <div
                            key={`settlement-item-${st.id}`}
                            onClick={() => setConfirmDeleteSettlementId(st.id)}
                            className="w-full flex items-center justify-between py-3.5 text-left group transition-all px-0.5 select-none opacity-100 cursor-pointer hover:bg-white/[0.01]"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {/* VERTICAL DATE COLUMN */}
                              <div className="w-8 shrink-0 flex flex-col items-center justify-center text-center select-none mr-0.5">
                                <span className="text-[9.5px] font-sans font-semibold tracking-wider uppercase leading-none text-zinc-500">
                                  {monthUpper}
                                </span>
                                <span className="text-[13px] font-sans font-bold leading-none mt-1 text-zinc-500">
                                  {dayStr}
                                </span>
                              </div>

                              <div className="w-10 h-10 flex items-center justify-center text-emerald-400 shrink-0">
                                <BanknoteCheck className="w-6 h-6 stroke-[2]" />
                              </div>

                              <div className="min-w-0 flex flex-col justify-center flex-1 pr-3">
                                <h5 className="font-sans text-[13.5px] truncate leading-tight font-semibold text-zinc-100 group-hover:text-white">
                                  {relationship.fullName}
                                </h5>
                                <span className="text-[11.5px] font-sans font-medium block truncate leading-tight mt-0.5 text-zinc-400">
                                  {isPayerMe ? `You paid ${formattedAmount}` : `Paid you ${formattedAmount}`}
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0 min-w-max pl-2 flex items-center justify-end">
                              <span
                                className={`font-sans text-sm font-bold tracking-tight ${isPayerMe ? "text-zinc-100" : "text-emerald-400"
                                  }`}
                              >
                                {formattedAmount}
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

      {/* DELETE SETTLEMENT CONFIRMATION BOTTOM SHEET */}
      {confirmDeleteSettlementId && (() => {
        const targetSettlement = (relationship.settlements || []).find((s) => s.id === confirmDeleteSettlementId);
        const amountNum = targetSettlement ? Number(targetSettlement.amount || 0) : 0;
        const isWhole = amountNum % 1 === 0;
        const targetAmountStr = `₹${amountNum.toLocaleString("en-IN", {
          minimumFractionDigits: isWhole ? 0 : 2,
          maximumFractionDigits: 2,
        })}`;
        const isPayerMe = targetSettlement?.payer_id === activeUserId;
        const settlementLabel = isPayerMe
          ? `You paid ${relationship.fullName} ${targetAmountStr}`
          : `${relationship.fullName} paid you ${targetAmountStr}`;

        return (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-xs animate-fade-in"
            onClick={() => {
              if (!deletingSettlementId) {
                setConfirmDeleteSettlementId(null);
                setDeleteSettlementError(null);
              }
            }}
          >
            <div
              className="w-full bg-[#1c1c1e] border-t border-white/[0.08] rounded-t-3xl p-6 pb-8 shadow-2xl space-y-4 text-center font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag Handle Indicator */}
              <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-1" />

              {/* Single-line Settlement Summary Row (Centered) */}
              <div className="flex items-center justify-center gap-3 text-center pt-1">
                <BanknoteCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                <span className="text-base font-sans font-semibold text-white truncate leading-tight">
                  {settlementLabel}
                </span>
              </div>

              {deleteSettlementError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-sans text-center">
                  {deleteSettlementError}
                </div>
              )}

              {/* Destructive Delete & Simple Text Cancel matching bottom-sheet system */}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  disabled={Boolean(deletingSettlementId)}
                  onClick={() => handleConfirmDeleteSettlement(confirmDeleteSettlementId)}
                  style={{
                    width: "100%",
                    padding: "14px",
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "none",
                    borderRadius: 12,
                    color: "#EF4444",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                  className="transition active:scale-[0.98] disabled:opacity-50"
                >
                  {deletingSettlementId ? "Deleting..." : "Delete"}
                </button>

                <button
                  type="button"
                  disabled={Boolean(deletingSettlementId)}
                  onClick={() => {
                    setConfirmDeleteSettlementId(null);
                    setDeleteSettlementError(null);
                  }}
                  style={{
                    width: "100%",
                    padding: "14px",
                    background: "none",
                    border: "none",
                    borderRadius: 12,
                    color: "rgba(255, 255, 255, 0.4)",
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: "pointer",
                    textAlign: "center",
                    marginTop: 4,
                  }}
                  className="transition hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

