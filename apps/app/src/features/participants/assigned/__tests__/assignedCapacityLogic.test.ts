import {
  sortGoingFriends,
  renumberWaitlist,
  resolveAssignedParticipants,
  incrementAssignedPlanSize,
  decrementAssignedPlanSize,
} from '../assignedCapacityLogic';
import { Friend } from '../../shared/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('--- RUNNING ASSIGNED CAPACITY LOGIC TESTS ---');

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

// TEST 0: resolveAssignedParticipants with capacity = 3
{
  console.log('\nTest 0: resolveAssignedParticipants');
  const resolved = resolveAssignedParticipants({
    userProfile: { dbUuid: 'host', name: 'You' },
    isHostSelected: true,
    selectedFriends: friends,
    capacity: 3,
    isCapacityConfigured: true,
    savedDraft: null,
  });

  assert(resolved.going.length === 3, `Expected 3 going, got ${resolved.going.length}`);
  assert(resolved.waitlist.length === 5, `Expected 5 waitlisted, got ${resolved.waitlist.length}`);
  assert(resolved.going[0].id === 'host', 'Host should be first in going');
  assert(resolved.going[1].name === 'Alice', 'Alice should be going');
  assert(resolved.going[2].name === 'Bob', 'Bob should be going');
  assert(resolved.waitlist[0].name === 'Charlie' && resolved.waitlist[0].waitlistPosition === 1, 'Charlie should be pos 1');
  assert(resolved.waitlist[4].name === 'Grace' && resolved.waitlist[4].waitlistPosition === 5, 'Grace should be pos 5');
  console.log('✓ Test 0 Passed: Initial state correctly resolved (3 going, 5 waitlisted)');
}

// TEST 1: Increase Capacity from 3 to 4
let state1Going: Friend[] = [];
let state1Waitlist: Friend[] = [];
{
  console.log('\nTest 1: Increase Capacity (3 -> 4)');
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

  assert(res !== null, 'Expected increment to succeed');
  assert(res!.nextCapacity === 4, `Expected capacity 4, got ${res!.nextCapacity}`);
  assert(res!.nextGoing.length === 4, `Expected 4 going, got ${res!.nextGoing.length}`);
  assert(res!.nextWaitlist.length === 4, `Expected 4 waitlisted, got ${res!.nextWaitlist.length}`);

  // First person on waitlist (Charlie) must be promoted to Going
  const goingNames = res!.nextGoing.map((f) => f.name);
  assert(goingNames.includes('Charlie'), 'Charlie must be promoted to going');
  assert(res!.nextGoing[0].id === 'host', 'Host must remain first');
  // Non-host going members must be sorted alphabetically
  assert(res!.nextGoing[1].name === 'Alice', 'Alice must be index 1');
  assert(res!.nextGoing[2].name === 'Bob', 'Bob must be index 2');
  assert(res!.nextGoing[3].name === 'Charlie', 'Charlie must be index 3');

  // Waitlist must be renumbered 1 to 4 starting with David
  assert(res!.nextWaitlist[0].name === 'David' && res!.nextWaitlist[0].waitlistPosition === 1, 'David is now pos 1');
  assert(res!.nextWaitlist[1].name === 'Emma' && res!.nextWaitlist[1].waitlistPosition === 2, 'Emma is pos 2');
  assert(res!.nextWaitlist[2].name === 'Frank' && res!.nextWaitlist[2].waitlistPosition === 3, 'Frank is pos 3');
  assert(res!.nextWaitlist[3].name === 'Grace' && res!.nextWaitlist[3].waitlistPosition === 4, 'Grace is pos 4');

  state1Going = res!.nextGoing;
  state1Waitlist = res!.nextWaitlist;
  console.log('✓ Test 1 Passed: Plan size increased to 4 (Charlie promoted, remaining waitlist renumbered)');
}

// TEST 2: Decrease Capacity from 4 to 3
{
  console.log('\nTest 2: Decrease Capacity (4 -> 3)');
  const res = decrementAssignedPlanSize({
    capacity: 4,
    goingList: state1Going,
    waitlist: state1Waitlist,
  });

  assert(res !== null, 'Expected decrement to succeed');
  assert(res!.nextCapacity === 3, `Expected capacity 3, got ${res!.nextCapacity}`);
  assert(res!.nextGoing.length === 3, `Expected 3 going, got ${res!.nextGoing.length}`);
  assert(res!.nextWaitlist.length === 5, `Expected 5 waitlisted, got ${res!.nextWaitlist.length}`);

  // Last non-host going alphabetically (Charlie) must be demoted
  const goingNames = res!.nextGoing.map((f) => f.name);
  assert(!goingNames.includes('Charlie'), 'Charlie should no longer be in going');
  assert(goingNames.includes('Alice') && goingNames.includes('Bob'), 'Alice and Bob remain going');

  // Demoted member (Charlie) must be appended to the END of waitlist
  const waitlistNames = res!.nextWaitlist.map((f) => f.name);
  assert(waitlistNames[0] === 'David', 'David remains pos 1');
  assert(waitlistNames[1] === 'Emma', 'Emma remains pos 2');
  assert(waitlistNames[2] === 'Frank', 'Frank remains pos 3');
  assert(waitlistNames[3] === 'Grace', 'Grace remains pos 4');
  assert(waitlistNames[4] === 'Charlie', 'Charlie is at the end (pos 5)');
  assert(res!.nextWaitlist[4].waitlistPosition === 5, 'Charlie has waitlistPosition 5');

  console.log('✓ Test 2 Passed: Plan size decreased to 3 (Charlie demoted to end of waitlist)');
}

