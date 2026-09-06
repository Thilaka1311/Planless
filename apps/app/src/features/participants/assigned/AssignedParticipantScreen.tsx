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
import { FriendProfileViewerBottomSheet } from '../../friendships/components/FriendProfileViewerBottomSheet';
import { EditCapacityBottomSheet } from '../../plans/components/BottomSheets';
import { getSavedDraftParticipants, saveDraftParticipants } from '../../create/utils/draftParticipantStorage';

interface AssignedParticipantScreenProps extends SharedParticipantScreenProps {
  isHostSelected?: boolean;
  selectedFriends?: Friend[];
  priorityGuestIds?: string[];
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
  priorityGuestIds,
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
  onParticipantsChange,
  onAddFriends,
  onAdjustCapacity,
  onMoveToGoing,
  onMoveToWaitlist,
  onRemoveParticipant,
  onLeavePlan,
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
  onRejoinAddToWaitlist,
  onRejoinRemoveFromPlan,
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

  // ── Helpers for alphabetical Going order and waitlist numbering ──
  const sortGoingFriends = (friends: Friend[]): Friend[] => {
    return [...friends].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
  };

  const renumberWaitlist = (friends: Friend[]): Friend[] => {
    return friends.map((f, idx) => ({ ...f, waitlistPosition: idx + 1 }));
  };

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

  const [internalGoingList, setInternalGoingList] = useState<Friend[]>(() => {
    if (mode !== 'wizard') return [];
    const savedDraft = getSavedDraftParticipants();
    const hostArr = hostItem ? [hostItem] : [];

    if (savedDraft && (savedDraft.joinedIds.length > 0 || savedDraft.waitlistIds.length > 0)) {
      const friendMap = new Map<string, Friend>();
      if (selectedFriends.length > 0) {
        selectedFriends.forEach((f) => {
          if (f.id) friendMap.set(String(f.id), f);
          if (f.dbUuid) friendMap.set(String(f.dbUuid), f);
        });
      } else {
        if (savedDraft.joinedFriends) {
          savedDraft.joinedFriends.forEach((f) => {
            if (f.id) friendMap.set(String(f.id), f);
            if (f.dbUuid) friendMap.set(String(f.dbUuid), f);
          });
        }
        if (savedDraft.waitlistFriends) {
          savedDraft.waitlistFriends.forEach((f) => {
            if (f.id) friendMap.set(String(f.id), f);
            if (f.dbUuid) friendMap.set(String(f.dbUuid), f);
          });
        }
      }

      const isHostInJoined = savedDraft.joinedIds.includes('host') || isHostSelected;
      const goingGuests = savedDraft.joinedIds
        .filter((id) => id !== 'host' && friendMap.has(id))
        .map((id) => friendMap.get(id)!);
      let restoredGoing = [...(isHostInJoined && hostItem ? [hostItem] : []), ...sortGoingFriends(goingGuests)];
      const goingIdSet = new Set(restoredGoing.map((f) => f.id));

      const waitGuests = savedDraft.waitlistIds
        .filter((id) => id !== 'host' && friendMap.has(id) && !goingIdSet.has(id))
        .map((id) => friendMap.get(id)!);
      const allocatedIds = new Set([...goingIdSet, ...waitGuests.map((f) => f.id)]);
      const unallocatedGuests = selectedFriends.filter((f) => !allocatedIds.has(f.id) && !f.isHost);

      if (unallocatedGuests.length > 0) {
        if (capacity === undefined) {
          restoredGoing = [...restoredGoing, ...sortGoingFriends(unallocatedGuests)];
        } else {
          const availableCapacity = Math.max(0, capacity - restoredGoing.length);
          const toGoing = unallocatedGuests.slice(0, availableCapacity);
          restoredGoing = [...restoredGoing, ...sortGoingFriends(toGoing)];
        }
      }

      return restoredGoing;
    }

    if (priorityGuestIds && priorityGuestIds.length > 0) {
      const prioritySet = new Set(priorityGuestIds);
      const goingFriends = sortGoingFriends(selectedFriends.filter((f) => prioritySet.has(f.id)));
      return [...hostArr, ...goingFriends];
    }

    const sortedGuests = sortGoingFriends(selectedFriends);
    const allList = [...hostArr, ...sortedGuests];
    const effectiveCap = isConfigured && capacity !== undefined && capacity < allList.length ? capacity : allList.length;
    return allList.slice(0, effectiveCap);
  });

