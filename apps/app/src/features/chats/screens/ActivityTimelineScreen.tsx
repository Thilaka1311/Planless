import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  Sparkles,
  Calendar,
  MapPin,
  AlertCircle,
  RefreshCw,
  FileText,
} from "lucide-react";
import { motion } from "motion/react";
import { usePlansStore } from "../../plans/state/PlansContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { supabase } from "../../../../lib/supabaseClient";
import { DbPlanActivity, PlanActivityType } from "../../../core/types";

export interface ActivityEvent {
  id: string;
  type: PlanActivityType;
  description: string;
  timestamp: string; // e.g. "10:42 AM"
  dateGroup: string; // e.g. "Today", "Yesterday", "July 29"
  rawDate: Date;
}

interface ActivityTimelineScreenProps {
  planId?: string;
  planTitle?: string;
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

const EventIcon: React.FC<{ type: PlanActivityType }> = ({ type }) => {
  switch (type) {
    // ── PLAN EVENTS ──
    case "plan_created":
      return <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    case "capacity_changed":
      return <TrendingUp className="w-4 h-4 text-indigo-400 flex-shrink-0" />;
    case "host_transferred":
      return <Crown className="w-4 h-4 text-amber-300 flex-shrink-0" />;
    case "date_changed":
    case "time_changed":
      return <Calendar className="w-4 h-4 text-blue-400 flex-shrink-0" />;
    case "location_changed":
      return <MapPin className="w-4 h-4 text-rose-400 flex-shrink-0" />;
    case "title_changed":
    case "description_changed":
      return <FileText className="w-4 h-4 text-zinc-300 flex-shrink-0" />;
    case "plan_cancelled":
      return <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />;
    case "plan_restored":
      return <RefreshCw className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
    case "plan_completed":
      return <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />;

    // ── PARTICIPANT EVENTS ──
    case "participant_joined":
    case "invitation_accepted":
      return <UserCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
    case "participant_left":
    case "invitation_declined":
      return <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />;
    case "participant_waitlisted":
    case "participant_moved_to_waitlist":
      return <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    case "participant_promoted":
    case "participant_moved_to_going":
      return <ArrowUpRight className="w-4 h-4 text-sky-400 flex-shrink-0" />;
    case "participant_removed":
      return <UserX className="w-4 h-4 text-rose-400 flex-shrink-0" />;
    case "participant_invited":
      return <UserPlus className="w-4 h-4 text-purple-400 flex-shrink-0" />;
    default:
      return <Activity className="w-4 h-4 text-zinc-400 flex-shrink-0" />;
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
  onBack,
}) => {
  const { plans } = usePlansStore();
  const { userProfile, activeUserId, dbUsers } = useProfileStore();

  const [rawActivities, setRawActivities] = useState<DbPlanActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const plan = useMemo(() => {
    if (!planId) return undefined;
    return plans.find((p) => p.id === planId || p.dbUuid === planId);
  }, [plans, planId]);

  const targetPlanTitle = propPlanTitle || plan?.title || "Plan Activity";
  const targetPlanId = plan?.dbUuid || plan?.id || planId;

  // Helper to resolve user display name by UUID or public_id
  const resolveUserName = useCallback(
    (userId?: string | null, isTargetUser: boolean = false): string => {
      if (!userId) return "";

      const matchUser = dbUsers.find(
        (u) => u.id === userId || u.public_id === userId
      );
      if (matchUser?.full_name) return matchUser.full_name;

      if (plan?.members) {
        const matchMember = plan.members.find(
          (m) => m.userId === userId || m.userUuid === userId
        );
        if (matchMember?.name) return matchMember.name;
      }

      if (
        userId === userProfile?.dbUuid ||
        userId === (userProfile as any)?.id ||
        userId === activeUserId
      ) {
        return isTargetUser ? (userProfile?.name || "You") : (userProfile?.name || "You");
      }

      return "Someone";
    },
    [dbUsers, userProfile, activeUserId, plan]
  );

  // Fetch activities directly from plan_activity table in Supabase
  const fetchActivities = useCallback(async () => {
    if (!targetPlanId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("plan_activity")
        .select("*")
        .eq("plan_id", targetPlanId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[ActivityTimelineScreen] Error fetching plan_activity:", error);
      } else if (data) {
        setRawActivities(data as DbPlanActivity[]);
      }
    } catch (err) {
      console.error("[ActivityTimelineScreen] Exception fetching plan_activity:", err);
    } finally {
      setLoading(false);
    }
  }, [targetPlanId]);

  useEffect(() => {
    fetchActivities();

    if (!targetPlanId) return;

    // Realtime subscription to plan_activity inserts for this plan
    const channel = supabase
      .channel(`plan_activity:${targetPlanId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "plan_activity",
          filter: `plan_id=eq.${targetPlanId}`,
        },
        (payload) => {
          const newRow = payload.new as DbPlanActivity;
          setRawActivities((prev) => [newRow, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetPlanId, fetchActivities]);

  // Format description strings from DbPlanActivity rows
  const activities = useMemo<ActivityEvent[]>(() => {
    return rawActivities.map((act) => {
      const actorName = act.actor_id ? resolveUserName(act.actor_id, false) : "";
      const targetName = act.target_user_id ? resolveUserName(act.target_user_id, true) : "";
      const meta = act.metadata || {};

      let description = "";

      switch (act.activity_type) {
        case "plan_created":
          description = `${actorName || "Host"} created ${meta.title || plan?.title || "the plan"}`;
          break;
        case "participant_invited":
          description = targetName ? `${targetName} was invited` : `${actorName || "Host"} invited a participant`;
          break;
        case "participant_joined":
          description = `${targetName || actorName || "Someone"} joined the plan`;
          break;
        case "participant_left":
          description = `${targetName || actorName || "Someone"} left the plan`;
          break;
        case "participant_waitlisted":
          description = `${targetName || actorName || "Someone"} joined the waitlist`;
          break;
        case "participant_moved_to_waitlist":
          description = actorName && targetName
            ? `${actorName} moved ${targetName} to the waitlist`
            : targetName
            ? `Moved ${targetName} to the waitlist`
            : "Participant moved to the waitlist";
          break;
        case "participant_moved_to_going":
          description = actorName && targetName
            ? `${actorName} moved ${targetName} to Going`
            : targetName
            ? `Moved ${targetName} to Going`
            : "Participant moved to Going";
          break;
        case "participant_promoted":
          description = targetName ? `${targetName} moved from the waitlist` : `${actorName || "Host"} promoted a participant`;
          break;
        case "participant_removed":
          description = targetName && actorName
            ? `${targetName} was removed by ${actorName}`
            : targetName
            ? `${targetName} was removed by host`
            : "Participant was removed";
          break;
        case "invitation_accepted":
          description = `${targetName || actorName || "Someone"} accepted the invitation`;
          break;
        case "invitation_declined":
          description = `${targetName || actorName || "Someone"} declined the invitation`;
          break;
        case "capacity_changed":
          if (meta.old_capacity !== undefined && meta.new_capacity !== undefined) {
            const verb = meta.new_capacity > meta.old_capacity ? "increased" : "decreased";
            description = `Capacity ${verb} from ${meta.old_capacity} → ${meta.new_capacity}`;
          } else {
            description = `Plan capacity changed`;
          }
          break;
        case "title_changed":
          description = meta.new_title ? `Title changed to "${meta.new_title}"` : `Plan title updated`;
          break;
        case "description_changed":
          description = `Plan description updated`;
          break;
        case "date_changed":
        case "time_changed":
          description = `Plan schedule updated`;
          break;
        case "location_changed":
          description = meta.new_location ? `Location changed to ${meta.new_location}` : `Plan location updated`;
          break;
        case "host_transferred":
          description = targetName ? `${targetName} became the host` : `Host transferred`;
          break;
        case "plan_cancelled":
          description = `Plan was cancelled`;
          break;
        case "plan_restored":
          description = `Plan was restored`;
          break;
        case "plan_completed":
          description = `Plan was completed`;
          break;
        default:
          description = `Plan activity updated`;
          break;
      }

      const rawDate = act.created_at ? new Date(act.created_at) : new Date();
      const validDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;

      return {
        id: act.id,
        type: act.activity_type,
        description,
        timestamp: formatEventTime(validDate),
        dateGroup: formatDateGroup(validDate),
        rawDate: validDate,
      };
    });
  }, [rawActivities, resolveUserName, plan]);

  // Group activities chronologically by dateGroup
  const groupedEvents = useMemo(() => {
    const groups: { [date: string]: ActivityEvent[] } = {};
    activities.forEach((evt) => {
      if (!groups[evt.dateGroup]) {
        groups[evt.dateGroup] = [];
      }
      groups[evt.dateGroup].push(evt);
    });
    return groups;
  }, [activities]);

  const dateGroups = Object.keys(groupedEvents);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-[70] bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-none"
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
      </div>

      {/* Timeline Content / Loading / Empty State */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {loading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-12 w-full rounded-xl bg-zinc-900/60 border border-white/[0.04] animate-pulse"
              />
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 my-auto">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center mb-3">
              <Activity className="w-6 h-6 text-zinc-500" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">
              No activity yet
            </h3>
            <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
              Activity will appear here as people join, leave, get invited, and as the host manages the plan.
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

