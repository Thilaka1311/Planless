import React, { useState, useEffect } from "react";
import { ArrowLeft, HelpCircle, User, X, Terminal, Trophy, Bike, Music, Rocket, Users } from "lucide-react";
import { UserProfile } from "../../../../core/types";
import defaultAvatar from "../../../../assets/default_avatar.png";
import { trackEvent } from "../../../../../lib/analytics";
import { supabase } from "../../../../../lib/supabaseClient";
import { resolveImage, ImageType } from "../../../../shared/imaging/imageResolver";
import { useProfileUpload } from "../../../profile/hooks/useProfileUpload";
import { StoryStep1 } from "./StoryStep1";
import { StoryStep2 } from "./StoryStep2";
import { StoryStep3 } from "./StoryStep3";
import { AnimatePresence, motion } from "motion/react";

interface OnboardingFlowProps {
  onComplete: (profile: UserProfile) => void;
  initialStep?: OnboardingStep;
  existingProfile?: UserProfile | null;
}

export type OnboardingStep = "LANDING" | "STORY_1" | "STORY_2" | "STORY_3" | "EMAIL_INPUT" | "OTP_INPUT" | "PROFILE_SETUP";

export function OnboardingFlow({ onComplete, initialStep = "LANDING", existingProfile = null }: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [showDevProfile, setShowDevProfile] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    // Preload onboarding assets to avoid loading delay
    const img1 = new Image();
    img1.src = "/vitruvian-man.png";
    const img2 = new Image();
    img2.src = "/dev-avatar.jpg";
  }, []);
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

  // Handle OTP Verification and public.users creation/routing
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
      // Success! Let App.tsx global auth listener handle session restoration and step routing.
    } catch (err) {
      console.warn("[Onboarding] OTP verification exception:", err);
      setErrorMessage("Unable to verify OTP. Please try again.");
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
    <div id="onboarding_wrapper" className="w-full h-full text-white bg-[#000000] flex flex-col justify-between font-sans relative overflow-hidden p-6 md:p-8">
      {/* Header bar for standard forms */}
      {step !== "LANDING" && step !== "STORY_1" && step !== "STORY_2" && step !== "STORY_3" && (
        <div id="onboarding_header" className="flex items-center justify-between w-full h-10 shrink-0 z-10">
          {step !== "PROFILE_SETUP" ? (
            <button
              id="back_btn"
              onClick={() => {
                if (step === "EMAIL_INPUT") setStep("STORY_3");
                else if (step === "OTP_INPUT") setStep("EMAIL_INPUT");
              }}
              className="w-8 h-8 rounded-full border border-white/[0.08] hover:bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-white transition active:scale-95 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-8 h-8" />
          )}

          <span className="text-[11px] font-sans uppercase tracking-[0.4em] text-zinc-500 font-bold select-none">
            PLANLESS
          </span>

          <button className="w-8 h-8 rounded-full border border-white/[0.08] hover:bg-white/[0.04] flex items-center justify-center text-zinc-550 hover:text-zinc-300 transition">
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Persistent Story Header */}
      {(step === "STORY_1" || step === "STORY_2" || step === "STORY_3") && (
        <div className="absolute top-6 left-6 right-6 z-30 flex justify-between items-center h-10">
          <button
            onClick={() => {
              if (step === "STORY_1") setStep("LANDING");
              else if (step === "STORY_2") setStep("STORY_1");
              else if (step === "STORY_3") setStep("STORY_2");
            }}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          <button
            onClick={() => {
              setErrorMessage("");
              setProfileName("");
              setEmail("");
              setOtpToken("");
              setAuthMode("signup");
              setStep("EMAIL_INPUT");
            }}
            className="text-xs text-zinc-400 hover:text-white transition cursor-pointer"
          >
            {step !== "STORY_3" ? "Skip" : ""}
          </button>
        </div>
      )}

      {/* Main Form/Content Section */}
      <div id="onboarding_main" className="flex-1 flex flex-col justify-between z-10 max-w-sm mx-auto w-full py-4">

        {/* LANDING STEP */}
        {/* STORY STEPS & LANDING */}
        <AnimatePresence mode="wait">
          {step === "LANDING" && (
            <motion.div
              key="landing_step"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full flex flex-col justify-between"
            >
              <div id="step_landing" className="flex flex-col h-full justify-between pt-6 pb-2">
                <div className="text-zinc-500 text-[11px] font-sans uppercase tracking-[0.4em] font-bold text-center mt-2 select-none">
                  PLANLESS
                </div>

                <div className="flex-1 flex flex-col justify-center gap-6 text-left">
                  <h1 className="text-4xl font-sans font-bold tracking-tight text-white leading-[1.1] max-w-sm">
                    Planless<br />
                    fixes plans.<br />
                    Ironic.<br />
                    We know.
                  </h1>
                  <p className="text-zinc-400 text-sm leading-relaxed max-w-xs font-sans">
                    Spontaneous hangouts, real-world experiences, and circles of friends without the calendar complex.
                  </p>
                </div>

                <div className="flex flex-col gap-4 mt-auto pb-4">
                  <button
                    id="btn_create_account"
                    onClick={() => {
                      setStep("STORY_1");
                    }}
                    className="w-full py-4 px-6 rounded-xl bg-white hover:bg-zinc-150 text-black font-semibold text-[14px] tracking-wide transition active:scale-[0.99] cursor-pointer text-center"
                  >
                    Get Started
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          {step === "STORY_1" && (
            <motion.div
              key="story_step_1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col justify-between"
            >
              <StoryStep1
                onNext={() => setStep("STORY_2")}
                onSkip={() => {
                  setErrorMessage("");
                  setProfileName("");
                  setEmail("");
                  setOtpToken("");
                  setAuthMode("signup");
                  setStep("EMAIL_INPUT");
                }}
              />
            </motion.div>
          )}
 
          {step === "STORY_2" && (
            <motion.div
              key="story_step_2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col justify-between"
            >
              <StoryStep2
                onNext={() => setStep("STORY_3")}
                onBack={() => setStep("STORY_1")}
                onSkip={() => {
                  setErrorMessage("");
                  setProfileName("");
                  setEmail("");
                  setOtpToken("");
                  setAuthMode("signup");
                  setStep("EMAIL_INPUT");
                }}
              />
            </motion.div>
          )}
 
          {step === "STORY_3" && (
            <motion.div
              key="story_step_3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col justify-between"
            >
              <StoryStep3
                onNext={() => {
                  setErrorMessage("");
                  setProfileName("");
                  setEmail("");
                  setOtpToken("");
                  setAuthMode("signup");
                  setStep("EMAIL_INPUT");
                }}
                onBack={() => setStep("STORY_2")}
              />
            </motion.div>
          )}

          {/* EMAIL SIGN IN STEP */}
          {step === "EMAIL_INPUT" && (
            <motion.div
              key="step_email"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              id="step_email"
              className="space-y-8 animate-fade-in text-left my-auto w-full"
            >
            <div className="space-y-2">
              <h2 className="text-3xl font-sans font-bold text-white tracking-tight">
                {authMode === "signup" ? "Let's get you started" : "Welcome back"}
              </h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Enter your email address to continue.
              </p>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[11px] text-zinc-500 font-sans font-bold uppercase tracking-widest block">
                  Email Address
                </label>
                <input
                  id="email_input_field"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-[#111111] border border-white/[0.08] focus:border-[#FFFFFF]/30 rounded-xl px-4 py-3.5 text-sm text-white placeholder-zinc-600 focus:outline-none transition"
                  required
                />
                {errorMessage && (
                  <p className="text-xs text-red-500 font-sans mt-1">{errorMessage}</p>
                )}
              </div>

              <div className="text-xs text-zinc-500 leading-relaxed">
                We will send a passwordless OTP code to your email to verify your identity.
              </div>

              <button
                id="email_continue_btn"
                type="submit"
                disabled={checkingUser}
                className="w-full py-3.5 px-6 rounded-xl bg-white hover:bg-zinc-150 text-black font-semibold text-xs tracking-wider uppercase transition active:scale-[0.99] text-center cursor-pointer disabled:opacity-50"
              >
                {checkingUser ? "Sending OTP..." : "Continue"}
              </button>
            </form>

            <div className="text-center pt-2">
              {authMode === "signup" ? (
                <p className="text-xs text-zinc-400">
                  Already have an account?{" "}
                  <button
                    onClick={() => { setAuthMode("login"); setErrorMessage(""); }}
                    className="text-white font-semibold hover:underline cursor-pointer bg-transparent border-none p-0 focus:outline-none"
                  >
                    Log In
                  </button>
                </p>
              ) : (
                <p className="text-xs text-zinc-400">
                  New to Planless?{" "}
                  <button
                    onClick={() => { setAuthMode("signup"); setErrorMessage(""); }}
                    className="text-white font-semibold hover:underline cursor-pointer bg-transparent border-none p-0 focus:outline-none"
                  >
                    Sign Up
                  </button>
                </p>
              )}
            </div>
            </motion.div>
          )}

        {/* OTP VERIFICATION STEP */}
        {step === "OTP_INPUT" && (
          <motion.div
            key="step_otp"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            id="step_otp"
            className="space-y-8 animate-fade-in text-left my-auto w-full"
          >
            <div className="space-y-2">
              <h2 className="text-3xl font-sans font-bold text-white tracking-tight">
                Verify your email
              </h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Enter the 6-digit OTP code sent to <strong>{email}</strong>.
              </p>
            </div>

            <form onSubmit={handleOtpVerify} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[11px] text-zinc-500 font-sans font-bold uppercase tracking-widest block">
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
                  className="w-full bg-[#111111] border border-white/[0.08] focus:border-[#FFFFFF]/30 rounded-xl px-4 py-3.5 text-sm text-center text-white tracking-[0.5em] font-mono placeholder-zinc-650 focus:outline-none transition"
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
                className="w-full py-3.5 px-6 rounded-xl bg-white hover:bg-zinc-150 text-black font-semibold text-xs tracking-wider uppercase transition active:scale-[0.99] text-center cursor-pointer disabled:opacity-50"
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
          </motion.div>
        )}

        {/* PROFILE SETUP */}
        {step === "PROFILE_SETUP" && (
          <motion.div
            key="step_profile"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            id="step_profile"
            className="flex flex-col items-center justify-between h-full py-2 space-y-6 animate-fade-in text-left w-full"
          >

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
          </motion.div>
        )}
      </AnimatePresence>
 
      </div>

      {/* Dev Profile Trigger Button - only shown on Landing screen with transparency */}
      {step === "LANDING" && (
        <div className="mt-8 text-center shrink-0 z-10 opacity-40 hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={() => setShowDevProfile(true)}
            className="inline-flex items-center gap-1.5 text-zinc-550 hover:text-zinc-350 transition text-xs font-mono font-medium hover:underline cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Meet the Dev</span>
          </button>
        </div>
      )}

      {/* Dev Profile Modal */}
      {showDevProfile && (
        <div className="absolute inset-0 bg-[#000000]/95 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-950 border border-white/[0.08] w-full max-w-md rounded-2xl p-6 relative overflow-hidden flex flex-col items-center text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Close button */}
            <button 
              onClick={() => setShowDevProfile(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full border border-white/[0.08] hover:bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-white transition active:scale-95 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Decorative header */}
            <div className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase mb-4">
              &lt; Developer Profile &gt;
            </div>

            {/* Profile Image with thoughts around it */}
            <div className="relative w-48 h-48 my-6 flex items-center justify-center">
              {/* Profile Image container */}
              <div className="w-36 h-36 rounded-full overflow-hidden border-2 border-white/10 hover:border-white/30 transition-all duration-500 shadow-xl relative z-10">
                <img 
                  src="/dev-avatar.jpg" 
                  className="w-full h-full object-cover scale-105 hover:scale-110 transition-transform duration-700" 
                  alt="Developer Portrait" 
                />
              </div>

              {/* Outer glowing ring */}
              <div className="absolute inset-4 rounded-full border border-white/5 animate-pulse" />

              {/* Thought Badges & Curly Arrows */}
              {/* 1. Football - Top Left */}
              <div className="absolute -top-2 -left-12 z-20 flex flex-col items-end">
                <span className="bg-zinc-900/90 border border-zinc-800 text-zinc-300 text-[11px] px-2.5 py-1 rounded-full shadow-lg font-medium flex items-center gap-1.5 hover:border-zinc-700 transition">
                  <Trophy className="w-3 h-3 text-zinc-400" /> Football
                </span>
                <svg className="w-12 h-8 -mr-1 mt-0.5 text-zinc-500 overflow-visible" fill="none" viewBox="0 0 50 30">
                  <path d="M5,5 Q25,5 35,20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,3" />
                  <polygon points="35,20 30,17 33,14" fill="currentColor" />
                </svg>
              </div>

              {/* 2. Riding - Top Right */}
              <div className="absolute -top-2 -right-8 z-20 flex flex-col items-start">
                <span className="bg-zinc-900/90 border border-zinc-800 text-zinc-300 text-[11px] px-2.5 py-1 rounded-full shadow-lg font-medium flex items-center gap-1.5 hover:border-zinc-700 transition">
                  <Bike className="w-3 h-3 text-zinc-400" /> Riding
                </span>
                <svg className="w-12 h-8 -ml-1 mt-0.5 text-zinc-500 overflow-visible" fill="none" viewBox="0 0 50 30">
                  <path d="M45,5 Q25,5 15,20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,3" />
                  <polygon points="15,20 17,14 20,17" fill="currentColor" />
                </svg>
              </div>

              {/* 3. Music - Bottom Center */}
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
                <svg className="w-8 h-10 text-zinc-500 overflow-visible mb-0.5" fill="none" viewBox="0 0 30 40">
                  <path d="M15,5 Q15,20 15,30" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,3" />
                  <polygon points="15,30 11,25 19,25" fill="currentColor" />
                </svg>
                <span className="bg-zinc-900/90 border border-zinc-800 text-zinc-300 text-[11px] px-2.5 py-1 rounded-full shadow-lg font-medium flex items-center gap-1.5 hover:border-zinc-700 transition">
                  <Music className="w-3 h-3 text-zinc-400" /> Music
                </span>
              </div>
            </div>

            {/* Developer Info */}
            <h3 className="text-xl font-bold text-white tracking-tight mt-2">Thilaka Sundar</h3>
            <p className="text-zinc-500 text-xs mt-1 font-mono">ECE Graduate | Entrepreneur & Builder</p>

            <div className="h-px bg-white/[0.08] w-full my-4" />

            <p className="text-zinc-300 text-xs md:text-sm leading-relaxed max-w-xs font-sans">
              "Transitioning from circuits to society. I believe modern software should solve real-world friction. I'm building <span className="text-white font-semibold">Planless</span> to make sure spontaneous hangouts and real-world experiences happen seamlessly, bypassing the calendar complex."
            </p>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 justify-center mt-6">
              <span className="bg-white/5 text-zinc-400 text-[9px] uppercase tracking-wider px-2.5 py-1 rounded-md border border-white/[0.04] flex items-center gap-1">
                <Rocket className="w-3 h-3 text-zinc-400" /> Entrepreneurship
              </span>
              <span className="bg-white/5 text-zinc-400 text-[9px] uppercase tracking-wider px-2.5 py-1 rounded-md border border-white/[0.04] flex items-center gap-1">
                <Users className="w-3 h-3 text-zinc-400" /> Seamless Connections
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
