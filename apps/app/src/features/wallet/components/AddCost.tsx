import React, { useState, useMemo, useEffect } from "react";
import { Check } from "lucide-react";
import { isJoinedParticipantStatus } from "../services/walletService";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { supabase } from "../../../../lib/supabaseClient";

export interface AddCostProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshBalances: () => Promise<void> | void;
  activeUserId: string;
  initialPlanId?: string;
  relevantPlans?: Array<{ id: string; title: string }>;
  dbPlanParticipants?: any[];
  dbUsers?: any[];
  dbProfiles?: any[];
  otherUserId?: string;
}

export const AddCost: React.FC<AddCostProps> = ({
  isOpen,
  onClose,
  onRefreshBalances,
  activeUserId,
  initialPlanId,
  relevantPlans = [],
  dbPlanParticipants = [],
  dbUsers = [],
  dbProfiles = [],
  otherUserId,
}) => {
  const [costTitle, setCostTitle] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [submittingCost, setSubmittingCost] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Interactive input states
  const [isCostFocused, setIsCostFocused] = useState(false);
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  const [customParticipantShares, setCustomParticipantShares] = useState<Record<string, string>>({});

  // Initialize selectedPlanId and selectedParticipantIds when sheet opens
  useEffect(() => {
    if (!isOpen) return;

    setCostTitle("");
    setCostAmount("");
    setFormError(null);
    setCustomParticipantShares({});
    setIsCostFocused(false);
    setFocusedParticipantId(null);

    const initialPlan = initialPlanId || relevantPlans[0]?.id || "";
    setSelectedPlanId(initialPlan);

    const planPartRows = (dbPlanParticipants || []).filter(
      (pp) => pp.plan_id === initialPlan && isJoinedParticipantStatus(pp.rsvp_status || pp.status)
    );

    const initialUserIds = planPartRows.length > 0
      ? Array.from(new Set(planPartRows.map((pp) => pp.user_id)))
      : Array.from(new Set([activeUserId, ...(otherUserId ? [otherUserId] : [])]));

    setSelectedParticipantIds(initialUserIds);
  }, [isOpen, initialPlanId, relevantPlans, dbPlanParticipants, activeUserId, otherUserId]);

  // Compute available participants for selectedPlanId
  const availablePlanParticipants = useMemo(() => {
    const targetPlan = selectedPlanId || initialPlanId || relevantPlans[0]?.id;
    if (!targetPlan) return [];

    const planPartRows = (dbPlanParticipants || []).filter(
      (pp) => pp.plan_id === targetPlan && isJoinedParticipantStatus(pp.rsvp_status || pp.status)
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

    (dbPlanParticipants || []).forEach((pp) => {
      if (pp.user && pp.user_id && !userMap.has(pp.user_id)) {
        userMap.set(pp.user_id, pp.user);
      }
    });

    const rawUserIds = planPartRows.map((pp) => pp.user_id);
    const pUserIds = rawUserIds.length > 0
      ? Array.from(new Set(rawUserIds))
      : Array.from(new Set([activeUserId, ...(otherUserId ? [otherUserId] : [])]));

    return pUserIds.map((uid) => {
      const u = userMap.get(uid);
      const isMe = uid === activeUserId;
      const photo = u?.profile_photo_path || u?.profile_photo || u?.avatar || "";
      const name = isMe
        ? "You"
        : u?.full_name || u?.name || u?.username || "Participant";

      return {
        id: uid,
        name,
        avatar: photo,
      };
    });
  }, [selectedPlanId, initialPlanId, relevantPlans, dbPlanParticipants, dbUsers, dbProfiles, activeUserId, otherUserId]);

  const handleSelectPlanChange = (planId: string) => {
    setSelectedPlanId(planId);
    setCustomParticipantShares({});

    const planPartRows = (dbPlanParticipants || []).filter(
      (pp) => pp.plan_id === planId && isJoinedParticipantStatus(pp.rsvp_status || pp.status)
    );
    const newPlanUserIds = planPartRows.length > 0
      ? Array.from(new Set(planPartRows.map((pp) => pp.user_id)))
      : Array.from(new Set([activeUserId, ...(otherUserId ? [otherUserId] : [])]));

    setSelectedParticipantIds(newPlanUserIds);
  };

  const toggleParticipantSelection = (uid: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const parsedAmount = parseFloat(costAmount) || 0;
  const isValidAmount = parsedAmount > 0;
  const isFormValid = selectedPlanId.length > 0 && selectedParticipantIds.length > 0;
  const perPersonShare = (selectedParticipantIds.length > 0 && isValidAmount)
    ? Math.round((parsedAmount / selectedParticipantIds.length) * 100) / 100
    : 0;

  const handleAddCostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || submittingCost) return;

    setSubmittingCost(true);
    setFormError(null);

    try {
      let messageId: string | null = null;
      try {
        const { data: msgData } = await (supabase as any)
          .from("plan_messages")
          .insert({
            plan_id: selectedPlanId,
            user_id: activeUserId,
            content: JSON.stringify({ title: costTitle.trim() || "Shared Expense", amount: parsedAmount }),
            message_type: "cost",
          })
          .select()
          .single();

        if (msgData) {
          messageId = msgData.id;
        }
      } catch (msgErr) {
        console.warn("[AddCost] Plan message insertion skipped:", msgErr);
      }

      const resolveUserUuid = (rawId: string): string => {
        const u = (dbUsers || []).find(
          (usr) => usr.id === rawId || usr.user_id === rawId || usr.public_id === rawId
        );
        return u?.id || rawId;
      };

      const joinedPlanUserIds = new Set(
        (dbPlanParticipants || [])
          .filter((pp) => pp.plan_id === selectedPlanId && isJoinedParticipantStatus(pp.rsvp_status || pp.status))
          .map((pp) => pp.user_id)
      );

      const resolvedPayerUuid = resolveUserUuid(activeUserId);
      const resolvedParticipantUuids = selectedParticipantIds
        .map(resolveUserUuid)
        .filter((uid) => uid === resolvedPayerUuid || joinedPlanUserIds.size === 0 || joinedPlanUserIds.has(uid));
      const finalParticipantUuids = Array.from(new Set([resolvedPayerUuid, ...resolvedParticipantUuids]));

      const { error: rpcError } = await (supabase as any).rpc("insert_cost_expense", {
        p_plan_id: selectedPlanId,
        p_message_id: messageId,
        p_payer_id: resolvedPayerUuid,
        p_title: costTitle.trim() || "Shared Expense",
        p_total_amount: isNaN(parsedAmount) ? 0 : parsedAmount,
        p_participant_ids: finalParticipantUuids,
      });

      if (rpcError) {
        console.error("[AddCost] insert_cost_expense failed:", rpcError);
        setFormError(rpcError.message || "Failed to create expense. Please try again.");
        setSubmittingCost(false);
        return;
      }

      onClose();
      await onRefreshBalances();
    } catch (err: any) {
      console.error("[AddCost] Exception adding cost:", err);
      setFormError(err.message || "An unexpected error occurred.");
    } finally {
      setSubmittingCost(false);
    }
  };

  if (!isOpen) return null;

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

        {formError && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 shrink-0">
            {formError}
          </div>
        )}

        {/* Hero Amount Display & "What's the split?" Input */}
        <div className="flex flex-col items-center text-center py-2 space-y-2 shrink-0">
          <div className="relative inline-flex items-center justify-center min-w-[80px] cursor-text px-3 py-1 rounded-xl hover:bg-white/[0.03] transition-colors">
            <h2 className="text-4xl sm:text-5xl font-sans font-black text-white pointer-events-none tracking-tight">
              {isCostFocused
                ? `₹${costAmount}`
                : parsedAmount > 0
                  ? `₹${parsedAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "₹0"}
            </h2>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={costAmount}
              onChange={(e) => {
                const val = e.target.value;
                setCostAmount(val);
                setCustomParticipantShares({});
              }}
              onFocus={() => setIsCostFocused(true)}
              onBlur={() => setIsCostFocused(false)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-text"
              placeholder="0"
            />
          </div>
          <div className="relative inline-flex items-center justify-center max-w-[280px]">
            <input
              type="text"
              value={costTitle}
              onChange={(e) => setCostTitle(e.target.value)}
              placeholder="What's the split?"
              style={{ width: `${Math.max((costTitle || "What's the split?").length + 2, 14)}ch` }}
              className="h-8 bg-zinc-800/80 border border-white/10 rounded-full px-4 text-center text-xs font-medium text-white placeholder-zinc-400 focus:outline-none focus:border-white/20 transition-all font-sans max-w-full"
            />
          </div>
        </div>

        <form onSubmit={handleAddCostSubmit} className="space-y-4 pt-1 overflow-y-auto scrollbar-none flex-1">
          {/* Plan Selection */}
          {relevantPlans && relevantPlans.length > 0 ? (
            <div>
              <label className="block text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                PLAN
              </label>
              <select
                value={selectedPlanId}
                onChange={(e) => handleSelectPlanChange(e.target.value)}
                className="w-full h-12 bg-zinc-900/90 border border-white/10 rounded-2xl px-4 text-sm font-sans font-medium text-white focus:outline-none focus:border-white/20 cursor-pointer"
              >
                {relevantPlans.map((p) => (
                  <option key={p.id} value={p.id} className="bg-zinc-900 text-white">
                    {p.title || "Plan"}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                PLAN
              </label>
              <input
                type="text"
                readOnly
                value="Plan"
                className="w-full h-12 bg-zinc-900/90 border border-white/10 rounded-2xl px-4 text-sm font-sans font-medium text-zinc-300 cursor-not-allowed focus:outline-none"
              />
            </div>
          )}

          {/* Participants Section */}
          <div>
            <div className="flex items-center justify-between mt-2 mb-2 px-0.5">
              <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-400">
                PARTICIPANTS
              </span>
              <span className="text-xs font-sans text-zinc-400 font-normal">
                {selectedParticipantIds.length} selected
              </span>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-none">
              {availablePlanParticipants.map((p) => {
                const isSelected = selectedParticipantIds.includes(p.id);
                const rawCustomShare = customParticipantShares[p.id];
                const shareNum = rawCustomShare !== undefined
                  ? (parseFloat(rawCustomShare) || 0)
                  : (isSelected ? perPersonShare : 0);

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
                          ? `₹${rawCustomShare !== undefined ? rawCustomShare : (isSelected ? (perPersonShare > 0 ? perPersonShare.toString() : "0") : "0")}`
                          : `₹${shareNum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={rawCustomShare !== undefined ? rawCustomShare : (isSelected ? (perPersonShare > 0 ? perPersonShare.toString() : "") : "")}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomParticipantShares((prev) => {
                            const updated = { ...prev, [p.id]: val };
                            let sum = 0;
                            selectedParticipantIds.forEach((id) => {
                              const sVal = updated[id] !== undefined
                                ? updated[id]
                                : (isSelected && id === p.id ? val : "");
                              sum += parseFloat(sVal) || 0;
                            });
                            if (sum > 0) {
                              setCostAmount(String(Math.round(sum * 100) / 100));
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
            disabled={!isFormValid || submittingCost}
            className="w-full h-13 rounded-2xl bg-[#FF6B2C] hover:bg-[#e05a1f] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed text-white font-sans font-semibold text-base transition cursor-pointer mt-4 shrink-0 flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B2C]/20"
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
        </form>
      </div>
    </div>
  );
};
