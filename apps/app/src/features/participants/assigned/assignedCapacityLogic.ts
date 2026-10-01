import { Friend } from '../shared/types';
import { getSavedDraftParticipants, DraftParticipantState } from '../../create/utils/draftParticipantStorage';

/**
 * Alphabetically sorts non-host going friends by name (case-insensitive).
 */
export const sortGoingFriends = (friends: Friend[]): Friend[] => {
  return [...friends].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  );
};

/**
 * Renumbers waitlist friends sequentially starting from 1.
 */
export const renumberWaitlist = (friends: Friend[]): Friend[] => {
  return friends.map((f, idx) => ({ ...f, waitlistPosition: idx + 1 }));
};

/**
 * Orders Joined participants in Assigned mode:
 * 1. Current user as "You" (always first).
 * 2. JOINED/ACCEPTED participants, sorted alphabetically A → Z.
 * 3. INVITED participants (not yet responded), sorted alphabetically A → Z.
 * 4. Host appears in slot 1 if not the current user.
 */
export const formatAssignedGoingList = <T extends Record<string, any>>(
  list: T[],
  activeUserId?: string
): T[] => {
  if (!list || list.length === 0) return [];

  const getName = (item: T): string =>
    item.name || (item as any).full_name || (item as any).username || '';

  const sortAlpha = (items: T[]) =>
    [...items].sort((a, b) =>
      getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' })
    );

  const activeId = activeUserId ? String(activeUserId).toLowerCase() : '';

  const currentUser = list.find((item) => {
    const isYou = item.name === 'You';
    const itemUserId = String(item.userId || item.dbUuid || item.id || (item as any).user_id || '').toLowerCase();
    return isYou || (Boolean(activeId) && itemUserId === activeId);
  });

  const host = list.find((item) => {
    return item.isHost === true || (item as any).role === 'HOST';
  });

  const isCurrentUserHost = Boolean(
    currentUser && (currentUser === host || currentUser.isHost || (currentUser as any).role === 'HOST')
  );

  const excluded = new Set<T>();
  if (currentUser) excluded.add(currentUser);
  if (host) excluded.add(host);

  const remaining = list.filter((item) => !excluded.has(item));

  // Classify each remaining participant by their RSVP status:
  // JOINED/ACCEPTED → first bucket; INVITED → second bucket
  const isJoined = (item: T): boolean => {
    const raw = String(
      item.rsvpStatus || (item as any).rsvp_status || (item as any).joinState || ''
    ).trim().toUpperCase();
    if (raw === 'JOINED' || raw === 'ACCEPTED' || raw === 'GOING' || raw === 'CONFIRMED') return true;
    if (raw === 'INVITED') return false;
    // Fallback: if no recognised status, treat as joined (backward compat)
    return true;
  };

  const joinedRemaining = sortAlpha(remaining.filter((item) => isJoined(item)));
  const invitedRemaining = sortAlpha(remaining.filter((item) => !isJoined(item)));
  const sortedRemaining = [...joinedRemaining, ...invitedRemaining];

  if (isCurrentUserHost) {
    return [
      { ...currentUser, name: 'You', isHost: true },
      ...sortedRemaining,
    ];
  }

  const result: T[] = [];
  if (currentUser) {
    result.push({ ...currentUser, name: 'You' });
  }
  if (host && host !== currentUser) {
    result.push(host);
  }
  result.push(...sortedRemaining);

  return result;
};

/**
 * Formats waitlist in Assigned mode:
 * - Preserves actual waitlist ordering/position.
 * - Does not alphabetically reorder the waitlist.
 * - Displays current user as "You" in their existing waitlist position.
 */
export const formatAssignedWaitlist = <T extends Record<string, any>>(
  list: T[],
  activeUserId?: string
): T[] => {
  if (!list || list.length === 0) return [];
  const activeId = activeUserId ? String(activeUserId).toLowerCase() : '';

  return list.map((item) => {
    const isYou = item.name === 'You';
    const itemUserId = String(item.userId || item.dbUuid || item.id || (item as any).user_id || '').toLowerCase();
    if (isYou || (Boolean(activeId) && itemUserId === activeId)) {
      return { ...item, name: 'You' };
    }
    return item;
  });
};

