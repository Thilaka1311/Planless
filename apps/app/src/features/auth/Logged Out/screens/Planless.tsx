import React, { useEffect } from "react";
import { motion } from "motion/react";
import planlessLogo from "../../../../assets/planless_logo.webp";
import diningImg from "../../../../assets/dining.webp";
import diningCategoryIcon from "../../../../assets/categories/dining.png";
import sportsCategoryIcon from "../../../../assets/categories/sports.png";
import moviesCategoryIcon from "../../../../assets/categories/movies.png";
import activitiesCategoryIcon from "../../../../assets/categories/activity.png";
import {
  Calendar,
  Hourglass,
  CheckCircle2,
  ArrowRight,
  Mail,
  MessageSquare,
  Receipt,
  Users,
  Share2,
  Sparkles,
} from "lucide-react";
import { navigateToRoute } from "../../../navigation/appRouter";

export interface PlanlessProps {
  onGetStarted: () => void;
  onLogin?: () => void;
  className?: string;
}

export function Planless({
  onGetStarted,
  onLogin,
  className = "",
}: PlanlessProps) {
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = "Planless – Turn conversations into real plans";
    }
  }, []);

  const handleNavPrivacy = (e: React.MouseEvent) => {
    e.preventDefault();
    navigateToRoute({ tab: "home", subScreen: "privacy" });
  };

  const handleNavTerms = (e: React.MouseEvent) => {
    e.preventDefault();
    navigateToRoute({ tab: "home", subScreen: "terms" });
  };

  const scrollToSection = (id: string) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div
      id="planless_public_landing_page"
      className={`w-full h-full overflow-y-auto bg-[#000000] text-zinc-100 font-sans selection:bg-[#FF6B2C]/30 scroll-smooth ${className}`}
    >
      {/* ---------------------------------------------------- */}
      {/* 1. Header: Clean App-Style Navbar */}
      {/* ---------------------------------------------------- */}
      <header className="sticky top-0 z-50 w-full bg-[#000000]/90 backdrop-blur-md border-b border-white/[0.08]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Wordmark */}
          <div
            onClick={() => scrollToSection("hero")}
            className="flex items-center gap-2.5 cursor-pointer select-none group"
          >
            <img
              src={planlessLogo}
              alt="Planless Logo"
              className="w-8 h-8 object-contain transition-transform group-hover:scale-105"
            />
            <span
              style={{ fontFamily: "'Grand Hotel', cursive" }}
              className="text-[28px] text-white font-normal leading-none tracking-normal"
            >
              Planless
            </span>
          </div>

          {/* Minimal Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-400">
            <button
              type="button"
              onClick={() => scrollToSection("features")}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("how-it-works")}
              className="hover:text-white transition-colors cursor-pointer"
            >
              How It Works
            </button>
            <a
              href="/privacy"
              onClick={handleNavPrivacy}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              onClick={handleNavTerms}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Terms of Service
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-2.5">
            {onLogin && (
              <button
                id="btn_header_sign_in"
                type="button"
                onClick={onLogin}
                className="text-xs sm:text-sm font-medium text-zinc-300 hover:text-white px-3.5 py-1.5 rounded-full border border-white/10 hover:border-white/20 hover:bg-white/[0.05] transition-all cursor-pointer"
              >
                Sign In
              </button>
            )}
            <button
              id="btn_header_get_started"
              type="button"
              onClick={onGetStarted}
              className="text-xs sm:text-sm font-semibold text-white px-4 py-1.5 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:bg-[#E55A1F] shadow-sm shadow-[#FF6B2C]/25 transition-all cursor-pointer active:scale-95"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------- */}
      {/* 2. Hero Section: Confident Typography + Authentic App Card */}
      {/* ---------------------------------------------------- */}
      <section
        id="hero"
        className="pt-12 sm:pt-16 pb-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto flex flex-col items-center text-center"
      >
        {/* Brand Pill */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-zinc-300 mb-6"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B2C]" />
          <span>Plan less. Do more.</span>
        </motion.div>

        {/* Main Headline (Space Grotesk, Pure White, Confident) */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-[1.12] max-w-3xl"
        >
          Turn conversations into real plans.
        </motion.h1>

        {/* Verified Core Description */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-base sm:text-lg text-zinc-400 font-normal max-w-2xl mt-5 leading-relaxed"
        >
          Planless makes it easier to turn conversations into real plans. Create
          plans, invite friends, coordinate attendance, and keep track of
          shared expenses in one place.
        </motion.p>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-7 w-full sm:w-auto"
        >
          <button
            id="btn_hero_get_started"
            type="button"
            onClick={onGetStarted}
            className="w-full sm:w-auto px-7 py-3 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:bg-[#E55A1F] text-white font-semibold text-sm transition-all shadow-md shadow-[#FF6B2C]/25 active:scale-95 cursor-pointer flex items-center justify-center gap-2 group"
          >
            <span>Get Started</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
          {onLogin && (
            <button
              id="btn_hero_sign_in"
              type="button"
              onClick={onLogin}
              className="w-full sm:w-auto px-6 py-3 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-zinc-300 hover:text-white font-medium text-sm transition-all cursor-pointer"
            >
              Sign In
            </button>
          )}
        </motion.div>

        {/* -------------------------------------------------- */}
        {/* Real Planless Card Visual Centerpiece */}
        {/* Styled identically to PlanCard.tsx & PlanDetailsCard.tsx */}
        {/* -------------------------------------------------- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="w-full max-w-md sm:max-w-lg mt-12 sm:mt-14"
        >
          <div className="relative aspect-[4/5] w-full rounded-[32px] overflow-hidden border border-white/[0.12] shadow-2xl bg-[#09090b] flex flex-col justify-end text-left select-none">
            {/* Full-bleed Cover Photo with subtle bottom gradient */}
            <img
              src={diningImg}
              alt="Dining Plan Cover"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent pointer-events-none" />

            {/* Top Row Badges matching PlanCard.tsx */}
            <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10 pointer-events-none">
              {/* Category Circle */}
              <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/[0.12] flex items-center justify-center shadow-lg p-2">
                <img
                  src={diningCategoryIcon}
                  alt="Dining"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Respond By Countdown Badge */}
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{
                  background: "rgba(10, 10, 12, 0.65)",
                  backdropFilter: "blur(18px)",
                  WebkitBackdropFilter: "blur(18px)",
                  border: "1px solid rgba(255, 107, 44, 0.5)",
                }}
              >
                <Hourglass className="w-3 h-3 text-[#FF6B2C]" />
                <span className="text-[12px] font-semibold text-[#FF6B2C] tracking-wide">
                  Respond within 4h
                </span>
              </div>
            </div>

            {/* Floating Glass Capsule (ParticipantToggleBar) */}
            <div
              className="mx-3.5 mb-3.5 z-10 rounded-[24px] p-4.5 border border-white/10 shadow-xl"
              style={{
                background: "rgba(0, 0, 0, 0.45)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
              }}
            >
              {/* Title & Date */}
              <div className="flex flex-col text-left">
                <h3 className="font-sans font-bold text-xl sm:text-2xl text-white tracking-tight leading-tight">
                  Saturday Dinner & Catchup
                </h3>
                <div className="flex items-center gap-1.5 text-white/80 text-xs font-semibold mt-1">
                  <Calendar className="w-3.5 h-3.5 text-white/50" />
                  <span>Sat, Oct 24 • 8:00 PM • The Bistro</span>
                </div>
              </div>

              {/* Signature Orange Progress Bar */}
              <div className="w-full mt-3">
                <div className="w-full h-[7px] rounded-full overflow-hidden bg-black/60 border border-white/[0.08] relative">
                  <div
                    className="h-full rounded-full w-[70%]"
                    style={{
                      background:
                        "linear-gradient(90deg, #E65100 0%, #FF6B2C 100%)",
                    }}
                  />
                </div>
              </div>

              {/* Bottom Info: Avatars + Status */}
              <div className="mt-3.5 flex items-center justify-between pt-1">
                <div className="flex items-center -space-x-2">
                  <div className="w-7 h-7 rounded-full bg-[#222226] border-2 border-black flex items-center justify-center text-[10px] font-bold text-white">
                    TS
                  </div>
                  <div className="w-7 h-7 rounded-full bg-[#FF6B2C] border-2 border-black flex items-center justify-center text-[10px] font-bold text-white">
                    VR
                  </div>
                  <div className="w-7 h-7 rounded-full bg-[#3F3F46] border-2 border-black flex items-center justify-center text-[10px] font-bold text-zinc-300">
                    AK
                  </div>
                  <div className="w-7 h-7 rounded-full bg-zinc-800 border-2 border-black flex items-center justify-center text-[10px] font-medium text-zinc-300">
                    +2
                  </div>
                  <span className="text-xs text-zinc-300 font-medium pl-3.5">
                    4 Going • 2 spots left
                  </span>
                </div>

                <span className="text-[11px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  JOINED
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ---------------------------------------------------- */}
      {/* 3. Section: Real Category Selection Strip */}
      {/* Straight from CreateCategoryScreen.tsx */}
      {/* ---------------------------------------------------- */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto border-t border-white/[0.06]">
        <div className="text-center max-w-xl mx-auto mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Discover & Create Plans
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-2">
            Organize any outing in seconds. Dining, Sports, Movies, and custom activities.
          </p>
        </div>

        {/* 4 Category Cards matching CreateCategoryScreen */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="h-[104px] rounded-2xl border border-white/[0.08] bg-[#121216]/90 flex flex-col items-center justify-center p-2.5 transition-all hover:border-white/20">
            <div className="w-12 h-12 flex items-center justify-center">
              <img
                src={diningCategoryIcon}
                alt="Dining"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="text-xs font-semibold text-white/90 mt-1.5">
              Dining
            </span>
          </div>

          <div className="h-[104px] rounded-2xl border border-white/[0.08] bg-[#121216]/90 flex flex-col items-center justify-center p-2.5 transition-all hover:border-white/20">
            <div className="w-12 h-12 flex items-center justify-center">
              <img
                src={sportsCategoryIcon}
                alt="Sports"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="text-xs font-semibold text-white/90 mt-1.5">
              Sports
            </span>
          </div>

          <div className="h-[104px] rounded-2xl border border-white/[0.08] bg-[#121216]/90 flex flex-col items-center justify-center p-2.5 transition-all hover:border-white/20">
            <div className="w-12 h-12 flex items-center justify-center">
              <img
                src={moviesCategoryIcon}
                alt="Movies"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="text-xs font-semibold text-white/90 mt-1.5">
              Movies
            </span>
          </div>

          <div className="h-[104px] rounded-2xl border border-white/[0.08] bg-[#121216]/90 flex flex-col items-center justify-center p-2.5 transition-all hover:border-white/20">
            <div className="w-12 h-12 flex items-center justify-center">
              <img
                src={activitiesCategoryIcon}
                alt="Activities"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="text-xs font-semibold text-white/90 mt-1.5">
              Activities
            </span>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- */}
      {/* 4. Section: Product Feature Modules (Show, Don't Just Tell) */}
      {/* ---------------------------------------------------- */}
      <section
        id="features"
        className="py-14 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto border-t border-white/[0.06]"
      >
        <div className="text-center max-w-xl mx-auto mb-12">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#FF6B2C]">
            Features
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-2">
            No more messy chat coordination
          </h2>
          <p className="text-sm text-zinc-400 mt-2">
            Turn uncertain chat talk into clear decisions and confirmed attendance.
          </p>
        </div>

        <div className="space-y-6">
          {/* Feature Module 1: Invite Friends & RSVPs */}
          <div className="bg-[#111113] border border-white/[0.08] rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-md text-left">
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Invite Friends & Track RSVPs
              </h3>
              <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                Send a private invite link (planless.life/join/...) into WhatsApp or
                any group chat. Friends confirm attendance in one tap without
                repetitive back-and-forth polling.
              </p>
            </div>

            {/* In-App UI Slice */}
            <div className="bg-[#050505] border border-white/[0.08] rounded-xl p-4 w-full md:w-80 shrink-0 text-left">
              <div className="flex items-center justify-between text-xs text-zinc-400 pb-2.5 border-b border-white/[0.06]">
                <span className="font-mono text-[11px] text-[#FF6B2C] truncate">
                  planless.life/join/dinner-bistro
                </span>
                <Share2 className="w-3.5 h-3.5 text-zinc-400 shrink-0 ml-2" />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs font-medium text-white">
                  Attendance
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                    4 Going
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                    1 Waitlist
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Feature Module 2: In-Plan Chat & Shared Photos */}
          <div className="bg-[#111113] border border-white/[0.08] rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-md text-left">
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                In-Plan Chat & Shared Photos
              </h3>
              <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                Keep hangout details, location changes, and pooled event photos in
                one focused room that stays with the plan forever.
              </p>
            </div>

            {/* In-App UI Slice */}
            <div className="bg-[#050505] border border-white/[0.08] rounded-xl p-4 w-full md:w-80 shrink-0 text-left space-y-2.5">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-[#FF6B2C] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                  TS
                </div>
                <div className="bg-[#18181b] border border-white/[0.08] rounded-2xl rounded-tl-sm px-3 py-2 text-xs text-zinc-200">
                  Table is booked for 8:00 PM under Thilak! See you all soon 🙌
                </div>
              </div>
              <div className="text-[10px] text-zinc-500 text-right pr-1">
                In-Plan Chat • 6 Attendees
              </div>
            </div>
          </div>

          {/* Feature Module 3: Keep Track of Shared Expenses */}
          <div className="bg-[#111113] border border-white/[0.08] rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-md text-left">
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Keep Track of Shared Expenses
              </h3>
              <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                Log meal checks, tickets, or turf booking fees directly in the plan.
                Split costs equally or custom-split among confirmed attendees with
                zero confusion.
              </p>
            </div>

            {/* In-App UI Slice */}
            <div className="bg-[#050505] border border-white/[0.08] rounded-xl p-4 w-full md:w-80 shrink-0 text-left">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                <span className="text-xs font-medium text-zinc-400">
                  Total Bill
                </span>
                <span className="text-xs font-bold text-white">
                  ₹2,400.00
                </span>
              </div>
              <div className="mt-2.5 flex items-center justify-between text-xs">
                <span className="text-zinc-400">Split 4 ways</span>
                <span className="font-semibold text-[#FF6B2C]">
                  ₹600.00 / person
                </span>
              </div>
              <div className="mt-2.5 pt-2 border-t border-white/[0.04] flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>All balances settled</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- */}
      {/* 5. Section: How Planless Works (Clean Typographic Progression) */}
      {/* ---------------------------------------------------- */}
      <section
        id="how-it-works"
        className="py-14 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto border-t border-white/[0.06]"
      >
        <div className="text-center max-w-xl mx-auto mb-12">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#FF6B2C]">
            Workflow
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-2">
            How Planless Works
          </h2>
          <p className="text-sm text-zinc-400 mt-2">
            From casual conversation to a confirmed hangout in three steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          {/* Step 1 */}
          <div className="p-6 rounded-2xl bg-[#09090b] border border-white/[0.06]">
            <span className="text-xs font-bold text-[#FF6B2C] font-mono tracking-wider">
              01
            </span>
            <h3 className="text-base font-bold text-white mt-3">
              Pick What to Do
            </h3>
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
              Choose an activity (Dining, Sports, Movies, or custom), select a
              venue, and set the date and time.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-6 rounded-2xl bg-[#09090b] border border-white/[0.06]">
            <span className="text-xs font-bold text-[#FF6B2C] font-mono tracking-wider">
              02
            </span>
            <h3 className="text-base font-bold text-white mt-3">
              Share the Link
            </h3>
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
              Send your private invite link into WhatsApp or your group chat.
              Friends RSVP in one tap.
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-6 rounded-2xl bg-[#09090b] border border-white/[0.06]">
            <span className="text-xs font-bold text-[#FF6B2C] font-mono tracking-wider">
              03
            </span>
            <h3 className="text-base font-bold text-white mt-3">
              Hang Out & Settle Up
            </h3>
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
              Coordinate details in plan chat, share event photos, and split
              shared expenses transparently.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- */}
      {/* 6. Section: Minimal Call to Action */}
      {/* ---------------------------------------------------- */}
      <section className="py-14 sm:py-18 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto text-center border-t border-white/[0.06]">
        <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
          Ready to make real plans?
        </h2>
        <p className="text-sm sm:text-base text-zinc-400 max-w-md mx-auto mt-3">
          Turn your next hangout idea into a confirmed plan today.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-7">
          <button
            id="btn_bottom_get_started"
            type="button"
            onClick={onGetStarted}
            className="w-full sm:w-auto px-7 py-3 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:bg-[#E55A1F] text-white font-semibold text-sm transition-all shadow-md shadow-[#FF6B2C]/25 cursor-pointer active:scale-95"
          >
            Get Started
          </button>
          {onLogin && (
            <button
              id="btn_bottom_sign_in"
              type="button"
              onClick={onLogin}
              className="w-full sm:w-auto px-6 py-3 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-zinc-300 hover:text-white font-medium text-sm transition-all cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------- */}
      {/* 7. Footer: Clean Dark Theme + Required Legal & Support Links */}
      {/* ---------------------------------------------------- */}
      <footer className="w-full border-t border-white/[0.08] bg-[#050505] text-zinc-400 text-xs py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand Info */}
          <div className="flex items-center gap-2.5">
            <img
              src={planlessLogo}
              alt="Planless"
              className="w-6 h-6 object-contain"
            />
            <span
              style={{ fontFamily: "'Grand Hotel', cursive" }}
              className="text-2xl text-white font-normal"
            >
              Planless
            </span>
            <span className="text-zinc-600 pl-2">•</span>
            <span className="text-zinc-400 pl-2">Plan less. Do more.</span>
          </div>

          {/* Legal & Support Links */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs">
            <a
              href="/privacy"
              onClick={handleNavPrivacy}
              className="hover:text-white transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              onClick={handleNavTerms}
              className="hover:text-white transition-colors"
            >
              Terms of Service
            </a>
            <a
              href="mailto:support@planless.life"
              className="text-[#FF6B2C] hover:underline font-medium inline-flex items-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>support@planless.life</span>
            </a>
          </div>

          {/* Copyright */}
          <div className="text-zinc-500 text-center md:text-right">
            © {new Date().getFullYear()} Planless. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Planless;
