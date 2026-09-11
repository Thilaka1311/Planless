import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Users,
  CalendarClock,
  MapPin,
  Hourglass,
  IndianRupee,
} from "lucide-react";

import movieCover from "../../../../assets/Movies.png";
import diningCover from "../../../../assets/dining.png";
import sportsCover from "../../../../assets/sports.png";
import customPlanCover from "../../../../assets/planimagedefault.png";
import defaultAvatar from "../../../../assets/default_avatar.png";
import { ORIGINAL_DEMO_PEOPLE, DemoPerson } from "./ManageParticipantAnimation";
import { getOnboardingPlanTime } from "./PlanAnimation";

export interface PlanSlideConfig {
  id: string;
  category: string;
  title: string;
  coverImage: string;
  time: string;
  location: string;
  cost: string;
  participants: DemoPerson[];
}

export const PLAN_SLIDES: PlanSlideConfig[] = [
  {
    id: "movies",
    category: "Movies",
    title: "Friday Movie Night",
    coverImage: movieCover,
    time: "Today • 19:00",
    location: "Movie Theater",
    cost: "350 / person",
    participants: ORIGINAL_DEMO_PEOPLE.slice(0, 4), // You, Alex, Sam, Maya
  },
  {
    id: "dining",
    category: "Dining",
    title: "Weekend Dinner",
    coverImage: diningCover,
    time: "Today • 19:00",
    location: "Restaurant",
    cost: "800 / person",
    participants: [ORIGINAL_DEMO_PEOPLE[0], ORIGINAL_DEMO_PEOPLE[1], ORIGINAL_DEMO_PEOPLE[3], ORIGINAL_DEMO_PEOPLE[4]], // You, Alex, Maya, Jordan
  },
  {
    id: "sports",
    category: "Sports",
    title: "Turf Football Match",
    coverImage: sportsCover,
    time: "Today • 19:00",
    location: "Ground",
    cost: "200 / person",
    participants: [ORIGINAL_DEMO_PEOPLE[0], ORIGINAL_DEMO_PEOPLE[1], ORIGINAL_DEMO_PEOPLE[2], ORIGINAL_DEMO_PEOPLE[5]], // You, Alex, Sam, Leo
  },
  {
    id: "custom",
    category: "Custom",
    title: "Friday Plans",
    coverImage: customPlanCover,
    time: "Today • 19:00",
    location: "Go-To Spot",
    cost: "100 / person",
    participants: ORIGINAL_DEMO_PEOPLE, // All 6 canonical participants
  },
];

interface PlanImageSwitchAnimationProps {
  onComplete?: () => void;
  onBack?: () => void;
  className?: string;
}

