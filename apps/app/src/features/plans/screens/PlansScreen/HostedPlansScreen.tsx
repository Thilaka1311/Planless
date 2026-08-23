import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight, Crown, Sparkles, History, Search } from "lucide-react";
import { motion } from "motion/react";
import { Plan, DbPlanParticipant } from "../../../../core/types";
import { normalizeStatus } from "../../../../../lib/participantStatus";
import { formatPlanDate } from "../../../../../lib/mappers";
import { usePlansStore } from "../../state/PlansContext";
import { useProfileStore } from "../../../profile/state/ProfileContext";
import { EmptyState } from "../../../home/components/EmptyState";
import { getPlanCover } from "../../config/planCoverImages";
import { DiscoveryImages } from "../../../../IMGfromDB/PlanImages";
import { CancelledPlans } from "./CancelledPlans";

interface HostedPlansScreenProps {
  onBack: () => void;
  setSelectedPlanId: (planId: string | null) => void;
  onTogglePast?: () => void;
  onToggleSearch?: () => void;
  onScroll?: (y: number) => void;
}

export const HostedPlansScreen = React.memo(({
  onBack,
  setSelectedPlanId,
  onTogglePast,
  onToggleSearch,
  onScroll,
}: HostedPlansScreenProps) => {
  const { plans, dbPlanParticipants } = usePlansStore();
  const { userProfile, activeUserId } = useProfileStore();

  const userUuid = userProfile?.dbUuid || (userProfile as any)?.id || activeUserId || "";

  const actionButtonClass = (isActive: boolean) =>
    `w-8 h-8 rounded-full flex items-center justify-center relative cursor-pointer transition-all active:scale-95 ${
      isActive
        ? "text-amber-400 bg-amber-500/10 border border-amber-500/20"
        : "text-zinc-400 hover:text-white hover:bg-white/[0.06]"
    }`;

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

  const hostedPlans = useMemo(() => {
    return plans.filter((p) => {
      if ((p.status || "").toUpperCase() === "CANCELLED" || (p.status || "").toUpperCase() === "COMPLETED") return false;
      const myParticipant = participantMap.get(p.id) || (p.dbUuid ? participantMap.get(p.dbUuid) : undefined);
      const rsvpStatus = normalizeStatus(myParticipant?.rsvp_status);
      const isJoined = rsvpStatus === "JOINED";
      const isHostRole = myParticipant?.role === "HOST" || p.hostId === userUuid || p.creatorId === userUuid;
      return isHostRole && isJoined;
    });
  }, [plans, participantMap, userUuid]);

  const cancelledPlansCount = useMemo(() => {
    return plans.filter((p) => {
      if ((p.status || "").toUpperCase() !== "CANCELLED") return false;
      const myParticipant = participantMap.get(p.id) || (p.dbUuid ? participantMap.get(p.dbUuid) : undefined);
      const isHostRole = myParticipant?.role === "HOST" || p.hostId === userUuid || p.creatorId === userUuid;
      return isHostRole;
    }).length;
  }, [plans, participantMap, userUuid]);

  const renderPlanRow = (plan: Plan, section: string) => {
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
          <div className="w-[44px] h-[44px] rounded-full overflow-hidden border border-amber-500/20 shadow-md flex-shrink-0 relative bg-zinc-955">
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
            <div className="flex items-center gap-2">
              <h3 className="font-sans font-semibold text-[14px] text-white tracking-wide truncate">
                {plan.title}
              </h3>
              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300">
                <Crown className="w-2.5 h-2.5" /> HOST
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
          icon={<Sparkles className="w-8 h-8 text-amber-400 stroke-[1.5]" />}
          title="You haven't hosted a plan yet"
          description="Host a plan to see it here"
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
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
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

  const [showCancelledPlans, setShowCancelledPlans] = React.useState(false);

  if (showCancelledPlans) {
    return (
      <CancelledPlans
        onBack={() => setShowCancelledPlans(false)}
        setSelectedPlanId={setSelectedPlanId}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-none justify-between">
      {/* Header matching secondary screens (PastPlans & CancelledPlans) */}
      <div className="bg-black/40 backdrop-blur-xl border-b border-white/10 px-4 py-3.5 flex items-center justify-between flex-shrink-0 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-white/10 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white active:scale-95 transition cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-white tracking-wide text-center">
          Hosted Plans
        </h1>
        <div className="w-9" />
      </div>

      {/* Scrollable Content Container */}
      <div
        onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}
        className="flex-1 flex flex-col overflow-y-auto scrollbar-none px-6 pt-2 pb-6"
      >
        {renderGroupedPlans(hostedPlans)}
      </div>

      {/* Fixed Bottom Footer Action — Only rendered when cancelled plans exist */}
      {cancelledPlansCount > 0 && (
        <div className="flex-shrink-0 border-t border-white/[0.08] bg-[#050505]/95 backdrop-blur-md px-6 py-3.5 z-20">
          <button
            type="button"
            onClick={() => setShowCancelledPlans(true)}
            className="w-full group flex items-center justify-between py-1 text-[13px] font-sans font-medium text-white/50 hover:text-white/80 active:text-white transition-colors cursor-pointer select-none text-left"
          >
            <span>View Cancelled Plans</span>
            <ChevronRight className="w-4 h-4 text-white/40 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all" />
          </button>
        </div>
      )}
    </div>
  );
});
