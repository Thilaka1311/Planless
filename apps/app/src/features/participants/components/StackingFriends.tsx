import React from 'react';
import { Crown } from 'lucide-react';
import { UserAvatar } from '../../../IMGfromDB/UserAvatar';

interface Friend {
  id: string;
  dbUuid: string;
  name: string;
  avatar: string;
  isHost?: boolean;
}

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
  isItemDragged = false
}) => {
  const renderAvatar = () => {
    return (
      <div style={{ position: 'relative', width: 28, height: 28, marginRight: 12, flexShrink: 0 }}>
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
        padding: '12px 14px',
        background: isItemDragged ? 'rgba(255, 255, 255, 0.02)' : '#161619',
        border: isItemDragged ? '1px dashed rgba(255, 255, 255, 0.15)' : '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: 8,
        cursor: draggable ? 'grab' : (onClick ? 'pointer' : 'default'),
        boxShadow: isItemDragged ? 'none' : '0 2px 6px rgba(0, 0, 0, 0.3)',
        zIndex: isItemDragged ? 0 : 1,
        position: 'relative',
        opacity: isItemDragged ? 0.25 : item.isAccepted === false ? 0.7 : 1,
        transition: 'background 0.2s ease, opacity 0.2s ease, box-shadow 0.28s ease',
      }}
      onMouseEnter={(e) => {
        if (!draggable && !isItemDragged && onClick) e.currentTarget.style.background = '#222227';
      }}
      onMouseLeave={(e) => {
        if (!draggable && !isItemDragged && onClick) e.currentTarget.style.background = '#161619';
      }}
    >
      {showIndex && index !== undefined && (
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255, 255, 255, 0.3)', marginRight: 10, minWidth: 16 }}>
          #{index}
        </span>
      )}
      {renderAvatar()}
      <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, color: item.isAccepted === false ? '#8E8E93' : '#FFFFFF', fontFamily: 'Inter, sans-serif' }}>
        {item.name}
      </span>
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
      ) : item.isAccepted === false ? (
        <span style={{
          fontSize: 11,
          fontWeight: 500,
          color: '#8E8E93',
          background: 'rgba(255, 255, 255, 0.06)',
          padding: '2px 8px',
          borderRadius: 9999,
          fontFamily: 'Inter, sans-serif',
          lineHeight: 1.2,
          display: 'inline-flex',
          alignItems: 'center',
        }}>
          Invited
        </span>
      ) : null}
    </div>
  );
};
