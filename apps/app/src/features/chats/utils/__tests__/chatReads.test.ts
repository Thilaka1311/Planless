import { describe, it, expect, vi } from "vitest";
import { formatChatListTimestamp, format24HourTime, formatRelativeDate, emitChatReadEvent, subscribeToChatReadEvents } from "../chatReads";
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

    it("formats today's time in 24-hour format", () => {
      const now = new Date();
      now.setHours(14, 30, 0, 0);
      const result = formatChatListTimestamp(now.toISOString());
      expect(result).toBe("14:30");
    });

    it("formats morning time correctly in 24-hour format", () => {
      const now = new Date();
      now.setHours(8, 5, 0, 0);
      const result = formatChatListTimestamp(now.toISOString());
      expect(result).toBe("08:05");
    });

    it("formats yesterday's time as 'Yesterday'", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const result = formatChatListTimestamp(yesterday.toISOString());
      expect(result).toBe("Yesterday");
    });

    it("formats older dates as dd-mm-yy", () => {
      // Use a fixed date to test the dd-mm-yy format precisely
      const oldDate = new Date(2025, 0, 15); // Jan 15, 2025 local
      const result = formatChatListTimestamp(oldDate.toISOString());
      // Should be 15-01-25 format
      expect(result).toMatch(/^\d{2}-\d{2}-\d{2}$/);
      expect(result).toBe("15-01-25");
    });
  });

  describe("format24HourTime and formatRelativeDate", () => {
    it("converts PM times to 24-hour format without AM/PM (4:26 PM -> 16:26)", () => {
      const date = new Date(2026, 8, 26, 16, 26);
      expect(format24HourTime(date)).toBe("16:26");
    });

    it("converts AM times to 24-hour format without AM/PM (11:22 AM -> 11:22)", () => {
      const date = new Date(2026, 8, 26, 11, 22);
      expect(format24HourTime(date)).toBe("11:22");
    });

    it("relative date: today shows time only (16:26)", () => {
      const today = new Date();
      today.setHours(16, 26, 0, 0);
      expect(formatRelativeDate(today)).toBe("16:26");
    });

    it("relative date: yesterday shows 'Yesterday'", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(formatRelativeDate(yesterday)).toBe("Yesterday");
    });

    it("relative date: older than yesterday shows 'dd-mm-yy'", () => {
      const old = new Date(2026, 8, 20); // Sep 20, 2026
      expect(formatRelativeDate(old)).toBe("20-09-26");
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
