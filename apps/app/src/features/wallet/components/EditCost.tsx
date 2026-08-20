import React, { useState, useMemo, useEffect, useRef } from "react";
import { Check, Loader2, X } from "lucide-react";
import { updateWalletExpense, isJoinedParticipantStatus } from "../services/walletService";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";

export interface EditCostProps {
  isOpen: boolean;
  selectedExpense: any;
  onClose: () => void;
  onRefreshBalances: () => Promise<void> | void;
  onOptimisticUpdate?: (updated: {
    expenseId: string;
    title: string;
    totalAmount: number;
    planId: string;
    participantIds: string[];
  }) => void;
  activeUserId: string;
  relevantPlans?: Array<{ id: string; title: string }>;
  dbPlanParticipants?: any[];
  dbUsers?: any[];
  dbProfiles?: any[];
}

export const EditCost: React.FC<EditCostProps> = ({
  isOpen,
  selectedExpense,
  onClose,
  onRefreshBalances,
  onOptimisticUpdate,
  activeUserId,
  relevantPlans = [],
  dbPlanParticipants = [],
  dbUsers = [],
  dbProfiles = [],
}) => {
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editPlanId, setEditPlanId] = useState("");

  // Checked participants for this specific expense split (editable local draft copy)
  const [editParticipantIds, setEditParticipantIds] = useState<string[]>([]);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Interactive input states
  const [isCostFocused, setIsCostFocused] = useState(false);
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  const [customParticipantShares, setCustomParticipantShares] = useState<Record<string, string>>({});
  const editTitleInputRef = useRef<HTMLInputElement>(null);

  // Initialize local editable draft state synchronously when sheet opens (0 DB reads!)
  useEffect(() => {
    if (!isOpen || !selectedExpense) return;

    setEditError(null);
    setCustomParticipantShares({});
    setIsCostFocused(false);
    setFocusedParticipantId(null);

    const title =
      selectedExpense.title ||
      selectedExpense.expenseTitle ||
      (selectedExpense.isPaymentKept ? "Payment Kept" : "Shared Expense");

    setEditTitle(title);
    setEditAmount(String(selectedExpense.totalAmount || ""));
    setEditPlanId(selectedExpense.planId || "");

    // Resolve initial checked participant IDs & exact stored shares from passed expense model
    let initialCheckedUids: string[] = [];
    const initialShares: Record<string, string> = {};

    const rawPts =
      (selectedExpense.participants && selectedExpense.participants.length > 0
        ? selectedExpense.participants
        : selectedExpense.wallet_expense_participants) ||
      selectedExpense.participantsPreview ||
      [];

    if (selectedExpense.participantIds && selectedExpense.participantIds.length > 0) {
      initialCheckedUids = selectedExpense.participantIds;
    } else if (rawPts.length > 0) {
      initialCheckedUids = rawPts.map((p: any) => p.user_id || p.userId || p.id).filter(Boolean);
    } else {
      initialCheckedUids = [activeUserId];
    }

    rawPts.forEach((p: any) => {
      const uid = p.user_id || p.userId || p.id;
      const shareVal = p.amount ?? p.split_amount ?? p.share ?? p.shareAmount;
      if (uid && shareVal !== undefined && shareVal !== null) {
        initialShares[uid] = String(shareVal);
      }
    });

    setEditParticipantIds(Array.from(new Set(initialCheckedUids)));
    setCustomParticipantShares(initialShares);
  }, [isOpen, selectedExpense, activeUserId]);

  // Derive available participant rows synchronously from parent-provided plan members (0 DB reads!)
  const availableEditParticipants = useMemo(() => {
    const targetPlan = editPlanId || selectedExpense?.planId;

    // 1. Filter joined plan participants passed from parent screen
    const joinedPlanRows = (dbPlanParticipants || []).filter(
      (pp) =>
        (!targetPlan || !pp.plan_id || pp.plan_id === targetPlan) &&
        isJoinedParticipantStatus(pp.rsvp_status || pp.status)
    );
    const planUserIds = joinedPlanRows.map((pp) => pp.user_id);

    // 2. Extract preview/expense participant user IDs from parent model
    const previewUserIds = (selectedExpense?.participantsPreview || []).map(
      (p: any) => p.userId || p.id
    );
    const expenseParticipantUids = (selectedExpense?.participants || []).map(
      (p: any) => p.user_id || p.userId || p.id
    );

    // 3. Union of ALL joined plan participants + checked expense split participants + active user
    const allUserIds = Array.from(
      new Set([
        activeUserId,
        ...editParticipantIds,
        ...planUserIds,
        ...previewUserIds,
        ...expenseParticipantUids,
      ].filter(Boolean))
    );

    // Build user profile map from parent-provided profiles
    const userMap = new Map<string, any>();
    (dbUsers || []).forEach((u) => {
      if (u.id) userMap.set(u.id, u);
      if (u.user_id) userMap.set(u.user_id, u);
      if (u.public_id) userMap.set(u.public_id, u);
    });
    (dbProfiles || []).forEach((p) => {
      if (p.id) userMap.set(p.id, p);
    });
    (selectedExpense?.participantsPreview || []).forEach((p: any) => {
      const pid = p.userId || p.id;
      if (pid) {
        userMap.set(pid, {
          full_name: p.name,
          profile_photo_path: p.avatar,
        });
      }
    });

    const payerId =
      selectedExpense?.payer_id ||
      selectedExpense?.payerId ||
      selectedExpense?.payer?.id ||
      selectedExpense?.created_by ||
      activeUserId;

    const list = allUserIds.map((uid) => {
      const isMe = uid === activeUserId;
      const u = userMap.get(uid);

      const photo = u?.profile_photo_path || u?.profile_photo || u?.avatar || "";
      const name = isMe
        ? "You"
        : u?.full_name || u?.name || u?.username || "Participant";

      return {
        id: uid,
        name,
        avatar: photo,
        isPayer: uid === payerId,
      };
    });

    // Payer always appears first at index 0; all other participants sorted alphabetically by name.
    // Selection state does NOT alter participant order.
    return list.sort((a, b) => {
      if (a.isPayer && !b.isPayer) return -1;
      if (!a.isPayer && b.isPayer) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [
    editPlanId,
    editParticipantIds,
    selectedExpense,
    dbPlanParticipants,
    dbUsers,
    dbProfiles,
    activeUserId,
  ]);

  const toggleParticipantSelection = (uid: string) => {
    const isCurrentlySelected = editParticipantIds.includes(uid);

    // Silent Guard: Prevent deselecting when only 2 participants are selected
    if (isCurrentlySelected && editParticipantIds.length <= 2) {
      return;
    }

    setEditError(null);
    setCustomParticipantShares({});
    setEditParticipantIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const sanitizeCostInput = (rawVal: string): string => {
    if (!rawVal) return "";

    // Strips minus signs and non-numeric/non-decimal characters
    let val = rawVal.replace(/[^0-9.]/g, "");

    // Prevent leading zeros: values cannot start with 0 (e.g. 0, 00, 01, 000800)
    if (val.startsWith("0")) {
      val = val.replace(/^0+/, "");
    }

    if (!val) return "";

    // Keep at most one decimal point
    const parts = val.split(".");
    if (parts.length > 2) {
      val = `${parts[0]}.${parts.slice(1).join("")}`;
    }

    const [intPart, decPart] = val.split(".");

    // Max 6 integer digits (max 999999)
    if (intPart.length > 6) {
      return editAmount;
    }

    // Max 2 decimal places
    if (decPart !== undefined && decPart.length > 2) {
      return `${intPart}.${decPart.slice(0, 2)}`;
    }

    return val;
  };

  const measureTextWidth = (text: string, font: string = "12px Inter, system-ui, sans-serif"): number => {
    if (typeof document === "undefined") return 0;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return 0;
    context.font = font;
    return context.measureText(text).width;
  };

  const handleTitleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;

    // 1. Backspacing / deleting is always allowed
    if (val.length < editTitle.length) {
      setEditTitle(val);
      return;
    }

    // 2. Limiter #1: Maximum 30 characters
    if (val.length > 30) {
      return;
    }

    // 3. Limiter #2: Must fit inside the single-line pill's fixed width (~132px available text width)
    const font = "12px Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    const textWidth = measureTextWidth(val, font);
    const MAX_AVAILABLE_TEXT_WIDTH = 132;

    if (textWidth > MAX_AVAILABLE_TEXT_WIDTH) {
      return; // Reject input if it would overflow the single-line pill!
    }

    setEditTitle(val);
  };

  const formatTotalAmountDisplay = (num: number): string => {
    if (!num || isNaN(num) || num <= 0) return "0";
    const rounded = Math.round(num * 100) / 100;
    if (Number.isInteger(rounded)) {
      return rounded.toLocaleString("en-IN");
    }
    const [intStr, decStr] = rounded.toString().split(".");
    const formattedInt = Number(intStr).toLocaleString("en-IN");
    return `${formattedInt}.${decStr}`;
  };

  const parsedAmount = parseFloat(editAmount) || 0;
  const isValidAmount = parsedAmount > 0;
  const isFormValid = isValidAmount && editParticipantIds.length >= 2;
  const perPersonShare =
    editParticipantIds.length > 0 && isValidAmount
      ? Math.round((parsedAmount / editParticipantIds.length) * 100) / 100
      : 0;

  const handleEditExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editParticipantIds.length < 2) {
      return;
    }

    if (!selectedExpense || !isFormValid || submittingEdit) return;

    setSubmittingEdit(true);
    setEditError(null);

    const updatedParams = {
      expenseId: selectedExpense.id,
      title: editTitle.trim() || "Shared Expense",
      totalAmount: parsedAmount,
      planId: editPlanId || selectedExpense.planId,
      participantIds: editParticipantIds,
    };

    try {
      // Optimistically notify parent of changes and close sheet immediately
      onOptimisticUpdate?.(updatedParams);
      onClose();

      await updateWalletExpense(updatedParams);
    } catch (err: any) {
      console.error("[EditCost] Exception updating expense:", err);
      setEditError(err.message || "Failed to update expense.");
    } finally {
      setSubmittingEdit(false);
    }
  };

  if (!isOpen || !selectedExpense) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full bg-[#1c1c1e] border-t border-white/[0.08] rounded-t-[32px] p-6 pb-8 shadow-2xl space-y-4 max-h-[85vh] flex flex-col text-left font-sans animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sheet Drag Handle Indicator */}
        <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-1 shrink-0" />

        {editError && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 shrink-0">
            {editError}
          </div>
        )}

        {/* Hero Amount Display & "What's the split?" Indicator */}
        <div className="flex flex-col items-center text-center py-2 space-y-1.5 shrink-0">
          {/* "Total" Secondary Label */}
          <span className="text-xs sm:text-sm font-sans font-medium text-zinc-400">
            Total
          </span>

          <div className="relative inline-flex items-center justify-center min-w-[80px] cursor-text px-3 py-0.5 rounded-xl hover:bg-white/[0.03] transition-colors">
            <h2
              className={`text-4xl sm:text-5xl font-sans font-bold pointer-events-none tracking-tight ${
                parsedAmount > 0 ? "text-white" : "text-zinc-500"
              }`}
            >
              {isCostFocused
                ? editAmount
                  ? `₹${editAmount}`
                  : "₹0"
                : `₹${formatTotalAmountDisplay(parsedAmount)}`}
            </h2>
            <input
              type="text"
              inputMode="decimal"
              value={editAmount}
              onChange={(e) => {
                const sanitized = sanitizeCostInput(e.target.value);
                setEditAmount(sanitized);
                setCustomParticipantShares({});
              }}
              onFocus={(e) => {
                setIsCostFocused(true);
                e.target.select();
              }}
              onClick={(e) => {
                (e.target as HTMLInputElement).select();
              }}
              onBlur={() => setIsCostFocused(false)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-text"
              placeholder="0"
            />
          </div>

          <div className="relative inline-flex items-center justify-center w-[165px] h-8 mt-1">
            <input
              ref={editTitleInputRef}
              type="text"
              maxLength={30}
              value={editTitle}
              onChange={handleTitleInputChange}
              placeholder="What's the split?"
              className="w-full h-full px-3.5 rounded-full bg-zinc-800/90 border border-white/10 text-zinc-200 text-xs font-medium text-center placeholder-zinc-400 focus:outline-none focus:border-white/20 focus:bg-zinc-800 transition-colors overflow-hidden whitespace-nowrap"
            />
          </div>
        </div>

        <form onSubmit={handleEditExpenseSubmit} className="space-y-4 pt-1 overflow-y-auto scrollbar-none flex-1">
          {/* Participants Section */}
          <div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-none">
              {availableEditParticipants.map((p) => {
                const isSelected = editParticipantIds.includes(p.id);
                const rawCustomShare = customParticipantShares[p.id];
                const shareNum =
                  rawCustomShare !== undefined
                    ? parseFloat(rawCustomShare) || 0
                    : isSelected
                    ? perPersonShare
                    : 0;

                return (
                  <div
                    key={p.id}
                    className={`w-full flex items-center justify-between py-2.5 px-1 rounded-2xl transition text-left select-none ${
                      isSelected ? "hover:bg-white/[0.04]" : "opacity-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleParticipantSelection(p.id)}
                      className="flex items-center min-w-0 flex-1 cursor-pointer"
                    >
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center border transition shrink-0 ${
                          isSelected
                            ? "bg-[#FF6B2C] border-[#FF6B2C] text-white"
                            : "border-zinc-700 bg-transparent text-transparent"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      </div>
                      <UserAvatar
                        src={p.avatar}
                        alt={p.name}
                        size="w-9 h-9"
                        className="shrink-0 ml-3"
                      />
                      <span className="font-sans font-semibold text-sm text-white truncate ml-3">
                        {p.name}
                      </span>
                    </button>

                    {/* Editable Participant Amount */}
                    <div className="relative shrink-0 flex items-center justify-end pl-2 min-w-[70px] cursor-text">
                      <span className="font-sans text-sm font-bold text-white pointer-events-none">
                        {focusedParticipantId === p.id
                          ? `₹${rawCustomShare !== undefined ? rawCustomShare : isSelected ? (perPersonShare > 0 ? perPersonShare.toString() : "0") : "0"}`
                          : `₹${shareNum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={
                          rawCustomShare !== undefined
                            ? rawCustomShare
                            : isSelected
                            ? perPersonShare > 0
                              ? perPersonShare.toString()
                              : ""
                            : ""
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomParticipantShares((prev) => {
                            const updated = { ...prev, [p.id]: val };
                            let sum = 0;
                            editParticipantIds.forEach((id) => {
                              const sVal =
                                updated[id] !== undefined
                                  ? updated[id]
                                  : isSelected && id === p.id
                                  ? val
                                  : "";
                              sum += parseFloat(sVal) || 0;
                            });
                            if (sum > 0) {
                              setEditAmount(String(Math.round(sum * 100) / 100));
                            }
                            return updated;
                          });
                        }}
                        onFocus={() => {
                          setFocusedParticipantId(p.id);
                          if (!isSelected) {
                            toggleParticipantSelection(p.id);
                          }
                        }}
                        onBlur={() => setFocusedParticipantId(null)}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-text"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submit Action */}
          <button
            type="submit"
            disabled={!isFormValid || submittingEdit}
            className="w-full h-13 rounded-2xl bg-[#FF6B2C] hover:bg-[#e05a1f] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed text-white font-sans font-semibold text-base transition cursor-pointer mt-4 shrink-0 flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B2C]/20"
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
        </form>
      </div>
    </div>
  );
};
