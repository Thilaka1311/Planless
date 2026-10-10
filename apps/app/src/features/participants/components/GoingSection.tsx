import React from 'react';
import { StackingFriends } from './StackingFriends';
import { Friend } from '../shared/types';

interface GoingSectionProps {
  goingList: Friend[];
  onItemTap?: (item: Friend) => void;
  showIndex?: boolean;
  isHost?: boolean;
}

export const GoingSection: React.FC<GoingSectionProps> = ({
  goingList,
  onItemTap,
  showIndex = false,
  isHost = false,
}) => {
  if (goingList.length === 0) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
        <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.3)', textAlign: 'center' }}>
          No participants in Joined.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
      {goingList.map((item) => {
        const itemKey = item.dbUuid || item.id || (item as any).user_id || (item as any).userId || (item as any).userUuid;
        if (!itemKey) return null;
        return (
          <StackingFriends
            key={itemKey}
            item={item}
            isHost={isHost}
            index={undefined}
            showIndex={false}
            onClick={onItemTap ? () => onItemTap(item) : undefined}
          />
        );
      })}
    </div>
  );
};