  const [internalWaitlist, setInternalWaitlist] = useState<Friend[]>(() => {
    if (mode !== 'wizard') return [];
    const savedDraft = getSavedDraftParticipants();

    if (savedDraft && (savedDraft.joinedIds.length > 0 || savedDraft.waitlistIds.length > 0)) {
      const friendMap = new Map<string, Friend>();
      if (selectedFriends.length > 0) {
        selectedFriends.forEach((f) => {
          if (f.id) friendMap.set(String(f.id), f);
          if (f.dbUuid) friendMap.set(String(f.dbUuid), f);
        });
      } else {
        if (savedDraft.joinedFriends) {
          savedDraft.joinedFriends.forEach((f) => {
            if (f.id) friendMap.set(String(f.id), f);
            if (f.dbUuid) friendMap.set(String(f.dbUuid), f);
          });
        }
        if (savedDraft.waitlistFriends) {
          savedDraft.waitlistFriends.forEach((f) => {
            if (f.id) friendMap.set(String(f.id), f);
            if (f.dbUuid) friendMap.set(String(f.dbUuid), f);
          });
        }
      }

      const joinedIdSet = new Set(savedDraft.joinedIds);
      const waitGuests = savedDraft.waitlistIds
        .filter((id) => id !== 'host' && !joinedIdSet.has(id) && friendMap.has(id))
        .map((id) => friendMap.get(id)!);

      const hostCount = (savedDraft.joinedIds.includes('host') || isHostSelected) && hostItem ? 1 : 0;
      const goingGuestCount = savedDraft.joinedIds.filter((id) => id !== 'host' && friendMap.has(id)).length;
      const totalGoingCount = hostCount + goingGuestCount;

      const allocatedIds = new Set([...savedDraft.joinedIds, ...savedDraft.waitlistIds]);
      const unallocatedGuests = selectedFriends.filter((f) => !allocatedIds.has(f.id) && !f.isHost);

      if (unallocatedGuests.length > 0 && capacity !== undefined) {
        const availableCapacity = Math.max(0, capacity - totalGoingCount);
        const toWait = unallocatedGuests.slice(availableCapacity);
        return renumberWaitlist([...waitGuests, ...toWait]);
      }

      return renumberWaitlist(waitGuests);
    }

    if (priorityGuestIds && priorityGuestIds.length > 0) {
      const prioritySet = new Set(priorityGuestIds);
      const waitFriends = renumberWaitlist(selectedFriends.filter((f) => !prioritySet.has(f.id)));
      return waitFriends;
    }

    const sortedGuests = sortGoingFriends(selectedFriends);
    const allList = [...(hostItem ? [hostItem] : []), ...sortedGuests];
    const effectiveCap = isConfigured && capacity !== undefined && capacity < allList.length ? capacity : allList.length;
    return renumberWaitlist(allList.slice(effectiveCap));
  });

  const isInitializedRef = React.useRef(false);

  const totalInvitedCount = (hostItem ? 1 : 0) + selectedFriends.length;
  const isConfigured = Boolean(isCapacityConfigured && capacity !== undefined);

  const persistParticipantState = React.useCallback(
    (going: Friend[], wait: Friend[]) => {
      if (mode !== 'wizard') return;

      const joinedIds = going.map((f) => f.id);
      const joinedSet = new Set(joinedIds);
      // Enforce invariant: Joined IDs ∩ Waitlist IDs = ∅
      const cleanWaitlist = wait.filter((f) => !joinedSet.has(f.id));
      const waitlistIds = cleanWaitlist.map((f) => f.id);

      saveDraftParticipants({
        joinedIds,
        waitlistIds,
        joinedFriends: going.filter((f) => !f.isHost),
        waitlistFriends: cleanWaitlist.filter((f) => !f.isHost),
      });

      if (onParticipantsChange) {
        onParticipantsChange(going, cleanWaitlist);
      }
    },
    [mode, onParticipantsChange]
  );

