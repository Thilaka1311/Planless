import React, { useEffect, useState } from "react";
import { motion, useAnimation } from "motion/react";
import { Film, Trophy, Utensils, Users, Calendar } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  description?: React.ReactNode;
  py?: string;
  variant?: "dashed" | "default";
  title?: string;
  ctaButton?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  description,
  py,
  variant,
  title,
  ctaButton,
}) => {
  const [timelinePhase, setTimelinePhase] = useState<
    "discovery" | "comingTogether" | "vennOverlap" | "friendsFadeIn" | "planMorph" | "restState"
  >("discovery");

  useEffect(() => {
    if (variant === "dashed") return;

    let isMounted = true;

    // Timeline Loop Controller (continuous, seamless loop without long calendar pause)
    const runTimelineLoop = async () => {
      while (isMounted) {
        // Phase 1 - Discovery (Separated category circles)
        if (!isMounted) break;
        setTimelinePhase("discovery");
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Phase 2 - Coming Together (Circles move inward)
        if (!isMounted) break;
        setTimelinePhase("comingTogether");
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Phase 3 - Venn overlap (Overlapped positioning settles)
        if (!isMounted) break;
        setTimelinePhase("vennOverlap");
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Phase 4 - Friends (Category icons fade out, Users icon fades in)
        if (!isMounted) break;
        setTimelinePhase("friendsFadeIn");
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Phase 5 - Plan Creation (Users icon morphs to Calendar)
        if (!isMounted) break;
        setTimelinePhase("planMorph");
        await new Promise((resolve) => setTimeout(resolve, 1200));

        // Loop immediately restarts back to discovery seamlessly
      }
    };

    runTimelineLoop();

    return () => {
      isMounted = false;
    };
  }, [variant]);

  if (variant === "dashed") {
    return (
      <div className={`border border-dashed border-white/[0.08] rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-3 bg-[#111111]/30 ${py || ""}`}>
        {icon || (
          <div className="flex items-center justify-center w-10 h-10 text-zinc-400">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-8 h-8"
            >
              <path d="M12 3 C12 8, 8 12, 3 12 C8 12, 12 16, 12 21 C12 16, 16 12, 21 12 C16 12, 12 8, 12 3 Z" />
            </svg>
          </div>
        )}
        {title && (
          <h4 className="text-xs font-sans font-semibold text-white/90 uppercase tracking-wider">
            {title}
          </h4>
        )}
        <p className="text-zinc-500 text-xs font-sans max-w-[220px] leading-relaxed">
          {description}
        </p>
      </div>
    );
  }

  // Setup spring dynamics
  const smoothSpring = {
    type: "spring" as const,
    stiffness: 28,
    damping: 12,
  };

  // Determine positions based on current timeline phase
  const getCircleOffset = (circle: "movies" | "sports" | "dining") => {
    const isSeparated = timelinePhase === "discovery";
    
    if (circle === "movies") {
      // Top circle
      return {
        x: 0,
        y: isSeparated ? -52 : -18,
      };
    } else if (circle === "sports") {
      // Bottom Left
      return {
        x: isSeparated ? -46 : -18,
        y: isSeparated ? 32 : 14,
      };
    } else {
      // Bottom Right
      return {
        x: isSeparated ? 46 : 18,
        y: isSeparated ? 32 : 14,
      };
    }
  };

  // Visibility states for different phases
  const showCategories = timelinePhase === "discovery" || timelinePhase === "comingTogether" || timelinePhase === "vennOverlap";
  const showFriends = timelinePhase === "friendsFadeIn";
  const showPlan = timelinePhase === "planMorph" || timelinePhase === "restState";

  return (
    <div className={`flex-1 flex flex-col items-center justify-center text-center p-8 space-y-8 select-none bg-[#000000] h-full ${py || ""}`}>
      {icon ? (
        <div className="flex items-center justify-center mb-2 text-zinc-400 text-3xl font-medium">
          {icon}
        </div>
      ) : (
        <div className="relative w-64 h-64 flex items-center justify-center overflow-hidden">
          
          {/* Subtle Ambient Radial Glow (6-10% opacity) */}
          <div className="absolute w-44 h-44 rounded-full bg-[#FF6B2C]/6 blur-[48px] pointer-events-none" />

          {/* Overlapping Venn diagram circle elements */}
          
          {/* 1. MOVIES (Top) */}
          <motion.div
            className="absolute rounded-full border border-purple-500/20 bg-purple-950/10 flex items-center justify-center shadow-lg pointer-events-none"
            style={{
              width: 90,
              height: 90,
            }}
            animate={{
              x: getCircleOffset("movies").x,
              y: getCircleOffset("movies").y,
              scale: [1, 1.025, 1],
            }}
            transition={{
              x: smoothSpring,
              y: smoothSpring,
              scale: { duration: 4, repeat: Infinity, ease: "easeInOut" },
            }}
          >
            {/* Category Icon */}
            <motion.div
              animate={{ opacity: showCategories ? 0.75 : 0 }}
              transition={{ duration: 0.4 }}
              className="text-purple-400"
            >
              <Film className="w-5 h-5" strokeWidth={1.5} />
            </motion.div>
          </motion.div>

          {/* 2. SPORTS (Bottom Left) */}
          <motion.div
            className="absolute rounded-full border border-emerald-500/20 bg-emerald-950/10 flex items-center justify-center shadow-lg pointer-events-none"
            style={{
              width: 90,
              height: 90,
            }}
            animate={{
              x: getCircleOffset("sports").x,
              y: getCircleOffset("sports").y,
              scale: [1, 1.025, 1],
            }}
            transition={{
              x: smoothSpring,
              y: smoothSpring,
              scale: { duration: 4.2, repeat: Infinity, ease: "easeInOut" },
            }}
          >
            <motion.div
              animate={{ opacity: showCategories ? 0.75 : 0 }}
              transition={{ duration: 0.4 }}
              className="text-emerald-400"
            >
              <Trophy className="w-5 h-5" strokeWidth={1.5} />
            </motion.div>
          </motion.div>

          {/* 3. DINING (Bottom Right) */}
          <motion.div
            className="absolute rounded-full border border-rose-500/20 bg-rose-950/10 flex items-center justify-center shadow-lg pointer-events-none"
            style={{
              width: 90,
              height: 90,
            }}
            animate={{
              x: getCircleOffset("dining").x,
              y: getCircleOffset("dining").y,
              scale: [1, 1.025, 1],
            }}
            transition={{
              x: smoothSpring,
              y: smoothSpring,
              scale: { duration: 3.8, repeat: Infinity, ease: "easeInOut" },
            }}
          >
            <motion.div
              animate={{ opacity: showCategories ? 0.75 : 0 }}
              transition={{ duration: 0.4 }}
              className="text-rose-400"
            >
              <Utensils className="w-5 h-5" strokeWidth={1.5} />
            </motion.div>
          </motion.div>

          {/* Dynamic morph overlays (Users / Calendar) */}
          
          {/* Friends state (Users icon) */}
          <motion.div
            className="absolute text-zinc-300 pointer-events-none flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: showFriends ? 0.9 : 0,
              scale: showFriends ? 1 : 0.8,
            }}
            transition={{ duration: 0.4 }}
          >
            <Users className="w-6 h-6" strokeWidth={1.5} />
          </motion.div>

          {/* Plan state (Calendar icon) */}
          <motion.div
            className="absolute text-zinc-300 pointer-events-none flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: showPlan ? 0.9 : 0,
              scale: showPlan ? 1 : 0.8,
            }}
            transition={{ duration: 0.4 }}
          >
            <Calendar className="w-6 h-6" strokeWidth={1.5} />
          </motion.div>

        </div>
      )}

      {/* Empty state copy message and optional CTA */}
      <div className="flex flex-col items-center justify-center text-center space-y-2">
        <h3 className="font-sans font-semibold text-[20px] text-white tracking-tight leading-tight whitespace-nowrap">
          {title || "Bring friends together."}
        </h3>
        <p className="text-zinc-500 font-sans text-xs leading-relaxed max-w-[260px] font-normal">
          {description || "Every great plan starts with a conversation."}
        </p>

        {ctaButton && (
          <div className="pt-3">
            {ctaButton}
          </div>
        )}
      </div>
    </div>
  );
};
