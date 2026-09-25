import React, { useState, useEffect, useRef, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import customPlanCover from "../../../../assets/planimagedefault.png";
import defaultAvatar from "../../../../assets/default_avatar.png";
import { WhoIsComingScreen } from "../../../create/screens/WhoIsComingScreen";
import { CreatePlanReview } from "../../../create/screens/CreatePlanReview";
import { CreatePlanConfirmation } from "../../../create/components/CreatePlanConfirmation";

interface CreatePlanAnimationProps {
  onComplete?: () => void;
  className?: string;
}

export type CreateStep = "select_people" | "review_plan" | "created_plan";

let hasEverCompletedCreatePlanAnimation = false;

export function resetCreatePlanAnimation() {
  hasEverCompletedCreatePlanAnimation = false;
}

export function isCreatePlanAnimationCompleted() {
  return hasEverCompletedCreatePlanAnimation;
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

const DEMO_FRIENDS_POOL = [
  {
    id: "alex",
    dbUuid: "alex",
    name: "Alex",
    username: "alex",
    avatar: getLetterAvatar("Alex"),
    profilePhoto: getLetterAvatar("Alex"),
  },
  {
    id: "maya",
    dbUuid: "maya",
    name: "Maya",
    username: "maya",
    avatar: getLetterAvatar("Maya"),
    profilePhoto: getLetterAvatar("Maya"),
  },
  {
    id: "jordan",
    dbUuid: "jordan",
    name: "Jordan",
    username: "jordan",
    avatar: getLetterAvatar("Jordan"),
    profilePhoto: getLetterAvatar("Jordan"),
  },
  {
    id: "sam",
    dbUuid: "sam",
    name: "Sam",
    username: "sam",
    avatar: getLetterAvatar("Sam"),
    profilePhoto: getLetterAvatar("Sam"),
  },
  {
    id: "leo",
    dbUuid: "leo",
    name: "Leo",
    username: "leo",
    avatar: getLetterAvatar("Leo"),
    profilePhoto: getLetterAvatar("Leo"),
  },
];

const DEMO_USER = {
  id: "you",
  dbUuid: "you",
  name: "You",
  avatar: defaultAvatar,
  profile_photo: defaultAvatar,
};

export function CreatePlanAnimation({
  onComplete,
  className = "",
}: CreatePlanAnimationProps) {
  const [step, setStep] = useState<CreateStep>(() =>
    hasEverCompletedCreatePlanAnimation ? "created_plan" : "select_people"
  );

  // Form states used across the real production components
  const [searchPeopleQuery, setSearchPeopleQuery] = useState("");
  const [selectedFriends, setSelectedFriends] = useState<any[]>(() =>
    hasEverCompletedCreatePlanAnimation
      ? [DEMO_FRIENDS_POOL[0], DEMO_FRIENDS_POOL[1], DEMO_FRIENDS_POOL[2]]
      : []
  );
  const [priorityGuestIds, setPriorityGuestIds] = useState<string[]>([]);
  const [isHostSelected, setIsHostSelected] = useState<boolean>(true);
  const [totalCapacity, setTotalCapacity] = useState<number | undefined>(undefined);
  const [waitlistMode, setWaitlistMode] = useState<"automatic" | "assigned">("automatic");
  const [waitlistEnabled, setWaitlistEnabled] = useState<boolean>(true);
  const [localTitle, setLocalTitle] = useState("Friday Plans");
  const [costAmount, setCostAmount] = useState("400");
  const [isCostManuallySet, setIsCostManuallySet] = useState(true);
  const [isDateManuallySet, setIsDateManuallySet] = useState(true);
  const [eventDateTime, setEventDateTime] = useState<Date>(
    () => new Date(Date.now() + 3 * 3600 * 1000)
  );
  const [localLocation, setLocalLocation] = useState("Indiranagar, Bangalore");
  const [placeAddress, setPlaceAddress] = useState("Indiranagar, Bangalore");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const timersRef = useRef<NodeJS.Timeout[]>([]);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  const clearAllTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };

  const addTimer = (fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay);
    timersRef.current.push(t);
    return t;
  };

  useEffect(() => {
    if (hasEverCompletedCreatePlanAnimation) {
      onCompleteRef.current?.();
      return;
    }

    clearAllTimers();

    // Stage 1: Select friends sequentially (0.0s – 2.8s)
    // 0.7s: Select Alex
    addTimer(() => {
      setSelectedFriends([DEMO_FRIENDS_POOL[0]]);
    }, 700);

    // 1.3s: Select Maya
    addTimer(() => {
      setSelectedFriends([DEMO_FRIENDS_POOL[0], DEMO_FRIENDS_POOL[1]]);
    }, 1300);

    // 1.9s: Select Jordan
    addTimer(() => {
      setSelectedFriends([DEMO_FRIENDS_POOL[0], DEMO_FRIENDS_POOL[1], DEMO_FRIENDS_POOL[2]]);
    }, 1900);

    // 2.6s: Auto-advance directly to Review Plan screen (skipping New Activity / Manage Participants)
    addTimer(() => {
      setStep("review_plan");
    }, 2600);

    // Stage 2: Review Plan
    // 4.8s: Tap "Create Plan" -> Show "Creating Plan…"
    addTimer(() => {
      setIsSubmitting(true);
    }, 4800);

    // 5.6s: Plan Created! -> Transition to Celebration / Confirmation
    addTimer(() => {
      setIsSubmitting(false);
      setStep("created_plan");
      hasEverCompletedCreatePlanAnimation = true;
      onCompleteRef.current?.();
    }, 5600);

    return () => {
      clearAllTimers();
    };
  }, []);

  const mockForm = useMemo(
    () => ({
      searchPeopleQuery,
      setSearchPeopleQuery,
      selectedFriends,
      setSelectedFriends,
      toggleFriendSelection: (friend: any) => {
        setSelectedFriends((prev) =>
          prev.some((f) => f.id === friend.id)
            ? prev.filter((f) => f.id !== friend.id)
            : [...prev, friend]
        );
      },
      waitlistEnabled,
      setWaitlistEnabled,
      totalCapacity,
      setTotalCapacity,
      totalInvitedCount: selectedFriends.length + (isHostSelected ? 1 : 0),
      handleRemoveSelectedItem: (item: any) => {
        setSelectedFriends((prev) => prev.filter((f) => f.id !== item.id));
      },
      AVAILABLE_FRIENDS: DEMO_FRIENDS_POOL,
      userProfile: DEMO_USER,
      activeUserId: "you",
      localTitle,
      setLocalTitle,
      localLocation,
      setLocalLocation,
      placeAddress,
      setPlaceAddress,
      setPlaceId: () => {},
      setLatitude: () => {},
      setLongitude: () => {},
      eventDateTime,
      setEventDateTime,
      isHostSelected,
      setIsHostSelected,
      priorityGuestIds,
      setPriorityGuestIds,
      waitlistMode,
      setWaitlistMode,
      costAmount,
      setCostAmount,
      isCostManuallySet,
      setIsCostManuallySet,
      isDateManuallySet,
      setIsDateManuallySet,
      customCoverImage: customPlanCover,
      setCustomPlanImages: () => {},
    }),
    [
      searchPeopleQuery,
      selectedFriends,
      waitlistEnabled,
      totalCapacity,
      isHostSelected,
      localTitle,
      localLocation,
      placeAddress,
      eventDateTime,
      priorityGuestIds,
      waitlistMode,
      costAmount,
      isCostManuallySet,
      isDateManuallySet,
    ]
  );

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      id="create_plan_animation_card"
      style={{ transform: "translate3d(0, 0, 0)" }}
      className={`w-full max-w-[340px] xs:max-w-[365px] sm:max-w-[395px] md:max-w-[425px] h-full max-h-[460px] xs:max-h-[500px] sm:max-h-[540px] md:max-h-[570px] mx-auto rounded-[28px] sm:rounded-[32px] bg-[#0A0A0C] border border-white/[0.12] shadow-2xl shadow-black/90 flex flex-col relative overflow-hidden select-none font-sans text-white ${className}`}
    >
      {/* Proportionally scaled content container: renders simulated app UI at authentic 1:1 mobile density */}
      <div
        id="create_plan_content_scaled_canvas"
        className="w-full h-full relative overflow-hidden shrink-0 pt-6 sm:pt-7 box-border"
        style={{
          width: "142.86%",
          height: "142.86%",
          transform: "scale(0.70)",
          transformOrigin: "top left",
        }}
      >
        <AnimatePresence mode="wait">
          {step === "select_people" && (
            <motion.div
              key="screen-select-people"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
              className="w-full h-full flex flex-col overflow-hidden relative"
            >
              <WhoIsComingScreen
                form={mockForm}
                selectedCategory="custom"
                selectedSubcategory={null}
                onBack={() => {}}
                onContinue={() => setStep("review_plan")}
                confirmLabel="Continue"
                headerTitle="Select friends"
                hideExitDialog={true}
              />
            </motion.div>
          )}

          {step === "review_plan" && (
            <motion.div
              key="screen-review-plan"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25 }}
              className="w-full h-full flex flex-col overflow-hidden relative"
            >
              <CreatePlanReview
                form={mockForm}
                selectedCategory="custom"
                selectedSubcategory={null}
                onBack={() => setStep("select_people")}
                onSubmit={() => {
                  setIsSubmitting(true);
                  setTimeout(() => {
                    setIsSubmitting(false);
                    setStep("created_plan");
                    hasEverCompletedCreatePlanAnimation = true;
                    onCompleteRef.current?.();
                  }, 800);
                }}
                isSubmitting={isSubmitting}
              />
            </motion.div>
          )}

          {step === "created_plan" && (
            <motion.div
              key="screen-created-plan"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full flex flex-col overflow-hidden relative"
            >
              <CreatePlanConfirmation
                onGoToPlans={() => onCompleteRef.current?.()}
                onCopyInviteLink={() => onCompleteRef.current?.()}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
