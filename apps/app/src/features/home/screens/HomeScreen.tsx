import React from "react";
import { UserProfile, Plan, NotificationItem, DbPlanParticipant } from "../../../core/types";
import { EmptyState } from "../components/EmptyState";
import { PlanStack } from "../components/PlanFeed";
import { usePlansStore } from "../../../features/plans/state/PlansContext";
import { useProfileStore } from "../../../features/profile/state/ProfileContext";
import { normalizeStatus } from "../../../../lib/participantStatus";

export interface HomeScreenProps {
  discoverablePlans: Plan[];
  userProfile: UserProfile;
  interestedPlanIds: string[];
  setSelectedPlan: (planId: string | null) => void;
  selectedPlan?: string | null;
  setPaymentConfirmationPlan: (planId: string | null) => void;
  walletBalance: number;
  handleToggleJoin: (planId: string) => Promise<boolean | void> | void;
  setShowPaymentSuccess: (planId: string | null) => void;
  setShowWaitlistSuccess?: (planId: string | null) => void;
  setShowLeftSuccess?: (planId: string | null) => void;
  setNotifications: React.Dispatch<React.SetStateAction<NotificationItem[]>>;
  activeCardId: string | null;
  setActiveCardId: (id: string | null) => void;
  handleSnoozePlan: (planId: string) => void;
  handleWaitlistPlan: (planId: string) => void;
  homeFeedRef: React.RefObject<HTMLDivElement | null>;
  selectedPlanId?: string | null;
  onNavigateToCreate?: () => void;
  onNavigateToPlans?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = React.memo(({
  discoverablePlans,
  userProfile,
  interestedPlanIds,
  setSelectedPlan,
  selectedPlan,
  setPaymentConfirmationPlan,
  walletBalance,
  handleToggleJoin,
  setShowPaymentSuccess,
  setShowWaitlistSuccess,
  setNotifications,
  activeCardId,
  setActiveCardId,
  handleSnoozePlan,
  handleWaitlistPlan,
  homeFeedRef,
  selectedPlanId,
  onNavigateToCreate,
  onNavigateToPlans,
}) => {

  const {
    plans,
    dbPlanParticipants,
    dbPlanOutcomes,
    refreshPlans
  } = usePlansStore();

  const { activeUserUuid, activeUserId } = useProfileStore();

  const allMyUserIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (activeUserUuid) ids.add(activeUserUuid);
    if (activeUserId) ids.add(activeUserId);
    if (userProfile?.dbUuid) ids.add(userProfile.dbUuid);
    if ((userProfile as any)?.id) ids.add((userProfile as any).id);
    if ((userProfile as any)?.user_id) ids.add((userProfile as any).user_id);
    return ids;
  }, [userProfile, activeUserUuid, activeUserId]);

  const participantMap = React.useMemo(() => {
    const map = new Map<string, DbPlanParticipant>();
    (dbPlanParticipants || []).forEach((pp) => {
      if (pp.user_id && allMyUserIds.has(pp.user_id) && pp.plan_id) {
        map.set(pp.plan_id, pp);
      }
    });
    return map;
  }, [dbPlanParticipants, allMyUserIds]);

  const hasLivePlan = React.useMemo(() => {
    return (plans || []).some((p) => {
      const statusNorm = (p.status || "").toLowerCase();
      if (statusNorm === "cancelled" || statusNorm === "canceled" || statusNorm === "completed") return false;
      const isLive = statusNorm === "live" || statusNorm === "active";
      if (!isLive) return false;

      const myParticipant = participantMap.get(p.id) || (p.dbUuid ? participantMap.get(p.dbUuid) : undefined);
      const isHostRole =
        myParticipant?.role === "HOST" ||
        (p.hostId && allMyUserIds.has(p.hostId)) ||
        ((p as any).host_id && allMyUserIds.has((p as any).host_id)) ||
        (p.creatorId && allMyUserIds.has(p.creatorId)) ||
        ((p as any).creator_id && allMyUserIds.has((p as any).creator_id));
      const rsvp = normalizeStatus(myParticipant?.rsvp_status);
      const isJoinedOrWaitlisted = rsvp === "JOINED" || rsvp === "WAITLISTED";
      const isMember = p.members?.some((m) => {
        const mId = m.userUuid || m.userId || (m as any).user_id || (m as any).id;
        return mId && allMyUserIds.has(mId);
      });

      return Boolean(isHostRole || isJoinedOrWaitlisted || isMember);
    });
  }, [plans, participantMap, allMyUserIds]);



