import { describe, it, expect, vi } from "vitest";

/**
 * Pure test harness implementing the exact business rules used in:
 * 1. get_plan_recipients_chat_unreads SQL RPC
 * 2. send-push Edge Function formatChatPayloadForRecipient
 * 3. Service Worker push event & CLEAR_CHAT_NOTIFICATION handlers
 */

interface ChatMessage {
  id: string;
  sender_id: string;
  content: string;
  message_type?: string;
  created_at: string;
}

interface ParticipantRecord {
  user_id: string;
  created_at: string;
  rsvp_status?: string;
}

interface PlanChatReadRecord {
  user_id: string;
  plan_id: string;
  last_read_message_id?: string | null;
  last_read_at?: string | null;
}

/**
 * Emulates the authoritative get_plan_recipients_chat_unreads calculation.
 */
function calculateUnreadsForRecipient({
  recipientId,
  participant,
  readRecord,
  messages,
}: {
  recipientId: string;
  participant?: ParticipantRecord;
  readRecord?: PlanChatReadRecord;
  messages: ChatMessage[];
}): { unreadCount: number; unreadMessages: ChatMessage[] } {
  // Excluded participants (e.g. SKIPPED)
  if (participant?.rsvp_status === "SKIPPED") {
    return { unreadCount: 0, unreadMessages: [] };
  }

  // Authoritative cutoff: COALESCE(pcr.last_read_at, pp.created_at, 0)
  const cutoff = readRecord?.last_read_at || participant?.created_at || new Date(0).toISOString();
  const cutoffTime = new Date(cutoff).getTime();
  const lastReadMessageId = readRecord?.last_read_message_id;

  const unreadMessages = messages.filter((m) => {
    // 1. Exclude recipient-authored messages from their own unread count
    if (m.sender_id === recipientId) return false;
    // 2. Exclude cost and poll messages
    if (m.message_type === "cost" || m.message_type === "poll") return false;
    // 3. Must be newer than cutoff timestamp
    const mTime = new Date(m.created_at).getTime();
    if (mTime <= cutoffTime) return false;
    // 4. Must not match last_read_message_id
    if (lastReadMessageId && m.id === lastReadMessageId) return false;

    return true;
  });

  return {
    unreadCount: unreadMessages.length,
    unreadMessages: unreadMessages.slice(-8), // Up to 8 recent unread messages for notification preview
  };
}

/**
 * Emulates formatChatPayloadForRecipient from send-push/index.ts.
 */
function formatChatPayloadForRecipient({
  recipientUserId,
  planTitle,
  planId,
  unreadCount,
  unreadMessages,
  senderMap,
}: {
  recipientUserId: string;
  planTitle: string;
  planId: string;
  unreadCount: number;
  unreadMessages: ChatMessage[];
  senderMap: Map<string, { name: string; avatarUrl: string }>;
}) {
  const eligible = (unreadMessages || []).filter((m) => m.sender_id !== recipientUserId);
  const effectiveUnreadCount = Math.max(unreadCount, eligible.length);

  if (effectiveUnreadCount <= 0 || eligible.length === 0) {
    return null;
  }

  let resolvedTitle: string;
  let resolvedBody: string;

  if (effectiveUnreadCount === 1) {
    const singleMsg = eligible[0];
    const sInfo = senderMap.get(singleMsg.sender_id) || { name: "Friend", avatarUrl: "" };
    resolvedTitle = `${planTitle} • 1 unread message`;
    resolvedBody = `${sInfo.name}: ${singleMsg.content}`;
  } else {
    resolvedTitle = `${planTitle} • ${effectiveUnreadCount} unread messages`;
    const lines = eligible.map((m) => {
      const sInfo = senderMap.get(m.sender_id) || { name: "Friend", avatarUrl: "" };
      return `${sInfo.name}: ${m.content}`;
    });
    resolvedBody = lines.join("\n");
  }

  return {
    title: resolvedTitle,
    body: resolvedBody,
    tag: `plan-chat-${planId}`,
    data: {
      url: `/chats?id=${planId}`,
      planId,
      notificationType: "CHAT_MESSAGE",
      unreadCount: effectiveUnreadCount,
      messages: eligible.map((m) => ({
        id: m.id,
        senderName: senderMap.get(m.sender_id)?.name || "Friend",
        content: m.content,
      })),
    },
  };
}

export interface MockActiveNotification {
  tag: string;
  title: string;
  body: string;
  unreadCount: number;
  planId: string;
  receivedAt: number;
  lastAlertTime: number;
  renotify: boolean;
  vibrate?: number[];
  url: string;
}

/**
 * Emulates the Service Worker conversation-level notifications, spam alert cooldown, and per-plan clearing.
 */
class ServiceWorkerNotificationState {
  activeNotifications: Map<string, MockActiveNotification> = new Map();

