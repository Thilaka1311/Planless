import React from "react";
import {
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  UserX,
  UserPlus,
  UserCheck,
  TrendingUp,
  Crown,
  Activity,
} from "lucide-react";
import { motion } from "motion/react";
import { usePlansStore } from "../../plans/state/PlansContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { normalizeStatus } from "../../../../lib/participantStatus";

export type ActivityEventType =
  | "plan_created"
  | "participant_joined"
  | "participant_left"
  | "joined_waitlist"
  | "promoted_from_waitlist"
  | "removed_by_host"
  | "invited"
  | "invitation_accepted"
  | "invitation_declined"
  | "capacity_changed"
  | "host_transferred";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  description: string;
  timestamp: string; // e.g. "10:42 AM"
  dateGroup: string; // e.g. "Today", "Yesterday", "July 29"
  rawDate: Date;
  metadata?: {
    userName?: string;
    targetUserName?: string;
    previousCapacity?: number;
    newCapacity?: number;
  };
}

interface ActivityTimelineScreenProps {
  planId?: string;
  planTitle?: string;
  events?: ActivityEvent[];
  onBack?: () => void;
}

const formatDateGroup = (d: Date): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const eventDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (eventDay.getTime() === today.getTime()) return "Today";
  if (eventDay.getTime() === yesterday.getTime()) return "Yesterday";

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const formatEventTime = (d: Date): string => {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const EventIcon: React.FC<{ type: ActivityEventType }> = ({ type }) => {
  switch (type) {
    case "plan_created":
    case "participant_joined":
    case "invitation_accepted":
      return <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
    case "participant_left":
    case "invitation_declined":
      return <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />;
    case "joined_waitlist":
      return <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    case "promoted_from_waitlist":
      return <ArrowUpRight className="w-4 h-4 text-sky-400 flex-shrink-0" />;
    case "removed_by_host":
      return <UserX className="w-4 h-4 text-rose-400 flex-shrink-0" />;
    case "invited":
      return <UserPlus className="w-4 h-4 text-purple-400 flex-shrink-0" />;
    case "capacity_changed":
      return <TrendingUp className="w-4 h-4 text-indigo-400 flex-shrink-0" />;
    case "host_transferred":
      return <Crown className="w-4 h-4 text-amber-300 flex-shrink-0" />;
    default:
      return <UserCheck className="w-4 h-4 text-zinc-400 flex-shrink-0" />;
  }
};

const ActivityRow: React.FC<{ event: ActivityEvent }> = ({ event }) => {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-zinc-900/40 border border-white/[0.04] hover:bg-zinc-900/80 transition duration-150">
      <div className="p-1.5 rounded-lg bg-zinc-800/80 border border-white/5">
        <EventIcon type={event.type} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-sans text-zinc-200 truncate">
          {event.description}
        </p>
      </div>
      <span className="text-[11px] font-mono text-zinc-500 flex-shrink-0">
        {event.timestamp}
      </span>
    </div>
  );
};

