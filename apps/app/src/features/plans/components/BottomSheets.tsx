import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight, TrendingUp, TrendingDown, Hourglass, Check, AlertCircle, ArrowLeftRight, UserMinus, Trash2 } from "lucide-react";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
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
// 1B. JOIN PLAN CONFIRMATION BOTTOM SHEET
// ----------------------------------------------------------------------
interface JoinPlanConfirmationBottomSheetProps {
  isOpen: boolean;
  costText: string | null;
  planTitle?: string;
  isJoining: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const JoinPlanConfirmationBottomSheet: React.FC<JoinPlanConfirmationBottomSheetProps> = ({
  isOpen,
  costText,
  planTitle,
  isJoining,
  onConfirm,
  onClose,
}) => {
  const formattedCost = costText ? costText.replace(" / person", "").trim() : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-auto">
          {/* Subtle backdrop dimming */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          />

          {/* Minimal Centered Modal Dialog Card */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 6 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 6 }}
            transition={{ type: "spring", damping: 28, stiffness: 360 }}
            className="relative w-full max-w-[300px] bg-[#18181B] border border-white/[0.08] rounded-2xl p-5 text-center shadow-xl space-y-4 z-10"
          >
            {/* Title & Share Amount Wording */}
            <div className="space-y-1.5 pt-0.5">
              <h3 className="text-[19px] font-bold text-white tracking-tight leading-snug">
                Join {planTitle || "Plan"}?
              </h3>
              {formattedCost ? (
                <p className="text-[13.5px] text-zinc-400 font-medium tracking-wide">
                  Your share is <span className="text-[#FF6B2C] font-semibold">{formattedCost}</span>.
                </p>
              ) : (
                <p className="text-[13px] text-zinc-400 font-medium tracking-wide">
                  Are you sure you want to join this plan?
                </p>
              )}
            </div>

            {/* Actions: Refined Join Plan CTA & Muted Text Cancel */}
            <div className="flex flex-col items-center gap-2 pt-1">
              <button
                id="join_plan_modal_confirm_btn"
                type="button"
                disabled={isJoining}
                onClick={onConfirm}
                className="w-full py-3 px-4 rounded-xl text-[13.5px] font-bold text-white bg-[#FF6B2C]/15 hover:bg-[#FF6B2C]/25 active:scale-[0.98] transition-all border border-[#FF6B2C]/40 disabled:opacity-50 tracking-wide shadow-sm"
              >
                {isJoining ? "Joining…" : "Join Plan"}
              </button>

              <button
                id="join_plan_modal_cancel_btn"
                type="button"
                onClick={onClose}
                className="py-1 px-3 text-[12.5px] font-medium text-zinc-400 hover:text-zinc-200 active:opacity-70 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ----------------------------------------------------------------------
// 1C. SKIP PLAN CONFIRMATION DIALOG
// ----------------------------------------------------------------------
interface SkipPlanConfirmationDialogProps {
  isOpen: boolean;
  planTitle?: string;
  isSkipping: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const SkipPlanConfirmationDialog: React.FC<SkipPlanConfirmationDialogProps> = ({
  isOpen,
  planTitle,
  isSkipping,
  onConfirm,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-auto">
          {/* Subtle backdrop dimming */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          />

          {/* Minimal Centered Modal Dialog Card */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 6 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 6 }}
            transition={{ type: "spring", damping: 28, stiffness: 360 }}
            className="relative w-full max-w-[300px] bg-[#18181B] border border-white/[0.08] rounded-2xl p-5 text-center shadow-xl space-y-4 z-10"
          >
            {/* Title & Wording */}
            <div className="space-y-1.5 pt-0.5">
              <h3 className="text-[19px] font-bold text-white tracking-tight leading-snug">
                Skip {planTitle || "Plan"}?
              </h3>
              <p className="text-[13.5px] text-zinc-400 font-medium tracking-wide">
                You won't be joining this plan.
              </p>
            </div>

            {/* Actions: Skip Plan CTA & Muted Text Cancel */}
            <div className="flex flex-col items-center gap-2 pt-1">
              <button
                id="skip_plan_modal_confirm_btn"
                type="button"
                disabled={isSkipping}
                onClick={onConfirm}
                className="w-full py-3 px-4 rounded-xl text-[13.5px] font-bold text-white bg-red-500/15 hover:bg-red-500/25 active:scale-[0.98] transition-all border border-red-500/35 disabled:opacity-50 tracking-wide"
              >
                {isSkipping ? "Skipping…" : "Skip Plan"}
              </button>

              <button
                id="skip_plan_modal_cancel_btn"
                type="button"
                onClick={onClose}
                className="py-1 px-3 text-[12.5px] font-medium text-zinc-400 hover:text-zinc-200 active:opacity-70 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ----------------------------------------------------------------------
// 1D. PAID PLAN LEAVE REQUEST CONFIRMATION DIALOG (Phase 1)
// ----------------------------------------------------------------------
interface PaidPlanLeaveConfirmationDialogProps {
  isOpen: boolean;
  planTitle?: string;
  isSubmitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const PaidPlanLeaveConfirmationDialog: React.FC<PaidPlanLeaveConfirmationDialogProps> = ({
  isOpen,
  planTitle,
  isSubmitting,
  onConfirm,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-auto">
          {/* Subtle backdrop dimming */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          />

          {/* Minimal Centered Modal Dialog Card */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 6 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 6 }}
            transition={{ type: "spring", damping: 28, stiffness: 360 }}
            className="relative w-full max-w-[310px] bg-[#18181B] border border-white/[0.08] rounded-2xl p-5 text-center shadow-xl space-y-4 z-10"
          >
            {/* Title & Wording */}
            <div className="space-y-2 pt-0.5">
              <h3 className="text-[19px] font-bold text-white tracking-tight leading-snug">
                Leave Plan?
              </h3>
              <p className="text-[13px] text-zinc-400 font-medium leading-[1.5] tracking-wide">
                We'll send a request to the host to leave this plan. You'll remain in the plan until the host decides.
              </p>
            </div>

            {/* Actions: Request to Leave CTA & Muted Text Cancel */}
            <div className="flex flex-col items-center gap-2 pt-1">
              <button
                id="paid_leave_request_modal_confirm_btn"
                type="button"
                disabled={isSubmitting}
                onClick={onConfirm}
                className="w-full py-3 px-4 rounded-xl text-[13.5px] font-bold text-white bg-amber-500/20 hover:bg-amber-500/30 active:scale-[0.98] transition-all border border-amber-500/40 disabled:opacity-50 tracking-wide"
              >
                {isSubmitting ? "Sending Request…" : "Request to Leave"}
              </button>

              <button
                id="paid_leave_request_modal_cancel_btn"
                type="button"
                onClick={onClose}
                className="py-1 px-3 text-[12.5px] font-medium text-zinc-400 hover:text-zinc-200 active:opacity-70 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ----------------------------------------------------------------------
// 1E. CANCEL LEAVE REQUEST BOTTOM SHEET (Phase 1)
// ----------------------------------------------------------------------
interface CancelLeaveRequestBottomSheetProps {
  isOpen: boolean;
  planTitle?: string;
  isSubmitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const CancelLeaveRequestBottomSheet: React.FC<CancelLeaveRequestBottomSheetProps> = ({
  isOpen,
  isSubmitting,
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
            className="fixed bottom-0 left-0 right-0 z-[65] pointer-events-auto text-left"
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
              <h2 className="text-[18px] font-bold text-white mb-2">Cancel leave request?</h2>
              <p className="text-[14px] text-white/55 leading-[1.55]">
                You're still part of this plan. Would you like to stay?
              </p>
            </div>

            <div className="px-4 pt-5 flex flex-col gap-2.5">
              <button
                id="cancel_leave_request_confirm_btn"
                type="button"
                disabled={isSubmitting}
                onClick={onConfirm}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-black bg-white hover:bg-zinc-100 active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                {isSubmitting ? "Updating…" : "Stay in Plan"}
              </button>

              <button
                id="cancel_leave_request_keep_btn"
                type="button"
                onClick={onClose}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white/70 active:scale-[0.98] transition-transform"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                Keep Request
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ----------------------------------------------------------------------
// 2. CANCEL PLAN BOTTOM SHEET (PLAN ACTIONS)
// ----------------------------------------------------------------------
interface CancelPlanBottomSheetProps {
  isOpen: boolean;
  onConfirm?: () => void;
  onConfirmCancel?: () => void;
  onMarkAsComplete?: () => void;
  onClose: () => void;
}

export const CancelPlanBottomSheet: React.FC<CancelPlanBottomSheetProps> = ({
  isOpen,
  onConfirm,
  onConfirmCancel,
  onMarkAsComplete,
  onClose,
}) => {
  const handleCancelClick = () => {
    if (onConfirmCancel) {
      onConfirmCancel();
    } else if (onConfirm) {
      onConfirm();
    }
  };

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
              <h2 className="text-[18px] font-bold text-white mb-1">Plan Actions</h2>
            </div>

            <div className="px-4 pt-4 flex flex-col gap-2.5">
              <button
                id="cancel_plan_confirm_btn"
                type="button"
                onClick={handleCancelClick}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-red-400 active:scale-[0.98] transition-transform cursor-pointer"
                style={{ background: "rgba(255,59,48,0.12)", border: "1px solid rgba(255,59,48,0.2)" }}
              >
                Cancel Plan
              </button>

              <button
                id="mark_as_complete_btn"
                type="button"
                onClick={() => {
                  onClose();
                  onMarkAsComplete?.();
                }}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white active:scale-[0.98] transition-transform cursor-pointer"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                Mark as Complete
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ----------------------------------------------------------------------
// 2B. COMPLETE PLAN CONFIRMATION BOTTOM SHEET
// ----------------------------------------------------------------------
interface CompletePlanConfirmationBottomSheetProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const CompletePlanConfirmationBottomSheet: React.FC<CompletePlanConfirmationBottomSheetProps> = ({
  isOpen,
  isSubmitting = false,
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
              <h2 className="text-[18px] font-bold text-white mb-2">End this plan?</h2>
              <p className="text-[14px] text-white/55 leading-[1.55]">
                This will move the plan to Past Plans. Any unsettled expenses will remain in Wallet until they're cleared.
              </p>
            </div>

            <div className="px-4 pt-5 flex flex-col gap-2.5">
              <button
                id="end_plan_confirm_btn"
                type="button"
                onClick={onConfirm}
                disabled={isSubmitting}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}
              >
                {isSubmitting ? "Ending Plan…" : "End Plan"}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white/70 active:scale-[0.98] transition-transform cursor-pointer"
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
// 2C. EARLY COMPLETE PLAN CONFIRMATION BOTTOM SHEET
// ----------------------------------------------------------------------
interface EarlyCompletePlanConfirmationBottomSheetProps {
  isOpen: boolean;
  scheduledTimeText: string;
  isSubmitting?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const EarlyCompletePlanConfirmationBottomSheet: React.FC<EarlyCompletePlanConfirmationBottomSheetProps> = ({
  isOpen,
  scheduledTimeText,
  isSubmitting = false,
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
              <h2 className="text-[18px] font-bold text-white mb-2">Complete plan early?</h2>
              <p className="text-[14px] text-white/55 leading-[1.55]">
                This plan is scheduled for <span className="text-white font-medium">{scheduledTimeText}</span>. Since you're completing it now, the plan time will be updated to now.
              </p>
            </div>

            <div className="px-4 pt-5 flex flex-col gap-2.5">
              <button
                id="complete_plan_early_confirm_btn"
                type="button"
                onClick={onConfirm}
                disabled={isSubmitting}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white bg-[#FF6B2C] hover:bg-[#FF854C] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? "Completing Plan…" : "Complete Plan"}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white/70 active:scale-[0.98] transition-transform cursor-pointer"
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

// ----------------------------------------------------------------------
// 9. PLAN IS FULL BOTTOM SHEET
// ----------------------------------------------------------------------
interface PlanIsFullBottomSheetProps {
  isOpen: boolean;
  pickerSelectedFriends: any[];
  onIncreaseCapacity: () => void;
  onInviteToWaitlist: () => void;
  onClose: () => void;
}

export const PlanIsFullBottomSheet: React.FC<PlanIsFullBottomSheetProps> = ({
  isOpen,
  pickerSelectedFriends,
  onIncreaseCapacity,
  onInviteToWaitlist,
  onClose,
}) => {
  if (!isOpen) return null;

  const selectedCount = pickerSelectedFriends.length;
  const isSingle = selectedCount === 1;
  const singleFriend = isSingle ? pickerSelectedFriends[0] : null;
  const visibleAvatars = pickerSelectedFriends.slice(0, 3);
  const overflowCount = selectedCount > 3 ? selectedCount - 3 : 0;

  const descriptionText = isSingle
    ? `Adding ${singleFriend?.name || "this participant"} exceeds this plan's capacity.`
    : "Adding these participants exceeds this plan's capacity.";

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: '#1C1C1E',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '16px 20px 32px',
          color: '#FFFFFF',
          boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.3)',
          animation: 'slideUp 0.28s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        className="select-none font-sans text-left"
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255, 255, 255, 0.15)' }} />
        </div>

        {/* Personalized Header Section */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ flexShrink: 0 }}>
            {isSingle ? (
              <div className="w-12 h-12 rounded-full border-2 border-white/20 overflow-hidden bg-[#1A1A1A] flex items-center justify-center">
                <UserAvatar src={singleFriend?.avatar} alt={singleFriend?.name || "Participant"} size="w-full h-full" />
              </div>
            ) : (
              <div className="flex items-center -space-x-3 pt-1">
                {visibleAvatars.map((friend, idx) => (
                  <div
                    key={friend.id || idx}
                    className="w-11 h-11 rounded-full border-2 border-[#1C1C1E] bg-[#1A1A1A] overflow-hidden flex items-center justify-center"
                    style={{ zIndex: 3 - idx }}
                  >
                    <UserAvatar src={friend.avatar} alt={friend.name || "Participant"} size="w-full h-full" />
                  </div>
                ))}
                {overflowCount > 0 && (
                  <div className="w-11 h-11 rounded-full border-2 border-[#1C1C1E] bg-[#2A2A2D] flex items-center justify-center text-xs font-bold text-white z-0">
                    +{overflowCount}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em' }}>Plan is Full</span>
            <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', marginTop: 2, lineHeight: 1.4 }}>
              {descriptionText}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Option 1: Increase Plan Size */}
          <button
            type="button"
            onClick={onIncreaseCapacity}
            style={{
              width: '100%',
              padding: '14px 16px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 14,
              color: '#FFFFFF',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-[#FF6B2C]/15 border border-[#FF6B2C]/30 flex items-center justify-center text-[#FF6B2C] flex-shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Increase Plan Size</span>
              <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.45)', marginTop: 1 }}>
                Expand the plan and add them to Going.
              </span>
            </div>
          </button>

          {/* Option 2: Add to Waitlist */}
          <button
            type="button"
            onClick={onInviteToWaitlist}
            style={{
              width: '100%',
              padding: '14px 16px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 14,
              color: '#FFFFFF',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
              <Hourglass className="w-5 h-5" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Add to Waitlist</span>
              <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.45)', marginTop: 1 }}>
                Keep the limit and add them to the Waitlist.
              </span>
            </div>
          </button>

          {/* Cancel Button */}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              padding: '14px',
              background: 'none',
              border: 'none',
              borderRadius: 12,
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'center',
              marginTop: 6,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// 10. MOVE TO GOING CAPACITY BOTTOM SHEET
// ----------------------------------------------------------------------
interface MoveToGoingCapacityBottomSheetProps {
  isOpen: boolean;
  participant: { name: string; avatar?: string } | null;
  onIncreaseCapacity: () => void;
  onSwapParticipant?: () => void;
  onClose: () => void;
}

export const MoveToGoingCapacityBottomSheet: React.FC<MoveToGoingCapacityBottomSheetProps> = ({
  isOpen,
  participant,
  onIncreaseCapacity,
  onSwapParticipant,
  onClose,
}) => {
  if (!isOpen || !participant) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: '#1C1C1E',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '16px 20px 32px',
          color: '#FFFFFF',
          fontFamily: 'Inter, sans-serif',
          boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.3)',
          animation: 'slideUp 0.28s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        className="select-none text-left"
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255, 255, 255, 0.15)' }} />
        </div>

        {/* Personalized Participant Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ flexShrink: 0 }}>
            <div className="w-12 h-12 rounded-full border-2 border-white/20 overflow-hidden bg-[#1A1A1A] flex items-center justify-center">
              <UserAvatar src={participant.avatar} alt={participant.name} size="w-full h-full" />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em' }}>Move to Going</span>
            <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', marginTop: 2, lineHeight: 1.4 }}>
              Choose how you would like to move {participant.name} to Going.
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Action 1: Increase Plan Size */}
          <button
            type="button"
            onClick={onIncreaseCapacity}
            style={{
              width: '100%',
              padding: '14px 16px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 14,
              color: '#FFFFFF',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-[#FF6B2C]/15 border border-[#FF6B2C]/30 flex items-center justify-center text-[#FF6B2C] flex-shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Increase Plan Size</span>
              <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.45)', marginTop: 2 }}>
                Increase the plan capacity by one and move this participant into Going.
              </span>
            </div>
          </button>

          {/* Action 2: Swap Participant */}
          {onSwapParticipant && (
            <button
              type="button"
              onClick={onSwapParticipant}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 14,
                color: '#FFFFFF',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0">
                <ArrowLeftRight className="w-5 h-5" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Swap Participant from Going</span>
                <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.45)', marginTop: 2 }}>
                  Replace an existing Going participant with this participant without changing the plan size.
                </span>
              </div>
            </button>
          )}

          {/* Cancel */}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px',
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'center',
              marginTop: 6,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// 10B. MOVE TO WAITLIST BOTTOM SHEET (Assigned Mode)
// ----------------------------------------------------------------------
interface MoveToWaitlistBottomSheetProps {
  isOpen: boolean;
  participant: { name: string; avatar?: string } | null;
  hasWaitlist: boolean;
  goingCount?: number;
  waitlistCount?: number;
  onDecreaseCapacity: () => void;
  onSwapParticipant?: () => void;
  onCancelPlan?: () => void;
  onClose: () => void;
}

export const MoveToWaitlistBottomSheet: React.FC<MoveToWaitlistBottomSheetProps> = ({
  isOpen,
  participant,
  hasWaitlist: rawHasWaitlist,
  goingCount,
  waitlistCount,
  onDecreaseCapacity,
  onSwapParticipant,
  onCancelPlan,
  onClose,
}) => {
  if (!isOpen || !participant) return null;
  const hasWaitlist = waitlistCount !== undefined ? waitlistCount > 0 : rawHasWaitlist;
  const canDecreaseCapacity = goingCount === undefined || goingCount > 2;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: '#1C1C1E',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '16px 20px 32px',
          color: '#FFFFFF',
          fontFamily: 'Inter, sans-serif',
          boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.3)',
          animation: 'slideUp 0.28s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        className="select-none text-left"
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255, 255, 255, 0.15)' }} />
        </div>

        {/* Personalized Participant Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ flexShrink: 0 }}>
            <div className="w-12 h-12 rounded-full border-2 border-white/20 overflow-hidden bg-[#1A1A1A] flex items-center justify-center">
              <UserAvatar src={participant.avatar} alt={participant.name} size="w-full h-full" />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em' }}>Move to Waitlist</span>
            <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', marginTop: 2, lineHeight: 1.4 }}>
              Choose how you would like to move {participant.name} to the Waitlist.
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Action 1: Decrease Plan Size (Only shown if goingCount > 2) */}
          {canDecreaseCapacity && (
            <button
              type="button"
              onClick={onDecreaseCapacity}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 14,
                color: '#FFFFFF',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div className="w-10 h-10 rounded-xl bg-[#FF6B2C]/15 border border-[#FF6B2C]/30 flex items-center justify-center text-[#FF6B2C] flex-shrink-0">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Decrease Plan Size</span>
                <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.45)', marginTop: 2 }}>
                  Reduce the plan capacity by one and move this participant to the Waitlist.
                </span>
              </div>
            </button>
          )}

          {/* Action 2: Swap with Participant from Waitlist (Only shown if waitlist has participants) */}
          {hasWaitlist && onSwapParticipant && (
            <button
              type="button"
              onClick={onSwapParticipant}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 14,
                color: '#FFFFFF',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0">
                <ArrowLeftRight className="w-5 h-5" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Swap with Participant from Waitlist</span>
                <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.45)', marginTop: 2 }}>
                  Replace this Going participant with someone currently in the Waitlist without changing the plan size.
                </span>
              </div>
            </button>
          )}

          {/* Action: Cancel Plan (Only shown when waitlistCount === 0 AND goingCount === 2) */}
          {!hasWaitlist && (goingCount === 2) && onCancelPlan && (
            <button
              type="button"
              onClick={onCancelPlan}
              style={{
                width: '100%',
                padding: '14px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: 'none',
                borderRadius: 12,
                color: '#EF4444',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Cancel Plan
            </button>
          )}

          {/* Cancel */}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px',
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'center',
              marginTop: 6,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// 10C. REMOVE GOING PARTICIPANT BOTTOM SHEET (Assigned Mode Case 1)
// ----------------------------------------------------------------------
interface RemoveGoingParticipantBottomSheetProps {
  isOpen: boolean;
  participant: { name: string; avatar?: string } | null;
  hasWaitlist: boolean;
  goingCount?: number;
  waitlistCount?: number;
  onDecreaseCapacity: () => void;
  onReplaceParticipant?: () => void;
  onCancelPlan?: () => void;
  onClose: () => void;
}

export const RemoveGoingParticipantBottomSheet: React.FC<RemoveGoingParticipantBottomSheetProps> = ({
  isOpen,
  participant,
  hasWaitlist: rawHasWaitlist,
  goingCount,
  waitlistCount,
  onDecreaseCapacity,
  onReplaceParticipant,
  onCancelPlan,
  onClose,
}) => {
  if (!isOpen || !participant) return null;
  const hasWaitlist = waitlistCount !== undefined ? waitlistCount > 0 : rawHasWaitlist;
  const canDecreaseCapacity = hasWaitlist && (goingCount === undefined || goingCount > 2);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: '#1C1C1E',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '16px 20px 32px',
          color: '#FFFFFF',
          fontFamily: 'Inter, sans-serif',
          boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.3)',
          animation: 'slideUp 0.28s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        className="select-none text-left"
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255, 255, 255, 0.15)' }} />
        </div>

        {/* Personalized Participant Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ flexShrink: 0 }}>
            <div className="w-12 h-12 rounded-full border-2 border-white/20 overflow-hidden bg-[#1A1A1A] flex items-center justify-center">
              <UserAvatar src={participant.avatar} alt={participant.name} size="w-full h-full" />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em' }}>Remove Participant</span>
            <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', marginTop: 2, lineHeight: 1.4 }}>
              {!hasWaitlist ? 'Removing them will cancel the plan.' : 'How would you like to handle this Going spot?'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Action 1: Decrease Plan Size (Only shown if goingCount > 2) */}
          {canDecreaseCapacity && (
            <button
              type="button"
              onClick={onDecreaseCapacity}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 14,
                color: '#FFFFFF',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 flex-shrink-0">
                <UserMinus className="w-5 h-5" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Decrease Plan Size</span>
                <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.45)', marginTop: 2 }}>
                  This participant will be removed from the plan and the maximum plan size will decrease by one.
                </span>
              </div>
            </button>
          )}

          {/* Action 2: Replace with Participant from Waitlist (Only shown if waitlist has participants) */}
          {hasWaitlist && onReplaceParticipant && (
            <button
              type="button"
              onClick={onReplaceParticipant}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 14,
                color: '#FFFFFF',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0">
                <ArrowLeftRight className="w-5 h-5" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Replace with Participant from Waitlist</span>
                <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.45)', marginTop: 2 }}>
                  Select a participant from the Waitlist to immediately fill this Going spot without changing plan size.
                </span>
              </div>
            </button>
          )}

          {/* Action: Cancel Plan (Only shown when waitlistCount === 0) */}
          {!hasWaitlist && onCancelPlan && (
            <button
              type="button"
              onClick={onCancelPlan}
              style={{
                width: '100%',
                padding: '14px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: 'none',
                borderRadius: 12,
                color: '#EF4444',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Cancel Plan
            </button>
          )}

          {/* Cancel */}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px',
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'center',
              marginTop: 6,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// ----------------------------------------------------------------------
// 11. SWITCH TO AUTOMATIC SELECTION BOTTOM SHEET (Case 1)
// ------------------------------------------------------------------------------
interface SwitchToAutomaticSelectionBottomSheetProps {
  isOpen: boolean;
  vacantSpots: number;
  eligibleWaitlist: any[];
  onConfirm: (selectedUserIds: string[]) => Promise<void> | void;
  onClose: () => void;
}

export const SwitchToAutomaticSelectionBottomSheet: React.FC<SwitchToAutomaticSelectionBottomSheetProps> = ({
  isOpen,
  vacantSpots,
  eligibleWaitlist,
  onConfirm,
  onClose,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedIds([]);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(i => i !== id);
      }
      if (prev.length >= vacantSpots) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const isReady = selectedIds.length === vacantSpots;

  const handleConfirm = async () => {
    if (!isReady || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm(selectedIds);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '85vh',
          background: '#1C1C1E',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '16px 20px 32px',
          color: '#FFFFFF',
          fontFamily: 'Inter, sans-serif',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255, 255, 255, 0.2)', margin: '0 auto 16px' }} />

        <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px', textAlign: 'center' }}>
          Fill Available GOING Spots
        </h3>

        <p style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', margin: '0 0 16px', lineHeight: 1.4 }}>
          Automatic mode requires all available spots to be filled. Select <span style={{ color: '#FF6B2C', fontWeight: 600 }}>exactly {vacantSpots} participant{vacantSpots > 1 ? 's' : ''}</span> to move into GOING.
        </p>

        {/* Participant Selection List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {eligibleWaitlist.map((friend) => {
            const fId = friend.dbUuid || friend.id;
            const isSelected = selectedIds.includes(fId);
            return (
              <div
                key={fId}
                onClick={() => toggleSelect(fId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: 14,
                  background: isSelected ? 'rgba(255, 107, 44, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                  border: isSelected ? '1px solid #FF6B2C' : '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="w-9 h-9 rounded-full overflow-hidden border border-white/10 flex-shrink-0 flex items-center justify-center bg-[#1A1A1A]">
                    <UserAvatar
                      src={friend.avatar}
                      alt={friend.name}
                      size="w-full h-full"
                    />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>{friend.name}</span>
                </div>

                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    border: isSelected ? 'none' : '2px solid rgba(255, 255, 255, 0.3)',
                    background: isSelected ? '#FF6B2C' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isSelected && <span style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 800 }}>✓</span>}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!isReady || isSubmitting}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 14,
            background: isReady ? '#FF6B2C' : 'rgba(255, 255, 255, 0.1)',
            color: isReady ? '#FFFFFF' : 'rgba(255, 255, 255, 0.3)',
            fontSize: 14,
            fontWeight: 700,
            cursor: isReady ? 'pointer' : 'not-allowed',
            border: 'none',
            transition: 'all 0.2s ease',
          }}
        >
          {isSubmitting ? 'Switching...' : `Confirm & Switch (${selectedIds.length}/${vacantSpots})`}
        </button>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            padding: '12px',
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.4)',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            marginTop: 6,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// 12. SWITCH TO AUTOMATIC WARNING BOTTOM SHEET (Case 2)
// ----------------------------------------------------------------------
interface SwitchToAutomaticWarningBottomSheetProps {
  isOpen: boolean;
  onReducePlanSize?: () => void;
  onClose: () => void;
}

export const SwitchToAutomaticWarningBottomSheet: React.FC<SwitchToAutomaticWarningBottomSheetProps> = ({
  isOpen,
  onReducePlanSize,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: '#1C1C1E',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '16px 20px 32px',
          color: '#FFFFFF',
          fontFamily: 'Inter, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255, 255, 255, 0.2)', margin: '0 auto 16px' }} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, marginBottom: 24 }}>
          <div className="w-12 h-12 rounded-2xl bg-[#FF6B2C]/15 border border-[#FF6B2C]/30 flex items-center justify-center text-[#FF6B2C]">
            <AlertCircle className="w-6 h-6" />
          </div>

          <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            Cannot Switch to Automatic
          </h3>

          <p style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.5)', margin: 0, lineHeight: 1.5, maxWidth: 320 }}>
            There aren't enough participants who have joined the waitlist to fill the available GOING spots. Ask more participants to join the waitlist or reduce the plan size before switching to Automatic.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {onReducePlanSize && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onReducePlanSize();
              }}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 14,
                background: '#FF6B2C',
                color: '#FFFFFF',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
              }}
            >
              Reduce Plan Size
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 14,
              background: 'rgba(255, 255, 255, 0.08)',
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid rgba(255, 255, 255, 0.12)',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// 13. GUIDED CAPACITY ADJUSTMENT BOTTOM SHEET (Assigned Mode)
// ----------------------------------------------------------------------
interface GuidedCapacityAdjustmentBottomSheetProps {
  isOpen: boolean;
  mode: 'promote' | 'demote';
  requiredCount: number;
  candidates: any[];
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  onConfirm: (selectedUserIds: string[]) => Promise<void> | void;
  onClose: () => void;
}

export const GuidedCapacityAdjustmentBottomSheet: React.FC<GuidedCapacityAdjustmentBottomSheetProps> = ({
  isOpen,
  mode,
  requiredCount,
  candidates,
  title: customTitle,
  subtitle: customSubtitle,
  ctaLabel: customCtaLabel,
  onConfirm,
  onClose,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedIds([]);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(i => i !== id);
      }
      if (prev.length >= requiredCount) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const isReady = selectedIds.length === requiredCount;
  const remainingNeeded = requiredCount - selectedIds.length;

  const handleConfirm = async () => {
    if (!isReady || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm(selectedIds);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = customTitle || (mode === 'promote' ? 'Who should move to Going?' : 'Move to Waitlist');
  const subtitle = customSubtitle || (mode === 'promote'
    ? 'Select the participant(s) to promote from the waitlist.'
    : 'Select who should move to the waitlist.');

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '85vh',
          background: '#1C1C1E',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '14px 20px 24px',
          color: '#FFFFFF',
          fontFamily: 'Inter, sans-serif',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255, 255, 255, 0.2)', margin: '0 auto 12px' }} />

        <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', textAlign: 'center' }}>
          {title}
        </h3>

        <p style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', margin: '0 0 14px', lineHeight: 1.4 }}>
          {subtitle}
        </p>

        {/* Candidate Selection List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, maxHeight: '45vh' }}>
          {candidates.map((friend) => {
            const fId = friend.dbUuid || friend.id;
            const isSelected = selectedIds.includes(fId);
            return (
              <div
                key={fId}
                onClick={() => toggleSelect(fId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 14,
                  background: isSelected ? 'rgba(18, 18, 18, 0.9)' : 'rgba(255, 255, 255, 0.04)',
                  border: isSelected ? '1px solid rgba(255, 107, 44, 0.6)' : '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 flex-shrink-0 flex items-center justify-center bg-[#1A1A1A]">
                    <UserAvatar
                      src={friend.avatar}
                      alt={friend.name}
                      size="w-full h-full"
                    />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>{friend.name}</span>
                </div>

                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    border: isSelected ? 'none' : '1.5px solid rgba(255, 255, 255, 0.25)',
                    background: isSelected ? '#FF6B2C' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isSelected && <span style={{ color: '#FFFFFF', fontSize: 11, fontWeight: 800 }}>✓</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic Selection Count Label */}
        <div style={{ textAlign: 'center', marginBottom: 8, fontSize: 12, color: 'rgba(255, 255, 255, 0.45)', fontWeight: 500 }}>
          {selectedIds.length} {selectedIds.length === 1 ? 'participant' : 'participants'} selected
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!isReady || isSubmitting}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 14,
            background: isReady ? '#FF6B2C' : 'rgba(255, 255, 255, 0.1)',
            color: isReady ? '#FFFFFF' : 'rgba(255, 255, 255, 0.3)',
            fontSize: 14,
            fontWeight: 700,
            cursor: isReady && !isSubmitting ? 'pointer' : 'not-allowed',
            border: 'none',
            transition: 'all 0.15s ease',
          }}
        >
          {isSubmitting
            ? 'Updating...'
            : isReady
            ? (customCtaLabel || (mode === 'demote' ? 'Move to Waitlist' : mode === 'promote' ? 'Move to Going' : 'Continue'))
            : `Select ${remainingNeeded} more participant${remainingNeeded > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
};

