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
  planSize: number;
  alreadySkipped?: boolean;
}

export interface PlanPreviewCtaResult {
  isWaitlistTarget: boolean;
  ctaText: "Join Plan" | "Join Waitlist" | "Rejoin Plan" | "Rejoin Waitlist";
}

/**
 * Computes the CTA button target state and user-facing text for previewing a plan.
 *
 * - Assigned plans:
 *   Uses the participant's assigned_group as the strict source of truth:
 *   - assigned_group = GOING -> Join Plan
 *   - assigned_group = WAITLIST -> Join Waitlist
 *   Does NOT use general plan capacity to override for Assigned plans.
 *
 * - Automatic plans:
 *   Determines CTA from current capacity:
 *   - joined_count < plan_size -> Join Plan
 *   - joined_count >= plan_size -> Join Waitlist
 */
export function getPlanPreviewCtaState({
  isAssignedMode,
  assignedGroup,
  joinedCount,
  planSize,
  alreadySkipped = false,
}: PlanPreviewCtaParams): PlanPreviewCtaResult {
  const normalizedGroup = String(assignedGroup || '').trim().toUpperCase();

  const isWaitlistTarget = isAssignedMode
    ? normalizedGroup === "WAITLIST" || normalizedGroup === "WAITLISTED"
    : joinedCount >= planSize;

  const ctaText = isWaitlistTarget
    ? (alreadySkipped ? "Rejoin Waitlist" : "Join Waitlist")
    : (alreadySkipped ? "Rejoin Plan" : "Join Plan");

  return {
    isWaitlistTarget,
    ctaText,
  };
}
