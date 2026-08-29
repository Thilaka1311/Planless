import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { ParticipantManagementScreen, Friend } from '../../../../participants/screens/ParticipantManagementScreen';
import { Plan, UserProfile } from '../../../../../core/types';
import { normalizeStatus, sortGoingParticipants } from '../../../../../../lib/participantStatus';
import { useToast } from '../../../../../shared/contexts/ToastContext';
import { WhoIsComingScreen } from '../../../../create/screens/WhoIsComingScreen';
import { useCirclesStore } from '../../../../circles/state/CirclesContext';
import { useFriendshipStore } from '../../../../friendships/state/FriendshipContext';
import { getCompleteCurrentUserFriends } from '../../../../friendships/api/friendships';
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
  onOpenSettings?: () => void;
  onOpenActivity?: () => void;
  onPlanSizeEditingChange?: (isEditing: boolean) => void;
  onBottomSheetStateChange?: (isOpen: boolean) => void;
  onCancelPlan?: (planId: string) => Promise<void>;
  replaceTargetUserId?: string | null;
  onCancelReplacement?: () => void;
  onConfirmReplacement?: (planId: string, targetUserId: string, replacementUserId: string) => Promise<void>;
  currentPage?: number;
}

function memberToFriend(m: any, hostId: string, activeUserId?: string, dbPlanParticipants: any[] = [], currentPlanId?: string): Friend {
  const id = m.userUuid || m.userId || m.user_id || m.id || m.dbUuid;
  const isHostRole = (m.role || '').toUpperCase() === 'HOST';
  const isCurrentUser = Boolean(
    activeUserId && (id === activeUserId || m.userUuid === activeUserId || m.userId === activeUserId || m.user_id === activeUserId || m.dbUuid === activeUserId)
  );
  const status = normalizeStatus(m.joinState || m.rsvp_status);
  const isAccepted = status !== 'INVITED';

  const dbPp = dbPlanParticipants.find((pp: any) => 
    (!currentPlanId || pp.plan_id === currentPlanId) &&
    (pp.user_id === id || pp.user_id === m.userUuid || pp.user_id === m.userId || pp.user_id === m.user_id || pp.user_id === m.dbUuid)
  );

  const isLeaveRequested = Boolean(
    (dbPp && dbPp.leave_requested === true) ||
    m.leave_requested === true ||
    (m as any).leaveRequested === true
  );

  const leaveRequestedAt = dbPp?.leave_requested_at || m.leave_requested_at || (m as any).leaveRequestedAt || null;

  const waitlistPosition = dbPp
    ? dbPp.waitlist_position
    : (m.waitlistPosition ?? m.waitlist_position ?? null);

  return {
    id,
    dbUuid: m.userUuid || m.userId || m.user_id || m.id || m.dbUuid,
    name: isCurrentUser ? 'You' : (m.name || m.displayName || 'Unknown'),
    avatar: m.avatar || m.profile_photo || m.profile_photo_path || m.profile_image_url || m.avatar_url || '',
    isHost: isHostRole,
    joinedQueueAt: m.joinedQueueAt || m.joined_queue_at || m.createdAt || m.created_at,
    isAccepted,
    rsvpStatus: status,
    assignedGroup: m.assignedGroup || m.assigned_group || (status === 'WAITLISTED' ? 'WAITLIST' : 'GOING'),
    waitlistPosition,
    leave_requested: isLeaveRequested,
    leave_requested_at: leaveRequestedAt,
    skipReason: dbPp?.skip_reason || m.skipReason || m.skip_reason || null,
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

  onOpenSettings,
  onOpenActivity,
  onPlanSizeEditingChange,
  onBottomSheetStateChange,
  onCancelPlan,
  displayMode = 'standalone',

  replaceTargetUserId = null,
  onCancelReplacement,
  onConfirmReplacement,
  currentPage,
}) => {
  const { circles } = useCirclesStore();
  const { friends, refreshFriendships } = useFriendshipStore();
  const { dbPlans, dbPlanParticipants, resolvePaidPlanLeaveRequest, replaceParticipant, moveParticipantToWaitlistAndDecreaseCapacity } = usePlansStore();
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

  const [localReplaceTargetUserId, setLocalReplaceTargetUserId] = useState<string | null>(null);
  const effectiveReplaceTargetUserId = localReplaceTargetUserId || replaceTargetUserId;
  const isReplacementMode = Boolean(effectiveReplaceTargetUserId);

  const [fetchedFriends, setFetchedFriends] = useState<any[]>([]);
  const [isFetchingFriends, setIsFetchingFriends] = useState<boolean>(false);

  const targetUserId = userProfile?.dbUuid || (userProfile as any)?.id || activeUserId || "";

  // Fetch complete canonical friend list for the active user when picker opens
  useEffect(() => {
    if (!targetUserId) return;

    let isMounted = true;
    async function loadFreshFriends() {
      setIsFetchingFriends(true);
      try {
        const canonicalFriends = await getCompleteCurrentUserFriends(targetUserId);
        if (isMounted) {
          setFetchedFriends(canonicalFriends);
        }
      } catch (err) {
        console.error("[REPLACE FRIEND LIST AUDIT] Error fetching friends:", err);
      } finally {
        if (isMounted) setIsFetchingFriends(false);
      }
    }

    loadFreshFriends();

    return () => {
      isMounted = false;
    };
  }, [targetUserId, replaceTargetUserId, localReplaceTargetUserId]);

  // Compute user IDs who occupy an active JOINED/GOING slot in this plan from DB and members
  const joinedParticipantUserIds = useMemo(() => {
    const set = new Set<string>();
    const planUuid = plan.dbUuid || plan.id;

    // 1. Fresh realtime DB state
    (dbPlanParticipants || []).forEach((pp: any) => {
      if (pp.plan_id === planUuid || pp.plan_id === plan.id) {
        const rsvp = (pp.rsvp_status || '').toUpperCase();
        const group = (pp.assigned_group || '').toUpperCase();
        
        // EXCLUDE ONLY IF RSVP IS JOINED/GOING OR (ASSIGNED GROUP IS JOINED/GOING AND RSVP IS NOT SKIPPED)
        if (rsvp === 'JOINED' || rsvp === 'GOING') {
          if (pp.user_id) set.add(pp.user_id);
        } else if ((group === 'JOINED' || group === 'GOING') && rsvp !== 'SKIPPED') {
          if (pp.user_id) set.add(pp.user_id);
        }
      }
    });

    // 2. Members props state
    (members || []).forEach((m: any) => {
      const rsvp = normalizeStatus(m.joinState || m.rsvp_status);
      const group = (m.assignedGroup || m.assigned_group || '').toUpperCase();
      if (rsvp === 'JOINED') {
        const mId = m.userId || m.userUuid || m.user_id || m.id || m.dbUuid;
        if (mId) set.add(mId);
      } else if ((group === 'JOINED' || group === 'GOING') && rsvp !== 'SKIPPED') {
        const mId = m.userId || m.userUuid || m.user_id || m.id || m.dbUuid;
        if (mId) set.add(mId);
      }
    });

    return set;
  }, [dbPlanParticipants, members, plan.id, plan.dbUuid]);

  const disabledUserIds = useMemo(() => {
    const myUuid = userProfile?.dbUuid || (userProfile as any)?.id || activeUserId || "";
    const set = new Set<string>();
    if (myUuid) set.add(myUuid);
    if (userProfile?.user_id) set.add(userProfile.user_id);

    if (isReplacementMode) {
      // Replacement mode: EXCLUDE ONLY IF RSVP IS JOINED OR ASSIGNED GROUP IS JOINED (AND NOT SKIPPED)
      joinedParticipantUserIds.forEach((id) => set.add(id));
      if (effectiveReplaceTargetUserId) set.add(effectiveReplaceTargetUserId);
    } else {
      // Normal Add Friends mode: exclude anyone currently active in plan
      (members || []).forEach((m: any) => {
        const status = normalizeStatus(m.joinState || m.rsvp_status);
        if (status === 'JOINED' || status === 'WAITLISTED' || status === 'INVITED') {
          const mId = m.userId || m.userUuid || m.user_id || m.id || m.dbUuid;
          if (mId) set.add(mId);
        }
      });
    }

    return set;
  }, [isReplacementMode, joinedParticipantUserIds, activeUserId, userProfile, effectiveReplaceTargetUserId, members]);

  // Primary Friend Source: Complete Canonical Friends List
  const activeFriendList = useMemo(() => {
    if (fetchedFriends.length > 0) return fetchedFriends;
    
    // Fallback to store friends
    return (friends || []).map((f: any) => {
      const friendObj = f.friend || f;
      return {
        ...friendObj,
        id: friendObj?.id || friendObj?.dbUuid || friendObj?.user_id,
        full_name: friendObj?.full_name || friendObj?.name || friendObj?.displayName || "",
        profile_photo: friendObj?.profile_photo || friendObj?.profile_photo_path || friendObj?.avatar || ""
      };
    }).filter((u: any) => Boolean(u.id));
  }, [fetchedFriends, friends]);

  // Complete candidate users list: Canonical Friends + Plan Participants fallback
  const candidateUsers = useMemo(() => {
    const list: any[] = [];
    const seen = new Set<string>();

    activeFriendList.forEach((friendObj: any) => {
      const friendId = friendObj.id || friendObj.dbUuid || friendObj.user_id;
      if (friendObj && friendId && !seen.has(friendId)) {
        seen.add(friendId);
        list.push({
          ...friendObj,
          id: friendId,
          full_name: friendObj.full_name || friendObj.name || friendObj.displayName || "",
          profile_photo: friendObj.profile_photo || friendObj.profile_photo_path || friendObj.avatar || ""
        });
      }
    });

    (members || []).forEach((m: any) => {
      const memberId = m.userId || m.userUuid || m.user_id || m.id || m.dbUuid;
      if (memberId && !seen.has(memberId)) {
        seen.add(memberId);
        list.push({
          id: memberId,
          dbUuid: memberId,
          full_name: m.name || m.full_name || m.displayName || "",
          profile_photo: m.avatar || m.profile_photo || m.profile_photo_path || ""
        });
      }
    });

    return list;
  }, [activeFriendList, members, joinedParticipantUserIds]);

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

  /**
   * Invite a skipped participant back into the plan.
   * GOING: increases capacity by 1, then invites with assigned_group=GOING (rsvp_status=INVITED).
   * WAITLIST: invites directly with assigned_group=WAITLIST (rsvp_status=INVITED).
   * Uses the canonical invite_participants RPC which reactivates the existing row cleanly.
   */
  const handleInviteSkipped = useCallback(async (friend: Friend, target?: 'GOING' | 'WAITLIST') => {
    if (!onAddParticipants) return;
    const userId = friend.dbUuid || friend.id;
    try {
      if (waitlistMode === 'assigned' && target === 'GOING' && onUpdatePlanCapacity) {
        // Increase capacity by 1 to make room
        const currentCapacity = Math.max(2, plan.joinLimit || plan.capacity || 2);
        const newCapacity = currentCapacity + 1;
        await onUpdatePlanCapacity(plan.id, newCapacity);
      }
      await onAddParticipants(plan.id, [userId], [], target);
      showToast('✓ Invitation sent');
    } catch (err: any) {
      console.error('[handleInviteSkipped] error:', err);
      showToast(err?.message || 'Failed to invite participant');
    }
  }, [onAddParticipants, onUpdatePlanCapacity, plan.id, plan.joinLimit, plan.capacity, showToast]);

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
        if (isReplacementMode) {
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
    plan,
    isReplacementMode
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
      const targetMember = allPlanMembers.find(m => (m.dbUuid || m.id) === targetId);
      const isActualLeaveRequest = Boolean(targetMember?.leave_requested);

      try {
        if (isActualLeaveRequest && resolvePaidPlanLeaveRequest) {
          // Flow 1: Actual leave request resolution -> resolve_paid_plan_leave_request RPC
          await resolvePaidPlanLeaveRequest(plan.id, targetId, 'REPLACED', replacementId);
        } else if (onConfirmReplacement) {
          // Flow 2: Host-initiated replacement -> replaceParticipant callback
          await onConfirmReplacement(plan.id, targetId, replacementId);
        } else if (replaceParticipant) {
          // Flow 2: Host-initiated replacement -> replace_participant RPC
          await replaceParticipant(plan.id, targetId, replacementId);
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

  // Extract all active plan members with unique ID deduplication
  const allPlanMembers = useMemo(() => {
    const seenMemberIds = new Set<string>();
    return members.filter((m) => {
      const mId = m.userId || m.userUuid || m.user_id || m.id;
      if (!mId || seenMemberIds.has(mId)) return false;
      seenMemberIds.add(mId);
      return true;
    });
  }, [members]);

  const rawWaitlistMode = plan.participantFiltering || (plan as any).participant_filtering || (plan as any).waitlist_mode || (plan as any).waitlistMode || (plan as any).waitlist_type || (plan as any).waitlistType || 'AUTOMATIC';
  const waitlistMode: 'automatic' | 'assigned' = (typeof rawWaitlistMode === 'string' && rawWaitlistMode.toLowerCase() === 'assigned') ? 'assigned' : 'automatic';

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
    return sortGoingParticipants(list, activeUserId);
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
        const group = ((m as any).assignedGroup || (m as any).assigned_group || '').toUpperCase();
        return group === 'GOING' || group === 'JOINED' || (!group && (status === 'JOINED' || status === 'INVITED'));
      }
      if (status === 'INVITED') return false;
      return status === 'JOINED';
    });
  }, [allPlanMembers, waitlistMode]);

  const isAutomaticFull = waitlistMode === 'automatic' && capacity > 0 && goingMembers.length >= capacity;

  const waitlistMembers = useMemo(() => {
    return allPlanMembers.filter((m) => {
      const status = normalizeStatus(m.joinState || m.rsvp_status);
      if (status === 'SKIPPED') return false;

      if (waitlistMode === 'assigned') {
        const group = ((m as any).assignedGroup || (m as any).assigned_group || '').toUpperCase();
        return group === 'WAITLIST' || group === 'WAITLISTED' || (!group && status === 'WAITLISTED');
      }
      
      if (status === 'INVITED') return false;
      return status === 'WAITLISTED';
    });
  }, [allPlanMembers, waitlistMode]);

  const invitedList: Friend[] = useMemo(() => {
    if (waitlistMode === 'assigned') return [];
    
    const currentPlanId = plan.id || plan.dbUuid;
    const rawInvited = allPlanMembers
      .filter((m) => normalizeStatus(m.joinState || m.rsvp_status) === 'INVITED')
      .map(m => memberToFriend(m, hostId, activeUserId, dbPlanParticipants, currentPlanId));
    return prioritizeCurrentUserAndSort(rawInvited);
  }, [allPlanMembers, prioritizeCurrentUserAndSort, waitlistMode, hostId, activeUserId, dbPlanParticipants, plan.id, plan.dbUuid]);

  const rawGoingList: Friend[] = useMemo(() => {
    const currentPlanId = plan.id || plan.dbUuid;
    return goingMembers.map((m) => memberToFriend(m, hostId, activeUserId, dbPlanParticipants, currentPlanId));
  }, [goingMembers, hostId, activeUserId, dbPlanParticipants, plan.id, plan.dbUuid]);

  const goingList: Friend[] = useMemo(() => {
    return prioritizeCurrentUserAndSort(rawGoingList);
  }, [rawGoingList, prioritizeCurrentUserAndSort]);

  const waitlistList: Friend[] = useMemo(() => {
    const currentPlanId = plan.id || plan.dbUuid;
    const rawList = waitlistMembers.map((m) => memberToFriend(m, hostId, activeUserId, dbPlanParticipants, currentPlanId));
    return sortByWaitlistOrder(rawList);
  }, [waitlistMembers, hostId, activeUserId, dbPlanParticipants, sortByWaitlistOrder, waitlistMode, plan.id, plan.dbUuid]);

  const skippedList: Friend[] = useMemo(() => {
    const currentPlanId = plan.id || plan.dbUuid;
    const rawSkipped = allPlanMembers
      .filter((m) => normalizeStatus(m.joinState || m.rsvp_status) === 'SKIPPED')
      .map((m) => memberToFriend(m, hostId, activeUserId, dbPlanParticipants, currentPlanId));
    return prioritizeCurrentUserAndSort(rawSkipped);
  }, [allPlanMembers, hostId, activeUserId, dbPlanParticipants, prioritizeCurrentUserAndSort, plan.id, plan.dbUuid]);

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
      if (goingMembers.length <= 2 && waitlistList.length > 0) {
        // If goingCount === 2 and waitlist exists, bypass capacity reduction options and directly open swap picker
        setSwapState({ type: 'swap', targetFriend: friend });
      } else {
        setPendingMoveToWaitlist(friend);
      }
    },
    [goingMembers.length, waitlistList.length],
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

  /**
   * "Move to Waitlist Instead" from the RemoveGoing sheet.
   * Atomically moves the selected participant from GOING to WAITLIST
   * and decreases plan capacity by 1 in a single database RPC transaction.
   */
  const handleMoveToWaitlistForRemoveGoing = useCallback(async () => {
    if (!pendingRemoveGoing) return;
    const friend = pendingRemoveGoing;
    const userId = friend.dbUuid || friend.id;
    setPendingRemoveGoing(null);

    setLocalGoingList(null);
    setLocalWaitlist(null);
    try {
      if (moveParticipantToWaitlistAndDecreaseCapacity) {
        await moveParticipantToWaitlistAndDecreaseCapacity(plan.id, userId);
      } else {
        await onMoveToWaitlist(plan.id, userId);
        if (onUpdatePlanCapacity) {
          const targetCapacity = Math.max(2, capacity - 1);
          await onUpdatePlanCapacity(plan.id, targetCapacity);
        }
      }
      showToast(`✓ Moved ${friend.name} to waitlist and reduced plan size`);
    } catch (err: any) {
      console.error("[handleMoveToWaitlistForRemoveGoing] error:", err);
      showToast(err?.message || 'Failed to move participant to waitlist');
    } finally {
      setLocalGoingList(null);
      setLocalWaitlist(null);
    }
  }, [pendingRemoveGoing, moveParticipantToWaitlistAndDecreaseCapacity, plan.id, onMoveToWaitlist, onUpdatePlanCapacity, capacity, showToast]);

  /**
   * "Replace Participant" from the RemoveGoing sheet.
   * Opens the full friend picker with this participant as the replace target.
   * Reuses the exact same replacement flow as leave-request replacement.
   */
  const handleOpenRemoveGoingReplacePickerFull = useCallback(() => {
    if (!pendingRemoveGoing) return;
    const userId = pendingRemoveGoing.dbUuid || pendingRemoveGoing.id;
    setPendingRemoveGoing(null);
    // Reuse the leave-request replacement flow: set the replace target,
    // clear selection, and open the friend picker.
    setLocalReplaceTargetUserId(userId);
    setIndividuallySelectedFriendIds([]);
    setShowAddFriendsPicker(true);
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

  const handleMoveToInvited = useCallback(
    async (friend: Friend) => {
      const friendId = friend.dbUuid || friend.id;
      setLocalGoingList(null);
      setLocalWaitlist(null);
      try {
        if (onMoveToInvited) {
          await onMoveToInvited(plan.id, friendId);
        } else if (onAddParticipants) {
          await onAddParticipants(plan.id, [friendId], []);
        }
        showToast(`✓ Invited ${friend.name}`);
      } catch (err: any) {
        console.error('[handleMoveToInvited] error:', err);
        showToast(err?.message || 'Failed to invite participant');
      } finally {
        setLocalGoingList(null);
        setLocalWaitlist(null);
      }
    },
    [plan.id, onMoveToInvited, onAddParticipants, showToast],
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

  const reorderTimeoutRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (reorderTimeoutRef.current) {
        clearTimeout(reorderTimeoutRef.current);
      }
    };
  }, []);

  const handleReorderWaitlist = useCallback((newWaitlist: Friend[]) => {
    // ONLY update local visual state during active dragging for 60fps smooth UI
    setLocalWaitlist(newWaitlist);
  }, []);

  const handleReorderWaitlistComplete = useCallback((finalWaitlist: Friend[]) => {
    // 1. Keep the exact visual waitlist order locally
    setLocalWaitlist(finalWaitlist);

    // 2. Clear any pending database sync timer
    if (reorderTimeoutRef.current) {
      clearTimeout(reorderTimeoutRef.current);
    }

    // 3. Sync the final order to the database only after 2 seconds of inactivity
    reorderTimeoutRef.current = setTimeout(async () => {
      try {
        const userUuids = finalWaitlist.map((f) => f.dbUuid || f.id);

        if (onReorderWaitlist && userUuids.length > 0) {
          await onReorderWaitlist(plan.id, userUuids);
        }
      } catch (err) {
        console.error("[ASSIGNED_WAITLIST_REORDER] Database error:", err);
      } finally {
        reorderTimeoutRef.current = null;
      }
    }, 2000);
  }, [plan.id, onReorderWaitlist]);

  // ── Switch to Automatic Mode State & Handler (REMOVED) ──
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);

  const isAnyBottomSheetOpen = Boolean(
    isActionSheetOpen ||
    showUpdatePlanFeeModal ||
    pendingCapacityInvite ||
    pendingPromoteToGoing ||
    pendingMoveToWaitlist ||
    pendingRemoveGoing ||
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


  // Compute leaving participant & selected replacement friend for replacement mode  // isReplacementMode already declared at the top of the component
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

  useEffect(() => {
    if (isPickerOpen && refreshFriendships) {
      refreshFriendships();
    }
  }, [isPickerOpen, refreshFriendships]);

  return (
    <>
      <ParticipantManagementScreen
        currentPage={currentPage}
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
        externalGoingList={displayGoingList}
        externalWaitlist={displayWaitlist}
        externalInvitedList={invitedList}
        externalSkippedList={skippedList}
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
        showWaitlistMode={false}
        onReorderWaitlist={effectiveIsHost && waitlistMode === 'assigned' ? handleReorderWaitlist : undefined}
        onReorderWaitlistComplete={effectiveIsHost && waitlistMode === 'assigned' ? handleReorderWaitlistComplete : undefined}
        canParticipantInvite={canParticipantInvite}
        pendingLeaveRequests={pendingLeaveRequests}
        onReplaceLeaveParticipant={handleReplaceLeaveParticipant}
        onKeepPaymentLeaveParticipant={handleKeepPaymentLeaveParticipant}
        onInviteSkipped={effectiveIsHost ? handleInviteSkipped : undefined}
        onMoveToInvited={effectiveIsHost ? handleMoveToInvited : undefined}
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
        onMoveToWaitlist={handleMoveToWaitlistForRemoveGoing}
        onDecreaseCapacity={handleConfirmDecreaseCapacityForRemoveGoing}
        onReplaceParticipant={handleOpenRemoveGoingReplacePickerFull}
        onCancelPlan={onCancelPlan ? () => onCancelPlan(plan.id) : undefined}
        onClose={handleCancelPendingRemoveGoing}
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
