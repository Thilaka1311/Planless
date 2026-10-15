import React from 'react';
import { ParticipantManagementScreenProps } from '../shared/types';
import { AutomaticParticipantScreen } from '../automatic/AutomaticParticipantScreen';
import { AssignedParticipantScreen } from '../assigned/AssignedParticipantScreen';

export type { Friend, ParticipantTab, SharedParticipantScreenProps as ParticipantManagementScreenProps } from '../shared/types';

export const ParticipantManagementScreen: React.FC<ParticipantManagementScreenProps> = (props) => {
  const normalizedProps: ParticipantManagementScreenProps = {
    ...props,
    selectedFriends: props.selectedFriends ?? [],
    priorityGuestIds: props.priorityGuestIds ?? [],
    externalGoingList: props.externalGoingList ?? [],
    externalWaitlist: props.externalWaitlist ?? [],
    externalInvitedList: props.externalInvitedList ?? [],
    externalSkippedList: props.externalSkippedList ?? [],
  };

  const isAssignedMode = props.waitlistMode === 'assigned';

  if (isAssignedMode) {
    return <AssignedParticipantScreen {...normalizedProps} />;
  }

  return <AutomaticParticipantScreen {...normalizedProps} />;
};
