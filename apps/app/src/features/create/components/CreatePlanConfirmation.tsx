import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Check, Share, CheckCircle } from "lucide-react";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";

interface CreatePlanConfirmationProps {
  planTitle?: string;
  planCoverImage?: string | null;
  planId?: string | null;
  onCopyInviteLink?: () => void;
  isCopying?: boolean;
  isCopied?: boolean;
  onGoToPlans?: () => void;
  className?: string;
}

export const CreatePlanConfirmation: React.FC<CreatePlanConfirmationProps> = ({
  planTitle,
  planCoverImage,
  planId,
  onCopyInviteLink,
  isCopying = false,
  isCopied = false,
  onGoToPlans,
  className = "",
}) => {
  const PARTICLES = [
    { angle: 0, dist: 80 },
    { angle: 45, dist: 90 },
    { angle: 90, dist: 80 },
    { angle: 135, dist: 90 },
    { angle: 180, dist: 80 },
    { angle: 225, dist: 90 },
    { angle: 270, dist: 80 },
    { angle: 315, dist: 90 },
  ] as const;

  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const springTransition = { type: "spring", stiffness: 420, damping: 28 } as const;

  // 3-Stage Animation:
  // Step 1: "tick" (checkmark only)
  // Step 2: "avatar" (same circle transforms into plan avatar)
  // Step 3: "content" (reveal remaining content: plan name, Plan Created!, Share, Go to Plans)
  const [stage, setStage] = useState<"tick" | "avatar" | "content">(
    prefersReducedMotion ? "content" : "tick"
  );

  useEffect(() => {
    if (prefersReducedMotion) return;
    const t1 = setTimeout(() => {
      setStage("avatar");
    }, 850);
    const t2 = setTimeout(() => {
      setStage("content");
    }, 1350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [prefersReducedMotion]);

  return (
    <motion.div
      className={`flex-1 flex flex-col justify-between relative h-full bg-[#050505] overflow-hidden text-left ${className}`}
      initial={prefersReducedMotion ? {} : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      {/* ─── Upper: Hero animation + text ─── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 my-auto">
        <motion.div
          className="flex flex-col items-center"
          animate={stage === "content" ? { y: -14 } : { y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          {/* Success orb + ring + particles + transform into avatar */}
          <div className="relative flex items-center justify-center">
            {/* Expanding glow ring (Step 1) */}
            <motion.div
              className="absolute rounded-full border border-[#FF6B2C]/40"
              initial={prefersReducedMotion ? {} : { width: 90, height: 90, opacity: 0.6 }}
              animate={{ width: 180, height: 180, opacity: 0 }}
              transition={{ duration: 1.1, ease: "easeOut", delay: 0.15 }}
            />

            {/* Second subtler ring (Step 1) */}
            <motion.div
              className="absolute rounded-full border border-[#FF6B2C]/20"
              initial={prefersReducedMotion ? {} : { width: 90, height: 90, opacity: 0.4 }}
              animate={{ width: 230, height: 230, opacity: 0 }}
              transition={{ duration: 1.4, ease: "easeOut", delay: 0.2 }}
            />

            {/* Particles (Step 1) */}
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

            {/* Main circular element: transforms from checkmark circle to plan avatar in-place */}
            <motion.div
              className="relative w-28 h-28 rounded-full overflow-hidden flex items-center justify-center border border-[#FF6B2C]/30 bg-[#FF6B2C]/10 shadow-[0_0_36px_rgba(255,107,44,0.22)]"
              initial={prefersReducedMotion ? {} : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...springTransition, delay: 0.05 }}
            >
              {/* Step 1: Check icon */}
              <motion.div
                className="absolute inset-0 flex items-center justify-center z-10"
                initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0, rotate: -30, opacity: 1 }}
                animate={stage === "tick" ? { scale: 1, rotate: 0, opacity: 1 } : { scale: 0.4, opacity: 0 }}
                transition={{ duration: 0.35, ease: "easeInOut" }}
              >
                <Check className="w-13 h-13 text-[#FF6B2C] stroke-[2.5]" />
              </motion.div>

              {/* Step 2 & 3: Plan Avatar transforms in-place */}
              <motion.div
                className="absolute inset-0 w-full h-full z-20"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={stage !== "tick" ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                <DiscoveryImages
                  src={planCoverImage}
                  planId={planId || undefined}
                  screen="Create Plan Confirmation"
                  alt={planTitle || "Plan"}
                  className="w-full h-full object-cover"
                />
              </motion.div>
            </motion.div>
          </div>

          {/* Content block: only revealed in Step 3 after avatar transformation */}
          {stage === "content" && (
            <motion.div
              className="text-center space-y-1 mt-6"
              initial={prefersReducedMotion ? {} : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Plan name: visually smaller than Plan Created! heading */}
              <div className="text-[15px] font-semibold text-zinc-400 tracking-tight leading-snug truncate max-w-[280px] mx-auto">
                {planTitle || "Your Plan"}
              </div>
              {/* Plan Created!: larger primary confirmation heading */}
              <h2 className="text-[26px] font-black text-white tracking-tight leading-tight">
                Plan Created!
              </h2>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* ─── Actions Footer: only revealed in Step 3 after avatar transformation ─── */}
      {stage === "content" && (
        <motion.div
          className="w-full px-5 pb-8 pt-4 flex flex-col items-center gap-3.5"
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Share — primary CTA: full width based on device, pill-shaped, orange background, white text */}
          <motion.button
            type="button"
            onClick={onCopyInviteLink}
            disabled={isCopying}
            className="w-full bg-[#FF6B2C] text-white py-4 rounded-full font-bold text-sm tracking-wide flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer select-none shadow-lg shadow-[#FF6B2C]/25"
            whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
            transition={springTransition}
          >
            {isCopied ? (
              <>
                <CheckCircle className="w-4 h-4 shrink-0 text-white" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Share className="w-4 h-4 shrink-0 text-white" />
                <span>{isCopying ? "Generating..." : "Share"}</span>
              </>
            )}
          </motion.button>

          {/* Go to Plans — secondary CTA: text-only, no dark container background, no border */}
          {onGoToPlans && (
            <motion.button
              type="button"
              onClick={onGoToPlans}
              className="w-full bg-transparent border-none text-zinc-400 hover:text-white py-2 font-medium text-xs tracking-wide flex items-center justify-center transition-colors cursor-pointer select-none"
              whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
              transition={springTransition}
            >
              Go to Plans
            </motion.button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
};
