import React from 'react';

interface WaitlistModeSelectorProps {
  waitlistMode?: 'automatic' | 'assigned';
  onWaitlistModeChange?: (mode: 'automatic' | 'assigned') => void;
  isHost?: boolean;
}

export const WaitlistModeSelector: React.FC<WaitlistModeSelectorProps> = ({
  waitlistMode = 'automatic',
  onWaitlistModeChange,
  isHost = true,
}) => {
  if (!isHost) return null;

  return (
    <div style={{ padding: '0 20px', marginBottom: 12 }}>
      <div
        style={{
          background: '#111111',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>
            Waitlist Mode
          </span>
          <span style={{ fontSize: 11, color: '#A1A1AA', lineHeight: 1.4 }}>
            {waitlistMode === 'assigned'
              ? 'You decide who is Joined and who is Waitlisted. Acceptance order does not affect placement.'
              : 'Participants fill available spots in the order they accept invitations. Additional participants are automatically waitlisted.'}
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
            height: 38,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            width: '100%',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 3,
              bottom: 3,
              background: '#FF6B2C',
              borderRadius: 9,
              transition: 'all 250ms cubic-bezier(0.2, 0.8, 0.2, 1)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              left: waitlistMode === 'automatic' ? 3 : 'calc(50% + 1.5px)',
              width: 'calc(50% - 4.5px)',
            }}
          />

          <button
            type="button"
            onClick={() => onWaitlistModeChange && onWaitlistModeChange('automatic')}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              fontSize: 12,
              cursor: 'pointer',
              zIndex: 10,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: waitlistMode === 'automatic' ? 700 : 500,
              color: waitlistMode === 'automatic' ? '#FFFFFF' : '#A1A1AA',
              transition: 'color 200ms',
            }}
          >
            Automatic
          </button>

          <button
            type="button"
            onClick={() => onWaitlistModeChange && onWaitlistModeChange('assigned')}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              fontSize: 12,
              cursor: 'pointer',
              zIndex: 10,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: waitlistMode === 'assigned' ? 700 : 500,
              color: waitlistMode === 'assigned' ? '#FFFFFF' : '#A1A1AA',
              transition: 'color 200ms',
            }}
          >
            Assigned
          </button>
        </div>
      </div>
    </div>
  );
};
