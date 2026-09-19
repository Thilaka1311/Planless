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
import { Split, Merge } from 'lucide-react';
import { DiscoveryImages } from '../../../IMGfromDB/PlanImages';
import {
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
    skipReason: status === 'REJOINED' ? null : dbPp?.skip_reason || m.skipReason || m.skip_reason || null,
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
}) => {
  const { friends, refreshFriendships } = useFriendshipStore();
  const {
    dbPlans,
    dbPlanParticipants,
    resolvePaidPlanLeaveRequest,
    replaceParticipant,
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
            console.error('[AutomaticParticipantContainer fetchPlanFeeCost] Error:', err);
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
  const [selectedPlanFeeOption, setSelectedPlanFeeOption] = useState<
    'split_current_cost' | 'keep_cost_per_person' | null
  >(null);
  const [isSubmittingPlanFeeUpdate, setIsSubmittingPlanFeeUpdate] = useState(false);

  const [localCapacity, setLocalCapacity] = useState<number | null>(null);

  useEffect(() => {
    setLocalCapacity(null);
  }, [plan.plan_size, (plan as any).planSize, plan.capacity, plan.joinLimit]);

  const storedCapacity =
    localCapacity !== null
      ? localCapacity
      : plan.plan_size || (plan as any).planSize || plan.joinLimit || plan.capacity || 2;
  const capacity = Math.max(2, storedCapacity);

  const planFeeCurrentTotal = currentTotalCost;
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
      capacity,
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
    if (status === 'INVITED') return 'invited';
    return 'going';
  }, [allPlanMembers, activeUserId, isCompletedPlan]);

  const eventDateObj = plan.datetime ? new Date(plan.datetime) : null;
  const formattedDate = eventDateObj
    ? eventDateObj.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })
    : undefined;
  const formattedTime = eventDateObj
    ? eventDateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : undefined;

  const handleMoveToGoing = useCallback(
    async (friend: Friend) => {
      const isRejoined =
        friend.rsvpStatus === 'REJOINED' || (friend as any).rsvp_status === 'REJOINED';
      if (isRejoined) {
        await handleRejoinAddToJoined(friend);
        return;
      }
      try {
        await onMoveToGoing(plan.id, friend.dbUuid || friend.id);
      } catch (err: any) {
        console.error('[AutomaticParticipantContainer handleMoveToGoing] error:', err);
      }
    },
    [plan.id, onMoveToGoing]
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

      const allActive = (plan.members || []).filter(
        (m: any) => normalizeStatus(m.joinState || m.rsvp_status) !== 'SKIPPED'
      );
      const partition = partitionAutomaticParticipants(
        allActive,
        capacity,
        resolvedUserUuid || userProfile?.user_id
      );
      const hasWaitlist = partition.waitlist.length > 0;
      const invitedCount = allActive.length;
      if (!hasWaitlist && capacity === invitedCount && capacity > 2) {
        setLocalCapacity(Math.max(2, capacity - 1));
      }

      try {
        await onRemoveParticipant(plan.id, friendId);
      } catch {
        setLocalCapacity(null);
      }
    },
    [
      plan.id,
      plan.members,
      capacity,
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
        await resolveRejoinedParticipant(plan.id, friendId, 'JOINED');
      } catch (err: any) {
        console.error('[AutomaticParticipantContainer handleRejoinAddToJoined] error:', err);
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
        console.error('[AutomaticParticipantContainer handleRejoinAddToWaitlist] error:', err);
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
        console.error('[AutomaticParticipantContainer handleRejoinRemoveFromPlan] error:', err);
      }
    },
    [plan.id, resolveRejoinedParticipant]
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
          console.error('[AutomaticParticipantContainer handleAdjustCapacity] Error checking wallet_expenses:', err);
        }
      }

      if (planCost > 0) {
        setPendingCapacityTarget(clampedVal);
        setSelectedPlanFeeOption(null);
        setShowUpdatePlanFeeModal(true);
        return;
      }

      try {
        await onUpdatePlanCapacity(plan.id, clampedVal, { autoPromote: true });
      } catch (err: any) {
        console.error('[AutomaticParticipantContainer handleAdjustCapacity] Error updating capacity:', err);
      }
    },
    [capacity, maxCapacity, onUpdatePlanCapacity, plan.id, currentTotalCost]
  );

  const handleSelectAndApplyPlanFeeOption = async (
    option: 'split_current_cost' | 'keep_cost_per_person'
  ) => {
    if (pendingCapacityTarget === null || !onUpdatePlanCapacity || isSubmittingPlanFeeUpdate) return;

    setSelectedPlanFeeOption(option);
    setIsSubmittingPlanFeeUpdate(true);
    const targetCap = pendingCapacityTarget;
    const planCost = planFeeCurrentTotal > 0 ? planFeeCurrentTotal : currentTotalCost;
    const currentPerPerson = capacity > 0 ? Math.round((planCost / capacity) * 100) / 100 : 0;

    let targetTotalCost = planCost;
    if (option === 'keep_cost_per_person') {
      targetTotalCost = Math.round(targetCap * currentPerPerson * 100) / 100;
    }

    try {
      setShowUpdatePlanFeeModal(false);
      setPendingCapacityTarget(null);
      setSelectedPlanFeeOption(null);

      await onUpdatePlanCapacity(plan.id, targetCap, {
        totalCost: targetTotalCost,
        autoPromote: true,
      });
    } catch (err: any) {
      console.error('[AutomaticParticipantContainer handleSelectAndApplyPlanFeeOption] Failed:', err);
    } finally {
      setIsSubmittingPlanFeeUpdate(false);
    }
  };

  const managementMode: 'host' | 'invite_only' = effectiveIsHost ? 'host' : 'invite_only';

  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);

  const isAnyBottomSheetOpen = Boolean(
    isActionSheetOpen ||
      showUpdatePlanFeeModal ||
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
        pendingLeaveRequests={pendingLeaveRequests}
        onReplaceLeaveParticipant={handleReplaceLeaveParticipant}
        onKeepPaymentLeaveParticipant={handleKeepPaymentLeaveParticipant}
        onInviteSkipped={effectiveIsHost ? handleInviteSkipped : undefined}
        onMoveToInvited={effectiveIsHost ? handleMoveToInvited : undefined}
        onRejoinAddToJoined={effectiveIsHost ? handleRejoinAddToJoined : undefined}
        onRejoinAddToWaitlist={effectiveIsHost ? handleRejoinAddToWaitlist : undefined}
        onRejoinRemoveFromPlan={effectiveIsHost ? handleRejoinRemoveFromPlan : undefined}
        isCompletedPlan={isCompletedPlan}
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
        onConfirm={handleConfirmHostReplacement}
        onClose={() => setShowHostLeaveReplacementSheet(false)}
      />

      {showUpdatePlanFeeModal && pendingCapacityTarget !== null && (
        <div
          onClick={() => {
            if (!isSubmittingPlanFeeUpdate) {
              setShowUpdatePlanFeeModal(false);
              setPendingCapacityTarget(null);
              setSelectedPlanFeeOption(null);
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
                    setSelectedPlanFeeOption(null);
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
