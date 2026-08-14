import { useState, useEffect } from 'react';

export interface RSVPDeadlineInfo {
  text: string;
  color: string;
  state: 'expired' | 'urgent' | 'today' | 'tomorrow' | 'future';
}

export function getRSVPDeadlineInfo(deadlineStr: string | null | undefined, now: Date = new Date()): RSVPDeadlineInfo {
  if (!deadlineStr) {
    return { text: 'No deadline', color: 'rgba(255, 255, 255, 0.4)', state: 'expired' };
  }

  try {
    const deadline = new Date(deadlineStr);
    const diffMs = deadline.getTime() - now.getTime();

    if (diffMs <= 0) {
      return { text: 'Expired', color: 'rgba(255, 255, 255, 0.4)', state: 'expired' };
    }

    const formatDateMonthDay = (d: Date) => {
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    };

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDeadline = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
    const diffDays = Math.round((startOfDeadline.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

    // 1. Today (calendar day is today) -> Red tint (#EF4444)
    if (diffDays === 0 || diffMs < 24 * 60 * 60 * 1000 && startOfDeadline.getTime() === startOfToday.getTime()) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMinutes / 60);

      if (diffHours >= 1) {
        return { text: `${diffHours}h`, color: '#EF4444', state: 'urgent' };
      }
      const mins = Math.max(1, diffMinutes);
      return { text: `${mins}m`, color: '#EF4444', state: 'urgent' };
    }

    // 2. Tomorrow (calendar day is tomorrow) -> Yellow/Amber tint (#F59E0B)
    if (diffDays === 1) {
      return { text: 'Tomorrow', color: '#F59E0B', state: 'tomorrow' };
    }

    // 3. More than 2 days away -> Green tint (#22C55E)
    return { text: formatDateMonthDay(deadline), color: '#22C55E', state: 'future' };

  } catch {
    return { text: deadlineStr, color: 'rgba(255, 255, 255, 0.4)', state: 'expired' };
  }
}

export function useRSVPDeadline(deadlineStr: string | null | undefined): RSVPDeadlineInfo {
  const [info, setInfo] = useState<RSVPDeadlineInfo>(() => getRSVPDeadlineInfo(deadlineStr));

  useEffect(() => {
    setInfo(getRSVPDeadlineInfo(deadlineStr));

    const getUpdateInterval = () => {
      if (!deadlineStr) return 60000;
      const diffMs = new Date(deadlineStr).getTime() - Date.now();
      if (diffMs <= 0) return 60000;
      if (diffMs < 1000 * 60 * 60) return 10000; // 10s
      if (diffMs < 1000 * 60 * 60 * 24) return 30000; // 30s
      return 60000; // 60s
    };

    let intervalId = setInterval(() => {
      setInfo(getRSVPDeadlineInfo(deadlineStr));
    }, getUpdateInterval());

    const checkerId = setInterval(() => {
      clearInterval(intervalId);
      intervalId = setInterval(() => {
        setInfo(getRSVPDeadlineInfo(deadlineStr));
      }, getUpdateInterval());
    }, 60000);

    return () => {
      clearInterval(intervalId);
      clearInterval(checkerId);
    };
  }, [deadlineStr]);

  return info;
}
