import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CalendarDays, Hourglass } from "lucide-react";

import customPlanCover from "../../../../assets/planimagedefault.png";
import defaultAvatar from "../../../../assets/default_avatar.png";
import { Plan, UserProfile } from "../../../../core/types";
import { ParticipantToggleBar } from "../../../home/components/PlanDetailsCard";
import { HoldToAcceptOverlay } from "../../../home/components/HoldToAccept";
import { DiscoveryImages } from "../../../../IMGfromDB/PlanImages";

interface JoinPlanAnimationProps {
  onComplete?: () => void;
  className?: string;
}

let hasEverCompletedJoinPlanAnimation = false;

export function resetJoinPlanAnimation() {
  hasEverCompletedJoinPlanAnimation = false;
}

export function isJoinPlanAnimationCompleted() {
  return hasEverCompletedJoinPlanAnimation;
}

function getLetterAvatar(name: string): string {
  if (!name) return "";
  const initial = name.trim()[0].toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  const bgGradientStart = `hsl(${hue}, 40%, 35%)`;
  const bgGradientEnd = `hsl(${(hue + 45) % 360}, 45%, 22%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <defs>
      <linearGradient id="g_${initial}_${hue}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgGradientStart}"/>
        <stop offset="100%" stop-color="${bgGradientEnd}"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#g_${initial}_${hue})"/>
    <text x="50%" y="54%" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-weight="700" font-size="38" fill="#f4f4f5" text-anchor="middle" dominant-baseline="middle" letter-spacing="-0.03em">${initial}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const AVATAR_ALEX = getLetterAvatar("Alex");
const AVATAR_MAYA = getLetterAvatar("Maya");
const AVATAR_SAM = getLetterAvatar("Sam");

const DEMO_USER_PROFILE: UserProfile = {
  name: "You",
  phone: "",
  bio: "",
  avatar: defaultAvatar,
  joined: false,
  user_id: "demo_current_user",
  dbUuid: "demo_current_user",
};

export function JoinPlanAnimation({
  onComplete,
  className = "",
}: JoinPlanAnimationProps) {
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [isJoined, setIsJoined] = useState<boolean>(false);

  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  const clearAllTimers = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
  };

  const addTimer = (fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay);
    timeoutsRef.current.push(t);
    return t;
  };

  useEffect(() => {
    // Reset state each time the component mounts for a fresh demonstration
    setIsHolding(false);
    setHoldProgress(0);
    setIsSuccess(false);
    setIsJoined(false);

    clearAllTimers();

    // 0.8s: Automatically trigger the hold-to-join animation without requiring user interaction
    addTimer(() => {
      setIsHolding(true);
      setHoldProgress(0);
      const startTime = Date.now();
      const duration = 1400;

      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, (elapsed / duration) * 100);
        setHoldProgress(progress);

        if (progress >= 100) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setIsHolding(false);
          setIsSuccess(true);
          setIsJoined(true);
          hasEverCompletedJoinPlanAnimation = true;
          // Terminal state: stop progression permanently and immediately reveal Next button
          onCompleteRef.current?.();
        }
      }, 16);

      intervalRef.current = interval;
    }, 800);

    return () => {
      clearAllTimers();
      hasEverCompletedJoinPlanAnimation = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const demoPlan: Plan = useMemo(
    () => ({
      id: "demo_friday_plan",
      dbUuid: "demo_friday_plan",
      title: "Friday Plans",
      category: "custom",
      date: "Today",
      time: "19:00",
      location: "Downtown Cafe",
      cost: 400,
      paymentAmount: 400,
      totalCost: 1600,
      confirmedCount: isJoined ? 4 : 3,
      maxSpots: 4,
      coverImage: customPlanCover,
      cardCoverImage: customPlanCover,
      creatorId: "demo_alex",
      creatorName: "Alex",
      creatorAvatar: AVATAR_ALEX,
      hostId: "demo_alex",
      groupId: null,
      status: "LIVE",
      createdAt: new Date().toISOString(),
      timeline: "today",
      response_deadline_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      members: [
        {
          userId: "demo_alex",
          userUuid: "demo_alex",
          name: "Alex",
          avatar: AVATAR_ALEX,
          profile_photo: AVATAR_ALEX,
          isHost: true,
          role: "HOST",
          joinState: "JOINED",
          rsvp_status: "JOINED",
          reminderState: "none",
          joinedAt: new Date().toISOString(),
        },
        {
          userId: "demo_maya",
          userUuid: "demo_maya",
          name: "Maya",
          avatar: AVATAR_MAYA,
          profile_photo: AVATAR_MAYA,
          isHost: false,
          role: "PARTICIPANT",
          joinState: "JOINED",
          rsvp_status: "JOINED",
          reminderState: "none",
          joinedAt: new Date().toISOString(),
        },
        {
          userId: "demo_sam",
          userUuid: "demo_sam",
          name: "Sam",
          avatar: AVATAR_SAM,
          profile_photo: AVATAR_SAM,
          isHost: false,
          role: "PARTICIPANT",
          joinState: "JOINED",
          rsvp_status: "JOINED",
          reminderState: "none",
          joinedAt: new Date().toISOString(),
        },
        ...(isJoined
          ? [
              {
                userId: "demo_current_user",
                userUuid: "demo_current_user",
                name: "You",
                avatar: defaultAvatar,
                profile_photo: defaultAvatar,
                isHost: false,
                role: "PARTICIPANT" as const,
                joinState: "JOINED" as const,
                rsvp_status: "JOINED",
                reminderState: "none" as const,
                joinedAt: new Date().toISOString(),
              },
            ]
          : []),
      ],
      joinedUsers: [],
    }),
    [isJoined]
  );

  return (
    <div
      id="join_plan_animation_card"
      style={{ transform: "translate3d(0, 0, 0)" }}
      className={`w-full max-w-[340px] xs:max-w-[365px] sm:max-w-[395px] md:max-w-[425px] h-full max-h-[460px] xs:max-h-[500px] sm:max-h-[540px] md:max-h-[570px] mx-auto rounded-[28px] sm:rounded-[32px] bg-[#0A0A0C] border border-white/[0.12] shadow-2xl shadow-black/90 flex flex-col justify-end relative overflow-hidden select-none font-sans text-white ${className}`}
    >
      {/* Full-bleed crisp hero poster cover image - original colors & brightness */}
        <DiscoveryImages
          src={customPlanCover}
          category="custom"
          alt="Friday Plans"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />

        {/* Subtle bottom-only gradient for legibility */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 via-black/35 to-transparent pointer-events-none z-0" />

        {/* Top Row Badges of the event poster (exact production styling) */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-center pointer-events-none z-20 select-none">
          {/* Category icon */}
          <div className="w-9 h-9 rounded-full bg-black/55 backdrop-blur-md border border-white/[0.08] flex items-center justify-center shadow-lg">
            <CalendarDays className="w-4 h-4 text-zinc-400" strokeWidth={2} />
          </div>

          {/* Respond-by countdown badge */}
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full select-none"
            style={{
              background: "rgba(10, 10, 12, 0.62)",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              border: "1px solid rgba(245,158,11,0.53)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            <Hourglass className="w-3 h-3 flex-shrink-0 text-amber-400" strokeWidth={2.5} />
            <span className="text-[11px] font-semibold text-amber-400 leading-none">2h left</span>
          </div>
        </div>

        {/* Real Home Screen Social Participant Strip (Floating Capsule Glass Panel) */}
        <ParticipantToggleBar
          plan={demoPlan}
          userProfile={DEMO_USER_PROFILE}
          isHolding={isHolding}
          holdProgress={holdProgress}
          planTitle="Friday Plans"
          formattedDateAndTime="Today • 19:00"
          isExpanded={false}
          setIsExpanded={() => {}}
        />

        {/* Real HoldToAcceptOverlay during hold animation - proportionally scaled to canonical frame */}
        <AnimatePresence>
          {isHolding && (
            <HoldToAcceptOverlay
              planId={demoPlan.id}
              plan={demoPlan}
              holdProgress={holdProgress}
              isHolding={isHolding}
              isFull={false}
              formattedDateAndTime="Today • 19:00"
              costText="₹400 / person"
              contentScale={0.72}
            />
          )}

          {/* Real Join Success Overlay from PlanCard - proportionally scaled to canonical frame */}
          {isSuccess && (
            <motion.div
              key="success-overlay"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 bg-[#0c0c0e]/95 backdrop-blur-md z-30 flex flex-col items-center justify-center pointer-events-none"
            >
              <div
                style={{ transform: "scale(0.72)", transformOrigin: "center center" }}
                className="flex flex-col items-center justify-center"
              >
                <motion.div
                  initial={{ scale: 0.5 }}
                  animate={{ scale: [0.5, 1.15, 1], rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 0.4 }}
                  className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.25)]"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-8 w-8 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
                <span className="text-base font-sans font-black tracking-[0.2em] text-emerald-400 mt-6 uppercase">
                  JOINED
                </span>
                <span className="text-xs font-sans text-zinc-400 mt-2">
                  Joined plan successfully!
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
}
