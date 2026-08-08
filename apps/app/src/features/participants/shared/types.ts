export interface Friend {
  id: string;
  dbUuid: string;
  name: string;
  avatar: string;
  isHost?: boolean;
  joinedQueueAt?: string;
  isAccepted?: boolean;
  rsvpStatus?: string;
  assignedGroup?: 'GOING' | 'WAITLIST' | null;
  waitlistPosition?: number | null;
}

export type ParticipantTab = 'going' | 'waitlist' | 'invited';

export interface SharedParticipantScreenProps {
  title?: string;
  subtitle?: string;
  category?: string;
  eventDate?: string;
  eventTime?: string;
  capacity: number;
  maxCapacity?: number;
  userProfile?: any;
  mode?: 'wizard' | 'editor';
  managementMode?: 'host' | 'invite_only';
  continueText?: string;
  isLoading?: boolean;
  isHost?: boolean;
  isHostUser?: boolean;
  onBack: () => void;
  onContinue?: (going: Friend[], waitlist: Friend[]) => void;
  onClose?: () => void;
  onAddFriends?: (targetTab?: ParticipantTab) => void;
  onAdjustCapacity?: (newCapacity: number) => void;
  onMoveToGoing?: (friend: Friend) => Promise<void> | void;
  onMoveToWaitlist?: (friend: Friend) => Promise<void> | void;
  onMoveToInvited?: (friend: Friend) => Promise<void> | void;
  onRemoveParticipant?: (friend: Friend) => Promise<void> | void;
  onPromoteHost?: (friend: Friend) => Promise<void> | void;
  onDemoteHost?: (friend: Friend) => Promise<void> | void;
  onOpenSettings?: () => void;
  onOpenActivity?: () => void;
  initialTab?: ParticipantTab;
  displayMode?: 'standalone' | 'embedded';
  onPlanSizeEditingChange?: (isEditing: boolean) => void;
  isHostSelected?: boolean;
  selectedFriends?: Friend[];
  externalGoingList?: Friend[];
  externalWaitlist?: Friend[];
  externalInvitedList?: Friend[];
  onReorderWaitlist?: (newWaitlist: Friend[]) => void;
  onReorderWaitlistComplete?: (finalWaitlist: Friend[]) => void;
  waitlistMode?: 'automatic' | 'assigned';
  onWaitlistModeChange?: (mode: 'automatic' | 'assigned') => void;
  showWaitlistMode?: boolean;
  canParticipantInvite?: boolean;
}

export type ParticipantManagementScreenProps = SharedParticipantScreenProps;

