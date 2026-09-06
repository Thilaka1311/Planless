import {
  getParticipantRsvpDisplayStatus,
  isJoinedRsvpParticipant,
  formatSkipReason,
} from '../apps/app/lib/participantStatus';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`✓ ${testName}`);
    passed++;
  } else {
    console.error(`✗ ${testName}`);
    failed++;
  }
}

console.log('--- Testing getParticipantRsvpDisplayStatus ---');

// 1. Participant who is INVITED
const invitedParticipant = {
  id: 'u1',
  name: 'Thilaka Sundar',
  avatar: '',
  rsvpStatus: 'INVITED',
  assignedGroup: 'GOING' as const,
};
assert(
  getParticipantRsvpDisplayStatus(invitedParticipant) === 'Invited',
  'Invited participant in GOING group displays "Invited"'
);

// 2. Participant who is INVITED in WAITLIST group
const invitedWaitlistParticipant = {
  id: 'u1',
  name: 'Thilaka Sundar',
  avatar: '',
  rsvpStatus: 'INVITED',
  assignedGroup: 'WAITLIST' as const,
};
assert(
  getParticipantRsvpDisplayStatus(invitedWaitlistParticipant) === 'Invited',
  'Invited participant in WAITLIST group displays "Invited"'
);

// 3. Moving someone between Assigned groups must not change their displayed RSVP status
assert(
  getParticipantRsvpDisplayStatus(invitedParticipant) ===
    getParticipantRsvpDisplayStatus(invitedWaitlistParticipant),
  'Moving participant between Assigned groups preserves displayed RSVP status'
);

// 4. Participant who is JOINED
const joinedParticipant = {
  id: 'u2',
  name: 'Alice',
  avatar: '',
  rsvpStatus: 'JOINED',
  assignedGroup: 'GOING' as const,
};
assert(
  getParticipantRsvpDisplayStatus(joinedParticipant) === 'Joined',
  'Joined participant displays "Joined"'
);

// 5. Participant who is JOINED but assigned to WAITLIST
const joinedInWaitlist = {
  id: 'u2',
  name: 'Alice',
  avatar: '',
  rsvpStatus: 'JOINED',
  assignedGroup: 'WAITLIST' as const,
};
assert(
  getParticipantRsvpDisplayStatus(joinedInWaitlist) === 'Joined',
  'Joined participant in WAITLIST group still displays "Joined"'
);

// 6. Host participant
const hostParticipant = {
  id: 'host',
  name: 'You',
  avatar: '',
  isHost: true,
};
assert(
  getParticipantRsvpDisplayStatus(hostParticipant) === 'Joined',
  'Host participant displays "Joined"'
);

// 7. DECLINED participant
const declinedParticipant = {
  id: 'u3',
  name: 'Bob',
  avatar: '',
  rsvpStatus: 'DECLINED',
};
assert(
  getParticipantRsvpDisplayStatus(declinedParticipant) === 'Declined',
  'Declined participant displays "Declined"'
);

// 8. MAYBE participant
const maybeParticipant = {
  id: 'u4',
  name: 'Charlie',
  avatar: '',
  rsvpStatus: 'MAYBE',
};
assert(
  getParticipantRsvpDisplayStatus(maybeParticipant) === 'Maybe',
  'Maybe participant displays "Maybe"'
);

// 9. SKIPPED participant with skipReason LEFT
const leftParticipant = {
  id: 'u5',
  name: 'David',
  avatar: '',
  rsvpStatus: 'SKIPPED',
  skipReason: 'LEFT',
};
assert(
  getParticipantRsvpDisplayStatus(leftParticipant) === 'Left',
  'Skipped participant with skipReason LEFT displays "Left"'
);

// 10. SKIPPED participant with skipReason REMOVED
const removedParticipant = {
  id: 'u6',
  name: 'Eve',
  avatar: '',
  rsvpStatus: 'SKIPPED',
  skipReason: 'REMOVED',
};
assert(
  getParticipantRsvpDisplayStatus(removedParticipant) === 'Removed',
  'Skipped participant with skipReason REMOVED displays "Removed"'
);

// 11. REJOINED participant
const rejoinedParticipant = {
  id: 'u7',
  name: 'Frank',
  avatar: '',
  rsvpStatus: 'REJOINED',
};
assert(
  getParticipantRsvpDisplayStatus(rejoinedParticipant) === 'Wants to rejoin this plan',
  'Rejoined participant displays "Wants to rejoin this plan"'
);

// 12. Participant with leave_requested
const leaveReqParticipant = {
  id: 'u8',
  name: 'Grace',
  avatar: '',
  rsvpStatus: 'JOINED',
  leave_requested: true,
};
assert(
  getParticipantRsvpDisplayStatus(leaveReqParticipant) === 'Wants to leave this plan',
  'Participant with leave_requested displays "Wants to leave this plan"'
);

// 13. Fallback when no rsvpStatus is present
const noStatusParticipant = {
  id: 'u9',
  name: 'Heidi',
  avatar: '',
};
assert(
  getParticipantRsvpDisplayStatus(noStatusParticipant) === 'Invited',
  'Participant without rsvpStatus defaults to "Invited"'
);

console.log('\n--- Testing isJoinedRsvpParticipant (Make Host Eligibility) ---');

// 14. Invited participant must not have Make Host
assert(
  isJoinedRsvpParticipant(invitedParticipant) === false,
  'Invited participant (in GOING group) is NOT eligible for Make Host'
);
assert(
  isJoinedRsvpParticipant(invitedWaitlistParticipant) === false,
  'Invited participant (in WAITLIST group) is NOT eligible for Make Host'
);

// 15. Joined participant DOES have Make Host
assert(
  isJoinedRsvpParticipant(joinedParticipant) === true,
  'Joined participant (in GOING group) IS eligible for Make Host'
);
assert(
  isJoinedRsvpParticipant(joinedInWaitlist) === true,
  'Joined participant (in WAITLIST group) IS eligible for Make Host'
);

// 16. Other non-joined states must not have Make Host
assert(
  isJoinedRsvpParticipant(declinedParticipant) === false,
  'Declined participant is NOT eligible for Make Host'
);
assert(
  isJoinedRsvpParticipant(maybeParticipant) === false,
  'Maybe participant is NOT eligible for Make Host'
);
assert(
  isJoinedRsvpParticipant(leftParticipant) === false,
  'Skipped (Left) participant is NOT eligible for Make Host'
);
assert(
  isJoinedRsvpParticipant(removedParticipant) === false,
  'Skipped (Removed) participant is NOT eligible for Make Host'
);
assert(
  isJoinedRsvpParticipant(rejoinedParticipant) === false,
  'Rejoined participant is NOT eligible for Make Host'
);
const waitlistedOnly = {
  id: 'w1',
  name: 'Ivan',
  avatar: '',
  rsvpStatus: 'WAITLISTED',
};
assert(
  isJoinedRsvpParticipant(waitlistedOnly) === false,
  'WAITLISTED RSVP participant is NOT eligible for Make Host'
);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