  const prevSelectedFriendsRef = React.useRef<Friend[]>(selectedFriends);

  useEffect(() => {
    if (mode !== 'wizard') return;

    // After initial mount, mark initialized so subsequent changes can reconcile safely
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      return;
    }

    const currentSelectedIds = new Set(selectedFriends.map((f) => f.id));
    const currentFriendMap = new Map<string, Friend>();
    selectedFriends.forEach((f) => {
      if (f.id) currentFriendMap.set(String(f.id), f);
      if (f.dbUuid) currentFriendMap.set(String(f.dbUuid), f);
    });

    const prevIds = (prevSelectedFriendsRef.current || []).map((f) => f.id).sort().join(',');
    const currIds = selectedFriends.map((f) => f.id).sort().join(',');

    if (prevIds === currIds) {
      // Selection set unchanged: safely enrich existing entries with latest profile info
      setInternalGoingList((prev) =>
        prev.map((f) => (f.isHost ? f : currentFriendMap.get(f.id) || currentFriendMap.get(f.dbUuid) || f))
      );
      setInternalWaitlist((prev) =>
        prev.map((f) => currentFriendMap.get(f.id) || currentFriendMap.get(f.dbUuid) || f)
      );
      return;
    }
    prevSelectedFriendsRef.current = selectedFriends;

    // Selection changed: reconcile new and removed participants
    const hostPart = isHostSelected && hostItem ? [hostItem] : [];
    setInternalGoingList((prevGoing) => {
      const nonHostGoing = prevGoing
        .filter((f) => !f.isHost && currentSelectedIds.has(f.id))
        .map((f) => currentFriendMap.get(f.id) || currentFriendMap.get(f.dbUuid) || f);

      setInternalWaitlist((prevWait) => {
        const goingIdSet = new Set(nonHostGoing.map((f) => f.id));
        const waitRemaining = prevWait
          .filter((f) => !f.isHost && currentSelectedIds.has(f.id) && !goingIdSet.has(f.id))
          .map((f) => currentFriendMap.get(f.id) || currentFriendMap.get(f.dbUuid) || f);

        const allocatedIds = new Set([...goingIdSet, ...waitRemaining.map((f) => f.id)]);
        const unallocated = selectedFriends.filter((f) => !f.isHost && !allocatedIds.has(f.id));

        let nextGoingGuests = [...nonHostGoing];
        let nextWaitGuests = [...waitRemaining];

        if (unallocated.length > 0) {
          if (capacity === undefined) {
            nextGoingGuests = [...nextGoingGuests, ...sortGoingFriends(unallocated)];
          } else {
            const totalGoing = hostPart.length + nextGoingGuests.length;
            const availableCap = Math.max(0, capacity - totalGoing);
            const toGoing = unallocated.slice(0, availableCap);
            const toWait = unallocated.slice(availableCap);
            nextGoingGuests = [...nextGoingGuests, ...sortGoingFriends(toGoing)];
            nextWaitGuests = [...nextWaitGuests, ...toWait];
          }
        }

        const finalGoing = [...hostPart, ...sortGoingFriends(nextGoingGuests)];
        const finalWait = renumberWaitlist(nextWaitGuests);

        persistParticipantState(finalGoing, finalWait);
        return finalWait;
      });

      return prevGoing;
    });
  }, [selectedFriends, isHostSelected, mode, hostItem, capacity, persistParticipantState]);

  useEffect(() => {
    if (mode === 'wizard' && totalInvitedCount > 0 && capacity !== undefined && capacity > totalInvitedCount) {
      onAdjustCapacity?.(totalInvitedCount);
    }
  }, [mode, capacity, totalInvitedCount, onAdjustCapacity]);

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
      const t: ParticipantTab[] = [];
      if (displayGoing.length > 0) t.push('going');
      if (displaySkipped.length > 0) t.push('skipped');
      return t;
    }
    const t: ParticipantTab[] = [];
    const hasGoing = displayGoing.length > 0;
    const hasWait = displayWaitlist.length > 0;
    if (hasGoing) t.push('going');
    if (hasWait) t.push('waitlist');
    if (mode === 'editor' && displaySkipped.length > 0) t.push('skipped');
    return t;
  }, [displayGoing.length, displayWaitlist.length, displaySkipped.length, mode, isCompletedPlan]);

  const [activeTab, setActiveTab] = useState<ParticipantTab>('going');
  const initialMountRef = React.useRef(true);

  useEffect(() => {
    if (initialMountRef.current && visibleTabs.length > 0) {
      let defaultTab: ParticipantTab = 'going';
      if (initialTab && visibleTabs.includes(initialTab) && initialTab !== 'invited') {
        defaultTab = initialTab;
      } else if (!visibleTabs.includes('going')) {
        defaultTab = visibleTabs[0];
      }
      setActiveTab(defaultTab);
      initialMountRef.current = false;
    }
  }, [visibleTabs, initialTab]);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.includes(activeTab)) {
      const fallbackTab = (['going', 'waitlist', 'invited', 'skipped'] as ParticipantTab[]).find((t) => visibleTabs.includes(t)) || visibleTabs[0];
      setActiveTab(fallbackTab);
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
      const nextWait = renumberWaitlist(internalWaitlist.filter((f) => f.id !== item.id));
      const hostPart = internalGoingList.filter((f) => f.isHost);
      const guestPart = internalGoingList.filter((f) => !f.isHost && f.id !== item.id);
      const nextGoing = [...hostPart, ...sortGoingFriends([...guestPart, { ...item, waitlistPosition: undefined }])];

      setInternalWaitlist(nextWait);
      setInternalGoingList(nextGoing);
      if (onAdjustCapacity) {
        onAdjustCapacity(nextGoing.length);
      }
      persistParticipantState(nextGoing, nextWait);
      return;
    }
    if (onMoveToGoing) {
      await onMoveToGoing(item);
    }
  };

  const moveToWaitlistAction = async (item: Friend) => {
    closeSheet();
    if (mode === 'wizard') {
      if (item.isHost) return;
      const nextGoing = internalGoingList.filter((f) => f.id !== item.id);
      const nextWait = renumberWaitlist([...internalWaitlist.filter((f) => f.id !== item.id), item]);

      setInternalGoingList(nextGoing);
      setInternalWaitlist(nextWait);
      if (onAdjustCapacity) {
        onAdjustCapacity(nextGoing.length);
      }
      persistParticipantState(nextGoing, nextWait);
      return;
    }
    if (onMoveToWaitlist) {
      await onMoveToWaitlist(item);
    }
  };

  const removeFromPlanAction = async (item: Friend) => {
    closeSheet();
    if (mode === 'wizard') {
      const wasInGoing = internalGoingList.some((f) => f.id === item.id);
      const nextGoing = internalGoingList.filter((f) => f.id !== item.id);
      const nextWait = renumberWaitlist(internalWaitlist.filter((f) => f.id !== item.id));

      setInternalGoingList(nextGoing);
      setInternalWaitlist(nextWait);
      if (wasInGoing && onAdjustCapacity) {
        onAdjustCapacity(Math.max(2, nextGoing.length));
      }
      persistParticipantState(nextGoing, nextWait);
    }
    if (onRemoveParticipant) {
      await onRemoveParticipant(item);
    }
  };

  const handleIncrementPlanSize = () => {
    if (mode !== 'wizard') return;
    const currentCap = capacity ?? internalGoingList.length;
    if (currentCap >= totalInvitedCount) return;

    if (internalWaitlist.length > 0) {
      const promoted = internalWaitlist[0];
      const nextWait = renumberWaitlist(internalWaitlist.slice(1));
      const hostPart = internalGoingList.filter((f) => f.isHost);
      const guestPart = internalGoingList.filter((f) => !f.isHost && f.id !== promoted.id);
      const nextGoing = [...hostPart, ...sortGoingFriends([...guestPart, { ...promoted, waitlistPosition: undefined }])];

      setInternalWaitlist(nextWait);
      setInternalGoingList(nextGoing);
      if (onAdjustCapacity) {
        onAdjustCapacity(Math.min(nextGoing.length, totalInvitedCount));
      }
      persistParticipantState(nextGoing, nextWait);
    }
  };

  const handleDecrementPlanSize = () => {
    if (mode !== 'wizard') return;
    const currentCap = capacity ?? internalGoingList.length;
    if (currentCap <= 2) return;

    if (currentCap > internalGoingList.length) {
      if (onAdjustCapacity) {
        onAdjustCapacity(currentCap - 1);
      }
      return;
    }

    const nonHostGoing = sortGoingFriends(internalGoingList.filter((f) => !f.isHost));
    if (nonHostGoing.length === 0 || internalGoingList.length <= 2) return;

    const demoted = nonHostGoing[nonHostGoing.length - 1];

    const nextGoing = internalGoingList.filter((f) => f.id !== demoted.id);
    const nextWait = renumberWaitlist([...internalWaitlist.filter((f) => f.id !== demoted.id), demoted]);

    setInternalGoingList(nextGoing);
    setInternalWaitlist(nextWait);
    if (onAdjustCapacity) {
      onAdjustCapacity(nextGoing.length);
    }
    persistParticipantState(nextGoing, nextWait);
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
                onItemTap={(item) => handleItemTap(item, 'going')}
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
                onReorder={mode === 'wizard' ? (newWait) => {
                  const renumbered = renumberWaitlist(newWait);
                  setInternalWaitlist(renumbered);
                  persistParticipantState(internalGoingList, renumbered);
                } : (effectiveIsHost ? onReorderWaitlist : undefined)}
                onReorderComplete={mode === 'wizard' ? (newWait) => {
                  const renumbered = renumberWaitlist(newWait);
                  setInternalWaitlist(renumbered);
                  persistParticipantState(internalGoingList, renumbered);
                } : (effectiveIsHost ? onReorderWaitlistComplete : undefined)}
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
          disabled={displayGoing.length < 2}
          onClick={() => onContinue(displayGoing, displayWaitlist)}
          text={
            continueText ||
            (displayWaitlist.length > 0
              ? `Continue (${displayGoing.length} Going • ${displayWaitlist.length} Waitlisted)`
              : 'Continue')
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
          mode={mode}
          onClose={closeSheet}
          onShowConfirmRemove={setShowConfirmRemove}
          onMoveToWaitlist={moveToWaitlistAction}
          onMoveToGoing={moveToGoingAction}
          onPromoteHost={onPromoteHost}
          onDemoteHost={onDemoteHost}
          onRemoveParticipant={removeFromPlanAction}
          onLeavePlan={onLeavePlan}
          onReplaceLeaveParticipant={onReplaceLeaveParticipant}
          onKeepPaymentLeaveParticipant={onKeepPaymentLeaveParticipant}
          onInviteSkipped={onInviteSkipped}
          onViewProfile={(item) => setViewProfileUserId(item.dbUuid || item.id)}
          onAddToJoined={moveToGoingAction}
          onAddToWaitlist={onRejoinAddToWaitlist}
          onRemoveFromPlan={onRejoinRemoveFromPlan || removeFromPlanAction}
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
          capacity={Math.min(capacity ?? displayGoing.length, totalInvitedCount)}
          joinedCount={displayGoing.length}
          waitlistedCount={displayWaitlist.length}
          invitedCount={totalInvitedCount}
          minCapacity={2}
          maxCapacity={totalInvitedCount}
          onCapacityChange={(newCap) => {
            if (onAdjustCapacity) {
              onAdjustCapacity(Math.min(newCap, totalInvitedCount));
            }
          }}
          onIncrement={handleIncrementPlanSize}
          onDecrement={handleDecrementPlanSize}
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
