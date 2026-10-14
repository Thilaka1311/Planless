import { normalizeStatus } from "../../../../lib/participantStatus";
import { DbPlanParticipant, Plan } from "../../../core/types";

export interface HomeFeedEligibilityOptions {
  plan: Plan | any;
  userId: string;
  userUuid?: string | null;
  participantRecord?: DbPlanParticipant | null;
  joinedCount?: number;
}

/**
 * Determines whether a plan is eligible to be surfaced in the Home discovery feed.
 *
 * Authoritative Eligibility Contract:
 * - SHOW A PLAN WHEN:
 *   1. The current user has not previously interacted with that plan (no participant record and no member entry); OR
 *   2. The current user's authoritative participation state is 'INVITED', and the response deadline has not passed.
 *
 * - DO NOT SHOW A PLAN WHEN:
 *   1. The user is a host of the plan (hosted plans belong to the Plans hub).
 *   2. The user has joined the plan (rsvp_status === 'JOINED').
 *   3. The user has joined its waitlist (rsvp_status === 'WAITLISTED').
 *   4. The user has skipped the plan (rsvp_status === 'SKIPPED').
 *   5. The user has declined an invitation (skip_reason === 'DECLINED' or rsvp_status === 'SKIPPED').
 *   6. The user has left the plan or been removed (skip_reason in ['LEFT', 'REMOVED', 'REPLACED', 'PAYMENT_KEPT']).
 *   7. The user has requested to leave or an outcome final state is already recorded.
 *   8. The plan has reached the system ceiling of 50 joined participants.
 *   9. The plan is not active/live or its response deadline has passed.
 */
export function isPlanEligibleForHomeDiscovery({
  plan,
  userId,
  userUuid,
  participantRecord,
  joinedCount,
}: HomeFeedEligibilityOptions): boolean {
  if (!plan) return false;

  // 1. Plan status check: Must be active or live
  const statusNorm = (plan.status || "").toLowerCase();
  if (statusNorm !== "active" && statusNorm !== "live") {
    return false;
  }

  // 2. RSVP deadline check: Expired plans are closed for response
  const deadlineStr = plan.response_deadline_at || (plan as any).rsvp_deadline;
  if (deadlineStr) {
    const deadline = new Date(deadlineStr).getTime();
    if (!isNaN(deadline) && Date.now() > deadline) {
      return false;
    }
  }

  // 3. User Host Check: Hosts coordinate in the Plans hub, never discover their own plan on Home
  const effectiveUserUuid = userUuid || null;
  const myMember = (plan.members || []).find((m: any) =>
    m.userId === userId ||
    (effectiveUserUuid && m.userId === effectiveUserUuid) ||
    (effectiveUserUuid && m.userUuid === effectiveUserUuid) ||
    m.userUuid === userId
  );

  const isHost =
    participantRecord?.role === "HOST" ||
    myMember?.role === "HOST" ||
    myMember?.isHost === true ||
    plan.hostId === userId ||
    (effectiveUserUuid && plan.hostId === effectiveUserUuid) ||
    (plan.host && (plan.host.id === userId || (effectiveUserUuid && plan.host.id === effectiveUserUuid))) ||
    (plan as any).host_id === userId ||
    (effectiveUserUuid && (plan as any).host_id === effectiveUserUuid) ||
    (plan as any).created_by === userId ||
    (effectiveUserUuid && (plan as any).created_by === effectiveUserUuid);

  if (isHost) {
    return false;
  }

  // 4. Participation State Check
  const hasParticipantRecord = Boolean(participantRecord);
  const hasMemberRecord = Boolean(myMember);

  if (hasParticipantRecord || hasMemberRecord) {
    // Check authoritative role
    const role = participantRecord?.role || myMember?.role;
    if (role === "HOST") {
      return false;
    }

    // Check RSVP status: only 'INVITED' is permitted on Home
    const rawRsvp = participantRecord?.rsvp_status || myMember?.rsvp_status || myMember?.joinState;
    const rsvp = normalizeStatus(rawRsvp);

    if (rsvp !== "INVITED") {
      // Excludes: JOINED, WAITLISTED, SKIPPED, REJOINED, etc.
      return false;
    }

    // Check skip reason (DECLINED, LEFT, REMOVED, PASSED, etc.)
    const skipReason =
      participantRecord?.skip_reason ||
      myMember?.skipReason ||
      myMember?.skip_reason;
    if (skipReason) {
      return false;
    }

    // Check leave request
    if (participantRecord?.leave_requested || myMember?.leave_requested) {
      return false;
    }

    // Check final state or attendance
    if (
      participantRecord?.final_state ||
      participantRecord?.final_attendance ||
      myMember?.finalState ||
      myMember?.finalAttendance
    ) {
      return false;
    }
  }

  // 5. Dynamic Capacity Check: Hard ceiling of 50 joined participants
  const effectiveJoined =
    joinedCount !== undefined
      ? joinedCount
      : (plan.members || []).filter(
          (m: any) =>
            m.joinState === "JOINED" ||
            (m.role === "HOST" && normalizeStatus(m.rsvp_status) === "JOINED")
        ).length;

  if (effectiveJoined >= 50) {
    return false;
  }

  return true;
}
