import React, { useEffect, useState } from "react";
import { usePlansStore } from "../../plans/state/PlansContext";
import { buildInviteUrl, copyInviteUrlToClipboard } from "../../plans/services/planInviteService";

// Hooks & utils
import { useCreatePlanForm } from "../hooks/useCreatePlanForm";
import { useFriendshipStore } from "../../friendships/state/FriendshipContext";
import { getPlanCover } from "../../plans/config/planCoverImages";
import { formatDateTimeStandard } from "../../../shared/components/NativeDateTimeField";

// Sub-components
import { BrowseExperiencesStep, DiscoverySubScreen } from "../../discovery/screens/Discovery";
import { CreateCategoryScreen } from "./CreateCategoryScreen";
import { CreatePlanReview } from "./CreatePlanReview";
import { WhenIsPlanScreen } from "./WhenIsPlanScreen";
import { WhoIsComingScreen } from "./WhoIsComingScreen";
import { WhoIsActuallyComing } from "./WhoIsActuallyComing";
import { DiscardPlanBottomSheet } from "../../plans/components/BottomSheets";
import { CreatePlanConfirmation } from "../components/CreatePlanConfirmation";
import { FriendshipsScreen } from "../../friendships/screens/FriendshipsScreen";
import { QuickPlan } from "../../../core/types";
import { createQuickPlan } from "../services/quickPlanService";

import defaultPlanCover from "../../../assets/planimagedefault.webp";
import { uploadPlanImage, uploadPlanCardImage } from "../../../shared/utils/imageUtils";
import { clearDraftParticipants, clearCreatePlanDraft } from "../utils/draftParticipantStorage";
import {
  parseCurrentRoute,
  navigateToRoute,
  listenToNavigation,
  CreatePhase,
} from "../../navigation/appRouter";

interface CreatePlanScreenProps {
  setActiveTab: (tab: any) => void;
  onToggleBottomNav?: (hidden: boolean) => void;
  setPlansFilter?: (filter: 'JOINED' | 'WAITLISTED' | 'SKIPPED') => void;
  setSelectedPlanId?: (id: string | null) => void;
  initialDiscoveryCategory?: DiscoverySubScreen;
}

