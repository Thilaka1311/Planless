import assert from 'node:assert';

interface Friend {
  id: string;
  name: string;
  isHost?: boolean;
  waitlistPosition?: number;
}

const sortGoingFriends = (friends: Friend[]): Friend[] => {
  return [...friends].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  );
};

const renumberWaitlist = (friends: Friend[]): Friend[] => {
  return friends.map((f, idx) => ({ ...f, waitlistPosition: idx + 1 }));
};

class PlanCreationCapModel {
  isHostSelected = true;
  hostItem: Friend = { id: 'host', name: 'Maanastej', isHost: true };
  selectedFriends: Friend[] = [];
  goingList: Friend[] = [];
  waitlist: Friend[] = [];
  capacity: number = 0;

  get totalInvitedCount(): number {
    return (this.isHostSelected ? 1 : 0) + this.selectedFriends.length;
  }

  get effectiveMaxCapacity(): number {
    return this.totalInvitedCount;
  }

  init(friends: Friend[], initialCap?: number) {
    this.selectedFriends = [...friends];
    const totalInvited = this.totalInvitedCount;
    const sortedGuests = sortGoingFriends(this.selectedFriends);
    const all = [this.hostItem, ...sortedGuests];

    // Clamped capacity
    const effectiveCap = initialCap !== undefined
      ? Math.min(initialCap, totalInvited)
      : totalInvited;

    this.goingList = all.slice(0, effectiveCap);
    this.waitlist = renumberWaitlist(all.slice(effectiveCap));
    this.capacity = this.goingList.length;
  }

  // + Button
  increment() {
    if (this.capacity >= this.effectiveMaxCapacity) {
      // Cannot exceed total invited!
      return;
    }

    if (this.waitlist.length > 0) {
      const promoted = this.waitlist[0];
      this.waitlist = renumberWaitlist(this.waitlist.slice(1));
      const hostPart = this.goingList.filter((f) => f.isHost);
      const guestPart = this.goingList.filter((f) => !f.isHost && f.id !== promoted.id);
      this.goingList = [...hostPart, ...sortGoingFriends([...guestPart, { ...promoted, waitlistPosition: undefined }])];
      this.capacity = Math.min(this.goingList.length, this.effectiveMaxCapacity);
    }
  }

  // - Button
  decrement() {
    if (this.capacity <= 2) return;
    const nonHostGoing = sortGoingFriends(this.goingList.filter((f) => !f.isHost));
    if (nonHostGoing.length === 0 || this.goingList.length <= 2) return;

    const demoted = nonHostGoing[nonHostGoing.length - 1];
    this.goingList = this.goingList.filter((f) => f.id !== demoted.id);
    this.capacity = this.goingList.length;
    this.waitlist = renumberWaitlist([...this.waitlist.filter((f) => f.id !== demoted.id), demoted]);
  }

  // Move Waitlist -> Joined
  moveWaitlistToGoing(item: Friend) {
    this.waitlist = renumberWaitlist(this.waitlist.filter((f) => f.id !== item.id));
    const hostPart = this.goingList.filter((f) => f.isHost);
    const guestPart = this.goingList.filter((f) => !f.isHost && f.id !== item.id);
    this.goingList = [...hostPart, ...sortGoingFriends([...guestPart, { ...item, waitlistPosition: undefined }])];
    this.capacity = Math.min(this.goingList.length, this.effectiveMaxCapacity);
  }

  // Move Joined -> Waitlist
  moveGoingToWaitlist(item: Friend) {
    if (item.isHost) return;
    this.goingList = this.goingList.filter((f) => f.id !== item.id);
    this.capacity = this.goingList.length;
    this.waitlist = renumberWaitlist([...this.waitlist.filter((f) => f.id !== item.id), item]);
  }

  // Add Participant
  addParticipant(friend: Friend) {
    this.selectedFriends.push(friend);
    // Added participant enters waitlist if capacity is capped
    this.waitlist = renumberWaitlist([...this.waitlist, friend]);
  }

  // Remove Participant
  removeParticipant(item: Friend) {
    this.selectedFriends = this.selectedFriends.filter((f) => f.id !== item.id);
    this.goingList = this.goingList.filter((f) => f.id !== item.id);
    this.waitlist = renumberWaitlist(this.waitlist.filter((f) => f.id !== item.id));
    // Clamp capacity to new totalInvitedCount
    this.capacity = Math.min(this.goingList.length, this.effectiveMaxCapacity);
  }

  // Clamp external surplus
  clampSurplus(surplusVal: number) {
    this.capacity = Math.min(surplusVal, this.effectiveMaxCapacity);
  }
}

