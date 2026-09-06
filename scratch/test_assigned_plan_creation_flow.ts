import assert from 'node:assert';

interface Friend {
  id: string;
  name: string;
  isHost?: boolean;
  waitlistPosition?: number;
}

// Mirroring the exact helper and logic implemented in AssignedParticipantScreen
const sortGoingFriends = (friends: Friend[]): Friend[] => {
  return [...friends].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  );
};

const renumberWaitlist = (friends: Friend[]): Friend[] => {
  return friends.map((f, idx) => ({ ...f, waitlistPosition: idx + 1 }));
};

class AssignedCreationState {
  hostItem: Friend = { id: 'host', name: 'Maanastej', isHost: true };
  goingList: Friend[] = [];
  waitlist: Friend[] = [];
  capacity: number = 0;

  init(friends: Friend[], initialCap: number) {
    const sorted = sortGoingFriends(friends);
    const all = [this.hostItem, ...sorted];
    this.goingList = all.slice(0, initialCap);
    this.waitlist = renumberWaitlist(all.slice(initialCap));
    this.capacity = this.goingList.length;
  }

  // 1A. Move Waitlist -> Joined
  moveWaitlistToGoing(item: Friend) {
    this.waitlist = renumberWaitlist(this.waitlist.filter((f) => f.id !== item.id));
    const hostPart = this.goingList.filter((f) => f.isHost);
    const guestPart = this.goingList.filter((f) => !f.isHost && f.id !== item.id);
    this.goingList = [...hostPart, ...sortGoingFriends([...guestPart, { ...item, waitlistPosition: undefined }])];
    this.capacity = this.goingList.length;
  }

  // 1B. Move Joined -> Waitlist
  moveGoingToWaitlist(item: Friend) {
    if (item.isHost) return;
    this.goingList = this.goingList.filter((f) => f.id !== item.id);
    this.capacity = this.goingList.length;
    this.waitlist = renumberWaitlist([...this.waitlist.filter((f) => f.id !== item.id), item]);
  }

  // 2. Plan Size +
  incrementPlanSize() {
    if (this.waitlist.length > 0) {
      const promoted = this.waitlist[0];
      this.waitlist = renumberWaitlist(this.waitlist.slice(1));
      const hostPart = this.goingList.filter((f) => f.isHost);
      const guestPart = this.goingList.filter((f) => !f.isHost && f.id !== promoted.id);
      this.goingList = [...hostPart, ...sortGoingFriends([...guestPart, { ...promoted, waitlistPosition: undefined }])];
      this.capacity = this.goingList.length;
    } else {
      this.capacity += 1;
    }
  }

  // 3. Plan Size -
  decrementPlanSize() {
    if (this.capacity <= 2) return;
    if (this.capacity > this.goingList.length) {
      this.capacity -= 1;
      return;
    }

    const nonHostGoing = sortGoingFriends(this.goingList.filter((f) => !f.isHost));
    if (nonHostGoing.length === 0 || this.goingList.length <= 2) return;

    const demoted = nonHostGoing[nonHostGoing.length - 1];
    this.goingList = this.goingList.filter((f) => f.id !== demoted.id);
    this.capacity = this.goingList.length;
    this.waitlist = renumberWaitlist([...this.waitlist.filter((f) => f.id !== demoted.id), demoted]);
  }

  // 6. Remove from Plan
  removeFromPlan(item: Friend) {
    const wasInGoing = this.goingList.some((f) => f.id === item.id);
    this.goingList = this.goingList.filter((f) => f.id !== item.id);
    if (wasInGoing) {
      this.capacity = Math.max(2, this.goingList.length);
    }
    this.waitlist = renumberWaitlist(this.waitlist.filter((f) => f.id !== item.id));
  }
}

