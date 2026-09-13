import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, HelpCircle, User } from "lucide-react";
import { UserProfile } from "../../../../core/types";
import defaultAvatar from "../../../../assets/default_avatar.png";
import { trackEvent } from "../../../../../lib/analytics";
import { supabase } from "../../../../../lib/supabaseClient";
import { resolveImage, ImageType } from "../../../../shared/imaging/imageResolver";
import { useProfileUpload } from "../../../profile/hooks/useProfileUpload";

import { Complicated, resetComplicatedAnimation } from "./Problem";
import { Solution } from "./Solution";
import { Planless } from "./Planless";
import { EmailVerification } from "./Emailverification";
import { resetPlanAnimation } from "../components/PlanAnimation";
import { OnboardingHeader } from "../components/OnboardingHeader";
import onboardingCups from "../../../../assets/Onboarding_cups.png";
import { preloadImage } from "../../../../shared/imaging/preloadImage";

interface OnboardingFlowProps {
  onComplete: (profile: UserProfile) => void;
  initialStep?: OnboardingStep;
  existingProfile?: UserProfile | null;
}

export type OnboardingStep = "ENTRY" | "LANDING" | "EMAIL_INPUT" | "OTP_INPUT" | "PROFILE_SETUP";

export const ONBOARDING_SCREEN_KEY = "planless_onboarding_screen";
export type PersistedOnboardingScreen = "planless" | "complicated" | "solution" | "login";

function getInitialOnboardingState(initialStep: OnboardingStep): {
  step: OnboardingStep;
  onboardingIndex: number;
  authSource: "ENTRY" | "LANDING";
} {
  if (initialStep === "PROFILE_SETUP") {
    return {
      step: "PROFILE_SETUP",
      onboardingIndex: 0,
      authSource: "ENTRY",
    };
  }

  // Clear any stale persisted screen so logged-out flow always starts at Planless welcome page
  try {
    localStorage.removeItem(ONBOARDING_SCREEN_KEY);
  } catch {}

  return {
    step: "ENTRY",
    onboardingIndex: 0,
    authSource: "ENTRY",
  };
}

