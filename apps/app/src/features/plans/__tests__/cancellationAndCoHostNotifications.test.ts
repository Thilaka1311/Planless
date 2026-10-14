import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Logic Replicas from send-push/index.ts for deterministic contract testing
// ============================================================================

export function formatCoHostNotificationBody(otherHostNames: string[]): string {
  if (!otherHostNames || otherHostNames.length === 0) {
    return "You're hosting this plan";
  }
  const resolvedNames = otherHostNames.map((n) => {
    const trimmed = (n || "").trim();
    return trimmed.length > 0 ? trimmed : "Someone";
  });
  if (resolvedNames.length === 1) {
    return `You're hosting this plan with ${resolvedNames[0]}`;
  }
  if (resolvedNames.length === 2) {
    return `You're hosting this plan with ${resolvedNames[0]} and ${resolvedNames[1]}`;
  }
  const allExceptLast = resolvedNames.slice(0, -1).join(", ");
  const last = resolvedNames[resolvedNames.length - 1];
  return `You're hosting this plan with ${allExceptLast}, and ${last}`;
}

export function formatPlanCancellationPayload({
  plan,
  actorUser,
  actorId,
  participants,
}: {
  plan: { id: string; title: string; host_id?: string; cover_image?: string; category?: string };
  actorUser?: { id: string; full_name?: string | null } | null;
  actorId?: string;
  participants: Array<{ user_id: string; rsvp_status: string }>;
}) {
  const rawPlanTitle = (plan?.title || "Plan").trim();
  const planTitle = rawPlanTitle.length > 25 ? `${rawPlanTitle.slice(0, 24)}…` : rawPlanTitle;

  const cancellerName = actorUser?.full_name?.trim();
  let body: string;
  if (cancellerName) {
    body = `${cancellerName} cancelled this plan`;
  } else if (actorId) {
    body = "Someone cancelled this plan";
  } else {
    body = "The host cancelled this plan";
  }

  const targetUserIds = participants
    .filter(
      (p) =>
        p.user_id !== actorId &&
        (p.rsvp_status === "JOINED" || p.rsvp_status === "WAITLISTED" || p.rsvp_status === "INVITED")
    )
    .map((p) => p.user_id);

  return {
    title: `Cancelled • ${planTitle}`,
    body,
    tag: `plan-cancelled-${plan.id}`,
    url: `/plans?id=${plan.id}`,
    targetUserIds,
  };
}

export function formatHostAssignedPayload({
  plan,
  targetUserId,
  participants,
  users,
}: {
  plan: { id: string; title: string; cover_image?: string; category?: string };
  targetUserId: string;
  participants: Array<{ user_id: string; role: string; rsvp_status: string }>;
  users: Array<{ id: string; full_name?: string | null }>;
}) {
  const rawPlanTitle = (plan?.title || "Plan").trim();
  const planTitle = rawPlanTitle.length > 25 ? `${rawPlanTitle.slice(0, 24)}…` : rawPlanTitle;

  // Active hosts excluding targetUser and excluding non-JOINED (removed/left) or non-HOST
  const otherHostParticipants = participants.filter(
    (p) => p.role === "HOST" && p.rsvp_status === "JOINED" && p.user_id !== targetUserId
  );
  const otherHostIds = Array.from(new Set(otherHostParticipants.map((p) => p.user_id)));

  const otherHostNames = otherHostIds.map((id) => {
    const u = users.find((user) => user.id === id);
    const rawName = (u?.full_name || "").trim();
    return rawName.length > 0 ? rawName : "Someone";
  });

  return {
    title: `You're hosting • ${planTitle}`,
    body: formatCoHostNotificationBody(otherHostNames),
    tag: `host-role-${plan.id}-${targetUserId}`,
    url: `/plans?id=${plan.id}`,
    targetUserIds: targetUserId ? [targetUserId] : [],
  };
}

// ============================================================================
// Comprehensive Tests for Cancellation and Co-Host Push Notifications
// ============================================================================

