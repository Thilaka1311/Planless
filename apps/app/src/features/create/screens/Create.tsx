import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, MapPin, Clock, Users, Check, Link, CheckCircle } from 'lucide-react';
import { usePlansStore } from "../../plans/state/PlansContext";
import { useCirclesStore } from "../../circles/state/CirclesContext";
import { Plan, NotificationItem } from "../../../core/types";
import { getOrCreatePlanInvite, buildInviteUrl } from "../../plans/services/planInviteService";

// Hooks & utils
import { useCreatePlanForm } from "../hooks/useCreatePlanForm";
import { getCategoryImage } from "../utils/constants";
import { useToast } from "../../../shared/contexts/ToastContext";
import { formatDateTimeStandard } from "../../../shared/components/NativeDateTimeField";

// Sub-components
import { BrowseExperiencesStep } from "../../discovery/screens/Discovery";
import { CreatePlanReview } from "./CreatePlanReview";
import { WhenIsPlanScreen } from "./WhenIsPlanScreen";
import { WhoIsComingScreen } from "./WhoIsComingScreen";
import { WhoIsActuallyComing } from "./WhoIsActuallyComing";
import { DiscardPlanBottomSheet } from "../../plans/components/BottomSheets";

import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { supabase } from "../../../../lib/supabaseClient";
import defaultPlanCover from "../../../assets/planimagedefault.png";
import { uploadPlanImage } from "../../../shared/utils/imageUtils";
import { clearDraftParticipants, clearCreatePlanDraft } from "../utils/draftParticipantStorage";


interface CreatePlanScreenProps {
  setActiveTab: (tab: "home" | "plans" | "create" | "circles" | "wallet" | "profile") => void;
  onToggleBottomNav?: (hidden: boolean) => void;
  setPlansFilter?: (filter: 'JOINED' | 'WAITLISTED' | 'SKIPPED') => void;
  setSelectedCircle?: (circle: any) => void;
}

