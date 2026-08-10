import React, { useRef } from 'react';
import { UserAvatar } from '../../../IMGfromDB/UserAvatar';
import { Friend, ParticipantTab } from '../shared/types';

interface AssignedParticipantActionsProps {
  selectedItem: Friend | null;
  sheetType: ParticipantTab | null;
  showConfirmRemove: boolean;
  isHostUser: boolean;
  userProfile?: any;
  goingCount?: number;
  waitlistCount?: number;
  onClose: () => void;
  onShowConfirmRemove: (show: boolean) => void;
  onMoveToWaitlist?: (item: Friend) => void;
  onMoveToGoing?: (item: Friend) => void;
  onPromoteHost?: (item: Friend) => void;
  onDemoteHost?: (item: Friend) => void;
  onRemoveParticipant: (item: Friend) => void;
}

export const AssignedParticipantActions: React.FC<AssignedParticipantActionsProps> = ({
  selectedItem,
  sheetType,
  showConfirmRemove,
  isHostUser,
  userProfile,
  goingCount,
  waitlistCount,
  onClose,
  onShowConfirmRemove,
  onMoveToWaitlist,
  onMoveToGoing,
  onPromoteHost,
  onDemoteHost,
  onRemoveParticipant,
}) => {
  const isActionProcessingRef = useRef(false);

  if (!selectedItem || !sheetType) return null;

  const canMoveToWaitlist = (goingCount === undefined || goingCount > 2) || (waitlistCount !== undefined && waitlistCount > 0);

  const executeActionWithImmediateDismiss = (actionFn: () => Promise<void> | void) => {
    if (isActionProcessingRef.current) return;
    isActionProcessingRef.current = true;
    onClose();

    Promise.resolve()
      .then(async () => {
        try {
          await actionFn();
        } finally {
          isActionProcessingRef.current = false;
        }
      })
      .catch((err) => {
        console.error('[AssignedParticipantActions] Action error:', err);
      });
  };

  const isSelf = Boolean(
    (userProfile?.dbUuid && (selectedItem.dbUuid === userProfile.dbUuid || selectedItem.id === userProfile.dbUuid)) ||
    (userProfile?.user_id && (selectedItem.id === userProfile.user_id || selectedItem.dbUuid === userProfile.user_id)) ||
    selectedItem.name === 'You'
  );

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
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255, 255, 255, 0.15)' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <UserAvatar src={selectedItem.avatar} alt={selectedItem.name} size="w-10 h-10" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{selectedItem.name}</span>
            <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.4)' }}>
              {sheetType === 'going' ? 'Going' : sheetType === 'waitlist' ? 'Waitlist' : 'Invited'}
            </span>
          </div>
        </div>

        {!showConfirmRemove ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {onMoveToWaitlist && sheetType === 'going' && !selectedItem.isHost && canMoveToWaitlist && (
              <button
                onClick={() => onMoveToWaitlist(selectedItem)}
                style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 12, color: '#FFFFFF', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                Move to Waitlist
              </button>
            )}
            {onMoveToGoing && sheetType === 'waitlist' && (
              <button
                onClick={() => onMoveToGoing(selectedItem)}
                style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 12, color: '#FFFFFF', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                Move to Going
              </button>
            )}

            {onPromoteHost && (selectedItem.rsvpStatus === 'JOINED' || selectedItem.isAccepted === true) && !selectedItem.isHost && (
              <button
                onClick={() => {
                  executeActionWithImmediateDismiss(() => onPromoteHost(selectedItem));
                }}
                style={{ width: '100%', padding: '14px', background: 'rgba(245,158,11,0.08)', border: 'none', borderRadius: 12, color: '#F59E0B', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                Make Host
              </button>
            )}

            {onDemoteHost && selectedItem.isHost && (
              <button
                onClick={() => {
                  executeActionWithImmediateDismiss(() => onDemoteHost(selectedItem));
                }}
                style={{ width: '100%', padding: '14px', background: 'rgba(245,158,11,0.08)', border: 'none', borderRadius: 12, color: '#F59E0B', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                {isSelf ? 'Stop Hosting' : 'Remove Host'}
              </button>
            )}

            {isHostUser && (!selectedItem.isHost || onDemoteHost) && (
              <button
                onClick={() => {
                  if (sheetType === 'going' && !isSelf) {
                    onRemoveParticipant(selectedItem);
                  } else {
                    onShowConfirmRemove(true);
                  }
                }}
                style={{ width: '100%', padding: '14px', background: 'rgba(239,68,68,0.08)', border: 'none', borderRadius: 12, color: '#EF4444', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                {isSelf ? 'Leave Plan' : 'Remove from Plan'}
              </button>
            )}

            <button
              onClick={onClose}
              style={{ width: '100%', padding: '14px', background: 'none', border: 'none', borderRadius: 12, color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'center', marginTop: 8 }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', margin: '8px 0' }}>
              {isSelf ? 'Leave this plan?' : `Remove "${selectedItem.name}" from this plan?`}
            </span>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => onShowConfirmRemove(false)}
                style={{ flex: 1, padding: '14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 12, color: '#FFFFFF', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => onRemoveParticipant(selectedItem)}
                style={{ flex: 1, padding: '14px', background: '#EF4444', border: 'none', borderRadius: 12, color: '#FFFFFF', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                {isSelf ? 'Leave' : 'Remove'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
