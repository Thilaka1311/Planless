import React from 'react';
import { UserAvatar } from '../../../IMGfromDB/UserAvatar';
import { PendingLeaveParticipant } from '../shared/types';

interface PendingDecisionsSectionProps {
  pendingRequests: PendingLeaveParticipant[];
  onReplaceParticipant?: (participantId: string) => void;
  onKeepPayment?: (participantId: string) => void;
}

export const PendingDecisionsSection: React.FC<PendingDecisionsSectionProps> = ({
  pendingRequests,
  onReplaceParticipant,
  onKeepPayment,
}) => {
  if (!pendingRequests || pendingRequests.length === 0) {
    return null;
  }

  return (
    <div style={{ padding: '0 20px', margin: '4px 0 12px' }}>
      <div
        style={{
          background: 'rgba(24, 24, 27, 0.82)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: 16,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
        }}
      >
        {/* Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: '#F59E0B',
              textTransform: 'uppercase',
            }}
          >
            Pending Decisions ({pendingRequests.length})
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)', fontFamily: 'Inter, sans-serif' }}>
            Host Action Required
          </span>
        </div>

        {/* List of Pending Leave Participants */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pendingRequests.map((req) => (
            <div
              key={req.id}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 12,
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {/* Participant Profile Info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.15)', flexShrink: 0, background: '#1A1A1A' }}>
                  <UserAvatar src={req.avatar || ''} alt={req.name} size="w-full h-full" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.2' }}>
                    {req.name}
                  </span>
                  <span style={{ fontSize: 11.5, color: '#F59E0B', marginTop: 2, fontWeight: 500, lineHeight: '1.2' }}>
                    Wants to leave this plan
                  </span>
                </div>
              </div>

              {/* Decision Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onReplaceParticipant?.(req.id)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#FFFFFF',
                    background: 'rgba(245, 158, 11, 0.2)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontFamily: 'Inter, sans-serif',
                    transition: 'all 0.15s ease',
                  }}
                  className="hover:bg-amber-500/30 active:scale-[0.98]"
                >
                  Replace Participant
                </button>

                <button
                  type="button"
                  onClick={() => onKeepPayment?.(req.id)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#E4E4E7',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontFamily: 'Inter, sans-serif',
                    transition: 'all 0.15s ease',
                  }}
                  className="hover:bg-white/15 active:scale-[0.98]"
                >
                  Keep Payment
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
