import { describe, it, expect } from "vitest";
import {
  isJoinedRsvpParticipant,
  partitionAutomaticParticipants,
  resolveParticipantVisibleTabs,
  calculateNoLimitDenominator,
} from "../../../../lib/participantStatus";

describe("Participant Management & Plan screen Joined count display contract", () => {
  const formatJoinedLabel = (
    goingCount: number,
    capacity: number | null | undefined,
    invitedCount: number,
    hideCapacityDenominator = false
  ) => {
    const isNoLimit = capacity === undefined || capacity === null;
    const denominator = isNoLimit ? invitedCount : capacity;
    return !hideCapacityDenominator && denominator !== undefined && denominator !== null
      ? `Joined (${goingCount} / ${denominator})`
      : `Joined (${goingCount})`;
  };

  const calculateActualJoinedCount = (participants: Array<any>): number => {
    return participants.filter(isJoinedRsvpParticipant).length;
  };

  it("1. Automatic Mode: Plan size = 5, Invited = 8, Joined RSVP = 2 -> Joined (2 / 5)", () => {
    const members = [
      { id: "u-host", name: "You", isHost: true, role: "HOST", rsvp_status: "JOINED" },
      { id: "u-1", name: "Bhaavya", isHost: false, role: "PARTICIPANT", rsvp_status: "JOINED" },
      { id: "u-2", name: "Aznan", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED" },
      { id: "u-3", name: "Maanastej", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED" },
      { id: "u-4", name: "RAAM", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED" },
      { id: "u-5", name: "Ren", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED" },
      { id: "u-6", name: "Thilaka Sundar", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED" },
      { id: "u-7", name: "Skipped Friend", isHost: false, role: "PARTICIPANT", rsvp_status: "SKIPPED" },
    ];

    const planSize = 5;
    const partitioned = partitionAutomaticParticipants(members, planSize, "u-host");

    // Visible tabs in editor mode must NEVER have 'invited' tab
    const visibleTabs = resolveParticipantVisibleTabs({
      mode: "editor",
      waitlistMode: "automatic",
      capacity: planSize,
      goingCount: partitioned.going.length,
      waitlistCount: partitioned.waitlist.length,
      skippedCount: partitioned.skipped.length,
    });

    expect(visibleTabs).not.toContain("invited");
    expect(visibleTabs).toContain("going");

    // Actual RSVP joined count strictly checks actual RSVP status
    const actualJoined = calculateActualJoinedCount(partitioned.going);
    expect(actualJoined).toBe(2);

    const totalInvited = members.length; // 8
    const label = formatJoinedLabel(actualJoined, planSize, totalInvited);
    expect(label).toBe("Joined (2 / 5)");
  });

  it("2. Assigned Mode: Plan size = 5, Assigned group = 5, Invited = 8, Joined RSVP = 2 -> Joined (2 / 5) NOT Joined (5 / 5)", () => {
    // 5 people assigned to the GOING group, but only 2 have actually RSVP'd JOINED
    const assignedGoingGroup = [
      { id: "u-host", name: "You", isHost: true, role: "HOST", rsvp_status: "JOINED", assignedGroup: "GOING" },
      { id: "u-1", name: "Bhaavya", isHost: false, role: "PARTICIPANT", rsvp_status: "JOINED", assignedGroup: "GOING" },
      { id: "u-2", name: "Aznan", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED", assignedGroup: "GOING" },
      { id: "u-3", name: "Maanastej", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED", assignedGroup: "GOING" },
      { id: "u-4", name: "RAAM", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED", assignedGroup: "GOING" },
    ];

    const planSize = 5;
    expect(assignedGoingGroup.length).toBe(5); // Assigned group has 5

    // IMPORTANT: Joined count is NOT assigned group length (5), but actual RSVP joined count (2)
    const actualJoined = calculateActualJoinedCount(assignedGoingGroup);
    expect(actualJoined).toBe(2);

    const label = formatJoinedLabel(actualJoined, planSize, 8);
    expect(label).toBe("Joined (2 / 5)");
    expect(label).not.toBe("Joined (5 / 5)");
  });

  it("3. No Limit Mode: Denominator is Joined + Invited, strictly excluding Skipped and Waitlisted", () => {
    // Example 1: 2 Joined + 6 Invited + 2 Skipped -> Joined (2 / 8)
    const ex1 = [
      { id: "u-host", name: "You", isHost: true, role: "HOST", rsvp_status: "JOINED" },
      { id: "u-1", name: "Bhaavya", isHost: false, role: "PARTICIPANT", rsvp_status: "JOINED" },
      { id: "u-2", name: "Aznan", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED" },
      { id: "u-3", name: "Maanastej", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED" },
      { id: "u-4", name: "RAAM", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED" },
      { id: "u-5", name: "Ren", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED" },
      { id: "u-6", name: "Thilaka", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED" },
      { id: "u-7", name: "Sundar", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED" },
      { id: "u-8", name: "Skipped 1", isHost: false, role: "PARTICIPANT", rsvp_status: "SKIPPED" },
      { id: "u-9", name: "Skipped 2", isHost: false, role: "PARTICIPANT", rsvp_status: "SKIPPED" },
    ];
    const joined1 = calculateActualJoinedCount(ex1);
    const denom1 = calculateNoLimitDenominator(ex1);
    expect(joined1).toBe(2);
    expect(denom1).toBe(8);
    expect(formatJoinedLabel(joined1, null, denom1)).toBe("Joined (2 / 8)");

    // Example 2: 2 Joined + 4 Invited + 5 Skipped -> Joined (2 / 6)
    const ex2 = [
      { id: "u-1", rsvp_status: "JOINED" },
      { id: "u-2", rsvp_status: "JOINED" },
      { id: "u-3", rsvp_status: "INVITED" },
      { id: "u-4", rsvp_status: "INVITED" },
      { id: "u-5", rsvp_status: "INVITED" },
      { id: "u-6", rsvp_status: "INVITED" },
      { id: "u-7", rsvp_status: "SKIPPED" },
      { id: "u-8", rsvp_status: "SKIPPED" },
      { id: "u-9", rsvp_status: "SKIPPED" },
      { id: "u-10", rsvp_status: "SKIPPED" },
      { id: "u-11", rsvp_status: "SKIPPED" },
    ];
    const joined2 = calculateActualJoinedCount(ex2);
    const denom2 = calculateNoLimitDenominator(ex2);
    expect(joined2).toBe(2);
    expect(denom2).toBe(6);
    expect(formatJoinedLabel(joined2, null, denom2)).toBe("Joined (2 / 6)");

    // Example 3: 5 Joined + 3 Invited + 2 Skipped -> Joined (5 / 8)
    const ex3 = [
      { id: "u-1", rsvp_status: "JOINED" },
      { id: "u-2", rsvp_status: "JOINED" },
      { id: "u-3", rsvp_status: "JOINED" },
      { id: "u-4", rsvp_status: "JOINED" },
      { id: "u-5", rsvp_status: "JOINED" },
      { id: "u-6", rsvp_status: "INVITED" },
      { id: "u-7", rsvp_status: "INVITED" },
      { id: "u-8", rsvp_status: "INVITED" },
      { id: "u-9", rsvp_status: "SKIPPED" },
      { id: "u-10", rsvp_status: "SKIPPED" },
    ];
    const joined3 = calculateActualJoinedCount(ex3);
    const denom3 = calculateNoLimitDenominator(ex3);
    expect(joined3).toBe(5);
    expect(denom3).toBe(8);
    expect(formatJoinedLabel(joined3, null, denom3)).toBe("Joined (5 / 8)");

    // Example 4: 5 Joined + 3 Skipped -> Joined (5 / 5)
    const ex4 = [
      { id: "u-1", rsvp_status: "JOINED" },
      { id: "u-2", rsvp_status: "JOINED" },
      { id: "u-3", rsvp_status: "JOINED" },
      { id: "u-4", rsvp_status: "JOINED" },
      { id: "u-5", rsvp_status: "JOINED" },
      { id: "u-6", rsvp_status: "SKIPPED" },
      { id: "u-7", rsvp_status: "SKIPPED" },
      { id: "u-8", rsvp_status: "SKIPPED" },
    ];
    const joined4 = calculateActualJoinedCount(ex4);
    const denom4 = calculateNoLimitDenominator(ex4);
    expect(joined4).toBe(5);
    expect(denom4).toBe(5);
    expect(formatJoinedLabel(joined4, null, denom4)).toBe("Joined (5 / 5)");

    // Excludes Waitlisted if present: 2 Joined + 2 Invited + 1 Waitlisted + 1 Skipped -> Joined (2 / 4)
    const ex5 = [
      { id: "u-1", rsvp_status: "JOINED" },
      { id: "u-2", rsvp_status: "JOINED" },
      { id: "u-3", rsvp_status: "INVITED" },
      { id: "u-4", rsvp_status: "INVITED" },
      { id: "u-5", rsvp_status: "WAITLISTED" },
      { id: "u-6", rsvp_status: "SKIPPED" },
    ];
    const joined5 = calculateActualJoinedCount(ex5);
    const denom5 = calculateNoLimitDenominator(ex5);
    expect(joined5).toBe(2);
    expect(denom5).toBe(4);
    expect(formatJoinedLabel(joined5, null, denom5)).toBe("Joined (2 / 4)");
  });

  it("4. RSVP Changes: When one invited participant actually joins, Joined (2 / 5) -> Joined (3 / 5)", () => {
    const planSize = 5;
    const initialGoing = [
      { id: "u-host", name: "You", isHost: true, role: "HOST", rsvp_status: "JOINED" },
      { id: "u-1", name: "Bhaavya", isHost: false, role: "PARTICIPANT", rsvp_status: "JOINED" },
      { id: "u-2", name: "Aznan", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED" },
    ];

    expect(calculateActualJoinedCount(initialGoing)).toBe(2);
    expect(formatJoinedLabel(calculateActualJoinedCount(initialGoing), planSize, 8)).toBe("Joined (2 / 5)");

    // Aznan joins (RSVP status -> JOINED)
    const updatedGoing = initialGoing.map(p =>
      p.id === "u-2" ? { ...p, rsvp_status: "JOINED" } : p
    );

    expect(calculateActualJoinedCount(updatedGoing)).toBe(3);
    expect(formatJoinedLabel(calculateActualJoinedCount(updatedGoing), planSize, 8)).toBe("Joined (3 / 5)");
  });

  it("5. Mode Switch (Automatic <-> Assigned): Joined count remains based on actual joined RSVPs", () => {
    const planSize = 5;
    const participants = [
      { id: "u-host", name: "You", isHost: true, role: "HOST", rsvp_status: "JOINED" },
      { id: "u-1", name: "Bhaavya", isHost: false, role: "PARTICIPANT", rsvp_status: "JOINED" },
      { id: "u-2", name: "Aznan", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED" },
      { id: "u-3", name: "Maanastej", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED" },
      { id: "u-4", name: "RAAM", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED" },
    ];

    // In Automatic mode:
    const autoJoined = calculateActualJoinedCount(participants);
    expect(autoJoined).toBe(2);
    expect(formatJoinedLabel(autoJoined, planSize, 8)).toBe("Joined (2 / 5)");

    // Switch to Assigned mode: host assigns all 5 participants to GOING group
    const assignedParticipants = participants.map(p => ({ ...p, assignedGroup: "GOING" }));

    // In Assigned mode: RSVP statuses MUST NOT change just because of assignment
    expect(assignedParticipants.find(p => p.id === "u-2")?.rsvp_status).toBe("INVITED");
    const assignedJoined = calculateActualJoinedCount(assignedParticipants);
    expect(assignedJoined).toBe(2);
    expect(formatJoinedLabel(assignedJoined, planSize, 8)).toBe("Joined (2 / 5)");

    // Switch back to Automatic mode:
    const switchedBackJoined = calculateActualJoinedCount(assignedParticipants);
    expect(switchedBackJoined).toBe(2);
    expect(formatJoinedLabel(switchedBackJoined, planSize, 8)).toBe("Joined (2 / 5)");
  });

  it("6. Reassigning participants between Joined and Waitlist in Assigned mode does not alter Joined count unless RSVP status changes", () => {
    const planSize = 5;
    // Moving an INVITED person from Waitlist to Joined:
    const participantInWaitlist = { id: "u-3", name: "Maanastej", rsvp_status: "INVITED", assignedGroup: "WAITLIST" };
    const participantPromoted = { ...participantInWaitlist, assignedGroup: "GOING" };

    // Moving them to GOING does NOT make them JOINED
    expect(isJoinedRsvpParticipant(participantPromoted)).toBe(false);

    const goingList = [
      { id: "u-host", name: "You", isHost: true, rsvp_status: "JOINED", assignedGroup: "GOING" },
      { id: "u-1", name: "Bhaavya", isHost: false, rsvp_status: "JOINED", assignedGroup: "GOING" },
      participantPromoted,
    ];

    expect(calculateActualJoinedCount(goingList)).toBe(2);
    expect(formatJoinedLabel(calculateActualJoinedCount(goingList), planSize, 8)).toBe("Joined (2 / 5)");
  });
});
