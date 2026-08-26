import React from "react";
import { motion } from "motion/react";

interface PlansDividerProps {
  selected: 'JOINED' | 'WAITLISTED' | 'SKIPPED';
  counts: {
    joined: number;
    waitlisted: number;
    skipped: number;
  };
  onSelect: (tab: 'JOINED' | 'WAITLISTED' | 'SKIPPED') => void;
}

export const PlansDivider: React.FC<PlansDividerProps> = ({
  selected,
  counts,
  onSelect,
}) => {
  const tabs = [
    {
      id: 'JOINED' as const,
      label: 'Joined',
      count: counts.joined,
      textColor: 'text-emerald-400',
      activeBg: 'bg-emerald-500/10 border-emerald-500/30'
    },
    {
      id: 'WAITLISTED' as const,
      label: 'Waitlisted',
      count: counts.waitlisted,
      textColor: 'text-amber-400',
      activeBg: 'bg-amber-500/10 border-amber-500/30'
    },
    {
      id: 'SKIPPED' as const,
      label: 'Skipped',
      count: counts.skipped,
      textColor: 'text-rose-400',
      activeBg: 'bg-rose-500/10 border-rose-500/30'
    },
  ];

  return (
    <div className="flex w-[calc(100%+3rem)] -mx-6 bg-[#0A0A0C] border border-[#1A1A1A] rounded-[24px] p-0 overflow-hidden mb-5">
      {tabs.map((tab) => {
        const isActive = selected === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className="flex-1 py-3 text-[11px] font-sans font-bold tracking-wide focus:outline-none flex items-center justify-center cursor-pointer relative"
          >
            {isActive && (
              <motion.div
                layoutId="plans_divider_active_pill"
                className={`absolute inset-0 rounded-[22px] border shadow-md pointer-events-none z-0 ${tab.activeBg}`}
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            )}
            <span
              className={`relative z-10 truncate transition-colors duration-200 ${
                isActive ? tab.textColor : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label} ({tab.count})
            </span>
          </button>
        );
      })}
    </div>
  );
};
