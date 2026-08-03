import { useState, useEffect, useRef } from "react";
import { useMotionValue, animate, PanInfo } from "motion/react";

export interface UseHorizontalPagerOptions {
  initialPage?: number;
  totalPages?: number;
  keyboardOpen?: boolean;
}

export function useHorizontalPager(options: UseHorizontalPagerOptions = {}) {
  const { initialPage = 1, totalPages = 3, keyboardOpen = false } = options;

  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [overlayPage, setOverlayPage] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const overlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevWidthRef = useRef<number>(typeof window !== "undefined" ? window.innerWidth : 0);

  const pageX = useMotionValue(-initialPage * (typeof window !== "undefined" ? window.innerWidth : 375));

  const triggerOverlay = (pageIndex: number) => {
    if (overlayTimerRef.current) {
      clearTimeout(overlayTimerRef.current);
    }
    setOverlayPage(pageIndex);
    overlayTimerRef.current = setTimeout(() => {
      setOverlayPage(null);
      overlayTimerRef.current = null;
    }, 800);
  };

  useEffect(() => {
    return () => {
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
      }
    };
  }, []);

  const goToPage = (pageIndex: number, showOverlay: boolean = true, velocity: number = 0) => {
    if (keyboardOpen) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }

    const width = containerRef.current?.offsetWidth || window.innerWidth;
    const isChange = pageIndex !== currentPage;
    setCurrentPage(pageIndex);

    if (isChange && showOverlay) {
      triggerOverlay(pageIndex);
    }

    animate(pageX, -pageIndex * width, {
      type: "spring",
      stiffness: 350,
      damping: 32,
      mass: 0.8,
      velocity: velocity,
    });
  };

  // Recalculate width ONLY on horizontal window resize (ignore vertical keyboard resize events)
  useEffect(() => {
    const handleWindowResize = () => {
      const currentWidth = window.innerWidth;
      if (Math.abs(currentWidth - prevWidthRef.current) > 10) {
        prevWidthRef.current = currentWidth;
        const width = containerRef.current?.offsetWidth || currentWidth;
        pageX.set(-currentPage * width);
      }
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [currentPage, pageX]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    const width = containerRef.current?.offsetWidth || window.innerWidth;
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    const threshold = width * 0.15; // Fast, responsive 15% viewport threshold

    let targetPage = currentPage;

    // Highly responsive Instagram-style flick snapping (150px/s or 15% screen width)
    if ((offset < -threshold || velocity < -150) && currentPage < totalPages - 1) {
      targetPage = currentPage + 1;
    } else if ((offset > threshold || velocity > 150) && currentPage > 0) {
      targetPage = currentPage - 1;
    }

    goToPage(targetPage, true, velocity);
  };

  const pagerProps = {
    drag: "x" as const,
    dragDirectionLock: true,
    dragPropagation: false,
    dragConstraints: {
      left: typeof window !== "undefined" ? -2 * window.innerWidth : -750,
      right: 0,
    },
    dragElastic: { left: 0.2, right: 0.2 },
    dragMomentum: false,
    onDragEnd: handleDragEnd,
  };

  return {
    currentPage,
    overlayPage,
    pageX,
    containerRef,
    goToPage,
    pagerProps,
  };
}
