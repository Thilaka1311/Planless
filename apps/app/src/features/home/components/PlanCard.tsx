import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { UserProfile, Plan, NotificationItem } from "../../../core/types";
import { useHoldToAccept } from "../hooks/useHoldForStatus";
import { HoldToAcceptOverlay } from "./HoldToAccept";
import { usePlansStore } from "../../plans/state/PlansContext";
import { useToast } from "../../../shared/contexts/ToastContext";
import { useLivePlan } from "../../plans/hooks/useLivePlan";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { ParticipantToggleBar } from "./PlanDetailsCard";
import { formatPlanDate } from "../../../../lib/mappers";
import defaultAvatar from "../../../assets/default_avatar.png";
import { normalizeStatus } from "../../../../lib/participantStatus";
import { getPlanCover } from "../../plans/config/planCoverImages";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { UtensilsCrossed, Calendar, Hourglass, IndianRupee, User, Compass, Film, CalendarDays } from "lucide-react";
import { useRSVPDeadline } from "../../plans/utils/rsvpFormatter";

function calculateCountdown(deadlineStr: string | null | undefined): string {
  if (!deadlineStr) return "";
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0) return "";

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);

  if (days > 0) {
    return `Respond within ${days}d`;
  }
  const hours = totalHours % 24;
  if (hours > 0) {
    return `Respond within ${hours}h`;
  }
  const minutes = totalMinutes % 60;
  return `Respond within ${minutes}m`;
}

function PlanCategoryIcon({ plan }: { plan: any }) {
  const category = (plan.category || '').toLowerCase();
  if (category === 'movies' || category === 'cinema') {
    return <Film className="w-4 h-4 text-violet-400" strokeWidth={2} />;
  }
  if (category === 'dining' || category === 'restaurants' || category === 'restaurant' || category === 'cafe') {
    return <UtensilsCrossed className="w-4 h-4 text-rose-400" strokeWidth={2} />;
  }
  if (category === 'sports' || category === 'football' || category === 'badminton') {
    return <Compass className="w-4 h-4 text-emerald-400" strokeWidth={2} />;
  }
  // Custom / fallback
  return <CalendarDays className="w-4 h-4 text-zinc-400" strokeWidth={2} />;
}


export const rsvpUrgencyStyles = {
  minutes: { border: 'rgba(239, 68, 68, 0.55)', icon: '#ef4444' },  // red-500
  hours: { border: 'rgba(234, 179, 8, 0.55)', icon: '#eab308' },  // yellow-500
  days: { border: 'rgba(34, 197, 94, 0.55)', icon: '#22c55e' },  // green-500
};

export function useLiveCountdown(deadlineStr: string | null | undefined) {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000); // update every 30s
    return () => clearInterval(id);
  }, []);

  if (!deadlineStr) return null;
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0) return null;

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);

  if (days >= 1) return { label: `${days}d`, urgency: 'days' as const };
  if (totalHours >= 1) return { label: `${totalHours}h`, urgency: 'hours' as const };
  return { label: `${totalMinutes}m`, urgency: 'minutes' as const };
}

