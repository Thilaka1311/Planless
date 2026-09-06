import assert from 'node:assert';
import { getEffectiveParticipantState } from '../apps/app/lib/participantStatus.js';

console.log('====================================================');
console.log('TEST 1: getEffectiveParticipantState in Creation and Editor Flows');
console.log('====================================================');

// Joined participant in Assigned mode
const joinedFriend = { id: 'user_1', name: 'Alice', avatar: '' };
const effectiveJoined = getEffectiveParticipantState(joinedFriend, 'going');
assert.strictEqual(effectiveJoined, 'GOING', 'Tab "going" should yield state "GOING"');
console.log('✓ "going" tab yields effectiveState: GOING');

// Waitlist participant in Assigned mode
const waitlistFriend = { id: 'user_2', name: 'Bob', avatar: '' };
const effectiveWaitlist = getEffectiveParticipantState(waitlistFriend, 'waitlist');
assert.strictEqual(effectiveWaitlist, 'WAITLIST', 'Tab "waitlist" should yield state "WAITLIST"');
console.log('✓ "waitlist" tab yields effectiveState: WAITLIST');

// Invited participant in Automatic mode
const invitedFriend = { id: 'user_3', name: 'Charlie', avatar: '' };
const effectiveInvited = getEffectiveParticipantState(invitedFriend, 'invited');
assert.strictEqual(effectiveInvited, 'INVITED', 'Tab "invited" should yield state "INVITED"');
console.log('✓ "invited" tab yields effectiveState: INVITED');

console.log('\n====================================================');
console.log('TEST 2: Assigned Mode State & Tab Transitions During Creation');
console.log('====================================================');

// Mock state machine representing AssignedParticipantScreen wizard mode
class AssignedWizardSimulation {
  capacity: number = 3;
  isHostSelected: boolean = true;
  hostItem = { id: 'host', name: 'You', isHost: true };
  selectedFriends: any[] = [];
  internalGoingList: any[] = [];
  internalWaitlist: any[] = [];
  priorityGuestIds?: string[];
  formState: any = {};

  constructor(friends: any[], initialPriorityIds?: string[], cap: number = 3) {
    this.capacity = cap;
    this.selectedFriends = [...friends];
    this.priorityGuestIds = initialPriorityIds;
    this.formState = {
      selectedFriends: [...friends],
      priorityGuestIds: initialPriorityIds ? [...initialPriorityIds] : [],
    };
    this.init();
  }

  init() {
    const hostArr = this.isHostSelected && this.hostItem ? [this.hostItem] : [];
    if (this.priorityGuestIds && this.priorityGuestIds.length > 0) {
      const prioritySet = new Set(this.priorityGuestIds);
      const goingFriends = this.selectedFriends.filter((f) => prioritySet.has(f.id));
      const waitFriends = this.selectedFriends.filter((f) => !prioritySet.has(f.id));
      this.internalGoingList = [...hostArr, ...goingFriends];
      this.internalWaitlist = waitFriends;
    } else {
      const allList = [...hostArr, ...this.selectedFriends];
      const effectiveCap = this.capacity < allList.length ? this.capacity : allList.length;
      this.internalGoingList = allList.slice(0, effectiveCap);
      this.internalWaitlist = allList.slice(effectiveCap);
    }
  }

  get visibleTabs(): string[] {
    const t: string[] = [];
    if (this.internalGoingList.length > 0) t.push('going');
    if (this.internalWaitlist.length > 0) t.push('waitlist');
    return t;
  }

  moveToWaitlist(item: any) {
    assert(item.id !== 'host', 'Host cannot be moved to waitlist');
    this.internalGoingList = this.internalGoingList.filter((f) => f.id !== item.id);
    if (!this.internalWaitlist.some((f) => f.id === item.id)) {
      this.internalWaitlist.push(item);
    }
  }

  moveToJoined(item: any) {
    this.internalWaitlist = this.internalWaitlist.filter((f) => f.id !== item.id);
    if (!this.internalGoingList.some((f) => f.id === item.id)) {
      this.internalGoingList.push(item);
    }
  }

  removeFromPlan(item: any) {
    this.internalGoingList = this.internalGoingList.filter((f) => f.id !== item.id);
    this.internalWaitlist = this.internalWaitlist.filter((f) => f.id !== item.id);
    // Sync with form
    this.selectedFriends = this.selectedFriends.filter((f) => f.id !== item.id);
    this.formState.selectedFriends = this.formState.selectedFriends.filter((f: any) => f.id !== item.id);
    if (this.formState.priorityGuestIds) {
      this.formState.priorityGuestIds = this.formState.priorityGuestIds.filter((id: string) => id !== item.id);
    }
  }

  handleContinue(): { going: any[]; waitlist: any[] } {
    const fullOrderedList = [...this.internalGoingList, ...this.internalWaitlist].filter((f) => !f.isHost);
    this.formState.selectedFriends = fullOrderedList;
    this.formState.priorityGuestIds = this.internalGoingList.filter((f) => !f.isHost).map((item) => item.id);
    return {
      going: this.internalGoingList,
      waitlist: this.internalWaitlist,
    };
  }
}

// 1. Initial State: Host + 2 friends, capacity 3
const f1 = { id: 'f1', name: 'David' };
const f2 = { id: 'f2', name: 'Emma' };
const f3 = { id: 'f3', name: 'Frank' };

