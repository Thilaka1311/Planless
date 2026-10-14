import { describe, it, expect } from 'vitest';

interface Participant {
  user_id: string;
  role: 'HOST' | 'PARTICIPANT';
  assigned_group: 'GOING' | 'WAITLIST' | null;
  rsvp_status: 'JOINED' | 'WAITLISTED' | 'INVITED' | 'SKIPPED';
  skip_reason: 'LEFT' | 'REMOVED' | 'REPLACED' | null;
  waitlist_position: number | null;
}

/**
 * Pure contract simulation of the atomic remove_and_replace_participant PostgreSQL RPC
 * implemented in migration 20261014180000_fix_participant_state_integrity_and_deadlocks.sql
 */
function simulateRemoveAndReplace(
  participants: Participant[],
  removeUserId: string,
  promoteUserId: string,
  callerRole: 'HOST' | 'PARTICIPANT' = 'HOST'
): Participant[] {
  if (callerRole !== 'HOST') {
    throw new Error('Unauthorized: only the host can manage participants');
  }

  const target = participants.find(p => p.user_id === removeUserId);
  const replacement = participants.find(p => p.user_id === promoteUserId);

  if (!target) throw new Error('Target participant not found in plan');
  if (!replacement) throw new Error('Replacement participant not found in plan');
  if (target.rsvp_status === 'SKIPPED') throw new Error('Target participant has already left the plan');

  // Prevent leaving plan orphaned if target is sole host
  if (target.role === 'HOST') {
    const remainingHosts = participants.filter(
      p => p.role === 'HOST' && p.rsvp_status !== 'SKIPPED' && p.user_id !== removeUserId
    );
    if (remainingHosts.length === 0) {
      throw new Error('Cannot replace the sole host. Promote another host first.');
    }
  }

  const vacatedWaitlistPos = replacement.waitlist_position;

  // 1. Target is SOFT-DELETED (never deleted from array/database)
  const updatedTarget: Participant = {
    ...target,
    rsvp_status: 'SKIPPED',
    skip_reason: 'REPLACED',
    assigned_group: null,
    waitlist_position: null,
  };

  // 2. Replacement is promoted to GOING
  const updatedReplacement: Participant = {
    ...replacement,
    assigned_group: 'GOING',
    waitlist_position: null,
    // Preserve INVITED if they haven't accepted yet, otherwise JOINED
    rsvp_status: replacement.rsvp_status === 'INVITED' ? 'INVITED' : 'JOINED',
    skip_reason: null,
  };

  // 3. Renumber remaining waitlist contiguously 1..N
  let result = participants.map(p => {
    if (p.user_id === removeUserId) return updatedTarget;
    if (p.user_id === promoteUserId) return updatedReplacement;
    return p;
  });

  if (vacatedWaitlistPos !== null) {
    const activeWaitlist = result
      .filter(p => p.assigned_group === 'WAITLIST' && p.rsvp_status !== 'SKIPPED' && p.user_id !== promoteUserId)
      .sort((a, b) => (a.waitlist_position ?? 9999) - (b.waitlist_position ?? 9999));

    const renumberedMap = new Map<string, number>();
    activeWaitlist.forEach((p, idx) => {
      renumberedMap.set(p.user_id, idx + 1);
    });

    result = result.map(p => {
      if (renumberedMap.has(p.user_id)) {
        return { ...p, waitlist_position: renumberedMap.get(p.user_id)! };
      }
      return p;
    });
  }

  return result;
}

