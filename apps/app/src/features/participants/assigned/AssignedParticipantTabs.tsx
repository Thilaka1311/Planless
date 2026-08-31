import React from 'react';
import { Plus } from 'lucide-react';
import { ParticipantTab } from '../shared/types';

interface AssignedParticipantTabsProps {
  visibleTabs: ParticipantTab[];
  activeTab: ParticipantTab;
  goingCount: number;
  capacity?: number;
  waitlistCount: number;
  invitedCount?: number;
  skippedCount?: number;
  isCompletedPlan?: boolean;
  hideCapacityDenominator?: boolean;
  onTabChange: (tab: ParticipantTab) => void;
  onTapInvited?: () => void;
}

export const AssignedParticipantTabs: React.FC<AssignedParticipantTabsProps> = ({
  visibleTabs,
  activeTab,
  goingCount,
  capacity,
  waitlistCount,
  invitedCount,
  skippedCount,
  isCompletedPlan,
  hideCapacityDenominator = false,
  onTabChange,
  onTapInvited,
}) => {
  const tabCount = visibleTabs.length;

  if (tabCount === 0) {
    return null;
  }

  const activeTabIndex = Math.max(0, visibleTabs.indexOf(activeTab));
  const pillWidth = `calc(${100 / tabCount}% - 3px)`;
  const pillLeft =
    activeTabIndex === 0
      ? '2px'
      : `calc(${(activeTabIndex * 100) / tabCount}% + 1px)`;

  const tabLabelColor = (key: ParticipantTab) =>
    activeTab === key ? '#FFFFFF' : '#8E8E93';

  return (
    <div style={{ padding: '0 20px', margin: '16px 0 8px 0', flexShrink: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: 20,
          padding: 3,
          position: 'relative',
          height: 38,
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: pillLeft,
            width: pillWidth,
            background:
              activeTab === 'going'
                ? '#064E3B'
                : activeTab === 'invited'
                ? 'rgba(255, 255, 255, 0.14)'
                : activeTab === 'waitlist'
                ? '#b45309'
                : activeTab === 'skipped'
                ? '#991b1b'
                : 'rgba(255, 255, 255, 0.15)',
            borderRadius: 17,
            transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
            border:
              activeTab === 'going'
                ? '1px solid #059669'
                : activeTab === 'invited'
                ? '1px solid rgba(255, 255, 255, 0.12)'
                : activeTab === 'waitlist'
                ? '1px solid #d97706'
                : activeTab === 'skipped'
                ? '1px solid #dc2626'
                : '1px solid rgba(255,255,255,0.1)',
          }}
        />

        {visibleTabs.map((key) => {
          let label = '';
          if (isCompletedPlan) {
            if (key === 'going') label = `Attended (${goingCount})`;
            if (key === 'skipped') label = skippedCount !== undefined ? `Skipped (${skippedCount})` : `Skipped`;
          } else {
            if (key === 'invited') label = `Invited (${invitedCount ?? goingCount})`;
            if (key === 'going') label = (capacity !== undefined && !hideCapacityDenominator) ? `Joined (${goingCount} / ${capacity})` : `Joined (${goingCount})`;
            if (key === 'waitlist') label = `Waitlist (${waitlistCount})`;
            if (key === 'skipped') label = skippedCount !== undefined ? `Skipped (${skippedCount})` : `Skipped`;
          }

          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                onTabChange(key);
                if (key === 'invited' && onTapInvited) {
                  onTapInvited();
                }
              }}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                color: tabLabelColor(key),
                fontSize: 11.5,
                fontWeight: activeTab === key ? 700 : 500,
                cursor: 'pointer',
                zIndex: 2,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.2s ease',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
