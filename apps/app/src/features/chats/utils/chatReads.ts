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
 * Formats time in 24-hour format: "HH:mm" (e.g. "16:26", "11:22"). Never shows AM/PM.
 */
export function format24HourTime(dateInput?: Date | string | number | null): string {
  if (!dateInput) return "";
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return "";

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Formats a timestamp into standardized relative date string:
 * - Today → "16:26" (time only in 24-hour format)
 * - Yesterday → "Yesterday"
 * - Older than yesterday → "DD/MM/YY"
 */
export function formatRelativeDate(dateInput?: Date | string | number | null): string {
  if (!dateInput) return "";
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return format24HourTime(date);
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

  // Older than yesterday: DD/MM/YY
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

/**
 * Formats a message ISO timestamp into a compact chat list time string:
 * - "16:26" (24-hour) if today
 * - "Yesterday" if yesterday
 * - "DD/MM/YY" if older than yesterday
 */
export function formatChatListTimestamp(dateString?: string | null): string {
  return formatRelativeDate(dateString);
}

