import React from "react";

/**
 * Skeleton loading state for Plan Details / Preview and Create Plan Review screens.
 * Mirrors the exact hero image header, floating info card, participant roster,
 * and bottom action CTA to eliminate layout shifts and spinners.
 */
export const PlanDetailsSkeleton: React.FC<{ className?: string }> = ({ className = "" }) => {
  return (
    <div
      className={`fixed inset-0 z-[60] bg-[#050505] flex flex-col h-full w-full overflow-hidden select-none pointer-events-none text-left ${className}`}
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <div className="flex-1 overflow-y-auto scrollbar-none pb-28 animate-pulse">
        {/* ── 1. HERO COVER & HEADER ── */}
        <div className="relative w-full h-[280px] bg-zinc-900/70 rounded-b-[2.5rem] border-b border-white/10 flex flex-col justify-between p-6">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80 rounded-b-[2.5rem]" />

          {/* Top navigation row */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="w-10 h-10 rounded-full bg-white/[0.08] border border-white/[0.06]" />
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-white/[0.08] border border-white/[0.06]" />
              <div className="w-10 h-10 rounded-full bg-white/[0.08] border border-white/[0.06]" />
            </div>
          </div>

          {/* Plan Title & Creator row */}
          <div className="relative z-10 space-y-2 pb-6">
            <div className="h-7 w-56 max-w-[75%] bg-white/[0.12] rounded-lg" />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.1]" />
              <div className="h-3.5 w-28 bg-white/[0.08] rounded" />
            </div>
          </div>
        </div>

        {/* ── 2. FLOATING INFO CARD ── */}
        <div className="px-6 -mt-8 relative z-20">
          <div className="w-full bg-[#101014]/90 backdrop-blur-2xl border border-white/[0.08] shadow-2xl rounded-2xl p-4 space-y-3.5">
            {/* Row 1: Date & Time + Capacity */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-md bg-emerald-500/20" />
                <div className="h-3.5 w-36 bg-white/[0.08] rounded" />
              </div>
              <div className="h-5 w-12 rounded-full bg-white/[0.08]" />
            </div>

            {/* Row 2: Location */}
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-md bg-[#FF6B2C]/20" />
              <div className="h-3.5 w-48 bg-white/[0.08] rounded" />
            </div>

            {/* Row 3: Cost / Details */}
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-md bg-purple-500/20" />
              <div className="h-3.5 w-24 bg-white/[0.06] rounded" />
            </div>
          </div>
        </div>

        {/* ── 3. PARTICIPANTS SECTION ── */}
        <div className="px-6 mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-4 w-28 bg-white/[0.08] rounded" />
              <div className="h-4 w-8 rounded-full bg-white/[0.06]" />
            </div>
          </div>

          <div className="flex items-center gap-4 overflow-hidden pt-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex flex-col items-center space-y-2 shrink-0">
                <div className="w-12 h-12 rounded-full bg-white/[0.08] border border-white/[0.06]" />
                <div className="h-2.5 w-10 bg-white/[0.05] rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4. BOTTOM ACTION CTA ── */}
      <div
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
        className="fixed bottom-0 left-0 right-0 z-30 px-6 pt-3 pb-4 bg-gradient-to-t from-black via-black/90 to-transparent pointer-events-none"
      >
        <div className="w-full h-12 rounded-2xl bg-[#FF6B2C]/20 border border-[#FF6B2C]/30 flex items-center justify-center">
          <div className="h-4 w-28 bg-white/[0.12] rounded" />
        </div>
      </div>
    </div>
  );
};
