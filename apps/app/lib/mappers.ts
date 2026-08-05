/**
 * mappers.ts — Convert raw DB rows into the UI Plan/Circle/Transaction models.
 */

import {
  Plan, Circle, Transaction, User, NotificationItem,
  DbCircle, DbCircleMember, DbPlan, DbPlanParticipant, DbTransaction
} from "../src/core/types";
import { normalizeStatus } from "./participantStatus";
import { getPlanCover } from "../src/features/plans/config/planCoverImages";
import defaultAvatar from "../src/assets/default_avatar.png";

// ── avatar helper ───────────────────────────────────────────────────────────

export function getInitialsAvatar(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  const initials = parts.map(p => p[0]).slice(0, 2).join("").toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash % 360);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <defs>
      <linearGradient id="g_${initials}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="hsl(${hue},40%,35%)"/>
        <stop offset="100%" stop-color="hsl(${(hue + 45) % 360},45%,22%)"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#g_${initials})"/>
    <text x="50%" y="54%" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-weight="700"
      font-size="34" fill="#f4f4f5" text-anchor="middle" dominant-baseline="middle" letter-spacing="-0.03em">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Helper to legacy mapped structural structures used by components (to run without major path rewrites)
export const mapPlansToLegacyPlans = (
  plansList: DbPlan[],
  participants: DbPlanParticipant[],
  usersList: User[],
  activeUserId: string = "",
  circlesList: DbCircle[] = []
): Plan[] => {
  const activeUserObj = usersList.find(u => u.user_id === activeUserId || (u as any).id === activeUserId);
  const activeUuid = activeUserObj ? (activeUserObj as any).id : activeUserId;
  const activeShortId = activeUserObj ? activeUserObj.user_id : activeUserId;

  const rawPlansCount = plansList.length;
  const rawParticipantsCount = participants.length;
  const uuids = plansList.map(p => p.id || "");
  const uniqueUuids = [...new Set(uuids.filter(Boolean))];
  const duplicates = uuids.filter((item, index) => item && uuids.indexOf(item) !== index);

  if (duplicates.length > 0) {
    console.error(`[mapPlansToLegacyPlans Audit] Duplicate plan UUIDs detected:`, duplicates);
  }

  // Optimize lookup: Map for O(1) searches
  const usersById = new Map<string, User>();
  const usersByShortId = new Map<string, User>();
  usersList.forEach(user => {
    if ((user as any).id) {
      usersById.set((user as any).id, user);
    }
    if (user.user_id) {
      usersByShortId.set(user.user_id, user);
    }
  });

  const findUserInList = (uId: string): User | undefined => {
    return usersById.get(uId) || usersByShortId.get(uId);
  };

  const isUsersHydrating = usersList.length <= 1;

  return plansList.map(p => {
    // Resolve circle name - circle_id is legacy in V2 schema
    const circleIdVal = null;
    const circleNameVal = "Custom Plan";
    const isCircleHydrating = false;

    const hostIdVal = p.host_id || "unknown_host";
    if (!p.host_id) {
      console.warn(`[mapPlansToLegacyPlans Warning] Plan ${p.id} is missing host_id, falling back to unknown_host.`);
    }
    const isOwner = hostIdVal === activeUserId || hostIdVal === activeUuid || hostIdVal === activeShortId;

    let creator = findUserInList(hostIdVal);
    let hostNameVal = isUsersHydrating ? "Loading..." : "Anonymous Host";
    let hostAvatarVal = isUsersHydrating ? "" : defaultAvatar;

    if (creator) {
      hostNameVal = creator.full_name;
      hostAvatarVal = (creator as any).profile_photo_path || creator.profile_photo || defaultAvatar;
    }

    const creatorFallback = {
      user_id: hostIdVal,
      username: "host",
      full_name: hostNameVal,
      phone_number: "",
      profile_photo: hostAvatarVal,
      bio: "",
      college_or_work: "",
      created_at: "",
      wallet_balance: 0,
      active_status: true
    };

    // Filter participants for this plan
    const itemParticipants = participants.filter(pp => {
      return pp.plan_id === p.id;
    });

    // Sort by updated_at descending so the latest state update is processed first
    const sortedItemParticipants = [...itemParticipants].sort((a, b) => {
      const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
      const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    // Deduplicate by user_id
    const uniqueParticipants: DbPlanParticipant[] = [];
    const seenUserIds = new Set<string>();
    for (const ip of sortedItemParticipants) {
      if (!seenUserIds.has(ip.user_id)) {
        seenUserIds.add(ip.user_id);
        uniqueParticipants.push(ip);
      }
    }

    const members = sortParticipantsByResponseOrder(
      uniqueParticipants.map(ip => {
        const u = findUserInList(ip.user_id);
        if (!u) {
          if (!isUsersHydrating) {
            console.warn(
              "[PARTICIPANT_NOT_FOUND]",
              ip.user_id
            );
          }
          return {
            userId: ip.user_id,
            userUuid: ip.user_id,
            name: isUsersHydrating ? "Loading..." : "Participant",
            avatar: "",
            isHydrating: isUsersHydrating,
            role: ip.role,
            isHost: ip.role === "HOST",
            joinState: normalizeStatus(ip.rsvp_status),
            reminderState: "none" as const,
            joinedAt: ip.responded_at || ip.created_at,
            joinedQueueAt: ip.joined_queue_at || ip.created_at,
            waitlistedAt: ip.joined_queue_at || null,
            assignedGroup: ip.assigned_group || null,
            joinQueue: ip.join_queue ?? null,
            waitlistPosition: ip.waitlist_position ?? null,
            skippedAt: null,
            deliveredAt: null,
            updatedAt: ip.updated_at,
            createdAt: ip.created_at,
            checkedIn: false,
            removedByHost: false
          };
        }

        return {
          userId: u.id || u.user_id,
          userUuid: u.id,
          name: u.full_name,
          avatar: (u as any).profile_photo_path || u.profile_photo || defaultAvatar,
          role: ip.role,
          isHost: ip.role === "HOST",
          joinState: normalizeStatus(ip.rsvp_status),
          reminderState: "none" as const,
          joinedAt: ip.responded_at || ip.created_at,
          joinedQueueAt: ip.joined_queue_at || ip.created_at,
          waitlistedAt: ip.joined_queue_at || null,
          assignedGroup: ip.assigned_group || null,
          joinQueue: ip.join_queue ?? null,
          waitlistPosition: ip.waitlist_position ?? null,
          skippedAt: null,
          deliveredAt: null,
          updatedAt: ip.updated_at,
          createdAt: ip.created_at,
          checkedIn: false,
          removedByHost: false
        };
      }).filter(Boolean) as any[],
      (p as any).participant_filtering,
      (p as any).waitlist_order_mode
    );

    const dbItem = (p as any).discovery_items;
    const categoryVal = (dbItem?.category || p.category || "CUSTOM").toLowerCase();
    const subcategoryVal = (dbItem?.subcategory || p.subcategory || "OTHER").toLowerCase();

    // Date/time parsing from p.scheduled_at
    const isIso = p.scheduled_at && p.scheduled_at.includes("T") && p.scheduled_at.includes("-");
    let dateVal = "TODAY";
    let timeVal = "";

    if (isIso) {
      try {
        const planDate = new Date(p.scheduled_at);
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);

        if (planDate.toDateString() === today.toDateString()) {
          dateVal = "TODAY";
        } else if (planDate.toDateString() === tomorrow.toDateString()) {
          dateVal = "TOMORROW";
        } else {
          dateVal = planDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
        }

        const hh = String(planDate.getHours()).padStart(2, '0');
        const mm = String(planDate.getMinutes()).padStart(2, '0');
        timeVal = `${hh}:${mm}`;
      } catch (err) {
        console.warn("[Mappers] Failed to parse ISO scheduled_at:", p.scheduled_at, err);
        dateVal = "TODAY";
        timeVal = "";
      }
    } else {
      dateVal = p.scheduled_at ? String(p.scheduled_at).split(" • ")[0] : "TODAY";
      timeVal = p.scheduled_at ? String(p.scheduled_at).split(" • ")[1] || String(p.scheduled_at) : "";
    }

    const maxSpotsVal = p.max_participants || (members.length > 0 ? members.length : 10);
    const costVal = p.total_cost !== undefined ? Number(p.total_cost) : 0;
    const coverImageVal = p.cover_image || dbItem?.cover_image_url || getPlanCover(categoryVal, subcategoryVal);

    // Dynamic split fallback for paymentAmount: find active participant cost_per_participant
    const myParticipant = participants.find(
      pp => pp.plan_id === p.id && (pp.user_id === activeUuid || pp.user_id === activeUserId || pp.user_id === activeShortId)
    );
    const activeShareVal = myParticipant && myParticipant.cost_per_participant !== undefined && myParticipant.cost_per_participant !== null
      ? Number(myParticipant.cost_per_participant)
      : (costVal > 0 ? Math.ceil(costVal / (maxSpotsVal > 0 ? maxSpotsVal : 1)) : 0);

    const goingCount = members.filter(m => m.joinState === "JOINED").length;
    const seatsLeftVal = Math.max(0, maxSpotsVal - goingCount);

    const userRatingVal = undefined;
    const userReactionVal = undefined;
    const isHappenedVal = p.status === "COMPLETED";

    return {
      id: p.id,
      dbUuid: p.id,
      publicId: p.public_id,
      title: p.title,
      groupId: circleIdVal,
      hostId: hostIdVal,
      members: members,
      capacity: maxSpotsVal,
      date: dateVal,
      time: timeVal,
      location: p.place_name,
      paymentAmount: activeShareVal,
      status: p.status as any,
      datetime: p.scheduled_at,
      createdAt: p.created_at,
      waitlistEnabled: false,
      joinLimit: maxSpotsVal,
      response_cutoff_hours: undefined,
      response_deadline_at: p.rsvp_deadline,
      allowParticipantInvites: p.allow_participant_invites ?? false,
      participantFiltering: (p.participant_filtering as any) || 'AUTOMATIC',
      participant_filtering: (p.participant_filtering as any) || 'AUTOMATIC',
      waitlistOrderMode: (p.waitlist_order_mode as any) || 'AUTO',
      waitlist_order_mode: (p.waitlist_order_mode as any) || 'AUTO',

      // UI Legacy Properties
      category: (categoryVal === "sports" ? "sports" : categoryVal === "dining" ? "restaurants" : categoryVal) as any,
      cost: costVal,
      confirmedCount: goingCount,
      maxSpots: maxSpotsVal,
      coverImage: coverImageVal,
      creatorId: hostIdVal,
      creatorName: (members.find(m => m.isHost)?.name) || creatorFallback.full_name,
      creatorAvatar: (members.find(m => m.isHost)?.avatar) || creatorFallback.profile_photo,
      joinedUsers: members,
      timeline: (dateVal.toLowerCase().includes("today") ? "today" : dateVal.toLowerCase().includes("tomorrow") ? "tomorrow" : "this_week") as any,
      description: p.description,
      seatsLeft: seatsLeftVal,
      notes: p.description || (categoryVal === "sports" ? "Bring your own jersey and water bottle." : undefined),

      // Sports Plan fields
      skillLevel: subcategoryVal === "football" ? "Competitive" : "Intermediate",
      matchFormat: subcategoryVal === "football" ? "7 vs 7" : "Friendly Match",
      sports_type: (subcategoryVal === "football" ? "Football" : subcategoryVal === "badminton" ? "Badminton" : undefined) as any,
      subcategory: subcategoryVal,
      waitlistUsers: [],
      attendanceLogged: false,

      // Restaurant Plan fields
      interestedUsers: [],
    };
  });
};

// Helper to map legacy Circles component expectations
export const mapCirclesToLegacyCircles = (
  circlesList: DbCircle[],
  members: DbCircleMember[],
  usersList: User[]
): Circle[] => {
  return circlesList.map(c => {
    const circlePublicId = c.circle_id || (c as any).public_id || c.id;
    const circleUuid = c.id || (c as any).dbUuid || c.circle_id;

    const circleMemberRecords = members.filter(cm => cm.circle_id === circlePublicId || cm.circle_id === circleUuid);
    const membersList = circleMemberRecords.map(cmr => {
      const u = usersList.find(usr => (usr as any).id === cmr.user_id || usr.user_id === cmr.user_id);
      if (!u) return null;
      return {
        userId: (u as any).id || u.user_id,
        name: u.full_name,
        phone: u.phone_number,
        avatar: (u as any).profile_photo_path || u.profile_photo || defaultAvatar,
        autoJoinPlans: !!cmr.auto_join_enabled,
        auto_join_enabled: !!cmr.auto_join_enabled,
        role: (() => {
          const r = String(cmr.role).toLowerCase();
          if (r === "creator_admin" || r === "host" || r === "admin" || r === "co_host") return "admin";
          return "member";
        })()
      };
    }).filter(Boolean) as any[];

    return {
      id: circlePublicId,
      dbUuid: circleUuid,
      name: c.name,
      membersCount: membersList.length,
      avatars: membersList.slice(0, 5).map(m => m.avatar),
      groupImage: c.cover_image,
      lastSpontaneousActivity: c.category === "football" ? "7-a-side booked: TODAY 8:00 PM" : "Late-night chats",
      description: c.description,
      type: c.category === "football" ? "Sports Match Crew" : "Spontaneous Hangout Circle",
      location: c.location_anchor,
      format: c.privacy === "private" ? "Spontaneous Private Crew" : "Public Community",
      playersOnField: membersList.length,
      timeWindow: "Flexible hours",
      membersList: membersList,
      allow_member_edit: !!c.allow_member_edit,
      allow_member_host: !!c.allow_member_host,
      allow_member_invite: !!c.allow_member_invite,
      allow_auto_join: !!c.allow_auto_join,
      plan_creation_permission: (c as any).plan_creation_permission || "ANYONE",
      add_members_permission: (c as any).add_members_permission || "ANYONE",
      edit_info_permission: (c as any).edit_info_permission || "HOSTS_ONLY",
      remove_members_permission: (c as any).remove_members_permission || "HOSTS_ONLY",
      manage_roles_permission: (c as any).manage_roles_permission || "HOSTS_ONLY"
    };
  });
};

// Helper to legacy mapped transactions expected by UI lists
export const mapTransactionsToLegacy = (
  txs: DbTransaction[],
  usersList: User[],
  activeUserId: string = "",
  plansList: DbPlan[] = []
): Transaction[] => {
  // Resolve active user's UUID so we can correctly determine credit/debit direction
  const activeUserObj = usersList.find(u => u.user_id === activeUserId || u.id === activeUserId);
  const activeUuid = activeUserObj?.id || "";

  return txs.map(t => {
    // transactions.sender_id and receiver_id store users.id (UUID).
    // Fall back to user_id match for legacy/demo data that may have short IDs.
    const rxUser = usersList.find(u => u.id === t.receiver_id || u.user_id === t.receiver_id);
    const sxUser = usersList.find(u => u.id === t.sender_id || u.user_id === t.sender_id);
    const rx = rxUser?.full_name || "Self";
    const sx = sxUser?.full_name || "Self";

    let title = "Deposit";
    if (t.transaction_type === "split_payment" || t.transaction_type === "plan_payment") {
      // Determine direction: sender = this user → debit; else credit
      const isSender = t.sender_id === activeUuid || t.sender_id === activeUserId;
      title = isSender ? `Paid ${rx}` : `Received from ${sx}`;
    } else if (t.transaction_type === "deposit") {
      title = "Top-up Wallet";
    }

    // Credit/debit: if sender is the active user → debit; otherwise → credit
    const isSenderMatch = t.sender_id === activeUuid || t.sender_id === activeUserId;

    const planObj = plansList.find(p => p.id === t.plan_id);
    const planTitle = planObj ? planObj.title : null;

    return {
      id: t.transaction_id,
      publicId: t.public_id || undefined,
      title: title,
      amount: t.amount,
      type: (isSenderMatch ? "debit" : "credit") as "debit" | "credit",
      timestamp: t.timestamp,
      settled: (t.status as any) === "success" || (t.status as any) === "completed" || (t.status as any) === true,
      status: t.status,
      transactionType: t.transaction_type,
      planTitle: planTitle
    };
  });
};


export const NotificationMeta: Record<string, { label: string; icon: string }> = {
  PLAN_INVITATION: { label: "Invitation", icon: "✉️" },
  WAITLIST_PROMOTED: { label: "Promoted", icon: "⚡" },
  PLAN_CANCELLED: { label: "Cancelled", icon: "❌" },
  PLAN_UPDATED: { label: "Updated", icon: "✏️" },
  HOST_TRANSFERRED: { label: "Host Transfer", icon: "👑" },
  PARTICIPANT_JOINED: { label: "Joined", icon: "✅" },
  PARTICIPANT_SKIPPED: { label: "Skipped", icon: "🏃" },
  // Compatibility fallbacks:
  invitation: { label: "Invitation", icon: "✉️" },
  urgency: { label: "Urgent", icon: "⚠️" },
  payment: { label: "Payment", icon: "💳" },
  general: { label: "General", icon: "🔔" }
};



export function getDeadlineText(deadlineAt?: string): string {
  if (!deadlineAt) return "";
  const now = new Date().getTime();
  const deadline = new Date(deadlineAt).getTime();
  const diff = deadline - now;
  if (diff <= 0) {
    return "Responses Closed";
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    const date = new Date(deadlineAt);
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `Responses Close: ${hh}:${mm}`;
  }

  if (hours > 0) {
    return `Closes in ${hours}h ${minutes}m`;
  }
  return `Closes in ${minutes}m`;
}

export function formatPlanDate(datetime: string | undefined): string {
  if (!datetime) return "Date pending";
  try {
    const d = new Date(datetime);
    if (isNaN(d.getTime())) return datetime;

    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    let dateStr = "";
    if (d.toDateString() === today.toDateString()) {
      dateStr = "Today";
    } else if (d.toDateString() === tomorrow.toDateString()) {
      dateStr = "Tomorrow";
    } else {
      const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
      const month = d.toLocaleDateString("en-US", { month: "short" });
      const day = d.getDate();
      dateStr = `${weekday}, ${month} ${day}`;
    }

    const timeHH = String(d.getHours()).padStart(2, '0');
    const timeMM = String(d.getMinutes()).padStart(2, '0');
    const timeStr = `${timeHH}:${timeMM}`;
    return `${dateStr} • ${timeStr}`;
  } catch (err) {
    console.error("[formatPlanDate] Error formatting datetime:", datetime, err);
    return datetime;
  }
}

function sortMembers(members: any[], filteringMode?: string, waitlistOrderMode: string = 'AUTO'): any[] {
  const joined: any[] = [];
  const waitlisted: any[] = [];
  const skipped: any[] = [];
  const invited: any[] = [];

  members.forEach(m => {
    const st = m.joinState || "";
    if (st === 'JOINED') joined.push(m);
    else if (st === 'WAITLISTED') waitlisted.push(m);
    else if (st === 'SKIPPED') skipped.push(m);
    else invited.push(m);
  });

  const getEpoch = (dateStr?: string, fallback1?: string, fallback2?: string) => {
    if (dateStr) {
      const parsed = Date.parse(dateStr);
      if (!isNaN(parsed)) return parsed;
    }
    if (fallback1) {
      const parsed = Date.parse(fallback1);
      if (!isNaN(parsed)) return parsed;
    }
    if (fallback2) {
      const parsed = Date.parse(fallback2);
      if (!isNaN(parsed)) return parsed;
    }
    return 0;
  };

  joined.sort((a, b) => getEpoch(a.joinedAt, a.updatedAt, a.createdAt) - getEpoch(b.joinedAt, b.updatedAt, b.createdAt));

  if (waitlistOrderMode === 'CUSTOM') {
    waitlisted.sort((a, b) => {
      const posA = a.waitlistPosition ?? Number.MAX_SAFE_INTEGER;
      const posB = b.waitlistPosition ?? Number.MAX_SAFE_INTEGER;
      if (posA !== posB) return posA - posB;
      const qA = a.joinQueue ?? Number.MAX_SAFE_INTEGER;
      const qB = b.joinQueue ?? Number.MAX_SAFE_INTEGER;
      return qA - qB;
    });
  } else if (filteringMode === 'ASSIGNED') {
    waitlisted.sort((a, b) => getEpoch(a.createdAt, a.waitlistedAt, a.joinedAt) - getEpoch(b.createdAt, b.waitlistedAt, b.joinedAt));
  } else {
    // AUTOMATIC mode: Order strictly by joinQueue ASC, with createdAt ASC tiebreaker
    waitlisted.sort((a, b) => {
      const qA = a.joinQueue ?? Number.MAX_SAFE_INTEGER;
      const qB = b.joinQueue ?? Number.MAX_SAFE_INTEGER;
      if (qA !== qB) return qA - qB;
      const createdA = getEpoch(a.createdAt);
      const createdB = getEpoch(b.createdAt);
      return createdA - createdB;
    });
  }

  skipped.sort((a, b) => getEpoch(a.skippedAt, a.updatedAt, a.createdAt) - getEpoch(b.skippedAt, b.updatedAt, b.createdAt));
  invited.sort((a, b) => getEpoch(a.deliveredAt, a.updatedAt, a.createdAt) - getEpoch(b.deliveredAt, b.updatedAt, b.createdAt));

  return [...joined, ...waitlisted, ...skipped, ...invited];
}

export function sortParticipantsByResponseOrder(membersList: any[], filteringMode?: string, waitlistOrderMode: string = 'AUTO'): any[] {
  return sortMembers(membersList, filteringMode, waitlistOrderMode);
}
