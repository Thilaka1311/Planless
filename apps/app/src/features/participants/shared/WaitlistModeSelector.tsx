import React from 'react';

interface WaitlistModeSelectorProps {
  waitlistMode?: 'automatic' | 'assigned';
  onWaitlistModeChange?: (mode: 'automatic' | 'assigned') => void;
  isHostUser?: boolean;
  isInviteOnly?: boolean;
}

export const WaitlistModeSelector: React.FC<WaitlistModeSelectorProps> = ({
  waitlistMode = 'automatic',
  onWaitlistModeChange,
  isHostUser = false,
  isInviteOnly = false,
}) => {
  if (!isHostUser || isInviteOnly || !onWaitlistModeChange) {
    return null;
  }

  const isAutomatic = waitlistMode === 'automatic';

  return (
    <div style={{ padding: '0 20px', marginBottom: 12 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '14px 16px',
          background: '#111111',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', fontFamily: 'Inter, sans-serif' }}>
            Waitlist Mode
          </span>
          <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.4)', fontFamily: 'Inter, sans-serif' }}>
            {isAutomatic
              ? 'Queue ordering and promotions happen automatically'
              : 'Host manually manages Going and Waitlist placements'}
          </span>
        </div>

        {/* Segmented Control */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: 12,
            padding: 3,
            position: 'relative',
            height: 36,
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 3,
              bottom: 3,
              left: isAutomatic ? '3px' : 'calc(50% + 1.5px)',
              width: 'calc(50% - 4.5px)',
              background: '#FF6B2C',
              borderRadius: 9,
              transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
              boxShadow: '0 2px 8px rgba(255, 107, 44, 0.3)',
            }}
          />

          <button
            type="button"
            onClick={() => onWaitlistModeChange('automatic')}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              color: isAutomatic ? '#FFFFFF' : '#8E8E93',
              fontSize: 12,
              fontWeight: isAutomatic ? 700 : 500,
              cursor: 'pointer',
              zIndex: 2,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Inter, sans-serif',
              transition: 'color 0.2s ease',
            }}
          >
            Automatic
          </button>

          <button
            type="button"
            onClick={() => onWaitlistModeChange('assigned')}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              color: !isAutomatic ? '#FFFFFF' : '#8E8E93',
              fontSize: 12,
              fontWeight: !isAutomatic ? 700 : 500,
              cursor: 'pointer',
              zIndex: 2,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Inter, sans-serif',
              transition: 'color 0.2s ease',
            }}
          >
            Assigned
          </button>
        </div>
      </div>
    </div>
  );
};
