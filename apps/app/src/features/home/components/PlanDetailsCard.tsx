import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plan, UserProfile } from "../../../core/types";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { Calendar } from "lucide-react";
import defaultAvatar from "../../../assets/default_avatar.png";

interface ParticipantToggleBarProps {
  plan: Plan;
  userProfile: UserProfile;
  isHolding?: boolean;
  holdProgress?: number;
  planTitle?: string;
  formattedDateAndTime?: string;
  setSelectedPlan?: (planId: string | null) => void;
  activeCardId?: string | null;
  selectedPlanId?: string | null;
  isExpanded?: boolean;
  setIsExpanded?: (val: boolean | ((prev: boolean) => boolean)) => void;
}

export const ParticipantToggleBar: React.FC<ParticipantToggleBarProps> = ({
  plan,
  userProfile,
  isHolding = false,
  holdProgress = 0,
  planTitle = "",
  formattedDateAndTime = "",
  setSelectedPlan,
  activeCardId,
  selectedPlanId,
  isExpanded: externalIsExpanded,
  setIsExpanded: externalSetIsExpanded,
}) => {
  const [localIsExpanded, setLocalIsExpanded] = useState(false);

  const isExpanded = externalIsExpanded !== undefined ? externalIsExpanded : localIsExpanded;
  const setIsExpanded = externalSetIsExpanded !== undefined ? externalSetIsExpanded : setLocalIsExpanded;

  const currentUserId = userProfile.dbUuid || userProfile.user_id;

  // Ephemeral UI state reset: collapsed is ALWAYS the default state whenever this card is not active
  React.useEffect(() => {
    if (activeCardId && activeCardId !== plan.id && activeCardId !== plan.dbUuid) {
      setIsExpanded(false);
    }
    return () => {
      setIsExpanded(false);
    };
  }, [activeCardId, plan.id, plan.dbUuid]);

  const maxSpots = React.useMemo(() => {
    return plan.maxSpots || plan.capacity || plan.joinLimit || (plan.category === "movies" ? 10 : plan.category === "sports" ? 14 : 8);
  }, [plan.maxSpots, plan.capacity, plan.joinLimit, plan.category]);

  // Derived strictly from plan.members where joinState === "JOINED"
  const goingMembers = React.useMemo(() => {
    const joined = plan.members.filter(m => m.joinState === "JOINED");

    // Standardized ordering: Current User "You" first -> Hosts A-Z -> Participants A-Z
    const hosts: typeof joined = [];
    const participants: typeof joined = [];
    let currentUserEntry: (typeof joined)[0] | null = null;

    for (const m of joined) {
      const mId = m.userUuid || m.userId;
      if (currentUserId && mId === currentUserId) {
        currentUserEntry = m;
      } else if (m.isHost) {
        hosts.push(m);
      } else {
        participants.push(m);
      }
    }

    hosts.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    participants.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

    return [
      ...(currentUserEntry ? [currentUserEntry] : []),
      ...hosts,
      ...participants
    ];
  }, [plan.members, currentUserId]);

  const currentCount = goingMembers.length;
  const progressPercent = Math.min(100, Math.round((currentCount / maxSpots) * 100));

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  const handleViewParticipants = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(false);
    if (setSelectedPlan) {
      sessionStorage.setItem('expand_participants_once', plan.id);
      setSelectedPlan(plan.id);
    }
  };

  const isActive = !activeCardId || activeCardId === plan.id || activeCardId === plan.dbUuid;
  const isOverlayOpen = selectedPlanId === plan.id || selectedPlanId === plan.dbUuid;

  return (
    <motion.div
      onClick={handleCardClick}
      layout
      className="mx-3 mb-6 z-10 relative select-none cursor-pointer overflow-hidden rounded-[24px] px-4 py-4 border border-white/10 shadow-lg no-hold"
      style={{
        background: 'rgba(0, 0, 0, 0.32)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        opacity: isHolding ? Math.max(0.08, 1 - (holdProgress / 100) * 0.92) : 1,
      }}
      transition={{
        duration: 0.28,
        ease: [0.25, 1, 0.5, 1],
      }}
    >
      <div className="flex flex-col text-left w-full">
        {/* Title & Date */}
        <div className="flex flex-col text-left min-w-0 w-full">
          <h2 className="font-sans font-black text-[22px] text-white tracking-tight leading-none truncate mb-1.5 drop-shadow-sm">
            {planTitle || plan.title}
          </h2>
          {/* Date & Time */}
          <div className="flex items-center gap-1.5 text-white/80 text-[11px] font-mono tracking-wide font-bold mt-0.5">
            <Calendar className="w-3.5 h-3.5 text-white/50 flex-shrink-0" strokeWidth={2.5} />
            <span className="text-white truncate">
              {formattedDateAndTime}
            </span>
          </div>
        </div>

        {/* Progress Bar (Directly below date) */}
        <div className="w-full mt-3.5">
          <div className="w-full h-[7px] rounded-full overflow-hidden bg-black/60 border border-white/[0.06] relative shadow-inner">
            <motion.div
              key={`progress-bar-${plan.id}-${isActive}-${isOverlayOpen}`}
              className="h-full rounded-full relative"
              style={{
                background: 'linear-gradient(90deg, #E65100 0%, #FF6B2C 100%)',
              }}
              initial={{ width: "0%" }}
              animate={{
                width: `${progressPercent}%`,
              }}
              transition={{
                width: { type: 'spring', stiffness: 200, damping: 26, mass: 0.9 },
              }}
            >
              {/* Subtle moving leading-edge gloss */}
              {progressPercent > 0 && (
                <div className="absolute right-0 top-0 bottom-0 w-3 rounded-r-full bg-white/30 blur-[1px] pointer-events-none" />
              )}
            </motion.div>
          </div>
        </div>

        {/* Expanded Participant Section (Revealed BELOW progress bar) */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              key="expanded-participant-section"
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 18 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
              className="overflow-hidden flex flex-col items-center justify-center text-center w-full"
            >
              {/* Centered Avatar Cluster (Max 4 avatars + overflow) */}
              {goingMembers.length > 0 && (
                <div className="flex items-center justify-center select-none mb-3.5">
                  <div className="flex -space-x-2.5 isolate items-center justify-center">
                    {goingMembers.slice(0, 4).map((person, idx) => {
                      const pId = person.userUuid || person.userId || idx;
                      const isCurrentUser = currentUserId && pId === currentUserId;
                      const nameToUse = isCurrentUser ? "You" : person.name || "Member";
                      return (
                        <div key={pId} className="relative z-10 flex-shrink-0">
                          <UserAvatar
                            src={person.avatar || defaultAvatar}
                            alt={nameToUse}
                            size="w-9 h-9"
                            className="border-2 border-[#0C0C0E] rounded-full shadow-md object-cover"
                          />
                        </div>
                      );
                    })}
                    {goingMembers.length > 4 && (
                      <div className="relative z-10 w-9 h-9 rounded-full bg-[#1C1C20] border-2 border-[#0C0C0E] flex items-center justify-center shadow-md flex-shrink-0">
                        <span className="text-[12px] font-sans font-bold text-white leading-none">
                          +{goingMembers.length - 4}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* View Participants → Button */}
              <button
                type="button"
                onClick={handleViewParticipants}
                className="text-[13px] font-sans font-medium text-white/80 hover:text-white transition-colors select-none py-1 px-3 rounded-full hover:bg-white/5 active:scale-95"
              >
                View Participants →
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};






