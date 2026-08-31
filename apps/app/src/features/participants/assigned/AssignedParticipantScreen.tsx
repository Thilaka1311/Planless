import React, { useState, useEffect, useMemo } from 'react';
import { UserPlus } from 'lucide-react';
import { SharedParticipantScreenProps, Friend, ParticipantTab } from '../shared/types';
import { ParticipantHeader } from '../shared/ParticipantHeader';
import { PlanSizeCard } from '../shared/PlanSizeCard';

import { AssignedParticipantTabs } from './AssignedParticipantTabs';
import { AssignedParticipantActions } from './AssignedParticipantActions';
import { GoingSection } from '../components/GoingSection';
import { WaitlistSection } from '../components/WaitlistSection';
import { StackingFriends } from '../components/StackingFriends';
import { ContinueButton } from '../../create/components/ContinueButton';
import { DisplacedHostModal } from '../../plans/components/DisplacedHostModal';
import { WaitlistModeSelector } from '../shared/WaitlistModeSelector';
import { PendingDecisionsSection } from '../shared/PendingDecisionsSection';
import { FriendProfileViewerBottomSheet } from '../../friendships/components/FriendProfileViewerBottomSheet';
import { EditCapacityBottomSheet } from '../../plans/components/BottomSheets';

interface AssignedParticipantScreenProps extends SharedParticipantScreenProps {
  isHostSelected?: boolean;
  selectedFriends?: Friend[];
  externalGoingList?: Friend[];
  externalWaitlist?: Friend[];
  externalInvitedList?: Friend[];
  onReorderWaitlist?: (newWaitlist: Friend[]) => void;
  canParticipantInvite?: boolean;
}

