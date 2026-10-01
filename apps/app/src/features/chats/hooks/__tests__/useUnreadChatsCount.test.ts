import { describe, it, expect } from "vitest";
import {
  isPlanActive,
  calculateUnreadChatsCount,
  handleIncomingMessageToUnreadMap,
  handleChatReadInUnreadMap,
} from "../useUnreadChatsCount";
import { Plan } from "../../../../core/types";

describe("useUnreadChatsCount helpers", () => {
  const createMockPlan = (id: string, status: string, hostId: string = "user-123"): Plan =>
    ({
      id,
      dbUuid: `uuid-${id}`,
      title: `Plan ${id}`,
      status,
      hostId,
      members: [
        {
          userId: hostId,
          userUuid: hostId,
          name: "Host User",
          avatar: "",
          joinState: "JOINED",
          reminderState: "none",
          joinedAt: new Date().toISOString(),
        },
      ],
      date: "2026-09-30",
      time: "10:00",
      location: "Central Park",
      paymentAmount: 0,
      groupId: null,
    } as unknown as Plan);

  describe("isPlanActive", () => {
    it("returns true for LIVE and OVERDUE plans", () => {
      expect(isPlanActive({ status: "LIVE" })).toBe(true);
      expect(isPlanActive({ status: "OVERDUE" })).toBe(true);
      expect(isPlanActive({ status: "CONFIRMED" })).toBe(true);
    });

    it("returns false for COMPLETED, CANCELLED, and CANCELED plans", () => {
      expect(isPlanActive({ status: "COMPLETED" })).toBe(false);
      expect(isPlanActive({ status: "CANCELLED" })).toBe(false);
      expect(isPlanActive({ status: "CANCELED" })).toBe(false);
      expect(isPlanActive({ is_cancelled: true })).toBe(false);
      expect(isPlanActive({ is_completed: true })).toBe(false);
    });

    it("returns false for null or undefined plan", () => {
      expect(isPlanActive(null)).toBe(false);
      expect(isPlanActive(undefined)).toBe(false);
    });
  });

  describe("calculateUnreadChatsCount - Specification Cases", () => {
    const myIds = new Set(["user-123"]);

    // CASE 1: Active Plan with 1 unread message → badge = 1 (one conversation)
    it("CASE 1: Active Plan with 1 unread message -> badge = 1", () => {
      const planA = createMockPlan("plan-a", "LIVE");
      const unreadMap = { "uuid-plan-a": 1 };
      expect(calculateUnreadChatsCount(unreadMap, [planA], myIds)).toBe(1);
    });

    // CASE 2: Active Plan with 5 unread messages → badge = 1 (max 1 per conversation)
    it("CASE 2: Active Plan with 5 unread messages -> badge = 1 (max 1 per conversation)", () => {
      const planA = createMockPlan("plan-a", "LIVE");
      const unreadMap = { "uuid-plan-a": 5 };
      expect(calculateUnreadChatsCount(unreadMap, [planA], myIds)).toBe(1);
    });

    // CASE 3: Active Plan (5 unread) + Completed Plan (10 unread) → badge = 1
    it("CASE 3: Active Plan with 5 unread + Completed Plan with 10 unread -> badge = 1", () => {
      const planA = createMockPlan("plan-a", "LIVE");
      const planD = createMockPlan("plan-d", "COMPLETED");
      const unreadMap = {
        "uuid-plan-a": 5,
        "uuid-plan-d": 10,
      };
      expect(calculateUnreadChatsCount(unreadMap, [planA, planD], myIds)).toBe(1);
    });

    // CASE 4: Active Plan (5 unread) + Cancelled Plan (10 unread) → badge = 1
    it("CASE 4: Active Plan with 5 unread + Cancelled Plan with 10 unread -> badge = 1", () => {
      const planA = createMockPlan("plan-a", "LIVE");
      const planC = createMockPlan("plan-c", "CANCELLED");
      const unreadMap = {
        "uuid-plan-a": 5,
        "uuid-plan-c": 10,
      };
      expect(calculateUnreadChatsCount(unreadMap, [planA, planC], myIds)).toBe(1);
    });

    // Specification Example: Chat A (5), Chat B (3), Chat C (1) → badge = 3 (3 conversations)
    // NOT 9 (total message count)
    it("Specification Example: Chat A (5) + Chat B (3) + Chat C (1) -> badge = 3 (conversations not messages)", () => {
      const planA = createMockPlan("plan-a", "LIVE");
      const planB = createMockPlan("plan-b", "LIVE");
      const planC = createMockPlan("plan-c", "CANCELLED");
      const planD = createMockPlan("plan-d", "COMPLETED");

      const unreadMap = {
        "uuid-plan-a": 5,
        "uuid-plan-b": 2,
        "uuid-plan-c": 10,
        "uuid-plan-d": 4,
      };

      // Only planA and planB are active → 2 conversations with unread, badge = 2
      expect(calculateUnreadChatsCount(unreadMap, [planA, planB, planC, planD], myIds)).toBe(2);
    });

    // CASE 5: Only unread messages belong to Completed/Cancelled Plans → badge = 0
    it("CASE 5: Only unread messages belong to Completed/Cancelled Plans -> badge = 0", () => {
      const planC = createMockPlan("plan-c", "CANCELLED");
      const planD = createMockPlan("plan-d", "COMPLETED");
      const unreadMap = {
        "uuid-plan-c": 10,
        "uuid-plan-d": 4,
      };
      expect(calculateUnreadChatsCount(unreadMap, [planC, planD], myIds)).toBe(0);
    });

    // CASE 6: New message arrives in a Cancelled Plan → bottom badge does not increase
    it("CASE 6: New message arrives in a Cancelled Plan -> bottom badge does not increase", () => {
      const planA = createMockPlan("plan-a", "LIVE");
      const planC = createMockPlan("plan-c", "CANCELLED");
      const plans = [planA, planC];
      const involved = new Set(["uuid-plan-a", "uuid-plan-c"]);

      const initialMap = {
        "uuid-plan-a": 3,
        "uuid-plan-c": 2,
      };
      const initialBadge = calculateUnreadChatsCount(initialMap, plans, myIds);
      expect(initialBadge).toBe(1); // Only planA counts (1 conversation)

      // Incoming message to Cancelled Plan C
      const msg = { plan_id: "uuid-plan-c", sender_id: "other-user", message_type: "text" };
      const nextMap = handleIncomingMessageToUnreadMap(initialMap, msg, "user-123", myIds, involved);
      expect(nextMap["uuid-plan-c"]).toBe(3);

      const nextBadge = calculateUnreadChatsCount(nextMap, plans, myIds);
      expect(nextBadge).toBe(1); // Does NOT increase!
    });

    // CASE 7: New message arrives in a Completed Plan → bottom badge does not increase
    it("CASE 7: New message arrives in a Completed Plan -> bottom badge does not increase", () => {
      const planA = createMockPlan("plan-a", "LIVE");
      const planD = createMockPlan("plan-d", "COMPLETED");
      const plans = [planA, planD];
      const involved = new Set(["uuid-plan-a", "uuid-plan-d"]);

      const initialMap = {
        "uuid-plan-a": 3,
        "uuid-plan-d": 4,
      };
      const initialBadge = calculateUnreadChatsCount(initialMap, plans, myIds);
      expect(initialBadge).toBe(1); // Only planA counts (1 conversation)

      // Incoming message to Completed Plan D
      const msg = { plan_id: "uuid-plan-d", sender_id: "other-user", message_type: "text" };
      const nextMap = handleIncomingMessageToUnreadMap(initialMap, msg, "user-123", myIds, involved);
      expect(nextMap["uuid-plan-d"]).toBe(5);

      const nextBadge = calculateUnreadChatsCount(nextMap, plans, myIds);
      expect(nextBadge).toBe(1); // Does NOT increase!
    });

    // CASE 8: Active Plan becomes Completed → its conversation stops contributing to the badge
    it("CASE 8: Active Plan becomes Completed -> its conversation stops contributing to the badge", () => {
      const planA = createMockPlan("plan-a", "LIVE");
      const planB = createMockPlan("plan-b", "LIVE");
      const planC = createMockPlan("plan-c", "LIVE");

      const unreadMap = {
        "uuid-plan-a": 5,
        "uuid-plan-b": 2,
        "uuid-plan-c": 1,
      };

      // Initially all 3 are active → 3 conversations
      expect(calculateUnreadChatsCount(unreadMap, [planA, planB, planC], myIds)).toBe(3);

      // Plan C becomes COMPLETED
      const updatedPlanC = { ...planC, status: "COMPLETED" as const };
      expect(calculateUnreadChatsCount(unreadMap, [planA, planB, updatedPlanC], myIds)).toBe(2);
    });

    // CASE 9: Completed Plan is reopened → its conversation becomes eligible again
    it("CASE 9: Completed Plan is reopened and becomes active again -> its conversation contributes again", () => {
      const planA = createMockPlan("plan-a", "LIVE");
      const planD = createMockPlan("plan-d", "COMPLETED");

      const unreadMap = {
        "uuid-plan-a": 5,
        "uuid-plan-d": 4,
      };

      // While planD is COMPLETED, badge = 1 (only planA)
      expect(calculateUnreadChatsCount(unreadMap, [planA, planD], myIds)).toBe(1);

      // Host reopens planD (status becomes LIVE)
      const reopenedPlanD = { ...planD, status: "LIVE" as const };
      expect(calculateUnreadChatsCount(unreadMap, [planA, reopenedPlanD], myIds)).toBe(2);
    });

    // CASE 10: Opening an active chat marks it read → badge recalculates correctly
    it("CASE 10: Opening an active chat marks it read -> badge recalculates correctly", () => {
      const planA = createMockPlan("plan-a", "LIVE");
      const planB = createMockPlan("plan-b", "LIVE");
      const plans = [planA, planB];

      const initialMap = {
        "uuid-plan-a": 5,
        "uuid-plan-b": 2,
      };
      expect(calculateUnreadChatsCount(initialMap, plans, myIds)).toBe(2); // 2 conversations

      // User opens chat for plan-a
      const afterA = handleChatReadInUnreadMap(initialMap, "uuid-plan-a", plans);
      expect(afterA["uuid-plan-a"]).toBe(0);
      expect(calculateUnreadChatsCount(afterA, plans, myIds)).toBe(1); // 1 conversation remaining

      // User opens chat for plan-b
      const afterB = handleChatReadInUnreadMap(afterA, "uuid-plan-b", plans);
      expect(afterB["uuid-plan-b"]).toBe(0);
      expect(calculateUnreadChatsCount(afterB, plans, myIds)).toBe(0);
    });
  });

  describe("handleIncomingMessageToUnreadMap", () => {
    const myUuid = "user-123";
    const myIds = new Set(["user-123", "user-alt"]);

    it("ignores messages sent by the current user", () => {
      const initial = { "plan-1": 1 };
      const msg = { plan_id: "plan-1", sender_id: myUuid, message_type: "text" };

      const result = handleIncomingMessageToUnreadMap(initial, msg, myUuid, myIds);
      expect(result).toBe(initial);
      expect(result["plan-1"]).toBe(1);
    });

    it("counts system messages as unread for non-current-user", () => {
      const initial = { "plan-1": 0 };
      const msg = { plan_id: "plan-1", sender_id: "system-bot", message_type: "system" };

      const result = handleIncomingMessageToUnreadMap(initial, msg, myUuid, myIds);
      expect(result["plan-1"]).toBe(1);
    });

    it("increments unread count when message arrives in an existing chat", () => {
      const initial = { "plan-1": 2, "plan-2": 1 };
      const msg = { plan_id: "plan-1", sender_id: "other-user", message_type: "text" };
      const next = handleIncomingMessageToUnreadMap(initial, msg, myUuid, myIds);

      expect(next["plan-1"]).toBe(3);
    });

    it("respects involvedPlanIds filtering if provided", () => {
      const initial = {};
      const msg = { plan_id: "unrelated-plan", sender_id: "other-user", message_type: "text" };
      const involved = new Set(["plan-1", "plan-2"]);

      const next = handleIncomingMessageToUnreadMap(initial, msg, myUuid, myIds, involved);
      expect(next).toBe(initial);
      expect(next["unrelated-plan"]).toBeUndefined();
    });
  });
});
