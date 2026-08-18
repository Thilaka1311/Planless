import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { RelationshipDetailsScreen } from "./PeopleBalances";
import { PlanOverallCost } from "./PlanOverallCost";
import { PlanDetailsScreen } from "./PlanBalances";
import { WalletRelationshipCard } from "../components/WalletRelationshipCard";
import { WalletPlanCard } from "../components/WalletPlanCard";
import { calculateWalletSummary, WalletRelationship, PlanRelationship } from "../services/walletService";
import { useWalletStore } from "../state/WalletContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";

interface WalletScreenProps {
  setActiveTab?: (tab: string) => void;
  setSelectedPlanId?: (planId: string | null) => void;
}

export const WalletScreen: React.FC<WalletScreenProps> = ({
  setActiveTab,
  setSelectedPlanId,
}) => {
  const [subView, setSubView] = useState<"main" | "relationship" | "planOverallCost">("main");
  // We store only the person's UUID — the detail view always shows the FULL relationship.
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedPlanOverallCostId, setSelectedPlanOverallCostId] = useState<string | null>(null);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  // View mode toggle: "people" | "plans"
  const [viewMode, setViewMode] = useState<"people" | "plans">("people");
  // Collapsible Settled Up section
  const [isSettledExpanded, setIsSettledExpanded] = useState<boolean>(true);

  const {
    dbWalletTransactions,
    dbWalletPaidTransactions,
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
      dbWalletPaidTransactions
    );
  }, [activeUserUuid, dbWalletTransactions, mergedUsers, dbPlansLocal, dbCirclesLocal, dbPlanParticipantsLocal, dbWalletPaidTransactions]);

  // All active net person relationships
  const visibleRelationships = useMemo(() => {
    return (walletSummary.personRelationships || [])
      .slice()
      .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));
  }, [walletSummary.personRelationships]);

  // Settled Up relationships (net balance = 0, but has transaction history)
  const settledRelationships = useMemo(() => {
    return (walletSummary.settledRelationships || [])
      .slice()
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [walletSummary.settledRelationships]);

  // Active plan relationships
  const visiblePlanRelationships = useMemo(() => {
    return (walletSummary.planRelationships || [])
      .slice()
      .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));
  }, [walletSummary.planRelationships]);

  // Settled plan relationships
  const settledPlanRelationships = useMemo(() => {
    return (walletSummary.settledPlanRelationships || [])
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [walletSummary.settledPlanRelationships]);

  // Current relationship being inspected in the details view (check active + settled)
  const currentRelationship = useMemo(() => {
    if (!selectedUserId) return null;
    const all = [...(walletSummary.personRelationships || []), ...(walletSummary.settledRelationships || [])];
    return all.find((r) => r.userId === selectedUserId) || null;
  }, [walletSummary.personRelationships, walletSummary.settledRelationships, selectedUserId]);

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

  return (
    <div id="subview_payments_wallet" className="w-full h-full flex flex-col overflow-y-auto scrollbar-none px-6 pt-3 space-y-6 animate-fade-in text-left bg-[#050505]">
      {/* Header — Centered title WALLET with Profile Avatar on Top-Left */}
      <div className="pb-1.5 pt-1.5 flex items-center justify-between relative">
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
                size="w-9 h-9"
                className="border-2 border-zinc-800 hover:border-[#ff8b66] transition-colors"
              />
            </button>
          )}
        </div>

        {/* Center Column: Perfectly Centered Title */}
        <div className="flex-shrink-0 flex items-center justify-center z-10">
          <h1 className="text-stone-100 font-sans font-black text-xl tracking-[0.25em] leading-none text-center uppercase">
            WALLET
          </h1>
        </div>

        {/* Right Column: Empty spacer for horizontal balance */}
        <div className="flex-1 flex items-center justify-end z-10" />
      </div>

      {/* Segmented Control: People vs Plans */}
      <div className="w-full bg-zinc-900/90 p-1 rounded-xl border border-white/[0.06] flex items-center gap-1">
        <button
          type="button"
          onClick={() => setViewMode("people")}
          className={`flex-1 py-2 rounded-lg text-xs font-sans font-semibold transition-all cursor-pointer text-center ${
            viewMode === "people"
              ? "bg-zinc-800 text-white shadow-sm border border-white/10"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          People
        </button>
        <button
          type="button"
          onClick={() => setViewMode("plans")}
          className={`flex-1 py-2 rounded-lg text-xs font-sans font-semibold transition-all cursor-pointer text-center ${
            viewMode === "plans"
              ? "bg-zinc-800 text-white shadow-sm border border-white/10"
              : "text-zinc-400 hover:text-zinc-200"
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

      {/* Summary Card */}
      <div className="bg-zinc-950/40 border border-white/[0.04] rounded-[24px] p-6 text-center select-none">
        <span className="text-[10px] font-sans font-semibold uppercase tracking-[0.14em] text-zinc-500 block">
          OVERALL BALANCE
        </span>
        <div className="mt-2 flex items-center justify-center">
          <span
            className={`text-[42px] font-display font-bold leading-none ${
              isPositive
                ? "text-emerald-400"
                : isNegative
                ? "text-[#FF6B2C]"
                : "text-white"
            }`}
          >
            {isNegative ? `-${formatINR(netBalanceVal)}` : formatINR(netBalanceVal)}
          </span>
        </div>
      </div>

      {/* Balances Section */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-sans font-semibold uppercase tracking-[0.12em] text-zinc-500 px-1">
          {viewMode === "people" ? "BALANCES BY PERSON" : "BALANCES BY PLAN"}
        </h3>

        {viewMode === "people" ? (
          loading && visibleRelationships.length === 0 && settledRelationships.length === 0 ? (
            <div className="p-8 text-center bg-zinc-950/20 border border-dashed border-zinc-900 rounded-[24px] space-y-2">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-zinc-500 font-sans">Loading balances…</p>
            </div>
          ) : visibleRelationships.length === 0 ? (
            <div className="p-8 text-center bg-zinc-950/20 border border-dashed border-zinc-900 rounded-[24px] space-y-1">
              <p className="text-[13px] font-semibold text-zinc-300">
                All settled 🎉
              </p>
              <p className="text-[11px] text-zinc-550 font-sans">
                You don't owe anyone right now.
              </p>
            </div>
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
                    console.log("[WalletNavigation] screen = peopleBalances, personId =", rel.userId);
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
          ) : visiblePlanRelationships.length === 0 ? (
            <div className="p-8 text-center bg-zinc-950/20 border border-dashed border-zinc-900 rounded-[24px] space-y-1">
              <p className="text-[13px] font-semibold text-zinc-300">
                All plans settled 🎉
              </p>
              <p className="text-[11px] text-zinc-550 font-sans">
                No active plan balances.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visiblePlanRelationships.map((planRel) => (
                <WalletPlanCard
                  key={planRel.expenseId}
                  plan={planRel}
                  onClick={() => {
                    console.log("[WalletNavigation] screen = planBalances, planId =", planRel.planId);
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

      {/* Settled Up Section (Collapsible) */}
      {viewMode === "people" ? (
        settledRelationships.length > 0 && (
          <div className="space-y-3 pb-8 pt-2 border-t border-white/[0.04]">
            <button
              type="button"
              onClick={() => setIsSettledExpanded((prev) => !prev)}
              className="w-full flex items-center justify-between px-1 text-left cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <h3 className="text-[11px] font-sans font-semibold uppercase tracking-[0.12em] text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  SETTLED UP ({settledRelationships.length})
                </h3>
              </div>
              <div className="text-zinc-500 group-hover:text-zinc-300 transition-colors">
                {isSettledExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </button>

            {isSettledExpanded && (
              <div className="space-y-2 animate-fade-in">
                {settledRelationships.map((rel) => (
                  <WalletRelationshipCard
                    key={rel.userId}
                    fullName={rel.fullName}
                    profilePhoto={rel.profilePhoto}
                    netBalance={0}
                    isSettled={true}
                    onClick={() => {
                      console.log("[WalletNavigation] screen = peopleBalances, personId =", rel.userId);
                      setSelectedUserId(rel.userId);
                      setSubView("relationship");
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      ) : (
        settledPlanRelationships.length > 0 && (
          <div className="space-y-3 pb-8 pt-2 border-t border-white/[0.04]">
            <button
              type="button"
              onClick={() => setIsSettledExpanded((prev) => !prev)}
              className="w-full flex items-center justify-between px-1 text-left cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <h3 className="text-[11px] font-sans font-semibold uppercase tracking-[0.12em] text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  SETTLED UP ({settledPlanRelationships.length})
                </h3>
              </div>
              <div className="text-zinc-500 group-hover:text-zinc-300 transition-colors">
                {isSettledExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </button>

            {isSettledExpanded && (
              <div className="space-y-2 animate-fade-in">
                {settledPlanRelationships.map((planRel) => (
                  <WalletPlanCard
                    key={planRel.expenseId}
                    plan={planRel}
                    onClick={() => {
                      console.log("[WalletNavigation] screen = planBalances, planId =", planRel.planId);
                      setSelectedExpenseId(null);
                      setSelectedPlanOverallCostId(planRel.planId);
                      setSubView("planOverallCost");
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};
