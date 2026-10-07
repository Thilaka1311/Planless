import { describe, it, expect } from 'vitest';
import { memberToAssignedFriend } from '../AssignedParticipantContainer';

describe('switchWaitlistModeState (Automatic → Assigned) and RSVP Status Immutability', () => {
  it('assigns GOING to JOINED/HOST members and WAITLIST to INVITED/WAITLISTED members when group is unset', () => {
    const hostMember = {
      userUuid: 'host-1',
      name: 'Host User',
      isHost: true,
      role: 'HOST',
      rsvp_status: 'JOINED',
    };
    const joinedMember = {
      userUuid: 'user-joined',
      name: 'Zara Joined',
      role: 'PARTICIPANT',
      rsvp_status: 'JOINED',
      joined_queue_at: '2026-09-30T10:00:00Z',
    };
    const waitlistedMember = {
      userUuid: 'user-waitlist',
      name: 'Aaron Waitlist',
      role: 'PARTICIPANT',
      rsvp_status: 'WAITLISTED',
      joined_queue_at: '2026-09-30T10:05:00Z',
    };
    const invitedMember = {
      userUuid: 'user-invited',
      name: 'Bob Invited',
      role: 'PARTICIPANT',
      rsvp_status: 'INVITED',
    };

    const hostFriend = memberToAssignedFriend(hostMember, 'host-1', 'host-1', [], 'plan-1');
    const joinedFriend = memberToAssignedFriend(joinedMember, 'host-1', 'host-1', [], 'plan-1');
    const waitlistFriend = memberToAssignedFriend(waitlistedMember, 'host-1', 'host-1', [], 'plan-1');
    const invitedFriend = memberToAssignedFriend(invitedMember, 'host-1', 'host-1', [], 'plan-1');

    expect(hostFriend.assignedGroup).toBe('GOING');
    expect(hostFriend.rsvpStatus).toBe('JOINED');

    expect(joinedFriend.assignedGroup).toBe('GOING');
    expect(joinedFriend.rsvpStatus).toBe('JOINED');

    expect(waitlistFriend.assignedGroup).toBe('WAITLIST');
    expect(waitlistFriend.rsvpStatus).toBe('WAITLISTED');

    // Crucial: Invited friend retains INVITED status
    expect(invitedFriend.assignedGroup).toBe('WAITLIST');
    expect(invitedFriend.rsvpStatus).toBe('INVITED');
  });

  it('preserves 3 Joined + 5 Waitlisted when Plan Size = 3 without reshuffling or alphabetical override', () => {
    // 3 joined participants (Host + 2 friends)
    const members = [
      { id: 'u1', name: 'Zack Host', role: 'HOST', isHost: true, rsvpStatus: 'JOINED', assignedGroup: 'GOING' },
      { id: 'u2', name: 'Yvonne Joined', isHost: false, rsvpStatus: 'JOINED', assignedGroup: 'GOING', joinedQueueAt: '2026-09-30T10:00:00Z' },
      { id: 'u3', name: 'Xavier Joined', isHost: false, rsvpStatus: 'JOINED', assignedGroup: 'GOING', joinedQueueAt: '2026-09-30T10:05:00Z' },
      // 5 waitlisted participants whose names start with A, B, C...
      { id: 'w1', name: 'Alice Waitlist', isHost: false, rsvpStatus: 'WAITLISTED', assignedGroup: 'WAITLIST', waitlistPosition: 1, joinedQueueAt: '2026-09-30T10:10:00Z' },
      { id: 'w2', name: 'Bob Waitlist', isHost: false, rsvpStatus: 'WAITLISTED', assignedGroup: 'WAITLIST', waitlistPosition: 2, joinedQueueAt: '2026-09-30T10:15:00Z' },
      { id: 'w3', name: 'Charlie Waitlist', isHost: false, rsvpStatus: 'WAITLISTED', assignedGroup: 'WAITLIST', waitlistPosition: 3, joinedQueueAt: '2026-09-30T10:20:00Z' },
      { id: 'w4', name: 'David Waitlist', isHost: false, rsvpStatus: 'WAITLISTED', assignedGroup: 'WAITLIST', waitlistPosition: 4, joinedQueueAt: '2026-09-30T10:25:00Z' },
      { id: 'w5', name: 'Eve Waitlist', isHost: false, rsvpStatus: 'WAITLISTED', assignedGroup: 'WAITLIST', waitlistPosition: 5, joinedQueueAt: '2026-09-30T10:30:00Z' },
    ];

    const going = members.filter(m => m.assignedGroup === 'GOING');
    const waitlist = members.filter(m => m.assignedGroup === 'WAITLIST');

    expect(going).toHaveLength(3);
    expect(waitlist).toHaveLength(5);

    // Exact same 3 participants in Joined
    expect(going.map(g => g.id)).toEqual(['u1', 'u2', 'u3']);
    // Exact same 5 participants in Waitlist in queue order
    expect(waitlist.map(w => w.id)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5']);
  });

  it('promotes earliest waitlisted participants to GOING preserving their RSVP status', () => {
    const planSize = 4;
    // 2 joined participants, 3 waitlisted participants
    const going = [
      { id: 'h1', name: 'Host', isHost: true, rsvpStatus: 'JOINED' as const, assignedGroup: 'GOING' as const },
      { id: 'j1', name: 'Joined User', isHost: false, rsvpStatus: 'JOINED' as const, assignedGroup: 'GOING' as const, joinedQueueAt: '2026-09-30T10:00:00Z' },
    ];
    const waitlist = [
      { id: 'w1', name: 'Waitlist 1', isHost: false, rsvpStatus: 'WAITLISTED' as const, assignedGroup: 'WAITLIST' as const, waitlistPosition: 1, joinedQueueAt: '2026-09-30T10:05:00Z' },
      { id: 'w2', name: 'Waitlist 2', isHost: false, rsvpStatus: 'WAITLISTED' as const, assignedGroup: 'WAITLIST' as const, waitlistPosition: 2, joinedQueueAt: '2026-09-30T10:10:00Z' },
      { id: 'w3', name: 'Waitlist 3', isHost: false, rsvpStatus: 'WAITLISTED' as const, assignedGroup: 'WAITLIST' as const, waitlistPosition: 3, joinedQueueAt: '2026-09-30T10:15:00Z' },
    ];

    const availableSpots = planSize - going.length; // 2 spots
    const promoted = waitlist.slice(0, availableSpots).map(p => ({
      ...p,
      assignedGroup: 'GOING' as const,
      rsvpStatus: p.rsvpStatus, // RSVP status remains unchanged
      waitlistPosition: undefined,
    }));
    const remainingWaitlist = waitlist.slice(availableSpots).map((p, idx) => ({
      ...p,
      waitlistPosition: idx + 1,
    }));

    const finalGoing = [...going, ...promoted];
    expect(finalGoing).toHaveLength(4);
    expect(finalGoing.map(p => p.id)).toEqual(['h1', 'j1', 'w1', 'w2']);
    expect(finalGoing.every(p => p.assignedGroup === 'GOING')).toBe(true);

    expect(remainingWaitlist).toHaveLength(1);
    expect(remainingWaitlist[0].id).toBe('w3');
    expect(remainingWaitlist[0].waitlistPosition).toBe(1);
    expect(remainingWaitlist[0].rsvpStatus).toBe('WAITLISTED');
    expect(remainingWaitlist[0].assignedGroup).toBe('WAITLIST');
  });

  it('fills all available Join slots up to Plan Size (3/3) while keeping INVITED status strictly immutable', () => {
    const planSize = 3;
    const rawDisplayGoing = [
      { id: 'h1', name: 'Host', isHost: true, rsvpStatus: 'JOINED' as const, assignedGroup: 'GOING' as const },
      { id: 'j1', name: 'Bhaavya', isHost: false, rsvpStatus: 'JOINED' as const, assignedGroup: 'GOING' as const },
    ];
    // 4 invited participants in waitlist
    const rawDisplayWaitlist = [
      { id: 'w1', name: 'Thilaka Sundar', isHost: false, rsvpStatus: 'INVITED' as const, assignedGroup: 'WAITLIST' as const, waitlistPosition: 1 },
      { id: 'w2', name: 'RAAM', isHost: false, rsvpStatus: 'INVITED' as const, assignedGroup: 'WAITLIST' as const, waitlistPosition: 2 },
      { id: 'w3', name: 'Ren', isHost: false, rsvpStatus: 'INVITED' as const, assignedGroup: 'WAITLIST' as const, waitlistPosition: 3 },
      { id: 'w4', name: 'Aznan', isHost: false, rsvpStatus: 'INVITED' as const, assignedGroup: 'WAITLIST' as const, waitlistPosition: 4 },
    ];

    // Priority logic determines WHO occupies the Join slots (assignedGroup = 'GOING');
    // it never reduces Join slots AND it never mutates RSVP status (INVITED remains INVITED)
    const spotsToPromote = Math.min(planSize - rawDisplayGoing.length, rawDisplayWaitlist.length);
    expect(spotsToPromote).toBe(1);

    const promoted = rawDisplayWaitlist.slice(0, spotsToPromote).map(p => ({
      ...p,
      waitlistPosition: undefined,
      assignedGroup: 'GOING' as const,
      rsvpStatus: p.rsvpStatus, // Invariant: INVITED stays INVITED!
    }));
    const displayGoing = [...rawDisplayGoing, ...promoted];
    const remainingWaitlist = rawDisplayWaitlist.slice(spotsToPromote).map((p, idx) => ({
      ...p,
      waitlistPosition: idx + 1,
      rsvpStatus: p.rsvpStatus, // Invariant: INVITED stays INVITED!
    }));

    // Joined shows 3/3
    expect(displayGoing).toHaveLength(3);
    expect(displayGoing.map(p => p.id)).toEqual(['h1', 'j1', 'w1']);
    expect(displayGoing.map(p => p.assignedGroup)).toEqual(['GOING', 'GOING', 'GOING']);

    // Thilaka Sundar is in Joined (GOING), but their personal RSVP status remains INVITED
    expect(displayGoing.find(p => p.id === 'w1')?.rsvpStatus).toBe('INVITED');
    expect(displayGoing.find(p => p.id === 'j1')?.rsvpStatus).toBe('JOINED');

    // Remaining 3 participants stay in Waitlist with contiguous positions and INVITED status
    expect(remainingWaitlist).toHaveLength(3);
    expect(remainingWaitlist.map(w => w.id)).toEqual(['w2', 'w3', 'w4']);
    expect(remainingWaitlist.map(w => w.waitlistPosition)).toEqual([1, 2, 3]);
    expect(remainingWaitlist.every(w => w.rsvpStatus === 'INVITED' && w.assignedGroup === 'WAITLIST')).toBe(true);
  });

  it('moving participant between Joined and Waitlist only changes assignedGroup, never rsvpStatus', () => {
    // When an invited participant in GOING is moved to WAITLIST:
    const goingInvited = { id: 'w1', name: 'Thilaka Sundar', rsvpStatus: 'INVITED' as const, assignedGroup: 'GOING' as const };
    const movedToWaitlist = {
      ...goingInvited,
      assignedGroup: 'WAITLIST' as const,
      waitlistPosition: 1,
      rsvpStatus: goingInvited.rsvpStatus, // NEVER changes!
    };
    expect(movedToWaitlist.assignedGroup).toBe('WAITLIST');
    expect(movedToWaitlist.rsvpStatus).toBe('INVITED');

    // When an invited participant in WAITLIST is moved to GOING:
    const waitlistInvited = { id: 'w2', name: 'RAAM', rsvpStatus: 'INVITED' as const, assignedGroup: 'WAITLIST' as const, waitlistPosition: 1 };
    const movedToGoing = {
      ...waitlistInvited,
      assignedGroup: 'GOING' as const,
      waitlistPosition: undefined,
      rsvpStatus: waitlistInvited.rsvpStatus, // NEVER changes!
    };
    expect(movedToGoing.assignedGroup).toBe('GOING');
    expect(movedToGoing.rsvpStatus).toBe('INVITED');
  });
});
