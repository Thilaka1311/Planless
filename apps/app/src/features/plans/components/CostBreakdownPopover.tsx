import React, { useEffect, useRef } from "react";
import { Edit2 } from "lucide-react";

interface CostBreakdownPopoverProps {
  totalCost?: number | null;
  /** Total plan capacity (max_participants). Used to derive per-person cost. */
  maxParticipants?: number | null;
  isOpen: boolean;
  onClose: () => void;
  isHost?: boolean;
  onEditCost?: () => void;
  position?: "above" | "below";
  align?: "right" | "left" | "center";
}

export const CostBreakdownPopover: React.FC<CostBreakdownPopoverProps> = ({
  totalCost,
  maxParticipants,
  isOpen,
  onClose,
  isHost = false,
  onEditCost,
  position = "above",
  align = "right",
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  // 5-second auto dismiss timer
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [isOpen, onClose]);

  // Click outside to dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("touchstart", handleOutsideClick);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const totalCostNum = totalCost !== undefined && totalCost !== null ? Number(totalCost) : 0;
  const maxCapNum = maxParticipants !== undefined && maxParticipants !== null ? Number(maxParticipants) : 0;

  const formattedTotalCost =
    totalCostNum > 0 ? `₹${Math.round(totalCostNum)}` : "Free";

  const formattedPerPerson =
    totalCostNum > 0 && maxCapNum > 0
      ? `₹${Math.round((totalCostNum / maxCapNum) * 100) / 100}`
      : "Free";

  const positionClasses =
    position === "above" ? "bottom-full mb-2" : "top-full mt-2";

  const alignClasses =
    align === "right"
      ? "right-0"
      : align === "left"
      ? "left-0"
      : "left-1/2 -translate-x-1/2";

  return (
    <div
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
      className={`absolute ${positionClasses} ${alignClasses} z-50 min-w-[200px] p-3.5 bg-[#18181b]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/80 text-left font-sans select-none animate-in fade-in zoom-in-95 duration-150`}
    >
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-2 mb-2.5">
        <h4 className="text-[12px] font-bold text-white tracking-wide uppercase">
          Cost Breakdown
        </h4>
        {isHost && onEditCost && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onEditCost();
            }}
            className="text-[11px] font-semibold text-[#FF6B2C] hover:text-[#ff8550] flex items-center gap-1 cursor-pointer transition active:scale-95"
          >
            <Edit2 className="w-3 h-3" />
            <span>Edit</span>
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[12px] text-zinc-400 font-medium">
            Total Plan Cost
          </span>
          <span className="text-[13px] text-white font-bold font-mono">
            {formattedTotalCost}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-[12px] text-zinc-400 font-medium">
            Per Person
          </span>
          <span className="text-[13px] text-emerald-400 font-bold font-mono">
            {formattedPerPerson}
          </span>
        </div>
      </div>
    </div>
  );
};