const sim = new AssignedWizardSimulation([f1, f2]);
assert.deepStrictEqual(sim.visibleTabs, ['going'], 'Initially only going tab should be visible');
assert.strictEqual(sim.internalGoingList.length, 3, 'Going should have 3 (Host + David + Emma)');
assert.strictEqual(sim.internalWaitlist.length, 0, 'Waitlist should have 0');
console.log('✓ Initial Assigned wizard state: Joined (3 / 3), Waitlist tab hidden');

// 2. Joined -> Move to waitlist
sim.moveToWaitlist(f2);
assert.deepStrictEqual(sim.visibleTabs, ['going', 'waitlist'], 'Both tabs should now be visible');
assert.strictEqual(sim.internalGoingList.length, 2, 'Going should now have 2');
assert.strictEqual(sim.internalWaitlist.length, 1, 'Waitlist should now have 1 (Emma)');
assert.strictEqual(sim.internalWaitlist[0].id, 'f2');
console.log('✓ Joined -> Move to waitlist: Joined (2 / 3) and Waitlist (1), both tabs visible');

// 3. Waitlist -> Move to joined
sim.moveToJoined(f2);
assert.deepStrictEqual(sim.visibleTabs, ['going'], 'Waitlist tab should hide when empty');
assert.strictEqual(sim.internalGoingList.length, 3, 'Going should have 3 again');
assert.strictEqual(sim.internalWaitlist.length, 0, 'Waitlist should have 0 again');
console.log('✓ Waitlist -> Move to joined: Waitlist tab hides, Joined count restored to 3');

// 4. Joined -> Remove from plan
sim.removeFromPlan(f1);
assert.strictEqual(sim.internalGoingList.length, 2, 'Going should have 2 (Host + Emma)');
assert.strictEqual(sim.formState.selectedFriends.length, 1, 'Form selectedFriends should have 1');
assert.strictEqual(sim.selectedFriends.some((f) => f.id === 'f1'), false, 'David should be permanently gone');
console.log('✓ Joined -> Remove from plan: participant removed from list and form');

// 5. Waitlist -> Remove from plan
sim.moveToWaitlist(f2);
assert.strictEqual(sim.internalWaitlist.length, 1, 'Emma is in waitlist');
sim.removeFromPlan(f2);
assert.strictEqual(sim.internalWaitlist.length, 0, 'Emma removed from waitlist');
assert.strictEqual(sim.formState.selectedFriends.length, 0, 'No friends remaining in form');
assert.deepStrictEqual(sim.visibleTabs, ['going'], 'Only host remains in Going');
console.log('✓ Waitlist -> Remove from plan: waitlisted participant removed');

console.log('\n====================================================');
console.log('TEST 3: State Preservation Across Navigation (Forward & Back)');
console.log('====================================================');

// New simulation with 3 friends (capacity 2)
const sim2 = new AssignedWizardSimulation([f1, f2, f3], undefined, 2);
// Capacity 2 means Host + David in Going, Emma + Frank in Waitlist
assert.strictEqual(sim2.internalGoingList.length, 2); // Host + f1
assert.strictEqual(sim2.internalWaitlist.length, 2); // f2 + f3

// Move Frank (f3) to Joined, move David (f1) to Waitlist
sim2.moveToJoined(f3);
sim2.moveToWaitlist(f1);

// Going: Host, Frank (f3)
// Waitlist: Emma (f2), David (f1)
assert.deepStrictEqual(sim2.internalGoingList.map((f) => f.id), ['host', 'f3']);
assert.deepStrictEqual(sim2.internalWaitlist.map((f) => f.id), ['f2', 'f1']);

// User taps Continue
const contResult = sim2.handleContinue();
assert.deepStrictEqual(sim2.formState.priorityGuestIds, ['f3']);
console.log('✓ Continue persists priorityGuestIds:', sim2.formState.priorityGuestIds);

// User navigates back to WhoIsActuallyComing screen
const sim2Returned = new AssignedWizardSimulation(sim2.formState.selectedFriends, sim2.formState.priorityGuestIds, 2);
assert.deepStrictEqual(
  sim2Returned.internalGoingList.map((f) => f.id),
  ['host', 'f3'],
  'Going list must be exactly restored upon returning'
);
assert.deepStrictEqual(
  sim2Returned.internalWaitlist.map((f) => f.id),
  ['f2', 'f1'],
  'Waitlist must be exactly restored upon returning'
);
console.log('✓ Returning to participant screen restores exact Going and Waitlist states!');

console.log('\n====================================================');
console.log('TEST 4: Automatic Mode Wizard Removal Simulation');
console.log('====================================================');

let automaticFormFriends = [f1, f2, f3];
const handleAutoRemove = (item: any) => {
  automaticFormFriends = automaticFormFriends.filter((f) => f.id !== item.id);
};

// Tap remove on Emma
handleAutoRemove(f2);
assert.strictEqual(automaticFormFriends.length, 2);
assert.deepStrictEqual(automaticFormFriends.map((f) => f.id), ['f1', 'f3']);
console.log('✓ Automatic mode removal immediately updates selected friends');

console.log('\n====================================================');
console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
console.log('====================================================');
