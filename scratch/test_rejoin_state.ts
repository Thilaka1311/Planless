import assert from "assert";
import {
  partitionAutomaticParticipants,
  getEffectiveParticipantState,
  getParticipantRsvpDisplayStatus,
} from "../apps/app/lib/participantStatus";

console.log("=== TESTING REJOIN STATE BEHAVIOR ===");

// 1. Verify getEffectiveParticipantState
console.log("\n--- Test 1: getEffectiveParticipantState ---");
{
  const rejoinedUser = { id: 'u1', name: 'Thilak', rsvpStatus: 'REJOINED' };
  const state = getEffectiveParticipantState(rejoinedUser);
  console.log("State for REJOINED user without sheetType:", state);
  assert.strictEqual(state, 'SKIPPED', "REJOINED user should have effective state SKIPPED");

  const stateInSkippedTab = getEffectiveParticipantState(rejoinedUser, 'skipped');
  console.log("State for REJOINED user in skipped tab:", stateInSkippedTab);
  assert.strictEqual(stateInSkippedTab, 'SKIPPED', "Should remain SKIPPED in skipped tab");
  console.log("✓ Test 1 passed: getEffectiveParticipantState returns SKIPPED for REJOINED.");
}

// 2. Verify getParticipantRsvpDisplayStatus
console.log("\n--- Test 2: getParticipantRsvpDisplayStatus ---");
{
  const rejoinedUser = { id: 'u1', name: 'Thilak', rsvpStatus: 'REJOINED' };
  const label = getParticipantRsvpDisplayStatus(rejoinedUser);
  console.log("Display label for REJOINED user:", label);
  assert.strictEqual(label, 'Wants to rejoin this plan');
  console.log("✓ Test 2 passed: Display label is 'Wants to rejoin this plan'.");
}

// 3. Verify partitionAutomaticParticipants with capacity NOT reached
console.log("\n--- Test 3: partitionAutomaticParticipants (Capacity not reached) ---");
{
  const members = [
    { id: 'h1', name: 'Host', isHost: true, rsvp_status: 'JOINED', join_queue_at: '2026-09-01T10:00:00Z' },
    { id: 'j1', name: 'Participant 1', isHost: false, rsvp_status: 'JOINED', join_queue_at: '2026-09-01T10:05:00Z' },
    { id: 's1', name: 'Thilak', isHost: false, rsvp_status: 'REJOINED' },
  ];
  const capacity = 7;

  const result = partitionAutomaticParticipants(members, capacity, 'h1');
  console.log("Going count:", result.going.length);
  console.log("Waitlist count:", result.waitlist.length);
  console.log("Skipped count:", result.skipped.length);
  console.log("Skipped members:", result.skipped.map(m => ({ name: m.name, rsvpStatus: m.rsvpStatus })));

  assert.strictEqual(result.going.length, 2, "Going should have 2 joined participants");
  assert.strictEqual(result.waitlist.length, 0, "Waitlist should be EMPTY (0 members)");
  assert.strictEqual(result.skipped.length, 1, "Skipped should have 1 member (Thilak)");
  assert.strictEqual(result.skipped[0].name, 'Thilak');
  assert.strictEqual(result.skipped[0].rsvpStatus, 'REJOINED');
  console.log("✓ Test 3 passed: Rejoined participant is in Skipped section, NOT Waitlist.");
}

// 4. Verify partitionAutomaticParticipants when capacity IS reached
console.log("\n--- Test 4: partitionAutomaticParticipants (Capacity reached) ---");
{
  const members = [
    { id: 'h1', name: 'Host', isHost: true, rsvp_status: 'JOINED', join_queue_at: '2026-09-01T10:00:00Z' },
    { id: 'j1', name: 'Participant 1', isHost: false, rsvp_status: 'JOINED', join_queue_at: '2026-09-01T10:05:00Z' },
    { id: 's1', name: 'Thilak', isHost: false, rsvp_status: 'REJOINED' },
  ];
  const capacity = 2; // Capacity is full with 2 joined members

  const result = partitionAutomaticParticipants(members, capacity, 'h1');
  console.log("Going count:", result.going.length);
  console.log("Waitlist count:", result.waitlist.length);
  console.log("Skipped count:", result.skipped.length);

  assert.strictEqual(result.going.length, 2, "Going should have 2 joined participants");
  assert.strictEqual(result.waitlist.length, 0, "Waitlist should still be EMPTY (0 members)");
  assert.strictEqual(result.skipped.length, 1, "Skipped should have 1 member (Thilak)");
  assert.strictEqual(result.skipped[0].name, 'Thilak');
  assert.strictEqual(result.skipped[0].rsvpStatus, 'REJOINED');
  console.log("✓ Test 4 passed: Even when plan is full, Rejoined participant remains in Skipped.");
}

// 5. Verify visible tabs calculation
console.log("\n--- Test 5: Visible tabs with 2 Joined and 1 Rejoined (Skipped) ---");
{
  function computeAutomaticTabs(
    displayGoing: any[],
    displayWaitlist: any[],
    displaySkipped: any[],
    mode: string = 'editor'
  ) {
    const tabs: string[] = [];
    if (displayGoing.length > 0) tabs.push('going');
    if (displayWaitlist.length > 0) tabs.push('waitlist');
    if (displaySkipped.length > 0) tabs.push('skipped');
    return tabs;
  }

  const members = [
    { id: 'h1', name: 'Host', isHost: true, rsvp_status: 'JOINED', join_queue_at: '2026-09-01T10:00:00Z' },
    { id: 'j1', name: 'Participant 1', isHost: false, rsvp_status: 'JOINED', join_queue_at: '2026-09-01T10:05:00Z' },
    { id: 's1', name: 'Thilak', isHost: false, rsvp_status: 'REJOINED' },
  ];
  const partitioned = partitionAutomaticParticipants(members, 7, 'h1');
  const tabs = computeAutomaticTabs(partitioned.going, partitioned.waitlist, partitioned.skipped);
  console.log("Calculated visible tabs:", tabs);

  assert.deepStrictEqual(tabs, ['going', 'skipped'], "Visible tabs should be ['going', 'skipped'] - NO waitlist tab!");
  console.log("✓ Test 5 passed: Tab bar shows Joined and Skipped, NOT Waitlist!");
}

console.log("\n=== ALL REJOIN STATE TESTS PASSED! ===");
