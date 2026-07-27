import React, { useState, useEffect, useMemo } from 'react';
import { SharedParticipantScreenProps, Friend, ParticipantTab } from '../shared/types';
import { ParticipantHeader } from '../shared/ParticipantHeader';
import { PlanSizeCard } from '../shared/PlanSizeCard';
import { WaitlistModeSelector } from '../shared/WaitlistModeSelector';
import { AutomaticParticipantTabs } from './AutomaticParticipantTabs';
import { AutomaticParticipantActions } from './AutomaticParticipantActions';
import { GoingSection } from '../components/GoingSection';
import { WaitlistSection } from '../components/WaitlistSection';
import { StackingFriends } from '../components/StackingFriends';
import { ContinueButton } from '../../create/components/ContinueButton';

interface AutomaticParticipantScreenProps extends SharedParticipantScreenProps {
  isHostSelected?: boolean;
  selectedFriends?: Friend[];
}

export const AutomaticParticipantScreen: React.FC<AutomaticParticipantScreenProps> = ({
  title = 'Arrange Participants',
  subtitle,
  capacity,
  maxCapacity,
  isHostSelected = false,
  userProfile,
  selectedFriends = [],
  externalGoingList = [],
  externalWaitlist = [],
  externalInvitedList = [],
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
  initialTab,
  waitlistMode = 'automatic',
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

  const displayGoing = mode === 'editor' ? externalGoingList : internalGoingList;
  const displayWaitlist = mode === 'editor' ? externalWaitlist : internalWaitlist;
  const displayInvited = mode === 'editor' ? externalInvitedList : [];

  const hasGoingTab = displayGoing.length > 0;
  const hasWaitlistTab = displayWaitlist.length > 0;
  const hasInvitedTab = displayInvited.length > 0;

  const visibleTabs = useMemo<ParticipantTab[]>(() => {
    if (mode === 'wizard') {
      return ['invited'];
    }
    const t: ParticipantTab[] = [];
    if (hasInvitedTab) t.push('invited');
    if (hasGoingTab) t.push('going');
    if (hasWaitlistTab) t.push('waitlist');
    if (t.length === 0) t.push('going');
    return t;
  }, [hasInvitedTab, hasGoingTab, hasWaitlistTab, mode]);

  const [activeTab, setActiveTab] = useState<ParticipantTab>('going');
  const initialMountRef = React.useRef(true);

  useEffect(() => {
    if (mode === 'wizard') {
      setActiveTab('invited');
      return;
    }
    if (initialMountRef.current && visibleTabs.length > 0) {
      let defaultTab: ParticipantTab;
      if (initialTab && visibleTabs.includes(initialTab)) {
        defaultTab = initialTab;
      } else if (visibleTabs.includes('going')) {
        defaultTab = 'going';
      } else if (visibleTabs.includes('waitlist')) {
        defaultTab = 'waitlist';
      } else {
        defaultTab = 'invited';
      }
      setActiveTab(defaultTab);
      initialMountRef.current = false;
    }
  }, [visibleTabs, initialTab, mode]);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.includes(activeTab)) {
      const fallbackTab = (['going', 'waitlist', 'invited'] as ParticipantTab[]).find((t) => visibleTabs.includes(t)) || visibleTabs[0];
      setActiveTab(fallbackTab);
    }
  }, [visibleTabs, activeTab]);

  // Action sheet state
  const [selectedItem, setSelectedItem] = useState<Friend | null>(null);
  const [sheetType, setSheetType] = useState<ParticipantTab | null>(null);
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);

  const isInviteOnly = managementMode === 'invite_only' || (!isHostUser && managementMode !== 'host');

  const handleItemTap = (item: Friend, type: ParticipantTab) => {
    if (isInviteOnly) return;
    setSelectedItem(item);
    setSheetType(type);
    setShowConfirmRemove(false);
  };

  const closeSheet = () => {
    setSelectedItem(null);
    setSheetType(null);
    setShowConfirmRemove(false);
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
        onConfirmAdjustCapacity={onAdjustCapacity}
      />

      <WaitlistModeSelector
        waitlistMode={waitlistMode}
        onWaitlistModeChange={onWaitlistModeChange}
        isHostUser={isHostUser}
        isInviteOnly={isInviteOnly}
      />

      <AutomaticParticipantTabs
        visibleTabs={visibleTabs}
        activeTab={activeTab}
        goingCount={displayGoing.length}
        capacity={capacity}
        waitlistCount={displayWaitlist.length}
        invitedCount={mode === 'wizard' ? selectedFriends.length : displayInvited.length}
        onTabChange={setActiveTab}
        onAddFriends={onAddFriends}
      />

      {/* List content — Automatic Queue (No drag & drop / reordering) */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '16px 20px 100px', gap: 8, flex: 1, overflowY: 'auto' }}>
        {activeTab === 'going' && (
          <GoingSection
            goingList={displayGoing}
            onItemTap={isHostUser ? (item) => handleItemTap(item, 'going') : undefined}
            reorderable={false}
            showIndex={false}
          />
        )}
        {activeTab === 'waitlist' && hasWaitlistTab && (
          <WaitlistSection
            waitlist={displayWaitlist}
            onItemTap={isHostUser ? (item) => handleItemTap(item, 'waitlist') : undefined}
            onAddFriends={onAddFriends}
            reorderable={false}
            showIndex={true}
          />
        )}
        {activeTab === 'invited' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            {(mode === 'wizard' ? selectedFriends : displayInvited).map((item) => (
              <StackingFriends
                key={item.id}
                item={item}
                onClick={isHostUser ? () => handleItemTap(item, 'invited') : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {mode === 'wizard' && onContinue && (
        <ContinueButton
          disabled={displayGoing.length < capacity && (displayGoing.length + displayWaitlist.length) >= capacity}
          onClick={() => onContinue(displayGoing, displayWaitlist)}
          text={
            continueText ||
            (displayGoing.length < capacity && (displayGoing.length + displayWaitlist.length) >= capacity
              ? `Continue (${displayGoing.length}/${capacity})`
              : `Continue (${displayGoing.length} Going • ${displayWaitlist.length} Waitlisted)`)
          }
        />
      )}

      <AutomaticParticipantActions
        selectedItem={selectedItem}
        sheetType={sheetType}
        showConfirmRemove={showConfirmRemove}
        isHostUser={isHostUser}
        userProfile={userProfile}
        onClose={closeSheet}
        onShowConfirmRemove={setShowConfirmRemove}
        onPromoteHost={onPromoteHost}
        onDemoteHost={onDemoteHost}
        onRemoveParticipant={onRemoveParticipant || (() => {})}
      />
    </div>
  );
};
