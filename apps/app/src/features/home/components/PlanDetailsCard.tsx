import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plan, UserProfile } from "../../../core/types";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { Calendar } from "lucide-react";
import defaultAvatar from "../../../assets/default_avatar.png";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { supabase } from "../../../../lib/supabaseClient";

function isValidProfilePhoto(photo: string | null | undefined): boolean {
  if (!photo || typeof photo !== "string") return false;
  const trimmed = photo.trim();
  if (
    !trimmed ||
    trimmed === "default" ||
    trimmed === "planimagedefault.png" ||
    trimmed.includes("planimagedefault") ||
    trimmed.includes("default_avatar") ||
    trimmed === defaultAvatar
  ) {
    return false;
  }
  return true;
}

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

  const { dbUsers, setDbUsers } = useProfileStore();

  // Ensure any participant user IDs not yet in dbUsers are fetched directly from users table
  React.useEffect(() => {
    const memberIds = (plan.members || [])
      .map(m => m.userUuid || m.userId)
      .filter(Boolean) as string[];

    if (memberIds.length === 0) return;

    const existingIds = new Set<string>();
    (dbUsers || []).forEach(u => {
      if (u.id) existingIds.add(u.id);
      if (u.user_id) existingIds.add(u.user_id);
    });

    const missingIds = memberIds.filter(id => !existingIds.has(id));
    if (missingIds.length === 0) return;

    let isMounted = true;
    supabase
      .from("users")
      .select("id, public_id, full_name, profile_photo_path, bio")
      .in("id", missingIds)
      .then(({ data, error }) => {
        if (error || !data || !isMounted) return;
        setDbUsers(prev => {
          const currentIds = new Set(prev.map(p => p.id));
          const toAdd = data
            .filter(u => !currentIds.has(u.id))
            .map(u => ({
              id: u.id,
              user_id: u.public_id || u.id,
              username: (u.full_name || "user").toLowerCase().replace(/\s+/g, ""),
              full_name: u.full_name || "Participant",
              phone_number: "",
              profile_photo: u.profile_photo_path || "",
              profile_photo_path: u.profile_photo_path || "",
              bio: u.bio || "",
              college_or_work: "",
              created_at: new Date().toISOString(),
              wallet_balance: 0,
              active_status: true,
            }));
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });
      });

    return () => {
      isMounted = false;
    };
  }, [plan.members, dbUsers, setDbUsers]);

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

  // Progress bar represents filled spots from joined members
  const joinedCount = React.useMemo(() => {
    return (plan.members || []).filter(m => m.joinState === "JOINED").length;
  }, [plan.members]);
  const progressPercent = Math.min(100, Math.round((joinedCount / maxSpots) * 100));

  // Complete participant list from plan_participants (JOINED, INVITED, SKIPPED, WAITLISTED)
  const allParticipants = React.useMemo(() => {
    const all = plan.members || [];

    // Standardized ordering: Current User "You" first -> Hosts A-Z -> Participants A-Z
    const hosts: typeof all = [];
    const participants: typeof all = [];
    let currentUserEntry: (typeof all)[0] | null = null;

    for (const m of all) {
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

  // Helper to determine if a participant has an actual profile photo in the users table
  const participantHasPhoto = React.useCallback(
    (person: (typeof allParticipants)[0]): boolean => {
      const pId = person.userUuid || person.userId;
      if (pId) {
        const user = (dbUsers || []).find(u => u.id === pId || u.user_id === pId);
        if (user) {
          const userPhoto = user.profile_photo_path || user.profile_photo;
          return isValidProfilePhoto(userPhoto);
        }
      }
      return isValidProfilePhoto(person.avatar);
    },
    [dbUsers]
  );

  // Helper to resolve the profile photo URL/path for UserAvatar
  const getParticipantAvatarSrc = React.useCallback(
    (person: (typeof allParticipants)[0]): string => {
      const pId = person.userUuid || person.userId;
      if (pId) {
        const user = (dbUsers || []).find(u => u.id === pId || u.user_id === pId);
        if (user) {
          const userPhoto = user.profile_photo_path || user.profile_photo;
          if (isValidProfilePhoto(userPhoto)) {
            return userPhoto!;
          }
        }
      }
      return isValidProfilePhoto(person.avatar) ? person.avatar : defaultAvatar;
    },
    [dbUsers]
  );

  // Prioritize participants WITH profile photos first, then WITHOUT profile photos, preserving order within each group
  const visibleParticipants = React.useMemo(() => {
    const withPhoto: typeof allParticipants = [];
    const withoutPhoto: typeof allParticipants = [];

    for (const person of allParticipants) {
      if (participantHasPhoto(person)) {
        withPhoto.push(person);
      } else {
        withoutPhoto.push(person);
      }
    }

    return [...withPhoto, ...withoutPhoto].slice(0, 4);
  }, [allParticipants, participantHasPhoto]);

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
        <div className="flex flex-col text-left min-w-0 w-full font-sans">
          <h2 className="font-sans font-black text-[22px] text-white tracking-tight leading-none truncate mb-1.5 drop-shadow-sm">
            {planTitle || plan.title}
          </h2>
          {/* Date & Time */}
          <div className="flex items-center gap-1.5 text-white/80 text-[11px] font-sans tracking-wide font-bold mt-0.5">
            <Calendar className="w-3.5 h-3.5 text-white/50 flex-shrink-0" strokeWidth={2.5} />
            <span className="text-white truncate font-sans">
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
              {allParticipants.length > 0 && (
                <div className="flex items-center justify-center select-none mb-3.5">
                  <div className="flex -space-x-2.5 isolate items-center justify-center">
                    {visibleParticipants.map((person, idx) => {
                      const pId = person.userUuid || person.userId || idx;
                      const isCurrentUser = currentUserId && pId === currentUserId;
                      const nameToUse = isCurrentUser ? "You" : person.name || "Member";
                      return (
                        <div key={pId} className="relative z-10 flex-shrink-0">
                          <UserAvatar
                            src={getParticipantAvatarSrc(person)}
                            alt={nameToUse}
                            size="w-9 h-9"
                            className="border-2 border-[#0C0C0E] rounded-full shadow-md object-cover"
                          />
                        </div>
                      );
                    })}
                    {allParticipants.length > 4 && (
                      <div className="relative z-10 w-9 h-9 rounded-full bg-[#1C1C20] border-2 border-[#0C0C0E] flex items-center justify-center shadow-md flex-shrink-0">
                        <span className="text-[12px] font-sans font-bold text-white leading-none">
                          +{allParticipants.length - 4}
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