function runTests() {
  console.log('🧪 Starting tests for Assigned Plan Creation Flow...');

  // Setup: 7 friends + 1 host = 8 total
  // Initial plan size = 5 (Host + 4 friends in Going, 3 friends in Waitlist)
  const friends: Friend[] = [
    { id: 'f1', name: 'Bhaavya' },
    { id: 'f2', name: 'Jeppu' },
    { id: 'f3', name: 'Lakshmi Devi' },
    { id: 'f4', name: 'Pranav' },
    { id: 'f5', name: 'Ren' },
    { id: 'f6', name: 'Renjith' },
    { id: 'f7', name: 'Thilaka Sundar' },
  ];

  const state = new AssignedCreationState();
  state.init(friends, 5);

  console.log('Test 1: Initial state validation');
  assert.strictEqual(state.capacity, 5, 'Capacity must be 5');
  assert.strictEqual(state.goingList.length, 5, 'Going count must be 5');
  assert.strictEqual(state.waitlist.length, 3, 'Waitlist count must be 3');
  assert.strictEqual(state.capacity === state.goingList.length, true, 'Invariant planSize === joinedCount');
  assert.deepStrictEqual(
    state.waitlist.map((w) => `#${w.waitlistPosition} ${w.name}`),
    ['#1 Ren', '#2 Renjith', '#3 Thilaka Sundar'],
    'Waitlist must be numbered #1, #2, #3'
  );
  console.log('✓ Initial state passed');

  console.log('\nTest 2: Move Waitlist #1 -> Joined');
  // Move Ren (Waitlist #1) -> Joined
  const ren = state.waitlist[0];
  state.moveWaitlistToGoing(ren);
  assert.strictEqual(state.capacity, 6, 'Capacity must increase to 6');
  assert.strictEqual(state.goingList.length, 6, 'Going count must increase to 6');
  assert.strictEqual(state.waitlist.length, 2, 'Waitlist count must decrease to 2');
  assert.deepStrictEqual(
    state.waitlist.map((w) => `#${w.waitlistPosition} ${w.name}`),
    ['#1 Renjith', '#2 Thilaka Sundar'],
    'Waitlist must be renumbered #1, #2'
  );
  assert(state.goingList.some((g) => g.name === 'Ren'), 'Ren must be in Going');
  console.log('✓ Move Waitlist -> Joined passed');

  console.log('\nTest 3: Move Going -> Waitlist');
  // Move Bhaavya from Going -> Waitlist
  const bhaavya = state.goingList.find((g) => g.name === 'Bhaavya')!;
  state.moveGoingToWaitlist(bhaavya);
  assert.strictEqual(state.capacity, 5, 'Capacity must decrease to 5');
  assert.strictEqual(state.goingList.length, 5, 'Going count must decrease to 5');
  assert.strictEqual(state.waitlist.length, 3, 'Waitlist count must increase to 3');
  // Bhaavya should be appended to the end as #3
  assert.deepStrictEqual(
    state.waitlist.map((w) => `#${w.waitlistPosition} ${w.name}`),
    ['#1 Renjith', '#2 Thilaka Sundar', '#3 Bhaavya'],
    'Bhaavya must be appended to end as #3'
  );
  console.log('✓ Move Going -> Waitlist passed');

  console.log('\nTest 4: Press + (Increment Plan Size)');
  // Press + should promote Waitlist #1 (Renjith) to Going
  state.incrementPlanSize();
  assert.strictEqual(state.capacity, 6, 'Plan Size should be 6');
  assert.strictEqual(state.goingList.length, 6, 'Going count should be 6');
  assert.strictEqual(state.waitlist.length, 2, 'Waitlist count should be 2');
  assert.deepStrictEqual(
    state.waitlist.map((w) => `#${w.waitlistPosition} ${w.name}`),
    ['#1 Thilaka Sundar', '#2 Bhaavya'],
    'Waitlist must be renumbered #1, #2'
  );
  assert(state.goingList.some((g) => g.name === 'Renjith'), 'Renjith promoted to Going');
  console.log('✓ Press + passed');

  console.log('\nTest 5: Press - (Decrement Plan Size)');
  // Current Going non-host guests alphabetically:
  // Jeppu, Lakshmi Devi, Pranav, Ren, Renjith
  // Last alphabetical guest is Renjith!
  // Press - should demote Renjith and append him to Waitlist
  state.decrementPlanSize();
  assert.strictEqual(state.capacity, 5, 'Plan Size should be 5');
  assert.strictEqual(state.goingList.length, 5, 'Going count should be 5');
  assert.strictEqual(state.waitlist.length, 3, 'Waitlist count should be 3');
  assert.deepStrictEqual(
    state.waitlist.map((w) => `#${w.waitlistPosition} ${w.name}`),
    ['#1 Thilaka Sundar', '#2 Bhaavya', '#3 Renjith'],
    'Renjith demoted and appended to Waitlist as #3'
  );
  console.log('✓ Press - passed');

  console.log('\nTest 6: Multiple Press + until waitlist empty, then press + once more');
  state.incrementPlanSize(); // promotes #1 Thilaka Sundar -> capacity 6, waitlist 2
  assert.strictEqual(state.capacity, 6);
  assert.strictEqual(state.waitlist.length, 2);

  state.incrementPlanSize(); // promotes #1 Bhaavya -> capacity 7, waitlist 1
  assert.strictEqual(state.capacity, 7);
  assert.strictEqual(state.waitlist.length, 1);

  state.incrementPlanSize(); // promotes #1 Renjith -> capacity 8, waitlist 0
  assert.strictEqual(state.capacity, 8);
  assert.strictEqual(state.waitlist.length, 0);

  // Waitlist is now empty! Press + again:
  state.incrementPlanSize(); // capacity 9, waitlist 0, going 8
  assert.strictEqual(state.capacity, 9);
  assert.strictEqual(state.goingList.length, 8);
  assert.strictEqual(state.waitlist.length, 0);
  console.log('✓ Multiple Press + and empty waitlist behavior passed');

  console.log('\nTest 7: Press - when capacity > goingList');
  state.decrementPlanSize(); // capacity 9 -> 8, no one demoted
  assert.strictEqual(state.capacity, 8);
  assert.strictEqual(state.goingList.length, 8);
  assert.strictEqual(state.waitlist.length, 0);
  console.log('✓ Press - with surplus capacity passed');

  console.log('\nTest 8: Press - when capacity === goingList');
  // Going guests: Bhaavya, Jeppu, Lakshmi Devi, Pranav, Ren, Renjith, Thilaka Sundar
  // Last alphabetical is Thilaka Sundar
  state.decrementPlanSize();
  assert.strictEqual(state.capacity, 7);
  assert.strictEqual(state.goingList.length, 7);
  assert.strictEqual(state.waitlist.length, 1);
  assert.strictEqual(state.waitlist[0].name, 'Thilaka Sundar');
  assert.strictEqual(state.waitlist[0].waitlistPosition, 1);
  console.log('✓ Press - demoted last alphabetical participant passed');

  console.log('\nTest 9: Minimum capacity boundary (cannot decrease below 2)');
  // Decrement repeatedly
  for (let i = 0; i < 10; i++) {
    state.decrementPlanSize();
  }
  assert.strictEqual(state.capacity, 2, 'Capacity cannot decrease below 2');
  assert.strictEqual(state.goingList.length, 2, 'Going list cannot decrease below 2');
  assert(state.goingList.some((g) => g.isHost), 'Host remains in Going');
  console.log('✓ Minimum capacity boundary passed');

  console.log('\nTest 10: Remove participant from Going vs Waitlist');
  // Remove someone from waitlist
  const waitItem = state.waitlist[0];
  const prevCap = state.capacity;
  state.removeFromPlan(waitItem);
  assert.strictEqual(state.capacity, prevCap, 'Removing from waitlist preserves capacity');
  assert(!state.waitlist.some((w) => w.id === waitItem.id), 'Removed item not in waitlist');
  assert.strictEqual(state.waitlist[0].waitlistPosition, 1, 'Waitlist renumbered');

  // Remove someone from going (only 1 non-host friend remains)
  const goingFriend = state.goingList.find((g) => !g.isHost)!;
  state.removeFromPlan(goingFriend);
  assert.strictEqual(state.capacity, 2, 'Capacity maintained at min 2');
  assert.strictEqual(state.goingList.length, 1, 'Only host in going');
  console.log('✓ Remove participant passed');

  console.log('\n🎉 ALL 10 TESTS PASSED!');
}

runTests();
