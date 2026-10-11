import React, { useState, useEffect, useRef, useCallback } from "react";
import { ChevronUp } from "lucide-react";

export interface BackToTopButtonProps {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

export const BackToTopButton: React.FC<BackToTopButtonProps> = ({
  scrollContainerRef,
  className = "",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const lastScrollTopRef = useRef<number>(0);

  useEffect(() => {
    let container = scrollContainerRef.current;
    let removeListener: (() => void) | null = null;

    const attach = (target: HTMLDivElement) => {
      // Initialize with target's current scroll position and hidden state
      lastScrollTopRef.current = target.scrollTop;
      setIsVisible(false);

      let ticking = false;
      const handleScroll = () => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            const currentScrollTop = target.scrollTop;
            const delta = currentScrollTop - lastScrollTopRef.current;

            // 1. Returning to or near top: hide and reset
            if (currentScrollTop <= 60) {
              setIsVisible(false);
            } else if (Math.abs(delta) > 10) {
              // 2. Scrolling down: hide button
              if (delta > 0) {
                setIsVisible(false);
              }
              // 3. Scrolling up and sufficiently down from top (> 180px): show button
              else if (delta < 0 && currentScrollTop > 180) {
                setIsVisible(true);
              }
            }

            lastScrollTopRef.current = currentScrollTop;
            ticking = false;
          });
          ticking = true;
        }
      };

      target.addEventListener("scroll", handleScroll, { passive: true });
      removeListener = () => target.removeEventListener("scroll", handleScroll);
    };

    if (container) {
      attach(container);
    } else {
      const timer = setTimeout(() => {
        if (scrollContainerRef.current) {
          attach(scrollContainerRef.current);
        }
      }, 50);
      return () => {
        clearTimeout(timer);
        if (removeListener) removeListener();
      };
    }

    return () => {
      if (removeListener) removeListener();
    };
  }, [scrollContainerRef]);

  const handleScrollToTop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
    setIsVisible(false);
    lastScrollTopRef.current = 0;
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("planless_bottom_nav_visibility", { detail: { visible: true } })
      );
    }
  }, [scrollContainerRef]);

  return (
    <button
      type="button"
      onClick={handleScrollToTop}
      aria-label="Back to top"
      className={`fixed top-[68px] left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#18181b]/95 border border-white/10 text-white shadow-xl backdrop-blur-md hover:bg-zinc-800 active:scale-95 transition-all duration-300 ease-out cursor-pointer select-none ${
        isVisible
          ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
          : "opacity-0 -translate-y-2 scale-95 pointer-events-none"
      } ${className}`}
    >
      <ChevronUp className="w-4 h-4 text-zinc-200 shrink-0" />
      <span className="text-xs font-semibold text-zinc-100 tracking-tight leading-none whitespace-nowrap">
        Back to top
      </span>
    </button>
  );
};

export default React.memo(BackToTopButton);
