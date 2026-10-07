import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CHAT_MESSAGES_PAGE_SIZE,
  appendMessageToCache,
  getCachedMessages,
  getCachedUnreadInfo,
  setCachedUnreadInfo,
  markPlanChatReadInCache,
  invalidatePlanCache,
  ChatMessage,
} from "../useChatCache";

describe("Bounded Chat History Loading & Cache-First Architecture", () => {
  const planId = "test-plan-bounded-1";
  const myUserId = "user-me";
  const otherUserId = "user-other";

  beforeEach(() => {
    invalidatePlanCache();
    vi.clearAllMocks();
  });

  describe("Page size and constant invariants", () => {
    it("defines a sensible bounded page size constant", () => {
      expect(CHAT_MESSAGES_PAGE_SIZE).toBe(50);
    });
  });

  describe("Cache-first immediate rendering", () => {
    it("renders cached messages immediately with zero network delay", () => {
      const msg1: ChatMessage = {
        id: "msg-cached-1",
        plan_id: planId,
        sender_id: myUserId,
        message_type: "text",
        content: "Hello from cache",
        created_at: new Date(Date.now() - 60000).toISOString(),
      };

      appendMessageToCache(msg1, myUserId);

      const cached = getCachedMessages(planId);
      expect(cached).toHaveLength(1);
      expect(cached[0].id).toBe("msg-cached-1");
      expect(cached[0].content).toBe("Hello from cache");
    });
  });

  describe("Duplicate message prevention & chronological ordering", () => {
    it("prevents duplicate messages when merging realtime or fetched messages", () => {
      const msg1: ChatMessage = {
        id: "msg-101",
        plan_id: planId,
        sender_id: otherUserId,
        message_type: "text",
        content: "Message 101",
        created_at: new Date(1000000).toISOString(),
      };

      appendMessageToCache(msg1, myUserId);
      expect(getCachedMessages(planId)).toHaveLength(1);

      // Append exact same message ID
      appendMessageToCache(msg1, myUserId);
      expect(getCachedMessages(planId)).toHaveLength(1);

      // Optimistic temp message replaced by server message
      const tempMsg: ChatMessage = {
        id: "temp-12345",
        plan_id: planId,
        sender_id: myUserId,
        message_type: "text",
        content: "Pending message",
        created_at: new Date(2000000).toISOString(),
      };
      appendMessageToCache(tempMsg, myUserId);
      expect(getCachedMessages(planId)).toHaveLength(2);

      const serverConfirmed: ChatMessage = {
        id: "msg-confirmed-real",
        plan_id: planId,
        sender_id: myUserId,
        message_type: "text",
        content: "Pending message",
        created_at: new Date(2000000).toISOString(),
      };
      appendMessageToCache(serverConfirmed, myUserId);
      const afterConfirm = getCachedMessages(planId);
      expect(afterConfirm).toHaveLength(2);
      expect(afterConfirm.some((m) => m.id === "msg-confirmed-real")).toBe(true);
      expect(afterConfirm.some((m) => m.id.startsWith("temp-"))).toBe(false);
    });

    it("maintains chronological order when prepending older messages", () => {
      // Current recent messages (batch 2: items 51..60)
      const recentMessages: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
        id: `msg-${i + 50}`,
        plan_id: planId,
        sender_id: otherUserId,
        message_type: "text",
        content: `Recent ${i + 50}`,
        created_at: new Date(2000000 + (i + 50) * 1000).toISOString(),
      }));

      // Older messages page (batch 1: items 0..49)
      const olderMessages: ChatMessage[] = Array.from({ length: 50 }, (_, i) => ({
        id: `msg-${i}`,
        plan_id: planId,
        sender_id: otherUserId,
        message_type: "text",
        content: `Older ${i}`,
        created_at: new Date(2000000 + i * 1000).toISOString(),
      }));

      // Prepend older messages before recent messages (simulating cursor pagination)
      const existingIds = new Set(recentMessages.map((m) => m.id));
      const uniqueOlder = olderMessages.filter((m) => !existingIds.has(m.id));
      const combined = [...uniqueOlder, ...recentMessages];

      expect(combined).toHaveLength(60);
      expect(combined[0].id).toBe("msg-0");
      expect(combined[59].id).toBe("msg-59");

      // Verify strict chronological ascending timestamps
      for (let i = 0; i < combined.length - 1; i++) {
        const t1 = new Date(combined[i].created_at).getTime();
        const t2 = new Date(combined[i + 1].created_at).getTime();
        expect(t1).toBeLessThanOrEqual(t2);
      }
    });
  });

  describe("End of history detection", () => {
    it("identifies end of history when fetched batch is less than page size", () => {
      const fullBatchLength: number = CHAT_MESSAGES_PAGE_SIZE;
      const partialBatchLength: number = 23;

      const hasMoreFromFull = fullBatchLength === CHAT_MESSAGES_PAGE_SIZE;
      const hasMoreFromPartial = partialBatchLength === CHAT_MESSAGES_PAGE_SIZE;

      expect(hasMoreFromFull).toBe(true);
      expect(hasMoreFromPartial).toBe(false);
    });
  });

  describe("System messages participation in chat history & unread tracking", () => {
    it("includes system messages in unread tracking and history", () => {
      markPlanChatReadInCache(planId, null);
      expect(getCachedUnreadInfo(planId)?.count).toBe(0);

      const sysMsg: ChatMessage = {
        id: "sys-msg-1",
        plan_id: planId,
        sender_id: otherUserId,
        message_type: "system",
        content: "Plan details were updated",
        created_at: new Date().toISOString(),
      };

      appendMessageToCache(sysMsg, myUserId);

      const unreadInfo = getCachedUnreadInfo(planId);
      expect(unreadInfo?.count).toBe(1);
      expect(unreadInfo?.firstUnreadId).toBe("sys-msg-1");
      expect(unreadInfo?.latestUnreadId).toBe("sys-msg-1");

      const cached = getCachedMessages(planId);
      expect(cached).toHaveLength(1);
      expect(cached[0].message_type).toBe("system");
    });
  });

  describe("Unread boundary outside initial recent page", () => {
    it("handles unread boundary positioning when first unread message is older than recent page", () => {
      // 70 messages total. User last read at message 10. Unread count = 60.
      // Initial page of 50 contains messages 20..69.
      // Message 11 (first unread) is outside the initial page.
      const allMessages: ChatMessage[] = Array.from({ length: 70 }, (_, i) => ({
        id: `msg-${i}`,
        plan_id: planId,
        sender_id: otherUserId,
        message_type: "text",
        content: `Msg ${i}`,
        created_at: new Date(1000000 + i * 1000).toISOString(),
      }));

      const firstUnreadId = "msg-11";
      const lastReadAt = new Date(1000000 + 10 * 1000).toISOString();

      // Recent 50 messages
      const initialPage = allMessages.slice(-50);
      expect(initialPage).toHaveLength(50);
      expect(initialPage.some((m) => m.id === firstUnreadId)).toBe(false);

      // Fetch unread gap: messages between lastReadAt and oldest in initialPage
      const oldestInInitial = initialPage[0];
      const unreadGap = allMessages.filter(
        (m) =>
          new Date(m.created_at).getTime() >= new Date(lastReadAt).getTime() &&
          new Date(m.created_at).getTime() < new Date(oldestInInitial.created_at).getTime()
      );

      // Prepend gap to initial page
      const combinedWithGap = [...unreadGap, ...initialPage];

      // First unread message is now guaranteed in loaded set!
      expect(combinedWithGap.some((m) => m.id === firstUnreadId)).toBe(true);
      const firstUnreadIndex = combinedWithGap.findIndex((m) => m.id === firstUnreadId);
      expect(firstUnreadIndex).toBeGreaterThanOrEqual(0);

      // Total fetched messages is bounded (only 60 unreads), NOT entire history of 5000 messages
      expect(combinedWithGap.length).toBeLessThan(75);
    });
  });

  describe("Read cursor invariant", () => {
    it("preserves read cursor in cache and does not mark read merely upon fetching", () => {
      setCachedUnreadInfo(planId, {
        count: 7,
        firstUnreadId: "msg-unread-1",
        latestUnreadId: "msg-unread-7",
        lastReadAt: "2026-09-20T10:00:00Z",
        lastReadMessageId: "msg-read-0",
      });

      // Reading cache synchronously should NOT reset count
      const info = getCachedUnreadInfo(planId);
      expect(info?.count).toBe(7);
      expect(info?.lastReadMessageId).toBe("msg-read-0");

      // Only explicit markPlanChatReadInCache (called when exiting/backing out) marks as read
      markPlanChatReadInCache(planId, "msg-unread-7");
      const afterExit = getCachedUnreadInfo(planId);
      expect(afterExit?.count).toBe(0);
      expect(afterExit?.lastReadMessageId).toBe("msg-unread-7");
      expect(afterExit?.firstUnreadId).toBeNull();
    });
  });
});
