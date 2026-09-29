/**
 * Realtime Event Filtering Utilities
 * Scopes global/broad Postgres Realtime events to relevant entities,
 * eliminating unnecessary re-renders, state allocations, and network cascades.
 */

export interface PlanRecord {
  id?: string;
  plan_id?: string;
  host_id?: string;
  host_profile?: { id?: string };
  [key: string]: any;
}

export interface ParticipantRecord {
  id?: string;
  plan_id?: string;
  user_id?: string;
  [key: string]: any;
}

export interface MemoryRecord {
  id?: string;
  plan_id?: string;
  [key: string]: any;
}

/**
 * Determines whether a 'plans' Realtime event should be processed.
 * - UPDATE/DELETE: Only if the plan exists in the user's loaded plans.
 * - INSERT: Only if the current user is the host/creator of the new plan.
 */
export function shouldProcessPlanEvent(
  eventType: string,
  record: PlanRecord | null | undefined,
  activeUserId: string | null | undefined,
  existingPlans: PlanRecord[]
): boolean {
  if (!record) return false;
  const planId = record.id || record.plan_id;
  if (!planId) return false;

  const existsInLoadedPlans = existingPlans.some(
    (p) => p.id === planId || p.plan_id === planId
  );

  if (eventType === "UPDATE" || eventType === "DELETE") {
    return existsInLoadedPlans;
  }

  if (eventType === "INSERT") {
    if (existsInLoadedPlans) return true;
    if (!activeUserId) return false;
    const isHost =
      record.host_id === activeUserId ||
      record.host_profile?.id === activeUserId;
    return Boolean(isHost);
  }

  return false;
}

export interface ParticipantFilterResult {
  shouldProcess: boolean;
  needsPlanRefresh: boolean;
}

/**
 * Determines whether a 'plan_participants' Realtime event should be processed.
 * - Unrelated participants on unrelated plans are dropped immediately.
 * - Participants on the user's existing plans are processed.
 * - When the active user is added/invited (INSERT) to a plan not yet loaded, flags needsPlanRefresh = true.
 */
export function shouldProcessParticipantEvent(
  eventType: string,
  record: ParticipantRecord | null | undefined,
  activeUserId: string | null | undefined,
  existingPlans: PlanRecord[]
): ParticipantFilterResult {
  if (!record) {
    return { shouldProcess: false, needsPlanRefresh: false };
  }

  const planId = record.plan_id;
  const userId = record.user_id;
  if (!planId) {
    return { shouldProcess: false, needsPlanRefresh: false };
  }

  const isOurPlan = existingPlans.some(
    (p) => p.id === planId || p.plan_id === planId
  );
  const isCurrentUser = Boolean(activeUserId && userId === activeUserId);

  // If not our plan and not current user, drop it completely
  if (!isOurPlan && !isCurrentUser) {
    return { shouldProcess: false, needsPlanRefresh: false };
  }

  // If current user was added/invited to a new plan not currently loaded
  if (isCurrentUser && !isOurPlan && eventType === "INSERT") {
    return { shouldProcess: true, needsPlanRefresh: true };
  }

  // If deleting from an existing plan
  if (eventType === "DELETE") {
    return { shouldProcess: isOurPlan, needsPlanRefresh: false };
  }

  return { shouldProcess: isOurPlan, needsPlanRefresh: false };
}

/**
 * Determines whether a 'memories' Realtime event should be processed.
 * Only accepts memories whose plan_id belongs to the user's loaded plans.
 */
export function shouldProcessMemoryEvent(
  record: MemoryRecord | null | undefined,
  existingPlans: PlanRecord[]
): boolean {
  if (!record || !record.plan_id) return false;
  return existingPlans.some(
    (p) => p.id === record.plan_id || p.plan_id === record.plan_id
  );
}

/**
 * Determines whether a participant event affects the user's wallet.
 * Only triggers wallet refresh if the event is for the active user or belongs to the user's wallet plans.
 */
export function shouldProcessWalletParticipantEvent(
  newRec: ParticipantRecord | null | undefined,
  oldRec: ParticipantRecord | null | undefined,
  activeUserUuid: string | null | undefined,
  walletPlans: PlanRecord[]
): boolean {
  const userId = newRec?.user_id || oldRec?.user_id;
  const planId = newRec?.plan_id || oldRec?.plan_id;

  const isMe = Boolean(activeUserUuid && userId === activeUserUuid);
  const isMyPlan = Boolean(
    planId && walletPlans.some((p) => p.id === planId || p.plan_id === planId)
  );

  return isMe || isMyPlan;
}

/**
 * Determines whether a user profile realtime update should be appended to dbUsers.
 * Only appends if the user is already tracked in dbUsers or is the active user.
 */
export function shouldAppendUserToDbUsers(
  rowId: string | null | undefined,
  activeUserUuid: string | null | undefined,
  existingUserIds: Set<string>
): boolean {
  if (!rowId) return false;
  if (activeUserUuid && rowId === activeUserUuid) return true;
  return existingUserIds.has(rowId);
}
