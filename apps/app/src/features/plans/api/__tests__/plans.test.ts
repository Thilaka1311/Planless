import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("../../../../../lib/supabaseClient", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
  },
}));

import { getCurrentUserPlans, syncOverduePlansRPC } from "../plans";

describe("getCurrentUserPlans performance and correctness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles non-blocking syncOverduePlansRPC gracefully even when it rejects", async () => {
    mockRpc.mockRejectedValue(new Error("RPC timeout or network failure"));

    // Should catch internally and not throw
    await expect(syncOverduePlansRPC()).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith("sync_overdue_plans");
  });

  it("returns an empty array immediately when the user has no plan participations", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const mockSelectEq = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: mockSelectEq,
      }),
    });

    const result = await getCurrentUserPlans("user-no-plans");

    expect(result).toEqual([]);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("plan_participants");
  });

  it("fetches plans and participants concurrently with Promise.all and merges results correctly", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    // Track execution order
    const executionEvents: string[] = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === "plan_participants") {
        return {
          select: vi.fn((selector: string) => {
            if (selector === "plan_id, rsvp_status, skip_reason") {
              return {
                eq: vi.fn().mockImplementation(async () => {
                  executionEvents.push("phase1_resolved_ids");
                  return {
                    data: [
                      { plan_id: "plan-1", rsvp_status: "JOINED", skip_reason: null },
                      { plan_id: "plan-2", rsvp_status: "JOINED", skip_reason: null },
                    ],
                    error: null,
                  };
                }),
              };
            }
            // Phase 3 participants query
            return {
              in: vi.fn().mockImplementation(async () => {
                executionEvents.push("phase3_participants_started");
                return {
                  data: [
                    {
                      plan_id: "plan-1",
                      user_id: "user-1",
                      role: "HOST",
                      rsvp_status: "JOINED",
                      user_profile: { id: "user-1", full_name: "Alice" },
                    },
                    {
                      plan_id: "plan-2",
                      user_id: "user-1",
                      role: "PARTICIPANT",
                      rsvp_status: "JOINED",
                      user_profile: { id: "user-1", full_name: "Alice" },
                    },
                  ],
                  error: null,
                };
              }),
            };
          }),
        };
      }

      if (table === "plans") {
        // Phase 2 plans query
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockImplementation(async () => {
              executionEvents.push("phase2_plans_started");
              return {
                data: [
                  { id: "plan-1", title: "Dinner", status: "LIVE" },
                  { id: "plan-2", title: "Movies", status: "OVERDUE" },
                ],
                error: null,
              };
            }),
          }),
        };
      }

      return {} as any;
    });

    const result = await getCurrentUserPlans("user-1");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "plan-1",
      title: "Dinner",
      status: "LIVE",
      plan_participants: [
        {
          plan_id: "plan-1",
          user_id: "user-1",
          role: "HOST",
          rsvp_status: "JOINED",
          user_profile: { id: "user-1", full_name: "Alice" },
        },
      ],
    });
    expect(result[1]).toEqual({
      id: "plan-2",
      title: "Movies",
      status: "OVERDUE",
      plan_participants: [
        {
          plan_id: "plan-2",
          user_id: "user-1",
          role: "PARTICIPANT",
          rsvp_status: "JOINED",
          user_profile: { id: "user-1", full_name: "Alice" },
        },
      ],
    });

    // Both Phase 2 and Phase 3 are dispatched after Phase 1 resolves
    expect(executionEvents).toContain("phase1_resolved_ids");
    expect(executionEvents).toContain("phase2_plans_started");
    expect(executionEvents).toContain("phase3_participants_started");
  });

  it("throws if the initial plan_participants query fails", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: new Error("Network error loading participant plans"),
        }),
      }),
    });

    await expect(getCurrentUserPlans("user-1")).rejects.toThrow("Network error loading participant plans");
  });

  it("throws if either parallel query in Promise.all fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "plan_participants") {
        return {
          select: vi.fn((selector: string) => {
            if (selector === "plan_id, rsvp_status, skip_reason") {
              return {
                eq: vi.fn().mockResolvedValue({
                  data: [{ plan_id: "plan-1" }],
                  error: null,
                }),
              };
            }
            return {
              in: vi.fn().mockResolvedValue({
                data: [{ plan_id: "plan-1", user_id: "user-1" }],
                error: null,
              }),
            };
          }),
        };
      }

      if (table === "plans") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: null,
              error: new Error("Database error loading plans"),
            }),
          }),
        };
      }

      return {} as any;
    });

    await expect(getCurrentUserPlans("user-1")).rejects.toThrow("Database error loading plans");
  });
});
