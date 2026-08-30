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

  const displayGoing = mode === 'editor' ? (externalGoingList ?? []) : internalGoingList;
  const displayWaitlist = mode === 'editor' ? (externalWaitlist ?? []) : internalWaitlist;
  const displaySkipped = mode === 'editor' ? (externalSkippedList || []) : [];

  const visibleTabs = useMemo<ParticipantTab[]>(() => {
    if (isCompletedPlan) {
      const t: ParticipantTab[] = ['going'];
      if (displaySkipped.length > 0) t.push('skipped');
      return t;
    }
    const t: ParticipantTab[] = ['going'];
    if (displayWaitlist.length > 0 || mode === 'wizard') t.push('waitlist');
    if (displaySkipped.length > 0) t.push('skipped');
    return t;
  }, [displayWaitlist, displaySkipped, mode, isCompletedPlan]);

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
  const [viewProfileUserId, setViewProfileUserId] = useState<string | null>(null);

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

  const moveToGoingAction = async (item: Friend) => {
    if (onMoveToGoing) {
      await onMoveToGoing(item);
    }
  };

  const moveToWaitlistAction = async (item: Friend) => {
    if (onMoveToWaitlist) {
      await onMoveToWaitlist(item);
    }
  };

  const removeFromPlanAction = async (item: Friend) => {
    if (onRemoveParticipant) {
      await onRemoveParticipant(item);
    }
  };

  const isPlanSizeEditing = false;
  const isInviteOnly = false;

  const handleItemTap = (item: Friend, type: ParticipantTab) => {
    if (isCompletedPlan) {
      setViewProfileUserId(item.dbUuid || item.id);
      return;
    }
    if (isPlanSizeEditing) return;
    setSelectedItem(item);
    setSheetType(type);
    setShowConfirmRemove(false);
  };

  const closeSheet = () => {
    setSelectedItem(null);
    setSheetType(null);
    setShowConfirmRemove(false);
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
        />
      )}

      {!isCompletedPlan && effectiveIsHost && (
        <>
          {mode !== 'wizard' && (
            <div className={displayMode === 'embedded' ? "pt-4" : ""}>
              <PlanSizeCard
                capacity={capacity}
                maxCapacity={maxCapacity}
                isHostUser={effectiveIsHost}
                isInviteOnly={isInviteOnly}
                onConfirmAdjustCapacity={handleApplyCapacityChange}
                onEditingChange={(editing) => {
                  if (onPlanSizeEditingChange) onPlanSizeEditingChange(editing);
                }}
              />
            </div>
          )}
          {showWaitlistMode && (
            <WaitlistModeSelector
              waitlistMode={waitlistMode}
              onWaitlistModeChange={onWaitlistModeChange}
              isHost={effectiveIsHost}
              variant={mode === 'wizard' ? 'plain' : 'card'}
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

      <AssignedParticipantTabs
        visibleTabs={visibleTabs}
        activeTab={activeTab}
        goingCount={displayGoing.length}
        capacity={capacity}
        waitlistCount={displayWaitlist.length}
        skippedCount={displaySkipped.length}
        isCompletedPlan={isCompletedPlan}
        onTabChange={setActiveTab}
      />

      {/* List content — Assigned Mode */}
      <div className="touch-pan-y" style={{ display: 'flex', flexDirection: 'column', padding: '8px 20px 100px', gap: 16, flex: 1, overflowY: 'auto' }}>
        {activeTab === 'going' && (
          <>
            {displayGoing.length > 0 ? (
              <GoingSection
                goingList={displayGoing}
                onItemTap={(item) => handleItemTap(item, 'going')}
                showIndex={false}
              />
            ) : (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
                <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.3)', textAlign: 'center' }}>
                  No participants in Joined.
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
        onCancel={handleCancelConfirm}
      />

      <FriendProfileViewerBottomSheet
        friendUserId={viewProfileUserId}
        onClose={() => setViewProfileUserId(null)}
      />

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
