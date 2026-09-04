/**
 * participantStatus.ts — Shared participant-status mapping and classification logic.
 * Supabase participant status is the single source of truth for the entire application.
 *
 * Canonical rsvp_status enum (DB and UI layers share the same values):
 *   JOINED      — participant confirmed their spot
 *   WAITLISTED  — on the waitlist
 *   SKIPPED     — declined or left the plan
 *   INVITED     — invited but not yet responded
 */

import { DbPlanParticipant, PlanState } from "../src/core/types";

export function normalizeStatus(rsvpStatus: string | undefined): PlanState {
  if (!rsvpStatus) return "INVITED";

  const upper = rsvpStatus.toUpperCase();

  if (upper === "JOINED") return "JOINED";
  if (upper === "SKIPPED") return "SKIPPED";
  if (upper === "WAITLISTED") return "WAITLISTED";
  if (upper === "INVITED") return "INVITED";
  if (upper === "REJOINED") return "REJOINED";

  // Treat any unrecognised value as INVITED (pending/unresponded)
  return "INVITED";
}

/**
 * Formats raw skip_reason strings (e.g. "REMOVED", "LEFT", "REPLACED", "PAYMENT_KEPT")
 * into clean user-facing labels ("Removed", "Left", "Replaced", "Payment Kept").
 */
export function formatSkipReason(reason?: string | null): string {
  if (!reason) return '';
  const raw = String(reason).trim();
  if (!raw) return '';

  const upper = raw.toUpperCase();

  switch (upper) {
    case 'REMOVED':
      return 'Removed';
    case 'LEFT':
      return 'Left';
    case 'REPLACED':
      return 'Replaced';
    case 'PAYMENT_KEPT':
    case 'PAYMENT KEPT':
    case 'PAYMENTKEPT':
      return 'Payment Kept';
    case 'SKIPPED':
      return 'Skipped';
    case 'DECLINED':
      return 'Declined';
    default:
      return raw
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, char => char.toUpperCase());
  }
}

export type EffectiveParticipantState = 'GOING' | 'WAITLIST' | 'SKIPPED' | 'INVITED';

/**
 * Determines the effective participant state from the participant item and contextual tab.
 */
export function getEffectiveParticipantState(
  item: { rsvpStatus?: string; assignedGroup?: string; skipReason?: string | null; [key: string]: any } | null,
  sheetType?: string | null
): EffectiveParticipantState {
  if (!item) return 'INVITED';

  const rawSheetType = sheetType ? String(sheetType).toLowerCase() : '';

  // 1. Explicit contextual location takes priority:
  if (rawSheetType === 'going') return 'GOING';
  if (rawSheetType === 'waitlist') return 'WAITLIST';
  if (rawSheetType === 'skipped') return 'SKIPPED';
  if (rawSheetType === 'invited') return 'INVITED';

  // 2. Fallback to raw DB attributes if sheetType is unprovided:
  const rawSkipReason = item.skipReason ? String(item.skipReason).toUpperCase() : '';
  const rawRsvpStatus = item.rsvpStatus ? String(item.rsvpStatus).toUpperCase() : '';
  const rawAssignedGroup = item.assignedGroup ? String(item.assignedGroup).toUpperCase() : '';

  if (
    rawRsvpStatus === 'SKIPPED' ||
    rawSkipReason === 'REMOVED' ||
    rawSkipReason === 'SKIPPED'
  ) {
    return 'SKIPPED';
  }

  if (rawAssignedGroup === 'WAITLIST' || rawRsvpStatus === 'WAITLISTED' || rawRsvpStatus === 'REJOINED') {
    return 'WAITLIST';
  }

  if (rawRsvpStatus === 'JOINED' || rawAssignedGroup === 'GOING') {
    return 'GOING';
  }

  return 'INVITED';
}

/**
 * Resolves standard categories/counts from a list of participant rows.
 */
export interface ParticipantBreakdown {
  host: number;
  joined: number;
  waitlisted: number;
  invited: number;
  skipped: number;
  passed: number;
  pending: number;
  total: number;
}

export function calculateParticipantBreakdown(rows: DbPlanParticipant[]): ParticipantBreakdown {
  const normalized = rows.map(r => ({ ...r, status: normalizeStatus(r.rsvp_status) }));

  const host = 0;
  const joined = normalized.filter(r => r.status === "JOINED").length;
  const waitlisted = normalized.filter(r => r.status === "WAITLISTED").length;
  const invited = normalized.filter(r => r.status === "INVITED").length;
  const skipped = normalized.filter(r => r.status === "SKIPPED" || r.status === "REJOINED").length;
  const passed = skipped;
  const pending = invited;
  const total = normalized.filter(r => ["JOINED", "WAITLISTED", "INVITED"].includes(r.status)).length;

  return { host, joined, waitlisted, invited, skipped, passed, pending, total };
}


