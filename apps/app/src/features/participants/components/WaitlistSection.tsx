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
  useParticipantPosition?: boolean;
  isHost?: boolean;
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
  useParticipantPosition = false,
  isHost = false,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Stop pointer and touch events from bubbling to any outer Framer Motion drag handler (e.g. the
  // horizontal pager in PlanChatScreen). Must be a *native* addEventListener because
  // React synthetic events don't stop Framer Motion's native listeners.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('pointerdown', stop);
    el.addEventListener('touchstart', stop, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', stop);
      el.removeEventListener('touchstart', stop);
    };
  }, []);

  if (waitlist.length === 0 && !onAddFriends) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
        <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.3)', textAlign: 'center' }}>
          No participants in Waitlist.
        </span>
      </div>
    );
  }

  const hasWaitlistNumbers = waitlist.some(
    (item) => typeof item.waitlistPosition === 'number' || typeof (item as any).waitlist_position === 'number'
  );
  const effectiveShowIndex = useParticipantPosition ? (showIndex && hasWaitlistNumbers) : showIndex;

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', position: 'relative', overflow: 'visible' }}
    >
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
            const itemPos = typeof item.waitlistPosition === 'number'
              ? item.waitlistPosition
              : (typeof (item as any).waitlist_position === 'number' ? (item as any).waitlist_position : undefined);
            const itemIndex = useParticipantPosition ? itemPos : (idx + indexOffset);
            const shouldShowIndex = Boolean(effectiveShowIndex && itemIndex !== undefined);

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
                  isHost={isHost}
                  index={itemIndex}
                  showIndex={shouldShowIndex}
                  onClick={onItemTap ? () => onItemTap(item) : undefined}
                />
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      ) : (
        waitlist.map((item, idx) => {
          const itemKey = item.dbUuid || item.id;
          const itemPos = typeof item.waitlistPosition === 'number'
            ? item.waitlistPosition
            : (typeof (item as any).waitlist_position === 'number' ? (item as any).waitlist_position : undefined);
          const itemIndex = useParticipantPosition ? itemPos : (idx + indexOffset);
          const shouldShowIndex = Boolean(effectiveShowIndex && itemIndex !== undefined);

          return (
            <StackingFriends
              key={itemKey}
              item={item}
              isHost={isHost}
              index={itemIndex}
              showIndex={shouldShowIndex}
              onClick={onItemTap ? () => onItemTap(item) : undefined}
            />
          );
        })
      )}

    </div>
  );
};
