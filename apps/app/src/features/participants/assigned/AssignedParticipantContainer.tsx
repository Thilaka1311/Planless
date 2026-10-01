import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { AssignedParticipantScreen } from './AssignedParticipantScreen';
import { Friend } from '../shared/types';
import { PlanParticipantManagementWrapperProps } from '../shared/participantManagementTypes';
import { normalizeStatus, sortGoingParticipants } from '../../../../lib/participantStatus';
import {
  formatAssignedGoingList,
  formatAssignedWaitlist,
} from './assignedCapacityLogic';
import { WhoIsComingScreen } from '../../create/screens/WhoIsComingScreen';
import { useFriendshipStore } from '../../friendships/state/FriendshipContext';
import { getCompleteCurrentUserFriends } from '../../friendships/api/friendships';
import { usePlansStore } from '../../plans/state/PlansContext';
import { supabase } from '../../../../lib/supabaseClient';

import {
  PlanIsFullBottomSheet,
  MoveToGoingCapacityBottomSheet,
  MoveToWaitlistBottomSheet,
  RemoveGoingParticipantBottomSheet,
  GuidedCapacityAdjustmentBottomSheet,
  MakeAnotherParticipantHostBottomSheet,
} from '../../plans/components/BottomSheets';
import { isUuid } from '../../plans/utils/planUtils';
import { useToast } from '../../../shared/contexts/ToastContext';

const getMemberFinalState = (m: any): string | null => {
  if (!m) return null;
  const raw = m.final_state || m.finalState || m.final_attendance || m.finalAttendance;
  if (raw) {
    const s = String(raw).toUpperCase();
    if (s === 'JOINED' || s === 'ATTENDED') return 'JOINED';
    if (s === 'WAITLISTED') return 'WAITLISTED';
    if (s === 'INVITED') return 'INVITED';
    if (s === 'SKIPPED' || s === 'DID_NOT_ATTEND') return 'SKIPPED';
    return s;
  }
  return null;
};

export const memberToAssignedFriend = (
  m: any,
  hostId: string,
  activeUserId: string,
  dbPlanParticipants: any[],
  currentPlanId?: string,
  planDbUuid?: string,
  planAltId?: string
): Friend => {
  const id = m.userUuid || m.userId || m.user_id || m.id || m.dbUuid;
  const isHostRole = (m.role || '').toUpperCase() === 'HOST';
  const isCurrentUser = Boolean(
    activeUserId &&
      (id === activeUserId ||
        m.userUuid === activeUserId ||
        m.userId === activeUserId ||
        m.user_id === activeUserId ||
        m.dbUuid === activeUserId)
  );

  const dbPp = dbPlanParticipants.find((pp: any) => {
    const matchesPlan =
      !currentPlanId && !planDbUuid && !planAltId
        ? true
        : (currentPlanId && pp.plan_id === currentPlanId) ||
          (planDbUuid && pp.plan_id === planDbUuid) ||
          (planAltId && pp.plan_id === planAltId);
    if (!matchesPlan) return false;
    return (
      pp.user_id === id ||
      pp.user_id === m.userUuid ||
      pp.user_id === m.userId ||
      pp.user_id === m.user_id ||
      pp.user_id === m.dbUuid
    );
  });

  const status = dbPp
    ? normalizeStatus(dbPp.rsvp_status)
    : normalizeStatus(m.joinState || m.rsvp_status);
  const isAccepted = status !== 'INVITED' && status !== 'SKIPPED' && status !== 'REJOINED';

  const isLeaveRequested = dbPp
    ? Boolean(dbPp.leave_requested === true)
    : Boolean(m.leave_requested === true || (m as any).leaveRequested === true);

  const leaveRequestedAt = dbPp
    ? dbPp.leave_requested_at || null
    : m.leave_requested_at || (m as any).leaveRequestedAt || null;

  const rawGroup = dbPp ? dbPp.assigned_group : (m.assignedGroup || m.assigned_group);
  const normalizedGroup =
    typeof rawGroup === 'string' &&
    (rawGroup.toUpperCase() === 'GOING' || rawGroup.toUpperCase() === 'WAITLIST')
      ? (rawGroup.toUpperCase() as 'GOING' | 'WAITLIST')
      : null;

  const assignedGroup = normalizedGroup || (status === 'JOINED' || isHostRole ? 'GOING' : 'WAITLIST');

  const isActivelyJoined =
    status === 'JOINED' || status === 'WAITLISTED' || status === 'REJOINED' || isHostRole;
  const joinedQueueAt = isActivelyJoined
    ? dbPp?.joined_queue_at || m.joined_queue_at || m.joinedQueueAt || (m as any).join_queue_at || null
    : null;

  const isWaitlistMember = assignedGroup === 'WAITLIST' || status === 'WAITLISTED';

  const waitlistPosition = isWaitlistMember
    ? dbPp
      ? dbPp.waitlist_position
      : m.waitlistPosition ?? m.waitlist_position ?? null
    : null;

  return {
    id,
    dbUuid: m.userUuid || m.userId || m.user_id || m.id || m.dbUuid,
    name: isCurrentUser ? 'You' : m.name || m.displayName || 'Unknown',
    avatar:
      m.avatar ||
      m.profile_photo ||
      m.profile_photo_path ||
      m.profile_image_url ||
      m.avatar_url ||
      '',
    isHost: isHostRole,
    joinedQueueAt,
    isAccepted,
    rsvpStatus: status,
    assignedGroup,
    waitlistPosition,
    leave_requested: isLeaveRequested,
    leave_requested_at: leaveRequestedAt,
    skipReason: status === 'REJOINED' ? null : dbPp?.skip_reason || m.skipReason || m.skip_reason || null,
  };
};

