import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { AssignedParticipantScreen } from './AssignedParticipantScreen';
import { Friend } from '../shared/types';
import { PlanParticipantManagementWrapperProps } from '../shared/participantManagementTypes';
import { normalizeStatus, sortGoingParticipants } from '../../../../lib/participantStatus';
import {
  formatAssignedGoingList,
  formatAssignedWaitlist,
  renumberWaitlist,
} from './assignedCapacityLogic';
import { WhoIsComingScreen } from '../../create/screens/WhoIsComingScreen';
import { useFriendshipStore } from '../../friendships/state/FriendshipContext';
import { getCompleteCurrentUserFriends } from '../../friendships/api/friendships';
import { usePlansStore } from '../../plans/state/PlansContext';
import { supabase } from '../../../../lib/supabaseClient';
import { Split, Merge, ArrowLeft } from 'lucide-react';
import { DiscoveryImages } from '../../../IMGfromDB/PlanImages';
import {
  PlanIsFullBottomSheet,
  MoveToGoingCapacityBottomSheet,
  MoveToWaitlistBottomSheet,
  RemoveGoingParticipantBottomSheet,
  GuidedCapacityAdjustmentBottomSheet,
  MakeAnotherParticipantHostBottomSheet,
} from '../../plans/components/BottomSheets';
import { isUuid } from '../../plans/utils/planUtils';

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

  const assignedGroup = normalizedGroup || (status === 'WAITLISTED' ? 'WAITLIST' : 'GOING');

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
    resolvePaidPlanLeaveRequest,
    replaceParticipant,
    moveParticipantToWaitlistAndDecreaseCapacity,
    requestHostLeaveWithReplacement,
    stopHostingWithReplacement,
    resolveRejoinedParticipant,
  } = usePlansStore();
  const hostId = plan.hostId || '';
  const members: any[] = plan.members || [];

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

  const [planFeeTotalCostOverride, setPlanFeeTotalCostOverride] = useState<number | null>(null);
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

  const currentTotalCost = useMemo(() => {
    if (planFeeTotalCostOverride !== null && planFeeTotalCostOverride > 0)
      return planFeeTotalCostOverride;
    const candidates = [
      matchedDbPlan?.total_cost,
      (plan as any)?.total_cost,
      (plan as any)?.totalCost,
      (plan as any)?.cost,
      (plan as any)?.paymentAmount,
    ];
    for (const val of candidates) {
      const num = Number(val);
      if (!isNaN(num) && num > 0) {
        return num;
      }
    }
    return planFeeTotalCostOverride ?? 0;
  }, [matchedDbPlan, plan, planFeeTotalCostOverride]);

  useEffect(() => {
    let isMounted = true;
    const fetchPlanFeeCost = async () => {
      const planUuid = isUuid(plan.id)
        ? plan.id
        : isUuid((plan as any).dbUuid || '')
        ? (plan as any).dbUuid
        : null;
      if (planFeeTotalCostOverride === null && planUuid) {
        const localCost = currentTotalCost;
        if (localCost <= 0) {
          try {
            const { data: planRow } = await supabase
              .from('plans')
              .select('total_cost')
              .eq('id', planUuid)
              .maybeSingle();

            if (isMounted && planRow && Number(planRow.total_cost || 0) > 0) {
              setPlanFeeTotalCostOverride(Number(planRow.total_cost));
              return;
            }

            const { data: expRow } = await (supabase as any)
              .from('wallet_expenses')
              .select('total_amount')
              .eq('plan_id', planUuid)
              .or('expense_type.eq.PLAN_EXPENSE,message_id.is.null')
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle();

            if (isMounted && expRow && Number(expRow.total_amount || 0) > 0) {
              setPlanFeeTotalCostOverride(Number(expRow.total_amount));
            }
          } catch (err) {
            console.error('[AssignedParticipantContainer fetchPlanFeeCost] Error:', err);
          }
        }
      }
    };
    fetchPlanFeeCost();
    return () => {
      isMounted = false;
    };
  }, [plan.id, (plan as any).dbUuid, currentTotalCost, planFeeTotalCostOverride]);

  const [showUpdatePlanFeeModal, setShowUpdatePlanFeeModal] = useState(false);
  const [pendingCapacityTarget, setPendingCapacityTarget] = useState<number | null>(null);
  const [pendingCostAction, setPendingCostAction] = useState<{
    type: 'increase_and_promote' | 'decrease_and_demote' | 'increase_and_invite' | 'decrease_and_remove';
    friend?: Friend;
    targetCapacity: number;
    friendIds?: string[];
    initialCost?: number;
  } | null>(null);
  const [selectedPlanFeeOption, setSelectedPlanFeeOption] = useState<
    'split_current_cost' | 'keep_cost_per_person' | null
  >(null);
  const [isSubmittingPlanFeeUpdate, setIsSubmittingPlanFeeUpdate] = useState(false);

  // Staged session for unified Plan Size -> Participant Movement -> Cost flow
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
    planCost: number;
  } | null>(null);

  const [reopenPlanSizeCapacity, setReopenPlanSizeCapacity] = useState<number | null>(null);
  const [localCapacity, setLocalCapacity] = useState<number | null>(null);

  useEffect(() => {
    setLocalCapacity(null);
  }, [plan.plan_size, (plan as any).planSize, plan.capacity, plan.joinLimit]);

  const storedCapacity =
    localCapacity !== null
      ? localCapacity
      : plan.plan_size || (plan as any).planSize || plan.joinLimit || plan.capacity || 2;
  const capacity = Math.max(2, storedCapacity);

  const effectiveCostForModal =
    pendingCostAction?.initialCost && pendingCostAction.initialCost > 0
      ? pendingCostAction.initialCost
      : pendingCapacityAdjustmentSession?.planCost && pendingCapacityAdjustmentSession.planCost > 0
      ? pendingCapacityAdjustmentSession.planCost
      : currentTotalCost;
  const planFeeCurrentTotal = effectiveCostForModal;
  const planFeeCurrentPerPerson =
    capacity > 0 ? Math.round((planFeeCurrentTotal / capacity) * 100) / 100 : 0;
  const planFeeOptionANewTotal = pendingCapacityTarget
    ? Math.round(pendingCapacityTarget * planFeeCurrentPerPerson * 100) / 100
    : planFeeCurrentTotal;
  const planFeeOptionBPerPerson =
    pendingCapacityTarget && pendingCapacityTarget > 0
      ? Math.round((planFeeCurrentTotal / pendingCapacityTarget) * 100) / 100
      : 0;

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

    let planCost = currentTotalCost;
    if (planCost <= 0) {
      const candidates = [
        matchedDbPlan?.total_cost,
        (plan as any)?.total_cost,
        (plan as any)?.totalCost,
        (plan as any)?.cost,
        (plan as any)?.paymentAmount,
      ];
      for (const val of candidates) {
        const num = Number(val);
        if (!isNaN(num) && num > 0) {
          planCost = num;
          break;
        }
      }
    }

    if (planCost <= 0) {
      const planUuid = isUuid(plan.id)
        ? plan.id
        : isUuid((plan as any).dbUuid || '')
        ? (plan as any).dbUuid
        : null;
      if (planUuid) {
        try {
          const { data: planRow } = await supabase
            .from('plans')
            .select('total_cost')
            .eq('id', planUuid)
            .maybeSingle();
          if (planRow && Number(planRow.total_cost || 0) > 0) {
            planCost = Number(planRow.total_cost);
          } else {
            const { data: expRow } = await (supabase as any)
              .from('wallet_expenses')
              .select('total_amount')
              .eq('plan_id', planUuid)
              .or('expense_type.eq.PLAN_EXPENSE,message_id.is.null')
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle();
            if (expRow && Number(expRow.total_amount || 0) > 0) {
              planCost = Number(expRow.total_amount);
            }
          }
        } catch (err) {
          console.error('[AssignedParticipantContainer Cost resolution error]:', err);
        }
      }
    }

    setPendingCapacityInvite(null);

    if (planCost > 0) {
      const primaryFriend = allPlanMembers.find((m) => (m.dbUuid || m.id) === friendIds[0]) || {
        id: friendIds[0],
        name: friendIds.length === 1 ? 'New Participant' : `${friendIds.length} Participants`,
        avatar: '',
      };

      setPlanFeeTotalCostOverride(planCost);
      setPendingCapacityTarget(newCapacity);
      setPendingCostAction({
        type: 'increase_and_invite',
        friend: primaryFriend,
        targetCapacity: newCapacity,
        friendIds,
        initialCost: planCost,
      });
      setSelectedPlanFeeOption(null);
      setShowUpdatePlanFeeModal(true);
      return;
    }

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

      return group === 'GOING' || group === 'JOINED' || (!group && (status === 'JOINED' || status === 'INVITED'));
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

  // Split rawGoingList and rawWaitlistList by capacity if capacity is finite
  const { capacityAdjustedGoing, capacityAdjustedWaitlist } = useMemo(() => {
    const rawWaitlist = waitlistMembers.map((m) =>
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

    if (!capacity || capacity <= 0 || isCompletedPlan) {
      return { capacityAdjustedGoing: rawGoingList, capacityAdjustedWaitlist: rawWaitlist };
    }

    if (rawGoingList.length <= capacity) {
      return { capacityAdjustedGoing: rawGoingList, capacityAdjustedWaitlist: rawWaitlist };
    }

    const hostPart = rawGoingList.filter((f) => f.isHost);
    const nonHost = rawGoingList.filter((f) => !f.isHost);
    const sortedNonHost = [...nonHost].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );

    const availableSpots = Math.max(0, capacity - hostPart.length);
    const keptNonHost = sortedNonHost.slice(0, availableSpots);
    const demoted = sortedNonHost.slice(availableSpots).map((f) => ({
      ...f,
      assignedGroup: 'WAITLIST' as const,
      rsvpStatus: f.rsvpStatus === 'JOINED' ? ('WAITLISTED' as const) : f.rsvpStatus,
    }));

    const nextGoing = [...hostPart, ...keptNonHost];
    const nextWaitlist = renumberWaitlist([...rawWaitlist, ...demoted]);

    return {
      capacityAdjustedGoing: nextGoing,
      capacityAdjustedWaitlist: nextWaitlist,
    };
  }, [
    rawGoingList,
    waitlistMembers,
    hostId,
    activeUserId,
    dbPlanParticipants,
    targetPlanUuid,
    (plan as any).dbUuid,
    plan.id,
    capacity,
    isCompletedPlan,
  ]);

  const goingList: Friend[] = useMemo(() => {
    return prioritizeCurrentUserAndSort(capacityAdjustedGoing);
  }, [capacityAdjustedGoing, prioritizeCurrentUserAndSort]);

  const waitlistList: Friend[] = useMemo(() => {
    const sorted = sortByWaitlistOrder(capacityAdjustedWaitlist);
    return formatAssignedWaitlist(sorted, activeUserId);
  }, [capacityAdjustedWaitlist, activeUserId, sortByWaitlistOrder]);

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

    const hasCost = planFeeCurrentTotal > 0;
    if (hasCost) {
      setPendingCapacityTarget(clampedVal);
      setPendingCostAction({
        type: 'increase_and_promote',
        friend,
        targetCapacity: clampedVal,
      });
      setSelectedPlanFeeOption(null);
      setShowUpdatePlanFeeModal(true);
      return;
    }

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
    planFeeCurrentTotal,
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

    const hasCost = planFeeCurrentTotal > 0;
    if (hasCost) {
      setPendingCapacityTarget(targetCapacity);
      setPendingCostAction({
        type: 'decrease_and_demote',
        friend,
        targetCapacity,
      });
      setSelectedPlanFeeOption(null);
      setShowUpdatePlanFeeModal(true);
      return;
    }

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
    planFeeCurrentTotal,
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

    const hasCost = planFeeCurrentTotal > 0;
    if (hasCost) {
      setPendingCapacityTarget(targetCapacity);
      setPendingCostAction({
        type: 'decrease_and_remove',
        friend,
        targetCapacity,
      });
      setSelectedPlanFeeOption(null);
      setShowUpdatePlanFeeModal(true);
      return;
    }

    try {
      await onUpdatePlanCapacity(plan.id, targetCapacity);
      await onRemoveParticipant(plan.id, friend.dbUuid || friend.id);
    } catch (err: any) {
      console.error('[AssignedParticipantContainer handleConfirmDecreaseCapacityForRemoveGoing] error:', err);
    }
  }, [pendingRemoveGoing, capacity, onUpdatePlanCapacity, plan.id, onRemoveParticipant, planFeeCurrentTotal]);

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

      // Case 1: INVITED + JOINED = plan_size -> removing a participant must require plan size to decrease
      if (activeInvitedAndJoinedCount === capacity && capacity > 2) {
        setIsForcedDecreaseRemoval(true);
        setPendingRemoveGoing(friend);
        return;
      }

      setIsForcedDecreaseRemoval(false);

      // Case 2: INVITED + JOINED > plan_size -> use existing removal flow without forcing a plan-size decrease
      // Other cases: keep existing normal removal behavior
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
      activeInvitedAndJoinedCount,
      capacity,
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
    options?: { totalCost?: number };
  } | null>(null);

  const commitStagedCapacityAndParticipants = useCallback(
    async (
      targetCap: number,
      targetTotalCost: number,
      mode: 'promote' | 'demote',
      selectedUserIds: string[]
    ) => {
      if (!onUpdatePlanCapacity) return;

      await onUpdatePlanCapacity(plan.id, targetCap, {
        totalCost: targetTotalCost,
        autoPromote: false,
      });

      setLocalGoingList(null);
      setLocalWaitlist(null);

      if (mode === 'promote') {
        for (const uId of selectedUserIds) {
          await onMoveToGoing(plan.id, uId, { bypassCapacityCheck: true });
        }
      } else if (mode === 'demote') {
        for (const uId of selectedUserIds) {
          await onMoveToWaitlist(plan.id, uId);
        }
      }
    },
    [onUpdatePlanCapacity, plan.id, onMoveToGoing, onMoveToWaitlist]
  );

  const handleAdjustCapacity = useCallback(
    async (newVal: number) => {
      const clampedVal = Math.min(maxCapacity, Math.max(2, newVal));
      if (clampedVal === capacity || !onUpdatePlanCapacity) return;

      let planCost = currentTotalCost;

      if (planCost <= 0 && isUuid(plan.id)) {
        try {
          const { data: expRow } = await (supabase as any)
            .from('wallet_expenses')
            .select('total_amount')
            .eq('plan_id', plan.id)
            .or('expense_type.eq.PLAN_EXPENSE,message_id.is.null')
            .maybeSingle();

          if (expRow && Number(expRow.total_amount || 0) > 0) {
            planCost = Number(expRow.total_amount);
            setPlanFeeTotalCostOverride(planCost);
          }
        } catch (err) {
          console.error('[AssignedParticipantContainer handleAdjustCapacity] Error checking wallet_expenses:', err);
        }
      }

      if (clampedVal > capacity) {
        const rawWaitlist = localWaitlist || waitlistList;
        const goingUserIds = new Set(goingList.map((g) => g.dbUuid || g.id));
        const eligibleWaitlist = rawWaitlist.filter((w) => !goingUserIds.has(w.dbUuid || w.id));
        const availableSpots = clampedVal - goingList.length;
        const requiredCount = Math.min(availableSpots, eligibleWaitlist.length);

        if (requiredCount > 0) {
          setPendingCapacityAdjustmentSession({
            originalCapacity: capacity,
            targetCapacity: clampedVal,
            mode: 'promote',
            requiredCount,
            candidates: eligibleWaitlist,
            selectedUserIds: [],
            stagedUpdates: [],
            planCost,
          });
          setGuidedAdjustmentState({
            mode: 'promote',
            targetCapacity: clampedVal,
            requiredCount,
            candidates: eligibleWaitlist,
          });
          return;
        }

        if (planCost > 0) {
          setPendingCapacityTarget(clampedVal);
          setPendingCapacityAdjustmentSession({
            originalCapacity: capacity,
            targetCapacity: clampedVal,
            mode: 'promote',
            requiredCount: 0,
            candidates: [],
            selectedUserIds: [],
            stagedUpdates: [],
            planCost,
          });
          setSelectedPlanFeeOption(null);
          setShowUpdatePlanFeeModal(true);
          return;
        }

        try {
          await onUpdatePlanCapacity(plan.id, clampedVal, { autoPromote: false });
        } catch (err: any) {
          console.error('[AssignedParticipantContainer handleAdjustCapacity] Error updating capacity:', err);
        }
        return;
      }

      if (clampedVal < capacity) {
        const nonHostGoing = goingList.filter((f) => {
          const uId = f.dbUuid || f.id;
          return !(f.isHost && activeUserId && uId === activeUserId);
        });
        const requiredCount = goingList.length - clampedVal;

        if (requiredCount > 0 && nonHostGoing.length > 0) {
          const count = Math.min(requiredCount, nonHostGoing.length);
          setPendingCapacityAdjustmentSession({
            originalCapacity: capacity,
            targetCapacity: clampedVal,
            mode: 'demote',
            requiredCount: count,
            candidates: nonHostGoing,
            selectedUserIds: [],
            stagedUpdates: [],
            planCost,
          });
          setGuidedAdjustmentState({
            mode: 'demote',
            targetCapacity: clampedVal,
            requiredCount: count,
            candidates: nonHostGoing,
          });
          return;
        }

        if (planCost > 0) {
          setPendingCapacityTarget(clampedVal);
          setPendingCapacityAdjustmentSession({
            originalCapacity: capacity,
            targetCapacity: clampedVal,
            mode: 'demote',
            requiredCount: 0,
            candidates: [],
            selectedUserIds: [],
            stagedUpdates: [],
            planCost,
          });
          setSelectedPlanFeeOption(null);
          setShowUpdatePlanFeeModal(true);
          return;
        }

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
      currentTotalCost,
      localWaitlist,
      waitlistList,
      goingList,
      activeUserId,
    ]
  );

  const handleSelectAndApplyPlanFeeOption = async (
    option: 'split_current_cost' | 'keep_cost_per_person'
  ) => {
    if (pendingCapacityTarget === null || !onUpdatePlanCapacity || isSubmittingPlanFeeUpdate) return;

    setSelectedPlanFeeOption(option);
    setIsSubmittingPlanFeeUpdate(true);
    const targetCap = pendingCapacityTarget;
    const planCost =
      pendingCostAction?.initialCost && pendingCostAction.initialCost > 0
        ? pendingCostAction.initialCost
        : pendingCapacityAdjustmentSession?.planCost && pendingCapacityAdjustmentSession.planCost > 0
        ? pendingCapacityAdjustmentSession.planCost
        : planFeeCurrentTotal > 0
        ? planFeeCurrentTotal
        : currentTotalCost;
    const currentPerPerson = capacity > 0 ? Math.round((planCost / capacity) * 100) / 100 : 0;

    let targetTotalCost = planCost;
    if (option === 'keep_cost_per_person') {
      targetTotalCost = Math.round(targetCap * currentPerPerson * 100) / 100;
    }

    try {
      const action = pendingCostAction;
      const session = pendingCapacityAdjustmentSession;

      setShowUpdatePlanFeeModal(false);
      setPendingCapacityTarget(null);
      setPendingCostAction(null);
      setPendingCapacityAdjustmentSession(null);
      setSelectedPlanFeeOption(null);

      if (action?.type === 'increase_and_promote') {
        await onUpdatePlanCapacity(plan.id, targetCap, {
          totalCost: targetTotalCost,
          autoPromote: false,
        });
        setLocalGoingList(null);
        setLocalWaitlist(null);
        await onMoveToGoing(plan.id, action.friend!.dbUuid || action.friend!.id, {
          bypassCapacityCheck: true,
        });
      } else if (action?.type === 'increase_and_invite') {
        await onUpdatePlanCapacity(plan.id, targetCap, {
          totalCost: targetTotalCost,
          autoPromote: false,
        });
        setLocalGoingList(null);
        setLocalWaitlist(null);
        await executeInviteFlow(action.friendIds || [], 'GOING');
      } else if (action?.type === 'decrease_and_demote') {
        await onUpdatePlanCapacity(plan.id, targetCap, { totalCost: targetTotalCost });
        setLocalGoingList(null);
        setLocalWaitlist(null);
        await onMoveToWaitlist(plan.id, action.friend!.dbUuid || action.friend!.id);
      } else if (action?.type === 'decrease_and_remove') {
        await onUpdatePlanCapacity(plan.id, targetCap, { totalCost: targetTotalCost });
        setLocalGoingList(null);
        setLocalWaitlist(null);
        await onRemoveParticipant(plan.id, action.friend!.dbUuid || action.friend!.id);
      } else if (session) {
        await commitStagedCapacityAndParticipants(
          targetCap,
          targetTotalCost,
          session.mode,
          session.selectedUserIds
        );
      } else {
        await onUpdatePlanCapacity(plan.id, targetCap, {
          totalCost: targetTotalCost,
          autoPromote: false,
        });
      }
    } catch (err: any) {
      console.error('[AssignedParticipantContainer handleSelectAndApplyPlanFeeOption] Failed:', err);
    } finally {
      setIsSubmittingPlanFeeUpdate(false);
      setLocalGoingList(null);
      setLocalWaitlist(null);
    }
  };

  const handleConfirmGuidedAdjustment = useCallback(
    async (selectedUserIds: string[]) => {
      if (!guidedAdjustmentState || !pendingCapacityAdjustmentSession) return;
      const { mode, targetCapacity } = guidedAdjustmentState;
      const planCost = pendingCapacityAdjustmentSession.planCost;

      const stagedUpdates = selectedUserIds.map((userId) => {
        const member = members.find(
          (m) => (m.userId || m.userUuid || m.user_id || m.id || m.dbUuid) === userId
        );
        const pp = dbPlanParticipants.find((p: any) => p.user_id === userId);
        const rawRsvp = pp ? pp.rsvp_status : member?.joinState || member?.rsvp_status;
        const currentRsvp = normalizeStatus(rawRsvp);

        if (mode === 'promote') {
          const targetRsvp = currentRsvp === 'INVITED' ? 'INVITED' : 'JOINED';
          return {
            userId,
            originalRsvpStatus: currentRsvp,
            targetRsvpStatus: targetRsvp as 'INVITED' | 'JOINED',
            targetAssignedGroup: 'GOING' as const,
          };
        } else {
          const targetRsvp = currentRsvp === 'INVITED' ? 'INVITED' : 'WAITLISTED';
          return {
            userId,
            originalRsvpStatus: currentRsvp,
            targetRsvpStatus: targetRsvp as 'INVITED' | 'WAITLISTED',
            targetAssignedGroup: 'WAITLIST' as const,
          };
        }
      });

      const updatedSession = {
        ...pendingCapacityAdjustmentSession,
        selectedUserIds,
        stagedUpdates,
      };
      setPendingCapacityAdjustmentSession(updatedSession);
      setGuidedAdjustmentState(null);

      if (planCost > 0) {
        setPendingCapacityTarget(targetCapacity);
        setSelectedPlanFeeOption(null);
        setShowUpdatePlanFeeModal(true);
      } else {
        try {
          await commitStagedCapacityAndParticipants(targetCapacity, 0, mode, selectedUserIds);
        } catch (err: any) {
          console.error('[AssignedParticipantContainer handleConfirmGuidedAdjustment] Commit error:', err);
        } finally {
          setPendingCapacityAdjustmentSession(null);
        }
      }
    },
    [
      guidedAdjustmentState,
      pendingCapacityAdjustmentSession,
      members,
      dbPlanParticipants,
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
        showWaitlistMode={false}
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
        title={isForcedDecreaseRemoval ? 'Decrease Plan Size' : undefined}
        subtitle={
          isForcedDecreaseRemoval
            ? `Plan size will decrease from ${capacity} to ${Math.max(2, capacity - 1)}.`
            : undefined
        }
        onDecreaseCapacity={handleConfirmDecreaseCapacityForRemoveGoing}
        onReplaceParticipant={
          isForcedDecreaseRemoval ? undefined : handleOpenRemoveGoingReplacePickerFull
        }
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
          const target = guidedAdjustmentState?.targetCapacity;
          setGuidedAdjustmentState(null);
          if (target !== undefined && target !== null) {
            setReopenPlanSizeCapacity(target);
          }
        }}
        onClose={() => {
          setGuidedAdjustmentState(null);
          setPendingCapacityAdjustmentSession(null);
          setPendingCapacityTarget(null);
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

      {showUpdatePlanFeeModal && pendingCapacityTarget !== null && (
        <div
          onClick={() => {
            if (!isSubmittingPlanFeeUpdate) {
              setShowUpdatePlanFeeModal(false);
              setPendingCapacityTarget(null);
              setPendingCostAction(null);
              setSelectedPlanFeeOption(null);
              setPendingCapacityAdjustmentSession(null);
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-end',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              background: '#1C1C1E',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
              color: '#FFFFFF',
              fontFamily: 'Inter, sans-serif',
              boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.3)',
              animation: 'slideUp 0.28s cubic-bezier(0.25, 1, 0.5, 1)',
            }}
            className="select-none text-left"
          >
            <div className="flex justify-center pt-3 pb-4">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>

            <div className="px-5 pb-1 text-left flex items-center gap-3.5">
              {pendingCapacityAdjustmentSession && pendingCapacityAdjustmentSession.requiredCount > 0 && (
                <button
                  type="button"
                  disabled={isSubmittingPlanFeeUpdate}
                  onClick={() => {
                    if (isSubmittingPlanFeeUpdate) return;
                    setShowUpdatePlanFeeModal(false);
                    setPendingCapacityTarget(null);
                    setSelectedPlanFeeOption(null);
                    setGuidedAdjustmentState({
                      mode: pendingCapacityAdjustmentSession.mode,
                      targetCapacity: pendingCapacityAdjustmentSession.targetCapacity,
                      requiredCount: pendingCapacityAdjustmentSession.requiredCount,
                      candidates: pendingCapacityAdjustmentSession.candidates,
                    });
                  }}
                  className="p-1 -ml-1 text-white hover:text-white/80 active:scale-95 transition cursor-pointer flex items-center justify-center shrink-0"
                  title="Back"
                  aria-label="Back to Move Participants"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
              )}
              <div className="w-[44px] h-[44px] rounded-full overflow-hidden border border-white/[0.08] shadow-sm flex-shrink-0 relative bg-zinc-900">
                <DiscoveryImages
                  src={plan.coverImage || (plan as any).cover_image || (matchedDbPlan as any)?.cover_image}
                  planId={targetPlanUuid || plan.id}
                  category={plan.category || (matchedDbPlan as any)?.category}
                  subcategory={(plan as any).subcategory || (matchedDbPlan as any)?.subcategory}
                  screen="Plan Actions Avatar"
                  alt={plan.title || 'Plan'}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1 flex flex-col justify-center space-y-0.5">
                <h3 className="font-sans font-semibold text-[15px] text-white tracking-wide truncate leading-snug">
                  {plan.title || 'Plan'}
                </h3>
                <p className="font-sans text-[12px] text-zinc-400 truncate leading-tight">
                  Update the cost
                </p>
              </div>
            </div>

            <div className="px-4 pt-4 flex flex-col gap-2.5">
              <button
                type="button"
                disabled={isSubmittingPlanFeeUpdate}
                onClick={() => handleSelectAndApplyPlanFeeOption('split_current_cost')}
                style={{
                  width: '100%',
                  height: 48,
                  padding: '0 14px',
                  background:
                    selectedPlanFeeOption === 'split_current_cost'
                      ? 'rgba(255, 255, 255, 0.12)'
                      : 'rgba(255, 255, 255, 0.06)',
                  border: 'none',
                  borderRadius: 12,
                  color: '#FFFFFF',
                  textAlign: 'left',
                  cursor: isSubmittingPlanFeeUpdate ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  transition: 'all 0.15s ease',
                  opacity:
                    isSubmittingPlanFeeUpdate && selectedPlanFeeOption !== 'split_current_cost'
                      ? 0.5
                      : 1,
                }}
              >
                <Split className="w-5 h-5 text-[#10B981] flex-shrink-0" />
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                    flex: 1,
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', lineHeight: 1.2 }}>
                    Split the total
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'rgba(255, 255, 255, 0.5)',
                      lineHeight: 1.2,
                      marginTop: 1,
                    }}
                  >
                    {planFeeCurrentTotal > 0 && pendingCapacityTarget ? (
                      `₹${Math.round(planFeeCurrentTotal).toLocaleString('en-IN')} ÷ ${pendingCapacityTarget} = ₹${Math.round(
                        planFeeOptionBPerPerson
                      ).toLocaleString('en-IN')}/person`
                    ) : (
                      'Keep the total cost and split it among participants'
                    )}
                  </span>
                </div>
              </button>

              <button
                type="button"
                disabled={isSubmittingPlanFeeUpdate}
                onClick={() => handleSelectAndApplyPlanFeeOption('keep_cost_per_person')}
                style={{
                  width: '100%',
                  height: 48,
                  padding: '0 14px',
                  background:
                    selectedPlanFeeOption === 'keep_cost_per_person'
                      ? 'rgba(255, 255, 255, 0.12)'
                      : 'rgba(255, 255, 255, 0.06)',
                  border: 'none',
                  borderRadius: 12,
                  color: '#FFFFFF',
                  textAlign: 'left',
                  cursor: isSubmittingPlanFeeUpdate ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  transition: 'all 0.15s ease',
                  opacity:
                    isSubmittingPlanFeeUpdate && selectedPlanFeeOption !== 'keep_cost_per_person'
                      ? 0.5
                      : 1,
                }}
              >
                <Merge className="w-5 h-5 text-[#10B981] flex-shrink-0" />
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                    flex: 1,
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', lineHeight: 1.2 }}>
                    {planFeeCurrentTotal > 0
                      ? `Keep ₹${Math.round(planFeeCurrentPerPerson).toLocaleString('en-IN')}/person`
                      : 'Keep cost per person'}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'rgba(255, 255, 255, 0.5)',
                      lineHeight: 1.2,
                      marginTop: 1,
                    }}
                  >
                    {planFeeCurrentTotal > 0
                      ? `New total: ₹${Math.round(planFeeOptionANewTotal).toLocaleString('en-IN')}`
                      : 'Calculate new total based on participant count'}
                  </span>
                </div>
              </button>

              <button
                type="button"
                disabled={isSubmittingPlanFeeUpdate}
                onClick={() => {
                  if (!isSubmittingPlanFeeUpdate) {
                    setShowUpdatePlanFeeModal(false);
                    setPendingCapacityTarget(null);
                    setPendingCostAction(null);
                    setSelectedPlanFeeOption(null);
                    setPendingCapacityAdjustmentSession(null);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'none',
                  border: 'none',
                  borderRadius: 12,
                  color: 'rgba(255, 255, 255, 0.4)',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: isSubmittingPlanFeeUpdate ? 'default' : 'pointer',
                  textAlign: 'center',
                  marginTop: 6,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
