import React from 'react';
import { ParticipantManagementScreenProps } from '../shared/types';
import { AutomaticParticipantScreen } from '../automatic/AutomaticParticipantScreen';
import { AssignedParticipantScreen } from '../assigned/AssignedParticipantScreen';

export type { Friend, ParticipantTab, SharedParticipantScreenProps as ParticipantManagementScreenProps } from '../shared/types';

export const ParticipantManagementScreen: React.FC<ParticipantManagementScreenProps> = (props) => {
  const isAssignedMode = props.waitlistMode === 'assigned';

  if (isAssignedMode) {
    return <AssignedParticipantScreen {...props} />;
  }

  return <AutomaticParticipantScreen {...props} />;
};
