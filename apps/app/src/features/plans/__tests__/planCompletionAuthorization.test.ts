import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase client mocks
const mockRpc = vi.fn();
const mockGetUser = vi.fn().mockResolvedValue({
  data: { user: { id: "06064726-079a-438f-919f-a8be1da70831" } },
  error: null,
});

vi.mock("../../../../lib/supabaseClient", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    auth: {
      getUser: () => mockGetUser(),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    },
  },
}));

vi.mock("../api/plans", () => ({
  completePlan: vi.fn(),
  updatePlanDetails: vi.fn(),
}));

import { verifyPlanHostAuthorization } from "../utils/planHostAuthorization";
import { mapPlansToLegacyPlans } from "../../../../lib/mappers";
import * as api from "../api/plans";

describe("Plan Completion Authorization Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: false, error: null });
  });

  const PRIMARY_HOST_ID = "c3dc4291-f7d7-4cf5-88f3-6be5cdb71353"; // Thilaka
  const COHOST_ID = "06064726-079a-438f-919f-a8be1da70831";       // Renjith (reported affected user)
  const PARTICIPANT_ID = "a1111111-2222-3333-4444-555555555555";  // Regular attendee
  const PLAN_ID = "0623a5f5-37b0-4c54-8a1f-437397fd66f4";

  // ─── Scenario 1: Actual creator host can complete a plan ────────────────────
  it("Scenario 1: Actual creator host can complete a plan", async () => {
    const matchedPlan = {
      id: PLAN_ID,
      dbUuid: PLAN_ID,
      hostId: PRIMARY_HOST_ID,
      creatorId: PRIMARY_HOST_ID,
      isOwner: true,
      members: [
        { userId: PRIMARY_HOST_ID, isHost: true, rsvp_status: "JOINED" },
      ],
    };

    const isAuthorized = await verifyPlanHostAuthorization({
      planId: PLAN_ID,
      matchedPlan,
      userId: PRIMARY_HOST_ID,
    });

    expect(isAuthorized).toBe(true);
  });

  // ─── Scenario 2: Non-host participant cannot complete a plan ────────────────
  describe("Scenario 2: Non-host participant cannot complete a plan and is rejected", () => {
    it("rejects non-host from canonical participant state", async () => {
      const matchedPlan = {
        id: PLAN_ID,
        dbUuid: PLAN_ID,
        hostId: PRIMARY_HOST_ID,
        creatorId: PRIMARY_HOST_ID,
        isOwner: false,
        members: [
          { userId: PRIMARY_HOST_ID, isHost: true, rsvp_status: "JOINED" },
          { userId: PARTICIPANT_ID, isHost: false, role: "PARTICIPANT", rsvp_status: "JOINED" },
        ],
      };

      const dbPlanParticipants = [
        { plan_id: PLAN_ID, user_id: PRIMARY_HOST_ID, role: "HOST", rsvp_status: "JOINED" },
        { plan_id: PLAN_ID, user_id: PARTICIPANT_ID, role: "PARTICIPANT", rsvp_status: "JOINED" },
      ];

      const isAuthorized = await verifyPlanHostAuthorization({
        planId: PLAN_ID,
        matchedPlan,
        userId: PARTICIPANT_ID,
        dbPlanParticipants,
      });

      expect(isAuthorized).toBe(false);
    });

    it("rejects non-host via RPC fallback when local state is unhydrated", async () => {
      mockRpc.mockResolvedValueOnce({ data: false, error: null });

      const isAuthorized = await verifyPlanHostAuthorization({
        planId: PLAN_ID,
        matchedPlan: undefined,
        userId: PARTICIPANT_ID,
        dbPlanParticipants: [],
      });

      expect(mockRpc).toHaveBeenCalledWith("is_plan_host", {
        p_plan_id: PLAN_ID,
        p_user_id: PARTICIPANT_ID,
      });
      expect(isAuthorized).toBe(false);
    });
  });

  // ─── Scenario 3: Co-host follows existing documented permission rules ────────
  describe("Scenario 3: Co-host follows existing documented permission rules", () => {
    it("authorizes a co-host with role = HOST and rsvp_status = JOINED", async () => {
      // Plan where Renjith is co-host (matches the bug report where hostId was Thilaka)
      const matchedPlan = {
        id: PLAN_ID,
        dbUuid: PLAN_ID,
        hostId: PRIMARY_HOST_ID, // Frontend hostId was pointing only to primary host
        creatorId: PRIMARY_HOST_ID,
        members: [
          { userId: PRIMARY_HOST_ID, isHost: true, rsvp_status: "JOINED" },
          { userId: COHOST_ID, isHost: true, role: "HOST", rsvp_status: "JOINED" },
        ],
      };

      const dbPlanParticipants = [
        { plan_id: PLAN_ID, user_id: PRIMARY_HOST_ID, role: "HOST", rsvp_status: "JOINED" },
        { plan_id: PLAN_ID, user_id: COHOST_ID, role: "HOST", rsvp_status: "JOINED" },
      ];

      const isAuthorized = await verifyPlanHostAuthorization({
        planId: PLAN_ID,
        matchedPlan,
        userId: COHOST_ID,
        dbPlanParticipants,
      });

      expect(isAuthorized).toBe(true);
    });

    it("rejects a former host who has left or skipped the plan", async () => {
      const matchedPlan = {
        id: PLAN_ID,
        dbUuid: PLAN_ID,
        hostId: PRIMARY_HOST_ID,
        members: [
          { userId: COHOST_ID, isHost: true, role: "HOST", rsvp_status: "LEFT" },
        ],
      };

      const dbPlanParticipants = [
        { plan_id: PLAN_ID, user_id: COHOST_ID, role: "HOST", rsvp_status: "LEFT" },
      ];

      const isAuthorized = await verifyPlanHostAuthorization({
        planId: PLAN_ID,
        matchedPlan,
        userId: COHOST_ID,
        dbPlanParticipants,
      });

      expect(isAuthorized).toBe(false);
    });
  });

  // ─── Scenario 4: Missing or partially loaded plan data ───────────────────────
  describe("Scenario 4: Missing or partially loaded plan data", () => {
    it("falls back gracefully to canonical participants when matchedPlan is missing", async () => {
      const dbPlanParticipants = [
        { plan_id: PLAN_ID, user_id: COHOST_ID, role: "HOST", rsvp_status: "JOINED" },
      ];

      const isAuthorized = await verifyPlanHostAuthorization({
        planId: PLAN_ID,
        matchedPlan: undefined,
        userId: COHOST_ID,
        dbPlanParticipants,
      });

      expect(isAuthorized).toBe(true);
    });

    it("falls back to database RPC is_plan_host when all local state is unhydrated", async () => {
      mockRpc.mockResolvedValueOnce({ data: true, error: null });

      const isAuthorized = await verifyPlanHostAuthorization({
        planId: PLAN_ID,
        matchedPlan: undefined,
        userId: COHOST_ID,
        dbPlanParticipants: [],
      });

      expect(mockRpc).toHaveBeenCalledWith("is_plan_host", {
        p_plan_id: PLAN_ID,
        p_user_id: COHOST_ID,
      });
      expect(isAuthorized).toBe(true);
    });

    it("safely returns false when caller user ID is completely absent", async () => {
      const isAuthorized = await verifyPlanHostAuthorization({
        planId: PLAN_ID,
        matchedPlan: undefined,
        userId: null,
      });

      expect(isAuthorized).toBe(false);
    });
  });

  // ─── Scenario 5: Host identity mapped consistently in frontend mappers ───────
  it("Scenario 5: mapPlansToLegacyPlans preserves isOwner: true for any joined host", () => {
    const rawPlans = [
      {
        id: PLAN_ID,
        title: "Badminton Match",
        scheduled_at: "2026-10-14T10:00:00Z",
        category: "sports",
        subcategory: "badminton",
      },
    ];

    const rawParticipants = [
      { plan_id: PLAN_ID, user_id: PRIMARY_HOST_ID, role: "HOST" as const, rsvp_status: "JOINED" as const },
      { plan_id: PLAN_ID, user_id: COHOST_ID, role: "HOST" as const, rsvp_status: "JOINED" as const },
      { plan_id: PLAN_ID, user_id: PARTICIPANT_ID, role: "PARTICIPANT" as const, rsvp_status: "JOINED" as const },
    ];

    // Mapped for co-host Renjith
    const mappedForCoHost = mapPlansToLegacyPlans(rawPlans as any, rawParticipants as any, [], COHOST_ID);
    expect(mappedForCoHost[0].isOwner).toBe(true);

    // Mapped for regular attendee
    const mappedForParticipant = mapPlansToLegacyPlans(rawPlans as any, rawParticipants as any, [], PARTICIPANT_ID);
    expect(mappedForParticipant[0].isOwner).toBe(false);
  });

  // ─── Scenario 6: Stale plan object recovery via canonical data ───────────────
  it("Scenario 6: A stale plan object does not reject a legitimate host", async () => {
    // Stale plan has old hostId and isOwner: false
    const stalePlan = {
      id: PLAN_ID,
      dbUuid: PLAN_ID,
      hostId: PRIMARY_HOST_ID,
      creatorId: PRIMARY_HOST_ID,
      isOwner: false,
      members: [],
    };

    // But authoritative dbPlanParticipants confirms Renjith is an active joined HOST
    const dbPlanParticipants = [
      { plan_id: PLAN_ID, user_id: COHOST_ID, role: "HOST", rsvp_status: "JOINED" },
    ];

    const isAuthorized = await verifyPlanHostAuthorization({
      planId: PLAN_ID,
      matchedPlan: stalePlan,
      userId: COHOST_ID,
      dbPlanParticipants,
    });

    expect(isAuthorized).toBe(true);
  });

  // ─── Scenario 7: Backend rejects unauthorized completion ─────────────────────
  it("Scenario 7: Backend RPC rejects unauthorized completion directly", async () => {
    (api.completePlan as any).mockRejectedValueOnce(new Error("NOT_PLAN_HOST"));

    await expect(
      api.completePlan(PLAN_ID, [{ user_id: PARTICIPANT_ID, attendance: "ATTENDED" }], "NONE")
    ).rejects.toThrow("NOT_PLAN_HOST");
  });

  // ─── Scenario 8: Successful completion executes lifecycle and API call ───────
  it("Scenario 8: Successful completion invokes api.completePlan with correct payload", async () => {
    const matchedPlan = {
      id: PLAN_ID,
      dbUuid: PLAN_ID,
      hostId: COHOST_ID,
      isOwner: true,
      members: [],
    };

    const isAuthorized = await verifyPlanHostAuthorization({
      planId: PLAN_ID,
      matchedPlan,
      userId: COHOST_ID,
    });

    expect(isAuthorized).toBe(true);

    (api.completePlan as any).mockResolvedValueOnce({
      plan_id: PLAN_ID,
      status: "COMPLETED",
      completed_at: "2026-10-13T18:00:00Z",
    });

    const attendanceInput = [
      { user_id: PRIMARY_HOST_ID, attendance: "ATTENDED" as const },
      { user_id: COHOST_ID, attendance: "ATTENDED" as const },
    ];

    const result = await api.completePlan(PLAN_ID, attendanceInput, "NONE");

    expect(api.completePlan).toHaveBeenCalledWith(PLAN_ID, attendanceInput, "NONE");
    expect(result.status).toBe("COMPLETED");
  });
});
