import React, { useState } from "react";
import { ArrowLeft, Plus, Zap, Trash2, Edit2 } from "lucide-react";
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

interface QuickPlanListCardProps {
  list: QuickPlanList;
  count: number;
  cover: ListCoverInfo;
  onTap: () => void;
  onLongPress: () => void;
}

const QuickPlanListCard: React.FC<QuickPlanListCardProps> = ({
  list,
  count,
  cover,
  onTap,
  onLongPress,
}) => {
  const longPress = useLongPress(onLongPress, {
    threshold: 450,
    onTap,
  });

  return (
    <div
      {...longPress}
      className="flex flex-col cursor-pointer group text-left select-none"
    >
      {/* Cover Image Container — clean, image-focused, no three-dot menu */}
      <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden bg-[#121216] border border-white/[0.08] group-hover:border-white/20 transition-all shadow-md group-active:scale-[0.98]">
        <DiscoveryImages
          src={cover.src}
          category={cover.category}
          subcategory={cover.subcategory}
          alt={list.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 select-none pointer-events-none"
        />
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
};

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
      className="flex-1 flex flex-col h-full bg-[#000000] text-left select-none overflow-y-auto no-scrollbar pb-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
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
            onClick={() => {
              if (activeList) {
                setListMenuTarget(activeList);
              }
            }}
            className="text-lg font-bold text-white tracking-tight font-sans truncate cursor-pointer select-none"
            title={activeList ? "Tap or hold to manage list" : undefined}
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
                  <QuickPlanListCard
                    key={list.id}
                    list={list}
                    count={count}
                    cover={cover}
                    onTap={() => setSelectedListId(list.id)}
                    onLongPress={() => setListMenuTarget(list)}
                  />
                );
              })}
            </div>
          </div>
        )
      )}

      {/* ── CREATE LIST BOTTOM SHEET ── */}
      <AnimatePresence>
        {isCreateListOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isCreatingList && setIsCreateListOpen(false)}
              className="fixed inset-0 bg-black/70 z-60 pointer-events-auto"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed bottom-0 left-0 right-0 z-[65] pointer-events-auto w-full"
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
                <h2 className="text-[18px] font-bold text-white mb-1 font-sans">
                  Create Quick Plan List
                </h2>
                <p className="text-[13px] text-zinc-400 font-sans">
                  Group your setups into a dedicated list
                </p>
              </div>

              <form onSubmit={handleCreateListSubmit} className="px-4 pt-2 space-y-4">
                <div>
                  <input
                    id="new-list-name-input"
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="e.g. Football, Movies, Dining"
                    autoFocus
                    maxLength={50}
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-white/25 transition font-sans"
                  />
                </div>

                {/* Suggestions */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-zinc-400 font-sans">
                    Suggestions:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {LIST_NAME_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setNewListName(suggestion)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition cursor-pointer font-sans ${
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

                <div className="flex flex-col gap-2.5 pt-1">
                  <button
                    type="submit"
                    disabled={!newListName.trim() || isCreatingList}
                    style={{
                      width: "100%",
                      height: 48,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(255, 255, 255, 0.12)",
                      border: "1px solid rgba(255, 255, 255, 0.18)",
                      borderRadius: 12,
                      color: "#FFFFFF",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                    className="active:scale-[0.98] transition-transform font-sans disabled:opacity-40 disabled:cursor-not-allowed"
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
                    style={{
                      width: "100%",
                      height: 48,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(255, 255, 255, 0.06)",
                      border: "none",
                      borderRadius: 12,
                      color: "#FFFFFF",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                    className="active:scale-[0.98] transition-transform font-sans"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── LIST MENU ACTION SHEET (MATCHING PLAN ACTIONS DESIGN) ── */}
      <AnimatePresence>
        {listMenuTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setListMenuTarget(null)}
              className="fixed inset-0 bg-black/70 z-60 pointer-events-auto"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed bottom-0 left-0 right-0 z-[65] pointer-events-auto w-full"
              style={{
                background: "#1C1C1E",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              {/* Top Handle */}
              <div className="flex justify-center pt-3 pb-4">
                <div className="w-9 h-1 rounded-full bg-white/20" />
              </div>

              {/* Identity Header matching Plan Actions visual hierarchy */}
              <div className="px-5 pb-1 text-left flex items-center gap-3.5">
                <div className="w-[44px] h-[44px] rounded-full overflow-hidden border border-white/[0.08] shadow-sm flex-shrink-0 relative bg-zinc-900 flex items-center justify-center">
                  {(() => {
                    const cover = resolveListCover(listMenuTarget, quickPlans);
                    return (
                      <DiscoveryImages
                        src={cover.src}
                        category={cover.category}
                        subcategory={cover.subcategory}
                        screen="Plan Actions Avatar"
                        alt={listMenuTarget.name}
                        className="w-full h-full object-cover"
                      />
                    );
                  })()}
                </div>
                <div className="min-w-0 flex-1 flex flex-col justify-center space-y-0.5">
                  <h3 className="font-sans font-semibold text-[15px] text-white tracking-wide truncate leading-snug">
                    {listMenuTarget.name}
                  </h3>
                  <p className="font-sans text-[12px] text-zinc-400 truncate leading-tight">
                    {(() => {
                      const count =
                        listMenuTarget.quick_plans_count !== undefined
                          ? listMenuTarget.quick_plans_count
                          : quickPlans.filter((p) => p.quick_plan_list_id === listMenuTarget.id).length;
                      return `${count} ${count === 1 ? "plan" : "plans"}`;
                    })()}
                  </p>
                </div>
              </div>

              {/* Actions List */}
              <div className="px-4 pt-4 flex flex-col gap-2.5">
                <button
                  id="quick_plan_rename_btn"
                  type="button"
                  onClick={() => {
                    const target = listMenuTarget;
                    setListMenuTarget(null);
                    setEditListName(target.name);
                    setListToEdit(target);
                  }}
                  style={{
                    width: "100%",
                    height: 48,
                    padding: "0 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "none",
                    borderRadius: 12,
                    color: "#FFFFFF",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  className="hover:bg-white/10 active:scale-[0.98] transition-all font-sans"
                >
                  <Edit2 className="w-4 h-4 text-zinc-300 shrink-0" />
                  <span className="truncate">Rename List</span>
                </button>

                <button
                  id="quick_plan_delete_btn"
                  type="button"
                  onClick={() => {
                    const target = listMenuTarget;
                    setListMenuTarget(null);
                    setListToDelete(target);
                  }}
                  style={{
                    width: "100%",
                    height: 48,
                    padding: "0 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "none",
                    borderRadius: 12,
                    color: "#EF4444",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  className="hover:bg-rose-500/15 active:scale-[0.98] transition-all font-sans"
                >
                  <Trash2 className="w-4 h-4 text-[#EF4444] shrink-0" />
                  <span className="truncate">Delete List</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── RENAME LIST BOTTOM SHEET ── */}
      <AnimatePresence>
        {listToEdit && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isUpdatingList && setListToEdit(null)}
              className="fixed inset-0 bg-black/70 z-60 pointer-events-auto"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed bottom-0 left-0 right-0 z-[65] pointer-events-auto w-full"
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
                <h2 className="text-[18px] font-bold text-white mb-1 font-sans">
                  Rename List
                </h2>
                <p className="text-[13px] text-zinc-400 font-sans">
                  Update the name of this Quick Plan list
                </p>
              </div>

              <form onSubmit={handleUpdateListSubmit} className="px-4 pt-2 space-y-4">
                <div>
                  <input
                    id="edit-list-name-input"
                    type="text"
                    value={editListName}
                    onChange={(e) => setEditListName(e.target.value)}
                    autoFocus
                    maxLength={50}
                    placeholder="List Name"
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-white/25 transition font-sans"
                  />
                </div>

                <div className="flex flex-col gap-2.5 pt-1">
                  <button
                    type="submit"
                    disabled={!editListName.trim() || isUpdatingList}
                    style={{
                      width: "100%",
                      height: 48,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(255, 255, 255, 0.12)",
                      border: "1px solid rgba(255, 255, 255, 0.18)",
                      borderRadius: 12,
                      color: "#FFFFFF",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                    className="active:scale-[0.98] transition-transform font-sans disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>{isUpdatingList ? "Saving…" : "Save Changes"}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isUpdatingList}
                    onClick={() => setListToEdit(null)}
                    style={{
                      width: "100%",
                      height: 48,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(255, 255, 255, 0.06)",
                      border: "none",
                      borderRadius: 12,
                      color: "#FFFFFF",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                    className="active:scale-[0.98] transition-transform font-sans"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── DELETE LIST CONFIRMATION BOTTOM SHEET ── */}
      <AnimatePresence>
        {listToDelete && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeletingList && setListToDelete(null)}
              className="fixed inset-0 bg-black/70 z-60 pointer-events-auto"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed bottom-0 left-0 right-0 z-[65] pointer-events-auto w-full"
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
                <h2 className="text-[18px] font-bold text-white mb-2 font-sans">
                  Delete {listToDelete.name}?
                </h2>
                <p className="text-[14px] text-white/55 leading-[1.55] font-sans">
                  This will delete this Quick Plan list and its plans.
                </p>
              </div>

              <div className="px-4 pt-5 flex flex-col gap-2.5">
                <button
                  id="delete_list_confirm_btn"
                  type="button"
                  disabled={isDeletingList}
                  onClick={confirmDeleteList}
                  style={{
                    width: "100%",
                    height: 48,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#EF4444",
                    border: "none",
                    borderRadius: 12,
                    color: "#FFFFFF",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  className="active:scale-[0.98] transition-transform font-sans disabled:opacity-50"
                >
                  {isDeletingList ? "Deleting…" : "Delete"}
                </button>

                <button
                  type="button"
                  disabled={isDeletingList}
                  onClick={() => setListToDelete(null)}
                  style={{
                    width: "100%",
                    height: 48,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "none",
                    borderRadius: 12,
                    color: "#FFFFFF",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  className="active:scale-[0.98] transition-transform font-sans"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── DELETE PLAN CONFIRMATION BOTTOM SHEET ── */}
      <AnimatePresence>
        {planToDelete && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeletingPlan && setPlanToDelete(null)}
              className="fixed inset-0 bg-black/70 z-60 pointer-events-auto"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed bottom-0 left-0 right-0 z-[65] pointer-events-auto w-full"
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
                <h2 className="text-[18px] font-bold text-white mb-2 font-sans">
                  Delete {planToDelete.name}?
                </h2>
                <p className="text-[14px] text-white/55 leading-[1.55] font-sans">
                  Are you sure you want to remove &ldquo;{planToDelete.name}&rdquo;?
                </p>
              </div>

              <div className="px-4 pt-5 flex flex-col gap-2.5">
                <button
                  type="button"
                  disabled={isDeletingPlan}
                  onClick={confirmDeletePlan}
                  style={{
                    width: "100%",
                    height: 48,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#EF4444",
                    border: "none",
                    borderRadius: 12,
                    color: "#FFFFFF",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  className="active:scale-[0.98] transition-transform font-sans disabled:opacity-50"
                >
                  {isDeletingPlan ? "Deleting…" : "Delete"}
                </button>

                <button
                  type="button"
                  disabled={isDeletingPlan}
                  onClick={() => setPlanToDelete(null)}
                  style={{
                    width: "100%",
                    height: 48,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "none",
                    borderRadius: 12,
                    color: "#FFFFFF",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  className="active:scale-[0.98] transition-transform font-sans"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
