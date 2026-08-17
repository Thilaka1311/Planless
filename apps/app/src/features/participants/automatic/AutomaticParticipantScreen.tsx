import React, { useState, useEffect, useMemo } from 'react';
import { UserPlus } from 'lucide-react';
import { SharedParticipantScreenProps, Friend, ParticipantTab } from '../shared/types';
import { ParticipantHeader } from '../shared/ParticipantHeader';
import { PlanSizeCard } from '../shared/PlanSizeCard';

import { AutomaticParticipantTabs } from './AutomaticParticipantTabs';
import { AutomaticParticipantActions } from './AutomaticParticipantActions';
import { GoingSection } from '../components/GoingSection';
import { WaitlistSection } from '../components/WaitlistSection';
import { StackingFriends } from '../components/StackingFriends';
import { ContinueButton } from '../../create/components/ContinueButton';
import { WaitlistModeSelector } from '../shared/WaitlistModeSelector';
import { PendingDecisionsSection } from '../shared/PendingDecisionsSection';

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
  isHost,
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
  onOpenActivity,
  initialTab,
  onPlanSizeEditingChange,
  displayMode = 'standalone',
  waitlistMode = 'automatic',
  onWaitlistModeChange,
  showWaitlistMode = true,
  pendingLeaveRequests,
  onReplaceLeaveParticipant,
  onKeepPaymentLeaveParticipant,
}) => {
  const isStandalone = displayMode === 'standalone';

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

  const isFull = capacity > 0 && displayGoing.length >= capacity;

  const visibleTabs = useMemo<ParticipantTab[]>(() => {
    if (mode === 'wizard') {
      return ['invited'];
    }
    // Phase 2: Plan is full -> Going + Waitlist
    if (isFull) {
      return ['going', 'waitlist'];
    }
    // Phase 1: Before plan is full -> Invited + Going
    return ['invited', 'going'];
  }, [isFull, mode]);

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
  const [isPlanSizeEditing, setIsPlanSizeEditing] = useState(false);

  const isInviteOnly = managementMode === 'invite_only' || (!isHostUser && managementMode !== 'host');

  const handleItemTap = (item: Friend, type: ParticipantTab) => {
    if (isInviteOnly || isPlanSizeEditing) return;
    setSelectedItem(item);
    setSheetType(type);
    setShowConfirmRemove(false);
  };

  const closeSheet = () => {
    setSelectedItem(null);
    setSheetType(null);
    setShowConfirmRemove(false);
  };

  const effectiveIsHost = isHost !== undefined ? isHost : isHostUser;

  return (
    <div
      className="flex-1 flex flex-col h-full bg-[#000000] text-left relative"
      style={{ fontFamily: 'Inter, sans-serif', width: '100%', color: '#FFFFFF' }}
    >
      {isStandalone && (
        <ParticipantHeader
          title={title}
          subtitle={subtitle}
          isHostUser={effectiveIsHost}
          onBack={onBack}
          onOpenSettings={onOpenSettings}
          onOpenActivity={onOpenActivity}
          displayMode={displayMode}
        />
      )}

      {effectiveIsHost && (
        <>
          <div className={displayMode === 'embedded' ? "pt-4" : ""}>
            <PlanSizeCard
              capacity={capacity}
              maxCapacity={maxCapacity}
              isHostUser={effectiveIsHost}
              isInviteOnly={isInviteOnly}
              onConfirmAdjustCapacity={onAdjustCapacity}
              onEditingChange={(editing) => {
                setIsPlanSizeEditing(editing);
                if (onPlanSizeEditingChange) onPlanSizeEditingChange(editing);
              }}
            />
          </div>
          <PendingDecisionsSection
            pendingRequests={pendingLeaveRequests || []}
            onReplaceParticipant={onReplaceLeaveParticipant}
            onKeepPayment={onKeepPaymentLeaveParticipant}
          />
          {showWaitlistMode && (
            <WaitlistModeSelector
              waitlistMode={waitlistMode}
              onWaitlistModeChange={onWaitlistModeChange}
              isHost={effectiveIsHost}
            />
          )}
        </>
      )}

      <AutomaticParticipantTabs
        visibleTabs={visibleTabs}
        activeTab={activeTab}
        goingCount={displayGoing.length}
        capacity={capacity}
        waitlistCount={displayWaitlist.length}
        invitedCount={mode === 'wizard' ? selectedFriends.length : displayInvited.length}
        onTabChange={setActiveTab}
      />

      {/* Action Button Below Segmented Control — Automatic Mode */}
      {effectiveIsHost && onAddFriends && (
        <div style={{ padding: '0 20px', margin: '4px 0 12px' }}>
          <button
            type="button"
            onClick={() => onAddFriends()}
            style={{
              width: '100%',
              padding: '11px 16px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 14,
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontFamily: 'Inter, sans-serif',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            className="hover:bg-white/[0.12] active:scale-[0.99]"
          >
            <UserPlus className="w-4 h-4 text-white" />
            <span>Invite Participants</span>
          </button>
        </div>
      )}

      {/* List content — Automatic Queue (No drag & drop / reordering) */}
      <div className="touch-pan-y" style={{ display: 'flex', flexDirection: 'column', padding: '8px 20px 100px', gap: 8, flex: 1, overflowY: 'auto' }}>
        {activeTab === 'going' && (
          <GoingSection
            goingList={displayGoing}
            onItemTap={effectiveIsHost ? (item) => handleItemTap(item, 'going') : undefined}
            reorderable={false}
            showIndex={false}
          />
        )}
        {activeTab === 'waitlist' && (
          <WaitlistSection
            waitlist={displayWaitlist}
            onItemTap={effectiveIsHost ? (item) => handleItemTap(item, 'waitlist') : undefined}
            onAddFriends={effectiveIsHost ? onAddFriends : undefined}
            reorderable={false}
            showIndex={true}
          />
        )}
        {activeTab === 'invited' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            {(mode === 'wizard'
              ? [...(hostItem ? [hostItem] : []), ...selectedFriends]
              : displayInvited
            ).map((item) => (
              <StackingFriends
                key={item.id}
                item={item}
                onClick={effectiveIsHost ? () => handleItemTap(item, 'invited') : undefined}
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

      {effectiveIsHost && (
        <AutomaticParticipantActions
          selectedItem={selectedItem}
          sheetType={sheetType}
          showConfirmRemove={showConfirmRemove}
          isHostUser={effectiveIsHost}
          userProfile={userProfile}
          onClose={closeSheet}
          onShowConfirmRemove={setShowConfirmRemove}
          onMoveToGoing={onMoveToGoing}
          onPromoteHost={onPromoteHost}
          onDemoteHost={onDemoteHost}
          onRemoveParticipant={onRemoveParticipant || (() => {})}
        />
      )}
    </div>
  );
};
