import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Link, CheckCircle } from "lucide-react";
import { usePlansStore } from "../../plans/state/PlansContext";
import { buildInviteUrl, copyInviteUrlToClipboard } from "../../plans/services/planInviteService";

// Hooks & utils
import { useCreatePlanForm } from "../hooks/useCreatePlanForm";
import { useFriendshipStore } from "../../friendships/state/FriendshipContext";
import { getPlanCover } from "../../plans/config/planCoverImages";
import { formatDateTimeStandard } from "../../../shared/components/NativeDateTimeField";

// Sub-components
import { CreateCategoryScreen, CREATE_CATEGORIES } from "./CreateCategoryScreen";
import { CreatePlanReview } from "./CreatePlanReview";
import { WhenIsPlanScreen } from "./WhenIsPlanScreen";
import { WhoIsComingScreen } from "./WhoIsComingScreen";
import { WhoIsActuallyComing } from "./WhoIsActuallyComing";
import { DiscardPlanBottomSheet } from "../../plans/components/BottomSheets";
import { CreatePlanConfirmation } from "../components/CreatePlanConfirmation";
import { FriendshipsScreen } from "../../friendships/screens/FriendshipsScreen";

import { supabase } from "../../../../lib/supabaseClient";
import defaultPlanCover from "../../../assets/planimagedefault.png";
import { uploadPlanImage, uploadPlanCardImage } from "../../../shared/utils/imageUtils";
import {
  getSavedCreatePlanDraft,
  saveCreatePlanDraft,
  clearCreatePlanDraft,
} from "../utils/draftParticipantStorage";
import {
  parseCurrentRoute,
  navigateToRoute,
  listenToNavigation,
  CreatePhase,
} from "../../navigation/appRouter";

interface CreateMVPProps {
  setActiveTab: (tab: "home" | "plans" | "create" | "wallet" | "profile") => void;
  onToggleBottomNav?: (hidden: boolean) => void;
  setPlansFilter?: (filter: "JOINED" | "WAITLISTED" | "SKIPPED") => void;
}

