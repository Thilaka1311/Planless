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
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { usePlansStore } from "../../plans/state/PlansContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { supabase } from "../../../../lib/supabaseClient";
import { DbPlanActivity, PlanActivityType } from "../../../core/types";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";

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

const getAccentColor = (type: ActivityEvent["type"]): string | null => {
  switch (type) {
    case "participant_moved_to_going":
    case "participant_promoted":
      return "#22C55E"; // emerald green
    case "participant_moved_to_waitlist":
    case "participant_waitlisted":
      return "#FBBF24"; // amber yellow
    case "participant_removed":
    case "participant_skipped" as any:
      return "#EF4444"; // red
    default:
      return null;
  }
};

const ActivityRow: React.FC<{ event: ActivityEvent; opacity: any }> = ({ event, opacity }) => {
  const accentColor = getAccentColor(event.type);

  return (
    <div className="relative rounded-xl w-full overflow-visible">
      {/* Stationary Timestamp Gutter — positioned right of the card with a 16px gap */}
      {/* right-[-74px] = 58px gutter width + 16px gap from card edge */}
      <div className="absolute inset-y-0 right-[-74px] flex items-center w-[58px] pointer-events-none z-0">
        <motion.span
          style={{ opacity }}
          className="text-[11px] font-mono text-zinc-400 tracking-tight whitespace-nowrap w-full text-left"
        >
          {event.timeText}
        </motion.span>
      </div>

      {/* Activity Card */}
      <div className="flex items-start gap-3 py-2.5 px-3.5 rounded-xl bg-zinc-900/40 border border-white/[0.04] hover:bg-zinc-900/80 transition duration-150 select-none bg-[#050505] shadow-sm relative z-10 w-full overflow-hidden">
        {/* Colored accent strip — left edge, full card height, rounded-left corners */}
        {accentColor && (
          <div
            className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl"
            style={{ backgroundColor: accentColor }}
            aria-hidden="true"
          />
        )}

        {/* Leading Icon / Avatar Container */}
        <div className="flex-shrink-0 mt-0.5">
          {event.isUserEvent ? (
            <UserAvatar
              src={event.userAvatarSrc}
              alt={event.primaryTitle}
              size="w-9 h-9"
              className="border border-white/10 shadow-sm"
            />
          ) : (
            <div className="p-2.5 rounded-lg bg-zinc-800/80 border border-white/5 flex items-center justify-center">
              <EventIcon type={event.type} />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 py-0.5">
          {/* Primary Title: Person or Event Name */}
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
}) => {
  const { plans } = usePlansStore();
  const { userProfile, activeUserId, dbUsers } = useProfileStore();

  const [rawActivities, setRawActivities] = useState<DbPlanActivity[]>([]);
  const [loading, setLoading] = useState(true);

  // Single shared MotionValue controlling raw drag translation across the entire timeline
  const dragX = useMotionValue(0);

  // Reveal distance: 74px = 58px gutter width + 16px gap on each side (card→ts + ts→screen edge)
  const MAX_REVEAL_DISTANCE = 74;

  // Clamped display translation: hard-stop at -74px
  const displayX = useTransform(dragX, (val) => {
    if (val >= 0) return 0; // Left pull only
    return Math.max(-MAX_REVEAL_DISTANCE, val);
  });

  // Derived timestamp column opacity mapped directly from MotionValue (0 re-renders)
  const timestampOpacity = useTransform(displayX, (x) => {
    const visualDisplacement = Math.abs(x);
    if (visualDisplacement < 5) return 0;
    return Math.min(1, (visualDisplacement - 5) / 35);
  });

  // Single-fire haptic feedback reference
  const hapticFiredRef = useRef(false);

  // Evaluate haptics via MotionValue change listener without re-rendering component
  useEffect(() => {
    const unsubscribe = displayX.on("change", (latestX) => {
      const visualDisplacement = Math.abs(latestX);
      if (visualDisplacement >= 52 && !hapticFiredRef.current) {
        hapticFiredRef.current = true;
        if (typeof window !== "undefined" && window.navigator && "vibrate" in window.navigator) {
          try {
            window.navigator.vibrate(10);
          } catch {}
        }
      } else if (visualDisplacement < 20) {
        hapticFiredRef.current = false;
      }
    });

    return () => unsubscribe();
  }, [displayX]);

  const plan = useMemo(() => {
    if (!planId) return undefined;
    return plans.find((p) => p.id === planId || p.dbUuid === planId);
  }, [plans, planId]);

  const targetPlanTitle = propPlanTitle || plan?.title || "Plan Activity";
  const targetPlanId = plan?.dbUuid || plan?.id || planId;

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
        console.error("[ActivityTimelineScreen] Error fetching plan activities:", error);
        setLoading(false);
        return;
      }

      setRawActivities(data || []);
    } catch (err) {
      console.error("[ActivityTimelineScreen] Unexpected error fetching activities:", err);
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
        () => {
          fetchActivities();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetPlanId, fetchActivities]);

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
        case "participant_removed":
          primaryTitle = targetDetails.name || "Participant";
          secondaryDescription = actorDetails.name ? `Removed from the plan by ${actorDetails.name}` : "Removed from the plan";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar;
          break;
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
    <div className="flex-1 overflow-y-auto px-4 pb-6 touch-pan-y relative" style={{ overflowX: "clip" }}>
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

              {/* Cards for this section — slide left/right with swipe gesture when standalone */}
              {embedded ? (
                <div className="relative z-10 w-full space-y-2 pt-2 overflow-visible">
                  {groupedEvents[dateGroup].map((event) => (
                    <ActivityRow key={event.id} event={event} opacity={timestampOpacity} />
                  ))}
                </div>
              ) : (
                <motion.div
                  drag="x"
                  dragConstraints={{ left: -74, right: 0 }}
                  dragElastic={0}
                  dragMomentum={false}
                  onDrag={(_, info) => {
                    dragX.set(info.offset.x);
                  }}
                  onDragEnd={(_, info) => {
                    const releaseVelocity = info.velocity.x;
                    animate(dragX, 0, {
                      type: "spring",
                      stiffness: 500,
                      damping: 28,
                      mass: 0.7,
                      velocity: releaseVelocity,
                    });
                  }}
                  style={{ x: displayX, willChange: "transform" }}
                  className="relative z-10 w-full space-y-2 pt-2 overflow-visible"
                >
                  {groupedEvents[dateGroup].map((event) => (
                    <ActivityRow key={event.id} event={event} opacity={timestampOpacity} />
                  ))}
                </motion.div>
              )}
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
