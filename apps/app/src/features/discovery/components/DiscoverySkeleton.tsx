import React from "react";
import { MapPin, Search, Zap } from "lucide-react";

/**
 * Header Skeleton for the Discovery / Create screen
 */
export const DiscoveryHeaderSkeleton: React.FC = () => (
  <header className="sticky top-0 z-30 bg-[#000000] shrink-0 border-b border-white/[0.04]">
    <section className="px-5 pt-3.5 pb-2.5 shrink-0 flex items-center justify-between">
      <div className="flex items-center gap-2 text-left">
        <MapPin className="w-4 h-4 text-zinc-500 shrink-0" />
        <div className="flex flex-col gap-1">
          <div className="h-3.5 w-24 bg-white/[0.08] rounded" />
          <div className="h-2.5 w-16 bg-white/[0.04] rounded" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="p-1 shrink-0">
          <Search className="w-5.5 h-5.5 text-zinc-600" />
        </div>
        <div className="p-1 shrink-0">
          <Zap className="w-5.5 h-5.5 text-zinc-600" />
        </div>
      </div>
    </section>
  </header>
);

/**
 * 4 Category cards skeleton (Dining, Movies, Sports, Activities)
 */
export const DiscoveryCategoryCardsSkeleton: React.FC = () => (
  <section className="px-5 pt-3 pb-3 shrink-0 animate-pulse">
    <div className="grid grid-cols-4 gap-2">
      {["Dining", "Movies", "Sports", "Activities"].map((cat) => (
        <div
          key={cat}
          className="relative h-[86px] rounded-2xl border border-white/[0.08] bg-[#121216]/90 flex flex-col items-center justify-center p-1.5 shadow-sm"
        >
          <div className="w-11 h-11 rounded-xl bg-white/[0.05] flex items-center justify-center shrink-0">
            <div className="w-7 h-7 rounded-lg bg-white/[0.04]" />
          </div>
          <div className="h-3 w-12 bg-white/[0.08] rounded mt-1.5" />
        </div>
      ))}
    </div>
  </section>
);

/**
 * Multi-section Discovery Feed Skeleton (Sports, Movies, Restaurants, Activities)
 */
export const DiscoverySectionsSkeleton: React.FC = () => (
  <div className="space-y-7 pt-2 animate-pulse">
    {["Sports", "Movies", "Restaurants", "Activities"].map((catTitle) => {
      const isMovieCat = catTitle === "Movies";
      return (
        <div key={catTitle} className="space-y-3">
          <div className="px-6 flex items-center justify-between">
            <div className="h-4 w-32 bg-white/[0.08] rounded-md" />
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-2.5">
            {[1, 2, 3, 4, 5].slice(0, isMovieCat ? 5 : 4).map((i) => (
              <div
                key={i}
                style={
                  isMovieCat
                    ? { width: 130, minWidth: 130, height: 235 }
                    : {
                        width: "220px",
                        minWidth: "220px",
                        maxWidth: "220px",
                        height: "225px",
                        minHeight: "225px",
                      }
                }
                className="shrink-0 rounded-2xl bg-[#121216] border border-white/[0.06] overflow-hidden flex flex-col shadow-lg"
              >
                <div
                  className={
                    isMovieCat
                      ? "w-full aspect-[2/3] bg-white/[0.04]"
                      : "w-full h-[130px] bg-white/[0.04]"
                  }
                />
                <div className="p-3 flex flex-col justify-between flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-white/[0.07] rounded" />
                  <div className="h-3 w-1/2 bg-white/[0.04] rounded" />
                  {!isMovieCat && (
                    <div className="h-3 w-2/3 bg-white/[0.04] rounded" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    })}
  </div>
);

/**
 * Complete Full-Screen Discovery Skeleton for Create/Discovery page
 */
export const DiscoverySkeleton: React.FC = () => {
  return (
    <div
      className="flex-1 flex flex-col h-full bg-[#000000] overflow-y-auto no-scrollbar pb-24 text-left select-none relative animate-pulse"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      <DiscoveryHeaderSkeleton />
      <DiscoveryCategoryCardsSkeleton />
      <DiscoverySectionsSkeleton />
    </div>
  );
};

export default DiscoverySkeleton;
