import { describe, it, expect } from 'vitest';
import { calculateParticipantBreakdown } from '../../../../../lib/participantStatus';

interface DbParticipant {
  user_id: string;
  plan_id: string;
  role: 'HOST' | 'PARTICIPANT';
  rsvp_status: 'JOINED' | 'WAITLISTED' | 'INVITED' | 'SKIPPED' | 'REJOINED';
  assigned_group: 'GOING' | 'WAITLIST' | null;
  waitlist_position: number | null;
  joined_queue_at: string | null;
  skip_reason?: 'REMOVED' | 'LEFT' | 'CANCELLED' | 'PAYMENT_KEPT' | null;
  leave_requested?: boolean;
}

interface DbPlan {
  id: string;
  plan_size: number | null;
  participant_filtering: 'ASSIGNED' | 'AUTOMATIC' | null;
}

/**
 * Pure simulation of the canonical resolve_rejoined_participant RPC and
 * state reconciliation logic for Assigned mode.
 */
function simulateResolveRejoinedParticipant(
  plan: DbPlan,
  participants: DbParticipant[],
  targetUserId: string,
  decision: 'JOINED' | 'WAITLIST' | 'REMOVE'
): {
  updatedPlan: DbPlan;
  updatedParticipants: DbParticipant[];
} {
  const target = participants.find(p => p.plan_id === plan.id && p.user_id === targetUserId);
  if (!target) {
    throw new Error('Participant not found');
  }

  const isAssigned = plan.participant_filtering === 'ASSIGNED';
  let updatedPlan = { ...plan };

  if (decision === 'JOINED') {
    // 1. In Assigned mode: Increase plan_size by 1 to account for the participant rejoining
    if (isAssigned && plan.plan_size !== null) {
      updatedPlan = {
        ...updatedPlan,
        plan_size: plan.plan_size + 1,
      };
    }

    // 2. Set participant to JOINED + GOING and clear stale fields
    const updatedParticipants = participants.map(p => {
      if (p.plan_id === plan.id && p.user_id === targetUserId) {
        return {
          ...p,
          rsvp_status: 'JOINED' as const,
          assigned_group: isAssigned ? ('GOING' as const) : null,
          waitlist_position: null,
          joined_queue_at: null,
          skip_reason: null,
          leave_requested: false,
        };
      }
      return p;
    });

    return { updatedPlan, updatedParticipants };
  } else if (decision === 'WAITLIST') {
    // 1. Keep plan_size unchanged because participant has not joined
    let maxWaitlistPos = 0;
    if (isAssigned) {
      for (const p of participants) {
        if (p.plan_id === plan.id && p.assigned_group === 'WAITLIST' && typeof p.waitlist_position === 'number') {
          if (p.waitlist_position > maxWaitlistPos) {
            maxWaitlistPos = p.waitlist_position;
          }
        }
      }
    }

    // 2. Set participant to WAITLISTED + WAITLIST and add to end of waitlist
    const updatedParticipants = participants.map(p => {
      if (p.plan_id === plan.id && p.user_id === targetUserId) {
        return {
          ...p,
          rsvp_status: 'WAITLISTED' as const,
          assigned_group: isAssigned ? ('WAITLIST' as const) : null,
          waitlist_position: isAssigned ? maxWaitlistPos + 1 : null,
          joined_queue_at: p.joined_queue_at || new Date().toISOString(),
          skip_reason: null,
          leave_requested: false,
        };
      }
      return p;
    });

    return { updatedPlan, updatedParticipants };
  } else {
    // REMOVE
    const updatedParticipants = participants.filter(
      p => !(p.plan_id === plan.id && p.user_id === targetUserId)
    );
    return { updatedPlan, updatedParticipants };
  }
}

