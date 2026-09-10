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
 * Matches the authoritative initialization logic from AssignedParticipantScreen.
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
    isCapacityConfigured = false,
  } = params;

  const hostItem: Friend | null = isHostSelected
    ? {
        id: 'host',
        dbUuid: userProfile?.dbUuid || 'host',
        name: userProfile?.name || 'You',
        avatar: userProfile?.avatar || userProfile?.profile_photo || '',
        isHost: true,
      }
    : null;

  const hostArr = hostItem ? [hostItem] : [];
  const isConfigured = Boolean(isCapacityConfigured && capacity !== undefined);
  const savedDraft = params.savedDraft !== undefined ? params.savedDraft : getSavedDraftParticipants();

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

    const hostCount = (savedDraft.joinedIds.includes('host') || isHostSelected) && hostItem ? 1 : 0;
    const goingGuestCount = savedDraft.joinedIds.filter((id) => id !== 'host' && friendMap.has(id)).length;
    const totalGoingCount = hostCount + goingGuestCount;

    let restoredWait = waitGuests;
    if (unallocatedGuests.length > 0 && capacity !== undefined) {
      const availableCapacity = Math.max(0, capacity - totalGoingCount);
      const toWait = unallocatedGuests.slice(availableCapacity);
      restoredWait = [...restoredWait, ...toWait];
    }

    return {
      going: restoredGoing,
      waitlist: renumberWaitlist(restoredWait),
    };
  }

  if (priorityGuestIds && priorityGuestIds.length > 0) {
    const prioritySet = new Set(priorityGuestIds);
    const goingFriends = sortGoingFriends(selectedFriends.filter((f) => prioritySet.has(f.id)));
    const waitFriends = renumberWaitlist(selectedFriends.filter((f) => !prioritySet.has(f.id)));
    return {
      going: [...hostArr, ...goingFriends],
      waitlist: waitFriends,
    };
  }

  const sortedGuests = sortGoingFriends(selectedFriends);
  const allList = [...hostArr, ...sortedGuests];
  const effectiveCap = isConfigured && capacity !== undefined && capacity < allList.length ? capacity : allList.length;

  return {
    going: allList.slice(0, effectiveCap),
    waitlist: renumberWaitlist(allList.slice(effectiveCap)),
  };
}

export interface IncrementAssignedPlanSizeParams {
  capacity?: number;
  totalInvitedCount: number;
  goingList: Friend[];
  waitlist: Friend[];
}

export interface IncrementAssignedPlanSizeResult {
  nextGoing: Friend[];
  nextWaitlist: Friend[];
  nextCapacity: number;
}

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
  if (currentCap >= totalInvitedCount) return null;

  if (waitlist.length > 0) {
    const promoted = waitlist[0];
    const nextWait = renumberWaitlist(waitlist.slice(1));
    const hostPart = goingList.filter((f) => f.isHost);
    const guestPart = goingList.filter((f) => !f.isHost && f.id !== promoted.id);
    const nextGoing = [...hostPart, ...sortGoingFriends([...guestPart, { ...promoted, waitlistPosition: undefined }])];
    const nextCapacity = Math.min(nextGoing.length, totalInvitedCount);

    return {
      nextGoing,
      nextWaitlist: nextWait,
      nextCapacity,
    };
  }

  return null;
}

export interface DecrementAssignedPlanSizeParams {
  capacity?: number;
  goingList: Friend[];
  waitlist: Friend[];
}

export interface DecrementAssignedPlanSizeResult {
  nextGoing: Friend[];
  nextWaitlist: Friend[];
  nextCapacity: number;
}

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

  if (currentCap > goingList.length) {
    return {
      nextGoing: goingList,
      nextWaitlist: waitlist,
      nextCapacity: currentCap - 1,
    };
  }

  const nonHostGoing = sortGoingFriends(goingList.filter((f) => !f.isHost));
  if (nonHostGoing.length === 0 || goingList.length <= 2) return null;

  const demoted = nonHostGoing[nonHostGoing.length - 1];

  const nextGoing = goingList.filter((f) => f.id !== demoted.id);
  const nextWait = renumberWaitlist([...waitlist.filter((f) => f.id !== demoted.id), demoted]);

  return {
    nextGoing,
    nextWaitlist: nextWait,
    nextCapacity: nextGoing.length,
  };
}
