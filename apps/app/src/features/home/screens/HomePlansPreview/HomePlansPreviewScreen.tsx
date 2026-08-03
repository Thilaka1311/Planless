import React, { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CalendarDays, Hourglass, MapPin } from "lucide-react";
import { UserProfile, Plan } from "../../../../core/types";
import { usePlansStore } from "../../../plans/state/PlansContext";
import { useLivePlan } from "../../../plans/hooks/useLivePlan";
import { useToast } from "../../../../shared/contexts/ToastContext";
import { getPlanCover } from "../../../plans/config/planCoverImages";
import { formatPlanDate } from "../../../../../lib/mappers";
import { DiscoveryImages } from "../../../../IMGfromDB/PlanImages";
import { HeroHeader } from "../../../plans/components/HeroHeader";
import { InlineParticipantView } from "../../../plans/components/InlineParticipantView";
import { CostBreakdownPopover } from "../../../plans/components/CostBreakdownPopover";
import { useRSVPDeadline } from "../../../plans/utils/rsvpFormatter";
import { useLiveCountdown, rsvpUrgencyStyles } from "../../components/PlanCard";
import { useHoldToAccept } from "../../hooks/useHoldForStatus";
import { HoldToAcceptOverlay } from "../../components/HoldToAccept";
import TeamOrganizerModal from "../../../../shared/modals/TeamOrganizerModal";
import PlanCompletionModal from "../../../../shared/modals/PlanCompletionModal";
import { PlanSettingsScreen } from "../../../plans/screens/PlansScreen/PlansPreview/PlanSettingsScreen";

export interface PlansPreviewScreenProps {
  planId: string;
  onClose: () => void;
  userProfile: UserProfile;
  activeUserId?: string;
  onNavigateToCircle?: (circleId: string) => void;
  onEditPlan?: (planId: string) => void;
  setShowPaymentSuccess?: (planId: string | null) => void;
  setShowWaitlistSuccess?: (planId: string | null) => void;
  onLeavePlan?: () => void;
  onPlanCancelled?: (planId: string) => void;
}

