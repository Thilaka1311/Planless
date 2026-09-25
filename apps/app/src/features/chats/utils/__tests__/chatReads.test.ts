import { describe, it, expect, vi } from "vitest";
import { formatChatListTimestamp, emitChatReadEvent, subscribeToChatReadEvents } from "../chatReads";
import {
  appendMessageToCache,
  getCachedMessages,
  getCachedUnreadInfo,
  setCachedUnreadInfo,
  markPlanChatReadInCache,
} from "../../hooks/useChatCache";

describe("chatReads utils", () => {
  describe("formatChatListTimestamp", () => {
    it("returns empty string for null or invalid date", () => {
      expect(formatChatListTimestamp(null)).toBe("");
      expect(formatChatListTimestamp(undefined)).toBe("");
      expect(formatChatListTimestamp("invalid-date")).toBe("");
    });

    it("formats today's time with AM/PM", () => {
      const now = new Date();
      now.setHours(14, 30, 0, 0);
      const result = formatChatListTimestamp(now.toISOString());
      expect(result).toBe("2:30 PM");
    });

    it("formats yesterday's time as 'Yesterday'", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const result = formatChatListTimestamp(yesterday.toISOString());
      expect(result).toBe("Yesterday");
    });

    it("formats older dates appropriately", () => {
      const oldDate = new Date("2025-01-15T10:00:00Z");
      const result = formatChatListTimestamp(oldDate.toISOString());
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });
  });

  describe("chat read event system", () => {
    it("emits and handles chat read events", () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToChatReadEvents(callback);

      emitChatReadEvent("test-plan-123");
      expect(callback).toHaveBeenCalledWith("test-plan-123");

      unsubscribe();
      emitChatReadEvent("test-plan-456");
      expect(callback).not.toHaveBeenCalledWith("test-plan-456");
    });
  });

  describe("in-memory chat cache unread synchronization", () => {
    const testPlanId = "plan-unread-test-1";
    const myUserId = "user-me";
    const otherUserId = "user-other";

    it("initializes empty and allows setting unread info", () => {
      setCachedUnreadInfo(testPlanId, {
        count: 5,
        firstUnreadId: "msg-1",
        latestUnreadId: "msg-5",
        lastReadAt: null,
        lastReadMessageId: null,
      });

      const unread = getCachedUnreadInfo(testPlanId);
      expect(unread?.count).toBe(5);
      expect(unread?.firstUnreadId).toBe("msg-1");
      expect(unread?.latestUnreadId).toBe("msg-5");
    });

    it("increments unread count and tracks first/latest unread when message from another user arrives", () => {
      // Start with 0 unreads
      markPlanChatReadInCache(testPlanId, "msg-0");
      expect(getCachedUnreadInfo(testPlanId)?.count).toBe(0);

      // Message 1 arrives from other user
      appendMessageToCache(
        {
          id: "msg-new-1",
          plan_id: testPlanId,
          sender_id: otherUserId,
          message_type: "text",
          content: "Hello there",
          created_at: new Date().toISOString(),
        },
        myUserId
      );

      let info = getCachedUnreadInfo(testPlanId);
      expect(info?.count).toBe(1);
      expect(info?.firstUnreadId).toBe("msg-new-1");
      expect(info?.latestUnreadId).toBe("msg-new-1");

      // Message 2 arrives from other user
      appendMessageToCache(
        {
          id: "msg-new-2",
          plan_id: testPlanId,
          sender_id: otherUserId,
          message_type: "text",
          content: "Are you free?",
          created_at: new Date().toISOString(),
        },
        myUserId
      );

      info = getCachedUnreadInfo(testPlanId);
      expect(info?.count).toBe(2);
      expect(info?.firstUnreadId).toBe("msg-new-1"); // first unread remains msg-new-1
      expect(info?.latestUnreadId).toBe("msg-new-2"); // latest unread updates to msg-new-2

      // Message from ME should not increment unread
      appendMessageToCache(
        {
          id: "msg-new-3",
          plan_id: testPlanId,
          sender_id: myUserId,
          message_type: "text",
          content: "Yeah I am!",
          created_at: new Date().toISOString(),
        },
        myUserId
      );

      info = getCachedUnreadInfo(testPlanId);
      expect(info?.count).toBe(2);
      expect(info?.firstUnreadId).toBe("msg-new-1");
      expect(info?.latestUnreadId).toBe("msg-new-2");

      // Verify messages are in cache
      const cachedMsgs = getCachedMessages(testPlanId);
      expect(cachedMsgs.length).toBeGreaterThanOrEqual(3);
    });

    it("clears unread count on markPlanChatReadInCache", () => {
      markPlanChatReadInCache(testPlanId, "msg-new-2");
      const info = getCachedUnreadInfo(testPlanId);
      expect(info?.count).toBe(0);
      expect(info?.firstUnreadId).toBeNull();
      expect(info?.latestUnreadId).toBeNull();
      expect(info?.lastReadMessageId).toBe("msg-new-2");
    });
  });
});
