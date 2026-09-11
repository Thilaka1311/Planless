import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, HelpCircle, User } from "lucide-react";
import { UserProfile } from "../../../../core/types";
import defaultAvatar from "../../../../assets/default_avatar.png";
import { trackEvent } from "../../../../../lib/analytics";
import { supabase } from "../../../../../lib/supabaseClient";
import { resolveImage, ImageType } from "../../../../shared/imaging/imageResolver";
import { useProfileUpload } from "../../../profile/hooks/useProfileUpload";

import { Complicated, resetComplicatedAnimation } from "./Complicated";
import { Solution } from "./solution";
import { Planless } from "./Planless";
import { resetPlanAnimation } from "../components/PlanAnimation";
import planlessLogo from "../../../../assets/planless_logo.png";

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

  try {
    const saved = localStorage.getItem(ONBOARDING_SCREEN_KEY);
    if (saved === "complicated") {
      return {
        step: "LANDING",
        onboardingIndex: 0,
        authSource: "ENTRY",
      };
    }
    if (saved === "solution") {
      return {
        step: "LANDING",
        onboardingIndex: 1,
        authSource: "LANDING",
      };
    }
    if (saved === "login" || saved === "email") {
      return {
        step: "EMAIL_INPUT",
        onboardingIndex: 0,
        authSource: "ENTRY",
      };
    }
  } catch (err) {
    console.warn("[Onboarding] Failed to read saved onboarding step:", err);
  }

  return {
    step: initialStep,
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
  const [email, setEmail] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [profileName, setProfileName] = useState(existingProfile?.name || "");
  const [bio, setBio] = useState(existingProfile?.bio || "");
  const [avatar, setAvatar] = useState(
    existingProfile?.avatar === defaultAvatar ? "" : (existingProfile?.avatar || "")
  );
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [checkingUser, setCheckingUser] = useState(false);
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

  // Handlers for Planless entry screen
  const handleStart = () => {
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

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleViewportChange = () => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
      if (window.visualViewport) {
        const vv = window.visualViewport;
        const kbHeight = Math.max(0, window.innerHeight - vv.height);
        const isKeyboardActive = kbHeight > 120;
        setKeyboardOpen(isKeyboardActive);
        setKeyboardHeight(isKeyboardActive ? kbHeight : 0);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportChange);
      window.visualViewport.addEventListener("scroll", handleViewportChange);
    }
    window.addEventListener("resize", handleViewportChange);
    handleViewportChange();

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportChange);
        window.visualViewport.removeEventListener("scroll", handleViewportChange);
      }
      window.removeEventListener("resize", handleViewportChange);
    };
  }, []);

  // Prevent any window scrolling / bouncing when keyboard opens on email input
  useEffect(() => {
    if (step !== "EMAIL_INPUT") return;
    const preventScroll = () => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener("scroll", preventScroll, { passive: true });
    return () => window.removeEventListener("scroll", preventScroll);
  }, [step]);

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

  // Touch handlers for swipe navigation across onboarding screens
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchStartX - touchEndX;
    if (diffX > 50) {
      if (onboardingIndex < 1) {
        setOnboardingIndex((prev) => prev + 1);
      }
    } else if (diffX < -50) {
      if (onboardingIndex > 0) {
        setOnboardingIndex((prev) => prev - 1);
      } else if (onboardingIndex === 0) {
        setStep("ENTRY");
      }
    }
    setTouchStartX(null);
  };

  const handleComplicatedNext = () => {
    persistScreen("solution");
    setOnboardingIndex(1);
  };

  const handleSolutionNext = () => {
    persistScreen("login");
    setAuthSource("LANDING");
    setAuthMode("login");
    setErrorMessage("");
    setStep("EMAIL_INPUT");
  };


  // Handle Email submission (sends OTP)
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setErrorMessage("Enter a valid email address");
      return;
    }

    setErrorMessage("");
    setCheckingUser(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        console.error(error);
        setErrorMessage(error.message || "Failed to send OTP. Please try again.");
        return;
      }

      setStep("OTP_INPUT");
    } catch (err) {
      console.warn("[Onboarding] Email OTP error:", err);
      setErrorMessage("Unable to send OTP. Please try again.");
    } finally {
      setCheckingUser(false);
    }
  };

  // Handle OTP Verification and canonical public.users creation/routing
  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpToken.trim() || otpToken.trim().length < 6) {
      setErrorMessage("Enter a valid 6-digit OTP code");
      return;
    }

    setErrorMessage("");
    setCheckingUser(true);

    try {
      const { data: { session }, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpToken.trim(),
        type: 'email'
      });

      if (error || !session) {
        setErrorMessage(error?.message || "Invalid or expired OTP. Please try again.");
        setCheckingUser(false);
        return;
      }

      const authUser = session.user;

      // Canonical check: Does this authenticated user already have a completed Planless profile?
      const { data: dbProfile, error: profileError } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();

      if (profileError) {
        console.error("[Onboarding] Error checking profile status:", profileError);
      }

      if (dbProfile && dbProfile.profile_completed) {
        // EXISTING USER: Directly enter normal Planless app flow without onboarding
        try {
          localStorage.removeItem(ONBOARDING_SCREEN_KEY);
        } catch {}

        onComplete({
          name: dbProfile.full_name,
          phone: authUser.email || "",
          bio: dbProfile.bio || "",
          avatar: dbProfile.profile_photo_path || defaultAvatar,
          joined: true,
          college_or_work: "SRM Chennai",
          user_id: dbProfile.public_id,
          dbUuid: dbProfile.id,
          token: session.access_token,
          profile_completed: true,
          role: dbProfile.role || "user",
        });
      } else {
        // NEW USER (or profile incomplete): ensure user row exists and route to profile setup
        let publicId = dbProfile?.public_id;
        if (!dbProfile) {
          const { data: generatedId } = await supabase.rpc("generate_user_public_id");
          publicId = generatedId;
          const { data: newProfile } = await supabase
            .from("users")
            .upsert({
              id: authUser.id,
              public_id: publicId,
              full_name: "",
              profile_photo_path: null,
              bio: "",
              profile_completed: false
            }, { onConflict: "id", ignoreDuplicates: true })
            .select("*")
            .single();
          if (newProfile?.public_id) {
            publicId = newProfile.public_id;
          }
        }

        setTempUserId(authUser.id);
        setTempPublicId(publicId || null);
        setSessionToken(session.access_token);
        setErrorMessage("");
        setStep("PROFILE_SETUP");
      }
    } catch (err) {
      console.warn("[Onboarding] OTP verification exception:", err);
      setErrorMessage("Unable to verify OTP. Please try again.");
    } finally {
      setCheckingUser(false);
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
        phone: email || existingProfile?.phone || "",
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
    <div id="onboarding_wrapper" className="w-full h-full text-white bg-[#000000] flex flex-col justify-between font-sans relative overflow-hidden">
      {/* Header bar */}
      {step !== "LANDING" && step !== "ENTRY" && step !== "EMAIL_INPUT" && (
        <div id="onboarding_header" className="flex items-center justify-between w-full h-12 shrink-0 z-10 px-5 sm:px-8 pt-4 pb-2">
          {step !== "PROFILE_SETUP" ? (
            <button
              id="back_btn"
              onClick={() => {
                if (step === "OTP_INPUT") {
                  setStep("EMAIL_INPUT");
                }
              }}
              className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-white transition-colors active:scale-95 cursor-pointer"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 stroke-[1.75]" />
            </button>
          ) : (
            <div className="w-9 h-9" />
          )}

          <div className="flex items-center justify-center select-none pointer-events-none">
            <img
              src={planlessLogo}
              alt="Planless"
              className="w-8 h-8 object-contain"
            />
          </div>

          <button
            id="help_btn"
            className="w-9 h-9 flex items-center justify-center text-zinc-400/80 hover:text-zinc-200 transition-colors active:scale-95 cursor-pointer"
            aria-label="Help"
          >
            <HelpCircle className="w-5 h-5 stroke-[1.75]" />
          </button>
        </div>
      )}

      {/* Main Form/Content Section */}
      <div
        id="onboarding_main"
        className={`flex-1 flex flex-col z-10 w-full ${
          step === "EMAIL_INPUT"
            ? "justify-start items-center w-full min-h-0 overflow-hidden select-none"
            : step !== "LANDING" && step !== "ENTRY"
              ? step === "PROFILE_SETUP"
                ? "justify-center my-auto max-w-sm mx-auto py-4 sm:py-6 p-6 md:p-8"
                : "justify-start pt-8 sm:pt-12 md:pt-16 max-w-sm mx-auto px-6 sm:px-8 pb-8 overflow-y-auto"
              : "justify-center my-auto h-full"
        }`}
      >

        {/* 1. ENTRY STEP: WELCOME SCREEN (PLANLESS, LOGO, GET STARTED) */}
        {step === "ENTRY" && (
          <Planless
            onGetStarted={handleStart}
          />
        )}

        {/* 2. LANDING STEP: 2-SCREEN ONBOARDING FLOW (COMPLICATED -> SOLUTION -> LOGIN) */}
        {step === "LANDING" && (
          onboardingIndex === 0 ? (
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
          )
        )}

        {/* EMAIL SIGN IN STEP */}
        {step === "EMAIL_INPUT" && (
          <form
            id="step_email_form"
            onSubmit={handleEmailSubmit}
            className="w-full h-full flex flex-col items-center select-none overflow-hidden"
          >
            {/* Layer 1: Fixed Authentication Content */}
            <div
              className="w-full max-w-sm mx-auto px-6 sm:px-8 pt-[7vh] xs:pt-[9vh] sm:pt-[11vh] space-y-6 sm:space-y-7 text-left select-text"
            >
              {/* Centered Planless Symbol */}
              <div className="flex justify-center select-none pointer-events-none">
                <img
                  src={planlessLogo}
                  alt="Planless"
                  className="w-11 h-11 sm:w-12 sm:h-12 object-contain"
                />
              </div>

              {/* Title & Subtitle */}
              <div className="space-y-1.5 sm:space-y-2">
                <h2 className="text-[26px] sm:text-[30px] font-sans font-bold text-white tracking-tight leading-tight">
                  Welcome to Planless
                </h2>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Enter your email address to continue.
                </p>
              </div>

              {/* Email Input Field & Explanation (no EMAIL ADDRESS label) */}
              <div className="space-y-2.5 pt-0.5">
                <input
                  id="email_input_field"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full h-[50px] bg-[#121214] border border-white/[0.08] focus:border-[#FF6B2C] rounded-[14px] px-4 text-base text-white placeholder-zinc-600 focus:outline-none transition-colors duration-150"
                  required
                />
                {errorMessage && (
                  <p className="text-xs text-red-500 font-sans">{errorMessage}</p>
                )}
                <p className="text-xs text-zinc-500 leading-relaxed">
                  We'll send you a one-time code to continue.
                </p>
              </div>
            </div>

            {/* Layer 2: Next Button - Resting state (keyboard closed) */}
            <div
              className={`fixed bottom-0 left-0 right-0 z-20 flex justify-center pb-[max(1.75rem,env(safe-area-inset-bottom))] transition-opacity duration-150 ease-out ${
                keyboardOpen ? "opacity-0 pointer-events-none" : "opacity-100 pointer-events-auto"
              }`}
            >
              <div className="w-full max-w-sm px-6 sm:px-8">
                <button
                  id={keyboardOpen ? "email_continue_btn_resting" : "email_continue_btn"}
                  type="submit"
                  disabled={checkingUser}
                  tabIndex={keyboardOpen ? -1 : 0}
                  className="w-full h-[50px] rounded-full bg-[#FF6B2C] hover:bg-[#FF7A3D] active:bg-[#E55A1F] text-white font-semibold text-sm transition-colors duration-150 active:scale-[0.99] text-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center shadow-sm"
                >
                  {checkingUser ? "Sending OTP..." : "Next"}
                </button>
              </div>
            </div>

            {/* Layer 2: Next Button - Docked above keyboard (keyboard open) */}
            <div
              style={{ bottom: `${keyboardHeight + 14}px` }}
              className={`fixed left-0 right-0 z-20 flex justify-center transition-opacity duration-150 ease-out ${
                keyboardOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
              }`}
            >
              <div className="w-full max-w-sm px-6 sm:px-8">
                <button
                  id={keyboardOpen ? "email_continue_btn" : "email_continue_btn_docked"}
                  type="submit"
                  disabled={checkingUser}
                  tabIndex={keyboardOpen ? 0 : -1}
                  className="w-full h-[50px] rounded-full bg-[#FF6B2C] hover:bg-[#FF7A3D] active:bg-[#E55A1F] text-white font-semibold text-sm transition-colors duration-150 active:scale-[0.99] text-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center shadow-sm"
                >
                  {checkingUser ? "Sending OTP..." : "Next"}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* OTP VERIFICATION STEP */}
        {step === "OTP_INPUT" && (
          <div id="step_otp" className="space-y-8 animate-fade-in text-left">
            <div className="space-y-2">
              <h2 className="text-[28px] sm:text-[32px] font-sans font-bold text-white tracking-tight leading-tight">
                Verify your email
              </h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Enter the 6-digit OTP code sent to <strong className="text-white">{email}</strong>.
              </p>
            </div>

            <form onSubmit={handleOtpVerify} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[11px] text-zinc-500 font-sans font-bold uppercase tracking-wider block">
                  Verification Code
                </label>
                <input
                  id="otp_input_field"
                  type="text"
                  pattern="[0-9]*"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpToken}
                  onChange={(e) => setOtpToken(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="000000"
                  className="w-full h-[50px] bg-[#121214] border border-white/[0.08] focus:border-[#FF6B2C] rounded-[14px] px-4 text-sm text-center text-white tracking-[0.5em] font-mono placeholder-zinc-650 focus:outline-none transition-colors duration-150"
                  required
                />
                {errorMessage && (
                  <p className="text-xs text-red-500 font-sans mt-2 text-center">{errorMessage}</p>
                )}
              </div>

              <button
                id="otp_verify_btn"
                type="submit"
                disabled={checkingUser}
                className="w-full h-[50px] rounded-[14px] bg-[#FF6B2C] hover:bg-[#FF7A3D] active:bg-[#E55A1F] text-white font-semibold text-xs tracking-wider uppercase transition-colors duration-150 active:scale-[0.99] text-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center shadow-sm"
              >
                {checkingUser ? "Verifying..." : "Verify & Continue"}
              </button>
            </form>

            <div className="text-xs text-zinc-500 text-center leading-relaxed">
              Didn't receive the code?{" "}
              <span
                onClick={handleEmailSubmit}
                className="underline cursor-pointer text-white hover:text-zinc-300 transition"
              >
                Resend code
              </span>
            </div>
          </div>
        )}

        {/* PROFILE SETUP */}
        {step === "PROFILE_SETUP" && (
          <div id="step_profile" className="flex flex-col items-center justify-between h-full py-2 space-y-6 animate-fade-in text-left">

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
        )}

      </div>
    </div>
  );
}
