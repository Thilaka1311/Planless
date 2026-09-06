import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Minus, Plus, Users, UserPlus } from "lucide-react";

export interface PlanSizeBottomsheetProps {
  isOpen: boolean;
  capacity?: number;
  invitedCount?: number;
  joinedCount?: number;
  waitlistedCount?: number;
  minCapacity?: number;
  maxCapacity?: number;
  onCapacityChange: (newCapacity: number) => void | Promise<void>;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onSave?: () => void;
  onClose: () => void;
  onAddParticipants?: () => void;
}

export type EditCapacityBottomSheetProps = PlanSizeBottomsheetProps;

export const PlanSizeBottomsheet: React.FC<PlanSizeBottomsheetProps> = ({
  isOpen,
  capacity,
  invitedCount,
  joinedCount,
  waitlistedCount,
  minCapacity = 2,
  maxCapacity = 50,
  onCapacityChange,
  onIncrement,
  onDecrement,
  onSave,
  onClose,
  onAddParticipants,
}) => {
  const effectiveMaxCapacity =
    invitedCount !== undefined
      ? Math.max(minCapacity, Math.min(invitedCount, maxCapacity))
      : Math.max(minCapacity, maxCapacity);
  const initialValidCapacity = Math.max(minCapacity, Math.min(effectiveMaxCapacity, capacity || minCapacity));

  const [draftCapacity, setDraftCapacity] = useState<number>(initialValidCapacity);
  const [showInviteHint, setShowInviteHint] = useState(false);

  // References to track open state, original value, and ensure single commit on close
  const prevIsOpenRef = useRef(false);
  const originalCapacityRef = useRef<number>(initialValidCapacity);
  const draftCapacityRef = useRef<number>(initialValidCapacity);
  const hasCommittedRef = useRef(false);

  // Sync draftCapacity when capacity prop changes or sheet opens
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      const valid = Math.max(minCapacity, Math.min(effectiveMaxCapacity, capacity ?? minCapacity));
      setDraftCapacity(valid);
      draftCapacityRef.current = valid;
      originalCapacityRef.current = valid;
      hasCommittedRef.current = false;
      setShowInviteHint(false);
    } else if (isOpen && (onIncrement || onDecrement) && capacity !== undefined) {
      const valid = Math.max(minCapacity, Math.min(effectiveMaxCapacity, capacity));
      setDraftCapacity(valid);
      draftCapacityRef.current = valid;
    } else if (!isOpen && prevIsOpenRef.current) {
      // In case sheet was closed from external state without handleClose having been called
      if (!hasCommittedRef.current && !onIncrement && !onDecrement) {
        hasCommittedRef.current = true;
        const finalVal = draftCapacityRef.current;
        const originalVal = originalCapacityRef.current;
        if (finalVal !== originalVal) {
          try {
            const res = onCapacityChange(finalVal);
            if (res && typeof (res as any).catch === "function") {
              (res as any).catch(() => {});
            }
          } catch (err) {
            // Handled by onCapacityChange
          }
          onSave?.();
        }
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, capacity, effectiveMaxCapacity, minCapacity, onCapacityChange, onSave, onIncrement, onDecrement]);

  const currentCapacity = Math.max(minCapacity, Math.min(effectiveMaxCapacity, draftCapacity));

  const handleDecrement = () => {
    setShowInviteHint(false);
    if (onDecrement) {
      onDecrement();
      return;
    }
    if (currentCapacity > minCapacity) {
      const nextVal = currentCapacity - 1;
      setDraftCapacity(nextVal);
      draftCapacityRef.current = nextVal;
    }
  };

  const handleIncrement = () => {
    if (currentCapacity >= effectiveMaxCapacity) {
      setShowInviteHint(true);
      return;
    }
    setShowInviteHint(false);
    if (onIncrement) {
      onIncrement();
      return;
    }
    const nextVal = currentCapacity + 1;
    setDraftCapacity(nextVal);
    draftCapacityRef.current = nextVal;
  };

  // Commit exactly once when closing, and only if value actually changed (when not using onIncrement/onDecrement)
  const commitChangeIfDifferent = () => {
    if (onIncrement || onDecrement) return;
    if (hasCommittedRef.current) return;
    hasCommittedRef.current = true;
    const finalVal = draftCapacityRef.current;
    const originalVal = originalCapacityRef.current;
    if (finalVal !== originalVal) {
      try {
        const res = onCapacityChange(finalVal);
        if (res && typeof (res as any).catch === "function") {
          (res as any).catch(() => {});
        }
      } catch (err) {
        // Handled by onCapacityChange
      }
      onSave?.();
    }
  };

  const handleClose = () => {
    commitChangeIfDifferent();
    onClose();
  };

  const handleAddParticipants = () => {
    commitChangeIfDifferent();
    onClose();
    onAddParticipants?.();
  };

  const isCapacityReached = joinedCount !== undefined ? joinedCount >= currentCapacity : true;
  const effectiveWaitlistedCount =
    waitlistedCount !== undefined
      ? waitlistedCount
      : isCapacityReached && invitedCount !== undefined
      ? Math.max(0, invitedCount - currentCapacity)
      : 0;
  const effectiveGoingCount =
    joinedCount !== undefined
      ? joinedCount
      : Math.min(currentCapacity, invitedCount ?? currentCapacity);

  const capacitySummary =
    effectiveWaitlistedCount > 0
      ? `${effectiveGoingCount} going • ${effectiveWaitlistedCount} waitlisted`
      : `${effectiveGoingCount} going`;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 z-60 pointer-events-auto"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: "85vh",
              background: "#1C1C1E",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              zIndex: 65,
              padding: "16px 20px calc(32px + env(safe-area-inset-bottom, 0px))",
              color: "#FFFFFF",
              boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.3)",
              display: "flex",
              flexDirection: "column",
              pointerEvents: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <div style={{ width: 36, height: 5, borderRadius: 2.5, background: "rgba(255, 255, 255, 0.15)" }} />
            </div>

            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 18,
                width: "100%",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Users className="w-5 h-5 text-[#FF6B2C]" />
                <span style={{ fontSize: 18, fontWeight: 700, color: "#FFFFFF", fontFamily: "Inter, sans-serif" }}>
                  Plan Size
                </span>
              </div>

              {invitedCount !== undefined && (
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "rgba(255, 255, 255, 0.7)",
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  Invited: <span style={{ color: "#FFFFFF", fontWeight: 700 }}>{invitedCount}</span>
                </span>
              )}
            </div>

            {/* Stepper Card */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 16,
                padding: "16px 20px",
                marginBottom: showInviteHint ? 14 : 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                <button
                  type="button"
                  id="capacity_decrement_btn"
                  disabled={currentCapacity <= minCapacity}
                  onClick={handleDecrement}
                  className="w-12 h-12 rounded-full bg-white/[0.08] hover:bg-white/[0.14] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center text-white text-xl font-bold cursor-pointer"
                >
                  <Minus className="w-5 h-5" />
                </button>

                <div className="flex flex-col items-center gap-1">
                  <span className="text-[28px] font-bold text-white leading-none tracking-tight">
                    {currentCapacity}
                  </span>
                  <span className="text-[12px] text-white/40 font-medium">
                    {currentCapacity === 1 ? "person" : "people"}
                  </span>
                </div>

                <button
                  type="button"
                  id="capacity_increment_btn"
                  disabled={currentCapacity >= effectiveMaxCapacity}
                  onClick={handleIncrement}
                  className="w-12 h-12 rounded-full bg-white/[0.08] hover:bg-white/[0.14] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center text-white text-xl font-bold cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {invitedCount !== undefined && (
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    id="capacity_summary_text"
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "rgba(255, 255, 255, 0.55)",
                      fontFamily: "Inter, sans-serif",
                    }}
                  >
                    {capacitySummary}
                  </span>
                </div>
              )}
            </div>

            {/* Error / Hint Message */}
            <AnimatePresence>
              {showInviteHint && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="mb-4 text-center"
                >
                  <span className="text-[13px] font-medium text-amber-400">
                    Maximum plan capacity reached ({effectiveMaxCapacity}).
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="button"
              id="capacity_add_participants_btn"
              onClick={handleAddParticipants}
              className="w-full py-2.5 bg-transparent hover:opacity-80 active:scale-[0.98] transition-all text-white/60 hover:text-white/80 font-medium text-[14px] cursor-pointer flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4.5 h-4.5 text-current" />
              <span>Add Participants</span>
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export const EditCapacityBottomSheet = PlanSizeBottomsheet;
export const PlanSizeBottomSheet = PlanSizeBottomsheet;
export default PlanSizeBottomsheet;
