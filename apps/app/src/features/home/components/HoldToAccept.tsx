import React, { useMemo } from "react";
import { motion } from "motion/react";
import { MapPin } from "lucide-react";
import { Plan } from "../../../core/types";
import { useLivePlan } from "../../plans/hooks/useLivePlan";
import { usePlansStore } from "../../plans/state/PlansContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { getHeroMetadataCostText } from "../../plans/components/HeroMetadataCard";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";

interface HoldToAcceptOverlayProps {
  planId: string;
  holdProgress: number;
  isHolding: boolean;
  isFull: boolean;
  formattedDateAndTime: string;
  costText?: string | null;
}

export const HoldToAcceptOverlay: React.FC<HoldToAcceptOverlayProps> = ({
  planId,
  holdProgress,
  isHolding,
  isFull,
  formattedDateAndTime,
  costText: propCostText,
}) => {
  const plan = useLivePlan(planId);
  const { dbPlans } = usePlansStore();
  const { dbUsers } = useProfileStore();

  const costText = useMemo(() => {
    if (propCostText !== undefined) {
      return propCostText;
    }
    const rawDbPlan = dbPlans.find((p) => p.id === plan?.id || (plan?.dbUuid && p.id === plan.dbUuid));
    return getHeroMetadataCostText(rawDbPlan, plan);
  }, [propCostText, plan, dbPlans]);

  const hostMember = useMemo(() => {
    if (!plan) return null;
    return (
      plan.members?.find((m) => m.isHost || (m as any).role === "HOST") ||
      plan.members?.find((m) => (m.userUuid || m.userId) === plan.hostId || (m.userUuid || m.userId) === plan.creatorId) ||
      null
    );
  }, [plan]);

  const hostUser = useMemo(() => {
    if (!dbUsers || (!plan && !hostMember)) return null;
    const targetId = plan?.hostId || plan?.creatorId || hostMember?.userUuid || hostMember?.userId;
    if (!targetId) return null;
    return (
      dbUsers.find(
        (u) =>
          u.id === targetId ||
          u.user_id === targetId ||
          (hostMember?.userUuid && u.id === hostMember.userUuid) ||
          (hostMember?.userId && (u.user_id === hostMember.userId || u.id === hostMember.userId))
      ) || null
    );
  }, [plan, hostMember, dbUsers]);

  const hostAvatar = useMemo(() => {
    return (
      hostMember?.avatar ||
      hostMember?.profile_photo ||
      plan?.creatorAvatar ||
      hostUser?.profile_photo ||
      (hostUser as any)?.avatar ||
      null
    );
  }, [hostMember, plan, hostUser]);

  const hostName = useMemo(() => {
    return (
      hostMember?.name ||
      hostMember?.displayName ||
      plan?.creatorName ||
      hostUser?.full_name ||
      (hostUser as any)?.name ||
      "Host"
    );
  }, [hostMember, plan, hostUser]);

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
            <div className="flex items-center justify-center gap-1.5 mt-2.5">
              <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-[14.5px] font-sans font-extrabold text-white tracking-tight">
                {plan.location}
              </span>
            </div>
          )}
          
          {/* 3. Host details (Subtle metadata with host avatar) */}
          <div className="flex flex-col items-center mt-3">
            <UserAvatar
              src={hostAvatar}
              alt={hostName}
              size="w-10 h-10"
              className="border border-white/20 shadow-md mb-1.5"
            />
            <span className="text-[11.5px] font-sans text-zinc-400 block leading-tight">
              Hosted by
            </span>
            <span className="text-[13px] font-sans font-bold text-zinc-100 block leading-tight mt-0.5">
              {hostName}
            </span>
          </div>

          {/* 4. Dynamic Cost per person (Supporting metadata from Hero Metadata Card) */}
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