import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ChevronRight, Calendar, Clock } from 'lucide-react';
import { WheelColumn, ITEM_H } from './WheelColumn';

const VISIBLE = 3;

export interface WheelPickerProps {
  initialDate?: Date | null;
  initialHours?: number;    // 0–23
  initialMinutes?: number;
  onChange: (hours: number, minutes: number, date: Date) => void;
  activePicker: 'date' | 'time' | null;
  onPickerToggle: (picker: 'date' | 'time' | null) => void;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = ['2026', '2027', '2028', '2029', '2030'];

const daysIn = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate();

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const AM_PM = ['AM', 'PM'];

export const WheelPicker: React.FC<WheelPickerProps> = ({
  initialDate,
  initialHours = 20,
  initialMinutes = 0,
  onChange,
  activePicker,
  onPickerToggle,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Date States
  // Helper to get current Date at midnight
  const now = new Date();
  const todayMidnight = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Generate Year options starting from today's year
  const yearItems = useMemo(() => {
    const startYear = now.getFullYear();
    return Array.from({ length: 5 }, (_, i) => String(startYear + i));
  }, [now]);

  // Date States initialized to a valid future time or today
  const [selectedYear, setSelectedYear] = useState(() => {
    const d = initialDate ? new Date(initialDate) : new Date();
    const cleanD = new Date(d);
    cleanD.setHours(23, 59, 59, 999); // Use end of day to check if date is past today
    return cleanD < now ? now.getFullYear() : d.getFullYear();
  });
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(() => {
    const d = initialDate ? new Date(initialDate) : new Date();
    const cleanD = new Date(d);
    cleanD.setHours(23, 59, 59, 999);
    return cleanD < now ? now.getMonth() : d.getMonth();
  });
  const [selectedDay, setSelectedDay] = useState(() => {
    const d = initialDate ? new Date(initialDate) : new Date();
    const cleanD = new Date(d);
    cleanD.setHours(23, 59, 59, 999);
    return cleanD < now ? now.getDate() : d.getDate();
  });

  // Calculate dynamic Month items available based on selected year (restrict past months if this year)
  const monthItems = useMemo(() => {
    const dNow = new Date();
    if (selectedYear === dNow.getFullYear()) {
      return MONTHS.filter((_, idx) => idx >= dNow.getMonth());
    }
    return MONTHS;
  }, [selectedYear]);

  // Dynamic day items
  const maxDays = useMemo(() => daysIn(selectedYear, selectedMonthIdx), [selectedYear, selectedMonthIdx]);
  const safeDay = Math.min(selectedDay, maxDays);

  const dayItems = useMemo(() => {
    const dNow = new Date();
    let startDay = 1;
    if (selectedYear === dNow.getFullYear() && selectedMonthIdx === dNow.getMonth()) {
      startDay = dNow.getDate();
    }
    const days: string[] = [];
    for (let i = startDay; i <= maxDays; i++) {
      days.push(String(i));
    }
    return days;
  }, [selectedYear, selectedMonthIdx, maxDays]);

  // Adjust selected day/month if they become out of range of valid items
  useEffect(() => {
    const dNow = new Date();
    if (selectedYear === dNow.getFullYear()) {
      if (selectedMonthIdx < dNow.getMonth()) {
        setSelectedMonthIdx(dNow.getMonth());
      }
    }
  }, [selectedYear]);

  useEffect(() => {
    const dNow = new Date();
    if (selectedYear === dNow.getFullYear() && selectedMonthIdx === dNow.getMonth()) {
      if (selectedDay < dNow.getDate()) {
        setSelectedDay(dNow.getDate());
      }
    }
  }, [selectedYear, selectedMonthIdx]);

  const currentDate = useMemo(() => {
    const d = new Date(selectedYear, selectedMonthIdx, Math.min(selectedDay, maxDays));
    d.setHours(0, 0, 0, 0);
    return d;
  }, [selectedYear, selectedMonthIdx, selectedDay, maxDays]);

  const isMinDate = useMemo(() => {
    const minD = new Date(Math.floor(Date.now() / 300000) * 300000 + 300000);
    return selectedYear === minD.getFullYear() &&
           selectedMonthIdx === minD.getMonth() &&
           selectedDay === minD.getDate();
  }, [selectedYear, selectedMonthIdx, selectedDay]);

  // Compute dynamic hours, minutes, and AM/PM bounds based on current time rounded up to next 5-min block
  const ampmItems = useMemo(() => {
    if (isMinDate) {
      const minD = new Date(Math.floor(Date.now() / 300000) * 300000 + 300000);
      if (minD.getHours() >= 12) {
        return ['PM'];
      }
    }
    return ['AM', 'PM'];
  }, [isMinDate]);

  const [ampmStr, setAmpmStr] = useState(() => {
    return initialHours >= 12 ? 'PM' : 'AM';
  });

  // Ensure AM_PM selection stays valid if restricted
  useEffect(() => {
    if (!ampmItems.includes(ampmStr)) {
      setAmpmStr(ampmItems[0]);
    }
  }, [ampmItems, ampmStr]);

  const hourItems = useMemo(() => {
    const allHours = Array.from({ length: 12 }, (_, i) => String(i + 1));
    if (isMinDate) {
      const minD = new Date(Math.floor(Date.now() / 300000) * 300000 + 300000);
      const minH24 = minD.getHours();
      const checkPM = ampmStr === 'PM';
      
      return allHours.filter((h) => {
        const val = parseInt(h, 10);
        const h24 = checkPM ? (val === 12 ? 12 : val + 12) : (val === 12 ? 0 : val);
        
        const minDIsPM = minH24 >= 12;
        if (minDIsPM) {
          if (checkPM) {
            return h24 >= minH24;
          }
          return false;
        } else {
          if (checkPM) {
            return true;
          }
          return h24 >= minH24;
        }
      });
    }
    return allHours;
  }, [isMinDate, ampmStr]);

  const [hour12, setHour12] = useState(() => {
    return initialHours % 12 || 12;
  });

  // Ensure hour selection stays valid if restricted
  useEffect(() => {
    if (hourItems.length > 0 && !hourItems.includes(String(hour12))) {
      setHour12(parseInt(hourItems[0], 10));
    }
  }, [hourItems, hour12]);

  const minuteItems = useMemo(() => {
    const allMinutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
    if (isMinDate) {
      const minD = new Date(Math.floor(Date.now() / 300000) * 300000 + 300000);
      const minH24 = minD.getHours();
      const checkPM = ampmStr === 'PM';
      const selectedH24 = checkPM ? (hour12 === 12 ? 12 : hour12 + 12) : (hour12 === 12 ? 0 : hour12);
      
      if (selectedH24 === minH24) {
        const minMin = minD.getMinutes();
        return allMinutes.filter((m) => parseInt(m, 10) >= minMin);
      }
    }
    return allMinutes;
  }, [isMinDate, ampmStr, hour12]);

  const [minuteStr, setMinuteStr] = useState(() => {
    const roundedMin = Math.ceil(initialMinutes / 5) * 5;
    return String(roundedMin >= 60 ? 55 : roundedMin).padStart(2, '0');
  });

  // Sync state if props are updated externally (e.g. from parent's stale time timer)
  useEffect(() => {
    if (!initialDate) return;
    setSelectedYear(initialDate.getFullYear());
    setSelectedMonthIdx(initialDate.getMonth());
    setSelectedDay(initialDate.getDate());
    setAmpmStr(initialHours >= 12 ? 'PM' : 'AM');
    setHour12(initialHours % 12 || 12);
    const roundedMin = Math.ceil(initialMinutes / 5) * 5;
    setMinuteStr(String(roundedMin >= 60 ? 55 : roundedMin).padStart(2, '0'));
  }, [initialDate, initialHours, initialMinutes]);

  // Ensure minute selection stays valid and defaults to '05' (or first available) on hour change
  useEffect(() => {
    const targetMin = minuteItems.includes('05') ? '05' : (minuteItems[0] || '00');
    if (minuteStr !== targetMin || !minuteItems.includes(minuteStr)) {
      setMinuteStr(targetMin);
      propagateChange(selectedYear, selectedMonthIdx, selectedDay, hour12, targetMin, ampmStr);
    }
  }, [hour12, ampmStr, minuteItems]);

  const weekdayFull = currentDate.toLocaleDateString('en-US', { weekday: 'long' });

  // Call parent onChange whenever states update to verify we keep values in the future
  const propagateChange = useCallback((y: number, m: number, dVal: number, h12: number, minS: string, pmStr: string) => {
    const isPmVal = pmStr === 'PM';
    let h24 = h12;
    if (isPmVal) {
      if (h12 !== 12) h24 = h12 + 12;
    } else {
      if (h12 === 12) h24 = 0;
    }
    const dateObj = new Date(y, m, dVal);
    dateObj.setHours(h24, parseInt(minS, 10), 0, 0);
    onChange(h24, parseInt(minS, 10), dateObj);
  }, [onChange]);

  // Handlers updating local states and calling propagation helper
  const handleDayChange = useCallback((i: number) => {
    const dayVal = parseInt(dayItems[i], 10);
    setSelectedDay(dayVal);
    propagateChange(selectedYear, selectedMonthIdx, dayVal, hour12, minuteStr, ampmStr);
  }, [dayItems, selectedYear, selectedMonthIdx, hour12, minuteStr, ampmStr, propagateChange]);

  const handleMonthChange = useCallback((i: number) => {
    const monthName = monthItems[i];
    const mIdx = MONTHS.indexOf(monthName);
    setSelectedMonthIdx(mIdx);
    propagateChange(selectedYear, mIdx, selectedDay, hour12, minuteStr, ampmStr);
  }, [monthItems, selectedYear, selectedDay, hour12, minuteStr, ampmStr, propagateChange]);

  const handleYearChange = useCallback((i: number) => {
    const y = parseInt(yearItems[i], 10);
    setSelectedYear(y);
    propagateChange(y, selectedMonthIdx, selectedDay, hour12, minuteStr, ampmStr);
  }, [yearItems, selectedMonthIdx, selectedDay, hour12, minuteStr, ampmStr, propagateChange]);

  const handleHourChange = useCallback((i: number) => {
    const hVal = parseInt(hourItems[i], 10);
    setHour12(hVal);
    propagateChange(selectedYear, selectedMonthIdx, selectedDay, hVal, minuteStr, ampmStr);
  }, [hourItems, selectedYear, selectedMonthIdx, selectedDay, minuteStr, ampmStr, propagateChange]);

  const handleMinuteChange = useCallback((i: number) => {
    const minVal = minuteItems[i];
    setMinuteStr(minVal);
    propagateChange(selectedYear, selectedMonthIdx, selectedDay, hour12, minVal, ampmStr);
  }, [minuteItems, selectedYear, selectedMonthIdx, selectedDay, hour12, ampmStr, propagateChange]);

  const handleAmPmChange = useCallback((i: number) => {
    const pmVal = ampmItems[i];
    setAmpmStr(pmVal);
    propagateChange(selectedYear, selectedMonthIdx, selectedDay, hour12, minuteStr, pmVal);
  }, [ampmItems, selectedYear, selectedMonthIdx, selectedDay, hour12, minuteStr, propagateChange]);

  const activeYearIdx = yearItems.indexOf(String(selectedYear));

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        width: '100%',
      }}
    >
      {/* ── DATE ROW ── */}
      <div
        className="when-is-plan-card"
        style={{
          borderRadius: 24,
          background: 'rgba(8, 8, 8, 0.72)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          overflow: 'hidden',
          height: activePicker === 'date' ? 228 : 48,
          transition: 'height 0.28s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s ease-in-out',
          willChange: 'height',
          transform: 'translate3d(0, 0, 0)',
          backfaceVisibility: 'hidden'
        }}
      >
        <button
          type="button"
          onClick={() => {
            onPickerToggle(activePicker === 'date' ? null : 'date');
          }}
          style={{
            width: '100%',
            height: 48,
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Calendar className="w-5 h-5 text-white/40" />
            <span style={{ fontSize: 14, fontFamily: 'Inter, sans-serif', fontWeight: 600, color: '#FFFFFF' }}>
              Date
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 550, color: 'rgba(255, 255, 255, 0.35)' }}>
              {selectedDay} {MONTHS[selectedMonthIdx].slice(0, 3)} {selectedYear}
            </span>
          </div>
        </button>

