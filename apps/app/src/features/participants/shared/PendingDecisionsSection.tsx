import React, { useState } from 'react';
import { ArrowLeftRight, UserMinus, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserAvatar } from '../../../IMGfromDB/UserAvatar';
import { PendingLeaveParticipant } from '../shared/types';

interface PendingDecisionsSectionProps {
  pendingRequests: PendingLeaveParticipant[];
  onReplaceParticipant?: (participantId: string) => void;
  onRemoveParticipant?: (participant: PendingLeaveParticipant) => void;
  /** @deprecated - Kept for backwards compatibility */
  onKeepPayment?: (participantId: string) => void;
}

export const PendingDecisionsSection: React.FC<PendingDecisionsSectionProps> = ({
  pendingRequests,
  onReplaceParticipant,
  onRemoveParticipant,
  onKeepPayment,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!pendingRequests || pendingRequests.length === 0) {
    return null;
  }

  const count = pendingRequests.length;
  const titleText = count === 1 ? 'Pending decision' : 'Pending decisions';

  return (
    <div style={{ padding: '0 20px', margin: '4px 0 12px' }}>
      <div
        style={{
          background: 'rgba(24, 24, 27, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          padding: isExpanded ? '12px 14px' : '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          transition: 'padding 0.2s ease',
        }}
      >
        {/* Section Header (Clickable Collapsible Bar) */}
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: 0,
            width: '100%',
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#F59E0B',
              letterSpacing: '0.01em',
            }}
          >
            {titleText}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#F59E0B',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '10px',
                padding: '1px 7px',
                lineHeight: '1.4',
              }}
            >
              {count}
            </span>
            <ChevronDown
              className="w-4 h-4 text-zinc-400 transition-transform duration-200"
              style={{
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          </div>
        </button>

        {/* Collapsible Content */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: 'auto', opacity: 1, marginTop: 10 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: 12,
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    {/* Participant Profile Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          overflow: 'hidden',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          flexShrink: 0,
                          background: '#1A1A1A',
                        }}
                      >
                        <UserAvatar src={req.avatar || ''} alt={req.name} size="w-full h-full" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#FFFFFF',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            lineHeight: '1.2',
                          }}
                        >
                          {req.name}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: '#A1A1AA',
                            marginTop: 1,
                            fontWeight: 400,
                            lineHeight: '1.2',
                          }}
                        >
                          Wants to leave this plan
                        </span>
                      </div>
                    </div>

                    {/* Decision Action Button */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onRemoveParticipant) {
                            onRemoveParticipant(req);
                          } else if (onKeepPayment) {
                            onKeepPayment(req.id);
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 8,
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: '#EF4444',
                          background: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 5,
                          fontFamily: 'Inter, sans-serif',
                          transition: 'all 0.15s ease',
                        }}
                        className="hover:bg-red-500/20 active:scale-[0.98]"
                      >
                        <UserMinus className="w-3.5 h-3.5 shrink-0" />
                        <span>Remove Participant</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
