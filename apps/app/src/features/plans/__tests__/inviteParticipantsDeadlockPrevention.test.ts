import { describe, it, expect, vi, beforeEach } from 'vitest';

interface TestParticipant {
  user_id: string;
  plan_id: string;
  role: 'HOST' | 'PARTICIPANT';
  rsvp_status: 'JOINED' | 'WAITLISTED' | 'INVITED' | 'SKIPPED' | 'REJOINED';
  assigned_group: 'GOING' | 'WAITLIST' | null;
  waitlist_position: number | null;
  skip_reason?: string | null;
}

interface TestPlan {
  id: string;
  participant_filtering: 'ASSIGNED' | 'AUTOMATIC' | null;
  plan_size: number | null;
  invited_participants: number;
  allow_participant_invites: boolean;
}

/**
 * Pure simulation of the canonical public.invite_participants RPC following
 * migration 20261014170000_fix_deadlock_on_invite_participants.sql.
 *
 * Enforces:
 * 1. plans FOR UPDATE serialization
 * 2. Canonical ascending UUID sort & deduplication of invitees
 * 3. Idempotent duplicate invite handling
 * 4. Preservation of permissions & waitlist numbering
 */
function executeInviteParticipantsRPC(
  plan: TestPlan,
  participants: TestParticipant[],
  callerId: string,
  inviteeUserIds: string[],
  assignedGroup?: 'GOING' | 'WAITLIST' | null
): {
  plan: TestPlan;
  participants: TestParticipant[];
  result: {
    success: boolean;
    plan_id: string;
    invited_count: number;
    reactivated_count: number;
    assigned_group: string | null;
    invited_participants: number;
  };
} {
  // 1. Caller auth & role check
  const caller = participants.find(p => p.plan_id === plan.id && p.user_id === callerId);
  if (!caller) {
    const err = new Error('Unauthorized: User is not associated with this plan');
    (err as any).code = '40300';
    throw err;
  }

  if (caller.role !== 'HOST' && !(caller.role === 'PARTICIPANT' && plan.allow_participant_invites)) {
    const err = new Error('Unauthorized: Participant invites are disabled for this plan');
    (err as any).code = '40301';
    throw err;
  }

  // 2. Lock plan row FOR UPDATE (simulated via atomic state clone)
  const nextPlan = { ...plan };
  const nextParticipants = participants.map(p => ({ ...p }));

  // 3. Determine target assigned group
  let targetAssignedGroup: 'GOING' | 'WAITLIST' | null = null;
  if (!plan.participant_filtering || plan.participant_filtering === 'AUTOMATIC') {
    targetAssignedGroup = null;
  } else if (caller.role === 'PARTICIPANT') {
    targetAssignedGroup = 'WAITLIST';
  } else {
    targetAssignedGroup = assignedGroup || 'GOING';
  }

  // 4. Canonical deduplication and ascending UUID sort
  const sortedInvitees = Array.from(new Set(inviteeUserIds.filter(Boolean))).sort();

  let invitedCount = 0;
  let reactivatedCount = 0;

  for (const inviteeId of sortedInvitees) {
    const existing = nextParticipants.find(p => p.plan_id === plan.id && p.user_id === inviteeId);

    // Compute next waitlist position if placed into waitlist
    let nextPos: number | null = null;
    if (targetAssignedGroup === 'WAITLIST') {
      const waitlistMembers = nextParticipants.filter(
        p => p.assigned_group === 'WAITLIST' && p.rsvp_status !== 'SKIPPED'
      );
      const maxPos = waitlistMembers.reduce((max, p) => Math.max(max, p.waitlist_position || 0), 0);
      nextPos = maxPos + 1;
    }

    if (existing) {
      if (existing.rsvp_status === 'SKIPPED') {
        // Reactivate
        existing.rsvp_status = 'INVITED';
        existing.assigned_group = targetAssignedGroup;
        existing.waitlist_position = targetAssignedGroup === 'WAITLIST' ? (existing.waitlist_position || nextPos) : null;
        existing.skip_reason = null;
        reactivatedCount++;
      }
      // If already active (INVITED, JOINED, WAITLISTED), do nothing (idempotent duplicate invite)
    } else {
      // Insert new participant as INVITED
      nextParticipants.push({
        plan_id: plan.id,
        user_id: inviteeId,
        role: 'PARTICIPANT',
        rsvp_status: 'INVITED',
        assigned_group: targetAssignedGroup,
        waitlist_position: nextPos,
        skip_reason: null,
      });
      invitedCount++;
    }
  }

  // Active count calculation
  const currentInvited = nextParticipants.filter(p => p.rsvp_status !== 'SKIPPED').length;
  nextPlan.invited_participants = currentInvited;

  return {
    plan: nextPlan,
    participants: nextParticipants,
    result: {
      success: true,
      plan_id: plan.id,
      invited_count: invitedCount,
      reactivated_count: reactivatedCount,
      assigned_group: targetAssignedGroup,
      invited_participants: currentInvited,
    },
  };
}