describe("Planless Push Notifications — Cancellation & Co-Host Copy Improvements", () => {
  const plan = {
    id: "plan-smash-guys-123",
    title: "Smash Guys",
    host_id: "user-creator-thilak",
  };

  // --------------------------------------------------------------------------
  // Requirement 1: Cancellation notifications identify the actual cancelling user
  // --------------------------------------------------------------------------
  it("Requirement 1: Cancellation notifications identify the actual cancelling user", () => {
    const actorUser = { id: "user-renjith", full_name: "Renjith" };
    const participants = [
      { user_id: "user-renjith", rsvp_status: "JOINED" },
      { user_id: "user-maanastej", rsvp_status: "JOINED" },
      { user_id: "user-bhaavya", rsvp_status: "WAITLISTED" },
    ];

    const payload = formatPlanCancellationPayload({
      plan,
      actorUser,
      actorId: actorUser.id,
      participants,
    });

    expect(payload.title).toBe("Cancelled • Smash Guys");
    expect(payload.body).toBe("Renjith cancelled this plan");
  });

  // --------------------------------------------------------------------------
  // Requirement 2: The cancelling user is not incorrectly inferred from the plan creator
  // --------------------------------------------------------------------------
  it("Requirement 2: The cancelling user is not incorrectly inferred from the plan creator", () => {
    // Creator is "Thilaka Sundar", but actor cancelling is co-host "Renjith"
    const actorUser = { id: "user-cohost-renjith", full_name: "Renjith" };
    const participants = [
      { user_id: "user-creator-thilak", rsvp_status: "JOINED" },
      { user_id: "user-cohost-renjith", rsvp_status: "JOINED" },
      { user_id: "user-member-alex", rsvp_status: "JOINED" },
    ];

    const payload = formatPlanCancellationPayload({
      plan, // host_id is "user-creator-thilak"
      actorUser,
      actorId: actorUser.id,
      participants,
    });

    // Must be Renjith, NEVER Thilak
    expect(payload.body).toBe("Renjith cancelled this plan");
    expect(payload.body).not.toContain("Thilak");
    // The creator should be notified if they weren't the canceller
    expect(payload.targetUserIds).toContain("user-creator-thilak");
    // The cancelling actor must not receive their own cancellation push
    expect(payload.targetUserIds).not.toContain("user-cohost-renjith");
  });

  // --------------------------------------------------------------------------
  // Requirement 3: Co-host assignment notifications list the other current hosts and exclude the recipient
  // --------------------------------------------------------------------------
  it("Requirement 3: Co-host assignment notifications list the other current hosts and exclude the recipient", () => {
    const targetUserId = "user-target-alex";
    const participants = [
      { user_id: "user-renjith", role: "HOST", rsvp_status: "JOINED" },
      { user_id: "user-thilak", role: "HOST", rsvp_status: "JOINED" },
      { user_id: targetUserId, role: "HOST", rsvp_status: "JOINED" }, // Newly promoted
    ];
    const users = [
      { id: "user-renjith", full_name: "Renjith" },
      { id: "user-thilak", full_name: "Thilaka Sundar" },
      { id: targetUserId, full_name: "Alex" },
    ];

    const payload = formatHostAssignedPayload({
      plan,
      targetUserId,
      participants,
      users,
    });

    expect(payload.title).toBe("You're hosting • Smash Guys");
    expect(payload.body).toBe("You're hosting this plan with Renjith and Thilaka Sundar");
    expect(payload.body).not.toContain("Alex");
  });

  // --------------------------------------------------------------------------
  // Requirement 4: One, two, and multiple other hosts produce correctly formatted messages
  // --------------------------------------------------------------------------
  describe("Requirement 4: Natural grammar formatting for one, two, and multiple other hosts", () => {
    it("formats 0 other hosts (recipient is sole host)", () => {
      expect(formatCoHostNotificationBody([])).toBe("You're hosting this plan");
    });

    it("formats 1 other host", () => {
      expect(formatCoHostNotificationBody(["Renjith"])).toBe(
        "You're hosting this plan with Renjith"
      );
    });

    it("formats 2 other hosts", () => {
      expect(formatCoHostNotificationBody(["Renjith", "Thilaka Sundar"])).toBe(
        "You're hosting this plan with Renjith and Thilaka Sundar"
      );
    });

    it("formats 3 other hosts with Oxford comma", () => {
      expect(
        formatCoHostNotificationBody(["Renjith", "Thilaka Sundar", "Maanastej"])
      ).toBe("You're hosting this plan with Renjith, Thilaka Sundar, and Maanastej");
    });

    it("formats 4 other hosts with Oxford comma", () => {
      expect(
        formatCoHostNotificationBody([
          "Renjith",
          "Thilaka Sundar",
          "Maanastej",
          "Bhaavya",
        ])
      ).toBe(
        "You're hosting this plan with Renjith, Thilaka Sundar, Maanastej, and Bhaavya"
      );
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 5: Removed and former hosts are not included
  // --------------------------------------------------------------------------
  it("Requirement 5: Removed or former hosts are not included in co-host list", () => {
    const targetUserId = "user-new-cohost";
    const participants = [
      { user_id: "user-active-host-1", role: "HOST", rsvp_status: "JOINED" },
      // Demoted host: role is PARTICIPANT
      { user_id: "user-demoted-host", role: "PARTICIPANT", rsvp_status: "JOINED" },
      // Removed host: rsvp_status is SKIPPED
      { user_id: "user-removed-host", role: "HOST", rsvp_status: "SKIPPED" },
      // Leaver host: rsvp_status is LEFT
      { user_id: "user-left-host", role: "HOST", rsvp_status: "LEFT" },
      // Recipient
      { user_id: targetUserId, role: "HOST", rsvp_status: "JOINED" },
    ];
    const users = [
      { id: "user-active-host-1", full_name: "Renjith" },
      { id: "user-demoted-host", full_name: "Former Host Bob" },
      { id: "user-removed-host", full_name: "Removed Host Charlie" },
      { id: "user-left-host", full_name: "Left Host Dave" },
      { id: targetUserId, full_name: "New CoHost" },
    ];

    const payload = formatHostAssignedPayload({
      plan,
      targetUserId,
      participants,
      users,
    });

    expect(payload.body).toBe("You're hosting this plan with Renjith");
    expect(payload.body).not.toContain("Bob");
    expect(payload.body).not.toContain("Charlie");
    expect(payload.body).not.toContain("Dave");
  });

  // --------------------------------------------------------------------------
  // Requirement 6: Missing display names use the existing fallback
  // --------------------------------------------------------------------------
  describe("Requirement 6: Missing display names fallback to Planless convention", () => {
    it("Cancellation: missing actor display name falls back to 'Someone cancelled this plan'", () => {
      const payloadNullName = formatPlanCancellationPayload({
        plan,
        actorUser: { id: "user-anon", full_name: null },
        actorId: "user-anon",
        participants: [{ user_id: "user-other", rsvp_status: "JOINED" }],
      });
      expect(payloadNullName.body).toBe("Someone cancelled this plan");

      const payloadEmptyName = formatPlanCancellationPayload({
        plan,
        actorUser: { id: "user-anon", full_name: "   " },
        actorId: "user-anon",
        participants: [{ user_id: "user-other", rsvp_status: "JOINED" }],
      });
      expect(payloadEmptyName.body).toBe("Someone cancelled this plan");
    });

    it("Cancellation: completely unresolvable actor falls back to 'The host cancelled this plan'", () => {
      const payloadNoActor = formatPlanCancellationPayload({
        plan,
        actorUser: null,
        actorId: undefined,
        participants: [{ user_id: "user-other", rsvp_status: "JOINED" }],
      });
      expect(payloadNoActor.body).toBe("The host cancelled this plan");
    });

    it("Co-host: missing other host display name falls back to 'Someone'", () => {
      const targetUserId = "user-target";
      const participants = [
        { user_id: "user-host-1", role: "HOST", rsvp_status: "JOINED" },
        { user_id: targetUserId, role: "HOST", rsvp_status: "JOINED" },
      ];
      const users = [{ id: "user-host-1", full_name: "" }]; // Empty name

      const payload = formatHostAssignedPayload({
        plan,
        targetUserId,
        participants,
        users,
      });

      expect(payload.body).toBe("You're hosting this plan with Someone");
    });

    it("Co-host: one known host and one missing name host", () => {
      expect(formatCoHostNotificationBody(["Renjith", ""])).toBe(
        "You're hosting this plan with Renjith and Someone"
      );
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 7: Only the intended recipient receives the co-host assignment notification
  // --------------------------------------------------------------------------
  it("Requirement 7: Only the intended recipient receives the co-host assignment notification", () => {
    const targetUserId = "user-promoted-cohost";
    const participants = [
      { user_id: "user-host-1", role: "HOST", rsvp_status: "JOINED" },
      { user_id: "user-host-2", role: "HOST", rsvp_status: "JOINED" },
      { user_id: "user-member-3", role: "PARTICIPANT", rsvp_status: "JOINED" },
      { user_id: targetUserId, role: "HOST", rsvp_status: "JOINED" },
    ];
    const users = [
      { id: "user-host-1", full_name: "Renjith" },
      { id: "user-host-2", full_name: "Thilak" },
      { id: "user-member-3", full_name: "Maanas" },
      { id: targetUserId, full_name: "New Co-Host" },
    ];

    const payload = formatHostAssignedPayload({
      plan,
      targetUserId,
      participants,
      users,
    });

    expect(payload.targetUserIds).toEqual([targetUserId]);
    expect(payload.targetUserIds).not.toContain("user-host-1");
    expect(payload.targetUserIds).not.toContain("user-member-3");
  });

  // --------------------------------------------------------------------------
  // Requirement 8: Existing cancellation and co-host notification delivery and click destinations continue to work
  // --------------------------------------------------------------------------
  it("Requirement 8: Existing cancellation and co-host notification delivery and click destinations continue to work", () => {
    const cancelPayload = formatPlanCancellationPayload({
      plan,
      actorUser: { id: "user-1", full_name: "Renjith" },
      actorId: "user-1",
      participants: [{ user_id: "user-2", rsvp_status: "JOINED" }],
    });
    expect(cancelPayload.url).toBe(`/plans?id=${plan.id}`);
    expect(cancelPayload.tag).toBe(`plan-cancelled-${plan.id}`);

    const cohostPayload = formatHostAssignedPayload({
      plan,
      targetUserId: "user-cohost",
      participants: [
        { user_id: "user-creator", role: "HOST", rsvp_status: "JOINED" },
        { user_id: "user-cohost", role: "HOST", rsvp_status: "JOINED" },
      ],
      users: [
        { id: "user-creator", full_name: "Renjith" },
        { id: "user-cohost", full_name: "Thilak" },
      ],
    });
    expect(cohostPayload.url).toBe(`/plans?id=${plan.id}`);
    expect(cohostPayload.tag).toBe(`host-role-${plan.id}-user-cohost`);
  });
});
