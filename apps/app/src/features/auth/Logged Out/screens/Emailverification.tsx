import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { supabase } from "../../../../../lib/supabaseClient";
import { UserProfile } from "../../../../core/types";
import planlessLogo from "../../../../assets/planless_logo.png";
import onboardingCups from "../../../../assets/Onboarding_cups.png";
import defaultAvatar from "../../../../assets/default_avatar.png";
import { preloadImage } from "../../../../shared/imaging/preloadImage";

// Session Persistence for OTP flow in localStorage
const OTP_STORAGE_KEY = "planless_otp_auth_session";

interface StoredOtpSession {
  email: string;
  resendAvailableAt: number;
  otpExpiresAt: number;
}

function getStoredOtpSession(): StoredOtpSession | null {
  try {
    const raw = localStorage.getItem(OTP_STORAGE_KEY);
    if (!raw) return null;
    const parsed: StoredOtpSession = JSON.parse(raw);
    if (Date.now() > parsed.otpExpiresAt) {
      localStorage.removeItem(OTP_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredOtpSession(data: StoredOtpSession) {
  try {
    localStorage.setItem(OTP_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function clearStoredOtpSession() {
  try {
    localStorage.removeItem(OTP_STORAGE_KEY);
  } catch {}
}

export interface EmailVerificationProps {
  onComplete: (user: UserProfile) => void;
  onProfileSetup: (data: {
    tempUserId: string;
    tempPublicId: string | null;
    sessionToken: string;
    email?: string;
  }) => void;
  onBack?: () => void;
  initialSubStep?: "EMAIL" | "OTP";
  className?: string;
}

export function EmailVerification({
  onComplete,
  onProfileSetup,
  onBack,
  initialSubStep = "EMAIL",
  className = "",
}: EmailVerificationProps) {
  // Screen sub-step: EMAIL or OTP
  const [subStep, setSubStep] = useState<"EMAIL" | "OTP">(() => {
    if (initialSubStep === "OTP") return "OTP";
    const stored = getStoredOtpSession();
    return stored ? "OTP" : "EMAIL";
  });

  // Email input state
  const [email, setEmail] = useState(() => {
    const stored = getStoredOtpSession();
    return stored ? stored.email : "";
  });
  const [activeOtpEmail, setActiveOtpEmail] = useState<string | null>(() => {
    const stored = getStoredOtpSession();
    return stored ? stored.email : null;
  });

  // OTP timing & token state
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(() => {
    const stored = getStoredOtpSession();
    return stored ? stored.resendAvailableAt : null;
  });
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(() => {
    const stored = getStoredOtpSession();
    return stored ? stored.otpExpiresAt : null;
  });
  const [otpToken, setOtpToken] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const otpBoxRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Status & Error
  const [checkingUser, setCheckingUser] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Touch gesture state for swipe back on EMAIL screen
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const isNavigatingRef = useRef(false);

  // Mobile Keyboard handling
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Viewport resize tracking for mobile virtual keyboard
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleViewportChange = () => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
      if (window.visualViewport) {
        const vv = window.visualViewport;
        const kbHeight = Math.max(0, window.innerHeight - vv.height);
        setKeyboardHeight(kbHeight);
        setKeyboardOpen(kbHeight > 100);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportChange);
      window.visualViewport.addEventListener("scroll", handleViewportChange);
    }
    window.addEventListener("resize", handleViewportChange);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportChange);
        window.visualViewport.removeEventListener("scroll", handleViewportChange);
      }
      window.removeEventListener("resize", handleViewportChange);
    };
  }, []);

  // Preload cups illustration
  useEffect(() => {
    preloadImage(onboardingCups);
  }, []);

  // Auto-focus first OTP box when entering OTP state
  useEffect(() => {
    if (subStep === "OTP") {
      const focusFirstBox = () => {
        const first = otpBoxRefs.current[0];
        if (first) {
          first.focus({ preventScroll: true });
        }
      };
      focusFirstBox();
      const timer1 = setTimeout(focusFirstBox, 50);
      const timer2 = setTimeout(focusFirstBox, 150);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [subStep]);

  // Derived resend countdown timer based on target timestamp
  useEffect(() => {
    if (!resendAvailableAt) {
      setResendCooldown(0);
      return;
    }

    const updateCooldown = () => {
      const remaining = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
      setResendCooldown(remaining);
    };

    updateCooldown();
    const interval = setInterval(updateCooldown, 500);
    return () => clearInterval(interval);
  }, [resendAvailableAt]);

  // Swipe gesture handlers (Email screen allows swipe right/back to solution; OTP screen has no swipe)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (subStep === "OTP") return; // No swiping on OTP screen
    if (e.touches.length > 0) {
      setTouchStartX(e.touches[0].clientX);
      setTouchStartY(e.touches[0].clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (subStep === "OTP") return;
    if (touchStartX === null || touchStartY === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    setTouchStartX(null);
    setTouchStartY(null);

    // Only process horizontal swipes
    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    if (isNavigatingRef.current) return;

    // Swiping right: back to solution screen
    if (deltaX > 0 && onBack) {
      isNavigatingRef.current = true;
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 500);
      onBack();
    }
  };

  const normalizeEmail = (val: string) => (val ? val.trim().toLowerCase() : "");

  // Handle Email submission (sends OTP)
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checkingUser) return;

    const normalized = normalizeEmail(email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalized || !emailRegex.test(normalized)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setErrorMessage("");

    // FLOW A — SAME EMAIL: Reuse existing active OTP session
    if (activeOtpEmail && normalizeEmail(activeOtpEmail) === normalized) {
      setSubStep("OTP");
      return;
    }

    // FLOW B — NEW / CHANGED EMAIL: Request fresh OTP from Supabase
    setCheckingUser(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        console.error(error);
        setErrorMessage(error.message || "Failed to send OTP. Please try again.");
        return;
      }

      const now = Date.now();
      const resendAt = now + 30 * 1000;
      const expiresAt = now + 10 * 60 * 1000; // 10 minutes validity

      setActiveOtpEmail(normalized);
      setResendAvailableAt(resendAt);
      setOtpExpiresAt(expiresAt);
      saveStoredOtpSession({
        email: normalized,
        resendAvailableAt: resendAt,
        otpExpiresAt: expiresAt,
      });

      setOtpToken("");
      setOtpDigits(["", "", "", "", "", ""]);
      setSubStep("OTP");
    } catch (err) {
      console.warn("[EmailVerification] Email OTP error:", err);
      setErrorMessage("Unable to send OTP. Please try again.");
    } finally {
      setCheckingUser(false);
    }
  };

  // OTP Box Handlers for 6 Individual Boxes
  const handleOtpBoxChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const clean = raw.replace(/[^0-9]/g, "");

    if (errorMessage) setErrorMessage("");

    if (!clean) {
      const newDigits = [...otpDigits];
      newDigits[index] = "";
      setOtpDigits(newDigits);
      setOtpToken(newDigits.join(""));
      return;
    }

    if (clean.length >= 6) {
      const digits = clean.slice(0, 6).split("");
      const newDigits = Array(6).fill("").map((_, i) => digits[i] || "");
      setOtpDigits(newDigits);
      setOtpToken(newDigits.join(""));
      otpBoxRefs.current[5]?.focus({ preventScroll: true });
      return;
    }

    if (clean.length > 1) {
      if (otpDigits[index] && clean.length === 2) {
        const newChar = clean.slice(-1);
        const newDigits = [...otpDigits];
        newDigits[index] = newChar;
        setOtpDigits(newDigits);
        setOtpToken(newDigits.join(""));
        if (index < 5) {
          otpBoxRefs.current[index + 1]?.focus({ preventScroll: true });
        }
        return;
      }

      const chars = clean.split("");
      const newDigits = [...otpDigits];
      let lastFilled = index;
      for (let i = 0; i < chars.length && index + i < 6; i++) {
        newDigits[index + i] = chars[i];
        lastFilled = index + i;
      }
      setOtpDigits(newDigits);
      setOtpToken(newDigits.join(""));
      const nextFocus = Math.min(lastFilled + 1, 5);
      otpBoxRefs.current[nextFocus]?.focus({ preventScroll: true });
      return;
    }

    const newDigits = [...otpDigits];
    newDigits[index] = clean;
    setOtpDigits(newDigits);
    setOtpToken(newDigits.join(""));
    if (index < 5) {
      otpBoxRefs.current[index + 1]?.focus({ preventScroll: true });
    }
  };

  const handleOtpBoxKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" || e.key === "Delete") {
      if (errorMessage) setErrorMessage("");
      if (otpDigits[index] === "") {
        if (index > 0) {
          e.preventDefault();
          const newDigits = [...otpDigits];
          newDigits[index - 1] = "";
          setOtpDigits(newDigits);
          setOtpToken(newDigits.join(""));
          otpBoxRefs.current[index - 1]?.focus({ preventScroll: true });
        }
      } else {
        e.preventDefault();
        const newDigits = [...otpDigits];
        newDigits[index] = "";
        setOtpDigits(newDigits);
        setOtpToken(newDigits.join(""));
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      otpBoxRefs.current[index - 1]?.focus({ preventScroll: true });
    } else if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      otpBoxRefs.current[index + 1]?.focus({ preventScroll: true });
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      if (errorMessage) setErrorMessage("");
    }
  };

  const handleOtpBoxPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (errorMessage) setErrorMessage("");
    const pastedText = e.clipboardData.getData("text/plain");
    const clean = pastedText.replace(/[^0-9]/g, "").slice(0, 6);
    if (!clean) return;

    const digits = clean.split("");
    const newDigits = Array(6).fill("").map((_, i) => digits[i] || "");
    setOtpDigits(newDigits);
    setOtpToken(newDigits.join(""));

    const targetIndex = Math.min(digits.length, 5);
    otpBoxRefs.current[targetIndex]?.focus({ preventScroll: true });
  };

  const handleOtpBoxFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  // Handle Resend OTP
  const handleResendOtp = async () => {
    if (checkingUser || resendCooldown > 0) return;
    const targetEmail = activeOtpEmail || normalizeEmail(email);
    if (!targetEmail) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setErrorMessage("");
    setCheckingUser(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: targetEmail,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        console.error(error);
        setErrorMessage(error.message || "Failed to resend OTP. Please try again.");
        return;
      }

      const now = Date.now();
      const resendAt = now + 30 * 1000;
      const expiresAt = now + 10 * 60 * 1000;

      setResendAvailableAt(resendAt);
      setOtpExpiresAt(expiresAt);
      saveStoredOtpSession({
        email: targetEmail,
        resendAvailableAt: resendAt,
        otpExpiresAt: expiresAt,
      });

      setOtpToken("");
      setOtpDigits(["", "", "", "", "", ""]);
      otpBoxRefs.current[0]?.focus({ preventScroll: true });
    } catch (err) {
      console.warn("[EmailVerification] Resend OTP error:", err);
      setErrorMessage("Unable to resend OTP. Please try again.");
    } finally {
      setCheckingUser(false);
    }
  };

  // Handle OTP Verification
  const handleOtpVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (checkingUser) return;

    const token = otpDigits.join("").trim() || otpToken.trim();
    if (!token || token.length < 6) {
      setErrorMessage("That code isn't correct. Please try again.");
      return;
    }

    if (otpExpiresAt && Date.now() > otpExpiresAt) {
      setErrorMessage("This code has expired. Please request a new one.");
      return;
    }

    const verifyEmail = activeOtpEmail || normalizeEmail(email);
    setErrorMessage("");
    setCheckingUser(true);

    try {
      const { data: { session }, error } = await supabase.auth.verifyOtp({
        email: verifyEmail,
        token: token,
        type: "email",
      });

      if (error || !session) {
        const isExpired =
          (otpExpiresAt && Date.now() > otpExpiresAt) ||
          error?.code === "otp_expired";

        if (isExpired) {
          setErrorMessage("This code has expired. Please request a new one.");
        } else {
          setErrorMessage("That code isn't correct. Please try again.");
        }
        setCheckingUser(false);
        return;
      }

      setActiveOtpEmail(null);
      setResendAvailableAt(null);
      setOtpExpiresAt(null);
      clearStoredOtpSession();

      const authUser = session.user;

      // Check if this authenticated user already has a completed Planless profile
      const { data: dbProfile, error: profileError } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();

      if (profileError) {
        console.error("[EmailVerification] Error checking profile status:", profileError);
      }

      if (dbProfile && dbProfile.profile_completed) {
        try {
          localStorage.removeItem("planless_onboarding_screen");
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
              profile_completed: false,
            }, { onConflict: "id", ignoreDuplicates: true })
            .select("*")
            .single();
          if (newProfile?.public_id) {
            publicId = newProfile.public_id;
          }
        }

        setErrorMessage("");
        onProfileSetup({
          tempUserId: authUser.id,
          tempPublicId: publicId || null,
          sessionToken: session.access_token,
          email: authUser.email || verifyEmail || "",
        });
      }
    } catch (err) {
      console.warn("[EmailVerification] OTP verification exception:", err);
      setErrorMessage("That code doesn’t look right. Try again.");
    } finally {
      setCheckingUser(false);
    }
  };

  return (
    <div className={`w-full h-full flex flex-col justify-between ${className}`}>
      {/* 1. EMAIL INPUT VIEW */}
      {subStep === "EMAIL" && (
        <motion.div
          key="email_input_step"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full h-full flex flex-col justify-between"
        >
          <form
            id="step_email_form"
            onSubmit={handleEmailSubmit}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            noValidate
            className="w-full h-full flex flex-col justify-between items-center select-none overflow-hidden px-4 sm:px-6 md:px-8 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            {/* Top Section: Fixed Authentication Content */}
            <div
              className={`w-full pt-20 xs:pt-24 sm:pt-28 md:pt-32 flex flex-col items-center select-text shrink-0 transition-transform duration-200 ease-out ${
                keyboardOpen ? "translate-y-0" : "translate-y-0"
              }`}
            >
              {/* Centered Planless Hero Symbol */}
              <div className="flex justify-center items-center select-none pointer-events-none mb-5 sm:mb-6">
                <img
                  src={planlessLogo}
                  alt="Planless"
                  loading="eager"
                  decoding="sync"
                  className="w-[70px] h-[70px] sm:w-[76px] sm:h-[76px] object-contain"
                />
              </div>

              {/* Main heading and input content group */}
              <div className="w-full space-y-4 xs:space-y-5 sm:space-y-6">
                {/* Heading: Centered, matching helper titles in the animation screens */}
                <div>
                  <h2 className="text-[18px] xs:text-[20px] sm:text-[22px] md:text-[24px] font-sans font-bold tracking-tight text-white leading-[1.25] text-center">
                    Welcome to Planless
                  </h2>
                </div>

                {/* Email Input Field & Inline Error - Full Width */}
                <div className="w-full">
                  <input
                    id="email_input_field"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errorMessage) setErrorMessage("");
                    }}
                    placeholder="Enter your email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    className={`w-full h-[52px] bg-[#141416] rounded-[15px] px-4 sm:px-[18px] text-[15.5px] sm:text-base text-white placeholder-zinc-500 focus:outline-none transition-colors duration-150 border ${
                      errorMessage
                        ? "border-red-500 focus:border-red-500"
                        : "border-white/[0.09] hover:border-white/[0.16] focus:border-white"
                    }`}
                  />
                  <div className="min-h-[20px] pt-1.5 pl-1">
                    {errorMessage && (
                      <p className="text-[13px] text-red-500 font-sans leading-tight">
                        {errorMessage}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Middle Section: Illustration vertically balanced between email input and Next button */}
            <div
              className={`flex-1 w-full min-h-0 flex items-center justify-center pt-3 pb-1 transition-opacity duration-200 pointer-events-none select-none ${
                keyboardOpen ? "opacity-0 pointer-events-none" : "opacity-100 pointer-events-auto"
              }`}
            >
              <img
                src={onboardingCups}
                alt="Planless Toast"
                loading="eager"
                decoding="async"
                className="w-full max-w-[280px] xs:max-w-[310px] sm:max-w-[340px] max-h-full object-contain pointer-events-none select-none"
              />
            </div>

            {/* Bottom Section: Next Button - Full width resting state (keyboard closed) */}
            <div
              className={`w-full shrink-0 pt-2 transition-opacity duration-150 ease-out ${
                keyboardOpen ? "opacity-0 pointer-events-none" : "opacity-100 pointer-events-auto"
              }`}
            >
              <div className="h-[46px] w-full flex items-center">
                <button
                  id={keyboardOpen ? "email_continue_btn_resting" : "email_continue_btn"}
                  type="submit"
                  disabled={checkingUser}
                  tabIndex={keyboardOpen ? -1 : 0}
                  className="w-full py-3 px-6 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:bg-[#E55A1F] text-white font-semibold text-[14px] xs:text-[14.5px] sm:text-[15px] tracking-wide transition active:scale-[0.99] cursor-pointer text-center shadow-md shadow-[#FF6B2C]/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center"
                >
                  {checkingUser ? "Sending OTP..." : "Next"}
                </button>
              </div>
            </div>

            {/* Floating Next Button - Full width docked above keyboard (keyboard open) */}
            <div
              style={{ bottom: `${keyboardHeight + 14}px` }}
              className={`fixed left-0 right-0 z-20 flex justify-center transition-opacity duration-150 ease-out ${
                keyboardOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
              }`}
            >
              <div className="w-full px-4 sm:px-6 md:px-8">
                <button
                  id={keyboardOpen ? "email_continue_btn" : "email_continue_btn_docked"}
                  type="submit"
                  disabled={checkingUser}
                  tabIndex={keyboardOpen ? 0 : -1}
                  className="w-full py-3 px-6 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:bg-[#E55A1F] text-white font-semibold text-[14px] xs:text-[14.5px] sm:text-[15px] tracking-wide transition active:scale-[0.99] cursor-pointer text-center shadow-md shadow-[#FF6B2C]/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center"
                >
                  {checkingUser ? "Sending OTP..." : "Next"}
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      )}

      {/* 2. OTP VERIFICATION VIEW */}
      {subStep === "OTP" && (
        <motion.div
          key="otp_input_step"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full h-full flex flex-col justify-between"
        >
          <form
            id="step_otp_form"
            onSubmit={handleOtpVerify}
            noValidate
            className="w-full h-full flex flex-col items-center select-none overflow-hidden"
          >
            {/* Layer 1: Fixed Authentication Content (Unified Visual Group) */}
            <div className="w-full px-4 sm:px-6 md:px-8 pt-4 xs:pt-6 sm:pt-8 flex flex-col items-center select-text">
              {/* Centered Planless Hero Symbol */}
              <div className="flex justify-center items-center select-none pointer-events-none mb-6 sm:mb-7">
                <img
                  src={planlessLogo}
                  alt="Planless"
                  loading="eager"
                  decoding="sync"
                  className="w-[70px] h-[70px] sm:w-[76px] sm:h-[76px] object-contain"
                />
              </div>

              {/* Main heading and input content group */}
              <div className="w-full space-y-5 sm:space-y-6">
                {/* Heading & Subtext */}
                <div className="space-y-2 text-center select-none">
                  <h2 className="text-[18px] xs:text-[20px] sm:text-[22px] md:text-[24px] font-sans font-bold tracking-tight text-white leading-[1.25] text-center">
                    Verify your email
                  </h2>
                  <p className="text-[14.5px] sm:text-[15.5px] text-zinc-400 font-normal leading-normal text-center">
                    Enter the 6-digit code sent to
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-0.5">
                    <span className="text-[14.5px] sm:text-[15.5px] font-semibold text-white select-text">
                      {activeOtpEmail || email}
                    </span>
                    <button
                      type="button"
                      id="otp_edit_email_btn"
                      onClick={() => {
                        setErrorMessage("");
                        if (document.activeElement instanceof HTMLElement) {
                          document.activeElement.blur();
                        }
                        if (!email && activeOtpEmail) {
                          setEmail(activeOtpEmail);
                        }
                        setSubStep("EMAIL");
                      }}
                      className="text-[13.5px] sm:text-[14px] font-normal text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer underline underline-offset-2"
                    >
                      edit
                    </button>
                  </div>
                </div>

                {/* OTP 6 Individual Digit Boxes & Inline Error */}
                <div className="w-full">
                  <div className="w-full max-w-[340px] xs:max-w-[360px] mx-auto flex items-center justify-between gap-2 xs:gap-2.5 sm:gap-3">
                    {otpDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => {
                          otpBoxRefs.current[index] = el;
                        }}
                        id={`otp_box_${index}`}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete={index === 0 ? "one-time-code" : "off"}
                        value={digit}
                        autoFocus={index === 0}
                        onChange={(e) => handleOtpBoxChange(index, e)}
                        onKeyDown={(e) => handleOtpBoxKeyDown(index, e)}
                        onPaste={handleOtpBoxPaste}
                        onFocus={handleOtpBoxFocus}
                        spellCheck={false}
                        className={`flex-1 min-w-0 max-w-[48px] xs:max-w-[52px] aspect-square bg-[#141416] rounded-[14px] sm:rounded-[15px] text-[20px] sm:text-[22px] font-semibold text-center text-white focus:outline-none transition-colors duration-150 border caret-[#FF6B2C] select-text ${
                          errorMessage
                            ? "border-red-500 focus:border-red-500"
                            : "border-white/[0.09] hover:border-white/[0.16] focus:border-white"
                        }`}
                      />
                    ))}
                  </div>

                  <div className="min-h-[22px] pt-1.5 pl-1 text-center">
                    {errorMessage && (
                      <p className="text-[13px] text-red-500 font-sans leading-tight text-center">
                        {errorMessage}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Layer 2: Verify & Continue Button + Resend Code */}
            <div
              style={{
                bottom: keyboardOpen
                  ? `${keyboardHeight + 14}px`
                  : "max(1.75rem, env(safe-area-inset-bottom))",
                transition: "bottom 200ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              className="fixed left-0 right-0 z-20 flex justify-center pointer-events-auto"
            >
              <div className="w-full px-4 sm:px-6 md:px-8 flex flex-col items-center">
                <button
                  id="otp_verify_btn"
                  type="submit"
                  disabled={checkingUser}
                  className="w-full py-3 px-6 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:bg-[#E55A1F] text-white font-semibold text-[14px] xs:text-[14.5px] sm:text-[15px] tracking-wide transition active:scale-[0.99] cursor-pointer text-center shadow-md shadow-[#FF6B2C]/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center"
                >
                  {checkingUser ? "Verifying..." : "Verify & Continue"}
                </button>

                {/* Resend Code: Visible below button in resting state; collapses cleanly when keyboard is open */}
                <div
                  className={`transition-all duration-200 overflow-hidden select-none ${
                    keyboardOpen
                      ? "max-h-0 opacity-0 mt-0 pointer-events-none"
                      : "max-h-12 opacity-100 mt-3 sm:mt-3.5 pointer-events-auto"
                  }`}
                >
                  <p className="text-[13px] sm:text-[13.5px] text-zinc-400 text-center select-none">
                    Didn't receive the code?{" "}
                    <button
                      type="button"
                      id="otp_resend_code_btn"
                      onClick={handleResendOtp}
                      disabled={checkingUser || resendCooldown > 0}
                      className="underline underline-offset-2 cursor-pointer text-white hover:text-zinc-300 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
                    </button>
                  </p>
                </div>
              </div>
            </div>
          </form>
        </motion.div>
      )}
    </div>
  );
}

export default EmailVerification;
