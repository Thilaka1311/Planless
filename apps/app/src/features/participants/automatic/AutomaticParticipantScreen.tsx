import React, { useState, useEffect, useMemo } from 'react';
import { UserPlus } from 'lucide-react';
import { SharedParticipantScreenProps, Friend, ParticipantTab } from '../shared/types';
import { ParticipantHeader } from '../shared/ParticipantHeader';
import { PlanSizeCard } from '../shared/PlanSizeCard';
import { partitionAutomaticParticipants } from '../../../../lib/participantStatus';

import { AutomaticParticipantTabs } from './AutomaticParticipantTabs';
import { AutomaticWaitlistActions } from './AutomaticWaitlistActions';
import { GoingSection } from '../components/GoingSection';
import { WaitlistSection } from '../components/WaitlistSection';
import { StackingFriends } from '../components/StackingFriends';
import { ContinueButton } from '../../create/components/ContinueButton';
import { WaitlistModeSelector } from '../shared/WaitlistModeSelector';
import { PendingDecisionsSection } from '../shared/PendingDecisionsSection';
import { FriendProfileViewerBottomSheet } from '../../friendships/components/FriendProfileViewerBottomSheet';

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
  externalSkippedList = [],
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
  onMoveToInvited,
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
  onReplaceLeaveParticipant,
  onKeepPaymentLeaveParticipant,
  pendingLeaveRequests,
  currentPage,
  onInviteSkipped,
  isCompletedPlan,
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

  const partitioned = useMemo(() => {
    if (isCompletedPlan) {
      return {
        going: externalGoingList,
        waitlist: [],
        skipped: externalSkippedList || [],
        goingJoinedCount: externalGoingList.length,
      };
    }
    if (mode === 'wizard') {
      const allWizard = [...(hostItem ? [hostItem] : []), ...selectedFriends];
      return {
        going: allWizard.slice(0, capacity),
        waitlist: allWizard.slice(capacity),
        skipped: [],
        goingJoinedCount: isHostSelected ? 1 : 0,
      };
    }
    const allMembers = [
      ...externalGoingList,
      ...externalWaitlist,
      ...externalInvitedList,
      ...(externalSkippedList || []),
    ];
    return partitionAutomaticParticipants(allMembers, capacity, userProfile?.dbUuid || userProfile?.id);
  }, [
    mode,
    hostItem,
    selectedFriends,
    externalGoingList,
    externalWaitlist,
    externalInvitedList,
    externalSkippedList,
    capacity,
    isHostSelected,
    userProfile,
    isCompletedPlan,
  ]);

  const displayGoing = partitioned.going;
  const displayWaitlist = partitioned.waitlist;
  const displaySkipped = partitioned.skipped;
  const actualJoinedCount = partitioned.goingJoinedCount;

  const isFull = capacity > 0 && actualJoinedCount >= capacity;

  const visibleTabs = useMemo<ParticipantTab[]>(() => {
    if (isCompletedPlan) {
      const tabs: ParticipantTab[] = ['going'];
      if (displaySkipped.length > 0) {
        tabs.push('skipped');
      }
      return tabs;
    }
    if (mode === 'wizard') {
      return ['going'];
    }
    const tabs: ParticipantTab[] = [];
    if (!isFull) {
      tabs.push('invited');
    } else {
      tabs.push('going');
      tabs.push('waitlist');
    }
    if (displaySkipped.length > 0) {
      tabs.push('skipped');
    }
    return tabs;
  }, [mode, isFull, displaySkipped.length, isCompletedPlan]);

  const [activeTab, setActiveTab] = useState<ParticipantTab>('going');
  const initialMountRef = React.useRef(true);

  useEffect(() => {
    if (mode === 'wizard') {
      setActiveTab('going');
      return;
    }
    if (initialMountRef.current && visibleTabs.length > 0) {
      let defaultTab: ParticipantTab;
      if (initialTab && visibleTabs.includes(initialTab)) {
        defaultTab = initialTab;
      } else if (visibleTabs.includes('going')) {
        defaultTab = 'going';
      } else if (visibleTabs.includes('invited')) {
        defaultTab = 'invited';
      } else if (visibleTabs.includes('waitlist')) {
        defaultTab = 'waitlist';
      } else {
        defaultTab = visibleTabs[0];
      }
      setActiveTab(defaultTab);
      initialMountRef.current = false;
    }
  }, [visibleTabs, initialTab, mode]);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.includes(activeTab)) {
      const fallbackTab = (['going', 'invited', 'waitlist', 'skipped'] as ParticipantTab[]).find((t) => visibleTabs.includes(t)) || visibleTabs[0];
      setActiveTab(fallbackTab);
    }
  }, [visibleTabs, activeTab]);

  // Action sheet state
  const [selectedItem, setSelectedItem] = useState<Friend | null>(null);
  const [sheetType, setSheetType] = useState<ParticipantTab | null>(null);
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);
  const [viewProfileUserId, setViewProfileUserId] = useState<string | null>(null);
  const [isPlanSizeEditing, setIsPlanSizeEditing] = useState(false);

  const isInviteOnly = managementMode === 'invite_only' || (!isHostUser && managementMode !== 'host');

  const handleItemTap = (item: Friend, type: ParticipantTab) => {
    if (isCompletedPlan) {
      setViewProfileUserId(item.dbUuid || item.id);
      return;
    }
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
  const canParticipantInvite = managementMode !== 'host' && managementMode !== 'invite_only';

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

      {!isCompletedPlan && effectiveIsHost && (
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
          {showWaitlistMode && (
            <WaitlistModeSelector
              waitlistMode={waitlistMode}
              onWaitlistModeChange={onWaitlistModeChange}
              isHost={effectiveIsHost}
            />
          )}
        </>
      )}

      {effectiveIsHost && pendingLeaveRequests && pendingLeaveRequests.length > 0 && (
        <PendingDecisionsSection
          pendingRequests={pendingLeaveRequests}
          onReplaceParticipant={onReplaceLeaveParticipant}
          onKeepPayment={onKeepPaymentLeaveParticipant}
        />
      )}

      <AutomaticParticipantTabs
        visibleTabs={visibleTabs}
        activeTab={activeTab}
        goingCount={isCompletedPlan ? displayGoing.length : actualJoinedCount}
        capacity={capacity}
        waitlistCount={displayWaitlist.length}
        invitedCount={displayGoing.length}
        skippedCount={displaySkipped.length}
        isCompletedPlan={isCompletedPlan}
        onTabChange={setActiveTab}
      />

      {/* List content — Automatic Queue (No drag & drop / reordering) */}
      <div className="touch-pan-y" style={{ display: 'flex', flexDirection: 'column', padding: '8px 20px 100px', gap: 8, flex: 1, overflowY: 'auto' }}>
        {(activeTab === 'going' || activeTab === 'invited') && (
          <GoingSection
            goingList={mode === 'wizard' ? [...(hostItem ? [hostItem] : []), ...selectedFriends] : displayGoing}
            onItemTap={effectiveIsHost ? (item) => handleItemTap(item, (item.rsvpStatus === 'INVITED' || item.isAccepted === false) ? 'invited' : 'going') : undefined}
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
        {activeTab === 'skipped' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            {displaySkipped.map((item) => (
              <StackingFriends
                key={item.id}
                item={item}
                onClick={effectiveIsHost ? () => handleItemTap(item, 'skipped') : undefined}
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
        <AutomaticWaitlistActions
          selectedItem={selectedItem}
          sheetType={sheetType}
          showConfirmRemove={showConfirmRemove}
          isHostUser={effectiveIsHost}
          userProfile={userProfile}
          onClose={closeSheet}
          onShowConfirmRemove={setShowConfirmRemove}
          onPromoteHost={onPromoteHost}
          onDemoteHost={onDemoteHost}
          onRemoveParticipant={onRemoveParticipant || (() => {})}
          onReplaceLeaveParticipant={onReplaceLeaveParticipant}
          onKeepPaymentLeaveParticipant={onKeepPaymentLeaveParticipant}
          onInviteSkipped={onInviteSkipped ? (item) => onInviteSkipped(item) : undefined}
          onViewProfile={(item) => setViewProfileUserId(item.dbUuid || item.id)}
        />
      )}

      <FriendProfileViewerBottomSheet
        friendUserId={viewProfileUserId}
        onClose={() => setViewProfileUserId(null)}
      />

      {/* Sticky/Floating Action Button — Bottom Right (Only on Page 0 / Participants tab) */}
      {!isCompletedPlan && (currentPage === undefined || currentPage === 0) && (effectiveIsHost || canParticipantInvite) && onAddFriends && (
        <button
          type="button"
          onClick={() => onAddFriends(activeTab)}
          title="Invite to Plan"
          style={{
            bottom: 'calc(2.25rem + env(safe-area-inset-bottom, 0px))',
            right: 'calc(2rem + env(safe-area-inset-right, 0px))',
          }}
          className="fixed z-40 w-12 h-12 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:scale-95 text-white flex items-center justify-center shadow-lg shadow-black/50 border border-white/20 transition-all duration-200 cursor-pointer pointer-events-auto select-none"
        >
          <UserPlus className="w-5 h-5 text-white" />
        </button>
      )}
    </div>
  );
};