export const CreatePlanScreen = ({
  setActiveTab,
  onToggleBottomNav,
  setPlansFilter,
  setSelectedPlanId,
  initialDiscoveryCategory,
}: CreatePlanScreenProps) => {
  const { createPlan } = usePlansStore();
  const { friends, loading: friendshipLoading } = useFriendshipStore();

  const initialRoute = React.useMemo(() => parseCurrentRoute(), []);

  // Flow states
  const [createPhase, setCreatePhase] = useState<CreatePhase | 'discover-friends'>(() => {
    if (initialRoute.tab === "create" && initialRoute.createPhase) {
      return initialRoute.createPhase;
    }
    return 'category';
  });
  const [lastSubScreen, setLastSubScreen] = useState<DiscoverySubScreen>(() => {
    if (initialDiscoveryCategory) return initialDiscoveryCategory;
    if (
      initialRoute.tab === "sports" ||
      initialRoute.tab === "dining" ||
      initialRoute.tab === "movies" ||
      initialRoute.tab === "activities"
    ) {
      return initialRoute.tab;
    }
    return null;
  });
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [postedPlanUuid, setPostedPlanUuid] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [cameFromReview, setCameFromReview] = useState(false);
  const [returnToWhoActually, setReturnToWhoActually] = useState(false);
  const [returnToPlanSizeSheet, setReturnToPlanSizeSheet] = useState(false);
  const [isQuickPlanFlow, setIsQuickPlanFlow] = useState(false);
  const [isQuickPlanCategorySelect, setIsQuickPlanCategorySelect] = useState(false);
  const [targetQuickPlanListId, setTargetQuickPlanListId] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<'sports' | 'movies' | 'dining' | 'activities' | 'custom'>('sports');
  const [selectedSubcategory, setSelectedSubcategory] = useState<'football' | 'badminton' | null>(null);

  // Form hook
  const form = useCreatePlanForm();

  const transitionToPhase = (phase: CreatePhase | 'discover-friends') => {
    setCreatePhase(phase);
    if (phase !== 'discover-friends') {
      navigateToRoute({ tab: "create", createPhase: phase });
    }
  };

  useEffect(() => {
    if (initialDiscoveryCategory && initialDiscoveryCategory !== lastSubScreen) {
      setLastSubScreen(initialDiscoveryCategory);
      setCreatePhase('category');
    }
  }, [initialDiscoveryCategory]);

  useEffect(() => {
    const removeListener = listenToNavigation((route) => {
      if (route.tab === "create") {
        if (route.createPhase && route.createPhase !== createPhase) {
          setCreatePhase(route.createPhase);
        } else if (!route.createPhase || route.createPhase === 'category') {
          setCreatePhase('category');
          setLastSubScreen(null);
        }
      } else if (
        route.tab === "sports" ||
        route.tab === "dining" ||
        route.tab === "movies" ||
        route.tab === "activities"
      ) {
        setCreatePhase('category');
        setLastSubScreen(route.tab);
      }
    });
    return removeListener;
  }, [createPhase]);

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
      console.error("[CreatePlanScreen] Copy invite failed:", err);
    } finally {
      setIsCopying(false);
    }
  };

  const handleResetAll = () => {
    setSelectedSubcategory(null);
    form.resetForm();
    setCameFromReview(false);
    setPostedPlanUuid(null);
    setReturnToPlanSizeSheet(false);
    setIsQuickPlanFlow(false);
    setIsQuickPlanCategorySelect(false);
    setTargetQuickPlanListId(null);
    setCreatePhase('category');
    setLastSubScreen(null);
    navigateToRoute({ tab: 'create' });
  };

  const handleStartAddQuickPlan = (listId?: string) => {
    form.resetForm();
    setTargetQuickPlanListId(listId || null);
    setIsQuickPlanFlow(true);
    setIsQuickPlanCategorySelect(true);
  };

  const handleSelectExistingQuickPlan = (quickPlan: QuickPlan) => {
    form.resetForm();
    setIsQuickPlanFlow(false);
    setIsQuickPlanCategorySelect(false);

    const cat = (quickPlan.category || "custom").toLowerCase() as any;
    setSelectedCategory(cat);
    setSelectedSubcategory(quickPlan.subcategory ? (quickPlan.subcategory.toLowerCase() as any) : null);

    form.setLocalTitle(quickPlan.name);
    form.setLocalLocation(quickPlan.place_name || quickPlan.place_address || "");
    if (form.setPlaceId) form.setPlaceId(quickPlan.place_id || null);
    if (form.setPlaceAddress) form.setPlaceAddress(quickPlan.place_address || quickPlan.place_name || null);
    if (form.setLatitude) form.setLatitude(quickPlan.latitude || null);
    if (form.setLongitude) form.setLongitude(quickPlan.longitude || null);
    form.setCustomCoverImage(quickPlan.cover_image || null);
    form.setCostAmount(quickPlan.default_cost || 0);
    form.setIsCostManuallySet(Boolean(quickPlan.default_cost && quickPlan.default_cost > 0));
    form.setTotalCapacity(quickPlan.plan_size !== undefined && quickPlan.plan_size !== null ? quickPlan.plan_size : undefined);

    const restoredFriends = (quickPlan.participants || []).map((p) => {
      const u = p.user_profile;
      return {
        id: p.user_id,
        dbUuid: p.user_id,
        name: u?.full_name || "Friend",
        avatar: u?.profile_photo_path || "",
        profilePhoto: u?.profile_photo_path || "",
      };
    });
    form.setSelectedFriends(restoredFriends);

    setCameFromReview(false);
    transitionToPhase('review');
  };

  const handleCreateQuickPlanSubmit = async () => {
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

    const locationToUse = form.localLocation ? form.localLocation.trim() : "";
    const placeAddressToUse = form.placeAddress ? form.placeAddress.trim() : (locationToUse || "");
    const costToUse = Math.max(0, Number(form.costAmount) || 0);
    const coverUrl = form.customOriginalImage || form.customCoverImage || getPlanCover(selectedCategory, selectedSubcategory);

    const participantIds: string[] = (form.selectedFriends || []).map((f: any) => f.id || f.dbUuid).filter(Boolean);

    try {
      await createQuickPlan(
        {
          creator_id: hostUuid,
          quick_plan_list_id: targetQuickPlanListId,
          name: titleToUse,
          description: form.quickNote || null,
          category: selectedCategory.toUpperCase(),
          subcategory: selectedSubcategory ? selectedSubcategory.toUpperCase() : "OTHER",
          place_id: form.placeId || null,
          place_name: locationToUse,
          place_address: placeAddressToUse,
          latitude: form.latitude || null,
          longitude: form.longitude || null,
          cover_image: coverUrl,
          default_cost: costToUse,
          plan_size: form.totalCapacity !== undefined && form.totalCapacity !== null ? Number(form.totalCapacity) : null,
        },
        participantIds
      );

      handleResetAll();
    } catch (err) {
      console.error("[CreatePlanScreen] Failed saving quick plan:", err);
    } finally {
      form.setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const isFlow =
      createPhase !== 'category' ||
      lastSubScreen === 'quick-plans' ||
      lastSubScreen === 'sports' ||
      lastSubScreen === 'dining' ||
      lastSubScreen === 'movies' ||
      lastSubScreen === 'activities' ||
      lastSubScreen === 'master-search';
    onToggleBottomNav?.(isFlow);
    return () => {
      onToggleBottomNav?.(false);
    };
  }, [createPhase, lastSubScreen, onToggleBottomNav]);

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

    if (!form.rsvpDeadline || form.rsvpDeadline === 'Plan start' || form.rsvpDeadline === 'Plan Start') {
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

    const isExplicitNoDeadline = form.rsvpDeadline === 'No deadline' || form.rsvpDeadline === '-';
    const hasDeadline = !isExplicitNoDeadline;
    let deadlineDate = new Date(planEventDate);
    if (hasDeadline) {
      if (form.rsvpDeadline === 'Custom' && form.customDeadline) {
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

    let dbCategory: string = "CUSTOM";
    let dbSubcategory: string = "OTHER";

    if (selectedCategory && selectedCategory !== "custom") {
      dbCategory = selectedCategory.toUpperCase();
      dbSubcategory = selectedSubcategory ? selectedSubcategory.toUpperCase() : (selectedCategory === "sports" ? "FOOTBALL" : "OTHER");
    }

    const isMovie = selectedCategory === "movies" || dbCategory === "MOVIES";
    const isYearOnly = (s: string | null | undefined) => /^\d{4}$/.test((s || "").trim());

    let locationToUse = form.localLocation ? form.localLocation.trim() : "";
    if (isMovie && isYearOnly(locationToUse)) {
      locationToUse = "";
    }

    let placeAddressToUse = form.placeAddress ? form.placeAddress.trim() : (locationToUse || "");
    if (isMovie && isYearOnly(placeAddressToUse)) {
      placeAddressToUse = "";
    }

    const costToUse = Math.max(0, Number(form.costAmount) || 0);

    const isAssigned = form.waitlistMode === "assigned";
    const planSizeToUse = form.totalCapacity !== undefined && form.totalCapacity !== null ? Number(form.totalCapacity) : null;

    const newDbPlan = {
      public_id: planId,
      category: dbCategory,
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
      participant_filtering: planSizeToUse === null ? null : ((isAssigned ? "ASSIGNED" : "AUTOMATIC") as 'AUTOMATIC' | 'ASSIGNED'),
      waitlist_order_mode: (isAssigned ? "CUSTOM" : "AUTO") as 'AUTO' | 'CUSTOM',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
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
          console.error('[CreatePlanFlow] Failed to upload original plan cover image:', uploadErr);
        }
      } else if (form.customCoverBlob && dbPlanRow?.id) {
        // Fallback: no separate original — treat cropped as the cover_image
        try {
          await uploadPlanImage(dbPlanRow.id, form.customCoverBlob);
        } catch (uploadErr) {
          console.error('[CreatePlanFlow] Failed to upload plan cover image (fallback):', uploadErr);
        }
      }

      // Upload cropped portrait → cover_card_image (only if a separate crop was produced)
      if (form.customCoverBlob && form.customOriginalBlob && dbPlanRow?.id) {
        try {
          await uploadPlanCardImage(dbPlanRow.id, form.customCoverBlob);
        } catch (uploadErr) {
          console.error('[CreatePlanFlow] Failed to upload plan card image:', uploadErr);
        }
      }

      setPostedPlanUuid(dbPlanRow?.id || null);
      transitionToPhase("confirmation");
      clearDraftParticipants();
      clearCreatePlanDraft();
      form.setIsSubmitting(false);
    } catch (err: any) {
      console.error("[CreatePlanFlow] Error creating plan:", err);
      form.setIsSubmitting(false);
    }
  };

  // WHEN PHASE
  if (createPhase === 'when') {
    return (
      <WhenIsPlanScreen
        form={form}
        coverImage={form.customOriginalImage || form.customCoverImage || getPlanCover(selectedCategory, selectedSubcategory)}
        title={form.localTitle || "New Activity"}
        onBack={() => {
          if (cameFromReview) {
            transitionToPhase('review');
          } else {
            handleResetAll();
          }
        }}
        onContinue={() => {
          if (cameFromReview) {
            setCameFromReview(false);
            transitionToPhase('review');
          } else {
            transitionToPhase('who');
          }
        }}
        selectedCategory={selectedCategory}
        selectedSubcategory={selectedSubcategory}
      />
    );
  }

  // QUICK PLAN CATEGORY SELECTION (STEP 1)
  if (isQuickPlanCategorySelect) {
    return (
      <CreateCategoryScreen
        userProfile={form.userProfile}
        setActiveTab={setActiveTab}
        onSelectCategory={(category) => {
          setSelectedCategory(category);
          setIsQuickPlanCategorySelect(false);
          if (category === "custom") {
            form.resetForm();
            form.setLocalTitle("");
            form.setLocalLocation("");
            form.setCustomCoverImage(null, null);
            form.setCostAmount(0);
            form.setIsCostManuallySet(false);
            form.setIsDateManuallySet(false);
            form.setTotalCapacity(undefined);
            transitionToPhase('who');
          } else {
            setLastSubScreen(category as any);
            setCreatePhase('category');
          }
        }}
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
            transitionToPhase('who-actually');
          } else if (cameFromReview) {
            setCameFromReview(false);
            transitionToPhase('review');
          } else if (isQuickPlanFlow) {
            setIsQuickPlanCategorySelect(true);
          } else {
            handleResetAll();
          }
        }}
        onContinue={() => {
          setReturnToWhoActually(false);
          setCameFromReview(false);
          transitionToPhase('review');
        }}
        onNavigateToDiscoverFriends={() => transitionToPhase('discover-friends')}
        selectedCategory={selectedCategory}
        selectedSubcategory={selectedSubcategory}
      />
    );
  }

  // DISCOVER FRIENDS PHASE
  if (createPhase === 'discover-friends') {
    return (
      <FriendshipsScreen
        onBack={() => transitionToPhase('who')}
        initialScreen="discover"
      />
    );
  }

  // WHO ACTUALLY PHASE
  if (createPhase === 'who-actually') {
    if (friendshipLoading) {
      return <div className="flex-1 bg-[#050505]" />;
    }
    if (friends.length === 0) {
      return null;
    }
    return (
      <WhoIsActuallyComing
        form={form}
        selectedCategory={selectedCategory}
        onBack={() => {
          setCameFromReview(false);
          transitionToPhase('review');
        }}
        onContinue={() => {
          setCameFromReview(false);
          transitionToPhase('review');
        }}
        onAddFriends={() => {
          setReturnToWhoActually(true);
          setReturnToPlanSizeSheet(true);
          transitionToPhase('who');
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
          isQuickPlanMode={isQuickPlanFlow}
          onExit={() => setShowCancelConfirm(true)}
          onBack={() => setShowCancelConfirm(true)}
          onEditDate={() => {
            setCameFromReview(true);
            transitionToPhase('when');
          }}
          onEditParticipants={() => {
            setCameFromReview(true);
            if (friends.length === 0) {
              transitionToPhase('who');
            } else {
              transitionToPhase('who-actually');
            }
          }}
          onAddParticipants={() => {
            setReturnToWhoActually(friends.length > 0);
            setReturnToPlanSizeSheet(friends.length > 0);
            transitionToPhase('who');
          }}
          onSubmit={isQuickPlanFlow ? handleCreateQuickPlanSubmit : handleHostPlanSubmit}
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

  // CONFIRMATION PHASE
  if (createPhase === 'confirmation') {
    return (
      <CreatePlanConfirmation
        planTitle={form.localTitle || "New Activity"}
        planCoverImage={form.customOriginalImage || form.customCoverImage || getPlanCover(selectedCategory, selectedSubcategory)}
        planId={postedPlanUuid}
        onCopyInviteLink={handleCopyInviteLink}
        isCopying={isCopying}
        isCopied={isCopied}
        onGoToPlans={() => {
          const targetPlanId = postedPlanUuid;
          handleResetAll();
          if (setPlansFilter) setPlansFilter("JOINED");
          if (targetPlanId && setSelectedPlanId) {
            setSelectedPlanId(targetPlanId);
          }
          navigateToRoute({ tab: "plans", selectedPlanId: targetPlanId || undefined });
          setActiveTab("plans");
        }}
      />
    );
  }

  return (
    <BrowseExperiencesStep
      userProfile={form.userProfile}
      setActiveTab={setActiveTab}
      initialSubScreen={lastSubScreen}
      onSubScreenChange={(screen) => {
        setLastSubScreen(screen);
        if (screen === null && (lastSubScreen === "sports" || lastSubScreen === "dining" || lastSubScreen === "movies" || lastSubScreen === "activities")) {
          setActiveTab("create");
        }
      }}
      onAddQuickPlan={handleStartAddQuickPlan}
      onSelectQuickPlan={handleSelectExistingQuickPlan}

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
        const isMovieItem = lowerCategory === "movies" || (item.category && item.category.toUpperCase() === "MOVIES");
        form.setLocalLocation(isMovieItem ? "" : (item.location || ""));
        form.setCustomCoverImage(item.cover_image_url || defaultPlanCover);

        // Pre-populate coordinate mapping metadata from discovery selection
        if (form.setPlaceId) form.setPlaceId(isMovieItem ? null : ((item as any).place_id || null));
        if (form.setPlaceAddress) form.setPlaceAddress(isMovieItem ? null : ((item as any).place_address || item.location || null));
        if (form.setLatitude) form.setLatitude(isMovieItem ? null : ((item as any).latitude || null));
        if (form.setLongitude) form.setLongitude(isMovieItem ? null : ((item as any).longitude || null));

        // Notes, Cost, RSVP Deadline, and Participants are intentionally left empty/default
        form.setCostAmount(0);
        form.setIsCostManuallySet(false);
        form.setTotalCapacity(undefined);
        form.setIsDateManuallySet(false);
        form.setQuickNote("");

        // 4. Entry into WhoIsComingScreen first
        transitionToPhase('who');
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
        transitionToPhase('who');
      }}
    />
  );
};
