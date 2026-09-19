import { Plan, UserProfile } from '../../../core/types';
import { Friend } from './types';

export interface PlanParticipantManagementWrapperProps {
  plan: Plan;
  userProfile: UserProfile;
  activeUserId?: string;
  isHost: boolean;
  isCreatorHost?: boolean;
  onBack: () => void;
  onLeavePlan?: () => void;
  displayMode?: 'standalone' | 'embedded';
  // Store actions passed in so containers stay store-agnostic
  onMoveToGoing: (planId: string, userId: string, options?: { bypassCapacityCheck?: boolean }) => Promise<void>;
  onMoveToWaitlist: (planId: string, userId: string) => Promise<void>;
  onMoveToInvited: (planId: string, userId: string) => Promise<void>;
  onSwapParticipants?: (planId: string, goingUserId: string, waitlistUserId: string) => Promise<void>;
  onRemoveAndReplaceWithWaitlist?: (planId: string, removeUserId: string, promoteUserId: string) => Promise<void>;
  onRemoveParticipant: (planId: string, userId: string) => Promise<void>;
  onChangePlanHost?: (planId: string, newHostId: string, currentHostId: string) => Promise<void>;
  onPromoteToHost?: (planId: string, userId: string) => Promise<void>;
  onDemoteFromHost?: (planId: string, userId: string) => Promise<void>;
  onUpdatePlanCapacity?: (planId: string, capacity: number, options?: { totalCost?: number; autoPromote?: boolean }) => Promise<void> | void;
  onAddParticipants?: (planId: string, userIds: string[], targetGroup?: 'GOING' | 'WAITLIST') => Promise<void>;
  onReorderWaitlist?: (planId: string, orderedUserUuids: string[]) => Promise<void>;
  onOpenSettings?: () => void;
  onOpenActivity?: () => void;
  onPlanSizeEditingChange?: (isEditing: boolean) => void;
  onBottomSheetStateChange?: (isOpen: boolean) => void;
  onCancelPlan?: (planId: string) => Promise<void>;
  replaceTargetUserId?: string | null;
  onCancelReplacement?: () => void;
  onConfirmReplacement?: (planId: string, targetUserId: string, replacementUserId: string) => Promise<void>;
  currentPage?: number;
  initialOpenPlanSizeSheet?: boolean;
}
