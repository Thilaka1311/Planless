import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Edit2, Trash2, HandCoins, CheckCircle2, MoreHorizontal, Check } from "lucide-react";
import { settleWalletExpenseParticipant, deleteWalletExpense, updateWalletExpense, removeExpenseParticipant, getParticipantFinancialState, sortExpenseParticipants } from "../services/walletService";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { usePlansStore } from "../../plans/state/PlansContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { supabase } from "../../../../lib/supabaseClient";

interface ExpenseDetailsProps {
  expenseId: string;
  onBack: () => void;
  onRefreshBalances: () => void;
  activeUserId: string;
  source?: "people" | "plan";
}

export const ExpenseDetails: React.FC<ExpenseDetailsProps> = ({
  expenseId,
  onBack,
  onRefreshBalances,
  activeUserId,
  source,
}) => {
  const { activeUserUuid, userProfile } = useProfileStore();
  const { refreshPlans } = usePlansStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expenseData, setExpenseData] = useState<any | null>(null);
  const [planData, setPlanData] = useState<any | null>(null);
  const [participantsData, setParticipantsData] = useState<any[]>([]);
  const [userProfiles, setUserProfiles] = useState<any[]>([]);
  const [userPostgresUuid, setUserPostgresUuid] = useState<string>("");
  const [financiallyIncludedUserIds, setFinanciallyIncludedUserIds] = useState<Set<string>>(new Set());
  const [rawPlanParticipants, setRawPlanParticipants] = useState<any[]>([]);
  const [paymentKeptUserIds, setPaymentKeptUserIds] = useState<Set<string>>(new Set());
  const [hasLoadedPlanParticipants, setHasLoadedPlanParticipants] = useState(false);

  // Modals & Action Menu state
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [selectedSettleParticipant, setSelectedSettleParticipant] = useState<any | null>(null);
  const [submittingSettle, setSubmittingSettle] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Participant Tap Action Sheet State
  const [selectedParticipantForAction, setSelectedParticipantForAction] = useState<any | null>(null);
  const [showParticipantActionSheet, setShowParticipantActionSheet] = useState(false);

  const handleParticipantClick = (pt: any) => {
    if (!payerIsMe) return;
    setSelectedParticipantForAction(pt);
    setShowParticipantActionSheet(true);
  };

  // Edit Expense form state
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editParticipantIds, setEditParticipantIds] = useState<string[]>([]);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editTitleError, setEditTitleError] = useState(false);
  const [editAmountError, setEditAmountError] = useState(false);

  // Load single expense details directly from database by exact expenseId
  const loadExpenseDetail = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Resolve active user's Postgres UUID
      let userUuid = activeUserId || activeUserUuid || "";
      const isUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (userUuid && !isUuidRegex.test(userUuid)) {
        const { data: uMatch } = await supabase
          .from("users")
          .select("id")
          .or(`public_id.eq.${userUuid},user_id.eq.${userUuid},username.eq.${userUuid}`)
          .maybeSingle();

        if (uMatch?.id) userUuid = uMatch.id;
      }

      setUserPostgresUuid(userUuid);

      // 2. Query target expense by exact wallet_expenses.id
      const { data: exp, error: expErr } = await supabase
        .from("wallet_expenses")
        .select("*")
        .eq("id", expenseId)
        .maybeSingle();

      if (expErr) throw expErr;
      if (!exp) {
        setError("Expense not found.");
        setLoading(false);
        return;
      }

      setExpenseData(exp);

      // 3. Query Plan Details
      if (exp.plan_id) {
        const { data: plan } = await supabase
          .from("plans")
          .select("id, title, cover_image")
          .eq("id", exp.plan_id)
          .maybeSingle();
        if (plan) setPlanData(plan);
      }

      // 4. Query Participants STRICTLY for this expenseId from wallet_expense_participants
      const { data: pts, error: ptErr } = await supabase
        .from("wallet_expense_participants")
        .select("*")
        .eq("expense_id", expenseId);

      if (ptErr) throw ptErr;

      const ptList: any[] = pts ? [...pts] : [];

      // 4b. Query plan_participants for financial inclusion status & payment_kept status
      const includedSet = new Set<string>();
      const pkSet = new Set<string>();
      let planParticipantList: any[] = [];
      if (exp.plan_id) {
        const { data: rawPlanPts } = await supabase
          .from("plan_participants")
          .select("user_id, rsvp_status, skip_reason")
          .eq("plan_id", exp.plan_id);

        planParticipantList = rawPlanPts || [];
        setRawPlanParticipants(planParticipantList);

        planParticipantList.forEach((p: any) => {
          const finState = getParticipantFinancialState(p.rsvp_status || p.status, p.skip_reason || p.skipReason);
          if (finState === "ACTIVE") {
            includedSet.add(p.user_id);
          } else if (finState === "PAYMENT_KEPT") {
            includedSet.add(p.user_id);
            pkSet.add(p.user_id);
          }
        });

        // Always include users with existing split entries in ptList so historical obligations remain visible after leaving
        ptList.forEach((pt: any) => {
          if (pt.user_id) includedSet.add(pt.user_id);
        });
      }
      setPaymentKeptUserIds(pkSet);
      setFinanciallyIncludedUserIds(includedSet);
      setHasLoadedPlanParticipants(true);

      setParticipantsData(ptList);

      // 5. Query user profiles for all involved/eligible users (payer + participants + plan participants + current user)
      const allEligibleUserIds = planParticipantList.map((p: any) => p.user_id).filter(Boolean);
      const userIds = Array.from(
        new Set([exp.payer_id, ...ptList.map((p: any) => p.user_id), ...allEligibleUserIds, userUuid].filter(Boolean))
      );

      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("users")
          .select("id, full_name, profile_photo_path, username, public_id")
          .in("id", userIds);

        setUserProfiles(profs || []);
      }
    } catch (err: any) {
      console.error("[PlanBalancesDetail] Error loading expense details:", err);
      setError(err.message || "Failed to load expense details.");
    } finally {
      setLoading(false);
    }
  }, [expenseId, activeUserId, activeUserUuid]);

  useEffect(() => {
    loadExpenseDetail();
  }, [loadExpenseDetail]);

  // Profile Map for fast lookup
  const profMap = useMemo(() => {
    const map = new Map<string, any>();
    userProfiles.forEach((p) => map.set(p.id, p));
    return map;
  }, [userProfiles]);

  const isMe = (uid: string) => {
    if (!uid || !userPostgresUuid) return false;
    return String(uid).trim().toLowerCase() === String(userPostgresUuid).trim().toLowerCase();
  };

  // Compute expense financial breakdown & PAYER FIRST ORDERED PARTICIPANTS LIST
  const {
    expenseTitle,
    payerIsMe,
    payerUser,
    payerName,
    payerPhoto,
    userNetShare,
    formattedParticipants,
    activeParticipants,
    paymentKeptParticipants,
    isSettled,
  } = useMemo(() => {
    if (!expenseData) {
      return {
        expenseTitle: "Expense",
        payerIsMe: false,
        payerUser: null,
        payerName: "Payer",
        payerPhoto: "",
        userNetShare: 0,
        formattedParticipants: [],
        activeParticipants: [],
        paymentKeptParticipants: [],
        isSettled: false,
      };
    }

    const payerUuid = expenseData.payer_id;
    const payerMe = isMe(payerUuid);
    const pUser = profMap.get(payerUuid);
    const payerDisplayName = payerMe ? "You" : pUser?.full_name || pUser?.username || "Payer";
    const pPhoto = pUser?.profile_photo_path || "";

    const rawTitle = expenseData.title ? String(expenseData.title).trim() : "";
    const isPlanJoining =
      expenseData.expense_type === "PLAN_EXPENSE" ||
      rawTitle === "Plan Fee" ||
      rawTitle === "Plan Expense" ||
      (!rawTitle && !expenseData.message_id);
    const expTitle = isPlanJoining ? "Plan Fee" : (rawTitle || "Shared Expense");

    // 1. Filter out participants who are not financially included or have no valid expense share
    const activePtsData = participantsData.filter((pt) => {
      const isPayer = pt.user_id === payerUuid || (payerMe && isMe(pt.user_id));
      if (isPayer) return true;

      // Must be financially included (ACTIVE or PAYMENT_KEPT)
      if (hasLoadedPlanParticipants && !financiallyIncludedUserIds.has(pt.user_id)) {
        return false;
      }

      // Non-payer participants with 0 amount_owed and not settled are excluded
      const amountOwed = Number(pt.amount_owed || 0);
      const ptStatus = String(pt.status || "PENDING").toUpperCase();
      if (amountOwed <= 0 && ptStatus !== "SETTLED") {
        return false;
      }

      return true;
    });

    // Separate Payer row from other confirmed participant rows
    const payerPtIndex = activePtsData.findIndex((pt) =>
      pt.user_id === payerUuid || (payerMe && isMe(pt.user_id))
    );

    let rawOrderedPts: any[] = [];
    if (payerPtIndex !== -1) {
      const payerPt = activePtsData[payerPtIndex];
      const otherPts = activePtsData.filter((_, idx) => idx !== payerPtIndex);
      rawOrderedPts = [payerPt, ...otherPts];
    } else {
      // Edge case: Payer exists in wallet_expenses but is not in activePtsData
      const dummyPayerPt = {
        user_id: payerUuid,
        amount_owed: 0,
        status: "PAID",
        isPayerOnly: true,
      };
      rawOrderedPts = [dummyPayerPt, ...activePtsData];
    }

    let netShare = 0;
    let allSettled = true;

    // 2. Format ordered participants list with Payer ALWAYS at Index 0
    const list = rawOrderedPts.map((pt, index) => {
      const ptIsMe = isMe(pt.user_id);
      const isPayerRow = index === 0; // First item is ALWAYS the payer!
      const isPtExcluded = hasLoadedPlanParticipants && !financiallyIncludedUserIds.has(pt.user_id);
      const u = profMap.get(pt.user_id);

      const amountOwed = Number(pt.amount_owed || 0);
      const ptStatus = String(pt.status || "PENDING").toUpperCase();
      const isPtSettled = ptStatus === "SETTLED";
      const remaining = isPtSettled ? 0 : amountOwed;

      if (!isPtSettled && !isPayerRow && !pt.isPayerOnly) allSettled = false;

      // Net share calculation:
      if (payerMe && !ptIsMe) {
        netShare += remaining;
      } else if (!payerMe && ptIsMe) {
        netShare -= remaining;
      }

      // Check if participant has left the plan
      // Check if participant has left the plan (rsvp_status === 'SKIPPED')
      const planPartMatch = rawPlanParticipants.find((pp) => pp.user_id === pt.user_id);
      const rsvpSt = String(planPartMatch?.rsvp_status || "").trim().toUpperCase();
      const isLeft = rsvpSt === "SKIPPED";
      const isPk = paymentKeptUserIds.has(pt.user_id);

      // Subtitle / payment direction label
      const formattedAmount = `₹${amountOwed.toLocaleString("en-IN")}`;
      let subtitle = "";
      let sheetSubtitle = "";

      if (isPayerRow) {
        subtitle = ptIsMe ? "Your paid share" : `Paid by ${payerDisplayName}`;
        sheetSubtitle = subtitle;
      } else if (isPk) {
        subtitle = isLeft ? "Payment kept · Left plan" : "Payment kept";
        sheetSubtitle = subtitle;
      } else if (isLeft) {
        subtitle = isPtSettled ? "Left plan · Settled" : "Left plan";
        sheetSubtitle = isPtSettled ? "Left plan · Settled" : `Left plan · ${formattedAmount} owed`;
      } else if (isPtExcluded) {
        subtitle = "Waitlisted";
        sheetSubtitle = subtitle;
      } else if (isPtSettled) {
        subtitle = "Settled up";
        sheetSubtitle = subtitle;
      } else if (payerMe) {
        subtitle = `${u?.full_name || u?.username || "Participant"} owes you`;
        sheetSubtitle = `${u?.full_name || u?.username || "Participant"} owes you ${formattedAmount}`;
      } else if (ptIsMe) {
        subtitle = `You owe ${payerDisplayName}`;
        sheetSubtitle = `You owe ${payerDisplayName} ${formattedAmount}`;
      } else {
        subtitle = `${u?.full_name || u?.username || "Participant"} owes ${payerDisplayName}`;
        sheetSubtitle = `${u?.full_name || u?.username || "Participant"} owes ${payerDisplayName} ${formattedAmount}`;
      }

      return {
        userId: pt.user_id,
        fullName: ptIsMe ? "You" : u?.full_name || u?.username || "Participant",
        profilePhoto: u?.profile_photo_path || "",
        amountOwed,
        status: ptStatus,
        isPtSettled,
        isPtWaitlisted: isPtExcluded,
        isPaymentKept: isPk,
        isMe: ptIsMe,
        isPayer: isPayerRow,
        isPayerOnly: pt.isPayerOnly || false,
        subtitle,
        sheetSubtitle,
      };
    });

    const sortedList = sortExpenseParticipants(list, payerUuid, userPostgresUuid);
    const activeParticipants = sortedList.filter((p) => !p.isPaymentKept);
    const paymentKeptParticipants = sortedList.filter((p) => p.isPaymentKept);

    return {
      expenseTitle: expTitle,
      payerIsMe: payerMe,
      payerUser: pUser,
      payerName: payerDisplayName,
      payerPhoto: pPhoto,
      userNetShare: netShare,
      formattedParticipants: sortedList,
      activeParticipants,
      paymentKeptParticipants,
      isSettled: allSettled || netShare === 0,
    };
  }, [expenseData, participantsData, profMap, userPostgresUuid, financiallyIncludedUserIds, paymentKeptUserIds, hasLoadedPlanParticipants]);

  const isOwed = userNetShare > 0;
  const absNetShare = Math.abs(userNetShare);

  // Compute list of eligible plan participants for Edit Cost picker (strictly JOINED participants + existing expense members)
  const eligibleParticipantsList = useMemo(() => {
    const candidateIds = new Set<string>();

    // 1. Include current expense participants to preserve historical records
    participantsData.forEach((p) => candidateIds.add(p.user_id));

    // 2. Include ONLY plan participants whose current status is JOINED / CONFIRMED / ACCEPTED / HOST
    rawPlanParticipants.forEach((pp) => {
      const st = String(pp.rsvp_status || pp.status || "").trim().toUpperCase();
      if (st === "JOINED" || st === "CONFIRMED" || st === "ACCEPTED" || st === "HOST") {
        candidateIds.add(pp.user_id);
      }
    });

    const list = Array.from(candidateIds).map((uid) => {
      const u = profMap.get(uid);
      return {
        userId: uid,
        name: isMe(uid) ? "You" : u?.full_name || u?.username || "Participant",
        profilePhoto: u?.profile_photo_path || "",
      };
    });

    // Sort: selected participants first, then alphabetical by name
    return list.sort((a, b) => {
      const aSel = editParticipantIds.includes(a.userId);
      const bSel = editParticipantIds.includes(b.userId);
      if (aSel && !bSel) return -1;
      if (!aSel && bSel) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [participantsData, rawPlanParticipants, profMap, userPostgresUuid, editParticipantIds]);

  const toggleParticipantSelection = (userId: string) => {
    setEditParticipantIds((prev) => {
      if (prev.includes(userId)) {
        if (prev.length <= 1) {
          setEditError("At least 1 participant must be selected.");
          return prev;
        }
        setEditError(null);
        return prev.filter((id) => id !== userId);
      } else {
        setEditError(null);
        return [...prev, userId];
      }
    });
  };

  // Local-First, Save-on-Close Edit Cost State Cache
  const initialEditTitleRef = useRef("");
  const initialEditAmountRef = useRef("");
  const initialEditParticipantIdsRef = useRef<string[]>([]);

  const handleOpenEditSheet = () => {
    if (!expenseData) return;
    setEditError(null);
    setEditTitleError(false);
    setEditAmountError(false);
    const initTitle = expenseTitle;
    const initAmount = String(expenseData.total_amount || "");
    const initPts = participantsData.map((p) => p.user_id);

    initialEditTitleRef.current = initTitle;
    initialEditAmountRef.current = initAmount;
    initialEditParticipantIdsRef.current = [...initPts];

    setEditTitle(initTitle);
    setEditAmount(initAmount);
    setEditParticipantIds(initPts);
    setShowEditSheet(true);
  };

  const handleCloseEditSheet = async () => {
    if (!expenseData) {
      setShowEditSheet(false);
      setEditError(null);
      setEditTitleError(false);
      setEditAmountError(false);
      return;
    }

    const currentTitle = editTitle.trim();
    const currentAmountParsed = parseFloat(editAmount) || 0;
    const currentPts = editParticipantIds;

    const initialTitle = initialEditTitleRef.current.trim();
    const initialAmountParsed = parseFloat(initialEditAmountRef.current) || 0;
    const initialPts = initialEditParticipantIdsRef.current;

    let hasValidationError = false;

    // Inline error check: if title is empty, highlight input & keep sheet open
    if (!currentTitle) {
      setEditTitleError(true);
      hasValidationError = true;
    } else {
      setEditTitleError(false);
    }

    // Inline error check: if amount <= 0 or invalid, highlight input & keep sheet open
    if (currentAmountParsed <= 0) {
      setEditAmountError(true);
      hasValidationError = true;
    } else {
      setEditAmountError(false);
    }

    if (hasValidationError) {
      return;
    }

    // Determine if any edits occurred while sheet was open
    const titleChanged = currentTitle !== initialTitle;
    const amountChanged = currentAmountParsed !== initialAmountParsed;
    const ptsChanged =
      currentPts.length !== initialPts.length ||
      !currentPts.every((id) => initialPts.includes(id));

    const hasChanges = titleChanged || amountChanged || ptsChanged;

    if (!hasChanges) {
      setShowEditSheet(false);
      setEditError(null);
      setEditTitleError(false);
      setEditAmountError(false);
      return;
    }

    if (currentPts.length === 0) {
      setEditError("At least 1 participant must be selected.");
      return;
    }

    setSubmittingEdit(true);
    setEditError(null);

    try {
      // Single atomic database update upon closing sheet
      await updateWalletExpense({
        expenseId: expenseData.id,
        title: currentTitle,
        totalAmount: currentAmountParsed,
        planId: expenseData.plan_id,
        participantIds: currentPts,
      });

      // Refresh application state & balances
      await loadExpenseDetail();
      await onRefreshBalances();
      if (refreshPlans) {
        await refreshPlans(["plans", "wallet_expenses"]);
      }

      setShowEditSheet(false);
    } catch (err: any) {
      console.error("[ExpenseDetail] Exception persisting edits on close:", err);
      setEditError(err.message || "Failed to save changes.");
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Delete Expense Handlers
  const handleConfirmDelete = async () => {
    if (!expenseData || submittingDelete) return;

    setSubmittingDelete(true);
    setDeleteError(null);

    try {
      await deleteWalletExpense(expenseData.id);
      setShowDeleteModal(false);
      await onRefreshBalances();
      onBack();
    } catch (err: any) {
      console.error("[PlanBalancesDetail] Exception deleting expense:", err);
      setDeleteError(err.message || "Failed to delete expense.");
    } finally {
      setSubmittingDelete(false);
    }
  };

  // Settle Participant Handler
  const handleOpenSettleModal = (pt: any) => {
    setSelectedSettleParticipant(pt);
    setSettleError(null);
    setShowSettleModal(true);
  };

  const handleConfirmSettle = async () => {
    if (!expenseData || !selectedSettleParticipant || submittingSettle) return;

    setSubmittingSettle(true);
    setSettleError(null);

    try {
      const success = await settleWalletExpenseParticipant({
        expenseId: expenseData.id,
        participantUserId: selectedSettleParticipant.userId,
      });

      if (!success) {
        setSettleError("Failed to record settlement.");
        setSubmittingSettle(false);
        return;
      }

      setShowSettleModal(false);
      setSelectedSettleParticipant(null);
      await loadExpenseDetail();
      await onRefreshBalances();
    } catch (err: any) {
      console.error("[PlanBalancesDetail] Exception settling expense:", err);
      setSettleError(err.message || "Failed to settle expense.");
    } finally {
      setSubmittingSettle(false);
    }
  };

  // Remove Participant Handlers
  const [showRemoveParticipantModal, setShowRemoveParticipantModal] = useState(false);
  const [selectedParticipantForRemove, setSelectedParticipantForRemove] = useState<any | null>(null);
  const [selectedRemoveStrategy, setSelectedRemoveStrategy] = useState<"SPLIT_SHARE" | "KEEP_SAME_SHARE">("SPLIT_SHARE");
  const [removeParticipantError, setRemoveParticipantError] = useState<string | null>(null);
  const [submittingRemoveParticipant, setSubmittingRemoveParticipant] = useState(false);
  const [errorModalConfig, setErrorModalConfig] = useState<{ title: string; message: string } | null>(null);

  const handleOpenRemoveParticipantModal = (pt: any) => {
    if (pt.isPtSettled) {
      setErrorModalConfig({
        title: "Cannot remove settled split",
        message: `${pt.fullName} has already settled this expense. Settled expense history cannot be removed.`,
      });
      return;
    }

    const remainingCount = activeParticipants.filter((p) => !p.isPtWaitlisted).length;
    if (remainingCount <= 1) {
      setErrorModalConfig({
        title: "Cannot remove participant",
        message: "An expense must have at least one participant.",
      });
      return;
    }

    setSelectedParticipantForRemove(pt);
    setSelectedRemoveStrategy("SPLIT_SHARE");
    setRemoveParticipantError(null);
    setShowRemoveParticipantModal(true);
  };

  const handleConfirmRemoveParticipant = async () => {
    if (!expenseData || !selectedParticipantForRemove || submittingRemoveParticipant) return;

    setSubmittingRemoveParticipant(true);
    setRemoveParticipantError(null);

    try {
      const res = await removeExpenseParticipant({
        expenseId: expenseData.id,
        participantUserId: selectedParticipantForRemove.userId,
        strategy: selectedRemoveStrategy,
      });

      if (!res.success) {
        setRemoveParticipantError(res.message || "Failed to remove participant.");
        setSubmittingRemoveParticipant(false);
        return;
      }

      setShowRemoveParticipantModal(false);
      setSelectedParticipantForRemove(null);
      await loadExpenseDetail();
      await onRefreshBalances();
      if (refreshPlans) {
        await refreshPlans(["plans", "wallet_expenses"]);
      }
    } catch (err: any) {
      console.error("[ExpenseDetail] Exception removing participant:", err);
      setRemoveParticipantError(err?.message || "Failed to remove participant.");
    } finally {
      setSubmittingRemoveParticipant(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#050505] text-white p-6">
        <div className="w-6 h-6 border-2 border-[#FF6B2C] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-zinc-500 font-sans">Loading expense details…</p>
      </div>
    );
  }

  if (error || !expenseData) {
    return (
      <div className="w-full h-full flex flex-col bg-[#050505] text-white p-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-900/60"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-xl font-display font-semibold text-zinc-100">
            Plan balances Detail
          </h2>
        </div>
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-sans">
          {error || "Expense not found"}
        </div>
      </div>
    );
  }

  return (
    <div
      id="subview_plan_balances_detail"
      className="w-full h-full flex flex-col overflow-y-auto scrollbar-none px-6 pt-3 pb-24 text-left bg-[#050505] select-none animate-fade-in"
    >
      {/* HEADER BAR — "Expense Details" WITH TOP-RIGHT EDIT & DELETE ICONS */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer border border-zinc-900/60"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-display font-semibold text-zinc-100 tracking-tight leading-tight">
              Expense Details
            </h2>
            {planData?.title && (
              <span className="text-xs font-sans text-zinc-400 font-medium block truncate leading-tight mt-0.5">
                {planData.title}
              </span>
            )}
          </div>
        </div>

        {/* Top-Right Single Subtle "More" Action Button (Payer Permission Only) */}
        {payerIsMe && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowActionMenu((prev) => !prev)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-900/60 transition cursor-pointer"
              title="More options"
              aria-label="More options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {/* Action Menu Dropdown */}
            {showActionMenu && (
              <>
                {/* Backdrop to close menu on click outside */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowActionMenu(false)}
                />
                <div className="absolute right-0 top-10 z-50 w-44 bg-zinc-950 border border-zinc-800 rounded-2xl p-1.5 shadow-2xl backdrop-blur-md animate-fade-in space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionMenu(false);
                      handleOpenEditSheet();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-zinc-900 text-xs font-medium text-zinc-200 hover:text-white transition cursor-pointer text-left"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Edit Expense</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionMenu(false);
                      setShowDeleteModal(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-rose-500/10 text-xs font-medium text-rose-400 hover:text-rose-300 transition cursor-pointer text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Delete Expense</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* EXPENSE HERO BANNER */}
      <div className="flex flex-col items-center text-center py-6 mt-2 space-y-2 bg-zinc-950/40 border border-white/[0.04] rounded-3xl p-6 mb-6">
        {/* 1. Expense Title */}
        <h3 className="font-display font-bold text-2xl text-zinc-100">
          {expenseTitle}
        </h3>

        {/* 2. Centered Payer Avatar */}
        <div className="pt-2 pb-1">
          <UserAvatar
            src={payerIsMe ? (userProfile?.profile_photo_path || payerPhoto) : payerPhoto}
            alt={payerName}
            size="w-16 h-16"
            className="ring-2 ring-white/10 shadow-lg mx-auto"
          />
        </div>

        {/* 3. Payer Name */}
        <h4 className="font-sans font-semibold text-base text-zinc-100 leading-tight">
          {payerName}
        </h4>

        {/* 4. Total Amount Paid */}
        <p className="text-zinc-400 font-sans text-xs font-medium leading-tight">
          Paid ₹{Number(expenseData.total_amount || 0).toLocaleString("en-IN")}
        </p>
      </div>

      {/* UNIFIED PARTICIPANTS LIST — DIRECTLY BELOW EXPENSE CARD */}
      <div className="divide-y divide-white/[0.04]">
        {formattedParticipants.map((pt) => {
          const isRowMuted = pt.isPtSettled || pt.isPayer || pt.isPtWaitlisted;

          return (
            <div
              key={`${pt.userId}-${pt.isPayer ? 'payer' : 'pt'}`}
              onClick={() => handleParticipantClick(pt)}
              className={`py-3.5 flex items-center justify-between text-left px-1 select-none hover:bg-white/[0.02] active:bg-white/[0.04] transition-all cursor-pointer rounded-xl ${
                isRowMuted ? "opacity-60" : "opacity-100"
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <UserAvatar
                  src={pt.profilePhoto}
                  alt={pt.fullName}
                  size="w-10 h-10"
                  className={`shrink-0 ${isRowMuted ? "grayscale-30" : "ring-1 ring-white/10"}`}
                />

                <div className="min-w-0 flex flex-col justify-center">
                  <h5 className={`font-sans text-[13.5px] truncate leading-tight ${
                    isRowMuted ? "font-medium text-zinc-400" : "font-semibold text-white"
                  }`}>
                    {pt.fullName}
                  </h5>
                  <span className={`text-[11px] font-sans block truncate leading-tight mt-0.5 ${
                    isRowMuted ? "font-normal text-zinc-550" : "font-medium text-zinc-300"
                  }`}>
                    {pt.subtitle}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {(() => {
                  const activePtsCount = formattedParticipants.filter((p) => !p.isPtWaitlisted).length || 1;
                  const fallbackSplit = Math.round(Number(expenseData.total_amount || 0) / activePtsCount);
                  const displayAmt = pt.isPtWaitlisted ? 0 : (pt.amountOwed > 0 ? pt.amountOwed : fallbackSplit);

                  return (
                    <span className={`font-mono text-sm tracking-tight ${
                      isRowMuted ? "font-medium text-zinc-400" : "font-bold text-white"
                    }`}>
                      ₹{displayAmt.toLocaleString("en-IN")}
                    </span>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* EDIT COST SHEET */}
      {showEditSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-xs animate-fade-in"
          onClick={() => handleCloseEditSheet()}
        >
          <div
            className="w-full bg-[#1c1c1e] border-t border-white/[0.08] rounded-t-3xl p-6 pb-8 shadow-2xl space-y-4 max-h-[90vh] flex flex-col text-left font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle Indicator */}
            <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-2 shrink-0" />

            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 shrink-0">
              <h3 className="text-lg font-display font-semibold text-white">Edit Cost</h3>
              <button
                type="button"
                onClick={() => handleCloseEditSheet()}
                className="text-zinc-400 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-1 text-left">
              <div>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => {
                    setEditTitle(e.target.value);
                    if (e.target.value.trim()) {
                      setEditTitleError(false);
                    }
                  }}
                  placeholder="Expense"
                  className={`w-full h-12 rounded-xl px-4 text-sm font-medium text-white placeholder-zinc-500 focus:outline-none transition ${
                    editTitleError
                      ? "bg-rose-500/[0.04] border border-rose-500/80 focus:border-rose-500"
                      : "bg-zinc-900/90 border border-white/[0.08] focus:border-[#FF6B2C]"
                  }`}
                />
                {editTitleError && (
                  <p className="text-xs text-rose-400 font-sans mt-1.5 pl-1">
                    Please enter an expense name
                  </p>
                )}
              </div>

              <div>
                <div className="relative flex items-center">
                  <span className={`absolute left-4 text-sm font-medium select-none pointer-events-none ${
                    editAmountError ? "text-rose-400" : "text-zinc-400"
                  }`}>
                    ₹
                  </span>
                  <input
                    type="number"
                    value={editAmount}
                    onChange={(e) => {
                      setEditAmount(e.target.value);
                      if ((parseFloat(e.target.value) || 0) > 0) {
                        setEditAmountError(false);
                      }
                    }}
                    placeholder="0"
                    className={`w-full h-12 rounded-xl pl-8 pr-4 text-sm font-medium text-white placeholder-zinc-500 focus:outline-none transition ${
                      editAmountError
                        ? "bg-rose-500/[0.04] border border-rose-500/80 focus:border-rose-500"
                        : "bg-zinc-900/90 border border-white/[0.08] focus:border-[#FF6B2C]"
                    }`}
                    min="1"
                    step="any"
                  />
                </div>
                {editAmountError && (
                  <p className="text-xs text-rose-400 font-sans mt-1.5 pl-1">
                    Enter an amount
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Participants
                  </label>
                  <span className="text-xs font-medium text-zinc-500 font-sans">
                    {editParticipantIds.length} selected
                  </span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 border border-white/[0.08] rounded-2xl p-2 bg-zinc-900/50">
                  {eligibleParticipantsList.map((pt) => {
                    const isSelected = editParticipantIds.includes(pt.userId);
                    return (
                      <div
                        key={pt.userId}
                        onClick={() => toggleParticipantSelection(pt.userId)}
                        className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition ${
                          isSelected
                            ? "bg-zinc-800/80 border border-white/[0.1]"
                            : "bg-transparent hover:bg-zinc-900/60 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            src={pt.profilePhoto}
                            alt={pt.name}
                            size="w-9 h-9"
                            className="shrink-0 ring-1 ring-white/10"
                          />
                          <div className="min-w-0 flex flex-col justify-center">
                            <span className="text-sm font-medium text-white truncate block">
                              {pt.name}
                            </span>
                          </div>
                        </div>

                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center border transition ${
                            isSelected
                              ? "bg-[#FF6B2C] border-[#FF6B2C] text-white"
                              : "border-zinc-700 text-transparent"
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => {
            if (!submittingDelete) {
              setShowDeleteModal(false);
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
              Are you sure you want to delete <strong className="text-white font-semibold">{expenseTitle}</strong>?
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

      {/* SETTLE PARTICIPANT MODAL */}
      {showSettleModal && selectedSettleParticipant && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => {
            if (!submittingSettle) {
              setShowSettleModal(false);
              setSelectedSettleParticipant(null);
              setSettleError(null);
            }
          }}
        >
          <div
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-emerald-400">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-display font-bold text-white">Record Settlement</h3>
                <p className="text-xs text-zinc-400 font-sans mt-0.5">{selectedSettleParticipant.fullName}</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 font-sans leading-relaxed">
              Mark ₹{selectedSettleParticipant.amountOwed.toLocaleString("en-IN")} from <strong className="text-white font-semibold">{selectedSettleParticipant.fullName}</strong> as settled?
            </p>

            {settleError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-sans">
                {settleError}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={submittingSettle}
                onClick={() => {
                  setShowSettleModal(false);
                  setSelectedSettleParticipant(null);
                  setSettleError(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.06] text-xs font-sans font-semibold text-zinc-300 hover:text-white transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingSettle}
                onClick={handleConfirmSettle}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-sans font-semibold text-white transition cursor-pointer disabled:opacity-50"
              >
                {submittingSettle ? "Settling..." : "Confirm Settlement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PARTICIPANT ACTIONS BOTTOM SHEET */}
      {showParticipantActionSheet && selectedParticipantForAction && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-xs animate-fade-in"
          onClick={() => {
            setShowParticipantActionSheet(false);
            setSelectedParticipantForAction(null);
          }}
        >
          <div
            className="w-full bg-[#1c1c1e] border-t border-white/[0.08] rounded-t-3xl p-6 pb-8 shadow-2xl space-y-4 text-left font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle Indicator */}
            <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-2" />

            {/* Header: Avatar, Name & Subtitle */}
            <div className="flex items-center gap-3.5 pb-4 border-b border-white/[0.06]">
              <UserAvatar
                src={selectedParticipantForAction.profilePhoto}
                alt={selectedParticipantForAction.fullName}
                size="w-11 h-11"
                className="shrink-0 ring-1 ring-white/10"
              />
              <div className="min-w-0 flex flex-col justify-center">
                <h3 className="text-base font-display font-semibold text-white truncate leading-tight">
                  {selectedParticipantForAction.fullName}
                </h3>
                <p className="text-xs text-zinc-400 font-sans mt-0.5 truncate leading-tight">
                  {selectedParticipantForAction.sheetSubtitle || selectedParticipantForAction.subtitle}
                </p>
              </div>
            </div>

            {/* Actions List */}
            <div className="space-y-2.5 pt-1">
              {/* 1. Edit split — Yellow/Orange */}
              <button
                type="button"
                onClick={() => {
                  setShowParticipantActionSheet(false);
                  handleOpenEditSheet();
                }}
                className="w-full h-13 flex items-center px-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 text-sm font-semibold transition cursor-pointer text-left"
              >
                <span>Edit split</span>
              </button>

              {/* 2. Settle — Green */}
              <button
                type="button"
                onClick={() => {
                  const pt = selectedParticipantForAction;
                  setShowParticipantActionSheet(false);
                  handleOpenSettleModal(pt);
                }}
                disabled={selectedParticipantForAction.isPtSettled}
                className={`w-full h-13 flex items-center px-4 rounded-2xl text-sm font-semibold transition cursor-pointer text-left ${
                  selectedParticipantForAction.isPtSettled
                    ? "bg-zinc-900/40 border border-white/[0.04] text-zinc-600 cursor-not-allowed"
                    : "bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400"
                }`}
              >
                <span>
                  {selectedParticipantForAction.isPtSettled ? "Settled" : "Settle"}
                </span>
              </button>

              {/* 3. Remove from expense — Red */}
              <button
                type="button"
                onClick={() => {
                  const pt = selectedParticipantForAction;
                  setShowParticipantActionSheet(false);
                  handleOpenRemoveParticipantModal(pt);
                }}
                className="w-full h-13 flex items-center px-4 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 text-sm font-semibold transition cursor-pointer text-left"
              >
                <span>Remove from expense</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REMOVE PARTICIPANT CONFIRMATION BOTTOM SHEET WITH STRATEGY OPTIONS */}
      {showRemoveParticipantModal && selectedParticipantForRemove && (() => {
        const activePts = activeParticipants.filter((p) => !p.isPtWaitlisted);
        const currentTotal = Number(expenseData.total_amount || 0);
        const remainingCount = Math.max(1, activePts.length - 1);

        const targetPtShare = selectedParticipantForRemove.amountOwed > 0
          ? selectedParticipantForRemove.amountOwed
          : Math.round(currentTotal / (activePts.length || 1));

        // Option A: Split their share
        const optionATotal = currentTotal;
        const optionAShare = Math.round((currentTotal / remainingCount) * 100) / 100;

        // Option B: Keep the same share
        const otherPts = activePts.filter((p) => p.userId !== selectedParticipantForRemove.userId);
        const remainingExistingShareSum = otherPts.reduce((acc, p) => acc + (p.amountOwed || 0), 0);
        const optionBShare = targetPtShare;
        const optionBTotal = remainingExistingShareSum > 0
          ? remainingExistingShareSum
          : Math.max(0, currentTotal - targetPtShare);

        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-xs animate-fade-in p-0 sm:p-4"
            onClick={() => {
              if (!submittingRemoveParticipant) {
                setShowRemoveParticipantModal(false);
                setSelectedParticipantForRemove(null);
              }
            }}
          >
            <div
              className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl space-y-4 text-left font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sheet Handle Indicator */}
              <div className="w-10 h-1 bg-zinc-800 rounded-full mx-auto mb-1 sm:hidden" />

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white tracking-tight font-display">
                  Remove {selectedParticipantForRemove.fullName}?
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  What should happen to {selectedParticipantForRemove.fullName}’s ₹{targetPtShare.toLocaleString("en-IN")} share?
                </p>
              </div>

              {/* Strategy Options */}
              <div className="space-y-3 pt-1">
                {/* Option A: Split their share */}
                <button
                  type="button"
                  onClick={() => setSelectedRemoveStrategy("SPLIT_SHARE")}
                  className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer space-y-1 ${
                    selectedRemoveStrategy === "SPLIT_SHARE"
                      ? "bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/30"
                      : "bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-white">Split their share</span>
                    {selectedRemoveStrategy === "SPLIT_SHARE" && (
                      <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-black">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400">Everyone remaining shares it.</p>
                  <p className="text-xs font-medium text-emerald-400 font-mono pt-1">
                    ₹{optionATotal.toLocaleString("en-IN")} total · ₹{optionAShare.toLocaleString("en-IN")} each
                  </p>
                </button>

                {/* Option B: Keep the same share */}
                <button
                  type="button"
                  onClick={() => setSelectedRemoveStrategy("KEEP_SAME_SHARE")}
                  className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer space-y-1 ${
                    selectedRemoveStrategy === "KEEP_SAME_SHARE"
                      ? "bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/30"
                      : "bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-white">Keep the same share</span>
                    {selectedRemoveStrategy === "KEEP_SAME_SHARE" && (
                      <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-black">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400">Remaining people keep their current share.</p>
                  <p className="text-xs font-medium text-emerald-400 font-mono pt-1">
                    ₹{optionBTotal.toLocaleString("en-IN")} total · ₹{optionBShare.toLocaleString("en-IN")} each
                  </p>
                </button>
              </div>

              {removeParticipantError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-sans">
                  {removeParticipantError}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={submittingRemoveParticipant}
                  onClick={() => {
                    setShowRemoveParticipantModal(false);
                    setSelectedParticipantForRemove(null);
                  }}
                  className="flex-1 h-11 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold text-xs hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingRemoveParticipant}
                  onClick={handleConfirmRemoveParticipant}
                  className="flex-1 h-11 rounded-xl bg-rose-600 text-white font-semibold text-xs hover:bg-rose-500 active:scale-[0.99] disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20"
                >
                  {submittingRemoveParticipant ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* GENERIC ERROR / VALIDATION MODAL */}
      {errorModalConfig && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-xs animate-fade-in p-0 sm:p-4"
          onClick={() => setErrorModalConfig(null)}
        >
          <div
            className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl space-y-4 text-left font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white tracking-tight font-display">
                {errorModalConfig.title}
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {errorModalConfig.message}
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setErrorModalConfig(null)}
                className="w-full h-11 rounded-xl bg-zinc-900 border border-zinc-800 text-white font-semibold text-xs hover:bg-zinc-800 transition cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const PlanBalancesDetail = ExpenseDetails;
