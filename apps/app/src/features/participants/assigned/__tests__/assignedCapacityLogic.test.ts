import { describe, it, expect } from 'vitest';
import {
  sortGoingFriends,
  renumberWaitlist,
  resolveAssignedParticipants,
  incrementAssignedPlanSize,
  decrementAssignedPlanSize,
} from '../assignedCapacityLogic';
import { Friend } from '../../shared/types';

describe('assignedCapacityLogic', () => {
  // Mock data: 1 Host + 7 Friends
  const host: Friend = { id: 'host', dbUuid: 'host', name: 'You', avatar: 'https://example.com/host.png', isHost: true };
  const friends: Friend[] = [
    { id: 'f1', dbUuid: 'u1', name: 'Alice', avatar: 'https://example.com/alice.png' },
    { id: 'f2', dbUuid: 'u2', name: 'Bob', avatar: 'https://example.com/bob.png' },
    { id: 'f3', dbUuid: 'u3', name: 'Charlie', avatar: 'https://example.com/charlie.png' },
    { id: 'f4', dbUuid: 'u4', name: 'David', avatar: 'https://example.com/david.png' },
    { id: 'f5', dbUuid: 'u5', name: 'Emma', avatar: 'https://example.com/emma.png' },
    { id: 'f6', dbUuid: 'u6', name: 'Frank', avatar: 'https://example.com/frank.png' },
    { id: 'f7', dbUuid: 'u7', name: 'Grace', avatar: 'https://example.com/grace.png' },
  ];

  it('Test 0: resolveAssignedParticipants with capacity = 3', () => {
    const resolved = resolveAssignedParticipants({
      userProfile: { dbUuid: 'host', name: 'You' },
      isHostSelected: true,
      selectedFriends: friends,
      capacity: 3,
      isCapacityConfigured: true,
      savedDraft: null,
    });

    expect(resolved.going.length).toBe(3);
    expect(resolved.waitlist.length).toBe(5);
    expect(resolved.going[0].id).toBe('host');
    expect(resolved.going[1].name).toBe('Alice');
    expect(resolved.going[2].name).toBe('Bob');
    expect(resolved.waitlist[0].name).toBe('Charlie');
    expect(resolved.waitlist[0].waitlistPosition).toBe(1);
    expect(resolved.waitlist[4].name).toBe('Grace');
    expect(resolved.waitlist[4].waitlistPosition).toBe(5);
  });

  it('Test 1: Increase Capacity from 3 to 4', () => {
    const initial = resolveAssignedParticipants({
      userProfile: { dbUuid: 'host', name: 'You' },
      isHostSelected: true,
      selectedFriends: friends,
      capacity: 3,
      isCapacityConfigured: true,
      savedDraft: null,
    });

    const res = incrementAssignedPlanSize({
      capacity: 3,
      totalInvitedCount: 8,
      goingList: initial.going,
      waitlist: initial.waitlist,
    });

    expect(res).not.toBeNull();
    expect(res!.nextCapacity).toBe(4);
    expect(res!.nextGoing.length).toBe(4);
    expect(res!.nextWaitlist.length).toBe(4);

    const goingNames = res!.nextGoing.map((f) => f.name);
    expect(goingNames).toContain('Charlie');
    expect(res!.nextGoing[0].id).toBe('host');
    expect(res!.nextGoing[1].name).toBe('Alice');
    expect(res!.nextGoing[2].name).toBe('Bob');
    expect(res!.nextGoing[3].name).toBe('Charlie');

    expect(res!.nextWaitlist[0].name).toBe('David');
    expect(res!.nextWaitlist[0].waitlistPosition).toBe(1);
    expect(res!.nextWaitlist[1].name).toBe('Emma');
    expect(res!.nextWaitlist[1].waitlistPosition).toBe(2);
    expect(res!.nextWaitlist[2].name).toBe('Frank');
    expect(res!.nextWaitlist[2].waitlistPosition).toBe(3);
    expect(res!.nextWaitlist[3].name).toBe('Grace');
    expect(res!.nextWaitlist[3].waitlistPosition).toBe(4);
  });

  it('Test 2: Decrease Capacity from 4 to 3', () => {
    const initial = resolveAssignedParticipants({
      userProfile: { dbUuid: 'host', name: 'You' },
      isHostSelected: true,
      selectedFriends: friends,
      capacity: 3,
      isCapacityConfigured: true,
      savedDraft: null,
    });

    const inc = incrementAssignedPlanSize({
      capacity: 3,
      totalInvitedCount: 8,
      goingList: initial.going,
      waitlist: initial.waitlist,
    })!;

    const res = decrementAssignedPlanSize({
      capacity: 4,
      goingList: inc.nextGoing,
      waitlist: inc.nextWaitlist,
    });

    expect(res).not.toBeNull();
    expect(res!.nextCapacity).toBe(3);
    expect(res!.nextGoing.length).toBe(3);
    expect(res!.nextWaitlist.length).toBe(5);

    const goingNames = res!.nextGoing.map((f) => f.name);
    expect(goingNames).not.toContain('Charlie');
    expect(goingNames).toContain('Alice');
    expect(goingNames).toContain('Bob');

    const waitlistNames = res!.nextWaitlist.map((f) => f.name);
    expect(waitlistNames[0]).toBe('David');
    expect(waitlistNames[1]).toBe('Emma');
    expect(waitlistNames[2]).toBe('Frank');
    expect(waitlistNames[3]).toBe('Grace');
    expect(waitlistNames[4]).toBe('Charlie');
    expect(res!.nextWaitlist[4].waitlistPosition).toBe(5);
  });

  it('Test 3: Multiple Increases (3 -> 4 -> 5)', () => {
    const initial = resolveAssignedParticipants({
      userProfile: { dbUuid: 'host', name: 'You' },
      isHostSelected: true,
      selectedFriends: friends,
      capacity: 3,
      isCapacityConfigured: true,
      savedDraft: null,
    });

    const step1 = incrementAssignedPlanSize({
      capacity: 3,
      totalInvitedCount: 8,
      goingList: initial.going,
      waitlist: initial.waitlist,
    });
    expect(step1!.nextCapacity).toBe(4);

    const step2 = incrementAssignedPlanSize({
      capacity: 4,
      totalInvitedCount: 8,
      goingList: step1!.nextGoing,
      waitlist: step1!.nextWaitlist,
    });
    expect(step2!.nextCapacity).toBe(5);
    expect(step2!.nextGoing.length).toBe(5);
    expect(step2!.nextWaitlist.length).toBe(3);

    const goingNames = step2!.nextGoing.map((f) => f.name);
    expect(goingNames).toContain('David');
    expect(goingNames).toContain('Charlie');
    expect(step2!.nextWaitlist[0].name).toBe('Emma');
    expect(step2!.nextWaitlist[0].waitlistPosition).toBe(1);
    expect(step2!.nextWaitlist[1].name).toBe('Frank');
    expect(step2!.nextWaitlist[1].waitlistPosition).toBe(2);
    expect(step2!.nextWaitlist[2].name).toBe('Grace');
    expect(step2!.nextWaitlist[2].waitlistPosition).toBe(3);
  });

  it('Test 4: Multiple Decreases (5 -> 4 -> 3)', () => {
    const fiveGoing: Friend[] = [host, friends[0], friends[1], friends[2], friends[3]];
    const threeWaitlist: Friend[] = [
      { ...friends[4], waitlistPosition: 1 },
      { ...friends[5], waitlistPosition: 2 },
      { ...friends[6], waitlistPosition: 3 },
    ];

    const step1 = decrementAssignedPlanSize({
      capacity: 5,
      goingList: fiveGoing,
      waitlist: threeWaitlist,
    });
    expect(step1!.nextCapacity).toBe(4);
    expect(step1!.nextGoing.some((f) => f.name === 'David')).toBe(false);
    expect(step1!.nextWaitlist[step1!.nextWaitlist.length - 1].name).toBe('David');

    const step2 = decrementAssignedPlanSize({
      capacity: 4,
      goingList: step1!.nextGoing,
      waitlist: step1!.nextWaitlist,
    });
    expect(step2!.nextCapacity).toBe(3);
    expect(step2!.nextGoing.some((f) => f.name === 'Charlie')).toBe(false);
    expect(step2!.nextWaitlist[step2!.nextWaitlist.length - 1].name).toBe('Charlie');
    expect(step2!.nextWaitlist.length).toBe(5);
  });

  it('Test 5: Boundary Conditions', () => {
    const allGoing: Friend[] = [host, ...friends];
    const noWaitlist: Friend[] = [];
    const atMax = incrementAssignedPlanSize({
      capacity: 8,
      totalInvitedCount: 8,
      goingList: allGoing,
      waitlist: noWaitlist,
    });
    expect(atMax).toBeNull();

    const minGoing: Friend[] = [host, friends[0]];
    const atMin = decrementAssignedPlanSize({
      capacity: 2,
      goingList: minGoing,
      waitlist: friends.slice(1),
    });
    expect(atMin).toBeNull();

    const emptyWaitlistRes = incrementAssignedPlanSize({
      capacity: 4,
      totalInvitedCount: 8,
      goingList: minGoing,
      waitlist: [],
    });
    expect(emptyWaitlistRes).toBeNull();
  });

  describe('User-Required State & Capacity Split Test Suite', () => {
    // 7 active participants (1 host + 6 friends)
    const testHost: Friend = { id: 'host', dbUuid: 'host_uuid', name: 'You', avatar: '', isHost: true };
    const sixFriends: Friend[] = [
      { id: 'f1', dbUuid: 'u1', name: 'Aznan', avatar: '', rsvpStatus: 'INVITED' },
      { id: 'f2', dbUuid: 'u2', name: 'Bhaavya', avatar: '', rsvpStatus: 'INVITED' },
      { id: 'f3', dbUuid: 'u3', name: 'Jeppu', avatar: '', rsvpStatus: 'JOINED', isAccepted: true },
      { id: 'f4', dbUuid: 'u4', name: 'Pranav', avatar: '', rsvpStatus: 'JOINED', isAccepted: true },
      { id: 'f5', dbUuid: 'u5', name: 'RAAM', avatar: '', rsvpStatus: 'INVITED' },
      { id: 'f6', dbUuid: 'u6', name: 'Thilaka Sundar', avatar: '', rsvpStatus: 'INVITED' },
    ];

    it('1. plan_size 5 / 7 active participants -> 5 Joined, 2 Waitlisted', () => {
      const resolved = resolveAssignedParticipants({
        userProfile: { dbUuid: 'host_uuid', name: 'You' },
        isHostSelected: true,
        selectedFriends: sixFriends,
        capacity: 5,
        savedDraft: null,
      });

      expect(resolved.going.length).toBe(5);
      expect(resolved.waitlist.length).toBe(2);
      expect(resolved.going[0].id).toBe('host');
      expect(resolved.going[0].isHost).toBe(true);
      expect(resolved.waitlist[0].waitlistPosition).toBe(1);
      expect(resolved.waitlist[1].waitlistPosition).toBe(2);
    });

    it('2. plan_size 7 / 7 active participants -> 7 Joined, 0 Waitlisted', () => {
      const resolved = resolveAssignedParticipants({
        userProfile: { dbUuid: 'host_uuid', name: 'You' },
        isHostSelected: true,
        selectedFriends: sixFriends,
        capacity: 7,
        savedDraft: null,
      });

      expect(resolved.going.length).toBe(7);
      expect(resolved.waitlist.length).toBe(0);
      expect(resolved.going[0].id).toBe('host');
    });

    it('3. increase 5 -> 6 -> one waitlisted participant promoted', () => {
      const initial = resolveAssignedParticipants({
        userProfile: { dbUuid: 'host_uuid', name: 'You' },
        isHostSelected: true,
        selectedFriends: sixFriends,
        capacity: 5,
        savedDraft: null,
      });

      expect(initial.going.length).toBe(5);
      expect(initial.waitlist.length).toBe(2);
      const candidateToPromote = initial.waitlist[0];

      const res = incrementAssignedPlanSize({
        capacity: 5,
        totalInvitedCount: 7,
        goingList: initial.going,
        waitlist: initial.waitlist,
      });

      expect(res).not.toBeNull();
      expect(res!.nextCapacity).toBe(6);
      expect(res!.nextGoing.length).toBe(6);
      expect(res!.nextWaitlist.length).toBe(1);
      expect(res!.nextGoing.some((f) => f.id === candidateToPromote.id)).toBe(true);
      expect(res!.nextWaitlist[0].waitlistPosition).toBe(1);
    });

    it('4. decrease 6 -> 5 -> one Joined participant moved to Waitlist', () => {
      const initial = resolveAssignedParticipants({
        userProfile: { dbUuid: 'host_uuid', name: 'You' },
        isHostSelected: true,
        selectedFriends: sixFriends,
        capacity: 6,
        savedDraft: null,
      });

      expect(initial.going.length).toBe(6);
      expect(initial.waitlist.length).toBe(1);

      const res = decrementAssignedPlanSize({
        capacity: 6,
        goingList: initial.going,
        waitlist: initial.waitlist,
      });

      expect(res).not.toBeNull();
      expect(res!.nextCapacity).toBe(5);
      expect(res!.nextGoing.length).toBe(5);
      expect(res!.nextWaitlist.length).toBe(2);
      // Waitlist positions must remain contiguous 1..N
      expect(res!.nextWaitlist[0].waitlistPosition).toBe(1);
      expect(res!.nextWaitlist[1].waitlistPosition).toBe(2);
    });

    it('5. INVITED participants remain INVITED when capacity changes', () => {
      const initial = resolveAssignedParticipants({
        userProfile: { dbUuid: 'host_uuid', name: 'You' },
        isHostSelected: true,
        selectedFriends: sixFriends,
        capacity: 5,
        savedDraft: null,
      });

      // Initially, waitlist has INVITED participants
      expect(initial.waitlist[0].rsvpStatus).toBe('INVITED');

      // Increase capacity: promote waitlist[0]
      const inc = incrementAssignedPlanSize({
        capacity: 5,
        totalInvitedCount: 7,
        goingList: initial.going,
        waitlist: initial.waitlist,
      })!;

      const promoted = inc.nextGoing.find((f) => f.id === initial.waitlist[0].id);
      expect(promoted).toBeDefined();
      // Must not convert INVITED to JOINED purely due to capacity change
      expect(promoted!.rsvpStatus).toBe('INVITED');

      // Decrease capacity back to 5
      const dec = decrementAssignedPlanSize({
        capacity: 6,
        goingList: inc.nextGoing,
        waitlist: inc.nextWaitlist,
      })!;

      const demoted = dec.nextWaitlist.find((f) => f.id === promoted!.id);
      expect(demoted).toBeDefined();
      expect(demoted!.rsvpStatus).toBe('INVITED');
    });

    it('6. waitlist positions remain contiguous and correctly ordered', () => {
      const initial = resolveAssignedParticipants({
        userProfile: { dbUuid: 'host_uuid', name: 'You' },
        isHostSelected: true,
        selectedFriends: sixFriends,
        capacity: 3,
        savedDraft: null,
      });

      expect(initial.waitlist.length).toBe(4);
      initial.waitlist.forEach((f, idx) => {
        expect(f.waitlistPosition).toBe(idx + 1);
      });

      // Increase to 5
      const inc = incrementAssignedPlanSize({
        capacity: 3,
        totalInvitedCount: 7,
        goingList: initial.going,
        waitlist: initial.waitlist,
      })!;
      const inc2 = incrementAssignedPlanSize({
        capacity: 4,
        totalInvitedCount: 7,
        goingList: inc.nextGoing,
        waitlist: inc.nextWaitlist,
      })!;

      expect(inc2.nextWaitlist.length).toBe(2);
      expect(inc2.nextWaitlist[0].waitlistPosition).toBe(1);
      expect(inc2.nextWaitlist[1].waitlistPosition).toBe(2);
    });

    it('7. host is never displaced', () => {
      const initial = resolveAssignedParticipants({
        userProfile: { dbUuid: 'host_uuid', name: 'You' },
        isHostSelected: true,
        selectedFriends: sixFriends,
        capacity: 6,
        savedDraft: null,
      });

      // Repeatedly decrease down to minimum capacity of 2
      let currentGoing = initial.going;
      let currentWaitlist = initial.waitlist;
      let cap = 6;

      while (cap > 2) {
        const res = decrementAssignedPlanSize({
          capacity: cap,
          goingList: currentGoing,
          waitlist: currentWaitlist,
        })!;
        expect(res.nextGoing.some((f) => f.id === 'host' && f.isHost)).toBe(true);
        expect(res.nextGoing[0].id).toBe('host');
        currentGoing = res.nextGoing;
        currentWaitlist = res.nextWaitlist;
        cap = res.nextCapacity;
      }

      expect(currentGoing.length).toBe(2);
      expect(currentGoing[0].id).toBe('host');
      expect(currentGoing[0].isHost).toBe(true);
    });
  });
});
