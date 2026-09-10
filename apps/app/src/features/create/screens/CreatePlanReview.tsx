import React, { useMemo, useState, useCallback } from "react";
import { UserProfile, Plan } from "../../../core/types";
import { getPlanCover } from "../../plans/config/planCoverImages";
import { PlansDetailsScreen } from "../../plans/screens/PlansScreen/PlansPreview/PlansPreviewScreen";
import { pickImageFromGallery } from "../../../shared/utils/imageUtils";
import { PlanImageEditorModal } from "../components/PlanImageEditorModal";
import {
  resolveAssignedParticipants,
  incrementAssignedPlanSize,
  decrementAssignedPlanSize,
} from "../../participants/assigned/assignedCapacityLogic";
import { saveDraftParticipants } from "../utils/draftParticipantStorage";

interface CreatePlanReviewProps {
  form: any;
  selectedCategory: string;
  selectedSubcategory: string | null;
  onExit?: () => void;
  onBack: () => void;
  onEditDate?: () => void;
  onEditParticipants?: () => void;
  onAddParticipants?: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export const CreatePlanReview: React.FC<CreatePlanReviewProps> = ({
  form,
  selectedCategory,
  selectedSubcategory,
  onExit,
  onBack,
  onEditDate,
  onEditParticipants,
  onAddParticipants,
  onSubmit,
  isSubmitting,
}) => {
  const [editorImageFile, setEditorImageFile] = useState<File | Blob | string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const handlePickCoverImage = async () => {
    try {
      const file = await pickImageFromGallery();
      if (!file) return;
      setEditorImageFile(file);
      setIsEditorOpen(true);
    } catch (err: any) {
      console.error("[CreatePlanReview] Error picking cover image:", err);
    }
  };

  const totalInvited = (form.selectedFriends?.length || 0) + (form.isHostSelected ? 1 : 0);
  const capacity = form.totalCapacity !== undefined ? form.totalCapacity : (totalInvited || 2);
  const isAssignedMode = form.waitlistMode === 'assigned';

  const assignedParticipants = useMemo(() => {
    if (!isAssignedMode) return null;
    return resolveAssignedParticipants({
      userProfile: form.userProfile,
      isHostSelected: form.isHostSelected,
      selectedFriends: form.selectedFriends || [],
      priorityGuestIds: form.priorityGuestIds,
      capacity: form.totalCapacity,
      isCapacityConfigured: form.totalCapacity !== undefined,
    });
  }, [
    isAssignedMode,
    form.userProfile,
    form.isHostSelected,
    form.selectedFriends,
    form.priorityGuestIds,
    form.totalCapacity,
  ]);

  const handleIncrementPlanSize = useCallback(() => {
    if (!isAssignedMode || !assignedParticipants) return;
    const hostOffset = form.isHostSelected ? 1 : 0;
    const totalInvitedCount = hostOffset + (form.selectedFriends?.length || 0);

    const res = incrementAssignedPlanSize({
      capacity: form.totalCapacity,
      totalInvitedCount,
      goingList: assignedParticipants.going,
      waitlist: assignedParticipants.waitlist,
    });
    if (!res) return;

    const nonHostGoing = res.nextGoing.filter((f) => !f.isHost);
    const nonHostWait = res.nextWaitlist.filter((f) => !f.isHost);

    form.setTotalCapacity(res.nextCapacity);
    form.setPriorityGuestIds(nonHostGoing.map((f) => f.id));
    form.setSelectedFriends([...nonHostGoing, ...nonHostWait]);

    saveDraftParticipants({
      joinedIds: res.nextGoing.map((f) => f.id),
      waitlistIds: res.nextWaitlist.map((f) => f.id),
      joinedFriends: nonHostGoing,
      waitlistFriends: nonHostWait,
    });
  }, [isAssignedMode, assignedParticipants, form]);

  const handleDecrementPlanSize = useCallback(() => {
    if (!isAssignedMode || !assignedParticipants) return;

    const res = decrementAssignedPlanSize({
      capacity: form.totalCapacity,
      goingList: assignedParticipants.going,
      waitlist: assignedParticipants.waitlist,
    });
    if (!res) return;

    const nonHostGoing = res.nextGoing.filter((f) => !f.isHost);
    const nonHostWait = res.nextWaitlist.filter((f) => !f.isHost);

    form.setTotalCapacity(res.nextCapacity);
    form.setPriorityGuestIds(nonHostGoing.map((f) => f.id));
    form.setSelectedFriends([...nonHostGoing, ...nonHostWait]);

    saveDraftParticipants({
      joinedIds: res.nextGoing.map((f) => f.id),
      waitlistIds: res.nextWaitlist.map((f) => f.id),
      joinedFriends: nonHostGoing,
      waitlistFriends: nonHostWait,
    });
  }, [isAssignedMode, assignedParticipants, form]);

  const eventDateObj = form.eventDateTime ? new Date(form.eventDateTime) : new Date();
  const formattedDate = eventDateObj.toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  const formattedTime = eventDateObj.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  });

  const syntheticPlan: Plan = useMemo(() => {
    const hostId = form.userProfile?.dbUuid || form.activeUserId || 'host';
    const hostName = form.userProfile?.name || 'You';
    const hostAvatar = form.userProfile?.avatar || form.userProfile?.profile_photo || '';

    const hostOffset = form.isHostSelected ? 1 : 0;
    const totalInvitedCount = hostOffset + (form.selectedFriends?.length || 0);
    const hasCapacityConfigured = form.totalCapacity !== undefined;
    const hasWaitlist = isAssignedMode && hasCapacityConfigured && capacity < totalInvitedCount;

    let allMembers: any[] = [];
    if (isAssignedMode && assignedParticipants) {
      const goingMembers = assignedParticipants.going.map((f) => {
        const isHost = Boolean(f.isHost);
        const memberId = isHost ? hostId : (f.id || f.dbUuid);
        return {
          id: memberId,
          userId: memberId,
          userUuid: memberId,
          name: isHost ? hostName : (f.name || 'Guest'),
          avatar: isHost ? hostAvatar : (f.avatar || (f as any).profilePhoto || ''),
          isHost,
          role: isHost ? ('HOST' as const) : ('PARTICIPANT' as const),
          joinState: isHost ? ('JOINED' as const) : ((hasWaitlist ? 'JOINED' : 'INVITED') as any),
          assignedGroup: 'going' as const,
          waitlistPosition: null,
          reminderState: 'none' as const,
          joinedAt: null,
          checkedIn: false,
        };
      });

      const waitlistMembers = assignedParticipants.waitlist.map((f, idx) => {
        const memberId = f.id || f.dbUuid;
        return {
          id: memberId,
          userId: memberId,
          userUuid: memberId,
          name: f.name || 'Guest',
          avatar: f.avatar || (f as any).profilePhoto || '',
          isHost: false,
          role: 'PARTICIPANT' as const,
          joinState: 'WAITLISTED' as const,
          assignedGroup: 'waitlisted' as const,
          waitlistPosition: f.waitlistPosition ?? idx + 1,
          reminderState: 'none' as const,
          joinedAt: null,
          checkedIn: false,
        };
      });

      allMembers = [...goingMembers, ...waitlistMembers];
    } else {
      const hostMember = {
        id: hostId,
        userId: hostId,
        userUuid: hostId,
        name: hostName,
        avatar: hostAvatar,
        isHost: true,
        role: 'HOST' as const,
        joinState: 'JOINED' as const,
        assignedGroup: 'going' as const,
        waitlistPosition: null,
        reminderState: 'none' as const,
        joinedAt: null,
        checkedIn: false,
      };

      const friendMembers = (form.selectedFriends || []).map((f: any) => {
        const fId = f.id || f.dbUuid;
        return {
          id: fId,
          userId: fId,
          userUuid: fId,
          name: f.name,
          avatar: f.avatar || f.profilePhoto || '',
          isHost: false,
          role: 'PARTICIPANT' as const,
          joinState: 'INVITED' as any,
          assignedGroup: 'going',
          waitlistPosition: null,
          reminderState: 'none' as const,
          joinedAt: null,
          checkedIn: false,
        };
      });

      allMembers = [
        ...(form.isHostSelected ? [hostMember] : []),
        ...friendMembers,
      ];
    }

    const isDateConfigured = Boolean(form.isDateManuallySet && form.eventDateTime);
    const isCostConfigured = Boolean(form.isCostManuallySet && form.costAmount !== undefined && form.costAmount !== null);
    const isExplicitNoDeadline = form.rsvpDeadline === 'No deadline' || form.rsvpDeadline === '-';
    const hasDeadline = Boolean(isDateConfigured && !isExplicitNoDeadline);
    const isDeadlineConfigured = Boolean(isDateConfigured && hasDeadline);

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
    } else if (form.rsvpDeadline.includes('Plan start') || form.rsvpDeadline.includes('plan start')) {
      isPlanStart = true;
    }

    let computedDeadlineIso: string | undefined = undefined;
    if (isDateConfigured && hasDeadline) {
      const eventDate = form.eventDateTime ? new Date(form.eventDateTime) : new Date();
      const deadlineDate = new Date(eventDate);
      if (form.rsvpDeadline === 'Custom' && form.customDeadline) {
        deadlineDate.setTime(new Date(form.customDeadline).getTime());
      } else if (!isPlanStart) {
        deadlineDate.setHours(deadlineDate.getHours() - hoursOffset);
      }
      computedDeadlineIso = deadlineDate.toISOString();
    }

    const resolvedLocation = form.localLocation || form.placeAddress || form.location || form.venueName || '';

    return {
      id: 'create-plan-preview',
      title: (form.localTitle || "").trim(),
      category: selectedCategory as any,
      subcategory: selectedSubcategory || undefined,
      date: isDateConfigured ? formattedDate : undefined,
      time: isDateConfigured ? formattedTime : undefined,
      datetime: isDateConfigured && form.eventDateTime ? new Date(form.eventDateTime).toISOString() : undefined,
      scheduled_at: isDateConfigured && form.eventDateTime ? new Date(form.eventDateTime).toISOString() : undefined,
      isDateConfigured: isDateConfigured,
      response_deadline_at: computedDeadlineIso,
      isDeadlineConfigured: isDeadlineConfigured,
      location: resolvedLocation,
      cost: isCostConfigured ? Number(form.costAmount || 0) : undefined,
      paymentAmount: isCostConfigured ? Number(form.costAmount || 0) : undefined,
      total_cost: isCostConfigured ? Number(form.costAmount || 0) : undefined,
      isCostConfigured: isCostConfigured,
      capacity: capacity,
      joinLimit: capacity,
      maxSpots: capacity,
      plan_size: capacity,
      planSize: capacity,
      maxParticipants: Math.max(capacity || 2, allMembers.length || 2),
      max_participants: Math.max(capacity || 2, allMembers.length || 2),
      waitlistEnabled: form.waitlistEnabled ?? true,
      participantFiltering: isAssignedMode ? 'ASSIGNED' : 'AUTOMATIC',
      participant_filtering: isAssignedMode ? 'ASSIGNED' : 'AUTOMATIC',
      waitlistOrderMode: isAssignedMode ? 'CUSTOM' : 'AUTO',
      waitlist_order_mode: isAssignedMode ? 'CUSTOM' : 'AUTO',
      waitlist_mode: isAssignedMode ? 'assigned' : 'automatic',
      waitlist_type: isAssignedMode ? 'assigned' : 'automatic',
      status: 'LIVE',
      hostId: hostId,
      creatorId: hostId,
      creatorName: hostName,
      creatorAvatar: hostAvatar,
      coverImage: form.customOriginalImage || form.customCoverImage || getPlanCover(selectedCategory, selectedSubcategory || undefined),
      members: allMembers as any,
      joinedUsers: [],
      confirmedCount: allMembers.length,
      timeline: 'today',
      createdAt: new Date().toISOString(),
    } as any;
  }, [form, selectedCategory, selectedSubcategory, capacity, isAssignedMode, assignedParticipants, formattedDate, formattedTime]);

  const userProfile: UserProfile = form.userProfile || {
    id: form.activeUserId || 'host',
    dbUuid: form.activeUserId || 'host',
    name: form.userProfile?.name || 'You',
    avatar: form.userProfile?.avatar || form.userProfile?.profile_photo || '',
  };

  return (
    <>
      <PlansDetailsScreen
        createMode={true}
        plan={syntheticPlan}
        userProfile={userProfile}
        activeUserId={userProfile.dbUuid || (userProfile as any)?.id}
        onClose={onExit || onBack}
        onBack={onExit || onBack}
        onEditParticipants={onEditParticipants}
        onAddParticipants={onAddParticipants}
        onEditTitle={(newTitle) => form.setLocalTitle(newTitle)}
        onEditCoverImage={handlePickCoverImage}
        onAdjustDate={(eventDate, rsvpDate) => {
          form.setEventDateTime(eventDate);
          if (rsvpDate) {
            form.setCustomDeadline(rsvpDate);
            if (eventDate && rsvpDate.getTime() === eventDate.getTime()) {
              form.setRsvpDeadline(null);
            } else {
              form.setRsvpDeadline('Custom');
            }
          } else {
            form.setRsvpDeadline(null);
            form.setCustomDeadline(eventDate);
          }
          form.setIsDateManuallySet(true);
        }}
        onAdjustCost={(newCost) => {
          form.setCostAmount(newCost);
          form.setIsCostManuallySet(true);
        }}
        onAdjustLocation={(loc) => {
          form.setLocalLocation(loc.place_name || loc.place_address || '');
          if (loc.place_id) form.setPlaceId(loc.place_id);
          if (loc.place_address) form.setPlaceAddress(loc.place_address);
          if (loc.latitude) form.setLatitude(loc.latitude);
          if (loc.longitude) form.setLongitude(loc.longitude);
        }}
        onAdjustCapacity={(newCap) => form.setTotalCapacity(newCap)}
        onIncrementCapacity={isAssignedMode ? handleIncrementPlanSize : undefined}
        onDecrementCapacity={isAssignedMode ? handleDecrementPlanSize : undefined}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
      />

      <PlanImageEditorModal
        imageSrc={editorImageFile}
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditorImageFile(null);
        }}
        onSave={({ previewUrl, blob, originalBlob, originalPreviewUrl }) => {
          form.setCustomPlanImages(originalBlob, originalPreviewUrl, blob, previewUrl);
          setIsEditorOpen(false);
          setEditorImageFile(null);
        }}
      />
    </>
  );
};