// TEST 3: Multiple Increases (3 -> 4 -> 5)
{
  console.log('\nTest 3: Multiple Increases (3 -> 4 -> 5)');
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
  assert(step1!.nextCapacity === 4, 'Step 1 capacity is 4');

  const step2 = incrementAssignedPlanSize({
    capacity: 4,
    totalInvitedCount: 8,
    goingList: step1!.nextGoing,
    waitlist: step1!.nextWaitlist,
  });
  assert(step2!.nextCapacity === 5, 'Step 2 capacity is 5');
  assert(step2!.nextGoing.length === 5, '5 going');
  assert(step2!.nextWaitlist.length === 3, '3 waitlisted');

  // Next promoted person was David
  const goingNames = step2!.nextGoing.map((f) => f.name);
  assert(goingNames.includes('David') && goingNames.includes('Charlie'), 'Both Charlie and David are going');
  // Remaining waitlist: Emma (1), Frank (2), Grace (3)
  assert(step2!.nextWaitlist[0].name === 'Emma' && step2!.nextWaitlist[0].waitlistPosition === 1, 'Emma is pos 1');
  assert(step2!.nextWaitlist[1].name === 'Frank' && step2!.nextWaitlist[1].waitlistPosition === 2, 'Frank is pos 2');
  assert(step2!.nextWaitlist[2].name === 'Grace' && step2!.nextWaitlist[2].waitlistPosition === 3, 'Grace is pos 3');

  console.log('✓ Test 3 Passed: Multiple increases work sequentially (3 -> 4 -> 5)');
}

// TEST 4: Multiple Decreases (5 -> 4 -> 3)
{
  console.log('\nTest 4: Multiple Decreases (5 -> 4 -> 3)');
  // Starting from 5 going: Host, Alice, Bob, Charlie, David
  const fiveGoing: Friend[] = [host, friends[0], friends[1], friends[2], friends[3]];
  const threeWaitlist: Friend[] = [
    { ...friends[4], waitlistPosition: 1 },
    { ...friends[5], waitlistPosition: 2 },
    { ...friends[6], waitlistPosition: 3 },
  ];

  // 5 -> 4 (David should be demoted)
  const step1 = decrementAssignedPlanSize({
    capacity: 5,
    goingList: fiveGoing,
    waitlist: threeWaitlist,
  });
  assert(step1!.nextCapacity === 4, 'Step 1 capacity is 4');
  assert(!step1!.nextGoing.some((f) => f.name === 'David'), 'David demoted');
  assert(step1!.nextWaitlist[step1!.nextWaitlist.length - 1].name === 'David', 'David placed at end of waitlist');

  // 4 -> 3 (Charlie should be demoted)
  const step2 = decrementAssignedPlanSize({
    capacity: 4,
    goingList: step1!.nextGoing,
    waitlist: step1!.nextWaitlist,
  });
  assert(step2!.nextCapacity === 3, 'Step 2 capacity is 3');
  assert(!step2!.nextGoing.some((f) => f.name === 'Charlie'), 'Charlie demoted');
  assert(step2!.nextWaitlist[step2!.nextWaitlist.length - 1].name === 'Charlie', 'Charlie placed at end of waitlist');
  assert(step2!.nextWaitlist.length === 5, 'Waitlist now has 5 members');

  console.log('✓ Test 4 Passed: Multiple decreases work sequentially (5 -> 4 -> 3)');
}

// TEST 5: Boundary Conditions
{
  console.log('\nTest 5: Boundary Conditions');
  // Boundary A: Cannot increment when capacity >= totalInvitedCount
  const allGoing: Friend[] = [host, ...friends];
  const noWaitlist: Friend[] = [];
  const atMax = incrementAssignedPlanSize({
    capacity: 8,
    totalInvitedCount: 8,
    goingList: allGoing,
    waitlist: noWaitlist,
  });
  assert(atMax === null, 'Increment at max capacity must return null');

  // Boundary B: Cannot decrement when capacity <= 2
  const minGoing: Friend[] = [host, friends[0]];
  const atMin = decrementAssignedPlanSize({
    capacity: 2,
    goingList: minGoing,
    waitlist: friends.slice(1),
  });
  assert(atMin === null, 'Decrement at min capacity (2) must return null');

  // Boundary C: Empty waitlist cannot increment
  const emptyWaitlistRes = incrementAssignedPlanSize({
    capacity: 4,
    totalInvitedCount: 8,
    goingList: minGoing,
    waitlist: [],
  });
  assert(emptyWaitlistRes === null, 'Increment with empty waitlist must return null');

  console.log('✓ Test 5 Passed: Boundary conditions strictly enforced');
}

console.log('\nALL ASSIGNED CAPACITY LOGIC TESTS PASSED SUCCESSFULLY! 🎉\n');
