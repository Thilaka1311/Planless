import React from 'react';
import { Settings, Plus } from 'lucide-react';

interface ParticipantHeaderProps {
  title: string;
  subtitle?: string;
  isHostUser?: boolean;
  onBack: () => void;
  onOpenSettings?: () => void;
}

export const ParticipantHeader: React.FC<ParticipantHeaderProps> = ({
  title,
  subtitle,
  isHostUser,
  onBack,
  onOpenSettings,
}) => {
  return (
    <div
      className="w-full shrink-0 px-5 flex items-center bg-[#000000] border-b border-white/[0.08] relative z-40"
      style={{ height: '72px', boxSizing: 'border-box' }}
    >
      <button
        type="button"
        onClick={onBack}
        style={{
          marginRight: 16,
          background: 'none',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFFFF',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 300 }}>←</span>
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, textOverflow: 'ellipsis', overflow: 'hidden' }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
          {title}
        </h1>
        {subtitle && (
          <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.4)', marginTop: 2 }}>
            {subtitle}
          </span>
        )}
      </div>

      {isHostUser && onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white active:scale-95 transition cursor-pointer"
        >
          <Settings className="w-4 h-4 text-zinc-300" />
        </button>
      )}
    </div>
  );
};
