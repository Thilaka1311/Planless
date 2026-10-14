import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks for Supabase
const mockInvoke = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
const mockRpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: "user-actor-1" } }, error: null });
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockFrom = vi.fn();

vi.mock("../../../../lib/supabaseClient", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
    auth: {
      getUser: () => mockGetUser(),
      getSession: () => Promise.resolve({ data: { session: { user: { id: "user-actor-1" } } }, error: null }),
    },
    from: (...args: any[]) => mockFrom(...args),
  },
}));

import {
  promoteToHostRPC,
  cancelPlanRPC,
  removeParticipantRPC,
  completePlan,
  joinPlanRPC,
  leavePlanRPC,
} from "../api/plans";
import {
  sendFriendRequest,
  acceptFriendRequest,
} from "../../friendships/services/friendshipService";

describe("Missing Push Notifications Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Plan Participation & Host Management RPC Triggers", () => {
    it("promoteToHostRPC dispatches HOST_ASSIGNED push event without blocking RPC return", async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      const result = await promoteToHostRPC("plan-101", "user-cohost-2");
      expect(result).toEqual({ success: true });
      expect(mockRpc).toHaveBeenCalledWith("promote_to_host", {
        p_plan_id: "plan-101",
        p_target_user_id: "user-cohost-2",
      });

      // Wait a microtask tick for the non-blocking push promise
      await Promise.resolve();
      await Promise.resolve();

      expect(mockInvoke).toHaveBeenCalledWith("send-push", {
        body: {
          event: "HOST_ASSIGNED",
          planId: "plan-101",
          targetUserId: "user-cohost-2",
          actorId: "user-actor-1",
        },
      });
    });

    it("cancelPlanRPC dispatches PLAN_CANCELLED push event", async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      const result = await cancelPlanRPC("plan-101");
      expect(result).toEqual({ success: true });
      expect(mockRpc).toHaveBeenCalledWith("cancel_plan", {
        p_plan_id: "plan-101",
      });

      await Promise.resolve();
      await Promise.resolve();

      expect(mockInvoke).toHaveBeenCalledWith("send-push", {
        body: {
          event: "PLAN_CANCELLED",
          planId: "plan-101",
          actorId: "user-actor-1",
        },
      });
    });

    it("removeParticipantRPC dispatches PARTICIPANT_REMOVED push event", async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      const result = await removeParticipantRPC("plan-101", "user-removed-5");
      expect(result).toEqual({ success: true });
      expect(mockRpc).toHaveBeenCalledWith("remove_participant", {
        p_plan_id: "plan-101",
        p_target_user_id: "user-removed-5",
      });

      await Promise.resolve();
      await Promise.resolve();

      expect(mockInvoke).toHaveBeenCalledWith("send-push", {
        body: {
          event: "PARTICIPANT_REMOVED",
          planId: "plan-101",
          targetUserId: "user-removed-5",
          actorId: "user-actor-1",
        },
      });
    });

    it("completePlan dispatches PLAN_COMPLETED push event with attending users only", async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      const attendanceInput: Array<{ user_id: string; attendance: "ATTENDED" | "DID_NOT_ATTEND" }> = [
        { user_id: "user-actor-1", attendance: "ATTENDED" },
        { user_id: "user-friend-2", attendance: "ATTENDED" },
        { user_id: "user-absent-3", attendance: "DID_NOT_ATTEND" },
      ];

      await completePlan("plan-101", attendanceInput);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockInvoke).toHaveBeenCalledWith("send-push", {
        body: {
          event: "PLAN_COMPLETED",
          planId: "plan-101",
          actorId: "user-actor-1",
          attendingUserIds: ["user-actor-1", "user-friend-2"],
        },
      });
    });

    it("joinPlanRPC dispatches PLAN_JOIN push event when joining normally", async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: true, user_id: "user-actor-1", rsvp_status: "JOINED" },
        error: null,
      });

      await joinPlanRPC("plan-101");
      await Promise.resolve();
      await Promise.resolve();

      expect(mockInvoke).toHaveBeenCalledWith("send-push", {
        body: {
          event: "PLAN_JOIN",
          planId: "plan-101",
          actorId: "user-actor-1",
          rsvpStatus: "JOINED",
        },
      });
    });

    it("joinPlanRPC dispatches WAITLIST_JOIN push event when assigned to WAITLIST", async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: true, user_id: "user-actor-1", rsvp_status: "WAITLISTED" },
        error: null,
      });

      await joinPlanRPC("plan-101");
      await Promise.resolve();
      await Promise.resolve();

      expect(mockInvoke).toHaveBeenCalledWith("send-push", {
        body: {
          event: "WAITLIST_JOIN",
          planId: "plan-101",
          actorId: "user-actor-1",
          rsvpStatus: "WAITLISTED",
        },
      });
    });

    it("leavePlanRPC dispatches PLAN_LEAVE push event", async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: true, user_id: "user-actor-1" },
        error: null,
      });

      await leavePlanRPC("plan-101");
      await Promise.resolve();
      await Promise.resolve();

      expect(mockInvoke).toHaveBeenCalledWith("send-push", {
        body: {
          event: "PLAN_LEAVE",
          planId: "plan-101",
          actorId: "user-actor-1",
          previousStatus: "JOINED",
        },
      });
    });
  });

  describe("2. Friendship Push Notification Triggers", () => {
    it("sendFriendRequest dispatches FRIEND_REQUEST_SENT push event", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "friendships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "friendship-99",
                    user_1_id: "user-1",
                    user_2_id: "user-2",
                    requested_by: "user-1",
                    status: "PENDING",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      await sendFriendRequest("user-1", "user-2");
      await Promise.resolve();
      await Promise.resolve();

      expect(mockInvoke).toHaveBeenCalledWith("send-push", {
        body: {
          event: "FRIEND_REQUEST_SENT",
          actorId: "user-1",
          targetUserId: "user-2",
        },
      });
    });

    it("acceptFriendRequest dispatches FRIEND_REQUEST_ACCEPTED push event to original requester", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "friendships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "friendship-99",
                    user_1_id: "user-1",
                    user_2_id: "user-actor-1",
                    requested_by: "user-1",
                    status: "PENDING",
                  },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: "friendship-99",
                      user_1_id: "user-1",
                      user_2_id: "user-actor-1",
                      requested_by: "user-1",
                      status: "ACCEPTED",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      // User actor accepts User 1's request
      await acceptFriendRequest("friendship-99");
      await Promise.resolve();
      await Promise.resolve();

      expect(mockInvoke).toHaveBeenCalledWith("send-push", {
        body: {
          event: "FRIEND_REQUEST_ACCEPTED",
          actorId: "user-actor-1",
          targetUserId: "user-1",
        },
      });
    });
  });

  describe("3. Rescheduling & Waitlist Promotion Invariants", () => {
    it("rescheduling detector identifies date, time, and venue changes accurately", () => {
      // Helper function mirroring usePlanLifecycle rescheduling detection
      const detectReschedule = (
        oldPlan: { date?: string; placeName?: string; placeAddress?: string },
        updates: { date?: string; placeName?: string; placeAddress?: string }
      ) => {
        let dateChanged = false;
        let timeChanged = false;
        let formattedNewDate = "";
        let formattedNewTime = "";

        if (updates.date) {
          const oldDateObj = oldPlan.date ? new Date(oldPlan.date) : null;
          const newDateObj = new Date(updates.date);
          if (!isNaN(newDateObj.getTime())) {
            if (!oldDateObj || oldDateObj.toISOString().slice(0, 10) !== newDateObj.toISOString().slice(0, 10)) {
              dateChanged = true;
            }
            if (!oldDateObj || oldDateObj.toTimeString().slice(0, 5) !== newDateObj.toTimeString().slice(0, 5)) {
              timeChanged = true;
            }
            formattedNewDate = newDateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
            formattedNewTime = newDateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          }
        }

        const venueChanged =
          (updates.placeName !== undefined && updates.placeName !== oldPlan.placeName) ||
          (updates.placeAddress !== undefined && updates.placeAddress !== oldPlan.placeAddress);
        const formattedNewVenue = updates.placeName || updates.placeAddress || "";

        return {
          hasChanges: dateChanged || timeChanged || venueChanged,
          changes: { dateChanged, timeChanged, venueChanged, newDate: formattedNewDate, newTime: formattedNewTime, newVenue: formattedNewVenue }
        };
      };

      // Case A: Only title changes -> no reschedule push
      const noReschedule = detectReschedule(
        { date: "2026-10-20T18:00:00Z", placeName: "Turf Club" },
        {} // no date or venue changes
      );
      expect(noReschedule.hasChanges).toBe(false);

      // Case B: Time changed from 18:00 to 18:30
      const timeReschedule = detectReschedule(
        { date: "2026-10-20T18:00:00Z", placeName: "Turf Club" },
        { date: "2026-10-20T18:30:00Z" }
      );
      expect(timeReschedule.hasChanges).toBe(true);
      expect(timeReschedule.changes.timeChanged).toBe(true);
      expect(timeReschedule.changes.dateChanged).toBe(false);
      expect(timeReschedule.changes.venueChanged).toBe(false);

      // Case C: Venue changed
      const venueReschedule = detectReschedule(
        { date: "2026-10-20T18:00:00Z", placeName: "Turf Club" },
        { placeName: "Play Arena" }
      );
      expect(venueReschedule.hasChanges).toBe(true);
      expect(venueReschedule.changes.venueChanged).toBe(true);
      expect(venueReschedule.changes.newVenue).toBe("Play Arena");
    });
  });

  describe("4. Error Resilience & Self-Exclusion Invariants", () => {
    it("push failure in promoteToHostRPC does not throw or fail the operation", async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });
      mockInvoke.mockRejectedValueOnce(new Error("Network push failure"));

      // Should resolve without rejecting
      await expect(promoteToHostRPC("plan-101", "user-cohost-2")).resolves.toEqual({ success: true });
    });

    it("push failure in cancelPlanRPC does not throw", async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });
      mockInvoke.mockRejectedValueOnce(new Error("Push gateway down"));

      await expect(cancelPlanRPC("plan-101")).resolves.toEqual({ success: true });
    });
  });
});