export interface ResolveAssignedParticipantsParams {
  userProfile?: any;
  isHostSelected?: boolean;
  selectedFriends: Friend[];
  priorityGuestIds?: string[];
  capacity?: number;
  isCapacityConfigured?: boolean;
  savedDraft?: DraftParticipantState | null;
}

export interface ResolvedAssignedParticipants {
  going: Friend[];
  waitlist: Friend[];
}

/**
 * Resolves the canonical Going and Waitlist lists for Assigned mode.
 * Strictly respects plan_size / capacity: Going cannot exceed capacity.
 * Host is never displaced and stays in Going.
 */
export function resolveAssignedParticipants(
  params: ResolveAssignedParticipantsParams
): ResolvedAssignedParticipants {
  const {
    userProfile,
    isHostSelected = true,
    selectedFriends = [],
    priorityGuestIds = [],
    capacity,
  } = params;

  const hostItem: Friend | null = isHostSelected
    ? {
        id: 'host',
        dbUuid: userProfile?.dbUuid || 'host',
        name: 'You',
        avatar: userProfile?.avatar || userProfile?.profile_photo || '',
        isHost: true,
      }
    : null;

  const hostArr = hostItem ? [hostItem] : [];
  const totalActive = (isHostSelected && hostItem ? 1 : 0) + selectedFriends.length;
  const maxGoing = capacity !== undefined && capacity > 0 ? Math.min(capacity, totalActive) : totalActive;
  const availableGuestSpots = Math.max(0, maxGoing - (hostItem ? 1 : 0));

  const friendMap = new Map<string, Friend>();
  selectedFriends.forEach((f) => {
    if (f.id) friendMap.set(String(f.id), f);
    if (f.dbUuid) friendMap.set(String(f.dbUuid), f);
  });

  const savedDraft = params.savedDraft !== undefined ? params.savedDraft : getSavedDraftParticipants();
  if (savedDraft?.joinedFriends) {
    savedDraft.joinedFriends.forEach((f) => {
      if (f.id && !friendMap.has(String(f.id))) friendMap.set(String(f.id), f);
      if (f.dbUuid && !friendMap.has(String(f.dbUuid))) friendMap.set(String(f.dbUuid), f);
    });
  }
  if (savedDraft?.waitlistFriends) {
    savedDraft.waitlistFriends.forEach((f) => {
      if (f.id && !friendMap.has(String(f.id))) friendMap.set(String(f.id), f);
      if (f.dbUuid && !friendMap.has(String(f.dbUuid))) friendMap.set(String(f.dbUuid), f);
    });
  }

  if (savedDraft && (savedDraft.joinedIds.length > 0 || savedDraft.waitlistIds.length > 0)) {
    const isHostInJoined = savedDraft.joinedIds.includes('host') || isHostSelected;
    const effectiveHost = isHostInJoined && hostItem ? [hostItem] : [];
    const hostCount = effectiveHost.length;
    const guestSpots = Math.max(0, maxGoing - hostCount);

    const goingGuests = savedDraft.joinedIds
      .filter((id) => id !== 'host' && friendMap.has(id))
      .map((id) => friendMap.get(id)!);

    const goingIdSet = new Set(goingGuests.map((f) => f.id));
    const waitGuests = savedDraft.waitlistIds
      .filter((id) => id !== 'host' && friendMap.has(id) && !goingIdSet.has(id))
      .map((id) => friendMap.get(id)!);

    const allocatedIds = new Set([...goingIdSet, ...waitGuests.map((f) => f.id)]);
    const unallocatedGuests = selectedFriends.filter((f) => !allocatedIds.has(f.id) && !f.isHost);

    let finalGoingGuests: Friend[] = [];
    let finalWaitGuests: Friend[] = [];

    if (goingGuests.length > guestSpots) {
      finalGoingGuests = goingGuests.slice(0, guestSpots);
      const overflowToWait = goingGuests.slice(guestSpots).map((f) => ({
        ...f,
        assignedGroup: 'WAITLIST' as const,
        rsvpStatus: f.rsvpStatus === 'JOINED' ? ('WAITLISTED' as const) : f.rsvpStatus,
      }));
      finalWaitGuests = [...overflowToWait, ...waitGuests, ...unallocatedGuests];
    } else {
      finalGoingGuests = [...goingGuests];
      const remainingSpots = guestSpots - finalGoingGuests.length;
      const promoteFromWait = waitGuests.slice(0, remainingSpots).map((f) => ({
        ...f,
        waitlistPosition: undefined,
        assignedGroup: 'GOING' as const,
        rsvpStatus: f.rsvpStatus === 'WAITLISTED' ? ('JOINED' as const) : f.rsvpStatus,
      }));
      finalGoingGuests.push(...promoteFromWait);
      const remainingWait = waitGuests.slice(remainingSpots);

      const stillRemainingSpots = guestSpots - finalGoingGuests.length;
      const fillFromUnallocated = unallocatedGuests.slice(0, stillRemainingSpots);
      finalGoingGuests.push(...fillFromUnallocated);

      const remainingUnallocated = unallocatedGuests.slice(stillRemainingSpots);
      finalWaitGuests = [...remainingWait, ...remainingUnallocated];
    }

    return {
      going: [...effectiveHost, ...sortGoingFriends(finalGoingGuests)],
      waitlist: renumberWaitlist(finalWaitGuests),
    };
  }

  if (priorityGuestIds && priorityGuestIds.length > 0) {
    const prioritySet = new Set(priorityGuestIds);
    const priorityGuests = selectedFriends.filter((f) => prioritySet.has(f.id));
    const nonPriorityGuests = selectedFriends.filter((f) => !prioritySet.has(f.id));

    const goingGuests = priorityGuests.slice(0, availableGuestSpots);
    const overflowPriority = priorityGuests.slice(availableGuestSpots).map((f) => ({
      ...f,
      assignedGroup: 'WAITLIST' as const,
      rsvpStatus: f.rsvpStatus === 'JOINED' ? ('WAITLISTED' as const) : f.rsvpStatus,
    }));
    const remainingSpots = availableGuestSpots - goingGuests.length;
    const fillFromNonPriority = nonPriorityGuests.slice(0, remainingSpots);
    const remainingNonPriority = nonPriorityGuests.slice(remainingSpots);
    const waitGuests = [...overflowPriority, ...remainingNonPriority];

    return {
      going: [...hostArr, ...sortGoingFriends([...goingGuests, ...fillFromNonPriority])],
      waitlist: renumberWaitlist(waitGuests),
    };
  }

  const sortedGuests = sortGoingFriends(selectedFriends);
  const goingGuests = sortedGuests.slice(0, availableGuestSpots);
  const waitGuests = sortedGuests.slice(availableGuestSpots);

  return {
    going: [...hostArr, ...sortGoingFriends(goingGuests)],
    waitlist: renumberWaitlist(waitGuests),
  };
}

