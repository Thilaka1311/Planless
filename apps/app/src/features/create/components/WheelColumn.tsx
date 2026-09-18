import React, { useRef, useEffect, useCallback } from 'react';

export const ITEM_H = 44;      // px height of each wheel row
const VISIBLE        = 3;       // rows shown (odd → center = selection)
const PAD            = 1;       // spacer rows on each end

// Hide webkit scrollbar once at module load
if (typeof document !== 'undefined') {
  const s = document.createElement('style');
  s.textContent = '.wc-scroll::-webkit-scrollbar{display:none}';
  document.head.appendChild(s);
}

export interface WheelColumnProps {
  items:          string[];
  selectedIndex:  number;
  onIndexChange:  (i: number) => void;
  flex?:          number;
  fontSize?:      number;
}

export const WheelColumn: React.FC<WheelColumnProps> = ({
  items, selectedIndex, onIndexChange, flex = 1, fontSize = 17,
}) => {
  const scrollRef   = useRef<HTMLDivElement>(null);
  const lastIdx     = useRef(selectedIndex);
  const scrolling   = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rafRef      = useRef<number>(undefined);

  // Always-current refs so callbacks never go stale
  const onChangeRef = useRef(onIndexChange);
  const lenRef      = useRef(items.length);
  useEffect(() => { onChangeRef.current = onIndexChange; }, [onIndexChange]);
  useEffect(() => { lenRef.current = items.length;       }, [items.length]);

  /* ── apply opacity + scale to each item based on distance from center ── */
  const applyVisuals = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const cIdx = el.scrollTop / ITEM_H;
    el.querySelectorAll<HTMLElement>('[data-wi]').forEach(node => {
      const i    = Number(node.dataset.wi);
      const dist = Math.abs(cIdx - i);
      node.style.opacity    = String(Math.max(0.11, 1 - dist * 0.43));
      node.style.transform  = `scale(${Math.max(0.75, 1 - dist * 0.09)})`;
      node.style.fontFamily = 'Inter, sans-serif';
      node.style.fontWeight = dist < 0.35 ? '600' : '400';
      node.style.color      = dist < 0.35 ? '#FFFFFF' : '#71717A';
    });
  }, []);

  /* ── programmatic scroll ── */
  const scrollTo = useCallback((idx: number, behavior: ScrollBehavior = 'smooth') => {
    scrollRef.current?.scrollTo({ top: idx * ITEM_H, behavior });
  }, []);

  /* ── mount: instant position ── */
  useEffect(() => {
    scrollTo(selectedIndex, 'instant');
    requestAnimationFrame(applyVisuals);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── external prop change (e.g. month clamping date) ── */
  useEffect(() => {
    if (!scrolling.current && selectedIndex !== lastIdx.current) {
      lastIdx.current = selectedIndex;
      scrollTo(selectedIndex, 'smooth');
      const t = setTimeout(applyVisuals, 300);
      return () => clearTimeout(t);
    }
  }, [selectedIndex, scrollTo, applyVisuals]);

  /* ── scroll handler: RAF visuals + debounced snap detection ── */
  const handleScroll = useCallback(() => {
    scrolling.current = true;
    cancelAnimationFrame(rafRef.current!);
    rafRef.current = requestAnimationFrame(applyVisuals);

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const snapped = Math.max(0, Math.min(lenRef.current - 1, Math.round(el.scrollTop / ITEM_H)));

      // Correct minor drift from inertia
      if (Math.abs(el.scrollTop - snapped * ITEM_H) > 2) {
        scrollTo(snapped, 'smooth');
      }
      if (snapped !== lastIdx.current) {
        lastIdx.current = snapped;
        onChangeRef.current(snapped);
        try { navigator.vibrate(8); } catch {} // eslint-disable-line no-empty
      }
      setTimeout(() => { scrolling.current = false; }, 250);
    }, 110);
  }, [applyVisuals, scrollTo]);

  /* ── scrollend (modern browsers) for reliable final-position read ── */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onEnd = () => {
      const snapped = Math.max(0, Math.min(lenRef.current - 1, Math.round(el.scrollTop / ITEM_H)));
      applyVisuals();
      if (snapped !== lastIdx.current) {
        lastIdx.current = snapped;
        onChangeRef.current(snapped);
      }
    };
    el.addEventListener('scrollend', onEnd);
    return () => el.removeEventListener('scrollend', onEnd);
  }, [applyVisuals]);

  return (
    <div style={{ flex, overflow: 'hidden' }}>
      <div
        ref={scrollRef}
        className="wc-scroll"
        onScroll={handleScroll}
        style={{
          height: ITEM_H * VISIBLE,
          overflowY: 'scroll',
          scrollSnapType: 'y mandatory',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}
      >
        {/* top spacers */}
        {Array.from({ length: PAD }, (_, k) => (
          <div key={`t${k}`} style={{ height: ITEM_H, flexShrink: 0 }} />
        ))}

        {/* real items */}
        {items.map((label, i) => (
          <div
            key={i}
            data-wi={i}
            onClick={() => {
              if (i !== lastIdx.current) {
                lastIdx.current = i;
                onChangeRef.current(i);
                scrollTo(i, 'smooth');
              }
            }}
            style={{
              height: ITEM_H,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              scrollSnapAlign: 'center',
              fontSize,
              color: 'rgba(255,255,255,0.9)',
              userSelect: 'none',
              flexShrink: 0,
              cursor: 'pointer',
              letterSpacing: '-0.01em',
              // Initial visual (overwritten immediately by applyVisuals)
              opacity: Math.max(0.11, 1 - Math.abs(i - selectedIndex) * 0.43),
              fontWeight: i === selectedIndex ? 700 : 400,
              transform: `scale(${Math.max(0.75, 1 - Math.abs(i - selectedIndex) * 0.09)})`,
            }}
          >
            {label}
          </div>
        ))}

        {/* bottom spacers */}
        {Array.from({ length: PAD }, (_, k) => (
          <div key={`b${k}`} style={{ height: ITEM_H, flexShrink: 0 }} />
        ))}
      </div>
    </div>
  );
};