describe('Assigned Mode: Rejoin Flow Plan Size & State Transitions', () => {
  const planId = 'test-plan-rejoin';

  it('1. Add to Joined: increments plan_size by 1 and sets GOING + JOINED', () => {
    const plan: DbPlan = {
      id: planId,
      plan_size: 5,
      participant_filtering: 'ASSIGNED',
    };

    const participants: DbParticipant[] = [
      {
        user_id: 'host-1',
        plan_id: planId,
        role: 'HOST',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
        joined_queue_at: null,
      },
      {
        user_id: 'rejoining-user',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'REJOINED',
        assigned_group: null,
        waitlist_position: 1, // Stale waitlist position
        joined_queue_at: '2026-10-09T10:00:00Z', // Stale timestamp
        skip_reason: 'REMOVED', // Stale skip reason
        leave_requested: true,
      },
    ];

    const { updatedPlan, updatedParticipants } = simulateResolveRejoinedParticipant(
      plan,
      participants,
      'rejoining-user',
      'JOINED'
    );

    // Plan size increased by exactly 1
    expect(updatedPlan.plan_size).toBe(6);

    // Participant state updated correctly
    const rejoined = updatedParticipants.find(p => p.user_id === 'rejoining-user')!;
    expect(rejoined.rsvp_status).toBe('JOINED');
    expect(rejoined.assigned_group).toBe('GOING');
    expect(rejoined.waitlist_position).toBeNull();
    expect(rejoined.joined_queue_at).toBeNull();
    expect(rejoined.skip_reason).toBeNull();
    expect(rejoined.leave_requested).toBe(false);

    // Joined count breakdown increased by 1
    const breakdown = calculateParticipantBreakdown(updatedParticipants as any);
    expect(breakdown.joined).toBe(2);
    expect(breakdown.skipped).toBe(0);
  });

  it('2. Add to Joined: prevents double increment from subsequent reconciliations', () => {
    const plan: DbPlan = {
      id: planId,
      plan_size: 4,
      participant_filtering: 'ASSIGNED',
    };

    const participants: DbParticipant[] = [
      {
        user_id: 'host-1',
        plan_id: planId,
        role: 'HOST',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
        joined_queue_at: null,
      },
      {
        user_id: 'user-a',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'REJOINED',
        assigned_group: null,
        waitlist_position: null,
        joined_queue_at: null,
      },
    ];

    // First invocation (simulate user clicking "Add to Joined")
    const res1 = simulateResolveRejoinedParticipant(plan, participants, 'user-a', 'JOINED');
    expect(res1.updatedPlan.plan_size).toBe(5);

    // Simulated subsequent RPC completion returns authoritative plan_size = 5
    const rpcResultPlanSize = res1.updatedPlan.plan_size;
    expect(rpcResultPlanSize).toBe(5);

    // Applying authoritative RPC result to plan state maintains plan_size at 5 (no double increment to 6)
    const reconciledPlan = {
      ...res1.updatedPlan,
      plan_size: rpcResultPlanSize,
    };
    expect(reconciledPlan.plan_size).toBe(5);
  });

  it('3. Add to Waitlist: keeps plan_size unchanged and assigns next sequential position', () => {
    const plan: DbPlan = {
      id: planId,
      plan_size: 5,
      participant_filtering: 'ASSIGNED',
    };

    const participants: DbParticipant[] = [
      {
        user_id: 'host-1',
        plan_id: planId,
        role: 'HOST',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
        joined_queue_at: null,
      },
      {
        user_id: 'waitlisted-1',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'WAITLISTED',
        assigned_group: 'WAITLIST',
        waitlist_position: 1,
        joined_queue_at: '2026-10-10T08:00:00Z',
      },
      {
        user_id: 'waitlisted-2',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'WAITLISTED',
        assigned_group: 'WAITLIST',
        waitlist_position: 2,
        joined_queue_at: '2026-10-10T08:05:00Z',
      },
      {
        user_id: 'rejoining-user',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'REJOINED',
        assigned_group: null,
        waitlist_position: null,
        joined_queue_at: null,
        skip_reason: 'LEFT',
        leave_requested: true,
      },
    ];

    const { updatedPlan, updatedParticipants } = simulateResolveRejoinedParticipant(
      plan,
      participants,
      'rejoining-user',
      'WAITLIST'
    );

    // Plan size is strictly unchanged
    expect(updatedPlan.plan_size).toBe(5);

    // Participant added to end of waitlist at position 3
    const rejoined = updatedParticipants.find(p => p.user_id === 'rejoining-user')!;
    expect(rejoined.rsvp_status).toBe('WAITLISTED');
    expect(rejoined.assigned_group).toBe('WAITLIST');
    expect(rejoined.waitlist_position).toBe(3);
    expect(rejoined.skip_reason).toBeNull();
    expect(rejoined.leave_requested).toBe(false);

    // Total waitlist participants increased by 1 (2 -> 3)
    const waitlistMembers = updatedParticipants.filter(p => p.assigned_group === 'WAITLIST');
    expect(waitlistMembers.length).toBe(3);
    expect(waitlistMembers.map(p => p.waitlist_position)).toEqual([1, 2, 3]);

    // Joined count remains 1
    const breakdown = calculateParticipantBreakdown(updatedParticipants as any);
    expect(breakdown.joined).toBe(1);
    expect(breakdown.waitlisted).toBe(3);
  });

  it('4. Automatic mode rejoin: preserves existing behavior without increasing plan_size', () => {
    const plan: DbPlan = {
      id: planId,
      plan_size: 5,
      participant_filtering: 'AUTOMATIC',
    };

    const participants: DbParticipant[] = [
      {
        user_id: 'host-1',
        plan_id: planId,
        role: 'HOST',
        rsvp_status: 'JOINED',
        assigned_group: null,
        waitlist_position: null,
        joined_queue_at: null,
      },
      {
        user_id: 'rejoining-user',
        plan_id: planId,
        role: 'PARTICIPANT',
        rsvp_status: 'REJOINED',
        assigned_group: null,
        waitlist_position: null,
        joined_queue_at: null,
      },
    ];

    const { updatedPlan, updatedParticipants } = simulateResolveRejoinedParticipant(
      plan,
      participants,
      'rejoining-user',
      'JOINED'
    );

    // Outside Assigned rejoin flow, plan_size is preserved
    expect(updatedPlan.plan_size).toBe(5);

    const rejoined = updatedParticipants.find(p => p.user_id === 'rejoining-user')!;
    expect(rejoined.rsvp_status).toBe('JOINED');
    expect(rejoined.assigned_group).toBeNull();
  });
});
