import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Users,
  ArrowLeft,
  CalendarClock,
  MapPin,
  Hourglass,
  IndianRupee,
  UserPlus,
  ArrowRight,
  Check,
  Film,
  X,
} from "lucide-react";

import movieCover from "../../../../assets/Movies.png";
import diningCover from "../../../../assets/dining.png";
import sportsCover from "../../../../assets/sports.png";
import customPlanCover from "../../../../assets/planimagedefault.png";
import defaultAvatar from "../../../../assets/default_avatar.png";

// ============================================================================
// IMAGE PRELOADING & DECODING CACHE
// Ensures zero network delay, no blank flashes, and fully decoded GPU textures
// BEFORE any visual transition begins.
// ============================================================================
const imagePreloadCache = new Map<string, Promise<boolean>>();

export function preloadImage(src: string): Promise<boolean> {
  if (imagePreloadCache.has(src)) {
    return imagePreloadCache.get(src)!;
  }
  const promise = new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") {
      resolve(true);
      return;
    }
    const img = new Image();
    img.src = src;

    const onComplete = () => {
      if ("decode" in img) {
        img
          .decode()
          .then(() => resolve(true))
          .catch(() => resolve(true));
      } else {
        resolve(true);
      }
    };

    if (img.complete && img.naturalWidth > 0) {
      onComplete();
    } else {
      img.onload = onComplete;
      img.onerror = () => resolve(false);
    }
  });

  imagePreloadCache.set(src, promise);
  return promise;
}

// Module-level eager warmup: start fetching and decoding immediately on bundle evaluation
if (typeof window !== "undefined") {
  [movieCover, diningCover, sportsCover, customPlanCover, defaultAvatar].forEach((src) => {
    preloadImage(src);
  });
}

export interface DemoPerson {
  id: string;
  name: string;
  initial: string;
  avatarBg: string;
  avatar?: string;
  isHost?: boolean;
}

