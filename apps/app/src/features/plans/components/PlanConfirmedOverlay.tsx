import React from 'react';
import { motion } from 'motion/react';
import { Check, X, MapPin } from 'lucide-react';
import { Plan as ActivePlan } from '../../../core/types';
import { usePlansStore } from "../state/PlansContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { UserAvatar } from '../../../IMGfromDB/UserAvatar';

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

  const hostMember = (livePlan.members || []).find(
    m => m.isHost || m.role === 'HOST' || m.userId === livePlan.creatorId || m.userId === livePlan.hostId
  );
  const hostAvatar = hostMember?.avatar || livePlan.creatorAvatar || "";
  const hostName = hostMember?.name || livePlan.creatorName || "Host";
  const hostUsername = hostMember?.username ? `@${hostMember.username.replace(/^@/, '')}` : hostName;
  const location = livePlan.location || (livePlan as any).place_name || (livePlan as any).place_address || "";

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
      <div className="w-full h-8"></div>

      {/* Centered Confirmation Section */}
      <div className="flex-1 flex flex-col justify-center items-center my-auto w-full max-w-sm mx-auto">
        
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
          className={`w-20 h-20 rounded-full flex items-center justify-center shrink-0 mb-6 ${
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

        {/* Content Area */}
        <div className="space-y-4 max-w-xs mx-auto w-full text-center">
          {isLeft ? (
            /* Left Plan View */
            <div className="space-y-3">
              <motion.h3 
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.25, duration: 0.3, ease: 'easeOut' }}
                className="font-sans font-black text-[28px] text-white tracking-tight leading-none"
              >
                You've Left
              </motion.h3>
              <motion.div
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.3, ease: 'easeOut' }}
                className="text-[13px] text-zinc-400 font-sans font-medium tracking-wide leading-relaxed"
              >
                You are no longer attending this plan.
              </motion.div>
              <div className="text-[17px] text-white font-sans font-extrabold tracking-tight mt-2">
                {livePlan.title}
              </div>
            </div>
          ) : isWaitlist ? (
            /* Waitlist Confirmation Hierarchy (Bug 3)
               1. Checkmark (above)
               2. "Join the waitlist"
               3. Position #X
               4. Plan name
               5. Plan location with red MapPin icon
               6. Host avatar
               7. "Hosted by"
               8. Host username/name
            */
            <div className="flex flex-col items-center text-center space-y-3">
              {/* 2. Title */}
              <motion.h3 
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.3, ease: 'easeOut' }}
                className="font-sans font-black text-[24px] text-white tracking-tight leading-tight"
              >
                Join the waitlist
              </motion.h3>

              {/* 3. Waitlist Position */}
              {waitlistPosition !== null && (
                <motion.div
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.25, duration: 0.3, ease: 'easeOut' }}
                  className="text-[14px] text-[#F5C542] font-sans font-extrabold tracking-tight"
                >
                  Position #{waitlistPosition}
                </motion.div>
              )}

              {/* 4. Plan Name */}
              <motion.div
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.3, ease: 'easeOut' }}
                className="text-[20px] text-white font-sans font-extrabold tracking-tight leading-snug pt-1"
              >
                {livePlan.title}
              </motion.div>

              {/* 5. Plan Location with red vector pin */}
              {location && (
                <motion.div
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.35, duration: 0.3, ease: 'easeOut' }}
                  className="flex items-center justify-center gap-1.5 text-[13px] text-zinc-300 font-sans font-medium"
                >
                  <MapPin className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="truncate max-w-[240px]">{location}</span>
                </motion.div>
              )}

              {/* 6. Host Avatar */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.3, ease: 'easeOut' }}
                className="pt-3 pb-1"
              >
                <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10 shadow-md mx-auto">
                  <UserAvatar
                    src={hostAvatar}
                    alt={hostName}
                    size="w-12 h-12"
                  />
                </div>
              </motion.div>

              {/* 7 & 8. Host Label & Host username/name */}
              <motion.div
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.45, duration: 0.3, ease: 'easeOut' }}
                className="space-y-0.5 text-center"
              >
                <div className="text-[12px] text-zinc-500 font-sans tracking-wide">
                  Hosted by
                </div>
                <div className="text-[14px] text-zinc-200 font-semibold font-sans">
                  {hostUsername}
                </div>
              </motion.div>
            </div>
          ) : (
            /* Joined / Created Confirmation Hierarchy (Bug 2)
               1. Success tick (above)
               2. Plan name
               3. Plan location
               4. Host avatar
               5. "Hosted by"
               6. Host name
            */
            <div className="flex flex-col items-center text-center space-y-3">
              {/* 2. Plan Name */}
              <motion.h3 
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.3, ease: 'easeOut' }}
                className="font-sans font-black text-[24px] text-white tracking-tight leading-tight"
              >
                {livePlan.title}
              </motion.h3>

              {/* 3. Plan Location */}
              {location && (
                <motion.div
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.25, duration: 0.3, ease: 'easeOut' }}
                  className="text-[13px] text-zinc-400 font-sans font-medium truncate max-w-[240px]"
                >
                  {location}
                </motion.div>
              )}

              {/* 4. Host Avatar */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.3, ease: 'easeOut' }}
                className="pt-3 pb-1"
              >
                <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10 shadow-md mx-auto">
                  <UserAvatar
                    src={hostAvatar}
                    alt={hostName}
                    size="w-12 h-12"
                  />
                </div>
              </motion.div>

              {/* 5 & 6. Hosted by & Host Name */}
              <motion.div
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.3, ease: 'easeOut' }}
                className="space-y-0.5 text-center"
              >
                <div className="text-[12px] text-zinc-500 font-sans tracking-wide">
                  Hosted by
                </div>
                <div className="text-[14px] text-zinc-200 font-semibold font-sans">
                  {hostName}
                </div>
              </motion.div>
            </div>
          )}
        </div>

      </div>

      {/* Primary and Secondary Action CTAs */}
      <div className="w-full pt-4 pb-6 flex flex-col items-center">
        {/* Primary Action Button */}
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
          className="w-full py-4 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] text-white font-sans font-extrabold text-sm tracking-wide transition-all duration-200 cursor-pointer shadow-lg shadow-[#FF6B2C]/20 active:scale-98 border border-[#FF6B2C]/20"
          id="btn-go-to-plans"
        >
          Go to Plans
        </motion.button>

        {/* Secondary Action Link */}
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
          className="w-full mt-4 py-2 text-[#94A3B8]/65 hover:text-white font-sans font-medium text-xs tracking-wide transition-colors duration-200 cursor-pointer"
          id="btn-back-to-home"
        >
          Back to Home
        </motion.button>
      </div>
    </motion.div>
  );
};
