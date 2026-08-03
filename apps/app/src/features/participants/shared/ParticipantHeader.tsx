import React from 'react';
import { Settings, Plus, Activity, ChevronLeft } from 'lucide-react';

interface ParticipantHeaderProps {
  title: string;
  subtitle?: string;
  isHostUser?: boolean;
  onBack?: () => void;
  onOpenSettings?: () => void;
  onOpenActivity?: () => void;
  displayMode?: 'standalone' | 'embedded';
}

export const ParticipantHeader: React.FC<ParticipantHeaderProps> = ({
  title,
  subtitle,
  isHostUser,
  onBack,
  onOpenSettings,
  onOpenActivity,
  displayMode = 'standalone',
}) => {
  const isStandalone = displayMode === 'standalone';

  return (
    <div
      className="w-full shrink-0 px-5 flex items-center bg-[#000000] border-b border-white/[0.08] relative z-40"
      style={{ height: '72px', boxSizing: 'border-box' }}
    >
      {isStandalone && onBack && (
        <button
          type="button"
          onClick={onBack}
          className="p-2 -ml-2 text-white hover:text-white/80 active:scale-95 transition cursor-pointer flex items-center justify-center mr-3"
          title="Back"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

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

      {isStandalone && (
        <div className="flex items-center gap-2">
          {onOpenActivity && (
            <button
              id="immersive-participants-activity-btn"
              type="button"
              onClick={onOpenActivity}
              className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white active:scale-95 transition cursor-pointer"
              title="Activity"
            >
              <Activity className="w-4 h-4 text-zinc-300" />
            </button>
          )}

          {isHostUser && onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white active:scale-95 transition cursor-pointer"
              title="Settings"
            >
              <Settings className="w-4 h-4 text-zinc-300" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