// 1. Canonical original participants (all 6 are in Friday Plans at the start)
export const ORIGINAL_DEMO_PEOPLE: DemoPerson[] = [
  {
    id: "you",
    name: "You",
    initial: "Y",
    avatarBg: "bg-[#C46A2C] text-white border-white/20",
    avatar: defaultAvatar,
    isHost: true,
  },
  {
    id: "alex",
    name: "Alex",
    initial: "A",
    avatarBg: "bg-[#FF6B2C]/20 text-[#FF854C] border-[#FF6B2C]/30",
  },
  {
    id: "sam",
    name: "Sam",
    initial: "S",
    avatarBg: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  },
  {
    id: "maya",
    name: "Maya",
    initial: "M",
    avatarBg: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  },
  {
    id: "jordan",
    name: "Jordan",
    initial: "J",
    avatarBg: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  },
  {
    id: "leo",
    name: "Leo",
    initial: "L",
    avatarBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
];

// 2. Multiple new friends to add during the demo
export const NEW_FRIENDS_TO_ADD: DemoPerson[] = [
  {
    id: "chris",
    name: "Chris",
    initial: "C",
    avatarBg: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  },
  {
    id: "priya",
    name: "Priya",
    initial: "P",
    avatarBg: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
];

export const ONBOARDING_PLAN_TIME = "Today • 19:00";

export function getOnboardingPlanTime(): string {
  return ONBOARDING_PLAN_TIME;
}

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

interface PlanAnimationProps {
  onComplete?: () => void;
  onBack?: () => void;
  className?: string;
}

export type PlanAnimationScreenView =
  | "plan_switch"
  | "manage_participants"
  | "add_participants"
  | "final_preview";

// Module-level persistent state so returning to this screen within the session does NOT replay
let hasEverCompletedPlanAnimation = false;

export function resetPlanAnimation() {
  hasEverCompletedPlanAnimation = false;
}

export function isPlanAnimationCompleted() {
  return hasEverCompletedPlanAnimation;
}

export const FINAL_DEMO_PEOPLE: DemoPerson[] = [
  ORIGINAL_DEMO_PEOPLE[0], // You
  ...ORIGINAL_DEMO_PEOPLE.slice(2), // Sam, Maya, Jordan, Leo
  ...NEW_FRIENDS_TO_ADD, // Chris, Priya
];

export function PlanAnimation({
  onComplete,
  onBack,
  className = "",
}: PlanAnimationProps) {
  // Defined manual time for the example plan ("Today • 19:00")
  const currentPlanTime = ONBOARDING_PLAN_TIME;

  // Navigation screen view:
  // Starts directly with plan carousel switching (Movies -> Dining -> Sports -> Custom Plan)
  // Directly transitions into Manage Participants (no duplicate Friday Plans)
  // Executes Add Friends & Remove Friend
  // Returns to Final Friday Plans Preview and permanently halts
  const [screenView, setScreenView] = useState<PlanAnimationScreenView>(() =>
    hasEverCompletedPlanAnimation ? "final_preview" : "plan_switch"
  );

  // Active slide index during the plan switch carousel (0 = Movies, 1 = Dining, 2 = Sports, 3 = Custom)
  const [activePlanIdx, setActivePlanIdx] = useState<number>(() =>
    hasEverCompletedPlanAnimation ? 3 : 0
  );

  // Local participant state (starts with all 6 original participants, or final 7 if already completed)
  const [goingList, setGoingList] = useState<DemoPerson[]>(() =>
    hasEverCompletedPlanAnimation ? FINAL_DEMO_PEOPLE : ORIGINAL_DEMO_PEOPLE
  );

  // Multiple friends selected in Add Participants screen
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);

  // Action bottom sheet state for removal
  const [selectedPerson, setSelectedPerson] = useState<DemoPerson | null>(null);

  // Animation highlight states
  const [highlightManageBtn, setHighlightManageBtn] = useState<boolean>(false);
  const [highlightAddBtn, setHighlightAddBtn] = useState<boolean>(false);
  const [highlightFriendRowId, setHighlightFriendRowId] = useState<string | null>(null);
  const [highlightConfirmAddBtn, setHighlightConfirmAddBtn] = useState<boolean>(false);
  const [highlightAlexRow, setHighlightAlexRow] = useState<boolean>(false);
  const [highlightRemoveAction, setHighlightRemoveAction] = useState<boolean>(false);

  // User manual interaction flag to prevent automated interruption
  const [isUserInteracted, setIsUserInteracted] = useState<boolean>(false);

  const timersRef = useRef<NodeJS.Timeout[]>([]);
  const isCompletedRef = useRef(hasEverCompletedPlanAnimation);
  const isRunningRef = useRef(false);
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

  // ONE CONTINUOUS, SINGLE-OWNER ANIMATION SEQUENCE:
  // Strictly gated by image preloading and decode readiness:
  // 1. Preload & decode Movies (0.0s) -> Display Movies
  // 2. Gate with Dining decode (1.4s) -> Smooth swipe to Dining
  // 3. Gate with Sports decode (1.4s) -> Smooth swipe to Sports
  // 4. Gate with Custom decode (1.4s) -> Smooth swipe to Custom ("Friday Plans")
  // 5. Pulse "Manage Participants" on Custom Plan (0.8s)
  // 6. Transition DIRECTLY into Manage Participants (0.6s) [NO duplicate Friday Plans reload]
  // 7. Pulse Add Participants FAB (+) button (0.8s)
  // 8. Navigate into Add Participants screen (0.6s)
  // 9. Select first new friend: Chris (0.8s)
  // 10. Select second new friend: Priya (0.9s)
  // 11. Pulse Confirm Add button (ArrowRight) (0.9s)
  // 12. Return to Manage Participants with Chris & Priya added [8 total] (0.6s)
  // 13. Highlight original friend Alex (1.0s)
  // 14. Open Action Bottom Sheet for Alex (0.5s)
  // 15. Highlight "Remove from Plan" action (0.7s)
  // 16. Execute Remove: Alex removed, newly added friends remain [7 total] (0.6s)
  // 17. Smoothly navigate to Final Friday Plans Plan Preview (0.8s)
  // 18. Permanently stop animation and invoke onComplete (0.6s)
  useEffect(() => {
    if (hasEverCompletedPlanAnimation || isCompletedRef.current || isUserInteracted || isRunningRef.current) {
      if (hasEverCompletedPlanAnimation) {
        onCompleteRef.current?.();
      }
      return;
    }

    let isMounted = true;
    isRunningRef.current = true;
    clearAllTimers();

    // Helper to wait for both a delay and an image's decode readiness
    const waitAndGate = (delayMs: number, nextImageSrc?: string): Promise<void> => {
      const timerPromise = new Promise<void>((resolve) => {
        addTimer(resolve, delayMs);
      });
      if (nextImageSrc) {
        return Promise.all([timerPromise, preloadImage(nextImageSrc)]).then(() => {});
      }
      return timerPromise;
    };

    const runSequence = async () => {
      // 1. Initial State: Carousel starts on Movies Plan (0.0s)
      setScreenView("plan_switch");
      setActivePlanIdx(0);
      setGoingList(ORIGINAL_DEMO_PEOPLE);
      setSelectedFriendIds([]);
      setSelectedPerson(null);
      setHighlightManageBtn(false);
      setHighlightAddBtn(false);
      setHighlightFriendRowId(null);
      setHighlightConfirmAddBtn(false);
      setHighlightAlexRow(false);
      setHighlightRemoveAction(false);

      // Preload all 4 plan images concurrently
      PLAN_SLIDES.forEach((s) => preloadImage(s.coverImage));

      // Wait for Movies cover to be ready before initiating playback
      await preloadImage(PLAN_SLIDES[0].coverImage);
      if (!isMounted) return;

      // 2. Display Movies (Slide 0) for 1400ms, ensuring Dining (Slide 1) is ready
      await waitAndGate(1400, PLAN_SLIDES[1].coverImage);
      if (!isMounted) return;
      setActivePlanIdx(1);

      // 3. Display Dining (Slide 1) for 1400ms, ensuring Sports (Slide 2) is ready
      await waitAndGate(1400, PLAN_SLIDES[2].coverImage);
      if (!isMounted) return;
      setActivePlanIdx(2);

      // 4. Display Sports (Slide 2) for 1400ms, ensuring Custom (Slide 3) is ready
      await waitAndGate(1400, PLAN_SLIDES[3].coverImage);
      if (!isMounted) return;
      setActivePlanIdx(3);

      // 5. Display Custom Plan for 800ms, then pulse Manage Participants button
      await waitAndGate(800);
      if (!isMounted) return;
      setHighlightManageBtn(true);

      // 6. Enter Manage Participants screen DIRECTLY (0.6s) — NO duplicate Friday Plans!
      await waitAndGate(600);
      if (!isMounted) return;
      setHighlightManageBtn(false);
      setScreenView("manage_participants");

      // 7. Pulse Add Participants FAB (+) button in Manage Participants (0.8s)
      await waitAndGate(800);
      if (!isMounted) return;
      setHighlightAddBtn(true);

      // 8. Navigate into Add Participants screen (0.6s)
      await waitAndGate(600);
      if (!isMounted) return;
      setHighlightAddBtn(false);
      setScreenView("add_participants");

      // 9. Select first new friend: Chris (0.8s)
      await waitAndGate(800);
      if (!isMounted) return;
      setHighlightFriendRowId("chris");
      setSelectedFriendIds(["chris"]);

      // 10. Select second new friend: Priya (0.9s)
      await waitAndGate(900);
      if (!isMounted) return;
      setHighlightFriendRowId("priya");
      setSelectedFriendIds(["chris", "priya"]);

      // 11. Pulse Confirm Add button (ArrowRight) (0.9s)
      await waitAndGate(900);
      if (!isMounted) return;
      setHighlightFriendRowId(null);
      setHighlightConfirmAddBtn(true);

      // 12. Return to Manage Participants with multiple new friends added (0.6s)
      await waitAndGate(600);
      if (!isMounted) return;
      setHighlightConfirmAddBtn(false);
      setGoingList([...ORIGINAL_DEMO_PEOPLE, ...NEW_FRIENDS_TO_ADD]);
      setScreenView("manage_participants");

      // 13. Select a DIFFERENT, ORIGINAL friend: Alex (1.0s)
      await waitAndGate(1000);
      if (!isMounted) return;
      setHighlightAlexRow(true);

      // 14. Open Action Bottom Sheet for Alex (0.5s)
      await waitAndGate(500);
      if (!isMounted) return;
      setHighlightAlexRow(false);
      const alex = ORIGINAL_DEMO_PEOPLE.find((p) => p.id === "alex")!;
      setSelectedPerson(alex);

      // 15. Highlight "Remove from Plan" action (0.7s)
      await waitAndGate(700);
      if (!isMounted) return;
      setHighlightRemoveAction(true);

      // 16. Execute Remove: Alex is removed, newly added friends remain (0.6s)
      await waitAndGate(600);
      if (!isMounted) return;
      setHighlightRemoveAction(false);
      setSelectedPerson(null);
      setGoingList((prev) => prev.filter((p) => p.id !== "alex"));

      // 17. Smoothly navigate to Friday Plans Plan Preview showing final updated state (0.8s)
      await waitAndGate(800);
      if (!isMounted) return;
      setScreenView("final_preview");

      // 18. Final State Reached: Stop animation permanently and complete (0.6s)
      await waitAndGate(600);
      if (!isMounted) return;
      isCompletedRef.current = true;
      hasEverCompletedPlanAnimation = true;
      isRunningRef.current = false;
      clearAllTimers();
      onCompleteRef.current?.();
      // Animation halts completely. No timers, no loop, no restart.
    };

    runSequence();

    return () => {
      isMounted = false;
      isRunningRef.current = false;
      clearAllTimers();
    };
  }, [isUserInteracted]);

  // Interactive user manual handlers
  const handleOpenManageManual = () => {
    setIsUserInteracted(true);
    clearAllTimers();
    setHighlightManageBtn(false);
    setScreenView("manage_participants");
  };

  const handleBackToPreviewManual = () => {
    setIsUserInteracted(true);
    clearAllTimers();
    handleCloseSheet();
    setScreenView("final_preview");
  };

  const handleOpenAddParticipantsManual = () => {
    setIsUserInteracted(true);
    clearAllTimers();
    setHighlightAddBtn(false);
    setSelectedFriendIds([]);
    setScreenView("add_participants");
  };

  const handleBackFromAddManual = () => {
    setIsUserInteracted(true);
    clearAllTimers();
    setScreenView("manage_participants");
  };

  const handleToggleFriendSelectionManual = (friendId: string) => {
    setIsUserInteracted(true);
    clearAllTimers();
    setSelectedFriendIds((prev) =>
      prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]
    );
  };

  const handleConfirmAddManual = () => {
    setIsUserInteracted(true);
    clearAllTimers();
    const friendsToAdd = NEW_FRIENDS_TO_ADD.filter((f) => selectedFriendIds.includes(f.id));
    setGoingList((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const newFriends = friendsToAdd.filter((f) => !existingIds.has(f.id));
      return [...prev, ...newFriends];
    });
    setScreenView("manage_participants");
  };

  const handlePersonClickManual = (person: DemoPerson) => {
    if (person.isHost) return;
    setIsUserInteracted(true);
    clearAllTimers();
    setSelectedPerson(person);
    setHighlightRemoveAction(false);
  };

  const handleCloseSheet = () => {
    setSelectedPerson(null);
    setHighlightRemoveAction(false);
  };

  const handleRemovePersonManual = () => {
    if (!selectedPerson) return;
    const p = selectedPerson;
    handleCloseSheet();
    setGoingList((prev) => prev.filter((item) => item.id !== p.id));
  };

  const selectedFriendsObjects = NEW_FRIENDS_TO_ADD.filter((f) =>
    selectedFriendIds.includes(f.id)
  );

  return (
    <div
      id="plan_animation_card"
      style={{ transform: "translate3d(0, 0, 0)" }}
      className={`w-full max-w-[340px] xs:max-w-[365px] sm:max-w-[395px] md:max-w-[425px] h-full max-h-[540px] sm:max-h-[600px] mx-auto rounded-[28px] sm:rounded-[32px] bg-[#0A0A0C] border border-white/[0.12] shadow-2xl shadow-black/90 flex flex-col relative overflow-hidden select-none font-sans text-white ${className}`}
    >
      {/* Hidden Pre-rendered Image Warmup Cache (keeps decoded GPU textures active in browser) */}
      <div className="sr-only pointer-events-none fixed -top-[9999px] -left-[9999px] opacity-0" aria-hidden="true">
        {PLAN_SLIDES.map((slide) => (
          <img
            key={`prewarm-${slide.id}`}
            src={slide.coverImage}
            alt=""
            loading="eager"
            decoding="sync"
          />
        ))}
        <img src={defaultAvatar} alt="" loading="eager" decoding="sync" />
      </div>

      <AnimatePresence mode="wait">
        {screenView === "plan_switch" ? (
          /* ========================================================================= */
          /* 1. PLAN CAROUSEL SWITCHING (MOVIES -> DINING -> SPORTS -> CUSTOM)         */
          /* Sliding horizontal track: zero unmounting, images remain mounted & ready  */
          /* ========================================================================= */
          <motion.div
            key="screen-plan-switch"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -25 }}
            transition={{ duration: 0.26, ease: "easeOut" }}
            className="w-full h-full flex flex-col relative overflow-hidden bg-[#0A0A0C]"
          >
            {/* Horizontal Slide Track */}
            <motion.div
              className="w-full h-full flex flex-row flex-nowrap"
              initial={false}
              animate={{ x: `-${activePlanIdx * 100}%` }}
              transition={{ duration: 0.42, ease: [0.25, 1, 0.5, 1] }}
            >
              {PLAN_SLIDES.map((slide, idx) => (
                <div
                  key={`plan-slide-${slide.id}`}
                  className="w-full h-full min-w-full flex-shrink-0 flex flex-col relative overflow-hidden bg-[#0A0A0C]"
                >
                  {/* Hero Cover Banner */}
                  <div className="relative w-full h-[155px] xs:h-[170px] sm:h-[185px] flex flex-col justify-end overflow-visible flex-shrink-0 rounded-b-[1.75rem] border-b border-white/10">
                    <div className="absolute inset-0 w-full h-full">
                      <img
                        src={slide.coverImage}
                        alt={slide.title}
                        loading="eager"
                        decoding="sync"
                        className="absolute inset-0 w-full h-full object-cover filter brightness-[0.75]"
                      />
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80 pointer-events-none z-10" />

                    {/* Glass Top Header inside Card */}
                    <div className="absolute top-0 left-0 right-0 z-30 bg-black/35 backdrop-blur-xl border-b border-white/10 shadow-lg py-2 px-3 rounded-b-xl">
                      <div className="w-full flex items-center justify-center relative min-h-[28px]">
                        <div className="flex flex-col items-center max-w-full">
                          <span className="text-[13.5px] xs:text-[14.5px] font-bold tracking-[0.06em] leading-tight text-white select-none">
                            {slide.title}
                          </span>
                          <div className="flex items-center gap-1 mt-0.5 select-none">
                            <div className="w-3.5 h-3.5 rounded-full overflow-hidden border border-black/80 flex-shrink-0 bg-zinc-800">
                              <img
                                src={defaultAvatar}
                                alt="You"
                                loading="eager"
                                className="w-full h-full object-cover"
                              />
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
                              {slide.time}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-white/90 font-sans font-semibold text-[11.5px] xs:text-[12px] tracking-tight shrink-0 pl-1.5 select-none">
                            <Users className="w-3.5 h-3.5 text-white/70 flex-shrink-0" />
                            <span>{slide.participants.length}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-left">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-[#ef4444]" />
                          <span className="text-[11.5px] xs:text-[12px] font-sans font-semibold text-white tracking-wide truncate">
                            {slide.location}
                          </span>
                        </div>

                        <div className="w-full flex items-center justify-between text-white/50 text-[10px] font-medium leading-none">
                          <div className="flex items-center gap-2 text-left">
                            <Hourglass className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                            <span className="text-[9.5px] xs:text-[10px] font-medium leading-none text-amber-400">
                              {slide.time}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 font-semibold text-right">
                            <IndianRupee className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
                            <span className="font-sans tracking-tight text-[11.5px] xs:text-[12px] text-white/90 font-semibold">
                              {slide.cost}
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
                          Joined ({slide.participants.length})
                        </div>
                      </div>
                    </div>

                    {/* ONLY Participant Rows Scroll */}
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar space-y-0.5 pb-1">
                      {slide.participants.map((person) => (
                        <div
                          key={person.id}
                          className="flex items-center gap-2.5 py-1 px-1 rounded-xl select-none"
                        >
                          <div className="relative flex-shrink-0">
                            {person.avatar ? (
                              <div className="w-6.5 h-6.5 rounded-full overflow-hidden bg-zinc-800 border border-white/10 flex items-center justify-center">
                                <img
                                  src={person.avatar}
                                  alt={person.name}
                                  loading="eager"
                                  className="w-full h-full object-cover"
                                />
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
                    <motion.button
                      id={`host_manage_participants_btn_switch_${slide.id}`}
                      type="button"
                      onClick={handleOpenManageManual}
                      animate={
                        idx === 3 && highlightManageBtn
                          ? {
                              scale: [1, 1.04, 1],
                              backgroundColor: [
                                "rgba(255, 255, 255, 0.05)",
                                "rgba(255, 107, 44, 0.2)",
                                "rgba(255, 255, 255, 0.05)",
                              ],
                              borderColor: [
                                "rgba(255, 255, 255, 0.15)",
                                "rgba(255, 107, 44, 0.6)",
                                "rgba(255, 255, 255, 0.15)",
                              ],
                            }
                          : { scale: 1 }
                      }
                      transition={{ duration: 0.6 }}
                      className="py-1 px-3 bg-transparent hover:bg-white/[0.06] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 text-[12.5px] font-sans font-semibold text-white/90 cursor-pointer select-none rounded-full border border-white/10"
                    >
                      <Users className="w-4 h-4 text-white/70" />
                      <span>Manage Participants</span>
                    </motion.button>
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        ) : screenView === "manage_participants" ? (
          /* ========================================================================= */
          /* 2. MANAGE PARTICIPANTS SCREEN (Exact UI from ManageParticipantAnimation)  */
          /* ========================================================================= */
          <motion.div
            key="screen-manage-participants"
            initial={{ opacity: 0, x: 25 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 25 }}
            transition={{ duration: 0.26, ease: "easeOut" }}
            className="w-full h-full bg-[#000000] flex flex-col relative overflow-hidden"
          >
            {/* Header matching ParticipantHeader.tsx */}
            <div
              className="w-full shrink-0 px-4 py-3 flex items-center border-b border-white/[0.08] bg-[#000000] relative z-20"
              style={{ height: "60px", boxSizing: "border-box" }}
            >
              <button
                type="button"
                onClick={handleBackToPreviewManual}
                className="p-1 -ml-1 text-white hover:text-white/80 active:scale-95 transition cursor-pointer flex items-center justify-center mr-2.5 shrink-0"
                title="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="flex flex-col text-left flex-1 min-w-0">
                <h1 className="text-[15px] xs:text-[16px] font-bold text-white tracking-tight leading-none truncate">
                  Participants
                </h1>
                <span className="text-[11px] text-white/40 mt-1 leading-none truncate">
                  Friday Plans
                </span>
              </div>
            </div>

            {/* Clean Participant List matching StackingFriends.tsx */}
            <div className="px-4 py-2 flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar">
              <AnimatePresence mode="popLayout">
                <div className="flex flex-col gap-0.5 w-full">
                  {goingList.map((person) => (
                    <motion.div
                      key={person.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        backgroundColor:
                          (selectedPerson?.id === person.id) || (highlightAlexRow && person.id === "alex")
                            ? "rgba(255, 255, 255, 0.12)"
                            : "transparent",
                      }}
                      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.22 }}
                      onClick={() => handlePersonClickManual(person)}
                      className={`flex items-center py-2 px-1 rounded-lg select-none transition-colors ${
                        person.isHost
                          ? "cursor-default"
                          : "cursor-pointer hover:bg-white/[0.04] active:bg-white/[0.06]"
                      }`}
                    >
                      <div className="relative w-7 h-7 mr-3 shrink-0">
                        {person.avatar ? (
                          <div className="w-7 h-7 rounded-full overflow-hidden bg-zinc-800 border border-white/10 flex items-center justify-center">
                            <img
                              src={person.avatar}
                              alt={person.name}
                              loading="eager"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div
                            className={`w-7 h-7 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 ${person.avatarBg}`}
                          >
                            {person.initial}
                          </div>
                        )}
                      </div>

                      <span className="text-[13.5px] font-semibold text-white flex-1 text-left truncate leading-tight font-sans">
                        {person.name}
                      </span>

                      {person.isHost && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#F59E0B",
                            background: "rgba(245, 158, 11, 0.12)",
                            padding: "2px 8px",
                            borderRadius: 9999,
                            lineHeight: 1.2,
                            display: "inline-flex",
                            alignItems: "center",
                            fontFamily: "Inter, sans-serif",
                          }}
                        >
                          Host
                        </span>
                      )}
                    </motion.div>
                  ))}
                </div>
              </AnimatePresence>
            </div>

            {/* Sticky Floating Action Button — Add Participants matching AssignedParticipantScreen.tsx */}
            <div className="absolute bottom-4 right-4 z-40">
              <motion.button
                type="button"
                id="fab_add_participants_btn"
                onClick={handleOpenAddParticipantsManual}
                animate={
                  highlightAddBtn
                    ? {
                        scale: [1, 1.15, 1],
                        backgroundColor: ["#FF6B2C", "#FF854C", "#FF6B2C"],
                        boxShadow: [
                          "0 4px 14px rgba(0, 0, 0, 0.5)",
                          "0 8px 24px rgba(255, 107, 44, 0.6)",
                          "0 4px 14px rgba(0, 0, 0, 0.5)",
                        ],
                      }
                    : { scale: 1 }
                }
                transition={{ duration: 0.55 }}
                title="Add Participants"
                className="w-11 h-11 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:scale-95 text-white flex items-center justify-center shadow-lg shadow-black/50 border border-white/20 transition cursor-pointer select-none"
              >
                <UserPlus className="w-5 h-5 text-white" />
              </motion.button>
            </div>

            {/* Action Bottom Sheet matching AssignedParticipantActions.tsx */}
            <AnimatePresence>
              {selectedPerson && (
                <motion.div
                  key="participant-actions-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={handleCloseSheet}
                  className="absolute inset-0 z-50 bg-black/60 flex flex-col justify-end"
                >
                  <motion.div
                    key="participant-actions-modal"
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-[#1C1C1E] rounded-t-[20px] px-5 pt-3.5 pb-5 border-t border-white/10 shadow-2xl flex flex-col text-left"
                  >
                    {/* Top Pill Handle */}
                    <div className="flex justify-center mb-3">
                      <div
                        style={{
                          width: 36,
                          height: 5,
                          borderRadius: 2.5,
                          background: "rgba(255, 255, 255, 0.15)",
                        }}
                      />
                    </div>

                    {/* Participant Profile Banner */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-white/15 bg-zinc-800">
                        {selectedPerson.avatar ? (
                          <img
                            src={selectedPerson.avatar}
                            alt={selectedPerson.name}
                            loading="eager"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div
                            className={`w-full h-full flex items-center justify-center text-[12px] font-bold ${selectedPerson.avatarBg}`}
                          >
                            {selectedPerson.initial}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[15px] font-semibold text-white leading-tight">
                          {selectedPerson.name}
                        </span>
                        <span className="text-[11.5px] text-white/40 mt-0.5 leading-tight">
                          Joined
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2">
                      <motion.button
                        type="button"
                        onClick={handleRemovePersonManual}
                        animate={
                          highlightRemoveAction
                            ? {
                                scale: [1, 1.02, 1],
                                backgroundColor: [
                                  "rgba(239, 68, 68, 0.12)",
                                  "#EF4444",
                                  "#EF4444",
                                ],
                                color: ["#EF4444", "#FFFFFF", "#FFFFFF"],
                              }
                            : {}
                        }
                        transition={{ duration: 0.5 }}
                        className={`w-full h-11 px-3.5 rounded-xl text-[13.5px] font-semibold text-left transition cursor-pointer flex items-center ${
                          highlightRemoveAction
                            ? "bg-[#EF4444] text-white shadow-lg shadow-[#EF4444]/30"
                            : "bg-[#EF4444]/[0.08] hover:bg-[#EF4444]/[0.16] text-[#EF4444]"
                        }`}
                      >
                        Remove from Plan
                      </motion.button>

                      <button
                        type="button"
                        onClick={handleCloseSheet}
                        className="w-full py-2 text-center text-[13px] font-medium text-white/40 hover:text-white/70 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : screenView === "add_participants" ? (
          /* ========================================================================= */
          /* 3. ADD PARTICIPANTS SCREEN (Exact UI from ManageParticipantAnimation)     */
          /* ========================================================================= */
          <motion.div
            key="screen-add-participants"
            initial={{ opacity: 0, x: 35 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 35 }}
            transition={{ duration: 0.26, ease: "easeOut" }}
            className="w-full h-full bg-[#000000] flex flex-col relative overflow-hidden"
          >
            {/* Unified Pill-Shaped Search Header matching WhoIsComingScreen.tsx */}
            <div
              className="w-full shrink-0 px-3 flex items-center bg-[#000000] relative z-20 pt-3 pb-2 border-b border-white/[0.06]"
              style={{ boxSizing: "border-box" }}
            >
              <div
                className="w-full flex items-center rounded-full bg-[#18181B] border border-white/[0.08] px-3"
                style={{ height: "40px" }}
              >
                {/* Back button */}
                <button
                  type="button"
                  onClick={handleBackFromAddManual}
                  className="flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer mr-2 shrink-0 p-0.5"
                  title="Back"
                >
                  <ArrowLeft className="w-4.5 h-4.5 stroke-[2.2]" />
                </button>

                {/* Search placeholder input */}
                <span className="flex-1 text-[13.5px] font-medium text-white/40 font-sans truncate text-left">
                  Search friends…
                </span>

                {/* Film/Movie category icon matching Friday Plans theme */}
                <div className="shrink-0 flex items-center justify-center p-0.5 text-[#A78BFA]">
                  <Film className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Selected Avatar Strip matching FriendsSelector.tsx */}
            <div className="px-3.5 py-2 border-b border-white/[0.08] flex items-center justify-between select-none gap-2">
              <div className="flex-1 flex items-center gap-2.5 overflow-x-auto no-scrollbar py-0.5">
                {/* Host "You" (always first avatar) */}
                <div className="flex flex-col items-center shrink-0 relative w-10">
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 bg-zinc-800 flex items-center justify-center">
                    <img
                      src={defaultAvatar}
                      alt="You"
                      loading="eager"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-[9.5px] font-semibold text-zinc-400 mt-1 truncate">
                    You
                  </span>
                </div>

                {/* Newly selected friends appear in strip */}
                <AnimatePresence>
                  {selectedFriendsObjects.map((friend) => (
                    <motion.div
                      key={`selected-strip-${friend.id}`}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 450, damping: 28 }}
                      className="flex flex-col items-center shrink-0 relative w-10"
                    >
                      <div className="relative">
                        <div
                          className={`w-8 h-8 rounded-full border flex items-center justify-center text-[11px] font-bold ${friend.avatarBg}`}
                        >
                          {friend.initial}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleFriendSelectionManual(friend.id)}
                          className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-zinc-800 border border-white/20 flex items-center justify-center text-zinc-300"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      <span className="text-[9.5px] font-semibold text-zinc-400 mt-1 truncate">
                        {friend.name}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Orange Count Badge: Host + selected friends */}
              <div className="shrink-0 flex items-center justify-center pr-0.5">
                <div className="w-5.5 h-5.5 rounded-full bg-[#FF6B2C] text-white font-bold text-[11px] flex items-center justify-center shadow-md select-none">
                  {1 + selectedFriendIds.length}
                </div>
              </div>
            </div>

            {/* Friends Selector List matching FriendsSelector.tsx */}
            <div className="px-3.5 py-1 flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar divide-y divide-white/[0.06]">
              {NEW_FRIENDS_TO_ADD.map((friend) => {
                const isSelected = selectedFriendIds.includes(friend.id);
                const isHighlighted = highlightFriendRowId === friend.id;

                return (
                  <motion.button
                    key={friend.id}
                    type="button"
                    onClick={() => handleToggleFriendSelectionManual(friend.id)}
                    animate={
                      isHighlighted
                        ? {
                            backgroundColor: [
                              "transparent",
                              "rgba(255, 255, 255, 0.08)",
                              "transparent",
                            ],
                          }
                        : {}
                    }
                    transition={{ duration: 0.45 }}
                    className="w-full py-2.5 px-1 flex items-center justify-between hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors rounded-lg cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0 ${friend.avatarBg}`}
                      >
                        {friend.initial}
                      </div>
                      <span className="text-[13.5px] font-semibold text-white text-left font-sans">
                        {friend.name}
                      </span>
                    </div>

                    {/* Selection Checkmark Pill */}
                    {isSelected ? (
                      <motion.span
                        initial={{ scale: 0.6 }}
                        animate={{ scale: 1 }}
                        className="w-5.5 h-5.5 rounded-full bg-[#FF6B2C] flex items-center justify-center shrink-0 shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                      </motion.span>
                    ) : (
                      <span className="w-5.5 h-5.5 rounded-full border border-white/20 shrink-0" />
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Floating ArrowRight Confirm Button matching WhoIsComingScreen.tsx */}
            <AnimatePresence>
              {selectedFriendIds.length > 0 && (
                <motion.button
                  key="confirm_add_button"
                  type="button"
                  id="btn_confirm_add_participant"
                  onClick={handleConfirmAddManual}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    highlightConfirmAddBtn
                      ? {
                          scale: [1, 1.15, 1],
                          backgroundColor: ["#FF6B2C", "#FF854C", "#FF6B2C"],
                          boxShadow: [
                            "0 4px 14px rgba(0, 0, 0, 0.5)",
                            "0 8px 24px rgba(255, 107, 44, 0.6)",
                            "0 4px 14px rgba(0, 0, 0, 0.5)",
                          ],
                        }
                      : { scale: 1, opacity: 1 }
                  }
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  title="Confirm"
                  className="absolute bottom-4 right-4 z-40 w-11 h-11 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:scale-95 text-white flex items-center justify-center shadow-lg shadow-black/50 border border-white/20 transition cursor-pointer select-none"
                >
                  <ArrowRight className="w-5 h-5 text-white stroke-[2.5]" />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          /* ========================================================================= */
          /* 4. FINAL FRIDAY PLANS PREVIEW (RESTING STATE WITH UPDATED 7 PARTICIPANTS) */
          /* ========================================================================= */
          <motion.div
            key="screen-final-preview"
            initial={{ opacity: 0, x: -25 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -25 }}
            transition={{ duration: 0.26, ease: "easeOut" }}
            className="w-full h-full flex flex-col relative overflow-hidden bg-[#0A0A0C]"
          >
            {/* Hero Cover Banner */}
            <div className="relative w-full h-[155px] xs:h-[170px] sm:h-[185px] flex flex-col justify-end overflow-visible flex-shrink-0 rounded-b-[1.75rem] border-b border-white/10">
              <div className="absolute inset-0 w-full h-full">
                <img
                  src={customPlanCover}
                  alt="Friday Plans"
                  loading="eager"
                  decoding="sync"
                  className="absolute inset-0 w-full h-full object-cover filter brightness-[0.75]"
                />
              </div>

              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80 pointer-events-none z-10" />

              {/* Glass Top Header inside Card */}
              <div className="absolute top-0 left-0 right-0 z-30 bg-black/35 backdrop-blur-xl border-b border-white/10 shadow-lg py-2 px-3 rounded-b-xl">
                <div className="w-full flex items-center justify-center relative min-h-[28px]">
                  <div className="flex flex-col items-center max-w-full">
                    <span className="text-[13.5px] xs:text-[14.5px] font-bold tracking-[0.06em] leading-tight text-white select-none">
                      Friday Plans
                    </span>
                    <div className="flex items-center gap-1 mt-0.5 select-none">
                      <div className="w-3.5 h-3.5 rounded-full overflow-hidden border border-black/80 flex-shrink-0 bg-zinc-800">
                        <img
                          src={defaultAvatar}
                          alt="You"
                          loading="eager"
                          className="w-full h-full object-cover"
                        />
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
                        {currentPlanTime}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-white/90 font-sans font-semibold text-[11.5px] xs:text-[12px] tracking-tight shrink-0 pl-1.5 select-none">
                      <Users className="w-3.5 h-3.5 text-white/70 flex-shrink-0" />
                      <span>{goingList.length}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-left">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-[#ef4444]" />
                    <span className="text-[11.5px] xs:text-[12px] font-sans font-semibold text-white tracking-wide truncate">
                      Go-To Spot
                    </span>
                  </div>

                  <div className="w-full flex items-center justify-between text-white/50 text-[10px] font-medium leading-none">
                    <div className="flex items-center gap-2 text-left">
                      <Hourglass className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                      <span className="text-[9.5px] xs:text-[10px] font-medium leading-none text-amber-400">
                        {currentPlanTime}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 font-semibold text-right">
                      <IndianRupee className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
                      <span className="font-sans tracking-tight text-[11.5px] xs:text-[12px] text-white/90 font-semibold">
                        100 / person
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
                    Joined ({goingList.length})
                  </div>
                </div>
              </div>

              {/* ONLY Participant Rows Scroll */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar space-y-0.5 pb-1">
                {goingList.map((person) => (
                  <div
                    key={person.id}
                    className="flex items-center gap-2.5 py-1 px-1 rounded-xl select-none"
                  >
                    <div className="relative flex-shrink-0">
                      {person.avatar ? (
                        <div className="w-6.5 h-6.5 rounded-full overflow-hidden bg-zinc-800 border border-white/10 flex items-center justify-center">
                          <img
                            src={person.avatar}
                            alt={person.name}
                            loading="eager"
                            className="w-full h-full object-cover"
                          />
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
                id="host_manage_participants_btn_final"
                type="button"
                onClick={handleOpenManageManual}
                className="py-1 px-3 bg-transparent hover:opacity-100 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 text-[12.5px] font-sans font-semibold text-white/90 cursor-pointer select-none rounded-full border border-white/10"
              >
                <Users className="w-4 h-4 text-white/70" />
                <span>Manage Participants</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default PlanAnimation;