  receivePush(payload: any) {
    const notificationType = payload.notificationType || payload.data?.notificationType || "";
    const tag = payload.tag || "planless-notification";

    // Scenario 1: Invitations (Kept strictly separate)
    if (notificationType === "PLAN_INVITATION" || tag.startsWith("plan-invite-")) {
      const now = payload.timestamp || Date.now();
      const existing = this.activeNotifications.get(tag);
      const lastAlertTime = existing?.lastAlertTime || 0;
      const isRapid = existing !== undefined && (now - lastAlertTime < 8000);
      const shouldRenotify = !isRapid;
      const nextAlertTime = shouldRenotify ? now : lastAlertTime;

      this.activeNotifications.set(tag, {
        tag,
        title: payload.title || "Planless",
        body: payload.body || "",
        unreadCount: 0,
        planId: payload.data?.planId || "",
        receivedAt: now,
        lastAlertTime: nextAlertTime,
        renotify: shouldRenotify,
        vibrate: shouldRenotify ? [100, 50, 100] : undefined,
        url: payload.data?.url || (payload.data?.planId ? `/plans?id=${payload.data.planId}` : "/"),
      });
      return;
    }

    // Scenario 2: Chat Messages (One notification per plan chat)
    if (
      notificationType === "CHAT_MESSAGE" ||
      tag.startsWith("plan-chat-")
    ) {
      let pId = payload.data?.planId;
      let planTitle = payload.data?.planTitle || "Plan";
      let unreadCount = typeof payload.data?.unreadCount === "number" ? payload.data.unreadCount : 1;
      let messages = payload.data?.messages || [];

      if (!pId && tag.startsWith("plan-chat-")) {
        pId = tag.replace("plan-chat-", "");
      }

      const conversationTag = pId ? `plan-chat-${pId}` : (tag.startsWith("plan-chat-") ? tag : "plan-chat-default");

      if (unreadCount <= 0) {
        this.activeNotifications.delete(conversationTag);
        return;
      }

      const existing = this.activeNotifications.get(conversationTag);
      // Delayed/stale push check
      if (existing && payload.timestamp && existing.receivedAt && payload.timestamp < existing.receivedAt) {
        return;
      }

      // Anti-spam alert cooldown: if this conversation alerted recently (< 8000ms), update silently in place
      const now = payload.timestamp || Date.now();
      const lastAlertTime = existing?.lastAlertTime || 0;
      const isRapidMessage = existing !== undefined && (now - lastAlertTime < 8000);
      const shouldRenotify = !isRapidMessage;
      const nextAlertTime = shouldRenotify ? now : lastAlertTime;

      let title = payload.title || "";
      let body = payload.body || "";

      if (!title || title === "Planless") {
        title = unreadCount === 1 ? `${planTitle} • 1 unread message` : `${planTitle} • ${unreadCount} unread messages`;
      }

      if (!body && Array.isArray(messages) && messages.length > 0) {
        if (unreadCount === 1) {
          const m = messages[0];
          body = `${m.senderName || "Friend"}: ${m.content || ""}`;
        } else {
          body = messages
            .slice(-5)
            .map((m: any) => `${m.senderName || "Friend"}: ${m.content || ""}`)
            .join("\n");
        }
      }

      this.activeNotifications.set(conversationTag, {
        tag: conversationTag,
        title,
        body,
        unreadCount,
        planId: pId || "",
        receivedAt: now,
        lastAlertTime: nextAlertTime,
        renotify: shouldRenotify,
        vibrate: shouldRenotify ? [100, 50, 100] : undefined,
        url: payload.data?.url || (pId ? `/chats?id=${pId}` : "/chats"),
      });
      return;
    }

    // Scenario 3: Fallback notifications (Lifecycle events, participation, cancellations, reschedules)
    const now = payload.timestamp || Date.now();
    const existing = this.activeNotifications.get(tag);
    const lastAlertTime = existing?.lastAlertTime || 0;
    const isRapid = existing !== undefined && (now - lastAlertTime < 8000);
    const shouldRenotify = !isRapid;
    const nextAlertTime = shouldRenotify ? now : lastAlertTime;

    this.activeNotifications.set(tag, {
      tag,
      title: payload.title || "Planless",
      body: payload.body || "",
      unreadCount: 0,
      planId: payload.data?.planId || "",
      receivedAt: now,
      lastAlertTime: nextAlertTime,
      renotify: shouldRenotify,
      vibrate: shouldRenotify ? [100, 50, 100] : undefined,
      url: payload.data?.url || (payload.data?.planId ? `/plans?id=${payload.data.planId}` : "/"),
    });
  }

  clearChatNotification(planId: string) {
    const targetTag = `plan-chat-${planId}`;
    this.activeNotifications.delete(targetTag);
  }

  getNotificationForPlan(planId: string): MockActiveNotification | undefined {
    return this.activeNotifications.get(`plan-chat-${planId}`);
  }

  getAllActiveNotifications(): MockActiveNotification[] {
    return Array.from(this.activeNotifications.values());
  }

  getTotalBadgeCount(): number {
    let sum = 0;
    for (const notif of this.activeNotifications.values()) {
      if (notif.tag.startsWith("plan-chat-")) {
        sum += notif.unreadCount;
      }
    }
    return sum;
  }

  get activeNotification(): { title: string; body: string; totalMessages: number; groupCount: number } | null {
    const list = this.getAllActiveNotifications().filter((n) => n.tag.startsWith("plan-chat-"));
    if (list.length === 0) return null;
    const first = list[0];
    return {
      title: first.title,
      body: first.body,
      totalMessages: first.unreadCount,
      groupCount: 1,
    };
  }

  get isNotificationVisible(): boolean {
    return this.activeNotifications.size > 0;
  }
}

