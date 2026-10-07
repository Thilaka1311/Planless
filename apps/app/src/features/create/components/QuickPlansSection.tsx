import React, { useState } from "react";
import { Zap, Plus, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { QuickPlan } from "../../../core/types";
import { QuickPlanCard } from "./QuickPlanCard";

interface QuickPlansSectionProps {
  quickPlans: QuickPlan[];
  onSelectQuickPlan: (plan: QuickPlan) => void;
  onAddQuickPlan: () => void;
  onDeleteQuickPlan?: (planId: string) => Promise<void> | void;
}

export const QuickPlansSection: React.FC<QuickPlansSectionProps> = ({
  quickPlans,
  onSelectQuickPlan,
  onAddQuickPlan,
  onDeleteQuickPlan,
}) => {
  const [planToDelete, setPlanToDelete] = useState<QuickPlan | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!planToDelete || !onDeleteQuickPlan) return;
    setIsDeleting(true);
    try {
      await onDeleteQuickPlan(planToDelete.id);
      setPlanToDelete(null);
    } catch (err) {
      console.error("[QuickPlansSection] Failed deleting plan:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="px-5 pt-3 pb-4 shrink-0 text-left select-none">
      {/* ── Section Header ── */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[#FF6B2C]/10 border border-[#FF6B2C]/30 flex items-center justify-center text-[#FF6B2C]">
            <Zap className="w-3 h-3 fill-[#FF6B2C]" />
          </div>
          <h3 className="text-xs font-bold text-white tracking-wider uppercase font-sans">
            Quick Plans
          </h3>
        </div>

        {quickPlans.length > 0 && (
          <button
            type="button"
            onClick={onAddQuickPlan}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#FF6B2C] hover:text-[#FF854C] transition cursor-pointer active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Quick Plan</span>
          </button>
        )}
      </div>

      {/* ── Content: Empty State vs Horizontal Scroll Rail ── */}
      {quickPlans.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#121216]/90 p-4 flex items-center justify-between gap-3 shadow-sm">
          <div className="space-y-1 min-w-0 flex-1">
            <h4 className="text-xs font-bold text-white tracking-tight">
              Create your first Quick Plan
            </h4>
            <p className="text-[11px] text-zinc-400 font-normal leading-snug">
              Save a favorite setup (turf, dining, friends) to launch it anytime in 1-tap.
            </p>
          </div>
          <button
            type="button"
            onClick={onAddQuickPlan}
            className="shrink-0 px-3.5 py-2 rounded-xl bg-[#FF6B2C] hover:bg-[#FF854C] text-white font-sans font-bold text-[12px] flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto no-scrollbar scroll-smooth pb-1 pt-0.5">
          {quickPlans.map((plan) => (
            <QuickPlanCard
              key={plan.id}
              plan={plan}
              style={{ minWidth: "220px", width: "220px", maxWidth: "220px", height: "142px" }}
              className="shrink-0"
              onTap={() => onSelectQuickPlan(plan)}
              onLongPress={() => setPlanToDelete(plan)}
              onMenuPress={() => setPlanToDelete(plan)}
            />
          ))}

          {/* "+ Add Quick Plan" Action Card at end of rail */}
          <button
            type="button"
            onClick={onAddQuickPlan}
            style={{ minWidth: "140px", width: "140px", height: "142px" }}
            className="shrink-0 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.05] hover:border-[#FF6B2C]/40 flex flex-col items-center justify-center p-3 cursor-pointer text-center group active:scale-[0.98] transition-all"
          >
            <div className="w-9 h-9 rounded-full bg-[#FF6B2C]/10 border border-[#FF6B2C]/30 flex items-center justify-center text-[#FF6B2C] group-hover:scale-110 transition-transform mb-1.5">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-semibold text-white/90 group-hover:text-white">
              Add Quick Plan
            </span>
            <span className="text-[9.5px] text-zinc-500 mt-0.5">
              Save new setup
            </span>
          </button>
        </div>
      )}

      {/* ── Delete Action Confirmation Bottom Sheet ── */}
      <AnimatePresence>
        {planToDelete && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeleting && setPlanToDelete(null)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />

            {/* Sheet modal */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 280 }}
              className="relative w-full max-w-md bg-[#121216] border-t border-white/10 rounded-t-3xl p-5 pb-8 shadow-2xl z-10 space-y-4"
            >
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-2" />

              <div className="space-y-1 text-center">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Delete Quick Plan?
                </h3>
                <p className="text-xs text-zinc-400">
                  Are you sure you want to remove &ldquo;{planToDelete.name}&rdquo;?
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={confirmDelete}
                  className="w-full py-3 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeleting ? "Deleting…" : "Delete Quick Plan"}</span>
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setPlanToDelete(null)}
                  className="w-full py-3 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 font-semibold text-sm cursor-pointer active:scale-[0.98] transition"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
};

