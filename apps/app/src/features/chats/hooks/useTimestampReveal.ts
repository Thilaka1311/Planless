import { useRef, useEffect } from "react";
import { useMotionValue, useTransform, animate, MotionValue, PanInfo } from "motion/react";

export interface UseTimestampRevealOptions {
  embedded?: boolean;
  externalDragX?: MotionValue<number>;
}

export function useTimestampReveal(options: UseTimestampRevealOptions = {}) {
  const { embedded = false, externalDragX } = options;

  // MotionValue driving activity timeline timestamp reveal
  const internalDragX = useMotionValue(0);
  const activeDragX = externalDragX || internalDragX;

  // Reveal distance: 74px = 58px gutter width + 16px gap on each side (card→ts + ts→screen edge)
  const MAX_REVEAL_DISTANCE = 74;

  // Clamped display translation: hard-stop at -74px
  const displayX = useTransform(activeDragX, (val: number) => {
    if (externalDragX) {
      // When embedded in pager (Page 2: Activity), pageX translates from -100vw to -200vw
      const width = typeof window !== "undefined" ? window.innerWidth : 375;
      const activityTargetX = -2 * width;
      const overshoot = val - activityTargetX;
      if (overshoot >= 0) return 0;
      return Math.max(-MAX_REVEAL_DISTANCE, overshoot);
    }
    if (val >= 0) return 0;
    return Math.max(-MAX_REVEAL_DISTANCE, val);
  });

  // Derived timestamp column opacity mapped directly from MotionValue (0 re-renders)
  const timestampOpacity = useTransform(displayX, (x) => {
    const visualDisplacement = Math.abs(x);
    if (visualDisplacement < 5) return 0;
    return Math.min(1, (visualDisplacement - 5) / 35);
  });

  // Single-fire haptic feedback reference
  const hapticFiredRef = useRef(false);

  // Evaluate haptics via MotionValue change listener without re-rendering component
  useEffect(() => {
    const unsubscribe = displayX.on("change", (latestX) => {
      const visualDisplacement = Math.abs(latestX);
      if (visualDisplacement >= 52 && !hapticFiredRef.current) {
        hapticFiredRef.current = true;
        if (typeof window !== "undefined" && window.navigator && "vibrate" in window.navigator) {
          try {
            window.navigator.vibrate(10);
          } catch {}
        }
      } else if (visualDisplacement < 20) {
        hapticFiredRef.current = false;
      }
    });

    return () => unsubscribe();
  }, [displayX]);

  const handleDrag = (_: any, info: PanInfo) => {
    if (embedded) {
      if (info.offset.x < 0) {
        internalDragX.set(info.offset.x);
      }
    } else {
      internalDragX.set(info.offset.x);
    }
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    const releaseVelocity = info.velocity.x;
    animate(internalDragX, 0, {
      type: "spring",
      stiffness: 500,
      damping: 28,
      mass: 0.7,
      velocity: releaseVelocity,
    });
  };

  const dragProps = embedded
    ? {}
    : {
        drag: "x" as const,
        dragConstraints: { left: -74, right: 0 },
        dragElastic: 0,
        dragMomentum: false,
        onDrag: handleDrag,
        onDragEnd: handleDragEnd,
      };

  return {
    displayX,
    timestampOpacity,
    dragProps,
  };
}
