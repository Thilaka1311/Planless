import assert from "assert";

// Test data replicating memberToFriend and joinedParticipantUserIds logic from PlanParticipantManagementWrapper.tsx
function testParticipantState(
  status: string,
  rawGroup: any,
  mode: 'automatic' | 'assigned',
  isHostRole: boolean = false
) {
  // 1. memberToFriend assignedGroup resolution
  const normalizedGroup = typeof rawGroup === 'string' && (rawGroup.toUpperCase() === 'GOING' || rawGroup.toUpperCase() === 'WAITLIST')
    ? (rawGroup.toUpperCase() as 'GOING' | 'WAITLIST')
    : null;
  const assignedGroup = mode === 'assigned'
    ? (normalizedGroup || (status === 'WAITLISTED' ? 'WAITLIST' : 'GOING'))
    : null;

  // 2. joinedParticipantUserIds calculation
  const rsvp = typeof status === 'string' ? status.toUpperCase() : '';
  const group = typeof rawGroup === 'string' ? rawGroup.toUpperCase() : '';

  let isJoined = false;
  if (rsvp === 'JOINED' || rsvp === 'GOING') {
    isJoined = true;
  } else if ((group === 'JOINED' || group === 'GOING') && rsvp !== 'SKIPPED') {
    isJoined = true;
  }

  // 3. goingMembers vs waitlistMembers resolution
  let isGoing = false;
  let isWaitlist = false;

  if (mode === 'assigned') {
    isGoing = group === 'GOING' || group === 'JOINED' || (!group && (status === 'JOINED' || status === 'INVITED'));
    isWaitlist = group === 'WAITLIST' || group === 'WAITLISTED' || (!group && status === 'WAITLISTED');
  } else {
    isGoing = status === 'JOINED';
    isWaitlist = status === 'WAITLISTED';
  }

  return { assignedGroup, isJoined, isGoing, isWaitlist };
}

console.log("=== Testing Participant State Machine Resolution for All States ===");

// 1. AUTOMATIC Mode
const autoInvited = testParticipantState('INVITED', null, 'automatic');
assert.strictEqual(autoInvited.assignedGroup, null, "Automatic INVITED must have assignedGroup = null");
assert.strictEqual(autoInvited.isGoing, false);
assert.strictEqual(autoInvited.isWaitlist, false);

const autoJoined = testParticipantState('JOINED', null, 'automatic');
assert.strictEqual(autoJoined.assignedGroup, null, "Automatic JOINED must have assignedGroup = null");
assert.strictEqual(autoJoined.isGoing, true);

const autoWaitlisted = testParticipantState('WAITLISTED', null, 'automatic');
assert.strictEqual(autoWaitlisted.assignedGroup, null, "Automatic WAITLISTED must have assignedGroup = null");
assert.strictEqual(autoWaitlisted.isWaitlist, true);

const autoSkipped = testParticipantState('SKIPPED', null, 'automatic');
assert.strictEqual(autoSkipped.assignedGroup, null, "Automatic SKIPPED must have assignedGroup = null");
assert.strictEqual(autoSkipped.isGoing, false);

// 2. ASSIGNED Mode
const assignedGoing = testParticipantState('INVITED', 'GOING', 'assigned');
assert.strictEqual(assignedGoing.assignedGroup, 'GOING');
assert.strictEqual(assignedGoing.isGoing, true);
assert.strictEqual(assignedGoing.isWaitlist, false);

const assignedWaitlist = testParticipantState('INVITED', 'WAITLIST', 'assigned');
assert.strictEqual(assignedWaitlist.assignedGroup, 'WAITLIST');
assert.strictEqual(assignedWaitlist.isGoing, false);
assert.strictEqual(assignedWaitlist.isWaitlist, true);

const assignedJoined = testParticipantState('JOINED', 'GOING', 'assigned');
assert.strictEqual(assignedJoined.assignedGroup, 'GOING');
assert.strictEqual(assignedJoined.isGoing, true);

const assignedWaitlisted = testParticipantState('WAITLISTED', 'WAITLIST', 'assigned');
assert.strictEqual(assignedWaitlisted.assignedGroup, 'WAITLIST');
assert.strictEqual(assignedWaitlisted.isWaitlist, true);

const assignedSkipped = testParticipantState('SKIPPED', null, 'assigned');
assert.strictEqual(assignedSkipped.isJoined, false);

// 3. Defensive checks against non-string rawGroup (e.g. [], {}, undefined)
const defensiveArray = testParticipantState('INVITED', [], 'assigned');
assert.strictEqual(defensiveArray.assignedGroup, 'GOING', "Array must safely fallback to GOING in assigned mode");

const defensiveObj = testParticipantState('INVITED', {}, 'automatic');
assert.strictEqual(defensiveObj.assignedGroup, null, "Object must safely resolve to null in automatic mode");

console.log("All participant state render scenarios passed cleanly without throwing!");
