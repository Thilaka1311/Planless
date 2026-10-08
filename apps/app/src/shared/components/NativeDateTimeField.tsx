import React from 'react';
import { Calendar, ChevronRight } from 'lucide-react';

interface NativeDateTimeFieldProps {
  value: Date | null | undefined;
  onChange: (date: Date) => void;
  label: string;
  minimumDate?: Date;
  maximumDate?: Date;
}

export const formatDateTimeStandard = (date: Date | null | undefined): string => {
  if (!date || isNaN(date.getTime())) return 'Please enter date and time';
  
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${weekday}, ${month} ${day} • ${hours}:${minutes}`;
};

export const toLocalISOString = (date: Date | null | undefined): string => {
  if (!date || isNaN(date.getTime())) return '';
  const tzOffset = date.getTimezoneOffset() * 60000;
  const localISOTime = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
  return localISOTime;
};

export const NativeDateTimeField: React.FC<NativeDateTimeFieldProps> = ({
  value,
  onChange,
  label,
  minimumDate,
  maximumDate,
}) => {
  const minStr = minimumDate ? toLocalISOString(minimumDate) : undefined;
  const maxStr = maximumDate ? toLocalISOString(maximumDate) : undefined;

  return (
    <div className="bg-[#111115] border border-white/5 hover:border-white/10 rounded-[22px] p-4 flex items-center justify-between min-h-[72px] relative transition-all duration-150 ease-out active:scale-[0.98] active:opacity-85 overflow-hidden select-none outline-none focus-within:ring-1 focus-within:ring-[#FF6B2C] text-left">
      <div className="flex items-center gap-3.5 w-full min-w-0">
        <div className="p-2 bg-[#FF6B2C]/10 rounded-xl shrink-0 text-[#FF6B2C]">
          <Calendar className="w-4 h-4" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-550 font-bold block mb-0.5">
            {label}
          </span>
          <span className="text-[13.5px] sm:text-[14.5px] font-semibold text-white leading-snug truncate">
            {value ? formatDateTimeStandard(value) : 'Please enter date and time'}
          </span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0 ml-2" />
      <input
        type="datetime-local"
        value={toLocalISOString(value)}
        min={minStr}
        max={maxStr}
        onChange={(e) => {
          if (e.target.value) {
            onChange(new Date(e.target.value));
          }
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 [color-scheme:dark]"
      />
    </div>
  );
};
