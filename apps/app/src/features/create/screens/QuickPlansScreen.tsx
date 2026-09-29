import React, { useState } from "react";
import { ArrowLeft, Plus, Zap, Trash2, MoreVertical, Edit2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { QuickPlan, QuickPlanList } from "../../../core/types";
import { useQuickPlans } from "../hooks/useQuickPlans";
import { QuickPlanCard } from "../components/QuickPlanCard";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { useLongPress } from "../../../shared/hooks/useLongPress";

export interface QuickPlansScreenProps {
  userId?: string;
  onBack: () => void;
  onSelectQuickPlan: (plan: QuickPlan) => void;
  onAddQuickPlan: (listId?: string) => void;
}

const LIST_NAME_SUGGESTIONS = ["Football", "Movies", "Dining", "Weekend", "College Friends", "Work"];

interface ListCoverInfo {
  src: string | null;
  category?: string;
  subcategory?: string | null;
}

function resolveListCover(list: QuickPlanList, allPlans: QuickPlan[]): ListCoverInfo {
  const childPlans = allPlans.filter((p) => p.quick_plan_list_id === list.id);

  // 1. Prefer a child plan with an explicit cover image
  const planWithCover = childPlans.find(
    (p) => p.cover_image && typeof p.cover_image === "string" && p.cover_image.trim().length > 0
  );
  if (planWithCover) {
    return {
      src: planWithCover.cover_image,
      category: planWithCover.category,
      subcategory: planWithCover.subcategory,
    };
  }

  // 2. If list has plans but none has an explicit cover_image, use first plan's category/subcategory
  if (childPlans.length > 0) {
    return {
      src: null,
      category: childPlans[0].category,
      subcategory: childPlans[0].subcategory,
    };
  }

  // 3. If list has 0 plans, use list name as category hint (e.g. Football -> sports, Dining -> dining, Movies -> movie)
  return {
    src: null,
    category: list.name,
    subcategory: null,
  };
}

export const QuickPlansScreen: React.FC<QuickPlansScreenProps> = ({
  userId,
  onBack,
  onSelectQuickPlan,
  onAddQuickPlan,
}) => {
  const {
    quickPlans,
    quickPlanLists,
    deleteQuickPlan,
    createList,
    updateList,
    deleteList,
  } = useQuickPlans(userId);

  // Navigation state within Quick Plans screen
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  // Create List state
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [isCreatingList, setIsCreatingList] = useState(false);

  // List Context Menu / Rename / Delete states
  const [listMenuTarget, setListMenuTarget] = useState<QuickPlanList | null>(null);
  const [listToEdit, setListToEdit] = useState<QuickPlanList | null>(null);
  const [editListName, setEditListName] = useState("");
  const [isUpdatingList, setIsUpdatingList] = useState(false);
  const [listToDelete, setListToDelete] = useState<QuickPlanList | null>(null);
  const [isDeletingList, setIsDeletingList] = useState(false);

  // Plan Delete state
  const [planToDelete, setPlanToDelete] = useState<QuickPlan | null>(null);
  const [isDeletingPlan, setIsDeletingPlan] = useState(false);

  const selectedList = selectedListId
    ? quickPlanLists.find((l) => l.id === selectedListId) || null
    : null;

  // If a list was selected but deleted or not found, fall back to list-first view
  const activeList = selectedListId ? selectedList : null;

  const plansInCurrentList = activeList
    ? quickPlans.filter((p) => p.quick_plan_list_id === activeList.id)
    : [];

  const headerLongPress = useLongPress(() => {
    if (activeList) {
      setListMenuTarget(activeList);
    }
  }, { threshold: 450 });

  const handleCreateListSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newListName.trim();
    if (!trimmed || !userId || isCreatingList) return;

    setIsCreatingList(true);
    try {
      const created = await createList({
        creator_id: userId,
        name: trimmed,
      });
      setNewListName("");
      setIsCreateListOpen(false);
      // Automatically navigate into the newly created list
      if (created?.id) {
        setSelectedListId(created.id);
      }
    } catch (err) {
      console.error("[QuickPlansScreen] Failed creating list:", err);
    } finally {
      setIsCreatingList(false);
    }
  };

  const handleUpdateListSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!listToEdit || !editListName.trim() || isUpdatingList) return;

    setIsUpdatingList(true);
    try {
      await updateList(listToEdit.id, { name: editListName.trim() });
      setListToEdit(null);
      setEditListName("");
    } catch (err) {
      console.error("[QuickPlansScreen] Failed updating list:", err);
    } finally {
      setIsUpdatingList(false);
    }
  };

  const confirmDeleteList = async () => {
    if (!listToDelete || !deleteList) return;
    setIsDeletingList(true);
    try {
      await deleteList(listToDelete.id);
      if (selectedListId === listToDelete.id) {
        setSelectedListId(null);
      }
      setListToDelete(null);
    } catch (err) {
      console.error("[QuickPlansScreen] Failed deleting list:", err);
    } finally {
      setIsDeletingList(false);
    }
  };

  const confirmDeletePlan = async () => {
    if (!planToDelete || !deleteQuickPlan) return;
    setIsDeletingPlan(true);
    try {
      await deleteQuickPlan(planToDelete.id);
      setPlanToDelete(null);
    } catch (err) {
      console.error("[QuickPlansScreen] Failed deleting plan:", err);
    } finally {
      setIsDeletingPlan(false);
    }
  };

  return (
    <div
      className="flex-1 flex flex-col h-full bg-[#000000] text-left select-none overflow-y-auto no-scrollbar pb-24"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* ── TOP HEADER ── */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => {
              if (activeList) {
                // Pop list detail back to list-first view
                setSelectedListId(null);
              } else {
                // Pop out of Quick Plans screen back to Discovery
                onBack();
              }
            }}
            className="p-1 -ml-1 text-white hover:text-zinc-300 active:scale-95 transition flex items-center justify-center cursor-pointer shrink-0"
            aria-label={activeList ? "Back to lists" : "Back to Discovery"}
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>

          <h2
            {...(activeList ? headerLongPress : {})}
            className="text-lg font-bold text-white tracking-tight font-sans truncate cursor-pointer select-none"
            title={activeList ? "Hold to manage list" : undefined}
          >
            {activeList ? activeList.name : "Quick Plans"}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => {
            if (activeList) {
              onAddQuickPlan(activeList.id);
            } else {
              setIsCreateListOpen(true);
            }
          }}
          className="p-1 -mr-1 text-white hover:text-zinc-300 active:scale-95 transition flex items-center justify-center cursor-pointer shrink-0"
          aria-label={activeList ? "Add Quick Plan" : "Create List"}
        >
          <Plus className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* ── SCREEN VIEW: LIST DETAIL OR TOP-LEVEL LISTS ── */}
      {activeList ? (
        /* ================= LIST DETAIL SCREEN ================= */
        plansInCurrentList.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FF6B2C]/10 border border-[#FF6B2C]/30 flex items-center justify-center text-[#FF6B2C] shadow-lg shadow-[#FF6B2C]/10">
              <Zap className="w-7 h-7 fill-[#FF6B2C]" />
            </div>
            <div className="space-y-1.5 max-w-xs">
              <h3 className="text-base font-bold text-white tracking-tight font-sans">
                No Quick Plans in this list yet.
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                Save a favorite setup (place, category, and squad) to spin up plans in 1 tap without filling in details every time.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onAddQuickPlan(activeList.id)}
              className="mt-3 px-5 py-2.5 rounded-xl bg-[#FF6B2C] hover:bg-[#FF854C] active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-[#FF6B2C]/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Quick Plan</span>
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-x-3.5 gap-y-5">
              {plansInCurrentList.map((plan) => (
                <QuickPlanCard
                  key={plan.id}
                  plan={plan}
                  variant="collection"
                  onTap={() => onSelectQuickPlan(plan)}
                  onLongPress={() => setPlanToDelete(plan)}
                  onMenuPress={() => setPlanToDelete(plan)}
                />
              ))}
            </div>
          </div>
        )
      ) : (
        /* ================= TOP-LEVEL LIST-FIRST SCREEN ================= */
        quickPlanLists.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FF6B2C]/10 border border-[#FF6B2C]/30 flex items-center justify-center text-[#FF6B2C] shadow-lg shadow-[#FF6B2C]/10">
              <Zap className="w-7 h-7 fill-[#FF6B2C]" />
            </div>
            <div className="space-y-1.5 max-w-xs">
              <h3 className="text-base font-bold text-white tracking-tight font-sans">
                No Quick Plan lists yet.
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                Organize your quick plans into lists like Football, Movies, or Dining.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateListOpen(true)}
              className="mt-3 px-5 py-2.5 rounded-xl bg-[#FF6B2C] hover:bg-[#FF854C] active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-[#FF6B2C]/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create List</span>
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-x-3.5 gap-y-5">
              {quickPlanLists.map((list) => {
                const count =
                  list.quick_plans_count !== undefined
                    ? list.quick_plans_count
                    : quickPlans.filter((p) => p.quick_plan_list_id === list.id).length;
                const cover = resolveListCover(list, quickPlans);

                return (
                  <div
                    key={list.id}
                    onClick={() => setSelectedListId(list.id)}
                    className="flex flex-col cursor-pointer group text-left select-none"
                  >
                    {/* Cover Image Container */}
                    <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden bg-[#121216] border border-white/[0.08] group-hover:border-white/20 transition-all shadow-md group-active:scale-[0.98]">
                      <DiscoveryImages
                        src={cover.src}
                        category={cover.category}
                        subcategory={cover.subcategory}
                        alt={list.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />

                      {/* 3-dots Menu Button */}
                      <div className="absolute top-2 right-2 z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setListMenuTarget(list);
                          }}
                          className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-black/80 active:scale-95 transition shadow-sm cursor-pointer"
                          aria-label="List options"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Title & Metadata underneath */}
                    <div className="mt-2 min-w-0 px-0.5">
                      <h3 className="text-sm font-semibold text-white tracking-tight truncate font-sans group-hover:text-[#FF6B2C] transition-colors">
                        {list.name}
                      </h3>
                      <p className="text-xs text-zinc-400 font-medium truncate mt-0.5 font-sans">
                        {`${count} ${count === 1 ? "plan" : "plans"}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* ── CREATE LIST MODAL SHEET ── */}
      <AnimatePresence>
        {isCreateListOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isCreatingList && setIsCreateListOpen(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
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
                  Create Quick Plan List
                </h3>
                <p className="text-xs text-zinc-400">
                  Group your setups into a dedicated list
                </p>
              </div>

              <form onSubmit={handleCreateListSubmit} className="space-y-4 pt-1">
                <div>
                  <label htmlFor="new-list-name-input" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    List Name
                  </label>
                  <input
                    id="new-list-name-input"
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="e.g. Football, Movies, Dining"
                    autoFocus
                    maxLength={50}
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-[#FF6B2C] transition"
                  />
                </div>

                {/* Suggestions */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-zinc-400">
                    Suggestions:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {LIST_NAME_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setNewListName(suggestion)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition cursor-pointer ${
                          newListName === suggestion
                            ? "bg-[#FF6B2C]/20 border-[#FF6B2C] text-[#FF6B2C] font-semibold"
                            : "bg-white/[0.04] border-white/10 text-zinc-300 hover:border-white/25"
                        }`}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    type="submit"
                    disabled={!newListName.trim() || isCreatingList}
                    className="w-full py-3 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition shadow-lg shadow-[#FF6B2C]/20"
                  >
                    <span>{isCreatingList ? "Creating…" : "Create List"}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isCreatingList}
                    onClick={() => {
                      setIsCreateListOpen(false);
                      setNewListName("");
                    }}
                    className="w-full py-3 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 font-semibold text-sm cursor-pointer active:scale-[0.98] transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── LIST MENU ACTION SHEET ── */}
      <AnimatePresence>
        {listMenuTarget && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setListMenuTarget(null)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 280 }}
              className="relative w-full max-w-md bg-[#121216] border-t border-white/10 rounded-t-3xl p-5 pb-8 shadow-2xl z-10 space-y-3"
            >
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-2" />

              <div className="space-y-0.5 text-center">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  {listMenuTarget.name}
                </h3>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = listMenuTarget;
                    setListMenuTarget(null);
                    setEditListName(target.name);
                    setListToEdit(target);
                  }}
                  className="w-full py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition border border-white/5"
                >
                  <Edit2 className="w-4 h-4 text-zinc-400" />
                  <span>Rename List</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const target = listMenuTarget;
                    setListMenuTarget(null);
                    setListToDelete(target);
                  }}
                  className="w-full py-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete List</span>
                </button>

                <button
                  type="button"
                  onClick={() => setListMenuTarget(null)}
                  className="w-full py-2.5 rounded-full bg-transparent text-zinc-400 font-medium text-xs cursor-pointer active:scale-[0.98] transition"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── EDIT / RENAME LIST MODAL SHEET ── */}
      <AnimatePresence>
        {listToEdit && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isUpdatingList && setListToEdit(null)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
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
                  Rename List
                </h3>
              </div>

              <form onSubmit={handleUpdateListSubmit} className="space-y-4 pt-1">
                <div>
                  <label htmlFor="edit-list-name-input" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    List Name
                  </label>
                  <input
                    id="edit-list-name-input"
                    type="text"
                    value={editListName}
                    onChange={(e) => setEditListName(e.target.value)}
                    autoFocus
                    maxLength={50}
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-[#FF6B2C] transition"
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    type="submit"
                    disabled={!editListName.trim() || isUpdatingList}
                    className="w-full py-3 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition shadow-lg shadow-[#FF6B2C]/20"
                  >
                    <span>{isUpdatingList ? "Saving…" : "Save Changes"}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isUpdatingList}
                    onClick={() => setListToEdit(null)}
                    className="w-full py-3 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 font-semibold text-sm cursor-pointer active:scale-[0.98] transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── DELETE LIST MODAL SHEET ── */}
      <AnimatePresence>
        {listToDelete && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeletingList && setListToDelete(null)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
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
                  Delete List?
                </h3>
                <p className="text-xs text-zinc-400">
                  Are you sure you want to delete &ldquo;{listToDelete.name}&rdquo;? All quick plans inside this list will also be removed.
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  disabled={isDeletingList}
                  onClick={confirmDeleteList}
                  className="w-full py-3 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeletingList ? "Deleting…" : "Delete List"}</span>
                </button>
                <button
                  type="button"
                  disabled={isDeletingList}
                  onClick={() => setListToDelete(null)}
                  className="w-full py-3 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 font-semibold text-sm cursor-pointer active:scale-[0.98] transition"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── DELETE PLAN MODAL SHEET ── */}
      <AnimatePresence>
        {planToDelete && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeletingPlan && setPlanToDelete(null)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
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
                  disabled={isDeletingPlan}
                  onClick={confirmDeletePlan}
                  className="w-full py-3 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeletingPlan ? "Deleting…" : "Delete Quick Plan"}</span>
                </button>
                <button
                  type="button"
                  disabled={isDeletingPlan}
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
    </div>
  );
};
