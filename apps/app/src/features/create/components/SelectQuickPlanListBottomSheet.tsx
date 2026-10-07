import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Zap, Plus, FolderPlus, ArrowLeft, Check } from "lucide-react";
import { QuickPlanList, QuickPlan } from "../../../core/types";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";

export interface SelectQuickPlanListBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  quickPlanLists: QuickPlanList[];
  allQuickPlans?: QuickPlan[];
  onSelectList: (listId: string | null) => void;
  onCreateAndSelectList: (listName: string) => Promise<void> | void;
  isSaving?: boolean;
}

const LIST_NAME_SUGGESTIONS = ["Football", "Movies", "Dining", "Weekend", "College Friends", "Work"];

export const SelectQuickPlanListBottomSheet: React.FC<SelectQuickPlanListBottomSheetProps> = ({
  isOpen,
  onClose,
  quickPlanLists,
  allQuickPlans = [],
  onSelectList,
  onCreateAndSelectList,
  isSaving = false,
}) => {
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newListName, setNewListName] = useState("");

  const handleReset = () => {
    setIsCreatingNew(false);
    setNewListName("");
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleCreateSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newListName.trim();
    if (!trimmed || isSaving) return;
    await onCreateAndSelectList(trimmed);
    handleReset();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/70 z-60 pointer-events-auto"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed bottom-0 left-0 right-0 z-[65] pointer-events-auto text-left max-h-[85vh] flex flex-col"
            style={{
              background: "#1C1C1E",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-3">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="px-5 pb-3 flex items-center justify-between border-b border-white/[0.08]">
              <div className="flex items-center gap-2 min-w-0">
                {isCreatingNew && (
                  <button
                    type="button"
                    onClick={() => setIsCreatingNew(false)}
                    className="p-1 -ml-1 text-zinc-400 hover:text-white transition cursor-pointer"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <div>
                  <h3 className="font-sans font-bold text-[17px] text-white tracking-tight">
                    {isCreatingNew ? "Create New List" : "Add to Quick Plan"}
                  </h3>
                  <p className="font-sans text-[12px] text-zinc-400 mt-0.5">
                    {isCreatingNew
                      ? "Create a list to organize your quick plans"
                      : "Choose a list destination"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 overflow-y-auto no-scrollbar space-y-3">
              {isCreatingNew ? (
                <form onSubmit={handleCreateSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider font-sans">
                      List Name
                    </label>
                    <input
                      type="text"
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      placeholder="e.g. Football, Movies, Dining"
                      autoFocus
                      maxLength={40}
                      className="w-full bg-[#121216] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-[#FF6B2C] transition font-sans"
                    />
                  </div>

                  {/* Suggestions */}
                  <div>
                    <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider font-sans">
                      Suggestions:
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {LIST_NAME_SUGGESTIONS.map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => setNewListName(sug)}
                          className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] active:bg-white/[0.15] border border-white/[0.06] text-xs text-zinc-300 transition font-sans cursor-pointer"
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCreatingNew(false)}
                      className="flex-1 py-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white font-semibold text-xs transition cursor-pointer font-sans"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newListName.trim() || isSaving}
                      className="flex-1 py-3 rounded-xl bg-[#FF6B2C] hover:bg-[#FF854C] active:scale-95 text-white font-bold text-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF6B2C]/20 font-sans"
                    >
                      {isSaving ? "Saving…" : "Create & Add"}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {/* Default / Uncategorized destination */}
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => onSelectList(null)}
                    className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/[0.06] transition text-left cursor-pointer group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#FF6B2C]/15 border border-[#FF6B2C]/30 flex items-center justify-center text-[#FF6B2C] shrink-0 group-hover:scale-105 transition-transform">
                      <Zap className="w-5 h-5 fill-[#FF6B2C]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-white tracking-tight font-sans">
                        Quick Plans (Default)
                      </h4>
                      <p className="text-xs text-zinc-400 font-sans">
                        Save directly to all quick plans
                      </p>
                    </div>
                  </button>

                  {/* List of Custom Lists */}
                  {quickPlanLists.map((list) => {
                    const count =
                      list.quick_plans_count !== undefined
                        ? list.quick_plans_count
                        : allQuickPlans.filter((p) => p.quick_plan_list_id === list.id).length;

                    return (
                      <button
                        key={list.id}
                        type="button"
                        disabled={isSaving}
                        onClick={() => onSelectList(list.id)}
                        className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/[0.06] transition text-left cursor-pointer group"
                      >
                        <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-300 shrink-0 overflow-hidden">
                          <FolderPlus className="w-5 h-5 text-zinc-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-white tracking-tight truncate font-sans group-hover:text-[#FF6B2C] transition-colors">
                            {list.name}
                          </h4>
                          <p className="text-xs text-zinc-400 font-sans">
                            {`${count} ${count === 1 ? "plan" : "plans"}`}
                          </p>
                        </div>
                      </button>
                    );
                  })}

                  {/* Create New List Button */}
                  <button
                    type="button"
                    onClick={() => setIsCreatingNew(true)}
                    className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl border border-dashed border-white/20 hover:border-white/40 hover:bg-white/[0.03] text-zinc-300 hover:text-white transition text-xs font-semibold font-sans cursor-pointer mt-2"
                  >
                    <Plus className="w-4 h-4 text-[#FF6B2C]" />
                    <span>Create new list</span>
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
