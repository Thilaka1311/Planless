import { User } from "../../../core/types";

export const cleanPlanId = (id: string): string =>
  id.replace("-loop-prev-dup", "").replace("-loop-next-dup", "");

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (val: any): boolean =>
  typeof val === "string" && uuidRegex.test(val);

export function resolveUserUuid(uId: string, dbUsers: User[]): string {
  const userObj = dbUsers.find(u => u.user_id === uId || u.id === uId);
  return userObj ? (userObj.id || uId) : uId;
}

export function parsePlanDateTime(plan: any): Date {
  const now = new Date();
  const rawScheduled = plan?.scheduled_at || plan?.datetime;
  if (rawScheduled && String(rawScheduled).includes("T") && String(rawScheduled).includes("-")) {
    const d = new Date(rawScheduled);
    if (!isNaN(d.getTime())) return d;
  }

  const dateStr = (plan?.date || "").trim().toUpperCase();
  const timeStr = (plan?.time || "").trim().toUpperCase().replace(/⏰/g, "");

  let targetDate = new Date();
  if (dateStr === "TOMORROW") {
    targetDate.setDate(now.getDate() + 1);
  } else if (dateStr !== "TODAY" && dateStr !== "") {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed;
    }
  }

  if (timeStr) {
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3];
      if (ampm === "PM" && hours < 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;
      targetDate.setHours(hours, minutes, 0, 0);
      return targetDate;
    }
  }

  if (plan?.createdAt) {
    const d = new Date(plan.createdAt);
    if (!isNaN(d.getTime())) return d;
  }

  return targetDate;
}
