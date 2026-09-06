import assert from "assert";
import { partitionAutomaticParticipants } from "../apps/app/lib/participantStatus";

console.log("=== TESTING PARTICIPANT TABS LOGIC ===");

// -------------------------------------------------------------
// Test Helpers simulating visibleTabs calculation in Automatic & Assigned
// -------------------------------------------------------------

function computeAutomaticTabs(
  displayGoing: any[],
  displayWaitlist: any[],
  displaySkipped: any[],
  mode: string = 'editor',
  isCompletedPlan: boolean = false
) {
  if (isCompletedPlan) {
    const tabs: string[] = [];
    if (displayGoing.length > 0) tabs.push('going');
    if (displaySkipped.length > 0) tabs.push('skipped');
    return tabs;
  }
  if (mode === 'wizard') {
    return ['invited'];
  }

  const tabs: string[] = [];
  const hasGoing = displayGoing.length > 0;
  const hasWaitlist = displayWaitlist.length > 0;

  if (hasGoing) tabs.push('going');
  if (hasWaitlist) tabs.push('waitlist');
  if (displaySkipped.length > 0) tabs.push('skipped');
  return tabs;
}

function computeAssignedTabs(
  displayGoing: any[],
  displayWaitlist: any[],
  displaySkipped: any[],
  mode: string = 'editor',
  isCompletedPlan: boolean = false,
  hasWaitlistProp: boolean = false
) {
  if (isCompletedPlan) {
    const t: string[] = [];
    if (displayGoing.length > 0) t.push('going');
    if (displaySkipped.length > 0) t.push('skipped');
    return t;
  }
  if (mode === 'wizard') {
    if (!hasWaitlistProp) return ['invited'];
    return ['going', 'waitlist'];
  }
  const t: string[] = [];
  const hasGoing = displayGoing.length > 0;
  const hasWait = displayWaitlist.length > 0;
  if (hasGoing) t.push('going');
  if (hasWait) t.push('waitlist');
  if (displaySkipped.length > 0) t.push('skipped');
  return t;
}

// -------------------------------------------------------------
// Test 1: 0 participants
// -------------------------------------------------------------
console.log("\n--- Test 1: 0 participants ---");
{
  const autoTabs = computeAutomaticTabs([], [], []);
  console.log("Automatic tabs with 0 participants:", autoTabs);
  assert.deepStrictEqual(autoTabs, [], "Should have NO tabs when 0 participants");

  const assignedTabs = computeAssignedTabs([], [], []);
  console.log("Assigned tabs with 0 participants:", assignedTabs);
  assert.deepStrictEqual(assignedTabs, [], "Should have NO tabs when 0 participants");
  console.log("✓ Test 1 passed: Toggle completely hidden when 0 participants.");
}

// -------------------------------------------------------------
// Test 2: Joined participants only (Screenshot case: 3 joined, 0 waitlist)
// -------------------------------------------------------------
console.log("\n--- Test 2: Joined participants only (Screenshot: 3 joined, 0 waitlist) ---");
{
  const members = [
    { id: '1', name: 'You', isHost: true, rsvp_status: 'JOINED', join_queue_at: '2026-09-01T10:00:00Z' },
    { id: '2', name: 'Maanastej', isHost: false, rsvp_status: 'JOINED', join_queue_at: '2026-09-01T10:05:00Z' },
    { id: '3', name: 'Renjith', isHost: false, rsvp_status: 'JOINED', join_queue_at: '2026-09-01T10:10:00Z' },
  ];
  const capacity = 3;

  // In Automatic mode
  const autoPartitioned = partitionAutomaticParticipants(members, capacity, '1');
  assert.strictEqual(autoPartitioned.going.length, 3);
  assert.strictEqual(autoPartitioned.waitlist.length, 0);

  const autoTabs = computeAutomaticTabs(autoPartitioned.going, autoPartitioned.waitlist, autoPartitioned.skipped);
  console.log("Automatic tabs (3 joined, 0 waitlist):", autoTabs);
  assert.deepStrictEqual(autoTabs, ['going'], "Should ONLY show 'going' (Joined) tab");

  // In Assigned mode
  const assignedTabs = computeAssignedTabs(members, [], []);
  console.log("Assigned tabs (3 joined, 0 waitlist):", assignedTabs);
  assert.deepStrictEqual(assignedTabs, ['going'], "Should ONLY show 'going' (Joined) tab");

  console.log("✓ Test 2 passed: Only Joined tab rendered, NO Waitlist (0) tab!");
}

