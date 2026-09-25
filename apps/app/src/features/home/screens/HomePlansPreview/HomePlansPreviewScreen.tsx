import React, { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CalendarDays, Hourglass, MapPin, MessageCircle, Receipt } from "lucide-react";
import { UserProfile, Plan } from "../../../../core/types";
import { usePlansStore } from "../../../plans/state/PlansContext";
import { useLivePlan } from "../../../plans/hooks/useLivePlan";
import { getPlanCover } from "../../../plans/config/planCoverImages";
import { formatPlanDate } from "../../../../../lib/mappers";
import { supabase } from "../../../../../lib/supabaseClient";
import { normalizeStatus } from "../../../../../lib/participantStatus";
import { DiscoveryImages } from "../../../../IMGfromDB/PlanImages";
import { HeroHeader } from "../../../plans/components/HeroHeader";
import { InlineParticipantView } from "../../../plans/components/InlineParticipantView";
import { CostBreakdownPopover } from "../../../plans/components/CostBreakdownPopover";
import { getHeroMetadataCostText } from "../../../plans/components/HeroMetadataCard";
import { useRSVPDeadline } from "../../../plans/utils/rsvpFormatter";
import { useLiveCountdown, rsvpUrgencyStyles } from "../../components/PlanCard";
import { useHoldToAccept } from "../../hooks/useHoldForStatus";
import { HoldToAcceptOverlay } from "../../components/HoldToAccept";
import TeamOrganizerModal from "../../../../shared/modals/TeamOrganizerModal";
import PlanCompletionModal from "../../../../shared/modals/PlanCompletionModal";
import { JoinPlanConfirmationBottomSheet, CancelLeaveRequestBottomSheet, LeavePlanBottomSheet, MakeAnotherParticipantHostBottomSheet, InvitedPlanActionsBottomSheet } from "../../../plans/components/BottomSheets";
import { LiveActionButton } from "../../../plans/components/LiveActionButton";
import { PlanSettingsScreen } from "../../../plans/screens/PlansScreen/PlansPreview/PlanSettingsScreen";
import { uploadPlanImage } from "../../../../shared/utils/imageUtils";
import { cleanPlanId } from "../../../plans/utils/planUtils";
import { getPlanPreviewCtaState } from "../../../plans/utils/planPreviewCtaUtils";
import { PlanChatScreen } from "../../../chats/screens/PlanChatScreen";
import { PlanDetailsScreen as PlanBalancesScreen } from "../../../wallet/screens/PlanBalances";

export interface PlansPreviewScreenProps {
  planId: string;
  onClose: () => void;
  userProfile: UserProfile;
  activeUserId?: string;
  onEditPlan?: (planId: string) => void;
  setShowPaymentSuccess?: (planId: string | null) => void;
  setShowWaitlistSuccess?: (planId: string | null) => void;
  setShowLeftSuccess?: (planId: string | null) => void;
  onLeavePlan?: () => void;
  onPlanCancelled?: (planId: string) => void;
  onOpenChat?: (planId: string) => void;
  onOpenExpenses?: (planId: string) => void;
}

