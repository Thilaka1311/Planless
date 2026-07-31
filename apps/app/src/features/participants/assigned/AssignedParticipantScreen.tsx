import React, { useState, useEffect, useMemo } from 'react';
import { SharedParticipantScreenProps, Friend, ParticipantTab } from '../shared/types';
import { ParticipantHeader } from '../shared/ParticipantHeader';
import { PlanSizeCard } from '../shared/PlanSizeCard';
import { WaitlistModeSelector } from '../shared/WaitlistModeSelector';
import { AssignedParticipantTabs } from './AssignedParticipantTabs';
import { AssignedParticipantActions } from './AssignedParticipantActions';
import { GoingSection } from '../components/GoingSection';
import { WaitlistSection } from '../components/WaitlistSection';
import { ContinueButton } from '../../create/components/ContinueButton';
import { DisplacedHostModal } from '../../plans/components/DisplacedHostModal';

interface AssignedParticipantScreenProps extends SharedParticipantScreenProps {
  isHostSelected?: boolean;
  selectedFriends?: Friend[];
  externalGoingList?: Friend[];
  externalWaitlist?: Friend[];
  externalInvitedList?: Friend[];
  onReorderGoing?: (newGoing: Friend[]) => void;
  onReorderWaitlist?: (newWaitlist: Friend[]) => void;
}

