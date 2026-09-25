import { useState, useEffect, useRef, useCallback } from "react";
import { useMotionValue, animate, PanInfo } from "motion/react";

export interface UseVerticalPagerOptions {
  totalPages: number;
  initialPage?: number;
  disabled?: boolean;
  onPageChange?: (index: number) => void;
}

export function useVerticalPager(options: UseVerticalPagerOptions) {
  const { totalPages, initialPage = 0, disabled = false, onPageChange } = options;

  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const currentPageRef = useRef<number>(initialPage);
  currentPageRef.current = currentPage;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const isAnimatingRef = useRef<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);

  const [containerHeight, setContainerHeight] = useState<number>(() => {
    if (typeof window !== "undefined") {
      return window.innerHeight;
    }
    return 800;
  });

  const pageY = useMotionValue(-initialPage * containerHeight);

  // Sync measured height of container
  const updateHeight = useCallback(() => {
    if (containerRef.current) {
      const h = containerRef.current.offsetHeight;
      if (h > 0) {
        setContainerHeight(h);
        pageY.set(-currentPageRef.current * h);
      }
    }
  }, [pageY]);

  useEffect(() => {
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [updateHeight]);

  // Smooth programmatic transition to a target page
  const goToPage = useCallback(
    (targetIndex: number, velocity: number = 0) => {
      const h = containerRef.current?.offsetHeight || containerHeight || window.innerHeight;
      const clamped = Math.max(0, Math.min(totalPages - 1, targetIndex));

      setCurrentPage(clamped);
      currentPageRef.current = clamped;
      onPageChange?.(clamped);

      isAnimatingRef.current = true;
      animate(pageY, -clamped * h, {
        type: "spring",
        stiffness: 320,
        damping: 32,
        mass: 0.8,
        velocity: velocity,
        onComplete: () => {
          isAnimatingRef.current = false;
        },
      });
    },
    [totalPages, containerHeight, onPageChange, pageY]
  );

  // Gesture release: strictly enforce 50% threshold with deliberate swipe velocity support
  const handleDragStart = () => {
    isDraggingRef.current = true;
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    const h = containerRef.current?.offsetHeight || containerHeight || window.innerHeight;
    const offset = info.offset.y;
    const velocity = info.velocity.y;

    // Strict 50% page height threshold
    const threshold = h * 0.5;

    let targetPage = currentPageRef.current;

    // Deliberate fast flick check (> 420px/s and at least 30px motion)
    const isFastFlickUp = velocity < -420 && offset < -30;
    const isFastFlickDown = velocity > 420 && offset > 30;

    if (offset < 0) {
      // Dragging UP toward NEXT plan
      const dragDistance = Math.abs(offset);
      if ((dragDistance >= threshold || isFastFlickUp) && targetPage < totalPages - 1) {
        targetPage = targetPage + 1;
      }
      // If dragDistance < threshold, targetPage remains currentPage -> snaps back!
    } else if (offset > 0) {
      // Dragging DOWN toward PREVIOUS plan
      const dragDistance = offset;
      if ((dragDistance >= threshold || isFastFlickDown) && targetPage > 0) {
        targetPage = targetPage - 1;
      }
      // If dragDistance < threshold, targetPage remains currentPage -> snaps back!
    }

    goToPage(targetPage, velocity);

    // Keep dragging flag for a tick to suppress accidental child clicks
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 60);
  };

  // Mouse wheel & Trackpad support (1 page per deliberate wheel flick)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let wheelCooldown = false;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (wheelCooldown || isAnimatingRef.current || isDraggingRef.current) return;

      if (Math.abs(e.deltaY) > 20) {
        wheelCooldown = true;
        if (e.deltaY > 20 && currentPageRef.current < totalPages - 1) {
          goToPage(currentPageRef.current + 1);
        } else if (e.deltaY < -20 && currentPageRef.current > 0) {
          goToPage(currentPageRef.current - 1);
        }
        setTimeout(() => {
          wheelCooldown = false;
        }, 400);
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [totalPages, goToPage]);

  const pagerProps = disabled
    ? {}
    : {
        drag: "y" as const,
        dragDirectionLock: true,
        dragPropagation: false,
        dragConstraints: {
          top: -(totalPages - 1) * (containerRef.current?.offsetHeight || containerHeight),
          bottom: 0,
        },
        dragElastic: 0.15,
        dragMomentum: false,
        onDragStart: handleDragStart,
        onDragEnd: handleDragEnd,
      };

  return {
    currentPage,
    pageY,
    containerRef,
    containerHeight,
    goToPage,
    pagerProps,
    isDraggingRef,
  };
}
