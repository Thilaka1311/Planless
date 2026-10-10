import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { AutomaticParticipantScreen } from './AutomaticParticipantScreen';
import { Friend } from '../shared/types';
import { PlanParticipantManagementWrapperProps } from '../shared/participantManagementTypes';
import { normalizeStatus, partitionAutomaticParticipants, sortGoingParticipants } from '../../../../lib/participantStatus';
import { WhoIsComingScreen } from '../../create/screens/WhoIsComingScreen';
import { useFriendshipStore } from '../../friendships/state/FriendshipContext';
import { getCompleteCurrentUserFriends } from '../../friendships/api/friendships';
import { usePlansStore } from '../../plans/state/PlansContext';
import { supabase } from '../../../../lib/supabaseClient';
import { DiscoveryImages } from '../../../IMGfromDB/PlanImages';
import {
  MakeAnotherParticipantHostBottomSheet,
  PlanIsFullBottomSheet,
  RemoveGoingParticipantBottomSheet,
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

export const memberToAutomaticFriend = (
  m: any,
  hostId: string,
  activeUserId: string,
  dbPlanParticipants: any[],
  currentPlanId?: string,
  planDbUuid?: string,
  planAltId?: string
): Friend => {
  const id = m.userUuid || m.userId || m.user_id || m.id || m.dbUuid;

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

  const isHostRole = ((dbPp?.role || m.role || '')).toUpperCase() === 'HOST';
  const isCurrentUser = Boolean(
    activeUserId &&
      (id === activeUserId ||
        m.userUuid === activeUserId ||
        m.userId === activeUserId ||
        m.user_id === activeUserId ||
        m.dbUuid === activeUserId)
  );

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

  const isActivelyJoined =
    status === 'JOINED' || status === 'WAITLISTED' || status === 'REJOINED' || isHostRole;
  const joinedQueueAt = isActivelyJoined
    ? dbPp?.joined_queue_at || m.joined_queue_at || m.joinedQueueAt || (m as any).join_queue_at || null
    : null;

  const waitlistPosition =
    status === 'WAITLISTED'
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
    assignedGroup: null, // Automatic mode has no manual assignedGroup
    waitlistPosition,
    leave_requested: isLeaveRequested,
    leave_requested_at: leaveRequestedAt,
    skipReason: dbPp?.skip_reason || m.skipReason || m.skip_reason || (status === 'REJOINED' ? 'LEFT' : null),
  };
};

