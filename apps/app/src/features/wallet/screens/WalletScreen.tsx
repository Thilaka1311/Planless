import React, { useState, useMemo } from "react";
import { ChevronRight, Check, CheckCircle2, Search, X, Users, Calendar } from "lucide-react";
import { RelationshipDetailsScreen } from "./PeopleBalances";
import { PlanOverallCost } from "./PlanOverallCost";
import { PlanDetailsScreen } from "./PlanBalances";
import { WalletRelationshipCard } from "../components/WalletRelationshipCard";
import { WalletPlanCard } from "../components/WalletPlanCard";
import { calculateWalletSummary, WalletRelationship, PlanRelationship } from "../services/walletService";
import { useWalletStore } from "../state/WalletContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { PeopleSettledUpScreen, PlansSettledUpScreen } from "./WalletSettledUp";

interface WalletScreenProps {
  setActiveTab?: (tab: string) => void;
  setSelectedPlanId?: (planId: string | null) => void;
  onToggleBottomNav?: (hidden: boolean) => void;
}

export const WalletScreen: React.FC<WalletScreenProps> = ({
  setActiveTab,
  setSelectedPlanId,
  onToggleBottomNav,
}) => {
  const [subView, setSubView] = useState<"main" | "relationship" | "planOverallCost" | "peopleSettledUp" | "plansSettledUp">("main");
  // We store only the person's UUID — the detail view always shows the FULL relationship.
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedPlanOverallCostId, setSelectedPlanOverallCostId] = useState<string | null>(null);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  // View mode toggle: "people" | "plans"
  const [viewMode, setViewMode] = useState<"people" | "plans">("people");
  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const {
    dbWalletTransactions,
    dbWalletPaidTransactions,
    dbWalletSettlements,
    dbPlansLocal,
    dbCirclesLocal,
    dbPlanParticipantsLocal,
    dbUsersLocal,
    loading,
    error,
    refreshTransactions,
  } = useWalletStore();
  const { activeUserUuid, dbUsers, userProfile } = useProfileStore();

  const mergedUsers = useMemo(() => {
    const map = new Map<string, any>();
    (dbUsers || []).forEach((u) => map.set(u.id, u));
    (dbUsersLocal || []).forEach((u) => map.set(u.id, u));
    return Array.from(map.values());
  }, [dbUsers, dbUsersLocal]);

  const walletSummary = useMemo(() => {
    return calculateWalletSummary(
      activeUserUuid || "",
      dbWalletTransactions,
      mergedUsers,
      dbPlansLocal,
      dbCirclesLocal,
      dbPlanParticipantsLocal,
      dbWalletPaidTransactions,
      dbWalletSettlements
    );
  }, [activeUserUuid, dbWalletTransactions, mergedUsers, dbPlansLocal, dbCirclesLocal, dbPlanParticipantsLocal, dbWalletPaidTransactions, dbWalletSettlements]);

  // Unified list of all person relationships (active unsettled + settled)
  const visibleRelationships = useMemo(() => {
    const active = (walletSummary.personRelationships || [])
      .slice()
      .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));
    const settled = (walletSummary.settledRelationships || [])
      .slice()
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    return [...active, ...settled];
  }, [walletSummary.personRelationships, walletSummary.settledRelationships]);

  // Settled Up relationships (net balance = 0, but has transaction history)
  const settledRelationships = useMemo(() => {
    return (walletSummary.settledRelationships || [])
      .slice()
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [walletSummary.settledRelationships]);

  // Unified list of all plan relationships (active unsettled + settled)
  const visiblePlanRelationships = useMemo(() => {
    const active = (walletSummary.planRelationships || [])
      .slice()
      .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));
    const settled = (walletSummary.settledPlanRelationships || [])
      .slice()
      .sort((a, b) => (a.planTitle || "").localeCompare(b.planTitle || ""));

    return [...active, ...settled];
  }, [walletSummary.planRelationships, walletSummary.settledPlanRelationships]);

  // Settled plan relationships
  const settledPlanRelationships = useMemo(() => {
    return (walletSummary.settledPlanRelationships || [])
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [walletSummary.settledPlanRelationships]);

  // All searchable people (every user in mergedUsers except activeUserUuid)
  const allSearchablePeople = useMemo(() => {
    if (!activeUserUuid) return [];

    const relMap = new Map<string, WalletRelationship>();

    // 1. Active relationships
    (walletSummary.personRelationships || []).forEach((rel) => {
      relMap.set(rel.userId, rel);
    });

    // 2. Settled relationships
    (walletSummary.settledRelationships || []).forEach((rel) => {
      if (!relMap.has(rel.userId)) {
        relMap.set(rel.userId, rel);
      }
    });

    // 3. All other merged users
    (mergedUsers || []).forEach((u) => {
      if (u.id && u.id !== activeUserUuid && !relMap.has(u.id)) {
        relMap.set(u.id, {
          userId: u.id,
          fullName: u.full_name || u.fullName || u.name || "Unknown User",
          profilePhoto: u.profile_photo || u.profilePhoto || u.avatar || "",
          netBalance: 0,
          type: "owed",
          expenses: [],
        });
      }
    });

    return Array.from(relMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [activeUserUuid, walletSummary.personRelationships, walletSummary.settledRelationships, mergedUsers]);

  // All searchable plans (every plan in dbPlansLocal or walletSummary)
  const allSearchablePlans = useMemo(() => {
    const planMap = new Map<string, PlanRelationship>();

    // 1. Active plan relationships
    (walletSummary.planRelationships || []).forEach((pRel) => {
      planMap.set(pRel.planId, pRel);
    });

    // 2. Settled plan relationships
    (walletSummary.settledPlanRelationships || []).forEach((pRel) => {
      if (!planMap.has(pRel.planId)) {
        planMap.set(pRel.planId, pRel);
      }
    });

    // 3. Any other plans in dbPlansLocal
    (dbPlansLocal || []).forEach((plan: any) => {
      if (plan.id && !planMap.has(plan.id)) {
        planMap.set(plan.id, {
          planId: plan.id,
          expenseId: `search-${plan.id}`,
          planTitle: plan.title || "Untitled Plan",
          planCover: plan.cover_image || plan.coverImage || "",
          netBalance: 0,
          type: "owed",
          totalCost: plan.total_cost || 0,
          participants: [],
          updatedAt: plan.created_at || new Date().toISOString(),
        });
      }
    });

    return Array.from(planMap.values()).sort((a, b) => (a.planTitle || "").localeCompare(b.planTitle || ""));
  }, [walletSummary.planRelationships, walletSummary.settledPlanRelationships, dbPlansLocal]);

  // Filtered lists for search
  const isSearching = isSearchOpen && searchQuery.trim() !== "";

  const filteredPeople = useMemo(() => {
    if (!searchQuery.trim()) return visibleRelationships;
    const q = searchQuery.trim().toLowerCase();
    return allSearchablePeople.filter((p) => (p.fullName || "").toLowerCase().includes(q));
  }, [searchQuery, visibleRelationships, allSearchablePeople]);

  const filteredPlans = useMemo(() => {
    if (!searchQuery.trim()) return visiblePlanRelationships;
    const q = searchQuery.trim().toLowerCase();
    return allSearchablePlans.filter((p) => (p.planTitle || "").toLowerCase().includes(q));
  }, [searchQuery, visiblePlanRelationships, allSearchablePlans]);

  // Current relationship being inspected in the details view
  const currentRelationship = useMemo(() => {
    if (!selectedUserId) return null;
    const all = [
      ...(walletSummary.personRelationships || []),
      ...(walletSummary.settledRelationships || []),
      ...allSearchablePeople,
    ];
    return all.find((r) => r.userId === selectedUserId) || null;
  }, [walletSummary.personRelationships, walletSummary.settledRelationships, allSearchablePeople, selectedUserId]);

  if (subView === "peopleSettledUp") {
    return (
      <PeopleSettledUpScreen
        settledRelationships={settledRelationships}
        onBack={() => setSubView("main")}
        onSelectPerson={(userId) => {
          setSelectedUserId(userId);
          setSubView("relationship");
        }}
      />
    );
  }

  if (subView === "plansSettledUp") {
    return (
      <PlansSettledUpScreen
        settledPlanRelationships={settledPlanRelationships}
        onBack={() => setSubView("main")}
        onSelectPlan={(planId) => {
          setSelectedExpenseId(null);
          setSelectedPlanOverallCostId(planId);
          setSubView("planOverallCost");
        }}
      />
    );
  }

  if (subView === "planOverallCost" && (selectedExpenseId || selectedPlanOverallCostId)) {
    return (
      <PlanDetailsScreen
        planId={selectedPlanOverallCostId || undefined}
        expenseId={selectedExpenseId || undefined}
        onBack={() => {
          setSelectedExpenseId(null);
          setSelectedPlanOverallCostId(null);
          setSubView("main");
        }}
        onRefreshBalances={refreshTransactions}
        activeUserId={activeUserUuid || ""}
        onSelectPlan={(planId) => {
          if (setSelectedPlanId) setSelectedPlanId(planId);
          if (setActiveTab) setActiveTab("plans");
        }}
      />
    );
  }

  if (subView === "relationship" && currentRelationship) {
    return (
      <RelationshipDetailsScreen
        relationship={currentRelationship}
        activeUserId={activeUserUuid || ""}
        onBack={() => {
          setSelectedUserId(null);
          setSubView("main");
        }}
        onRefreshBalances={refreshTransactions}
        onSelectPlan={(pId) => {
          setSelectedPlanOverallCostId(pId);
          setSelectedExpenseId(null);
          setSubView("planOverallCost");
        }}
        onSelectExpense={(expId) => {
          setSelectedExpenseId(expId);
        }}
        onToggleBottomNav={onToggleBottomNav}
      />
    );
  }

  // Net balance: positive = owed to user (green), negative = user owes (red/orange), 0 = neutral/white
  const netBalanceVal = walletSummary.overallBalance;
  const isPositive = netBalanceVal > 0;
  const isNegative = netBalanceVal < 0;

  const formatINR = (amount: number) =>
    Math.abs(amount).toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    });

  const hasActiveBalances = viewMode === "people"
    ? visibleRelationships.length > 0
    : visiblePlanRelationships.length > 0;

  const balanceSummaryLabel = isPositive
    ? "You're owed"
    : isNegative
    ? "You owe"
    : "All settled";

  return (
    <div id="subview_payments_wallet" className="flex-1 flex flex-col relative overflow-hidden h-full bg-[#050505] text-left select-none animate-fade-in">
      {/* Header: Clean with no bottom divider */}
      <header
        id="wallet_screen_header"
        className="h-16 shrink-0 bg-[#09090b]/99 backdrop-blur-md flex items-center justify-between px-4 z-30 select-none relative"
      >
        {/* Left Column: Avatar */}
        <div className="flex-1 flex items-center justify-start z-10">
          {userProfile && (
            <button
              onClick={() => setActiveTab?.("profile")}
              className="relative group shrink-0 block focus:outline-none cursor-pointer"
              aria-label="View Profile Settings"
            >
              <UserAvatar
                src={userProfile.avatar}
                alt={userProfile.name}
                size="w-10 h-10"
                className="border-2 border-zinc-800 hover:border-[#ff8b66] transition-colors"
              />
            </button>
          )}
        </div>

        {/* Center Column: Perfectly Centered Title */}
        <div className="flex-shrink-0 flex items-center justify-center z-10">
          <h1 className="text-stone-100 font-sans font-bold text-xl tracking-tight leading-none text-center">
            Wallet
          </h1>
        </div>

        {/* Right Column: Plain Search Action Icon */}
        <div className="flex-1 flex items-center justify-end z-10">
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen((prev) => !prev);
              if (isSearchOpen) setSearchQuery("");
            }}
            aria-label="Search Wallet"
            className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer active:scale-95"
          >
            {isSearchOpen ? <X className="w-5.5 h-5.5" /> : <Search className="w-5.5 h-5.5" />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-6 pt-3 pb-20 space-y-3.5">
        {/* Search Input Bar (Visible when Search is toggled) */}
        {isSearchOpen && (
          <div className="w-full relative flex items-center animate-fade-in">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={viewMode === "people" ? "Search people by name…" : "Search plans by name…"}
              autoFocus
              className="w-full bg-zinc-900/90 border border-white/[0.1] focus:border-emerald-500/50 rounded-xl py-2.5 pl-10 pr-9 text-xs text-white placeholder-zinc-500 outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 text-zinc-500 hover:text-zinc-300 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Clean Full-Width Navigation Control: People vs Plans (Subtle Outer Border) */}
        <div className="w-full flex items-center p-0.5 rounded-2xl border border-white/[0.08]">
          <button
            type="button"
            onClick={() => setViewMode("people")}
            className={`w-1/2 py-2 rounded-xl text-xs font-sans font-semibold transition-all cursor-pointer text-center ${
              viewMode === "people"
                ? "bg-zinc-800 text-white shadow-sm border border-white/10"
                : "bg-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            People
          </button>
          <button
            type="button"
            onClick={() => setViewMode("plans")}
            className={`w-1/2 py-2 rounded-xl text-xs font-sans font-semibold transition-all cursor-pointer text-center ${
              viewMode === "plans"
                ? "bg-zinc-800 text-white shadow-sm border border-white/10"
                : "bg-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Plans
          </button>
        </div>

        {/* Error alert */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs text-red-400 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={refreshTransactions}
              className="underline font-semibold ml-2 hover:text-red-300 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Summary Flat Display / Skeleton (Only for People view) */}
        {(() => {
          if (viewMode === "plans") return null;

          const isInitialLoading = loading && visibleRelationships.length === 0 && settledRelationships.length === 0 && visiblePlanRelationships.length === 0;

          if (isInitialLoading && !isSearching) {
            return (
              <div className="py-1 text-center select-none space-y-1 animate-pulse">
                <span className="text-xs font-display font-medium tracking-normal text-zinc-400 block">
                  {balanceSummaryLabel}
                </span>
                <div className="w-28 h-8 bg-zinc-800/80 rounded-xl mx-auto" />
              </div>
            );
          }

          if (!isSearching && hasActiveBalances) {
            return (
              <div className="py-1 text-center select-none">
                <span className="text-xs font-display font-medium tracking-normal text-zinc-400 block">
                  {balanceSummaryLabel}
                </span>
                <div className="mt-1 flex items-center justify-center">
                  <span className="text-3xl font-display font-bold leading-tight text-white tracking-tight">
                    {formatINR(netBalanceVal)}
                  </span>
                </div>
              </div>
            );
          }

          return null;
        })()}

        {/* Balances Section */}
        <div className="space-y-1">
          {isSearching && (
            <h3 className="text-[11px] font-sans font-semibold uppercase tracking-[0.12em] text-zinc-500 px-1 mb-2">
              SEARCH RESULTS
            </h3>
          )}

          {viewMode === "people" ? (
            loading && visibleRelationships.length === 0 && settledRelationships.length === 0 ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-full bg-zinc-950/40 border border-white/[0.04] rounded-[20px] p-4 flex items-center justify-between animate-pulse"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-zinc-800/80 shrink-0" />
                      <div className="space-y-2">
                        <div className="w-28 h-3.5 bg-zinc-800/80 rounded-full" />
                        <div className="w-20 h-2.5 bg-zinc-800/50 rounded-full" />
                      </div>
                    </div>
                    <div className="w-16 h-4 bg-zinc-800/80 rounded-full" />
                  </div>
                ))}
              </div>
            ) : isSearching ? (
              filteredPeople.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-12 space-y-2">
                  <Search className="w-8 h-8 text-zinc-700 stroke-[1.5]" />
                  <h4 className="font-display font-semibold text-sm text-zinc-400">
                    No results found
                  </h4>
                  <p className="text-xs font-sans text-zinc-600">
                    No people match "{searchQuery}"
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredPeople.map((rel) => (
                    <WalletRelationshipCard
                      key={rel.userId}
                      fullName={rel.fullName}
                      profilePhoto={rel.profilePhoto}
                      netBalance={rel.netBalance}
                      type={rel.netBalance >= 0 ? "owed" : "owe"}
                      planTitle={rel.expenses[0]?.planTitle}
                      isSettled={rel.netBalance === 0}
                      onClick={() => {
                        setSelectedUserId(rel.userId);
                        setSubView("relationship");
                      }}
                    />
                  ))}
                </div>
              )
            ) : visibleRelationships.length === 0 ? (
              allSearchablePeople.length > 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-10 space-y-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Check className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <h4 className="font-display font-semibold text-sm text-zinc-200">
                    All settled 🎉
                  </h4>
                  <p className="text-xs font-sans text-zinc-500">
                    You don't owe anyone right now.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-10 space-y-2">
                  <Users className="w-10 h-10 text-zinc-700 stroke-[1.5]" />
                  <h4 className="font-display font-semibold text-sm text-zinc-400">
                    No people found
                  </h4>
                  <p className="text-xs font-sans text-zinc-600">
                    Add friends or join plans to split costs.
                  </p>
                </div>
              )
            ) : (
              <div className="space-y-2">
                {visibleRelationships.map((rel) => (
                  <WalletRelationshipCard
                    key={rel.userId}
                    fullName={rel.fullName}
                    profilePhoto={rel.profilePhoto}
                    netBalance={rel.netBalance}
                    type={rel.netBalance >= 0 ? "owed" : "owe"}
                    planTitle={rel.expenses[0]?.planTitle}
                    onClick={() => {
                      setSelectedUserId(rel.userId);
                      setSubView("relationship");
                    }}
                  />
                ))}
              </div>
            )
          ) : (
            loading && visiblePlanRelationships.length === 0 && settledPlanRelationships.length === 0 ? (
              <div className="p-8 text-center bg-zinc-950/20 border border-dashed border-zinc-900 rounded-[24px] space-y-2">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs text-zinc-500 font-sans">Loading plan balances…</p>
              </div>
            ) : isSearching ? (
              filteredPlans.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-12 space-y-2">
                  <Search className="w-8 h-8 text-zinc-700 stroke-[1.5]" />
                  <h4 className="font-display font-semibold text-sm text-zinc-400">
                    No results found
                  </h4>
                  <p className="text-xs font-sans text-zinc-600">
                    No plans match "{searchQuery}"
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredPlans.map((planRel) => (
                    <WalletPlanCard
                      key={planRel.expenseId}
                      plan={planRel}
                      onClick={() => {
                        setSelectedExpenseId(null);
                        setSelectedPlanOverallCostId(planRel.planId);
                        setSubView("planOverallCost");
                      }}
                    />
                  ))}
                </div>
              )
            ) : visiblePlanRelationships.length === 0 ? (
              allSearchablePlans.length > 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-10 space-y-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Check className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <h4 className="font-display font-semibold text-sm text-zinc-200">
                    All settled 🎉
                  </h4>
                  <p className="text-xs font-sans text-zinc-500">
                    You don't owe anything on your plans right now.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-10 space-y-2">
                  <Calendar className="w-10 h-10 text-zinc-700 stroke-[1.5]" />
                  <h4 className="font-display font-semibold text-sm text-zinc-400">
                    No plans yet
                  </h4>
                  <p className="text-xs font-sans text-zinc-600">
                    Create or join a plan to start tracking costs.
                  </p>
                </div>
              )
            ) : (
              <div className="space-y-2">
                {visiblePlanRelationships.map((planRel) => (
                  <WalletPlanCard
                    key={planRel.expenseId}
                    plan={planRel}
                    onClick={() => {
                      setSelectedExpenseId(null);
                      setSelectedPlanOverallCostId(planRel.planId);
                      setSubView("planOverallCost");
                    }}
                  />
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