export const PlansPreviewScreen: React.FC<PlansPreviewScreenProps> = ({
  planId,
  onClose,
  userProfile,
  activeUserId,
  setShowPaymentSuccess,
  setShowWaitlistSuccess,
  setShowLeftSuccess,
  onLeavePlan,
  onPlanCancelled,
  onOpenChat,
  onOpenExpenses,
}) => {
  const {
    dbPlans,
    dbPlanParticipants,
    joinPlan,
    skipPlan,
    requestPaidPlanLeave,
    requestHostLeaveWithReplacement,
    cancelPaidPlanLeaveRequest,
    rejoinPlan,
    updatePlanDetails,
    updatePlanSettings,
    demoteHostToParticipant,
    leavePlan,
    waitlistPlan,
  } = usePlansStore();
  const selectedPlan = useLivePlan(planId);

  const [isJoiningDirect, setIsJoiningDirect] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [showLeavePlanConfirm, setShowLeavePlanConfirm] = useState(false);
  const [showHostLeaveReplacementSheet, setShowHostLeaveReplacementSheet] = useState(false);
  const [isSubmittingHostReplacement, setIsSubmittingHostReplacement] = useState(false);
  const [isCostPopoverOpen, setIsCostPopoverOpen] = useState(false);
  const [showPlanSettingsScreen, setShowPlanSettingsScreen] = useState(false);
  const [showCompletionFlow, setShowCompletionFlow] = useState(false);
  const [showManageTeams, setShowManageTeams] = useState(false);
  const [selectedChatPlanId, setSelectedChatPlanId] = useState<string | null>(null);
  const [showPlanBalancesScreen, setShowPlanBalancesScreen] = useState(false);
  const [showPlanActionsSheet, setShowPlanActionsSheet] = useState(false);

  const resolvedUserUuid = userProfile.dbUuid || activeUserId || "";

  const rawDbPlan = useMemo(() => {
    if (!selectedPlan) return null;
    return dbPlans.find((p) => p.id === selectedPlan.id) || null;
  }, [dbPlans, selectedPlan]);

  const allHosts = useMemo(() => {
    if (!selectedPlan) return [];
    const activeHosts = selectedPlan.members.filter((m) => m.isHost);
    if (activeHosts.length > 0) {
      return activeHosts.map((h) => ({
        id: h.userUuid || h.userId,
        name: h.name || "Host",
        avatar: h.avatar,
        isCreator: (h.userUuid || h.userId) === selectedPlan.hostId,
      }));
    }
    return [
      {
        id: selectedPlan.hostId,
        name: selectedPlan.creatorName || "Host",
        avatar: selectedPlan.creatorAvatar,
        isCreator: true,
      },
    ];
  }, [selectedPlan]);

  const isHost = selectedPlan?.members
    ? selectedPlan.members.some(m => (m.userId === resolvedUserUuid || m.userUuid === resolvedUserUuid) && m.isHost)
    : false;

  const activeHostMembers = useMemo(() => {
    if (!selectedPlan?.members) return [];
    return selectedPlan.members.filter((m) => {
      const isHostRole = (m as any).role === "HOST" || m.isHost === true;
      const status = normalizeStatus(m.joinState || (m as any).rsvp_status);
      return isHostRole && status === "JOINED";
    });
  }, [selectedPlan?.members]);

  const isSoleHost = isHost && activeHostMembers.length <= 1;

  const eligibleHostReplacementParticipants = useMemo(() => {
    if (!selectedPlan?.members) return [];
    return selectedPlan.members
      .filter((m) => {
        const mId = m.userId || m.userUuid || (m as any).user_id || (m as any).id;
        const isCurrent = Boolean(resolvedUserUuid && mId === resolvedUserUuid);
        if (isCurrent) return false;

        const isHostRole = (m as any).role === "HOST" || m.isHost === true;
        if (isHostRole) return false;

        const status = normalizeStatus(m.joinState || (m as any).rsvp_status);
        return status === "JOINED";
      })
      .map((m) => {
        const mId = m.userId || m.userUuid || (m as any).user_id || (m as any).id;
        return {
          id: mId,
          name: m.name || (m as any).full_name || "Participant",
          avatar: m.avatar || (m as any).profile_photo_path,
          username: m.username
        };
      });
  }, [selectedPlan?.members, resolvedUserUuid]);

  const isCreatorHost = isHost;

  const rsvp = useRSVPDeadline(selectedPlan?.response_deadline_at);
  const urgencyColor = rsvp.color;

  const maxSpots = useMemo(() => {
    const raw =
      rawDbPlan?.plan_size ??
      selectedPlan?.plan_size ??
      (selectedPlan as any)?.planSize ??
      selectedPlan?.capacity ??
      selectedPlan?.joinLimit ??
      selectedPlan?.maxSpots;
    if (raw !== undefined && raw !== null && Number(raw) > 0) return Number(raw);
    if (!selectedPlan) return 8;
    return selectedPlan.category === "movies" ? 10 : selectedPlan.category === "sports" ? 14 : 8;
  }, [rawDbPlan, selectedPlan]);

  const currentCount = useMemo(() => {
    if (!selectedPlan) return 0;
    return selectedPlan.members.filter((m) => {
      const status = normalizeStatus(m.joinState || (m as any).rsvp_status);
      return status === "JOINED" || m.role === "HOST" || m.isHost === true;
    }).length;
  }, [selectedPlan]);

  const myMemberEntry = useMemo(() => {
    if (!selectedPlan) return null;
    return selectedPlan.members.find(
      (m) =>
        m.userId === userProfile.user_id ||
        (userProfile.dbUuid && m.userUuid === userProfile.dbUuid) ||
        (userProfile.user_id && m.userUuid === userProfile.user_id) ||
        (resolvedUserUuid && (m.userId === resolvedUserUuid || m.userUuid === resolvedUserUuid))
    );
  }, [selectedPlan, userProfile, resolvedUserUuid]);

  const myParticipantRecord = useMemo(() => {
    if (!selectedPlan || !resolvedUserUuid) return null;
    const planUuid = (selectedPlan as any)?.dbUuid || selectedPlan.id;
    return (
      dbPlanParticipants.find(
        (pp) =>
          (pp.plan_id === planUuid || pp.plan_id === selectedPlan.id) &&
          (pp.user_id === resolvedUserUuid || pp.user_id === userProfile.user_id)
      ) || null
    );
  }, [dbPlanParticipants, selectedPlan, resolvedUserUuid, userProfile.user_id]);

  const effectiveParticipantRecord = useMemo(() => {
    if (myParticipantRecord) {
      return {
        ...myParticipantRecord,
        rsvp_status: myParticipantRecord.rsvp_status || "INVITED",
      };
    }
    if (myMemberEntry) {
      return {
        ...myMemberEntry,
        rsvp_status: myMemberEntry.joinState || (myMemberEntry as any).rsvp_status || "INVITED",
      };
    }
    return { rsvp_status: "INVITED" };
  }, [myParticipantRecord, myMemberEntry]);

  const isAssignedMode = useMemo(() => {
    const rawMode =
      rawDbPlan?.participant_filtering ||
      selectedPlan?.participantFiltering ||
      selectedPlan?.participant_filtering ||
      (selectedPlan as any)?.waitlist_mode ||
      'AUTOMATIC';
    return String(rawMode).trim().toUpperCase() === 'ASSIGNED';
  }, [rawDbPlan, selectedPlan]);

  const assignedGroup = useMemo(() => {
    const rawGroup =
      myParticipantRecord?.assigned_group ||
      (myParticipantRecord as any)?.assignedGroup ||
      myMemberEntry?.assignedGroup ||
      (myMemberEntry as any)?.assigned_group;
    if (!rawGroup) return null;
    const upper = String(rawGroup).trim().toUpperCase();
    if (upper === 'WAITLIST' || upper === 'WAITLISTED') return 'WAITLIST';
    if (upper === 'GOING') return 'GOING';
    return upper;
  }, [myParticipantRecord, myMemberEntry]);

  const isParticipant = Boolean(myMemberEntry && myMemberEntry.joinState === "JOINED");
  const alreadySkipped = Boolean(myMemberEntry && myMemberEntry.joinState === "SKIPPED");
  const isWaitlist = Boolean(myMemberEntry && myMemberEntry.joinState === "WAITLISTED");

  // CTA logic source of truth:
  // - Assigned plans: participant's assigned_group (GOING -> Join Plan, WAITLIST -> Join Waitlist, capacity does not override)
  // - Automatic plans: current capacity (joined_count < plan_size -> Join Plan, joined_count >= plan_size -> Join Waitlist)
  const ctaState = useMemo(() => {
    return getPlanPreviewCtaState({
      isAssignedMode,
      assignedGroup,
      joinedCount: currentCount,
      planSize: maxSpots,
      alreadySkipped,
    });
  }, [isAssignedMode, assignedGroup, currentCount, maxSpots, alreadySkipped]);

  const isFull = ctaState.isWaitlistTarget;

  const isDeadlinePassed = useMemo(() => {
    if (!selectedPlan?.response_deadline_at) return false;
    return new Date(selectedPlan.response_deadline_at).getTime() <= Date.now();
  }, [selectedPlan?.response_deadline_at]);

  const handleToggleJoinCallback = useCallback(
    (p: Plan) => {
      if (alreadySkipped && activeUserId) {
        rejoinPlan(p.id, userProfile);
      } else {
        joinPlan(p.id, userProfile);
      }
    },
    [alreadySkipped, activeUserId, userProfile, rejoinPlan, joinPlan]
  );

  const handlePaymentSuccess = useCallback(
    (p: Plan | null) => {
      if (p && setShowPaymentSuccess) setShowPaymentSuccess(p.id);
    },
    [setShowPaymentSuccess]
  );

  const handleWaitlistSuccess = useCallback(
    (p: Plan | null) => {
      if (p && setShowWaitlistSuccess) setShowWaitlistSuccess(p.id);
    },
    [setShowWaitlistSuccess]
  );

  // Reuse existing Hold-to-Join hook
  const {
    holdProgress,
    isHolding,
    isSuccess,
    successMode,
    startHolding,
    stopHolding,
    cancelHolding,
    handlePointerMove,
    wasHoldActive,
  } = useHoldToAccept({
    plan: selectedPlan || ({} as Plan),
    userProfile,
    isDeadlinePassed,
    isJoined: isParticipant,
    isWaitlisted: isWaitlist,
    isFull,
    handleToggleJoin: handleToggleJoinCallback,
    setShowPaymentSuccess: handlePaymentSuccess,
    setShowWaitlistSuccess: handleWaitlistSuccess,
    setNotifications: () => { },
    activeCardId: planId,
    handleSnoozePlan: () => { },
    waitlistPlan: waitlistPlan ? (id, up) => waitlistPlan(id, up) : undefined,
    isExpanded: false,
    setIsExpanded: () => { },
  });

  const formattedDateAndTime = useMemo(() => {
    if (!selectedPlan) return "";
    return formatPlanDate(selectedPlan.datetime || selectedPlan.createdAt);
  }, [selectedPlan]);

  const hasCost = rawDbPlan && rawDbPlan.total_cost && Number(rawDbPlan.total_cost) > 0;
  const costText = useMemo(() => {
    return getHeroMetadataCostText(rawDbPlan, selectedPlan, maxSpots);
  }, [rawDbPlan, selectedPlan, maxSpots]);

  const [showJoinConfirmation, setShowJoinConfirmation] = useState(false);

  const handleConfirmJoinDirect = useCallback(() => {
    if (!selectedPlan || isJoiningDirect) return;
    const planToJoin = selectedPlan;
    setShowJoinConfirmation(false);
    setShowPlanActionsSheet(false);

    const isRejoin = alreadySkipped && activeUserId;

    if (!isRejoin) {
      // Only show success animation for actual joins, not rejoins
      if (isFull) {
        if (setShowWaitlistSuccess) setShowWaitlistSuccess(planToJoin.id);
      } else {
        if (setShowPaymentSuccess) setShowPaymentSuccess(planToJoin.id);
      }
      onClose();
    }

    // Perform DB join/rejoin asynchronously in background
    const joinOp = isRejoin
      ? rejoinPlan(planToJoin.id, userProfile)
      : joinPlan(planToJoin.id, userProfile);

    joinOp.catch((err) => {
      console.error("[handleJoinDirect] Background join failed:", err);
    });
  }, [selectedPlan, isJoiningDirect, alreadySkipped, activeUserId, userProfile, isFull, rejoinPlan, joinPlan, setShowWaitlistSuccess, setShowPaymentSuccess, onClose]);

  const handleJoinDirect = useCallback(() => {
    if (!selectedPlan || isJoiningDirect) return;
    setShowJoinConfirmation(true);
  }, [selectedPlan, isJoiningDirect]);


  const [showSkipConfirmation, setShowSkipConfirmation] = useState(false);
  const [showCancelLeaveRequestConfirmation, setShowCancelLeaveRequestConfirmation] = useState(false);
  const [isSubmittingPaidLeave, setIsSubmittingPaidLeave] = useState(false);
  const [isCancellingLeaveRequest, setIsCancellingLeaveRequest] = useState(false);

  const handleConfirmCancelLeaveRequest = useCallback(async () => {
    if (!selectedPlan || !activeUserId || isCancellingLeaveRequest) return;
    setIsCancellingLeaveRequest(true);
    try {
      await cancelPaidPlanLeaveRequest(selectedPlan.id);
      setShowCancelLeaveRequestConfirmation(false);
    } catch (err) {
      console.error("[handleConfirmCancelLeaveRequest] Failed:", err);
    } finally {
      setIsCancellingLeaveRequest(false);
    }
  }, [selectedPlan, activeUserId, isCancellingLeaveRequest, cancelPaidPlanLeaveRequest]);

  const handleConfirmPaidLeaveRequest = useCallback(async () => {
    if (!selectedPlan || !activeUserId || isSubmittingPaidLeave) return;
    setIsSubmittingPaidLeave(true);
    try {
      await requestPaidPlanLeave(selectedPlan.id);
    } catch (err) {
      console.error("[handleConfirmPaidLeaveRequest] Failed:", err);
    } finally {
      setIsSubmittingPaidLeave(false);
    }
  }, [selectedPlan, activeUserId, isSubmittingPaidLeave, requestPaidPlanLeave]);

  const handleConfirmSkip = useCallback(() => {
    if (!selectedPlan || !activeUserId || isSkipping) return;
    const planToSkip = selectedPlan;
    setShowSkipConfirmation(false);
    setShowPlanActionsSheet(false);

    if (setShowLeftSuccess) {
      setShowLeftSuccess(planToSkip.id);
    }
    onClose();

    // Perform DB skip asynchronously in background without blocking visual confirmation overlay
    skipPlan(planToSkip.id, activeUserId).catch((err) => {
      console.error("[handleSkip] Background skip failed:", err);
    });
  }, [selectedPlan, activeUserId, isSkipping, skipPlan, setShowLeftSuccess, onClose]);

  const handleConfirmHostLeaveReplacement = useCallback(async (selectedReplacementId: string) => {
    if (!selectedPlan || isSubmittingHostReplacement) return;
    setIsSubmittingHostReplacement(true);
    try {
      const planUuid = (selectedPlan as any).dbUuid || selectedPlan.id;
      const res = await requestHostLeaveWithReplacement(planUuid, selectedReplacementId);
      setShowHostLeaveReplacementSheet(false);
      
      const replacementUser = eligibleHostReplacementParticipants.find(p => p.id === selectedReplacementId);
      
      if (onLeavePlan) {
        onLeavePlan();
      } else {
        onClose();
      }
    } catch (err: any) {
      console.error("[HomePlansPreviewScreen] Host replacement leave failed:", err);
    } finally {
      setIsSubmittingHostReplacement(false);
    }
  }, [selectedPlan, isSubmittingHostReplacement, requestHostLeaveWithReplacement, eligibleHostReplacementParticipants, onLeavePlan, onClose]);

  const handleSkip = useCallback(async () => {
    if (!selectedPlan || !activeUserId || isSkipping) return;
    if (myParticipantRecord?.leave_requested) {
      setShowCancelLeaveRequestConfirmation(true);
      return;
    }
    
    const isActuallyJoined = myParticipantRecord?.rsvp_status === "JOINED";
    
    if (isActuallyJoined) {
      if (isSoleHost) {
        setShowHostLeaveReplacementSheet(true);
      } else {
        setShowLeavePlanConfirm(true);
      }
    } else {
      setShowSkipConfirmation(true);
    }
  }, [selectedPlan, activeUserId, isSkipping, myParticipantRecord, isSoleHost]);

  const handleLiveActionClick = useCallback(() => {
    const rawRsvp = effectiveParticipantRecord?.rsvp_status || (effectiveParticipantRecord as any)?.joinState;
    const status = normalizeStatus(rawRsvp);
    if (status === 'INVITED') {
      setShowPlanActionsSheet(true);
    } else if (status === 'JOINED') {
      if ((effectiveParticipantRecord as any)?.leave_requested) {
        setShowCancelLeaveRequestConfirmation(true);
      } else if (isSoleHost) {
        setShowHostLeaveReplacementSheet(true);
      } else {
        setShowLeavePlanConfirm(true);
      }
    } else {
      setShowPlanActionsSheet(true);
    }
  }, [effectiveParticipantRecord, isSoleHost]);

  if (!selectedPlan) return null;

  if (showPlanSettingsScreen) {
    return (
      <PlanSettingsScreen
        plan={selectedPlan}
        userProfile={userProfile}
        isCreatorHost={isCreatorHost}
        isPlanSettingsForParticipant={!isCreatorHost}
        myParticipantRecord={myParticipantRecord}
        onBack={() => setShowPlanSettingsScreen(false)}
        onUpdateSettings={async (newSettings) => {
          await updatePlanSettings(selectedPlan.id, newSettings);
        }}
        onDemoteHost={async (userId) => {
          await demoteHostToParticipant(selectedPlan.id, userId);
        }}
        onEditTitle={async (newTitle) => {
          await updatePlanDetails(selectedPlan.id, { title: newTitle });
        }}
        onEditCoverImage={async (newCoverUrl, blob) => {
          const targetPlanId = cleanPlanId(selectedPlan.dbUuid || selectedPlan.id);
          if (blob) {
            await uploadPlanImage(targetPlanId, blob);
          }
          await updatePlanDetails(targetPlanId, { cover_image: `${targetPlanId}.webp`, skipDbWrite: true });
        }}
        onLeavePlan={async () => {
          try {
            await leavePlan(selectedPlan.id, resolvedUserUuid);
            if (onLeavePlan) {
              onLeavePlan();
            } else {
              onClose();
            }
          } catch (err) {
            console.error("Failed to leave plan from HomePlansPreviewScreen:", err);
            throw err;
          }
        }}
      />
    );
  }

  return (
    <motion.div
      id="home_plan_details"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 15 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="fixed inset-0 bg-[#050505] z-[60] flex flex-col h-full overflow-hidden text-left select-none"
    >
      {/* 1. FIXED TOP CONTENT */}
      <div id="immersive-plan-hero-wrapper" className="w-full flex-shrink-0 relative z-20 pb-[78px] no-hold">
        <div
          id="immersive-plan-hero-container"
          className="relative w-full h-[280px] flex flex-col justify-end overflow-visible flex-shrink-0 rounded-b-[2.5rem] border-b border-white/10"
        >
          {/* Poster Cover Image */}
          <DiscoveryImages
            id="immersive-plan-hero-image"
            src={selectedPlan.coverImage || (selectedPlan as any).cover_image}
            planId={selectedPlan.dbUuid || selectedPlan.id}
            category={selectedPlan.category}
            subcategory={(selectedPlan as any).subcategory || (selectedPlan as any).sports_type}
            screen="Home Plans Preview"
            alt={selectedPlan.title}
            className="absolute inset-0 w-full h-full object-cover filter brightness-[0.75]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80 pointer-events-none z-10" />

          {/* Shared Hero Header - Participant Role Strictly Enforced */}
          <HeroHeader
            title={selectedPlan.title}
            creatorName={selectedPlan.creatorName}
            creatorAvatar={selectedPlan.creatorAvatar}
            hosts={allHosts}
            viewerId={resolvedUserUuid}
            onClose={onClose}
            isHost={false}
          />

          {/* Integrated Glass Details Card Repositioned */}
          <div className="absolute left-6 right-6 bottom-0 translate-y-1/2 z-20">
            <div className="w-full bg-black/15 backdrop-blur-3xl border border-white/[0.06] shadow-lg rounded-2xl relative">
              <div className="flex flex-col p-4.5 gap-y-3.5 text-left">
                {/* 1. Date & Time */}
                <div className="flex items-center gap-3 p-1.5 -m-1.5 rounded-xl">
                  <CalendarDays className="w-4.5 h-4.5 text-white/70 flex-shrink-0" />
                  <span className="text-[13px] font-semibold text-white/95 leading-none">
                    {formatPlanDate(selectedPlan.datetime || selectedPlan.createdAt)}
                  </span>
                </div>

                {/* 2. Location (Row 2) if location present */}
                {selectedPlan.location && (
                  <div className="flex items-center gap-3 p-1.5 -m-1.5 rounded-xl">
                    <MapPin className="w-4.5 h-4.5 text-[#FF5A1F] flex-shrink-0" />
                    <span className="text-[13px] font-semibold text-white/95 leading-none truncate">
                      {selectedPlan.location}
                    </span>
                  </div>
                )}

                {/* 3. RSVP & Cost Row (Row 3) */}
                <div className="flex items-center justify-between text-white/50 text-[11px] font-medium leading-none pt-1">
                  <div className="flex items-center gap-2 text-left">
                    <Hourglass className="w-3.5 h-3.5 flex-shrink-0" style={{ color: urgencyColor }} />
                    <span style={{ color: urgencyColor }}>{rsvp.text}</span>
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsCostPopoverOpen((prev) => !prev)}
                      className="flex items-center gap-2 hover:bg-white/[0.06] active:bg-white/10 transition p-1.5 -m-1.5 rounded-xl cursor-pointer text-right text-white/90 font-semibold"
                    >
                      <span>{hasCost && costText ? costText : "Free"}</span>
                    </button>

                    <CostBreakdownPopover
                      totalCost={rawDbPlan?.total_cost}
                      planSize={rawDbPlan?.plan_size}
                      isOpen={isCostPopoverOpen}
                      onClose={() => setIsCostPopoverOpen(false)}
                      isHost={false}
                      position="above"
                      align="right"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. SCROLLABLE PARTICIPANT SECTION ONLY */}
      <div
        id="immersive-plan-scroll-content"
        onPointerDown={startHolding}
        onPointerMove={handlePointerMove}
        onPointerUp={stopHolding}
        onPointerLeave={cancelHolding}
        onPointerCancel={cancelHolding}
        onClickCapture={(e) => {
          const target = e.target as HTMLElement;
          if (target && (target.closest('.no-hold') || target.closest('button') || target.closest('input') || target.closest('a'))) {
            return;
          }
          if (wasHoldActive.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        className="px-6 flex-1 min-h-0 flex flex-col overflow-hidden pb-20"
      >
        {selectedPlan && (
          <InlineParticipantView plan={selectedPlan} activeUserId={activeUserId} isHost={isHost} variant="flat" />
        )}
      </div>

      {/* Bottom Live-Plan Action CTA for Invited Users ("You're Invited") */}
      <LiveActionButton
        myParticipantRecord={effectiveParticipantRecord}
        className="no-hold z-40"
        onClick={handleLiveActionClick}
      />

      {/* Hold-to-Join Overlay */}
      <AnimatePresence>
        <HoldToAcceptOverlay
          planId={selectedPlan.id}
          holdProgress={holdProgress}
          isHolding={isHolding}
          isFull={isFull}
          formattedDateAndTime={formattedDateAndTime}
          costText={hasCost && costText ? costText : null}
        />

        {isSuccess && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="absolute inset-0 bg-[#0c0c0e]/95 backdrop-blur-md z-30 flex flex-col items-center justify-center pointer-events-none"
          >
            {successMode === "waitlist" ? (
              <>
                <motion.div
                  initial={{ scale: 0.5 }}
                  animate={{ scale: [0.5, 1.15, 1], rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 0.4 }}
                  className="w-16 h-16 rounded-full bg-amber-500/10 border-2 border-amber-500 flex items-center justify-center text-amber-400 shadow-[0_0_40px_rgba(245,158,11,0.25)]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
                <span className="text-base font-sans font-black tracking-[0.2em] text-amber-400 mt-6 uppercase">WAITLISTED</span>
                <span className="text-xs font-sans text-zinc-400 mt-2">Added to Waitlist</span>
              </>
            ) : (
              <>
                <motion.div
                  initial={{ scale: 0.5 }}
                  animate={{ scale: [0.5, 1.15, 1], rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 0.4 }}
                  className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.25)]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
                <span className="text-base font-sans font-black tracking-[0.2em] text-emerald-400 mt-6 uppercase">JOINED</span>
                <span className="text-xs font-sans text-zinc-400 mt-2">Joined plan successfully!</span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <InvitedPlanActionsBottomSheet
        isOpen={showPlanActionsSheet}
        plan={selectedPlan}
        joinCtaText={ctaState.ctaText}
        isJoining={isJoiningDirect}
        isSkipping={isSkipping}
        onJoin={handleConfirmJoinDirect}
        onSkip={handleConfirmSkip}
        onClose={() => setShowPlanActionsSheet(false)}
      />

      <JoinPlanConfirmationBottomSheet
        isOpen={showJoinConfirmation}
        costText={isFull ? null : costText}
        planTitle={selectedPlan?.title}
        isJoining={isJoiningDirect}
        isWaitlist={isFull}
        onConfirm={handleConfirmJoinDirect}
        onClose={() => setShowJoinConfirmation(false)}
      />

      <LeavePlanBottomSheet
        isOpen={showSkipConfirmation}
        isSkipping={isSkipping}
        isPaid={false}
        plan={selectedPlan}
        onConfirm={handleConfirmSkip}
        onClose={() => setShowSkipConfirmation(false)}
      />

      <LeavePlanBottomSheet
        isOpen={showLeavePlanConfirm}
        isSkipping={isSkipping}
        isSubmitting={isSubmittingPaidLeave}
        isPaid={hasCost}
        plan={selectedPlan}
        onConfirm={async () => {
          setShowLeavePlanConfirm(false);
          if (hasCost) {
            await handleConfirmPaidLeaveRequest();
          } else {
            handleConfirmSkip();
          }
        }}
        onClose={() => setShowLeavePlanConfirm(false)}
      />

      <MakeAnotherParticipantHostBottomSheet
        isOpen={showHostLeaveReplacementSheet}
        eligibleParticipants={eligibleHostReplacementParticipants}
        isSubmitting={isSubmittingHostReplacement}
        onConfirm={handleConfirmHostLeaveReplacement}
        onClose={() => setShowHostLeaveReplacementSheet(false)}
      />

      <CancelLeaveRequestBottomSheet
        isOpen={showCancelLeaveRequestConfirmation}
        planTitle={selectedPlan?.title}
        isSubmitting={isCancellingLeaveRequest}
        onConfirm={handleConfirmCancelLeaveRequest}
        onClose={() => setShowCancelLeaveRequestConfirmation(false)}
      />

      {showManageTeams && (
        <TeamOrganizerModal
          planId={selectedPlan.id}
          userProfile={userProfile}
          activeUserId={activeUserId}
          onClose={() => setShowManageTeams(false)}
        />
      )}

      {/* 💬 PLAN CHAT OVERLAY */}
      {selectedChatPlanId && (
        <div className="fixed inset-0 z-[80] bg-[#050505]">
          <PlanChatScreen
            planId={selectedChatPlanId}
            onBack={() => setSelectedChatPlanId(null)}
            onOpenPlanDetails={() => {
              setSelectedChatPlanId(null);
            }}
          />
        </div>
      )}

      {/* 💳 PLAN BALANCES / EXPENSES OVERLAY */}
      {showPlanBalancesScreen && selectedPlan && (
        <div className="fixed inset-0 z-[80] bg-[#050505]">
          <PlanBalancesScreen
            planId={selectedPlan.id}
            onBack={() => setShowPlanBalancesScreen(false)}
            onRefreshBalances={async () => { }}
            activeUserId={activeUserId || userProfile.dbUuid || (userProfile as any)?.id || ""}
            onSelectPlan={() => { }}
            onToggleBottomNav={() => { }}
          />
        </div>
      )}

      <AnimatePresence>
        {showCompletionFlow && (
          <PlanCompletionModal
            plan={selectedPlan}
            onClose={() => setShowCompletionFlow(false)}
            activeUserId={activeUserId || ""}
            onPublish={() => {
              setShowCompletionFlow(false);
              onClose();
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default React.memo(PlansPreviewScreen);

