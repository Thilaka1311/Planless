import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Link, CheckCircle } from "lucide-react";
import { usePlansStore } from "../../plans/state/PlansContext";
import { useCirclesStore } from "../../circles/state/CirclesContext";
import { getOrCreatePlanInvite, buildInviteUrl } from "../../plans/services/planInviteService";

// Hooks & utils
import { useCreatePlanForm } from "../hooks/useCreatePlanForm";
import { getCategoryImage } from "../utils/constants";
import { useToast } from "../../../shared/contexts/ToastContext";
import { formatDateTimeStandard } from "../../../shared/components/NativeDateTimeField";

// Sub-components
import { CreateCategoryScreen, CREATE_CATEGORIES } from "./CreateCategoryScreen";
import { CreatePlanReview } from "./CreatePlanReview";
import { WhenIsPlanScreen } from "./WhenIsPlanScreen";
import { WhoIsComingScreen } from "./WhoIsComingScreen";
import { WhoIsActuallyComing } from "./WhoIsActuallyComing";
import { DiscardPlanBottomSheet } from "../../plans/components/BottomSheets";

import { supabase } from "../../../../lib/supabaseClient";
import defaultPlanCover from "../../../assets/planimagedefault.png";
import { uploadPlanImage } from "../../../shared/utils/imageUtils";

interface CreateMVPProps {
  setActiveTab: (tab: "home" | "plans" | "create" | "circles" | "wallet" | "profile") => void;
  onToggleBottomNav?: (hidden: boolean) => void;
  setPlansFilter?: (filter: "JOINED" | "WAITLISTED" | "SKIPPED") => void;
  setSelectedCircle?: (circle: any) => void;
}

