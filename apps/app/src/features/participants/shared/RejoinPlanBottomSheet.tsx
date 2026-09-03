import React, { useRef } from 'react';
import { UserAvatar } from '../../../IMGfromDB/UserAvatar';
import { Friend } from './types';

interface RejoinPlanBottomSheetProps {
  isOpen: boolean;
  participant: Friend | null;
  onAddToJoined: (participant: Friend) => void;
  onAddToWaitlist: (participant: Friend) => void;
  onRemoveFromPlan: (participant: Friend) => void;
  onClose: () => void;
}

export const RejoinPlanBottomSheet: React.FC<RejoinPlanBottomSheetProps> = ({
  isOpen,
  participant,
  onAddToJoined,
  onAddToWaitlist,
  onRemoveFromPlan,
  onClose,
}) => {
  const isProcessingRef = useRef(false);

  if (!isOpen || !participant) return null;

  const handleAction = (actionFn: () => void | Promise<void>) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    onClose();

    Promise.resolve()
      .then(async () => {
        try {
          await actionFn();
        } finally {
          isProcessingRef.current = false;
        }
      })
      .catch((err) => {
        console.error('[RejoinPlanBottomSheet] Action error:', err);
      });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: '#1C1C1E',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '16px 20px 32px',
          color: '#FFFFFF',
          boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.3)',
          animation: 'slideUp 0.28s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255, 255, 255, 0.15)' }} />
        </div>

        {/* Header with Avatar & Details */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <UserAvatar src={participant.avatar} alt={participant.name} size="w-10 h-10" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{participant.name}</span>
            <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', fontWeight: 400 }}>
              Wants to rejoin this plan
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 1. Add to Joined */}
          <button
            type="button"
            onClick={() => handleAction(() => onAddToJoined(participant))}
            style={{
              width: '100%',
              padding: '14px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: 12,
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
          >
            Add to Joined
          </button>

          {/* 2. Add to Waitlist */}
          <button
            type="button"
            onClick={() => handleAction(() => onAddToWaitlist(participant))}
            style={{
              width: '100%',
              padding: '14px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: 12,
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
          >
            Add to Waitlist
          </button>

          {/* 3. Remove from plan */}
          <button
            type="button"
            onClick={() => handleAction(() => onRemoveFromPlan(participant))}
            style={{
              width: '100%',
              padding: '14px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: 'none',
              borderRadius: 12,
              color: '#EF4444',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
          >
            Remove from plan
          </button>

          {/* Cancel */}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              padding: '14px',
              background: 'none',
              border: 'none',
              borderRadius: 12,
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'center',
              marginTop: 4,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
