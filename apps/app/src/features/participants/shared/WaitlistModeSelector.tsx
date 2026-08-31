import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface WaitlistModeSelectorProps {
  waitlistMode?: 'automatic' | 'assigned';
  onWaitlistModeChange?: (mode: 'automatic' | 'assigned') => void;
  isHost?: boolean;
  variant?: 'card' | 'plain';
  capacity?: number;
  isCapacityConfigured?: boolean;
  invitedCount?: number;
}

export const WaitlistModeSelector: React.FC<WaitlistModeSelectorProps> = ({
  waitlistMode = 'automatic',
  onWaitlistModeChange,
  isHost = true,
  capacity,
  isCapacityConfigured,
  invitedCount,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!isHost) return null;

  const currentMode = waitlistMode || 'automatic';

  const handleSelect = (mode: 'automatic' | 'assigned') => {
    onWaitlistModeChange?.(mode);
    setIsOpen(false);
  };

  const isConfigured = isCapacityConfigured ?? (capacity !== undefined);
  const totalInvited = invitedCount ?? 0;

  const getAutomaticDescription = () => {
    // 1. NO PLAN SIZE SET
    if (!isConfigured || capacity === undefined) {
      return 'All invited participants will join. Set a plan size for a waitlist.';
    }

    const planSize = Math.max(1, capacity);
    const waitlistedCount = Math.max(0, totalInvited - planSize);

    // 3. PLAN SIZE EQUALS INVITED COUNT
    if (waitlistedCount === 0) {
      return 'All invited participants will join.';
    }

    // 2. PLAN SIZE IS SET AND IS LESS THAN INVITED
    const base = `The first ${planSize} people will join`;
    if (waitlistedCount === 1) {
      return `${base}, and the remaining 1 person will be waitlisted.`;
    }
    return `${base}, and the remaining ${waitlistedCount} people will be waitlisted.`;
  };

  const getAssignedDescription = () => {
    // 1. NO PLAN SIZE SET
    if (!isConfigured || capacity === undefined) {
      return 'All invited participants will join. Set a plan size for a waitlist.';
    }

    const planSize = Math.max(1, capacity);
    const waitlistedCount = Math.max(0, totalInvited - planSize);

    // 3. PLAN SIZE EQUALS INVITED COUNT
    if (waitlistedCount === 0) {
      return 'All invited participants will join.';
    }

    // 2. PLAN SIZE IS SET AND IS LESS THAN INVITED
    return 'You choose who joins and who is waitlisted.';
  };

  return (
    <div style={{ padding: '0 20px', marginBottom: 12, marginTop: 4, position: 'relative', zIndex: 30 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          width: '100%',
        }}
        ref={dropdownRef}
      >
        {/* Left: Mode description */}
        <span
          style={{
            fontSize: 13,
            color: '#8E8E93',
            lineHeight: 1.4,
            fontFamily: 'Inter, sans-serif',
            flex: 1,
            minWidth: 0,
          }}
        >
          {currentMode === 'assigned'
            ? getAssignedDescription()
            : getAutomaticDescription()}
        </span>

        {/* Right: Compact Dropdown Trigger */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 12,
              padding: '6px 12px',
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontFamily: 'Inter, sans-serif',
            }}
            className="hover:bg-white/[0.12] active:scale-[0.98]"
          >
            <span>{currentMode === 'assigned' ? 'Assigned' : 'Automatic'}</span>
            <ChevronDown
              className="w-3.5 h-3.5 text-white/60 transition-transform duration-200"
              style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  minWidth: 140,
                  background: '#1C1C1E',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 14,
                  padding: 4,
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                  zIndex: 50,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <button
                  type="button"
                  onClick={() => handleSelect('automatic')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: 'none',
                    background: currentMode === 'automatic' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    color: currentMode === 'automatic' ? '#FFFFFF' : '#A1A1AA',
                    fontSize: 13,
                    fontWeight: currentMode === 'automatic' ? 600 : 500,
                    cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    textAlign: 'left',
                  }}
                  className="hover:bg-white/[0.08] transition-colors"
                >
                  <span>Automatic</span>
                  {currentMode === 'automatic' && <Check className="w-3.5 h-3.5 text-white" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleSelect('assigned')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: 'none',
                    background: currentMode === 'assigned' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    color: currentMode === 'assigned' ? '#FFFFFF' : '#A1A1AA',
                    fontSize: 13,
                    fontWeight: currentMode === 'assigned' ? 600 : 500,
                    cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    textAlign: 'left',
                  }}
                  className="hover:bg-white/[0.08] transition-colors"
                >
                  <span>Assigned</span>
                  {currentMode === 'assigned' && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
