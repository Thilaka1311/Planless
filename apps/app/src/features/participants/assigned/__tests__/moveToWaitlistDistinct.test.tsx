import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { InlineParticipantView } from '../../../plans/components/InlineParticipantView';
import { formatAssignedGoingList, formatAssignedWaitlist } from '../assignedCapacityLogic';

interface TestParticipant {
  user_id: string;
  assigned_group: 'GOING' | 'WAITLIST' | null;
  rsvp_status: 'JOINED' | 'WAITLISTED' | 'SKIPPED' | 'INVITED';
  waitlist_position: number | null;
  role?: 'HOST' | 'PARTICIPANT';
}

/**
 * Pure simulation of the move_participant_to_waitlist_and_decrease_capacity RPC
 * and usePlanParticipants handler.
 */
function simulateMoveToWaitlistAndDecreaseCapacity(
  plan: { id: string; plan_size: number },
  participants: TestParticipant[],
  targetUserId: string
): { plan: { id: string; plan_size: number }; participants: TestParticipant[] } {
  const currentWaitlist = participants.filter(
    (p) => p.assigned_group === 'WAITLIST' && p.waitlist_position !== null
  );
  const nextPos =
    currentWaitlist.reduce((max, p) => Math.max(max, p.waitlist_position || 0), 0) + 1;

  const newPlanSize = Math.max(1, plan.plan_size - 1);

  const updatedParticipants = participants.map((p) => {
    if (p.user_id === targetUserId) {
      return {
        ...p,
        assigned_group: 'WAITLIST' as const,
        waitlist_position: nextPos,
        rsvp_status:
          p.rsvp_status === 'JOINED' ? ('WAITLISTED' as const) : p.rsvp_status,
      };
    }
    // All other participants remain COMPLETELY UNTOUCHED
    return p;
  });

  return {
    plan: { ...plan, plan_size: newPlanSize },
    participants: updatedParticipants,
  };
}

/**
 * Pure simulation of moveParticipantToGoing.
 */
function simulateMoveToGoing(
  participants: TestParticipant[],
  targetUserId: string
): TestParticipant[] {
  return participants.map((p) => {
    if (p.user_id === targetUserId) {
      return {
        ...p,
        assigned_group: 'GOING' as const,
        waitlist_position: null,
        rsvp_status:
          p.rsvp_status === 'WAITLISTED' ? ('JOINED' as const) : p.rsvp_status,
      };
    }
    return p;
  });
}

// Mock Supabase client
vi.mock('../../../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  },
}));

// Mock useFriendshipStore
vi.mock('../../../friendships/state/FriendshipContext', () => ({
  useFriendshipStore: () => ({
    friends: [],
    friendRequests: [],
  }),
}));

// Mock usePlansStore
let mockDbPlanParticipants: any[] = [];
vi.mock('../../../plans/state/PlansContext', () => ({
  usePlansStore: () => ({
    dbPlanParticipants: mockDbPlanParticipants,
  }),
}));