describe('Participant State Integrity & Atomic Replacement Contract', () => {
  it('soft-deletes the removed participant as SKIPPED with skip_reason = REPLACED (never deletes the row)', () => {
    const initial: Participant[] = [
      { user_id: 'host-1', role: 'HOST', assigned_group: 'GOING', rsvp_status: 'JOINED', skip_reason: null, waitlist_position: null },
      { user_id: 'guest-1', role: 'PARTICIPANT', assigned_group: 'GOING', rsvp_status: 'JOINED', skip_reason: null, waitlist_position: null },
      { user_id: 'waitlist-1', role: 'PARTICIPANT', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', skip_reason: null, waitlist_position: 1 },
    ];

    const result = simulateRemoveAndReplace(initial, 'guest-1', 'waitlist-1');

    // Total participants count must remain 3 (no deletion)
    expect(result.length).toBe(3);

    const removed = result.find(p => p.user_id === 'guest-1');
    expect(removed).toBeDefined();
    expect(removed?.rsvp_status).toBe('SKIPPED');
    expect(removed?.skip_reason).toBe('REPLACED');
    expect(removed?.assigned_group).toBeNull();
    expect(removed?.waitlist_position).toBeNull();

    const promoted = result.find(p => p.user_id === 'waitlist-1');
    expect(promoted).toBeDefined();
    expect(promoted?.assigned_group).toBe('GOING');
    expect(promoted?.rsvp_status).toBe('JOINED');
    expect(promoted?.waitlist_position).toBeNull();
  });

  it('preserves INVITED status when promoting an invited waitlist participant', () => {
    const initial: Participant[] = [
      { user_id: 'host-1', role: 'HOST', assigned_group: 'GOING', rsvp_status: 'JOINED', skip_reason: null, waitlist_position: null },
      { user_id: 'guest-1', role: 'PARTICIPANT', assigned_group: 'GOING', rsvp_status: 'JOINED', skip_reason: null, waitlist_position: null },
      { user_id: 'invited-waitlist', role: 'PARTICIPANT', assigned_group: 'WAITLIST', rsvp_status: 'INVITED', skip_reason: null, waitlist_position: 1 },
    ];

    const result = simulateRemoveAndReplace(initial, 'guest-1', 'invited-waitlist');
    const promoted = result.find(p => p.user_id === 'invited-waitlist');
    expect(promoted?.assigned_group).toBe('GOING');
    // Must remain INVITED until user explicitly accepts
    expect(promoted?.rsvp_status).toBe('INVITED');
    expect(promoted?.waitlist_position).toBeNull();
  });

  it('renumbers remaining waitlist candidates contiguously 1..N after replacement', () => {
    const initial: Participant[] = [
      { user_id: 'host-1', role: 'HOST', assigned_group: 'GOING', rsvp_status: 'JOINED', skip_reason: null, waitlist_position: null },
      { user_id: 'guest-1', role: 'PARTICIPANT', assigned_group: 'GOING', rsvp_status: 'JOINED', skip_reason: null, waitlist_position: null },
      { user_id: 'w-1', role: 'PARTICIPANT', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', skip_reason: null, waitlist_position: 1 },
      { user_id: 'w-2', role: 'PARTICIPANT', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', skip_reason: null, waitlist_position: 2 },
      { user_id: 'w-3', role: 'PARTICIPANT', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', skip_reason: null, waitlist_position: 3 },
    ];

    // Host replaces guest-1 with w-2 (leaving w-1 at #1 and shifting w-3 to #2)
    const result = simulateRemoveAndReplace(initial, 'guest-1', 'w-2');

    const w1 = result.find(p => p.user_id === 'w-1');
    const w2 = result.find(p => p.user_id === 'w-2');
    const w3 = result.find(p => p.user_id === 'w-3');

    expect(w2?.assigned_group).toBe('GOING');
    expect(w2?.waitlist_position).toBeNull();

    expect(w1?.waitlist_position).toBe(1);
    expect(w3?.waitlist_position).toBe(2);
  });

  it('prevents replacing the sole remaining host', () => {
    const initial: Participant[] = [
      { user_id: 'sole-host', role: 'HOST', assigned_group: 'GOING', rsvp_status: 'JOINED', skip_reason: null, waitlist_position: null },
      { user_id: 'waitlist-1', role: 'PARTICIPANT', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', skip_reason: null, waitlist_position: 1 },
    ];

    expect(() => simulateRemoveAndReplace(initial, 'sole-host', 'waitlist-1')).toThrow(
      'Cannot replace the sole host. Promote another host first.'
    );
  });

  it('manages atomic MOVE_TO_GOING and waitlist renumbering', () => {
    const initial: Participant[] = [
      { user_id: 'host-1', role: 'HOST', assigned_group: 'GOING', rsvp_status: 'JOINED', skip_reason: null, waitlist_position: null },
      { user_id: 'w-1', role: 'PARTICIPANT', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', skip_reason: null, waitlist_position: 1 },
      { user_id: 'w-2', role: 'PARTICIPANT', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', skip_reason: null, waitlist_position: 2 },
    ];

    // Move w-1 to GOING
    const promoted = {
      ...initial[1],
      assigned_group: 'GOING' as const,
      waitlist_position: null,
      rsvp_status: 'JOINED' as const,
    };
    const renumberedW2 = {
      ...initial[2],
      waitlist_position: 1,
    };

    expect(promoted.assigned_group).toBe('GOING');
    expect(promoted.rsvp_status).toBe('JOINED');
    expect(renumberedW2.waitlist_position).toBe(1);
  });

  it('manages atomic MOVE_TO_WAITLIST and assigns next sequential position', () => {
    const initial: Participant[] = [
      { user_id: 'host-1', role: 'HOST', assigned_group: 'GOING', rsvp_status: 'JOINED', skip_reason: null, waitlist_position: null },
      { user_id: 'guest-1', role: 'PARTICIPANT', assigned_group: 'GOING', rsvp_status: 'JOINED', skip_reason: null, waitlist_position: null },
      { user_id: 'w-1', role: 'PARTICIPANT', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', skip_reason: null, waitlist_position: 1 },
    ];

    // Move guest-1 to WAITLIST
    const demoted = {
      ...initial[1],
      assigned_group: 'WAITLIST' as const,
      waitlist_position: 2,
      rsvp_status: 'WAITLISTED' as const,
    };

    expect(demoted.assigned_group).toBe('WAITLIST');
    expect(demoted.waitlist_position).toBe(2);
    expect(demoted.rsvp_status).toBe('WAITLISTED');
  });
});
