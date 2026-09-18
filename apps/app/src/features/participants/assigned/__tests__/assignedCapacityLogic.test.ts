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
});
