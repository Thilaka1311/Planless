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
      {/* 1. Top headline matching typography & visual language - center aligned & responsively scaled */}
      <div className="w-full shrink-0 pt-1 xs:pt-2 sm:pt-3 px-5 sm:px-8 md:px-10 flex flex-col items-center">
        <h1 className="text-[18px] xs:text-[20px] sm:text-[22px] md:text-[24px] font-sans font-bold tracking-tight text-white leading-[1.25] text-center max-w-[360px] xs:max-w-[400px] sm:max-w-[440px] mx-auto">
          <span className="block">Planless makes it easier</span>
          <span className="block">for you to organize your plans</span>
        </h1>
      </div>

      {/* 2. [PLAN ANIMATION] Perfectly vertically centered between Heading bottom and Next Button top */}
      <div
        className={`flex-1 w-full min-h-0 flex items-center justify-center px-4 py-2 sm:py-3 overflow-hidden ${
          showGetStarted ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <PlanAnimation
          onComplete={handlePlanAnimationComplete}
          onBack={onBack}
          isInteractive={showGetStarted}
        />
      </div>

      {/* 3. [BOTTOM CTA] Full-width compact orange Next button — anchored at bottom with consistent safe-area spacing */}
      <div className="w-full shrink-0 px-4 sm:px-6 md:px-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="h-[46px] w-full flex items-center">
          <AnimatePresence>
            {showGetStarted && (
              <motion.div
                key="cta_container_solution"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="w-full"
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
    </div>
  );
}

export default Solution;
