import React, { useMemo } from "react";
import { UserProfile, Plan } from "../../../core/types";
import { getPlanCover } from "../../plans/config/planCoverImages";
import { PlansDetailsScreen } from "../../plans/screens/PlansScreen/PlansPreview/PlansPreviewScreen";

interface CreatePlanReviewProps {
  form: any;
  selectedCategory: string;
  selectedSubcategory: string | null;
  onBack: () => void;
  onEditDate?: () => void;
  onEditParticipants?: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export const CreatePlanReview: React.FC<CreatePlanReviewProps> = ({
  form,
  selectedCategory,
  selectedSubcategory,
  onBack,
  onEditDate,
  onEditParticipants,
  onSubmit,
  isSubmitting,
}) => {
  const capacity = form.totalCapacity || 2;
  const isAssignedMode = form.waitlistMode === 'assigned';

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

    const priorityIds: string[] = form.priorityGuestIds || [];

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

    const friendMembers = (form.selectedFriends || []).map((f: any, index: number) => {
      const fId = f.id || f.dbUuid;
      let isInGoing = false;
      let waitlistPos: number | null = null;
      let assignedGrp: string = 'going';

      if (isAssignedMode) {
        if (priorityIds.length > 0) {
          isInGoing = priorityIds.includes(fId);
        } else {
          const hostOffset = form.isHostSelected ? 1 : 0;
          isInGoing = index < (capacity - hostOffset);
        }
        assignedGrp = isInGoing ? 'going' : 'waitlisted';
        waitlistPos = isInGoing ? null : (index + 1);
      } else {
        // Automatic mode
        isInGoing = true;
      }

      return {
        id: fId,
        userId: fId,
        userUuid: fId,
        name: f.name,
        avatar: f.avatar || f.profilePhoto || '',
        isHost: false,
        role: 'PARTICIPANT' as const,
        joinState: (isAssignedMode ? (isInGoing ? 'JOINED' : 'WAITLISTED') : 'JOINED') as any,
        assignedGroup: assignedGrp,
        waitlistPosition: waitlistPos,
        reminderState: 'none' as const,
        joinedAt: null,
        checkedIn: false,
      };
    });

    const allMembers = [
      ...(form.isHostSelected ? [hostMember] : []),
      ...friendMembers,
    ];

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

    const eventDate = form.eventDateTime ? new Date(form.eventDateTime) : new Date();
    const deadlineDate = new Date(eventDate);
    if (form.rsvpDeadline === 'Custom' && form.customDeadline) {
      deadlineDate.setTime(new Date(form.customDeadline).getTime());
    } else if (!isPlanStart) {
      deadlineDate.setHours(deadlineDate.getHours() - hoursOffset);
    }
    const computedDeadlineIso = deadlineDate.toISOString();

    const resolvedLocation = form.localLocation || form.placeAddress || form.location || form.venueName || '';

    return {
      id: 'create-plan-preview',
      title: (form.localTitle || "New Activity").trim(),
      category: selectedCategory as any,
      subcategory: selectedSubcategory || undefined,
      date: formattedDate,
      time: formattedTime,
      datetime: form.eventDateTime ? new Date(form.eventDateTime).toISOString() : new Date().toISOString(),
      scheduled_at: form.eventDateTime ? new Date(form.eventDateTime).toISOString() : new Date().toISOString(),
      response_deadline_at: computedDeadlineIso,
      location: resolvedLocation,
      cost: form.costAmount || 0,
      paymentAmount: form.costAmount || 0,
      capacity: capacity,
      joinLimit: capacity,
      maxSpots: capacity,
      maxParticipants: capacity,
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
      coverImage: form.customCoverImage || getPlanCover(selectedCategory, selectedSubcategory || undefined),
      members: allMembers as any,
      joinedUsers: [],
      confirmedCount: allMembers.length,
      timeline: 'today',
      createdAt: new Date().toISOString(),
      total_cost: form.costAmount || 0,
    } as any;
  }, [form, selectedCategory, selectedSubcategory, capacity, isAssignedMode, formattedDate, formattedTime]);

  const userProfile: UserProfile = form.userProfile || {
    id: form.activeUserId || 'host',
    dbUuid: form.activeUserId || 'host',
    name: form.userProfile?.name || 'You',
    avatar: form.userProfile?.avatar || form.userProfile?.profile_photo || '',
  };

  return (
    <PlansDetailsScreen
      createMode={true}
      plan={syntheticPlan}
      userProfile={userProfile}
      activeUserId={userProfile.dbUuid || (userProfile as any)?.id}
      onClose={onBack}
      onBack={onBack}
      onEditParticipants={onEditParticipants}
      onAdjustCapacity={(newCap) => form.setTotalCapacity(newCap)}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
    />
  );
};