function RespondByBadge({ deadline, onClick }: { deadline: string | null | undefined; onClick?: (e: React.MouseEvent) => void }) {
  const rsvp = useRSVPDeadline(deadline);
  if (rsvp.state === 'expired') return null;

  return (
    <div
      role="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full pointer-events-auto select-none cursor-pointer"
      style={{
        background: 'rgba(10, 10, 12, 0.62)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: `1px solid ${rsvp.color}88`,
        boxShadow: `0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      <Hourglass
        className="w-3 h-3 flex-shrink-0"
        strokeWidth={2.5}
        style={{ color: rsvp.color }}
      />
      <span className="text-[12px] font-semibold text-white tracking-wide leading-none">
        {rsvp.text}
      </span>
    </div>
  );
}

// ─── Popover helpers ──────────────────────────────────────────────────────────

function getCategoryPopoverContent(plan: any): { title: string } {
  const cat = (plan.category || '').toLowerCase();
  if (cat === 'movies' || cat === 'cinema') return { title: 'Movie' };
  if (cat === 'dining' || cat === 'restaurants' || cat === 'restaurant' || cat === 'cafe') return { title: 'Dining' };
  if (cat === 'sports' || cat === 'football' || cat === 'badminton') return { title: 'Sports' };
  return { title: 'Custom' };
}

export function formatDeadlineFull(deadlineStr: string | null | undefined): string {
  if (!deadlineStr) return '';
  try {
    const date = new Date(deadlineStr);
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${weekday}, ${month} ${day} • ${hours}:${minutes}`;
  } catch {
    return deadlineStr || '';
  }
}

const GLASS_BG = {
  background: 'rgba(12, 12, 16, 0.78)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
};

function GlassPopover({
  title,
  body,
  side,
}: {
  title: string;
  body?: string;
  side: 'left' | 'right';
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: -4 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="absolute top-12 z-50 w-max max-w-[240px] whitespace-nowrap rounded-[16px] px-3.5 py-2.5 pointer-events-auto"
      style={{
        ...GLASS_BG,
        ...(side === 'left' ? { left: 0 } : { right: 0 }),
      }}
    >
      {/* Anchored Pointer */}
      <div
        className="absolute -top-[6px] w-[11px] h-[11px] rotate-45 pointer-events-none"
        style={{
          background: 'rgba(12, 12, 16, 0.78)',
          borderTop: '1.2px solid rgba(255,255,255,0.10)',
          borderLeft: '1.2px solid rgba(255,255,255,0.10)',
          ...(side === 'left' ? { left: '13px' } : { right: '28px' }),
        }}
      />
      <p className="text-[12.5px] font-semibold text-white leading-none">{title}</p>
      {body && <p className="text-[11.5px] font-normal text-white/70 leading-none mt-2">{body}</p>}
    </motion.div>
  );
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

const footerItemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
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

export interface PlanCardProps {
  planId: string;
  userProfile: UserProfile;
  interestedPlanIds: string[];
  setSelectedPlan: (planId: string | null) => void;
  setPaymentConfirmationPlan: (planId: string | null) => void;
  walletBalance: number;
  handleToggleJoin: (planId: string) => void;
  setShowPaymentSuccess: (planId: string | null) => void;
  setShowWaitlistSuccess?: (planId: string | null) => void;
  setNotifications: React.Dispatch<React.SetStateAction<NotificationItem[]>>;
  activeCardId: string | null;
  selectedPlanId?: string | null;
  onSelectCard: (planId: string) => void;
  handleSnoozePlan: (planId: string) => void;
  waitlistPlan?: (planId: string, userProfile: any) => void;
  isExpanded: boolean;
  setIsExpanded: (val: boolean) => void;
}

export const PlanCard: React.FC<PlanCardProps> = ({
  planId,
  userProfile,
  interestedPlanIds,
  setSelectedPlan,
  setPaymentConfirmationPlan,
  walletBalance,
  handleToggleJoin,
  setShowPaymentSuccess,
  setShowWaitlistSuccess,
  setNotifications,
  activeCardId,
  selectedPlanId,
  onSelectCard,
  handleSnoozePlan,
  waitlistPlan,
  isExpanded,
  setIsExpanded,
}) => {

  const plan = useLivePlan(planId);
  const { showToast } = useToast();
  if (!plan) return null;
  const myMemberEntry = plan.members.find(m =>
    m.userId === userProfile.user_id ||
    (userProfile.dbUuid && m.userUuid === userProfile.dbUuid)
  );

  const isJoined = myMemberEntry ? (myMemberEntry.joinState === "JOINED") : false;
  const isWaitlisted = myMemberEntry ? (myMemberEntry.joinState === "WAITLISTED") : false;

  const isDeadlinePassed = React.useMemo(() => {
    if (!plan.response_deadline_at) return false;
    return new Date().getTime() > new Date(plan.response_deadline_at).getTime();
  }, [plan.response_deadline_at]);

  const formattedDateAndTime = React.useMemo(() => {
    return formatPlanDate(plan.datetime || plan.createdAt);
  }, [plan.datetime, plan.createdAt]);

  const [countdownText, setCountdownText] = React.useState(() =>
    calculateCountdown(plan.response_deadline_at)
  );
  const [activePopover, setActivePopover] = React.useState<'category' | 'rsvp' | null>(null);
  const popoverTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Auto-dismiss popovers after 5 seconds, or if card loses focus
  React.useEffect(() => {
    if (popoverTimerRef.current) {
      clearTimeout(popoverTimerRef.current);
      popoverTimerRef.current = null;
    }

    if (activeCardId !== plan.id) {
      if (activePopover !== null) {
        setActivePopover(null);
      }
      return;
    }

    if (activePopover !== null) {
      popoverTimerRef.current = setTimeout(() => {
        setActivePopover(null);
      }, 5000);
    }

    return () => {
      if (popoverTimerRef.current) {
        clearTimeout(popoverTimerRef.current);
        popoverTimerRef.current = null;
      }
    };
  }, [activePopover, activeCardId, plan.id]);

  React.useEffect(() => {
    if (!plan.response_deadline_at) {
      setCountdownText("Response time expired");
      return;
    }

    const updateCountdown = () => {
      setCountdownText(calculateCountdown(plan.response_deadline_at));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 15000);
    return () => clearInterval(interval);
  }, [plan.response_deadline_at]);



  const getParticipantStatusList = React.useCallback(() => {
    const going: { name: string; avatar: string; status: string; isHost: boolean; userId: string }[] = [];
    const waitlist: { name: string; avatar: string; status: string; userId: string }[] = [];
    const delivered: { name: string; avatar: string; status: string; userId: string }[] = [];
    const skipped: { name: string; avatar: string; status: string; userId: string }[] = [];

    // Push all actual hosts from members list first
    for (const m of plan.members) {
      if (m.isHost) {
        going.push({
          name: m.name || "Host",
          avatar: m.avatar || defaultAvatar,
          status: "JOINED",
          isHost: true,
          userId: m.userUuid || m.userId,
        });
      }
    }

    // Sort hosts alphabetically
    going.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    for (const m of plan.members) {
      if (m.isHost) continue;

      const entry = {
        name: m.name,
        avatar: m.avatar || defaultAvatar,
        userId: m.userUuid || m.userId,
      };

      const normalizedState = normalizeStatus(m.joinState);

      if (normalizedState === "JOINED") {
        going.push({ ...entry, status: "JOINED", isHost: false });
      } else if (normalizedState === "WAITLISTED") {
        waitlist.push({ ...entry, status: "WAITLISTED" });
      } else if (normalizedState === "INVITED") {
        delivered.push({ ...entry, status: "INVITED" });
      } else if (normalizedState === "SKIPPED") {
        skipped.push({ ...entry, status: "SKIPPED" });
      } else {
        delivered.push({ ...entry, status: "INVITED" });
      }
    }

    return { going, waitlist, delivered, skipped };
  }, [plan.members]);

  const displayActivityName = React.useMemo(() => {
    const userTitle = plan.title || (plan as any).plan_name;
    if (userTitle && userTitle.trim().length > 0) {
      return userTitle;
    }

    if (plan.category === "sports") {
      if (plan.sports_type === "Football") {
        return "Football Tonight";
      } else if (plan.sports_type === "Badminton") {
        return "Badminton Session";
      }
      return "Sports Match";
    } else if (plan.category === "movies") {
      return "Luxe IMAX";
    } else if (plan.category === "restaurants") {
      return "Waffle Time";
    } else {
      return "Meetup";
    }
  }, [plan.category, plan.sports_type, plan.title, (plan as any).plan_name]);

  const categoryStr = plan.category as string;
  const glowStyle = React.useMemo(() => {
    if (categoryStr === "restaurants") {
      return "from-rose-500/15 to-pink-500/5 text-rose-300 border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.25)]";
    } else if (categoryStr === "movies") {
      return "from-sky-500/15 to-blue-600/5 text-sky-300 border-sky-500/30 shadow-[0_0_12px_rgba(14,165,233,0.25)]";
    }
    return "from-emerald-500/15 to-emerald-600/5 text-emerald-300 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.25)]";
  }, [categoryStr]);

  const coverToUse = React.useMemo(() => {
    return plan.coverImage || getPlanCover(plan.category, (plan as any).subcategory || (plan as any).sports_type);
  }, [plan.coverImage, plan.category, (plan as any).subcategory, (plan as any).sports_type]);

  const maxSpots = React.useMemo(() => {
    return plan.maxSpots || (plan.category === "movies" ? 10 : plan.category === "sports" ? 14 : 8);
  }, [plan.maxSpots, plan.category]);

  const currentCount = React.useMemo(() => {
    return plan.members.filter(m => m.joinState === "JOINED").length;
  }, [plan.members]);

  const isFull = currentCount >= maxSpots;

  const groupName = plan.circleName || "Custom Plan";

  const cardRef = React.useRef<HTMLDivElement>(null);

  const {
    holdProgress,
    isHolding,
    isSuccess,
    successMode,
    dragY,
    startHolding,
    stopHolding,
    handlePointerMove,
    cancelHolding,
    wasHoldActive,
  } = useHoldToAccept({
    plan,
    userProfile,
    isDeadlinePassed,
    isJoined,
    isWaitlisted,
    isFull,
    handleToggleJoin: (p) => handleToggleJoin(p.id),
    setShowPaymentSuccess: (p) => setShowPaymentSuccess(p ? p.id : null),
    setShowWaitlistSuccess: (p) => setShowWaitlistSuccess ? setShowWaitlistSuccess(p ? p.id : null) : undefined,
    setNotifications,
    activeCardId,
    handleSnoozePlan,
    waitlistPlan: waitlistPlan ? (id, up) => waitlistPlan(id, up) : undefined,
    isExpanded,
    setIsExpanded,
  });

  const getStatusClasses = (status: string) => {
    switch (status) {
      case 'JOINED':
        return 'bg-emerald-500/20 text-emerald-350 border border-emerald-500/30';
      case 'WAITLISTED':
        return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
      case 'INVITED':
        return 'bg-white/10 text-white/90 border border-white/20';
      case 'SKIPPED':
        return 'bg-white/5 text-white/50 border border-white/10';
      default:
        return 'bg-white/5 text-white/60 border border-white/10';
    }
  };

  const planParticipants = React.useMemo(() => {
    const { going, waitlist, delivered, skipped } = getParticipantStatusList();

    const sortAlphabetically = (list: typeof going) => {
      return [...list].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );
    };

    return [
      ...sortAlphabetically(going),
      ...sortAlphabetically(waitlist),
      ...sortAlphabetically(delivered),
      ...sortAlphabetically(skipped)
    ];
  }, [getParticipantStatusList]);

  const progressPercent = Math.min(100, Math.round((currentCount / maxSpots) * 100));

  const goingCount = planParticipants.filter(p => p.status.toLowerCase() === "joined").length;
  const isHost = plan.hostId === userProfile.user_id || plan.hostId === userProfile.dbUuid;
  const isParticipant = isJoined || isHost;

  return (
    <motion.div
      ref={cardRef}
      id={`plan-card-${plan.id}`}
      animate={{
        scale: isHolding ? 0.97 : 1,
      }}
      transition={{
        scale: { type: 'spring', stiffness: 350, damping: 25 },
      }}
      onPointerDown={startHolding}
      onPointerMove={handlePointerMove}
      onPointerUp={stopHolding}
      onPointerLeave={cancelHolding}
      onPointerCancel={cancelHolding}
      onClick={(e) => {
        if (wasHoldActive.current) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onSelectCard(plan.id);
      }}
      className="h-full w-full snap-start snap-always relative rounded-none border-0 overflow-hidden flex flex-col justify-end bg-[#050505] group cursor-pointer flex-shrink-0 mb-0"
    >
      {/* Full-bleed crisp hero poster cover image - original colors & brightness */}
      <DiscoveryImages
        src={coverToUse}
        category={plan.category}
        alt={plan.title}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 pointer-events-none"
      />

      {/* Subtle bottom-only gradient for legibility */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-0" />

      {/* Top Row Badges of the event poster */}
      <div
        className="absolute top-4 left-4 right-4 flex justify-between items-center pointer-events-none z-20 select-none transition-opacity duration-75"
        style={{ opacity: isHolding ? Math.max(0.08, 1 - (holdProgress / 100) * 0.92) : 1 }}
      >
        {/* LEFT: category icon circle — tappable for popover */}
        <div className="relative flex items-center gap-2">
          <div
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              setActivePopover(activePopover === 'category' ? null : 'category');
            }}
            className="w-9 h-9 rounded-full bg-black/55 backdrop-blur-md border border-white/[0.08] flex items-center justify-center shadow-lg pointer-events-auto cursor-pointer"
          >
            <PlanCategoryIcon plan={plan} />
          </div>
          {/* Group badge next to icon if present */}
          {groupName && groupName !== "Custom Plan" && (
            <div
              className="bg-black/55 backdrop-blur-md px-4 rounded-full text-[11px] font-sans font-black text-white tracking-[0.16em] flex items-center justify-center select-none pointer-events-auto border border-white/[0.08] shadow-2xl"
              style={{ height: '36px' }}
            >
              {groupName}
            </div>
          )}
          {/* Category popover */}
          <AnimatePresence>
            {activePopover === 'category' && (() => {
              const { title } = getCategoryPopoverContent(plan);
              return (
                <GlassPopover title={title} side="left" />
              );
            })()}
          </AnimatePresence>
        </div>

        {/* RIGHT: Respond By countdown badge — tappable for popover */}
        <div className="relative">
          <RespondByBadge
            deadline={plan.response_deadline_at ?? null}
            onClick={(e) => {
              e.stopPropagation();
              setActivePopover(activePopover === 'rsvp' ? null : 'rsvp');
            }}
          />
          {/* RSVP popover */}
          <AnimatePresence>
            {activePopover === 'rsvp' && plan.response_deadline_at && (
              <GlassPopover
                title="Respond by"
                body={formatDeadlineFull(plan.response_deadline_at)}
                side="right"
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Scrim — closes any open popover on outside tap */}
      <AnimatePresence>
        {activePopover !== null && (
          <motion.div
            key="popover-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="absolute inset-0 z-10 pointer-events-auto"
            onClick={(e) => { e.stopPropagation(); setActivePopover(null); }}
          />
        )}
      </AnimatePresence>

      {/* COMPACT SOCIAL PARTICIPANT STRIP (FLOATING CAPSULE GLASS PANEL) */}
      <ParticipantToggleBar
        plan={plan}
        userProfile={userProfile}
        isHolding={isHolding}
        holdProgress={holdProgress}
        planTitle={displayActivityName}
        formattedDateAndTime={formattedDateAndTime}
        setSelectedPlan={setSelectedPlan}
        activeCardId={activeCardId}
        selectedPlanId={selectedPlanId}
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
      />

      <AnimatePresence>
        <HoldToAcceptOverlay
          planId={plan.id}
          holdProgress={holdProgress}
          isHolding={isHolding}
          isFull={isFull}
          formattedDateAndTime={formattedDateAndTime}
        />

        {isSuccess && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="absolute inset-0 bg-[#0c0c0e]/95 backdrop-blur-md z-30 flex flex-col items-center justify-center pointer-events-none"
          >
            {successMode === "waitlist" ? (
              <>
                <motion.div
                  initial={{ scale: 0.5 }}
                  animate={{ scale: [0.5, 1.15, 1], rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 0.4 }}
                  className="w-16 h-16 rounded-full bg-amber-500/10 border-2 border-amber-500 flex items-center justify-center text-amber-400 shadow-[0_0_40px_rgba(245,158,11,0.25)]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
                <span className="text-base font-sans font-black tracking-[0.2em] text-amber-400 mt-6 uppercase">WAITLISTED</span>
                <span className="text-xs font-sans text-zinc-400 mt-2">Added to Waitlist</span>
              </>
            ) : (
              <>
                <motion.div
                  initial={{ scale: 0.5 }}
                  animate={{ scale: [0.5, 1.15, 1], rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 0.4 }}
                  className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.25)]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
                <span className="text-base font-sans font-black tracking-[0.2em] text-emerald-400 mt-6 uppercase">JOINED</span>
                <span className="text-xs font-sans text-zinc-400 mt-2">Opening wallet split payment popup...</span>
              </>
            )}
          </motion.div>
        )}

        {isDeadlinePassed && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center pointer-events-none">
            <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 shadow-xl">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-sm font-sans font-black tracking-[0.2em] text-zinc-400 mt-4 uppercase">RESPONSES CLOSED</span>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
