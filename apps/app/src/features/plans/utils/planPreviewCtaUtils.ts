/**
 * planPreviewCtaUtils.ts
 *
 * Source of truth for Plan Preview CTA state and text.
 * Governs both Assigned and Automatic participant-management modes.
 */

export interface PlanPreviewCtaParams {
  isAssignedMode: boolean;
  assignedGroup?: string | null;
  joinedCount: number;
  planSize?: number | null;
  alreadySkipped?: boolean;
}

export type PlanPreviewCtaText =
  | "Join Plan"
  | "Join Waitlist"
  | "Rejoin Plan"
  | "Plan size reached";

export interface PlanPreviewCtaResult {
  isWaitlistTarget: boolean;
  isCapacityReached: boolean;
  ctaText: PlanPreviewCtaText;
}

/**
 * Computes the CTA button target state and user-facing text for previewing a plan.
 *
 * - Hard platform ceiling (50 joined):
 *   When joined_count >= 50, the plan reaches absolute capacity.
 *   Returns ctaText = "Plan size reached", isCapacityReached = true, isWaitlistTarget = false.
 *
 * - No Limit plans (planSize === null | undefined):
 *   No host-defined limit and strictly NO waitlist.
 *   - joined_count < 50 -> Join Plan / Rejoin Plan
 *   - joined_count >= 50 -> Plan size reached
 *
 * - Limited plans:
 *   - Assigned:
 *     Uses the participant's assigned_group:
 *     - assigned_group = GOING -> Join Plan
 *     - assigned_group = WAITLIST -> Join Waitlist
 *   - Automatic:
 *     - joined_count < plan_size -> Join Plan
 *     - joined_count >= plan_size -> Join Waitlist
 */
export function getPlanPreviewCtaState({
  isAssignedMode,
  assignedGroup,
  joinedCount,
  planSize,
  alreadySkipped = false,
}: PlanPreviewCtaParams): PlanPreviewCtaResult {
  const normalizedGroup = String(assignedGroup || '').trim().toUpperCase();
  const isNoLimit = planSize === null || planSize === undefined;

  // 1. Platform hard ceiling: 50 joined participants
  if (joinedCount >= 50) {
    return {
      isWaitlistTarget: false,
      isCapacityReached: true,
      ctaText: "Plan size reached",
    };
  }

  // 2. No Limit plans: no waitlist, dynamically joinable when joinedCount < 50
  if (isNoLimit) {
    return {
      isWaitlistTarget: false,
      isCapacityReached: false,
      ctaText: alreadySkipped ? "Rejoin Plan" : "Join Plan",
    };
  }

  // 3. Limited plans: respect host-defined plan_size
  const numericLimit = Number(planSize);
  const isWaitlistTarget = isAssignedMode
    ? normalizedGroup === "WAITLIST" || normalizedGroup === "WAITLISTED"
    : joinedCount >= numericLimit;

  const ctaText = alreadySkipped
    ? "Rejoin Plan"
    : (isWaitlistTarget ? "Join Waitlist" : "Join Plan");

  return {
    isWaitlistTarget,
    isCapacityReached: false,
    ctaText,
  };
}
