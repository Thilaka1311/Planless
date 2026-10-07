import React from 'react';
import { ParticipantTab } from '../shared/types';
import {
  SegmentedStatusToggle,
  StatusTabItem,
} from '../../plans/components/PlansDivider';

interface AutomaticParticipantTabsProps {
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
}

export const AutomaticParticipantTabs: React.FC<AutomaticParticipantTabsProps> = ({
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
      if (key === 'invited') label = `Invited (${invitedCount ?? 0})`;
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
    <div className="px-5 my-4 shrink-0">
      <SegmentedStatusToggle
        tabs={tabs}
        selected={activeTab}
        onSelect={handleSelect}
        layoutId="automatic_participant_tabs_active_pill"
      />
    </div>
  );
};