  const matchesPlanId = React.useCallback((plan: any, targetId: string | null): boolean => {
    if (!plan || !targetId) return false;
    return Boolean(
      plan.id === targetId ||
      plan.dbUuid === targetId ||
      plan.publicId === targetId ||
      plan.public_id === targetId ||
      plan.slug === targetId
    );
  }, []);

  const [activeCardIndex, setActiveCardIndex] = React.useState<number>(() => {
    if (activeCardId && discoverablePlans && discoverablePlans.length > 0) {
      const idx = discoverablePlans.findIndex(p =>
        p.id === activeCardId ||
        (p as any).dbUuid === activeCardId ||
        (p as any).publicId === activeCardId ||
        (p as any).public_id === activeCardId ||
        (p as any).slug === activeCardId
      );
      if (idx >= 0) return idx;
    }
    return 0;
  });
  const hasInitializedRef = React.useRef(false);

  React.useEffect(() => {
    // When plans load or change, focus targeted card if specified (e.g. from invite link) or default to first card
    if (discoverablePlans.length > 0) {
      if (activeCardId) {
        const targetIdx = discoverablePlans.findIndex(p => matchesPlanId(p, activeCardId));
        if (targetIdx >= 0) {
          hasInitializedRef.current = true;
          setActiveCardIndex(targetIdx);
          return;
        }
        // If activeCardId is specified but not found yet in discoverablePlans (e.g. while claim/refresh is in progress),
        // preserve activeCardId. DO NOT overwrite activeCardId or reset index to 0.
      } else {
        // No targeted card: set initial active card once
        if (!hasInitializedRef.current) {
          hasInitializedRef.current = true;
          setActiveCardIndex(0);
          setActiveCardId(discoverablePlans[0].id);
        }
      }
    } else if (discoverablePlans.length === 0) {
      if (!activeCardId) {
        setActiveCardId("");
      }
    }
  }, [discoverablePlans, activeCardId, setActiveCardId, matchesPlanId]);

  const prevSelectedPlanIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    prevSelectedPlanIdRef.current = selectedPlanId || null;
  }, [selectedPlanId]);
  
  const handleSelectPlan = (planId: string | null) => {
    setSelectedPlan(planId);
  };

  return (
    <div id="home_tab_pane" className="w-full h-full relative overflow-hidden bg-[#000000] flex flex-col pb-[72px]">
      {discoverablePlans.length === 0 ? (
        hasLivePlan ? (
          <EmptyState
            title="No plans around you"
            description="Manage your plans"
            ctaButton={
              <button
                type="button"
                onClick={onNavigateToPlans}
                className="py-3 px-7 bg-[#FF6B2C] hover:bg-[#FF854C] active:bg-[#E55A1F] text-white font-sans font-semibold text-[13.5px] tracking-wide rounded-full transition-all duration-200 active:scale-[0.98] cursor-pointer shadow-md shadow-[#FF6B2C]/20 flex items-center justify-center"
              >
                Go to Plans
              </button>
            }
          />
        ) : (
          <EmptyState
            title="No plans yet?"
            description="Ready to make one?"
            ctaButton={
              <button
                type="button"
                onClick={onNavigateToCreate}
                className="py-3 px-7 bg-[#FF6B2C] hover:bg-[#FF854C] active:bg-[#E55A1F] text-white font-sans font-semibold text-[13.5px] tracking-wide rounded-full transition-all duration-200 active:scale-[0.98] cursor-pointer shadow-md shadow-[#FF6B2C]/20 flex items-center justify-center"
              >
                Create a Plan
              </button>
            }
          />
        )
      ) : (
        <div className="flex-1 min-h-0 relative">
          <PlanStack
            plansToRender={discoverablePlans}
            homeFeedRef={homeFeedRef}
            userProfile={userProfile}
            interestedPlanIds={interestedPlanIds}
            setSelectedPlan={handleSelectPlan}
            setPaymentConfirmationPlan={setPaymentConfirmationPlan}
            walletBalance={walletBalance}
            handleToggleJoin={handleToggleJoin}
            setShowPaymentSuccess={setShowPaymentSuccess}
            setShowWaitlistSuccess={setShowWaitlistSuccess}
            setNotifications={setNotifications}
            activeCardId={activeCardId}
            selectedPlanId={selectedPlan}
            setActiveCardId={setActiveCardId}
            activeCardIndex={activeCardIndex}
            setActiveCardIndex={setActiveCardIndex}
            handleSnoozePlan={handleSnoozePlan}
            handleWaitlistPlan={handleWaitlistPlan}
            onNavigateToCreate={onNavigateToCreate}
          />
        </div>
      )}
    </div>
  );
});

