import React from 'react';
import { motion } from 'motion/react';
import { Check, X } from 'lucide-react';
import { Plan as ActivePlan } from '../../../core/types';
import { usePlansStore } from "../state/PlansContext";
import { useProfileStore } from "../../profile/state/ProfileContext";

interface PlanConfirmedOverlayProps {
  plan: ActivePlan;
  isWaitlist?: boolean;
  isLeft?: boolean;
  onGoToPlans: () => void;
  onBackToHome: () => void;
}

export const PlanConfirmedOverlay: React.FC<PlanConfirmedOverlayProps> = ({
  plan,
  isWaitlist = false,
  isLeft = false,
  onGoToPlans,
  onBackToHome,
}) => {
  const { plans } = usePlansStore();
  const { userProfile } = useProfileStore();
  const activeUserId = userProfile?.dbUuid || "";
  const livePlan = plans.find(p => p.id === plan.id) || plan;

  const waitlistPosition = React.useMemo(() => {
    if (!isWaitlist || !livePlan.members) return null;
    const waitlist = livePlan.members
      .filter(m => m.joinState === "WAITLISTED")
      .sort((a, b) => new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime());
    const myIndex = waitlist.findIndex(m => m.userId === activeUserId);
    return myIndex !== -1 ? myIndex + 1 : waitlist.length + 1;
  }, [livePlan.members, activeUserId, isWaitlist]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="absolute inset-0 bg-[#050505] z-50 flex flex-col justify-between p-6 select-none text-center"
    >
      {/* Top spacer to align layout vertically */}
      <div className="w-full h-12"></div>

      {/* Centered Confirmation Section */}
      <div className="flex-1 flex flex-col justify-center items-center space-y-8 my-auto">
        
        {/* Glow-enhanced Badge */}
        <motion.div 
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ 
            scale: [0.85, 1.06, 1],
            opacity: 1,
          }}
          transition={{ 
            delay: 0.1,
            duration: 0.45, 
            ease: [0.16, 1, 0.3, 1]
          }}
          className={`w-20 h-20 rounded-full flex items-center justify-center ${
            isLeft
              ? "bg-red-500/10 border-2 border-red-500/70 text-red-500 shadow-[0_0_40px_rgba(239,68,68,0.35)]"
              : isWaitlist
              ? "bg-amber-500/10 border-2 border-[#F5C542]/70 text-[#F5C542] shadow-[0_0_40px_rgba(245,197,66,0.35)]"
              : "bg-emerald-500/10 border-2 border-emerald-500/70 text-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.35)]"
          }`}
        >
          {isLeft ? (
            <X className="w-9 h-9 stroke-[3]" />
          ) : (
            <Check className="w-9 h-9 stroke-[3]" />
          )}
        </motion.div>

        {/* Text Area */}
        <div className="space-y-4 max-w-xs mx-auto">
          {/* Headline */}
          <motion.h3 
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.3, ease: 'easeOut' }}
            className="font-sans font-black text-[28px] text-white tracking-tight leading-none"
          >
            {isLeft ? "You've Left" : isWaitlist ? "Added to Waitlist" : "You're In"}
          </motion.h3>

          {/* Waitlist Description */}
          {isWaitlist && (
            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.3, ease: 'easeOut' }}
              className="text-[13px] text-zinc-400 font-sans font-medium tracking-wide leading-relaxed space-y-2 mt-2"
            >
              <div>
                You've been added to the waitlist.
                <br />
                We'll notify you if a spot becomes available.
              </div>
              {waitlistPosition !== null && (
                <div className="text-[14px] text-[#F5C542] font-sans font-extrabold tracking-tight mt-2.5">
                  Position #{waitlistPosition}
                </div>
              )}
            </motion.div>
          )}

          {/* Left Plan Description */}
          {isLeft && (
            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.3, ease: 'easeOut' }}
              className="text-[13px] text-zinc-400 font-sans font-medium tracking-wide leading-relaxed mt-2"
            >
              You are no longer attending this plan.
            </motion.div>
          )}
          
          {/* Plan context with title, date, time and host */}
          <motion.div
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.3, ease: 'easeOut' }}
            className="space-y-2 mt-4"
          >
            <div className="text-[17px] text-white font-sans font-extrabold tracking-tight leading-snug">
              {livePlan.title}
            </div>
            <div className="text-[13px] text-zinc-400 font-sans font-medium tracking-wide">
              {livePlan.time}
            </div>
            <div className="text-[12.5px] text-zinc-500 font-sans">
              Hosted by <strong className="text-zinc-300 font-semibold">{livePlan.creatorName || "Host"}</strong>
            </div>
          </motion.div>
        </div>

      </div>

      {/* Primary and Secondary Action CTAs */}
      <div className="w-full pt-6 pb-6 flex flex-col items-center">
        {/* Primary Action Button (Staged Entrance: 500ms) */}
        <motion.button
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ 
            delay: 0.5, 
            type: 'spring', 
            stiffness: 400, 
            damping: 24 
          }}
          onClick={onGoToPlans}
          className="w-full py-4 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] text-white font-sans font-extrabold text-xs tracking-[0.15em] transition-all duration-200 uppercase cursor-pointer shadow-lg shadow-[#FF6B2C]/20 active:scale-98 border border-[#FF6B2C]/20"
          id="btn-go-to-plans"
        >
          Go To Plans
        </motion.button>

        {/* Secondary Action Link (Staged Entrance: 650ms) */}
        <motion.button
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ 
            delay: 0.65, 
            type: 'spring', 
            stiffness: 400, 
            damping: 24 
          }}
          onClick={onBackToHome}
          className="w-full mt-5 py-2 text-[#94A3B8]/65 hover:text-white font-sans font-black text-[11px] tracking-[0.14em] transition-colors duration-200 uppercase cursor-pointer"
          id="btn-back-to-home"
        >
          Back to Home
        </motion.button>
      </div>
    </motion.div>
  );
};
