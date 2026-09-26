import React from "react";
import { motion } from "motion/react";
import { Plan, UserProfile, NotificationItem } from "../../../core/types";
import { PlanCard } from "./PlanCard";
import { useVerticalPager } from "../hooks/useVerticalPager";

interface PlanStackProps {
  plansToRender: Plan[];
  homeFeedRef: React.RefObject<HTMLDivElement | null>;
  userProfile: UserProfile;
  interestedPlanIds: string[];
  setSelectedPlan: (planId: string | null) => void;
  setPaymentConfirmationPlan: (planId: string | null) => void;
  walletBalance: number;
  handleToggleJoin: (planId: string) => Promise<boolean | void> | void;
  setShowPaymentSuccess: (planId: string | null) => void;
  setShowWaitlistSuccess?: (planId: string | null) => void;
  setNotifications: React.Dispatch<React.SetStateAction<NotificationItem[]>>;
  activeCardId: string | null;
  selectedPlanId?: string | null;
  setActiveCardId: (planId: string) => void;
  activeCardIndex: number;
  setActiveCardIndex: (index: number) => void;
  handleSnoozePlan: (planId: string) => void;
  handleWaitlistPlan?: (planId: string, userProfile: any) => void;
  onNavigateToCreate?: () => void;
}

export const PlanStack: React.FC<PlanStackProps> = ({
  plansToRender,
  homeFeedRef,
  userProfile,
  interestedPlanIds,
  setSelectedPlan,
  setPaymentConfirmationPlan,
  walletBalance,
  handleToggleJoin,
  setShowPaymentSuccess,
  setShowWaitlistSuccess,
  setNotifications,
  activeCardId,
  selectedPlanId,
  setActiveCardId,
  activeCardIndex,
  setActiveCardIndex,
  handleSnoozePlan,
  handleWaitlistPlan,
  onNavigateToCreate,
}) => {
  const [expandedCardId, setExpandedCardId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setExpandedCardId(null);
  }, [activeCardId]);

  const totalPages = plansToRender.length;

  const targetPlanIndex = React.useMemo(() => {
    if (!activeCardId || plansToRender.length === 0) return -1;
    return plansToRender.findIndex(p =>
      p.id === activeCardId ||
      (p as any).dbUuid === activeCardId ||
      (p as any).publicId === activeCardId ||
      (p as any).public_id === activeCardId ||
      (p as any).slug === activeCardId
    );
  }, [activeCardId, plansToRender]);

  const resolvedInitialPage = targetPlanIndex >= 0 ? targetPlanIndex : (activeCardIndex || 0);

  const {
    currentPage,
    pageY,
    containerRef,
    containerHeight,
    goToPage,
    pagerProps,
    isDraggingRef,
  } = useVerticalPager({
    totalPages,
    initialPage: resolvedInitialPage,
    disabled: plansToRender.length === 0,
    onPageChange: (index) => {
      setActiveCardIndex(index);
      const targetPlan = plansToRender[index];
      if (targetPlan) {
        setActiveCardId(targetPlan.id);
      }
    },
  });

  // Sync external homeFeedRef with our pager container
  React.useEffect(() => {
    if (homeFeedRef && 'current' in homeFeedRef) {
      (homeFeedRef as any).current = containerRef.current;
    }
  }, [homeFeedRef, containerRef]);

  // Synchronize programmatic index updates (e.g. from invite link)
  React.useEffect(() => {
    if (targetPlanIndex >= 0 && targetPlanIndex !== currentPage) {
      goToPage(targetPlanIndex);
    } else if (activeCardIndex !== currentPage && activeCardIndex >= 0 && activeCardIndex < totalPages) {
      goToPage(activeCardIndex);
    }
  }, [activeCardIndex, targetPlanIndex, currentPage, goToPage, totalPages]);

  return (
    <div
      id="home_swipe_feed"
      ref={containerRef}
      className="h-full w-full overflow-hidden relative touch-pan-x select-none"
      style={{ touchAction: "pan-x" }}
    >
      <motion.div
        {...pagerProps}
        style={{ y: pageY, touchAction: "pan-x" }}
        className="w-full flex flex-col"
      >
        {plansToRender.map((plan) => (
          <div
            key={plan.id}
            id={`plan-card-${plan.id}`}
            style={{ height: containerHeight > 0 ? `${containerHeight}px` : "100%" }}
            className="w-full relative flex-shrink-0"
          >
            <PlanCard
              planId={plan.id}
              userProfile={userProfile}
              interestedPlanIds={interestedPlanIds}
              setSelectedPlan={setSelectedPlan}
              setPaymentConfirmationPlan={setPaymentConfirmationPlan}
              walletBalance={walletBalance}
              handleToggleJoin={handleToggleJoin}
              setShowPaymentSuccess={setShowPaymentSuccess}
              setShowWaitlistSuccess={setShowWaitlistSuccess}
              setNotifications={setNotifications}
              activeCardId={activeCardId}
              selectedPlanId={selectedPlanId}
              isExpanded={expandedCardId === plan.id}
              setIsExpanded={(val) => {
                setExpandedCardId((prev) => {
                  const currentIsExpanded = prev === plan.id;
                  const nextVal = typeof val === "function" ? (val as any)(currentIsExpanded) : val;
                  return nextVal ? plan.id : null;
                });
              }}
              onSelectCard={(id) => {
                if (isDraggingRef.current) return;
                setActiveCardId(id);
                setExpandedCardId(null);
                if (id) {
                  setSelectedPlan(id);
                }
              }}
              handleSnoozePlan={handleSnoozePlan}
              waitlistPlan={handleWaitlistPlan}
            />
          </div>
        ))}
      </motion.div>
    </div>
  );
};

