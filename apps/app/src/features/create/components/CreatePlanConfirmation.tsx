import React from "react";
import { motion } from "motion/react";
import { Check, Link, CheckCircle } from "lucide-react";

interface CreatePlanConfirmationProps {
  onCopyInviteLink?: () => void;
  isCopying?: boolean;
  isCopied?: boolean;
  onGoToPlans?: () => void;
  className?: string;
}

export const CreatePlanConfirmation: React.FC<CreatePlanConfirmationProps> = ({
  onCopyInviteLink,
  isCopying = false,
  isCopied = false,
  onGoToPlans,
  className = "",
}) => {
  const PARTICLES = [
    { angle: 0, dist: 72 },
    { angle: 45, dist: 80 },
    { angle: 90, dist: 72 },
    { angle: 135, dist: 80 },
    { angle: 180, dist: 72 },
    { angle: 225, dist: 80 },
    { angle: 270, dist: 72 },
    { angle: 315, dist: 80 },
  ] as const;

  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const springTransition = { type: "spring", stiffness: 420, damping: 28 } as const;

  return (
    <motion.div
      className={`flex-1 flex flex-col justify-between relative h-full bg-[#050505] overflow-hidden text-left ${className}`}
      initial={prefersReducedMotion ? {} : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      {/* ─── Upper: Hero animation + text ─── */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-10">
        {/* Success orb + ring + particles */}
        <div className="relative flex items-center justify-center">
          {/* Expanding glow ring */}
          <motion.div
            className="absolute rounded-full border border-[#FF6B2C]/40"
            initial={prefersReducedMotion ? {} : { width: 80, height: 80, opacity: 0.6 }}
            animate={{ width: 160, height: 160, opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeOut", delay: 0.15 }}
          />

          {/* Second subtler ring */}
          <motion.div
            className="absolute rounded-full border border-[#FF6B2C]/20"
            initial={prefersReducedMotion ? {} : { width: 80, height: 80, opacity: 0.4 }}
            animate={{ width: 200, height: 200, opacity: 0 }}
            transition={{ duration: 1.4, ease: "easeOut", delay: 0.2 }}
          />

          {/* Particles */}
          {!prefersReducedMotion &&
            PARTICLES.map((p, i) => {
              const rad = (p.angle * Math.PI) / 180;
              const tx = Math.cos(rad) * p.dist;
              const ty = Math.sin(rad) * p.dist;
              return (
                <motion.div
                  key={i}
                  className="absolute w-1.5 h-1.5 rounded-full bg-[#FF6B2C]"
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x: tx, y: ty, opacity: 0, scale: 0.4 }}
                  transition={{ duration: 0.65, ease: "easeOut", delay: 0.12 + i * 0.018 }}
                />
              );
            })}

          {/* Main orb */}
          <motion.div
            className="relative w-24 h-24 bg-[#FF6B2C]/10 border border-[#FF6B2C]/30 rounded-full flex items-center justify-center"
            style={{ boxShadow: "0 0 32px 0 rgba(255,107,44,0.18)" }}
            initial={prefersReducedMotion ? {} : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...springTransition, delay: 0.05 }}
          >
            {/* Check icon draws in */}
            <motion.div
              initial={prefersReducedMotion ? {} : { scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ ...springTransition, delay: 0.2 }}
            >
              <Check className="w-11 h-11 text-[#FF6B2C] stroke-[2.5]" />
            </motion.div>
          </motion.div>
        </div>

        {/* Text block */}
        <div className="text-center space-y-3">
          <motion.h2
            className="text-3xl font-black text-white tracking-tight leading-none"
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.28 }}
          >
            Plan Created!
          </motion.h2>
          <motion.p
            className="text-[13px] text-zinc-500 font-medium max-w-[240px] mx-auto leading-relaxed"
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.38 }}
          >
            Your plan is live. Share it with the people you want there.
          </motion.p>
        </div>
      </div>

      {/* ─── Actions Footer ─── */}
      <motion.div
        className="px-5 pb-10 pt-4 space-y-3 w-full"
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.48 }}
      >
        {/* Send Link — primary */}
        <motion.button
          type="button"
          onClick={onCopyInviteLink}
          disabled={isCopying}
          className="w-full bg-[#FF6B2C] text-[#050505] py-4 rounded-2xl font-black text-[11px] tracking-widest uppercase flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer select-none"
          style={{ boxShadow: "0 8px 28px rgba(255,107,44,0.28)" }}
          whileTap={prefersReducedMotion ? {} : { scale: 0.97 }}
          transition={springTransition}
        >
          {isCopied ? (
            <>
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>Link Copied!</span>
            </>
          ) : (
            <>
              <Link className="w-4 h-4 shrink-0" />
              <span>{isCopying ? "Generating..." : "Send Link"}</span>
            </>
          )}
        </motion.button>

        {/* Go to Plans — secondary */}
        {onGoToPlans && (
          <motion.button
            type="button"
            onClick={onGoToPlans}
            className="w-full bg-transparent border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 py-4 rounded-2xl font-bold text-[11px] tracking-widest uppercase flex items-center justify-center transition-colors cursor-pointer select-none"
            whileTap={prefersReducedMotion ? {} : { scale: 0.97 }}
            transition={springTransition}
          >
            Go to Plans
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
};