export function OnboardingFlow({ onComplete, initialStep = "ENTRY", existingProfile = null }: OnboardingFlowProps) {
  const [initialState] = useState(() => getInitialOnboardingState(initialStep));
  const [step, setStep] = useState<OnboardingStep>(initialState.step);
  const [authSource, setAuthSource] = useState<"ENTRY" | "LANDING">(initialState.authSource);
  const [onboardingIndex, setOnboardingIndex] = useState(initialState.onboardingIndex);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const isNavigatingRef = useRef(false);
  const [profileName, setProfileName] = useState(existingProfile?.name || "");
  const [bio, setBio] = useState(existingProfile?.bio || "");
  const [avatar, setAvatar] = useState(
    existingProfile?.avatar === defaultAvatar ? "" : (existingProfile?.avatar || "")
  );
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [checkingUser, setCheckingUser] = useState(false);
  const [userEmail, setUserEmail] = useState<string>(existingProfile?.phone || "");
  const [tempUserId, setTempUserId] = useState<string | null>(existingProfile?.dbUuid || null);
  const [tempPublicId, setTempPublicId] = useState<string | null>(existingProfile?.user_id || null);
  const [sessionToken, setSessionToken] = useState<string | null>(existingProfile?.token || null);

  const { uploading: uploadImageInProgress, uploadError, uploadImage } = useProfileUpload();

  const persistScreen = (screen: PersistedOnboardingScreen) => {
    try {
      if (screen === "planless") {
        localStorage.removeItem(ONBOARDING_SCREEN_KEY);
      } else {
        localStorage.setItem(ONBOARDING_SCREEN_KEY, screen);
      }
    } catch (err) {
      console.warn("[Onboarding] Failed to persist screen:", err);
    }
  };

  // Keep saved onboarding step synced with current screen across all transitions
  useEffect(() => {
    if (step === "ENTRY") {
      persistScreen("planless");
    } else if (step === "LANDING") {
      if (onboardingIndex === 0) {
        persistScreen("complicated");
      } else if (onboardingIndex === 1) {
        persistScreen("solution");
      }
    } else if (step === "EMAIL_INPUT" || step === "OTP_INPUT") {
      persistScreen("login");
    }
  }, [step, onboardingIndex]);

  // Background prefetch: ensure onboarding illustration is cached before reaching EMAIL_INPUT
  useEffect(() => {
    if (step === "ENTRY" || step === "LANDING") {
      preloadImage(onboardingCups);
    }
  }, [step]);

  // Handlers for Planless entry screen
  const handleStart = () => {
    // Eagerly prefetch and decode one-time onboarding illustration in background while animations play
    preloadImage(onboardingCups);
    persistScreen("complicated");
    setAuthSource("LANDING");
    setOnboardingIndex(0);
    setErrorMessage("");
    setStep("LANDING");
  };

  const handleAlreadyHaveAccount = () => {
    preloadImage(onboardingCups);
    persistScreen("login");
    setAuthSource("ENTRY");
    setErrorMessage("");
    setStep("EMAIL_INPUT");
  };

  useEffect(() => {
    if (initialStep === "PROFILE_SETUP") {
      setStep("PROFILE_SETUP");
    }
  }, [initialStep]);

  useEffect(() => {
    if (existingProfile) {
      if (existingProfile.dbUuid) setTempUserId(existingProfile.dbUuid);
      if (existingProfile.user_id) setTempPublicId(existingProfile.user_id);
      if (existingProfile.token) setSessionToken(existingProfile.token);
      if (existingProfile.name) setProfileName(existingProfile.name);
      if (existingProfile.bio) setBio(existingProfile.bio);
      if (existingProfile.avatar && existingProfile.avatar !== defaultAvatar) {
        setAvatar(existingProfile.avatar);
      }
    }
  }, [existingProfile]);


  // Keyboard navigation for onboarding screens (0: Complicated, 1: Solution)
  useEffect(() => {
    if (step !== "LANDING") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        if (onboardingIndex < 1) setOnboardingIndex((prev) => prev + 1);
      } else if (e.key === "ArrowLeft") {
        if (onboardingIndex > 0) {
          setOnboardingIndex((prev) => prev - 1);
        } else if (onboardingIndex === 0) {
          setStep("ENTRY");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step, onboardingIndex]);

  const handleComplicatedNext = () => {
    persistScreen("solution");
    setOnboardingIndex(1);
  };

  const handleSolutionNext = () => {
    persistScreen("login");
    setAuthSource("LANDING");
    setErrorMessage("");
    setStep("EMAIL_INPUT");
  };

  const handleEmailBack = () => {
    persistScreen("solution");
    setErrorMessage("");
    setOnboardingIndex(1);
    setStep("LANDING");
  };

  // Touch handlers for swipe navigation across onboarding screens
  const handleTouchStart = (e: React.TouchEvent) => {
    // Strictly disable swiping on OTP, EMAIL, and ENTRY (or any non-onboarding screen)
    if (step === "EMAIL_INPUT" || step === "OTP_INPUT" || step === "ENTRY" || step === "PROFILE_SETUP") return;

    if (e.touches && e.touches.length === 1) {
      setTouchStartX(e.touches[0].clientX);
      setTouchStartY(e.touches[0].clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;
    if (step === "EMAIL_INPUT" || step === "OTP_INPUT" || step === "ENTRY" || step === "PROFILE_SETUP") {
      setTouchStartX(null);
      setTouchStartY(null);
      return;
    }

    if (isNavigatingRef.current) {
      setTouchStartX(null);
      setTouchStartY(null);
      return;
    }

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;

    setTouchStartX(null);
    setTouchStartY(null);

    // Require intentional horizontal movement: diffX >= 48px and at least 1.5x larger than vertical diffY
    if (Math.abs(diffX) < 48 || Math.abs(diffX) < Math.abs(diffY) * 1.5) {
      return;
    }

    const triggerTransition = (action: () => void) => {
      isNavigatingRef.current = true;
      action();
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 500);
    };

    if (step === "LANDING") {
      if (onboardingIndex === 0) {
        // complicated.tsx
        if (diffX > 0) {
          // Swipe LEFT -> solution.tsx
          triggerTransition(() => handleComplicatedNext());
        } else {
          // Swipe RIGHT -> previous allowed state (Planless.tsx)
          triggerTransition(() => {
            persistScreen("planless");
            setStep("ENTRY");
          });
        }
      } else if (onboardingIndex === 1) {
        // solution.tsx
        if (diffX > 0) {
          // Swipe LEFT -> onboarding email screen
          triggerTransition(() => handleSolutionNext());
        } else {
          // Swipe RIGHT -> complicated.tsx
          triggerTransition(() => {
            persistScreen("complicated");
            setOnboardingIndex(0);
          });
        }
      }
    }
  };

  // Handle Profile Submission (complete the profile details)
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) {
      setErrorMessage("Please enter your name");
      return;
    }
    if (!tempUserId) {
      setErrorMessage("Session expired. Please start over.");
      return;
    }
    if (uploadImageInProgress) {
      setErrorMessage("Please wait for your profile photo to finish uploading.");
      return;
    }

    setErrorMessage("");
    setCheckingUser(true);

    try {
      const payload = {
        full_name: profileName.trim(),
        bio: bio.trim(),
        profile_photo_path: avatar || null,
        profile_completed: true
      };

      // Update the authenticated user's row in public.users using id = session.user.id
      const { data: updatedProfile, error: updateError } = await supabase
        .from("users")
        .update(payload)
        .eq("id", tempUserId)
        .select("*")
        .single();

      if (updateError || !updatedProfile) {
        setErrorMessage(updateError?.message || "Failed to save profile. Please try again.");
        return;
      }

      // Track user signup analytics event
      trackEvent("user_signed_up", { source: "app" });

      try {
        localStorage.removeItem(ONBOARDING_SCREEN_KEY);
      } catch {}

      onComplete({
        name: updatedProfile.full_name,
        phone: userEmail || existingProfile?.phone || "",
        bio: updatedProfile.bio || "",
        avatar: updatedProfile.profile_photo_path || defaultAvatar,
        joined: true,
        college_or_work: "SRM Chennai",
        user_id: updatedProfile.public_id,
        dbUuid: updatedProfile.id,
        token: sessionToken || "",
        profile_completed: true
      });
    } catch (err) {
      console.warn("[Onboarding] Profile save exception:", err);
      setErrorMessage("Unable to save profile details. Please try again.");
    } finally {
      setCheckingUser(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && tempUserId) {
      // Local preview immediately (only inside component state)
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setLocalPreviewUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);

      // Perform background upload
      const storagePath = await uploadImage(file, tempUserId);
      if (storagePath) {
        setAvatar(storagePath);
      } else {
        setErrorMessage("Image upload failed. Please try a different file.");
        setLocalPreviewUrl(null);
      }
    }
  };

  return (
    <div
      id="onboarding_wrapper"
      className="w-full h-full text-white bg-[#000000] flex flex-col justify-between font-sans relative overflow-hidden"
    >
      {/* Shared Onboarding Header: persistent & visually stable across all onboarding screens after ENTRY */}
      {step !== "ENTRY" && <OnboardingHeader />}

      {/* Main Form/Content Section */}
      <div
        id="onboarding_main"
        className={`flex-1 flex flex-col z-10 w-full ${
          step === "EMAIL_INPUT" || step === "OTP_INPUT"
            ? "justify-start items-center w-full min-h-0 overflow-hidden select-none"
            : step === "LANDING" || step === "ENTRY"
              ? "justify-between w-full min-h-0 overflow-hidden"
              : step === "PROFILE_SETUP"
                ? "justify-center my-auto max-w-sm mx-auto py-4 sm:py-6 p-6 md:p-8"
                : "justify-start pt-8 sm:pt-12 md:pt-16 max-w-sm mx-auto px-6 sm:px-8 pb-8 overflow-y-auto"
        }`}
      >

        {/* 1. ENTRY STEP: WELCOME SCREEN (PLANLESS, LOGO, GET STARTED, ALREADY HAVE AN ACCOUNT) */}
        {step === "ENTRY" && (
          <Planless
            onGetStarted={handleStart}
            onLogin={handleAlreadyHaveAccount}
          />
        )}

        {/* 2. LANDING STEP: 2-SCREEN ONBOARDING FLOW (COMPLICATED -> SOLUTION -> LOGIN) */}
        {step === "LANDING" && (
          <motion.div
            key={`landing_step_${onboardingIndex}`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full h-full flex flex-col justify-between"
          >
            {onboardingIndex === 0 ? (
              <Complicated
                onGetStarted={handleComplicatedNext}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              />
            ) : (
              <Solution
                onGetStarted={handleSolutionNext}
                onBack={() => setOnboardingIndex(0)}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              />
            )}
          </motion.div>
        )}
        {/* EMAIL & OTP VERIFICATION STEP */}
        {(step === "EMAIL_INPUT" || step === "OTP_INPUT") && (
          <EmailVerification
            onComplete={onComplete}
            onProfileSetup={({ tempUserId, tempPublicId, sessionToken, email }) => {
              setTempUserId(tempUserId);
              setTempPublicId(tempPublicId);
              setSessionToken(sessionToken);
              if (email) setUserEmail(email);
              setErrorMessage("");
              setStep("PROFILE_SETUP");
            }}
            onBack={handleEmailBack}
            initialSubStep={step === "OTP_INPUT" ? "OTP" : "EMAIL"}
          />
        )}

        {/* PROFILE SETUP */}
        {step === "PROFILE_SETUP" && (
          <motion.div
            key="profile_setup_step"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full h-full"
          >
            <div id="step_profile" className="flex flex-col items-center justify-between h-full py-2 space-y-6 text-left">

              {/* Circle Photo Selector */}
              <div className="relative flex flex-col items-center justify-center select-none">
                <div
                  onClick={() => !uploadImageInProgress && document.getElementById("profile_avatar_upload_input")?.click()}
                  className={`w-28 h-28 rounded-full border border-white/[0.08] bg-zinc-950 p-[3px] shadow-2xl relative transition ${uploadImageInProgress ? "opacity-70 cursor-wait" : "cursor-pointer active:scale-95 hover:border-white/20"}`}
                >
                  <div className="w-full h-full bg-[#111111] rounded-full overflow-hidden flex items-center justify-center relative">
                    {(localPreviewUrl || avatar) ? (
                      <img
                        src={localPreviewUrl || resolveImage(avatar, ImageType.Avatar)}
                        className="w-full h-full object-cover rounded-full transition-opacity duration-300"
                        alt="Avatar Preview"
                      />
                    ) : (
                      <User className="w-10 h-10 text-zinc-650" />
                    )}
                    {uploadImageInProgress && (
                      <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>

                  {!uploadImageInProgress && (
                    <div className="absolute bottom-1.5 right-1.5 w-6 h-6 bg-white rounded-full flex items-center justify-center border-2 border-[#000000] shadow cursor-pointer">
                      <span className="text-black text-xs font-bold leading-none">+</span>
                    </div>
                  )}
                </div>

                <input
                  id="profile_avatar_upload_input"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {uploadError && (
                  <p className="text-xs text-red-500 mt-2 text-center">{uploadError}</p>
                )}
              </div>

              {/* Title & Subtitle */}
              <div className="text-center space-y-1.5">
                <h2 className="text-[26px] font-sans font-bold text-white tracking-tight leading-tight">
                  Set up your profile
                </h2>
                <p className="text-zinc-400 text-xs">
                  This is how people will see you in plans
                </p>
              </div>

              {/* Inputs & Form */}
              <form onSubmit={handleProfileSubmit} className="w-full space-y-4 pt-2">
                <div className="space-y-3">
                  <input
                    id="profile_name_input"
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-[#111111] border border-white/[0.08] focus:border-[#FFFFFF]/30 text-white rounded-xl py-3.5 px-4 text-sm text-left focus:outline-none transition"
                    required
                  />

                  <input
                    id="profile_bio_input"
                    type="text"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Bio (e.g. Always spontaneous)"
                    className="w-full bg-[#111111] border border-white/[0.08] focus:border-[#FFFFFF]/30 text-white rounded-xl py-3.5 px-4 text-sm text-left focus:outline-none transition"
                  />
                </div>

                {errorMessage && (
                  <p className="text-xs text-red-500 text-center mt-2">{errorMessage}</p>
                )}

                <div className="pt-8">
                  <button
                    id="complete_onboarding_btn"
                    type="submit"
                    disabled={checkingUser}
                    className="w-full py-3.5 px-6 rounded-xl bg-white hover:bg-zinc-150 text-black font-semibold text-xs tracking-wider uppercase transition active:scale-[0.99] text-center cursor-pointer disabled:opacity-50"
                  >
                    {checkingUser ? "Saving..." : "Continue"}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}

      </div>
    </div>
  );
}
