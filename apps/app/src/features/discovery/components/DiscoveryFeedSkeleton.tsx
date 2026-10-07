import React from "react";

/**
 * Skeleton loading state for Discovery feeds matching exact 220px × 225px card dimensions
 * and two-section structure to guarantee zero layout shifts when real cards arrive.
 */
export const DiscoveryFeedSkeleton: React.FC = () => {
  return (
    <div className="space-y-8 select-none pointer-events-none animate-pulse">
      {[0, 1].map((secIdx) => (
        <div key={`skeleton_sec_${secIdx}`} className="space-y-3">
          {/* Header Skeleton */}
          <div className="px-6 flex items-end justify-between">
            <div className="space-y-1 text-left">
              <div className="h-4 w-36 bg-white/[0.08] rounded-md" />
            </div>
          </div>

          {/* Rail of 4 Card Skeletons matching exact 220px x 225px dimensions */}
          <div className="flex gap-3 overflow-hidden px-6 pb-2.5">
            {[0, 1, 2, 3].map((cardIdx) => (
              <div
                key={`skeleton_card_${secIdx}_${cardIdx}`}
                style={{
                  width: "220px",
                  minWidth: "220px",
                  maxWidth: "220px",
                  height: "225px",
                  minHeight: "225px",
                }}
                className="shrink-0 rounded-2xl overflow-hidden bg-[#121216] border border-white/[0.08] flex flex-col shadow-lg"
              >
                {/* Image Container (130px) */}
                <div className="w-full h-[130px] bg-zinc-900/80" />

                {/* Info Container */}
                <div className="p-3 flex flex-col justify-between flex-1 min-w-0 bg-[#121216]">
                  <div className="min-w-0 flex flex-col space-y-1.5">
                    {/* Row 1: Name + Rating */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="h-3.5 w-28 bg-white/[0.08] rounded" />
                      <div className="h-3.5 w-7 bg-white/[0.08] rounded" />
                    </div>
                    {/* Row 2: Locality */}
                    <div className="h-3 w-20 bg-white/[0.04] rounded" />
                  </div>
                  {/* Row 3: Distance */}
                  <div className="h-3 w-12 bg-white/[0.04] rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
