import React from "react";

interface PlansDividerProps {
  selected: 'JOINED' | 'WAITLISTED' | 'SKIPPED' | 'hosted';
  counts: {
    joined: number;
    waitlisted: number;
    skipped: number;
    hosted: number;
  };
  onSelect: (tab: 'JOINED' | 'WAITLISTED' | 'SKIPPED' | 'hosted') => void;
}

export const PlansDivider: React.FC<PlansDividerProps> = ({
  selected,
  counts,
  onSelect,
}) => {
  const tabs = [
    { id: 'JOINED' as const, label: 'Joined', count: counts.joined, activeColor: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
    { id: 'WAITLISTED' as const, label: 'Waitlisted', count: counts.waitlisted, activeColor: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
    { id: 'SKIPPED' as const, label: 'Skipped', count: counts.skipped, activeColor: 'text-rose-400 border-rose-500/30 bg-rose-500/10' },
    { id: 'hosted' as const, label: 'Hosted', count: counts.hosted, activeColor: 'text-white border-white/10 bg-white/[0.04]' }
  ];

  return (
    <div className="flex w-[calc(100%+3rem)] -mx-6 bg-[#0A0A0C] border border-[#1A1A1A] rounded-[24px] p-1 mb-6 gap-1">
      {tabs.map((tab) => {
        const isActive = selected === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={`flex-1 py-2.5 rounded-[18px] text-[10px] font-sans font-bold tracking-wide transition-all duration-300 focus:outline-none flex flex-col items-center justify-center cursor-pointer ${
              isActive
                ? `${tab.activeColor} border shadow-md`
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span className="truncate">{tab.label} ({tab.count})</span>
          </button>
        );
      })}
    </div>
  );
};