export const AssignedParticipantContainer: React.FC<PlanParticipantManagementWrapperProps> = ({
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
  onWaitlistModeChange,
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
  onLeavePlan,
  initialOpenPlanSizeSheet,
}) => {
  const { friends, refreshFriendships } = useFriendshipStore();
  const {
    dbPlans,
    dbPlanParticipants,
    updatePlanDetails,
    resolvePaidPlanLeaveRequest,
    replaceParticipant,
    moveParticipantToWaitlistAndDecreaseCapacity,
    requestHostLeaveWithReplacement,
    stopHostingWithReplacement,
    resolveRejoinedParticipant,
  } = usePlansStore();
  const hostId = plan.hostId || '';
  const members: any[] = plan.members || [];
  const { showToast } = useToast();

  const matchedDbPlan = useMemo(() => {
    return (dbPlans || []).find(
      (p: any) =>
        p.id === plan.id ||
        p.id === (plan as any).dbUuid ||
        p.public_id === plan.id ||
        p.slug === plan.id ||
        (plan.title && p.title && p.title.toLowerCase() === plan.title.toLowerCase())
    );
  }, [dbPlans, plan.id, (plan as any).dbUuid, plan.title]);

  const targetPlanUuid = useMemo(() => {
    if (isUuid(plan.id)) return plan.id;
    if (isUuid((plan as any).dbUuid)) return (plan as any).dbUuid;
    if (matchedDbPlan?.id) return matchedDbPlan.id;
    return (plan as any).dbUuid || plan.id;
  }, [plan.id, (plan as any).dbUuid, matchedDbPlan]);

  const isParticipantInPlan = useCallback(
    (pp: any) => {
      if (!pp) return false;
      if (targetPlanUuid && pp.plan_id === targetPlanUuid) return true;
      if (plan.id && pp.plan_id === plan.id) return true;
      if ((plan as any).dbUuid && pp.plan_id === (plan as any).dbUuid) return true;
      if (matchedDbPlan?.id && pp.plan_id === matchedDbPlan.id) return true;
      return false;
    },
    [targetPlanUuid, plan.id, (plan as any).dbUuid, matchedDbPlan]
  );

  const getParticipantRsvpStatus = useCallback(
    (m: any) => {
      const id = m.userId || m.userUuid || m.user_id || m.id || m.dbUuid;
      const dbPp = (dbPlanParticipants || []).find((pp: any) => {
        if (!isParticipantInPlan(pp)) return false;
        return (
          pp.user_id === id ||
          pp.user_id === m.userUuid ||
          pp.user_id === m.userId ||
          pp.user_id === m.user_id ||
          pp.user_id === m.dbUuid
        );
      });
      const rawStatus = dbPp ? dbPp.rsvp_status : m.joinState || m.rsvp_status;
      return normalizeStatus(rawStatus);
    },
    [dbPlanParticipants, isParticipantInPlan]
  );

  const activeInvitedAndJoinedCount = useMemo(() => {
    const visitedUserIds = new Set<string>();
    let count = 0;

    (members || []).forEach((m: any) => {
      const id = m.userId || m.userUuid || m.user_id || m.id || m.dbUuid;
      if (!id || visitedUserIds.has(id)) return;
      visitedUserIds.add(id);

      const status = getParticipantRsvpStatus(m);
      if (status === 'INVITED' || status === 'JOINED') {
        count++;
      }
    });

    (dbPlanParticipants || []).forEach((pp: any) => {
      if (!isParticipantInPlan(pp) || !pp.user_id || visitedUserIds.has(pp.user_id)) return;
      visitedUserIds.add(pp.user_id);

      const status = normalizeStatus(pp.rsvp_status);
      if (status === 'INVITED' || status === 'JOINED') {
        count++;
      }
    });

    return count;
  }, [members, dbPlanParticipants, isParticipantInPlan, getParticipantRsvpStatus]);

  const [showHostLeaveReplacementSheet, setShowHostLeaveReplacementSheet] = useState(false);
  const [hostReplacementMode, setHostReplacementMode] = useState<'leave' | 'stop_hosting'>('leave');
  const [isSubmittingHostReplacement, setIsSubmittingHostReplacement] = useState(false);

  const resolvedUserUuid = userProfile?.dbUuid || (userProfile as any)?.id || activeUserId || '';

  const activeHostMembers = useMemo(() => {
    return members.filter((m) => {
      const isHostRole = (m as any).role === 'HOST' || m.isHost === true;
      const status = normalizeStatus(m.joinState || (m as any).rsvp_status);
      return isHostRole && status === 'JOINED';
    });
  }, [members]);

  const isCallerHost = useMemo(() => {
    return activeHostMembers.some((h) => {
      const uId = h.userId || h.userUuid || (h as any).user_id || h.id || '';
      return Boolean(
        resolvedUserUuid &&
          (uId === resolvedUserUuid ||
            h.userUuid === resolvedUserUuid ||
            h.userId === resolvedUserUuid)
      );
    });
  }, [activeHostMembers, resolvedUserUuid]);

  const isSoleHost = isCallerHost && activeHostMembers.length <= 1;

  const eligibleHostReplacementParticipants = useMemo(() => {
    const activeHostIds = new Set(
      activeHostMembers.map((m) => m.userId || m.userUuid || (m as any).user_id || m.id || '')
    );

    return members
      .filter((m) => {
        const uId = m.userId || m.userUuid || (m as any).user_id || m.id || '';
        if (!uId || activeHostIds.has(uId)) return false;
        if (
          resolvedUserUuid &&
          (uId === resolvedUserUuid ||
            m.userUuid === resolvedUserUuid ||
            m.userId === resolvedUserUuid)
        )
          return false;
        const status = normalizeStatus(m.joinState || (m as any).rsvp_status);
        const role = (m as any).role || (m.isHost ? 'HOST' : 'PARTICIPANT');
        return role === 'PARTICIPANT' && status === 'JOINED';
      })
      .map((m) => {
        const uId = m.userId || m.userUuid || (m as any).user_id || m.id || '';
        return {
          id: uId,
          dbUuid: m.userUuid || uId,
          name: m.name || m.displayName || 'Participant',
          avatar: m.avatar || m.profile_photo || m.profile_photo_path || '',
          username: (m as any).username,
        };
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  }, [members, activeHostMembers, resolvedUserUuid]);

  const handleConfirmHostReplacement = useCallback(
    async (selectedReplacementId: string) => {
      setIsSubmittingHostReplacement(true);
      try {
        const planUuid = plan.dbUuid || plan.id;
        if (hostReplacementMode === 'stop_hosting') {
          await stopHostingWithReplacement(planUuid, selectedReplacementId);
          setShowHostLeaveReplacementSheet(false);
        } else {
          await requestHostLeaveWithReplacement(planUuid, selectedReplacementId);
          setShowHostLeaveReplacementSheet(false);
          onBack();
        }
      } catch (err: any) {
        console.error('[AssignedParticipantContainer] Host replacement failed:', err);
      } finally {
        setIsSubmittingHostReplacement(false);
      }
    },
    [
      plan.dbUuid,
      plan.id,
      hostReplacementMode,
      stopHostingWithReplacement,
      requestHostLeaveWithReplacement,
      onBack,
    ]
  );

  const handleLeavePlan = useCallback(() => {
    if (isCallerHost && isSoleHost) {
      setHostReplacementMode('leave');
      setShowHostLeaveReplacementSheet(true);
      return;
    }

    if (onLeavePlan) {
      onLeavePlan();
    } else if (onRemoveParticipant) {
      onRemoveParticipant(plan.id, resolvedUserUuid);
    }
  }, [isCallerHost, isSoleHost, onLeavePlan, onRemoveParticipant, plan.id, resolvedUserUuid]);

  // Staged session for unified Plan Size -> Participant Movement flow
  const [pendingCapacityAdjustmentSession, setPendingCapacityAdjustmentSession] = useState<{
    originalCapacity: number;
    targetCapacity: number;
    mode: 'promote' | 'demote';
    requiredCount: number;
    candidates: Friend[];
    selectedUserIds: string[];
    stagedUpdates: Array<{
      userId: string;
      originalRsvpStatus: string;
      targetRsvpStatus: 'INVITED' | 'JOINED' | 'WAITLISTED';
      targetAssignedGroup: 'GOING' | 'WAITLIST';
    }>;
  } | null>(null);

  const [reopenPlanSizeCapacity, setReopenPlanSizeCapacity] = useState<number | null>(null);
  const [localCapacity, setLocalCapacity] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    setLocalCapacity(undefined);
  }, [plan.plan_size, (plan as any).planSize, plan.capacity, plan.joinLimit]);

  const storedCapacity =
    localCapacity !== undefined
      ? localCapacity
      : plan.plan_size !== undefined
      ? plan.plan_size
      : (plan as any).planSize !== undefined
      ? (plan as any).planSize
      : plan.joinLimit !== undefined
      ? plan.joinLimit
      : plan.capacity !== undefined
      ? plan.capacity
      : null;
  const capacity: number | null =
    storedCapacity !== null && storedCapacity !== undefined
      ? Math.max(2, storedCapacity)
      : null;

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
  const targetUserId = userProfile?.dbUuid || (userProfile as any)?.id || activeUserId || '';

  useEffect(() => {
    if (!targetUserId) return;
    let isMounted = true;
    async function loadFreshFriends() {
      try {
        const canonicalFriends = await getCompleteCurrentUserFriends(targetUserId);
        if (isMounted) {
          setFetchedFriends(canonicalFriends);
        }
      } catch (err) {
        console.error('[AssignedParticipantContainer] Error fetching friends:', err);
      }
    }
    loadFreshFriends();
    return () => {
      isMounted = false;
    };
  }, [targetUserId, replaceTargetUserId, localReplaceTargetUserId]);

  const joinedParticipantUserIds = useMemo(() => {
    const set = new Set<string>();

    (dbPlanParticipants || []).forEach((pp: any) => {
      if (isParticipantInPlan(pp)) {
        const rsvp = typeof pp.rsvp_status === 'string' ? pp.rsvp_status.toUpperCase() : '';
        const group = typeof pp.assigned_group === 'string' ? pp.assigned_group.toUpperCase() : '';
        if (rsvp === 'JOINED' || rsvp === 'GOING') {
          if (pp.user_id) set.add(pp.user_id);
        } else if ((group === 'JOINED' || group === 'GOING') && rsvp !== 'SKIPPED') {
          if (pp.user_id) set.add(pp.user_id);
        }
      }
    });

    (members || []).forEach((m: any) => {
      const rsvp = normalizeStatus(m.joinState || m.rsvp_status);
      const rawGroup = m.assignedGroup || m.assigned_group;
      const group = typeof rawGroup === 'string' ? rawGroup.toUpperCase() : '';
      if (rsvp === 'JOINED') {
        const mId = m.userId || m.userUuid || m.user_id || m.id || m.dbUuid;
        if (mId) set.add(mId);
      } else if ((group === 'JOINED' || group === 'GOING') && rsvp !== 'SKIPPED') {
        const mId = m.userId || m.userUuid || m.user_id || m.id || m.dbUuid;
        if (mId) set.add(mId);
      }
    });

    return set;
  }, [dbPlanParticipants, members, isParticipantInPlan]);

  const disabledUserIds = useMemo(() => {
    const myUuid = userProfile?.dbUuid || (userProfile as any)?.id || activeUserId || '';
    const set = new Set<string>();
    if (myUuid) set.add(myUuid);
    if (userProfile?.user_id) set.add(userProfile.user_id);

    if (isReplacementMode) {
      joinedParticipantUserIds.forEach((id) => set.add(id));
      if (effectiveReplaceTargetUserId) set.add(effectiveReplaceTargetUserId);
    } else {
      (members || []).forEach((m: any) => {
        const status = normalizeStatus(m.joinState || m.rsvp_status);
        if (status === 'JOINED' || status === 'WAITLISTED' || status === 'INVITED') {
          const mId = m.userId || m.userUuid || m.user_id || m.id || m.dbUuid;
          if (mId) set.add(mId);
        }
      });
    }

    return set;
  }, [
    isReplacementMode,
    joinedParticipantUserIds,
    activeUserId,
    userProfile,
    effectiveReplaceTargetUserId,
    members,
  ]);

  const activeFriendList = useMemo(() => {
    if (fetchedFriends.length > 0) return fetchedFriends;
    return (friends || [])
      .map((f: any) => {
        const friendObj = f.friend || f;
        return {
          ...friendObj,
          id: friendObj?.id || friendObj?.dbUuid || friendObj?.user_id,
          full_name: friendObj?.full_name || friendObj?.name || friendObj?.displayName || '',
          profile_photo:
            friendObj?.profile_photo || friendObj?.profile_photo_path || friendObj?.avatar || '',
        };
      })
      .filter((u: any) => Boolean(u.id));
  }, [fetchedFriends, friends]);

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
          full_name: friendObj.full_name || friendObj.name || friendObj.displayName || '',
          profile_photo:
            friendObj.profile_photo || friendObj.profile_photo_path || friendObj.avatar || '',
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
          full_name: m.name || m.full_name || m.displayName || '',
          profile_photo: m.avatar || m.profile_photo || m.profile_photo_path || '',
        });
      }
    });

    return list;
  }, [activeFriendList, members]);

  const [showAddFriendsPicker, setShowAddFriendsPicker] = useState(false);
  const [searchPeopleQuery, setSearchPeopleQuery] = useState('');
  const [individuallySelectedFriendIds, setIndividuallySelectedFriendIds] = useState<string[]>([]);
  const [pickerSelectedFriends, setPickerSelectedFriends] = useState<any[]>([]);

  useEffect(() => {
    const usersToSet = individuallySelectedFriendIds
      .map((id) => {
        const u = candidateUsers.find((x) => x.id === id);
        if (u) {
          return {
            id: u.id,
            name: u.full_name,
            avatar: u.profile_photo || (u as any).profile_url || '',
          };
        }
        return null;
      })
      .filter(Boolean);
    setPickerSelectedFriends(usersToSet);
  }, [individuallySelectedFriendIds, candidateUsers]);

  const AVAILABLE_FRIENDS = useMemo(() => {
    const myUuid = userProfile?.dbUuid || (userProfile as any)?.id || activeUserId || '';
    const seenIds = new Set<string>();
    return candidateUsers
      .filter((u) => u.id && u.id !== myUuid && u.id !== userProfile?.user_id && !disabledUserIds.has(u.id))
      .filter((u) => {
        if (!u.id || seenIds.has(u.id)) return false;
        seenIds.add(u.id);
        return true;
      })
      .map((u) => ({
        id: u.id || '',
        dbUuid: u.id,
        name: u.full_name || u.name || '',
        avatar: u.profile_photo || u.profile_photo_path || u.avatar || '',
      }));
  }, [candidateUsers, userProfile, activeUserId, disabledUserIds]);

  const pendingLeaveRequests = useMemo(() => {
    const fromDbParts = dbPlanParticipants
      .filter((pp) => isParticipantInPlan(pp) && pp.leave_requested === true && pp.rsvp_status === 'JOINED')
      .map((pp) => {
        const foundMember = members.find(
          (m) => (m.userId || m.userUuid || m.user_id || m.id || m.dbUuid) === pp.user_id
        );
        const foundFriend = candidateUsers.find((u) => u.id === pp.user_id);
        return {
          id: pp.user_id,
          dbUuid: pp.user_id,
          name: foundMember?.name || foundMember?.full_name || foundFriend?.full_name || 'Participant',
          avatar: foundMember?.avatar || foundMember?.profile_photo || foundFriend?.profile_photo || '',
          leaveRequestedAt: pp.leave_requested_at,
        };
      });

    if (fromDbParts.length > 0) return fromDbParts;
    if (dbPlanParticipants.length > 0) return [];

    return members
      .filter(
        (m) =>
          (m.leave_requested === true || (m as any).leaveRequested === true) &&
          (m.rsvp_status === 'JOINED' || m.rsvp_status === 'GOING')
      )
      .map((m) => {
        const userId = m.userId || m.userUuid || m.user_id || m.id || m.dbUuid;
        const foundFriend = candidateUsers.find((u) => u.id === userId);
        return {
          id: userId,
          dbUuid: userId,
          name: m.name || m.full_name || foundFriend?.full_name || 'Participant',
          avatar: m.avatar || m.profile_photo || foundFriend?.profile_photo || '',
          leaveRequestedAt: m.leave_requested_at || (m as any).leaveRequestedAt || null,
        };
      });
  }, [dbPlanParticipants, isParticipantInPlan, members, candidateUsers]);

  const handleKeepPaymentLeaveParticipant = useCallback(
    async (targetLeaveUserId: string) => {
      if (!resolvePaidPlanLeaveRequest) return;
      try {
        await resolvePaidPlanLeaveRequest(plan.id, targetLeaveUserId, 'KEEP_PAYMENT');
      } catch (err: any) {
        console.error('[AssignedParticipantContainer handleKeepPaymentLeaveParticipant] Error:', err);
      }
    },
    [resolvePaidPlanLeaveRequest, plan.id]
  );

  const handleReplaceLeaveParticipant = useCallback((targetLeaveUserId: string) => {
    setLocalReplaceTargetUserId(targetLeaveUserId);
    setIndividuallySelectedFriendIds([]);
    setShowAddFriendsPicker(true);
  }, []);

  const handleInviteSkipped = useCallback(
    async (friend: Friend, target?: 'GOING' | 'WAITLIST') => {
      if (!onAddParticipants) return;
      const userId = friend.dbUuid || friend.id;
      try {
        if (target === 'GOING' && onUpdatePlanCapacity) {
          const currentCapacity = Math.max(2, plan.joinLimit || plan.capacity || 2);
          const newCapacity = currentCapacity + 1;
          await onUpdatePlanCapacity(plan.id, newCapacity, { autoPromote: false });
        }
        await onAddParticipants(plan.id, [userId], target);
      } catch (err: any) {
        console.error('[AssignedParticipantContainer handleInviteSkipped] error:', err);
      }
    },
    [onAddParticipants, onUpdatePlanCapacity, plan.id, plan.joinLimit, plan.capacity]
  );

  const mockForm = useMemo(() => {
    return {
      searchPeopleQuery,
      setSearchPeopleQuery,
      selectedFriends: pickerSelectedFriends,
      toggleFriendSelection: (friend: any) => {
        if (isReplacementMode) {
          setIndividuallySelectedFriendIds((prev) => (prev.includes(friend.id) ? [] : [friend.id]));
        } else {
          setIndividuallySelectedFriendIds((prev) =>
            prev.includes(friend.id) ? prev.filter((id) => id !== friend.id) : [...prev, friend.id]
          );
        }
      },
      waitlistEnabled: false,
      setWaitlistEnabled: () => {},
      totalCapacity: 0,
      setTotalCapacity: () => {},
      totalInvitedCount: pickerSelectedFriends.length,
      handleRemoveSelectedItem: (item: any) => {
        setIndividuallySelectedFriendIds((prev) => prev.filter((id) => id !== item.id));
      },
      AVAILABLE_FRIENDS,
      userProfile: {
        dbUuid: userProfile.dbUuid || '',
        name: userProfile.name || 'You',
        avatar: userProfile.avatar || '',
      },
      activeUserId,
      isHostSelected: false,
      setIsHostSelected: () => {},
      localTitle: plan.title,
      localLocation: plan.location || '',
      eventDateTime: plan.datetime ? new Date(plan.datetime) : new Date(),
      customCoverImage: plan.coverImage,
    };
  }, [
    searchPeopleQuery,
    pickerSelectedFriends,
    AVAILABLE_FRIENDS,
    userProfile,
    activeUserId,
    plan,
    isReplacementMode,
  ]);

  const [addFriendsTargetTab, setAddFriendsTargetTab] = useState<'GOING' | 'WAITLIST'>('GOING');
  const [pendingCapacityInvite, setPendingCapacityInvite] = useState<{
    friendIds: string[];
    selectedCount: number;
    targetGroup: 'GOING' | 'WAITLIST';
    currentGoingCount: number;
    capacity: number;
    availableSlots: number;
  } | null>(null);

  const executeInviteFlow = async (friendIds: string[], targetGroup?: 'GOING' | 'WAITLIST') => {
    if (!onAddParticipants) return;
    setShowAddFriendsPicker(false);
    setSearchPeopleQuery('');
    setIndividuallySelectedFriendIds([]);
    try {
      await onAddParticipants(plan.id, friendIds, targetGroup);
    } catch (err: any) {
      console.error('[AssignedParticipantContainer executeInviteFlow] Add error:', err);
    }
  };

  const handleConfirmInvite = async () => {
    if (!canInvite) return;
    const friendIds = individuallySelectedFriendIds.filter((id) => !disabledUserIds.has(id));
    if (friendIds.length === 0) return;

    if (effectiveReplaceTargetUserId) {
      const targetId = effectiveReplaceTargetUserId;
      const replacementId = friendIds[0];
      const targetMember = allPlanMembers.find((m) => (m.dbUuid || m.id) === targetId);
      const isActualLeaveRequest = Boolean(targetMember?.leave_requested);

      try {
        if (isActualLeaveRequest && resolvePaidPlanLeaveRequest) {
          await resolvePaidPlanLeaveRequest(plan.id, targetId, 'REPLACED', replacementId);
        } else if (onConfirmReplacement) {
          await onConfirmReplacement(plan.id, targetId, replacementId);
        } else if (replaceParticipant) {
          await replaceParticipant(plan.id, targetId, replacementId);
        } else if (onRemoveAndReplaceWithWaitlist) {
          await onRemoveAndReplaceWithWaitlist(plan.id, targetId, replacementId);
        }
        setIndividuallySelectedFriendIds([]);
        setLocalReplaceTargetUserId(null);
        if (onCancelReplacement) {
          onCancelReplacement();
        } else {
          setShowAddFriendsPicker(false);
        }
      } catch (err: any) {
        console.error('[AssignedParticipantContainer handleConfirmInvite] Replacement error:', err);
      }
      return;
    }

    const targetGroup =
      !effectiveIsHost && canParticipantInvite ? 'WAITLIST' : addFriendsTargetTab;

    if (targetGroup === 'GOING' && capacity > 0) {
      const currentGoingCount = goingMembers.length;
      const availableSlots = Math.max(0, capacity - currentGoingCount);
      if (friendIds.length > availableSlots) {
        setPendingCapacityInvite({
          friendIds,
          selectedCount: friendIds.length,
          targetGroup,
          currentGoingCount,
          capacity,
          availableSlots,
        });
        return;
      }
    }

    try {
      await executeInviteFlow(friendIds, targetGroup);
    } catch (err: any) {
      console.error('[AssignedParticipantContainer handleConfirmInvite] error:', err);
    }
  };

  const handleIncreaseCapacityAndInvite = async () => {
    if (!pendingCapacityInvite) return;
    const { friendIds, currentGoingCount } = pendingCapacityInvite;
    const newCapacity = currentGoingCount + friendIds.length;

    setPendingCapacityInvite(null);

    try {
      if (onUpdatePlanCapacity) {
        await onUpdatePlanCapacity(plan.id, newCapacity, { autoPromote: false });
      }
      await executeInviteFlow(friendIds, 'GOING');
    } catch (err: any) {
      console.error('[AssignedParticipantContainer handleIncreaseCapacityAndInvite] error:', err);
    }
  };

  const handleInviteToWaitlistInstead = async () => {
    if (!pendingCapacityInvite) return;
    const { friendIds } = pendingCapacityInvite;
    try {
      setPendingCapacityInvite(null);
      await executeInviteFlow(friendIds, 'WAITLIST');
    } catch (err: any) {
      console.error('[AssignedParticipantContainer handleInviteToWaitlistInstead] error:', err);
    }
  };

  const handleCancelCapacityDialog = () => {
    setPendingCapacityInvite(null);
  };

  const allPlanMembers = useMemo(() => {
    const seenMemberIds = new Set<string>();
    const list: any[] = [];
    const planDbRows = (dbPlanParticipants || []).filter(isParticipantInPlan);
    const hasDbParticipants = planDbRows.length > 0;

    members.forEach((m) => {
      const mId = m.userId || m.userUuid || m.user_id || m.id || m.dbUuid;
      if (!mId || seenMemberIds.has(mId)) return;
      if (hasDbParticipants && !planDbRows.some((pp: any) => pp.user_id === mId)) {
        return;
      }
      seenMemberIds.add(mId);
      list.push(m);
    });

    planDbRows.forEach((pp: any) => {
      const uId = pp.user_id;
      if (uId && !seenMemberIds.has(uId)) {
        seenMemberIds.add(uId);
        const foundCandidate = candidateUsers.find((u: any) => u.id === uId);
        const foundFriend = (AVAILABLE_FRIENDS || []).find((f: any) => f.id === uId);
        const foundStoreFriend = (friends || []).find(
          (f: any) => f.id === uId || (f as any).dbUuid === uId
        );
        const foundFetched = (fetchedFriends || []).find(
          (f: any) => f.id === uId || (f as any).dbUuid === uId
        );

        const name =
          pp.user_profile?.full_name ||
          foundCandidate?.full_name ||
          (foundFriend as any)?.name ||
          (foundStoreFriend as any)?.name ||
          (foundFetched as any)?.name ||
          'Participant';
        const avatar =
          pp.user_profile?.profile_photo ||
          (foundCandidate as any)?.profile_photo ||
          (foundFriend as any)?.avatar ||
          (foundStoreFriend as any)?.avatar ||
          (foundFetched as any)?.avatar ||
          '';

        list.push({
          userId: uId,
          userUuid: uId,
          name,
          avatar,
          role: pp.role || 'PARTICIPANT',
          isHost: pp.role === 'HOST',
          joinState: normalizeStatus(pp.rsvp_status),
          assignedGroup: pp.assigned_group || null,
          waitlistPosition: pp.waitlist_position ?? null,
          leave_requested: pp.leave_requested,
          leave_requested_at: pp.leave_requested_at,
          rsvp_status: pp.rsvp_status,
          skip_reason: pp.skip_reason,
          joined_queue_at: pp.joined_queue_at || null,
          joinedQueueAt: pp.joined_queue_at || null,
          joinedAt: pp.responded_at || pp.created_at,
          created_at: pp.created_at,
          updated_at: pp.updated_at,
        });
      }
    });

    return list;
  }, [
    members,
    dbPlanParticipants,
    isParticipantInPlan,
    candidateUsers,
    friends,
    fetchedFriends,
    AVAILABLE_FRIENDS,
  ]);

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

  const allowParticipantsToInviteOthers = Boolean(
    plan.allowParticipantInvites === true || (plan as any).allow_participant_invites === true
  );
  const isEligibleParticipantRsvp =
    currentParticipantRsvp === 'JOINED' || currentParticipantRsvp === 'WAITLISTED';
  const canParticipantInvite =
    allowParticipantsToInviteOthers && isEligibleParticipantRsvp && !effectiveIsHost;
  const canInvite = effectiveIsHost || canParticipantInvite;

  const sortByWaitlistOrder = useCallback((list: Friend[]) => {
    return [...list].sort((a, b) => {
      const posA = a.waitlistPosition ?? Number.MAX_SAFE_INTEGER;
      const posB = b.waitlistPosition ?? Number.MAX_SAFE_INTEGER;
      if (posA !== posB) return posA - posB;

      const isAWaitlisted = a.rsvpStatus === 'WAITLISTED';
      const isBWaitlisted = b.rsvpStatus === 'WAITLISTED';
      const isARejoined = a.rsvpStatus === 'REJOINED';
      const isBRejoined = b.rsvpStatus === 'REJOINED';

      if (isAWaitlisted && !isBWaitlisted) return -1;
      if (!isAWaitlisted && isBWaitlisted) return 1;

      if (isARejoined && !isBRejoined) return -1;
      if (!isARejoined && isBRejoined) return 1;

      const queueA = a.joinedQueueAt ? new Date(a.joinedQueueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const queueB = b.joinedQueueAt ? new Date(b.joinedQueueAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (queueA !== queueB) return queueA - queueB;
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });
  }, []);

  const prioritizeCurrentUserAndSort = useCallback(
    (list: Friend[]) => {
      return formatAssignedGoingList(list, activeUserId);
    },
    [activeUserId]
  );

  const isCompletedPlan = (plan.status || '').toUpperCase() === 'COMPLETED';

  const totalActiveParticipants = useMemo(() => {
    return allPlanMembers.filter(
      (m) => normalizeStatus(m.joinState || (m as any).rsvp_status) !== 'SKIPPED'
    ).length;
  }, [allPlanMembers]);

  const maxCapacity = Math.max(storedCapacity, Math.max(2, totalActiveParticipants));

  const goingMembers = useMemo(() => {
    return allPlanMembers.filter((m) => {
      const id = m.userUuid || m.userId || m.user_id || m.id || m.dbUuid;
      const dbPp = dbPlanParticipants.find(
        (pp: any) =>
          isParticipantInPlan(pp) &&
          (pp.user_id === id ||
            pp.user_id === m.userUuid ||
            pp.user_id === m.userId ||
            pp.user_id === m.user_id ||
            pp.user_id === m.dbUuid)
      );
      const status = dbPp
        ? normalizeStatus(dbPp.rsvp_status)
        : normalizeStatus(m.joinState || m.rsvp_status);
      const dbGroup = dbPp?.assigned_group;
      const rawMGroup = (m as any).assignedGroup || (m as any).assigned_group;
      const group =
        typeof dbGroup === 'string'
          ? dbGroup.toUpperCase()
          : typeof rawMGroup === 'string'
          ? rawMGroup.toUpperCase()
          : '';

      if (isCompletedPlan) {
        const finalState = getMemberFinalState(m) || (dbPp ? getMemberFinalState(dbPp) : null);
        const isAttended =
          finalState === 'JOINED' ||
          (finalState === null && (status === 'JOINED' || group === 'GOING' || group === 'JOINED'));
        return isAttended;
      }

      if (status === 'SKIPPED' || status === 'REJOINED') return false;

      return group === 'GOING' || group === 'JOINED' || (!group && status === 'JOINED');
    });
  }, [allPlanMembers, dbPlanParticipants, isParticipantInPlan, isCompletedPlan]);

  const waitlistMembers = useMemo(() => {
    if (isCompletedPlan) return [];
    return allPlanMembers.filter((m) => {
      const id = m.userUuid || m.userId || m.user_id || m.id || m.dbUuid;
      const dbPp = dbPlanParticipants.find(
        (pp: any) =>
          isParticipantInPlan(pp) &&
          (pp.user_id === id ||
            pp.user_id === m.userUuid ||
            pp.user_id === m.userId ||
            pp.user_id === m.user_id ||
            pp.user_id === m.dbUuid)
      );
      const status = dbPp
        ? normalizeStatus(dbPp.rsvp_status)
        : normalizeStatus(m.joinState || m.rsvp_status);
      if (status === 'SKIPPED' || status === 'REJOINED') return false;

      const dbGroup = dbPp?.assigned_group;
      const rawMGroup = (m as any).assignedGroup || (m as any).assigned_group;
      const group =
        typeof dbGroup === 'string'
          ? dbGroup.toUpperCase()
          : typeof rawMGroup === 'string'
          ? rawMGroup.toUpperCase()
          : '';
      return group === 'WAITLIST' || group === 'WAITLISTED' || (!group && status === 'WAITLISTED');
    });
  }, [allPlanMembers, dbPlanParticipants, isParticipantInPlan, isCompletedPlan]);

  const rawGoingList: Friend[] = useMemo(() => {
    return goingMembers.map((m) =>
      memberToAssignedFriend(
        m,
        hostId,
        activeUserId || '',
        dbPlanParticipants,
        targetPlanUuid,
        (plan as any).dbUuid,
        plan.id
      )
    );
  }, [goingMembers, hostId, activeUserId, dbPlanParticipants, targetPlanUuid, (plan as any).dbUuid, plan.id]);

  const rawWaitlistList: Friend[] = useMemo(() => {
    return waitlistMembers.map((m) =>
      memberToAssignedFriend(
        m,
        hostId,
        activeUserId || '',
        dbPlanParticipants,
        targetPlanUuid,
        (plan as any).dbUuid,
        plan.id
      )
    );
  }, [waitlistMembers, hostId, activeUserId, dbPlanParticipants, targetPlanUuid, (plan as any).dbUuid, plan.id]);

  const goingList: Friend[] = useMemo(() => {
    return prioritizeCurrentUserAndSort(rawGoingList);
  }, [rawGoingList, prioritizeCurrentUserAndSort]);

  const waitlistList: Friend[] = useMemo(() => {
    const sorted = sortByWaitlistOrder(rawWaitlistList);
    return formatAssignedWaitlist(sorted, activeUserId);
  }, [rawWaitlistList, activeUserId, sortByWaitlistOrder]);

  const skippedList: Friend[] = useMemo(() => {
    const rawSkipped = allPlanMembers
      .filter((m) => {
        const id = m.userUuid || m.userId || m.user_id || m.id || m.dbUuid;
        const dbPp = dbPlanParticipants.find(
          (pp: any) =>
            isParticipantInPlan(pp) &&
            (pp.user_id === id ||
              pp.user_id === m.userUuid ||
              pp.user_id === m.userId ||
              pp.user_id === m.user_id ||
              pp.user_id === m.dbUuid)
        );
        const status = dbPp
          ? normalizeStatus(dbPp.rsvp_status)
          : normalizeStatus(m.joinState || m.rsvp_status);
        const dbGroup = dbPp?.assigned_group;
        const rawMGroup = (m as any).assignedGroup || (m as any).assigned_group;
        const group =
          typeof dbGroup === 'string'
            ? dbGroup.toUpperCase()
            : typeof rawMGroup === 'string'
            ? rawMGroup.toUpperCase()
            : '';

        if (isCompletedPlan) {
          const finalState = getMemberFinalState(m) || (dbPp ? getMemberFinalState(dbPp) : null);
          const isAttended =
            finalState === 'JOINED' ||
            (finalState === null && (status === 'JOINED' || group === 'GOING' || group === 'JOINED'));
          return !isAttended;
        }

        return status === 'SKIPPED' || status === 'REJOINED';
      })
      .map((m) =>
        memberToAssignedFriend(
          m,
          hostId,
          activeUserId || '',
          dbPlanParticipants,
          targetPlanUuid,
          (plan as any).dbUuid,
          plan.id
        )
      );
    return prioritizeCurrentUserAndSort(rawSkipped);
  }, [allPlanMembers, hostId, activeUserId, dbPlanParticipants, isParticipantInPlan, targetPlanUuid, (plan as any).dbUuid, plan.id, prioritizeCurrentUserAndSort, isCompletedPlan]);

  const initialTab: 'going' | 'waitlist' | 'invited' = useMemo(() => {
    if (!activeUserId) return 'going';
    const currentMember = allPlanMembers.find((m) => {
      const mId = m.userId || m.userUuid || m.user_id || m.id;
      return mId === activeUserId;
    });
    if (!currentMember || isCompletedPlan) return 'going';
    const group = (currentMember as any).assignedGroup || (currentMember as any).assigned_group;
    return group === 'WAITLIST' ? 'waitlist' : 'going';
  }, [allPlanMembers, activeUserId, isCompletedPlan]);

  const eventDateObj = plan.datetime ? new Date(plan.datetime) : null;
  const formattedDate = eventDateObj
    ? eventDateObj.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })
    : undefined;
  const formattedTime = eventDateObj
    ? eventDateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : undefined;

  const [localGoingList, setLocalGoingList] = useState<Friend[] | null>(null);
  const [localWaitlist, setLocalWaitlist] = useState<Friend[] | null>(null);

  const handleMoveToGoing = useCallback(
    async (friend: Friend) => {
      const isRejoined =
        friend.rsvpStatus === 'REJOINED' || (friend as any).rsvp_status === 'REJOINED';
      if (isRejoined) {
        await handleRejoinAddToJoined(friend);
        return;
      }

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
        console.error('[AssignedParticipantContainer handleMoveToGoing] error:', err);
      } finally {
        setLocalGoingList(null);
        setLocalWaitlist(null);
      }
    },
    [plan.id, capacity, goingMembers.length, onMoveToGoing]
  );

  const [pendingPromoteToGoing, setPendingPromoteToGoing] = useState<Friend | null>(null);

  const handleCancelPendingPromote = useCallback(() => {
    setPendingPromoteToGoing(null);
  }, []);

  const handleConfirmPendingPromote = useCallback(async () => {
    if (!pendingPromoteToGoing) return;
    const friend = pendingPromoteToGoing;
    const newCap = Math.max(capacity + 1, goingMembers.length + 1);
    const clampedVal = Math.min(maxCapacity, Math.max(2, newCap));

    setPendingPromoteToGoing(null);

    try {
      if (onUpdatePlanCapacity) {
        await onUpdatePlanCapacity(plan.id, clampedVal, { autoPromote: false });
      }
      setLocalGoingList(null);
      setLocalWaitlist(null);
      await onMoveToGoing(plan.id, friend.dbUuid || friend.id, {
        bypassCapacityCheck: true,
      });
    } catch (err: any) {
      console.error('[AssignedParticipantContainer handleConfirmPendingPromote] error:', err);
    } finally {
      setLocalGoingList(null);
      setLocalWaitlist(null);
    }
  }, [
    pendingPromoteToGoing,
    capacity,
    goingMembers.length,
    maxCapacity,
    onUpdatePlanCapacity,
    plan.id,
    onMoveToGoing,
  ]);

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
    if (!pendingMoveToWaitlist) return;
    const friend = pendingMoveToWaitlist;
    const targetCapacity = Math.max(2, capacity - 1);

    setPendingMoveToWaitlist(null);

    try {
      if (onUpdatePlanCapacity) {
        await onUpdatePlanCapacity(plan.id, targetCapacity);
      }
      setLocalGoingList(null);
      setLocalWaitlist(null);
      await onMoveToWaitlist(plan.id, friend.dbUuid || friend.id);
    } catch (err: any) {
      console.error('[AssignedParticipantContainer handleConfirmDecreaseCapacityForWaitlist] error:', err);
    } finally {
      setLocalGoingList(null);
      setLocalWaitlist(null);
    }
  }, [
    pendingMoveToWaitlist,
    capacity,
    onUpdatePlanCapacity,
    plan.id,
    onMoveToWaitlist,
  ]);

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
        setSwapState({ type: 'swap', targetFriend: friend });
      } else {
        setPendingMoveToWaitlist(friend);
      }
    },
    [goingMembers.length, waitlistList.length]
  );

  const [pendingRemoveGoing, setPendingRemoveGoing] = useState<Friend | null>(null);
  const [isForcedDecreaseRemoval, setIsForcedDecreaseRemoval] = useState(false);

  const handleCancelPendingRemoveGoing = useCallback(() => {
    setPendingRemoveGoing(null);
    setIsForcedDecreaseRemoval(false);
  }, []);

  const handleConfirmDecreaseCapacityForRemoveGoing = useCallback(async () => {
    if (!pendingRemoveGoing || !onUpdatePlanCapacity) return;
    const friend = pendingRemoveGoing;
    const targetCapacity = Math.max(2, capacity - 1);
    setPendingRemoveGoing(null);
    setIsForcedDecreaseRemoval(false);

    try {
      await onUpdatePlanCapacity(plan.id, targetCapacity);
      await onRemoveParticipant(plan.id, friend.dbUuid || friend.id);
    } catch (err: any) {
      console.error('[AssignedParticipantContainer handleConfirmDecreaseCapacityForRemoveGoing] error:', err);
    }
  }, [pendingRemoveGoing, capacity, onUpdatePlanCapacity, plan.id, onRemoveParticipant]);

  const handleConfirmRemoveGoingDirect = useCallback(async () => {
    if (!pendingRemoveGoing) return;
    const friend = pendingRemoveGoing;
    setPendingRemoveGoing(null);
    setIsForcedDecreaseRemoval(false);

    try {
      await onRemoveParticipant(plan.id, friend.dbUuid || friend.id);
    } catch (err: any) {
      console.error('[AssignedParticipantContainer handleConfirmRemoveGoingDirect] error:', err);
    }
  }, [pendingRemoveGoing, plan.id, onRemoveParticipant]);

  const handleOpenRemoveGoingReplacePickerFull = useCallback(() => {
    if (!pendingRemoveGoing) return;
    const userId = pendingRemoveGoing.dbUuid || pendingRemoveGoing.id;
    setPendingRemoveGoing(null);
    setIsForcedDecreaseRemoval(false);
    setLocalReplaceTargetUserId(userId);
    setIndividuallySelectedFriendIds([]);
    setShowAddFriendsPicker(true);
  }, [pendingRemoveGoing]);

  const handleRemoveParticipant = useCallback(
    async (friend: Friend) => {
      const friendId = friend.dbUuid || friend.id;
      const isSelfFriend = Boolean(
        friend.name === 'You' ||
          (resolvedUserUuid &&
            (friendId === resolvedUserUuid ||
              friend.id === resolvedUserUuid ||
              friend.dbUuid === resolvedUserUuid)) ||
          (userProfile?.user_id &&
            (friend.id === userProfile.user_id || friend.dbUuid === userProfile.user_id))
      );

      if (isSelfFriend) {
        handleLeavePlan();
        return;
      }

      const isGoing = goingList.some((g) => (g.dbUuid || g.id) === friendId);
      if (isGoing) {
        setPendingRemoveGoing(friend);
        return;
      }

      try {
        await onRemoveParticipant(plan.id, friendId);
      } catch {
        setLocalCapacity(null);
      }
    },
    [
      plan.id,
      goingList,
      onRemoveParticipant,
      resolvedUserUuid,
      userProfile?.user_id,
      handleLeavePlan,
    ]
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
          await onAddParticipants(plan.id, [friendId]);
        }
      } catch (err: any) {
        console.error('[AssignedParticipantContainer handleMoveToInvited] error:', err);
      } finally {
        setLocalGoingList(null);
        setLocalWaitlist(null);
      }
    },
    [plan.id, onMoveToInvited, onAddParticipants]
  );

  const handleRejoinAddToJoined = useCallback(
    async (friend: Friend) => {
      const friendId = friend.dbUuid || friend.id;
      try {
        await resolveRejoinedParticipant(plan.id, friendId, 'JOINED');
      } catch (err: any) {
        console.error('[AssignedParticipantContainer handleRejoinAddToJoined] error:', err);
      }
    },
    [plan.id, resolveRejoinedParticipant]
  );

  const handleRejoinAddToWaitlist = useCallback(
    async (friend: Friend) => {
      const friendId = friend.dbUuid || friend.id;
      try {
        await resolveRejoinedParticipant(plan.id, friendId, 'WAITLIST');
      } catch (err: any) {
        console.error('[AssignedParticipantContainer handleRejoinAddToWaitlist] error:', err);
      }
    },
    [plan.id, resolveRejoinedParticipant]
  );

  const handleRejoinRemoveFromPlan = useCallback(
    async (friend: Friend) => {
      const friendId = friend.dbUuid || friend.id;
      try {
        await resolveRejoinedParticipant(plan.id, friendId, 'REMOVE');
      } catch (err: any) {
        console.error('[AssignedParticipantContainer handleRejoinRemoveFromPlan] error:', err);
      }
    },
    [plan.id, resolveRejoinedParticipant]
  );

  const handleConfirmSwap = useCallback(
    async (selectedUserIds: string[]) => {
      if (!swapState || selectedUserIds.length === 0) return;
      const { type, targetFriend } = swapState;
      const selectedUserId = selectedUserIds[0];
      const targetUserId = targetFriend.dbUuid || targetFriend.id;

      if (!targetUserId || !selectedUserId) {
        console.error('[AssignedParticipantContainer handleConfirmSwap] Missing participant IDs', {
          targetUserId,
          selectedUserId,
        });
        return;
      }

      setLocalGoingList(null);
      setLocalWaitlist(null);
      try {
        if (type === 'swap') {
          if (!onSwapParticipants) throw new Error('swap is not supported');
          await onSwapParticipants(plan.id, targetUserId, selectedUserId);
        } else if (type === 'swap_incoming') {
          if (!onSwapParticipants) throw new Error('swap is not supported');
          await onSwapParticipants(plan.id, selectedUserId, targetUserId);
        } else {
          if (!onRemoveAndReplaceWithWaitlist) throw new Error('remove-and-replace is not supported');
          await onRemoveAndReplaceWithWaitlist(plan.id, targetUserId, selectedUserId);
        }
        setSwapState(null);
      } catch (err: any) {
        console.error('[AssignedParticipantContainer handleConfirmSwap] Error:', err);
      } finally {
        setLocalGoingList(null);
        setLocalWaitlist(null);
      }
    },
    [swapState, plan.id, onSwapParticipants, onRemoveAndReplaceWithWaitlist]
  );

  const handlePromoteHost = useCallback(
    async (friend: Friend) => {
      if (!onPromoteToHost) return;
      const targetId =
        friend.dbUuid || friend.id || (friend as any).user_id || (friend as any).userId || '';
      if (!targetId) return;

      const memberRecord = members.find(
        (m: any) => (m.userId || m.userUuid || m.user_id || m.id) === targetId
      );

      const targetStatus = normalizeStatus(
        friend.rsvpStatus ||
          (friend as any).rsvp_status ||
          (friend as any).joinState ||
          memberRecord?.rsvp_status ||
          memberRecord?.joinState ||
          'INVITED'
      );
      const targetRole = memberRecord?.role || (friend.isHost ? 'HOST' : 'PARTICIPANT');

      const isAlreadyHost = friend.isHost || targetRole === 'HOST';
      if (isAlreadyHost || targetStatus !== 'JOINED') return;

      try {
        await onPromoteToHost(plan.id, targetId);
      } catch {}
    },
    [plan.id, onPromoteToHost, members]
  );

  const handleDemoteHost = useCallback(
    async (friend: Friend) => {
      const friendId = friend.dbUuid || friend.id;
      const isSelfFriend = Boolean(
        friend.name === 'You' ||
          (resolvedUserUuid &&
            (friendId === resolvedUserUuid ||
              friend.id === resolvedUserUuid ||
              friend.dbUuid === resolvedUserUuid)) ||
          (userProfile?.user_id &&
            (friend.id === userProfile.user_id || friend.dbUuid === userProfile.user_id))
      );

      if (isSelfFriend && isSoleHost) {
        setHostReplacementMode('stop_hosting');
        setShowHostLeaveReplacementSheet(true);
        return;
      }

      if (!onDemoteFromHost) return;
      try {
        await onDemoteFromHost(plan.id, friendId);
      } catch (err: any) {
        console.error('[AssignedParticipantContainer handleDemoteHost] error:', err);
      }
    },
    [plan.id, onDemoteFromHost, resolvedUserUuid, userProfile?.user_id, isSoleHost]
  );

  const [guidedAdjustmentState, setGuidedAdjustmentState] = useState<{
    mode: 'promote' | 'demote';
    targetCapacity: number;
    requiredCount: number;
    candidates: Friend[];
  } | null>(null);

  const commitStagedCapacityAndParticipants = useCallback(
    async (
      targetCap: number,
      mode: 'promote' | 'demote',
      selectedUserIds: string[]
    ) => {
      if (!onUpdatePlanCapacity) return;

      setLocalGoingList(null);
      setLocalWaitlist(null);

      if (mode === 'promote') {
        await onUpdatePlanCapacity(plan.id, targetCap, {
          autoPromote: false,
        });
        for (const uId of selectedUserIds) {
          await onMoveToGoing(plan.id, uId, { bypassCapacityCheck: true });
        }
      } else if (mode === 'demote') {
        for (const uId of selectedUserIds) {
          await onMoveToWaitlist(plan.id, uId);
        }
        await onUpdatePlanCapacity(plan.id, targetCap, {
          autoPromote: false,
        });
      }
    },
    [onUpdatePlanCapacity, plan.id, onMoveToGoing, onMoveToWaitlist]
  );

  const handleWaitlistModeChange = useCallback(
    async (mode: 'automatic' | 'assigned') => {
      if (onWaitlistModeChange) {
        await onWaitlistModeChange(mode);
        return;
      }
      try {
        await updatePlanDetails(plan.id, {
          participant_filtering: mode === 'assigned' ? 'ASSIGNED' : 'AUTOMATIC',
        });
      } catch (err: any) {
        console.error('[AssignedParticipantContainer] Error changing waitlist mode:', err);
      }
    },
    [onWaitlistModeChange, updatePlanDetails, plan.id]
  );

  const handleAdjustCapacity = useCallback(
    async (newVal: number | null) => {
      if (!onUpdatePlanCapacity) return;

      if (newVal === null || newVal === undefined) {
        if (capacity === null) return;
        setLocalCapacity(null);
        try {
          await onUpdatePlanCapacity(plan.id, null, { autoPromote: false });
        } catch (err: any) {
          console.error('[AssignedParticipantContainer handleAdjustCapacity] Error updating capacity to null:', err);
        }
        return;
      }

      const clampedVal = Math.min(maxCapacity, Math.max(2, newVal));
      if (clampedVal === capacity) return;

      // DO NOT call setLocalCapacity(clampedVal) here.
      // Capacity changes must be treated as pending until required participant movement is confirmed.

      if (clampedVal > (capacity ?? 2)) {
        const rawWaitlist = localWaitlist || waitlistList;
        const goingUserIds = new Set(goingList.map((g) => g.dbUuid || g.id));
        const eligibleWaitlist = rawWaitlist.filter((w) => !goingUserIds.has(w.dbUuid || w.id));
        const availableSpots = clampedVal - goingList.length;
        const requiredCount = Math.min(availableSpots, eligibleWaitlist.length);

        if (availableSpots > 0 && requiredCount > 0) {
          setPendingCapacityAdjustmentSession({
            originalCapacity: capacity ?? 2,
            targetCapacity: clampedVal,
            mode: 'promote',
            requiredCount,
            candidates: eligibleWaitlist,
            selectedUserIds: [],
            stagedUpdates: [],
          });
          setGuidedAdjustmentState({
            mode: 'promote',
            targetCapacity: clampedVal,
            requiredCount,
            candidates: eligibleWaitlist,
          });
          return;
        }

        setLocalCapacity(clampedVal);
        try {
          await onUpdatePlanCapacity(plan.id, clampedVal, { autoPromote: false });
        } catch (err: any) {
          console.error('[AssignedParticipantContainer handleAdjustCapacity] Error updating capacity:', err);
        }
        return;
      }

      if (clampedVal < (capacity ?? 2)) {
        const nonHostGoing = goingList.filter((f) => {
          const uId = f.dbUuid || f.id;
          const isUserHost = f.isHost || (f as any).role === 'HOST' || (activeUserId && uId === activeUserId && isHost);
          return !isUserHost;
        });
        const excessCount = goingList.length - clampedVal;

        if (excessCount > 0 && nonHostGoing.length > 0) {
          const count = Math.min(excessCount, nonHostGoing.length);
          setPendingCapacityAdjustmentSession({
            originalCapacity: capacity ?? 2,
            targetCapacity: clampedVal,
            mode: 'demote',
            requiredCount: count,
            candidates: nonHostGoing,
            selectedUserIds: [],
            stagedUpdates: [],
          });
          setGuidedAdjustmentState({
            mode: 'demote',
            targetCapacity: clampedVal,
            requiredCount: count,
            candidates: nonHostGoing,
          });
          return;
        }

        setLocalCapacity(clampedVal);
        try {
          await onUpdatePlanCapacity(plan.id, clampedVal, { autoPromote: false });
        } catch (err: any) {
          console.error('[AssignedParticipantContainer handleAdjustCapacity] Error updating capacity:', err);
        }
        return;
      }
    },
    [
      capacity,
      maxCapacity,
      onUpdatePlanCapacity,
      plan.id,
      localWaitlist,
      waitlistList,
      goingList,
      activeUserId,
      isHost,
    ]
  );

  const handleConfirmGuidedAdjustment = useCallback(
    async (selectedUserIds: string[]) => {
      if (!guidedAdjustmentState || !pendingCapacityAdjustmentSession) return;
      const { mode, targetCapacity } = guidedAdjustmentState;

      setGuidedAdjustmentState(null);
      setPendingCapacityAdjustmentSession(null);
      setReopenPlanSizeCapacity(null);
      setLocalCapacity(targetCapacity);

      try {
        await commitStagedCapacityAndParticipants(targetCapacity, mode, selectedUserIds);
      } catch (err: any) {
        console.error('[AssignedParticipantContainer handleConfirmGuidedAdjustment] Commit error:', err);
      }
    },
    [
      guidedAdjustmentState,
      pendingCapacityAdjustmentSession,
      commitStagedCapacityAndParticipants,
    ]
  );

  const managementMode: 'host' | 'invite_only' = effectiveIsHost ? 'host' : 'invite_only';

  useEffect(() => {
    if (!localWaitlist || localWaitlist.length === 0) return;
    if (waitlistList.length !== localWaitlist.length) return;

    const localIds = localWaitlist.map((f) => f.dbUuid || f.id);
    const storeIds = waitlistList.map((f) => f.dbUuid || f.id);
    const orderMatches = localIds.every((id, idx) => storeIds[idx] === id);
    if (!orderMatches) return;

    const allPositionsValid = waitlistList.every((item, idx) => {
      const pos = item.waitlistPosition;
      return typeof pos === 'number' && pos > 0 && pos === idx + 1;
    });

    if (allPositionsValid) {
      setLocalWaitlist(null);
    }
  }, [waitlistList, localWaitlist]);

  const displayGoingList = useMemo(() => {
    return goingList;
  }, [goingList]);

  const displayWaitlist = useMemo(() => {
    const rawList = localWaitlist || waitlistList;
    const goingUserIds = new Set(displayGoingList.map((g) => g.dbUuid || g.id));
    return rawList.filter((w) => !goingUserIds.has(w.dbUuid || w.id));
  }, [localWaitlist, waitlistList, displayGoingList]);

  const handleReorderWaitlist = useCallback((newWaitlist: Friend[]) => {
    setLocalWaitlist(newWaitlist);
  }, []);

  const handleReorderWaitlistComplete = useCallback(
    async (finalWaitlist: Friend[]) => {
      setLocalWaitlist(finalWaitlist);
      try {
        const userUuids = finalWaitlist.map((f) => f.dbUuid || f.id);
        if (onReorderWaitlist && userUuids.length > 0) {
          await onReorderWaitlist(plan.id, userUuids);
        }
      } catch (err) {
        console.error('[AssignedParticipantContainer handleReorderWaitlistComplete] Error:', err);
      }
    },
    [plan.id, onReorderWaitlist]
  );

  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);

  const isAnyBottomSheetOpen = Boolean(
    isActionSheetOpen ||
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

  const leavingParticipant = useMemo(() => {
    if (!effectiveReplaceTargetUserId) return null;
    const foundMember = members.find(
      (m) => (m.userId || m.userUuid || m.user_id || m.id || m.dbUuid) === effectiveReplaceTargetUserId
    );
    const foundUser = candidateUsers.find((u) => u.id === effectiveReplaceTargetUserId);
    return {
      name: foundMember?.name || foundMember?.full_name || foundUser?.full_name || 'Participant',
      avatar: foundMember?.avatar || foundMember?.profile_photo || foundUser?.profile_photo || null,
    };
  }, [effectiveReplaceTargetUserId, members, candidateUsers]);

  const selectedReplacementFriend = useMemo(() => {
    if (!isReplacementMode || individuallySelectedFriendIds.length === 0) return null;
    const selectedId = individuallySelectedFriendIds[0];
    return (
      AVAILABLE_FRIENDS.find((f) => f.id === selectedId) ||
      candidateUsers.find((u) => u.id === selectedId) ||
      null
    );
  }, [isReplacementMode, individuallySelectedFriendIds, AVAILABLE_FRIENDS, candidateUsers]);

  const isPickerOpen = Boolean(showAddFriendsPicker || effectiveReplaceTargetUserId);

  useEffect(() => {
    if (isPickerOpen && refreshFriendships) {
      refreshFriendships();
    }
  }, [isPickerOpen, refreshFriendships]);

  return (
    <>
      <AssignedParticipantScreen
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
        waitlistMode="assigned"
        externalGoingList={displayGoingList}
        externalWaitlist={displayWaitlist}
        externalInvitedList={[]}
        externalSkippedList={skippedList}
        initialTab={initialTab}
        onBack={onBack}
        onAdjustCapacity={effectiveIsHost ? handleAdjustCapacity : undefined}
        onMoveToGoing={effectiveIsHost ? handleMoveToGoing : undefined}
        onMoveToWaitlist={effectiveIsHost ? handleMoveToWaitlist : undefined}
        onRemoveParticipant={effectiveIsHost ? handleRemoveParticipant : undefined}
        onLeavePlan={handleLeavePlan}
        onPromoteHost={onPromoteToHost && effectiveIsHost ? handlePromoteHost : undefined}
        onDemoteHost={onDemoteFromHost && effectiveIsHost ? handleDemoteHost : undefined}
        onAddFriends={
          canInvite
            ? (targetTab) => {
                if (goingMembers.length >= 50) {
                  showToast(
                    "Plan size reached. This plan already has 50 participants. No more participants can join this plan.",
                    "error"
                  );
                  return;
                }
                setAddFriendsTargetTab(targetTab === 'waitlist' ? 'WAITLIST' : 'GOING');
                setShowAddFriendsPicker(true);
              }
            : undefined
        }
        displayMode={displayMode}
        onOpenSettings={onOpenSettings}
        onOpenActivity={onOpenActivity}
        onPlanSizeEditingChange={onPlanSizeEditingChange}
        onBottomSheetStateChange={setIsActionSheetOpen}
        showWaitlistMode={true}
        onWaitlistModeChange={handleWaitlistModeChange}
        isCapacityConfigured={capacity !== null && capacity !== undefined}
        onReorderWaitlist={effectiveIsHost ? handleReorderWaitlist : undefined}
        onReorderWaitlistComplete={effectiveIsHost ? handleReorderWaitlistComplete : undefined}
        canParticipantInvite={canParticipantInvite}
        pendingLeaveRequests={pendingLeaveRequests}
        onReplaceLeaveParticipant={handleReplaceLeaveParticipant}
        onKeepPaymentLeaveParticipant={handleKeepPaymentLeaveParticipant}
        onInviteSkipped={effectiveIsHost ? handleInviteSkipped : undefined}
        onMoveToInvited={effectiveIsHost ? handleMoveToInvited : undefined}
        onRejoinAddToJoined={effectiveIsHost ? handleRejoinAddToJoined : undefined}
        onRejoinAddToWaitlist={effectiveIsHost ? handleRejoinAddToWaitlist : undefined}
        onRejoinRemoveFromPlan={effectiveIsHost ? handleRejoinRemoveFromPlan : undefined}
        isCompletedPlan={isCompletedPlan}
        initialOpenPlanSizeSheet={initialOpenPlanSizeSheet}
        initialCapacityOverride={reopenPlanSizeCapacity}
        onPlanSizeSheetDismissed={() => setReopenPlanSizeCapacity(null)}
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
            selectedCategory={plan.category || 'custom'}
            selectedSubcategory={plan.subcategory || null}
            confirmLabel={isReplacementMode ? 'Confirm Replacement' : 'Send invites'}
            headerTitle={
              isReplacementMode
                ? `Replace ${leavingParticipant?.name || 'Participant'}`
                : 'Select friends'
            }
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

      <MoveToGoingCapacityBottomSheet
        isOpen={Boolean(pendingPromoteToGoing)}
        participant={
          pendingPromoteToGoing
            ? { name: pendingPromoteToGoing.name, avatar: pendingPromoteToGoing.avatar }
            : null
        }
        onIncreaseCapacity={handleConfirmPendingPromote}
        onSwapParticipant={handleOpenSwapTargetPicker}
        onClose={handleCancelPendingPromote}
      />

      <MoveToWaitlistBottomSheet
        isOpen={Boolean(pendingMoveToWaitlist)}
        participant={
          pendingMoveToWaitlist
            ? { name: pendingMoveToWaitlist.name, avatar: pendingMoveToWaitlist.avatar }
            : null
        }
        hasWaitlist={waitlistList.length > 0}
        goingCount={goingMembers.length}
        waitlistCount={waitlistList.length}
        onDecreaseCapacity={handleConfirmDecreaseCapacityForWaitlist}
        onSwapParticipant={waitlistList.length > 0 ? handleOpenWaitlistSwapPicker : undefined}
        onCancelPlan={onCancelPlan ? () => onCancelPlan(plan.id) : undefined}
        onClose={handleCancelPendingWaitlist}
      />

      <MakeAnotherParticipantHostBottomSheet
        isOpen={showHostLeaveReplacementSheet}
        eligibleParticipants={eligibleHostReplacementParticipants}
        isSubmitting={isSubmittingHostReplacement}
        onConfirm={handleConfirmHostReplacement}
        onClose={() => setShowHostLeaveReplacementSheet(false)}
      />

      <RemoveGoingParticipantBottomSheet
        isOpen={Boolean(pendingRemoveGoing)}
        participant={
          pendingRemoveGoing
            ? { name: pendingRemoveGoing.name, avatar: pendingRemoveGoing.avatar }
            : null
        }
        hasWaitlist={waitlistList.length > 0}
        goingCount={goingMembers.length}
        waitlistCount={waitlistList.length}
        planSize={capacity}
        onDecreaseCapacity={handleConfirmDecreaseCapacityForRemoveGoing}
        onReplaceParticipant={handleOpenRemoveGoingReplacePickerFull}
        onRemoveParticipant={handleConfirmRemoveGoingDirect}
        onCancelPlan={onCancelPlan ? () => onCancelPlan(plan.id) : undefined}
        onClose={handleCancelPendingRemoveGoing}
      />

      <GuidedCapacityAdjustmentBottomSheet
        isOpen={Boolean(guidedAdjustmentState)}
        mode={guidedAdjustmentState?.mode || 'promote'}
        requiredCount={guidedAdjustmentState?.requiredCount || 1}
        candidates={guidedAdjustmentState?.candidates || []}
        title={guidedAdjustmentState?.mode === 'promote' ? 'Move to Join' : 'Move to Waitlist'}
        subtitle={
          guidedAdjustmentState?.mode === 'promote'
            ? `Select ${guidedAdjustmentState.requiredCount} ${
                guidedAdjustmentState.requiredCount === 1 ? 'participant' : 'participants'
              } to move to Going.`
            : `Select ${guidedAdjustmentState?.requiredCount || 1} ${
                guidedAdjustmentState?.requiredCount === 1 ? 'participant' : 'participants'
              } to move to the waitlist.`
        }
        ctaLabel={guidedAdjustmentState?.mode === 'promote' ? 'Move to Join' : 'Move to Waitlist'}
        plan={plan}
        initialSelectedIds={pendingCapacityAdjustmentSession?.selectedUserIds || []}
        onConfirm={handleConfirmGuidedAdjustment}
        onBack={() => {
          // Reopen Plan Size sheet showing the CURRENT SAVED capacity (originalCapacity),
          // NOT the pending target. The pending change is discarded on Back.
          const originalCapacity = pendingCapacityAdjustmentSession?.originalCapacity ?? capacity;
          setGuidedAdjustmentState(null);
          setPendingCapacityAdjustmentSession(null);
          if (originalCapacity !== undefined && originalCapacity !== null) {
            setReopenPlanSizeCapacity(originalCapacity);
          }
        }}
        onClose={() => {
          setGuidedAdjustmentState(null);
          setPendingCapacityAdjustmentSession(null);
          setReopenPlanSizeCapacity(null);
        }}
      />

      <GuidedCapacityAdjustmentBottomSheet
        isOpen={Boolean(swapState)}
        mode="promote"
        requiredCount={1}
        candidates={
          swapState?.type === 'swap_incoming'
            ? goingList.filter((f) => {
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
        plan={plan}
        onConfirm={handleConfirmSwap}
        onClose={() => setSwapState(null)}
      />
    </>
  );
};
