import React from 'react';
import { StackingFriends } from './StackingFriends';

interface Friend {
  id: string;
  dbUuid: string;
  name: string;
  avatar: string;
  isHost?: boolean;
}

interface GoingSectionProps {
  goingList: Friend[];
  onItemTap?: (item: Friend) => void;
  showIndex?: boolean;
}

export const GoingSection: React.FC<GoingSectionProps> = ({
  goingList,
  onItemTap,
  showIndex = false,
}) => {
  if (goingList.length === 0) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
        <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.3)', textAlign: 'center' }}>
          No participants in Going.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {goingList.map((item, idx) => (
        <StackingFriends
          key={item.dbUuid || item.id}
          item={item}
          index={idx + 1}
          showIndex={showIndex}
          onClick={onItemTap ? () => onItemTap(item) : undefined}
        />
      ))}
    </div>
  );
};
