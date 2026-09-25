import React from "react";
import { motion } from "motion/react";

export type ParticipantStatusStyleKey =
  | 'joined'
  | 'going'
  | 'attended'
  | 'waitlisted'
  | 'waitlist'
  | 'skipped'
  | 'invited'
  | 'default';

export const STATUS_TAB_STYLES: Record<
  string,
  { textColor: string; activeBg: string }
> = {
  joined: {
    textColor: 'text-emerald-400',
    activeBg: 'bg-emerald-500/10 border-emerald-500/30',
  },
  going: {
    textColor: 'text-emerald-400',
    activeBg: 'bg-emerald-500/10 border-emerald-500/30',
  },
  attended: {
    textColor: 'text-emerald-400',
    activeBg: 'bg-emerald-500/10 border-emerald-500/30',
  },
  waitlisted: {
    textColor: 'text-amber-400',
    activeBg: 'bg-amber-500/10 border-amber-500/30',
  },
  waitlist: {
    textColor: 'text-amber-400',
    activeBg: 'bg-amber-500/10 border-amber-500/30',
  },
  skipped: {
    textColor: 'text-rose-400',
    activeBg: 'bg-rose-500/10 border-rose-500/30',
  },
  invited: {
    textColor: 'text-zinc-300',
    activeBg: 'bg-zinc-500/15 border-zinc-500/30',
  },
  default: {
    textColor: 'text-zinc-300',
    activeBg: 'bg-zinc-500/15 border-zinc-500/30',
  },
};

export interface StatusTabItem<T extends string = string> {
  id: T;
  label: string;
  statusType?: string;
  textColor?: string;
  activeBg?: string;
}

export interface SegmentedStatusToggleProps<T extends string = string> {
  tabs: StatusTabItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
  layoutId?: string;
  className?: string;
}

export function SegmentedStatusToggle<T extends string = string>({
  tabs,
  selected,
  onSelect,
  layoutId = 'segmented_status_toggle_pill',
  className = '',
}: SegmentedStatusToggleProps<T>) {
  return (
    <div
      className={`flex w-full bg-[#0A0A0C] border border-[#1A1A1A] rounded-[24px] p-0 overflow-hidden ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = selected === tab.id;
        const styleKey = (tab.statusType || tab.id).toLowerCase();
        const style = STATUS_TAB_STYLES[styleKey] || STATUS_TAB_STYLES.default;
        const activeBg = tab.activeBg || style.activeBg;
        const textColor = tab.textColor || style.textColor;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className="flex-1 py-3 text-[11px] font-sans font-bold tracking-wide focus:outline-none flex items-center justify-center cursor-pointer relative"
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className={`absolute inset-0 rounded-[22px] border shadow-md pointer-events-none z-0 ${activeBg}`}
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            )}
            <span
              className={`relative z-10 truncate transition-colors duration-200 ${
                isActive ? textColor : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface PlansDividerProps {
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
  const tabs: StatusTabItem<'JOINED' | 'WAITLISTED' | 'SKIPPED'>[] = [
    {
      id: 'JOINED',
      label: `Joined (${counts.joined})`,
      statusType: 'joined',
    },
    {
      id: 'WAITLISTED',
      label: `Waitlisted (${counts.waitlisted})`,
      statusType: 'waitlisted',
    },
    {
      id: 'SKIPPED',
      label: `Skipped (${counts.skipped})`,
      statusType: 'skipped',
    },
  ];

  return (
    <SegmentedStatusToggle
      tabs={tabs}
      selected={selected}
      onSelect={onSelect}
      layoutId="plans_divider_active_pill"
    />
  );
};