export const AssignedParticipantScreen: React.FC<AssignedParticipantScreenProps> = ({
  title = 'Arrange Participants',
  subtitle,
  capacity,
  maxCapacity,
  isHostSelected = false,
  userProfile,
  selectedFriends = [],
  externalGoingList,
  externalWaitlist,
  externalInvitedList,
  mode = 'wizard',
  managementMode,
  continueText,
  isLoading = false,
  isHostUser = false,
  onBack,
  onContinue,
  onAddFriends,
  onAdjustCapacity,
  onMoveToGoing,
  onMoveToWaitlist,
  onRemoveParticipant,
  onPromoteHost,
  onDemoteHost,
  onOpenSettings,
  onReorderGoing,
  onReorderWaitlist,
  initialTab,
  waitlistMode = 'assigned',
  onWaitlistModeChange,
}) => {
  // ── Wizard mode internal state ──
  const hostItem: Friend | null = isHostSelected
    ? {
        id: 'host',
        dbUuid: userProfile?.dbUuid || 'host',
        name: userProfile?.name || 'You',
        avatar: userProfile?.avatar || userProfile?.profile_photo || '',
        isHost: true,
      }
    : null;

  const [internalGoingList, setInternalGoingList] = useState<Friend[]>([]);
  const [internalWaitlist, setInternalWaitlist] = useState<Friend[]>([]);

  useEffect(() => {
    if (mode !== 'wizard') return;
    const allList = [...(hostItem ? [hostItem] : []), ...selectedFriends];
    setInternalGoingList(allList.slice(0, capacity));
    setInternalWaitlist(allList.slice(capacity));
  }, [selectedFriends, capacity, isHostSelected, mode]);

  const displayGoing = mode === 'editor' ? (externalGoingList ?? []) : internalGoingList;
  const displayWaitlist = mode === 'editor' ? (externalWaitlist ?? []) : internalWaitlist;

  const acceptedGoing = useMemo(() => displayGoing.filter(item => item.isAccepted !== false), [displayGoing]);
  const invitedGoing = useMemo(() => displayGoing.filter(item => item.isAccepted === false), [displayGoing]);

  const acceptedWaitlist = useMemo(() => displayWaitlist.filter(item => item.isAccepted !== false), [displayWaitlist]);
  const invitedWaitlist = useMemo(() => displayWaitlist.filter(item => item.isAccepted === false), [displayWaitlist]);

  const visibleTabs = useMemo<ParticipantTab[]>(() => {
    const t: ParticipantTab[] = ['going'];
    if (displayWaitlist.length > 0 || mode === 'wizard') t.push('waitlist');
    return t;
  }, [displayWaitlist, mode]);

  const [activeTab, setActiveTab] = useState<ParticipantTab>('going');
  const initialMountRef = React.useRef(true);

  useEffect(() => {
    if (initialMountRef.current && visibleTabs.length > 0) {
      let defaultTab: ParticipantTab = 'going';
      if (initialTab && visibleTabs.includes(initialTab) && initialTab !== 'invited') {
        defaultTab = initialTab;
      }
      setActiveTab(defaultTab);
      initialMountRef.current = false;
    }
  }, [visibleTabs, initialTab]);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.includes(activeTab)) {
      setActiveTab('going');
    }
  }, [visibleTabs, activeTab]);

  // Action sheet & capacity editing state
  const [selectedItem, setSelectedItem] = useState<Friend | null>(null);
  const [sheetType, setSheetType] = useState<ParticipantTab | null>(null);
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);

  // Displaced Host Modal state
  const [affectedHosts, setAffectedHosts] = useState<Friend[]>([]);
  const [affectedIndex, setAffectedIndex] = useState<number>(-1);
  const [pendingCapacity, setPendingCapacity] = useState<number | null>(null);

  const handleApplyCapacityChange = (targetCap: number) => {
    if (onAdjustCapacity) {
      onAdjustCapacity(targetCap);
    }
  };

  const handleMoveToWaitlistConfirm = async () => {
    if (affectedIndex < 0 || !affectedHosts[affectedIndex]) return;
    const currentHost = affectedHosts[affectedIndex];
    if (onDemoteHost) {
      await onDemoteHost(currentHost);
    }
    const nextIndex = affectedIndex + 1;
    if (nextIndex < affectedHosts.length) {
      setAffectedIndex(nextIndex);
    } else {
      const finalCap = pendingCapacity !== null ? pendingCapacity : capacity;
      setAffectedIndex(-1);
      setAffectedHosts([]);
      setPendingCapacity(null);
      if (onAdjustCapacity) {
        onAdjustCapacity(finalCap);
      }
    }
  };

  const handleRemoveFromPlanConfirm = async () => {
    if (affectedIndex < 0 || !affectedHosts[affectedIndex]) return;
    const currentHost = affectedHosts[affectedIndex];
    if (onRemoveParticipant) {
      await onRemoveParticipant(currentHost);
    } else if (onDemoteHost) {
      await onDemoteHost(currentHost);
    }
    const nextIndex = affectedIndex + 1;
    if (nextIndex < affectedHosts.length) {
      setAffectedIndex(nextIndex);
    } else {
      const finalCap = pendingCapacity !== null ? pendingCapacity : capacity;
      setAffectedIndex(-1);
      setAffectedHosts([]);
      setPendingCapacity(null);
      if (onAdjustCapacity) {
        onAdjustCapacity(finalCap);
      }
    }
  };

  const handleCancelConfirm = () => {
    setAffectedIndex(-1);
    setAffectedHosts([]);
    setPendingCapacity(null);
  };

  const isInviteOnly = managementMode === 'invite_only' || (!isHostUser && managementMode !== 'host');

  const closeSheet = () => {
    setSelectedItem(null);
    setSheetType(null);
    setShowConfirmRemove(false);
  };

  const handleItemTap = (item: Friend, type: ParticipantTab) => {
    if (isInviteOnly) return;
    setSelectedItem(item);
    setSheetType(type);
    setShowConfirmRemove(false);
  };

  const moveToWaitlistAction = (item: Friend) => {
    if (onMoveToWaitlist) {
      onMoveToWaitlist(item);
    } else {
      setInternalGoingList((prev) => prev.filter((f) => f.id !== item.id));
      setInternalWaitlist((prev) => [...prev.filter((f) => f.id !== item.id), item]);
    }
    closeSheet();
  };

  const moveToGoingAction = (item: Friend) => {
    if (onMoveToGoing) {
      onMoveToGoing(item);
    } else {
      let newGoing = [...internalGoingList.filter((f) => f.id !== item.id)];
      let newWait = [...internalWaitlist.filter((f) => f.id !== item.id)];
      if (newGoing.length >= capacity) {
        const displaced = newGoing[newGoing.length - 1];
        newGoing = newGoing.slice(0, newGoing.length - 1);
        newWait = [displaced, ...newWait];
      }
      if (item.isHost) newGoing.unshift(item);
      else newGoing.push(item);
      setInternalGoingList(newGoing);
      setInternalWaitlist(newWait);
    }
    closeSheet();
  };

  const removeFromPlanAction = (item: Friend) => {
    if (onRemoveParticipant) {
      onRemoveParticipant(item);
    } else {
      setInternalGoingList((prev) => prev.filter((f) => f.id !== item.id));
      setInternalWaitlist((prev) => prev.filter((f) => f.id !== item.id));
    }
    closeSheet();
  };

  return (
    <div
      className="flex-1 flex flex-col h-full bg-[#000000] text-left relative"
      style={{ fontFamily: 'Inter, sans-serif', width: '100%', color: '#FFFFFF' }}
    >
      <ParticipantHeader
        title={title}
        subtitle={subtitle}
        isHostUser={isHostUser}
        onBack={onBack}
        onOpenSettings={onOpenSettings}
      />

      <PlanSizeCard
        capacity={capacity}
        maxCapacity={maxCapacity}
        isHostUser={isHostUser}
        isInviteOnly={isInviteOnly}
        onConfirmAdjustCapacity={handleApplyCapacityChange}
      />

      <WaitlistModeSelector
        waitlistMode={waitlistMode}
        onWaitlistModeChange={onWaitlistModeChange}
        isHostUser={isHostUser}
        isInviteOnly={isInviteOnly}
      />

      <AssignedParticipantTabs
        visibleTabs={visibleTabs}
        activeTab={activeTab}
        goingCount={displayGoing.length}
        capacity={capacity}
        waitlistCount={displayWaitlist.length}
        onTabChange={setActiveTab}
        onAddFriends={onAddFriends ? () => onAddFriends(activeTab) : undefined}
      />

      {/* List content — Assigned Mode with Section 1 (Accepted) and Section 2 (Invited) */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '16px 20px 100px', gap: 16, flex: 1, overflowY: 'auto' }}>
        {activeTab === 'going' && (
          <>
            {displayGoing.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#8E8E93', textTransform: 'uppercase' }}>
                  ACCEPTED
                </span>
                <GoingSection
                  goingList={displayGoing}
                  onItemTap={isHostUser ? (item) => handleItemTap(item, 'going') : undefined}
                  onReorder={mode === 'editor' ? onReorderGoing : undefined}
                  reorderable={mode === 'editor' && isHostUser && Boolean(onReorderGoing)}
                  showIndex={false}
                />
              </div>
            ) : (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
                <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.3)', textAlign: 'center' }}>
                  No participants in Going.
                </span>
              </div>
            )}
          </>
        )}

        {activeTab === 'waitlist' && (
          <>
            {displayWaitlist.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#8E8E93', textTransform: 'uppercase' }}>
                  WAITLISTED
                </span>
                <WaitlistSection
                  waitlist={displayWaitlist}
                  onItemTap={isHostUser ? (item) => handleItemTap(item, 'waitlist') : undefined}
                  onAddFriends={onAddFriends}
                  onReorder={mode === 'wizard' ? (newWait) => setInternalWaitlist(newWait) : onReorderWaitlist}
                  reorderable={mode === 'wizard' || (isHostUser && Boolean(onReorderWaitlist))}
                  showIndex={true}
                />
              </div>
            ) : (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
                <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.3)', textAlign: 'center' }}>
                  No participants in Waitlist.
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {mode === 'wizard' && onContinue && (
        <ContinueButton
          disabled={displayGoing.length < capacity}
          onClick={() => onContinue(displayGoing, displayWaitlist)}
          text={
            continueText ||
            (displayGoing.length < capacity
              ? `Continue (${displayGoing.length}/${capacity})`
              : `Continue (${displayGoing.length} Going • ${displayWaitlist.length} Waitlisted)`)
          }
        />
      )}

      <AssignedParticipantActions
        selectedItem={selectedItem}
        sheetType={sheetType}
        showConfirmRemove={showConfirmRemove}
        isHostUser={isHostUser}
        userProfile={userProfile}
        onClose={closeSheet}
        onShowConfirmRemove={setShowConfirmRemove}
        onMoveToWaitlist={moveToWaitlistAction}
        onMoveToGoing={moveToGoingAction}
        onPromoteHost={onPromoteHost}
        onDemoteHost={onDemoteHost}
        onRemoveParticipant={removeFromPlanAction}
      />

      <DisplacedHostModal
        isOpen={affectedIndex >= 0 && affectedIndex < affectedHosts.length}
        hostName={affectedHosts[affectedIndex]?.name || 'Host'}
        hostAvatar={affectedHosts[affectedIndex]?.avatar}
        onMoveToWaitlist={handleMoveToWaitlistConfirm}
        onCancel={handleCancelConfirm}
      />
    </div>
  );
};