        <div
          style={{
            minHeight: 0,
            opacity: activePicker === 'date' ? 1 : 0,
            visibility: activePicker === 'date' ? 'visible' : 'hidden',
            transition: 'opacity 0.2s ease-in-out, visibility 0.2s ease-in-out',
            background: 'transparent',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              padding: '12px 28px 4px',
              justifyContent: 'space-between',
              color: '#71717A',
              fontSize: 12,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ flex: 1, textAlign: 'center' }}>Day</span>
            <span style={{ flex: 1, textAlign: 'center' }}>Month</span>
            <span style={{ flex: 1, textAlign: 'center' }}>Year</span>
          </div>

          <div style={{ position: 'relative', height: ITEM_H * VISIBLE, marginBottom: 12 }}>
            {/* Highlight strip */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 14, right: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                height: ITEM_H,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 6,
                pointerEvents: 'none',
                zIndex: 3,
              }}
            />
            {/* Gradients */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0,
                height: '15%',
                background: 'linear-gradient(to bottom, #080808 0%, transparent 100%)',
                pointerEvents: 'none',
                zIndex: 4,
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                height: '15%',
                background: 'linear-gradient(to top, #080808 0%, transparent 100%)',
                pointerEvents: 'none',
                zIndex: 4,
              }}
            />

            <div style={{ display: 'flex', height: '100%', padding: '0 14px' }}>
              <WheelColumn
                key={`day-${maxDays}-${dayItems.length}`}
                items={dayItems}
                selectedIndex={dayItems.indexOf(String(safeDay)) !== -1 ? dayItems.indexOf(String(safeDay)) : 0}
                onIndexChange={handleDayChange}
                flex={1}
                fontSize={15}
              />
              <WheelColumn
                items={monthItems}
                selectedIndex={monthItems.indexOf(MONTHS[selectedMonthIdx]) !== -1 ? monthItems.indexOf(MONTHS[selectedMonthIdx]) : 0}
                onIndexChange={handleMonthChange}
                flex={1}
                fontSize={15}
              />
              <WheelColumn
                items={yearItems}
                selectedIndex={activeYearIdx !== -1 ? activeYearIdx : 0}
                onIndexChange={handleYearChange}
                flex={1}
                fontSize={15}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── TIME ROW ── */}
      <div
        className="when-is-plan-card"
        style={{
          borderRadius: 24,
          background: 'rgba(8, 8, 8, 0.72)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          overflow: 'hidden',
          height: activePicker === 'time' ? 228 : 48,
          transition: 'height 0.28s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s ease-in-out',
          willChange: 'height',
          transform: 'translate3d(0, 0, 0)',
          backfaceVisibility: 'hidden'
        }}
      >
        <button
          type="button"
          onClick={() => {
            onPickerToggle(activePicker === 'time' ? null : 'time');
          }}
          style={{
            width: '100%',
            height: 48,
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Clock className="w-5 h-5 text-white/40" />
            <span style={{ fontSize: 14, fontFamily: 'Inter, sans-serif', fontWeight: 600, color: 'white' }}>
              Time
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 550, color: 'rgba(255, 255, 255, 0.35)' }}>
              {(() => {
                const h24 = ampmStr === 'PM' ? (hour12 === 12 ? 12 : hour12 + 12) : (hour12 === 12 ? 0 : hour12);
                return `${String(h24).padStart(2, '0')}:${minuteStr}`;
              })()}
            </span>
          </div>
        </button>

        <div
          style={{
            minHeight: 0,
            opacity: activePicker === 'time' ? 1 : 0,
            visibility: activePicker === 'time' ? 'visible' : 'hidden',
            transition: 'opacity 0.2s ease-in-out, visibility 0.2s ease-in-out',
            background: 'transparent',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              padding: '8px 28px 2px',
              justifyContent: 'space-between',
              color: '#71717A',
              fontSize: 10,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ flex: 1, textAlign: 'center' }}>Hour</span>
            <span style={{ flex: 1, textAlign: 'center' }}>Minute</span>
            <span style={{ flex: 1, textAlign: 'center' }}>Period</span>
          </div>

          <div style={{ position: 'relative', height: ITEM_H * VISIBLE, marginBottom: 8 }}>
            {/* Highlight strip */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 14, right: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                height: ITEM_H,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 6,
                pointerEvents: 'none',
                zIndex: 3,
              }}
            />
            {/* Gradients */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0,
                height: '15%',
                background: 'linear-gradient(to bottom, #080808 0%, transparent 100%)',
                pointerEvents: 'none',
                zIndex: 4,
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                height: '15%',
                background: 'linear-gradient(to top, #080808 0%, transparent 100%)',
                pointerEvents: 'none',
                zIndex: 4,
              }}
            />

            <div style={{ display: 'flex', height: '100%', padding: '0 14px' }}>
              <WheelColumn
                items={hourItems}
                selectedIndex={hourItems.indexOf(String(hour12)) !== -1 ? hourItems.indexOf(String(hour12)) : 0}
                onIndexChange={handleHourChange}
                flex={1}
                fontSize={15}
              />
              <WheelColumn
                items={minuteItems}
                selectedIndex={minuteItems.indexOf(minuteStr) !== -1 ? minuteItems.indexOf(minuteStr) : 0}
                onIndexChange={handleMinuteChange}
                flex={1}
                fontSize={15}
              />
              <WheelColumn
                items={ampmItems}
                selectedIndex={ampmItems.indexOf(ampmStr) !== -1 ? ampmItems.indexOf(ampmStr) : 0}
                onIndexChange={handleAmPmChange}
                flex={1}
                fontSize={15}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
