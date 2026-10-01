import React from 'react';
import { Plus } from 'lucide-react';
import { ParticipantTab } from './types';
import {
  SegmentedStatusToggle,
  StatusTabItem,
} from '../../plans/components/PlansDivider';

export interface ParticipantTabsProps {
  visibleTabs: ParticipantTab[];
  activeTab: ParticipantTab;
  goingCount: number;
  capacity?: number | null;
  waitlistCount: number;
  invitedCount?: number;
  noLimitDenominator?: number;
  skippedCount?: number;
  isCompletedPlan?: boolean;
  hideCapacityDenominator?: boolean;
  onTabChange: (tab: ParticipantTab) => void;
  onTapInvited?: () => void;
  onAddFriends?: () => void;
  className?: string;
  containerClassName?: string;
  layoutId?: string;
  rightAction?: React.ReactNode;
}

export const ParticipantTabs: React.FC<ParticipantTabsProps> = ({
  visibleTabs,
  activeTab,
  goingCount,
  capacity,
  waitlistCount,
  invitedCount,
  noLimitDenominator,
  skippedCount,
  isCompletedPlan,
  hideCapacityDenominator = false,
  onTabChange,
  onTapInvited,
  onAddFriends,
  className,
  containerClassName = "px-5 my-4 shrink-0",
  layoutId = "participant_tabs_active_pill",
  rightAction,
}) => {
  if (visibleTabs.length === 0) {
    return null;
  }

  const tabs: StatusTabItem<ParticipantTab>[] = visibleTabs.map((key) => {
    let label = '';
    if (isCompletedPlan) {
      if (key === 'going') label = `Attended (${goingCount})`;
      if (key === 'skipped') label = skippedCount !== undefined ? `Skipped (${skippedCount})` : `Skipped`;
    } else {
      if (key === 'invited') label = `Invited (${invitedCount ?? goingCount})`;
      if (key === 'going') {
        const isNoLimit = capacity === undefined || capacity === null;
        const denominator = isNoLimit ? (noLimitDenominator ?? invitedCount ?? goingCount) : capacity;
        label = (!hideCapacityDenominator && denominator !== undefined && denominator !== null)
          ? `Joined (${goingCount} / ${denominator})`
          : `Joined (${goingCount})`;
      }
      if (key === 'waitlist') label = `Waitlist (${waitlistCount})`;
      if (key === 'skipped') label = skippedCount !== undefined ? `Skipped (${skippedCount})` : `Skipped`;
    }

    return {
      id: key,
      label,
      statusType: key,
    };
  });

  const handleSelect = (tab: ParticipantTab) => {
    onTabChange(tab);
    if (tab === 'invited' && onTapInvited) {
      onTapInvited();
    }
  };

  return (
    <div className={containerClassName}>
      <SegmentedStatusToggle
        className={className}
        tabs={tabs}
        selected={activeTab}
        onSelect={handleSelect}
        layoutId={layoutId}
      />
      {rightAction}
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