export const PlansPreviewScreen: React.FC<PlansPreviewScreenProps> = ({
  planId,
  onClose,
  userProfile,
  activeUserId,
  onNavigateToCircle,
  setShowPaymentSuccess,
  setShowWaitlistSuccess,
  onLeavePlan,
  onPlanCancelled,
}) => {
  const { showToast } = useToast();
  const {
    dbPlans,
    joinPlan,
    skipPlan,
    rejoinPlan,
    updatePlanSettings,
    demoteHostToParticipant,
  } = usePlansStore();
  const selectedPlan = useLivePlan(planId);

  const [isJoiningDirect, setIsJoiningDirect] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isCostPopoverOpen, setIsCostPopoverOpen] = useState(false);
  const [showPlanSettingsScreen, setShowPlanSettingsScreen] = useState(false);
  const [showCompletionFlow, setShowCompletionFlow] = useState(false);
  const [showManageTeams, setShowManageTeams] = useState(false);

  const resolvedUserUuid = userProfile.dbUuid || activeUserId || "";
  const isHost = selectedPlan ? selectedPlan.hostId === resolvedUserUuid : false;

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

  const isCreatorHost = selectedPlan ? selectedPlan.hostId === resolvedUserUuid : false;

  const countdown = useLiveCountdown(selectedPlan?.response_deadline_at);
  const urgencyColor = useMemo(() => {
    if (!selectedPlan?.response_deadline_at) return "#71717a";
    if (!countdown) return "#ef4444";
    return rsvpUrgencyStyles[countdown.urgency].icon;
  }, [selectedPlan?.response_deadline_at, countdown]);

  const rsvp = useRSVPDeadline(selectedPlan?.response_deadline_at);

  const maxSpots = useMemo(() => {
    if (!selectedPlan) return 8;
    return selectedPlan.maxSpots || (selectedPlan.category === "movies" ? 10 : selectedPlan.category === "sports" ? 14 : 8);
  }, [selectedPlan]);

  const currentCount = useMemo(() => {
    if (!selectedPlan) return 0;
    return selectedPlan.members.filter((m) => m.joinState === "JOINED").length;
  }, [selectedPlan]);

  const isFull = currentCount >= maxSpots;

  const myMemberEntry = useMemo(() => {
    if (!selectedPlan) return null;
    return selectedPlan.members.find(
      (m) => m.userId === userProfile.user_id || (userProfile.dbUuid && m.userUuid === userProfile.dbUuid)
    );
  }, [selectedPlan, userProfile]);

  const isParticipant = Boolean(myMemberEntry && myMemberEntry.joinState === "JOINED");
  const alreadySkipped = Boolean(myMemberEntry && myMemberEntry.joinState === "SKIPPED");
  const isWaitlist = Boolean(myMemberEntry && myMemberEntry.joinState === "WAITLISTED");

  const isDeadlinePassed = useMemo(() => {
    if (!selectedPlan?.response_deadline_at) return false;
    return new Date(selectedPlan.response_deadline_at).getTime() <= Date.now();
  }, [selectedPlan?.response_deadline_at]);

  const handleToggleJoinCallback = useCallback(
    (p: Plan) => {
      if (alreadySkipped && activeUserId) {
        rejoinPlan(p.id, activeUserId, userProfile);
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
    isExpanded: false,
    setIsExpanded: () => { },
  });

  const formattedDateAndTime = useMemo(() => {
    if (!selectedPlan) return "";
    return formatPlanDate(selectedPlan.datetime || selectedPlan.createdAt);
  }, [selectedPlan]);

  const hasCost = rawDbPlan && rawDbPlan.total_cost && Number(rawDbPlan.total_cost) > 0;
  const costText = useMemo(() => {
    if (!hasCost) return null;
    const total = Number(rawDbPlan!.total_cost);
    const capacity = rawDbPlan!.max_participants ? Number(rawDbPlan!.max_participants) : maxSpots;
    const perPerson = Math.round(total / (capacity || 1));
    return `₹${perPerson} / person`;
  }, [hasCost, rawDbPlan, maxSpots]);

  const handleJoinDirect = useCallback(async () => {
    if (!selectedPlan || isJoiningDirect) return;
    setIsJoiningDirect(true);
    try {
      if (alreadySkipped && activeUserId) {
        await rejoinPlan(selectedPlan.id, activeUserId, userProfile);
      } else {
        await joinPlan(selectedPlan.id, userProfile);
      }
      if (isFull) {
        showToast("Added to Waitlist");
        if (setShowWaitlistSuccess) setShowWaitlistSuccess(selectedPlan.id);
      } else {
        showToast((selectedPlan as any).payment_required ? "Joined plan successfully! (mock checkout)" : "Joined plan successfully!");
        if (setShowPaymentSuccess) setShowPaymentSuccess(selectedPlan.id);
      }
      onClose();
    } catch {
      showToast("Failed to join plan");
    } finally {
      setIsJoiningDirect(false);
    }
  }, [selectedPlan, isJoiningDirect, alreadySkipped, activeUserId, userProfile, isFull, rejoinPlan, joinPlan, setShowWaitlistSuccess, setShowPaymentSuccess, onClose, showToast]);

  const handleSkip = useCallback(async () => {
    if (!selectedPlan || !activeUserId || isSkipping) return;
    setIsSkipping(true);
    try {
      await skipPlan(selectedPlan.id, activeUserId);
      showToast("Skipped plan");
      onClose();
    } catch {
      showToast("Failed to skip plan");
    } finally {
      setIsSkipping(false);
    }
  }, [selectedPlan, activeUserId, isSkipping, skipPlan, onClose, showToast]);

  if (!selectedPlan) return null;

  if (showPlanSettingsScreen) {
    return (
      <PlanSettingsScreen
        plan={selectedPlan}
        userProfile={userProfile}
        isCreatorHost={isCreatorHost}
        onBack={() => setShowPlanSettingsScreen(false)}
        onUpdateSettings={async (newSettings) => {
          await updatePlanSettings(selectedPlan.id, newSettings);
        }}
        onDemoteHost={async (userId) => {
          await demoteHostToParticipant(selectedPlan.id, userId);
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
      onPointerDown={startHolding}
      onPointerMove={handlePointerMove}
      onPointerUp={stopHolding}
      onPointerLeave={cancelHolding}
      onPointerCancel={cancelHolding}
      className="fixed inset-0 bg-[#050505] z-[60] flex flex-col h-full overflow-hidden text-left select-none"
    >
      <div id="immersive-plan-scroll-container" className="flex-1 overflow-y-auto scrollbar-none pb-24">
        <div id="immersive-plan-hero-wrapper" className="w-full">
          <div
            id="immersive-plan-hero-container"
            className="relative w-full h-[280px] flex flex-col justify-end overflow-visible flex-shrink-0 rounded-b-[2.5rem] border-b border-white/10"
          >
            {/* Poster Cover Image */}
            <DiscoveryImages
              id="immersive-plan-hero-image"
              src={selectedPlan.coverImage || getPlanCover(selectedPlan.category, (selectedPlan as any).subcategory || (selectedPlan as any).sports_type)}
              category={selectedPlan.category}
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
                        maxParticipants={rawDbPlan?.max_participants}
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

        {/* Scroll Content: Inline Participant View exclusively */}
        <div id="immersive-plan-scroll-content" className="px-6 pt-[80px] space-y-7">
          {selectedPlan && (
            <InlineParticipantView plan={selectedPlan} activeUserId={activeUserId} />
          )}
        </div>
      </div>

      {/* Sticky Bottom Action Section (Primary CTA + Secondary Skip) */}
      {!isParticipant && (
        <div id="immersive-actions-dock" className="no-hold px-6 pt-3 pb-6 z-30 relative bg-[#050505] border-t border-white/[0.08] flex-shrink-0 flex flex-col gap-3">
          {/* Primary Action Button: Join Plan (Solid White CTA) */}
          <button
            id="immersive-join-btn"
            type="button"
            onClick={handleJoinDirect}
            disabled={isJoiningDirect || isWaitlist}
            className="w-full py-3.5 px-6 rounded-2xl bg-white hover:bg-white/90 active:bg-white/80 active:scale-[0.98] text-[#0A0A0B] font-sans font-semibold text-[15px] tracking-tight transition-all duration-150 flex items-center justify-center text-center cursor-pointer shadow-md shadow-black/40 border-0 disabled:opacity-40"
          >
            {isJoiningDirect
              ? "Joining…"
              : isWaitlist
                ? "Waitlisted"
                : isFull
                  ? "Join Waitlist"
                  : alreadySkipped
                    ? "Rejoin Plan"
                    : "Join Plan"}
          </button>

          {/* Secondary Action Link: Skip */}
          <button
            id="immersive-skip-btn"
            type="button"
            onClick={handleSkip}
            disabled={isSkipping}
            className="w-full py-1 flex items-center justify-center text-center transition-colors cursor-pointer disabled:opacity-40"
          >
            <span className="text-[14px] font-sans font-medium text-zinc-400 hover:text-white tracking-wide">
              {isSkipping ? "Skipping…" : "Skip"}
            </span>
          </button>
        </div>
      )}

      {/* Hold-to-Join Overlay */}
      <AnimatePresence>
        <HoldToAcceptOverlay
          planId={selectedPlan.id}
          holdProgress={holdProgress}
          isHolding={isHolding}
          isFull={isFull}
          formattedDateAndTime={formattedDateAndTime}
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

      {showManageTeams && (
        <TeamOrganizerModal
          planId={selectedPlan.id}
          userProfile={userProfile}
          activeUserId={activeUserId}
          onClose={() => setShowManageTeams(false)}
        />
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

