/**
 * Test Suite: Participant State Persistence during Plan Creation Flow
 *
 * Verifies Cases 1 - 5 from the user specification:
 *   Case 1 — Navigation persistence (move waitlist -> joined, navigate away, return)
 *   Case 2 — Multiple changes (move several, remove one, navigate away and back)
 *   Case 3 — Plan size adjustments (change plan size, promote/demote, navigate away and back)
 *   Case 4 — No plan size (all invited are joined, navigate away and back)
 *   Case 5 — No duplication invariant (Joined IDs ∩ Waitlist IDs = ∅ after every change & restore)
 */

import {
  getSavedDraftParticipants,
  saveDraftParticipants,
  clearDraftParticipants,
  DRAFT_PARTICIPANTS_STORAGE_KEY,
} from '../apps/app/src/features/create/utils/draftParticipantStorage';

// Mock localStorage for node environment
const storageMap = new Map<string, string>();
(global as any).window = {
  localStorage: {
    getItem: (key: string) => storageMap.get(key) || null,
    setItem: (key: string, val: string) => storageMap.set(key, val),
    removeItem: (key: string) => storageMap.delete(key),
  },
};

interface MockFriend {
  id: string;
  name: string;
  isHost?: boolean;
  waitlistPosition?: number;
}

function sortGoingFriends(friends: MockFriend[]): MockFriend[] {
  return [...friends].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
}

function renumberWaitlist(friends: MockFriend[]): MockFriend[] {
  return friends.map((f, idx) => ({ ...f, waitlistPosition: idx + 1 }));
}

function assertDisjoint(joined: MockFriend[], waitlist: MockFriend[], context: string) {
  const joinedIds = new Set(joined.map((f) => f.id));
  const overlap = waitlist.filter((w) => joinedIds.has(w.id));
  if (overlap.length > 0) {
    throw new Error(
      `[FAIL] ${context}: Overlap detected! Participants in both Joined and Waitlist: ${overlap.map((o) => o.id).join(', ')}`
    );
  }
}

function assertEqualArrays(a: string[], b: string[], context: string) {
  if (a.length !== b.length || !a.every((val, idx) => val === b[idx])) {
    throw new Error(`[FAIL] ${context}: Expected [${b.join(', ')}], got [${a.join(', ')}]`);
  }
}

// ── Lifecycle Simulator for Assigned Mode ──
class AssignedParticipantScreenSimulator {
  selectedFriends: MockFriend[];
  isHostSelected: boolean;
  hostItem: MockFriend;
  capacity?: number;
  internalGoingList: MockFriend[] = [];
  internalWaitlist: MockFriend[] = [];

  constructor(friends: MockFriend[], capacity?: number, isHostSelected: boolean = true) {
    this.selectedFriends = [...friends];
    this.capacity = capacity;
    this.isHostSelected = isHostSelected;
    this.hostItem = { id: 'host', name: 'You (Host)', isHost: true };
    this.mount();
  }

  mount() {
    const hostArr = this.isHostSelected ? [this.hostItem] : [];
    const savedDraft = getSavedDraftParticipants();

    if (savedDraft) {
      const friendMap = new Map(this.selectedFriends.map((f) => [f.id, f]));
      const isHostInJoined = savedDraft.joinedIds.includes('host') || this.isHostSelected;

      const goingGuests = savedDraft.joinedIds
        .filter((id) => id !== 'host' && friendMap.has(id))
        .map((id) => friendMap.get(id)!);
      let restoredGoing = [...(isHostInJoined ? hostArr : []), ...sortGoingFriends(goingGuests)];
      const goingIdSet = new Set(restoredGoing.map((f) => f.id));

      const waitGuests = savedDraft.waitlistIds
        .filter((id) => id !== 'host' && friendMap.has(id) && !goingIdSet.has(id))
        .map((id) => friendMap.get(id)!);
      let restoredWait = renumberWaitlist(waitGuests);

      const allocatedIds = new Set([...goingIdSet, ...restoredWait.map((f) => f.id)]);
      const unallocatedGuests = this.selectedFriends.filter((f) => !allocatedIds.has(f.id));

      if (unallocatedGuests.length > 0) {
        if (this.capacity === undefined) {
          const updatedGoing = sortGoingFriends([...goingGuests, ...unallocatedGuests]);
          restoredGoing = [...(isHostInJoined ? hostArr : []), ...updatedGoing];
        } else {
          restoredWait = renumberWaitlist([...restoredWait, ...unallocatedGuests]);
        }
      }

      this.internalGoingList = restoredGoing;
      this.internalWaitlist = restoredWait;
      this.capacity = restoredGoing.length;
      this.persist();
      return;
    }

    // Normal initial-state logic
    const sortedGuests = sortGoingFriends(this.selectedFriends);
    const allList = [...hostArr, ...sortedGuests];
    const isConfigured = this.capacity !== undefined;
    const effectiveCap = isConfigured && this.capacity !== undefined && this.capacity < allList.length ? this.capacity : allList.length;

    const initGoing = allList.slice(0, effectiveCap);
    const initWait = renumberWaitlist(allList.slice(effectiveCap));
    this.internalGoingList = initGoing;
    this.internalWaitlist = initWait;
    this.capacity = initGoing.length;
    this.persist();
  }

