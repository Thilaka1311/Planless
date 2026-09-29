import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { mapPlansToLegacyPlans } from "../../../../../lib/mappers";

// Mock supabase client
const mockFrom = vi.fn();
vi.mock("../../../../lib/supabaseClient", () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
    from: (...args: any[]) => mockFrom(...args),
  },
}));

// Mock ProfileContext store
let mockDbUsers: any[] = [];
const mockSetDbUsers = vi.fn((updater: any) => {
  if (typeof updater === "function") {
    mockDbUsers = updater(mockDbUsers);
  } else {
    mockDbUsers = updater;
  }
});

vi.mock("../../../profile/state/ProfileContext", () => ({
  useProfileStore: () => ({
    activeUserUuid: "current-user-uuid",
    dbUsers: mockDbUsers,
    setDbUsers: mockSetDbUsers,
  }),
}));

// Mock api/plans
const mockGetCurrentUserPlans = vi.fn();
const mockFetchMemories = vi.fn();
const mockSyncOverduePlansRPC = vi.fn();

vi.mock("../../api/plans", () => ({
  getCurrentUserPlans: (...args: any[]) => mockGetCurrentUserPlans(...args),
  fetchMemories: (...args: any[]) => mockFetchMemories(...args),
  syncOverduePlansRPC: (...args: any[]) => mockSyncOverduePlansRPC(...args),
}));

import { PlansProvider, usePlansStore } from "../PlansContext";

describe("Plans and Profile Hydration Optimization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbUsers = [
      {
        id: "current-user-uuid",
        user_id: "U_CURRENT",
        full_name: "Current User",
        profile_photo_path: "current.png",
      },
    ];
  });

  it("seeds dbUsers from embedded user_profile and makes zero secondary users queries", async () => {
    const participantWithProfile = {
      id: "part-1",
      plan_id: "plan-1",
      user_id: "user-2",
      role: "PARTICIPANT",
      rsvp_status: "JOINED",
      user_profile: {
        id: "user-2",
        public_id: "U_USER2",
        full_name: "Alice Smith",
        profile_photo_path: "alice.jpg",
        bio: "Alice bio",
      },
    };

    mockGetCurrentUserPlans.mockResolvedValue([
      {
        id: "plan-1",
        title: "Coffee Chat",
        status: "LIVE",
        plan_participants: [participantWithProfile],
      },
    ]);
    mockFetchMemories.mockResolvedValue([]);

    let hookResult: any = null;
    const TestConsumer = () => {
      hookResult = usePlansStore();
      return null;
    };

    renderToString(
      <PlansProvider>
        <TestConsumer />
      </PlansProvider>
    );

    await act(async () => {
      await hookResult.refreshPlans(undefined, "test_hydration");
    });

    // setDbUsers should have been called to seed the embedded profile
    expect(mockSetDbUsers).toHaveBeenCalled();
    const seededAlice = mockDbUsers.find(u => u.id === "user-2");
    expect(seededAlice).toBeDefined();
    expect(seededAlice?.full_name).toBe("Alice Smith");
    expect(seededAlice?.bio).toBe("Alice bio");
    expect(seededAlice?.profile_photo_path).toBe("alice.jpg");

    // Supabase .from("users") should NOT have been called because user-2 had an embedded profile
    expect(mockFrom).not.toHaveBeenCalledWith("users");
  });

  it("mapPlansToLegacyPlans resolves embedded user_profile immediately without placeholder flicker", () => {
    const rawPlans = [
      {
        id: "plan-1",
        title: "Dinner Party",
        status: "LIVE" as const,
        total_cost: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        host_profile: {
          id: "host-uuid",
          public_id: "U_HOST",
          full_name: "Host Bob",
          profile_photo_path: "bob.jpg",
        },
      },
    ];

    const rawParticipants = [
      {
        id: "part-1",
        plan_id: "plan-1",
        user_id: "user-3",
        role: "PARTICIPANT" as const,
        rsvp_status: "JOINED" as const,
        responded_at: new Date().toISOString(),
        user_profile: {
          id: "user-3",
          public_id: "U_CHARLIE",
          full_name: "Charlie Brown",
          profile_photo_path: "charlie.png",
          bio: "Cartoon character",
        },
      },
    ];

    // Empty usersList simulating the state before separate dbUsers hydration
    const emptyUsersList: any[] = [];

    const legacyPlans = mapPlansToLegacyPlans(rawPlans as any, rawParticipants as any, emptyUsersList, "current-user-uuid");

    expect(legacyPlans).toHaveLength(1);
    const plan = legacyPlans[0];
    expect(plan.creatorName).toBe("Host Bob");
    expect(plan.creatorAvatar).toBe("bob.jpg");

    expect(plan.members).toHaveLength(1);
    const member = plan.members[0];
    expect(member.name).toBe("Charlie Brown");
    expect(member.avatar).toBe("charlie.png");
    expect(member.name).not.toBe("Loading...");
    expect(member.name).not.toBe("Participant");
  });
});
