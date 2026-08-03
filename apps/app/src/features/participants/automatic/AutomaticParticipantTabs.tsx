import React from 'react';
import { Plus } from 'lucide-react';
import { ParticipantTab } from '../shared/types';

interface AutomaticParticipantTabsProps {
  visibleTabs: ParticipantTab[];
  activeTab: ParticipantTab;
  goingCount: number;
  capacity: number;
  waitlistCount: number;
  invitedCount: number;
  onTabChange: (tab: ParticipantTab) => void;
}

export const AutomaticParticipantTabs: React.FC<AutomaticParticipantTabsProps> = ({
  visibleTabs,
  activeTab,
  goingCount,
  capacity,
  waitlistCount,
  invitedCount,
  onTabChange,
}) => {
  const tabCount = visibleTabs.length;
  const activeTabIndex = Math.max(0, visibleTabs.indexOf(activeTab));
  const pillWidth = `calc(${100 / tabCount}% - 3px)`;
  const pillLeft =
    activeTabIndex === 0
      ? '2px'
      : `calc(${(activeTabIndex * 100) / tabCount}% + 1px)`;

  const tabLabelColor = (key: ParticipantTab) =>
    activeTab === key ? '#FFFFFF' : '#8E8E93';

  return (
    <div style={{ padding: '0 20px', margin: '16px 0 8px 0', shrink: 0 }}>
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
            background: activeTab === 'going' ? '#064E3B' : 'rgba(255, 255, 255, 0.15)',
            borderRadius: 17,
            transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
            border: activeTab === 'going' ? '1px solid #059669' : '1px solid rgba(255,255,255,0.1)',
          }}
        />

        {visibleTabs.map((key) => {
          let label = '';
          if (key === 'invited') label = 'Invited';
          if (key === 'going') label = `Joined (${goingCount} / ${capacity})`;
          if (key === 'waitlist') label = `Waitlist (${waitlistCount})`;

          return (
            <button
              key={key}
              onClick={() => onTabChange(key)}
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