export const AutomaticParticipantContainer: React.FC<PlanParticipantManagementWrapperProps> = ({
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
  onWaitlistModeChange,
  onAddParticipants,
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



  const [showHostLeaveReplacementSheet, setShowHostLeaveReplacementSheet] = useState(false);
  const [hostReplacementMode, setHostReplacementMode] = useState<'leave' | 'stop_hosting'>('leave');
  const [isSubmittingHostReplacement, setIsSubmittingHostReplacement] = useState(false);

  const [pendingRemoveParticipant, setPendingRemoveParticipant] = useState<Friend | null>(null);
  const [pendingRejoinCapacityFriend, setPendingRejoinCapacityFriend] = useState<Friend | null>(null);

  const currentJoinedCount = useMemo(() => {
    const visitedUserIds = new Set<string>();
    let count = 0;

    (members || []).forEach((m: any) => {
      const id = m.userId || m.userUuid || m.user_id || m.id || m.dbUuid;
      if (!id || visitedUserIds.has(id)) return;
      const isHostRole = m.isHost === true || (m.role || '').toUpperCase() === 'HOST';
      const status = normalizeStatus(m.joinState || m.rsvp_status);
      if (status === 'JOINED' || isHostRole) {
        visitedUserIds.add(id);
        count++;
      }
    });

    (dbPlanParticipants || []).forEach((pp: any) => {
      if (!isParticipantInPlan(pp) || !pp.user_id || visitedUserIds.has(pp.user_id)) return;
      const isHostRole = (pp.role || '').toUpperCase() === 'HOST';
      const status = normalizeStatus(pp.rsvp_status);
      if (status === 'JOINED' || isHostRole) {
        visitedUserIds.add(pp.user_id);
        count++;
      }
    });

    return count;
  }, [members, dbPlanParticipants, isParticipantInPlan]);

  const activeInvitedAndJoinedCount = useMemo(() => {
    const visitedUserIds = new Set<string>();
    let count = 0;

    (members || []).forEach((m: any) => {
      const id = m.userId || m.userUuid || m.user_id || m.id || m.dbUuid;
      if (!id || visitedUserIds.has(id)) return;
      visitedUserIds.add(id);

      const status = normalizeStatus(m.joinState || m.rsvp_status);
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
  }, [members, dbPlanParticipants, isParticipantInPlan]);

  const resolvedUserUuid = userProfile?.dbUuid || (userProfile as any)?.id || activeUserId || '';

  const activeHostMembers = useMemo(() => {
    return members.filter((m) => {
      const id = m.userUuid || m.userId || m.user_id || m.id || m.dbUuid;
      const dbPp = (dbPlanParticipants || []).find((pp: any) => isParticipantInPlan(pp) && (pp.user_id === id || pp.user_id === m.userUuid || pp.user_id === m.userId));
      const role = dbPp?.role || (m as any).role || (m.isHost ? 'HOST' : 'PARTICIPANT');
      const isHostRole = (role || '').toUpperCase() === 'HOST';
      const status = normalizeStatus(dbPp?.rsvp_status || m.joinState || (m as any).rsvp_status);
      return isHostRole && status === 'JOINED';
    });
  }, [members, dbPlanParticipants, isParticipantInPlan]);

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
        console.error('[AutomaticParticipantContainer] Host replacement failed:', err);
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
    const currentDbPp = (dbPlanParticipants || []).find((pp: any) => {
      if (!isParticipantInPlan(pp)) return false;
      const uId = pp.user_id;
      return Boolean(
        resolvedUserUuid &&
          (uId === resolvedUserUuid ||
            uId === activeUserId ||
            uId === userProfile?.dbUuid ||
            uId === (userProfile as any)?.id ||
            uId === userProfile?.user_id)
      );
    });

    if (currentDbPp && currentDbPp.role) {
      return (currentDbPp.role || '').toUpperCase() === 'HOST';
    }

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
  }, [dbPlanParticipants, isParticipantInPlan, resolvedUserUuid, activeUserId, userProfile, members, isHost]);

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
        console.error('[AutomaticParticipantContainer] Error fetching friends:', err);
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
        if (rsvp === 'JOINED' || rsvp === 'GOING') {
          if (pp.user_id) set.add(pp.user_id);
        }
      }
    });

    (members || []).forEach((m: any) => {
      const rsvp = normalizeStatus(m.joinState || m.rsvp_status);
      if (rsvp === 'JOINED') {
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
        console.error('[AutomaticParticipantContainer handleKeepPaymentLeaveParticipant] Error:', err);
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
    async (friend: Friend) => {
      if (!onAddParticipants) return;
      const userId = friend.dbUuid || friend.id;
      try {
        await onAddParticipants(plan.id, [userId]);
      } catch (err: any) {
        console.error('[AutomaticParticipantContainer handleInviteSkipped] error:', err);
      }
    },
    [onAddParticipants, plan.id]
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

  const executeInviteFlow = async (friendIds: string[]) => {
    if (!onAddParticipants) return;
    setShowAddFriendsPicker(false);
    setSearchPeopleQuery('');
    setIndividuallySelectedFriendIds([]);
    try {
      await onAddParticipants(plan.id, friendIds);
    } catch (err: any) {
      console.error('[AutomaticParticipantContainer executeInviteFlow] Add error:', err);
    }
  };

  const handleConfirmInvite = async () => {
    if (!effectiveIsHost) return;
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
        }
        setIndividuallySelectedFriendIds([]);
        setLocalReplaceTargetUserId(null);
        if (onCancelReplacement) {
          onCancelReplacement();
        } else {
          setShowAddFriendsPicker(false);
        }
      } catch (err: any) {
        console.error('[AutomaticParticipantContainer handleConfirmInvite] Replacement error:', err);
      }
      return;
    }

    try {
      await executeInviteFlow(friendIds);
    } catch (err: any) {
      console.error('[AutomaticParticipantContainer handleConfirmInvite] error:', err);
    }
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
          assignedGroup: null,
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

  const isCompletedPlan = (plan.status || '').toUpperCase() === 'COMPLETED';

  const totalActiveParticipants = useMemo(() => {
    return allPlanMembers.filter(
      (m) => normalizeStatus(m.joinState || (m as any).rsvp_status) !== 'SKIPPED'
    ).length;
  }, [allPlanMembers]);

  const maxCapacity = Math.max(storedCapacity, Math.max(2, totalActiveParticipants));

  const allActiveFriends: Friend[] = useMemo(() => {
    return allPlanMembers.map((m) =>
      memberToAutomaticFriend(
        m,
        hostId,
        activeUserId || '',
        dbPlanParticipants,
        targetPlanUuid,
        (plan as any).dbUuid,
        plan.id
      )
    );
  }, [allPlanMembers, hostId, activeUserId, dbPlanParticipants, targetPlanUuid, (plan as any).dbUuid, plan.id]);

  const partitioned = useMemo(() => {
    if (isCompletedPlan) {
      const going = allActiveFriends.filter((f) => {
        const finalState = getMemberFinalState(f);
        return finalState === 'JOINED' || (!finalState && (f.rsvpStatus === 'JOINED' || f.isHost));
      });
      const skipped = allActiveFriends.filter((f) => {
        const finalState = getMemberFinalState(f);
        return finalState === 'SKIPPED' || (!finalState && f.rsvpStatus === 'SKIPPED');
      });
      return {
        going: sortGoingParticipants(going, activeUserId),
        waitlist: [],
        invited: [],
        skipped: sortGoingParticipants(skipped, activeUserId),
      };
    }

    const partition = partitionAutomaticParticipants(
      allActiveFriends,
      capacity ?? 0,
      resolvedUserUuid
    );

    // Do NOT compute invited separately — partitionAutomaticParticipants already
    // places INVITED members into going (when spots are available) or waitlist.
    // A separate filter would cause the same member to appear in two lists,
    // triggering duplicate React keys in the screen.
    const going = sortGoingParticipants(partition.going, activeUserId);
    const waitlist = partition.waitlist;
    const skipped = sortGoingParticipants(partition.skipped, activeUserId);

    return { going, waitlist, invited: [], skipped };
  }, [allActiveFriends, capacity, resolvedUserUuid, isCompletedPlan, activeUserId]);

  const initialTab: 'going' | 'waitlist' | 'invited' = useMemo(() => {
    if (!activeUserId) return 'going';
    const currentMember = allPlanMembers.find((m) => {
      const mId = m.userId || m.userUuid || m.user_id || m.id;
      return mId === activeUserId;
    });
    if (!currentMember || isCompletedPlan) return 'going';
    const status = normalizeStatus(currentMember.joinState || currentMember.rsvp_status);
    if (status === 'WAITLISTED') return 'waitlist';
    if (status === 'INVITED') return 'going';
    return 'going';
  }, [allPlanMembers, activeUserId, isCompletedPlan]);

  const eventDateObj = plan.datetime ? new Date(plan.datetime) : null;
  const formattedDate = eventDateObj
    ? eventDateObj.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })
    : undefined;
  const formattedTime = eventDateObj
    ? `${String(eventDateObj.getHours()).padStart(2, '0')}:${String(eventDateObj.getMinutes()).padStart(2, '0')}`
    : undefined;

  const handleRejoinAddToPlan = useCallback(
    async (friend: Friend) => {
      const friendId = friend.dbUuid || friend.id;
      const isNoLimit = capacity === null || capacity === undefined;
      const hasAvailableCapacity = isNoLimit
        ? currentJoinedCount < 50
        : currentJoinedCount < capacity;

      // 1. Check current number of JOINED participants against current plan_size (capacity)
      if (hasAvailableCapacity) {
        // 2. If available capacity: add directly to JOINED and complete rejoin flow
        try {
          await resolveRejoinedParticipant(targetPlanUuid || plan.id, friendId, 'JOINED');
        } catch (err: any) {
          console.error('[AutomaticParticipantContainer handleRejoinAddToPlan] error:', err);
        }
      } else {
        if (isNoLimit) {
          showToast(
            'Plan size reached. This plan already has 50 participants. No more participants can join this plan.',
            'error'
          );
          return;
        }
        // 3. If plan is already at capacity: show existing capacity decision flow (Increase Plan Size / Add to Waitlist)
        setPendingRejoinCapacityFriend(friend);
      }
    },
    [currentJoinedCount, capacity, targetPlanUuid, plan.id, resolveRejoinedParticipant, showToast]
  );

  const handleIncreaseCapacityAndRejoin = useCallback(async () => {
    if (!pendingRejoinCapacityFriend) return;
    const friend = pendingRejoinCapacityFriend;
    const friendId = friend.dbUuid || friend.id;
    const targetCapacity = capacity !== null && capacity !== undefined ? capacity + 1 : 2;
    setPendingRejoinCapacityFriend(null);

    try {
      if (onUpdatePlanCapacity) {
        await onUpdatePlanCapacity(targetPlanUuid || plan.id, targetCapacity, { autoPromote: false });
      }
      await resolveRejoinedParticipant(targetPlanUuid || plan.id, friendId, 'JOINED');
    } catch (err: any) {
      console.error('[AutomaticParticipantContainer handleIncreaseCapacityAndRejoin] error:', err);
    }
  }, [pendingRejoinCapacityFriend, capacity, onUpdatePlanCapacity, targetPlanUuid, plan.id, resolveRejoinedParticipant]);

  const handleRejoinToWaitlistInstead = useCallback(async () => {
    if (!pendingRejoinCapacityFriend) return;
    const friend = pendingRejoinCapacityFriend;
    const friendId = friend.dbUuid || friend.id;
    setPendingRejoinCapacityFriend(null);
    try {
      await resolveRejoinedParticipant(targetPlanUuid || plan.id, friendId, 'WAITLIST');
    } catch (err: any) {
      console.error('[AutomaticParticipantContainer handleRejoinToWaitlistInstead] error:', err);
    }
  }, [pendingRejoinCapacityFriend, targetPlanUuid, plan.id, resolveRejoinedParticipant]);

  const handleMoveToGoing = useCallback(
    async (friend: Friend) => {
      const isRejoined =
        friend.rsvpStatus === 'REJOINED' || (friend as any).rsvp_status === 'REJOINED';
      if (isRejoined) {
        await handleRejoinAddToPlan(friend);
        return;
      }
      try {
        await onMoveToGoing(plan.id, friend.dbUuid || friend.id);
      } catch (err: any) {
        console.error('[AutomaticParticipantContainer handleMoveToGoing] error:', err);
      }
    },
    [plan.id, onMoveToGoing, handleRejoinAddToPlan]
  );

  const handleMoveToWaitlist = useCallback(
    async (friend: Friend) => {
      try {
        await onMoveToWaitlist(plan.id, friend.dbUuid || friend.id);
      } catch (err: any) {
        console.error('[AutomaticParticipantContainer handleMoveToWaitlist] error:', err);
      }
    },
    [plan.id, onMoveToWaitlist]
  );

  const handleCancelPendingRemoveParticipant = useCallback(() => {
    setPendingRemoveParticipant(null);
  }, []);

  const handleConfirmDecreaseCapacityForRemove = useCallback(async () => {
    if (!pendingRemoveParticipant || !onUpdatePlanCapacity) return;
    const friend = pendingRemoveParticipant;
    const targetCapacity = Math.max(2, capacity - 1);
    setPendingRemoveParticipant(null);

    try {
      await onUpdatePlanCapacity(plan.id, targetCapacity, { autoPromote: false });
      await onRemoveParticipant(plan.id, friend.dbUuid || friend.id);
    } catch (err: any) {
      console.error('[AutomaticParticipantContainer handleConfirmDecreaseCapacityForRemove] error:', err);
    }
  }, [pendingRemoveParticipant, capacity, onUpdatePlanCapacity, plan.id, onRemoveParticipant]);

  const handleConfirmRemoveParticipantDirect = useCallback(async () => {
    if (!pendingRemoveParticipant) return;
    const friend = pendingRemoveParticipant;
    setPendingRemoveParticipant(null);

    try {
      await onRemoveParticipant(plan.id, friend.dbUuid || friend.id);
    } catch (err: any) {
      console.error('[AutomaticParticipantContainer handleConfirmRemoveParticipantDirect] error:', err);
    }
  }, [pendingRemoveParticipant, plan.id, onRemoveParticipant]);

  const handleOpenRemoveParticipantReplacePickerFull = useCallback(() => {
    if (!pendingRemoveParticipant) return;
    const userId = pendingRemoveParticipant.dbUuid || pendingRemoveParticipant.id;
    setPendingRemoveParticipant(null);
    setLocalReplaceTargetUserId(userId);
    setIndividuallySelectedFriendIds([]);
    setShowAddFriendsPicker(true);
  }, [pendingRemoveParticipant]);

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

      const isLeaveRequested = Boolean(
        (friend.leave_requested === true || (friend as any).leaveRequested === true) &&
        friend.rsvpStatus !== 'SKIPPED' &&
        (friend as any).rsvp_status !== 'SKIPPED'
      );

      // Check if participant is in Going list (has an allocated spot)
      const isGoing = partitioned.going.some((g) => {
        const gId = g.dbUuid || g.id || (g as any).userId || (g as any).user_id;
        const fId = friend.dbUuid || friend.id || (friend as any).userId || (friend as any).user_id;
        return (gId && fId && gId === fId) || g.id === friend.id || (g.dbUuid && g.dbUuid === friend.dbUuid);
      });

      if (isGoing || isLeaveRequested) {
        setPendingRemoveParticipant(friend);
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
      partitioned.going,
      onRemoveParticipant,
      resolvedUserUuid,
      userProfile?.user_id,
      handleLeavePlan,
    ]
  );

  const handleMoveToInvited = useCallback(
    async (friend: Friend) => {
      const friendId = friend.dbUuid || friend.id;
      try {
        if (onMoveToInvited) {
          await onMoveToInvited(plan.id, friendId);
        } else if (onAddParticipants) {
          await onAddParticipants(plan.id, [friendId]);
        }
      } catch (err: any) {
        console.error('[AutomaticParticipantContainer handleMoveToInvited] error:', err);
      }
    },
    [plan.id, onMoveToInvited, onAddParticipants]
  );

  const handleRejoinAddToJoined = useCallback(
    async (friend: Friend) => {
      const friendId = friend.dbUuid || friend.id;
      try {
        await resolveRejoinedParticipant(targetPlanUuid || plan.id, friendId, 'JOINED');
      } catch (err: any) {
        console.error('[AutomaticParticipantContainer handleRejoinAddToJoined] error:', err);
      }
    },
    [targetPlanUuid, plan.id, resolveRejoinedParticipant]
  );

  const handleRejoinAddToWaitlist = useCallback(
    async (friend: Friend) => {
      const friendId = friend.dbUuid || friend.id;
      try {
        await resolveRejoinedParticipant(targetPlanUuid || plan.id, friendId, 'WAITLIST');
      } catch (err: any) {
        console.error('[AutomaticParticipantContainer handleRejoinAddToWaitlist] error:', err);
      }
    },
    [targetPlanUuid, plan.id, resolveRejoinedParticipant]
  );

  const handleRejoinRemoveFromPlan = useCallback(
    async (friend: Friend) => {
      const friendId = friend.dbUuid || friend.id;
      try {
        await resolveRejoinedParticipant(targetPlanUuid || plan.id, friendId, 'REMOVE');
      } catch (err: any) {
        console.error('[AutomaticParticipantContainer handleRejoinRemoveFromPlan] error:', err);
      }
    },
    [targetPlanUuid, plan.id, resolveRejoinedParticipant]
  );

  const handleRejoinPlanFull = useCallback(
    (friend: Friend) => {
      setPendingRejoinCapacityFriend(friend);
    },
    []
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
        console.error('[AutomaticParticipantContainer handleDemoteHost] error:', err);
      }
    },
    [plan.id, onDemoteFromHost, resolvedUserUuid, userProfile?.user_id, isSoleHost]
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
        console.error('[AutomaticParticipantContainer] Error changing waitlist mode:', err);
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
          await onUpdatePlanCapacity(plan.id, null, { autoPromote: true });
        } catch (err: any) {
          console.error('[AutomaticParticipantContainer handleAdjustCapacity] Error updating capacity to null:', err);
        }
        return;
      }

      const clampedVal = Math.min(maxCapacity, Math.max(2, newVal));
      if (clampedVal === capacity) return;
      setLocalCapacity(clampedVal);

      try {
        await onUpdatePlanCapacity(plan.id, clampedVal, { autoPromote: true });
      } catch (err: any) {
        console.error('[AutomaticParticipantContainer handleAdjustCapacity] Error updating capacity:', err);
      }
    },
    [capacity, maxCapacity, onUpdatePlanCapacity, plan.id]
  );

  const managementMode: 'host' | 'invite_only' = effectiveIsHost ? 'host' : 'invite_only';

  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);

  const isAnyBottomSheetOpen = Boolean(
    isActionSheetOpen ||
      Boolean(pendingRemoveParticipant) ||
      Boolean(pendingRejoinCapacityFriend) ||
      showHostLeaveReplacementSheet ||
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
      <AutomaticParticipantScreen
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
        waitlistMode="automatic"
        externalGoingList={partitioned.going}
        externalWaitlist={partitioned.waitlist}
        externalInvitedList={partitioned.invited}
        externalSkippedList={partitioned.skipped}
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
          effectiveIsHost
            ? () => {
                if (partitioned.going.length >= 50) {
                  showToast(
                    "Plan size reached. This plan already has 50 participants. No more participants can join this plan.",
                    "error"
                  );
                  return;
                }
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
        pendingLeaveRequests={pendingLeaveRequests}
        onReplaceLeaveParticipant={handleReplaceLeaveParticipant}
        onKeepPaymentLeaveParticipant={handleKeepPaymentLeaveParticipant}
        onInviteSkipped={effectiveIsHost ? handleInviteSkipped : undefined}
        onMoveToInvited={effectiveIsHost ? handleMoveToInvited : undefined}
        onRejoinAddToPlan={effectiveIsHost ? handleRejoinAddToPlan : undefined}
        onRejoinAddToJoined={effectiveIsHost ? handleRejoinAddToJoined : undefined}
        onRejoinAddToWaitlist={effectiveIsHost ? handleRejoinAddToWaitlist : undefined}
        onRejoinRemoveFromPlan={effectiveIsHost ? handleRejoinRemoveFromPlan : undefined}
        onRejoinPlanFull={effectiveIsHost ? handleRejoinPlanFull : undefined}
        isCompletedPlan={isCompletedPlan}
        initialOpenPlanSizeSheet={initialOpenPlanSizeSheet}
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
        </div>
      )}

      <MakeAnotherParticipantHostBottomSheet
        isOpen={showHostLeaveReplacementSheet}
        eligibleParticipants={eligibleHostReplacementParticipants}
        isSubmitting={isSubmittingHostReplacement}
        mode={hostReplacementMode}
        onConfirm={handleConfirmHostReplacement}
        onClose={() => setShowHostLeaveReplacementSheet(false)}
      />

      <RemoveGoingParticipantBottomSheet
        isOpen={Boolean(pendingRemoveParticipant)}
        participant={
          pendingRemoveParticipant
            ? { name: pendingRemoveParticipant.name, avatar: pendingRemoveParticipant.avatar }
            : null
        }
        hasWaitlist={partitioned.waitlist.length > 0}
        goingCount={partitioned.going.length}
        waitlistCount={partitioned.waitlist.length}
        planSize={capacity}
        onDecreaseCapacity={handleConfirmDecreaseCapacityForRemove}
        onReplaceParticipant={handleOpenRemoveParticipantReplacePickerFull}
        onRemoveParticipant={handleConfirmRemoveParticipantDirect}
        onClose={handleCancelPendingRemoveParticipant}
      />

      <PlanIsFullBottomSheet
        isOpen={Boolean(pendingRejoinCapacityFriend)}
        pickerSelectedFriends={
          pendingRejoinCapacityFriend
            ? [
                {
                  id: pendingRejoinCapacityFriend.dbUuid || pendingRejoinCapacityFriend.id,
                  name: pendingRejoinCapacityFriend.name,
                  avatar: pendingRejoinCapacityFriend.avatar,
                },
              ]
            : []
        }
        onIncreaseCapacity={handleIncreaseCapacityAndRejoin}
        onInviteToWaitlist={handleRejoinToWaitlistInstead}
        onClose={() => setPendingRejoinCapacityFriend(null)}
      />
    </>
  );
};