/**
 * Standard utility to parse string times (e.g. "08:30 PM") into absolute minutes for sorting.
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const match24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    return hours * 60 + minutes;
  }
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) {
    const genericMatch = timeStr.match(/(\d{1,2})[.:](\d{2})/);
    if (genericMatch) {
      return parseInt(genericMatch[1], 10) * 60 + parseInt(genericMatch[2], 10);
    }
    return 0;
  }
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === "AM" && hours === 12) hours = 0;
  if (ampm === "PM" && hours < 12) hours += 12;
  return hours * 60 + minutes;
}

export interface SortableParticipantEntry {
  name?: string;
  userId?: string;
  dbUuid?: string;
  id?: string;
  isAccepted?: boolean;
  [key: string]: any;
}

/**
 * Shared ordering helper for the Going/Joined section across Inline Participant Toggle and Participant Management screen.
 * Ordering rules:
 * 1. You / current user (always first at index 0, regardless of RSVP state).
 * 2. Joined/accepted participants (isAccepted !== false) sorted alphabetically A -> Z.
 * 3. Invited participants (isAccepted === false) sorted alphabetically A -> Z.
 */
export function sortGoingParticipants<T extends SortableParticipantEntry>(
  list: T[],
  activeUserId?: string
): T[] {
  if (!list || list.length === 0) return [];

  const sortAlpha = (items: T[]) =>
    [...items].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );

  const currentUser = list.find((item) => {
    const isYou = item.name === 'You';
    const itemUserId = String(item.userId || item.dbUuid || item.id || '').toLowerCase();
    const activeId = activeUserId ? String(activeUserId).toLowerCase() : '';
    return isYou || (Boolean(activeId) && itemUserId === activeId);
  });

  const remaining = list.filter((item) => item !== currentUser);

  const joinedList = remaining.filter((item) => item.isAccepted !== false);
  const invitedList = remaining.filter((item) => item.isAccepted === false);

  const joinedSorted = sortAlpha(joinedList);
  const invitedSorted = sortAlpha(invitedList);

  return [
    ...(currentUser ? [{ ...currentUser, name: 'You' }] : []),
    ...joinedSorted,
    ...invitedSorted,
  ];
}

/**
 * Checks whether a plan has a valid waitlisted replacement available to fill a vacant spot.
 * 
 * For ASSIGNED mode:
 * - Finds the participant row where assigned_group = 'WAITLIST' AND waitlist_position = 1.
 * - Checks their ACTUAL current RSVP state (normalizeStatus).
 * - Returns true ONLY if position #1 participant has actually joined the waitlist (status === 'WAITLISTED').
 * - Returns false if position #1 is INVITED, SKIPPED, or missing/non-existent.
 * 
 * For AUTOMATIC mode:
 * - Checks if there is any active waitlisted participant with rsvp_status === 'WAITLISTED'.
 */
export interface WaitlistReplacementResult {
  hasReplacement: boolean;
  candidate: any | null;
}

export function checkHasValidWaitlistReplacement(
  freshParticipants: any[] | undefined | null,
  mode?: string
): WaitlistReplacementResult {
  if (!freshParticipants || freshParticipants.length === 0) {
    return { hasReplacement: false, candidate: null };
  }

  const normalizedMode = String(mode || 'AUTOMATIC').trim().toUpperCase();

  if (normalizedMode === 'ASSIGNED') {
    // 1. Find participant assigned_group == 'WAITLIST' and waitlist_position == 1
    const pos1Participant = freshParticipants.find((pp: any) => {
      const group = String(pp.assigned_group || pp.assignedGroup || '').trim().toUpperCase();
      const pos = pp.waitlist_position ?? pp.waitlistPosition;
      return group === 'WAITLIST' && Number(pos) === 1;
    });

    if (!pos1Participant) {
      return { hasReplacement: false, candidate: null };
    }

    // 2. Check canonical accepted state: not INVITED and not SKIPPED
    const status = normalizeStatus(pos1Participant.rsvp_status || pos1Participant.joinState);
    const isActuallyWaitlisted = status !== 'INVITED' && status !== 'SKIPPED';

    return {
      hasReplacement: isActuallyWaitlisted,
      candidate: pos1Participant
    };
  } else {
    // AUTOMATIC mode:
    const activeWaitlisted = freshParticipants.filter((pp: any) => {
      const status = normalizeStatus(pp.rsvp_status || pp.joinState);
      return status === 'WAITLISTED';
    });

    const candidate = activeWaitlisted.length > 0 ? activeWaitlisted[0] : null;

    return {
      hasReplacement: activeWaitlisted.length > 0,
      candidate
    };
  }
}

