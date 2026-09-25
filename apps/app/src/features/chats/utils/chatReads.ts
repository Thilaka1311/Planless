import { supabase } from "../../../../lib/supabaseClient";
import { markPlanChatReadInCache } from "../hooks/useChatCache";

/**
 * Marks a plan's chat messages as read for the currently authenticated user.
 * Upserts the read position in public.plan_chat_reads up to the given message (or latest message in the plan).
 */
export async function markPlanChatAsRead(
  planUuid: string,
  messageId?: string | null,
  userId?: string | null
): Promise<void> {
  if (!planUuid) return;

  try {
    // 1. Immediately update in-memory cache so subsequent reads within or outside screen are instant
    markPlanChatReadInCache(planUuid, messageId);

    // 2. Immediately emit local event so UI components (e.g. ChatsScreen) clear badges without network lag
    emitChatReadEvent(planUuid);

    // 3. Call Supabase RPC to persist in database
    const { error } = await supabase.rpc("mark_plan_chat_read", {
      p_plan_id: planUuid,
      p_message_id: messageId || undefined,
      p_user_id: userId || undefined,
    } as any);

    if (error) {
      console.warn("[chatReads] Error calling mark_plan_chat_read:", error);
    }
  } catch (err) {
    console.warn("[chatReads] Exception in markPlanChatAsRead:", err);
  }
}

const readListeners = new Set<(planId: string) => void>();
const CHAT_READ_EVENT = "planless:chat_read";

export function emitChatReadEvent(planId: string): void {
  readListeners.forEach((cb) => {
    try {
      cb(planId);
    } catch (err) {
      console.warn("[chatReads] Error in read listener:", err);
    }
  });

  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      window.dispatchEvent(
        new CustomEvent(CHAT_READ_EVENT, {
          detail: { planId },
        })
      );
    } catch (err) {
      // Ignored if CustomEvent is not supported in environment
    }
  }
}

export function subscribeToChatReadEvents(callback: (planId: string) => void): () => void {
  readListeners.add(callback);
  return () => {
    readListeners.delete(callback);
  };
}

/**
 * Formats a message ISO timestamp into a WhatsApp-style compact chat list time string:
 * - "10:45 AM" if today
 * - "Yesterday" if yesterday
 * - "Wed" if within the last 6 days
 * - "Sep 15" if older
 */
export function formatChatListTimestamp(dateString?: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return "Yesterday";
  }

  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 7 && diffDays > 0) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
