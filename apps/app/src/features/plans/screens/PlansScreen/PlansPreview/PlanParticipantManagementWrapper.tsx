import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { ParticipantManagementScreen, Friend } from '../../../../participants/screens/ParticipantManagementScreen';
import { Plan, UserProfile } from '../../../../../core/types';
import { normalizeStatus } from '../../../../../../lib/participantStatus';
import { useToast } from '../../../../../shared/contexts/ToastContext';
import { WhoIsComingScreen } from '../../../../create/screens/WhoIsComingScreen';
import { useCirclesStore } from '../../../../circles/state/CirclesContext';
import { useFriendshipStore } from '../../../../friendships/state/FriendshipContext';
import { usePlansStore } from '../../../state/PlansContext';
import { supabase } from '../../../../../../lib/supabaseClient';
import { X } from 'lucide-react';
import { PlanSizeSlider } from '../../../../create/components/PlanSizeSlider';
import { PlanIsFullBottomSheet, MoveToGoingCapacityBottomSheet, MoveToWaitlistBottomSheet, RemoveGoingParticipantBottomSheet, SwitchToAutomaticSelectionBottomSheet, SwitchToAutomaticWarningBottomSheet, GuidedCapacityAdjustmentBottomSheet } from '../../../components/BottomSheets';


interface PlanParticipantManagementWrapperProps {
  plan: Plan;
  userProfile: UserProfile;
  activeUserId?: string;
  isHost: boolean;
  isCreatorHost?: boolean;
  onBack: () => void;
  displayMode?: 'standalone' | 'embedded';
  // Store actions passed in so this wrapper stays store-agnostic
  onMoveToGoing: (planId: string, userId: string, options?: { bypassCapacityCheck?: boolean }) => Promise<void>;
  onMoveToWaitlist: (planId: string, userId: string) => Promise<void>;
  onMoveToInvited: (planId: string, userId: string) => Promise<void>;
  onSwapParticipants?: (planId: string, goingUserId: string, waitlistUserId: string) => Promise<void>;
  onRemoveAndReplaceWithWaitlist?: (planId: string, removeUserId: string, promoteUserId: string) => Promise<void>;
  onRemoveParticipant: (planId: string, userId: string) => Promise<void>;
  onChangePlanHost?: (planId: string, newHostId: string, currentHostId: string) => Promise<void>;
  onPromoteToHost?: (planId: string, userId: string) => Promise<void>;
  onDemoteFromHost?: (planId: string, userId: string) => Promise<void>;
  onUpdatePlanCapacity?: (planId: string, capacity: number, options?: { totalCost?: number }) => Promise<void> | void;
  onAddParticipants?: (planId: string, userIds: string[], circleIds: string[], targetGroup?: 'GOING' | 'WAITLIST') => Promise<void>;
  onReorderWaitlist?: (planId: string, orderedUserUuids: string[]) => Promise<void>;
  onSwitchToAutomaticMode?: (planId: string, promotedUserUuids?: string[]) => Promise<void>;
  onOpenSettings?: () => void;
  onOpenActivity?: () => void;
  onPlanSizeEditingChange?: (isEditing: boolean) => void;
  onBottomSheetStateChange?: (isOpen: boolean) => void;
  onCancelPlan?: (planId: string) => Promise<void>;
  showWaitlistMode?: boolean;
  replaceTargetUserId?: string | null;
  onCancelReplacement?: () => void;
  onConfirmReplacement?: (planId: string, targetUserId: string, replacementUserId: string) => Promise<void>;
}

