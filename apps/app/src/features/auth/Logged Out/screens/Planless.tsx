import React, { useEffect } from "react";
import { motion } from "motion/react";
import planlessLogo from "../../../../assets/planless_logo.png";
import onboardingCups from "../../../../assets/Onboarding_cups.png";
import { preloadImage } from "../../../../shared/imaging/preloadImage";

export interface PlanlessProps {
  onGetStarted: () => void;
  onLogin?: () => void;
  className?: string;
}

export function Planless({
  onGetStarted,
  onLogin,
  className = "",
}: PlanlessProps) {
  // Idle prefetch: warm up the one-time cups illustration in the background while user views entry screen
  useEffect(() => {
    if (typeof window !== "undefined") {
      if ("requestIdleCallback" in window) {
        (window as any).requestIdleCallback(() => preloadImage(onboardingCups));
      } else {
        const t = setTimeout(() => preloadImage(onboardingCups), 300);
        return () => clearTimeout(t);
      }
    }
  }, []);

  return (
    <div
      id="planless_entry_screen"
      className={`w-full h-full text-white bg-[#000000] flex flex-col justify-between items-center font-sans relative overflow-hidden select-none px-4 sm:px-6 md:px-8 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] ${className}`}
    >
      {/* Centered Top & Middle Section: PLANLESS Title + Planless Logo */}
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col items-center justify-center min-h-0 py-6 sm:py-8">
        {/* Title: Planless */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full flex justify-center mb-6 xs:mb-7 sm:mb-8"
        >
          <h1
            style={{ fontFamily: "'Grand Hotel', cursive" }}
            className="text-[40px] xs:text-[46px] sm:text-[50px] leading-tight text-white text-center select-none font-normal tracking-normal"
          >
            Planless
          </h1>
        </motion.div>

        {/* Planless P Symbol */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
          className="relative flex items-center justify-center"
        >
          <img
            src={planlessLogo}
            alt="Planless Logo"
            loading="eager"
            decoding="sync"
            className="relative z-10 w-28 h-28 xs:w-32 xs:h-32 sm:w-36 sm:h-36 object-contain select-none pointer-events-none"
          />
        </motion.div>

        {/* Brand Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
          className="w-full flex justify-center mt-6 xs:mt-7 sm:mt-8"
        >
          <p className="text-[14.5px] xs:text-[15px] sm:text-[15.5px] font-sans font-normal text-zinc-400 tracking-tight text-center select-none">
            Plan less. Do more.
          </p>
        </motion.div>
      </div>

      {/* Bottom Actions Section: Get Started (Primary Action) + Already have an account - Full Width */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
        className="w-full flex flex-col gap-2.5 shrink-0 pt-2"
      >
        {/* Primary Action: Get Started */}
        <button
          id="btn_entry_get_started"
          type="button"
          onClick={onGetStarted}
          className="w-full py-3 px-6 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:bg-[#E55A1F] text-white font-semibold text-[14px] xs:text-[14.5px] sm:text-[15px] tracking-wide transition active:scale-[0.99] cursor-pointer text-center shadow-md shadow-[#FF6B2C]/20"
        >
          Get Started
        </button>

        {/* Secondary Action: Already have an account */}
        {onLogin && (
          <button
            id="btn_entry_already_have_account"
            type="button"
            onClick={onLogin}
            className="w-full py-2.5 px-4 text-center text-zinc-400 hover:text-white transition-colors duration-150 text-[13.5px] xs:text-[14px] font-medium cursor-pointer"
          >
            Already have an account
          </button>
        )}
      </motion.div>
    </div>
  );
}

export default Planless;
