import { describe, it, expect } from 'vitest';
import { calculateParticipantBreakdown } from '../../../../../lib/participantStatus';

interface DbParticipant {
  user_id: string;
  plan_id: string;
  role: 'HOST' | 'PARTICIPANT';
  rsvp_status: 'JOINED' | 'WAITLISTED' | 'INVITED' | 'SKIPPED' | 'REJOINED';
  assigned_group: 'GOING' | 'WAITLIST' | null;
  waitlist_position: number | null;
  skip_reason?: 'REMOVED' | 'LEFT' | 'CANCELLED' | 'PAYMENT_KEPT' | null;
  leave_requested?: boolean;
}

/**
 * Pure simulation of the canonical Assigned mode remove_participant RPC and
 * auto_promote_waitlist_for_assigned logic.
 */
function simulateRemoveParticipant(
  planId: string,
  targetUserId: string,
  participants: DbParticipant[],
  planSize: number | null
): {
  updatedParticipants: DbParticipant[];
  promotedCount: number;
} {
  const target = participants.find(p => p.plan_id === planId && p.user_id === targetUserId);
  if (!target) {
    throw new Error('Participant not found');
  }

  const targetAssignedGroup = target.assigned_group;

  // 1. Participant being removed: SKIPPED + REMOVED, cleared assigned_group & waitlist_position
  let list = participants.map(p => {
    if (p.plan_id === planId && p.user_id === targetUserId) {
      return {
        ...p,
        rsvp_status: 'SKIPPED' as const,
        skip_reason: 'REMOVED' as const,
        assigned_group: null,
        waitlist_position: null,
        leave_requested: false,
      };
    }
    return p;
  });

  let promotedCount = 0;

  // 2. Promotion check: If vacated group was GOING and spots available
  if (targetAssignedGroup === 'GOING' && planSize !== null && planSize > 0) {
    const currentGoing = list.filter(
      p => p.plan_id === planId && p.assigned_group === 'GOING' && p.rsvp_status !== 'SKIPPED'
    ).length;

    const availableSpots = Math.max(0, planSize - currentGoing);

    if (availableSpots > 0) {
      // Find eligible candidates in waitlist order
      // Candidates can be WAITLISTED, REJOINED, or INVITED
      const eligibleCandidates = list
        .filter(
          p =>
            p.plan_id === planId &&
            p.assigned_group === 'WAITLIST' &&
            p.rsvp_status !== 'SKIPPED'
        )
        .sort((a, b) => (a.waitlist_position ?? 9999) - (b.waitlist_position ?? 9999))
        .slice(0, availableSpots);

      for (const candidate of eligibleCandidates) {
        list = list.map(p => {
          if (p.plan_id === planId && p.user_id === candidate.user_id) {
            if (p.rsvp_status === 'INVITED') {
              // INVITED participant: promoted to GOING, rsvp_status preserved as INVITED
              return {
                ...p,
                assigned_group: 'GOING' as const,
                waitlist_position: null,
              };
            }
            // WAITLISTED / REJOINED participant: promoted to GOING, rsvp_status becomes JOINED
            return {
              ...p,
              rsvp_status: 'JOINED' as const,
              assigned_group: 'GOING' as const,
              waitlist_position: null,
            };
          }
          return p;
        });
        promotedCount++;
      }
    }
  }

  // 3. Renumber remaining WAITLIST participants contiguously 1..N using safe two-stage offset
  const remainingWaitlist = list
    .filter(
      p => p.plan_id === planId && p.assigned_group === 'WAITLIST' && p.rsvp_status !== 'SKIPPED'
    )
    .sort((a, b) => (a.waitlist_position ?? 9999) - (b.waitlist_position ?? 9999));

  const newPositionMap = new Map<string, number>();
  remainingWaitlist.forEach((p, idx) => {
    newPositionMap.set(p.user_id, idx + 1);
  });

  // Stage 1: Temporary offset 10000 + new_pos (guarantees no unique constraint collision)
  list = list.map(p => {
    if (newPositionMap.has(p.user_id)) {
      return {
        ...p,
        waitlist_position: 10000 + newPositionMap.get(p.user_id)!,
      };
    }
    return p;
  });

  // Stage 2: Final 1-indexed position
  list = list.map(p => {
    if (p.assigned_group === 'WAITLIST' && p.waitlist_position && p.waitlist_position > 10000) {
      return {
        ...p,
        waitlist_position: p.waitlist_position - 10000,
      };
    }
    return p;
  });

  return { updatedParticipants: list, promotedCount };
}

