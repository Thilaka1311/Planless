import { describe, it, expect } from "vitest";
import {
  calculateUnreadChatsCount,
  handleIncomingMessageToUnreadMap,
  handleChatReadInUnreadMap,
} from "../useUnreadChatsCount";

describe("useUnreadChatsCount helpers", () => {
  describe("calculateUnreadChatsCount", () => {
    it("returns 0 when there are no unread chats", () => {
      expect(calculateUnreadChatsCount({})).toBe(0);
      expect(calculateUnreadChatsCount({ "plan-1": 0, "plan-2": 0 })).toBe(0);
    });

    it("counts each chat with unread messages exactly once, NOT total messages", () => {
      // Chat A has 5 unread messages, Chat B has 2 unread messages, Chat C has 1 unread message
      const unreadMap = {
        "chat-a": 5,
        "chat-b": 2,
        "chat-c": 1,
        "chat-d": 0,
      };

      // 3 separate chats have unread messages (total unread messages is 8, but badge is 3)
      expect(calculateUnreadChatsCount(unreadMap)).toBe(3);
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
      expect(calculateUnreadChatsCount(result)).toBe(1);
    });

    it("ignores non-message event types", () => {
      const initial = { "plan-1": 0 };
      const msg = { plan_id: "plan-1", sender_id: "other-user", message_type: "system" };

      const result = handleIncomingMessageToUnreadMap(initial, msg, myUuid, myIds);
      expect(result).toBe(initial);
    });

    it("keeps badge count identical if message arrives in an already-unread chat", () => {
      const initial = { "plan-1": 2, "plan-2": 1 };
      expect(calculateUnreadChatsCount(initial)).toBe(2);

      const msg = { plan_id: "plan-1", sender_id: "other-user", message_type: "text" };
      const next = handleIncomingMessageToUnreadMap(initial, msg, myUuid, myIds);

      expect(next["plan-1"]).toBe(3);
      // Badge count remains 2 because plan-1 was already unread
      expect(calculateUnreadChatsCount(next)).toBe(2);
    });

    it("increments badge count if message arrives in a previously read chat", () => {
      const initial = { "plan-1": 0, "plan-2": 1 };
      expect(calculateUnreadChatsCount(initial)).toBe(1);

      const msg = { plan_id: "plan-1", sender_id: "other-user", message_type: "text" };
      const next = handleIncomingMessageToUnreadMap(initial, msg, myUuid, myIds);

      expect(next["plan-1"]).toBe(1);
      // Badge count increments from 1 to 2
      expect(calculateUnreadChatsCount(next)).toBe(2);
    });

    it("respects involvedPlanIds filtering if provided", () => {
      const initial = {};
      const msg = { plan_id: "unrelated-plan", sender_id: "other-user", message_type: "text" };
      const involved = new Set(["plan-1", "plan-2"]);

      const next = handleIncomingMessageToUnreadMap(initial, msg, myUuid, myIds, involved);
      expect(next).toBe(initial);
      expect(calculateUnreadChatsCount(next)).toBe(0);
    });
  });

  describe("handleChatReadInUnreadMap", () => {
    it("resets chat unread count to 0 and immediately decrements unread chats count", () => {
      const initial = {
        "chat-a": 5,
        "chat-b": 2,
        "chat-c": 1,
      };
      expect(calculateUnreadChatsCount(initial)).toBe(3);

      // User opens chat-a and it is marked as read
      const afterA = handleChatReadInUnreadMap(initial, "chat-a");
      expect(afterA["chat-a"]).toBe(0);
      expect(calculateUnreadChatsCount(afterA)).toBe(2);

      // User opens chat-b
      const afterB = handleChatReadInUnreadMap(afterA, "chat-b");
      expect(afterB["chat-b"]).toBe(0);
      expect(calculateUnreadChatsCount(afterB)).toBe(1);

      // User opens chat-c
      const afterC = handleChatReadInUnreadMap(afterB, "chat-c");
      expect(afterC["chat-c"]).toBe(0);
      expect(calculateUnreadChatsCount(afterC)).toBe(0);
    });

    it("does nothing if chat is already read (count 0)", () => {
      const initial = { "chat-a": 0, "chat-b": 2 };
      const result = handleChatReadInUnreadMap(initial, "chat-a");
      expect(result).toBe(initial);
    });
  });
});
