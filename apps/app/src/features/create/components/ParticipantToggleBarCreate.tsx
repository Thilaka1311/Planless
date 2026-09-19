import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plan, UserProfile } from "../../../core/types";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { normalizeStatus } from "../../../../lib/participantStatus";
import defaultAvatar from "../../../assets/default_avatar.png";

interface ParticipantToggleBarCreateProps {
  plan: Plan;
  userProfile: UserProfile;
  isExpanded: boolean;
  setIsExpanded: (val: boolean) => void;
  onEditParticipants?: () => void;
  waitlistMode?: 'automatic' | 'assigned';
}

const footerContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02
    }
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.02,
      staggerDirection: -1
    }
  }
};

const footerItemVariants: any = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 220,
      damping: 20
    }
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: {
      duration: 0.15,
      ease: 'easeInOut'
    }
  }
};

export const ParticipantToggleBarCreate: React.FC<ParticipantToggleBarCreateProps> = ({
  plan,
  userProfile,
  isExpanded,
  setIsExpanded,
  onEditParticipants,
  waitlistMode,
}) => {
  const maxSpots = React.useMemo(() => {
    return plan.maxSpots || (plan.category === "movies" ? 10 : plan.category === "sports" ? 14 : 8);
  }, [plan.maxSpots, plan.category]);

  const getParticipantStatusList = React.useCallback(() => {
    const going: { name: string; avatar: string; status: string; userId: string }[] = [];
    const waitlist: { name: string; avatar: string; status: string; userId: string }[] = [];

    const hostUuid = plan.hostId;
    for (const m of plan.members) {
      if (m.userUuid === hostUuid || m.userId === hostUuid) continue;

      const entry = {
        name: m.name,
        avatar: m.avatar || defaultAvatar,
        userId: m.userUuid || m.userId,
      };

      const normalizedState = normalizeStatus(m.joinState);

      if (normalizedState === "JOINED") {
        going.push({ ...entry, status: "JOINED" });
      } else if (normalizedState === "WAITLISTED") {
        waitlist.push({ ...entry, status: "WAITLISTED" });
      }
    }

    return { going, waitlist };
  }, [plan.hostId, plan.members]);

  const planParticipants = React.useMemo(() => {
    const { going, waitlist } = getParticipantStatusList();
    return [...going, ...waitlist];
  }, [getParticipantStatusList]);

  const getStatusClassesAndText = (status: string) => {
    switch (status) {
      case 'JOINED':
        return {
          classes: 'bg-emerald-500/20 text-emerald-355 border border-emerald-500/30',
          text: 'INVITED'
        };
      case 'WAITLISTED':
        return {
          classes: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
          text: 'INVITED'
        };
      default:
        return {
          classes: 'bg-white/10 text-white/90 border border-white/20',
          text: 'INVITED'
        };
    }
  };

  return (
    <motion.div
      onClick={(e) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
      }}
      className="mx-4 mb-4 z-10 relative select-none cursor-pointer overflow-hidden rounded-[24px] px-4 pt-3 pb-3 border no-hold"
      style={{
        background: 'rgba(8, 8, 8, 0.72)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderColor: 'rgba(255, 255, 255, 0.06)',
      }}
      animate={{
        height: isExpanded ? 'auto' : 60
      }}
      transition={{
        type: 'spring',
        damping: 19,
        stiffness: 200,
      }}
    >
      {/* Row 1: Host info and Joined stack indicator */}
      <div className="flex items-center justify-between">
        {/* LEFT SIDE: Host Avatar & Info */}
        <div className="flex items-center gap-2.5">
          <div className="relative w-9 h-9 rounded-full ring-2 ring-black/75 overflow-hidden bg-zinc-800 flex-shrink-0">
            <UserAvatar
              src={plan.creatorAvatar}
              alt={plan.creatorName || "Host"}
              size="w-9 h-9"
            />
          </div>
          <div className="flex flex-col text-left justify-center">
            <span className="text-zinc-400 font-bold text-[9.5px] uppercase tracking-wider leading-none mb-0.5 select-none">
              HOSTED BY
            </span>
            <span className="text-white font-semibold text-[13.5px] sm:text-[14px] tracking-tight leading-none">
              {plan.creatorName || "Host"}
            </span>
          </div>
        </div>

        {/* RIGHT SIDE: Invitation summary & Chevron */}
        <div className="flex items-center gap-1.5">
          <AnimatePresence initial={false} mode="popLayout">
            {!isExpanded && (
              <motion.span
                key="invited-count"
                initial={{ opacity: 0, x: 4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 4 }}
                transition={{ duration: 0.18, ease: 'easeInOut' }}
                className="text-[11.5px] text-zinc-400 font-medium select-none whitespace-nowrap"
              >
                Plan Size: {maxSpots}
              </motion.span>
            )}
          </AnimatePresence>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="text-[11px] text-zinc-400 select-none font-bold pr-0.5 inline-block"
          >
            ▼
          </motion.span>
        </div>
      </div>

      {/* Expandable participant list */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="participants-list-container"
            initial="hidden"
            animate="show"
            exit="exit"
            variants={footerContainerVariants}
            className="overflow-hidden text-left"
          >
            <motion.div
              variants={footerItemVariants}
              className="text-[10px] font-sans font-black tracking-[0.14em] text-zinc-500 uppercase mt-4 mb-1.5 px-0.5 select-none"
            >
              Participants
            </motion.div>
            <motion.div
              variants={footerItemVariants}
              className="w-full h-px bg-white/[0.06] mb-2"
            />
            <div
              className="max-h-[145px] overflow-y-auto scrollbar-none select-text"
              onClick={(e) => e.stopPropagation()}
            >
               {waitlistMode === 'automatic' ? (
                /* ── AUTOMATIC QUEUE SINGLE-COLUMN VIEW ── */
                <div className="flex flex-col space-y-1">
                  <div className="text-[8.5px] font-sans font-black tracking-[0.1em] px-2 py-1 rounded-[5px] uppercase select-none w-max bg-white/10 text-white/90 border border-white/20 mb-2 leading-none">Invited</div>
                  {planParticipants.length === 0 ? (
                    <span className="text-[11px] text-zinc-650 px-0.5 select-none italic">No participants yet.</span>
                  ) : (
                    planParticipants.map((person, pIdx) => {
                      return (
                        <motion.div
                          key={pIdx}
                          variants={footerItemVariants}
                          className="flex items-center justify-between py-1.5 px-0.5 hover:bg-white/[0.02] rounded-lg transition-colors cursor-default"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <UserAvatar
                              src={person.avatar}
                              alt={person.name}
                              size="w-5 h-5"
                              className="border border-white/10"
                            />
                            <span className="font-sans text-[13px] text-white/95 font-medium leading-none truncate">
                              {person.name}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              ) : getParticipantStatusList().waitlist.length === 0 ? (
                /* ── UNDIVIDED SINGLE-COLUMN VIEW (No Waitlist) ── */
                <div className="flex flex-col space-y-1">
                  {getParticipantStatusList().going.length === 0 ? (
                    <span className="text-[11px] text-zinc-650 px-0.5 select-none italic">No participants yet.</span>
                  ) : (
                    getParticipantStatusList().going.map((person, pIdx) => {
                      return (
                        <motion.div
                          key={pIdx}
                          variants={footerItemVariants}
                          className="flex items-center justify-between py-1.5 px-0.5 hover:bg-white/[0.02] rounded-lg transition-colors cursor-default"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <UserAvatar
                              src={person.avatar}
                              alt={person.name}
                              size="w-5 h-5"
                              className="border border-white/10"
                            />
                            <span className="font-sans text-[13px] text-white/95 font-medium leading-none truncate">
                              {person.name}
                            </span>
                          </div>
                          <span className="text-[8.5px] font-sans font-bold tracking-wider px-2 py-1 rounded-[5px] uppercase flex-shrink-0 leading-none bg-emerald-500/20 text-emerald-355 border border-emerald-500/30">
                            GOING
                          </span>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              ) : (
                /* ── DIVIDED TWO-COLUMN VIEW (Has Waitlist) ── */
                <div className="flex gap-4 w-full">
                  {/* Going column */}
                  <div className="flex-1 flex flex-col space-y-1 min-w-0">
                    <div className="text-[8.5px] font-sans font-black tracking-[0.1em] px-2 py-1 rounded-[5px] uppercase select-none w-max bg-emerald-500/20 text-emerald-355 border border-emerald-500/30 mb-2 leading-none">Going</div>
                    {getParticipantStatusList().going.length === 0 ? (
                      <span className="text-[11px] text-zinc-650 px-0.5 select-none italic">Empty</span>
                    ) : (
                      getParticipantStatusList().going.map((person, pIdx) => {
                        return (
                          <motion.div
                            key={pIdx}
                            variants={footerItemVariants}
                            className="flex items-center justify-between py-1.5 px-0.5 hover:bg-white/[0.02] rounded-lg transition-colors cursor-default min-w-0"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <UserAvatar
                                src={person.avatar}
                                alt={person.name}
                                size="w-5 h-5"
                                className="border border-white/10"
                              />
                              <span className="font-sans text-[12.5px] text-white/95 font-medium leading-none truncate">
                                {person.name}
                              </span>
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>

                  {/* Divider line between columns */}
                  <div className="w-px bg-white/[0.06] self-stretch" />

                  {/* Waitlist column */}
                  <div className="flex-1 flex flex-col space-y-1 min-w-0">
                    <div className="text-[8.5px] font-sans font-black tracking-[0.1em] px-2 py-1 rounded-[5px] uppercase select-none w-max bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-2 leading-none">Waitlist</div>
                    {getParticipantStatusList().waitlist.length === 0 ? (
                      <span className="text-[11px] text-zinc-655 px-0.5 select-none italic">Empty</span>
                    ) : (
                      getParticipantStatusList().waitlist.map((person, pIdx) => {
                        return (
                          <motion.div
                            key={pIdx}
                            variants={footerItemVariants}
                            className="flex items-center justify-between py-1.5 px-0.5 hover:bg-white/[0.02] rounded-lg transition-colors cursor-default min-w-0"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <UserAvatar
                                src={person.avatar}
                                alt={person.name}
                                size="w-5 h-5"
                                className="border border-white/10"
                              />
                              <span className="font-sans text-[12.5px] text-white/95 font-medium leading-none truncate">
                                {person.name}
                              </span>
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Edit Participants button */}
            {onEditParticipants && (
              <motion.button
                variants={footerItemVariants}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditParticipants();
                }}
                className="mt-3 w-full py-2 bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.02] border border-white/[0.06] rounded-xl text-center text-xs font-bold text-white transition-colors cursor-pointer select-none"
              >
                Edit Participants
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
