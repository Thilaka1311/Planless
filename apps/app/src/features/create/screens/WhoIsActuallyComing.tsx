import React from 'react';
import { ParticipantManagementScreen, Friend } from '../../participants/screens/ParticipantManagementScreen';

interface WhoIsActuallyComingProps {
  form: any;
  onBack: () => void;
  onContinue: () => void;
  onAddFriends?: () => void;
  selectedCategory?: string;
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
}) => {
  const selectedFriends: Friend[] = React.useMemo(() => {
    const raw: Friend[] = form.selectedFriends || [];
    const priorityIds: string[] = form.priorityGuestIds || [];
    if (priorityIds.length === 0) return raw;

    const orderMap = new Map(priorityIds.map((id, index) => [id, index]));
    return [...raw].sort((a, b) => {
      const aIdx = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
      const bIdx = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
      return aIdx - bIdx;
    });
  }, [form.selectedFriends, form.priorityGuestIds]);

  const capacity: number = form.totalCapacity || 2;
  const currentWaitlistMode: 'automatic' | 'assigned' = form.waitlistMode || 'automatic';

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
    const updatedFriends = selectedFriends.filter((f) => f.id !== item.id);
    form.setSelectedFriends(updatedFriends);
    if (item.isHost) {
      form.setIsHostSelected(false);
    }
  };

  /**
   * Continue handler — persist the final Going order and full participant queue so that if the user returns
   * to this screen, the same order is restored.
   */
  const handleContinue = (going: Friend[], waitlist: Friend[]) => {
    const fullOrderedList = [...going, ...waitlist].filter((f) => !f.isHost);
    form.setSelectedFriends(fullOrderedList);
    form.setPriorityGuestIds(going.map((item) => item.id));
    onContinue();
  };

  return (
    <ParticipantManagementScreen
      title={form.localTitle || 'New Activity'}
      category={selectedCategory}
      eventDate={formattedDate}
      eventTime={formattedTime}
      capacity={capacity}
      isHostSelected={form.isHostSelected}
      isHostUser={true}
      userProfile={form.userProfile}
      selectedFriends={selectedFriends}
      mode="wizard"
      onBack={onBack}
      onContinue={handleContinue}
      onAddFriends={onAddFriends}
      onAdjustCapacity={(val) => form.setTotalCapacity(val)}
      waitlistMode={currentWaitlistMode}
      onWaitlistModeChange={form.setWaitlistMode}
      // Only remove is surfaced externally; Going / Waitlist moves stay internal.
      onRemoveParticipant={handleRemoveParticipant}
    />
  );
};
