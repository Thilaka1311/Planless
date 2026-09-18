import React from 'react';
import { PlanParticipantManagementWrapperProps } from '../../../../participants/shared/participantManagementTypes';
import { AssignedParticipantContainer } from '../../../../participants/assigned/AssignedParticipantContainer';
import { AutomaticParticipantContainer } from '../../../../participants/automatic/AutomaticParticipantContainer';

export type { PlanParticipantManagementWrapperProps };

/**
 * PlanParticipantManagementWrapper
 *
 * Clean domain router that isolates the Automatic and Assigned participant-management flows.
 * - Assigned mode: host-guided capacity movements, waitlist drag-and-drop, manual swaps/replacements, assigned_group.
 * - Automatic mode: first-come-first-served (FCFS) queue based on joined_queue_at, deterministic auto-promotion.
 *
 * Modifying one flow will never unintentionally affect or break the other.
 */
export const PlanParticipantManagementWrapper: React.FC<PlanParticipantManagementWrapperProps> = (props) => {
  const { plan } = props;
  const rawWaitlistMode =
    plan.participantFiltering ||
    (plan as any).participant_filtering ||
    (plan as any).waitlist_mode ||
    (plan as any).waitlistMode ||
    (plan as any).waitlist_type ||
    (plan as any).waitlistType ||
    'AUTOMATIC';

  const isAssigned = typeof rawWaitlistMode === 'string' && rawWaitlistMode.toLowerCase() === 'assigned';

  if (isAssigned) {
    return <AssignedParticipantContainer {...props} />;
  }

  return <AutomaticParticipantContainer {...props} />;
};
