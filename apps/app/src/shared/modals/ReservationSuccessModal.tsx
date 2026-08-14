import React from "react";
import { AnimatePresence } from "motion/react";
import { PlanConfirmedOverlay } from "../../features/plans/components/PlanConfirmedOverlay";
import { useLivePlan } from "../../features/plans/hooks/useLivePlan";

interface ReservationSuccessModalProps {
  planId: string | null;
  isWaitlist?: boolean;
  isLeft?: boolean;
  onClose: () => void;
  setActiveTab: (tab: any) => void;
  setPlansFilter?: (filter: any) => void;
}

export default function ReservationSuccessModal({
  planId,
  isWaitlist = false,
  isLeft = false,
  onClose,
  setActiveTab,
  setPlansFilter,
}: ReservationSuccessModalProps) {
  const livePlan = useLivePlan(planId);

  React.useEffect(() => {
    
  }, [planId, livePlan]);

  return (
    <AnimatePresence>
      {planId && livePlan && (
        <PlanConfirmedOverlay
          plan={livePlan}
          isWaitlist={isWaitlist}
          isLeft={isLeft}
          onGoToPlans={() => {
            onClose();
            if (setPlansFilter) {
              setPlansFilter(isLeft ? "SKIPPED" : isWaitlist ? "WAITLISTED" : "JOINED");
            }
            setActiveTab("plans");
          }}
          onBackToHome={onClose}
        />
      )}
    </AnimatePresence>
  );
}