describe('Assign Distinct: Move to Waitlist & Capacity Behavior', () => {
  it('1. Moving one Joined participant updates ONLY that participant and decreases capacity by 1', () => {
    const plan = { id: 'plan-1', plan_size: 4 };
    const participants: TestParticipant[] = [
      { user_id: 'host-1', role: 'HOST', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
      { user_id: 'user-2', role: 'PARTICIPANT', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
      { user_id: 'user-3', role: 'PARTICIPANT', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
      { user_id: 'user-4', role: 'PARTICIPANT', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
    ];

    const result = simulateMoveToWaitlistAndDecreaseCapacity(plan, participants, 'user-2');

    // Exactly one participant changed
    expect(result.plan.plan_size).toBe(3);
    const moved = result.participants.find((p) => p.user_id === 'user-2');
    expect(moved?.assigned_group).toBe('WAITLIST');
    expect(moved?.rsvp_status).toBe('WAITLISTED');
    expect(moved?.waitlist_position).toBe(1);

    // Other participants remain GOING with waitlist_position null
    const others = result.participants.filter((p) => p.user_id !== 'user-2');
    expect(others).toHaveLength(3);
    others.forEach((p) => {
      expect(p.assigned_group).toBe('GOING');
      expect(p.waitlist_position).toBeNull();
    });
  });

  it('2. Moving a second participant leaves the first unchanged and assigns a distinct position', () => {
    const plan = { id: 'plan-1', plan_size: 3 };
    const participants: TestParticipant[] = [
      { user_id: 'host-1', role: 'HOST', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
      { user_id: 'user-2', role: 'PARTICIPANT', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', waitlist_position: 1 },
      { user_id: 'user-3', role: 'PARTICIPANT', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
      { user_id: 'user-4', role: 'PARTICIPANT', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
    ];

    const result = simulateMoveToWaitlistAndDecreaseCapacity(plan, participants, 'user-3');

    expect(result.plan.plan_size).toBe(2);

    const first = result.participants.find((p) => p.user_id === 'user-2');
    expect(first?.waitlist_position).toBe(1);

    const second = result.participants.find((p) => p.user_id === 'user-3');
    expect(second?.waitlist_position).toBe(2);
    expect(second?.assigned_group).toBe('WAITLIST');

    // user-4 is still in GOING
    const user4 = result.participants.find((p) => p.user_id === 'user-4');
    expect(user4?.assigned_group).toBe('GOING');
    expect(user4?.waitlist_position).toBeNull();
  });

  it('3. Moving a waitlisted participant back to Joined clears their waitlist position to null', () => {
    const participants: TestParticipant[] = [
      { user_id: 'host-1', role: 'HOST', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
      { user_id: 'user-2', role: 'PARTICIPANT', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', waitlist_position: 1 },
    ];

    const result = simulateMoveToGoing(participants, 'user-2');
    const returned = result.find((p) => p.user_id === 'user-2');
    expect(returned?.assigned_group).toBe('GOING');
    expect(returned?.waitlist_position).toBeNull();
    expect(returned?.rsvp_status).toBe('JOINED');
  });
});

describe('InlineParticipantView: Console Warnings & State Stability', () => {
  let warnSpy: any;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('4. Does NOT log [INLINE_ASSIGNED] Missing waitlist_position for valid going participants even if going.length > capacity', () => {
    mockDbPlanParticipants = [
      { plan_id: 'plan-1', user_id: 'host-1', role: 'HOST', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
      { plan_id: 'plan-1', user_id: 'user-2', role: 'PARTICIPANT', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
      { plan_id: 'plan-1', user_id: 'user-3', role: 'PARTICIPANT', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
    ];

    const mockPlan: any = {
      id: 'plan-1',
      participantFiltering: 'ASSIGNED',
      capacity: 2, // Capacity is 2 while 3 are assigned to GOING (e.g. during capacity transition)
      members: [
        { userId: 'host-1', name: 'Host User', isHost: true, joinState: 'JOINED', assignedGroup: 'GOING', waitlistPosition: null },
        { userId: 'user-2', name: 'User Two', isHost: false, joinState: 'JOINED', assignedGroup: 'GOING', waitlistPosition: null },
        { userId: 'user-3', name: 'User Three', isHost: false, joinState: 'JOINED', assignedGroup: 'GOING', waitlistPosition: null },
      ],
    };

    renderToString(
      <InlineParticipantView
        plan={mockPlan}
        activeUserId="host-1"
        isHost={true}
        variant="flat"
      />
    );

    // Verify no missing waitlist_position warnings were emitted
    const missingPosCalls = warnSpy.mock.calls.filter((call: any[]) =>
      typeof call[0] === 'string' && call[0].includes('[INLINE_ASSIGNED] Missing waitlist_position')
    );
    expect(missingPosCalls).toHaveLength(0);
  });

  it('5. Renders genuinely waitlisted participant with position without emitting warnings', () => {
    mockDbPlanParticipants = [
      { plan_id: 'plan-1', user_id: 'host-1', role: 'HOST', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
      { plan_id: 'plan-1', user_id: 'user-2', role: 'PARTICIPANT', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', waitlist_position: 1 },
    ];

    const mockPlan: any = {
      id: 'plan-1',
      participantFiltering: 'ASSIGNED',
      capacity: 2,
      members: [
        { userId: 'host-1', name: 'Host User', isHost: true, joinState: 'JOINED', assignedGroup: 'GOING', waitlistPosition: null },
        { userId: 'user-2', name: 'User Two', isHost: false, joinState: 'WAITLISTED', assignedGroup: 'WAITLIST', waitlistPosition: 1 },
      ],
    };

    renderToString(
      <InlineParticipantView
        plan={mockPlan}
        activeUserId="host-1"
        isHost={true}
        variant="flat"
      />
    );

    const missingPosCalls = warnSpy.mock.calls.filter((call: any[]) =>
      typeof call[0] === 'string' && call[0].includes('[INLINE_ASSIGNED] Missing waitlist_position')
    );
    expect(missingPosCalls).toHaveLength(0);
  });

  it('6. Emits warning if a genuinely waitlisted participant in DB has no position', () => {
    mockDbPlanParticipants = [
      { plan_id: 'plan-1', user_id: 'host-1', role: 'HOST', assigned_group: 'GOING', rsvp_status: 'JOINED', waitlist_position: null },
      { plan_id: 'plan-1', user_id: 'user-broken', role: 'PARTICIPANT', assigned_group: 'WAITLIST', rsvp_status: 'WAITLISTED', waitlist_position: null },
    ];

    const mockPlan: any = {
      id: 'plan-1',
      participantFiltering: 'ASSIGNED',
      capacity: 2,
      members: [
        { userId: 'host-1', name: 'Host User', isHost: true, joinState: 'JOINED', assignedGroup: 'GOING', waitlistPosition: null },
        { userId: 'user-broken', name: 'Broken User', isHost: false, joinState: 'WAITLISTED', assignedGroup: 'WAITLIST', waitlistPosition: null },
      ],
    };

    renderToString(
      <InlineParticipantView
        plan={mockPlan}
        activeUserId="host-1"
        isHost={true}
        variant="flat"
      />
    );

    const missingPosCalls = warnSpy.mock.calls.filter((call: any[]) =>
      typeof call[0] === 'string' && call[0].includes('[INLINE_ASSIGNED] Missing waitlist_position')
    );
    // Should detect the genuine anomaly without hiding it
    expect(missingPosCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Assigned Capacity Logic & Section React Key Stability', () => {
  let warnSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('7. formatAssignedGoingList and formatAssignedWaitlist deduplicate participants with identical canonical IDs', () => {
    const duplicateGoing = [
      { id: 'user-1', name: 'Alice', isHost: false },
      { userId: 'user-1', name: 'Alice Duplicate', isHost: false },
      { id: 'user-2', name: 'Bob', isHost: false },
    ];

    const going = formatAssignedGoingList(duplicateGoing);
    expect(going).toHaveLength(2);
    expect(going.map((g) => g.name)).toEqual(['Alice', 'Bob']);

    const duplicateWaitlist = [
      { id: 'user-w1', name: 'Charlie', waitlistPosition: 1 },
      { dbUuid: 'user-w1', name: 'Charlie Duplicate', waitlistPosition: 1 },
      { id: 'user-w2', name: 'Dave', waitlistPosition: 2 },
    ];

    const waitlist = formatAssignedWaitlist(duplicateWaitlist);
    expect(waitlist).toHaveLength(2);
    expect(waitlist.map((w) => w.name)).toEqual(['Charlie', 'Dave']);
  });

  it('8. GoingSection renders participants with stable canonical keys without React key warnings', async () => {
    const { GoingSection } = await import('../../components/GoingSection');

    const goingItems: any[] = [
      { id: 'u1', name: 'Alice', isHost: true },
      { dbUuid: 'u2', name: 'Bob' },
      { user_id: 'u3', name: 'Charlie' },
      { userId: 'u4', name: 'Dave' },
    ];

    renderToString(<GoingSection goingList={goingItems} isHost={true} />);

    const keyErrors = [...warnSpy.mock.calls, ...errorSpy.mock.calls].filter((call: any[]) =>
      typeof call[0] === 'string' &&
      (call[0].includes('Encountered two children with the same key') ||
       call[0].includes('unique "key" prop'))
    );
    expect(keyErrors).toHaveLength(0);
  });

  it('9. WaitlistSection renders participants with stable canonical keys without React key warnings', async () => {
    const { WaitlistSection } = await import('../../components/WaitlistSection');

    const waitlistItems: any[] = [
      { id: 'w1', name: 'Eve', waitlistPosition: 1 },
      { dbUuid: 'w2', name: 'Frank', waitlistPosition: 2 },
      { user_id: 'w3', name: 'Grace', waitlistPosition: 3 },
    ];

    renderToString(
      <WaitlistSection
        waitlist={waitlistItems}
        isHost={true}
        reorderable={false}
      />
    );

    const keyErrors = [...warnSpy.mock.calls, ...errorSpy.mock.calls].filter((call: any[]) =>
      typeof call[0] === 'string' &&
      (call[0].includes('Encountered two children with the same key') ||
       call[0].includes('unique "key" prop'))
    );
    expect(keyErrors).toHaveLength(0);
  });
});

