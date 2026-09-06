import React, { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";

interface ParticipantItem {
  id?: string;
  name?: string;
  avatar?: string | null;
  isHost?: boolean;
}

interface SetCostScreenProps {
  planTitle?: string;
  planCoverImage?: string | null;
  initialCost: string;
  participants?: ParticipantItem[];
  planSize?: number | null;
  onSave: (costAmount: number) => void;
  onClose: () => void;
}

export const SetCostScreen: React.FC<SetCostScreenProps> = ({
  planTitle,
  planCoverImage,
  initialCost,
  participants = [],
  planSize,
  onSave,
  onClose,
}) => {
  const [costAmount, setCostAmount] = useState(initialCost || "");

  useEffect(() => {
    setCostAmount(initialCost || "");
  }, [initialCost]);

  const sanitizeCostInput = (val: string): string => {
    let sanitized = val.replace(/[^0-9]/g, "");
    if (sanitized.length > 6) {
      sanitized = sanitized.slice(0, 6);
    }
    return sanitized;
  };

  const formatIndianCommasStr = (valStr: string): string => {
    if (!valStr) return "0";
    const num = parseFloat(valStr);
    if (isNaN(num)) return "0";
    return num.toLocaleString("en-IN");
  };

  const parsedAmount = parseFloat(costAmount) || 0;

  // All invited participants (including waitlisted) for the avatar stack
  const displayParticipants: ParticipantItem[] =
    participants && participants.length > 0
      ? participants
      : [{ id: "host", name: "You", avatar: "", isHost: true }];

  // Cost split is strictly divided by Plan Size (capacity), not total invited count
  const effectivePlanSize = Number(planSize) > 0 ? Number(planSize) : displayParticipants.length;
  const splitCount = effectivePlanSize > 0 ? effectivePlanSize : 1;
  const perPersonAmount = splitCount > 0 ? parsedAmount / splitCount : 0;

  const perPersonFormatted =
    perPersonAmount % 1 === 0
      ? perPersonAmount.toLocaleString("en-IN")
      : perPersonAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const peopleLabel = splitCount === 1 ? "1 person" : `${splitCount} people`;

  // Avatar stack slice (up to 4 avatars + remainder count) representing all invited people
  const visibleAvatars = displayParticipants.slice(0, 4);
  const remainingCount = displayParticipants.length - visibleAvatars.length;

  const handleAddCost = () => {
    onSave(parsedAmount);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex flex-col bg-[#050505] text-left font-sans select-none overflow-hidden"
      style={{ height: "100dvh" }}
    >
      {/* ── 1. Top Navigation: Back Arrow (Left) & Centered Plan Name ── */}
      <div
        className="flex items-center justify-between px-4 pb-2 shrink-0"
        style={{ paddingTop: "max(16px, env(safe-area-inset-top, 16px))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0 z-10"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Centered Plan Name in Header Row */}
        <h3 className="font-sans font-bold text-base text-white tracking-tight leading-tight text-center truncate px-2 max-w-[240px] flex-1">
          {planTitle || "Plan"}
        </h3>

        <div className="w-8 shrink-0" />
      </div>

      {/* ── Main Content Area ── */}
      <div className="flex-1 px-6 flex flex-col items-center justify-between pb-2">
        {/* ── Upper Group: Larger Plan Avatar + Total Cost + 'Total' Label ── */}
        <div className="flex flex-col items-center w-full pt-4">
          {/* Centered Larger Plan Avatar with extra top breathing room */}
          <div className="relative w-full pt-2 pb-2.5 flex items-center justify-center shrink-0 select-none">
            <div className="w-24 h-24 sm:w-26 sm:h-26 rounded-full aspect-square overflow-hidden shadow-2xl shadow-black/80 flex items-center justify-center shrink-0 border border-white/10 bg-zinc-900">
              <DiscoveryImages
                src={planCoverImage || null}
                alt={planTitle || "Plan"}
                className="w-full h-full object-cover aspect-square rounded-full opacity-95"
              />
            </div>
          </div>

          {/* Total Cost Display & Transparent Input */}
          <div className="flex flex-col items-center text-center px-6 pt-1 pb-0 shrink-0">
            <div className="relative inline-flex items-center justify-center min-w-[120px] cursor-text px-4 py-0.5 rounded-2xl hover:bg-white/[0.03] transition-colors">
              <h2
                className={`text-6xl sm:text-7xl font-sans font-extrabold pointer-events-none tracking-tight ${parsedAmount > 0 ? "text-white" : "text-zinc-500"
                  }`}
              >
                ₹{formatIndianCommasStr(costAmount)}
              </h2>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={costAmount}
                onChange={(e) => {
                  const sanitized = sanitizeCostInput(e.target.value);
                  setCostAmount(sanitized);
                }}
                className="absolute inset-0 opacity-0 w-full h-full cursor-text"
                placeholder="0"
              />
            </div>

            {/* Muted 'Total' Label */}
            <span className="text-[13px] text-zinc-500 font-normal tracking-wide mt-1 select-none">
              Total
            </span>
          </div>
        </div>

        {/* ── Middle Group: 'Split between' Label + Larger Avatar Stack + People Count ── */}
        <div className="flex flex-col items-center text-center select-none my-auto">
          {/* Muted 'Split between' Label (Visually stronger) */}
          <span className="text-[15px] sm:text-[16px] text-zinc-400 font-medium tracking-tight mb-3 select-none">
            Split between
          </span>

          {/* Overlapping Avatar Stack */}
          <div className="flex items-center justify-center -space-x-3">
            {visibleAvatars.map((p, idx) => (
              <UserAvatar
                key={p.id || idx}
                src={p.avatar}
                alt={p.name || "Participant"}
                size="w-9 h-9"
                className="ring-2 ring-[#050505] rounded-full object-cover shrink-0"
              />
            ))}
            {remainingCount > 0 && (
              <div className="w-9 h-9 rounded-full bg-zinc-800 ring-2 ring-[#050505] flex items-center justify-center text-[12px] font-semibold text-zinc-300 shrink-0">
                +{remainingCount}
              </div>
            )}
          </div>

          {/* People Count (More prominent) */}
          <span className="text-[16px] sm:text-[17px] text-zinc-300 font-medium tracking-tight mt-3 select-none">
            {peopleLabel}
          </span>
        </div>

        {/* Spacer balance */}
        <div className="h-1" />
      </div>

      {/* ── Fixed Bottom Action Section: Per-Person Cost & Add Cost Button ── */}
      <div
        className="px-6 pt-2 pb-6 flex flex-col items-center select-none"
        style={{ paddingBottom: "max(24px, calc(16px + env(safe-area-inset-bottom, 0px)))" }}
      >
        {/* Per-Person Cost directly above button */}
        <span className="text-[22px] sm:text-[24px] text-white font-bold tracking-tight mb-3.5">
          {parsedAmount > 0 ? `₹${perPersonFormatted} each` : "Free"}
        </span>

        {/* Add Cost Button */}
        <button
          type="button"
          onClick={handleAddCost}
          className="w-full h-12 rounded-full font-sans font-bold text-[15px] transition-all cursor-pointer flex items-center justify-center gap-2 bg-[#FF6B2C] hover:bg-[#ff7b42] active:bg-[#e05a1f] text-white shadow-lg shadow-[#FF6B2C]/25 active:scale-[0.98]"
        >
          <span>Add Cost</span>
        </button>
      </div>
    </motion.div>
  );
};