function runCapTests() {
  console.log('🧪 Starting tests for Plan Size Maximum Invited Cap...');

  const initialFriends: Friend[] = [
    { id: 'f1', name: 'Bhaavya' },
    { id: 'f2', name: 'Jeppu' },
    { id: 'f3', name: 'Lakshmi Devi' },
    { id: 'f4', name: 'Pranav' },
    { id: 'f5', name: 'Ren' },
    { id: 'f6', name: 'Renjith' },
    { id: 'f7', name: 'Thilaka Sundar' },
  ]; // 7 friends + 1 host = 8 total invited

  const model = new PlanCreationCapModel();
  model.init(initialFriends, 8);

  console.log('Test 1: 8 invited -> initial plan size cannot exceed 8');
  assert.strictEqual(model.totalInvitedCount, 8);
  assert.strictEqual(model.capacity, 8);
  assert.strictEqual(model.goingList.length, 8);
  assert.strictEqual(model.waitlist.length, 0);
  console.log('✓ Initial state is capped at 8');

  console.log('\nTest 2: When at maximum (8/8), pressing + does nothing');
  model.increment();
  assert.strictEqual(model.capacity, 8, 'Capacity must remain 8');
  assert.strictEqual(model.goingList.length, 8, 'Going count must remain 8');
  model.increment();
  assert.strictEqual(model.capacity, 8, 'Repeated + must remain 8');
  console.log('✓ Pressing + at maximum does nothing');

  console.log('\nTest 3: Increase from 7 -> 8 works, but 8 -> 9 does nothing');
  // Decrement to 7
  model.decrement();
  assert.strictEqual(model.capacity, 7);
  assert.strictEqual(model.goingList.length, 7);
  assert.strictEqual(model.waitlist.length, 1);
  // Increment back to 8
  model.increment();
  assert.strictEqual(model.capacity, 8);
  assert.strictEqual(model.goingList.length, 8);
  assert.strictEqual(model.waitlist.length, 0);
  // Try 8 -> 9
  model.increment();
  assert.strictEqual(model.capacity, 8, 'Cannot reach 9');
  console.log('✓ 7 -> 8 works, 8 -> 9 does nothing');

  console.log('\nTest 4: Remove participant when at maximum (8) -> Plan size adjusts to 7');
  const removedFriend = model.goingList.find((g) => !g.isHost)!;
  model.removeParticipant(removedFriend);
  assert.strictEqual(model.totalInvitedCount, 7, 'Total invited is now 7');
  assert.strictEqual(model.capacity, 7, 'Capacity adjusted to new maximum 7');
  assert.strictEqual(model.goingList.length, 7);
  // Pressing + should do nothing since max is 7
  model.increment();
  assert.strictEqual(model.capacity, 7, 'Capacity cannot exceed 7');
  console.log('✓ Removing participant adjusts plan size to new max');

  console.log('\nTest 5: Add participant -> maximum increases to 8');
  const newFriend = { id: 'f8', name: 'vaishakh M' };
  model.addParticipant(newFriend);
  assert.strictEqual(model.totalInvitedCount, 8, 'Total invited is now 8');
  assert.strictEqual(model.waitlist.length, 1, 'New friend enters waitlist');
  // Now + works from 7 -> 8
  model.increment();
  assert.strictEqual(model.capacity, 8, 'Capacity reached 8');
  assert.strictEqual(model.goingList.length, 8);
  assert.strictEqual(model.waitlist.length, 0);
  console.log('✓ Adding participant increases maximum and enables + up to new maximum');

  console.log('\nTest 6: Clamping surplus state (e.g. 11 people with 8 invited -> 8)');
  model.clampSurplus(11);
  assert.strictEqual(model.capacity, 8, 'Surplus 11 clamped to 8');
  model.clampSurplus(15);
  assert.strictEqual(model.capacity, 8, 'Surplus 15 clamped to 8');
  console.log('✓ Surplus states clamped to totalInvitedCount');

  console.log('\nTest 7: Moving participants between Joined and Waitlist');
  // Move 3 people to waitlist
  model.decrement(); // 7
  model.decrement(); // 6
  model.decrement(); // 5
  assert.strictEqual(model.capacity, 5);
  assert.strictEqual(model.goingList.length, 5);
  assert.strictEqual(model.waitlist.length, 3);
  // Move waitlist member to going
  model.moveWaitlistToGoing(model.waitlist[0]);
  assert.strictEqual(model.capacity, 6);
  assert.strictEqual(model.goingList.length, 6);
  assert.strictEqual(model.waitlist.length, 2);
  assert(model.capacity <= model.totalInvitedCount, 'Capacity is <= totalInvitedCount');
  console.log('✓ Joined/Waitlist moves respect total invited cap');

  console.log('\n🎉 ALL PLAN SIZE CAP TESTS PASSED!');
}

runCapTests();
