import { describe, it, expect } from "vitest";
import { getPlanHosts } from "../planHostUtils";
import { Plan } from "../../../../core/types";
import defaultAvatar from "../../../../assets/default_avatar.webp";

describe("planHostUtils - getPlanHosts", () => {
  it("returns empty array when plan is null or undefined", () => {
    expect(getPlanHosts(null)).toEqual([]);
    expect(getPlanHosts(undefined)).toEqual([]);
  });

  it("resolves single joined host correctly", () => {
    const plan: Partial<Plan> = {
      id: "p1",
      hostId: "u1",
      creatorName: "Renjith",
      creatorAvatar: "https://example.com/renjith.jpg",
      members: [
        {
          userId: "u1",
          name: "Renjith",
          avatar: "https://example.com/renjith.jpg",
          isHost: true,
          role: "HOST",
          joinState: "JOINED",
          reminderState: "none",
          joinedAt: "2026-10-15T10:00:00Z",
        },
      ],
    };

    const hosts = getPlanHosts(plan as Plan);
    expect(hosts).toHaveLength(1);
    expect(hosts[0].name).toBe("Renjith");
    expect(hosts[0].avatar).toBe("https://example.com/renjith.jpg");
    expect(hosts[0].id).toBe("u1");
  });

  it("resolves multiple joined hosts with current user as 'You' sorted first", () => {
    const plan: Partial<Plan> = {
      id: "p2",
      hostId: "u1",
      members: [
        {
          userId: "u2",
          name: "Thilaka Sundar",
          avatar: "https://example.com/thilak.jpg",
          isHost: true,
          role: "HOST",
          joinState: "JOINED",
          reminderState: "none",
          joinedAt: "2026-10-15T10:00:00Z",
        },
        {
          userId: "u1",
          name: "Renjith",
          avatar: "https://example.com/renjith.jpg",
          isHost: true,
          role: "HOST",
          joinState: "JOINED",
          reminderState: "none",
          joinedAt: "2026-10-15T10:00:00Z",
        },
        {
          userId: "u3",
          name: "Bhaavya",
          avatar: "https://example.com/bhaavya.jpg",
          isHost: false,
          role: "PARTICIPANT",
          joinState: "JOINED",
          reminderState: "none",
          joinedAt: "2026-10-15T10:00:00Z",
        },
      ],
    };

    const hosts = getPlanHosts(plan as Plan, {
      viewerUserId: "u2",
    });

    // Does not include ordinary participant Bhaavya
    expect(hosts).toHaveLength(2);
    // "You" is first
    expect(hosts[0].name).toBe("You");
    expect(hosts[0].id).toBe("u2");
    // Renjith is second
    expect(hosts[1].name).toBe("Renjith");
    expect(hosts[1].id).toBe("u1");
  });

  it("does not include participants who are invited, skipped, or waitlisted even if role is HOST", () => {
    const plan: Partial<Plan> = {
      id: "p3",
      hostId: "u1",
      members: [
        {
          userId: "u1",
          name: "Active Host",
          avatar: "https://example.com/u1.jpg",
          isHost: true,
          role: "HOST",
          joinState: "JOINED",
          reminderState: "none",
          joinedAt: "2026-10-15T10:00:00Z",
        },
        {
          userId: "u2",
          name: "Left Host",
          avatar: "https://example.com/u2.jpg",
          isHost: true,
          role: "HOST",
          joinState: "SKIPPED",
          reminderState: "none",
          joinedAt: "2026-10-15T10:00:00Z",
        },
      ],
    };

    const hosts = getPlanHosts(plan as Plan);
    expect(hosts).toHaveLength(1);
    expect(hosts[0].name).toBe("Active Host");
  });

  it("falls back to creator info when members array has no joined hosts", () => {
    const plan: Partial<Plan> = {
      id: "p4",
      hostId: "u1",
      creatorName: "Renjith",
      creatorAvatar: "https://example.com/renjith.jpg",
      members: [],
    };

    const hosts = getPlanHosts(plan as Plan);
    expect(hosts).toHaveLength(1);
    expect(hosts[0].name).toBe("Renjith");
    expect(hosts[0].avatar).toBe("https://example.com/renjith.jpg");
    expect(hosts[0].isCreator).toBe(true);
  });

  it("handles missing avatar gracefully with defaultAvatar fallback", () => {
    const plan: Partial<Plan> = {
      id: "p5",
      hostId: "u1",
      members: [
        {
          userId: "u1",
          name: "Host Without Avatar",
          avatar: "",
          isHost: true,
          role: "HOST",
          joinState: "JOINED",
          reminderState: "none",
          joinedAt: "2026-10-15T10:00:00Z",
        },
      ],
    };

    const hosts = getPlanHosts(plan as Plan);
    expect(hosts).toHaveLength(1);
    expect(hosts[0].avatar).toBe(defaultAvatar);
  });
});
