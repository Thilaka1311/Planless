import React, { useState, useEffect } from "react";
import { ArrowLeft, HelpCircle, User } from "lucide-react";
import { UserProfile } from "../../../../core/types";
import defaultAvatar from "../../../../assets/default_avatar.png";
import { trackEvent } from "../../../../../lib/analytics";
import { supabase } from "../../../../../lib/supabaseClient";
import { resolveImage, ImageType } from "../../../../shared/imaging/imageResolver";
import { useProfileUpload } from "../../../profile/hooks/useProfileUpload";

interface OnboardingFlowProps {
  onComplete: (profile: UserProfile) => void;
  initialStep?: OnboardingStep;
  existingProfile?: UserProfile | null;
}

export type OnboardingStep = "LANDING" | "EMAIL_INPUT" | "OTP_INPUT" | "PROFILE_SETUP";

export function OnboardingFlow({ onComplete, initialStep = "LANDING", existingProfile = null }: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
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
      {/* Header bar */}
      {step !== "LANDING" && (
        <div id="onboarding_header" className="flex items-center justify-between w-full h-10 shrink-0 z-10">
          {step !== "PROFILE_SETUP" ? (
            <button
              id="back_btn"
              onClick={() => {
                if (step === "EMAIL_INPUT") setStep("LANDING");
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

          <button className="w-8 h-8 rounded-full border border-white/[0.08] hover:bg-white/[0.04] flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition">
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Form/Content Section */}
      <div id="onboarding_main" className="flex-1 flex flex-col justify-center my-auto py-10 z-10 max-w-sm mx-auto w-full">

        {/* LANDING STEP */}
        {step === "LANDING" && (
          <div id="step_landing" className="flex flex-col h-full justify-between py-12">
            <div className="text-zinc-500 text-[11px] font-sans uppercase tracking-[0.4em] font-bold text-center mt-4 select-none">
              PLANLESS
            </div>

            <div className="my-auto flex flex-col gap-6 text-left">
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

            <div className="flex flex-col gap-4 mt-auto">
              <button
                id="btn_create_account"
                onClick={() => {
                  setErrorMessage("");
                  setProfileName("");
                  setEmail("");
                  setOtpToken("");
                  setAuthMode("signup");
                  setStep("EMAIL_INPUT");
                }}
                className="w-full py-4 px-6 rounded-xl bg-white hover:bg-zinc-150 text-black font-semibold text-[14px] tracking-wide transition active:scale-[0.99] cursor-pointer text-center"
              >
                Get Started
              </button>
            </div>
          </div>
        )}

        {/* EMAIL SIGN IN STEP */}
        {step === "EMAIL_INPUT" && (
          <div id="step_email" className="space-y-8 animate-fade-in text-left">
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
          </div>
        )}

        {/* OTP VERIFICATION STEP */}
        {step === "OTP_INPUT" && (
          <div id="step_otp" className="space-y-8 animate-fade-in text-left">
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
