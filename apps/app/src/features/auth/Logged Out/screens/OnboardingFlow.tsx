import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UserProfile } from "../../../../core/types";
import defaultAvatar from "../../../../assets/default_avatar.webp";
import { trackEvent } from "../../../../../lib/analytics";
import { supabase } from "../../../../../lib/supabaseClient";
import { resolveImage, ImageType } from "../../../../shared/imaging/imageResolver";
import { useProfileUpload } from "../../../profile/hooks/useProfileUpload";


import { Complicated, resetComplicatedAnimation } from "./Problem";
import { Solution } from "./Solution";
import { CreatePlanOnboarding } from "./CreatePlanOnboarding";
import { JoinPlanOnboarding } from "./JoinPlanOnboarding";
import { Planless } from "./Planless";
import { EmailVerification } from "./Emailverification";
import { resetPlanAnimation } from "../components/PlanAnimation";
import { resetCreatePlanAnimation } from "../components/CreatePlanAnimation";
import { resetJoinPlanAnimation } from "../components/JoinPlanAnimation";
import { OnboardingHeader } from "../components/OnboardingHeader";
import onboardingCups from "../../../../assets/Onboarding_cups.webp";
import { preloadImage } from "../../../../shared/imaging/preloadImage";


interface OnboardingFlowProps {
  onComplete: (profile: UserProfile) => void;
  initialStep?: OnboardingStep;
  existingProfile?: UserProfile | null;
}

export type OnboardingStep = "ENTRY" | "LANDING" | "EMAIL_INPUT" | "OTP_INPUT" | "PROFILE_SETUP";

export const ONBOARDING_SCREEN_KEY = "planless_onboarding_screen";
export type PersistedOnboardingScreen = "planless" | "complicated" | "solution" | "create_plan" | "join_plan" | "login";

export const MAX_NAME_LENGTH = 30;
export const MAX_ABOUT_LENGTH = 140;
export const MAX_BIO_LENGTH = MAX_ABOUT_LENGTH;

export function validateProfileName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Name is required";
  }
  if (name.length > MAX_NAME_LENGTH) {
    return `Name must be ${MAX_NAME_LENGTH} characters or fewer`;
  }
  return null;
}

export function validateProfileAbout(about: string): string | null {
  const trimmed = about.trim();
  if (!trimmed) {
    return "About is required";
  }
  if (about.length > MAX_ABOUT_LENGTH) {
    return `About must be ${MAX_ABOUT_LENGTH} characters or fewer`;
  }
  return null;
}

