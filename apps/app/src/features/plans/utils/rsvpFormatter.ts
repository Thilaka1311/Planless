import { useState, useEffect } from 'react';

export const rsvpUrgencyStyles = {
  minutes: { border: 'rgba(239, 68, 68, 0.55)', icon: '#ef4444' }, // red-500
  hours: { border: 'rgba(234, 179, 8, 0.55)', icon: '#eab308' }, // yellow-500
  days: { border: 'rgba(34, 197, 94, 0.55)', icon: '#22c55e' }, // green-500
  neutral: { border: 'rgba(255, 255, 255, 0.2)', icon: '#71717a' }, // zinc-500
};

export interface RSVPDeadlineInfo {
  text: string;
  color: string;
  state: 'expired' | 'urgent' | 'today' | 'tomorrow' | 'future' | 'none';
  urgency?: 'minutes' | 'hours' | 'days' | 'none';
}

export function getRSVPDeadlineInfo(deadlineStr: string | null | undefined, now: Date = new Date()): RSVPDeadlineInfo {
  if (!deadlineStr || deadlineStr === 'No deadline' || deadlineStr === '-') {
    return { text: '-', color: rsvpUrgencyStyles.neutral.icon, state: 'none', urgency: 'none' };
  }

  try {
    const deadline = new Date(deadlineStr);
    const diffMs = deadline.getTime() - now.getTime();

    if (diffMs <= 0) {
      return { text: 'Expired', color: rsvpUrgencyStyles.neutral.icon, state: 'expired', urgency: 'none' };
    }

    const formatDateMonthDay = (d: Date) => {
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    };

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const totalHours = Math.floor(totalMinutes / 60);

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDeadline = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
    const diffDays = Math.round((startOfDeadline.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

    // 1. Very urgent / minutes (< 1 hour away) -> Red tint (#ef4444)
    if (totalHours < 1) {
      const mins = Math.max(1, totalMinutes);
      return {
        text: `${mins}m`,
        color: rsvpUrgencyStyles.minutes.icon,
        state: 'urgent',
        urgency: 'minutes',
      };
    }

    // 2. Near-term / hours (Tomorrow or today within 24 hours) -> Yellow/Amber tint (#eab308)
    if (diffDays === 1) {
      return {
        text: 'Tomorrow',
        color: rsvpUrgencyStyles.hours.icon,
        state: 'tomorrow',
        urgency: 'hours',
      };
    }

    if (diffDays === 0 || totalHours < 24) {
      return {
        text: `${totalHours}h`,
        color: rsvpUrgencyStyles.hours.icon,
        state: 'today',
        urgency: 'hours',
      };
    }

    // 3. More than 1 day away -> Green tint (#22c55e)
    return {
      text: formatDateMonthDay(deadline),
      color: rsvpUrgencyStyles.days.icon,
      state: 'future',
      urgency: 'days',
    };

  } catch {
    return { text: deadlineStr, color: rsvpUrgencyStyles.neutral.icon, state: 'expired', urgency: 'none' };
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
