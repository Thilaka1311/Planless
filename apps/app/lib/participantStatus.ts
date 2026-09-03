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
  const joinedMembers: T[] = [];
  const waitlistedMembers: T[] = [];
  const unacceptedMembers: T[] = [];
  const rejoinedMembers: T[] = [];

  for (const m of members) {
    const status = normalizeStatus(m.rsvp_status || m.joinState || m.rsvpStatus);
    if (status === 'SKIPPED') {
      skippedMembers.push(m);
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

  const sortByTimestamp = (items: T[]) => {
    return [...items].sort((a, b) => {
      const qA = a.joined_queue_at || a.joinedQueueAt || a.created_at || a.createdAt;
      const qB = b.joined_queue_at || b.joinedQueueAt || b.created_at || b.createdAt;
      const timeA = qA ? new Date(qA).getTime() : Number.MAX_SAFE_INTEGER;
      const timeB = qB ? new Date(qB).getTime() : Number.MAX_SAFE_INTEGER;
      if (timeA !== timeB) return timeA - timeB;
      const nameA = a.name || a.full_name || '';
      const nameB = b.name || b.full_name || '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  };

  const sortAlpha = (items: T[]) => {
    return [...items].sort((a, b) => {
      const nameA = a.name || a.full_name || '';
      const nameB = b.name || b.full_name || '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  };

  const sortedJoined = sortByTimestamp(joinedMembers);
  const sortedWaitlist = sortByTimestamp(waitlistedMembers);
  const sortedUnaccepted = sortAlpha(unacceptedMembers);
  const sortedRejoined = sortByTimestamp(rejoinedMembers);

  const isFull = cap > 0 && sortedJoined.length >= cap;

  let finalGoingRaw: T[] = [];
  let finalWaitlistRaw: T[] = [];

  if (!isFull) {
    // Capacity NOT reached: All non-skipped participants are in Going/Invited; REJOINED participants are in Waitlist (dimmed/subdued).
    finalGoingRaw = [...sortedJoined, ...sortedWaitlist, ...sortedUnaccepted];
    finalWaitlistRaw = [...sortedRejoined];
  } else {
    // Capacity REACHED: Joined participants fill Going. Overflow participants (Waitlisted + Invited + Rejoined) go to Waitlist.
    // REJOINED participants placed after accepted waitlisted members and before unaccepted invited members.
    finalGoingRaw = [...sortedJoined];
    finalWaitlistRaw = [...sortedWaitlist, ...sortedRejoined, ...sortedUnaccepted];
  }

  return {
    going: sortGoingParticipants(finalGoingRaw, activeUserId),
    waitlist: finalWaitlistRaw,
    skipped: sortGoingParticipants(skippedMembers, activeUserId),
    goingJoinedCount: sortedJoined.length,
    capacity: cap,
  };
}