export const validateProfileBio = validateProfileAbout;

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
  const [nameTouched, setNameTouched] = useState(false);
  const [bioTouched, setBioTouched] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const nameValidationError = validateProfileName(profileName);
  const bioValidationError = validateProfileBio(bio);

  const isNameValid = nameValidationError === null;
  const isBioValid = bioValidationError === null;
  const isFormValid = isNameValid && isBioValid;

  const showNameError = Boolean((nameTouched || hasAttemptedSubmit) && nameValidationError);
  const showBioError = Boolean(
    (bioTouched || hasAttemptedSubmit || (nameTouched && isNameValid)) && bioValidationError
  );

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
      } else if (onboardingIndex === 2) {
        persistScreen("create_plan");
      } else if (onboardingIndex === 3) {
        persistScreen("join_plan");
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
    // Eagerly prefetch and decode one-time onboarding illustration in background
    preloadImage(onboardingCups);
    persistScreen("login");
    setAuthSource("ENTRY");
    setErrorMessage("");
    setStep("EMAIL_INPUT");
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


  // Keyboard navigation for onboarding screens (0: Complicated, 1: Solution, 2: CreatePlan, 3: JoinPlan)
  useEffect(() => {
    if (step !== "LANDING") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        if (onboardingIndex < 3) {
          if (onboardingIndex === 2) resetJoinPlanAnimation();
          setOnboardingIndex((prev) => prev + 1);
        }
      } else if (e.key === "ArrowLeft") {
        if (onboardingIndex > 0) {
          if (onboardingIndex === 3) {
            resetJoinPlanAnimation();
            resetCreatePlanAnimation();
          }
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
    resetCreatePlanAnimation();
    persistScreen("create_plan");
    setOnboardingIndex(2);
  };

  const handleCreatePlanNext = () => {
    resetJoinPlanAnimation();
    persistScreen("join_plan");
    setOnboardingIndex(3);
  };

  const handleJoinPlanNext = () => {
    persistScreen("login");
    setAuthSource("LANDING");
    setErrorMessage("");
    setStep("EMAIL_INPUT");
  };

  const handleEmailBack = () => {
    if (authSource === "ENTRY") {
      persistScreen("planless");
      setErrorMessage("");
      setStep("ENTRY");
      return;
    }
    resetJoinPlanAnimation();
    persistScreen("join_plan");
    setErrorMessage("");
    setOnboardingIndex(3);
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
          // Swipe LEFT -> create_plan
          triggerTransition(() => handleSolutionNext());
        } else {
          // Swipe RIGHT -> complicated.tsx
          triggerTransition(() => {
            persistScreen("complicated");
            setOnboardingIndex(0);
          });
        }
      } else if (onboardingIndex === 2) {
        // create_plan
        if (diffX > 0) {
          // Swipe LEFT -> join_plan
          triggerTransition(() => handleCreatePlanNext());
        } else {
          // Swipe RIGHT -> solution.tsx
          triggerTransition(() => {
            persistScreen("solution");
            setOnboardingIndex(1);
          });
        }
      } else if (onboardingIndex === 3) {
        // join_plan
        if (diffX > 0) {
          // Swipe LEFT -> onboarding email screen
          triggerTransition(() => handleJoinPlanNext());
        } else {
          // Swipe RIGHT -> create_plan: reset animation so it replays from start
          triggerTransition(() => {
            resetJoinPlanAnimation();
            resetCreatePlanAnimation();
            persistScreen("create_plan");
            setOnboardingIndex(2);
          });
        }
      }
    }
  };

  // Handle Profile Submission (complete the profile details)
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    setNameTouched(true);
    setBioTouched(true);

    const nameErr = validateProfileName(profileName);
    if (nameErr) {
      setErrorMessage(nameErr);
      return;
    }
    const bioErr = validateProfileBio(bio);
    if (bioErr) {
      setErrorMessage(bioErr);
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
    if (checkingUser) {
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
          step === "EMAIL_INPUT" || step === "OTP_INPUT" || step === "PROFILE_SETUP"
            ? "justify-start items-center w-full min-h-0 overflow-hidden"
            : step === "LANDING"
              ? "justify-between w-full min-h-0 overflow-hidden"
              : step === "ENTRY"
                ? "w-full h-full min-h-0 overflow-y-auto"
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

        {/* 2. LANDING STEP: 4-SCREEN ONBOARDING FLOW */}
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
            ) : onboardingIndex === 1 ? (
              <Solution
                onGetStarted={handleSolutionNext}
                onBack={() => setOnboardingIndex(0)}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              />
            ) : onboardingIndex === 2 ? (
              <CreatePlanOnboarding
                onGetStarted={handleCreatePlanNext}
                onBack={() => setOnboardingIndex(1)}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              />
            ) : (
              <JoinPlanOnboarding
                onGetStarted={handleJoinPlanNext}
                onBack={() => setOnboardingIndex(2)}
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
            onProfileSetup={({ tempUserId, tempPublicId, sessionToken, email, initialName, initialAvatar }) => {
              setTempUserId(tempUserId);
              setTempPublicId(tempPublicId);
              setSessionToken(sessionToken);
              if (email) setUserEmail(email);
              if (initialName) setProfileName(initialName);
              if (initialAvatar) setAvatar(initialAvatar);
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
            className="w-full h-full flex flex-col justify-between"
          >
            <form
              id="step_profile"
              onSubmit={handleProfileSubmit}
              noValidate
              className="w-full h-full flex flex-col justify-between max-w-sm mx-auto px-6 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              {/* Upper Section: Avatar, Heading, Form Inputs (Cohesively grouped and moved upward) */}
              <div className="flex-1 w-full min-h-0 overflow-y-auto no-scrollbar flex flex-col items-center pt-1">
                {/* Circle Photo Selector */}
                <div className="relative flex flex-col items-center justify-center select-none shrink-0">
                  <div
                    onClick={() => !uploadImageInProgress && document.getElementById("profile_avatar_upload_input")?.click()}
                    className={`w-28 h-28 rounded-full border border-white/[0.08] bg-zinc-950 p-[3px] shadow-2xl relative transition ${uploadImageInProgress ? "opacity-70 cursor-wait" : "cursor-pointer active:scale-95 hover:border-white/20"}`}
                  >
                    <div className="w-full h-full bg-[#111111] rounded-full overflow-hidden flex items-center justify-center relative">
                      <img
                        id="profile_avatar_image"
                        src={localPreviewUrl || (avatar ? resolveImage(avatar, ImageType.Avatar) : defaultAvatar)}
                        className="w-full h-full object-cover rounded-full transition-opacity duration-300"
                        alt="Profile Photo"
                      />
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

                {/* Heading: Set Up Your Profile */}
                <div className="text-center mt-3.5 mb-4 shrink-0">
                  <h2 className="text-[26px] font-sans font-bold text-white tracking-tight leading-tight">
                    Set Up Your Profile
                  </h2>
                </div>

                {/* Inputs & Form Fields */}
                <div className="w-full space-y-3 shrink-0">
                  <div>
                    <input
                      id="profile_name_input"
                      type="text"
                      value={profileName}
                      onChange={(e) => {
                        setProfileName(e.target.value);
                        setNameTouched(true);
                      }}
                      onBlur={() => setNameTouched(true)}
                      placeholder="Enter your name"
                      aria-label="Name"
                      className={`w-full bg-[#111111] border ${
                        showNameError
                          ? "border-red-500/70 focus:border-red-500"
                          : "border-white/[0.08] focus:border-[#FFFFFF]/30"
                      } text-white rounded-xl py-3.5 px-4 text-sm text-left focus:outline-none transition`}
                    />
                    {showNameError && (
                      <p
                        id="profile_name_error"
                        className="text-xs text-red-500 mt-1.5 px-1 text-left"
                      >
                        {nameValidationError}
                      </p>
                    )}
                  </div>

                  <div>
                    <input
                      id="profile_about_input"
                      name="about"
                      type="text"
                      value={bio}
                      onChange={(e) => {
                        setBio(e.target.value);
                        setBioTouched(true);
                      }}
                      onBlur={() => setBioTouched(true)}
                      placeholder="Enter About"
                      aria-label="About"
                      className={`w-full bg-[#111111] border ${
                        showBioError
                          ? "border-red-500/70 focus:border-red-500"
                          : "border-white/[0.08] focus:border-[#FFFFFF]/30"
                      } text-white rounded-xl py-3.5 px-4 text-sm text-left focus:outline-none transition`}
                    />
                    {showBioError && (
                      <p
                        id="profile_about_error"
                        className="text-xs text-red-500 mt-1.5 px-1 text-left"
                      >
                        {bioValidationError}
                      </p>
                    )}
                  </div>
                </div>

                {errorMessage && (
                  <p id="profile_form_error" className="text-xs text-red-500 text-center mt-2 shrink-0">
                    {errorMessage}
                  </p>
                )}
              </div>

              {/* Bottom Section: Primary CTA anchored at bottom above safe-area inset */}
              <div className="w-full shrink-0 pt-3">
                <button
                  id="complete_onboarding_btn"
                  type="submit"
                  disabled={!isFormValid || checkingUser || uploadImageInProgress}
                  className="w-full py-3.5 px-6 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:bg-[#E55A1F] text-white font-semibold text-sm tracking-wide transition active:scale-[0.99] text-center cursor-pointer shadow-md shadow-[#FF6B2C]/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none flex items-center justify-center"
                >
                  {checkingUser ? "Creating Profile..." : "Create Profile"}
                </button>
              </div>
            </form>
          </motion.div>
        )}

      </div>
    </div>
  );
}
