import React from 'react';
import { ParticipantManagementScreen, Friend } from '../../participants/screens/ParticipantManagementScreen';
import {
  getSavedDraftParticipants,
  saveDraftParticipants,
  getSavedCreatePlanDraft,
} from '../utils/draftParticipantStorage';

interface WhoIsActuallyComingProps {
  form: any;
  onBack: () => void;
  onContinue: () => void;
  onAddFriends?: () => void;
  selectedCategory?: string;
  initialOpenPlanSizeSheet?: boolean;
  onPlanSizeSheetDismissed?: () => void;
}

/**
 * Thin wrapper around the shared ParticipantManagementScreen for the Create flow.
 *
 * Responsibilities:
 *   - Provide form data as props (selectedFriends, capacity, isHostSelected, etc.)
 *   - Sync form.priorityGuestIds back when the user taps Continue
 *   - Sync form.selectedFriends when the user removes a participant
 *   - Everything else (Going / Waitlist moves, drag-reorder) is managed entirely
 *     inside ParticipantManagementScreen's internal wizard state — this avoids
 *     the competing-state-machine bug that arose from maintaining duplicate lists here.
 */
export const WhoIsActuallyComing: React.FC<WhoIsActuallyComingProps> = ({
  form,
  onBack,
  onContinue,
  onAddFriends,
  selectedCategory = 'custom',
  initialOpenPlanSizeSheet,
  onPlanSizeSheetDismissed,
}) => {
  const selectedFriends: Friend[] = React.useMemo(() => {
    const raw: Friend[] = (form.selectedFriends || []).filter((f: Friend) => !f.isHost);
    const savedDraft = getSavedDraftParticipants();
    const fullDraft = getSavedCreatePlanDraft();

    // Active form selection is the single source of truth for who is selected.
    // Fall back to stored draft only on fresh mount/refresh when form has not initialized.
    const activeFriends = raw.length > 0
      ? raw
      : (fullDraft?.selectedFriends || []).filter((f: Friend) => !f.isHost);

    const rawMap = new Map<string, Friend>();
    activeFriends.forEach((f) => {
      if (f.id) rawMap.set(String(f.id), f);
      if (f.dbUuid) rawMap.set(String(f.dbUuid), f);
    });

    if (savedDraft && (savedDraft.joinedIds.length > 0 || savedDraft.waitlistIds.length > 0)) {
      const goingFriends = savedDraft.joinedIds
        .filter((id) => id !== 'host' && rawMap.has(id))
        .map((id) => rawMap.get(id)!);
      const goingSet = new Set(goingFriends.map((f) => f.id));
      const waitFriends = savedDraft.waitlistIds
        .filter((id) => id !== 'host' && rawMap.has(id) && !goingSet.has(id))
        .map((id) => rawMap.get(id)!);
      const knownIds = new Set([...goingSet, ...waitFriends.map((f) => f.id)]);
      const remainder = activeFriends.filter((f) => !knownIds.has(f.id));
      return [...goingFriends, ...waitFriends, ...remainder];
    }

    const priorityIds: string[] = form.priorityGuestIds || [];

    if (priorityIds.length > 0) {
      const prioritySet = new Set(priorityIds);
      const goingFriends = priorityIds
        .map((id) => rawMap.get(id))
        .filter((f): f is Friend => Boolean(f));
      const waitFriends = activeFriends.filter((f) => !prioritySet.has(f.id));
      return [...goingFriends, ...waitFriends];
    }

    return [...activeFriends];
  }, [form.selectedFriends, form.priorityGuestIds]);

  const totalInvitedCount = (form.isHostSelected ? 1 : 0) + selectedFriends.length;
  const isCapacityConfigured = Boolean(form.isCapacityManuallySet || form.totalCapacity !== undefined);
  const capacity: number | undefined =
    form.totalCapacity !== undefined && totalInvitedCount > 0
      ? Math.min(form.totalCapacity, totalInvitedCount)
      : form.totalCapacity;
  const currentWaitlistMode: 'automatic' | 'assigned' = form.waitlistMode || 'automatic';

  React.useEffect(() => {
    if (form.totalCapacity !== undefined && totalInvitedCount > 0 && form.totalCapacity > totalInvitedCount) {
      form.setTotalCapacity(totalInvitedCount);
    }
  }, [form.totalCapacity, totalInvitedCount]);

  const eventDateObj = form.eventDateTime ? new Date(form.eventDateTime) : new Date();
  const formattedDate = eventDateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const formattedTime = eventDateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  /**
   * Remove handler — must update the form so that when the user goes back and
   * returns, the removed participant is permanently gone.
   */
  const handleRemoveParticipant = (item: Friend) => {
    const updatedFriends = selectedFriends.filter((f) => f.id !== item.id && f.dbUuid !== item.id);
    const newInvitedCount = (item.isHost ? 0 : (form.isHostSelected ? 1 : 0)) + updatedFriends.length;
    form.setSelectedFriends(updatedFriends);
    if (item.isHost) {
      form.setIsHostSelected(false);
    }
    if (form.setPriorityGuestIds && Array.isArray(form.priorityGuestIds)) {
      form.setPriorityGuestIds(form.priorityGuestIds.filter((id: string) => id !== item.id));
    }
    if (form.totalCapacity !== undefined && form.totalCapacity > newInvitedCount) {
      form.setTotalCapacity(Math.max(2, newInvitedCount));
    }

    const savedDraft = getSavedDraftParticipants();
    if (savedDraft) {
      const joinedIds = savedDraft.joinedIds.filter((id) => id !== item.id && id !== item.dbUuid);
      const joinedSet = new Set(joinedIds);
      const waitlistIds = savedDraft.waitlistIds.filter(
        (id) => id !== item.id && id !== item.dbUuid && !joinedSet.has(id)
      );
      saveDraftParticipants({
        joinedIds,
        waitlistIds,
        joinedFriends: (savedDraft.joinedFriends || []).filter((f: Friend) => f.id !== item.id && f.dbUuid !== item.id),
        waitlistFriends: (savedDraft.waitlistFriends || []).filter((f: Friend) => f.id !== item.id && f.dbUuid !== item.id),
      });
    }
  };

  /**
   * Sync form priority and friend queue whenever participant states change
   */
  const handleParticipantsChange = (going: Friend[], waitlist: Friend[]) => {
    const nonHostGoing = going.filter((f) => !f.isHost);
    const nonHostWait = waitlist.filter((f) => !f.isHost);
    form.setPriorityGuestIds(nonHostGoing.map((item) => item.id));
    form.setSelectedFriends([...nonHostGoing, ...nonHostWait]);
    saveDraftParticipants({
      joinedIds: going.map((f) => f.id),
      waitlistIds: waitlist.map((f) => f.id),
      joinedFriends: nonHostGoing,
      waitlistFriends: nonHostWait,
    });
  };

  /**
   * Continue handler — persist the final Going order and full participant queue so that if the user returns
   * to this screen, the same order is restored.
   */
  const handleContinue = (going: Friend[], waitlist: Friend[]) => {
    const fullOrderedList = [...going, ...waitlist].filter((f) => !f.isHost);
    form.setSelectedFriends(fullOrderedList);
    form.setPriorityGuestIds(going.filter((f) => !f.isHost).map((item) => item.id));
    const maxAllowed = (form.isHostSelected ? 1 : 0) + fullOrderedList.length;
    form.setTotalCapacity(Math.min(going.length, maxAllowed));

    saveDraftParticipants({
      joinedIds: going.map((f) => f.id),
      waitlistIds: waitlist.map((f) => f.id),
      joinedFriends: going.filter((f) => !f.isHost),
      waitlistFriends: waitlist.filter((f) => !f.isHost),
    });

    onContinue();
  };

  return (
    <ParticipantManagementScreen
      title={form.localTitle || form.title || 'New Activity'}
      category={selectedCategory}
      eventDate={formattedDate}
      eventTime={formattedTime}
      capacity={capacity}
      isCapacityConfigured={isCapacityConfigured}
      isHostSelected={form.isHostSelected}
      isHostUser={true}
      userProfile={form.userProfile}
      selectedFriends={selectedFriends}
      priorityGuestIds={form.priorityGuestIds}
      mode="wizard"
      onBack={onBack}
      onContinue={handleContinue}
      onParticipantsChange={handleParticipantsChange}
      onAddFriends={onAddFriends}
      onAdjustCapacity={(val) => form.setTotalCapacity(Math.min(val, totalInvitedCount))}
      waitlistMode={currentWaitlistMode}
      onWaitlistModeChange={form.setWaitlistMode}
      showWaitlistMode={true}
      initialOpenPlanSizeSheet={initialOpenPlanSizeSheet}
      onPlanSizeSheetDismissed={onPlanSizeSheetDismissed}
      onRemoveParticipant={handleRemoveParticipant}
    />
  );
};
