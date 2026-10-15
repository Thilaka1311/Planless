import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import planlessLogo from "../assets/planless_logo.webp";

export interface SplashScreenProps {
  /**
   * Indicates whether the underlying application is ready (session resolved and initial screen ready to mount).
   */
  isReady: boolean;
  /**
   * Callback fired once the splash animation has completed and the app is ready to transition.
   */
  onDismiss: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ isReady, onDismiss }) => {
  const shouldReduceMotion = useReducedMotion();
  const [animationSequenceFinished, setAnimationSequenceFinished] = useState(false);

  // Sequence timing controller:
  // Standard mode: ~1.2s total animation sequence (within the 1–1.3s requirement)
  // Reduced motion mode: 0.8s gentle static hold
  useEffect(() => {
    const sequenceDurationMs = shouldReduceMotion ? 800 : 1200;
    const timer = setTimeout(() => {
      setAnimationSequenceFinished(true);
    }, sequenceDurationMs);

    return () => clearTimeout(timer);
  }, [shouldReduceMotion]);

  // Transition into the app:
  // When animation sequence finishes AND the app is ready, trigger dismissal.
  // AnimatePresence in App.tsx handles the smooth 300ms exit transition and cleanly unmounts the element from the DOM.
  const hasDismissedRef = React.useRef(false);
  useEffect(() => {
    if (animationSequenceFinished && isReady && !hasDismissedRef.current) {
      hasDismissedRef.current = true;
      onDismiss();
    }
  }, [animationSequenceFinished, isReady, onDismiss]);

  return (
    <motion.div
      id="planless-splash-screen"
      role="status"
      aria-label="Loading Planless"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, pointerEvents: "none" }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="fixed inset-0 w-full h-full bg-[#000000] z-[9999] flex flex-col items-center justify-center select-none overflow-hidden"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      <div className="flex flex-col items-center justify-center relative">
        {/* Step 1 & 2: Planless Orange Line & Grand Hotel Wordmark Reveal */}
        <div className="relative flex flex-col items-center justify-center">
          {/* Planless Wordmark in authentic Grand Hotel cursive typography */}
          <motion.h1
            style={{ fontFamily: "'Grand Hotel', cursive" }}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0.35, ease: "easeOut" }
                : { duration: 0.38, delay: 0.30, ease: [0.16, 1, 0.3, 1] }
            }
            className="text-white text-[44px] xs:text-[48px] sm:text-[54px] leading-none font-normal tracking-normal text-center select-none"
          >
            Planless
          </motion.h1>

          {/* Smooth Planless-orange horizontal line reveal */}
          {!shouldReduceMotion && (
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{
                scaleX: [0, 1, 1],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 0.65,
                times: [0, 0.45, 1],
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{ transformOrigin: "center center" }}
              className="h-[2px] w-32 xs:w-36 sm:w-40 bg-[#FF6B2C] rounded-full mt-2.5"
            />
          )}
        </div>

        {/* Step 3: Logo Symbol Reveal (Authentic planless_logo asset) */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.90, y: 6 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          transition={
            shouldReduceMotion
              ? { duration: 0.35, delay: 0.2, ease: "easeOut" }
              : { duration: 0.40, delay: 0.62, ease: [0.16, 1, 0.3, 1] }
          }
          className="mt-6 sm:mt-7 flex items-center justify-center"
        >
          <img
            src={planlessLogo}
            alt="Planless Symbol"
            loading="eager"
            decoding="sync"
            className="w-20 h-20 xs:w-24 xs:h-24 sm:w-28 sm:h-28 object-contain select-none pointer-events-none drop-shadow-md"
          />
        </motion.div>
      </div>
    </motion.div>
  );
};
