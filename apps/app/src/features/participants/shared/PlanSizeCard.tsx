import React, { useState, useEffect, useRef } from 'react';
import { UserPlus } from 'lucide-react';
import { PlanSizeSlider } from '../../create/components/PlanSizeSlider';

interface PlanSizeCardProps {
  capacity: number;
  maxCapacity?: number;
  isHostUser?: boolean;
  isInviteOnly?: boolean;
  onAdjustCapacity?: (newCapacity: number) => void;
  onConfirmAdjustCapacity?: (targetCap: number) => void;
  onEditingChange?: (isEditing: boolean) => void;
}

export const PlanSizeCard: React.FC<PlanSizeCardProps> = ({
  capacity,
  maxCapacity = 50,
  isHostUser = false,
  isInviteOnly = false,
  onConfirmAdjustCapacity,
  onEditingChange,
}) => {
  const [isEditingCapacity, setIsEditingCapacity] = useState(false);
  const [tempCapacity, setTempCapacity] = useState(capacity);
  const cardRef = useRef<HTMLDivElement>(null);
  const tempCapRef = useRef(capacity);
  const initialCapRef = useRef(capacity);

  const isEditingRef = useRef(false);

  // Sync refs and local state when external capacity prop changes
  useEffect(() => {
    setTempCapacity(capacity);
    tempCapRef.current = capacity;
  }, [capacity]);

  const handleSetEditing = (editing: boolean) => {
    isEditingRef.current = editing;
    setIsEditingCapacity(editing);
    if (onEditingChange) {
      onEditingChange(editing);
    }
  };

  const handleStartEditing = () => {
    initialCapRef.current = capacity;
    setTempCapacity(capacity);
    tempCapRef.current = capacity;
    handleSetEditing(true);
  };

  const handleExitEditing = () => {
    if (tempCapRef.current !== initialCapRef.current) {
      if (onConfirmAdjustCapacity) {
        onConfirmAdjustCapacity(tempCapRef.current);
      }
    }
    // Visually collapse immediately
    setIsEditingCapacity(false);
    // Keep lock active synchronously through the remainder of the current event loop (pointerdown -> click cycle)
    setTimeout(() => {
      isEditingRef.current = false;
      if (onEditingChange) {
        onEditingChange(false);
      }
    }, 0);
  };

  // Click-outside event listener (capture phase) to collapse card & save immediately on tap outside
  useEffect(() => {
    if (!isEditingCapacity) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        handleExitEditing();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('touchstart', handlePointerDown, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('touchstart', handlePointerDown, true);
    };
  }, [isEditingCapacity, onConfirmAdjustCapacity]);

  if (!isHostUser || isInviteOnly || maxCapacity === undefined) {
    return null;
  }

  return (
    <div ref={cardRef} style={{ padding: '0 20px', marginBottom: 12 }}>
      {!isEditingCapacity ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            padding: '14px 16px',
            background: '#111111',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserPlus className="w-4 h-4 text-[#FF6B2C] flex-shrink-0" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', fontFamily: 'Inter, sans-serif' }}>
                Plan Size
              </span>
            </div>
            <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.4)', fontFamily: 'Inter, sans-serif' }}>
              Maximum {capacity} {capacity === 1 ? 'participant' : 'participants'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleStartEditing}
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
              flexShrink: 0,
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserPlus className="w-4 h-4 text-[#FF6B2C] flex-shrink-0" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', fontFamily: 'Inter, sans-serif' }}>
                Plan Size
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.4)', fontFamily: 'Inter, sans-serif' }}>
                Maximum {tempCapacity} {tempCapacity === 1 ? 'participant' : 'participants'}
              </span>
              <button
                type="button"
                onClick={handleExitEditing}
                style={{
                  padding: '4px 10px',
                  background: '#FF6B2C',
                  border: 'none',
                  borderRadius: 8,
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  flexShrink: 0,
                }}
              >
                Done
              </button>
            </div>
          </div>
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <PlanSizeSlider
              value={tempCapacity}
              onChange={(val) => {
                setTempCapacity(val);
                tempCapRef.current = val;
              }}
              hasError={false}
              min={2}
              max={maxCapacity}
            />
          </div>
        </div>
      )}
    </div>
  );
};
