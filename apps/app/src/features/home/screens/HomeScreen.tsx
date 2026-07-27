import React from "react";
import { UserProfile, Plan, NotificationItem } from "../../../core/types";
import { EmptyState } from "../components/EmptyState";
import { PlanStack } from "../components/PlanFeed";
import { usePlansStore } from "../../../features/plans/state/PlansContext";

export interface HomeScreenProps {
  discoverablePlans: Plan[];
  userProfile: UserProfile;
  interestedPlanIds: string[];
  setSelectedPlan: (planId: string | null) => void;
  selectedPlan?: string | null;
  setPaymentConfirmationPlan: (planId: string | null) => void;
  walletBalance: number;
  handleToggleJoin: (planId: string) => void;
  setShowPaymentSuccess: (planId: string | null) => void;
  setShowWaitlistSuccess?: (planId: string | null) => void;
  setNotifications: React.Dispatch<React.SetStateAction<NotificationItem[]>>;
  activeCardId: string | null;
  setActiveCardId: (id: string | null) => void;
  handleSnoozePlan: (planId: string) => void;
  handleWaitlistPlan: (planId: string) => void;
  homeFeedRef: React.RefObject<HTMLDivElement | null>;
  selectedPlanId?: string | null;
  onNavigateToCreate?: () => void;
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
}) => {

  const {
    plans,
    dbPlanParticipants,
    dbPlanOutcomes,
    refreshPlans
  } = usePlansStore();



  const [activeCardIndex, setActiveCardIndex] = React.useState(0);
  const hasInitializedRef = React.useRef(false);

  React.useEffect(() => {
    // Force reset scroll and active card index on initial application load / mount
    const feed = homeFeedRef.current;
    if (feed) {
      feed.scrollTop = 0;
    }
    setActiveCardIndex(0);
  }, []);

  React.useEffect(() => {
    // When plans load or change, set the active card to the first one and reset scroll
    if (discoverablePlans.length > 0 && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const feed = homeFeedRef.current;
      if (feed) {
        feed.scrollTop = 0;
      }
      setActiveCardIndex(0);
      setActiveCardId(discoverablePlans[0].id);
    } else if (discoverablePlans.length === 0) {
      setActiveCardId("");
    }
  }, [discoverablePlans, setActiveCardId, homeFeedRef]);

  const prevSelectedPlanIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    // When returning from detailed plan modal (selectedPlanId transitions from non-null to null)
    if (prevSelectedPlanIdRef.current && !selectedPlanId && activeCardId) {
      const basePlanId = activeCardId.replace("-loop-prev-dup", "").replace("-loop-next-dup", "");
      setTimeout(() => {
        const element = document.getElementById(`plan-card-${activeCardId}`) || 
                        document.querySelector(`[id$="${basePlanId}"]`);
        if (element) {

          element.scrollIntoView({ behavior: "auto", block: "start" });
        }
      }, 50);
    }
    prevSelectedPlanIdRef.current = selectedPlanId || null;
  }, [selectedPlanId, activeCardId]);
  
  const handleSelectPlan = (planId: string | null) => {
    setSelectedPlan(planId);
  };

  return (
    <div id="home_tab_pane" className="w-full h-full relative overflow-hidden bg-[#000000] flex flex-col pb-[72px]">
      {discoverablePlans.length === 0 ? (
        <EmptyState
          description={
            <>
              You have joined all active spontaneous plans! Head to the{" "}
              <span className="text-white font-semibold cursor-pointer">Circles</span> or{" "}
              <span className="text-white font-semibold cursor-pointer">Plans</span> tab to view and
              coordinate.
            </>
          }
        />
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

