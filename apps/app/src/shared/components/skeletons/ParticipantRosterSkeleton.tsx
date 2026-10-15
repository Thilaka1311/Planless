import React from "react";

/**
 * Skeleton loading state for Participant Management, WhoIsActuallyComing,
 * and roster view screens.
 * Mirrors the header, segmented tab bar (Joined / Waitlist), participant rows,
 * and bottom sticky action button.
 */
export const ParticipantRosterSkeleton: React.FC<{
  className?: string;
  hasContinueButton?: boolean;
}> = ({ className = "", hasContinueButton = true }) => {
  return (
    <div
      className={`fixed inset-0 z-40 bg-[#000000] flex flex-col h-full w-full overflow-hidden select-none pointer-events-none text-left ${className}`}
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <div className="flex-1 flex flex-col h-full animate-pulse">
        {/* ── 1. HEADER (56px) ── */}
        <div className="w-full shrink-0 px-5 h-[56px] flex items-center justify-between bg-[#000000] border-b border-white/[0.04]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-full bg-white/[0.08]" />
            <div className="h-4 w-36 bg-white/[0.12] rounded" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-white/[0.08]" />
          </div>
        </div>

        {/* ── 2. SEGMENTED TABS (Joined / Waitlist) ── */}
        <div className="px-5 pt-3 pb-2 shrink-0">
          <div className="w-full h-10 rounded-xl bg-[#121216] border border-white/[0.06] flex p-1 gap-1">
            <div className="flex-1 rounded-lg bg-white/[0.1] flex items-center justify-center">
              <div className="h-3.5 w-20 bg-white/[0.12] rounded" />
            </div>
            <div className="flex-1 rounded-lg flex items-center justify-center">
              <div className="h-3.5 w-16 bg-white/[0.05] rounded" />
            </div>
          </div>
        </div>

        {/* ── 3. PARTICIPANT ROWS ── */}
        <div className="flex-1 px-5 py-2 space-y-1 overflow-hidden">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2.5 border-b border-white/[0.03]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-white/[0.08] shrink-0" />
                <div className="space-y-1.5">
                  <div
                    className="h-3.5 bg-white/[0.09] rounded"
                    style={{ width: `${80 + ((i * 23) % 50)}px` }}
                  />
                  <div className="h-2.5 w-16 bg-white/[0.04] rounded" />
                </div>
              </div>

              <div className="w-6 h-6 rounded-md bg-white/[0.04] shrink-0" />
            </div>
          ))}
        </div>

        {/* ── 4. BOTTOM ACTION CTA ── */}
        {hasContinueButton && (
          <div
            style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
            className="shrink-0 px-5 pt-3 pb-4 bg-gradient-to-t from-black via-black/95 to-transparent"
          >
            <div className="w-full h-12 rounded-2xl bg-[#FF6B2C]/20 border border-[#FF6B2C]/30 flex items-center justify-center">
              <div className="h-4 w-24 bg-white/[0.12] rounded" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