  persist() {
    const joinedIds = this.internalGoingList.map((f) => f.id);
    const joinedSet = new Set(joinedIds);
    const cleanWaitlist = this.internalWaitlist.filter((f) => !joinedSet.has(f.id));
    const waitlistIds = cleanWaitlist.map((f) => f.id);

    saveDraftParticipants({
      joinedIds,
      waitlistIds,
    });
    assertDisjoint(this.internalGoingList, this.internalWaitlist, 'persist()');
  }

  moveToGoing(friendId: string) {
    const item = this.internalWaitlist.find((f) => f.id === friendId);
    if (!item) return;

    this.internalWaitlist = renumberWaitlist(this.internalWaitlist.filter((f) => f.id !== friendId));
    const hostPart = this.internalGoingList.filter((f) => f.isHost);
    const guestPart = this.internalGoingList.filter((f) => !f.isHost && f.id !== friendId);
    this.internalGoingList = [...hostPart, ...sortGoingFriends([...guestPart, { ...item, waitlistPosition: undefined }])];
    this.capacity = this.internalGoingList.length;
    this.persist();
  }

  moveToWaitlist(friendId: string) {
    const item = this.internalGoingList.find((f) => f.id === friendId);
    if (!item || item.isHost) return;

    this.internalGoingList = this.internalGoingList.filter((f) => f.id !== friendId);
    this.internalWaitlist = renumberWaitlist([...this.internalWaitlist.filter((f) => f.id !== friendId), item]);
    this.capacity = this.internalGoingList.length;
    this.persist();
  }

  removeParticipant(friendId: string) {
    this.internalGoingList = this.internalGoingList.filter((f) => f.id !== friendId);
    this.internalWaitlist = renumberWaitlist(this.internalWaitlist.filter((f) => f.id !== friendId));
    this.selectedFriends = this.selectedFriends.filter((f) => f.id !== friendId);
    this.capacity = Math.max(2, this.internalGoingList.length);
    this.persist();
  }

  incrementPlanSize() {
    const totalInvited = (this.isHostSelected ? 1 : 0) + this.selectedFriends.length;
    if ((this.capacity || 0) >= totalInvited) return;

    if (this.internalWaitlist.length > 0) {
      const promoted = this.internalWaitlist[0];
      this.internalWaitlist = renumberWaitlist(this.internalWaitlist.slice(1));
      const hostPart = this.internalGoingList.filter((f) => f.isHost);
      const guestPart = this.internalGoingList.filter((f) => !f.isHost && f.id !== promoted.id);
      this.internalGoingList = [...hostPart, ...sortGoingFriends([...guestPart, { ...promoted, waitlistPosition: undefined }])];
      this.capacity = this.internalGoingList.length;
      this.persist();
    }
  }

  decrementPlanSize() {
    if ((this.capacity || 0) <= 2) return;
    const nonHostGoing = sortGoingFriends(this.internalGoingList.filter((f) => !f.isHost));
    if (nonHostGoing.length === 0 || this.internalGoingList.length <= 2) return;

    const demoted = nonHostGoing[nonHostGoing.length - 1];
    this.internalGoingList = this.internalGoingList.filter((f) => f.id !== demoted.id);
    this.internalWaitlist = renumberWaitlist([...this.internalWaitlist.filter((f) => f.id !== demoted.id), demoted]);
    this.capacity = this.internalGoingList.length;
    this.persist();
  }

  reorderWaitlist(newWaitlist: MockFriend[]) {
    this.internalWaitlist = renumberWaitlist(newWaitlist);
    this.persist();
  }
}