export interface AdjustAssignedCapacityResult {
  nextGoing: Friend[];
  nextWaitlist: Friend[];
  nextCapacity: number;
}

/**
 * Handles capacity adjustment for Assigned participant mode.
 * - Increasing capacity promotes waitlisted participants in strict queue order (#1, #2...).
 * - Decreasing capacity demotes alphabetically last non-host going friend(s) to waitlist.
 * - Host is never displaced.
 * - Waitlist is renumbered contiguously.
 */
export function adjustAssignedCapacity(
  currentGoing: Friend[],
  currentWaitlist: Friend[],
  targetCapacity: number,
  totalInvitedCount: number
): AdjustAssignedCapacityResult | null {
  const boundedCap = Math.min(totalInvitedCount, Math.max(2, targetCapacity));
  const currentCap = currentGoing.length;

  if (boundedCap === currentCap) {
    return {
      nextGoing: currentGoing,
      nextWaitlist: currentWaitlist,
      nextCapacity: currentCap,
    };
  }

  const hostPart = currentGoing.filter((f) => f.isHost);
  const nonHostGoing = currentGoing.filter((f) => !f.isHost);

  if (boundedCap > currentCap) {
    const spotsToPromote = Math.min(boundedCap - currentCap, currentWaitlist.length);
    const promoted = currentWaitlist.slice(0, spotsToPromote).map((f) => ({
      ...f,
      waitlistPosition: undefined,
      assignedGroup: 'GOING' as const,
      rsvpStatus: f.rsvpStatus === 'WAITLISTED' ? ('JOINED' as const) : f.rsvpStatus,
    }));
    const remainingWaitlist = renumberWaitlist(currentWaitlist.slice(spotsToPromote));
    const nextGoing = [...hostPart, ...sortGoingFriends([...nonHostGoing, ...promoted])];

    return {
      nextGoing,
      nextWaitlist: remainingWaitlist,
      nextCapacity: nextGoing.length,
    };
  } else {
    const spotsToDemote = currentCap - boundedCap;
    const sortedNonHost = sortGoingFriends(nonHostGoing);
    if (sortedNonHost.length === 0) return null;

    const actualNumToDemote = Math.min(spotsToDemote, sortedNonHost.length);
    const demoted = sortedNonHost.slice(sortedNonHost.length - actualNumToDemote).map((f) => ({
      ...f,
      assignedGroup: 'WAITLIST' as const,
      rsvpStatus: f.rsvpStatus === 'JOINED' ? ('WAITLISTED' as const) : f.rsvpStatus,
    }));
    const demotedSet = new Set(demoted.map((f) => f.id));

    const keptNonHost = sortedNonHost.filter((f) => !demotedSet.has(f.id));
    const nextGoing = [...hostPart, ...keptNonHost];
    const nextWaitlist = renumberWaitlist([...currentWaitlist, ...demoted]);

    return {
      nextGoing,
      nextWaitlist,
      nextCapacity: nextGoing.length,
    };
  }
}

