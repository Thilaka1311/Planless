import React, { useRef, useCallback, useEffect } from "react";

export interface LongPressOptions {
  /** Time in ms before the long-press fires. Default: 500ms */
  threshold?: number;
  /** Optional tap callback fired on standard click/tap when long-press was not triggered */
  onTap?: () => void;
  /** Movement tolerance in pixels before hold is canceled (default: 10px). Protects horizontal scrolling. */
  moveTolerance?: number;
  /** When disabled, hold action is ignored and taps route directly to onTap. */
  disabled?: boolean;
}

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  // Legacy / fallback mouse & touch listeners for backwards compatibility
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchMove: (e?: any) => void;
  onClick: (e: React.MouseEvent) => void;
}

/**
 * useLongPress
 *
 * Robust unified hook supporting both Laptop/Desktop mouse-hold and Mobile/Touch-hold.
 * Uses Pointer Events to guarantee consistent behavior across trackpads, mice, and touchscreens.
 *
 * Features:
 * - Fires `onLongPress` after `threshold` milliseconds (default: 500ms).
 * - Cancels automatically if cursor/finger moves beyond `moveTolerance` (default: 18px).
 * - Preserves horizontal & vertical scrolling without triggering unwanted edit actions.
 * - Suppresses normal `onClick` / `onTap` if the hold action succeeded.
 * - Prevents native browser HTML5 drag cancellation and context menu interference.
 * - Uses Pointer Capture so minor element shrinking/re-rendering does not drop the hold.
 * - Properly cleans up timeouts on unmount.
 */
export function useLongPress(
  onLongPress: () => void,
  {
    threshold = 500,
    onTap,
    moveTolerance = 18,
    disabled = false,
  }: LongPressOptions = {}
): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const movedRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const isPointerActiveRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPosRef.current = null;
  }, []);

  const start = useCallback(
    (clientX: number, clientY: number) => {
      cancel();
      if (disabled) return;
      firedRef.current = false;
      movedRef.current = false;
      startPosRef.current = { x: clientX, y: clientY };

      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        timerRef.current = null;
        try {
          onLongPress();
        } catch (err) {
          console.error("[useLongPress] onLongPress handler threw error:", err);
        }
      }, threshold);
    },
    [cancel, disabled, onLongPress, threshold]
  );

  const checkMovement = useCallback(
    (clientX: number, clientY: number) => {
      if (!startPosRef.current || timerRef.current === null) return;
      const dx = Math.abs(clientX - startPosRef.current.x);
      const dy = Math.abs(clientY - startPosRef.current.y);
      if (dx > moveTolerance || dy > moveTolerance) {
        movedRef.current = true;
        cancel();
      }
    },
    [cancel, moveTolerance]
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return {
    // ── Primary: Unified Pointer Events (Mouse, Trackpad & Touch) ──
    onPointerDown: (e: React.PointerEvent) => {
      // Only fire for primary mouse button (button === 0) or touch/pen
      if (e.button !== 0 && e.pointerType === "mouse") return;
      isPointerActiveRef.current = true;
      try {
        (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
      } catch (_) {}
      start(e.clientX, e.clientY);
    },
    onPointerMove: (e: React.PointerEvent) => {
      checkMovement(e.clientX, e.clientY);
    },
    onPointerUp: (e: React.PointerEvent) => {
      try {
        const target = e.currentTarget as HTMLElement;
        if (target?.hasPointerCapture?.(e.pointerId)) {
          target.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
      isPointerActiveRef.current = false;
      cancel();
    },
    onPointerCancel: (e: React.PointerEvent) => {
      try {
        const target = e.currentTarget as HTMLElement;
        if (target?.hasPointerCapture?.(e.pointerId)) {
          target.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
      isPointerActiveRef.current = false;
      cancel();
    },

    // ── Prevent HTML5 Drag and Context Menu during hold ──
    onDragStart: (e: React.DragEvent) => {
      e.preventDefault();
    },
    onContextMenu: (e: React.MouseEvent) => {
      if (firedRef.current || isPointerActiveRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },

    // ── Fallback / Legacy Mouse & Touch Handlers ──
    onMouseDown: (e: React.MouseEvent) => {
      // If pointer events already initiated, do not duplicate/restart timer
      if (isPointerActiveRef.current) return;
      if (e.button !== 0) return;
      start(e.clientX, e.clientY);
    },
    onMouseUp: () => {
      if (isPointerActiveRef.current) return;
      cancel();
    },
    onMouseLeave: () => {
      // If pointer capture is active, ignore legacy mouseleave caused by element scale/child border
      if (isPointerActiveRef.current) return;
      cancel();
    },
    onTouchStart: (e: React.TouchEvent) => {
      if (isPointerActiveRef.current) return;
      if (e.touches.length > 0) {
        start(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    onTouchEnd: () => {
      if (isPointerActiveRef.current) return;
      cancel();
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (isPointerActiveRef.current) return;
      if (e.touches.length > 0) {
        checkMovement(e.touches[0].clientX, e.touches[0].clientY);
      } else {
        cancel();
      }
    },

    // ── Unified Click Handler ──
    onClick: (e: React.MouseEvent) => {
      // If long press fired, consume click and prevent normal card tap
      if (firedRef.current) {
        e.stopPropagation();
        e.preventDefault();
        firedRef.current = false;
        movedRef.current = false;
        return;
      }

      // If user moved significantly (e.g. dragged/scrolled), ignore accidental click
      if (movedRef.current) {
        movedRef.current = false;
        return;
      }

      onTap?.();
    },
  };
}
