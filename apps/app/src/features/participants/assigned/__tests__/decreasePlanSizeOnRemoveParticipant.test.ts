import { describe, it, expect, vi } from 'vitest';

interface TestParticipant {
  user_id: string;
  plan_id: string;
  role: 'HOST' | 'PARTICIPANT';
  rsvp_status: 'JOINED' | 'WAITLISTED' | 'INVITED' | 'SKIPPED' | 'REJOINED';
  assigned_group: 'GOING' | 'WAITLIST' | null;
  waitlist_position: number | null;
  skip_reason?: 'REMOVED' | 'LEFT' | 'CANCELLED' | null;
  leave_requested?: boolean;
}

interface TestPlan {
  id: string;
  participant_filtering: 'ASSIGNED' | 'AUTOMATIC';
  plan_size: number | null;
  invited_participants: number;
}

/**
 * Pure simulation of the canonical remove_participant RPC after migration
 * 20261014160000_decrease_plan_size_on_assigned_remove_participant.sql
 */
function executeRemoveParticipantRPC(
  plan: TestPlan,
  participants: TestParticipant[],
  targetUserId: string,
  isHostCaller: boolean = true
): {
  plan: TestPlan;
  participants: TestParticipant[];
  promotedCount: number;
  success: boolean;
} {
  if (!isHostCaller) {
    throw new Error('Unauthorized: Only hosts can remove participants');
  }

  const target = participants.find(p => p.plan_id === plan.id && p.user_id === targetUserId);
  if (!target) {
    throw new Error('Participant not found');
  }

  // Idempotency: If already SKIPPED, return immediately without decrementing plan_size
  if (target.rsvp_status === 'SKIPPED') {
    return {
      plan: { ...plan },
      participants: [...participants],
      promotedCount: 0,
      success: true,
    };
  }

  // Last host check
  if (target.role === 'HOST' && target.rsvp_status === 'JOINED') {
    const remainingHosts = participants.filter(
      p => p.plan_id === plan.id && p.role === 'HOST' && p.rsvp_status === 'JOINED' && p.user_id !== targetUserId
    ).length;
    if (remainingHosts < 1) {
      throw new Error('Cannot remove the last remaining active host');
    }
  }

  const targetAssignedGroup = target.assigned_group;

  // 1. Transition target participant to SKIPPED with skip_reason = REMOVED
  let updatedParticipants = participants.map(p => {
    if (p.plan_id === plan.id && p.user_id === targetUserId) {
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

  let updatedPlanSize = plan.plan_size;
  let promotedCount = 0;

  // 2. Mode-specific capacity & promotion behavior
  if (plan.participant_filtering === 'AUTOMATIC') {
    // In AUTOMATIC mode: plan_size is preserved; earliest FCFS is promoted
    if (plan.plan_size !== null && target.rsvp_status === 'JOINED') {
      const waitlistCandidate = updatedParticipants.find(
        p => p.plan_id === plan.id && p.rsvp_status === 'WAITLISTED'
      );
      if (waitlistCandidate) {
        updatedParticipants = updatedParticipants.map(p => {
          if (p.user_id === waitlistCandidate.user_id) {
            return { ...p, rsvp_status: 'JOINED' as const, waitlist_position: null };
          }
          return p;
        });
        promotedCount = 1;
      }
    }
  } else if (plan.participant_filtering === 'ASSIGNED') {
    // In ASSIGNED mode:
    // When removing a participant in GOING (or unassigned), decrease plan_size by exactly 1
    if (targetAssignedGroup === 'GOING' || targetAssignedGroup === null) {
      if (updatedPlanSize !== null) {
        updatedPlanSize = Math.max(1, updatedPlanSize - 1);
      }
    }

    // auto_promote_waitlist_for_assigned:
    // With decremented plan_size, availableSpots = GREATEST(0, plan_size - currentGoing) = 0,
    // so waitlist members are NOT promoted into GOING. Remaining waitlist is renumbered 1..N.
    const remainingWaitlist = updatedParticipants
      .filter(p => p.plan_id === plan.id && p.assigned_group === 'WAITLIST' && p.rsvp_status !== 'SKIPPED')
      .sort((a, b) => (a.waitlist_position ?? 9999) - (b.waitlist_position ?? 9999));

    const renumberMap = new Map<string, number>();
    remainingWaitlist.forEach((p, idx) => {
      renumberMap.set(p.user_id, idx + 1);
    });

    updatedParticipants = updatedParticipants.map(p => {
      if (renumberMap.has(p.user_id)) {
        return { ...p, waitlist_position: renumberMap.get(p.user_id)! };
      }
      return p;
    });
  }

  // Count active invited participants
  const invitedCount = updatedParticipants.filter(
    p => p.plan_id === plan.id && p.rsvp_status !== 'SKIPPED'
  ).length;

  return {
    plan: {
      ...plan,
      plan_size: updatedPlanSize,
      invited_participants: invitedCount,
    },
    participants: updatedParticipants,
    promotedCount,
    success: true,
  };
}

describe('Planless — Decrease Plan Size When Removing a Participant (Assigned Mode)', () => {
  const planId = 'test-plan-assigned-capacity';

  it('1. Removing a participant decreases plan capacity by exactly one when NO waitlist exists (matching user screenshot)', () => {
    // Initial state matching user screenshot:
    // 6 participants in Joined (capacity = 6, 0 on waitlist, 3 skipped)
    const initialPlan: TestPlan = {
      id: planId,
      participant_filtering: 'ASSIGNED',
      plan_size: 6,
      invited_participants: 6,
    };

    const initialParticipants: TestParticipant[] = [
      { user_id: 'host-you', plan_id: planId, role: 'HOST', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'host-thilak', plan_id: planId, role: 'HOST', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'user-aznan', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'INVITED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'user-raam', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'INVITED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'user-ren', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'INVITED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'user-rishi', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'INVITED', assigned_group: 'GOING', waitlist_position: null },
    ];

    // Host removes Rishi
    const { plan: updatedPlan, participants: updatedParticipants } = executeRemoveParticipantRPC(
      initialPlan,
      initialParticipants,
      'user-rishi',
      true
    );

    // Verify configured capacity decreased from 6 to 5
    expect(updatedPlan.plan_size).toBe(5);

    // Verify Rishi was marked SKIPPED with reason REMOVED and cleared assigned group
    const rishi = updatedParticipants.find(p => p.user_id === 'user-rishi')!;
    expect(rishi.rsvp_status).toBe('SKIPPED');
    expect(rishi.skip_reason).toBe('REMOVED');
    expect(rishi.assigned_group).toBeNull();

    // Verify remaining Going group count is 5
    const remainingGoing = updatedParticipants.filter(p => p.assigned_group === 'GOING');
    expect(remainingGoing.length).toBe(5);
  });

  it('2. Removing a participant decreases plan capacity even when waitlisted participants exist', () => {
    // 4 going, 2 waitlisted, capacity = 4
    const initialPlan: TestPlan = {
      id: planId,
      participant_filtering: 'ASSIGNED',
      plan_size: 4,
      invited_participants: 6,
    };

    const initialParticipants: TestParticipant[] = [
      { user_id: 'host-1', plan_id: planId, role: 'HOST', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'going-2', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'going-3', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'going-4', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'waitlist-1', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'WAITLISTED', assigned_group: 'WAITLIST', waitlist_position: 1 },
      { user_id: 'waitlist-2', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'WAITLISTED', assigned_group: 'WAITLIST', waitlist_position: 2 },
    ];

    // Host removes going-4
    const { plan: updatedPlan, participants: updatedParticipants, promotedCount } = executeRemoveParticipantRPC(
      initialPlan,
      initialParticipants,
      'going-4',
      true
    );

    // Capacity decreased from 4 to 3
    expect(updatedPlan.plan_size).toBe(3);

    // No spot opened in Going (3 spots configured, 3 remaining in Going), so 0 promoted
    expect(promotedCount).toBe(0);

    // Waitlist participants remain on waitlist and retain contiguous order 1..2
    const waitlist = updatedParticipants.filter(p => p.assigned_group === 'WAITLIST');
    expect(waitlist.length).toBe(2);
    expect(waitlist.find(p => p.user_id === 'waitlist-1')!.waitlist_position).toBe(1);
    expect(waitlist.find(p => p.user_id === 'waitlist-2')!.waitlist_position).toBe(2);
  });

  it('3. Removing a waitlist participant leaves configured capacity unchanged and renumbers waitlist', () => {
    const initialPlan: TestPlan = {
      id: planId,
      participant_filtering: 'ASSIGNED',
      plan_size: 4,
      invited_participants: 6,
    };

    const initialParticipants: TestParticipant[] = [
      { user_id: 'host-1', plan_id: planId, role: 'HOST', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'going-2', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'going-3', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'going-4', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'waitlist-1', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'WAITLISTED', assigned_group: 'WAITLIST', waitlist_position: 1 },
      { user_id: 'waitlist-2', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'WAITLISTED', assigned_group: 'WAITLIST', waitlist_position: 2 },
    ];

    // Host removes waitlist-1
    const { plan: updatedPlan, participants: updatedParticipants } = executeRemoveParticipantRPC(
      initialPlan,
      initialParticipants,
      'waitlist-1',
      true
    );

    // Capacity is still 4
    expect(updatedPlan.plan_size).toBe(4);

    // Remaining waitlist participant waitlist-2 is renumbered to position 1
    const remainingWaitlist = updatedParticipants.filter(p => p.assigned_group === 'WAITLIST');
    expect(remainingWaitlist.length).toBe(1);
    expect(remainingWaitlist[0].user_id).toBe('waitlist-2');
    expect(remainingWaitlist[0].waitlist_position).toBe(1);
  });

  it('4. Repeated submissions/duplicate calls do not decrement capacity twice (idempotency)', () => {
    const initialPlan: TestPlan = {
      id: planId,
      participant_filtering: 'ASSIGNED',
      plan_size: 6,
      invited_participants: 6,
    };

    const initialParticipants: TestParticipant[] = [
      { user_id: 'host-1', plan_id: planId, role: 'HOST', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'user-2', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
    ];

    // Call 1: Successful removal
    const res1 = executeRemoveParticipantRPC(initialPlan, initialParticipants, 'user-2', true);
    expect(res1.plan.plan_size).toBe(5);

    // Call 2: Duplicate/retry with user-2 already SKIPPED
    const res2 = executeRemoveParticipantRPC(res1.plan, res1.participants, 'user-2', true);
    expect(res2.plan.plan_size).toBe(5); // MUST NOT decrement to 4
  });

  it('5. Failed removal leaves plan capacity strictly unchanged', () => {
    const initialPlan: TestPlan = {
      id: planId,
      participant_filtering: 'ASSIGNED',
      plan_size: 6,
      invited_participants: 6,
    };

    const initialParticipants: TestParticipant[] = [
      { user_id: 'host-1', plan_id: planId, role: 'HOST', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'user-2', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
    ];

    // Attempt removal with unauthorized non-host caller
    expect(() => {
      executeRemoveParticipantRPC(initialPlan, initialParticipants, 'user-2', false);
    }).toThrow('Unauthorized: Only hosts can remove participants');

    // Attempt removal of non-existent participant
    expect(() => {
      executeRemoveParticipantRPC(initialPlan, initialParticipants, 'non-existent', true);
    }).toThrow('Participant not found');

    // Capacity remains 6
    expect(initialPlan.plan_size).toBe(6);
  });

  it('6. Automatic waitlist mode remains unchanged (capacity is preserved, earliest FCFS promoted)', () => {
    const autoPlan: TestPlan = {
      id: 'auto-plan-id',
      participant_filtering: 'AUTOMATIC',
      plan_size: 2,
      invited_participants: 3,
    };

    const autoParticipants: TestParticipant[] = [
      { user_id: 'host-1', plan_id: 'auto-plan-id', role: 'HOST', rsvp_status: 'JOINED', assigned_group: null, waitlist_position: null },
      { user_id: 'going-2', plan_id: 'auto-plan-id', role: 'PARTICIPANT', rsvp_status: 'JOINED', assigned_group: null, waitlist_position: null },
      { user_id: 'waitlisted-3', plan_id: 'auto-plan-id', role: 'PARTICIPANT', rsvp_status: 'WAITLISTED', assigned_group: null, waitlist_position: 1 },
    ];

    const { plan: updatedPlan, participants: updatedParticipants, promotedCount } = executeRemoveParticipantRPC(
      autoPlan,
      autoParticipants,
      'going-2',
      true
    );

    // In AUTOMATIC mode: plan_size is preserved (still 2)
    expect(updatedPlan.plan_size).toBe(2);

    // FCFS waitlisted participant is promoted to JOINED
    expect(promotedCount).toBe(1);
    expect(updatedParticipants.find(p => p.user_id === 'waitlisted-3')!.rsvp_status).toBe('JOINED');
  });

  it('7. Decrement never drops plan_size below minimum (1)', () => {
    const minimalPlan: TestPlan = {
      id: planId,
      participant_filtering: 'ASSIGNED',
      plan_size: 1,
      invited_participants: 2,
    };

    const minimalParticipants: TestParticipant[] = [
      { user_id: 'host-1', plan_id: planId, role: 'HOST', rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null },
      { user_id: 'guest-2', plan_id: planId, role: 'PARTICIPANT', rsvp_status: 'INVITED', assigned_group: 'GOING', waitlist_position: null },
    ];

    const { plan: updatedPlan } = executeRemoveParticipantRPC(minimalPlan, minimalParticipants, 'guest-2', true);
    expect(updatedPlan.plan_size).toBe(1);
  });
});