export interface AutomaticParticipantPartition<T = any> {
  going: T[];
  waitlist: T[];
  skipped: T[];
  goingJoinedCount: number;
  capacity: number;
}

/**
 * Shared, centralized helper for calculating Automatic Waitlist participant states.
 * Enforces strict first-come, first-served capacity allocation:
 * 1. SKIPPED participants always go to Skipped.
 * 2. Accepted/JOINED participants fill Going spots up to capacity (ordered chronologically).
 * 3. Remaining accepted participants beyond capacity go to Waitlist.
 * 4. INVITED participants fill any remaining Going spots if capacity > joined count (rendered dimmed).
 * 5. When capacity is full, INVITED participants go to Waitlist (rendered dimmed).
 */
export function partitionAutomaticParticipants<T extends Record<string, any>>(
  members: T[],
  capacity: number,
  activeUserId?: string
): AutomaticParticipantPartition<T> {
  const cap = Math.max(0, capacity || 0);

  const skippedMembers: T[] = [];
  const hostMembers: T[] = [];
  const joinedMembers: T[] = [];
  const waitlistedMembers: T[] = [];
  const unacceptedMembers: T[] = [];
  const rejoinedMembers: T[] = [];

  for (const m of members) {
    const isHostRole = m.isHost === true || m.role === 'HOST';
    const status = normalizeStatus(m.rsvp_status || m.joinState || m.rsvpStatus);

    if (status === 'SKIPPED') {
      skippedMembers.push(m);
    } else if (isHostRole) {
      hostMembers.push(m);
    } else if (status === 'JOINED') {
      joinedMembers.push(m);
    } else if (status === 'WAITLISTED') {
      waitlistedMembers.push(m);
    } else if (status === 'REJOINED') {
      rejoinedMembers.push(m);
    } else {
      unacceptedMembers.push(m);
    }
  }

  // Helper to get parsed timestamp from join_queue_at without inventing timestamps
  const getQueueTimestamp = (m: T): number | null => {
    const raw = m.join_queue_at || m.joinQueueAt || m.joined_queue_at || m.joinedQueueAt;
    if (!raw) return null;
    const t = new Date(raw).getTime();
    return isNaN(t) ? null : t;
  };

  // Helper to put "You" / active user at index 0 of an array, if present
  const prioritizeYou = <U extends Record<string, any>>(items: U[]): U[] => {
    const currentUser = items.find((item) => {
      const isYou = item.name === 'You';
      const itemUserId = String(item.userId || item.dbUuid || item.id || (item as any).user_id || '').toLowerCase();
      const activeId = activeUserId ? String(activeUserId).toLowerCase() : '';
      return isYou || (Boolean(activeId) && itemUserId === activeId);
    });
    if (!currentUser) return items;
    const remaining = items.filter((item) => item !== currentUser);
    return [{ ...currentUser, name: 'You' }, ...remaining];
  };

  // First-Come, First-Served (FCFS) priority comparator for determining who gets the available slots:
  // 1. Host(s) always take highest priority in Going
  // 2. Earlier join_queue_at = higher priority
  // 3. Fallback: Alphabetical name ordering
  const sortFCFS = (items: T[]) => {
    return [...items].sort((a, b) => {
      const aIsHost = a.isHost === true || a.role === 'HOST';
      const bIsHost = b.isHost === true || b.role === 'HOST';
      if (aIsHost && !bIsHost) return -1;
      if (!aIsHost && bIsHost) return 1;

      const timeA = getQueueTimestamp(a);
      const timeB = getQueueTimestamp(b);

      if (timeA !== null && timeB !== null && timeA !== timeB) {
        return timeA - timeB;
      }
      if (timeA !== null && timeB === null) return -1;
      if (timeA === null && timeB !== null) return 1;

      const nameA = a.name || a.full_name || a.username || '';
      const nameB = b.name || b.full_name || b.username || '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  };

  const sortAlpha = (items: T[]) => {
    return [...items].sort((a, b) => {
      const nameA = a.name || a.full_name || a.username || '';
      const nameB = b.name || b.full_name || b.username || '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  };

  // Participants who have actively joined / accepted:
  const allJoinedMembers = [
    ...hostMembers,
    ...joinedMembers,
    ...waitlistedMembers,
    ...rejoinedMembers,
  ];

  const joinedCount = allJoinedMembers.length;

  // RULE 4: WHEN PLAN SIZE HAS NOT BEEN REACHED (cap <= 0 || joinedCount < cap)
  // - Do NOT create a separate Waitlist section.
  // - Everyone who has joined should appear in the Joined section.
  // - Everyone who is still invited should appear below the Joined participants.
  // - Joined participants are alphabetical, with "You" always first.
  // - Invited participants are alphabetical.
  // - NO numbers should be displayed anywhere.
  if (cap <= 0 || joinedCount < cap) {
    const alphaJoined = sortAlpha(allJoinedMembers).map((item) => ({
      ...item,
      joinedQueueNumber: null,
      waitlistPosition: null,
      isAccepted: true,
    }));

    const alphaUnaccepted = sortAlpha(unacceptedMembers).map((item) => ({
      ...item,
      joinedQueueNumber: null,
      waitlistPosition: null,
      isAccepted: false,
    }));

    const going = [...prioritizeYou(alphaJoined), ...prioritizeYou(alphaUnaccepted)];

    return {
      going,
      waitlist: [],
      skipped: sortAlpha(skippedMembers),
      goingJoinedCount: joinedCount,
      capacity: cap,
    };
  }

  // RULE 1, 2, 3, 5: WHEN PLAN SIZE IS REACHED (joinedCount >= cap):
  // Automatic waitlist separation becomes active.
  //
  // 1. Determine who gets the available slots:
  //    - First `capacity` people by join_queue_at (FCFS) → Joined.
  //    - Earlier join_queue_at = higher priority.
  const sortedJoined = sortFCFS(allJoinedMembers);
  const goingSelected = sortedJoined.slice(0, cap);

  // 2. JOINED SECTION:
  //    - The Joined section must NEVER show queue numbers.
  //    - Do not show #1, #2, #3, etc. next to joined participants.
  //    - Always arrange everyone in the Joined section alphabetically by participant name.
  //    - EXCEPT: current user ("You") must always appear at the very top.
  //    - After "You", sort all other joined participants alphabetically.
  const goingAlphabetical = sortAlpha(goingSelected).map((item) => ({
    ...item,
    joinedQueueNumber: null,
    waitlistPosition: null,
    isAccepted: true,
  }));
  const finalGoing = prioritizeYou(goingAlphabetical);

  // 3. WAITLIST SECTION:
  //    - The Waitlist section is where queue numbers MUST be displayed.
  //    - Split into two logical groups:
  //      A. Participants who have actually joined/responded and therefore have a join_queue_at value:
  //         - Sort them by join_queue_at ascending (earliest join = first).
  //         - Display queue numbers #1, #2, #3, etc. based on that order.
  //         - These numbers represent their position in the waitlist.
  //      B. Participants who are still Invited and have NOT joined/responded (or have no valid join_queue_at):
  //         - They have no join_queue_at.
  //         - Do NOT assign them queue numbers.
  //         - Put them BELOW the numbered waitlisted participants.
  //         - Sort these invited people alphabetically.
  const overflowJoined = sortedJoined.slice(cap);

  const validJoinedWaitlist = overflowJoined.filter((item) => getQueueTimestamp(item) !== null);
  const invalidJoinedWaitlist = overflowJoined.filter((item) => getQueueTimestamp(item) === null);

  // Group A: Sort by join_queue_at ASC
  const sortedValidWaitlist = [...validJoinedWaitlist].sort((a, b) => {
    const tA = getQueueTimestamp(a)!;
    const tB = getQueueTimestamp(b)!;
    if (tA !== tB) return tA - tB;
    const nameA = a.name || a.full_name || a.username || '';
    const nameB = b.name || b.full_name || b.username || '';
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
  });

  // Assign waitlist numbers #1, #2, #3... to Group A
  const numberedWaitlist = sortedValidWaitlist.map((item, idx) => ({
    ...item,
    waitlistPosition: idx + 1,
    joinedQueueNumber: null,
    isAccepted: true,
  }));

  // Group B: Still-invited participants & any joiner without valid join_queue_at
  const unnumberedInvited = sortAlpha([...invalidJoinedWaitlist, ...unacceptedMembers]).map((item) => ({
    ...item,
    waitlistPosition: null,
    joinedQueueNumber: null,
    isAccepted: false,
  }));

  const finalWaitlist = [
    ...numberedWaitlist,
    ...unnumberedInvited,
  ];

  const goingJoinedCount = goingSelected.length;

  return {
    going: finalGoing,
    waitlist: finalWaitlist,
    skipped: sortAlpha(skippedMembers),
    goingJoinedCount,
    capacity: cap,
  };
}



