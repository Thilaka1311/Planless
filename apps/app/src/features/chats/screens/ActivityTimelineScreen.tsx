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
  ArrowLeftRight,
} from "lucide-react";
import { motion } from "motion/react";
import { usePlansStore } from "../../plans/state/PlansContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { useToast } from "../../../shared/contexts/ToastContext";
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
  accentEdgeColor?: string; // Optional full-height left edge colour (e.g. yellow for waitlist)
  leaveRequestData?: {
    targetUserId: string;
    participantName: string;
    isPending: boolean;
    resolution?: 'REPLACED' | 'KEEP_PAYMENT';
  };
  swapData?: {
    goingUser: { name: string; avatar?: string | null };
    waitlistUser: { name: string; avatar?: string | null };
    waitlistResult?: 'waitlist' | 'removed'; // 'removed' = remove-replace flow
    actorName?: string;
  };
  timeText: string; // "10:06 AM"
  dateText: string; // "Today", "Yesterday", "Jul 31, 2026"
  dateGroup: string; // Grouping key
  rawDate: Date;
  rawTargetUserId?: string | null;
  rawSkipReason?: string | null;
  rawMetadata?: any;
  isDisabled?: boolean;
}

interface ActivityTimelineScreenProps {
  planId?: string;
  planTitle?: string;
  onBack?: () => void;
  embedded?: boolean;
  dragX?: any;
  onOpenReplacePicker?: (targetUserId: string) => void;
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

const EventIcon: React.FC<{ type: ActivityEvent["type"]; isDisabled?: boolean }> = ({ type, isDisabled }) => {
  let iconNode: React.ReactNode = null;

  switch (type as any) {
    // ── PLAN EVENTS ──
    case "plan_created":
      iconNode = <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />;
      break;
    case "capacity_changed":
    case "capacity_collapsed":
      iconNode = <UsersRound className="w-4 h-4 text-blue-400 flex-shrink-0" />;
      break;
    case "participant_invite_others":
      iconNode = <UserPlus className="w-4 h-4 text-blue-400 flex-shrink-0" />;
      break;
    case "host_transferred":
      iconNode = <Crown className="w-4 h-4 text-amber-300 flex-shrink-0" />;
      break;
    case "date_changed":
      iconNode = <Calendar className="w-4 h-4 text-white flex-shrink-0" />;
      break;
    case "time_changed":
      iconNode = <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />;
      break;
    case "location_changed":
      iconNode = <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />;
      break;
    case "title_changed":
      iconNode = <SquarePen className="w-4 h-4 text-white flex-shrink-0" />;
      break;
    case "description_changed":
      iconNode = <SquarePen className="w-4 h-4 text-zinc-300 flex-shrink-0" />;
      break;
    case "cost_changed":
      iconNode = <IndianRupee className="w-4 h-4 text-green-500 flex-shrink-0" />;
      break;
    case "plan_cancelled":
      iconNode = <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />;
      break;
    case "plan_restored":
      iconNode = <RefreshCw className="w-4 h-4 text-green-400 flex-shrink-0" />;
      break;
    case "plan_completed":
      iconNode = <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />;
      break;

    // ── PARTICIPANT EVENTS ──
    case "participant_invited":
      iconNode = <UserPlus className="w-4 h-4 text-blue-400 flex-shrink-0" />;
      break;
    case "participant_joined":
      iconNode = <UserCheck className="w-4 h-4 text-green-400 flex-shrink-0" />;
      break;
    case "participant_left":
      iconNode = <UserX className="w-4 h-4 text-zinc-400 flex-shrink-0" />;
      break;
    case "participant_waitlisted":
      iconNode = <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />;
      break;
    case "participant_moved_to_waitlist":
      iconNode = <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />;
      break;
    case "participant_moved_to_joined":
    case "participant_moved_to_going":
      iconNode = <UserCheck className="w-4 h-4 text-green-400 flex-shrink-0" />;
      break;
    case "participant_promoted":
      iconNode = <UserCheck className="w-4 h-4 text-green-400 flex-shrink-0" />;
      break;
    case "host_promoted":
      iconNode = <Crown className="w-4 h-4 text-amber-300 flex-shrink-0" />;
      break;
    case "participant_removed":
      iconNode = <UserX className="w-4 h-4 text-zinc-400 flex-shrink-0" />;
      break;
    case "leave_requested":
      iconNode = <UserX className="w-4 h-4 text-amber-400 flex-shrink-0" />;
      break;

    default:
      iconNode = <Activity className="w-4 h-4 text-zinc-400 flex-shrink-0" />;
      break;
  }

  if (isDisabled) {
    return (
      <div className="relative flex items-center justify-center w-full h-full">
        {iconNode}
        {/* Diagonal white cancellation line extending across icon */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <line
            x1="1"
            y1="15"
            x2="15"
            y2="1"
            stroke="rgba(255, 255, 255, 0.75)"
            strokeWidth="0.65"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  return iconNode;
};

const ActivityRow: React.FC<{
  event: ActivityEvent;
  opacity: any;
  isHost?: boolean;
  onOpenReplacePicker?: (targetUserId: string) => void;
  onKeepPayment?: (targetUserId: string) => void;
}> = ({ event, opacity, isHost, onOpenReplacePicker, onKeepPayment }) => {
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
      {event.type === "participants_swapped" && event.swapData ? (
        (() => {
          const isRemoveReplace = event.swapData.waitlistResult === 'removed';
          const rightEdgeColor  = isRemoveReplace ? '#ef4444' : '#eab308';
          const rightStatusText = isRemoveReplace ? 'Removed' : 'Waitlist';
          const rightStatusColor = rightEdgeColor;
          return (
            /* Outer shell — no border, overflow-hidden clips to rounded corners */
            <div
              className="flex-1 flex select-none overflow-hidden shadow-sm"
              style={{ background: 'rgba(24, 24, 27, 0.82)', borderRadius: 16 }}
            >
              {/* ── LEFT GREEN EDGE ── */}
              <div style={{ width: 3, flexShrink: 0, background: '#22c55e' }} />

              {/* ── CARD BODY ── */}
              <div className="flex flex-col flex-1 min-w-0 py-2.5 px-0">

                {/* Participant row */}
                <div className="flex items-center gap-1.5 px-2.5">

                  {/* Going participant (left) */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-full border border-white/10 overflow-hidden flex-shrink-0 bg-[#1A1A1A]">
                      <UserAvatar
                        src={event.swapData.goingUser.avatar || ""}
                        alt={event.swapData.goingUser.name}
                        size="w-full h-full"
                      />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12.5px] font-semibold text-white/95 truncate leading-tight">
                        {event.swapData.goingUser.name}
                      </span>
                      <span className="text-[11px] font-medium leading-none" style={{ color: '#22c55e' }}>
                        Going
                      </span>
                    </div>
                  </div>

                  {/* Swap icon */}
                  <ArrowLeftRight className="w-3.5 h-3.5 text-white/60 flex-shrink-0" />

                  {/* Right participant */}
                  <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                    <div className="flex flex-col items-end min-w-0">
                      <span className="text-[12.5px] font-semibold text-white/95 truncate leading-tight">
                        {event.swapData.waitlistUser.name}
                      </span>
                      <span className="text-[11px] font-medium leading-none" style={{ color: rightStatusColor }}>
                        {rightStatusText}
                      </span>
                    </div>
                    <div className="w-9 h-9 rounded-full border border-white/10 overflow-hidden flex-shrink-0 bg-[#1A1A1A]">
                      <UserAvatar
                        src={event.swapData.waitlistUser.avatar || ""}
                        alt={event.swapData.waitlistUser.name}
                        size="w-full h-full"
                      />
                    </div>
                  </div>

                </div>

                {/* Footer */}
                <p className="text-[11px] text-zinc-500 px-2.5 mt-1.5 leading-none">
                  {event.swapData.actorName ? `Swapped by ${event.swapData.actorName}` : "Swapped participants"}
                </p>

              </div>

              {/* ── RIGHT EDGE — yellow for waitlist swap, red for remove-replace ── */}
              <div style={{ width: 3, flexShrink: 0, background: rightEdgeColor }} />

            </div>
          );
        })()
      ) : event.accentEdgeColor ? (
        /* Coloured-edge card (e.g. host-moved-to-waitlist = yellow) */
        <div
          className="flex-1 flex select-none overflow-hidden shadow-sm"
          style={{ background: 'rgba(24, 24, 27, 0.82)', borderRadius: 16 }}
        >
          {/* Full-height left accent edge */}
          <div style={{ width: 3, flexShrink: 0, background: event.accentEdgeColor }} />

          {/* Card body — mirrors the standard card layout */}
          <div className="flex flex-col flex-1 gap-2.5 px-3 py-3">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="mt-0.5 flex-shrink-0">
                {event.isUserEvent ? (
                  <div className="w-7 h-7 rounded-full border border-white/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                    <UserAvatar
                      src={event.userAvatarSrc || ""}
                      alt={event.primaryTitle}
                      size="w-full h-full"
                    />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center">
                    <EventIcon type={event.type} isDisabled={event.isDisabled} />
                  </div>
                )}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <h4 className="text-[14px] font-semibold text-white/95 leading-snug whitespace-nowrap overflow-hidden truncate">
                  {event.primaryTitle}
                </h4>
                <p className="text-[12.5px] text-zinc-300 leading-snug mt-0.5 break-words">
                  {event.secondaryDescription}
                </p>
              </div>
            </div>

          </div>
        </div>
      ) : (
        <div className="flex-1 bg-zinc-900/80 border border-white/[0.06] rounded-2xl p-3.5 flex items-start gap-3 shadow-md hover:border-white/10 transition-colors">
          {/* Left Avatar / Icon indicator */}
          <div className="mt-0.5 flex-shrink-0">
            {event.isUserEvent ? (
              <div className="w-7 h-7 rounded-full border border-white/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                <UserAvatar
                  src={event.userAvatarSrc || ""}
                  alt={event.primaryTitle}
                  size="w-full h-full"
                />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center">
                <EventIcon type={event.type} isDisabled={event.isDisabled} />
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
      )}
    </div>
  );
};

export const ActivityTimelineScreen: React.FC<ActivityTimelineScreenProps> = ({
  planId,
  planTitle: propPlanTitle,
  onBack,
  embedded = false,
  dragX: externalDragX,
  onOpenReplacePicker,
}) => {
  const { plans, dbPlanParticipants, resolvePaidPlanLeaveRequest } = usePlansStore();
  const { userProfile, activeUserId, dbUsers } = useProfileStore();
  const { showToast } = useToast();

  const plan = useMemo(() => {
    if (!planId) return undefined;
    return plans.find((p) => p.id === planId || p.dbUuid === planId);
  }, [plans, planId]);

  const isHost = useMemo(() => {
    if (!plan) return false;
    const userUuid = userProfile?.dbUuid || (userProfile as any)?.id || activeUserId;
    return plan.creatorId === userUuid || (plan as any).host_id === userUuid || (plan as any).creator_id === userUuid;
  }, [plan, userProfile, activeUserId]);

  const handleKeepPayment = useCallback(async (targetUserId: string) => {
    if (!plan || !resolvePaidPlanLeaveRequest) return;
    try {
      await resolvePaidPlanLeaveRequest(plan.id, targetUserId, 'KEEP_PAYMENT');
      showToast("Leave request resolved (Payment kept)");
    } catch (err) {
      console.error("[handleKeepPayment] Failed:", err);
      showToast("Failed to resolve leave request");
    }
  }, [plan, resolvePaidPlanLeaveRequest, showToast]);

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
    (userId?: string | null, isTargetUser: boolean = false, forceDisplayName: boolean = false): { name: string; avatar?: string | null } => {
      if (!userId) return { name: "" };

      // 1. Current logged-in user profile
      const userProfId = userProfile?.dbUuid || (userProfile as any)?.id || (userProfile as any)?.user_id || activeUserId;
      if (userId === userProfId || userId === activeUserId) {
        return {
          name: forceDisplayName ? (userProfile?.name || "You") : (isTargetUser ? (userProfile?.name || "You") : (userProfile?.name || "You")),
          avatar:
            (userProfile as any)?.avatar ||
            (userProfile as any)?.profile_photo ||
            (userProfile as any)?.profile_photo_path ||
            (userProfile as any)?.profile_image_url ||
            (userProfile as any)?.avatar_url,
        };
      }

      // 2. DbPlanParticipants with nested user_profile
      const matchPp = dbPlanParticipants.find(
        (pp: any) =>
          pp.user_id === userId ||
          pp.user_profile?.id === userId ||
          pp.user_profile?.public_id === userId
      );
      if (matchPp) {
        const uProf = (matchPp as any).user_profile;
        const name = uProf?.full_name || uProf?.name || (matchPp as any).name || "Someone";
        const avatar =
          uProf?.avatar ||
          uProf?.profile_photo ||
          uProf?.profile_photo_path ||
          uProf?.profile_image_url ||
          uProf?.avatar_url ||
          (matchPp as any).avatar;
        if (name !== "Someone" || avatar) {
          return { name, avatar };
        }
      }

      // 3. Global dbUsers list
      const matchUser = dbUsers.find(
        (u) => u.id === userId || (u as any).public_id === userId || (u as any).user_id === userId || (u as any).dbUuid === userId
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

      // 4. Plan members array
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

      // 5. Fallback: match by name in dbUsers or plan.members if userId is a name string
      const matchByName = dbUsers.find(u => u.full_name === userId || (u as any).name === userId) ||
        (plan?.members || []).find((m: any) => m.name === userId);
      if (matchByName) {
        return {
          name: (matchByName as any).full_name || (matchByName as any).name || userId,
          avatar: (matchByName as any).avatar || (matchByName as any).profile_photo || (matchByName as any).avatar_url,
        };
      }

      return { name: "Someone", avatar: null };
    },
    [dbUsers, userProfile, activeUserId, plan, dbPlanParticipants]
  );

  // Format description strings from DbPlanActivity rows & collapse consecutive capacity events
  const activities = useMemo<ActivityEvent[]>(() => {
    const planName = plan?.title || "Plan";
    const currentUserId = userProfile?.dbUuid || (userProfile as any)?.id || (userProfile as any)?.user_id || activeUserId;

    // Convert raw activities into uncollapsed items (newest to oldest)
    const uncollapsed: ActivityEvent[] = rawActivities.map((act) => {
      const actorDetails = act.actor_id ? resolveUserDetails(act.actor_id, false) : { name: "" };
      const targetDetails = act.target_user_id ? resolveUserDetails(act.target_user_id, true) : { name: "" };
      const meta = act.metadata || {};

      let primaryTitle = "";
      let secondaryDescription = "";
      let isUserEvent = false;
      let userAvatarSrc: string | null | undefined = undefined;
      let leaveRequestData: ActivityEvent["leaveRequestData"] = undefined;
      let swapData: ActivityEvent["swapData"] = undefined;
      let accentEdgeColor: string | undefined = undefined;
      let isDisabled: boolean | undefined = undefined;

      switch (act.activity_type as string) {
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
          userAvatarSrc = targetDetails.avatar;
          accentEdgeColor = "#22c55e"; // Green left edge
          break;
        case "participant_left": {
          if (meta.status === 'PENDING') {
            // Unresolved / pending leave requests belong exclusively in Host Pending Decisions, filter out
            return null;
          }

          const originalUserId = act.target_user_id || act.actor_id || "";
          const originalName = targetDetails.name || actorDetails.name || "Someone";
          const resolution = meta.resolution;

          if (meta.status === 'RESOLVED' && resolution === 'REPLACED') {
            const replacementUserId = meta.replacement_user_id;
            const replacementDetails = replacementUserId
              ? resolveUserDetails(replacementUserId, true, true)
              : { name: "Replacement", avatar: null };

            primaryTitle = `${originalName} was replaced`;
            secondaryDescription = `By ${replacementDetails.name || "Replacement"}`;
            userAvatarSrc = targetDetails.avatar || actorDetails.avatar;
            accentEdgeColor = "#ef4444";
          } else if (meta.status === 'RESOLVED' && resolution === 'KEEP_PAYMENT') {
            const isViewerOriginal = Boolean(originalUserId && currentUserId && (currentUserId === originalUserId));

            primaryTitle = isViewerOriginal ? "You left" : `${originalName} left`;
            secondaryDescription = "Payment Kept";
            accentEdgeColor = "#ef4444";
            userAvatarSrc = targetDetails.avatar || actorDetails.avatar;
          } else {
            if (meta.skip_reason === 'REPLACED') {
              return null;
            }
            const isViewerOriginal = Boolean(originalUserId && currentUserId && (currentUserId === originalUserId));
            primaryTitle = isViewerOriginal ? "You left" : `${originalName} left`;
            secondaryDescription = "Left the plan";
            isUserEvent = true;
            userAvatarSrc = targetDetails.avatar || actorDetails.avatar;
          }

          isUserEvent = true;
          leaveRequestData = {
            targetUserId: originalUserId,
            participantName: originalName,
            isPending: false,
            resolution: resolution as any,
          };
          break;
        }
        case "participant_added": {
          const participantName = meta.participant_name || targetDetails.name || "Participant";
          const participantAvatar = meta.participant_avatar_url ?? targetDetails.avatar;
          const actorName = meta.performed_by_name || actorDetails.name;
          const group = (meta.assigned_group || '').toLowerCase();
          const isGoing = group === 'going';

          const actionLabel = isGoing ? "Added to Going" : "Added to Waitlist";
          primaryTitle = participantName;
          secondaryDescription = actorName ? `${actionLabel} by ${actorName}` : actionLabel;
          isUserEvent = true;
          userAvatarSrc = participantAvatar;
          accentEdgeColor = isGoing ? '#22c55e' : '#eab308';
          break;
        }
        case "participant_moved_to_joined":
        case "participant_moved_to_going": {
          const participantName = targetDetails.name || actorDetails.name || "Participant";
          const actorName = actorDetails.name;
          primaryTitle = participantName;
          secondaryDescription = actorName && act.actor_id !== act.target_user_id
            ? `Moved to Joined by ${actorName}`
            : "Moved to Joined";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar;
          accentEdgeColor = "#22c55e";
          break;
        }
        case "participant_moved_to_waitlist": {
          const participantName = targetDetails.name || actorDetails.name || "Participant";
          const actorName = actorDetails.name;
          primaryTitle = participantName;
          secondaryDescription = actorName && act.actor_id !== act.target_user_id
            ? `Moved to Waitlist by ${actorName}`
            : "Moved to Waitlist";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar;
          accentEdgeColor = "#eab308";
          break;
        }
        case "participant_moved": {
          const isToWaitlist = (meta.to || '').toLowerCase() === 'waitlist';
          const participantName = targetDetails.name || actorDetails.name || "Participant";
          const actorName = meta.movedBy ? resolveUserDetails(meta.movedBy, false).name : actorDetails.name;
          const actionLabel = isToWaitlist ? "Moved to Waitlist" : "Moved to Joined";

          primaryTitle = participantName;
          secondaryDescription = actorName ? `${actionLabel} by ${actorName}` : actionLabel;
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar;
          accentEdgeColor = isToWaitlist ? '#eab308' : '#22c55e';
          break;
        }
        case "participant_waitlisted": {
          primaryTitle = targetDetails.name || actorDetails.name || "Someone";
          secondaryDescription = "Joined the waitlist";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar;
          break;
        }
        case "participant_promoted":
          primaryTitle = targetDetails.name || "Participant";
          secondaryDescription = actorDetails.name ? `Moved to Going by ${actorDetails.name}` : "Moved to Going";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar;
          // Use same green token as the Participant Swap going edge
          accentEdgeColor = '#22c55e';
          break;
        case "host_promoted":
          primaryTitle = targetDetails.name || "Participant";
          secondaryDescription = actorDetails.name ? `Promoted to Host by ${actorDetails.name}` : "Promoted to Host";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar;
          break;
        case "participant_removed": {
          if (meta.skip_reason === 'REPLACED') {
            // Suppress raw trigger event when participant was replaced
            return null;
          }
          const isSelfRemoval = !act.actor_id || act.actor_id === act.target_user_id;
          primaryTitle = targetDetails.name || actorDetails.name || "Participant";
          if (isSelfRemoval) {
            secondaryDescription = "Left the plan";
          } else {
            secondaryDescription = actorDetails.name ? `Removed from the plan by ${actorDetails.name}` : "Removed from the plan";
            // Use same red token as the Participant Swap removed edge
            accentEdgeColor = '#ef4444';
          }
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar;
          leaveRequestData = {
            targetUserId: act.target_user_id || act.actor_id || "",
            participantName: primaryTitle,
            isPending: false,
          };
          break;
        }
        case "invitation_accepted":
          primaryTitle = targetDetails.name || actorDetails.name || "Someone";
          secondaryDescription = "Accepted the invitation";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar;
          break;
        case "invitation_declined":
          primaryTitle = targetDetails.name || actorDetails.name || "Someone";
          secondaryDescription = "Declined the invitation";
          isUserEvent = true;
          userAvatarSrc = targetDetails.avatar;
          break;
        case "participants_swapped": {
          const goingId = meta.going_user_id || act.target_user_id;
          const waitlistId = meta.waitlist_user_id;
          const resolvedGoing = goingId ? resolveUserDetails(goingId, true) : { name: "Participant" };
          const resolvedWaitlist = waitlistId ? resolveUserDetails(waitlistId, true) : { name: "Participant" };

          const goingDetails = {
            name: meta.going_user_name || resolvedGoing.name,
            avatar: meta.going_avatar_url ?? resolvedGoing.avatar,
          };
          const waitlistDetails = {
            name: meta.waitlist_user_name || resolvedWaitlist.name,
            avatar: meta.waitlist_avatar_url ?? resolvedWaitlist.avatar,
          };
          const actorName = meta.performed_by_name || actorDetails.name;

          primaryTitle = `${goingDetails.name} ⇄ ${waitlistDetails.name}`;
          secondaryDescription = actorName ? `Swapped by ${actorName}` : "Swapped participants";
          isUserEvent = true;
          userAvatarSrc = goingDetails.avatar;
          swapData = {
            goingUser: goingDetails,
            waitlistUser: waitlistDetails,
            waitlistResult: meta.waitlist_result === 'removed' ? 'removed' : 'waitlist',
            actorName: actorName,
          };
          break;
        }

        case "participant_invite_others": {
          const actorName = meta.performed_by_name || actorDetails.name;
          const isEnabled = meta.enabled !== false; // Default to true if not explicitly false (backward-compatible)
          if (isEnabled) {
            primaryTitle = "Participants can invite others";
            secondaryDescription = actorName ? `Enabled by ${actorName}` : "Enabled by host";
          } else {
            primaryTitle = "Participants can no longer invite others";
            secondaryDescription = actorName ? `Disabled by ${actorName}` : "Disabled by host";
            isDisabled = true;
          }
          break;
        }
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
        accentEdgeColor,
        isDisabled,
        leaveRequestData,
        swapData,
        timeText: formatExactTime(validDate),
        dateText: formatDateSubtext(validDate),
        dateGroup: formatDateGroup(validDate),
        rawDate: validDate,
        rawTargetUserId: act.target_user_id || act.actor_id || null,
        rawSkipReason: meta.skip_reason || null,
        rawMetadata: meta,
      };
    }).filter(Boolean) as ActivityEvent[];

    // Deduplicate participant_invites_toggled: keep ONLY the single most recent change by timestamp (rawDate)
    let latestInviteOthersId: string | null = null;
    let maxInviteOthersTime = -1;

    uncollapsed.forEach((evt) => {
      if ((evt.type as string) === 'participant_invites_toggled' || (evt.type as string) === 'participant_invite_others') {
        const time = evt.rawDate.getTime();
        if (time > maxInviteOthersTime) {
          maxInviteOthersTime = time;
          latestInviteOthersId = evt.id;
        }
      }
    });

    // Collect set of target user IDs that have a resolved participant_left event
    const resolvedLeaveTargetUserIds = new Set<string>();
    const replacementUserIds = new Set<string>();
    uncollapsed.forEach((evt) => {
      if (evt.type === 'participant_left' && (evt as any).rawMetadata?.status === 'RESOLVED') {
        if (evt.leaveRequestData?.targetUserId) {
          resolvedLeaveTargetUserIds.add(evt.leaveRequestData.targetUserId);
        }
        if (evt.rawTargetUserId) {
          resolvedLeaveTargetUserIds.add(evt.rawTargetUserId);
        }
        // Extract replacement user ID from metadata
        const repId = (evt as any).rawMetadata?.replacement_user_id;
        if (repId) {
          replacementUserIds.add(repId);
        }
      }
    });

    const filtered = uncollapsed.filter((evt) => {
      if ((evt.type as string) === 'participant_invites_toggled' || (evt.type as string) === 'participant_invite_others') {
        return evt.id === latestInviteOthersId;
      }
      // Suppress raw participant_left / participant_removed for users with a resolved leave request or skip_reason
      if (evt.type === 'participant_left' || evt.type === 'participant_removed') {
        if (evt.rawSkipReason === 'REPLACED' || evt.rawSkipReason === 'LEFT') {
          return false;
        }
        if (evt.rawTargetUserId && resolvedLeaveTargetUserIds.has(evt.rawTargetUserId)) {
          return false;
        }
      }
      return true;
    });

    return filtered;
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
                  <ActivityRow
                    key={event.id}
                    event={event}
                    opacity={timestampOpacity}
                    isHost={isHost}
                    onOpenReplacePicker={onOpenReplacePicker}
                    onKeepPayment={handleKeepPayment}
                  />
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
