import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  UserX,
  UserPlus,
  UserCheck,
  Crown,
  Activity,
  Calendar,
  MapPin,
  AlertCircle,
  RefreshCw,
  SquarePen,
  UsersRound,
  IndianRupee,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { usePlansStore } from "../../plans/state/PlansContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { supabase } from "../../../../lib/supabaseClient";
import { DbPlanActivity, PlanActivityType } from "../../../core/types";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { useTimestampReveal } from "../hooks/useTimestampReveal";
import { useActivityCache } from "../hooks/useChatCache";

export interface ActivityEvent {
  id: string;
  type: PlanActivityType | "capacity_collapsed";
  primaryTitle: string; // Person / Entity name (Single line)
  secondaryDescription: string; // Action & Details (Multi-line)
  isUserEvent?: boolean; // True if primaryTitle represents a user
  userAvatarSrc?: string | null; // Avatar URL if title represents a user
  timeText: string; // "10:06 AM"
  dateText: string; // "Today", "Yesterday", "Jul 31, 2026"
  dateGroup: string; // Grouping key
  rawDate: Date;
}

interface ActivityTimelineScreenProps {
  planId?: string;
  planTitle?: string;
  onBack?: () => void;
  embedded?: boolean;
  dragX?: any;
}

const formatExactTime = (d: Date): string => {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const formatDateGroup = (d: Date): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const eventDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (eventDay.getTime() === today.getTime()) return "Today";
  if (eventDay.getTime() === yesterday.getTime()) return "Yesterday";

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const formatDateSubtext = (d: Date): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const eventDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (eventDay.getTime() === today.getTime()) return "Today";
  if (eventDay.getTime() === yesterday.getTime()) return "Yesterday";

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const EventIcon: React.FC<{ type: ActivityEvent["type"] }> = ({ type }) => {
  switch (type) {
    // ── PLAN EVENTS ──
    case "plan_created":
      return <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    case "capacity_changed":
    case "capacity_collapsed":
      return <UsersRound className="w-4 h-4 text-blue-400 flex-shrink-0" />;
    case "host_transferred":
      return <Crown className="w-4 h-4 text-amber-300 flex-shrink-0" />;
    case "date_changed":
      return <Calendar className="w-4 h-4 text-white flex-shrink-0" />;
    case "time_changed":
      return <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />;
    case "location_changed":
      return <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />;
    case "title_changed":
      return <SquarePen className="w-4 h-4 text-white flex-shrink-0" />;
    case "description_changed":
      return <SquarePen className="w-4 h-4 text-zinc-300 flex-shrink-0" />;
    case "cost_changed":
      return <IndianRupee className="w-4 h-4 text-green-500 flex-shrink-0" />;
    case "plan_cancelled":
      return <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />;
    case "plan_restored":
      return <RefreshCw className="w-4 h-4 text-green-400 flex-shrink-0" />;
    case "plan_completed":
      return <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />;

    // ── PARTICIPANT EVENTS ──
    case "participant_invited":
      return <UserPlus className="w-4 h-4 text-blue-400 flex-shrink-0" />;
    case "participant_joined":
      return <UserCheck className="w-4 h-4 text-green-400 flex-shrink-0" />;
    case "participant_left":
      return <UserX className="w-4 h-4 text-zinc-400 flex-shrink-0" />;
    case "participant_waitlisted":
      return <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    case "participant_moved_to_waitlist":
      return <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    case "participant_moved_to_going":
      return <UserCheck className="w-4 h-4 text-green-400 flex-shrink-0" />;
    case "participant_promoted":
      return <UserCheck className="w-4 h-4 text-green-400 flex-shrink-0" />;
    case "host_promoted":
      return <Crown className="w-4 h-4 text-amber-300 flex-shrink-0" />;
    case "participant_removed":
      return <UserX className="w-4 h-4 text-zinc-400 flex-shrink-0" />;

    default:
      return <Activity className="w-4 h-4 text-zinc-400 flex-shrink-0" />;
  }
};

const ActivityRow: React.FC<{ event: ActivityEvent; opacity: any }> = ({ event, opacity }) => {
  return (
    <div className="flex items-center gap-3 w-full relative group">
      {/* Right-aligned sliding timestamp column — revealed during swipe */}
      <div className="absolute left-[100%] ml-4 top-1/2 -translate-y-1/2 flex flex-col items-start w-[58px] pointer-events-none select-none flex-shrink-0">
        <motion.span
          style={{ opacity }}
          className="text-[11px] font-mono font-semibold text-zinc-300 leading-tight whitespace-nowrap"
        >
          {event.timeText}
        </motion.span>
      </div>

      {/* Main Activity Card */}
      <div className="flex-1 bg-zinc-900/80 border border-white/[0.06] rounded-2xl p-3.5 flex items-start gap-3 shadow-md hover:border-white/10 transition-colors">
        {/* Left Avatar / Icon indicator */}
        <div className="mt-0.5 flex-shrink-0">
          {event.isUserEvent && event.userAvatarSrc !== undefined ? (
            <UserAvatar
              src={event.userAvatarSrc}
              alt={event.primaryTitle}
              size="w-7 h-7"
              className="rounded-full border border-white/10"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center">
              <EventIcon type={event.type} />
            </div>
          )}
        </div>

        {/* Text details */}
        <div className="flex-1 min-w-0">
          {/* Primary Title: Person / Entity Name - Single Line */}
          <h4 className="text-[14px] font-sans font-semibold text-white/95 leading-snug whitespace-nowrap overflow-hidden truncate">
            {event.primaryTitle}
          </h4>

          {/* Secondary Description: Action / Details - Multi-line */}
          <p className="text-[12.5px] font-sans text-zinc-300 leading-snug mt-0.5 break-words">
            {event.secondaryDescription}
          </p>
        </div>
      </div>
    </div>
  );
};

export const ActivityTimelineScreen: React.FC<ActivityTimelineScreenProps> = ({
  planId,
  planTitle: propPlanTitle,
  onBack,
  embedded = false,
  dragX: externalDragX,
}) => {
  const { plans } = usePlansStore();
  const { userProfile, activeUserId, dbUsers } = useProfileStore();

  const plan = useMemo(() => {
    if (!planId) return undefined;
    return plans.find((p) => p.id === planId || p.dbUuid === planId);
  }, [plans, planId]);

  const targetPlanTitle = propPlanTitle || plan?.title || "Plan Activity";
  const targetPlanId = plan?.dbUuid || plan?.id || planId || "";

  // Persistent in-memory Activity Timeline Cache hook
  const { rawActivities, loading } = useActivityCache(targetPlanId);

  // Use dedicated useTimestampReveal hook for gesture interaction & derived transforms
  const { displayX, timestampOpacity, dragProps } = useTimestampReveal({
    embedded,
    externalDragX,
  });

  // Helper to resolve user details (name & avatar) by UUID or public_id
  const resolveUserDetails = useCallback(
    (userId?: string | null, isTargetUser: boolean = false): { name: string; avatar?: string | null } => {
      if (!userId) return { name: "" };

      const matchUser = dbUsers.find(
        (u) => u.id === userId || u.public_id === userId || (u as any).user_id === userId || (u as any).dbUuid === userId
      );
      if (matchUser) {
        return {
          name: matchUser.full_name || (matchUser as any).name || "Someone",
          avatar:
            (matchUser as any).avatar ||
            (matchUser as any).profile_photo ||
            (matchUser as any).profile_photo_path ||
            (matchUser as any).profile_image_url ||
            (matchUser as any).avatar_url,
        };
      }

      if (plan?.members) {
        const matchMember = plan.members.find(
          (m) => m.userId === userId || m.userUuid === userId || (m as any).id === userId || (m as any).user_id === userId
        );
        if (matchMember) {
          return {
            name: matchMember.name || "Someone",
            avatar: matchMember.avatar || (matchMember as any).profile_photo || (matchMember as any).profile_photo_path,
          };
        }
      }

      if (
        userId === userProfile?.dbUuid ||
        userId === (userProfile as any)?.id ||
        userId === (userProfile as any)?.user_id ||
        userId === activeUserId
      ) {
        return {
          name: isTargetUser ? (userProfile?.name || "You") : (userProfile?.name || "You"),
          avatar:
            (userProfile as any)?.avatar ||
            (userProfile as any)?.profile_photo ||
            (userProfile as any)?.profile_photo_path ||
            (userProfile as any)?.profile_image_url ||
            (userProfile as any)?.avatar_url,
        };
      }

      return { name: "Someone", avatar: null };
    },
    [dbUsers, userProfile, activeUserId, plan]
  );

  // Format description strings from DbPlanActivity rows & collapse consecutive capacity events
  const activities = useMemo<ActivityEvent[]>(() => {
    const planName = plan?.title || "Plan";

    // Convert raw activities into uncollapsed items (newest to oldest)
    const uncollapsed: ActivityEvent[] = rawActivities.map((act) => {
      const actorDetails = act.actor_id ? resolveUserDetails(act.actor_id, false) : { name: "" };
      const targetDetails = act.target_user_id ? resolveUserDetails(act.target_user_id, true) : { name: "" };
      const meta = act.metadata || {};

      let primaryTitle = "";
      let secondaryDescription = "";
      let isUserEvent = false;
      let userAvatarSrc: string | null | undefined = undefined;

      switch (act.activity_type) {
        case "plan_created":
          primaryTitle = planName;
          secondaryDescription = actorDetails.name ? `Plan created by ${actorDetails.name}` : "Plan created";
          break;
        case "participant_invited":
          primaryTitle = targetDetails.name || "Participant";
          secondaryDescription = actorDetails.name ? `Invited by ${actorDetails.name}` : "Invited to the plan";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar;
          break;
        case "participant_joined":
          primaryTitle = targetDetails.name || actorDetails.name || "Someone";
          secondaryDescription = "Joined the plan";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar || actorDetails.avatar;
          break;
        case "participant_left":
          primaryTitle = targetDetails.name || actorDetails.name || "Someone";
          secondaryDescription = "Left the plan";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar || actorDetails.avatar;
          break;
        case "participant_waitlisted":
          primaryTitle = targetDetails.name || actorDetails.name || "Someone";
          secondaryDescription = "Joined the waitlist";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar || actorDetails.avatar;
          break;
        case "participant_moved_to_waitlist":
          primaryTitle = targetDetails.name || "Participant";
          secondaryDescription = actorDetails.name ? `Moved to the waitlist by ${actorDetails.name}` : "Moved to the waitlist";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar;
          break;
        case "participant_moved_to_going":
          primaryTitle = targetDetails.name || "Participant";
          secondaryDescription = actorDetails.name ? `Moved to Going by ${actorDetails.name}` : "Moved to Going";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar;
          break;
        case "participant_promoted":
          primaryTitle = targetDetails.name || "Participant";
          secondaryDescription = actorDetails.name ? `Moved to Going by ${actorDetails.name}` : "Moved to Going";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar;
          break;
        case "host_promoted":
          primaryTitle = targetDetails.name || "Participant";
          secondaryDescription = actorDetails.name ? `Promoted to Host by ${actorDetails.name}` : "Promoted to Host";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar;
          break;
        case "participant_removed": {
          const isSelfRemoval = !act.actor_id || act.actor_id === act.target_user_id;
          primaryTitle = targetDetails.name || actorDetails.name || "Participant";
          if (isSelfRemoval) {
            secondaryDescription = "Left the plan";
          } else {
            secondaryDescription = actorDetails.name ? `Removed from the plan by ${actorDetails.name}` : "Removed from the plan";
          }
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar || actorDetails.avatar;
          break;
        }
        case "invitation_accepted":
          primaryTitle = targetDetails.name || actorDetails.name || "Someone";
          secondaryDescription = "Accepted the invitation";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar || actorDetails.avatar;
          break;
        case "invitation_declined":
          primaryTitle = targetDetails.name || actorDetails.name || "Someone";
          secondaryDescription = "Declined the invitation";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar || actorDetails.avatar;
          break;
        case "capacity_changed":
          primaryTitle = "Capacity";
          if (meta.old_capacity !== undefined && meta.new_capacity !== undefined) {
            const isIncrease = meta.new_capacity > meta.old_capacity;
            secondaryDescription = `${isIncrease ? "Increased" : "Decreased"} from ${meta.old_capacity} → ${meta.new_capacity} participants`;
          } else {
            secondaryDescription = "Capacity changed";
          }
          break;
        case "title_changed":
          primaryTitle = planName;
          secondaryDescription = meta.old_title && meta.new_title
            ? `Title changed\n"${meta.old_title}" → "${meta.new_title}"`
            : meta.new_title
            ? `Title changed to "${meta.new_title}"`
            : "Title changed";
          break;
        case "description_changed":
          primaryTitle = planName;
          secondaryDescription = actorDetails.name ? `Description changed by ${actorDetails.name}` : "Description changed";
          break;
        case "date_changed":
          primaryTitle = "Plan Date";
          secondaryDescription = meta.old_date && meta.new_date
            ? `Changed from ${meta.old_date} → ${meta.new_date}`
            : meta.old_scheduled_at && meta.new_scheduled_at
            ? `Changed from ${new Date(meta.old_scheduled_at).toLocaleDateString()} → ${new Date(meta.new_scheduled_at).toLocaleDateString()}`
            : actorDetails.name
            ? `Date changed by ${actorDetails.name}`
            : "Plan date changed";
          break;
        case "time_changed":
          primaryTitle = "Plan Time";
          secondaryDescription = meta.old_time && meta.new_time
            ? `Changed from ${meta.old_time} → ${meta.new_time}`
            : actorDetails.name
            ? `Time changed by ${actorDetails.name}`
            : "Plan time changed";
          break;
        case "location_changed":
          primaryTitle = planName;
          secondaryDescription = meta.old_location && meta.new_location
            ? `Location changed\n${meta.old_location} → ${meta.new_location}`
            : meta.new_location
            ? `Location changed\n${meta.new_location}`
            : "Location changed";
          break;
        case "host_transferred":
          primaryTitle = "Host";
          secondaryDescription = actorDetails.name && targetDetails.name
            ? `Transferred from ${actorDetails.name} → ${targetDetails.name}`
            : targetDetails.name
            ? `Transferred to ${targetDetails.name}`
            : "Host changed";
          break;
        case "plan_cancelled":
          primaryTitle = planName;
          secondaryDescription = actorDetails.name ? `Plan cancelled by ${actorDetails.name}` : "Plan cancelled";
          break;
        case "plan_restored":
          primaryTitle = planName;
          secondaryDescription = actorDetails.name ? `Plan restored by ${actorDetails.name}` : "Plan restored";
          break;
        case "plan_completed":
          primaryTitle = planName;
          secondaryDescription = "Plan completed";
          break;
        default:
          primaryTitle = planName;
          secondaryDescription = "Plan activity updated";
          break;
      }

      const rawDate = act.created_at ? new Date(act.created_at) : new Date();
      const validDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;

      return {
        id: act.id,
        type: act.activity_type,
        primaryTitle,
        secondaryDescription,
        isUserEvent,
        userAvatarSrc,
        timeText: formatExactTime(validDate),
        dateText: formatDateSubtext(validDate),
        dateGroup: formatDateGroup(validDate),
        rawDate: validDate,
      };
    });

    // Collapse consecutive capacity_changed events (rawActivities is newest to oldest)
    const result: ActivityEvent[] = [];
    let i = 0;
    while (i < uncollapsed.length) {
      if (uncollapsed[i].type === "capacity_changed") {
        const capacityGroup: DbPlanActivity[] = [];
        let j = i;
        while (j < uncollapsed.length && uncollapsed[j].type === "capacity_changed") {
          capacityGroup.push(rawActivities[j]);
          j++;
        }

        if (capacityGroup.length === 1) {
          result.push(uncollapsed[i]);
        } else {
          const oldestMeta = capacityGroup[capacityGroup.length - 1].metadata || {};
          const chain: (number | string)[] = [];

          if (oldestMeta.old_capacity !== undefined) {
            chain.push(oldestMeta.old_capacity);
          }

          for (let k = capacityGroup.length - 1; k >= 0; k--) {
            const m = capacityGroup[k].metadata || {};
            if (m.new_capacity !== undefined) {
              chain.push(m.new_capacity);
            }
          }

          const mostRecentEvent = uncollapsed[i];
          result.push({
            id: mostRecentEvent.id,
            type: "capacity_collapsed",
            primaryTitle: "Capacity",
            secondaryDescription: chain.length > 0
              ? `Changed multiple times (${chain.join(" → ")})`
              : "Capacity changed multiple times",
            timeText: mostRecentEvent.timeText,
            dateText: mostRecentEvent.dateText,
            dateGroup: mostRecentEvent.dateGroup,
            rawDate: mostRecentEvent.rawDate,
          });
        }

        i = j;
      } else {
        result.push(uncollapsed[i]);
        i++;
      }
    }

    return result;
  }, [rawActivities, resolveUserDetails, plan]);

  // Group activities chronologically by dateGroup (preserving newest first order)
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

  const content = (
    <div
      className="flex-1 overflow-y-auto px-4 pb-6 touch-pan-y relative select-none"
      style={{ overflowX: "clip" }}
    >
      {loading ? (
        <div className="space-y-3 pt-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-16 w-full rounded-xl bg-zinc-900/60 border border-white/[0.04] animate-pulse"
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
        <div className="space-y-0 pb-2">
          {dateGroups.map((dateGroup) => (
            <div key={dateGroup}>
              {/* Sticky date section header — NOT inside the sliding motion.div so it never translates */}
              <div className="sticky top-0 z-20 pt-2.5 pb-1.5 bg-[#050505] border-b border-white/[0.04] -mx-4 px-4">
                <span className="text-[11px] font-mono font-bold tracking-wider text-zinc-400 uppercase">
                  {dateGroup}
                </span>
              </div>

              {/* Cards for this section — immediate native left-drag swipe to reveal timestamps */}
              <motion.div
                {...dragProps}
                style={{ x: displayX, willChange: "transform", touchAction: "pan-y" }}
                className="relative z-10 w-full space-y-2 pt-2 overflow-visible"
              >
                {groupedEvents[dateGroup].map((event) => (
                  <ActivityRow key={event.id} event={event} opacity={timestampOpacity} />
                ))}
              </motion.div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (embedded) {
    return <div className="flex-1 flex flex-col h-full overflow-hidden text-left font-sans select-none">{content}</div>;
  }

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

      {content}
    </motion.div>
  );
};
