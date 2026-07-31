import React, { useState, useMemo } from "react";
import { ArrowLeft, Search, X, ChevronRight, Inbox, Crown, CalendarCheck, Hourglass, Coffee, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import { Plan } from "../../../../core/types";
import { normalizeStatus } from "../../../../../lib/participantStatus";
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

  // Derive allMyUserIds for participant lookup
  const allMyUserIds = useMemo(() => {
    const ids = new Set<string>();
    const resolvedUserUuid = userProfile?.dbUuid || (userProfile as any)?.id || "";
    if (resolvedUserUuid) ids.add(resolvedUserUuid);
    if (userProfile?.user_id) ids.add(userProfile.user_id);
    return ids;
  }, [userProfile]);

  // Build participantMap for current user
  const participantMap = useMemo(() => {
    const map = new Map<string, any>();
    (dbPlanParticipants || []).forEach((pp) => {
      if (pp.user_id && allMyUserIds.has(pp.user_id) && pp.plan_id) {
        map.set(pp.plan_id, pp);
      }
    });
    return map;
  }, [dbPlanParticipants, allMyUserIds]);

  // Get all relevant user plans across all collections using Priority Order:
  // 1. Cancelled
  // 2. Host
  // 3. Going
  // 4. Waitlist
  // 5. Skipped
  // 6. Invited
  const allUserPlansWithCollection = useMemo(() => {
    const userUuid = userProfile?.dbUuid || (userProfile as any)?.id || "";

    return plans.flatMap((p) => {
      const isCancelled = (p.status || "").toUpperCase() === "CANCELLED";

      const myParticipant = participantMap.get(p.id) || (p.dbUuid ? participantMap.get(p.dbUuid) : undefined);
      const rsvpStatus = myParticipant ? normalizeStatus(myParticipant.rsvp_status) : "";

      const isHost = myParticipant?.role === "HOST" || p.hostId === userUuid || p.creatorId === userUuid;
      const isMember = p.members.some((m) => m.userUuid && m.userUuid === userUuid);

      // Priority 1: Cancelled
      if (isCancelled) {
        if (!isHost) return []; // Cancelled plans only accessible to host
        return [{
          plan: p,
          relationship: "CANCELLED" as const,
        }];
      }

      // Priority 2: Host
      if (isHost) {
        return [{
          plan: p,
          relationship: "HOST" as const,
        }];
      }

      // Priority 3: Going
      if (rsvpStatus === "JOINED" || (isMember && !myParticipant)) {
        return [{
          plan: p,
          relationship: "GOING" as const,
        }];
      }

      // Priority 4: Waitlist
      if (rsvpStatus === "WAITLISTED") {
        return [{
          plan: p,
          relationship: "WAITLIST" as const,
        }];
      }

      // Priority 5: Skipped
      if (rsvpStatus === "SKIPPED") {
        return [{
          plan: p,
          relationship: "SKIPPED" as const,
        }];
      }

      // Priority 6: Invited
      const rawRsvp = (myParticipant?.rsvp_status || "").toUpperCase();
      if (rsvpStatus === "INVITED" || rawRsvp === "PENDING" || (myParticipant && !rsvpStatus)) {
        return [{
          plan: p,
          relationship: "INVITED" as const,
        }];
      }

      return [];
    });
  }, [plans, participantMap, userProfile]);

  const getPlanScheduledDateTime = (plan: Plan): Date => {
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

  // Filter and sort plans based on the search query, sorted by scheduled datetime ASC (earliest scheduled plan top)
  const filteredPlans = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const matches = !query
      ? allUserPlansWithCollection
      : allUserPlansWithCollection.filter(({ plan: p }) => {
          const planCircle = p.circleId ? circles.find((c) => c.id === p.circleId) : null;
          const circleName = planCircle?.name || "";
          const hostName = p.creatorName || "";

          return (
            p.title.toLowerCase().includes(query) ||
            (p.location && p.location.toLowerCase().includes(query)) ||
            circleName.toLowerCase().includes(query) ||
            hostName.toLowerCase().includes(query)
          );
        });

    return [...matches].sort((a, b) => {
      const timeA = getPlanScheduledDateTime(a.plan).getTime();
      const timeB = getPlanScheduledDateTime(b.plan).getTime();
      return timeA - timeB;
    });
  }, [allUserPlansWithCollection, circles, searchQuery]);

  const handleBackClick = () => {
    if (searchQuery) {
      setSearchQuery("");
    } else {
      onBack();
    }
  };

  const renderPlanRow = (plan: Plan, relationship: "CANCELLED" | "HOST" | "GOING" | "WAITLIST" | "SKIPPED" | "INVITED") => {
    const timeLabel = formatPlanDate(plan.datetime || plan.createdAt);

    if (relationship === "CANCELLED") {
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
          <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-3">
            {/* Thumbnail circle avatar matching CancelledPlans.tsx */}
            <div className="w-[44px] h-[44px] rounded-full overflow-hidden border border-[#DC2626]/30 shadow-md flex-shrink-0 relative bg-zinc-955">
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
              <h3 className="font-sans font-semibold text-[14px] text-white/80 tracking-wide truncate line-through">
                {plan.title}
              </h3>
              <span className="text-[11px] text-[#8E8E93] font-sans font-medium">
                {timeLabel}
              </span>
            </div>
          </div>

          {/* Right-aligned Status Badge */}
          <div className="flex items-center flex-shrink-0">
            <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md bg-[#DC2626]/10 border border-[#DC2626]/20 text-[#F87171] text-[11px] font-medium leading-none shrink-0">
              <X className="w-3 h-3 text-[#F87171]" /> Cancelled
            </span>
          </div>
        </motion.div>
      );
    }

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
        <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-3">
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

        {/* Right-aligned Status Badge */}
        <div className="flex items-center flex-shrink-0">
          {relationship === "HOST" && (
            <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md bg-white/[0.05] border border-white/[0.18] text-white text-[11px] font-medium leading-none shrink-0">
              <Crown className="w-3 h-3 text-white" /> Host
            </span>
          )}
          {relationship === "GOING" && (
            <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md bg-[#10B981]/[0.08] border border-[#10B981]/20 text-[#10B981] text-[11px] font-medium leading-none shrink-0">
              <CalendarCheck className="w-3 h-3 text-[#10B981]" /> Going
            </span>
          )}
          {relationship === "WAITLIST" && (
            <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md bg-[#F59E0B]/[0.08] border border-[#F59E0B]/20 text-[#F59E0B] text-[11px] font-medium leading-none shrink-0">
              <Hourglass className="w-3 h-3 text-[#F59E0B]" /> Waitlist
            </span>
          )}
          {relationship === "SKIPPED" && (
            <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md bg-[#EF4444]/[0.08] border border-[#EF4444]/20 text-[#EF4444] text-[11px] font-medium leading-none shrink-0">
              <Coffee className="w-3 h-3 text-[#EF4444]" /> Skipped
            </span>
          )}
          {relationship === "INVITED" && (
            <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md bg-[#9CA3AF]/[0.08] border border-[#9CA3AF]/20 text-[#9CA3AF] text-[11px] font-medium leading-none shrink-0">
              <UserPlus className="w-3 h-3 text-[#9CA3AF]" /> Invited
            </span>
          )}
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
      <header className="px-5 pt-4 pb-1.5 flex items-center z-10 shrink-0 bg-[#000000]">
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
      <div className="flex-1 overflow-y-auto px-5 pb-8 pt-0">
        {filteredPlans.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 pt-16">
            <EmptyState
              icon={<Inbox className="w-8 h-8 text-zinc-600 stroke-[1.5]" />}
              title="No matching plans"
              description="Try searching by plan name, location, or host."
              py="py-24"
            />
          </div>
        ) : (
          <div className="space-y-2.5 pt-0">
            {filteredPlans.map(({ plan, relationship }) =>
              renderPlanRow(plan, relationship)
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
