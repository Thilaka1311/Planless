import React from 'react';
import { Plus } from 'lucide-react';
import { ParticipantTab } from './types';
import {
  SegmentedStatusToggle,
  StatusTabItem,
} from '../../plans/components/PlansDivider';

interface ParticipantTabsProps {
  visibleTabs: ParticipantTab[];
  activeTab: ParticipantTab;
  goingCount: number;
  capacity: number;
  waitlistCount: number;
  invitedCount: number;
  onTabChange: (tab: ParticipantTab) => void;
  onAddFriends?: () => void;
}

export const ParticipantTabs: React.FC<ParticipantTabsProps> = ({
  visibleTabs,
  activeTab,
  goingCount,
  capacity,
  waitlistCount,
  invitedCount,
  onTabChange,
  onAddFriends,
}) => {
  if (visibleTabs.length === 0) {
    return null;
  }

  const tabs: StatusTabItem<ParticipantTab>[] = visibleTabs.map((key) => {
    let label = '';
    if (key === 'invited') label = `Invited (${invitedCount})`;
    if (key === 'going') label = `Going (${goingCount} / ${capacity})`;
    if (key === 'waitlist') label = `Waitlist (${waitlistCount})`;

    return {
      id: key,
      label,
      statusType: key,
    };
  });

  return (
    <div className="px-5 my-4 shrink-0 flex items-center gap-2">
      <SegmentedStatusToggle
        className="flex-1"
        tabs={tabs}
        selected={activeTab}
        onSelect={onTabChange}
        layoutId="shared_participant_tabs_active_pill"
      />
      {onAddFriends && (
        <button
          onClick={onAddFriends}
          title="Invite People"
          type="button"
          className="h-10 w-10 rounded-[20px] bg-[#0A0A0C] border border-[#1A1A1A] text-white/80 hover:text-white transition flex items-center justify-center cursor-pointer shrink-0 shadow-sm"
        >
          <Plus className="w-4 h-4 text-white" />
        </button>
      )}
    </div>
  );
};
