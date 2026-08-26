import React, { useMemo } from "react";
import { motion } from "motion/react";
import { Plan } from "../../../core/types";
import { useLivePlan } from "../../plans/hooks/useLivePlan";
import { usePlansStore } from "../../plans/state/PlansContext";

interface HoldToAcceptOverlayProps {
  planId: string;
  holdProgress: number;
  isHolding: boolean;
  isFull: boolean;
  formattedDateAndTime: string;
}

export const HoldToAcceptOverlay: React.FC<HoldToAcceptOverlayProps> = ({
  planId,
  holdProgress,
  isHolding,
  isFull,
  formattedDateAndTime,
}) => {
  const plan = useLivePlan(planId);
  const { dbPlans } = usePlansStore();

  const costText = useMemo(() => {
    if (!plan) return null;
    const rawDbPlan = dbPlans.find((p) => p.id === plan.id || (plan.dbUuid && p.id === plan.dbUuid));
    if (!rawDbPlan || !rawDbPlan.total_cost || Number(rawDbPlan.total_cost) <= 0) return null;

    const total = Number(rawDbPlan.total_cost);
    const isCompleted = rawDbPlan.status === 'COMPLETED' || plan.status === 'COMPLETED';
    const divisor = isCompleted
      ? Number(rawDbPlan.attended_participants ?? plan.attended_participants ?? 0)
      : (rawDbPlan.max_participants ? Number(rawDbPlan.max_participants) : (plan.maxSpots || 8));

    if (total <= 0 || !divisor || divisor <= 0) return null;
    const perPerson = Math.round((total / divisor) * 100) / 100;
    return `₹${perPerson} / person`;
  }, [plan, dbPlans]);

  if (!isHolding || !plan) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ backgroundColor: `rgba(0, 0, 0, ${0.55 + (holdProgress / 100) * 0.37})` }}
      className="absolute inset-0 backdrop-blur-[2px] flex flex-col items-center justify-center z-30 pointer-events-none"
    >
      {/* Inner container to shift content stack slightly upward (approx 44px) for premium look */}
      <div className="flex flex-col items-center justify-center -translate-y-11">
        
        {/* Holding circular progress indicator ring with Planless orange glow */}
        <div className="relative w-28 h-28 flex items-center justify-center rounded-full shadow-[0_0_20px_rgba(255,107,44,0.15)] bg-black/10">
          
          {/* Circular ring path outline SVG */}
          <svg className="w-full h-full transform -rotate-90">
            {/* Background track outline */}
            <circle
              cx="56"
              cy="56"
              r="44"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="7"
              fill="none"
            />
            {/* Filling progress ring */}
            <circle
              cx="56"
              cy="56"
              r="44"
              stroke="#FF6B2C"
              strokeWidth="7"
              fill="none"
              strokeDasharray={2 * Math.PI * 44}
              strokeDashoffset={2 * Math.PI * 44 * (1 - holdProgress / 100)}
              strokeLinecap="round"
            />
          </svg>

          {/* Percentage output text back centered for robust timing feedback */}
          <div className="absolute font-sans font-black text-white text-lg tracking-tight select-none pointer-events-none">
            {Math.round(holdProgress)}%
          </div>
        </div>

        {/* Plan as the hero details with precise hierarchical priority */}
        <div className="flex flex-col items-center mt-6 text-center select-none pointer-events-none max-w-xs px-6">
          {/* 1. Plan Title (Largest text, scales subtly as reservation secures) */}
          <motion.span
            style={{
              scale: 0.96 + (holdProgress / 100) * 0.08,
              originX: 0.5,
              originY: 0.5,
            }}
            className="text-[22px] font-sans font-black text-white leading-tight block"
          >
            {plan.title}
          </motion.span>
          
          {/* 2. Venue details (Medium emphasis, immediately scannable location cue) */}
          {plan.location && (
            <span className="text-[14.5px] font-sans font-extrabold text-white mt-2.5 block tracking-tight">
              📍 {plan.location}
            </span>
          )}
          
          {/* 3. Host details (Subtle metadata) */}
          <span className="text-[12.5px] font-sans text-zinc-400 mt-1.5 block">
            Hosted by <strong className="font-bold text-zinc-100">{plan.creatorName || "Host"}</strong>
          </span>

          {/* 4. Dynamic Cost per person (Supporting metadata) */}
          {costText && (
            <span className="text-[13.5px] font-sans font-semibold text-white/90 mt-2 block tracking-tight">
              {costText}
            </span>
          )}
        </div>

      </div>
    </motion.div>
  );
};