export const AssignedParticipantScreen: React.FC<AssignedParticipantScreenProps> = ({
  title = 'Arrange Participants',
  subtitle,
  capacity,
  isCapacityConfigured,
  maxCapacity,
  isHostSelected = false,
  userProfile,
  selectedFriends = [],
  externalGoingList,
  externalWaitlist,
  externalInvitedList,
  externalSkippedList,
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
  onReorderWaitlist,
  onReorderWaitlistComplete,
  initialTab,
  onPlanSizeEditingChange,
  displayMode = 'standalone',
  waitlistMode = 'assigned',
  onWaitlistModeChange,
  showWaitlistMode = true,
  canParticipantInvite = false,
  currentPage,
  onBottomSheetStateChange,
  pendingLeaveRequests,
  onReplaceLeaveParticipant,
  onKeepPaymentLeaveParticipant,
  onInviteSkipped,
  isCompletedPlan,
  initialOpenPlanSizeSheet,
  onPlanSizeSheetDismissed,
}) => {
  const isStandalone = displayMode === 'standalone';

  const [isCapacitySheetOpen, setIsCapacitySheetOpen] = useState(false);

  useEffect(() => {
    if (initialOpenPlanSizeSheet) {
      setIsCapacitySheetOpen(true);
    }
  }, [initialOpenPlanSizeSheet]);

  // ── Wizard mode internal state ──
  const hostItem = useMemo<Friend | null>(() => {
    if (!isHostSelected) return null;
    return {
      id: 'host',
      dbUuid: userProfile?.dbUuid || 'host',
      name: userProfile?.name || 'You',
      avatar: userProfile?.avatar || userProfile?.profile_photo || '',
      isHost: true,
    };
  }, [isHostSelected, userProfile?.dbUuid, userProfile?.name, userProfile?.avatar, userProfile?.profile_photo]);

  const [internalGoingList, setInternalGoingList] = useState<Friend[]>([]);
  const [internalWaitlist, setInternalWaitlist] = useState<Friend[]>([]);

  const totalInvitedCount = (hostItem ? 1 : 0) + selectedFriends.length;
  const isConfigured = Boolean(isCapacityConfigured && capacity !== undefined);
  const hasWaitlist = isConfigured && capacity !== undefined && capacity < totalInvitedCount;

  useEffect(() => {
    if (mode !== 'wizard') return;
    const allList = [...(hostItem ? [hostItem] : []), ...selectedFriends];
    const effectiveCap = hasWaitlist && capacity !== undefined ? capacity : allList.length;
    const newGoing = allList.slice(0, effectiveCap);
    const newWait = allList.slice(effectiveCap);

    setInternalGoingList((prev) => {
      if (
        prev.length === newGoing.length &&
        prev.every((item, idx) => item.id === newGoing[idx]?.id)
      ) {
        return prev;
      }
      return newGoing;
    });

    setInternalWaitlist((prev) => {
      if (
        prev.length === newWait.length &&
        prev.every((item, idx) => item.id === newWait[idx]?.id)
      ) {
        return prev;
      }
      return newWait;
    });
  }, [selectedFriends, capacity, isHostSelected, mode, isCapacityConfigured, hasWaitlist, hostItem]);

  const displayGoing = mode === 'editor' ? (externalGoingList ?? []) : internalGoingList;
  const displayWaitlist = mode === 'editor' ? (externalWaitlist ?? []) : internalWaitlist;
  const displaySkipped = mode === 'editor' ? (externalSkippedList || []) : [];

  const actualJoinedCount = useMemo(() => {
    if (isCompletedPlan) return displayGoing.length;
    return displayGoing.filter(
      (p) => p.rsvpStatus === 'JOINED' || (p.isAccepted && p.rsvpStatus !== 'INVITED' && p.rsvpStatus !== 'SKIPPED')
    ).length;
  }, [displayGoing, isCompletedPlan]);

  const visibleTabs = useMemo<ParticipantTab[]>(() => {
    if (isCompletedPlan) {
      const t: ParticipantTab[] = ['going'];
      if (displaySkipped.length > 0) t.push('skipped');
      return t;
    }
    if (mode === 'wizard') {
      if (!hasWaitlist) {
        return ['invited'];
      }
      return ['going', 'waitlist'];
    }
    const t: ParticipantTab[] = ['going'];
    if (displayWaitlist.length > 0) t.push('waitlist');
    if (displaySkipped.length > 0) t.push('skipped');
    return t;
  }, [displayWaitlist, displaySkipped, mode, isCompletedPlan, hasWaitlist]);

  const [activeTab, setActiveTab] = useState<ParticipantTab>(
    mode === 'wizard' ? (hasWaitlist ? 'going' : 'invited') : 'going'
  );
  const initialMountRef = React.useRef(true);

  useEffect(() => {
    if (mode === 'wizard') {
      if (!hasWaitlist) {
        setActiveTab((prev) => (prev !== 'invited' ? 'invited' : prev));
      } else if (!visibleTabs.includes(activeTab)) {
        setActiveTab(visibleTabs[0]);
      }
      return;
    }
    if (initialMountRef.current && visibleTabs.length > 0) {
      let defaultTab: ParticipantTab = 'going';
      if (initialTab && visibleTabs.includes(initialTab) && initialTab !== 'invited') {
        defaultTab = initialTab;
      }
      setActiveTab(defaultTab);
      initialMountRef.current = false;
    }
  }, [visibleTabs, initialTab, hasWaitlist, mode, activeTab]);

  // Action sheet & capacity editing state
  const [selectedItem, setSelectedItem] = useState<Friend | null>(null);
  const [sheetType, setSheetType] = useState<ParticipantTab | null>(null);
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);
  const [viewProfileUserId, setViewProfileUserId] = useState<string | null>(null);

  // Displaced Host Modal state
  const [affectedHosts, setAffectedHosts] = useState<Friend[]>([]);
  const [affectedIndex, setAffectedIndex] = useState<number>(-1);
  const [pendingCapacity, setPendingCapacity] = useState<number | null>(null);

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
    if (onDemoteHost) {
      await onDemoteHost(currentHost);
    }
    if (onRemoveParticipant) {
      await onRemoveParticipant(currentHost);
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

  const handleCancelModal = () => {
    setAffectedIndex(-1);
    setAffectedHosts([]);
    setPendingCapacity(null);
  };

  const handleItemTap = (item: Friend, tab: ParticipantTab) => {
    if (mode === 'wizard') return;

    if (!effectiveIsHost && !canParticipantInvite) {
      if (item.dbUuid || item.id) {
        setViewProfileUserId(item.dbUuid || item.id);
      }
      return;
    }

    if (canParticipantInvite && !effectiveIsHost) {
      if (item.dbUuid || item.id) {
        setViewProfileUserId(item.dbUuid || item.id);
      }
      return;
    }

    setSelectedItem(item);
    setSheetType(tab);
  };

  const handleReorder = (newWaitlist: Friend[]) => {
    if (onReorderWaitlist) {
      onReorderWaitlist(newWaitlist);
    }
  };

  const handleDragEnd = () => {
    if (onReorderWaitlistComplete) {
      onReorderWaitlistComplete(displayWaitlist);
    }
  };

  const handleRemoveItem = (item: Friend) => {
    if (mode === 'wizard') {
      if (onRemoveParticipant) {
        onRemoveParticipant(item);
      }
    } else {
      setSelectedItem(item);
      setShowConfirmRemove(true);
    }
  };

  const handleConfirmRemoveAction = () => {
    if (!selectedItem) return;
    if (onRemoveParticipant) {
      onRemoveParticipant(selectedItem);
    }
    setShowConfirmRemove(false);
    setSelectedItem(null);
  };

  const closeSheet = () => {
    setSelectedItem(null);
    setSheetType(null);
    setShowConfirmRemove(false);
  };

  const moveToGoingAction = async (item: Friend) => {
    closeSheet();
    if (mode === 'wizard') {
      setInternalWaitlist((prev) => prev.filter((f) => f.id !== item.id));
      setInternalGoingList((prev) => (prev.some((f) => f.id === item.id) ? prev : [...prev, item]));
      return;
    }
    if (onMoveToGoing) {
      await onMoveToGoing(item);
    }
  };

  const moveToWaitlistAction = async (item: Friend) => {
    closeSheet();
    if (mode === 'wizard') {
      setInternalGoingList((prev) => prev.filter((f) => f.id !== item.id));
      setInternalWaitlist((prev) => (prev.some((f) => f.id === item.id) ? prev : [...prev, item]));
      return;
    }
    if (onMoveToWaitlist) {
      await onMoveToWaitlist(item);
    }
  };

  const removeFromPlanAction = async (item: Friend) => {
    closeSheet();
    if (mode === 'wizard') {
      setInternalGoingList((prev) => prev.filter((f) => f.id !== item.id));
      setInternalWaitlist((prev) => prev.filter((f) => f.id !== item.id));
    }
    if (onRemoveParticipant) {
      await onRemoveParticipant(item);
    }
  };

  useEffect(() => {
    if (onBottomSheetStateChange) {
      onBottomSheetStateChange(Boolean(selectedItem));
    }
  }, [selectedItem, onBottomSheetStateChange]);

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
          mode={mode}
          waitlistMode={waitlistMode}
          onOpenPlanSize={mode === 'wizard' && effectiveIsHost && !isCompletedPlan ? () => setIsCapacitySheetOpen(true) : undefined}
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
          invitedCount={
            mode === 'wizard'
              ? selectedFriends.length + (isHostSelected ? 1 : 0)
              : externalGoingList.length + externalWaitlist.length + (externalSkippedList?.length || 0)
          }
        />
      )}

      {effectiveIsHost && pendingLeaveRequests && pendingLeaveRequests.length > 0 && (
        <PendingDecisionsSection
          pendingRequests={pendingLeaveRequests}
          onReplaceParticipant={onReplaceLeaveParticipant}
          onKeepPayment={onKeepPaymentLeaveParticipant}
        />
      )}

      <AssignedParticipantTabs
        visibleTabs={visibleTabs}
        activeTab={activeTab}
        goingCount={mode === 'wizard' ? displayGoing.length : actualJoinedCount}
        capacity={capacity}
        waitlistCount={displayWaitlist.length}
        invitedCount={mode === 'wizard' ? ((hostItem ? 1 : 0) + selectedFriends.length) : displayGoing.length}
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

      {/* List content — Assigned Mode */}
      <div className="touch-pan-y" style={{ display: 'flex', flexDirection: 'column', padding: '8px 20px 100px', gap: 16, flex: 1, overflowY: 'auto' }}>
        {(activeTab === 'going' || activeTab === 'invited') && (
          <>
            {displayGoing.length > 0 ? (
              <GoingSection
                goingList={displayGoing}
                onItemTap={(item) => handleItemTap(item, activeTab === 'invited' ? 'invited' : 'going')}
                showIndex={false}
              />
            ) : (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
                <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.3)', textAlign: 'center' }}>
                  {activeTab === 'invited' ? 'No invited participants.' : 'No participants in Joined.'}
                </span>
              </div>
            )}
          </>
        )}

        {activeTab === 'waitlist' && (
          <>
            {displayWaitlist.length > 0 ? (
              <WaitlistSection
                waitlist={displayWaitlist}
                onItemTap={(item) => handleItemTap(item, 'waitlist')}
                onAddFriends={effectiveIsHost ? onAddFriends : undefined}
                onReorder={mode === 'wizard' ? (newWait) => setInternalWaitlist(newWait) : (effectiveIsHost ? onReorderWaitlist : undefined)}
                onReorderComplete={effectiveIsHost ? onReorderWaitlistComplete : undefined}
                reorderable={mode === 'wizard' || (effectiveIsHost && Boolean(onReorderWaitlist))}
                showIndex={true}
              />
            ) : (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
                <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.3)', textAlign: 'center' }}>
                  No participants in Waitlist.
                </span>
              </div>
            )}
          </>
        )}

        {activeTab === 'skipped' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            {displaySkipped.map((item) => (
              <StackingFriends
                key={item.id}
                item={item}
                onClick={() => handleItemTap(item, 'skipped')}
              />
            ))}
          </div>
        )}
      </div>

      {mode === 'wizard' && onContinue && (
        <ContinueButton
          disabled={hasWaitlist && capacity !== undefined ? displayGoing.length < capacity : displayGoing.length < 2}
          onClick={() => onContinue(displayGoing, displayWaitlist)}
          text={
            continueText ||
            (!hasWaitlist || capacity === undefined
              ? 'Continue'
              : (displayGoing.length < capacity
                  ? `Continue (${displayGoing.length}/${capacity})`
                  : `Continue (${displayGoing.length} Going • ${displayWaitlist.length} Waitlisted)`))
          }
        />
      )}

      {effectiveIsHost && (
        <AssignedParticipantActions
          selectedItem={selectedItem}
          sheetType={sheetType}
          showConfirmRemove={showConfirmRemove}
          isHostUser={effectiveIsHost}
          userProfile={userProfile}
          goingCount={displayGoing.length}
          waitlistCount={displayWaitlist.length}
          onClose={closeSheet}
          onShowConfirmRemove={setShowConfirmRemove}
          onMoveToWaitlist={moveToWaitlistAction}
          onMoveToGoing={moveToGoingAction}
          onPromoteHost={onPromoteHost}
          onDemoteHost={onDemoteHost}
          onRemoveParticipant={removeFromPlanAction}
          onReplaceLeaveParticipant={onReplaceLeaveParticipant}
          onKeepPaymentLeaveParticipant={onKeepPaymentLeaveParticipant}
          onInviteSkipped={onInviteSkipped}
          onViewProfile={(item) => setViewProfileUserId(item.dbUuid || item.id)}
        />
      )}

      <DisplacedHostModal
        isOpen={affectedIndex >= 0 && affectedIndex < affectedHosts.length}
        hostName={affectedHosts[affectedIndex]?.name || 'Host'}
        hostAvatar={affectedHosts[affectedIndex]?.avatar}
        onMoveToWaitlist={handleMoveToWaitlistConfirm}
        onCancel={handleCancelModal}
      />

      <FriendProfileViewerBottomSheet
        friendUserId={viewProfileUserId}
        onClose={() => setViewProfileUserId(null)}
      />

      {mode === 'wizard' && (
        <EditCapacityBottomSheet
          isOpen={isCapacitySheetOpen}
          capacity={capacity}
          invitedCount={(hostItem ? 1 : 0) + selectedFriends.length}
          minCapacity={2}
          maxCapacity={50}
          onCapacityChange={(newCap) => {
            if (onAdjustCapacity) {
              onAdjustCapacity(newCap);
            }
          }}
          onAddParticipants={() => {
            setIsCapacitySheetOpen(false);
            onPlanSizeSheetDismissed?.();
            onAddFriends?.('invited');
          }}
          onClose={() => {
            setIsCapacitySheetOpen(false);
            onPlanSizeSheetDismissed?.();
          }}
        />
      )}

      {/* Sticky/Floating Action Button — Bottom Right (Only on Page 0 / Participants tab) */}
      {!isCompletedPlan && mode !== 'wizard' && (currentPage === undefined || currentPage === 0) && (effectiveIsHost || canParticipantInvite) && onAddFriends && (
        <button
          type="button"
          onClick={() => onAddFriends(activeTab)}
          title={activeTab === 'going' ? 'Add to Joined' : 'Add to Waitlist'}
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
