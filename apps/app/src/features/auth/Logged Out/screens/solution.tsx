import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PlanAnimation, isPlanAnimationCompleted } from "../components/PlanAnimation";

interface SolutionProps {
  onGetStarted: () => void;
  onBack?: () => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  className?: string;
}

export function Solution({
  onGetStarted,
  onBack,
  onTouchStart,
  onTouchEnd,
  className = "",
}: SolutionProps) {
  // Get Started CTA visibility flag (revealed only after PlanAnimation completes, or immediately if already completed)
  const [showGetStarted, setShowGetStarted] = useState<boolean>(() => isPlanAnimationCompleted());

  const handlePlanAnimationComplete = useCallback(() => {
    setShowGetStarted(true);
  }, []);

  return (
    <div
      id="solution_screen"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className={`w-full h-full text-white bg-[#000000] flex flex-col justify-between font-sans relative overflow-hidden select-none ${className}`}
    >
      {/* 1. [HEADER] Top headline matching typography & visual language of Complicated.tsx */}
      <div className="w-full shrink-0 pt-[max(1.25rem,env(safe-area-inset-top))] px-5 sm:px-8 md:px-10">
        <h1 className="text-[22px] xs:text-[24px] sm:text-[26px] md:text-[28px] font-sans font-bold tracking-tight text-white leading-[1.22] text-left">
          <span className="block">Planless makes it easier</span>
          <span className="block">for you to organize your plans</span>
        </h1>
      </div>

      {/* 2. [PLAN ANIMATION] Single owner of the full continuous sequence */}
      <div className="flex-1 w-full flex items-center justify-center min-h-0 px-4 py-2 sm:py-3.5 overflow-hidden">
        <PlanAnimation
          onComplete={handlePlanAnimationComplete}
          onBack={onBack}
        />
      </div>

      {/* 3. [BOTTOM CTA] Full-width compact orange Next button — revealed only when animation completes */}
      <div className="w-full shrink-0 min-h-[58px] flex items-end">
        <AnimatePresence>
          {showGetStarted && (
            <motion.div
              key="cta_container_solution"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 14 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="w-full px-4 sm:px-6 md:px-8 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <button
                id="btn_onboarding_cta_solution"
                type="button"
                onClick={onGetStarted}
                className="w-full py-3 px-6 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] text-white font-semibold text-[14px] xs:text-[14.5px] sm:text-[15px] tracking-wide transition active:scale-[0.99] cursor-pointer text-center shadow-md shadow-[#FF6B2C]/20"
              >
                Next
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default Solution;