describe('Assigned Mode: Remove Participant and Waitlist Promotion', () => {
  const planId = 'test-plan-1';

  it('1. Removing a participant sets SKIPPED and canonical REMOVED skip reason', () => {
    const participants: DbParticipant[] = [
      {
        user_id: 'host-1',
        plan_id: planId,
        role: 'HOST',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
      },
      {
        user_id: 'user-to-remove',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
        leave_requested: true,
      },
    ];

    const { updatedParticipants } = simulateRemoveParticipant(planId, 'user-to-remove', participants, 3);
    const removed = updatedParticipants.find(p => p.user_id === 'user-to-remove')!;

    expect(removed.rsvp_status).toBe('SKIPPED');
    expect(removed.skip_reason).toBe('REMOVED');
    expect(removed.assigned_group).toBeNull();
    expect(removed.waitlist_position).toBeNull();
    expect(removed.leave_requested).toBe(false);
  });

  it('2. Rule 1: First participant with WAITLISTED becomes GOING + JOINED', () => {
    const participants: DbParticipant[] = [
      {
        user_id: 'host-1',
        plan_id: planId,
        role: 'HOST',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
      },
      {
        user_id: 'going-user',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
      },
      {
        user_id: 'waitlisted-user',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'WAITLISTED',
        assigned_group: 'WAITLIST',
        waitlist_position: 1,
      },
    ];

    const { updatedParticipants, promotedCount } = simulateRemoveParticipant(
      planId,
      'going-user',
      participants,
      2
    );

    expect(promotedCount).toBe(1);
    const promoted = updatedParticipants.find(p => p.user_id === 'waitlisted-user')!;
    expect(promoted.rsvp_status).toBe('JOINED');
    expect(promoted.assigned_group).toBe('GOING');
    expect(promoted.waitlist_position).toBeNull();
  });

  it('3. Rule 2: First participant with INVITED becomes GOING + INVITED (status preserved)', () => {
    const participants: DbParticipant[] = [
      {
        user_id: 'host-1',
        plan_id: planId,
        role: 'HOST',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
      },
      {
        user_id: 'going-user',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
      },
      {
        user_id: 'invited-at-1',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'INVITED',
        assigned_group: 'WAITLIST',
        waitlist_position: 1,
      },
      {
        user_id: 'waitlisted-at-2',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'WAITLISTED',
        assigned_group: 'WAITLIST',
        waitlist_position: 2,
      },
    ];

    const { updatedParticipants, promotedCount } = simulateRemoveParticipant(
      planId,
      'going-user',
      participants,
      2
    );

    expect(promotedCount).toBe(1);
    const invitedUser = updatedParticipants.find(p => p.user_id === 'invited-at-1')!;
    // Promoted into GOING group, but rsvp_status MUST be preserved as INVITED
    expect(invitedUser.rsvp_status).toBe('INVITED');
    expect(invitedUser.assigned_group).toBe('GOING');
    expect(invitedUser.waitlist_position).toBeNull();

    // The second waitlisted participant is not promoted because capacity was only 1 spot
    const waitlistedUser = updatedParticipants.find(p => p.user_id === 'waitlisted-at-2')!;
    expect(waitlistedUser.rsvp_status).toBe('WAITLISTED');
    expect(waitlistedUser.assigned_group).toBe('WAITLIST');
    expect(waitlistedUser.waitlist_position).toBe(1);
  });

  it('4. Rule 3: The invited participant appears in GOING group but is not counted as confirmed attendance', () => {
    const participants: DbParticipant[] = [
      {
        user_id: 'host-1',
        plan_id: planId,
        role: 'HOST',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
      },
      {
        user_id: 'going-user',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
      },
      {
        user_id: 'invited-user',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'INVITED',
        assigned_group: 'WAITLIST',
        waitlist_position: 1,
      },
    ];

    const { updatedParticipants } = simulateRemoveParticipant(planId, 'going-user', participants, 2);

    // Filter participants in GOING assigned group
    const goingGroup = updatedParticipants.filter(p => p.assigned_group === 'GOING');
    expect(goingGroup.length).toBe(2);
    expect(goingGroup.some(p => p.user_id === 'invited-user')).toBe(true);

    // Calculate confirmed attendance breakdown: INVITED must NOT be counted as confirmed 'joined'
    const breakdown = calculateParticipantBreakdown(updatedParticipants as any);
    expect(breakdown.joined).toBe(1); // Only host-1 is confirmed
    expect(breakdown.invited).toBe(1); // invited-user is counted under invited
    expect(breakdown.skipped).toBe(1); // going-user was skipped/removed
  });

  it('5. Rule 4: Remaining waitlist positions stay unique and consecutive', () => {
    const participants: DbParticipant[] = [
      {
        user_id: 'host-1',
        plan_id: planId,
        role: 'HOST',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
      },
      {
        user_id: 'going-user',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
      },
      {
        user_id: 'w1-invited',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'INVITED',
        assigned_group: 'WAITLIST',
        waitlist_position: 1,
      },
      {
        user_id: 'w2-waitlisted',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'WAITLISTED',
        assigned_group: 'WAITLIST',
        waitlist_position: 2,
      },
      {
        user_id: 'w3-invited',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'INVITED',
        assigned_group: 'WAITLIST',
        waitlist_position: 3,
      },
      {
        user_id: 'w4-waitlisted',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'WAITLISTED',
        assigned_group: 'WAITLIST',
        waitlist_position: 4,
      },
    ];

    // Remove going-user -> w1-invited is promoted to GOING -> remaining waitlist are w2, w3, w4
    const { updatedParticipants } = simulateRemoveParticipant(planId, 'going-user', participants, 2);

    const waitlist = updatedParticipants
      .filter(p => p.assigned_group === 'WAITLIST')
      .sort((a, b) => a.waitlist_position! - b.waitlist_position!);

    expect(waitlist.length).toBe(3);
    expect(waitlist.map(p => p.user_id)).toEqual(['w2-waitlisted', 'w3-invited', 'w4-waitlisted']);
    expect(waitlist.map(p => p.waitlist_position)).toEqual([1, 2, 3]);

    // Uniqueness assertion
    const positions = waitlist.map(p => p.waitlist_position!);
    const uniquePositions = new Set(positions);
    expect(uniquePositions.size).toBe(positions.length);
  });

  it('6. Rule 5: Removal and promotion work without duplicate-key errors across any position', () => {
    const baseWaitlist: DbParticipant[] = [
      { user_id: 'h', plan_id: planId, role: 'HOST', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'w1', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'INVITED', assigned_group: 'WAITLIST', waitlist_position: 1 },
      { user_id: 'w2', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'WAITLISTED', assigned_group: 'WAITLIST', waitlist_position: 2 },
      { user_id: 'w3', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'INVITED', assigned_group: 'WAITLIST', waitlist_position: 3 },
      { user_id: 'w4', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'WAITLISTED', assigned_group: 'WAITLIST', waitlist_position: 4 },
      { user_id: 'w5', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'INVITED', assigned_group: 'WAITLIST', waitlist_position: 5 },
    ];

    // Case A: Remove from beginning (w1)
    const resA = simulateRemoveParticipant(planId, 'w1', baseWaitlist, 3);
    const waitlistA = resA.updatedParticipants
      .filter(p => p.assigned_group === 'WAITLIST')
      .sort((a, b) => a.waitlist_position! - b.waitlist_position!);
    expect(waitlistA.map(p => p.user_id)).toEqual(['w2', 'w3', 'w4', 'w5']);
    expect(waitlistA.map(p => p.waitlist_position)).toEqual([1, 2, 3, 4]);

    // Case B: Remove from middle (w3)
    const resB = simulateRemoveParticipant(planId, 'w3', baseWaitlist, 3);
    const waitlistB = resB.updatedParticipants
      .filter(p => p.assigned_group === 'WAITLIST')
      .sort((a, b) => a.waitlist_position! - b.waitlist_position!);
    expect(waitlistB.map(p => p.user_id)).toEqual(['w1', 'w2', 'w4', 'w5']);
    expect(waitlistB.map(p => p.waitlist_position)).toEqual([1, 2, 3, 4]);

    // Case C: Remove from end (w5)
    const resC = simulateRemoveParticipant(planId, 'w5', baseWaitlist, 3);
    const waitlistC = resC.updatedParticipants
      .filter(p => p.assigned_group === 'WAITLIST')
      .sort((a, b) => a.waitlist_position! - b.waitlist_position!);
    expect(waitlistC.map(p => p.user_id)).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(waitlistC.map(p => p.waitlist_position)).toEqual([1, 2, 3, 4]);
  });
});