export function PlanImageSwitchAnimation({
  onComplete,
  onBack,
  className = "",
}: PlanImageSwitchAnimationProps) {
  // Current active plan index (0 = Movies, 1 = Dining, 2 = Sports, 3 = Custom)
  const [activePlanIdx, setActivePlanIdx] = useState<number>(0);

  // User manual interaction flag
  const [isUserInteracted, setIsUserInteracted] = useState<boolean>(false);

  const timersRef = useRef<NodeJS.Timeout[]>([]);
  const hasCompletedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  const addTimer = (fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay);
    timersRef.current.push(t);
    return t;
  };

  const clearAllTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };

  // ONE-TIME AUTOMATED ANIMATION SEQUENCE
  // Movies (0s - 1.4s)
  // → Swipe to Dining (1.4s - 2.8s)
  // → Swipe to Sports (2.8s - 4.2s)
  // → Swipe to Custom (4.2s - 5.2s)
  // → STOP on Custom Plan and hand off to ManageParticipantAnimation (5.2s)
  useEffect(() => {
    if (isUserInteracted) return;

    let isMounted = true;
    clearAllTimers();

    // 1. Initial State: Movies Plan (0s)
    setActivePlanIdx(0);

    // 2. Swipe right to Dining Plan (1.4s)
    addTimer(() => {
      if (!isMounted) return;
      setActivePlanIdx(1);
    }, 1400);

    // 3. Swipe right to Sports Plan (2.8s)
    addTimer(() => {
      if (!isMounted) return;
      setActivePlanIdx(2);
    }, 2800);

    // 4. Swipe right to Custom Plan (4.2s)
    addTimer(() => {
      if (!isMounted) return;
      setActivePlanIdx(3);
    }, 4200);

    // 5. Custom Plan settles and completes handoff (5.2s)
    addTimer(() => {
      if (!isMounted) return;
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onCompleteRef.current?.();
      }
    }, 5200);

    return () => {
      isMounted = false;
      clearAllTimers();
    };
  }, [isUserInteracted]);

  const handleManageClick = () => {
    setIsUserInteracted(true);
    clearAllTimers();
    if (!hasCompletedRef.current) {
      hasCompletedRef.current = true;
      onCompleteRef.current?.();
    }
  };

  const currentPlan = PLAN_SLIDES[activePlanIdx];

  return (
    <div
      id="plan_image_switch_animation_card"
      className={`w-full max-w-[340px] xs:max-w-[365px] sm:max-w-[395px] md:max-w-[425px] h-full max-h-[540px] sm:max-h-[600px] mx-auto rounded-[28px] sm:rounded-[32px] bg-[#0A0A0C] border border-white/[0.12] shadow-2xl shadow-black/90 flex flex-col relative overflow-hidden select-none font-sans text-white ${className}`}
    >
      {/* Horizontal Swipe Carousel between the 4 Plans */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`plan-slide-${currentPlan.id}`}
          initial={{ opacity: 0, x: 45 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -45 }}
          transition={{ duration: 0.38, ease: [0.25, 1, 0.5, 1] }}
          className="w-full h-full flex flex-col relative overflow-hidden bg-[#0A0A0C]"
        >
          {/* Hero Cover Banner */}
          <div className="relative w-full h-[155px] xs:h-[170px] sm:h-[185px] flex flex-col justify-end overflow-visible flex-shrink-0 rounded-b-[1.75rem] border-b border-white/10">
            <div className="absolute inset-0 w-full h-full">
              <img
                src={currentPlan.coverImage}
                alt={currentPlan.title}
                className="absolute inset-0 w-full h-full object-cover filter brightness-[0.75]"
              />
            </div>

            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80 pointer-events-none z-10" />

            {/* Glass Top Header inside Card */}
            <div className="absolute top-0 left-0 right-0 z-30 bg-black/35 backdrop-blur-xl border-b border-white/10 shadow-lg py-2 px-3 rounded-b-xl">
              <div className="w-full flex items-center justify-center relative min-h-[28px]">
                <div className="flex flex-col items-center max-w-full">
                  <span className="text-[13.5px] xs:text-[14.5px] font-bold tracking-[0.06em] leading-tight text-white select-none">
                    {currentPlan.title}
                  </span>
                  <div className="flex items-center gap-1 mt-0.5 select-none">
                      <div className="w-3.5 h-3.5 rounded-full overflow-hidden border border-black/80 flex-shrink-0 bg-zinc-800">
                        <img src={defaultAvatar} alt="You" className="w-full h-full object-cover" />
                      </div>
                    <span className="text-[10px] xs:text-[10.5px] text-white/60 font-medium select-none">
                      Hosted by <span className="text-white/90 font-semibold">You</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Integrated Info Card */}
            <div className="absolute left-3.5 right-3.5 xs:left-4 xs:right-4 bottom-0 translate-y-1/2 z-20">
              <div className="w-full bg-black/60 backdrop-blur-2xl border border-white/15 shadow-xl rounded-xl xs:rounded-2xl p-2.5 xs:p-3 space-y-1.5 xs:space-y-2">
                <div className="w-full flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0 flex items-center gap-2 text-left">
                    <CalendarClock className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
                    <span className="text-[11.5px] xs:text-[12px] font-sans tracking-wide truncate text-white font-semibold">
                      {currentPlan.time}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-white/90 font-sans font-semibold text-[11.5px] xs:text-[12px] tracking-tight shrink-0 pl-1.5 select-none">
                    <Users className="w-3.5 h-3.5 text-white/70 flex-shrink-0" />
                    <span>{currentPlan.participants.length}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-left">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-[#ef4444]" />
                  <span className="text-[11.5px] xs:text-[12px] font-sans font-semibold text-white tracking-wide truncate">
                    {currentPlan.location}
                  </span>
                </div>

                <div className="w-full flex items-center justify-between text-white/50 text-[10px] font-medium leading-none">
                  <div className="flex items-center gap-2 text-left">
                    <Hourglass className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                    <span className="text-[9.5px] xs:text-[10px] font-medium leading-none text-amber-400">
                      {currentPlan.time}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 font-semibold text-right">
                    <IndianRupee className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
                    <span className="font-sans tracking-tight text-[11.5px] xs:text-[12px] text-white/90 font-semibold">
                      {currentPlan.cost}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Participant list section */}
          <div className="px-3.5 xs:px-4 pt-[46px] xs:pt-[50px] pb-1 flex-1 flex flex-col min-h-0">
            {/* Status Pill — FIXED */}
            <div className="w-full flex items-center justify-center flex-shrink-0 mb-1">
              <div className="w-full flex items-center justify-center bg-[#0A0A0C]/90 border border-white/15 rounded-full overflow-hidden backdrop-blur-md shadow-inner">
                <div className="flex-1 py-1 px-2.5 text-[10px] xs:text-[10.5px] font-sans font-semibold tracking-wide text-emerald-200 text-center bg-[rgba(6,78,59,0.85)] rounded-full select-none shadow-sm">
                  Joined ({currentPlan.participants.length})
                </div>
              </div>
            </div>

            {/* ONLY Participant Rows Scroll */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar space-y-0.5 pb-1">
              {currentPlan.participants.map((person) => (
                <div
                  key={person.id}
                  className="flex items-center gap-2.5 py-1 px-1 rounded-xl select-none"
                >
                  <div className="relative flex-shrink-0">
                    {person.avatar ? (
                      <div className="w-6.5 h-6.5 rounded-full overflow-hidden bg-zinc-800 border border-white/10 flex items-center justify-center">
                        <img src={person.avatar} alt={person.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div
                        className={`w-6.5 h-6.5 rounded-full border flex items-center justify-center text-[9.5px] font-bold shrink-0 ${person.avatarBg}`}
                      >
                        {person.initial}
                      </div>
                    )}
                  </div>
                  <span className="font-sans text-[12px] font-semibold leading-none truncate flex-1 text-white text-left">
                    {person.name}
                  </span>
                  {person.isHost && (
                    <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
                      Host
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Anchored "Manage Participants" Button */}
          <div className="p-2.5 pt-1 pb-3 flex flex-col items-center justify-center flex-shrink-0 bg-[#0A0A0C]">
            <button
              id="host_manage_participants_btn_switch"
              type="button"
              onClick={handleManageClick}
              className="py-1 px-3 bg-transparent hover:bg-white/[0.06] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 text-[12.5px] font-sans font-semibold text-white/90 cursor-pointer select-none rounded-full border border-white/10"
            >
              <Users className="w-4 h-4 text-white/70" />
              <span>Manage Participants</span>
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
