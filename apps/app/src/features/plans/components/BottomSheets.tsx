import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight } from "lucide-react";
import { HostInfo } from "./HeroHeader";

// Helper functions for date/time formatting inside EditDateTimeBottomSheet
function formatDateFriendly(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTimeFriendly(timeStr: string): string {
  if (!timeStr) return "";
  const [hours, minutes] = timeStr.split(":");
  const h = parseInt(hours, 10);
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? "PM" : "AM";
  const formattedHours = h % 12 || 12;
  return `${formattedHours}:${minutes} ${ampm}`;
}

// ----------------------------------------------------------------------
// 1. LEAVE PLAN BOTTOM SHEET
// ----------------------------------------------------------------------
interface LeavePlanBottomSheetProps {
  isOpen: boolean;
  isSkipping: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const LeavePlanBottomSheet: React.FC<LeavePlanBottomSheetProps> = ({
  isOpen,
  isSkipping,
  onConfirm,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 z-60 pointer-events-auto"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed bottom-0 left-0 right-0 z-[65] pointer-events-auto"
            style={{
              background: "#1C1C1E",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="flex justify-center pt-3 pb-4">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>

            <div className="px-5 pb-2 text-left">
              <h2 className="text-[18px] font-bold text-white mb-2">Leave this plan?</h2>
              <p className="text-[14px] text-white/55 leading-[1.55]">
                You will no longer be part of this plan.
              </p>
            </div>

            <div className="px-4 pt-5 flex flex-col gap-2.5">
              <button
                id="leave_plan_confirm_btn"
                type="button"
                disabled={isSkipping}
                onClick={onConfirm}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-red-400 active:scale-[0.98] transition-transform disabled:opacity-50"
                style={{ background: "rgba(255,59,48,0.12)", border: "1px solid rgba(255,59,48,0.2)" }}
              >
                {isSkipping ? "Leaving…" : "Leave Plan"}
              </button>

              <button
                id="leave_plan_cancel_btn"
                type="button"
                onClick={onClose}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white/70 active:scale-[0.98] transition-transform"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ----------------------------------------------------------------------
// 2. CANCEL PLAN BOTTOM SHEET
// ----------------------------------------------------------------------
interface CancelPlanBottomSheetProps {
  isOpen: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const CancelPlanBottomSheet: React.FC<CancelPlanBottomSheetProps> = ({
  isOpen,
  onConfirm,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 z-60 pointer-events-auto"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed bottom-0 left-0 right-0 z-[65] pointer-events-auto"
            style={{
              background: "#1C1C1E",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="flex justify-center pt-3 pb-4">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>

            <div className="px-5 pb-2 text-left">
              <h2 className="text-[18px] font-bold text-white mb-2">Cancel Plan?</h2>
              <p className="text-[14px] text-white/55 leading-[1.55]">
                This will cancel the plan for everyone.
              </p>
            </div>

            <div className="px-4 pt-5 flex flex-col gap-2.5">
              <button
                id="cancel_plan_confirm_btn"
                type="button"
                onClick={onConfirm}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-red-400 active:scale-[0.98] transition-transform"
                style={{ background: "rgba(255,59,48,0.12)", border: "1px solid rgba(255,59,48,0.2)" }}
              >
                Cancel Plan
              </button>

              <button
                id="cancel_plan_keep_btn"
                type="button"
                onClick={onClose}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white/70 active:scale-[0.98] transition-transform"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                Keep Plan
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ----------------------------------------------------------------------
// 2b. RESTORE PLAN BOTTOM SHEET
// ----------------------------------------------------------------------
interface RestorePlanBottomSheetProps {
  isOpen: boolean;
  isRestoring?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const RestorePlanBottomSheet: React.FC<RestorePlanBottomSheetProps> = ({
  isOpen,
  isRestoring,
  onConfirm,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 z-60 pointer-events-auto"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed bottom-0 left-0 right-0 z-[65] pointer-events-auto"
            style={{
              background: "#1C1C1E",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="flex justify-center pt-3 pb-4">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>

            <div className="px-5 pb-2 text-left">
              <h2 className="text-[18px] font-bold text-white mb-2">Restore this plan?</h2>
              <p className="text-[14px] text-white/55 leading-[1.55]">
                This will make the plan active again and allow participants to interact with it as before.
              </p>
            </div>

            <div className="px-4 pt-5 flex flex-col gap-2.5">
              <button
                id="restore_plan_confirm_btn"
                type="button"
                disabled={isRestoring}
                onClick={onConfirm}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white active:scale-[0.98] transition-transform disabled:opacity-50"
                style={{ background: "#FF6B2C" }}
              >
                {isRestoring ? "Restoring…" : "Restore Plan"}
              </button>

              <button
                id="restore_plan_cancel_btn"
                type="button"
                onClick={onClose}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white/70 active:scale-[0.98] transition-transform"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ----------------------------------------------------------------------
// 3. EDIT DATE & TIME BOTTOM SHEET
// ----------------------------------------------------------------------
interface EditDateTimeBottomSheetProps {
  isOpen: boolean;
  tempDate: string;
  tempTime: string;
  tempRSVPDate: string;
  tempRSVPTime: string;
  onTempDateChange: (val: string) => void;
  onTempTimeChange: (val: string) => void;
  onTempRSVPDateChange: (val: string) => void;
  onTempRSVPTimeChange: (val: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export const EditDateTimeBottomSheet: React.FC<EditDateTimeBottomSheetProps> = ({
  isOpen,
  tempDate,
  tempTime,
  tempRSVPDate,
  tempRSVPTime,
  onTempDateChange,
  onTempTimeChange,
  onTempRSVPDateChange,
  onTempRSVPTimeChange,
  onSave,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-60 pointer-events-auto"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
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

            <div style={{ display: "flex", flexDirection: "column", marginBottom: 20, textAlign: "left" }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Edit Date & Time</span>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255, 255, 255, 0.3)", letterSpacing: "0.05em", textTransform: "uppercase", textAlign: "left", paddingLeft: 4 }}>
                  Event Timing
                </span>
                <div style={{ background: "rgba(255, 255, 255, 0.05)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ position: "relative", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="date"
                      value={tempDate}
                      onChange={(e) => onTempDateChange(e.target.value)}
                      style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", zIndex: 10 }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#FFFFFF" }}>Date</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, color: "rgba(255, 255, 255, 0.45)", fontWeight: 500 }}>
                        {formatDateFriendly(tempDate) || "Select Date"}
                      </span>
                      <ChevronRight className="w-4 h-4 text-white/20" />
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)", marginLeft: 16 }} />
                  <div style={{ position: "relative", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="time"
                      value={tempTime}
                      onChange={(e) => onTempTimeChange(e.target.value)}
                      style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", zIndex: 10 }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#FFFFFF" }}>Time</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, color: "rgba(255, 255, 255, 0.45)", fontWeight: 500 }}>
                        {formatTimeFriendly(tempTime) || "Select Time"}
                      </span>
                      <ChevronRight className="w-4 h-4 text-white/20" />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255, 255, 255, 0.3)", letterSpacing: "0.05em", textTransform: "uppercase", textAlign: "left", paddingLeft: 4 }}>
                  RSVP Deadline
                </span>
                <div style={{ background: "rgba(255, 255, 255, 0.05)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ position: "relative", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="date"
                      value={tempRSVPDate}
                      onChange={(e) => onTempRSVPDateChange(e.target.value)}
                      style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", zIndex: 10 }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#FFFFFF" }}>Deadline Date</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, color: "rgba(255, 255, 255, 0.45)", fontWeight: 500 }}>
                        {formatDateFriendly(tempRSVPDate) || "Select RSVP Date"}
                      </span>
                      <ChevronRight className="w-4 h-4 text-white/20" />
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)", marginLeft: 16 }} />
                  <div style={{ position: "relative", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="time"
                      value={tempRSVPTime}
                      onChange={(e) => onTempRSVPTimeChange(e.target.value)}
                      style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", zIndex: 10 }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#FFFFFF" }}>Deadline Time</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, color: "rgba(255, 255, 255, 0.45)", fontWeight: 500 }}>
                        {formatTimeFriendly(tempRSVPTime) || "Select RSVP Time"}
                      </span>
                      <ChevronRight className="w-4 h-4 text-white/20" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button
                type="button"
                onClick={onClose}
                style={{ flex: 1, padding: "14px", background: "rgba(255, 255, 255, 0.06)", border: "none", borderRadius: 12, color: "#FFFFFF", fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "center" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                style={{ flex: 1, padding: "14px", background: "#FF5E3A", border: "none", borderRadius: 12, color: "#FFFFFF", fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "center" }}
              >
                Save
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ----------------------------------------------------------------------
// 4. EDIT COST BOTTOM SHEET
// ----------------------------------------------------------------------
interface EditCostBottomSheetProps {
  isOpen: boolean;
  costInput: string;
  capacity: number;
  onCostInputChange: (val: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export const EditCostBottomSheet: React.FC<EditCostBottomSheetProps> = ({
  isOpen,
  costInput,
  capacity,
  onCostInputChange,
  onSave,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 z-60 pointer-events-auto"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed bottom-0 left-0 right-0 z-[65] pointer-events-auto select-none"
            style={{
              background: "#1C1C1E",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="flex justify-center pt-3 pb-4">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>

            <div className="px-5 pb-2 text-left">
              <h2 className="text-[18px] font-bold text-white mb-1">Edit Cost</h2>
            </div>

            <div className="px-5 pt-3 pb-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5 text-left">
                <label className="text-[12px] font-semibold text-white/60">
                  Total Plan Cost
                </label>
                <div className="flex items-center bg-[#2C2C2E] border border-white/10 rounded-2xl px-4 py-3.5 focus-within:border-amber-500/50 transition">
                  <span className="text-white/40 text-base font-semibold mr-2">₹</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={costInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || Number(val) >= 0) {
                        onCostInputChange(val);
                      }
                    }}
                    placeholder="0 (Free)"
                    className="bg-transparent border-none text-white text-base font-semibold focus:outline-none w-full"
                  />
                </div>
              </div>

              {(() => {
                const parsedInput = parseFloat(costInput);
                const isCostSet = costInput.trim() !== "" && !isNaN(parsedInput) && parsedInput > 0;

                let mainDisplay = "Free";
                let subDisplay = "No cost has been set.";

                if (isCostSet) {
                  if (capacity > 0) {
                    const perPersonVal = Math.round((parsedInput / capacity) * 100) / 100;
                    const formattedVal = perPersonVal.toLocaleString("en-IN");
                    mainDisplay = `₹${formattedVal} each`;
                    subDisplay = `${capacity} ${capacity === 1 ? "participant" : "participants"}`;
                  } else {
                    mainDisplay = "Unable to calculate";
                    subDisplay = "Invalid participant capacity";
                  }
                }

                return (
                  <div className="flex flex-col gap-0.5 text-left py-0.5">
                    <span className="text-[22px] font-bold text-white tracking-tight">
                      {mainDisplay}
                    </span>
                    <span className="text-[13px] text-white/40 font-medium">
                      {subDisplay}
                    </span>
                  </div>
                );
              })()}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3.5 rounded-2xl text-[15px] font-semibold text-white/70 active:scale-[0.98] transition-transform cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  className="flex-1 py-3.5 rounded-2xl text-[15px] font-semibold text-white active:scale-[0.98] transition-transform cursor-pointer"
                  style={{ background: "#FF5E3A" }}
                >
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ----------------------------------------------------------------------
// 5. EDIT DETAILS BOTTOM SHEET
// ----------------------------------------------------------------------
interface EditDetailsBottomSheetProps {
  isOpen: boolean;
  isSaving: boolean;
  tempTitle: string;
  tempDescription: string;
  tempCapacity: number | "";
  tempCoverImage: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onTitleChange: (val: string) => void;
  onDescriptionChange: (val: string) => void;
  onCapacityChange: (val: number | "") => void;
  onCoverImageChange: (val: string | null) => void;
  onSave: () => void;
  onClose: () => void;
}

export const EditDetailsBottomSheet: React.FC<EditDetailsBottomSheetProps> = ({
  isOpen,
  isSaving,
  tempTitle,
  tempDescription,
  tempCapacity,
  tempCoverImage,
  fileInputRef,
  onTitleChange,
  onDescriptionChange,
  onCapacityChange,
  onCoverImageChange,
  onSave,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-45 bg-[#000000]/60 backdrop-blur-[4px] animate-fade-in"
            onClick={() => !isSaving && onClose()}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#0c0c0c] border-t border-white/[0.06] rounded-t-[32px] p-6 max-h-[85vh] flex flex-col pointer-events-auto"
          >
            <div className="w-12 h-1 bg-white/10 rounded-full mx-auto mb-5" />

            <div className="text-center mb-4">
              <h3 className="text-[17px] font-semibold text-white/95 font-sans">Edit Plan Details</h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1 no-scrollbar">
              <div className="space-y-2 text-left">
                <label className="text-[10px] font-sans font-bold tracking-[0.1em] text-zinc-500 uppercase">Plan Title</label>
                <input
                  type="text"
                  maxLength={50}
                  value={tempTitle}
                  onChange={(e) => onTitleChange(e.target.value.slice(0, 50))}
                  className="w-full bg-zinc-900/30 border border-white/[0.04] rounded-2xl px-4 py-3 text-white text-sm font-semibold focus:outline-none focus:border-white/10"
                  placeholder="Enter plan title"
                />
              </div>

              <div className="space-y-2 text-left">
                <label className="text-[10px] font-sans font-bold tracking-[0.1em] text-zinc-500 uppercase">Description</label>
                <textarea
                  value={tempDescription}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  className="w-full bg-zinc-900/30 border border-white/[0.04] rounded-2xl px-4 py-3 text-white text-sm font-semibold focus:outline-none focus:border-white/10 min-h-[80px] resize-none"
                  placeholder="Add a description..."
                />
              </div>

              <div className="space-y-2 text-left">
                <label className="text-[10px] font-sans font-bold tracking-[0.1em] text-zinc-500 uppercase">Capacity (Limit)</label>
                <input
                  type="number"
                  value={tempCapacity}
                  onChange={(e) => onCapacityChange(e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-zinc-900/30 border border-white/[0.04] rounded-2xl px-4 py-3 text-white text-sm font-semibold focus:outline-none focus:border-white/10"
                  placeholder="Unlimited"
                />
              </div>

              <div className="space-y-2 text-left">
                <label className="text-[10px] font-sans font-bold tracking-[0.1em] text-zinc-500 uppercase">Cover Image</label>
                <div className="flex flex-col items-center gap-3 p-4 bg-zinc-900/20 border border-white/[0.02] rounded-2xl">
                  <img
                    src={tempCoverImage || ""}
                    alt="Plan Cover"
                    className="w-full h-[120px] object-cover rounded-xl border border-white/10"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          onCoverImageChange(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/90 font-semibold text-xs rounded-xl transition cursor-pointer"
                  >
                    Change Cover Photo
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6 pt-3 border-t border-white/[0.04]">
              <button
                type="button"
                disabled={isSaving}
                onClick={onClose}
                className="flex-1 bg-zinc-900 hover:bg-zinc-850 active:bg-zinc-800 text-zinc-400 font-semibold text-sm py-3.5 rounded-2xl transition cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={onSave}
                className="flex-1 bg-[#ff5e3a] hover:bg-[#ff7252] active:bg-[#e24c2a] text-white font-semibold text-sm py-3.5 rounded-2xl transition cursor-pointer shadow-lg shadow-brand-orange/20 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