function memberToFriend(m: any, hostId: string, activeUserId?: string, dbPlanParticipants: any[] = []): Friend {
  const id = m.userId || m.userUuid || m.user_id || m.id;
  const isHostRole = (m.role || '').toUpperCase() === 'HOST';
  const isCurrentUser = activeUserId && (id === activeUserId || m.userUuid === activeUserId || m.userId === activeUserId || m.user_id === activeUserId);
  const status = normalizeStatus(m.joinState || m.rsvp_status);
  const isAccepted = status !== 'INVITED';

  const dbPp = dbPlanParticipants.find((pp: any) => pp.user_id === id);
  const isLeaveRequested = dbPp
    ? dbPp.leave_requested === true
    : (m.leave_requested === true || (m as any).leaveRequested === true);
  const leaveRequestedAt = dbPp
    ? dbPp.leave_requested_at
    : (m.leave_requested_at || (m as any).leaveRequestedAt || null);

  return {
    id,
    dbUuid: m.userUuid || m.userId || m.user_id || m.id,
    name: isCurrentUser ? 'You' : (m.name || m.displayName || 'Unknown'),
    avatar: m.avatar || m.profile_photo || m.profile_photo_path || m.profile_image_url || m.avatar_url || '',
    isHost: isHostRole,
    joinedQueueAt: m.joinedQueueAt || m.joined_queue_at || m.createdAt || m.created_at,
    isAccepted,
    rsvpStatus: status,
    assignedGroup: m.assignedGroup || m.assigned_group || (status === 'WAITLISTED' ? 'WAITLIST' : 'GOING'),
    leave_requested: isLeaveRequested,
    leave_requested_at: leaveRequestedAt,
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
  onSwapParticipants,
  onRemoveAndReplaceWithWaitlist,
  onRemoveParticipant,
  onChangePlanHost,
  onPromoteToHost,
  onDemoteFromHost,
  onUpdatePlanCapacity,
  onAddParticipants,
  onReorderWaitlist,
  onSwitchToAutomaticMode,
  onOpenSettings,
  onOpenActivity,
  onPlanSizeEditingChange,
  onBottomSheetStateChange,
  onCancelPlan,
  displayMode = 'standalone',
  showWaitlistMode = false,
  replaceTargetUserId = null,
  onCancelReplacement,
  onConfirmReplacement,
}) => {
  const { circles } = useCirclesStore();
  const { friends } = useFriendshipStore();
  const { dbPlans, dbPlanParticipants, resolvePaidPlanLeaveRequest } = usePlansStore();
  const { showToast } = useToast();
  const hostId = plan.hostId || '';
  const members: any[] = plan.members || [];

  const targetPlanUuid = plan.dbUuid || plan.id;

  const [planFeeTotalCostOverride, setPlanFeeTotalCostOverride] = useState<number | null>(null);

  const matchedDbPlan = useMemo(() => {
    return (dbPlans || []).find(
      (p) => p.id === targetPlanUuid || p.id === plan.id || (p as any).dbUuid === targetPlanUuid || (p as any).dbUuid === plan.id
    );
  }, [dbPlans, targetPlanUuid, plan.id]);

  const currentTotalCost = useMemo(() => {
    if (planFeeTotalCostOverride !== null) return planFeeTotalCostOverride;
    const rawVal =
      matchedDbPlan?.total_cost ??
      (plan as any)?.total_cost ??
      (plan as any)?.totalCost ??
      (plan as any)?.cost ??
      0;
    return Number(rawVal || 0);
  }, [matchedDbPlan, plan, planFeeTotalCostOverride]);

  useEffect(() => {
    let isMounted = true;
    const fetchPlanFeeCost = async () => {
      if (planFeeTotalCostOverride === null && plan.id) {
        const localCost = Number(
          matchedDbPlan?.total_cost ??
          (plan as any)?.total_cost ??
          (plan as any)?.totalCost ??
          (plan as any)?.cost ??
          0
        );
        if (localCost <= 0) {
          try {
            const { data: expRow } = await (supabase as any)
              .from("wallet_expenses")
              .select("total_amount")
              .eq("plan_id", plan.id)
              .or("expense_type.eq.PLAN_EXPENSE,message_id.is.null")
              .maybeSingle();

            if (isMounted && expRow && Number(expRow.total_amount || 0) > 0) {
              setPlanFeeTotalCostOverride(Number(expRow.total_amount));
            }
          } catch (err) {
            console.error("[fetchPlanFeeCost] Error:", err);
          }
        }
      }
    };
    fetchPlanFeeCost();
    return () => {
      isMounted = false;
    };
  }, [plan.id, matchedDbPlan, planFeeTotalCostOverride]);



  // Compute currentUserRole and effectiveIsHost strictly from plan_participants role column
  const effectiveIsHost = useMemo(() => {
    const currentMember = members.find((m) => {
      const uId = m.userId || m.userUuid || m.user_id || m.id;
      return Boolean(
        activeUserId &&
          (uId === activeUserId ||
            m.userUuid === activeUserId ||
            m.userId === activeUserId ||
            m.user_id === activeUserId)
      );
    });

    if (currentMember && currentMember.role) {
      return (currentMember.role || '').toUpperCase() === 'HOST';
    }

    return Boolean(isHost);
  }, [members, activeUserId, isHost]);

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

  // Compute pending leave requests directly from dbPlanParticipants and plan.members where leave_requested === true
  const pendingLeaveRequests = useMemo(() => {
    const planId1 = plan.id;
    const planId2 = plan.dbUuid;

    const fromDbParts = dbPlanParticipants
      .filter((pp) => (pp.plan_id === planId1 || (planId2 && pp.plan_id === planId2)) && pp.leave_requested === true)
      .map((pp) => {
        const foundMember = members.find((m) => (m.userId || m.userUuid || m.user_id || m.id || m.dbUuid) === pp.user_id);
        const foundFriend = candidateUsers.find((u) => u.id === pp.user_id);
        return {
          id: pp.user_id,
          dbUuid: pp.user_id,
          name: foundMember?.name || foundMember?.full_name || foundFriend?.full_name || "Participant",
          avatar: foundMember?.avatar || foundMember?.profile_photo || foundFriend?.profile_photo || "",
          leaveRequestedAt: pp.leave_requested_at,
        };
      });

    if (fromDbParts.length > 0) return fromDbParts;

    // Fallback: check plan.members array for leave_requested === true
    return members
      .filter((m) => m.leave_requested === true || (m as any).leaveRequested === true)
      .map((m) => {
        const userId = m.userId || m.userUuid || m.user_id || m.id || m.dbUuid;
        const foundFriend = candidateUsers.find((u) => u.id === userId);
        return {
          id: userId,
          dbUuid: userId,
          name: m.name || m.full_name || foundFriend?.full_name || "Participant",
          avatar: m.avatar || m.profile_photo || foundFriend?.profile_photo || "",
          leaveRequestedAt: m.leave_requested_at || (m as any).leaveRequestedAt || null,
        };
      });
  }, [dbPlanParticipants, plan.id, plan.dbUuid, members, candidateUsers]);

  const [localReplaceTargetUserId, setLocalReplaceTargetUserId] = useState<string | null>(null);
  const effectiveReplaceTargetUserId = replaceTargetUserId || localReplaceTargetUserId;

  const handleKeepPaymentLeaveParticipant = useCallback(async (targetUserId: string) => {
    if (!resolvePaidPlanLeaveRequest) return;
    try {
      await resolvePaidPlanLeaveRequest(plan.id, targetUserId, 'KEEP_PAYMENT');
      showToast("✓ Leave request resolved (Payment kept)");
    } catch (err: any) {
      console.error("[handleKeepPaymentLeaveParticipant] Error:", err);
      showToast(err?.message || "Failed to resolve leave request");
    }
  }, [resolvePaidPlanLeaveRequest, plan.id, showToast]);

  const handleReplaceLeaveParticipant = useCallback((targetUserId: string) => {
    setLocalReplaceTargetUserId(targetUserId);
    setIndividuallySelectedFriendIds([]);
    setShowAddFriendsPicker(true);
  }, []);


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
        if (replaceTargetUserId) {
          // Single-selection mode for replacement: selecting another friend replaces current selection
          setIndividuallySelectedFriendIds((prev) => (prev.includes(friend.id) ? [] : [friend.id]));
        } else {
          setIndividuallySelectedFriendIds((prev) =>
            prev.includes(friend.id) ? prev.filter((id) => id !== friend.id) : [...prev, friend.id]
          );
        }
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
    if (!canInvite) {
      showToast("You do not have permission to invite participants");
      return;
    }

    const friendIds = individuallySelectedFriendIds.filter(id => !disabledUserIds.has(id));
    if (friendIds.length === 0) return;

    if (effectiveReplaceTargetUserId) {
      const targetId = effectiveReplaceTargetUserId;
      const replacementId = friendIds[0];
      try {
        if (onConfirmReplacement) {
          await onConfirmReplacement(plan.id, targetId, replacementId);
        } else if (resolvePaidPlanLeaveRequest) {
          await resolvePaidPlanLeaveRequest(plan.id, targetId, 'REPLACED', replacementId);
        } else if (onRemoveAndReplaceWithWaitlist) {
          await onRemoveAndReplaceWithWaitlist(plan.id, targetId, replacementId);
        }
        showToast("✓ Participant replacement confirmed");
        setIndividuallySelectedFriendIds([]);
        setLocalReplaceTargetUserId(null);
        if (onCancelReplacement) {
          onCancelReplacement();
        } else {
          setShowAddFriendsPicker(false);
        }
      } catch (err: any) {
        console.error("[handleConfirmInvite] Replacement error:", err);
        showToast(err?.message || "Failed to replace participant");
      }
      return;
    }

    // Non-host participant-controlled invitation invariant: ALWAYS 'WAITLIST', never 'GOING'
    const targetGroup = (!effectiveIsHost && canParticipantInvite)
      ? 'WAITLIST'
      : (waitlistMode === 'assigned' ? addFriendsTargetTab : 'GOING');

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
  const allPlanMembers = useMemo(() => {
    const seenMemberIds = new Set<string>();
    return members.filter((m) => {
      const mId = m.userId || m.userUuid || m.user_id || m.id;
      if (!mId || seenMemberIds.has(mId)) return false;
      const status = normalizeStatus(m.joinState || m.rsvp_status);
      if (status === 'SKIPPED') return false;
      seenMemberIds.add(mId);
      return true;
    });
  }, [members]);

  const planFiltering = plan.participantFiltering || (plan as any).participant_filtering || 'AUTOMATIC';
  const waitlistMode: 'automatic' | 'assigned' = planFiltering === 'ASSIGNED' ? 'assigned' : 'automatic';

  // Compute current participant's RSVP status for non-host invitation permission check
  const currentParticipantRsvp = useMemo(() => {
    const currentMember = members.find((m) => {
      const uId = m.userId || m.userUuid || m.user_id || m.id;
      return Boolean(
        activeUserId &&
          (uId === activeUserId ||
            m.userUuid === activeUserId ||
            m.userId === activeUserId ||
            m.user_id === activeUserId)
      );
    });
    if (!currentMember) return null;
    return normalizeStatus(currentMember.joinState || currentMember.rsvp_status);
  }, [members, activeUserId]);

  const isAssignedWaitlistPlan = waitlistMode === 'assigned';
  const allowParticipantsToInviteOthers = Boolean(plan.allowParticipantInvites === true || (plan as any).allow_participant_invites === true);
  const isEligibleParticipantRsvp = currentParticipantRsvp === 'JOINED' || currentParticipantRsvp === 'WAITLISTED';

  const canParticipantInvite = isAssignedWaitlistPlan && allowParticipantsToInviteOthers && isEligibleParticipantRsvp && !effectiveIsHost;
  const canInvite = effectiveIsHost || canParticipantInvite;

  const waitlistOrderMode = plan.waitlistOrderMode || (plan as any).waitlist_order_mode || 'AUTO';

  const sortByWaitlistOrder = useCallback((list: Friend[]) =>
    [...list].sort((a, b) => {
      // In Assigned mode, prioritize stored assigned waitlist position from DB
      if (waitlistMode === 'assigned') {
        const posA = a.waitlistPosition ?? Number.MAX_SAFE_INTEGER;
        const posB = b.waitlistPosition ?? Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;
      }
      // Sort strictly by acceptance timestamp
      const queueA = a.joinedQueueAt ? new Date(a.joinedQueueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const queueB = b.joinedQueueAt ? new Date(b.joinedQueueAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (queueA !== queueB) return queueA - queueB;
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    }), [waitlistMode]);

  const prioritizeCurrentUserAndSort = useCallback((list: Friend[]) => {
    const currentUserEntry = list.find(
      (f) => f.name === 'You' || (activeUserId && (f.dbUuid === activeUserId || f.id === activeUserId))
    );
    const remaining = list.filter((f) => f !== currentUserEntry);

    const sortedRemaining = [...remaining].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );

    return currentUserEntry
      ? [{ ...currentUserEntry, name: 'You' }, ...sortedRemaining]
      : sortedRemaining;
  }, [activeUserId]);

  // Determine capacity bounds
  const storedCapacity = plan.joinLimit || plan.capacity || 2;
  const maxCapacity = Math.max(storedCapacity, Math.max(2, allPlanMembers.length));
  const capacity = Math.max(2, storedCapacity);

  const goingMembers = useMemo(() => {
    return allPlanMembers.filter((m) => {
      const status = normalizeStatus(m.joinState || m.rsvp_status);
      if (status === 'SKIPPED') return false;
      if (waitlistMode === 'assigned') {
        const group = (m as any).assignedGroup || (m as any).assigned_group;
        return group === 'GOING' || (!group && status !== 'WAITLISTED');
      }
      return status === 'JOINED';
    });
  }, [allPlanMembers, waitlistMode]);

  const isAutomaticFull = waitlistMode === 'automatic' && capacity > 0 && goingMembers.length >= capacity;

  const waitlistMembers = useMemo(() => {
    return allPlanMembers.filter((m) => {
      const status = normalizeStatus(m.joinState || m.rsvp_status);
      if (status === 'SKIPPED') return false;
      if (waitlistMode === 'assigned') {
        const group = (m as any).assignedGroup || (m as any).assigned_group;
        return group === 'WAITLIST' || (!group && status === 'WAITLISTED');
      }
      if (isAutomaticFull) {
        return status === 'WAITLISTED' || status === 'INVITED';
      }
      return status === 'WAITLISTED';
    });
  }, [allPlanMembers, waitlistMode, isAutomaticFull]);

  const invitedList: Friend[] = useMemo(() => {
    if (waitlistMode === 'assigned' || isAutomaticFull) {
      return [];
    }
    const rawInvited = allPlanMembers
      .filter((m) => normalizeStatus(m.joinState || m.rsvp_status) === 'INVITED')
      .map((m) => memberToFriend(m, hostId, activeUserId, dbPlanParticipants));
    return prioritizeCurrentUserAndSort(rawInvited);
  }, [allPlanMembers, hostId, activeUserId, dbPlanParticipants, waitlistMode, isAutomaticFull, prioritizeCurrentUserAndSort]);

  const rawGoingList: Friend[] = useMemo(() => {
    return goingMembers.map((m) => memberToFriend(m, hostId, activeUserId, dbPlanParticipants));
  }, [goingMembers, hostId, activeUserId, dbPlanParticipants]);

  const goingList: Friend[] = useMemo(() => {
    return prioritizeCurrentUserAndSort(rawGoingList);
  }, [rawGoingList, prioritizeCurrentUserAndSort]);

  const waitlistList: Friend[] = useMemo(() => {
    const rawList = waitlistMembers.map((m) => memberToFriend(m, hostId, activeUserId, dbPlanParticipants));
    return sortByWaitlistOrder(rawList);
  }, [waitlistMembers, hostId, activeUserId, dbPlanParticipants, sortByWaitlistOrder]);

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
        await onMoveToGoing(plan.id, friend.dbUuid || friend.id, { bypassCapacityCheck: true });
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

  const handleOpenSwapTargetPicker = useCallback(() => {
    if (!pendingPromoteToGoing) return;
    const incomingFriend = pendingPromoteToGoing;
    setPendingPromoteToGoing(null);
    setSwapState({ type: 'swap_incoming', targetFriend: incomingFriend });
  }, [pendingPromoteToGoing]);

  const [pendingMoveToWaitlist, setPendingMoveToWaitlist] = useState<Friend | null>(null);

  const handleCancelPendingWaitlist = useCallback(() => {
    setPendingMoveToWaitlist(null);
  }, []);

  const handleConfirmDecreaseCapacityForWaitlist = useCallback(async () => {
    if (!pendingMoveToWaitlist || !onUpdatePlanCapacity) return;
    const friend = pendingMoveToWaitlist;
    const targetCapacity = Math.max(2, capacity - 1);
    setPendingMoveToWaitlist(null);

    try {
      // 1. Reduce plan capacity by 1 first (so capacity change activity is logged first)
      await onUpdatePlanCapacity(plan.id, targetCapacity);
      // 2. Move participant to waitlist second
      await onMoveToWaitlist(plan.id, friend.dbUuid || friend.id);
      showToast(`✓ Capacity reduced to ${targetCapacity}`);
    } catch (err: any) {
      console.error("[handleConfirmDecreaseCapacityForWaitlist] error:", err);
      showToast(err?.message || 'Failed to move participant');
    }
  }, [pendingMoveToWaitlist, capacity, onUpdatePlanCapacity, plan.id, onMoveToWaitlist, showToast]);

  const handleOpenWaitlistSwapPicker = useCallback(() => {
    if (!pendingMoveToWaitlist) return;
    const outgoingFriend = pendingMoveToWaitlist;
    setPendingMoveToWaitlist(null);
    setSwapState({ type: 'swap', targetFriend: outgoingFriend });
  }, [pendingMoveToWaitlist]);

  const [swapState, setSwapState] = useState<{
    type: 'swap' | 'remove' | 'swap_incoming';
    targetFriend: Friend;
  } | null>(null);

  const handleMoveToWaitlist = useCallback(
    async (friend: Friend) => {
      if (waitlistMode === 'assigned') {
        if (goingMembers.length <= 2 && waitlistList.length > 0) {
          // If goingCount === 2 and waitlist exists, bypass capacity reduction options and directly open swap picker
          setSwapState({ type: 'swap', targetFriend: friend });
        } else {
          setPendingMoveToWaitlist(friend);
        }
        return;
      }

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
    [plan.id, waitlistMode, goingMembers.length, waitlistList.length, onMoveToWaitlist, showToast],
  );

  const [pendingRemoveGoing, setPendingRemoveGoing] = useState<Friend | null>(null);

  const handleCancelPendingRemoveGoing = useCallback(() => {
    setPendingRemoveGoing(null);
  }, []);

  const handleConfirmDecreaseCapacityForRemoveGoing = useCallback(async () => {
    if (!pendingRemoveGoing || !onUpdatePlanCapacity) return;
    const friend = pendingRemoveGoing;
    const targetCapacity = Math.max(2, capacity - 1);
    setPendingRemoveGoing(null);

    try {
      // 1. Reduce plan capacity by 1 first (so capacity change activity is logged first)
      await onUpdatePlanCapacity(plan.id, targetCapacity);
      // 2. Remove participant from plan second
      await onRemoveParticipant(plan.id, friend.dbUuid || friend.id);
      showToast(`✓ Removed ${friend.name} and reduced capacity to ${targetCapacity}`);
    } catch (err: any) {
      console.error("[handleConfirmDecreaseCapacityForRemoveGoing] error:", err);
      showToast(err?.message || 'Failed to remove participant');
    }
  }, [pendingRemoveGoing, capacity, onUpdatePlanCapacity, plan.id, onRemoveParticipant, showToast]);

  const handleOpenRemoveGoingReplacePicker = useCallback(() => {
    if (!pendingRemoveGoing) return;
    const friend = pendingRemoveGoing;
    setPendingRemoveGoing(null);
    setSwapState({ type: 'remove', targetFriend: friend });
  }, [pendingRemoveGoing]);

  const handleRemoveParticipant = useCallback(
    async (friend: Friend) => {
      const friendId = friend.dbUuid || friend.id;
      if (waitlistMode === 'assigned') {
        const isGoing = goingList.some(g => (g.dbUuid || g.id) === friendId);
        if (isGoing) {
          setPendingRemoveGoing(friend);
          return;
        }
      }

      try {
        await onRemoveParticipant(plan.id, friendId);
        showToast(`✓ Removed ${friend.name}`);
      } catch {
        showToast('Failed to remove participant');
      }
    },
    [plan.id, waitlistMode, goingList, onRemoveParticipant, showToast],
  );

  const handleConfirmSwap = useCallback(
    async (selectedUserIds: string[]) => {
      if (!swapState || selectedUserIds.length === 0) return;
      const { type, targetFriend } = swapState;
      const selectedUserId = selectedUserIds[0];
      const targetUserId = targetFriend.dbUuid || targetFriend.id;

      if (!targetUserId || !selectedUserId) {
        console.error("[handleConfirmSwap] Missing participant IDs", { targetUserId, selectedUserId });
        showToast("Cannot swap: missing participant ID");
        return;
      }

      try {
        if (type === 'swap') {
          // targetFriend is GOING → WAITLIST, selectedUser is WAITLIST → GOING
          if (!onSwapParticipants) throw new Error("swap is not supported");
          await onSwapParticipants(plan.id, targetUserId, selectedUserId);
          showToast(`✓ Swapped ${targetFriend.name} with waitlist participant`);
        } else if (type === 'swap_incoming') {
          // targetFriend is WAITLIST → GOING, selectedUser is GOING → WAITLIST
          if (!onSwapParticipants) throw new Error("swap is not supported");
          await onSwapParticipants(plan.id, selectedUserId, targetUserId);
          showToast(`✓ Swapped ${targetFriend.name} into Going`);
        } else {
          // type === 'remove': atomically remove going participant + replace from waitlist
          if (!onRemoveAndReplaceWithWaitlist) throw new Error("remove-and-replace is not supported");
          await onRemoveAndReplaceWithWaitlist(plan.id, targetUserId, selectedUserId);
          showToast(`✓ Removed ${targetFriend.name} and replaced from waitlist`);
        }
        setSwapState(null);
      } catch (err: any) {
        console.error("[handleConfirmSwap] Error:", err);
        showToast(err?.message || "Failed to swap participants");
        // Do NOT clear swapState on error so user can retry
      }
    },
    [swapState, plan.id, onSwapParticipants, onRemoveAndReplaceWithWaitlist, onMoveToGoing, onRemoveParticipant, showToast],
  );

  const handlePromoteHost = useCallback(
    async (friend: Friend) => {
      if (!onPromoteToHost) return;
      const targetId = friend.dbUuid || friend.id || (friend as any).user_id || (friend as any).userId || "";
      if (!targetId) return;

      const memberRecord = members.find(
        (m: any) => (m.userId || m.userUuid || m.user_id || m.id) === targetId
      );

      const targetStatus = normalizeStatus((friend as any).joinState || (friend as any).rsvp_status || memberRecord?.joinState || memberRecord?.rsvp_status || 'JOINED');
      const targetRole = memberRecord?.role || (friend.isHost ? 'HOST' : 'PARTICIPANT');

      const isAlreadyHost = friend.isHost || targetRole === 'HOST';
      if (isAlreadyHost) return;

      if (targetStatus !== 'JOINED') {
        showToast("Only Going participants can be promoted to host");
        return;
      }

      try {
        await onPromoteToHost(plan.id, targetId);
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

  const [showUpdatePlanFeeModal, setShowUpdatePlanFeeModal] = useState(false);
  const [pendingCapacityTarget, setPendingCapacityTarget] = useState<number | null>(null);
  const [selectedPlanFeeOption, setSelectedPlanFeeOption] = useState<"change_per_person" | "keep_total">("change_per_person");
  const [isSubmittingPlanFeeUpdate, setIsSubmittingPlanFeeUpdate] = useState(false);

  const [guidedAdjustmentState, setGuidedAdjustmentState] = useState<{
    mode: 'promote' | 'demote';
    targetCapacity: number;
    requiredCount: number;
    candidates: Friend[];
    options?: { totalCost?: number };
  } | null>(null);

  const executeCapacityUpdate = useCallback(
    async (targetCapacity: number, options?: { totalCost?: number }) => {
      if (waitlistMode === 'assigned') {
        if (targetCapacity > capacity) {
          // Guided Increase: Host must choose who to promote from WAITLIST
          const requiredCount = targetCapacity - capacity;
          const candidates = waitlistList;
          if (candidates.length === 0) {
            showToast("No waitlisted participants available to promote");
            return;
          }
          setGuidedAdjustmentState({
            mode: 'promote',
            targetCapacity,
            requiredCount: Math.min(requiredCount, candidates.length),
            candidates,
            options,
          });
        } else {
          // Guided Decrease: Host must choose who to demote from GOING
          const requiredCount = capacity - targetCapacity;
          const candidates = goingList.filter(f => {
            const uId = f.dbUuid || f.id;
            return !(f.isHost && activeUserId && uId === activeUserId);
          });
          setGuidedAdjustmentState({
            mode: 'demote',
            targetCapacity,
            requiredCount: Math.min(requiredCount, candidates.length),
            candidates,
            options,
          });
        }
        return;
      }

      // Automatic mode: direct capacity update
      try {
        await onUpdatePlanCapacity!(plan.id, targetCapacity, options);
        if (pendingPromoteToGoing) {
          const friendToMove = pendingPromoteToGoing;
          setPendingPromoteToGoing(null);
          setLocalWaitlist(null);
          try {
            await onMoveToGoing(plan.id, friendToMove.dbUuid || friendToMove.id);
          } catch (moveErr: any) {
            console.error("[handleAdjustCapacity] Error moving pending participant to Going:", moveErr);
            showToast(moveErr?.message || 'Failed to move participant');
          } finally {
            setLocalWaitlist(null);
          }
        }
      } catch (err: any) {
        const msg = typeof err === 'string' ? err : err?.message || err?.error_description || err?.details || 'Failed to update capacity';
        console.error("[handleAdjustCapacity] Error updating capacity:", msg, err);
        showToast(msg);
      }
    },
    [capacity, waitlistMode, waitlistList, goingList, activeUserId, onUpdatePlanCapacity, plan.id, pendingPromoteToGoing, onMoveToGoing, showToast]
  );

  const handleAdjustCapacity = useCallback(
    async (newVal: number) => {
      const clampedVal = Math.min(maxCapacity, Math.max(2, newVal));
      if (clampedVal === capacity || !onUpdatePlanCapacity) return;

      let planCost = currentTotalCost;

      // Fallback check to database wallet_expenses table if local planCost is 0
      if (planCost <= 0) {
        try {
          const { data: expRow } = await (supabase as any)
            .from("wallet_expenses")
            .select("total_amount")
            .eq("plan_id", plan.id)
            .or("expense_type.eq.PLAN_EXPENSE,message_id.is.null")
            .maybeSingle();

          if (expRow && Number(expRow.total_amount || 0) > 0) {
            planCost = Number(expRow.total_amount);
            setPlanFeeTotalCostOverride(planCost);
          }
        } catch (err) {
          console.error("[handleAdjustCapacity] Error checking wallet_expenses fallback:", err);
        }
      }

      if (planCost > 0) {
        setPendingCapacityTarget(clampedVal);
        setSelectedPlanFeeOption("change_per_person");
        setShowUpdatePlanFeeModal(true);
        return;
      }

      await executeCapacityUpdate(clampedVal);
    },
    [capacity, maxCapacity, onUpdatePlanCapacity, plan.id, currentTotalCost, executeCapacityUpdate]
  );

  const handleConfirmPlanFeeOption = async () => {
    if (pendingCapacityTarget === null || !onUpdatePlanCapacity || isSubmittingPlanFeeUpdate) return;

    setIsSubmittingPlanFeeUpdate(true);
    const targetCap = pendingCapacityTarget;
    const planCost = currentTotalCost;
    const currentPerPerson = capacity > 0 ? Math.round((planCost / capacity) * 100) / 100 : 0;

    let targetTotalCost = planCost;
    if (selectedPlanFeeOption === "change_per_person") {
      targetTotalCost = Math.round(targetCap * currentPerPerson * 100) / 100;
    }

    try {
      setShowUpdatePlanFeeModal(false);
      setPendingCapacityTarget(null);
      await executeCapacityUpdate(targetCap, { totalCost: targetTotalCost });
    } catch (err: any) {
      console.error("[handleConfirmPlanFeeOption] Failed:", err);
      showToast("Failed to update Plan Fee");
    } finally {
      setIsSubmittingPlanFeeUpdate(false);
    }
  };

  const handleConfirmGuidedAdjustment = useCallback(async (selectedUserIds: string[]) => {
    if (!guidedAdjustmentState || !onUpdatePlanCapacity) return;
    const { mode, targetCapacity, options } = guidedAdjustmentState;
    try {
      if (mode === 'promote') {
        // 1. Expand plan capacity first
        await onUpdatePlanCapacity(plan.id, targetCapacity, options);
        // 2. Promote selected waitlisted participants with capacity validation bypass
        for (const uId of selectedUserIds) {
          await onMoveToGoing(plan.id, uId, { bypassCapacityCheck: true });
        }
      } else {
        // 1. Reduce plan capacity first (so capacity_changed activity is logged first)
        await onUpdatePlanCapacity(plan.id, targetCapacity, options);
        // 2. Demote selected going participants to waitlist second
        for (const uId of selectedUserIds) {
          await onMoveToWaitlist(plan.id, uId);
        }
      }
      showToast(`✓ Capacity updated to ${targetCapacity}`);
    } catch (err: any) {
      console.error("[handleConfirmGuidedAdjustment] Error:", err);
      showToast(err?.message || "Failed to update capacity");
    } finally {
      setGuidedAdjustmentState(null);
    }
  }, [guidedAdjustmentState, plan.id, onMoveToGoing, onMoveToWaitlist, onUpdatePlanCapacity, showToast]);

  const managementMode: "host" | "invite_only" = effectiveIsHost ? "host" : "invite_only";
  const [localGoingList, setLocalGoingList] = useState<Friend[] | null>(null);
  const [localWaitlist, setLocalWaitlist] = useState<Friend[] | null>(null);

  // Sync local drag state with store members: clear local override ONLY once store/DB reflects exact order and positions
  useEffect(() => {
    if (!localWaitlist || localWaitlist.length === 0) return;

    if (waitlistList.length !== localWaitlist.length) return;

    // 1. Verify exact participant ordering match by UUID
    const localIds = localWaitlist.map(f => f.dbUuid || f.id);
    const storeIds = waitlistList.map(f => f.dbUuid || f.id);
    const orderMatches = localIds.every((id, idx) => storeIds[idx] === id);
    if (!orderMatches) return;

    // 2. Verify parent members have valid, non-null waitlistPosition values matching index + 1
    const allPositionsValid = waitlistList.every((item, idx) => {
      const pos = item.waitlistPosition;
      return typeof pos === 'number' && pos > 0 && (waitlistMode !== 'assigned' || pos === idx + 1);
    });

    if (allPositionsValid) {
      setLocalWaitlist(null);
    }
  }, [waitlistList, localWaitlist, waitlistMode]);

  const displayGoingList = useMemo(() => {
    return goingList;
  }, [goingList]);

  const displayWaitlist = useMemo(() => {
    const rawList = localWaitlist || waitlistList;
    const goingUserIds = new Set(displayGoingList.map(g => g.dbUuid || g.id));
    return rawList.filter(w => !goingUserIds.has(w.dbUuid || w.id));
  }, [localWaitlist, waitlistList, displayGoingList]);

  const handleReorderWaitlist = useCallback((newWaitlist: Friend[]) => {
    // ONLY update local visual state during active dragging for 60fps smooth UI
    setLocalWaitlist(newWaitlist);
  }, []);

  const handleReorderWaitlistComplete = useCallback(async (finalWaitlist: Friend[]) => {
    // Persist the EXACT visual waitlist order at the moment the card is dropped
    try {
      const userUuids = finalWaitlist.map((f) => f.dbUuid || f.id);
      if (onReorderWaitlist && userUuids.length > 0) {
        await onReorderWaitlist(plan.id, userUuids);
      }
    } catch (err) {
      console.error("[handleReorderWaitlistComplete] Failed to persist final waitlist order:", err);
    }
  }, [plan.id, onReorderWaitlist]);

  // ── Switch to Automatic Mode State & Handler ──
  const [showAutomaticSelectionSheet, setShowAutomaticSelectionSheet] = useState(false);
  const [showAutomaticWarningSheet, setShowAutomaticWarningSheet] = useState(false);

  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);

  const isAnyBottomSheetOpen = Boolean(
    isActionSheetOpen ||
    showUpdatePlanFeeModal ||
    pendingCapacityInvite ||
    pendingPromoteToGoing ||
    pendingMoveToWaitlist ||
    pendingRemoveGoing ||
    showAutomaticSelectionSheet ||
    showAutomaticWarningSheet ||
    guidedAdjustmentState ||
    swapState ||
    showAddFriendsPicker
  );

  useEffect(() => {
    if (onBottomSheetStateChange) {
      onBottomSheetStateChange(isAnyBottomSheetOpen);
    }
  }, [isAnyBottomSheetOpen, onBottomSheetStateChange]);

  const planFeeCurrentTotal = currentTotalCost;
  const planFeeCurrentPerPerson = capacity > 0 ? Math.round((planFeeCurrentTotal / capacity) * 100) / 100 : 0;
  const planFeeOptionANewTotal = pendingCapacityTarget ? Math.round(pendingCapacityTarget * planFeeCurrentPerPerson * 100) / 100 : planFeeCurrentTotal;
  const planFeeOptionBPerPerson = (pendingCapacityTarget && pendingCapacityTarget > 0) ? Math.round((planFeeCurrentTotal / pendingCapacityTarget) * 100) / 100 : 0;

  const vacantSpots = Math.max(0, capacity - goingMembers.length);

  // Eligible participants are strictly those with assigned_group = WAITLIST and rsvp_status = JOINED
  const eligibleWaitlist = useMemo(() => {
    return waitlistList.filter((f) => {
      const isJoined = f.rsvpStatus === 'JOINED' || f.isAccepted === true;
      return isJoined;
    });
  }, [waitlistList]);

  const handleWaitlistModeChange = useCallback(async (newMode: 'automatic' | 'assigned') => {
    if (newMode === 'assigned' || waitlistMode === newMode) return;

    if (!onSwitchToAutomaticMode) return;

    // Case 1: Vacant GOING spots exist AND eligible waitlist participants exist -> Show selection bottom sheet
    if (vacantSpots > 0 && eligibleWaitlist.length > 0) {
      setShowAutomaticSelectionSheet(true);
      return;
    }

    // Case 2: Vacant GOING spots exist BUT NO eligible waitlist participants -> Show warning bottom sheet and block
    if (vacantSpots > 0 && eligibleWaitlist.length === 0) {
      setShowAutomaticWarningSheet(true);
      return;
    }

    // Case 3: GOING is already full (vacantSpots === 0) -> Switch directly
    try {
      await onSwitchToAutomaticMode(plan.id, []);
      showToast("✓ Waitlist mode switched to Automatic");
    } catch (err: any) {
      console.error("[handleWaitlistModeChange] Error switching to Automatic:", err);
      showToast(err?.message || "Failed to switch waitlist mode");
    }
  }, [waitlistMode, onSwitchToAutomaticMode, vacantSpots, eligibleWaitlist.length, plan.id, showToast]);

  const handleConfirmAutomaticSelection = useCallback(async (selectedUserIds: string[]) => {
    if (!onSwitchToAutomaticMode) return;
    try {
      await onSwitchToAutomaticMode(plan.id, selectedUserIds);
      showToast("✓ Participants promoted & switched to Automatic");
    } catch (err: any) {
      console.error("[handleConfirmAutomaticSelection] Error:", err);
      showToast(err?.message || "Failed to switch waitlist mode");
    }
  }, [onSwitchToAutomaticMode, plan.id, showToast]);

  // Compute leaving participant & selected replacement friend for replacement mode
  const isReplacementMode = Boolean(effectiveReplaceTargetUserId);
  const leavingParticipant = useMemo(() => {
    if (!effectiveReplaceTargetUserId) return null;
    const foundMember = members.find(m => (m.userId || m.userUuid || m.user_id || m.id || m.dbUuid) === effectiveReplaceTargetUserId);
    const foundUser = candidateUsers.find(u => u.id === effectiveReplaceTargetUserId);
    return {
      name: foundMember?.name || foundMember?.full_name || foundUser?.full_name || "Participant",
      avatar: foundMember?.avatar || foundMember?.profile_photo || foundUser?.profile_photo || null,
    };
  }, [effectiveReplaceTargetUserId, members, candidateUsers]);

  const selectedReplacementFriend = useMemo(() => {
    if (!isReplacementMode || individuallySelectedFriendIds.length === 0) return null;
    const selectedId = individuallySelectedFriendIds[0];
    return AVAILABLE_FRIENDS.find(f => f.id === selectedId) || candidateUsers.find(u => u.id === selectedId) || null;
  }, [isReplacementMode, individuallySelectedFriendIds, AVAILABLE_FRIENDS, candidateUsers]);

  const isPickerOpen = Boolean(showAddFriendsPicker || effectiveReplaceTargetUserId);

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
        isHost={effectiveIsHost}
        isHostUser={effectiveIsHost}
        waitlistMode={waitlistMode}
        onWaitlistModeChange={handleWaitlistModeChange}
        externalGoingList={displayGoingList}
        externalWaitlist={displayWaitlist}
        externalInvitedList={invitedList}
        initialTab={initialTab}
        onBack={onBack}
        onAdjustCapacity={effectiveIsHost ? handleAdjustCapacity : undefined}
        onMoveToGoing={effectiveIsHost ? handleMoveToGoing : undefined}
        onMoveToWaitlist={effectiveIsHost ? handleMoveToWaitlist : undefined}
        onRemoveParticipant={effectiveIsHost ? handleRemoveParticipant : undefined}
        onPromoteHost={onPromoteToHost && effectiveIsHost ? handlePromoteHost : undefined}
        onDemoteHost={onDemoteFromHost && effectiveIsHost ? handleDemoteHost : undefined}
        onAddFriends={canInvite ? (targetTab) => {
          setAddFriendsTargetTab(targetTab === 'waitlist' ? 'WAITLIST' : 'GOING');
          setShowAddFriendsPicker(true);
        } : undefined}
        displayMode={displayMode}
        onOpenSettings={onOpenSettings}
        onOpenActivity={onOpenActivity}
        onPlanSizeEditingChange={onPlanSizeEditingChange}
        onBottomSheetStateChange={setIsActionSheetOpen}
        showWaitlistMode={showWaitlistMode}
        onReorderWaitlist={effectiveIsHost && waitlistMode === 'assigned' ? handleReorderWaitlist : undefined}
        onReorderWaitlistComplete={effectiveIsHost && waitlistMode === 'assigned' ? handleReorderWaitlistComplete : undefined}
        canParticipantInvite={canParticipantInvite}
        pendingLeaveRequests={pendingLeaveRequests}
        onReplaceLeaveParticipant={handleReplaceLeaveParticipant}
        onKeepPaymentLeaveParticipant={handleKeepPaymentLeaveParticipant}
      />

      {isPickerOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <WhoIsComingScreen
            form={mockForm}
            onBack={() => {
              setLocalReplaceTargetUserId(null);
              if (isReplacementMode && onCancelReplacement) {
                onCancelReplacement();
              } else {
                setShowAddFriendsPicker(false);
              }
            }}
            onContinue={handleConfirmInvite}
            selectedCategory={plan.category || "custom"}
            selectedSubcategory={plan.subcategory || null}
            confirmLabel={isReplacementMode ? "Confirm Replacement" : "Send invites"}
            headerTitle={isReplacementMode ? `Replace ${leavingParticipant?.name || "Participant"}` : "Select friends"}
            hideExitDialog={true}
            hideOverviewToggle={true}
            isAddParticipantMode={true}
            isReplacementMode={isReplacementMode}
            leavingParticipant={leavingParticipant}
            selectedReplacementFriend={selectedReplacementFriend}
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
        onSwapParticipant={handleOpenSwapTargetPicker}
        onClose={handleCancelPendingPromote}
      />

      {/* Move to Waitlist capacity bottom sheet */}
      <MoveToWaitlistBottomSheet
        isOpen={Boolean(pendingMoveToWaitlist)}
        participant={pendingMoveToWaitlist ? { name: pendingMoveToWaitlist.name, avatar: pendingMoveToWaitlist.avatar } : null}
        hasWaitlist={waitlistList.length > 0}
        goingCount={goingMembers.length}
        waitlistCount={waitlistList.length}
        onDecreaseCapacity={handleConfirmDecreaseCapacityForWaitlist}
        onSwapParticipant={waitlistList.length > 0 ? handleOpenWaitlistSwapPicker : undefined}
        onCancelPlan={onCancelPlan ? () => onCancelPlan(plan.id) : undefined}
        onClose={handleCancelPendingWaitlist}
      />

      {/* Remove Going Participant bottom sheet (Case 1) */}
      <RemoveGoingParticipantBottomSheet
        isOpen={Boolean(pendingRemoveGoing)}
        participant={pendingRemoveGoing ? { name: pendingRemoveGoing.name, avatar: pendingRemoveGoing.avatar } : null}
        hasWaitlist={waitlistList.length > 0}
        goingCount={goingMembers.length}
        waitlistCount={waitlistList.length}
        onDecreaseCapacity={handleConfirmDecreaseCapacityForRemoveGoing}
        onReplaceParticipant={waitlistList.length > 0 ? handleOpenRemoveGoingReplacePicker : undefined}
        onCancelPlan={onCancelPlan ? () => onCancelPlan(plan.id) : undefined}
        onClose={handleCancelPendingRemoveGoing}
      />

      {/* Switch to Automatic Selection Bottom Sheet (Case 1) */}
      <SwitchToAutomaticSelectionBottomSheet
        isOpen={showAutomaticSelectionSheet}
        vacantSpots={vacantSpots}
        eligibleWaitlist={eligibleWaitlist}
        onConfirm={handleConfirmAutomaticSelection}
        onClose={() => setShowAutomaticSelectionSheet(false)}
      />

      {/* Switch to Automatic Warning Bottom Sheet (Case 2) */}
      <SwitchToAutomaticWarningBottomSheet
        isOpen={showAutomaticWarningSheet}
        onClose={() => setShowAutomaticWarningSheet(false)}
      />

      {/* Guided Capacity Adjustment Bottom Sheet (Assigned Mode Capacity Change) */}
      <GuidedCapacityAdjustmentBottomSheet
        isOpen={Boolean(guidedAdjustmentState)}
        mode={guidedAdjustmentState?.mode || 'promote'}
        requiredCount={guidedAdjustmentState?.requiredCount || 1}
        candidates={guidedAdjustmentState?.candidates || []}
        onConfirm={handleConfirmGuidedAdjustment}
        onClose={() => setGuidedAdjustmentState(null)}
      />

      {/* Guided Swap / Replacement Bottom Sheet */}
      <GuidedCapacityAdjustmentBottomSheet
        isOpen={Boolean(swapState)}
        mode="promote"
        requiredCount={1}
        candidates={
          swapState?.type === 'swap_incoming'
            ? goingList.filter(f => {
                const uId = f.dbUuid || f.id;
                const incomingId = swapState.targetFriend.dbUuid || swapState.targetFriend.id;
                return !(f.isHost || (activeUserId && uId === activeUserId) || uId === incomingId);
              })
            : waitlistList
        }
        title={
          swapState?.type === 'swap_incoming'
            ? 'Who should this participant replace?'
            : 'Who should replace this participant?'
        }
        subtitle={
          swapState?.type === 'swap_incoming'
            ? 'Select a participant currently in the Going group.'
            : swapState?.type === 'swap'
            ? 'Select one participant from the waitlist to swap into the Going group.'
            : 'Select a participant from the waitlist before removing them.'
        }
        onConfirm={handleConfirmSwap}
        onClose={() => setSwapState(null)}
      />

      {/* Update Plan Fee Confirmation Modal */}
      {showUpdatePlanFeeModal && pendingCapacityTarget !== null && (
        <div
          onClick={() => {
            if (!isSubmittingPlanFeeUpdate) {
              setShowUpdatePlanFeeModal(false);
              setPendingCapacityTarget(null);
            }
          }}
          className="fixed inset-0 z-[100] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-[#111111] border border-white/10 rounded-t-3xl sm:rounded-2xl p-5 text-left font-sans shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white tracking-tight">
                Update Plan Fee?
              </h3>
              <p className="text-xs text-zinc-400">
                Plan size: <span className="font-semibold text-white">{capacity}</span> → <span className="font-semibold text-[#FF6B2C]">{pendingCapacityTarget}</span>
              </p>
            </div>

            <div className="space-y-3 pt-1">
              {/* Option A: Change cost per person */}
              <button
                type="button"
                onClick={() => setSelectedPlanFeeOption("change_per_person")}
                className={`w-full p-4 rounded-xl border text-left transition cursor-pointer flex items-start gap-3 ${
                  selectedPlanFeeOption === "change_per_person"
                    ? "bg-zinc-900 border-[#FF6B2C] text-white"
                    : "bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:bg-zinc-900/80"
                }`}
              >
                <div className="pt-0.5">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      selectedPlanFeeOption === "change_per_person"
                        ? "border-[#FF6B2C] bg-[#FF6B2C]"
                        : "border-zinc-600"
                    }`}
                  >
                    {selectedPlanFeeOption === "change_per_person" && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                  <span className="text-sm font-semibold text-white block">
                    Change cost per person
                  </span>
                  <span className="text-xs text-zinc-400 block leading-relaxed">
                    Keep ₹{planFeeCurrentPerPerson}/person and update the Plan Fee to <span className="text-white font-medium">₹{planFeeOptionANewTotal}</span>.
                  </span>
                </div>
              </button>

              {/* Option B: Keep total Plan Fee */}
              <button
                type="button"
                onClick={() => setSelectedPlanFeeOption("keep_total")}
                className={`w-full p-4 rounded-xl border text-left transition cursor-pointer flex items-start gap-3 ${
                  selectedPlanFeeOption === "keep_total"
                    ? "bg-zinc-900 border-[#FF6B2C] text-white"
                    : "bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:bg-zinc-900/80"
                }`}
              >
                <div className="pt-0.5">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      selectedPlanFeeOption === "keep_total"
                        ? "border-[#FF6B2C] bg-[#FF6B2C]"
                        : "border-zinc-600"
                    }`}
                  >
                    {selectedPlanFeeOption === "keep_total" && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                  <span className="text-sm font-semibold text-white block">
                    Keep total Plan Fee
                  </span>
                  <span className="text-xs text-zinc-400 block leading-relaxed">
                    Keep the Plan Fee at ₹{planFeeCurrentTotal} and redistribute it across the new size (<span className="text-white font-medium">₹{planFeeOptionBPerPerson}/person</span>).
                  </span>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-3 pt-3">
              <button
                type="button"
                disabled={isSubmittingPlanFeeUpdate}
                onClick={() => {
                  setShowUpdatePlanFeeModal(false);
                  setPendingCapacityTarget(null);
                }}
                className="flex-1 h-11 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold text-sm hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingPlanFeeUpdate}
                onClick={handleConfirmPlanFeeOption}
                className="flex-1 h-11 rounded-xl bg-[#FF6B2C] text-white font-semibold text-sm hover:bg-[#e05a1f] active:scale-[0.99] disabled:opacity-40 transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B2C]/20"
              >
                {isSubmittingPlanFeeUpdate ? "Updating..." : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
