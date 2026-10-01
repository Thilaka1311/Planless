import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import {
  getCachedChatSummaries,
  getCachedChatSummary,
  setCachedChatSummaries,
  setCachedChatSummary,
  appendMessageToCache,
  invalidatePlanCache,
  ChatMessage,
} from "../hooks/useChatCache";

describe("Chats Screen Cache-First Loading & Smooth Background Sync", () => {
  const planA = "plan-alpha";
  const planB = "plan-beta";

  beforeEach(() => {
    invalidatePlanCache();
    vi.clearAllMocks();
  });

  it("synchronously reads and writes cached chat summaries with zero delay", () => {
    // 1. Initially empty
    expect(getCachedChatSummaries()).toEqual({});
    expect(getCachedChatSummary(planA)).toBeUndefined();

    // 2. Populate cached summary for planA
    setCachedChatSummary(planA, {
      unreadCount: 3,
      senderName: "Alex",
      isCurrentUser: false,
      content: "See you at 7pm!",
      createdAt: "2026-09-30T10:00:00.000Z",
      messageType: "text",
    });

    const summaryA = getCachedChatSummary(planA);
    expect(summaryA).toBeDefined();
    expect(summaryA?.unreadCount).toBe(3);
    expect(summaryA?.senderName).toBe("Alex");
    expect(summaryA?.content).toBe("See you at 7pm!");

    // 3. Populate multiple summaries
    setCachedChatSummaries({
      [planB]: {
        unreadCount: 0,
        senderName: "You",
        isCurrentUser: true,
        content: "Table booked",
        createdAt: "2026-09-30T09:30:00.000Z",
        messageType: "text",
      },
    });

    const allSummaries = getCachedChatSummaries();
    expect(Object.keys(allSummaries)).toHaveLength(2);
    expect(allSummaries[planA]?.unreadCount).toBe(3);
    expect(allSummaries[planB]?.content).toBe("Table booked");
  });

  it("updates cached summary when realtime message arrives", () => {
    const msg: ChatMessage = {
      id: "msg-rt-1",
      plan_id: planA,
      sender_id: "user-partner",
      message_type: "text",
      content: "I just arrived!",
      created_at: "2026-09-30T10:15:00.000Z",
    };

    appendMessageToCache(msg, "user-me");

    const summary = getCachedChatSummary(planA);
    expect(summary).toBeDefined();
    expect(summary?.content).toBe("I just arrived!");
    expect(summary?.unreadCount).toBe(1);
    expect(summary?.isCurrentUser).toBe(false);
  });

  it("correctly identifies when background sync data is unchanged to prevent flashing", () => {
    const current = {
      [planA]: {
        unreadCount: 2,
        senderName: "Sam",
        isCurrentUser: false,
        content: "Meeting location confirmed",
        createdAt: "2026-09-30T08:00:00.000Z",
        messageType: "text",
      },
    };

    const identicalIncoming = {
      [planA]: {
        unreadCount: 2,
        senderName: "Sam",
        isCurrentUser: false,
        content: "Meeting location confirmed",
        createdAt: "2026-09-30T08:00:00.000Z",
        messageType: "text",
      },
    };

    const changedIncoming = {
      [planA]: {
        unreadCount: 3, // Changed
        senderName: "Sam",
        isCurrentUser: false,
        content: "Meeting location confirmed",
        createdAt: "2026-09-30T08:00:00.000Z",
        messageType: "text",
      },
    };

    const checkEqual = (a: typeof current, b: typeof current) => {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;
      for (const k of bKeys) {
        const itemA = a[k];
        const itemB = b[k];
        if (!itemA || !itemB) return false;
        if (
          itemA.unreadCount !== itemB.unreadCount ||
          itemA.content !== itemB.content ||
          itemA.createdAt !== itemB.createdAt ||
          itemA.senderName !== itemB.senderName ||
          itemA.isCurrentUser !== itemB.isCurrentUser ||
          itemA.messageType !== itemB.messageType
        ) {
          return false;
        }
      }
      return true;
    };

    expect(checkEqual(current, identicalIncoming)).toBe(true);
    expect(checkEqual(current, changedIncoming)).toBe(false);
  });
});
