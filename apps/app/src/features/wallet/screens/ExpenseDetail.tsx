import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Edit2, Trash2, HandCoins, CheckCircle2, MoreHorizontal } from "lucide-react";
import { settleWalletExpenseParticipant, deleteWalletExpense, updateWalletExpense } from "../services/walletService";
import { useProfileStore } from "../../profile/state/ProfileContext";
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expenseData, setExpenseData] = useState<any | null>(null);
  const [planData, setPlanData] = useState<any | null>(null);
  const [participantsData, setParticipantsData] = useState<any[]>([]);
  const [userProfiles, setUserProfiles] = useState<any[]>([]);
  const [userPostgresUuid, setUserPostgresUuid] = useState<string>("");

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

  // Participant Long-Press Action Sheet State
  const [selectedParticipantForAction, setSelectedParticipantForAction] = useState<any | null>(null);
  const [showParticipantActionSheet, setShowParticipantActionSheet] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  const handleParticipantTouchStart = (pt: any) => {
    if (!payerIsMe) return;
    isLongPressRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setSelectedParticipantForAction(pt);
      setShowParticipantActionSheet(true);
    }, 500);
  };

  const handleParticipantTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Edit Expense form state
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editParticipantIds, setEditParticipantIds] = useState<string[]>([]);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
      setParticipantsData(ptList);

      // 5. Query user profiles for all involved users (payer + participants + current user)
      const userIds = Array.from(
        new Set([exp.payer_id, ...ptList.map((p: any) => p.user_id), userUuid].filter(Boolean))
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
      rawTitle === "Plan Fee" ||
      rawTitle === "Plan Expense" ||
      (!rawTitle && !expenseData.message_id);
    const expTitle = isPlanJoining ? "Plan Fee" : (rawTitle || "Shared Expense");

    // 1. Separate Payer row from other participant rows in participantsData
    const payerPtIndex = participantsData.findIndex((pt) =>
      pt.user_id === payerUuid || (payerMe && isMe(pt.user_id))
    );

    let rawOrderedPts: any[] = [];
    if (payerPtIndex !== -1) {
      const payerPt = participantsData[payerPtIndex];
      const otherPts = participantsData.filter((_, idx) => idx !== payerPtIndex);
      rawOrderedPts = [payerPt, ...otherPts];
    } else {
      // Edge case: Payer exists in wallet_expenses but is not in wallet_expense_participants
      const dummyPayerPt = {
        user_id: payerUuid,
        amount_owed: 0,
        status: "PAID",
        isPayerOnly: true,
      };
      rawOrderedPts = [dummyPayerPt, ...participantsData];
    }

    let netShare = 0;
    let allSettled = true;

    // 2. Format ordered participants list with Payer ALWAYS at Index 0
    const list = rawOrderedPts.map((pt, index) => {
      const ptIsMe = isMe(pt.user_id);
      const isPayerRow = index === 0; // First item is ALWAYS the payer!
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

      // Subtitle / payment direction label
      let subtitle = "";
      if (isPayerRow) {
        subtitle = ptIsMe ? "Your paid share" : `Paid by ${payerDisplayName}`;
      } else if (isPtSettled) {
        subtitle = ptIsMe ? "You paid" : `${u?.full_name || u?.username || "Participant"} paid`;
      } else if (payerMe) {
        subtitle = `${u?.full_name || u?.username || "Participant"} owes you`;
      } else if (ptIsMe) {
        subtitle = `You owe ${payerDisplayName}`;
      } else {
        subtitle = `${u?.full_name || u?.username || "Participant"} owes ${payerDisplayName}`;
      }

      return {
        userId: pt.user_id,
        fullName: ptIsMe ? "You" : u?.full_name || u?.username || "Participant",
        profilePhoto: u?.profile_photo_path || "",
        amountOwed,
        status: ptStatus,
        isPtSettled,
        isMe: ptIsMe,
        isPayer: isPayerRow,
        isPayerOnly: pt.isPayerOnly || false,
        subtitle,
      };
    });

    return {
      expenseTitle: expTitle,
      payerIsMe: payerMe,
      payerUser: pUser,
      payerName: payerDisplayName,
      payerPhoto: pPhoto,
      userNetShare: netShare,
      formattedParticipants: list,
      isSettled: allSettled || netShare === 0,
    };
  }, [expenseData, participantsData, profMap, userPostgresUuid]);

  const isOwed = userNetShare > 0;
  const absNetShare = Math.abs(userNetShare);

  // Edit Cost Handlers
  const handleOpenEditSheet = () => {
    if (!expenseData) return;
    setEditError(null);
    setEditTitle(expenseTitle);
    setEditAmount(String(expenseData.total_amount || ""));
    setEditParticipantIds(participantsData.map((p) => p.user_id));
    setShowEditSheet(true);
  };

  const handleEditExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmt = parseFloat(editAmount) || 0;
    if (!editTitle.trim() || parsedAmt <= 0 || editParticipantIds.length === 0 || submittingEdit) return;

    setSubmittingEdit(true);
    setEditError(null);

    try {
      await updateWalletExpense({
        expenseId: expenseData.id,
        title: editTitle.trim(),
        totalAmount: parsedAmt,
        planId: expenseData.plan_id,
        participantIds: editParticipantIds,
      });

      setShowEditSheet(false);
      await loadExpenseDetail();
      await onRefreshBalances();
    } catch (err: any) {
      console.error("[PlanBalancesDetail] Exception editing expense:", err);
      setEditError(err.message || "Failed to update expense.");
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

      {/* PARTICIPANTS BREAKDOWN LIST — PAYER ALWAYS SHOWN FIRST */}
      <div className="space-y-4">
        <h3 className="text-sm font-display font-semibold text-zinc-300 px-1">
          Participants ({formattedParticipants.length})
        </h3>

        <div className="divide-y divide-white/[0.04]">
          {formattedParticipants.map((pt) => {
            const isPtSettled = pt.isPtSettled;

            return (
              <div
                key={`${pt.userId}-${pt.isPayer ? 'payer' : 'pt'}`}
                onTouchStart={() => handleParticipantTouchStart(pt)}
                onTouchEnd={handleParticipantTouchEnd}
                onMouseDown={() => handleParticipantTouchStart(pt)}
                onMouseUp={handleParticipantTouchEnd}
                onMouseLeave={handleParticipantTouchEnd}
                className="py-3.5 flex items-center justify-between text-left px-1 select-none hover:bg-white/[0.02] active:bg-white/[0.04] transition-all cursor-pointer rounded-xl"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <UserAvatar
                    src={pt.profilePhoto}
                    alt={pt.fullName}
                    size="w-10 h-10"
                    className={`shrink-0 ${isPtSettled ? "grayscale-30" : ""}`}
                  />

                  <div className="min-w-0 flex flex-col justify-center">
                    <h5 className="font-sans font-semibold text-[13.5px] text-zinc-100 truncate leading-tight">
                      {pt.fullName}
                    </h5>
                    <span className="text-[11px] font-sans font-medium text-zinc-500 block truncate leading-tight mt-0.5">
                      {pt.subtitle}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {pt.amountOwed > 0 ? (
                    <span className="font-mono text-sm font-bold tracking-tight text-zinc-200">
                      ₹{pt.amountOwed.toLocaleString("en-IN")}
                    </span>
                  ) : pt.isPayerOnly ? (
                    <span className="font-sans text-[11px] font-medium tracking-tight text-zinc-400 bg-zinc-900/60 px-2 py-0.5 rounded border border-white/[0.04]">
                      Payer
                    </span>
                  ) : null}

                  {isPtSettled && (
                    <span className="font-sans text-[11px] font-medium tracking-tight text-zinc-500 bg-zinc-900/60 px-2 py-0.5 rounded border border-white/[0.04]">
                      Settled
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* EDIT COST SHEET */}
      {showEditSheet && (
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
                  setEditError(null);
                }}
                className="text-zinc-500 hover:text-white text-xs font-semibold"
              >
                Close
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-sans">
                {editError}
              </div>
            )}

            <form onSubmit={handleEditExpenseSubmit} className="space-y-4 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Expense Title"
                  className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Total Amount (₹)
                </label>
                <input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                  min="1"
                  step="any"
                />
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="w-full h-12 rounded-xl bg-[#FF6B2C] text-white font-semibold text-sm hover:bg-[#e05a1f] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B2C]/20"
                >
                  {submittingEdit ? "Saving Changes..." : "Save Changes"}
                </button>
              </div>
            </form>
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
            className="w-full max-w-md bg-zinc-950 border-t border-zinc-800 rounded-t-3xl p-6 shadow-2xl space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle Indicator */}
            <div className="w-10 h-1 bg-zinc-800 rounded-full mx-auto mb-1" />

            {/* Header: Selected Participant Name */}
            <div className="border-b border-zinc-900 pb-3">
              <h3 className="text-base font-display font-bold text-white">
                {selectedParticipantForAction.fullName}
              </h3>
              <p className="text-xs text-zinc-400 font-sans mt-0.5">
                {selectedParticipantForAction.subtitle}
              </p>
            </div>

            {/* Actions List */}
            <div className="space-y-1.5 pt-1">
              {/* 1. Edit */}
              <button
                type="button"
                onClick={() => {
                  setShowParticipantActionSheet(false);
                  handleOpenEditSheet();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-zinc-900/60 hover:bg-zinc-900 text-xs font-semibold text-zinc-100 transition cursor-pointer text-left"
              >
                <Edit2 className="w-4 h-4 text-zinc-400" />
                <span>Edit</span>
              </button>

              {/* 2. Settle */}
              <button
                type="button"
                onClick={() => {
                  const pt = selectedParticipantForAction;
                  setShowParticipantActionSheet(false);
                  handleOpenSettleModal(pt);
                }}
                disabled={selectedParticipantForAction.isPtSettled}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-semibold transition cursor-pointer text-left ${
                  selectedParticipantForAction.isPtSettled
                    ? "bg-zinc-900/20 text-zinc-600 cursor-not-allowed"
                    : "bg-zinc-900/60 hover:bg-zinc-900 text-emerald-400"
                }`}
              >
                <HandCoins className="w-4 h-4" />
                <span>
                  {selectedParticipantForAction.isPtSettled ? "Settled" : "Settle"}
                </span>
              </button>

              {/* 3. Delete (Destructive) */}
              <button
                type="button"
                onClick={() => {
                  setShowParticipantActionSheet(false);
                  setShowDeleteModal(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-xs font-semibold text-rose-400 transition cursor-pointer text-left"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const PlanBalancesDetail = ExpenseDetails;
