import React from 'react';
import { Crown } from 'lucide-react';
import { UserAvatar } from '../../../IMGfromDB/UserAvatar';

import { Friend } from '../shared/types';
import { formatSkipReason } from '../../../../lib/participantStatus';

interface StackingFriendsProps {
  item: Friend;
  index?: number;
  showIndex?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onClick?: () => void;
  isItemDragged?: boolean;
  className?: string;
}

export const StackingFriends: React.FC<StackingFriendsProps> = ({
  item,
  index,
  showIndex = false,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onClick,
  isItemDragged = false,
  className = '',
}) => {
  const isRejoined = item.rsvpStatus === 'REJOINED' || (item as any).rsvp_status === 'REJOINED';
  const isSkipped = !isRejoined && (item.rsvpStatus === 'SKIPPED' || (item as any).rsvp_status === 'SKIPPED' || Boolean(item.skipReason || (item as any).skip_reason));
  const isDulled = item.isAccepted === false || item.rsvpStatus === 'INVITED' || (item as any).rsvp_status === 'INVITED' || isSkipped || isRejoined;
  const skipReasonText = isRejoined ? '' : formatSkipReason(item.skipReason || (item as any).skip_reason || (isSkipped ? 'SKIPPED' : null));

  const indexLabel = (() => {
    if (!showIndex) return null;
    if (index !== undefined) {
      return `#${index}`;
    }
    const rawPos = typeof item.waitlistPosition === 'number'
      ? item.waitlistPosition
      : (typeof (item as any).waitlist_position === 'number' ? (item as any).waitlist_position : null);

    if (rawPos !== null) {
      return `#${rawPos}`;
    }

    return null;
  })();

  const renderAvatar = () => {
    return (
      <div style={{ position: 'relative', width: 28, height: 28, marginRight: 12, flexShrink: 0, opacity: isDulled ? 0.6 : 1 }}>
        <UserAvatar
          src={item.avatar}
          alt={item.name}
          size="w-7 h-7"
        />
      </div>
    );
  };

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 4px',
        background: isItemDragged ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
        border: isItemDragged ? '1px dashed rgba(255, 255, 255, 0.15)' : 'none',
        borderRadius: 8,
        cursor: draggable ? 'grab' : (onClick ? 'pointer' : 'default'),
        boxShadow: 'none',
        zIndex: isItemDragged ? 0 : 1,
        position: 'relative',
        opacity: isItemDragged ? 0.25 : isDulled ? 0.55 : 1,
        transition: 'background 0.2s ease, opacity 0.2s ease',
      }}
      className={`select-none ${className}`}
      onMouseEnter={(e) => {
        if (!draggable && !isItemDragged && onClick) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
      }}
      onMouseLeave={(e) => {
        if (!draggable && !isItemDragged && onClick) e.currentTarget.style.background = 'transparent';
      }}
    >
      {showIndex && (
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'rgba(255, 255, 255, 0.4)',
          marginRight: 10,
          width: 24,
          minWidth: 24,
          display: 'inline-flex',
          alignItems: 'center',
          flexShrink: 0,
          fontFamily: 'Inter, sans-serif'
        }}>
          {indexLabel || ''}
        </span>
      )}
      {renderAvatar()}
      <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, color: isDulled ? '#8E8E93' : '#FFFFFF', fontFamily: 'Inter, sans-serif' }}>
        {item.name}
      </span>
      {skipReasonText && (
        <span style={{
          fontSize: 11,
          fontWeight: 500,
          color: 'rgba(255, 255, 255, 0.5)',
          marginRight: item.isHost ? 10 : 4,
          lineHeight: 1,
          flexShrink: 0,
          fontFamily: 'Inter, sans-serif',
        }}>
          {skipReasonText}
        </span>
      )}
      {Boolean(item.leave_requested === true || (item as any).leaveRequested === true || isRejoined) && (
        <span
          title={isRejoined ? "Requested to rejoin" : "Requested to leave"}
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: '#F59E0B',
            marginRight: item.isHost || isDulled ? 10 : 4,
            lineHeight: 1,
            flexShrink: 0,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          !
        </span>
      )}
      {item.isHost ? (
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#F59E0B',
          background: 'rgba(245, 158, 11, 0.12)',
          padding: '2px 8px',
          borderRadius: 9999,
          fontFamily: 'Inter, sans-serif',
          lineHeight: 1.2,
          display: 'inline-flex',
          alignItems: 'center',
        }}>
          Host
        </span>
      ) : null}
    </div>
  );
};
