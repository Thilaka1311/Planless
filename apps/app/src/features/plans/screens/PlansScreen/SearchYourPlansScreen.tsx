import React, { useState, useMemo } from "react";
import { ArrowLeft, Search, X, ChevronRight, Inbox } from "lucide-react";
import { motion } from "motion/react";
import { Plan } from "../../../../core/types";
import { formatPlanDate } from "../../../../../lib/mappers";
import { usePlansStore } from "../../state/PlansContext";
import { useProfileStore } from "../../../profile/state/ProfileContext";
import { useCirclesStore } from "../../../circles/state/CirclesContext";
import { EmptyState } from "../../../home/components/EmptyState";
import { getPlanCover } from "../../config/planCoverImages";
import { DiscoveryImages } from "../../../../IMGfromDB/PlanImages";

interface SearchYourPlansScreenProps {
  onBack: () => void;
  setSelectedPlanId: (planId: string | null) => void;
}

export const SearchYourPlansScreen: React.FC<SearchYourPlansScreenProps> = ({
  onBack,
  setSelectedPlanId,
}) => {
  const { plans, dbPlanParticipants } = usePlansStore();
  const { userProfile } = useProfileStore();
  const { circles } = useCirclesStore();

  const [searchQuery, setSearchQuery] = useState("");

  const userUuid = userProfile?.dbUuid || "";

  // Get all active (non-cancelled) plans where the user is a member
  const involvedPlans = useMemo(() => {
    return plans.filter((p) => {
      if ((p.status || "").toUpperCase() === "CANCELLED") return false;
      const isMember = p.members.some((m) => m.userUuid && m.userUuid === userUuid);
      const isDbParticipant = dbPlanParticipants.some((pp) => pp.plan_id === p.id && pp.user_id === userUuid);
      return isMember || isDbParticipant;
    });
  }, [plans, userUuid, dbPlanParticipants]);

  // Filter plans based on the search query
  const filteredPlans = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return involvedPlans;

    return involvedPlans.filter((p) => {
      const planCircle = p.circleId ? circles.find((c) => c.id === p.circleId) : null;
      const circleName = planCircle?.name || "";
      return (
        p.title.toLowerCase().includes(query) ||
        p.location.toLowerCase().includes(query) ||
        circleName.toLowerCase().includes(query)
      );
    });
  }, [involvedPlans, circles, searchQuery]);

  const handleBackClick = () => {
    if (searchQuery) {
      setSearchQuery("");
    } else {
      onBack();
    }
  };

  const renderPlanRow = (plan: Plan) => {
    const timeLabel = formatPlanDate(plan.datetime || plan.createdAt);

    return (
      <motion.div
        key={plan.id}
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onClick={() => setSelectedPlanId(plan.id)}
        className="w-full bg-white/[0.02] hover:bg-white/[0.04] active:bg-white/[0.06] border border-white/5 rounded-2xl py-2.5 px-4 transition-all duration-150 cursor-pointer flex items-center justify-between group active:scale-[0.99] select-none text-left"
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* Thumbnail circle avatar */}
          <div className="w-[44px] h-[44px] rounded-full overflow-hidden border border-white/[0.06] shadow-md flex-shrink-0 relative bg-zinc-955">
            <div className="absolute inset-0 bg-black/40 z-10" />
            <DiscoveryImages
              src={plan.coverImage || getPlanCover(plan.category, (plan as any).subcategory)}
              category={plan.category}
              alt={plan.title}
              className="w-full h-full object-cover relative z-0 scale-100 group-hover:scale-105 transition-transform duration-200"
            />
          </div>

          {/* Content details */}
          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
            <h3 className="font-sans font-semibold text-[14px] text-white tracking-wide truncate">
              {plan.title}
            </h3>
            <span className="text-[11px] text-[#8E8E93] font-sans font-medium">
              {timeLabel}
            </span>
          </div>
        </div>

        {/* Chevron on the right */}
        <div className="flex items-center flex-shrink-0 ml-3">
          <ChevronRight className="w-4 h-4 text-zinc-650 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" />
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="absolute inset-0 bg-[#000000] flex flex-col z-50 select-none"
    >
      {/* HEADER WITH INTEGRATED SEARCH BAR */}
      <header className="px-5 py-4 flex items-center z-10 shrink-0 bg-[#000000]">
        <div className="relative flex-1 flex items-center">
          <button
            onClick={handleBackClick}
            className="absolute left-1 w-9 h-9 rounded-full hover:bg-white/5 flex items-center justify-center text-white transition active:scale-95 cursor-pointer z-10"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </button>
          <input
            type="text"
            placeholder="Search your plans"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-11 pr-10 text-sm text-white placeholder-zinc-550 focus:outline-none focus:border-zinc-700 transition select-text"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition cursor-pointer z-10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* RESULTS LIST */}
      <div className="flex-1 overflow-y-auto px-5 pb-8 pt-3.5">
        {filteredPlans.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 pt-16">
            <EmptyState
              icon={<Inbox className="w-8 h-8 text-zinc-600 stroke-[1.5]" />}
              description="No matching plans found"
              py="py-24"
            />
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            {filteredPlans.map((plan) => renderPlanRow(plan))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
