import React, { useState, useMemo, useEffect, useRef } from "react";
import { Check, Loader2, X, ArrowLeft } from "lucide-react";
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
  const [editParticipantIds, setEditParticipantIds] = useState<string[]>([]);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [isCostFocused, setIsCostFocused] = useState(false);
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  const [customParticipantShares, setCustomParticipantShares] = useState<Record<string, string>>({});
  const editTitleInputRef = useRef<HTMLInputElement>(null);

  const initialTitleRef = useRef("");
  const initialAmountRef = useRef<number>(0);
  const initialCheckedUidsRef = useRef<string[]>([]);
  const initialCustomSharesRef = useRef<Record<string, string>>({});

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

    const totalAmt = selectedExpense.totalAmount || 0;
    setEditTitle(title);
    setEditAmount(String(totalAmt || ""));
    setEditPlanId(selectedExpense.planId || "");

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

    const uniqueChecked = Array.from(new Set(initialCheckedUids));
    setEditParticipantIds(uniqueChecked);
    setCustomParticipantShares(initialShares);

    initialTitleRef.current = title.trim();
    initialAmountRef.current = Math.round((Number(totalAmt) || 0) * 100) / 100;
    initialCheckedUidsRef.current = [...uniqueChecked].sort();
    initialCustomSharesRef.current = { ...initialShares };
  }, [isOpen, selectedExpense, activeUserId]);

  const availableEditParticipants = useMemo(() => {
    const targetPlan = editPlanId || selectedExpense?.planId;

    const joinedPlanRows = (dbPlanParticipants || []).filter(
      (pp) =>
        (!targetPlan || !pp.plan_id || pp.plan_id === targetPlan) &&
        isJoinedParticipantStatus(pp.rsvp_status || pp.status)
    );
    const planUserIds = joinedPlanRows.map((pp) => pp.user_id);

    const previewUserIds = (selectedExpense?.participantsPreview || []).map(
      (p: any) => p.userId || p.id
    );
    const expenseParticipantUids = (selectedExpense?.participants || []).map(
      (p: any) => p.user_id || p.userId || p.id
    );

    const allUserIds = Array.from(
      new Set([
        activeUserId,
        ...editParticipantIds,
        ...planUserIds,
        ...previewUserIds,
        ...expenseParticipantUids,
      ].filter(Boolean))
    );

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

    const isMe = (uid: string) => uid === activeUserId;

    const list = allUserIds.map((uid) => {
      const isUserMe = isMe(uid);
      const u = userMap.get(uid);
      const name = isUserMe
        ? "You"
        : u?.full_name || u?.name || u?.username || "Participant";
      const avatar = u?.profile_photo_path || u?.profile_photo || u?.avatar || "";

      return { id: uid, name, avatar, isMe: isUserMe };
    });

    return list.sort((a, b) => {
      if (a.isMe && !b.isMe) return -1;
      if (!a.isMe && b.isMe) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [
    editPlanId,
    selectedExpense,
    dbPlanParticipants,
    editParticipantIds,
    activeUserId,
    dbUsers,
    dbProfiles,
  ]);

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

  const parsedAmount = useMemo(() => {
    const p = parseFloat(editAmount);
    return isNaN(p) ? 0 : Math.max(0, p);
  }, [editAmount]);

  const perPersonShare = useMemo(() => {
    const checkedCount = editParticipantIds.length;
    if (checkedCount === 0 || parsedAmount <= 0) return 0;
    return Math.round((parsedAmount / checkedCount) * 100) / 100;
  }, [editParticipantIds.length, parsedAmount]);

  const isFormValid = useMemo(() => {
    return (
      editTitle.trim().length > 0 &&
      parsedAmount > 0 &&
      editParticipantIds.length > 0
    );
  }, [editTitle, parsedAmount, editParticipantIds]);

  const hasChanges = useMemo(() => {
    if (!isOpen || !selectedExpense) return false;

    if (editTitle.trim() !== initialTitleRef.current) {
      return true;
    }

    const currentAmountRounded = Math.round(parsedAmount * 100) / 100;
    if (Math.abs(currentAmountRounded - initialAmountRef.current) > 0.01) {
      return true;
    }

    const currentChecked = Array.from(new Set(editParticipantIds)).sort();
    const initialChecked = initialCheckedUidsRef.current;
    if (currentChecked.length !== initialChecked.length) {
      return true;
    }
    for (let i = 0; i < currentChecked.length; i++) {
      if (currentChecked[i] !== initialChecked[i]) {
        return true;
      }
    }

    for (const uid of editParticipantIds) {
      const currentVal = customParticipantShares[uid];
      const initialVal = initialCustomSharesRef.current[uid];
      if (currentVal !== initialVal) {
        return true;
      }
    }

    return false;
  }, [
    isOpen,
    selectedExpense,
    editTitle,
    parsedAmount,
    editParticipantIds,
    customParticipantShares,
  ]);

  const isButtonActive = isFormValid && hasChanges && !submittingEdit;

  const handleTitleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditTitle(e.target.value);
    setEditError(null);
  };

  const sanitizeCostInput = (val: string): string => {
    const clean = val.replace(/[^0-9.]/g, "");
    const parts = clean.split(".");
    if (parts.length > 2) {
      return `${parts[0]}.${parts.slice(1).join("")}`;
    }
    if (parts[1] && parts[1].length > 2) {
      return `${parts[0]}.${parts[1].slice(0, 2)}`;
    }
    return clean;
  };

  const formatIndianCommasStr = (strVal: string): string => {
    if (!strVal) return "0";
    const parts = strVal.split(".");
    const intPart = parts[0];
    const decPart = parts.length > 1 ? `.${parts[1]}` : "";
    if (!intPart && decPart) return `0${decPart}`;
    if (!intPart) return "0";
    const num = parseInt(intPart, 10);
    if (isNaN(num)) return strVal;
    return `${num.toLocaleString("en-IN")}${decPart}`;
  };

  const handleEditExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isButtonActive || !selectedExpense?.id) return;

    setSubmittingEdit(true);
    setEditError(null);

    const titleToSave = editTitle.trim();
    const targetPlanId = editPlanId || selectedExpense.planId;

    try {
      if (onOptimisticUpdate) {
        onOptimisticUpdate({
          expenseId: selectedExpense.id,
          title: titleToSave,
          totalAmount: parsedAmount,
          planId: targetPlanId,
          participantIds: editParticipantIds,
        });
      }

      const updatedParams = {
        expenseId: selectedExpense.id,
        title: titleToSave,
        totalAmount: parsedAmount,
        planId: targetPlanId,
        participantIds: editParticipantIds,
      };

      onClose();
      if (onRefreshBalances) {
        onRefreshBalances();
      }

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
      className="fixed inset-0 z-50 flex flex-col bg-[#050505] text-left font-sans select-none overflow-hidden animate-fade-in"
      style={{ height: "100dvh" }}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <button
          type="button"
          onClick={onClose}
          disabled={submittingEdit}
          className="p-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-sans font-semibold text-zinc-300">Edit Cost</span>
        <div className="w-8" />
      </div>

      <div className="flex flex-col items-center text-center px-6 pt-4 pb-3 shrink-0 space-y-1.5">
        <span className="text-xs font-sans font-semibold text-zinc-500 uppercase tracking-widest">
          Total
        </span>

        <div className="relative inline-flex items-center justify-center min-w-[80px] cursor-text px-3 py-0.5 rounded-xl hover:bg-white/[0.03] transition-colors">
          <h2
            className={`text-4xl sm:text-5xl font-sans font-extrabold pointer-events-none tracking-tight ${
              parsedAmount > 0 ? "text-white" : "text-zinc-500"
            }`}
          >
            ₹{formatIndianCommasStr(editAmount)}
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
              const el = e.currentTarget;
              setTimeout(() => {
                const len = el.value.length;
                try {
                  el.setSelectionRange(len, len);
                } catch (_) {}
              }, 0);
            }}
            onClick={(e) => {
              const el = e.currentTarget;
              const len = el.value.length;
              try {
                el.setSelectionRange(len, len);
              } catch (_) {}
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
            className="w-full h-full px-3.5 rounded-full bg-zinc-900 border border-white/10 text-zinc-200 text-xs font-medium text-center placeholder-zinc-400 focus:outline-none focus:border-white/20 focus:bg-zinc-800 transition-colors overflow-hidden whitespace-nowrap"
          />
        </div>
      </div>

      {editError && (
        <div className="mx-6 mb-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 shrink-0 text-center">
          {editError}
        </div>
      )}

      <form onSubmit={handleEditExpenseSubmit} className="flex-1 overflow-y-auto scrollbar-none px-6 pt-2 pb-32">
        <div className="space-y-1">
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
                className={`w-full flex items-center justify-between py-3 px-1 rounded-2xl transition text-left select-none ${
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
                    size="w-10 h-10"
                    className="shrink-0 ml-3.5"
                  />
                  <span className="font-sans font-semibold text-sm text-white truncate ml-3">
                    {p.name}
                  </span>
                </button>

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
      </form>

      <div className="fixed bottom-0 left-0 right-0 z-50 px-6 pb-8 pt-4 bg-gradient-to-t from-[#050505] via-[#050505]/90 to-transparent pointer-events-none">
        <button
          type="button"
          disabled={!isButtonActive}
          onClick={handleEditExpenseSubmit}
          className={`w-full h-11 rounded-2xl font-sans font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 pointer-events-auto ${
            isButtonActive
              ? "bg-[#FF6B2C] hover:bg-[#ff7b42] active:bg-[#e05a1f] text-white shadow-lg shadow-[#FF6B2C]/25 active:scale-[0.98]"
              : "bg-zinc-800/80 text-zinc-500 cursor-not-allowed border border-white/5 opacity-50 shadow-none"
          }`}
        >
          {submittingEdit ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Updating Split...</span>
            </>
          ) : (
            <span>Update Split</span>
          )}
        </button>
      </div>
    </div>
  );
};
