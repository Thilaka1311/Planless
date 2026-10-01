import React, { useRef, useCallback } from "react";

export interface LongPressOptions {
  /** Time in ms before the long-press fires. Default: 500ms */
  threshold?: number;
  /** Optional tap callback fired on standard click/tap when long-press was not triggered */
  onTap?: () => void;
}

export interface LongPressHandlers {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchMove: () => void;
  onClick: (e: React.MouseEvent) => void;
}

/**
 * useLongPress
 *
 * Returns a set of event handlers to attach to any element.
 * Fires `onLongPress` after the user holds for `threshold` milliseconds.
 * Cancels automatically on mouse/touch move (preserves horizontal card scrolling).
 * Prevents accidental tap/click when long-press fires.
 *
 * @example
 * const longPress = useLongPress(() => openContextMenu(), { onTap: handleTap });
 * <div {...longPress}>...</div>
 */
export function useLongPress(
  onLongPress: () => void,
  { threshold = 500, onTap }: LongPressOptions = {}
): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const start = useCallback(() => {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, threshold);
  }, [onLongPress, threshold]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onMouseDown: (e: React.MouseEvent) => {
      // Only fire on primary button
      if (e.button !== 0) return;
      start();
    },
    onMouseUp: cancel,
    onMouseLeave: cancel,
    onTouchStart: (_e: React.TouchEvent) => {
      start();
    },
    onTouchEnd: cancel,
    onTouchMove: cancel, // cancel on scroll/swipe
    onClick: (e: React.MouseEvent) => {
      if (firedRef.current) {
        e.stopPropagation();
        e.preventDefault();
        firedRef.current = false;
        return;
      }
      onTap?.();
    },
  };
}