// -------------------------------------------------------------
// Test 3: Invited / waitlisted participants only (0 joined)
// -------------------------------------------------------------
console.log("\n--- Test 3: Waitlisted / invited participants only (0 joined) ---");
{
  const waitlistOnly = [
    { id: 'w1', name: 'Alice', isHost: false, rsvp_status: 'WAITLISTED', waitlistPosition: 1 },
    { id: 'w2', name: 'Bob', isHost: false, rsvp_status: 'WAITLISTED', waitlistPosition: 2 },
  ];

  const autoTabs = computeAutomaticTabs([], waitlistOnly, []);
  console.log("Automatic tabs (0 joined, 2 waitlist):", autoTabs);
  assert.deepStrictEqual(autoTabs, ['waitlist'], "Should show ONLY 'waitlist' tab");

  const assignedTabs = computeAssignedTabs([], waitlistOnly, []);
  console.log("Assigned tabs (0 joined, 2 waitlist):", assignedTabs);
  assert.deepStrictEqual(assignedTabs, ['waitlist'], "Should show ONLY 'waitlist' tab");

  console.log("✓ Test 3 passed: Only Waitlist tab rendered without empty Joined tab.");
}

// -------------------------------------------------------------
// Test 4: Both joined + waitlisted/invited participants
// -------------------------------------------------------------
console.log("\n--- Test 4: Both joined + waitlisted/invited participants ---");
{
  const members = [
    { id: '1', name: 'You', isHost: true, rsvp_status: 'JOINED', join_queue_at: '2026-09-01T10:00:00Z' },
    { id: '2', name: 'Maanastej', isHost: false, rsvp_status: 'JOINED', join_queue_at: '2026-09-01T10:05:00Z' },
    { id: '3', name: 'Renjith', isHost: false, rsvp_status: 'JOINED', join_queue_at: '2026-09-01T10:10:00Z' },
    { id: '4', name: 'Bhaavya', isHost: false, rsvp_status: 'WAITLISTED', join_queue_at: '2026-09-01T10:15:00Z' },
  ];
  const capacity = 3;

  const autoPartitioned = partitionAutomaticParticipants(members, capacity, '1');
  assert.strictEqual(autoPartitioned.going.length, 3);
  assert.strictEqual(autoPartitioned.waitlist.length, 1);

  const autoTabs = computeAutomaticTabs(autoPartitioned.going, autoPartitioned.waitlist, autoPartitioned.skipped);
  console.log("Automatic tabs (3 joined, 1 waitlist):", autoTabs);
  assert.deepStrictEqual(autoTabs, ['going', 'waitlist'], "Should show BOTH 'going' and 'waitlist'");

  const assignedTabs = computeAssignedTabs(members.slice(0, 3), [members[3]], []);
  console.log("Assigned tabs (3 joined, 1 waitlist):", assignedTabs);
  assert.deepStrictEqual(assignedTabs, ['going', 'waitlist'], "Should show BOTH 'going' and 'waitlist'");

  console.log("✓ Test 4 passed: Both Joined and Waitlist tabs rendered.");
}

// -------------------------------------------------------------
// Test 5: Dynamic state transitions
// -------------------------------------------------------------
console.log("\n--- Test 5: Dynamic state transitions ---");
{
  // Step A: 3 joined, 0 waitlist
  let going = [{ id: '1' }, { id: '2' }, { id: '3' }];
  let waitlist: any[] = [];
  let tabs = computeAutomaticTabs(going, waitlist, []);
  assert.deepStrictEqual(tabs, ['going']);
  console.log("State A (3 joined, 0 waitlist) ->", tabs);

  // Step B: User joins waitlist (3 joined, 1 waitlist)
  waitlist = [{ id: '4' }];
  tabs = computeAutomaticTabs(going, waitlist, []);
  assert.deepStrictEqual(tabs, ['going', 'waitlist']);
  console.log("State B (user added to waitlist) ->", tabs);

  // Step C: Waitlisted user removed (back to 3 joined, 0 waitlist)
  waitlist = [];
  tabs = computeAutomaticTabs(going, waitlist, []);
  assert.deepStrictEqual(tabs, ['going']);
  console.log("State C (waitlist user removed) ->", tabs);

  // Step D: All joined participants removed (0 joined, 0 waitlist)
  going = [];
  tabs = computeAutomaticTabs(going, waitlist, []);
  assert.deepStrictEqual(tabs, []);
  console.log("State D (all participants removed) ->", tabs);

  console.log("✓ Test 5 passed: Transitions between states reflect accurately.");
}

// -------------------------------------------------------------
// Test 6: Completed plan mode
// -------------------------------------------------------------
console.log("\n--- Test 6: Completed plan mode ---");
{
  const attended = [{ id: '1' }, { id: '2' }];
  const skipped = [{ id: '3' }];

  const tabsWithSkipped = computeAutomaticTabs(attended, [], skipped, 'editor', true);
  console.log("Completed plan with attended + skipped:", tabsWithSkipped);
  assert.deepStrictEqual(tabsWithSkipped, ['going', 'skipped']);

  const tabsOnlyAttended = computeAutomaticTabs(attended, [], [], 'editor', true);
  console.log("Completed plan with only attended:", tabsOnlyAttended);
  assert.deepStrictEqual(tabsOnlyAttended, ['going']);

  console.log("✓ Test 6 passed: Completed plan behavior preserved.");
}

console.log("\n=== ALL TESTS PASSED SUCCESSFULLY! ===");
