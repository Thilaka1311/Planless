import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight, Crown, Ban } from "lucide-react";
import { motion } from "motion/react";
import { Plan, DbPlanParticipant } from "../../../../core/types";
import { normalizeStatus } from "../../../../../lib/participantStatus";
import { formatPlanDate } from "../../../../../lib/mappers";
import { usePlansStore } from "../../state/PlansContext";
import { useProfileStore } from "../../../profile/state/ProfileContext";
import { EmptyState } from "../../../home/components/EmptyState";
import { getPlanCover } from "../../config/planCoverImages";
import { DiscoveryImages } from "../../../../IMGfromDB/PlanImages";

interface CancelledPlansProps {
  onBack: () => void;
  setSelectedPlanId: (planId: string | null) => void;
}

export const CancelledPlans: React.FC<CancelledPlansProps> = React.memo(({
  onBack,
  setSelectedPlanId,
}) => {
  const { plans, dbPlanParticipants } = usePlansStore();
  const { userProfile, activeUserId } = useProfileStore();

  const userUuid = userProfile?.dbUuid || (userProfile as any)?.id || activeUserId || "";

  const getPlanDateTime = (plan: Plan): Date => {
    const now = new Date();

    if (plan.datetime && plan.datetime.includes("T") && plan.datetime.includes("-")) {
      const d = new Date(plan.datetime);
      if (!isNaN(d.getTime())) return d;
    }

    const dateStr = (plan.date || "").trim().toUpperCase();
    const timeStr = (plan.time || "").trim().toUpperCase().replace(/⏰/g, "");

    let targetDate = new Date();
    if (dateStr === "TOMORROW") {
      targetDate.setDate(now.getDate() + 1);
    } else if (dateStr !== "TODAY" && dateStr !== "") {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        targetDate = parsed;
      }
    }

    if (timeStr) {
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const ampm = match[3];
        if (ampm === "PM" && hours < 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;
        targetDate.setHours(hours, minutes, 0, 0);
        return targetDate;
      }
    }

    if (plan.createdAt) {
      const d = new Date(plan.createdAt);
      if (!isNaN(d.getTime())) return d;
    }

    return targetDate;
  };

  const groupPlansByDate = (plansList: Plan[]) => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);

    const dayAfterTomorrowStart = new Date(todayStart);
    dayAfterTomorrowStart.setDate(todayStart.getDate() + 2);

    const sevenDaysLaterStart = new Date(todayStart);
    sevenDaysLaterStart.setDate(todayStart.getDate() + 8);

    const groups = {
      today: [] as Plan[],
      tomorrow: [] as Plan[],
      thisWeek: [] as Plan[],
      later: [] as Plan[],
      past: [] as Plan[],
    };

    const sortedPlans = [...plansList].sort((a, b) => {
      return getPlanDateTime(a).getTime() - getPlanDateTime(b).getTime();
    });

    for (const plan of sortedPlans) {
      const planDate = getPlanDateTime(plan);
      const planTime = planDate.getTime();

      if (planTime < todayStart.getTime()) {
        groups.past.push(plan);
      } else if (planTime < tomorrowStart.getTime()) {
        groups.today.push(plan);
      } else if (planTime < dayAfterTomorrowStart.getTime()) {
        groups.tomorrow.push(plan);
      } else if (planTime < sevenDaysLaterStart.getTime()) {
        groups.thisWeek.push(plan);
      } else {
        groups.later.push(plan);
      }
    }

    groups.past.sort((a, b) => getPlanDateTime(b).getTime() - getPlanDateTime(a).getTime());

    return groups;
  };

  const allMyUserIds = useMemo(() => {
    const ids = new Set<string>();
    if (userUuid) ids.add(userUuid);
    if (activeUserId) ids.add(activeUserId);
    if (userProfile?.dbUuid) ids.add(userProfile.dbUuid);
    if ((userProfile as any)?.id) ids.add((userProfile as any).id);
    if (userProfile?.user_id) ids.add(userProfile.user_id);
    return ids;
  }, [userUuid, activeUserId, userProfile]);

  const participantMap = useMemo(() => {
    const map = new Map<string, DbPlanParticipant>();
    (dbPlanParticipants || []).forEach(pp => {
      if (pp.user_id && allMyUserIds.has(pp.user_id) && pp.plan_id) {
        map.set(pp.plan_id, pp);
      }
    });
    return map;
  }, [dbPlanParticipants, allMyUserIds]);

  // Source of truth: plans.status === 'cancelled' (or 'CANCELLED') and user is a host
  const cancelledPlans = useMemo(() => {
    return plans.filter((p) => {
      const statusUpper = (p.status || "").toUpperCase();
      if (statusUpper !== "CANCELLED") return false;
      const myParticipant = participantMap.get(p.id) || (p.dbUuid ? participantMap.get(p.dbUuid) : undefined);
      const isHostRole = myParticipant?.role === "HOST" || p.hostId === userUuid || p.creatorId === userUuid;
      return isHostRole;
    });
  }, [plans, participantMap, userUuid]);

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
          <div className="w-[44px] h-[44px] rounded-full overflow-hidden border border-red-500/20 shadow-md flex-shrink-0 relative bg-zinc-955">
            <div className="absolute inset-0 bg-black/40 z-10" />
            <DiscoveryImages
              src={plan.coverImage || getPlanCover(plan.category, (plan as any).subcategory)}
              category={plan.category}
              alt={plan.title}
              className="w-full h-full object-cover relative z-0 scale-100 group-hover:scale-105 transition-transform duration-200 grayscale opacity-80"
            />
          </div>

          {/* Content details */}
          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h3 className="font-sans font-semibold text-[14px] text-white/80 tracking-wide truncate line-through">
                {plan.title}
              </h3>
              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-400">
                CANCELLED
              </span>
            </div>
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

  const renderGroupedPlans = (plansList: Plan[]) => {
    const groups = groupPlansByDate(plansList);

    const sectionsToRender = [
      { id: 'today' as const, label: 'TODAY', plans: groups.today },
      { id: 'tomorrow' as const, label: 'TOMORROW', plans: groups.tomorrow },
      { id: 'thisWeek' as const, label: 'THIS WEEK', plans: groups.thisWeek },
      { id: 'later' as const, label: 'LATER', plans: groups.later },
      { id: 'past' as const, label: 'PAST', plans: groups.past },
    ];

    const activeSections = sectionsToRender.filter(s => s.plans.length > 0);

    if (activeSections.length === 0) {
      return (
        <EmptyState
          icon={<Ban className="w-8 h-8 text-zinc-500 stroke-[1.5]" />}
          title="No cancelled plans"
          description="Cancelled plans will appear here once you cancel a hosted plan."
          py="py-12"
        />
      );
    }

    return (
      <div className="space-y-4 pt-0">
        {activeSections.map((sec) => (
          <div key={sec.id} className="space-y-2.5">
            {/* Section Header */}
            <div className="flex items-center gap-3 w-full mt-2 mb-1.5 select-none">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500/80"></span>
                <span className="text-[10px] uppercase font-mono tracking-[0.2em] text-[#8E8E93] font-bold">
                  {sec.label}
                </span>
              </div>
              <div className="flex-1 h-[0.5px] bg-[#1C1C1E]"></div>
              <span className="text-[10px] font-mono text-[#8E8E93]">
                {sec.plans.length} {sec.plans.length === 1 ? 'plan' : 'plans'}
              </span>
            </div>

            {/* Cards List */}
            <div className="space-y-2.5">
              {sec.plans.map((plan) => renderPlanRow(plan))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-none">
      {/* Top Header */}
      <div className="bg-black/40 backdrop-blur-xl border-b border-white/10 px-4 py-3.5 flex items-center justify-between flex-shrink-0 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-white/10 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white active:scale-95 transition cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-white tracking-wide text-center">
          Cancelled Plans
        </h1>
        <div className="w-9" />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-y-auto scrollbar-none px-6 pt-2 pb-6">
        {renderGroupedPlans(cancelledPlans)}
      </div>
    </div>
  );
});
