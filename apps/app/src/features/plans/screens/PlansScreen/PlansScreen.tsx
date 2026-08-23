import React, { useState, useMemo } from "react";
import { ChevronRight, Check, X, CreditCard, Inbox, CalendarCheck, Hourglass, Coffee, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { Plan, DbPlanParticipant } from "../../../../core/types";
import { normalizeStatus } from "../../../../../lib/participantStatus";
import { formatPlanDate } from "../../../../../lib/mappers";
import { usePlansStore } from "../../state/PlansContext";
import { useProfileStore } from "../../../profile/state/ProfileContext";
import { useCirclesStore } from "../../../circles/state/CirclesContext";
import { EmptyState } from "../../../home/components/EmptyState";
import { getPlanCover } from "../../config/planCoverImages";
import { DiscoveryImages } from "../../../../IMGfromDB/PlanImages";
import { PlansDivider } from "../../components/PlansDivider";

interface PlansScreenProps {
  setSelectedPlanId: (planId: string | null) => void;
  skippedByPlanId?: Record<string, string[]>;
  plansFilter?: 'JOINED' | 'WAITLISTED' | 'SKIPPED';
  setPlansFilter?: (filter: 'JOINED' | 'WAITLISTED' | 'SKIPPED') => void;
  onScroll?: (y: number) => void;
}

export const PlansScreen = React.memo(({
  setSelectedPlanId,
  skippedByPlanId = {},
  plansFilter: propPlansFilter,
  setPlansFilter: propSetPlansFilter,
  onScroll,
}: PlansScreenProps) => {
  const { plans, dbPlanParticipants } = usePlansStore();
  const { userProfile, activeUserId } = useProfileStore();
  const { circles } = useCirclesStore();

  const [localPlansFilter, setLocalPlansFilter] = useState<'JOINED' | 'WAITLISTED' | 'SKIPPED'>('JOINED');
  const plansFilter = propPlansFilter !== undefined ? propPlansFilter : localPlansFilter;
  const setPlansFilter = propSetPlansFilter !== undefined ? propSetPlansFilter : setLocalPlansFilter;

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

  const getGroupedPlansCount = (plansList: Plan[], showPastOnly: boolean) => {
    const groups = groupPlansByDate(plansList);
    if (showPastOnly) {
      return groups.past.length;
    } else {
      return groups.today.length + groups.tomorrow.length + groups.thisWeek.length + groups.later.length;
    }
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

  // 2. Build efficient O(1) participant lookup for current user: planId -> DbPlanParticipant
  const participantMap = useMemo(() => {
    const map = new Map<string, DbPlanParticipant>();
    (dbPlanParticipants || []).forEach(pp => {
      if (pp.user_id && allMyUserIds.has(pp.user_id) && pp.plan_id) {
        map.set(pp.plan_id, pp);
      }
    });
    return map;
  }, [dbPlanParticipants, allMyUserIds]);

  const involvedPlans = useMemo(() => {
    return plans.filter(p => {
      const isDbParticipant = participantMap.has(p.id) || Boolean(p.dbUuid && participantMap.has(p.dbUuid));
      return isDbParticipant;
    });
  }, [plans, participantMap]);

  // Helper filter function for status match
  const filterByStatus = (statusFilter: 'all' | 'JOINED' | 'WAITLISTED' | 'SKIPPED') => {
    return involvedPlans.filter((p) => {
      // Cancelled or Completed plans should never appear in active participant plan lists
      if ((p.status || "").toUpperCase() === "CANCELLED" || (p.status || "").toUpperCase() === "COMPLETED") {
        return false;
      }

      const myParticipant = participantMap.get(p.id) || (p.dbUuid ? participantMap.get(p.dbUuid) : undefined);

      if (!myParticipant) {
        console.warn(`[PlansScreen Warning] No plan_participants row found for plan ${p.id}`);
      }

      // plan_participants is the canonical single source of truth
      const rsvpStatus = normalizeStatus(myParticipant?.rsvp_status);

      // Strict categorisation based on plan_participants.rsvp_status
      const isSkipped = rsvpStatus === "SKIPPED";
      const isJoined = rsvpStatus === "JOINED";
      const isWaitlisted = rsvpStatus === "WAITLISTED";

      const isHostRole = myParticipant?.role === "HOST";

      if (statusFilter === "all") return isJoined || isWaitlisted || isSkipped;
      if (statusFilter === "JOINED") return isJoined;
      if (statusFilter === "WAITLISTED") return isWaitlisted;
      if (statusFilter === "SKIPPED") return isSkipped;

      return false;
    });
  };

  const allPlans = useMemo(() => filterByStatus('all'), [involvedPlans, participantMap]);
  const joinedPlans = useMemo(() => filterByStatus('JOINED'), [involvedPlans, participantMap]);
  const waitlistedPlans = useMemo(() => filterByStatus('WAITLISTED'), [involvedPlans, participantMap]);
  const skippedPlans = useMemo(() => filterByStatus('SKIPPED'), [involvedPlans, participantMap]);

  const joinedCount = joinedPlans.length;
  const waitlistedCount = waitlistedPlans.length;
  const skippedCount = skippedPlans.length;

  const getPlanTimeLabel = (plan: Plan, section: 'today' | 'tomorrow' | 'thisWeek' | 'later' | 'past'): string => {
    return formatPlanDate(plan.datetime || plan.createdAt);
  };

  const renderPlanRow = (plan: Plan, section: 'today' | 'tomorrow' | 'thisWeek' | 'later' | 'past') => {
    const timeLabel = getPlanTimeLabel(plan, section);

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

          {/* Content details side-by-side */}
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

  const renderGroupedPlans = (plansList: Plan[]) => {
    const groups = groupPlansByDate(plansList);

    // If viewing SKIPPED, ensure plans that fell into groups.past are still included (e.g. under TODAY)
    const todayPlans = plansFilter === 'SKIPPED' ? [...groups.today, ...groups.past] : groups.today;

    const sectionsToRender = [
      { id: 'today' as const, label: 'TODAY', plans: todayPlans },
      { id: 'tomorrow' as const, label: 'TOMORROW', plans: groups.tomorrow },
      { id: 'thisWeek' as const, label: 'THIS WEEK', plans: groups.thisWeek },
      { id: 'later' as const, label: 'LATER', plans: groups.later },
      ...(plansFilter !== 'SKIPPED' ? [{ id: 'past' as const, label: 'PAST', plans: groups.past }] : []),
    ];

    const activeSections = sectionsToRender.filter(s => s.plans.length > 0);

    if (activeSections.length === 0) {
      let emptyIcon = <CalendarCheck className="w-8 h-8 text-emerald-400 stroke-[1.5]" />;
      let emptyTitle = "No joined plans yet";
      let emptyDesc = "Join a plan to see it here";

      if (plansFilter === 'WAITLISTED') {
        emptyIcon = <Hourglass className="w-8 h-8 text-amber-400 stroke-[1.5]" />;
        emptyTitle = "No waitlisted plans";
        emptyDesc = "Plans with a waiting list appear here";
      } else if (plansFilter === 'SKIPPED') {
        emptyIcon = <Coffee className="w-8 h-8 text-rose-400 stroke-[1.5]" />;
        emptyTitle = "Nothing skipped";
        emptyDesc = "Plans you've chosen to skip are kept here";
      }

      return (
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDesc}
          py="py-0"
        />
      );
    }

    return (
      <div className="space-y-4">
        {activeSections.map((sec) => (
          <div key={sec.id} className="space-y-2.5">
            {/* Section Header */}
            <div className="flex items-center gap-3 w-full mt-2 mb-1.5 select-none">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500"></span>
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
              {sec.plans.map((plan) => renderPlanRow(plan, sec.id))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden h-full bg-[#050505] text-left">
      {/* Scrollable Container */}
      <div
        onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}
        className="flex-1 flex flex-col overflow-y-auto scrollbar-none px-6 pt-0 pb-6"
      >

        <PlansDivider
          selected={plansFilter}
          counts={{
            joined: joinedCount,
            waitlisted: waitlistedCount,
            skipped: skippedCount,
          }}
          onSelect={setPlansFilter}
        />

        {/* Active Tab Screen Area */}
        <div className="flex-1 flex flex-col">
          {plansFilter === 'JOINED' && renderGroupedPlans(joinedPlans)}

          {plansFilter === 'WAITLISTED' && renderGroupedPlans(waitlistedPlans)}

          {plansFilter === 'SKIPPED' && renderGroupedPlans(skippedPlans)}
        </div>

      </div>
    </div>
  );
});