export interface IncrementAssignedPlanSizeParams {
  capacity?: number;
  totalInvitedCount: number;
  goingList: Friend[];
  waitlist: Friend[];
}

export type IncrementAssignedPlanSizeResult = AdjustAssignedCapacityResult;

/**
 * Handles incrementing plan size for Assigned participant mode.
 * Promotes waitlist[0] to Going, re-sorts non-host going friends alphabetically,
 * and renumbers the remaining waitlist.
 */
export function incrementAssignedPlanSize(
  params: IncrementAssignedPlanSizeParams
): IncrementAssignedPlanSizeResult | null {
  const { capacity, totalInvitedCount, goingList, waitlist } = params;
  const currentCap = capacity ?? goingList.length;
  if (currentCap >= totalInvitedCount || waitlist.length === 0) return null;
  return adjustAssignedCapacity(goingList, waitlist, currentCap + 1, totalInvitedCount);
}

export interface DecrementAssignedPlanSizeParams {
  capacity?: number;
  goingList: Friend[];
  waitlist: Friend[];
}

export type DecrementAssignedPlanSizeResult = AdjustAssignedCapacityResult;

/**
 * Handles decrementing plan size for Assigned participant mode.
 * Demotes the alphabetically last non-host going friend to the end of the waitlist,
 * and renumbers the waitlist.
 */
export function decrementAssignedPlanSize(
  params: DecrementAssignedPlanSizeParams
): DecrementAssignedPlanSizeResult | null {
  const { capacity, goingList, waitlist } = params;
  const currentCap = capacity ?? goingList.length;
  if (currentCap <= 2) return null;
  return adjustAssignedCapacity(goingList, waitlist, currentCap - 1, goingList.length + waitlist.length);
}
