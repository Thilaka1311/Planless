import React, { useState } from 'react';
import { PlanSizeSlider } from '../../create/components/PlanSizeSlider';

interface PlanSizeCardProps {
  capacity: number;
  maxCapacity?: number;
  isHostUser?: boolean;
  isInviteOnly?: boolean;
  onAdjustCapacity?: (newCapacity: number) => void;
  onConfirmAdjustCapacity?: (targetCap: number) => void;
}

export const PlanSizeCard: React.FC<PlanSizeCardProps> = ({
  capacity,
  maxCapacity = 50,
  isHostUser = false,
  isInviteOnly = false,
  onConfirmAdjustCapacity,
}) => {
  const [isEditingCapacity, setIsEditingCapacity] = useState(false);
  const [tempCapacity, setTempCapacity] = useState(capacity);

  React.useEffect(() => {
    setTempCapacity(capacity);
  }, [capacity]);

  if (!isHostUser || isInviteOnly || maxCapacity === undefined) {
    return null;
  }

  const handleApply = (targetCap: number) => {
    if (onConfirmAdjustCapacity) {
      onConfirmAdjustCapacity(targetCap);
    }
    setIsEditingCapacity(false);
  };

  return (
    <div style={{ padding: '0 20px', marginBottom: 12 }}>
      {!isEditingCapacity ? (
        <div
          style={{
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            padding: '14px 16px',
            background: '#111111',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', fontFamily: 'Inter, sans-serif' }}>
              Plan Size
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.4)', fontFamily: 'Inter, sans-serif' }}>
              Maximum {capacity} {capacity === 1 ? 'participant' : 'participants'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsEditingCapacity(true)}
            style={{
              padding: '6px 14px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 10,
              color: '#FFFFFF',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Edit
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            padding: '16px',
            background: '#111111',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 16,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', fontFamily: 'Inter, sans-serif' }}>
              Plan Size
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.4)', fontFamily: 'Inter, sans-serif' }}>
              Maximum {tempCapacity} {tempCapacity === 1 ? 'participant' : 'participants'}
            </span>
          </div>
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <PlanSizeSlider
              value={tempCapacity}
              onChange={(val) => setTempCapacity(val)}
              hasError={false}
              min={2}
              max={maxCapacity}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <button
              type="button"
              onClick={() => {
                setTempCapacity(capacity);
                setIsEditingCapacity(false);
              }}
              style={{
                flex: 1,
                padding: '10px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                borderRadius: 10,
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleApply(tempCapacity)}
              style={{
                flex: 1,
                padding: '10px',
                background: '#FF6B2C',
                border: 'none',
                borderRadius: 10,
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
