import React from 'react';
import { Settings, Plus, Activity, ArrowLeft, Users } from 'lucide-react';

interface ParticipantHeaderProps {
  title: string;
  subtitle?: string;
  isHostUser?: boolean;
  onBack?: () => void;
  onOpenSettings?: () => void;
  onOpenActivity?: () => void;
  onOpenPlanSize?: () => void;
  displayMode?: 'standalone' | 'embedded';
  mode?: string;
  waitlistMode?: 'automatic' | 'assigned' | string;
  hideTitle?: boolean;
}

export const ParticipantHeader: React.FC<ParticipantHeaderProps> = ({
  title,
  subtitle,
  isHostUser,
  onBack,
  onOpenSettings,
  onOpenActivity,
  onOpenPlanSize,
  displayMode = 'standalone',
  mode,
  waitlistMode,
  hideTitle = false,
}) => {
  const isStandalone = displayMode === 'standalone';
  const isWizard = mode === 'wizard' || hideTitle;

  if (isWizard) {
    const displayTitle = title || 'New Activity';
    return (
      <div
        className="w-full shrink-0 px-5 flex items-center justify-between bg-[#000000] relative z-40 gap-3"
        style={{ height: '56px', boxSizing: 'border-box' }}
      >
        <div className="flex items-center min-w-0 flex-1">
          {isStandalone && onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 -ml-2 text-white hover:text-white/80 active:scale-95 transition cursor-pointer flex items-center justify-center mr-2 shrink-0"
              title="Back"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
          )}
          <h1
            title={displayTitle}
            className="truncate font-bold text-white tracking-[-0.02em] font-sans"
            style={{
              fontSize: 18,
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayTitle}
          </h1>
        </div>

        {onOpenPlanSize && (
          <button
            type="button"
            id="header_plan_size_btn"
            onClick={onOpenPlanSize}
            title="Plan Size"
            className="p-1.5 bg-transparent hover:opacity-100 active:scale-95 text-white/50 hover:text-white/80 transition cursor-pointer pointer-events-auto select-none shrink-0 flex items-center justify-center"
          >
            <Users className="w-5 h-5 stroke-[2]" />
          </button>
        )}
      </div>
    );
  }

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
          <ArrowLeft className="w-6 h-6" />
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

          {isHostUser && onOpenPlanSize && (
            <button
              id="header_plan_size_btn"
              type="button"
              onClick={onOpenPlanSize}
              className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white active:scale-95 transition cursor-pointer"
              title="Plan Size"
            >
              <Users className="w-4 h-4 text-zinc-300" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
