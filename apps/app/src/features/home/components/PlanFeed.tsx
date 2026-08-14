import React from "react";
import { Sparkles, Plus } from "lucide-react";
import { motion } from "motion/react";
import { Plan, UserProfile, NotificationItem } from "../../../core/types";
import { PlanCard } from "./PlanCard";
import { usePlansStore } from "../../plans/state/PlansContext";

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

const EndCard: React.FC<{
  hasPlans: boolean;
  onNavigateToCreate?: () => void;
}> = ({ hasPlans, onNavigateToCreate }) => {
  return (
    <div className="h-full w-full snap-start snap-always relative rounded-[32px] overflow-hidden border border-white/[0.06] flex flex-col justify-center items-center bg-[#000000] shadow-2xl p-8 text-center select-none flex-shrink-0">
      <div className="absolute inset-0 bg-[#000000] z-0" />

      <motion.div 
        initial={{ opacity: 0, y: 15, scale: 0.98 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: false, amount: 0.3 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex flex-col items-center max-w-[280px]"
      >
        <div className="w-16 h-16 rounded-full bg-white/[0.02] border border-white/[0.06] flex items-center justify-center mb-8 shadow-inner shadow-white/[0.02]">
          <Sparkles className="w-6 h-6 text-zinc-400" />
        </div>

        <h3 className="font-sans font-semibold text-[24px] text-white tracking-tight leading-none mb-4">
          {hasPlans ? "You're all caught up" : "No plans currently"}
        </h3>

        <p className="text-zinc-455 font-sans text-[13.5px] leading-relaxed mb-10 font-normal">
          {hasPlans ? (
            <>
              No more plans nearby right now.
              <br />
              <span className="text-zinc-550 font-normal block mt-1">Start something people will want to join.</span>
            </>
          ) : (
            "Host the next one."
          )}
        </p>

        <button
          onClick={onNavigateToCreate}
          className="w-full py-4 px-8 bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.02] text-white font-sans font-semibold text-[13.5px] tracking-wide rounded-full transition-all duration-300 border border-white/[0.12] hover:border-white/[0.20] active:scale-[0.98] cursor-pointer shadow-xl flex items-center justify-center gap-2 group backdrop-blur-md"
        >
          <Plus className="w-4 h-4 text-zinc-450 transition-transform duration-300 group-hover:rotate-90" />
          Create a Plan
        </button>
      </motion.div>
    </div>
  );
};

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

  React.useEffect(() => {
    const el = homeFeedRef.current;
    if (!el) return;

    let isAnimating = false;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (isAnimating) return;

      const N = plansToRender.length + 1;
      if (N <= 1) return;

      const clientHeight = el.clientHeight;
      if (clientHeight <= 0) return;

      const currentScrollTop = el.scrollTop;
      const currentIndex = Math.round(currentScrollTop / clientHeight);

      let targetIndex = currentIndex;
      if (e.deltaY > 5) {
        targetIndex = Math.min(N - 1, currentIndex + 1);
      } else if (e.deltaY < -5) {
        targetIndex = Math.max(0, currentIndex - 1);
      }

      if (targetIndex !== currentIndex) {
        isAnimating = true;
        el.scrollTo({
          top: targetIndex * clientHeight,
          behavior: "smooth",
        });

        setActiveCardIndex(targetIndex);
        const targetPlan = plansToRender[targetIndex];
        if (targetPlan) {
          setActiveCardId(targetPlan.id);
        } else {
          setActiveCardId("");
        }

        setTimeout(() => {
          isAnimating = false;
        }, 500);
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, [plansToRender, setActiveCardId, setActiveCardIndex, homeFeedRef]);

  return (
    <div
      id="home_swipe_feed"
      ref={homeFeedRef}
      className="h-full w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar"
      style={{
        scrollSnapType: "y mandatory",
        WebkitOverflowScrolling: "touch",
      }}
      onScroll={(e) => {
        const el = e.currentTarget;
        const clientHeight = el.clientHeight;
        if (clientHeight <= 0) return;
        const index = Math.round(el.scrollTop / clientHeight);
        const totalItems = plansToRender.length + 1;
        if (index >= 0 && index < totalItems) {
          if (index !== activeCardIndex) {
            setActiveCardIndex(index);
            const targetPlan = plansToRender[index];
            if (targetPlan) {
              setActiveCardId(targetPlan.id);
            } else {
              setActiveCardId("");
            }
          }
        }
      }}
    >
      {plansToRender.map((plan) => (
        <PlanCard
          key={plan.id}
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
              const nextVal = typeof val === "function" ? val(currentIsExpanded) : val;
              return nextVal ? plan.id : null;
            });
          }}
          onSelectCard={(id) => {
            setActiveCardId(id);
            setExpandedCardId(null);
            if (id) {
              setSelectedPlan(id);
            }
          }}
          handleSnoozePlan={handleSnoozePlan}
          waitlistPlan={handleWaitlistPlan}
        />
      ))}
      <EndCard
        hasPlans={plansToRender.length > 0}
        onNavigateToCreate={onNavigateToCreate}
      />
    </div>
  );
};