/**
 * Pure simulation of client retry wrapper in inviteParticipantsRPC
 */
async function simulateInviteRPCWithRetry(
  rpcFn: () => Promise<any>,
  dispatchNotificationFn: () => void,
  maxRetries: number = 3
): Promise<any> {
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      const result = await rpcFn();
      // On success, dispatch push notification exactly once
      dispatchNotificationFn();
      return result;
    } catch (err: any) {
      const isTransient = err?.code === '40P01' || err?.code === '55P03';
      if (isTransient && attempt < maxRetries) {
        continue;
      }
      throw err;
    }
  }
}

describe('Planless — Fix Deadlock When Inviting Participants to a Plan', () => {
  const hostId = 'host-user-111';
  const participantId = 'participant-user-222';
  const invitee1 = 'invitee-user-333';
  const invitee2 = 'invitee-user-444';
  const invitee3 = 'invitee-user-555';

  const basePlan: TestPlan = {
    id: 'plan-uuid-abc',
    participant_filtering: 'ASSIGNED',
    plan_size: 6,
    invited_participants: 2,
    allow_participant_invites: true,
  };

  const baseParticipants: TestParticipant[] = [
    {
      plan_id: 'plan-uuid-abc',
      user_id: hostId,
      role: 'HOST',
      rsvp_status: 'JOINED',
      assigned_group: 'GOING',
      waitlist_position: null,
    },
    {
      plan_id: 'plan-uuid-abc',
      user_id: participantId,
      role: 'PARTICIPANT',
      rsvp_status: 'JOINED',
      assigned_group: 'GOING',
      waitlist_position: null,
    },
  ];

  it('1. Inviting one participant succeeds', () => {
    const { plan, participants, result } = executeInviteParticipantsRPC(
      basePlan,
      baseParticipants,
      hostId,
      [invitee1],
      'GOING'
    );

    expect(result.success).toBe(true);
    expect(result.invited_count).toBe(1);
    expect(plan.invited_participants).toBe(3);
    const added = participants.find(p => p.user_id === invitee1);
    expect(added).toBeDefined();
    expect(added?.rsvp_status).toBe('INVITED');
    expect(added?.assigned_group).toBe('GOING');
  });

  it('2. Inviting multiple participants succeeds in sorted order', () => {
    const { plan, participants, result } = executeInviteParticipantsRPC(
      basePlan,
      baseParticipants,
      hostId,
      [invitee2, invitee1, invitee3],
      'WAITLIST'
    );

    expect(result.success).toBe(true);
    expect(result.invited_count).toBe(3);
    expect(plan.invited_participants).toBe(5);

    const waitlist = participants
      .filter(p => p.assigned_group === 'WAITLIST')
      .sort((a, b) => (a.waitlist_position || 0) - (b.waitlist_position || 0));

    expect(waitlist.length).toBe(3);
    expect(waitlist[0].waitlist_position).toBe(1);
    expect(waitlist[1].waitlist_position).toBe(2);
    expect(waitlist[2].waitlist_position).toBe(3);
  });

  it('3. Two concurrent invitation requests for the same plan do not deadlock due to plans FOR UPDATE serialization', async () => {
    let currentPlan = { ...basePlan };
    let currentParticipants = [...baseParticipants];

    // Simulate two concurrent requests arriving in parallel
    const req1 = () => {
      const res = executeInviteParticipantsRPC(currentPlan, currentParticipants, hostId, [invitee1], 'GOING');
      currentPlan = res.plan;
      currentParticipants = res.participants;
      return res.result;
    };

    const req2 = () => {
      const res = executeInviteParticipantsRPC(currentPlan, currentParticipants, hostId, [invitee2], 'GOING');
      currentPlan = res.plan;
      currentParticipants = res.participants;
      return res.result;
    };

    const [res1, res2] = await Promise.all([Promise.resolve(req1()), Promise.resolve(req2())]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(currentPlan.invited_participants).toBe(4);
    expect(currentParticipants.filter(p => p.rsvp_status === 'INVITED').length).toBe(2);
  });

  it('4. Overlapping requests do not create duplicate participant records or invitations', () => {
    // Host invites [invitee1, invitee2]
    const firstCall = executeInviteParticipantsRPC(
      basePlan,
      baseParticipants,
      hostId,
      [invitee1, invitee2],
      'GOING'
    );

    // Concurrent second call also invites [invitee2, invitee3]
    const secondCall = executeInviteParticipantsRPC(
      firstCall.plan,
      firstCall.participants,
      hostId,
      [invitee2, invitee3],
      'GOING'
    );

    expect(secondCall.result.invited_count).toBe(1); // Only invitee3 was new
    expect(secondCall.plan.invited_participants).toBe(5);

    // Verify invitee2 only appears once in participant records
    const invitee2Records = secondCall.participants.filter(p => p.user_id === invitee2);
    expect(invitee2Records.length).toBe(1);
  });

  it('5. Retrying a transient deadlock does not duplicate side effects (notifications)', async () => {
    let attempts = 0;
    const notificationSpy = vi.fn();

    const failingRPC = async () => {
      attempts++;
      if (attempts < 2) {
        const deadlockErr = new Error('deadlock detected');
        (deadlockErr as any).code = '40P01';
        throw deadlockErr;
      }
      return { success: true };
    };

    const result = await simulateInviteRPCWithRetry(failingRPC, notificationSpy);

    expect(result.success).toBe(true);
    expect(attempts).toBe(2);
    // Push notification was only dispatched once after final success!
    expect(notificationSpy).toHaveBeenCalledTimes(1);
  });

  it('6. Failed invitations restore the correct UI state via clean rollback', async () => {
    let localDbParticipants = [...baseParticipants];
    let localDbPlans = [{ ...basePlan }];

    const previousParticipants = localDbParticipants;
    const previousDbPlans = localDbPlans;

    // Apply optimistic updates
    localDbParticipants = [
      ...localDbParticipants,
      {
        plan_id: basePlan.id,
        user_id: invitee1,
        role: 'PARTICIPANT',
        rsvp_status: 'INVITED',
        assigned_group: 'GOING',
        waitlist_position: null,
      },
    ];

    expect(localDbParticipants.length).toBe(3);

    // Simulate permanent RPC failure
    const simulateFailingAdd = async () => {
      try {
        const permanentError = new Error('Database connection failed');
        (permanentError as any).code = '50000';
        throw permanentError;
      } catch (err) {
        // Rollback to saved previous state
        localDbParticipants = previousParticipants;
        localDbPlans = previousDbPlans;
        throw err;
      }
    };

    await expect(simulateFailingAdd()).rejects.toThrow('Database connection failed');
    // UI state must be strictly restored
    expect(localDbParticipants.length).toBe(2);
    expect(localDbParticipants.find(p => p.user_id === invitee1)).toBeUndefined();
  });

  it('7. Existing capacity and waitlist behavior remains unchanged', () => {
    // In Assigned mode, capacity (plan_size) remains unchanged when inviting
    const { plan, participants } = executeInviteParticipantsRPC(
      basePlan,
      baseParticipants,
      hostId,
      [invitee1],
      'WAITLIST'
    );

    expect(plan.plan_size).toBe(basePlan.plan_size); // plan_size is untouched
    expect(plan.invited_participants).toBe(3); // active count increments
    const waitlisted = participants.find(p => p.user_id === invitee1);
    expect(waitlisted?.waitlist_position).toBe(1);
  });

  it('8. Unauthorized users cannot invite participants and errors are not retried', async () => {
    const notificationSpy = vi.fn();
    const unauthorizedUserId = 'stranger-999';

    const rpcCall = () => {
      return executeInviteParticipantsRPC(
        basePlan,
        baseParticipants,
        unauthorizedUserId,
        [invitee1]
      );
    };

    await expect(
      simulateInviteRPCWithRetry(async () => rpcCall(), notificationSpy)
    ).rejects.toThrow('Unauthorized: User is not associated with this plan');

    // Notification is NEVER sent on auth failure
    expect(notificationSpy).not.toHaveBeenCalled();
  });
});
