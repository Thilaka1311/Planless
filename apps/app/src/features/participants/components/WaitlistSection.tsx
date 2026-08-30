import React from 'react';
import { Reorder } from 'motion/react';
import { StackingFriends } from './StackingFriends';
import { Friend } from '../shared/types';

interface WaitlistSectionProps {
  waitlist: Friend[];
  onItemTap?: (item: Friend) => void;
  onAddFriends?: () => void;
  onReorder?: (newWaitlist: Friend[]) => void;
  onReorderComplete?: (finalWaitlist: Friend[]) => void;
  reorderable?: boolean;
  showIndex?: boolean;
  indexOffset?: number;
}

export const WaitlistSection: React.FC<WaitlistSectionProps> = ({
  waitlist,
  onItemTap,
  onAddFriends,
  onReorder,
  onReorderComplete,
  reorderable = true,
  showIndex = true,
  indexOffset = 1,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

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
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', position: 'relative' }}>
      {reorderable && onReorder && waitlist.length > 1 ? (
        <Reorder.Group
          axis="y"
          values={waitlist}
          onReorder={onReorder}
          as="div"
          style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}
        >
          {waitlist.map((item, idx) => {
            const itemKey = item.dbUuid || item.id;
            return (
              <Reorder.Item
                key={itemKey}
                value={item}
                id={itemKey}
                as="div"
                layoutId={itemKey}
                dragConstraints={containerRef}
                dragElastic={0}
                onDragEnd={() => {
                  if (onReorderComplete) {
                    onReorderComplete(waitlist);
                  }
                }}
                transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                whileDrag={{
                  scale: 1.01,
                  boxShadow: '0 8px 20px rgba(0, 0, 0, 0.6)',
                  zIndex: 50,
                }}
                style={{ position: 'relative', cursor: 'grab', touchAction: 'none' }}
              >
                <StackingFriends
                  item={item}
                  index={idx + indexOffset}
                  showIndex={showIndex}
                  onClick={onItemTap ? () => onItemTap(item) : undefined}
                />
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      ) : (
        waitlist.map((item, idx) => (
          <StackingFriends
            key={item.id}
            item={item}
            index={idx + indexOffset}
            showIndex={showIndex}
            onClick={onItemTap ? () => onItemTap(item) : undefined}
          />
        ))
      )}

    </div>
  );
};
