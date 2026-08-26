import React from "react";
import { PlanMember } from "../../../../core/types";
import { HostAttendanceScreen } from "./HostAttendanceScreen";

export interface ManageCompletedParticipantsScreenProps {
  isOpen?: boolean;
  members: PlanMember[];
  hostId: string;
  planExpense?: { total_amount: number; title?: string } | null;
  isSubmitting?: boolean;
  onConfirm: (
    attendanceInput: Array<{ user_id: string; attendance: 'ATTENDED' | 'DID_NOT_ATTEND' }>,
    expenseMode: 'SPLIT_ALL' | 'KEEP_CURRENT_COST' | 'NONE',
    usersToAdd?: string[],
    usersToRemove?: string[]
  ) => void;
  onBack: () => void;
}

export const ManageCompletedParticipantsScreen: React.FC<ManageCompletedParticipantsScreenProps> = ({
  isOpen = true,
  members = [],
  hostId,
  planExpense = null,
  isSubmitting = false,
  onConfirm,
  onBack,
}) => {
  return (
    <HostAttendanceScreen
      isOpen={isOpen}
      members={members}
      hostId={hostId}
      planExpense={planExpense}
      isSubmitting={isSubmitting}
      isCompletedMode={true}
      onConfirm={onConfirm}
      onBack={onBack}
    />
  );
};

export default ManageCompletedParticipantsScreen;