// ── Test Runner ──
async function runTests() {
  console.log('--- Starting Participant Persistence Verification ---');

  const friends8: MockFriend[] = [
    { id: 'u1', name: 'Alice' },
    { id: 'u2', name: 'Bob' },
    { id: 'u3', name: 'Charlie' },
    { id: 'u4', name: 'David' },
    { id: 'u5', name: 'Emma' },
    { id: 'u6', name: 'Frank' },
    { id: 'u7', name: 'Grace' },
    { id: 'u8', name: 'Henry' },
  ];

  // ─────────────────────────────────────────────────────────────
  // CASE 1: Navigation Persistence
  // 8 invited. Initial capacity = 5 (Host + 4 guests Going, 4 guests Waitlisted).
  // Move 2 waitlisted friends into Joined -> 7 Joined (Host + 6 guests), 2 Waitlisted.
  // Navigate away (unmount).
  // Return (remount).
  // Confirm exact same 7 Joined and 2 Waitlisted are restored.
  // ─────────────────────────────────────────────────────────────
  console.log('\n[TEST 1] Case 1: Navigation Persistence');
  clearDraftParticipants();

  let sim = new AssignedParticipantScreenSimulator(friends8, 5, true);
  console.log('Initial Going (5):', sim.internalGoingList.map((f) => f.name));
  console.log('Initial Waitlist (4):', sim.internalWaitlist.map((f) => `${f.waitlistPosition}: ${f.name}`));
  assertDisjoint(sim.internalGoingList, sim.internalWaitlist, 'Case 1 initial');

  // Move 2 waitlisted friends to Joined
  const w1 = sim.internalWaitlist[0].id;
  const w2 = sim.internalWaitlist[1].id;
  sim.moveToGoing(w1);
  sim.moveToGoing(w2);

  const expectedGoingIds = sim.internalGoingList.map((f) => f.id);
  const expectedWaitIds = sim.internalWaitlist.map((f) => f.id);
  console.log('After moving 2 to Joined:');
  console.log('Going count:', sim.internalGoingList.length, 'Waitlist count:', sim.internalWaitlist.length);

  // Navigate away: unmount simulator
  sim = null as any;

  // Verify persistence stored in localStorage
  const draft1 = getSavedDraftParticipants();
  if (!draft1) throw new Error('Expected draft to be persisted in storage');
  assertEqualArrays(draft1.joinedIds, expectedGoingIds, 'Case 1 storage joined');
  assertEqualArrays(draft1.waitlistIds, expectedWaitIds, 'Case 1 storage waitlist');

  // Return: remount simulator
  const simReturned = new AssignedParticipantScreenSimulator(friends8, 5, true);
  assertEqualArrays(simReturned.internalGoingList.map((f) => f.id), expectedGoingIds, 'Case 1 restored going');
  assertEqualArrays(simReturned.internalWaitlist.map((f) => f.id), expectedWaitIds, 'Case 1 restored waitlist');
  assertDisjoint(simReturned.internalGoingList, simReturned.internalWaitlist, 'Case 1 restored');
  console.log('✓ Case 1 Passed: Exactly restored across navigation');

  // ─────────────────────────────────────────────────────────────
  // CASE 2: Multiple changes & participant removal
  // ─────────────────────────────────────────────────────────────
  console.log('\n[TEST 2] Case 2: Multiple Changes and Removal');
  // Move 1 from Joined to Waitlist
  const joinedNonHost = simReturned.internalGoingList.filter((f) => !f.isHost)[0].id;
  simReturned.moveToWaitlist(joinedNonHost);

  // Remove a participant
  const toRemove = simReturned.internalWaitlist[0].id;
  simReturned.removeParticipant(toRemove);

  const expectedGoingCase2 = simReturned.internalGoingList.map((f) => f.id);
  const expectedWaitCase2 = simReturned.internalWaitlist.map((f) => f.id);

  // Navigate away and back
  const remainingFriends = friends8.filter((f) => f.id !== toRemove);
  const simCase2Returned = new AssignedParticipantScreenSimulator(remainingFriends, simReturned.capacity, true);

  assertEqualArrays(simCase2Returned.internalGoingList.map((f) => f.id), expectedGoingCase2, 'Case 2 restored going');
  assertEqualArrays(simCase2Returned.internalWaitlist.map((f) => f.id), expectedWaitCase2, 'Case 2 restored waitlist');
  assertDisjoint(simCase2Returned.internalGoingList, simCase2Returned.internalWaitlist, 'Case 2 restored');
  if (simCase2Returned.internalGoingList.some((f) => f.id === toRemove) || simCase2Returned.internalWaitlist.some((f) => f.id === toRemove)) {
    throw new Error('Removed participant still found in restored lists!');
  }
  console.log('✓ Case 2 Passed: Multiple moves + removals persisted');

  // ─────────────────────────────────────────────────────────────
  // CASE 3: Plan size adjustments (+/- promotion/demotion)
  // ─────────────────────────────────────────────────────────────
  console.log('\n[TEST 3] Case 3: Plan Size Increment/Decrement Persistence');
  const prevGoingCount = simCase2Returned.internalGoingList.length;
  // Increment plan size -> promotes first waitlisted friend
  simCase2Returned.incrementPlanSize();
  if (simCase2Returned.internalGoingList.length !== prevGoingCount + 1) {
    throw new Error('Increment did not promote waitlisted friend');
  }

  // Decrement plan size -> demotes last alphabetical guest
  simCase2Returned.decrementPlanSize();
  if (simCase2Returned.internalGoingList.length !== prevGoingCount) {
    throw new Error('Decrement did not demote guest');
  }

  const expectedGoingCase3 = simCase2Returned.internalGoingList.map((f) => f.id);
  const expectedWaitCase3 = simCase2Returned.internalWaitlist.map((f) => f.id);

  // Navigate away and back
  const simCase3Returned = new AssignedParticipantScreenSimulator(remainingFriends, simCase2Returned.capacity, true);
  assertEqualArrays(simCase3Returned.internalGoingList.map((f) => f.id), expectedGoingCase3, 'Case 3 restored going');
  assertEqualArrays(simCase3Returned.internalWaitlist.map((f) => f.id), expectedWaitCase3, 'Case 3 restored waitlist');
  assertDisjoint(simCase3Returned.internalGoingList, simCase3Returned.internalWaitlist, 'Case 3 restored');
  console.log('✓ Case 3 Passed: Plan size changes and promotions/demotions persist');

  // ─────────────────────────────────────────────────────────────
  // CASE 4: No Plan Size (all invited participants initially Joined)
  // ─────────────────────────────────────────────────────────────
  console.log('\n[TEST 4] Case 4: No Plan Size');
  clearDraftParticipants();

  // Fresh simulator without capacity
  let simNoCap = new AssignedParticipantScreenSimulator(friends8, undefined, true);
  if (simNoCap.internalWaitlist.length !== 0) {
    throw new Error('Expected 0 waitlist when no plan size configured');
  }
  if (simNoCap.internalGoingList.length !== friends8.length + 1) {
    throw new Error('Expected all invited friends + host to be Joined');
  }

  // Navigate away and back
  simNoCap = null as any;
  const simNoCapReturned = new AssignedParticipantScreenSimulator(friends8, undefined, true);
  if (simNoCapReturned.internalWaitlist.length !== 0) {
    throw new Error('Expected 0 waitlist on return when no plan size');
  }
  if (simNoCapReturned.internalGoingList.length !== friends8.length + 1) {
    throw new Error('Expected all friends to remain Joined on return');
  }
  assertDisjoint(simNoCapReturned.internalGoingList, simNoCapReturned.internalWaitlist, 'Case 4 restored');
  console.log('✓ Case 4 Passed: No plan size keeps all invited friends in Joined');

  // ─────────────────────────────────────────────────────────────
  // CASE 5: Strict Invariant Joined IDs ∩ Waitlist IDs = ∅
  // ─────────────────────────────────────────────────────────────
  console.log('\n[TEST 5] Case 5: Strict Disjoint Invariant Verification');
  // Intentionally inject corrupted state with overlap into localStorage
  storageMap.set(
    DRAFT_PARTICIPANTS_STORAGE_KEY,
    JSON.stringify({
      joinedIds: ['host', 'u1', 'u2', 'u3'],
      waitlistIds: ['u2', 'u3', 'u4', 'u5'], // u2 and u3 overlap!
      updatedAt: Date.now(),
    })
  );

  const sanitized = getSavedDraftParticipants();
  if (!sanitized) throw new Error('Sanitized draft returned null');
  console.log('Corrupted test - Saved joinedIds:', sanitized.joinedIds);
  console.log('Corrupted test - Sanitized waitlistIds:', sanitized.waitlistIds);

  const overlapCheck = sanitized.waitlistIds.filter((id) => sanitized.joinedIds.includes(id));
  if (overlapCheck.length > 0) {
    throw new Error(`Invariant violation! Overlap found: ${overlapCheck.join(', ')}`);
  }

  const simCase5 = new AssignedParticipantScreenSimulator(friends8, 4, true);
  assertDisjoint(simCase5.internalGoingList, simCase5.internalWaitlist, 'Case 5 simulator');
  console.log('✓ Case 5 Passed: Disjoint invariant strictly enforced (Joined IDs ∩ Waitlist IDs = ∅)');

  // ─────────────────────────────────────────────────────────────
  // Lifecycle Cleanup Verification
  // ─────────────────────────────────────────────────────────────
  console.log('\n[TEST 6] Lifecycle Cleanup Verification');
  clearDraftParticipants();
  const cleared = getSavedDraftParticipants();
  if (cleared !== null) {
    throw new Error('clearDraftParticipants did not remove draft');
  }
  console.log('✓ Test 6 Passed: Draft successfully cleared upon completion/reset');

  console.log('\n========================================');
  console.log('ALL 5 TEST CASES PASSED SUCCESSFULLY!');
  console.log('========================================');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
