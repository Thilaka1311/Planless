import { DbPlanParticipant } from "../../../core/types";

/**
 * Returns a Set of plan IDs (and dbUuids) where the current user is an active HOST
 * and the plan has pending actions requiring host attention (e.g. pending leave requests).
 *
 * Rules:
 * - Active Host: role === 'HOST' && rsvp_status === 'JOINED'
 * - Pending Action: another participant has leave_requested === true && rsvp_status === 'JOINED'
 * - Non-hosts, waitlisted, or skipped users NEVER receive the indicator.
 */
export function getPendingHostActionPlanIds(
  dbPlanParticipants: DbPlanParticipant[] | undefined,
  myUserIds: Set<string>
): Set<string> {
  const pendingPlanIds = new Set<string>();
  if (!dbPlanParticipants || dbPlanParticipants.length === 0 || myUserIds.size === 0) {
    return pendingPlanIds;
  }

  // 1. Group participants by plan_id
  const participantsByPlan = new Map<string, DbPlanParticipant[]>();
  for (const pp of dbPlanParticipants) {
    if (!pp.plan_id) continue;
    let list = participantsByPlan.get(pp.plan_id);
    if (!list) {
      list = [];
      participantsByPlan.set(pp.plan_id, list);
    }
    list.push(pp);
  }

  // 2. For each plan, check if the current user is an active HOST and there is an action needed
  for (const [planId, parts] of participantsByPlan.entries()) {
    const isCurrentUserActiveHost = parts.some(
      (pp) => pp.user_id && myUserIds.has(pp.user_id) && pp.role === "HOST" && pp.rsvp_status === "JOINED"
    );

    if (!isCurrentUserActiveHost) {
      continue;
    }

    // Check for pending host action:
    // 1. Leave request: participant is JOINED and requested to leave
    // 2. Rejoin request: participant is REJOINED and awaiting host decision
    const hasPendingHostAction = parts.some(
      (pp) =>
        (pp.leave_requested === true && pp.rsvp_status === "JOINED") ||
        pp.rsvp_status === "REJOINED"
    );

    if (hasPendingHostAction) {
      pendingPlanIds.add(planId);
    }
  }

  return pendingPlanIds;
}
