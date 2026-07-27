import React from 'react';
import { Reorder } from 'motion/react';
import { StackingFriends } from './StackingFriends';

interface Friend {
  id: string;
  dbUuid: string;
  name: string;
  avatar: string;
  isHost?: boolean;
}

interface WaitlistSectionProps {
  waitlist: Friend[];
  onItemTap?: (item: Friend) => void;
  onAddFriends?: () => void;
  onReorder?: (newWaitlist: Friend[]) => void;
  reorderable?: boolean;
  showIndex?: boolean;
}

export const WaitlistSection: React.FC<WaitlistSectionProps> = ({
  waitlist,
  onItemTap,
  onAddFriends,
  onReorder,
  reorderable = true,
  showIndex = true,
}) => {
  if (waitlist.length === 0 && !onAddFriends) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
        <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.3)', textAlign: 'center' }}>
          No participants in Waitlist.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {reorderable && onReorder && waitlist.length > 1 ? (
        <Reorder.Group
          axis="y"
          values={waitlist}
          onReorder={onReorder}
          as="div"
          style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}
        >
          {waitlist.map((item, idx) => (
            <Reorder.Item
              key={item.id}
              value={item}
              id={item.id}
              as="div"
              whileDrag={{
                scale: 1.02,
                boxShadow: '0 12px 28px rgba(0, 0, 0, 0.7)',
                zIndex: 50,
              }}
              style={{ position: 'relative', cursor: 'grab', touchAction: 'none' }}
            >
              <StackingFriends
                item={item}
                index={idx + 1}
                showIndex={showIndex}
                onClick={onItemTap ? () => onItemTap(item) : undefined}
              />
            </Reorder.Item>
          ))}
        </Reorder.Group>
      ) : (
        waitlist.map((item, idx) => (
          <StackingFriends
            key={item.id}
            item={item}
            index={idx + 1}
            showIndex={showIndex}
            onClick={onItemTap ? () => onItemTap(item) : undefined}
          />
        ))
      )}

    </div>
  );
};
