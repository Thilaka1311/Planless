import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { ParticipantManagementScreen, Friend } from '../../../../participants/screens/ParticipantManagementScreen';
import { Plan, UserProfile } from '../../../../../core/types';
import { normalizeStatus } from '../../../../../../lib/participantStatus';
import { useToast } from '../../../../../shared/contexts/ToastContext';
import { WhoIsComingScreen } from '../../../../create/screens/WhoIsComingScreen';
import { useCirclesStore } from '../../../../circles/state/CirclesContext';
import { useFriendshipStore } from '../../../../friendships/state/FriendshipContext';
import { supabase } from '../../../../../../lib/supabaseClient';
import { X } from 'lucide-react';
import { PlanSizeSlider } from '../../../../create/components/PlanSizeSlider';
import { PlanIsFullBottomSheet, MoveToGoingCapacityBottomSheet } from '../../../components/BottomSheets';


interface PlanParticipantManagementWrapperProps {
  plan: Plan;
  userProfile: UserProfile;
  activeUserId?: string;
  isHost: boolean;
  isCreatorHost?: boolean;
  onBack: () => void;
  displayMode?: 'standalone' | 'embedded';
  // Store actions passed in so this wrapper stays store-agnostic
  onMoveToGoing: (planId: string, userId: string) => Promise<void>;
  onMoveToWaitlist: (planId: string, userId: string) => Promise<void>;
  onMoveToInvited: (planId: string, userId: string) => Promise<void>;
  onRemoveParticipant: (planId: string, userId: string) => Promise<void>;
  onChangePlanHost?: (planId: string, newHostId: string, currentHostId: string) => Promise<void>;
  onPromoteToHost?: (planId: string, userId: string) => Promise<void>;
  onDemoteFromHost?: (planId: string, userId: string) => Promise<void>;
  onUpdatePlanCapacity?: (planId: string, capacity: number) => Promise<void> | void;
  onAddParticipants?: (planId: string, userIds: string[], circleIds: string[], targetGroup?: 'GOING' | 'WAITLIST') => Promise<void>;
  onReorderWaitlist?: (planId: string, orderedUserUuids: string[]) => Promise<void>;
  onOpenSettings?: () => void;
  onOpenActivity?: () => void;
  onPlanSizeEditingChange?: (isEditing: boolean) => void;
}

/** Maps a plan member to the shared Friend shape */
function memberToFriend(m: any, hostId: string, activeUserId?: string): Friend {
  const id = m.userId || m.userUuid || m.user_id || m.id;
  const isHostRole = m.role === 'HOST' || m.isHost === true;
  const isCurrentUser = activeUserId && (id === activeUserId || m.userUuid === activeUserId || m.userId === activeUserId || m.user_id === activeUserId);
  const status = normalizeStatus(m.joinState || m.rsvp_status);
  const isAccepted = status !== 'INVITED';
  return {
    id,
    dbUuid: m.userUuid || m.userId || m.user_id || m.id,
    name: isCurrentUser ? 'You' : (m.name || m.displayName || 'Unknown'),
    avatar: m.avatar || m.profile_photo || '',
    isHost: Boolean(isHostRole),
    joinedQueueAt: m.joinedQueueAt || m.joined_queue_at || m.createdAt || m.created_at,
    isAccepted,
    rsvpStatus: status,
    assignedGroup: m.assignedGroup || m.assigned_group || (status === 'WAITLISTED' ? 'WAITLIST' : 'GOING'),
    joinQueue: m.joinQueue ?? m.join_queue ?? null,
    waitlistPosition: m.waitlistPosition ?? m.waitlist_position ?? null,
  };
}