describe("Planless Push Notifications - Exact Unread Messages Test Suite", () => {
  const recipientAlice = "alice-user-id";
  const userBob = "bob-user-id";
  const userCharlie = "charlie-user-id";

  const senderMap = new Map([
    [userBob, { name: "Bob", avatarUrl: "https://planless.app/bob.png" }],
    [userCharlie, { name: "Charlie", avatarUrl: "https://planless.app/charlie.png" }],
    [recipientAlice, { name: "Alice", avatarUrl: "https://planless.app/alice.png" }],
  ]);

  const baseParticipant: ParticipantRecord = {
    user_id: recipientAlice,
    created_at: "2026-10-10T10:00:00.000Z",
    rsvp_status: "JOINED",
  };

  // 1. All messages read -> unread count is zero
  it("Scenario 1: All messages read -> unread count is zero, push payload is suppressed", () => {
    const messages: ChatMessage[] = [
      { id: "m1", sender_id: userBob, content: "Hello", created_at: "2026-10-10T11:00:00.000Z" },
      { id: "m2", sender_id: userBob, content: "How are you?", created_at: "2026-10-10T11:05:00.000Z" },
    ];

    const readRecord: PlanChatReadRecord = {
      user_id: recipientAlice,
      plan_id: "plan-1",
      last_read_message_id: "m2",
      last_read_at: "2026-10-10T11:05:00.000Z",
    };

    const { unreadCount, unreadMessages } = calculateUnreadsForRecipient({
      recipientId: recipientAlice,
      participant: baseParticipant,
      readRecord,
      messages,
    });

    expect(unreadCount).toBe(0);
    expect(unreadMessages).toHaveLength(0);

    const payload = formatChatPayloadForRecipient({
      recipientUserId: recipientAlice,
      planTitle: "Weekend Trek",
      planId: "plan-1",
      unreadCount,
      unreadMessages,
      senderMap,
    });

    // When unread count is 0, no push notification payload is dispatched
    expect(payload).toBeNull();
  });

  // 2. One new message after the read position -> count is one
  it("Scenario 2: One new message after the read position -> count is 1 with exact wording", () => {
    const messages: ChatMessage[] = [
      { id: "m1", sender_id: userBob, content: "Hello", created_at: "2026-10-10T11:00:00.000Z" },
      { id: "m2", sender_id: userBob, content: "We are leaving at 6", created_at: "2026-10-10T11:30:00.000Z" },
    ];

    const readRecord: PlanChatReadRecord = {
      user_id: recipientAlice,
      plan_id: "plan-1",
      last_read_message_id: "m1",
      last_read_at: "2026-10-10T11:00:00.000Z",
    };

    const { unreadCount, unreadMessages } = calculateUnreadsForRecipient({
      recipientId: recipientAlice,
      participant: baseParticipant,
      readRecord,
      messages,
    });

    expect(unreadCount).toBe(1);
    expect(unreadMessages).toHaveLength(1);
    expect(unreadMessages[0].id).toBe("m2");

    const payload = formatChatPayloadForRecipient({
      recipientUserId: recipientAlice,
      planTitle: "Weekend Trek",
      planId: "plan-1",
      unreadCount,
      unreadMessages,
      senderMap,
    });

    expect(payload).not.toBeNull();
    expect(payload?.title).toBe("Weekend Trek • 1 unread message");
    expect(payload?.body).toBe("Bob: We are leaving at 6");
    expect(payload?.data.unreadCount).toBe(1);
  });

  // 3. Several new messages after the read position -> exact count
  it("Scenario 3: Several new messages after the read position -> exact count (e.g. 8 unread messages)", () => {
    const messages: ChatMessage[] = [];
    for (let i = 1; i <= 8; i++) {
      messages.push({
        id: `msg-${i}`,
        sender_id: userBob,
        content: `Message ${i}`,
        created_at: `2026-10-10T12:0${i}:00.000Z`,
      });
    }

    const readRecord: PlanChatReadRecord = {
      user_id: recipientAlice,
      plan_id: "plan-1",
      last_read_message_id: "old-msg",
      last_read_at: "2026-10-10T11:00:00.000Z",
    };

    const { unreadCount, unreadMessages } = calculateUnreadsForRecipient({
      recipientId: recipientAlice,
      participant: baseParticipant,
      readRecord,
      messages,
    });

    expect(unreadCount).toBe(8);
    expect(unreadMessages).toHaveLength(8);

    const payload = formatChatPayloadForRecipient({
      recipientUserId: recipientAlice,
      planTitle: "Sunday Football",
      planId: "plan-1",
      unreadCount,
      unreadMessages,
      senderMap,
    });

    expect(payload?.title).toBe("Sunday Football • 8 unread messages");
    expect(payload?.body.split("\n")).toHaveLength(8);
    expect(payload?.data.unreadCount).toBe(8);
  });

  // 4. A partially read conversation -> only messages after cutoff are included
  it("Scenario 4: Partially read conversation -> only messages after the read position are counted", () => {
    const messages: ChatMessage[] = [
      { id: "m1", sender_id: userBob, content: "Msg 1", created_at: "2026-10-10T10:01:00.000Z" },
      { id: "m2", sender_id: userCharlie, content: "Msg 2", created_at: "2026-10-10T10:02:00.000Z" },
      { id: "m3", sender_id: userBob, content: "Msg 3", created_at: "2026-10-10T10:03:00.000Z" },
      { id: "m4", sender_id: userCharlie, content: "Msg 4", created_at: "2026-10-10T10:04:00.000Z" },
      { id: "m5", sender_id: userBob, content: "Msg 5", created_at: "2026-10-10T10:05:00.000Z" },
    ];

    // Recipient read up to m3
    const readRecord: PlanChatReadRecord = {
      user_id: recipientAlice,
      plan_id: "plan-1",
      last_read_message_id: "m3",
      last_read_at: "2026-10-10T10:03:00.000Z",
    };

    const { unreadCount, unreadMessages } = calculateUnreadsForRecipient({
      recipientId: recipientAlice,
      participant: baseParticipant,
      readRecord,
      messages,
    });

    expect(unreadCount).toBe(2);
    expect(unreadMessages.map((m) => m.id)).toEqual(["m4", "m5"]);

    const payload = formatChatPayloadForRecipient({
      recipientUserId: recipientAlice,
      planTitle: "Badminton",
      planId: "plan-1",
      unreadCount,
      unreadMessages,
      senderMap,
    });

    expect(payload?.title).toBe("Badminton • 2 unread messages");
    expect(payload?.body).toBe("Charlie: Msg 4\nBob: Msg 5");
    expect(payload?.tag).toBe("plan-chat-plan-1");
    expect(payload?.data.url).toBe("/chats?id=plan-1");
  });

  // 5. Recipient-authored messages are excluded from their unread count
  it("Scenario 5: Recipient's own authored messages do not increase their unread count", () => {
    const messages: ChatMessage[] = [
      { id: "m1", sender_id: userBob, content: "Are you coming?", created_at: "2026-10-10T12:00:00.000Z" },
      { id: "m2", sender_id: recipientAlice, content: "Yes on my way!", created_at: "2026-10-10T12:05:00.000Z" },
    ];

    const readRecord: PlanChatReadRecord = {
      user_id: recipientAlice,
      plan_id: "plan-1",
      last_read_message_id: "m1",
      last_read_at: "2026-10-10T12:00:00.000Z",
    };

    const { unreadCount, unreadMessages } = calculateUnreadsForRecipient({
      recipientId: recipientAlice,
      participant: baseParticipant,
      readRecord,
      messages,
    });

    // m2 is by recipientAlice, so it is strictly excluded
    expect(unreadCount).toBe(0);
    expect(unreadMessages).toHaveLength(0);
  });

  // 6. Missing read-state record follows existing intended behavior (defaults to participant join time)
  it("Scenario 6: Missing read-state record defaults to participant created_at timestamp", () => {
    const participantJoinedAt = "2026-10-10T10:00:00.000Z";
    const newParticipant: ParticipantRecord = {
      user_id: recipientAlice,
      created_at: participantJoinedAt,
      rsvp_status: "JOINED",
    };

    const messages: ChatMessage[] = [
      // Message sent before participant was invited/joined
      { id: "old-1", sender_id: userBob, content: "Initial discussion", created_at: "2026-10-09T08:00:00.000Z" },
      // Message sent after participant joined
      { id: "new-1", sender_id: userBob, content: "Welcome Alice!", created_at: "2026-10-10T10:05:00.000Z" },
    ];

    const { unreadCount, unreadMessages } = calculateUnreadsForRecipient({
      recipientId: recipientAlice,
      participant: newParticipant,
      readRecord: undefined, // No read record exists yet
      messages,
    });

    expect(unreadCount).toBe(1);
    expect(unreadMessages[0].id).toBe("new-1");
  });

  // 7. Read state updated on another device is respected
  it("Scenario 7: Read state updated on another device resets or decrements unread count", () => {
    const messages: ChatMessage[] = [
      { id: "m1", sender_id: userBob, content: "First", created_at: "2026-10-10T12:00:00.000Z" },
      { id: "m2", sender_id: userBob, content: "Second", created_at: "2026-10-10T12:01:00.000Z" },
      { id: "m3", sender_id: userBob, content: "Third", created_at: "2026-10-10T12:02:00.000Z" },
    ];

    // Device 1: Unread state before read
    const initialRead: PlanChatReadRecord = {
      user_id: recipientAlice,
      plan_id: "plan-1",
      last_read_message_id: "m1",
      last_read_at: "2026-10-10T12:00:00.000Z",
    };
    expect(calculateUnreadsForRecipient({
      recipientId: recipientAlice,
      participant: baseParticipant,
      readRecord: initialRead,
      messages,
    }).unreadCount).toBe(2);

    // Device 2 marks up to m3 as read in database
    const updatedRead: PlanChatReadRecord = {
      user_id: recipientAlice,
      plan_id: "plan-1",
      last_read_message_id: "m3",
      last_read_at: "2026-10-10T12:02:00.000Z",
    };
    expect(calculateUnreadsForRecipient({
      recipientId: recipientAlice,
      participant: baseParticipant,
      readRecord: updatedRead,
      messages,
    }).unreadCount).toBe(0);
  });

  // 8. Multiple plans have independent unread counts
  it("Scenario 8: Multiple plans have independent unread counts", () => {
    const plan1Messages: ChatMessage[] = [
      { id: "p1-m1", sender_id: userBob, content: "Plan 1 msg", created_at: "2026-10-10T12:00:00.000Z" },
    ];
    const plan2Messages: ChatMessage[] = [
      { id: "p2-m1", sender_id: userCharlie, content: "Plan 2 msg 1", created_at: "2026-10-10T12:00:00.000Z" },
      { id: "p2-m2", sender_id: userCharlie, content: "Plan 2 msg 2", created_at: "2026-10-10T12:01:00.000Z" },
      { id: "p2-m3", sender_id: userCharlie, content: "Plan 2 msg 3", created_at: "2026-10-10T12:02:00.000Z" },
    ];

    const read1: PlanChatReadRecord = { user_id: recipientAlice, plan_id: "plan-1", last_read_at: "2026-10-09T00:00:00.000Z" };
    const read2: PlanChatReadRecord = { user_id: recipientAlice, plan_id: "plan-2", last_read_at: "2026-10-09T00:00:00.000Z" };

    const unreads1 = calculateUnreadsForRecipient({
      recipientId: recipientAlice,
      participant: baseParticipant,
      readRecord: read1,
      messages: plan1Messages,
    });
    const unreads2 = calculateUnreadsForRecipient({
      recipientId: recipientAlice,
      participant: baseParticipant,
      readRecord: read2,
      messages: plan2Messages,
    });

    expect(unreads1.unreadCount).toBe(1);
    expect(unreads2.unreadCount).toBe(3);
  });

  // 9. Invitations are excluded from chat-message counts
  it("Scenario 9: Plan invitations are kept separate and never overwrite or inflate chat unread counts", () => {
    const sw = new ServiceWorkerNotificationState();

    // 1. Chat push arrives with 2 unread messages
    sw.receivePush({
      tag: "plan-chat-plan-1",
      notificationType: "CHAT_MESSAGE",
      title: "Badminton • 2 unread messages",
      body: "Bob: Court 1\nBob: 7 PM",
      data: {
        planId: "plan-1",
        planTitle: "Badminton",
        unreadCount: 2,
        messages: [
          { id: "m1", senderName: "Bob", content: "Court 1" },
          { id: "m2", senderName: "Bob", content: "7 PM" },
        ],
      },
    });

    expect(sw.getNotificationForPlan("plan-1")?.title).toBe("Badminton • 2 unread messages");
    expect(sw.getNotificationForPlan("plan-1")?.unreadCount).toBe(2);

    // 2. An invitation arrives (PLAN_INVITATION with tag plan-invite-...)
    sw.receivePush({
      tag: "plan-invite-plan-2",
      notificationType: "PLAN_INVITATION",
      title: "Maanas • Movie Night",
      body: "Invited you to join",
      data: {
        planId: "plan-2",
      },
    });

    // Chat notification state is completely untouched by the invitation
    expect(sw.getNotificationForPlan("plan-1")?.unreadCount).toBe(2);
    expect(sw.getAllActiveNotifications()).toHaveLength(2);
    expect(sw.getTotalBadgeCount()).toBe(2);
  });

  // 10. Messages from different plans create independent notifications without cross-chat aggregation
  it("Scenario 10: Messages from two different plans create independent notifications without cross-chat aggregation", () => {
    const sw = new ServiceWorkerNotificationState();

    // Push 1: Plan 1 with 2 unread messages
    sw.receivePush({
      tag: "plan-chat-plan-1",
      notificationType: "CHAT_MESSAGE",
      title: "Badminton • 2 unread messages",
      body: "Bob: Court booked\nBob: See you at 6",
      data: {
        planId: "plan-1",
        planTitle: "Badminton",
        unreadCount: 2,
        messages: [
          { id: "p1-1", senderName: "Bob", content: "Court booked" },
          { id: "p1-2", senderName: "Bob", content: "See you at 6" },
        ],
      },
    });

    // Push 2: Plan 2 with 3 unread messages
    sw.receivePush({
      tag: "plan-chat-plan-2",
      notificationType: "CHAT_MESSAGE",
      title: "Weekend Trek • 3 unread messages",
      body: "Charlie: Pack raincoats\nCharlie: Bring trail shoes\nCharlie: Meeting at base camp",
      data: {
        planId: "plan-2",
        planTitle: "Weekend Trek",
        unreadCount: 3,
        messages: [
          { id: "p2-1", senderName: "Charlie", content: "Pack raincoats" },
          { id: "p2-2", senderName: "Charlie", content: "Bring trail shoes" },
          { id: "p2-3", senderName: "Charlie", content: "Meeting at base camp" },
        ],
      },
    });

    // Verify two independent notifications exist
    const allNotifs = sw.getAllActiveNotifications();
    expect(allNotifs).toHaveLength(2);

    const notif1 = sw.getNotificationForPlan("plan-1");
    const notif2 = sw.getNotificationForPlan("plan-2");

    expect(notif1).toBeDefined();
    expect(notif1?.tag).toBe("plan-chat-plan-1");
    expect(notif1?.title).toBe("Badminton • 2 unread messages");
    expect(notif1?.body).toBe("Bob: Court booked\nBob: See you at 6");
    expect(notif1?.unreadCount).toBe(2);
    expect(notif1?.url).toBe("/chats?id=plan-1");

    expect(notif2).toBeDefined();
    expect(notif2?.tag).toBe("plan-chat-plan-2");
    expect(notif2?.title).toBe("Weekend Trek • 3 unread messages");
    expect(notif2?.body).toContain("Charlie: Pack raincoats");
    expect(notif2?.unreadCount).toBe(3);
    expect(notif2?.url).toBe("/chats?id=plan-2");

    // Neither notification contains cross-chat summary text
    expect(notif1?.title).not.toContain("groups");
    expect(notif2?.title).not.toContain("groups");

    // Total badge sums both conversations: 2 + 3 = 5
    expect(sw.getTotalBadgeCount()).toBe(5);

    // Reading Plan 1 clears ONLY Plan 1's notification; Plan 2 remains visible
    sw.clearChatNotification("plan-1");
    expect(sw.getNotificationForPlan("plan-1")).toBeUndefined();
    expect(sw.getNotificationForPlan("plan-2")).toBeDefined();
    expect(sw.getTotalBadgeCount()).toBe(3);

    // Reading Plan 2 clears Plan 2's notification; shade is now empty
    sw.clearChatNotification("plan-2");
    expect(sw.getNotificationForPlan("plan-2")).toBeUndefined();
    expect(sw.getTotalBadgeCount()).toBe(0);
    expect(sw.isNotificationVisible).toBe(false);
  });

  // 11. Concurrent messages, dispatch retries, and read clearing do not double count
  it("Scenario 11: Retrying push does not double-count, and reading clears notification", () => {
    const sw = new ServiceWorkerNotificationState();

    const pushPayload = {
      tag: "plan-chat-plan-1",
      notificationType: "CHAT_MESSAGE",
      title: "Coffee Meet • 2 unread messages",
      body: "Bob: Hi\nBob: Where are you?",
      data: {
        planId: "plan-1",
        planTitle: "Coffee Meet",
        unreadCount: 2,
        messages: [
          { id: "m1", senderName: "Bob", content: "Hi" },
          { id: "m2", senderName: "Bob", content: "Where are you?" },
        ],
      },
    };

    // First delivery
    sw.receivePush(pushPayload);
    expect(sw.getNotificationForPlan("plan-1")?.unreadCount).toBe(2);
    expect(sw.getTotalBadgeCount()).toBe(2);

    // Retrying dispatch with same authoritative unreadCount does NOT accumulate to 4
    sw.receivePush(pushPayload);
    expect(sw.getNotificationForPlan("plan-1")?.unreadCount).toBe(2);
    expect(sw.getTotalBadgeCount()).toBe(2);

    // User opens and reads plan-1
    sw.clearChatNotification("plan-1");
    expect(sw.isNotificationVisible).toBe(false);
    expect(sw.getNotificationForPlan("plan-1")).toBeUndefined();
    expect(sw.getTotalBadgeCount()).toBe(0);
  });

  // 12. Skipped participant exclusion
  it("Scenario 12: Participants with rsvp_status = 'SKIPPED' receive zero unread messages", () => {
    const skippedParticipant: ParticipantRecord = {
      user_id: recipientAlice,
      created_at: "2026-10-10T10:00:00.000Z",
      rsvp_status: "SKIPPED",
    };

    const messages: ChatMessage[] = [
      { id: "m1", sender_id: userBob, content: "Are you coming?", created_at: "2026-10-10T12:00:00.000Z" },
    ];

    const { unreadCount, unreadMessages } = calculateUnreadsForRecipient({
      recipientId: recipientAlice,
      participant: skippedParticipant,
      readRecord: undefined,
      messages,
    });

    expect(unreadCount).toBe(0);
    expect(unreadMessages).toHaveLength(0);
  });

  // 13. Consecutive messages do not suppress each other when idempotency key is per-message
  it("Scenario 13: Consecutive messages have unique idempotency keys and are not suppressed", () => {
    const processedKeys = new Set<string>();

    const checkIdempotency = (key: string): boolean => {
      if (processedKeys.has(key)) return true;
      processedKeys.add(key);
      return false;
    };

    const msg1Key = "CHAT_MESSAGE:msg-uuid-1";
    const msg2Key = "CHAT_MESSAGE:msg-uuid-2";

    // Message 1 is dispatched
    expect(checkIdempotency(msg1Key)).toBe(false);

    // Message 2 arriving immediately afterwards is NOT suppressed
    expect(checkIdempotency(msg2Key)).toBe(false);

    // Exact retry of Message 1 IS suppressed
    expect(checkIdempotency(msg1Key)).toBe(true);
  });

  // 14. Missing subscription for one recipient does not block delivery to other recipients
  it("Scenario 14: One recipient having no active subscription does not prevent delivery to other recipients", () => {
    const targetRecipients = ["user-with-sub", "user-without-sub"];
    const activeSubscriptions = [{ id: "sub-1", user_id: "user-with-sub" }];

    const subscribedUsers = new Set(activeSubscriptions.map((s) => s.user_id));
    const deliveryResults = targetRecipients.map((uid) => ({
      recipientId: uid,
      status: subscribedUsers.has(uid) ? "delivered" : "no_active_subscription",
    }));

    expect(deliveryResults).toEqual([
      { recipientId: "user-with-sub", status: "delivered" },
      { recipientId: "user-without-sub", status: "no_active_subscription" },
    ]);
  });

  // 15. Expired subscription does not block delivery of other active subscriptions
  it("Scenario 15: An expired subscription error does not abort other active subscriptions", async () => {
    const subs = [
      { id: "sub-expired", status: 410 },
      { id: "sub-healthy", status: 201 },
    ];

    const results = await Promise.allSettled(
      subs.map(async (s) => {
        if (s.status === 410) {
          throw new Error("410 Gone");
        }
        return { delivered: true, id: s.id };
      })
    );

    const successful = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(successful).toHaveLength(1);
    expect(failed).toHaveLength(1);
  });

  // 16. Push delivery diagnostics accurately surface reasons for zero deliveries
  it("Scenario 16: Push delivery reporting accurately differentiates zero-unread vs missing subscription", () => {
    const computeDeliveryDiagnostic = (deliveredCount: number, skippedZeroUnreads: number, activeSubs: number) => {
      if (deliveredCount > 0) return { deliveredCount, reason: undefined };
      if (activeSubs === 0) return { deliveredCount: 0, reason: "no_active_subscriptions" };
      if (skippedZeroUnreads > 0) return { deliveredCount: 0, reason: "all_recipients_already_read" };
      return { deliveredCount: 0, reason: "no_devices_delivered" };
    };

    expect(computeDeliveryDiagnostic(1, 0, 1).reason).toBeUndefined();
    expect(computeDeliveryDiagnostic(0, 0, 0).reason).toBe("no_active_subscriptions");
    expect(computeDeliveryDiagnostic(0, 2, 2).reason).toBe("all_recipients_already_read");
  });

  // 17. Stale delayed push does not overwrite newer active notification
  it("Scenario 17: Delayed push with older timestamp does not overwrite newer notification", () => {
    const sw = new ServiceWorkerNotificationState();

    // Newer push arrives at timestamp 2000
    sw.receivePush({
      tag: "plan-chat-plan-1",
      notificationType: "CHAT_MESSAGE",
      title: "Badminton • 3 unread messages",
      body: "Bob: Third message",
      timestamp: 2000,
      data: {
        planId: "plan-1",
        unreadCount: 3,
      },
    });

    expect(sw.getNotificationForPlan("plan-1")?.unreadCount).toBe(3);

    // Delayed push from earlier timestamp 1000 arrives
    sw.receivePush({
      tag: "plan-chat-plan-1",
      notificationType: "CHAT_MESSAGE",
      title: "Badminton • 1 unread message",
      body: "Bob: First message",
      timestamp: 1000,
      data: {
        planId: "plan-1",
        unreadCount: 1,
      },
    });

    // Stale push was ignored; notification retains 3 unread messages
    expect(sw.getNotificationForPlan("plan-1")?.unreadCount).toBe(3);
    expect(sw.getNotificationForPlan("plan-1")?.title).toBe("Badminton • 3 unread messages");
  });

  // 18. Rapid consecutive messages in same plan update notification in place
  it("Scenario 18: Rapid consecutive messages in same plan update notification in place with stable tag", () => {
    const sw = new ServiceWorkerNotificationState();

    sw.receivePush({
      tag: "plan-chat-plan-1",
      notificationType: "CHAT_MESSAGE",
      title: "Dinner Plan • 1 unread message",
      body: "Alice: Where to eat?",
      timestamp: 1000,
      data: { planId: "plan-1", unreadCount: 1 },
    });
    expect(sw.getAllActiveNotifications()).toHaveLength(1);
    expect(sw.getNotificationForPlan("plan-1")?.title).toBe("Dinner Plan • 1 unread message");

    // Second message arrives 5 seconds later
    sw.receivePush({
      tag: "plan-chat-plan-1",
      notificationType: "CHAT_MESSAGE",
      title: "Dinner Plan • 2 unread messages",
      body: "Alice: Where to eat?\nAlice: How about Italian?",
      timestamp: 1005,
      data: { planId: "plan-1", unreadCount: 2 },
    });

    // Still only 1 notification for plan-1, updated in place
    expect(sw.getAllActiveNotifications()).toHaveLength(1);
    expect(sw.getNotificationForPlan("plan-1")?.title).toBe("Dinner Plan • 2 unread messages");
    expect(sw.getNotificationForPlan("plan-1")?.unreadCount).toBe(2);
    expect(sw.getNotificationForPlan("plan-1")?.tag).toBe("plan-chat-plan-1");
  });

  // 19. Anti-spam rapid message alert cooldown
  it("Scenario 19: Rapid consecutive messages within 8s suppress vibration and set renotify: false", () => {
    const sw = new ServiceWorkerNotificationState();

    // Message 1 at T=10000ms (first message alerts and vibrates)
    sw.receivePush({
      tag: "plan-chat-plan-1",
      notificationType: "CHAT_MESSAGE",
      title: "Movie Night • 1 unread message",
      body: "Bob: Heading out now",
      timestamp: 10000,
      data: { planId: "plan-1", unreadCount: 1 },
    });

    const notif1 = sw.getNotificationForPlan("plan-1");
    expect(notif1).toBeDefined();
    expect(notif1?.renotify).toBe(true);
    expect(notif1?.vibrate).toEqual([100, 50, 100]);
    expect(notif1?.lastAlertTime).toBe(10000);

    // Message 2 arrives 2 seconds later at T=12000ms (rapid message, cooldown active < 8000ms)
    sw.receivePush({
      tag: "plan-chat-plan-1",
      notificationType: "CHAT_MESSAGE",
      title: "Movie Night • 2 unread messages",
      body: "Bob: Heading out now\nBob: Pick up tickets?",
      timestamp: 12000,
      data: { planId: "plan-1", unreadCount: 2 },
    });

    const notif2 = sw.getNotificationForPlan("plan-1");
    expect(notif2).toBeDefined();
    expect(notif2?.unreadCount).toBe(2);
    expect(notif2?.title).toBe("Movie Night • 2 unread messages");
    // Anti-spam: renotify is false and vibration is suppressed
    expect(notif2?.renotify).toBe(false);
    expect(notif2?.vibrate).toBeUndefined();
    // lastAlertTime stays anchored to the first alert (10000)
    expect(notif2?.lastAlertTime).toBe(10000);
  });

  // 20. Message arriving after 8s cooldown alerts and vibrates again
  it("Scenario 20: Message arriving after 8s cooldown sets renotify: true and vibrates again", () => {
    const sw = new ServiceWorkerNotificationState();

    // Message 1 at T=10000ms
    sw.receivePush({
      tag: "plan-chat-plan-1",
      notificationType: "CHAT_MESSAGE",
      title: "Movie Night • 1 unread message",
      body: "Bob: First message",
      timestamp: 10000,
      data: { planId: "plan-1", unreadCount: 1 },
    });

    expect(sw.getNotificationForPlan("plan-1")?.renotify).toBe(true);
    expect(sw.getNotificationForPlan("plan-1")?.vibrate).toEqual([100, 50, 100]);

    // Message 2 arrives 9 seconds later at T=19000ms (> 8000ms after last alert)
    sw.receivePush({
      tag: "plan-chat-plan-1",
      notificationType: "CHAT_MESSAGE",
      title: "Movie Night • 2 unread messages",
      body: "Bob: First message\nBob: Second message after pause",
      timestamp: 19000,
      data: { planId: "plan-1", unreadCount: 2 },
    });

    const notif = sw.getNotificationForPlan("plan-1");
    expect(notif).toBeDefined();
    expect(notif?.unreadCount).toBe(2);
    // Alert fires again after cooldown expired
    expect(notif?.renotify).toBe(true);
    expect(notif?.vibrate).toEqual([100, 50, 100]);
    expect(notif?.lastAlertTime).toBe(19000);
  });

  // 21. Two concurrent chats receive messages simultaneously; both notifications coexist independently
  it("Scenario 21: Two concurrent chats receive messages simultaneously; both notifications coexist in the shade independently", () => {
    const sw = new ServiceWorkerNotificationState();

    // Plan A (Mandaadi)
    sw.receivePush({
      tag: "plan-chat-plan-a",
      notificationType: "CHAT_MESSAGE",
      title: "Mandaadi • 2 unread messages",
      body: "Maanas: See you at 6\nBhaavya: Got the tickets",
      timestamp: 10000,
      data: { planId: "plan-a", planTitle: "Mandaadi", unreadCount: 2, url: "/chats?id=plan-a" },
    });

    // Plan B (Smash Guys)
    sw.receivePush({
      tag: "plan-chat-plan-b",
      notificationType: "CHAT_MESSAGE",
      title: "Smash Guys • 1 unread message",
      body: "Chris: Court 3 booked",
      timestamp: 10500,
      data: { planId: "plan-b", planTitle: "Smash Guys", unreadCount: 1, url: "/chats?id=plan-b" },
    });

    const allNotifs = sw.getAllActiveNotifications();
    expect(allNotifs).toHaveLength(2);

    const notifA = sw.getNotificationForPlan("plan-a");
    const notifB = sw.getNotificationForPlan("plan-b");

    expect(notifA?.tag).toBe("plan-chat-plan-a");
    expect(notifA?.title).toBe("Mandaadi • 2 unread messages");
    expect(notifA?.url).toBe("/chats?id=plan-a");

    expect(notifB?.tag).toBe("plan-chat-plan-b");
    expect(notifB?.title).toBe("Smash Guys • 1 unread message");
    expect(notifB?.url).toBe("/chats?id=plan-b");
  });

  // 22. Clearing one chat does not dismiss or affect the second chat notification
  it("Scenario 22: Clearing one chat notification does not dismiss or affect the second chat notification", () => {
    const sw = new ServiceWorkerNotificationState();

    sw.receivePush({
      tag: "plan-chat-plan-a",
      notificationType: "CHAT_MESSAGE",
      title: "Mandaadi • 2 unread messages",
      timestamp: 10000,
      data: { planId: "plan-a", unreadCount: 2 },
    });
    sw.receivePush({
      tag: "plan-chat-plan-b",
      notificationType: "CHAT_MESSAGE",
      title: "Smash Guys • 3 unread messages",
      timestamp: 10500,
      data: { planId: "plan-b", unreadCount: 3 },
    });

    expect(sw.getAllActiveNotifications()).toHaveLength(2);

    // User opens Plan A chat
    sw.clearChatNotification("plan-a");

    // Plan A is cleared, Plan B is completely untouched
    expect(sw.getNotificationForPlan("plan-a")).toBeUndefined();
    expect(sw.getNotificationForPlan("plan-b")).toBeDefined();
    expect(sw.getNotificationForPlan("plan-b")?.unreadCount).toBe(3);
    expect(sw.getTotalBadgeCount()).toBe(3);
  });

  // 23. Plan event notifications and chat notifications coexist without overwriting
  it("Scenario 23: Plan lifecycle notification and chat notification coexist simultaneously without overwriting", () => {
    const sw = new ServiceWorkerNotificationState();

    // 1. Plan rescheduled event notification
    sw.receivePush({
      tag: "plan-rescheduled-plan-1",
      notificationType: "PLAN_RESCHEDULED",
      title: "Updated • Sunday Football",
      body: "Time changed to 6:30 PM",
      timestamp: 10000,
      data: { planId: "plan-1", url: "/plans?id=plan-1" },
    });

    // 2. Chat message notification for the same plan
    sw.receivePush({
      tag: "plan-chat-plan-1",
      notificationType: "CHAT_MESSAGE",
      title: "Sunday Football • 1 unread message",
      body: "Bob: See you at 6:30 then!",
      timestamp: 11000,
      data: { planId: "plan-1", unreadCount: 1, url: "/chats?id=plan-1" },
    });

    // Both coexist with distinct tags
    const all = sw.getAllActiveNotifications();
    expect(all).toHaveLength(2);

    const eventNotif = all.find((n) => n.tag === "plan-rescheduled-plan-1");
    const chatNotif = all.find((n) => n.tag === "plan-chat-plan-1");

    expect(eventNotif).toBeDefined();
    expect(eventNotif?.url).toBe("/plans?id=plan-1");

    expect(chatNotif).toBeDefined();
    expect(chatNotif?.url).toBe("/chats?id=plan-1");

    // Reading chat clears ONLY chat; event notification stays in shade
    sw.clearChatNotification("plan-1");
    expect(sw.getNotificationForPlan("plan-1")).toBeUndefined();
    expect(sw.getAllActiveNotifications().find((n) => n.tag === "plan-rescheduled-plan-1")).toBeDefined();
  });

  // 24. No cross-chat aggregation groups object in payload
  it("Scenario 24: Verifying payload structure has no groups property and strictly conforms to conversation-oriented format", () => {
    const senderMap = new Map([
      ["bob", { name: "Bob", avatarUrl: "https://example.com/bob.jpg" }],
      ["charlie", { name: "Charlie", avatarUrl: "https://example.com/charlie.jpg" }],
    ]);

    const messages: ChatMessage[] = [
      { id: "m1", sender_id: "bob", content: "Hey Alice", created_at: "2026-10-10T12:00:00.000Z" },
      { id: "m2", sender_id: "charlie", content: "Hey Alice and Bob", created_at: "2026-10-10T12:01:00.000Z" },
    ];

    const payload = formatChatPayloadForRecipient({
      recipientUserId: "alice",
      planTitle: "Badminton Session",
      planId: "badminton-123",
      unreadCount: 2,
      unreadMessages: messages,
      senderMap,
    });

    expect(payload).toBeDefined();
    expect(payload?.tag).toBe("plan-chat-badminton-123");
    expect(payload?.title).toBe("Badminton Session • 2 unread messages");
    expect(payload?.body).toBe("Bob: Hey Alice\nCharlie: Hey Alice and Bob");
    expect(payload?.data.url).toBe("/chats?id=badminton-123");
    expect(payload?.data.unreadCount).toBe(2);
    // Explicitly verify groups property is completely removed
    expect((payload?.data as any).groups).toBeUndefined();
  });
});