export const CreateMVP: React.FC<CreateMVPProps> = ({
  setActiveTab,
  onToggleBottomNav,
  setPlansFilter,
}) => {
  const { showToast } = useToast();
  const { createPlan } = usePlansStore();

  // Flow: 'category' -> 'who' -> 'who-actually' -> 'review' -> 'confirmation'
  const [createPhase, setCreatePhase] = useState<"category" | "who" | "who-actually" | "when" | "review" | "confirmation">("category");
  const [selectedCategory, setSelectedCategory] = useState<"sports" | "movies" | "dining" | "custom">("custom");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [postedPlanUuid, setPostedPlanUuid] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [cameFromReview, setCameFromReview] = useState(false);
  const [returnToWhoActually, setReturnToWhoActually] = useState(false);
  const [returnToPlanSizeSheet, setReturnToPlanSizeSheet] = useState(false);

  // Form hook
  const form = useCreatePlanForm();

  // Toggle bottom navigation: visible on category screen, hidden during the creation wizard
  useEffect(() => {
    const shouldHideNav = createPhase !== "category";
    onToggleBottomNav?.(shouldHideNav);
    return () => {
      onToggleBottomNav?.(false);
    };
  }, [createPhase, onToggleBottomNav]);

  const handleSelectCategory = (category: "sports" | "movies" | "dining" | "custom") => {
    setSelectedCategory(category);
    setSelectedSubcategory(null);

    // Find category cover image config
    const categoryConfig = CREATE_CATEGORIES.find((c) => c.id === category);
    const coverImage = categoryConfig?.image || defaultPlanCover;

    // Reset draft form inputs
    form.resetForm();
    form.setLocalTitle("");
    form.setLocalLocation("");
    form.setCustomCoverImage(coverImage);
    form.setCostAmount(0);
    form.setIsCostManuallySet(false);
    form.setIsDateManuallySet(false);
    form.setTotalCapacity(undefined);
    form.setQuickNote("");

    // Immediately transition to Who Is Coming
    setCreatePhase("who");
  };

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
      console.error("[CreateMVP] Copy invite failed:", err);
      showToast("Failed to copy invite link");
    } finally {
      setIsCopying(false);
    }
  };

  const handleResetAll = () => {
    form.resetForm();
    setCameFromReview(false);
    setPostedPlanUuid(null);
    setReturnToPlanSizeSheet(false);
    setReturnToWhoActually(false);
    setCreatePhase("category");
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

    const planId = `p_${Date.now()}`;
    const hasCustomImage = form.customCoverImage && form.customCoverImage.startsWith("data:");
    const coverUrl = hasCustomImage
      ? getCategoryImage(selectedCategory, selectedSubcategory)
      : (form.customCoverImage || getCategoryImage(selectedCategory, selectedSubcategory));

    let hoursOffset = 0;
    let isPlanStart = false;

    if (!form.rsvpDeadline) {
      isPlanStart = true;
    } else if (form.rsvpDeadline.includes("1 Hour") || form.rsvpDeadline.includes("1 hour")) {
      hoursOffset = 1;
    } else if (form.rsvpDeadline.includes("3 Hour") || form.rsvpDeadline.includes("3 hour")) {
      hoursOffset = 3;
    } else if (form.rsvpDeadline.includes("6 Hour") || form.rsvpDeadline.includes("6 hour")) {
      hoursOffset = 6;
    } else if (form.rsvpDeadline.includes("12 Hour") || form.rsvpDeadline.includes("12 hour")) {
      hoursOffset = 12;
    } else if (form.rsvpDeadline.includes("24 Hour") || form.rsvpDeadline.includes("24 hour")) {
      hoursOffset = 24;
    }

    let deadlineDate = new Date(planEventDate);
    if (form.rsvpDeadline === "Custom" && form.customDeadline) {
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

    const costToUse = Math.max(0, Number(form.costAmount) || 0);
    const isAssigned = form.waitlistMode === "assigned";
    const planSizeToUse = form.totalCapacity !== undefined && form.totalCapacity !== null ? Number(form.totalCapacity) : null;
    const totalInvited = (form.selectedFriends?.length || 0) + (form.isHostSelected ? 1 : 0);
    const maxParticipantsToUse = Math.max(planSizeToUse || 2, totalInvited || 2);

    let dbCategory: string = "CUSTOM";
    if (selectedCategory) {
      dbCategory = selectedCategory.toUpperCase();
    }

    const newDbPlan = {
      public_id: planId,
      discovery_item_id: form.discoveryItemId || null,
      category: dbCategory,
      subcategory: "OTHER",
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
      participant_filtering: (isAssigned ? "ASSIGNED" : "AUTOMATIC") as "AUTOMATIC" | "ASSIGNED",
      waitlist_order_mode: (isAssigned ? "CUSTOM" : "AUTO") as "AUTO" | "CUSTOM",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
          console.error("[CreateMVP] Failed to upload/update plan cover image:", uploadErr);
        }
      }

      setPostedPlanUuid(dbPlanRow?.id || null);
      setCreatePhase("confirmation");
      form.setIsSubmitting(false);
      showToast("✨ Plan created successfully!");
    } catch (err: any) {
      console.error("[CreateMVP] Error creating plan:", err);
      form.setIsSubmitting(false);
      showToast(`Failed to create plan: ${err.message || "Unknown error"}`);
    }
  };

  // STEP 0: CREATE CATEGORY SELECTION SCREEN
  if (createPhase === "category") {
    return (
      <CreateCategoryScreen
        userProfile={form.userProfile}
        setActiveTab={setActiveTab}
        onSelectCategory={handleSelectCategory}
      />
    );
  }

  // STEP 1: WHO IS COMING
  if (createPhase === "who") {
    return (
      <div className="flex-1 flex flex-col relative h-full bg-[#000000] overflow-hidden text-left">
        <WhoIsComingScreen
          form={form}
          onBack={() => {
            if (returnToWhoActually) {
              setReturnToWhoActually(false);
              setCreatePhase("who-actually");
            } else if (cameFromReview) {
              setCameFromReview(false);
              setCreatePhase("review");
            } else {
              setCreatePhase("category");
            }
          }}
          onContinue={() => {
            setReturnToWhoActually(false);
            setCreatePhase("who-actually");
          }}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
        />

        {/* Discard Confirmation Bottom Sheet */}
        <DiscardPlanBottomSheet
          isOpen={showCancelConfirm}
          onDiscard={() => {
            setShowCancelConfirm(false);
            handleResetAll();
          }}
          onClose={() => setShowCancelConfirm(false)}
        />
      </div>
    );
  }

  // STEP 2: WHO WAS ACTUALLY COMING (PARTICIPANT MANAGEMENT)
  if (createPhase === "who-actually") {
    return (
      <div className="flex-1 flex flex-col relative h-full bg-[#050505] overflow-hidden text-left">
        <WhoIsActuallyComing
          form={form}
          selectedCategory={selectedCategory}
          onBack={() => {
            if (cameFromReview) {
              setCameFromReview(false);
              setCreatePhase("review");
            } else {
              setCreatePhase("who");
            }
          }}
          onContinue={() => {
            setCameFromReview(false);
            setCreatePhase("review");
          }}
          onAddFriends={() => {
            setReturnToWhoActually(true);
            setReturnToPlanSizeSheet(true);
            setCreatePhase("who");
          }}
          initialOpenPlanSizeSheet={returnToPlanSizeSheet}
          onPlanSizeSheetDismissed={() => setReturnToPlanSizeSheet(false)}
        />
      </div>
    );
  }

  // STEP 3: CREATE PLAN REVIEW
  if (createPhase === "review") {
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
            setCreatePhase("when");
          }}
          onEditParticipants={() => {
            setCameFromReview(true);
            setCreatePhase("who-actually");
          }}
          onAddParticipants={() => {
            setReturnToWhoActually(true);
            setReturnToPlanSizeSheet(true);
            setCreatePhase("who");
          }}
          onSubmit={handleHostPlanSubmit}
          isSubmitting={form.isSubmitting}
        />

        {/* Discard Confirmation Bottom Sheet */}
        <DiscardPlanBottomSheet
          isOpen={showCancelConfirm}
          onDiscard={() => {
            setShowCancelConfirm(false);
            handleResetAll();
          }}
          onClose={() => setShowCancelConfirm(false)}
        />
      </div>
    );
  }

  // OPTIONAL EDIT PHASE: WHEN IS PLAN (Accessible from Review -> Edit Date)
  if (createPhase === "when") {
    return (
      <div className="flex-1 flex flex-col relative h-full bg-[#000000] overflow-hidden text-left">
        <WhenIsPlanScreen
          form={form}
          coverImage={form.customCoverImage || getCategoryImage(selectedCategory, selectedSubcategory)}
          title={form.localTitle || "New Activity"}
          onBack={() => {
            setCreatePhase("review");
          }}
          onContinue={() => {
            setCreatePhase("review");
          }}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
        />
      </div>
    );
  }

  // CONFIRMATION PHASE
  if (createPhase === "confirmation") {
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

    const prefersReducedMotion = typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

    const springTransition = { type: "spring", stiffness: 420, damping: 28 } as const;

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
              transition={{ duration: 1.1, ease: "easeOut", delay: 0.15 }}
            />

            {/* Second subtler ring */}
            <motion.div
              className="absolute rounded-full border border-[#FF6B2C]/20"
              initial={prefersReducedMotion ? {} : { width: 80, height: 80, opacity: 0.4 }}
              animate={{ width: 200, height: 200, opacity: 0 }}
              transition={{ duration: 1.4, ease: "easeOut", delay: 0.2 }}
            />

            {/* Particles */}
            {!prefersReducedMotion &&
              PARTICLES.map((p, i) => {
                const rad = (p.angle * Math.PI) / 180;
                const tx = Math.cos(rad) * p.dist;
                const ty = Math.sin(rad) * p.dist;
                return (
                  <motion.div
                    key={i}
                    className="absolute w-1.5 h-1.5 rounded-full bg-[#FF6B2C]"
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{ x: tx, y: ty, opacity: 0, scale: 0.4 }}
                    transition={{ duration: 0.65, ease: "easeOut", delay: 0.12 + i * 0.018 }}
                  />
                );
              })}

            {/* Main orb */}
            <motion.div
              className="relative w-24 h-24 bg-[#FF6B2C]/10 border border-[#FF6B2C]/30 rounded-full flex items-center justify-center"
              style={{ boxShadow: "0 0 32px 0 rgba(255,107,44,0.18)" }}
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
            style={{ boxShadow: "0 8px 28px rgba(255,107,44,0.28)" }}
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
                <span>{isCopying ? "Generating..." : "Send Link"}</span>
              </>
            )}
          </motion.button>

          {/* Go to Plans — secondary */}
          <motion.button
            type="button"
            onClick={() => {
              handleResetAll();
              if (setPlansFilter) setPlansFilter("JOINED");
              setActiveTab("plans");
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

  return null;
};