export const PlanParticipantManagementWrapper: React.FC<PlanParticipantManagementWrapperProps> = ({
  plan,
  userProfile,
  activeUserId,
  isHost,
  isCreatorHost = false,
  onBack,
  onMoveToGoing,
  onMoveToWaitlist,
  onMoveToInvited,
  onRemoveParticipant,
  onChangePlanHost,
  onPromoteToHost,
  onDemoteFromHost,
  onUpdatePlanCapacity,
  onAddParticipants,
  onReorderWaitlist,
  onOpenSettings,
  onOpenActivity,
  onPlanSizeEditingChange,
  displayMode = 'standalone',
}) => {
  const { circles } = useCirclesStore();

  const { friends } = useFriendshipStore();
  const { showToast } = useToast();
  const hostId = plan.hostId || '';
  const members: any[] = plan.members || [];

  // Determine active members (excluding host) to filter them out of the picker
  const activeMembers = useMemo(() => {
    return members.filter((m) => {
      const status = normalizeStatus(m.joinState || m.rsvp_status);
      return status === 'JOINED' || status === 'WAITLISTED' || status === 'INVITED';
    });
  }, [members]);

  const disabledUserIds = useMemo(() => {
    return new Set(activeMembers.map((m) => m.userId || m.userUuid || m.user_id || m.id || m.dbUuid).filter(Boolean));
  }, [activeMembers]);

  const skippedMemberIds = useMemo(() => {
    return new Set(
      members
        .filter(m => normalizeStatus(m.joinState || m.rsvp_status) === "SKIPPED")
        .map(m => m.userId || m.userUuid || m.user_id || m.id || m.dbUuid)
        .filter(Boolean)
    );
  }, [members]);

  // Combine all candidate users: host's friends + existing skipped/removed plan members
  const candidateUsers = useMemo(() => {
    const list: any[] = [];
    const seen = new Set<string>();

    friends.forEach((f) => {
      const friendObj = f.friend || f;
      const friendId = friendObj?.id || friendObj?.dbUuid || friendObj?.user_id;
      if (friendObj && friendId) {
        seen.add(friendId);
        list.push({
          ...friendObj,
          id: friendId
        });
      }
    });

    members.forEach((m) => {
      const memberId = m.userId || m.userUuid || m.user_id || m.id || m.dbUuid;
      if (memberId && !seen.has(memberId) && skippedMemberIds.has(memberId)) {
        seen.add(memberId);
        list.push({
          id: memberId,
          full_name: m.name || m.full_name || m.displayName || "",
          profile_photo: m.avatar || m.profile_photo || ""
        });
      }
    });

    return list;
  }, [friends, members, skippedMemberIds]);

  const [showAddFriendsPicker, setShowAddFriendsPicker] = useState(false);
  const [searchPeopleQuery, setSearchPeopleQuery] = useState('');
  const [selectedCircles, setSelectedCircles] = useState<string[]>([]);
  const [individuallySelectedFriendIds, setIndividuallySelectedFriendIds] = useState<string[]>([]);
  const [pickerSelectedFriends, setPickerSelectedFriends] = useState<any[]>([]);

  // Compute set of user IDs belonging to selected circles
  const selectedCircleMemberUserIds = useMemo(() => {
    const set = new Set<string>();
    selectedCircles.forEach((circleId) => {
      const circleObj = circles.find((c) => c.id === circleId);
      if (circleObj && circleObj.membersList) {
        circleObj.membersList.forEach((m) => {
          if (m.userId) set.add(m.userId);
        });
      }
    });
    return set;
  }, [selectedCircles, circles]);

  // Sync pickerSelectedFriends
  useEffect(() => {
    const circleMemberUserIds = new Set<string>();
    selectedCircles.forEach((circleId) => {
      const circleObj = circles.find((c) => c.id === circleId);
      if (circleObj && circleObj.membersList) {
        circleObj.membersList.forEach((m) => {
          if (m.userId && m.userId !== userProfile?.dbUuid) {
            circleMemberUserIds.add(m.userId);
          }
        });
      }
    });

    const uniqueIds = Array.from(new Set([
      ...individuallySelectedFriendIds,
      ...Array.from(circleMemberUserIds)
    ]));

    const usersToSet = uniqueIds.map(id => {
      const u = candidateUsers.find(x => x.id === id);
      if (u) {
        return {
          id: u.id,
          name: u.full_name,
          avatar: u.profile_photo || (u as any).profile_url || ""
        };
      }
      return null;
    }).filter(Boolean);
    setPickerSelectedFriends(usersToSet);
  }, [selectedCircles, individuallySelectedFriendIds, circles, candidateUsers, userProfile]);

  const AVAILABLE_CIRCLES = useMemo(() => {
    return circles.map((c) => ({
      id: c.id,
      name: c.name,
      membersCount: c.membersCount,
      groupImage: c.groupImage,
      emoji: c.category === 'sports' ? '⚽' : '🔥'
    }));
  }, [circles]);

  const AVAILABLE_FRIENDS = useMemo(() => {
    const myUuid = userProfile?.dbUuid || (userProfile as any)?.id || activeUserId || "";

    const seenIds = new Set<string>();
    return candidateUsers
      .filter((u) => u.id && u.id !== myUuid && u.id !== userProfile?.user_id && !disabledUserIds.has(u.id))
      .filter((u) => u.id && !selectedCircleMemberUserIds.has(u.id))
      .filter((u) => {
        if (!u.id || seenIds.has(u.id)) return false;
        seenIds.add(u.id);
        return true;
      })
      .map((u) => ({
        id: u.id || "",
        dbUuid: u.id,
        name: u.full_name || u.name || "",
        avatar: u.profile_photo || u.profile_photo_path || u.avatar || ""
      }));
  }, [candidateUsers, userProfile, activeUserId, selectedCircleMemberUserIds, disabledUserIds]);


  const toggleCircleSelection = useCallback((circleId: string) => {
    setSelectedCircles((prev) =>
      prev.includes(circleId) ? prev.filter((id) => id !== circleId) : [...prev, circleId]
    );
  }, []);

  const toggleFriendSelection = useCallback((friend: any) => {
    setIndividuallySelectedFriendIds((prev) =>
      prev.includes(friend.id) ? prev.filter((id) => id !== friend.id) : [...prev, friend.id]
    );
  }, []);

  const mockForm = useMemo(() => {
    return {
      searchPeopleQuery,
      setSearchPeopleQuery,
      selectedFriends: pickerSelectedFriends,
      toggleFriendSelection: (friend: any) => {
        setIndividuallySelectedFriendIds((prev) =>
          prev.includes(friend.id) ? prev.filter((id) => id !== friend.id) : [...prev, friend.id]
        );
      },
      waitlistEnabled: false,
      setWaitlistEnabled: () => { },
      totalCapacity: 0,
      setTotalCapacity: () => { },
      totalInvitedCount: pickerSelectedFriends.length,
      handleRemoveSelectedItem: (item: any) => {
        setIndividuallySelectedFriendIds((prev) => prev.filter((id) => id !== item.id));
      },
      AVAILABLE_FRIENDS: AVAILABLE_FRIENDS,
      userProfile: {
        dbUuid: userProfile.dbUuid || "",
        name: userProfile.name || "You",
        avatar: userProfile.avatar || ""
      },
      activeUserId: activeUserId,
      isHostSelected: false,
      setIsHostSelected: () => { },
      localTitle: plan.title,
      localLocation: plan.location || "",
      eventDateTime: plan.datetime ? new Date(plan.datetime) : new Date(),
      customCoverImage: plan.coverImage
    };
  }, [
    searchPeopleQuery,
    pickerSelectedFriends,
    AVAILABLE_FRIENDS,
    userProfile,
    activeUserId,
    plan
  ]);


  const handleRemoveSelectedItem = useCallback((item: { id: string; type: 'circle' | 'friend'; name: string }) => {
    if (item.type === 'circle') {
      setSelectedCircles((prev) => prev.filter((id) => id !== item.id));
    } else {
      setIndividuallySelectedFriendIds((prev) => prev.filter((id) => id !== item.id));
    }
  }, []);

  const selectedItems = useMemo(() => {
    const items: any[] = [];
    selectedCircles.forEach((circleId) => {
      const c = AVAILABLE_CIRCLES.find(x => x.id === circleId);
      if (c) {
        items.push({
          id: c.id,
          type: 'circle',
          name: c.name,
          displayName: c.name,
          groupImage: c.groupImage,
          emoji: c.emoji
        });
      }
    });
    individuallySelectedFriendIds.forEach((friendId) => {
      if (selectedCircleMemberUserIds.has(friendId)) return;
      const u = candidateUsers.find(x => x.id === friendId);
      if (u) {
        items.push({
          id: u.id,
          type: 'friend',
          name: u.full_name,
          avatar: u.profile_photo || (u as any).profile_url || ""
        });
      }
    });
    return items;
  }, [selectedCircles, individuallySelectedFriendIds, AVAILABLE_CIRCLES, candidateUsers, selectedCircleMemberUserIds]);


  const unifiedSearchResults = useMemo(() => {
    const query = searchPeopleQuery.toLowerCase().trim();
    const recentFriends = AVAILABLE_FRIENDS.slice(0, 3);
    const recentCircles = AVAILABLE_CIRCLES.slice(0, 2);

    const matchedFriends = AVAILABLE_FRIENDS.filter(f =>
      f.name.toLowerCase().includes(query)
    );
    const matchedCircles = AVAILABLE_CIRCLES.filter(c =>
      (c.name || '').toLowerCase().includes(query)
    );

    const results: any[] = [];
    if (query === '') {
      recentFriends.forEach(f => {
        results.push({ id: f.id, type: 'recent', name: f.name, avatar: f.avatar, rawFriend: f });
      });
      recentCircles.forEach(c => {
        results.push({ id: c.id, type: 'recent', name: c.name, emoji: c.emoji, membersCount: c.membersCount, rawCircle: c });
      });
    } else {
      matchedFriends.forEach(f => {
        results.push({ id: f.id, type: 'friend', name: f.name, avatar: f.avatar, rawFriend: f });
      });
      matchedCircles.forEach(c => {
        results.push({ id: c.id, type: 'circle', name: c.name, emoji: c.emoji, membersCount: c.membersCount, rawCircle: c });
      });
    }
    return results;
  }, [searchPeopleQuery, AVAILABLE_FRIENDS, AVAILABLE_CIRCLES]);



  const [addFriendsTargetTab, setAddFriendsTargetTab] = useState<'GOING' | 'WAITLIST'>('GOING');
  const [pendingCapacityInvite, setPendingCapacityInvite] = useState<{
    friendIds: string[];
    circleIds: string[];
    selectedCount: number;
    targetGroup: 'GOING' | 'WAITLIST';
    currentGoingCount: number;
    capacity: number;
    availableSlots: number;
  } | null>(null);

  const executeInviteFlow = async (friendIds: string[], circleIds: string[], targetGroup?: 'GOING' | 'WAITLIST') => {
    if (!onAddParticipants) return;
    await onAddParticipants(plan.id, friendIds, circleIds, targetGroup);
    showToast('✓ Invitations sent');
    setShowAddFriendsPicker(false);
    setSearchPeopleQuery('');
    setSelectedCircles([]);
    setIndividuallySelectedFriendIds([]);
  };

  const handleConfirmInvite = async () => {
    if (!onAddParticipants) return;
    const friendIds = individuallySelectedFriendIds.filter(id => !disabledUserIds.has(id));
    const targetGroup = waitlistMode === 'assigned' ? addFriendsTargetTab : 'GOING';

    if (friendIds.length === 0) return;

    // Capacity overflow dialog — Assigned Waitlist only
    if (waitlistMode === 'assigned' && targetGroup === 'GOING' && capacity > 0) {
      const currentGoingCount = goingMembers.length;
      const availableSlots = Math.max(0, capacity - currentGoingCount);

      if (friendIds.length > availableSlots) {
        setPendingCapacityInvite({
          friendIds,
          circleIds: selectedCircles,
          selectedCount: friendIds.length,
          targetGroup,
          currentGoingCount,
          capacity,
          availableSlots
        });
        return;
      }
    }

    try {
      await executeInviteFlow(friendIds, selectedCircles, targetGroup);
    } catch (err: any) {
      console.error("[handleConfirmInvite] error:", err);
      const msg = err?.message || 'Failed to add participants';
      showToast(msg);
    }
  };

  const handleIncreaseCapacityAndInvite = async () => {
    if (!pendingCapacityInvite) return;
    const { friendIds, circleIds, currentGoingCount } = pendingCapacityInvite;
    const newCapacity = currentGoingCount + friendIds.length;

    try {
      if (onUpdatePlanCapacity) {
        await onUpdatePlanCapacity(plan.id, newCapacity);
      }
      setPendingCapacityInvite(null);
      await executeInviteFlow(friendIds, circleIds, 'GOING');
    } catch (err: any) {
      console.error("[handleIncreaseCapacityAndInvite] error:", err);
      showToast(err?.message || 'Failed to increase capacity and invite');
    }
  };

  const handleInviteToWaitlistInstead = async () => {
    if (!pendingCapacityInvite) return;
    const { friendIds, circleIds, currentGoingCount } = pendingCapacityInvite;

    try {
      setPendingCapacityInvite(null);
      await executeInviteFlow(friendIds, circleIds, 'WAITLIST');
    } catch (err: any) {
      console.error("[handleInviteToWaitlistInstead] error:", err);
      showToast(err?.message || 'Failed to add to waitlist');
    }
  };

  const handleCancelCapacityDialog = () => {
    setPendingCapacityInvite(null);
  };

  // Extract all active plan members with unique ID deduplication (excluding SKIPPED / LEFT / REMOVED)
  const seenMemberIds = new Set<string>();
  const allPlanMembers = members.filter((m) => {
    const mId = m.userId || m.userUuid || m.user_id || m.id;
    if (!mId || seenMemberIds.has(mId)) return false;
    const status = normalizeStatus(m.joinState || m.rsvp_status);
    if (status === 'SKIPPED') return false;
    seenMemberIds.add(mId);
    return true;
  });

  const waitlistOrderMode = plan.waitlistOrderMode || (plan as any).waitlist_order_mode || 'AUTO';

  const sortByWaitlistOrder = (list: Friend[]) =>
    [...list].sort((a, b) => {
      if (waitlistOrderMode === 'CUSTOM') {
        const posA = a.waitlistPosition ?? Number.MAX_SAFE_INTEGER;
        const posB = b.waitlistPosition ?? Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;
      }
      const qA = a.joinQueue ?? Number.MAX_SAFE_INTEGER;
      const qB = b.joinQueue ?? Number.MAX_SAFE_INTEGER;
      if (qA !== qB) return qA - qB;

      const queueA = a.joinedQueueAt ? new Date(a.joinedQueueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const queueB = b.joinedQueueAt ? new Date(b.joinedQueueAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (queueA !== queueB) return queueA - queueB;
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });

  const prioritizeCurrentUserAndSort = (list: Friend[]) => {
    const isAccepted = (f: Friend) => f.rsvpStatus === 'JOINED' || f.isAccepted;

    const accepted = list.filter(isAccepted);
    const nonAccepted = list.filter((f) => !isAccepted(f));

    const currentUserEntry = accepted.find(
      (f) => f.name === 'You' || (activeUserId && (f.dbUuid === activeUserId || f.id === activeUserId))
    );
    const remainingAccepted = accepted.filter((f) => f !== currentUserEntry);

    const sortAlphabetically = (arr: Friend[]) =>
      [...arr].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
      );

    const sortedAccepted = sortAlphabetically(remainingAccepted);
    const sortedNonAccepted = sortAlphabetically(nonAccepted);

    const finalAccepted = currentUserEntry
      ? [{ ...currentUserEntry, name: 'You' }, ...sortedAccepted]
      : sortedAccepted;

    return [...finalAccepted, ...sortedNonAccepted];
  };

  const invitedList: Friend[] = useMemo(() => {
    const rawInvited = allPlanMembers
      .filter((m) => normalizeStatus(m.joinState || m.rsvp_status) === 'INVITED')
      .map((m) => memberToFriend(m, hostId, activeUserId));
    return prioritizeCurrentUserAndSort(rawInvited);
  }, [allPlanMembers, hostId, activeUserId]);

  // Determine capacity bounds
  const storedCapacity = plan.joinLimit || plan.capacity || 2;
  const maxCapacity = Math.max(storedCapacity, Math.max(2, allPlanMembers.length));
  const capacity = Math.max(2, storedCapacity);

  const planFiltering = plan.participantFiltering || (plan as any).participant_filtering || 'AUTOMATIC';
  const waitlistMode: 'automatic' | 'assigned' = planFiltering === 'ASSIGNED' ? 'assigned' : 'automatic';

  const goingMembers = allPlanMembers.filter((m) => {
    const status = normalizeStatus(m.joinState || m.rsvp_status);
    if (waitlistMode === 'assigned') {
      const group = (m as any).assignedGroup || (m as any).assigned_group;
      return group === 'GOING' || (!group && status !== 'WAITLISTED');
    }
    return status === 'JOINED';
  });

  const waitlistMembers = allPlanMembers.filter((m) => {
    const status = normalizeStatus(m.joinState || m.rsvp_status);
    if (waitlistMode === 'assigned') {
      const group = (m as any).assignedGroup || (m as any).assigned_group;
      return group === 'WAITLIST' || (!group && status === 'WAITLISTED');
    }
    return status === 'WAITLISTED';
  });

  const rawGoingList: Friend[] = goingMembers.map((m) => memberToFriend(m, hostId, activeUserId));

  const goingList: Friend[] = useMemo(() => {
    return prioritizeCurrentUserAndSort(rawGoingList);
  }, [rawGoingList]);

  const waitlistList: Friend[] = useMemo(() => {
    const rawList = waitlistMembers.map((m) => memberToFriend(m, hostId, activeUserId));
    return sortByWaitlistOrder(rawList);
  }, [waitlistMembers, hostId, activeUserId, sortByWaitlistOrder]);

  // Determine which tab to show by default: the one containing the current user
  const initialTab: 'going' | 'waitlist' | 'invited' = useMemo(() => {
    if (!activeUserId) return 'going';
    const currentMember = allPlanMembers.find((m) => {
      const mId = m.userId || m.userUuid || m.user_id || m.id;
      return mId === activeUserId;
    });
    if (!currentMember) return 'going';
    if (waitlistMode === 'assigned') {
      const group = (currentMember as any).assignedGroup || (currentMember as any).assigned_group;
      return group === 'WAITLIST' ? 'waitlist' : 'going';
    }
    const status = normalizeStatus(currentMember.joinState || currentMember.rsvp_status);
    if (status === 'WAITLISTED') return 'waitlist';
    if (status === 'INVITED') return 'invited';
    return 'going'; // JOINED or HOST → Going tab
  }, [allPlanMembers, activeUserId, waitlistMode]);

  // Formatted event date/time for header popover
  const eventDateObj = plan.datetime ? new Date(plan.datetime) : null;
  const formattedDate = eventDateObj
    ? eventDateObj.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })
    : undefined;
  const formattedTime = eventDateObj
    ? eventDateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : undefined;

  // ── Callbacks bridging to plan store ──
  // Direct move (with capacity check)
  const handleMoveToGoing = useCallback(
    async (friend: Friend) => {
      const currentGoingCount = goingMembers.length;
      if (capacity > 0 && currentGoingCount >= capacity) {
        setPendingPromoteToGoing(friend);
        return;
      }

      setLocalGoingList(null);
      setLocalWaitlist(null);
      try {
        await onMoveToGoing(plan.id, friend.dbUuid || friend.id);
      } catch (err: any) {
        console.error("[handleMoveToGoing] error:", err);
        const msg = err?.message || 'Failed to move participant';
        showToast(msg);
      } finally {
        setLocalGoingList(null);
        setLocalWaitlist(null);
      }
    },
    [plan.id, capacity, goingMembers.length, onMoveToGoing, showToast],
  );

  // Pending state for waitlist "Move to Going" capacity flow
  const [pendingPromoteToGoing, setPendingPromoteToGoing] = useState<Friend | null>(null);

  const handleCancelPendingPromote = useCallback(() => {
    setPendingPromoteToGoing(null);
  }, []);

  const handleConfirmPendingPromote = useCallback(
    async () => {
      if (!pendingPromoteToGoing) return;
      const friend = pendingPromoteToGoing;
      const newCap = Math.max(capacity + 1, goingMembers.length + 1);
      setPendingPromoteToGoing(null);

      // 1. Increase capacity by 1
      const clampedVal = Math.min(maxCapacity, Math.max(2, newCap));
      if (clampedVal !== capacity && onUpdatePlanCapacity) {
        try {
          await onUpdatePlanCapacity(plan.id, clampedVal);
        } catch (err: any) {
          showToast(err?.message || 'Failed to update capacity');
          return;
        }
      }

      // 2. Promote participant to Going
      setLocalGoingList(null);
      setLocalWaitlist(null);
      try {
        await onMoveToGoing(plan.id, friend.dbUuid || friend.id);
      } catch (err: any) {
        console.error("[handleConfirmPendingPromote] error:", err);
        showToast(err?.message || 'Failed to move participant');
      } finally {
        setLocalGoingList(null);
        setLocalWaitlist(null);
      }
    },
    [pendingPromoteToGoing, capacity, goingMembers.length, maxCapacity, onUpdatePlanCapacity, plan.id, onMoveToGoing, showToast],
  );

  const handleMoveToWaitlist = useCallback(
    async (friend: Friend) => {
      setLocalGoingList(null);
      setLocalWaitlist(null);
      try {
        await onMoveToWaitlist(plan.id, friend.dbUuid || friend.id);
      } catch {
        showToast('Failed to move participant');
      } finally {
        setLocalGoingList(null);
        setLocalWaitlist(null);
      }
    },
    [plan.id, onMoveToWaitlist, showToast],
  );

  const handleRemoveParticipant = useCallback(
    async (friend: Friend) => {
      try {
        await onRemoveParticipant(plan.id, friend.dbUuid);
        showToast(`✓ Removed ${friend.name}`);
      } catch {
        showToast('Failed to remove participant');
      }
    },
    [plan.id, onRemoveParticipant, showToast],
  );

  const handlePromoteHost = useCallback(
    async (friend: Friend) => {
      if (!onPromoteToHost) return;
      const targetStatus = normalizeStatus((friend as any).joinState || (friend as any).rsvp_status || 'JOINED');
      if (targetStatus !== 'JOINED') {
        showToast("Only Going participants can be promoted to host");
        return;
      }

      const memberRecord = members.find(
        (m: any) => (m.userId || m.userUuid || m.user_id || m.id) === friend.dbUuid
      );

      const isAlreadyHost = friend.isHost || (memberRecord && memberRecord.role === 'HOST');
      if (isAlreadyHost) {
        // Participant is already a host — silently ignore per prompt specs
        return;
      }

      const rsvp = normalizeStatus(memberRecord?.joinState || memberRecord?.rsvp_status);
      if (rsvp !== 'JOINED') {
        showToast("Only Going participants can be promoted to host");
        return;
      }

      try {
        await onPromoteToHost(plan.id, friend.dbUuid);
        showToast(`✓ ${friend.name} is now a host`);
      } catch (err: any) {
        showToast(err?.message || 'Failed to promote host');
      }
    },
    [plan.id, onPromoteToHost, showToast, members, hostId],
  );

  const handleDemoteHost = useCallback(
    async (friend: Friend) => {
      if (!onDemoteFromHost) return;
      try {
        await onDemoteFromHost(plan.id, friend.dbUuid);
        showToast(`✓ ${friend.name} is no longer a host`);
      } catch {
        showToast('Failed to remove host');
      }
    },
    [plan.id, onDemoteFromHost, showToast],
  );

  const handleAdjustCapacity = useCallback(
    async (newVal: number) => {
      const currentGoingCount = goingMembers.length;
      if (newVal < currentGoingCount) {
        showToast(`Cannot reduce capacity below current Going count (${currentGoingCount})`);
        return;
      }

      const clampedVal = Math.min(maxCapacity, Math.max(2, newVal));
      if (clampedVal !== capacity && onUpdatePlanCapacity) {
        try {
          await onUpdatePlanCapacity(plan.id, clampedVal);
          // If a participant was waiting to be moved to Going upon capacity increase
          if (pendingPromoteToGoing) {
            const friendToMove = pendingPromoteToGoing;
            setPendingPromoteToGoing(null);
            setLocalGoingList(null);
            setLocalWaitlist(null);
            try {
              await onMoveToGoing(plan.id, friendToMove.dbUuid || friendToMove.id);
            } catch (moveErr: any) {
              console.error("[handleAdjustCapacity] Error moving pending participant to Going:", moveErr);
              showToast(moveErr?.message || 'Failed to move participant');
            } finally {
              setLocalGoingList(null);
              setLocalWaitlist(null);
            }
          }
        } catch (err: any) {
          const msg = typeof err === 'string' ? err : err?.message || err?.error_description || err?.details || 'Failed to update capacity';
          console.error("[handleAdjustCapacity] Error updating capacity:", msg, err);
          showToast(msg);
        }
      }
    },
    [plan.id, capacity, goingMembers.length, maxCapacity, onUpdatePlanCapacity, showToast, pendingPromoteToGoing, onMoveToGoing]
  );

  const managementMode: "host" | "invite_only" = isHost ? "host" : "invite_only";
  const canInvite = isHost || plan.allowParticipantInvites === true || (plan as any).allow_participant_invites === true;
  const [localGoingList, setLocalGoingList] = useState<Friend[] | null>(null);
  const [localWaitlist, setLocalWaitlist] = useState<Friend[] | null>(null);

  // Auto-clear local drag overrides whenever underlying plan members change from store / DB / Realtime
  useEffect(() => {
    setLocalGoingList(null);
    setLocalWaitlist(null);
  }, [members]);

  const displayGoingList = useMemo(() => {
    const list = localGoingList ?? goingList;
    return prioritizeCurrentUserAndSort(list);
  }, [localGoingList, goingList]);

  const displayWaitlist = useMemo(() => {
    const rawList = localWaitlist ?? waitlistList;
    const goingUserIds = new Set(displayGoingList.map(g => g.dbUuid || g.id));
    return rawList.filter(w => !goingUserIds.has(w.dbUuid || w.id));
  }, [localWaitlist, waitlistList, displayGoingList]);

  const handleReorderGoing = useCallback(async (newGoing: Friend[]) => {
    setLocalGoingList(newGoing);
  }, []);

  const handleReorderWaitlist = useCallback(async (newWaitlist: Friend[]) => {
    setLocalWaitlist(newWaitlist);
    try {
      const userUuids = newWaitlist.map((f) => f.dbUuid || f.id);
      if (onReorderWaitlist) {
        await onReorderWaitlist(plan.id, userUuids);
      }
    } catch (err) {
      console.error("[handleReorderWaitlist] Failed to persist new order:", err);
    }
  }, [plan.id, onReorderWaitlist]);

  return (
    <>
      <ParticipantManagementScreen
        title="Participants"
        category={plan.category || 'custom'}
        eventDate={formattedDate}
        eventTime={formattedTime}
        capacity={capacity}
        maxCapacity={maxCapacity}
        mode="editor"
        managementMode={managementMode}
        isHostUser={isHost}
        waitlistMode={waitlistMode}
        externalGoingList={displayGoingList}
        externalWaitlist={displayWaitlist}
        externalInvitedList={invitedList}
        initialTab={initialTab}
        onBack={onBack}
        onAdjustCapacity={isHost ? handleAdjustCapacity : undefined}
        onMoveToGoing={isHost ? handleMoveToGoing : undefined}
        onMoveToWaitlist={isHost ? handleMoveToWaitlist : undefined}
        onRemoveParticipant={isHost ? handleRemoveParticipant : undefined}
        onPromoteHost={onPromoteToHost ? handlePromoteHost : undefined}
        onDemoteHost={onDemoteFromHost ? handleDemoteHost : undefined}
        onAddFriends={canInvite ? (targetTab) => {
          setAddFriendsTargetTab(targetTab === 'waitlist' ? 'WAITLIST' : 'GOING');
          setShowAddFriendsPicker(true);
        } : undefined}
        displayMode={displayMode}
        onOpenSettings={onOpenSettings}
        onOpenActivity={onOpenActivity}
        onPlanSizeEditingChange={onPlanSizeEditingChange}
        onReorderGoing={isHost && waitlistMode === 'assigned' ? handleReorderGoing : undefined}
        onReorderWaitlist={isHost && waitlistMode === 'assigned' ? handleReorderWaitlist : undefined}
      />

      {showAddFriendsPicker && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <WhoIsComingScreen
            form={mockForm}
            onBack={() => setShowAddFriendsPicker(false)}
            onContinue={handleConfirmInvite}
            selectedCategory={plan.category || "custom"}
            selectedSubcategory={plan.subcategory || null}
            confirmLabel="Send invites"
            headerTitle="Select friends"
            hideExitDialog={true}
            hideOverviewToggle={true}
            isAddParticipantMode={true}
          />
          <PlanIsFullBottomSheet
            isOpen={Boolean(pendingCapacityInvite)}
            pickerSelectedFriends={pickerSelectedFriends}
            onIncreaseCapacity={handleIncreaseCapacityAndInvite}
            onInviteToWaitlist={handleInviteToWaitlistInstead}
            onClose={handleCancelCapacityDialog}
          />
        </div>
      )}

      {/* Move to Going capacity bottom sheet */}
      <MoveToGoingCapacityBottomSheet
        isOpen={Boolean(pendingPromoteToGoing)}
        participant={pendingPromoteToGoing ? { name: pendingPromoteToGoing.name, avatar: pendingPromoteToGoing.avatar } : null}
        onIncreaseCapacity={handleConfirmPendingPromote}
        onClose={handleCancelPendingPromote}
      />
    </>
  );
};