export const ActivityTimelineScreen: React.FC<ActivityTimelineScreenProps> = ({
  planId,
  planTitle: propPlanTitle,
  events: propEvents,
  onBack,
}) => {
  const { plans, dbPlanParticipants } = usePlansStore();
  const { userProfile, activeUserId, dbUsers } = useProfileStore();
  const [loading, setLoading] = React.useState(!propEvents);

  const [activeSegment, setActiveSegment] = React.useState<"participants" | "plans">("participants");

  const plan = React.useMemo(() => {
    if (!planId) return undefined;
    return plans.find((p) => p.id === planId || p.dbUuid === planId);
  }, [plans, planId]);

  const targetPlanTitle = propPlanTitle || plan?.title || "Plan Activity";

  // Derive real ActivityEvent[] from DB records if propEvents is not passed
  const derivedEvents = React.useMemo<ActivityEvent[]>(() => {
    if (propEvents) return propEvents;
    if (!plan) return [];

    const targetPlanId = plan.dbUuid || plan.id;
    const items: ActivityEvent[] = [];

    // Helper to resolve user display name
    const getUserName = (userId: string): string => {
      const matchUser = dbUsers.find(
        (u) => u.id === userId || u.public_id === userId
      );
      if (matchUser?.full_name) return matchUser.full_name;

      const matchMember = (plan.members || []).find(
        (m) => m.userId === userId || m.userUuid === userId
      );
      if (matchMember?.name) return matchMember.name;

      if (
        userId === userProfile?.dbUuid ||
        userId === (userProfile as any)?.id ||
        userId === activeUserId
      ) {
        return userProfile?.name || "You";
      }

      return "Someone";
    };

    // 1. Plan Events
    if (plan.createdAt) {
      const createdDate = new Date(plan.createdAt);
      if (!isNaN(createdDate.getTime())) {
        let hostName = (plan.creatorName || "").trim();
        if (!hostName) {
          hostName = getUserName(plan.hostId || plan.creatorId);
        }
        items.push({
          id: `act-created-${targetPlanId}`,
          type: "plan_created",
          description: `${hostName || "Host"} created ${plan.title}`,
          timestamp: formatEventTime(createdDate),
          dateGroup: formatDateGroup(createdDate),
          rawDate: createdDate,
          metadata: { userName: hostName },
        });
      }
    }

    // 2. Participant Events from dbPlanParticipants
    const targetParticipants = dbPlanParticipants.filter(
      (pp) => pp.plan_id === targetPlanId || pp.plan_id === plan.id
    );

    targetParticipants.forEach((pp) => {
      const status = normalizeStatus(pp.rsvp_status);
      const isHostRole =
        pp.role === "HOST" ||
        pp.user_id === plan.hostId ||
        pp.user_id === plan.creatorId;

      const rawTimeStr = pp.responded_at || pp.created_at || pp.joined_queue_at || plan.createdAt;
      const eventDate = rawTimeStr ? new Date(rawTimeStr) : new Date();
      const validDate = isNaN(eventDate.getTime()) ? new Date() : eventDate;

      const name = getUserName(pp.user_id);

      if (status === "JOINED" && !isHostRole) {
        items.push({
          id: `act-joined-${pp.id}`,
          type: "participant_joined",
          description: `${name} joined the plan`,
          timestamp: formatEventTime(validDate),
          dateGroup: formatDateGroup(validDate),
          rawDate: validDate,
          metadata: { userName: name },
        });
      } else if (status === "WAITLISTED") {
        items.push({
          id: `act-waitlist-${pp.id}`,
          type: "joined_waitlist",
          description: `${name} joined the waitlist`,
          timestamp: formatEventTime(validDate),
          dateGroup: formatDateGroup(validDate),
          rawDate: validDate,
          metadata: { userName: name },
        });
      } else if (status === "INVITED" && !isHostRole) {
        items.push({
          id: `act-invited-${pp.id}`,
          type: "invited",
          description: `${name} was invited`,
          timestamp: formatEventTime(validDate),
          dateGroup: formatDateGroup(validDate),
          rawDate: validDate,
          metadata: { userName: name },
        });
      } else if (status === "SKIPPED") {
        const isRemoved = pp.skip_reason === "REMOVED";
        items.push({
          id: `act-left-${pp.id}`,
          type: isRemoved ? "removed_by_host" : "participant_left",
          description: isRemoved
            ? `${name} was removed by host`
            : `${name} left the plan`,
          timestamp: formatEventTime(validDate),
          dateGroup: formatDateGroup(validDate),
          rawDate: validDate,
          metadata: { userName: name },
        });
      }
    });

    // Sort descending by rawDate (newest first)
    return items.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());
  }, [propEvents, plan, dbPlanParticipants, dbUsers, userProfile, activeUserId]);

  // Filter events based on active segment tab
  const filteredEvents = React.useMemo(() => {
    const isPlanEvent = (type: ActivityEventType) =>
      type === "plan_created" ||
      type === "capacity_changed" ||
      type === "host_transferred";

    return derivedEvents.filter((evt) => {
      if (activeSegment === "plans") {
        return isPlanEvent(evt.type);
      }
      return !isPlanEvent(evt.type);
    });
  }, [derivedEvents, activeSegment]);

  // Group filtered events chronologically by dateGroup
  const groupedEvents = React.useMemo(() => {
    const groups: { [date: string]: ActivityEvent[] } = {};
    filteredEvents.forEach((evt) => {
      if (!groups[evt.dateGroup]) {
        groups[evt.dateGroup] = [];
      }
      groups[evt.dateGroup].push(evt);
    });
    return groups;
  }, [filteredEvents]);

  const dateGroups = Object.keys(groupedEvents);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-none"
    >
      {/* Standard Header */}
      <div className="relative z-30 bg-black/40 backdrop-blur-xl border-b border-white/10 shadow-lg py-3 pt-[calc(0.875rem+env(safe-area-inset-top,0px))] px-4 flex-shrink-0">
        <div className="w-full flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 flex items-center justify-center text-white active:scale-95 transition-transform cursor-pointer flex-shrink-0"
            style={{ minWidth: "44px", minHeight: "44px" }}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col min-w-0 flex-1">
            <h1 className="text-[16px] font-semibold text-white truncate">
              Activity
            </h1>
            <p className="text-[12px] text-zinc-400 truncate font-medium">
              {targetPlanTitle}
            </p>
          </div>
        </div>

        {/* Segmented Control: Plans | Participants */}
        <div className="mt-3 relative flex items-center bg-white/[0.05] border border-white/[0.08] p-1 rounded-2xl h-10">
          <div
            className="absolute top-1 bottom-1 rounded-xl bg-white/15 border border-white/10 shadow-md transition-all duration-250 ease-out"
            style={{
              width: "calc(50% - 4px)",
              left: activeSegment === "plans" ? "4px" : "calc(50% + 0px)",
            }}
          />
          <button
            type="button"
            onClick={() => setActiveSegment("plans")}
            className={`flex-1 z-10 text-[12px] font-medium transition-colors text-center cursor-pointer ${
              activeSegment === "plans" ? "text-white font-semibold" : "text-zinc-400"
            }`}
          >
            Plans
          </button>
          <button
            type="button"
            onClick={() => setActiveSegment("participants")}
            className={`flex-1 z-10 text-[12px] font-medium transition-colors text-center cursor-pointer ${
              activeSegment === "participants" ? "text-white font-semibold" : "text-zinc-400"
            }`}
          >
            Participants
          </button>
        </div>
      </div>

      {/* Timeline Content / Contextual Empty State */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {filteredEvents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 my-auto">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center mb-3">
              <Activity className="w-6 h-6 text-zinc-500" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">
              {activeSegment === "plans"
                ? "No plan activity yet"
                : "No participant activity yet"}
            </h3>
            <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
              {activeSegment === "plans"
                ? "Plan updates and changes will appear here."
                : "Participant joins and invitations will appear here."}
            </p>
          </div>
        ) : (
          dateGroups.map((dateGroup) => (
            <div key={dateGroup} className="space-y-2">
              <div className="sticky top-0 z-10 py-1 bg-[#050505]/90 backdrop-blur-md">
                <span className="text-[11px] font-mono font-semibold tracking-wider text-zinc-400 uppercase">
                  {dateGroup}
                </span>
              </div>
              <div className="space-y-2">
                {groupedEvents[dateGroup].map((event) => (
                  <ActivityRow key={event.id} event={event} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};
