import React, { useState, useMemo, useRef } from "react";
import { ArrowLeft, Plus, Check, Edit2, CheckCircle2, AlertCircle, HandCoins, ArrowUpRight, ArrowDownLeft, Trash2 } from "lucide-react";
import { WalletRelationship, ExpenseBreakdown, settleWalletExpenseParticipant, settleWalletRelationship, deleteWalletExpense, updateWalletExpense } from "../services/walletService";
import { useWalletStore } from "../state/WalletContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { supabase } from "../../../../lib/supabaseClient";
import { ExpenseDetails, PlanBalancesDetail } from "./ExpenseDetail";

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

  // Selected expense ID for PlanBalancesDetail navigation
  const [selectedExpenseIdForDetail, setSelectedExpenseIdForDetail] = useState<string | null>(null);

  // Add Cost state
  const [showAddCostSheet, setShowAddCostSheet] = useState(false);
  const [costTitle, setCostTitle] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [submittingCost, setSubmittingCost] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Long-press & Action sheets state
  const [selectedExpense, setSelectedExpense] = useState<ExpenseBreakdown | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);

  // Overall Settle Up sheet state
  const [showOverallSettleSheet, setShowOverallSettleSheet] = useState(false);
  const [submittingOverallSettle, setSubmittingOverallSettle] = useState(false);
  const [overallSettleError, setOverallSettleError] = useState<string | null>(null);

  // Edit Expense form state
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editPlanId, setEditPlanId] = useState("");
  const [editParticipantIds, setEditParticipantIds] = useState<string[]>([]);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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

  // Compute available participants for selected plan in Add Cost sheet (STRICTLY members of selected plan)
  const availablePlanParticipants = useMemo(() => {
    const targetPlan = selectedPlanId || (relevantPlans[0]?.id) || (dbPlansLocal[0]?.id);
    if (!targetPlan) return [];

    const planPartRows = (dbPlanParticipantsLocal || []).filter(
      (pp) => pp.plan_id === targetPlan && ["JOINED", "WAITLISTED"].includes(String(pp.rsvp_status || "").toUpperCase())
    );

    const userMap = new Map<string, any>();
    (dbUsersLocal || []).forEach((u) => {
      if (u.id) userMap.set(u.id, u);
      if (u.user_id) userMap.set(u.user_id, u);
      if (u.public_id) userMap.set(u.public_id, u);
    });

    (dbPlanParticipantsLocal || []).forEach((pp) => {
      if (pp.user && pp.user_id && !userMap.has(pp.user_id)) {
        userMap.set(pp.user_id, pp.user);
      }
    });

    // Extract unique user_ids strictly from joined plan participants (plus activeUserId/otherUserId if they belong to this plan)
    const rawUserIds = planPartRows.map((pp) => pp.user_id);
    // If planPartRows is empty in local memory, fallback to activeUserId and otherUserId for this relationship context
    const pUserIds = rawUserIds.length > 0
      ? Array.from(new Set(rawUserIds))
      : Array.from(new Set([activeUserId, otherUserId]));

    return pUserIds.map((uid) => {
      const u = userMap.get(uid);
      const isMe = uid === activeUserId;
      const isRelationshipUser = uid === otherUserId;

      const photo =
        u?.profile_photo_path ||
        u?.profile_photo ||
        u?.avatar ||
        (isRelationshipUser ? relationship.profilePhoto : "");

      const name = isMe
        ? "You"
        : u?.full_name || u?.name || u?.username || (isRelationshipUser ? relationship.fullName : "Participant");

      return {
        id: uid,
        name,
        avatar: photo,
      };
    });
  }, [selectedPlanId, relevantPlans, dbPlansLocal, dbPlanParticipantsLocal, dbUsersLocal, activeUserId, otherUserId, relationship]);

  // Compute available participants for editPlanId in Edit Cost sheet
  const availableEditParticipants = useMemo(() => {
    const targetPlan = editPlanId || selectedExpense?.planId;
    if (!targetPlan) return [];

    const planPartRows = (dbPlanParticipantsLocal || []).filter(
      (pp) => pp.plan_id === targetPlan && ["JOINED", "WAITLISTED"].includes(String(pp.rsvp_status || "").toUpperCase())
    );

    const userMap = new Map<string, any>();
    (dbUsersLocal || []).forEach((u) => {
      if (u.id) userMap.set(u.id, u);
      if (u.user_id) userMap.set(u.user_id, u);
      if (u.public_id) userMap.set(u.public_id, u);
    });

    (dbPlanParticipantsLocal || []).forEach((pp) => {
      if (pp.user && pp.user_id && !userMap.has(pp.user_id)) {
        userMap.set(pp.user_id, pp.user);
      }
    });

    const rawUserIds = planPartRows.map((pp) => pp.user_id);
    const pUserIds = rawUserIds.length > 0
      ? Array.from(new Set(rawUserIds))
      : Array.from(new Set([activeUserId, otherUserId]));

    return pUserIds.map((uid) => {
      const u = userMap.get(uid);
      const isMe = uid === activeUserId;
      const isRelationshipUser = uid === otherUserId;

      const photo =
        u?.profile_photo_path ||
        u?.profile_photo ||
        u?.avatar ||
        (isRelationshipUser ? relationship.profilePhoto : "");

      const name = isMe
        ? "You"
        : u?.full_name || u?.name || u?.username || (isRelationshipUser ? relationship.fullName : "Participant");

      return {
        id: uid,
        name,
        avatar: photo,
      };
    });
  }, [editPlanId, selectedExpense, dbPlanParticipantsLocal, dbUsersLocal, activeUserId, otherUserId, relationship]);

  const isOwed = relationship.netBalance >= 0;
  const absNetBalance = Math.abs(relationship.netBalance);
  const formattedNetBalance = absNetBalance.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  const parsedAmount = parseFloat(costAmount);
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount > 0;
  // Final split participants = Payer (activeUserId) + explicitly selected participants
  const finalParticipantIds = useMemo(() => {
    return Array.from(new Set([activeUserId, ...selectedParticipantIds]));
  }, [activeUserId, selectedParticipantIds]);

  const isFormValid = costTitle.trim().length > 0 && isValidAmount && selectedPlanId.length > 0 && selectedParticipantIds.length > 0;

  // Calculated share per person in the final split (Payer + Selected)
  const perPersonShare = isValidAmount && finalParticipantIds.length > 0
    ? Math.round((parsedAmount / finalParticipantIds.length) * 100) / 100
    : 0;

  // Edit form validation
  const parsedEditAmount = parseFloat(editAmount);
  const isValidEditAmount = !isNaN(parsedEditAmount) && parsedEditAmount > 0;
  const isEditFormValid = editTitle.trim().length > 0 && isValidEditAmount && editPlanId.length > 0 && editParticipantIds.length > 0;

  const finalEditParticipantIds = useMemo(() => {
    return Array.from(new Set([activeUserId, ...editParticipantIds]));
  }, [activeUserId, editParticipantIds]);

  // Calculated share per selected participant in Edit Cost
  const editPerPersonShare = isValidEditAmount && finalEditParticipantIds.length > 0
    ? Math.round((parsedEditAmount / finalEditParticipantIds.length) * 100) / 100
    : 0;

  // Long press handler functions - ONLY expense payer can long-press to open action sheet
  const handleTouchStart = (expense: ExpenseBreakdown) => {
    const isPayer = expense.payerId
      ? (expense.payerId === activeUserId)
      : expense.role === "creditor";

    if (!isPayer) return;

    isLongPressRef.current = false;
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setSelectedExpense(expense);
      setShowActionMenu(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleCardClick = (expense: ExpenseBreakdown) => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    if (!expense?.id) {
      console.warn("[PeopleBalances] Expense row missing valid wallet_expenses.id");
      return;
    }
    console.log("[WalletNavigation] screen = expenseDetails, expenseId =", expense.id, "source = people");
    setSelectedExpenseIdForDetail(expense.id);
  };

  const handleOpenAddCostSheet = () => {
    setFormError(null);
    setCostTitle("");
    setCostAmount("");
    const initialPlan = relevantPlans[0]?.id || dbPlansLocal[0]?.id || "";
    setSelectedPlanId(initialPlan);

    // Initial participant selection: all active members of initialPlan (JOINED or WAITLISTED)
    const planPartRows = (dbPlanParticipantsLocal || []).filter(
      (pp) => pp.plan_id === initialPlan && ["JOINED", "WAITLISTED"].includes(String(pp.rsvp_status || "").toUpperCase())
    );
    const initialUserIds = planPartRows.length > 0
      ? Array.from(new Set(planPartRows.map((pp) => pp.user_id)))
      : Array.from(new Set([activeUserId, otherUserId]));

    setSelectedParticipantIds(initialUserIds);
    setShowAddCostSheet(true);
  };

  const handleSelectPlanChange = (planId: string) => {
    setSelectedPlanId(planId);

    // Refresh participant list checkmarks for newly selected plan
    const planPartRows = (dbPlanParticipantsLocal || []).filter(
      (pp) => pp.plan_id === planId && ["JOINED", "WAITLISTED"].includes(String(pp.rsvp_status || "").toUpperCase())
    );
    const newPlanUserIds = planPartRows.length > 0
      ? Array.from(new Set(planPartRows.map((pp) => pp.user_id)))
      : Array.from(new Set([activeUserId, otherUserId]));

    setSelectedParticipantIds(newPlanUserIds);
  };

  const toggleParticipantSelection = (uid: string) => {
    setSelectedParticipantIds((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((id) => id !== uid);
      } else {
        return [...prev, uid];
      }
    });
  };

  const toggleEditParticipantSelection = (uid: string) => {
    setEditParticipantIds((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((id) => id !== uid);
      } else {
        return [...prev, uid];
      }
    });
  };

  const handleAddCostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || submittingCost) return;

    setSubmittingCost(true);
    setFormError(null);

    try {
      // Step 1: Optional plan_message insertion (non-blocking)
      let messageId: string | null = null;
      try {
        const { data: msgData } = await (supabase as any)
          .from("plan_messages")
          .insert({
            plan_id: selectedPlanId,
            user_id: activeUserId,
            content: JSON.stringify({ title: costTitle.trim(), amount: parsedAmount }),
            message_type: "cost",
          })
          .select()
          .single();
        messageId = msgData?.id || null;
      } catch (msgErr) {
        console.warn("[RelationshipDetailsScreen] Non-fatal error inserting plan_messages:", msgErr);
      }

      const resolveUserUuid = (rawId: string): string => {
        const u = (dbUsersLocal || []).find(
          (usr) => usr.id === rawId || usr.user_id === rawId || usr.public_id === rawId
        );
        return u?.id || rawId;
      };

      const resolvedPayerUuid = resolveUserUuid(activeUserId);
      const resolvedParticipantUuids = selectedParticipantIds.map(resolveUserUuid);
      const finalParticipantUuids = Array.from(new Set([resolvedPayerUuid, ...resolvedParticipantUuids]));

      // Step 2: Invoke insert_cost_expense RPC to create wallet_expenses + wallet_expense_participants
      // Use finalParticipantUuids (Payer + Selected) as the source of truth
      const { error: rpcError } = await (supabase as any).rpc("insert_cost_expense", {
        p_plan_id: selectedPlanId,
        p_message_id: messageId,
        p_payer_id: resolvedPayerUuid,
        p_title: costTitle.trim(),
        p_total_amount: parsedAmount,
        p_participant_ids: finalParticipantUuids,
      });

      if (rpcError) {
        console.error("[RelationshipDetailsScreen] insert_cost_expense failed:", rpcError);
        setFormError(rpcError.message || "Failed to create expense. Please try again.");
        setSubmittingCost(false);
        return;
      }

      // Close bottom sheet & refresh balances
      setShowAddCostSheet(false);
      setCostTitle("");
      setCostAmount("");
      setSelectedParticipantIds([]);
      await onRefreshBalances();
    } catch (err: any) {
      console.error("[RelationshipDetailsScreen] Exception adding cost:", err);
      setFormError(err.message || "An unexpected error occurred.");
    } finally {
      setSubmittingCost(false);
    }
  };

  // Open Edit Sheet & pre-fill values including exact expense participants
  const handleOpenEditSheet = async () => {
    if (!selectedExpense) return;
    setShowActionMenu(false);
    setEditError(null);
    setEditTitle(selectedExpense.planTitle || "");
    setEditAmount(String(selectedExpense.totalAmount || ""));
    setEditPlanId(selectedExpense.planId || "");

    // Fetch existing participants of this expense from wallet_expense_participants
    try {
      const { data: existingParts, error: partsErr } = await (supabase as any)
        .from("wallet_expense_participants")
        .select("user_id")
        .eq("expense_id", selectedExpense.id);

      if (!partsErr && existingParts && existingParts.length > 0) {
        setEditParticipantIds(existingParts.map((p: any) => p.user_id));
      } else {
        setEditParticipantIds([activeUserId, otherUserId]);
      }
    } catch (err) {
      setEditParticipantIds([activeUserId, otherUserId]);
    }

    setShowEditSheet(true);
  };

  // Save Edit Expense modifications with RPC enforcing strict payer-only authorization
  const handleEditExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpense || !isEditFormValid || submittingEdit) return;

    setSubmittingEdit(true);
    setEditError(null);

    try {
      await updateWalletExpense({
        expenseId: selectedExpense.id,
        title: editTitle.trim(),
        totalAmount: parsedEditAmount,
        planId: editPlanId,
        participantIds: finalEditParticipantIds,
      });

      // Close edit sheet & refresh
      setShowEditSheet(false);
      setSelectedExpense(null);
      await onRefreshBalances();
    } catch (err: any) {
      console.error("[RelationshipDetailsScreen] Exception editing expense:", err);
      setEditError(err.message || "An error occurred while updating the expense.");
    } finally {
      setSubmittingEdit(false);
    }
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
    if (!isOwed || absNetBalance <= 0) return;
    setOverallSettleError(null);
    setShowOverallSettleSheet(true);
  };

  // Execute settlement across all outstanding expenses for this relationship atomically via RPC
  const handleConfirmOverallSettle = async () => {
    if (submittingOverallSettle || absNetBalance <= 0 || !isOwed) return;

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
          console.log("[WalletNavigation] screen = peopleBalances, personId =", relationship.userId);
          setSelectedExpenseIdForDetail(null);
        }}
        onRefreshBalances={async () => {
          await onRefreshBalances();
        }}
        activeUserId={activeUserId}
      />
    );
  }

  return (
    <div
      id="subview_relationship_details"
      className="w-full h-full flex flex-col overflow-y-auto scrollbar-none px-6 pt-3 pb-24 text-left bg-[#050505]"
    >
      {/* Header with Back Button */}
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
            Balances
          </h2>
        </div>
      </div>

      {/* Relationship Header Banner */}
      <div className="flex flex-col items-center text-center py-6 mt-2 space-y-3">
        <UserAvatar
          src={relationship.profilePhoto}
          alt={relationship.fullName}
          size="w-20 h-20"
          className="ring-2 ring-white/10"
        />
        <div className="space-y-1">
          <h3 className="font-display font-bold text-xl text-zinc-100">
            {relationship.fullName}
          </h3>
          <p className="text-zinc-500 font-sans text-xs font-medium uppercase tracking-wider">
            {absNetBalance === 0 ? "SETTLED UP" : isOwed ? "OWES YOU" : "YOU OWE"}
          </p>
          <div className="flex items-center justify-center gap-2 mt-1">
            <h1
              className={`font-sans font-black text-4xl leading-none ${absNetBalance === 0 ? "text-zinc-300" : isOwed ? "text-emerald-400" : "text-[#FF6B2C]"
                }`}
            >
              {formattedNetBalance}
            </h1>
          </div>
          {absNetBalance > 0 && isOwed && (
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
          )}
        </div>
      </div>

      {/* Expense Timeline section header with + Add Cost button */}
      <div className="flex-1 flex flex-col pt-4 mt-2">
        <div className="flex items-center justify-between px-1 mb-4">
          <h4 className="text-[11px] font-sans font-semibold text-zinc-500">
            Expenses
          </h4>
          <button
            type="button"
            onClick={handleOpenAddCostSheet}
            className="flex items-center gap-1 px-3 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-xs font-sans font-semibold text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Cost</span>
          </button>
        </div>

        {/* Expenses Timeline (Sorted newest to oldest) */}
        <div className="divide-y divide-white/[0.04]">
          {(() => {
            const allExpenses = relationship.expenses || [];

            if (allExpenses.length === 0) {
              return (
                <div className="py-8 text-center text-xs text-zinc-500 font-sans">
                  No expense history yet
                </div>
              );
            }

            // Sort by wallet_expense_participants.updated_at descending (most recently updated -> top)
            const sortedExpenses = [...allExpenses].sort((a, b) => {
              const timeA = new Date(a.updatedAt || a.date).getTime();
              const timeB = new Date(b.updatedAt || b.date).getTime();
              return timeB - timeA;
            });

            return sortedExpenses.map((expense) => {
              const expenseIsOwed = expense.role === "creditor";
              const isSettled = expense.status === "SETTLED" || expense.participantStatus === "SETTLED";

              const formattedShare = expense.yourShare.toLocaleString("en-IN", {
                style: "currency",
                currency: "INR",
                maximumFractionDigits: 0,
              });

              return (
                <div
                  key={`expense-${expense.id}`}
                  onTouchStart={() => !isSettled && handleTouchStart(expense)}
                  onTouchEnd={handleTouchEnd}
                  onMouseDown={() => !isSettled && handleTouchStart(expense)}
                  onMouseUp={handleTouchEnd}
                  onMouseLeave={handleTouchEnd}
                  onClick={() => handleCardClick(expense)}
                  className={`w-full flex items-center justify-between py-4 text-left group transition-all cursor-pointer px-1 select-none ${isSettled ? "opacity-60 hover:opacity-90" : "hover:bg-white/[0.01]"
                    }`}
                >
                  {/* Left block: Cover -> Expense Info */}
                  <div className="flex items-center gap-3.5 flex-1 min-w-0">
                    {expense.planCover ? (
                      <DiscoveryImages
                        src={expense.planCover}
                        alt={expense.planTitle}
                        className={`w-10 h-10 rounded-lg object-cover bg-zinc-900 border border-white/[0.05] shrink-0 ${isSettled ? "grayscale-30" : ""
                          }`}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/[0.05] shrink-0 flex items-center justify-center text-[10px] text-zinc-650 font-black">
                        PLAN
                      </div>
                    )}

                    <div className="min-w-0 flex flex-col justify-center">
                      <h5 className={`font-sans font-semibold text-[13.5px] truncate leading-tight ${isSettled ? "text-zinc-400 group-hover:text-zinc-200" : "text-zinc-100 group-hover:text-white"
                        }`}>
                        {expense.expenseTitle || expense.title || "Plan Fee"}
                      </h5>
                      <span className="text-[11.5px] font-sans font-medium text-zinc-400 block truncate leading-tight mt-0.5">
                        {expense.planTitle}
                      </span>
                      <span className="text-[10px] font-sans text-zinc-500 block truncate leading-tight mt-0.5">
                        {isSettled
                          ? expenseIsOwed
                            ? `${relationship.fullName} paid you`
                            : `You paid ${relationship.fullName}`
                          : expenseIsOwed
                            ? `${relationship.fullName} owes you`
                            : `You owe ${relationship.fullName}`}
                      </span>
                    </div>
                  </div>

                  {/* Right block: Amount or Settled Tag */}
                  <div className="text-right shrink-0">
                    {isSettled ? (
                      <span className="font-sans text-[11px] font-medium tracking-tight text-zinc-500 bg-zinc-900/60 px-2 py-0.5 rounded border border-white/[0.04]">
                        Settled
                      </span>
                    ) : (
                      <span
                        className={`font-mono text-sm font-bold tracking-tight ${expenseIsOwed ? "text-emerald-400" : "text-[#FF6B2C]"
                          }`}
                      >
                        {expenseIsOwed ? "+" : "-"}
                        {formattedShare}
                      </span>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* LONG-PRESS ACTION MENU BOTTOM SHEET */}
      {showActionMenu && selectedExpense && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-xs animate-fade-in"
          onClick={() => {
            setShowActionMenu(false);
            setSelectedExpense(null);
          }}
        >
          <div
            className="w-full max-w-md bg-zinc-950 border-t border-zinc-800 rounded-t-3xl p-6 shadow-2xl space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <div>
                <h3 className="text-base font-display font-bold text-white truncate max-w-[240px]">
                  {selectedExpense.planTitle}
                </h3>
                <p className="text-xs text-zinc-550 font-sans mt-0.5">
                  Outstanding: ₹{selectedExpense.outstandingAmount.toLocaleString("en-IN")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowActionMenu(false);
                  setSelectedExpense(null);
                }}
                className="text-zinc-500 hover:text-white text-xs font-semibold"
              >
                Close
              </button>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleOpenEditSheet}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/[0.04] text-zinc-200 hover:text-white text-sm font-medium transition cursor-pointer"
              >
                <Edit2 className="w-4 h-4 text-emerald-400" />
                <span>Edit Cost</span>
              </button>

              {selectedExpense.role === "creditor" && (
                <button
                  type="button"
                  onClick={handleOpenSettleModal}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/[0.04] text-zinc-200 hover:text-white text-sm font-medium transition cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#FF6B2C]" />
                  <span>Settle Up</span>
                </button>
              )}

              {/* DELETE EXPENSE ACTION BUTTON */}
              <button
                type="button"
                onClick={handleOpenDeleteModal}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 text-sm font-medium transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>Delete Expense</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT COST BOTTOM SHEET */}
      {showEditSheet && selectedExpense && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-md bg-zinc-950 border-t border-zinc-800 rounded-t-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3 shrink-0">
              <h3 className="text-lg font-display font-bold text-white">Edit Cost</h3>
              <button
                type="button"
                onClick={() => {
                  setShowEditSheet(false);
                  setSelectedExpense(null);
                  setEditError(null);
                }}
                className="text-zinc-400 hover:text-white text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                {editError}
              </div>
            )}

            <form onSubmit={handleEditExpenseSubmit} className="space-y-4 pt-1 overflow-y-auto scrollbar-none flex-1">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Expense Title
                </label>
                <input
                  type="text"
                  placeholder="Title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Plan
                </label>
                <select
                  value={editPlanId}
                  onChange={(e) => setEditPlanId(e.target.value)}
                  className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-zinc-700"
                >
                  {relevantPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title || "Plan"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Total Cost (₹)
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                  min="1"
                  step="any"
                />
              </div>

              {/* SPLIT BETWEEN SELECTION */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Split Between ({editParticipantIds.length})
                  </label>
                  {isValidEditAmount && editParticipantIds.length > 0 && (
                    <span className="text-xs font-mono font-semibold text-[#FF6B2C]">
                      ₹{editPerPersonShare} / person
                    </span>
                  )}
                </div>

                <div className="space-y-2 max-h-44 overflow-y-auto scrollbar-none">
                  {availableEditParticipants.map((p) => {
                    const isSelected = editParticipantIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleEditParticipantSelection(p.id)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer text-left ${isSelected
                            ? "bg-zinc-900 border-[#FF6B2C]/60 text-white"
                            : "bg-zinc-900/40 border-zinc-800/60 text-zinc-400 hover:bg-zinc-900/80"
                          }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            src={p.avatar}
                            alt={p.name}
                            size="w-8 h-8"
                            className="shrink-0"
                          />
                          <span className="font-sans font-medium text-xs truncate">
                            {p.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-zinc-400">
                            {isSelected ? `₹${editPerPersonShare}` : "₹0"}
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
                  disabled={!isEditFormValid || submittingEdit}
                  className="w-full h-12 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  {submittingEdit ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SETTLE UP CONFIRMATION MODAL */}
      {showSettleModal && selectedExpense && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => {
            setShowSettleModal(false);
            setSelectedExpense(null);
          }}
        >
          <div
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-emerald-400 border-b border-zinc-900 pb-3">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-display font-bold text-white">
                Settle Up Expense
              </h3>
            </div>

            {settleError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{settleError}</span>
              </div>
            )}

            <div className="space-y-2 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/80">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Expense Name:</span>
                <span className="font-semibold text-white truncate max-w-[150px]">
                  {selectedExpense.planTitle}
                </span>
              </div>
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Person:</span>
                <span className="font-semibold text-white">
                  {relationship.fullName}
                </span>
              </div>
              <div className="flex justify-between text-xs text-zinc-400 pt-2 border-t border-zinc-800/60">
                <span>Settling Amount:</span>
                <span className="font-mono text-sm font-bold text-emerald-400">
                  ₹{selectedExpense.outstandingAmount.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowSettleModal(false);
                  setSelectedExpense(null);
                }}
                className="flex-1 h-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold text-xs transition cursor-pointer border border-zinc-800"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmSettle}
                disabled={submittingSettle}
                className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 disabled:opacity-50"
              >
                {submittingSettle ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Settling...</span>
                  </>
                ) : (
                  <span>Confirm Settle</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OVERALL SETTLE UP BOTTOM SHEET */}
      {showOverallSettleSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-xs animate-fade-in"
          onClick={() => setShowOverallSettleSheet(false)}
        >
          <div
            className="w-full max-w-md bg-zinc-950 border-t border-zinc-800/80 rounded-t-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col text-left animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <HandCoins className="w-5 h-5 text-emerald-400 shrink-0" />
                <h3 className="text-lg font-display font-bold text-white">Settle Up</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowOverallSettleSheet(false)}
                className="text-zinc-400 hover:text-white text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {overallSettleError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{overallSettleError}</span>
              </div>
            )}

            {/* Summary details */}
            <div className="space-y-4 py-2 overflow-y-auto scrollbar-none flex-1">
              <div className="flex items-center gap-3 p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800/80">
                <UserAvatar
                  src={relationship.profilePhoto}
                  alt={relationship.fullName}
                  size="w-12 h-12"
                  className="shrink-0 ring-1 ring-white/10"
                />
                <div className="min-w-0 flex-1">
                  <h4 className="font-display font-bold text-sm text-white truncate">
                    {relationship.fullName}
                  </h4>
                  <p className="text-xs text-zinc-400 font-sans mt-0.5">
                    {isOwed ? "Owes you in total" : "You owe in total"}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`font-sans font-black text-xl ${isOwed ? "text-emerald-400" : "text-[#FF6B2C]"}`}>
                    {formattedNetBalance}
                  </span>
                </div>
              </div>

              {/* Settlement summary notice */}
              <div className="p-3 bg-zinc-900/40 border border-zinc-800/60 rounded-xl space-y-1">
                <p className="text-xs font-semibold text-zinc-300">Settlement Summary</p>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  {isOwed
                    ? `Mark all outstanding shares from ${relationship.fullName} as fully paid (${formattedNetBalance}).`
                    : `Record a payment of ${formattedNetBalance} to settle your outstanding debt with ${relationship.fullName}.`}
                </p>
              </div>
            </div>

            {/* CTA Button */}
            <div className="pt-2 shrink-0">
              <button
                type="button"
                onClick={handleConfirmOverallSettle}
                disabled={submittingOverallSettle}
                className="w-full h-12 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                {submittingOverallSettle ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Settling Up...</span>
                  </>
                ) : (
                  <span>Settle Up ({formattedNetBalance})</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  setCostTitle("");
                  setCostAmount("");
                  setSelectedParticipantIds([]);
                  setFormError(null);
                }}
                className="text-zinc-400 hover:text-white text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddCostSubmit} className="space-y-4 pt-1 overflow-y-auto scrollbar-none flex-1">
              {/* Expense Name */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Expense Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dinner, Drinks, Tickets"
                  value={costTitle}
                  onChange={(e) => setCostTitle(e.target.value)}
                  className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                  autoFocus
                />
              </div>

              {/* Plan Selection */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Plan
                </label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => handleSelectPlanChange(e.target.value)}
                  className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-zinc-700"
                >
                  {relevantPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title || "Plan"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cost Input */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Cost (₹)
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                  className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                  min="1"
                  step="any"
                />
              </div>

              {/* SPLIT BETWEEN SELECTION */}
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
                          <UserAvatar
                            src={p.avatar}
                            alt={p.name}
                            size="w-8 h-8"
                            className="shrink-0"
                          />
                          <span className="font-sans font-medium text-xs truncate">
                            {p.name}
                          </span>
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

              {/* Submit Button */}
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
                <h3 className="text-base font-display font-bold text-white">Delete Expense?</h3>
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

