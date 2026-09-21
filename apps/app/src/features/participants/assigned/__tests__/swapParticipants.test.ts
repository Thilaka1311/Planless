import { describe, it, expect } from 'vitest';

interface Participant {
  user_id: string;
  assigned_group: 'GOING' | 'WAITLIST' | null;
  rsvp_status: 'JOINED' | 'WAITLISTED' | 'SKIPPED';
  waitlist_position: number | null;
}

/**
 * Pure simulation of the Assigned participant swap logic implemented in
 * `usePlanParticipants.ts` and `swap_plan_participants` PostgreSQL RPC.
 */
function simulateSwap(
  participants: Participant[],
  goingUserId: string,
  waitlistUserId: string
): Participant[] {
  const waitlistPp = participants.find(p => p.user_id === waitlistUserId);
  const goingPp = participants.find(p => p.user_id === goingUserId);

  if (!waitlistPp || !goingPp) {
    throw new Error('Participants not found');
  }

  // Preserve exact waitlist position from the waitlisted candidate
  const inheritedWaitlistPos = waitlistPp.waitlist_position;

  return participants.map(p => {
    // GOING -> WAITLIST: inherits exact waitlist position
    if (p.user_id === goingUserId) {
      return {
        ...p,
        assigned_group: 'WAITLIST' as const,
        waitlist_position: inheritedWaitlistPos,
        rsvp_status: 'WAITLISTED' as const,
      };
    }
    // WAITLIST -> GOING: clears waitlist_position and becomes GOING
    if (p.user_id === waitlistUserId) {
      return {
        ...p,
        assigned_group: 'GOING' as const,
        waitlist_position: null,
        rsvp_status: 'JOINED' as const,
      };
    }
    return p;
  });
}

function getSortedWaitlist(participants: Participant[]) {
  return participants
    .filter(p => p.assigned_group === 'WAITLIST')
    .sort((a, b) => (a.waitlist_position ?? 999) - (b.waitlist_position ?? 999));
}

describe('Assigned participant swap behavior', () => {
  it('preserves the exact waitlist position of the replaced participant', () => {
    // Waitlist:
    // #1 A
    // #2 B
    // #3 C
    // Joined:
    // D
    const initialParticipants: Participant[] = [
      { user_id: 'A', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', waitlist_position: 1 },
      { user_id: 'B', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', waitlist_position: 2 },
      { user_id: 'C', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', waitlist_position: 3 },
      { user_id: 'D', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
    ];

    // Swap D with B (#2)
    const result = simulateSwap(initialParticipants, 'D', 'B');

    const going = result.filter(p => p.assigned_group === 'GOING');
    const waitlist = getSortedWaitlist(result);

    // Expected Joined: B
    expect(going).toHaveLength(1);
    expect(going[0].user_id).toBe('B');
    expect(going[0].waitlist_position).toBeNull();
    expect(going[0].rsvp_status).toBe('JOINED');

    // Expected Waitlist: #1 A, #2 D, #3 C
    expect(waitlist).toHaveLength(3);
    expect(waitlist[0].user_id).toBe('A');
    expect(waitlist[0].waitlist_position).toBe(1);

    expect(waitlist[1].user_id).toBe('D');
    expect(waitlist[1].waitlist_position).toBe(2);
    expect(waitlist[1].rsvp_status).toBe('WAITLISTED');

    expect(waitlist[2].user_id).toBe('C');
    expect(waitlist[2].waitlist_position).toBe(3);
  });

  it('preserves position when swapping with #1', () => {
    const initialParticipants: Participant[] = [
      { user_id: 'A', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', waitlist_position: 1 },
      { user_id: 'B', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', waitlist_position: 2 },
      { user_id: 'D', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
    ];

    const result = simulateSwap(initialParticipants, 'D', 'A');
    const waitlist = getSortedWaitlist(result);

    expect(waitlist[0].user_id).toBe('D');
    expect(waitlist[0].waitlist_position).toBe(1);
    expect(waitlist[1].user_id).toBe('B');
    expect(waitlist[1].waitlist_position).toBe(2);
  });

  it('preserves position when swapping with last waitlist participant', () => {
    const initialParticipants: Participant[] = [
      { user_id: 'A', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', waitlist_position: 1 },
      { user_id: 'B', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', waitlist_position: 2 },
      { user_id: 'D', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
    ];

    const result = simulateSwap(initialParticipants, 'D', 'B');
    const waitlist = getSortedWaitlist(result);

    expect(waitlist[0].user_id).toBe('A');
    expect(waitlist[0].waitlist_position).toBe(1);
    expect(waitlist[1].user_id).toBe('D');
    expect(waitlist[1].waitlist_position).toBe(2);
  });
});
