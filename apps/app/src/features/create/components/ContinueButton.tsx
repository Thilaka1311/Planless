import React from 'react';
import { ArrowRight } from 'lucide-react';

interface ContinueButtonProps {
  onClick: () => void;
  disabled?: boolean;
  text?: string;
  title?: string;
}

export const ContinueButton: React.FC<ContinueButtonProps> = ({
  onClick,
  disabled = false,
  text,
  title,
}) => {
  if (disabled) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title || text || "Continue"}
      style={{
        bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
        right: 'calc(1.25rem + env(safe-area-inset-right, 0px))',
      }}
      className="fixed z-40 w-12 h-12 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:scale-95 text-white flex items-center justify-center shadow-lg shadow-black/50 border border-white/20 transition-all duration-150 cursor-pointer pointer-events-auto select-none"
    >
      <ArrowRight className="w-6 h-6 text-white stroke-[2.5]" />
    </button>
  );
};
