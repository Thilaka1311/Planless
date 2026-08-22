import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { isJoinedParticipantStatus } from "../services/walletService";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { supabase } from "../../../../lib/supabaseClient";
import { useWalletStore } from "../state/WalletContext";

const avatarVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 140 : -140,
    opacity: 1,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -140 : 140,
    opacity: 1,
  }),
};

export interface AddCostProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshBalances: () => Promise<void> | void;
  activeUserId: string;
  entryPoint?: "people" | "plan";
  initialPlanId?: string;
  relevantPlans?: Array<{
    id: string;
    title: string;
    cover_image?: string;
    cover_photo_path?: string;
    cover_photo?: string;
    planCover?: string;
    coverImage?: string;
    image?: string;
    cover?: string;
  }>;
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
  entryPoint,
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
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);

  // Interactive input states
  const [isCostFocused, setIsCostFocused] = useState(false);
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  const [customParticipantShares, setCustomParticipantShares] = useState<Record<string, string>>({});

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const mouseStartX = useRef<number | null>(null);

  // Stable list of plans available for looping swipe navigation
  const plansList = useMemo(() => {
    return relevantPlans && relevantPlans.length > 0 ? relevantPlans : [];
  }, [relevantPlans]);

  // Entry point mode determination:
  // "plan" mode: opened from a specific plan. Hides carousel completely, locks selection to initialPlanId.
  // "people" mode: opened from People/Wallet. Renders carousel for selecting plan.
  const isPlanMode = useMemo(() => {
    if (entryPoint === "plan") return true;
    if (entryPoint === "people") return false;
    return Boolean(initialPlanId);
  }, [entryPoint, initialPlanId]);

  const showCarousel = !isPlanMode && plansList.length > 0;

  // Currently selected plan object
  const selectedPlanObj = useMemo(() => {
    if (initialPlanId) {
      const match = plansList.find((p) => p.id === initialPlanId);
      if (match) return match;
      if (isPlanMode) return { id: initialPlanId, title: "Plan" };
    }
    if (!plansList || plansList.length === 0) return null;
    return plansList.find((p) => p.id === selectedPlanId) || plansList[0];
  }, [plansList, selectedPlanId, initialPlanId, isPlanMode]);

  const getPlanCoverImage = (p: any) => {
    if (!p) return null;
    return (
      p.cover_image ||
      p.cover_photo_path ||
      p.cover_photo ||
      p.planCover ||
      p.coverImage ||
      p.image ||
      p.cover ||
      null
    );
  };

  // Image source resolution for selected plan (supports cover_image from Supabase plans table)
  const planImageSrc = useMemo(() => {
    if (!selectedPlanObj) return null;
    return getPlanCoverImage(selectedPlanObj);
  }, [selectedPlanObj]);

  const currentPlanIdx = useMemo(() => {
    if (!plansList || plansList.length === 0) return 0;
    const idx = plansList.findIndex((p) => p.id === selectedPlanId);
    return idx >= 0 ? idx : 0;
  }, [plansList, selectedPlanId]);

  const prevPlan = useMemo(() => {
    if (plansList.length <= 1 || isPlanMode) return null;
    if (plansList.length === 2) {
      return currentPlanIdx > 0 ? plansList[0] : null;
    }
    const prevIdx = (currentPlanIdx - 1 + plansList.length) % plansList.length;
    return plansList[prevIdx];
  }, [plansList, currentPlanIdx, isPlanMode]);

  const nextPlan = useMemo(() => {
    if (plansList.length <= 1 || isPlanMode) return null;
    if (plansList.length === 2) {
      return currentPlanIdx === 0 ? plansList[1] : null;
    }
    const nextIdx = (currentPlanIdx + 1) % plansList.length;
    return plansList[nextIdx];
  }, [plansList, currentPlanIdx, isPlanMode]);

  const walletStore = useWalletStore();
  const dbPlanParticipantsLocal = walletStore?.dbPlanParticipantsLocal || [];
  const dbUsersLocal = walletStore?.dbUsersLocal || [];

  const mergedPlanParticipants = useMemo(() => {
    return [...(dbPlanParticipants || []), ...(dbPlanParticipantsLocal || [])];
  }, [dbPlanParticipants, dbPlanParticipantsLocal]);

  const mergedUsers = useMemo(() => {
    return [...(dbUsers || []), ...(dbProfiles || []), ...(dbUsersLocal || [])];
  }, [dbUsers, dbProfiles, dbUsersLocal]);

  const isMatchingPlanId = (pp: any, tPlanId: string) => {
    if (!tPlanId || !pp) return false;
    const cleanTarget = String(tPlanId).trim().toLowerCase();
    const cleanPP = String(pp.plan_id || pp.planId || "").trim().toLowerCase();
    return cleanPP === cleanTarget;
  };

  // Initialize selectedPlanId and selectedParticipantIds when screen opens
  useEffect(() => {
    if (!isOpen) return;

    setCostTitle("");
    setCostAmount("");
    setFormError(null);
    setCustomParticipantShares({});
    setIsCostFocused(false);
    setFocusedParticipantId(null);

    const targetPlan = initialPlanId || plansList[0]?.id || "";
    setSelectedPlanId(targetPlan);

    const planPartRows = mergedPlanParticipants.filter(
      (pp) => isMatchingPlanId(pp, targetPlan) && isJoinedParticipantStatus(pp.rsvp_status || pp.status)
    );

    const rawUserIds = planPartRows.map((pp) => pp.user_id || pp.userId).filter(Boolean);

    const initialUserIds = rawUserIds.length > 0
      ? Array.from(new Set(rawUserIds))
      : (isPlanMode
          ? []
          : Array.from(new Set([activeUserId, ...(otherUserId ? [otherUserId] : [])])));

    setSelectedParticipantIds(initialUserIds);
  }, [isOpen, initialPlanId, plansList, mergedPlanParticipants, activeUserId, otherUserId, isPlanMode]);

  // Compute available participants for selectedPlanId with strict sorting rule (You first, others A-Z)
  const availablePlanParticipants = useMemo(() => {
    const targetPlan = selectedPlanId || initialPlanId || plansList[0]?.id;
    if (!targetPlan) return [];

    const planPartRows = mergedPlanParticipants.filter(
      (pp) => isMatchingPlanId(pp, targetPlan) && isJoinedParticipantStatus(pp.rsvp_status || pp.status)
    );

    const userMap = new Map<string, any>();
    mergedUsers.forEach((u) => {
      if (u.id) userMap.set(String(u.id).toLowerCase(), u);
      if (u.user_id) userMap.set(String(u.user_id).toLowerCase(), u);
      if (u.public_id) userMap.set(String(u.public_id).toLowerCase(), u);
    });

    mergedPlanParticipants.forEach((pp) => {
      if (pp.user) {
        const uId = pp.user_id || pp.userId || pp.user.id || pp.user.user_id;
        if (uId) userMap.set(String(uId).toLowerCase(), pp.user);
      }
    });

    const rawUserIds = planPartRows.map((pp) => pp.user_id || pp.userId).filter(Boolean);
    const pUserIds = rawUserIds.length > 0
      ? Array.from(new Set(rawUserIds))
      : (isPlanMode
          ? []
          : Array.from(new Set([activeUserId, ...(otherUserId ? [otherUserId] : [])])));

    const list = pUserIds.map((uid) => {
      const u = userMap.get(String(uid).toLowerCase());
      const isMe = String(uid).toLowerCase() === String(activeUserId).toLowerCase();
      const photo = u?.profile_photo_path || u?.profile_photo || u?.avatar || "";
      const name = isMe
        ? "You"
        : u?.full_name || u?.name || u?.username || "Participant";

      return {
        id: uid,
        name,
        avatar: photo,
        isMe,
      };
    });

    return list.sort((a, b) => {
      if (a.isMe && !b.isMe) return -1;
      if (!a.isMe && b.isMe) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [selectedPlanId, initialPlanId, plansList, mergedPlanParticipants, mergedUsers, activeUserId, otherUserId, isPlanMode]);

  // Keep selectedParticipantIds preselected whenever availablePlanParticipants loads or updates
  useEffect(() => {
    if (!isOpen) return;
    if (availablePlanParticipants.length > 0) {
      const availIds = availablePlanParticipants.map((p) => p.id);
      setSelectedParticipantIds((prev) => {
        if (prev.length === 0) return availIds;
        return prev;
      });
    }
  }, [isOpen, availablePlanParticipants]);

  const handleSelectPlanChange = (planId: string) => {
    if (isPlanMode) return; // Disallow changing plan when opened from a specific plan
    setSelectedPlanId(planId);
    setCostAmount("");
    setCustomParticipantShares({});

    const planPartRows = (dbPlanParticipants || []).filter(
      (pp) => isMatchingPlanId(pp, planId) && isJoinedParticipantStatus(pp.rsvp_status || pp.status)
    );
    const rawUserIds = planPartRows.map((pp) => pp.user_id || pp.userId).filter(Boolean);
    const newPlanUserIds = rawUserIds.length > 0
      ? Array.from(new Set(rawUserIds))
      : Array.from(new Set([activeUserId, ...(otherUserId ? [otherUserId] : [])]));

    setSelectedParticipantIds(newPlanUserIds);
  };

  // Infinite / looping bidirectional swipe navigation handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isPlanMode) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isPlanMode) return;
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    if (Math.abs(deltaX) > 25 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (plansList.length > 1) {
        const curIdx = plansList.findIndex((p) => p.id === selectedPlanId);
        const validIdx = curIdx >= 0 ? curIdx : 0;
        if (deltaX < 0) {
          // Swipe LEFT -> next plan (slides in from right)
          setSlideDirection(1);
          const nextIdx = (validIdx + 1) % plansList.length;
          handleSelectPlanChange(plansList[nextIdx].id);
        } else {
          // Swipe RIGHT -> previous plan (slides in from left)
          setSlideDirection(-1);
          const prevIdx = (validIdx - 1 + plansList.length) % plansList.length;
          handleSelectPlanChange(plansList[prevIdx].id);
        }
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isPlanMode) return;
    mouseStartX.current = e.clientX;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isPlanMode) return;
    if (mouseStartX.current === null) return;
    const deltaX = e.clientX - mouseStartX.current;

    if (Math.abs(deltaX) > 25 && plansList.length > 1) {
      const curIdx = plansList.findIndex((p) => p.id === selectedPlanId);
      const validIdx = curIdx >= 0 ? curIdx : 0;
      if (deltaX < 0) {
        // Swipe LEFT -> next plan (slides in from right)
        setSlideDirection(1);
        const nextIdx = (validIdx + 1) % plansList.length;
        handleSelectPlanChange(plansList[nextIdx].id);
      } else {
        // Swipe RIGHT -> previous plan (slides in from left)
        setSlideDirection(-1);
        const prevIdx = (validIdx - 1 + plansList.length) % plansList.length;
        handleSelectPlanChange(plansList[prevIdx].id);
      }
    }

    mouseStartX.current = null;
  };

  const toggleParticipantSelection = (uid: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const parsedAmount = useMemo(() => {
    const p = parseFloat(costAmount);
    return isNaN(p) ? 0 : Math.max(0, p);
  }, [costAmount]);

  const isValidAmount = parsedAmount > 0;
  const isFormValid = selectedPlanId.length > 0 && selectedParticipantIds.length > 0 && isValidAmount;
  const perPersonShare = (selectedParticipantIds.length > 0 && isValidAmount)
    ? Math.round((parsedAmount / selectedParticipantIds.length) * 100) / 100
    : 0;

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
          .filter((pp) => isMatchingPlanId(pp, selectedPlanId) && isJoinedParticipantStatus(pp.rsvp_status || pp.status))
          .map((pp) => pp.user_id || pp.userId)
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
      className="fixed inset-0 z-50 flex flex-col bg-[#050505] text-left font-sans select-none overflow-hidden animate-fade-in"
      style={{ height: "100dvh" }}
    >
      {/* ── 1. Top Navigation: Back Arrow (Left) & Centered Plan Name ─────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <button
          type="button"
          onClick={onClose}
          disabled={submittingCost}
          className="p-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40 shrink-0 z-10"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Centered Plan Name in Header Row */}
        <h3 className="font-sans font-bold text-base text-white tracking-tight leading-tight text-center truncate px-2 max-w-[240px] flex-1">
          {selectedPlanObj?.title || "Plan"}
        </h3>

        <div className="w-8 shrink-0" />
      </div>

      {/* ── 2. Single Plan Avatar Display with Subtle Side Arrow Indicators & Swipe Support ──── */}
      {selectedPlanObj && (
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          className={`relative w-full py-2.5 flex items-center justify-center gap-5 shrink-0 select-none ${
            !isPlanMode && plansList.length > 1 ? "cursor-grab active:cursor-grabbing touch-pan-y" : ""
          }`}
        >
          {/* Previous (Left) Arrow Indicator */}
          {!isPlanMode && plansList.length > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (prevPlan) {
                  setSlideDirection(-1);
                  handleSelectPlanChange(prevPlan.id);
                }
              }}
              disabled={!prevPlan}
              className={`p-2 text-zinc-400 hover:text-white active:scale-90 transition-all cursor-pointer ${
                !prevPlan ? "opacity-20 pointer-events-none cursor-default" : "opacity-80 hover:opacity-100"
              }`}
              aria-label="Previous Plan"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
            </button>
          ) : (
            <div className="w-9" />
          )}

          {/* Centered Single Plan Avatar with Directional Motion Slide */}
          <div className="relative overflow-hidden w-22 h-22 flex items-center justify-center">
            <AnimatePresence mode="popLayout" custom={slideDirection} initial={false}>
              <motion.div
                key={selectedPlanObj.id}
                custom={slideDirection}
                variants={avatarVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: "spring", stiffness: 450, damping: 32, mass: 0.8 },
                }}
                className="w-20 h-20 rounded-full aspect-square overflow-hidden shadow-2xl shadow-black/80 flex items-center justify-center shrink-0"
              >
                <DiscoveryImages
                  src={planImageSrc}
                  alt={selectedPlanObj.title}
                  className="w-full h-full object-cover aspect-square rounded-full opacity-95"
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Next (Right) Arrow Indicator */}
          {!isPlanMode && plansList.length > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (nextPlan) {
                  setSlideDirection(1);
                  handleSelectPlanChange(nextPlan.id);
                }
              }}
              disabled={!nextPlan}
              className={`p-2 text-zinc-400 hover:text-white active:scale-90 transition-all cursor-pointer ${
                !nextPlan ? "opacity-20 pointer-events-none cursor-default" : "opacity-80 hover:opacity-100"
              }`}
              aria-label="Next Plan"
            >
              <ChevronRight className="w-5 h-5 stroke-[2.2]" />
            </button>
          ) : (
            <div className="w-9" />
          )}
        </div>
      )}

      {/* ── 4. Total Cost Display & 5. Split Description Pill ──────────── */}
      <div className="flex flex-col items-center text-center px-6 pt-1 pb-3 shrink-0 space-y-1.5">
        {/* 4. Total Cost Input */}
        <div className="relative inline-flex items-center justify-center min-w-[80px] cursor-text px-3 py-0.5 rounded-xl hover:bg-white/[0.03] transition-colors">
          <h2
            className={`text-4xl sm:text-5xl font-sans font-extrabold pointer-events-none tracking-tight ${
              parsedAmount > 0 ? "text-white" : "text-zinc-500"
            }`}
          >
            ₹{formatIndianCommasStr(costAmount)}
          </h2>
          <input
            type="text"
            inputMode="decimal"
            value={costAmount}
            onChange={(e) => {
              const sanitized = sanitizeCostInput(e.target.value);
              setCostAmount(sanitized);
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

        {/* 5. Split Description Input */}
        <div className="relative inline-flex items-center justify-center w-[165px] h-8 mt-1">
          <input
            type="text"
            maxLength={30}
            value={costTitle}
            onChange={(e) => setCostTitle(e.target.value)}
            placeholder="What's the split?"
            className="w-full h-full px-3.5 rounded-full bg-zinc-900 border border-white/10 text-zinc-200 text-xs font-medium text-center placeholder-zinc-400 focus:outline-none focus:border-white/20 focus:bg-zinc-800 transition-colors overflow-hidden whitespace-nowrap"
          />
        </div>
      </div>

      {formError && (
        <div className="mx-6 mb-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 shrink-0 text-center">
          {formError}
        </div>
      )}

      {/* ── 6. Scrollable Participants Form ──────────────────────────────── */}
      <form onSubmit={handleAddCostSubmit} className="flex-1 overflow-y-auto scrollbar-none px-6 pt-2 pb-32">
        <div className="flex items-center justify-between mb-2 px-0.5">
          <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-400">
            PARTICIPANTS
          </span>
          <span className="text-xs font-sans text-zinc-400 font-normal">
            {selectedParticipantIds.length} selected
          </span>
        </div>

        <div className="space-y-1">
          {availablePlanParticipants.map((p) => {
            const isSelected = selectedParticipantIds.includes(p.id);
            const rawCustomShare = customParticipantShares[p.id];
            const shareNum = rawCustomShare !== undefined
              ? (parseFloat(rawCustomShare) || 0)
              : (isSelected ? perPersonShare : 0);

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
      </form>

      {/* ── Fixed Bottom Action CTA ───────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-6 pb-8 pt-4 bg-gradient-to-t from-[#050505] via-[#050505]/90 to-transparent pointer-events-none">
        <button
          type="button"
          disabled={!isFormValid || submittingCost}
          onClick={handleAddCostSubmit}
          className={`w-full h-11 rounded-2xl font-sans font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 pointer-events-auto ${
            isFormValid && !submittingCost
              ? "bg-[#FF6B2C] hover:bg-[#ff7b42] active:bg-[#e05a1f] text-white shadow-lg shadow-[#FF6B2C]/25 active:scale-[0.98]"
              : "bg-zinc-800/80 text-zinc-500 cursor-not-allowed border border-white/5 opacity-50 shadow-none"
          }`}
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
    </div>
  );
};
