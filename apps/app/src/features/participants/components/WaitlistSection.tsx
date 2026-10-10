import React from 'react';
import { Reorder } from 'motion/react';
import { StackingFriends } from './StackingFriends';
import { Friend } from '../shared/types';
import { normalizeStatus } from '../../../../lib/participantStatus';

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
  waitlistMode?: 'automatic' | 'assigned';
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
  waitlistMode,
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

  // In Automatic mode, compute canonical FCFS positions for WAITLISTED participants who lack itemPos
  const automaticPositionsMap = React.useMemo(() => {
    if (waitlistMode !== 'automatic') return null;

    const waitlistedMembers = waitlist.filter((m) => {
      const st = normalizeStatus(m.rsvpStatus || (m as any).rsvp_status || (m as any).joinState || (m as any).status);
      return st === 'WAITLISTED';
    });

    const allHavePos = waitlistedMembers.every((m) => {
      return typeof m.waitlistPosition === 'number' || typeof (m as any).waitlist_position === 'number';
    });

    if (allHavePos) return null;

    const sorted = [...waitlistedMembers].sort((a, b) => {
      const posA = typeof a.waitlistPosition === 'number'
        ? a.waitlistPosition
        : (typeof (a as any).waitlist_position === 'number' ? (a as any).waitlist_position : null);
      const posB = typeof b.waitlistPosition === 'number'
        ? b.waitlistPosition
        : (typeof (b as any).waitlist_position === 'number' ? (b as any).waitlist_position : null);
      if (posA !== null && posB !== null && posA !== posB) return posA - posB;

      const rawA = a.joinedQueueAt || (a as any).joined_queue_at || (a as any).join_queue_at || (a as any).responded_at || (a as any).created_at;
      const rawB = b.joinedQueueAt || (b as any).joined_queue_at || (b as any).join_queue_at || (b as any).responded_at || (b as any).created_at;
      const tA = rawA ? new Date(rawA).getTime() : null;
      const tB = rawB ? new Date(rawB).getTime() : null;

      if (tA !== null && tB !== null && !isNaN(tA) && !isNaN(tB) && tA !== tB) return tA - tB;
      if (tA !== null && !isNaN(tA)) return -1;
      if (tB !== null && !isNaN(tB)) return 1;

      const nameA = a.name || (a as any).full_name || (a as any).username || '';
      const nameB = b.name || (b as any).full_name || (b as any).username || '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });

    const map = new Map<string, number>();
    sorted.forEach((item, idx) => {
      const key = item.dbUuid || item.id || (item as any).user_id || (item as any).userId || (item as any).userUuid;
      if (key) {
        map.set(String(key), idx + 1);
      }
    });
    return map;
  }, [waitlist, waitlistMode]);

  const getItemIndexAndShow = (item: Friend, idx: number) => {
    const rawStatus = item.rsvpStatus || (item as any).rsvp_status || (item as any).joinState || (item as any).status;
    const status = normalizeStatus(rawStatus);
    const isWaitlisted = status === 'WAITLISTED';

    const itemPos = typeof item.waitlistPosition === 'number'
      ? item.waitlistPosition
      : (typeof (item as any).waitlist_position === 'number' ? (item as any).waitlist_position : undefined);

    if (waitlistMode === 'automatic') {
      // In Automatic mode:
      // 1. Display waitlist numbers ONLY for participants whose rsvp_status is WAITLISTED.
      // 2. Invited participants must NEVER receive or display a number.
      // 3. Numbers must follow first-come, first-served order (persisted waitlist_position or canonical queue order).
      // 4. Do NOT derive positions from participant's display order or list index.
      if (!isWaitlisted) {
        return { itemIndex: undefined, shouldShowIndex: false };
      }

      const itemKey = item.dbUuid || item.id || (item as any).user_id || (item as any).userId || (item as any).userUuid;
      const canonicalPos = itemPos ?? (automaticPositionsMap && itemKey ? automaticPositionsMap.get(String(itemKey)) : undefined);
      if (typeof canonicalPos === 'number') {
        return { itemIndex: canonicalPos, shouldShowIndex: Boolean(showIndex) };
      }

      return { itemIndex: undefined, shouldShowIndex: false };
    }

    // Assigned mode (preserved exactly as before)
    const itemIndex = useParticipantPosition
      ? (itemPos !== undefined ? itemPos : (idx + indexOffset))
      : (idx + indexOffset);
    const shouldShowIndex = Boolean(effectiveShowIndex && itemIndex !== undefined);

    return { itemIndex, shouldShowIndex };
  };

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
            const itemKey = item.dbUuid || item.id || (item as any).user_id || (item as any).userId || (item as any).userUuid;
            if (!itemKey) return null;
            const { itemIndex, shouldShowIndex } = getItemIndexAndShow(item, idx);

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
          const itemKey = item.dbUuid || item.id || (item as any).user_id || (item as any).userId || (item as any).userUuid;
          if (!itemKey) return null;
          const { itemIndex, shouldShowIndex } = getItemIndexAndShow(item, idx);

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
