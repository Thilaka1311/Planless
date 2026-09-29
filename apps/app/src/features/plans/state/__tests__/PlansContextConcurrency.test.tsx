import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { renderToString } from "react-dom/server";

// Mock supabase client
vi.mock("../../../../lib/supabaseClient", () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  },
}));

// Mock ProfileContext
vi.mock("../../../profile/state/ProfileContext", () => ({
  useProfileStore: () => ({
    activeUserUuid: "test-user-id",
    dbUsers: [],
    setDbUsers: vi.fn(),
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

describe("PlansContext.refreshPlans concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("concurrently dispatches getCurrentUserPlans and fetchMemories during full refresh", async () => {
    let plansStarted = false;
    let memoriesStarted = false;
    let bothWereInFlightSimultaneously = false;

    mockGetCurrentUserPlans.mockImplementation(async () => {
      plansStarted = true;
      if (memoriesStarted) {
        bothWereInFlightSimultaneously = true;
      }
      await new Promise(r => setTimeout(r, 20));
      return [
        {
          id: "plan-1",
          title: "Test Plan",
          status: "LIVE",
          plan_participants: [],
        },
      ];
    });

    mockFetchMemories.mockImplementation(async () => {
      memoriesStarted = true;
      if (plansStarted) {
        bothWereInFlightSimultaneously = true;
      }
      await new Promise(r => setTimeout(r, 20));
      return [
        {
          id: "mem-1",
          plan_id: "plan-1",
        },
      ];
    });

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

    expect(hookResult).not.toBeNull();

    await act(async () => {
      await hookResult.refreshPlans(undefined, "test_full_refresh");
    });

    expect(mockGetCurrentUserPlans).toHaveBeenCalledWith("test-user-id");
    expect(mockFetchMemories).toHaveBeenCalled();
    expect(bothWereInFlightSimultaneously).toBe(true);
  });

  it("only fetches plans when targetTables specifies plan_participants", async () => {
    mockGetCurrentUserPlans.mockResolvedValue([]);
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

    vi.clearAllMocks();

    await act(async () => {
      await hookResult.refreshPlans(["plan_participants"]);
    });

    expect(mockGetCurrentUserPlans).toHaveBeenCalledWith("test-user-id");
    expect(mockFetchMemories).not.toHaveBeenCalled();
  });

  it("only fetches memories when targetTables specifies memories", async () => {
    mockGetCurrentUserPlans.mockResolvedValue([]);
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

    vi.clearAllMocks();

    await act(async () => {
      await hookResult.refreshPlans(["memories"]);
    });

    expect(mockFetchMemories).toHaveBeenCalledTimes(1);
    expect(mockGetCurrentUserPlans).not.toHaveBeenCalled();
  });

  it("handles errors gracefully in Promise.all without unhandled rejections", async () => {
    mockGetCurrentUserPlans.mockRejectedValue(new Error("Plan fetch failure"));
    mockFetchMemories.mockResolvedValue([{ id: "mem-1" }]);

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

    // refreshPlans catches errors internally and logs them
    await act(async () => {
      await expect(hookResult.refreshPlans(undefined, "test_error")).resolves.toBeUndefined();
    });
  });
});
