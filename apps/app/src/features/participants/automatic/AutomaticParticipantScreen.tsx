import React, { useState, useEffect, useMemo } from 'react';
import { UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { subTabVariants } from '../../../shared/transitions/motionTokens';
import { SharedParticipantScreenProps, Friend, ParticipantTab } from '../shared/types';
import { ParticipantHeader } from '../shared/ParticipantHeader';
import {
  isJoinedRsvpParticipant,
  partitionAutomaticParticipants,
  calculateNoLimitDenominator,
} from '../../../../lib/participantStatus';
import { AutomaticParticipantTabs } from './AutomaticParticipantTabs';
import { AutomaticWaitlistActions } from './AutomaticWaitlistActions';
import { GoingSection } from '../components/GoingSection';
import { WaitlistSection } from '../components/WaitlistSection';
import { StackingFriends } from '../components/StackingFriends';
import { ContinueButton } from '../../create/components/ContinueButton';
import { WaitlistModeSelector } from '../shared/WaitlistModeSelector';
import { FriendProfileViewerBottomSheet } from '../../friendships/components/FriendProfileViewerBottomSheet';
import { EditCapacityBottomSheet } from '../../plans/components/BottomSheets';

interface AutomaticParticipantScreenProps extends SharedParticipantScreenProps {
  isHostSelected?: boolean;
  selectedFriends?: Friend[];
}

export const AutomaticParticipantScreen: React.FC<AutomaticParticipantScreenProps> = ({
  title = 'Arrange Participants',
  subtitle,
  capacity,
  isCapacityConfigured,
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
  onLeavePlan,
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
  onRejoinAddToPlan,
  onRejoinAddToJoined,
  onRejoinAddToWaitlist,
  onRejoinRemoveFromPlan,
  isCompletedPlan,
  initialOpenPlanSizeSheet,
  onPlanSizeSheetDismissed,
  onBottomSheetStateChange,
}) => {
  const isStandalone = displayMode === 'standalone';

  // ── Wizard mode internal state ──
  const hostItem = useMemo<Friend | null>(() => {
    if (!isHostSelected) return null;
    return {
      id: 'host',
      dbUuid: userProfile?.dbUuid || 'host',
      name: 'You',
      avatar: userProfile?.avatar || userProfile?.profile_photo || '',
      isHost: true,
    };
  }, [isHostSelected, userProfile?.dbUuid, userProfile?.avatar, userProfile?.profile_photo]);

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
      const activeId = (userProfile?.dbUuid || userProfile?.id || '').toLowerCase();
      let currentUserItem: Friend | null = hostItem ? { ...hostItem, name: 'You' } : null;
      const otherFriends: Friend[] = [];

      for (const f of selectedFriends) {
        const fid = String(f.dbUuid || f.id || '').toLowerCase();
        const isUser = f.isHost || (Boolean(activeId) && fid === activeId) || f.name === 'You';
        if (isUser && !currentUserItem) {
          currentUserItem = { ...f, name: 'You', isHost: f.isHost ?? true };
        } else if (!isUser) {
          otherFriends.push(f);
        }
      }

      // Sort everyone else alphabetically in ascending order (A to Z)
      const sortedOthers = [...otherFriends].sort((a, b) => {
        const nameA = a.name || (a as any).full_name || (a as any).username || '';
        const nameB = b.name || (b as any).full_name || (b as any).username || '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      });

      const allWizard = currentUserItem ? [currentUserItem, ...sortedOthers] : sortedOthers;

      return {
        going: allWizard,
        waitlist: [],
        skipped: [],
        goingJoinedCount: currentUserItem ? 1 : 0,
      };
    }
    const members = [
      ...externalGoingList,
      ...externalWaitlist,
      ...externalInvitedList,
      ...(externalSkippedList || []),
    ];
    return partitionAutomaticParticipants(members, capacity ?? 0, userProfile?.dbUuid || userProfile?.id);
  }, [
    mode,
    hostItem,
    selectedFriends,
    externalGoingList,
    externalWaitlist,
    externalInvitedList,
    externalSkippedList,
    capacity,
    isCapacityConfigured,
    isHostSelected,
    userProfile,
    isCompletedPlan,
  ]);

  const displayGoing = partitioned.going;
  const displayWaitlist = partitioned.waitlist;
  const displaySkipped = partitioned.skipped;
  const actualJoinedCount = useMemo(() => {
    if (isCompletedPlan) return displayGoing.length;
    return displayGoing.filter(isJoinedRsvpParticipant).length;
  }, [displayGoing, isCompletedPlan]);

  const allMembers = useMemo(() => {
    if (mode === 'wizard') {
      return (hostItem ? [hostItem] : []).concat(selectedFriends);
    }
    return [
      ...externalGoingList,
      ...externalWaitlist,
      ...externalInvitedList,
      ...(externalSkippedList || []),
    ];
  }, [mode, hostItem, selectedFriends, externalGoingList, externalWaitlist, externalInvitedList, externalSkippedList]);

  const isNoLimit = capacity === null || capacity === undefined;
  const noLimitDenominator = useMemo(() => {
    return calculateNoLimitDenominator(allMembers);
  }, [allMembers]);

  const isConfigured = Boolean(isCapacityConfigured && capacity !== undefined && capacity !== null);
  const isFull = Boolean(capacity && capacity > 0 && actualJoinedCount >= capacity);
  const totalInvitedCount = mode === 'wizard'
    ? (hostItem ? 1 : 0) + selectedFriends.length
    : (externalGoingList.length + externalWaitlist.length + externalInvitedList.length);

  const visibleTabs = useMemo<ParticipantTab[]>(() => {
    if (isCompletedPlan) {
      const tabs: ParticipantTab[] = [];
      if (displayGoing.length > 0) {
        tabs.push('going');
      }
      if (displaySkipped.length > 0) {
        tabs.push('skipped');
      }
      return tabs;
    }
    if (mode === 'wizard') {
      return ['invited'];
    }

    const isNoLimit = capacity === null || capacity === undefined;
    const tabs: ParticipantTab[] = [];

    // In editor mode (Participant Management screen), 'going' (Joined) is always the primary tab.
    // The "Invited" tab is completely removed from Participant Management.
    if (displayGoing.length > 0) {
      tabs.push('going');
    }

    if (!isNoLimit && displayWaitlist.length > 0) {
      tabs.push('waitlist');
    }

    if (displaySkipped.length > 0) {
      tabs.push('skipped');
    }
    return tabs.length > 0 ? tabs : ['going'];
  }, [mode, capacity, displayGoing.length, displayWaitlist.length, displaySkipped.length, isCompletedPlan]);

  const [activeTab, setActiveTab] = useState<ParticipantTab>(
    mode === 'wizard' ? 'invited' : 'going'
  );
  const initialMountRef = React.useRef(true);

  useEffect(() => {
    if (mode === 'wizard') {
      setActiveTab('invited');
      return;
    }
    if (initialMountRef.current && visibleTabs.length > 0) {
      let defaultTab: ParticipantTab = 'going';
      if (initialTab && initialTab !== 'invited' && visibleTabs.includes(initialTab)) {
        defaultTab = initialTab;
      } else if (visibleTabs.includes('going')) {
        defaultTab = 'going';
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
      const fallbackTab = (['going', 'waitlist', 'skipped'] as ParticipantTab[]).find((t) => visibleTabs.includes(t)) || visibleTabs[0];
      setActiveTab(fallbackTab);
    }
  }, [visibleTabs, activeTab]);

  // Action sheet state
  const [selectedItem, setSelectedItem] = useState<Friend | null>(null);
  const [sheetType, setSheetType] = useState<ParticipantTab | null>(null);
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);
  const [viewProfileUserId, setViewProfileUserId] = useState<string | null>(null);
  const [isPlanSizeEditing, setIsPlanSizeEditing] = useState(false);
  const [isCapacitySheetOpen, setIsCapacitySheetOpen] = useState(Boolean(initialOpenPlanSizeSheet));

  useEffect(() => {
    if (initialOpenPlanSizeSheet) {
      setIsCapacitySheetOpen(true);
    }
  }, [initialOpenPlanSizeSheet]);

  useEffect(() => {
    onPlanSizeEditingChange?.(isCapacitySheetOpen);
  }, [isCapacitySheetOpen, onPlanSizeEditingChange]);

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

  const isAnyBottomSheetOpen = Boolean(
    (selectedItem && sheetType) ||
    viewProfileUserId ||
    (effectiveIsHost && isCapacitySheetOpen)
  );

  useEffect(() => {
    onBottomSheetStateChange?.(isAnyBottomSheetOpen);
    return () => {
      onBottomSheetStateChange?.(false);
    };
  }, [isAnyBottomSheetOpen, onBottomSheetStateChange]);

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
          capacity={capacity}
          onBack={onBack}
          onOpenSettings={onOpenSettings}
          onOpenActivity={onOpenActivity}
          displayMode={displayMode}
          mode={mode}
          waitlistMode={waitlistMode}
          onOpenPlanSize={effectiveIsHost && !isCompletedPlan ? () => setIsCapacitySheetOpen(true) : undefined}
        />
      )}

      {!isCompletedPlan && effectiveIsHost && showWaitlistMode && (
        <WaitlistModeSelector
          waitlistMode={waitlistMode}
          onWaitlistModeChange={onWaitlistModeChange}
          isHost={effectiveIsHost}
          variant={mode === 'wizard' ? 'plain' : 'card'}
          capacity={capacity}
          isCapacityConfigured={isCapacityConfigured}
          invitedCount={totalInvitedCount}
        />
      )}

      <AutomaticParticipantTabs
        visibleTabs={visibleTabs}
        activeTab={activeTab}
        goingCount={isCompletedPlan ? displayGoing.length : actualJoinedCount}
        capacity={capacity}
        waitlistCount={displayWaitlist.length}
        noLimitDenominator={noLimitDenominator}
        invitedCount={isNoLimit ? noLimitDenominator : totalInvitedCount}
        skippedCount={displaySkipped.length}
        isCompletedPlan={isCompletedPlan}
        hideCapacityDenominator={mode === 'wizard'}
        onTabChange={setActiveTab}
        onTapInvited={() => {
          if (mode === 'wizard' && effectiveIsHost && !isCompletedPlan) {
            setIsCapacitySheetOpen(true);
          }
        }}
      />

      {/* List content — Automatic Queue (No drag & drop / reordering) */}
      <div className="touch-pan-y" style={{ display: 'flex', flexDirection: 'column', padding: '8px 20px 100px', gap: 8, flex: 1, overflowY: 'auto' }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab === 'invited' ? 'going' : activeTab}
            variants={subTabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', flex: 1 }}
          >
            {(activeTab === 'going' || activeTab === 'invited') && (
              <GoingSection
                goingList={displayGoing}
                isHost={effectiveIsHost}
                onItemTap={effectiveIsHost ? (item) => handleItemTap(item, mode === 'wizard' ? 'invited' : ((item.rsvpStatus === 'INVITED' || item.isAccepted === false) ? 'invited' : 'going')) : (item) => setViewProfileUserId(item.dbUuid || item.id)}
                showIndex={false}
              />
            )}
            {activeTab === 'waitlist' && (
              <WaitlistSection
                waitlist={displayWaitlist}
                isHost={effectiveIsHost}
                onItemTap={effectiveIsHost ? (item) => handleItemTap(item, 'waitlist') : (item) => setViewProfileUserId(item.dbUuid || item.id)}
                onAddFriends={effectiveIsHost ? onAddFriends : undefined}
                reorderable={false}
                showIndex={true}
                useParticipantPosition={true}
              />
            )}
            {activeTab === 'skipped' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                {displaySkipped.map((item) => (
                  <StackingFriends
                    key={item.id}
                    item={item}
                    isHost={effectiveIsHost}
                    onClick={effectiveIsHost ? () => handleItemTap(item, 'skipped') : () => setViewProfileUserId(item.dbUuid || item.id)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
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
          onLeavePlan={onLeavePlan}
          onReplaceLeaveParticipant={onReplaceLeaveParticipant}
          onKeepPaymentLeaveParticipant={onKeepPaymentLeaveParticipant}
          onInviteSkipped={onInviteSkipped ? (item) => onInviteSkipped(item) : undefined}
          onViewProfile={(item) => setViewProfileUserId(item.dbUuid || item.id)}
          onAddToPlan={onRejoinAddToPlan || onRejoinAddToJoined || onMoveToGoing}
          onAddToJoined={onRejoinAddToJoined || onMoveToGoing}
          onAddToWaitlist={onRejoinAddToWaitlist}
          onRemoveFromPlan={onRejoinRemoveFromPlan || onRemoveParticipant}
          onMoveToGoing={onMoveToGoing}
        />
      )}

      <FriendProfileViewerBottomSheet
        friendUserId={viewProfileUserId}
        onClose={() => setViewProfileUserId(null)}
        source="plan"
      />

      <EditCapacityBottomSheet
        isOpen={effectiveIsHost && isCapacitySheetOpen}
        capacity={capacity ?? null}
        invitedCount={mode === 'wizard' ? totalInvitedCount : (externalGoingList.length + externalWaitlist.length + externalInvitedList.length)}
        joinedCount={mode === 'wizard' ? undefined : externalGoingList.length}
        waitlistedCount={mode === 'wizard' ? undefined : externalWaitlist.length}
        minCapacity={2}
        maxCapacity={50}
        limitToInvitedCount={false}
        isAutomatic={true}
        onCapacityChange={(newCap) => {
          if (onAdjustCapacity) {
            if (newCap === null || newCap === undefined) {
              onAdjustCapacity(null);
              return;
            }
            const capped = Math.min(newCap, 50);
            onAdjustCapacity(capped);
          }
        }}
        onAddParticipants={() => {
          setIsCapacitySheetOpen(false);
          onPlanSizeSheetDismissed?.();
          onAddFriends?.(mode === 'wizard' ? 'invited' : activeTab);
        }}
        onClose={() => {
          setIsCapacitySheetOpen(false);
          onPlanSizeSheetDismissed?.();
        }}
      />

      {/* Sticky/Floating Action Button — Bottom Right */}
      {!isCompletedPlan && mode !== 'wizard' && (effectiveIsHost || canParticipantInvite) && onAddFriends && (
        <button
          type="button"
          onClick={() => onAddFriends(activeTab)}
          title="Invite to Plan"
          style={{
            bottom: 'calc(2.25rem + env(safe-area-inset-bottom, 0px))',
            right: 'calc(2rem + env(safe-area-inset-right, 0px))',
          }}
          className="absolute z-40 w-12 h-12 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:scale-95 text-white flex items-center justify-center shadow-lg shadow-black/50 border border-white/20 transition-all duration-200 cursor-pointer pointer-events-auto select-none"
        >
          <UserPlus className="w-5 h-5 text-white" />
        </button>
      )}
    </div>
  );
};