export const CreatePlanScreen = ({
  setActiveTab,
  onToggleBottomNav,
  setPlansFilter,
}: CreatePlanScreenProps) => {
  const { showToast } = useToast();
  const { createPlan } = usePlansStore();
  const { circles, setCircles } = useCirclesStore();

  // Flow states
  const [createPhase, setCreatePhase] = useState<'category' | 'when' | 'who' | 'who-actually' | 'sports_select' | 'customizer' | 'review' | 'confirmation'>('category');
  const [lastSubScreen, setLastSubScreen] = useState<"sports" | "movies" | "dining" | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [postedPlanUuid, setPostedPlanUuid] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isWhenStepValid, setIsWhenStepValid] = useState(true);
  const [returnToWhoActually, setReturnToWhoActually] = useState(false);
  const [returnToPlanSizeSheet, setReturnToPlanSizeSheet] = useState(false);

  const handleCopyInviteLink = async () => {
    if (!postedPlanUuid || isCopying) return;
    setIsCopying(true);
    try {
      const hostUuid = form.userProfile?.dbUuid;
      if (!hostUuid) throw new Error("No host UUID");
      const invite = await getOrCreatePlanInvite(postedPlanUuid, hostUuid);
      if (!invite) throw new Error("Failed to get invite");
      const url = buildInviteUrl(invite.invite_token);
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      showToast("Invite link copied!");
      setTimeout(() => setIsCopied(false), 3000);
    } catch (err) {
      console.error("[CreatePlanScreen] Copy invite failed:", err);
      showToast("Failed to copy invite link");
    } finally {
      setIsCopying(false);
    }
  };

  const handleResetAll = () => {
    setSelectedSubcategory(null);
    form.resetForm();
    setCustomizerStep(0);
    setCameFromReview(false);
    setPostedPlanUuid(null);
    setReturnToPlanSizeSheet(false);
    setCreatePhase('category');
  };

  useEffect(() => {
    const isFlow = createPhase !== 'category';
    onToggleBottomNav?.(isFlow);
    return () => {
      onToggleBottomNav?.(false);
    };
  }, [createPhase, onToggleBottomNav]);

  const [customizerStep, setCustomizerStep] = useState(0);
  const [cameFromReview, setCameFromReview] = useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [startHeight, setStartHeight] = useState(235);
  const [isExpanding, setIsExpanding] = useState(false);
  const [animationStage, setAnimationStage] = useState<'none' | 'lift' | 'expand'>('none');

  const triggerExpansion = () => {
    if (cardRef.current) {
      setStartHeight(cardRef.current.offsetHeight);
    }
    setIsExpanding(true);
    setAnimationStage('lift');

    setTimeout(() => {
      setAnimationStage('expand');

      setTimeout(() => {
        setCreatePhase('review');
        setIsExpanding(false);
        setAnimationStage('none');
      }, 300);
    }, 150);
  };
  const renderExpandingCard = () => {
    const cardClass = animationStage === 'lift' ? 'animate-lift' : 'animate-expand';
    return (
      <div
        className={`mx-5 bg-[#0E0E12] rounded-[28px] overflow-hidden z-25 relative mb-5 select-none border border-white/5 shadow-2xl flex flex-col group ${cardClass}`}
        style={{
          '--start-height': `${startHeight}px`,
          '--end-height': '580px',
          height: animationStage === 'lift' ? `${startHeight}px` : '580px',
        } as React.CSSProperties}
      >
        <DiscoveryImages
          src={getCategoryImage(selectedCategory, selectedSubcategory)}
          category={selectedCategory}
          alt="Activity Cover"
          className="absolute inset-0 w-full h-full object-cover brightness-[0.7] contrast-110 select-none"
        />
        <div
          className="absolute inset-0 z-0"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0.88) 100%)'
          }}
        />
        <div className="relative z-10 w-full p-5 flex flex-col justify-end text-left space-y-4 h-full">
          <div className="mb-1">
            <h1 className="text-[24px] sm:text-[25px] font-[850] text-white leading-none tracking-tight flex items-center drop-shadow-md select-none">
              {selectedCategory === 'sports'
                ? (selectedSubcategory === 'football' ? '⚽ Football' : '🏸 Badminton')
                : selectedCategory === 'movies' ? '🎬 Movies'
                  : selectedCategory === 'dining' ? '🍝 Dining'
                    : '✨ Custom Plan'}
            </h1>
            <div className="w-8 h-[2.5px] bg-[#FF6B2C] rounded-full mt-2.5 opacity-90" />
          </div>

          <div className="space-y-3.5 pt-3 border-t border-white/10 w-full">
            <div className="flex items-start gap-2.5 text-left w-full min-w-0">
              <MapPin className="w-[15px] h-[15px] text-[#FF6B2C] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-[9px] text-white/50 uppercase font-bold tracking-wider leading-none block mb-1">Location</span>
                <span className="text-[13px] font-semibold text-white leading-snug block whitespace-pre-wrap break-words">
                  {form.localLocation || 'Add venue'}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-2.5 text-left w-full min-w-0">
              <Clock className="w-[15px] h-[15px] text-[#FF6B2C] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-[9px] text-white/50 uppercase font-bold tracking-wider leading-none block mb-1">Time</span>
                <span className="text-[13px] font-semibold text-white leading-snug block">
                  {form.eventDateTime ? formatDateTimeStandard(form.eventDateTime) : 'Pick date & time'}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-2.5 text-left w-full min-w-0">
              <Users className="w-[15px] h-[15px] text-[#FF6B2C] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-[9px] text-white/50 uppercase font-bold tracking-wider leading-none block mb-1">Guests</span>
                <div className="flex flex-col gap-1 mt-0.5">
                  <span className="text-[13px] font-semibold text-white leading-none">
                    {/* totalCapacity = invited + 1 host slot */}
                    👥 {form.waitlistEnabled ? `${form.waitlistCapacity + 1} Spots` : `${form.totalCapacity} Spots`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleNavigateStep = (targetStep: number) => {
    setCustomizerStep(targetStep);
  };

  const [selectedCategory, setSelectedCategory] = useState<'sports' | 'movies' | 'dining' | 'custom'>('sports');
  const [selectedSubcategory, setSelectedSubcategory] = useState<'football' | 'badminton' | null>(null);

  // Form hook
  const form = useCreatePlanForm();

  // Auto-prefill custom deadline based on eventDateTime when customizerStep is reached
  useEffect(() => {
    if (customizerStep === 1) {
      form.setCustomDeadline(new Date());
    }
  }, [customizerStep]);

  const handleSelectSubcategory = (sub: 'football' | 'badminton') => {
    setSelectedSubcategory(sub);
    form.resetForm();
    setCustomizerStep(0);
    setCameFromReview(false);
    setCreatePhase('customizer');
  };

  const handleSelectCategory = (cat: 'sports' | 'movies' | 'dining' | 'custom') => {
    setSelectedCategory(cat);
    if (cat === 'sports') {
      setCreatePhase('sports_select');
    } else {
      setSelectedSubcategory(null);
      form.resetForm();
      setCustomizerStep(0);
      setCameFromReview(false);
      setCreatePhase('customizer');
    }
  };

  const handleHostPlanSubmit = async () => {
    if (form.isSubmitting) return;
    form.setIsSubmitting(true);

    const hostUuid = form.userProfile?.dbUuid || form.userProfile?.user_id || form.activeUserId;
    if (!hostUuid) {
      showToast("User profile session is not active. Onboard first.");
      form.setIsSubmitting(false);
      return;
    }

    const titleToUse = form.localTitle ? form.localTitle.trim() : "";
    if (!titleToUse || titleToUse === "Set a title" || titleToUse === "Enter Title") {
      showToast("Please set a title for your plan");
      form.setIsSubmitting(false);
      return;
    }

    const isDateSet = Boolean(form.isDateManuallySet && form.eventDateTime);
    const isCostSet = Boolean(form.isCostManuallySet && form.costAmount !== undefined && form.costAmount !== null);

    if (!isDateSet && !isCostSet) {
      form.setIsSubmitting(false);
      return;
    }
    if (!isDateSet) {
      form.setIsSubmitting(false);
      return;
    }
    if (!isCostSet) {
      form.setIsSubmitting(false);
      return;
    }

    const now = new Date();
    let planEventDate = form.eventDateTime ? new Date(form.eventDateTime) : new Date(Date.now() + 2 * 60 * 60 * 1000);
    if (planEventDate.getTime() < now.getTime() - 60000) {
      planEventDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
    }

    // Formatting Standard: Saturday, Jun 27 • 7:30 PM
    const timeToUse = formatDateTimeStandard(planEventDate);
    const planId = `p_${Date.now()}`;
    const isLocalCustomImage = Boolean(
      form.customCoverImage &&
      (form.customCoverImage.startsWith("data:") ||
        form.customCoverImage.startsWith("blob:") ||
        form.customCoverImage === "custom_draft_blob")
    );
    const coverUrl = isLocalCustomImage
      ? getCategoryImage(selectedCategory, selectedSubcategory)
      : (form.customCoverImage || getCategoryImage(selectedCategory, selectedSubcategory));

    let hoursOffset = 0;
    let isPlanStart = false;

    if (!form.rsvpDeadline) {
      isPlanStart = true;
    } else if (form.rsvpDeadline.includes('1 Hour') || form.rsvpDeadline.includes('1 hour')) {
      hoursOffset = 1;
    } else if (form.rsvpDeadline.includes('3 Hour') || form.rsvpDeadline.includes('3 hour')) {
      hoursOffset = 3;
    } else if (form.rsvpDeadline.includes('6 Hour') || form.rsvpDeadline.includes('6 hour')) {
      hoursOffset = 6;
    } else if (form.rsvpDeadline.includes('12 Hour') || form.rsvpDeadline.includes('12 hour')) {
      hoursOffset = 12;
    } else if (form.rsvpDeadline.includes('24 Hour') || form.rsvpDeadline.includes('24 hour')) {
      hoursOffset = 24;
    }

    let deadlineDate = new Date(planEventDate);
    if (form.rsvpDeadline === 'Custom' && form.customDeadline) {
      deadlineDate = new Date(form.customDeadline);
    } else if (!isPlanStart) {
      deadlineDate.setHours(deadlineDate.getHours() - hoursOffset);
    }

    if (deadlineDate.getTime() <= now.getTime() - 60000 || deadlineDate.getTime() > planEventDate.getTime()) {
      deadlineDate = new Date(planEventDate);
    }

    const responseDeadlineAt = deadlineDate.toISOString();
    const parsedIsoDateTime = planEventDate.toISOString();

    const locationToUse = form.localLocation ? form.localLocation.trim() : "";
    const placeAddressToUse = form.placeAddress ? form.placeAddress.trim() : (locationToUse || "");

    const divisor = form.totalCapacity || (form.selectedFriends.length + (form.isHostSelected ? 1 : 0));
    const costToUse = Math.max(0, Number(form.costAmount) || 0);
    const perPerson = costToUse > 0 && divisor > 0 ? Math.ceil(costToUse / divisor) : 0;

    let dbCategory: string = "CUSTOM";
    let dbSubcategory: string = "OTHER";

    if (selectedCategory && selectedCategory !== "custom") {
      dbCategory = selectedCategory.toUpperCase();
      dbSubcategory = selectedSubcategory ? selectedSubcategory.toUpperCase() : (selectedCategory === "sports" ? "FOOTBALL" : "OTHER");
    }

    const isAssigned = form.waitlistMode === "assigned";
    const planSizeToUse = form.totalCapacity !== undefined && form.totalCapacity !== null ? Number(form.totalCapacity) : null;
    const totalInvited = (form.selectedFriends?.length || 0) + (form.isHostSelected ? 1 : 0);
    const maxParticipantsToUse = Math.max(planSizeToUse || 2, totalInvited || 2);

    const newDbPlan = {
      public_id: planId,
      discovery_item_id: form.discoveryItemId || null,
      category: dbCategory,
      subcategory: dbSubcategory,
      title: titleToUse,
      place_id: form.placeId || null,
      place_name: locationToUse,
      place_address: placeAddressToUse,
      latitude: form.latitude || null,
      longitude: form.longitude || null,
      scheduled_at: parsedIsoDateTime,
      rsvp_deadline: responseDeadlineAt,
      plan_size: planSizeToUse,
      max_participants: maxParticipantsToUse,
      total_cost: costToUse,
      cover_image: coverUrl,
      status: "LIVE" as const,
      participant_filtering: (isAssigned ? "ASSIGNED" : "AUTOMATIC") as 'AUTOMATIC' | 'ASSIGNED',
      waitlist_order_mode: (isAssigned ? "CUSTOM" : "AUTO") as 'AUTO' | 'CUSTOM',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const { dbPlanRow } = await createPlan(
        newDbPlan,
        [],
        form.selectedFriends || [],
        form.userProfile,
        titleToUse,
        form.isHostSelected,
        form.priorityGuestIds || []
      );

      if (form.customCoverBlob && dbPlanRow?.id) {
        try {
          await uploadPlanImage(dbPlanRow.id, form.customCoverBlob);
        } catch (uploadErr) {
          console.error("[CreatePlanFlow] Failed to upload/update plan cover image:", uploadErr);
        }
      }

      setPostedPlanUuid(dbPlanRow?.id || null);
      setCreatePhase("confirmation");
      clearDraftParticipants();
      clearCreatePlanDraft();
      form.setIsSubmitting(false);
      showToast("✨ Plan created successfully!");
    } catch (err: any) {
      console.error("[CreatePlanFlow] Error creating plan:", err);
      form.setIsSubmitting(false);
      showToast(`Failed to create plan: ${err.message || "Unknown error"}`);
    }
  };

  // CUSTOMIZER PHASE (DEPRECATED - redirect to 'when' phase directly)
  if (createPhase === 'customizer') {
    return null;
  }

  // WHEN PHASE
  if (createPhase === 'when') {
    return (
      <WhenIsPlanScreen
        form={form}
        coverImage={form.customCoverImage || getCategoryImage(selectedCategory, selectedSubcategory)}
        title={form.localTitle || "New Activity"}
        onBack={() => {
          if (cameFromReview) {
            setCreatePhase('review');
          } else {
            setCreatePhase('category');
          }
        }}
        onContinue={() => {
          if (cameFromReview) {
            setCameFromReview(false);
            setCreatePhase('review');
          } else {
            setCreatePhase('who');
          }
        }}
        selectedCategory={selectedCategory}
        selectedSubcategory={selectedSubcategory}
      />
    );
  }

  // WHO PHASE
  if (createPhase === 'who') {
    return (
      <WhoIsComingScreen
        form={form}
        onBack={() => {
          if (returnToWhoActually) {
            setReturnToWhoActually(false);
            setCreatePhase('who-actually');
          } else if (cameFromReview) {
            setCameFromReview(false);
            setCreatePhase('review');
          } else {
            setCreatePhase('category');
          }
        }}
        onContinue={() => {
          setReturnToWhoActually(false);
          setCreatePhase('who-actually');
        }}
        selectedCategory={selectedCategory}
        selectedSubcategory={selectedSubcategory}
      />
    );
  }

  // WHO ACTUALLY PHASE
  if (createPhase === 'who-actually') {
    return (
      <WhoIsActuallyComing
        form={form}
        selectedCategory={selectedCategory}
        onBack={() => {
          if (cameFromReview) {
            setCameFromReview(false);
            setCreatePhase('review');
          } else {
            setCreatePhase('who');
          }
        }}
        onContinue={() => {
          setCameFromReview(false);
          setCreatePhase('review');
        }}
        onAddFriends={() => {
          setReturnToWhoActually(true);
          setReturnToPlanSizeSheet(true);
          setCreatePhase('who');
        }}
        initialOpenPlanSizeSheet={returnToPlanSizeSheet}
        onPlanSizeSheetDismissed={() => setReturnToPlanSizeSheet(false)}
      />
    );
  }

  // REVIEW PHASE
  if (createPhase === 'review') {
    return (
      <div className="flex-1 flex flex-col relative h-full bg-[#050505] overflow-hidden text-left">
        <CreatePlanReview
          form={form}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
          onExit={() => setShowCancelConfirm(true)}
          onBack={() => setShowCancelConfirm(true)}
          onEditDate={() => {
            setCameFromReview(true);
            setCreatePhase('when');
          }}
          onEditParticipants={() => {
            setCameFromReview(true);
            setCreatePhase('who-actually');
          }}
          onAddParticipants={() => {
            setReturnToWhoActually(true);
            setReturnToPlanSizeSheet(true);
            setCreatePhase('who');
          }}
          onSubmit={handleHostPlanSubmit}
          isSubmitting={form.isSubmitting}
        />

        {/* Discard Confirmation Bottom Sheet */}
        <DiscardPlanBottomSheet
          isOpen={showCancelConfirm}
          onDiscard={() => {
            setShowCancelConfirm(false);
            setSelectedSubcategory(null);
            form.resetForm();
            setCustomizerStep(0);
            setCameFromReview(false);
            setCreatePhase('category');
          }}
          onClose={() => setShowCancelConfirm(false)}
        />
      </div>
    );
  }

  // CONFIRMATION PHASE
  if (createPhase === 'confirmation') {
    // Particle positions: small orange dots that burst outward
    const PARTICLES = [
      { angle: 0, dist: 72 },
      { angle: 45, dist: 80 },
      { angle: 90, dist: 72 },
      { angle: 135, dist: 80 },
      { angle: 180, dist: 72 },
      { angle: 225, dist: 80 },
      { angle: 270, dist: 72 },
      { angle: 315, dist: 80 },
    ] as const;

    const prefersReducedMotion = typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

    const springTransition = { type: 'spring', stiffness: 420, damping: 28 } as const;

    return (
      <motion.div
        className="flex-1 flex flex-col justify-between relative h-full bg-[#050505] overflow-hidden text-left"
        initial={prefersReducedMotion ? {} : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
      >
        {/* ─── Upper: Hero animation + text ─── */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-10">

          {/* Success orb + ring + particles */}
          <div className="relative flex items-center justify-center">

            {/* Expanding glow ring */}
            <motion.div
              className="absolute rounded-full border border-[#FF6B2C]/40"
              initial={prefersReducedMotion ? {} : { width: 80, height: 80, opacity: 0.6 }}
              animate={{ width: 160, height: 160, opacity: 0 }}
              transition={{ duration: 1.1, ease: 'easeOut', delay: 0.15 }}
            />

            {/* Second subtler ring */}
            <motion.div
              className="absolute rounded-full border border-[#FF6B2C]/20"
              initial={prefersReducedMotion ? {} : { width: 80, height: 80, opacity: 0.4 }}
              animate={{ width: 200, height: 200, opacity: 0 }}
              transition={{ duration: 1.4, ease: 'easeOut', delay: 0.2 }}
            />

            {/* Particles */}
            {!prefersReducedMotion && PARTICLES.map((p, i) => {
              const rad = (p.angle * Math.PI) / 180;
              const tx = Math.cos(rad) * p.dist;
              const ty = Math.sin(rad) * p.dist;
              return (
                <motion.div
                  key={i}
                  className="absolute w-1.5 h-1.5 rounded-full bg-[#FF6B2C]"
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x: tx, y: ty, opacity: 0, scale: 0.4 }}
                  transition={{ duration: 0.65, ease: 'easeOut', delay: 0.12 + i * 0.018 }}
                />
              );
            })}

            {/* Main orb */}
            <motion.div
              className="relative w-24 h-24 bg-[#FF6B2C]/10 border border-[#FF6B2C]/30 rounded-full flex items-center justify-center"
              style={{ boxShadow: '0 0 32px 0 rgba(255,107,44,0.18)' }}
              initial={prefersReducedMotion ? {} : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...springTransition, delay: 0.05 }}
            >
              {/* Check icon draws in */}
              <motion.div
                initial={prefersReducedMotion ? {} : { scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ ...springTransition, delay: 0.2 }}
              >
                <Check className="w-11 h-11 text-[#FF6B2C] stroke-[2.5]" />
              </motion.div>
            </motion.div>
          </div>

          {/* Text block */}
          <div className="text-center space-y-3">
            <motion.h2
              className="text-3xl font-black text-white tracking-tight leading-none"
              initial={prefersReducedMotion ? {} : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.28 }}
            >
              Plan Created!
            </motion.h2>
            <motion.p
              className="text-[13px] text-zinc-500 font-medium max-w-[240px] mx-auto leading-relaxed"
              initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.38 }}
            >
              Your plan is live. Share it with the people you want there.
            </motion.p>
          </div>
        </div>

        {/* ─── Actions Footer ─── */}
        <motion.div
          className="px-5 pb-10 pt-4 space-y-3 w-full"
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.48 }}
        >
          {/* Send Link — primary */}
          <motion.button
            type="button"
            onClick={handleCopyInviteLink}
            disabled={isCopying}
            className="w-full bg-[#FF6B2C] text-[#050505] py-4 rounded-2xl font-black text-[11px] tracking-widest uppercase flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer select-none"
            style={{ boxShadow: '0 8px 28px rgba(255,107,44,0.28)' }}
            whileTap={prefersReducedMotion ? {} : { scale: 0.97 }}
            transition={springTransition}
          >
            {isCopied ? (
              <>
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Link className="w-4 h-4 shrink-0" />
                <span>{isCopying ? 'Generating...' : 'Send Link'}</span>
              </>
            )}
          </motion.button>

          {/* Go to Plans — secondary */}
          <motion.button
            type="button"
            onClick={() => {
              handleResetAll();
              setActiveTab('plans');
            }}
            className="w-full bg-transparent border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 py-4 rounded-2xl font-bold text-[11px] tracking-widest uppercase flex items-center justify-center transition-colors cursor-pointer select-none"
            whileTap={prefersReducedMotion ? {} : { scale: 0.97 }}
            transition={springTransition}
          >
            Go to Plans
          </motion.button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <BrowseExperiencesStep
      userProfile={form.userProfile}
      setActiveTab={setActiveTab}
      initialSubScreen={lastSubScreen}
      onSubScreenChange={setLastSubScreen}

      onSelectDiscoveryItem={(item) => {
        // 1. Reset any previous form inputs
        form.resetForm();

        // 2. Setup category and subcategory
        const lowerCategory = item.category ? item.category.toLowerCase() : "custom";
        setSelectedCategory(lowerCategory as any);
        setSelectedSubcategory(item.subcategory ? (item.subcategory.toLowerCase() as any) : null);

        // Store selected discovery item id
        if (form.setDiscoveryItemId) form.setDiscoveryItemId(item.id);

        // 3. Pre-fill essential metadata only
        form.setLocalTitle(item.title);
        form.setLocalLocation(item.location || "");
        form.setCustomCoverImage(item.cover_image_url || defaultPlanCover);

        // Pre-populate coordinate mapping metadata from discovery selection
        if (form.setPlaceId) form.setPlaceId((item as any).place_id || null);
        if (form.setPlaceAddress) form.setPlaceAddress((item as any).place_address || item.location || null);
        if (form.setLatitude) form.setLatitude((item as any).latitude || null);
        if (form.setLongitude) form.setLongitude((item as any).longitude || null);

        // Notes, Cost, RSVP Deadline, and Participants are intentionally left empty/default
        form.setCostAmount(0);
        form.setIsCostManuallySet(false);
        form.setTotalCapacity(undefined);
        form.setIsDateManuallySet(false);
        form.setQuickNote("");

        // 4. Entry into WhoIsComingScreen first
        setCreatePhase('who');
      }}
      onSelectCustomPlan={() => {
        // Reset and launch manual create wizard for custom plans
        setSelectedCategory('custom');
        setSelectedSubcategory(null);
        form.resetForm();
        form.setLocalTitle("");
        form.setLocalLocation("");
        form.setCustomCoverImage(null, null);
        form.setCostAmount(0);
        form.setIsCostManuallySet(false);
        form.setIsDateManuallySet(false);
        form.setTotalCapacity(undefined);
        setCreatePhase('who');
        setCustomizerStep(0);
      }}
    />
  );
};