export const CreateMVP: React.FC<CreateMVPProps> = ({
  setActiveTab,
  onToggleBottomNav,
  setPlansFilter,
}) => {
  const { createPlan } = usePlansStore();

  const initialRoute = React.useMemo(() => parseCurrentRoute(), []);
  const initialDraft = React.useMemo(() => getSavedCreatePlanDraft(), []);

  // Flow: 'category' -> 'who' -> 'who-actually' -> 'review' -> 'confirmation'
  const [createPhase, setCreatePhase] = useState<CreatePhase>(() => {
    if (initialRoute.tab === "create" && initialRoute.createPhase) {
      return initialRoute.createPhase;
    }
    if (initialDraft?.createPhase && initialDraft.createPhase !== "confirmation") {
      return initialDraft.createPhase;
    }
    return "category";
  });
  const [selectedCategory, setSelectedCategory] = useState<"sports" | "movies" | "dining" | "custom">(() => {
    return initialDraft?.selectedCategory || "custom";
  });
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(() => {
    return initialDraft?.selectedSubcategory || null;
  });

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [postedPlanUuid, setPostedPlanUuid] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [cameFromReview, setCameFromReview] = useState(() => Boolean(initialDraft?.cameFromReview));
  const [returnToWhoActually, setReturnToWhoActually] = useState(() => Boolean(initialDraft?.returnToWhoActually));
  const [returnToPlanSizeSheet, setReturnToPlanSizeSheet] = useState(() => Boolean(initialDraft?.returnToPlanSizeSheet));
  const [showDiscoverFriends, setShowDiscoverFriends] = useState(false);

  // Form hook
  const form = useCreatePlanForm();
  const { friends, loading: friendshipLoading } = useFriendshipStore();

  const transitionToPhase = (nextPhase: CreatePhase) => {
    setCreatePhase(nextPhase);
    navigateToRoute({ tab: "create", createPhase: nextPhase });
    saveCreatePlanDraft({ createPhase: nextPhase });
  };

  // Sync draft and URL whenever navigation state changes
  useEffect(() => {
    navigateToRoute({ tab: "create", createPhase }, { replace: true });
    saveCreatePlanDraft({
      createPhase,
      selectedCategory,
      selectedSubcategory,
      cameFromReview,
      returnToWhoActually,
      returnToPlanSizeSheet,
    });
  }, [createPhase, selectedCategory, selectedSubcategory, cameFromReview, returnToWhoActually, returnToPlanSizeSheet]);

  // Listen to browser Back / Forward buttons
  useEffect(() => {
    const unsubscribe = listenToNavigation((route) => {
      if (route.tab === "create" && route.createPhase && route.createPhase !== createPhase) {
        setCreatePhase(route.createPhase);
      }
    });
    return unsubscribe;
  }, [createPhase]);

  // If user has zero friends, guarantee that who-actually is never rendered
  useEffect(() => {
    if (!friendshipLoading && friends.length === 0 && createPhase === "who-actually") {
      transitionToPhase("review");
    }
  }, [friendshipLoading, friends.length, createPhase]);

  // Toggle bottom navigation: visible on category screen, hidden during the creation wizard
  useEffect(() => {
    const shouldHideNav = createPhase !== "category" || showDiscoverFriends;
    onToggleBottomNav?.(shouldHideNav);
    return () => {
      onToggleBottomNav?.(false);
    };
  }, [createPhase, showDiscoverFriends, onToggleBottomNav]);

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
    form.setCustomCoverImage(null, null);
    form.setCostAmount(0);
    form.setIsCostManuallySet(false);
    form.setIsDateManuallySet(false);
    form.setTotalCapacity(undefined);
    form.setQuickNote("");

    saveCreatePlanDraft({
      selectedCategory: category,
      selectedSubcategory: null,
      customCoverImage: null,
      createPhase: "who",
    });

    // Always navigate to Who's Coming screen so zero-friends users see the empty state & add-friends UI
    transitionToPhase("who");
  };

  const handleCopyInviteLink = async () => {
    if (!postedPlanUuid || isCopying) return;
    setIsCopying(true);
    try {
      const url = buildInviteUrl(postedPlanUuid);
      const copied = await copyInviteUrlToClipboard(url);
      if (copied) {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 3000);
      }
    } catch (err) {
      console.error("[CreateMVP] Copy invite failed:", err);
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
    clearCreatePlanDraft();
    transitionToPhase("category");
  };

  const handleHostPlanSubmit = async () => {
    if (form.isSubmitting) return;
    form.setIsSubmitting(true);

    const hostUuid = form.userProfile?.dbUuid || form.userProfile?.user_id || form.activeUserId;
    if (!hostUuid) {
      form.setIsSubmitting(false);
      return;
    }

    const titleToUse = form.localTitle ? form.localTitle.trim() : "";
    if (!titleToUse || titleToUse === "Set a title" || titleToUse === "Enter Title") {
      form.setIsSubmitting(false);
      return;
    }

    const isDateSet = Boolean(form.isDateManuallySet && form.eventDateTime);
    const rawLocation = (form.localLocation || form.placeAddress || "").trim();
    const isLocationSet = Boolean(
      rawLocation &&
      rawLocation !== "Add a location" &&
      rawLocation !== "Add venue" &&
      rawLocation !== "Search for a place…"
    );
    const isCostSet = Boolean(form.isCostManuallySet && form.costAmount !== undefined && form.costAmount !== null);

    if (!isDateSet || !isLocationSet) {
      form.setIsSubmitting(false);
      return;
    }

    const now = new Date();
    let planEventDate = form.eventDateTime ? new Date(form.eventDateTime) : new Date(Date.now() + 2 * 60 * 60 * 1000);
    if (planEventDate.getTime() < now.getTime() - 60000) {
      planEventDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
    }

    const planId = `p_${Date.now()}`;
    const isLocalCustomImage = Boolean(
      form.customOriginalImage &&
      (form.customOriginalImage.startsWith('data:') ||
        form.customOriginalImage.startsWith('blob:') ||
        form.customOriginalImage === 'custom_draft_blob')
    ) || Boolean(
      form.customCoverImage &&
      (form.customCoverImage.startsWith('data:') ||
        form.customCoverImage.startsWith('blob:') ||
        form.customCoverImage === 'custom_draft_blob')
    );
    const coverUrl = isLocalCustomImage
      ? getPlanCover(selectedCategory, selectedSubcategory)
      : (form.customOriginalImage || form.customCoverImage || getPlanCover(selectedCategory, selectedSubcategory));

    let hoursOffset = 0;
    let isPlanStart = false;

    if (!form.rsvpDeadline || form.rsvpDeadline === "Plan start" || form.rsvpDeadline === "Plan Start") {
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

    const isExplicitNoDeadline = form.rsvpDeadline === "No deadline" || form.rsvpDeadline === "-";
    const hasDeadline = !isExplicitNoDeadline;
    let deadlineDate = new Date(planEventDate);
    if (hasDeadline) {
      if (form.rsvpDeadline === "Custom" && form.customDeadline) {
        deadlineDate = new Date(form.customDeadline);
      } else if (!isPlanStart) {
        deadlineDate.setHours(deadlineDate.getHours() - hoursOffset);
      }
      if (deadlineDate.getTime() < now.getTime()) {
        form.setIsSubmitting(false);
        return;
      }
    }

    if (deadlineDate.getTime() > planEventDate.getTime()) {
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

    let dbCategory: string = "CUSTOM";
    if (selectedCategory) {
      dbCategory = selectedCategory.toUpperCase();
    }

    const newDbPlan = {
      public_id: planId,
      discovery_item_id: form.discoveryItemId || null,
      category: dbCategory,
      subcategory: selectedSubcategory ? selectedSubcategory.toUpperCase() : "OTHER",
      title: titleToUse,
      place_id: form.placeId || null,
      place_name: locationToUse,
      place_address: placeAddressToUse,
      latitude: form.latitude || null,
      longitude: form.longitude || null,
      scheduled_at: parsedIsoDateTime,
      rsvp_deadline: responseDeadlineAt,
      plan_size: planSizeToUse,
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
        form.selectedFriends || [],
        form.userProfile,
        titleToUse,
        form.isHostSelected,
        form.priorityGuestIds || []
      );

      // Upload original image → cover_image
      if (form.customOriginalBlob && dbPlanRow?.id) {
        try {
          await uploadPlanImage(dbPlanRow.id, form.customOriginalBlob);
        } catch (uploadErr) {
          console.error('[CreateMVP] Failed to upload original plan cover image:', uploadErr);
        }
      } else if (form.customCoverBlob && dbPlanRow?.id) {
        try {
          await uploadPlanImage(dbPlanRow.id, form.customCoverBlob);
        } catch (uploadErr) {
          console.error('[CreateMVP] Failed to upload plan cover image (fallback):', uploadErr);
        }
      }

      // Upload cropped portrait → cover_card_image
      if (form.customCoverBlob && form.customOriginalBlob && dbPlanRow?.id) {
        try {
          await uploadPlanCardImage(dbPlanRow.id, form.customCoverBlob);
        } catch (uploadErr) {
          console.error('[CreateMVP] Failed to upload plan card image:', uploadErr);
        }
      }

      setPostedPlanUuid(dbPlanRow?.id || null);
      clearCreatePlanDraft();
      transitionToPhase("confirmation");
      form.setIsSubmitting(false);
    } catch (err: any) {
      console.error("[CreateMVP] Error creating plan:", err);
      form.setIsSubmitting(false);
    }
  };

  // STEP 0: CREATE CATEGORY SELECTION SCREEN
  if (showDiscoverFriends) {
    return (
      <div className="flex-1 flex flex-col relative h-full bg-[#000000] overflow-hidden text-left">
        <FriendshipsScreen
          onBack={() => setShowDiscoverFriends(false)}
          initialScreen="discover"
        />
      </div>
    );
  }

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
              transitionToPhase("who-actually");
            } else if (cameFromReview) {
              setCameFromReview(false);
              transitionToPhase("review");
            } else {
              transitionToPhase("category");
            }
          }}
          onContinue={() => {
            setReturnToWhoActually(false);
            setCameFromReview(false);
            transitionToPhase("review");
          }}
          onNavigateToDiscoverFriends={() => setShowDiscoverFriends(true)}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
        />

        {/* Discard Confirmation Bottom Sheet */}
        <DiscardPlanBottomSheet
          isOpen={showCancelConfirm}
          planTitle={form.localTitle || "New Plan"}
          planCoverImage={form.customOriginalImage || form.customCoverImage}
          planCategory={selectedCategory}
          planSubcategory={selectedSubcategory}
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
    if (friendshipLoading) {
      return <div className="flex-1 bg-[#050505]" />;
    }
    if (friends.length === 0) {
      return null;
    }
    return (
      <div className="flex-1 flex flex-col relative h-full bg-[#050505] overflow-hidden text-left">
        <WhoIsActuallyComing
          form={form}
          selectedCategory={selectedCategory}
          onBack={() => {
            setCameFromReview(false);
            transitionToPhase("review");
          }}
          onContinue={() => {
            setCameFromReview(false);
            transitionToPhase("review");
          }}
          onAddFriends={() => {
            setReturnToWhoActually(true);
            setReturnToPlanSizeSheet(true);
            transitionToPhase("who");
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
            transitionToPhase("when");
          }}
          onEditParticipants={() => {
            setCameFromReview(true);
            if (friends.length === 0) {
              transitionToPhase("who");
            } else {
              transitionToPhase("who-actually");
            }
          }}
          onAddParticipants={() => {
            setReturnToWhoActually(friends.length > 0);
            setReturnToPlanSizeSheet(friends.length > 0);
            transitionToPhase("who");
          }}
          onSubmit={handleHostPlanSubmit}
          isSubmitting={form.isSubmitting}
        />

        {/* Discard Confirmation Bottom Sheet */}
        <DiscardPlanBottomSheet
          isOpen={showCancelConfirm}
          planTitle={form.localTitle || "New Plan"}
          planCoverImage={form.customOriginalImage || form.customCoverImage}
          planCategory={selectedCategory}
          planSubcategory={selectedSubcategory}
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
          coverImage={form.customOriginalImage || form.customCoverImage || getPlanCover(selectedCategory, selectedSubcategory)}
          title={form.localTitle || "New Activity"}
          onBack={() => {
            transitionToPhase("review");
          }}
          onContinue={() => {
            transitionToPhase("review");
          }}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
        />
      </div>
    );
  }

  // CONFIRMATION PHASE
  if (createPhase === "confirmation") {
    return (
      <CreatePlanConfirmation
        onCopyInviteLink={handleCopyInviteLink}
        isCopying={isCopying}
        isCopied={isCopied}
        onGoToPlans={() => {
          handleResetAll();
          if (setPlansFilter) setPlansFilter("JOINED");
          navigateToRoute({ tab: "plans" });
          setActiveTab("plans");
        }}
      />
    );
  }

  return null;
};
