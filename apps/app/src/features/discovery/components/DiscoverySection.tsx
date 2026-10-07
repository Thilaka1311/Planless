import React from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { DiscoveryItem } from "../../../core/types/discovery";
import { RestaurantCard, SportsCard, MovieCard, ActivityCard, DiscoveryCard } from "./DiscoveryCard";
import { extractCleanPlaceId } from "../services/venueRelevance";

export interface DiscoverySectionProps {
  id?: string;
  title?: string;
  subtitle?: string;
  items: DiscoveryItem[];
  onSelectItem: (item: DiscoveryItem) => void;
  isAdmin?: boolean;
  onLongPressAdmin?: (item: DiscoveryItem) => void;
  onViewAll?: () => void;
  colorAccent?: string;
  badgeBg?: string;
  userCoordinates?: { latitude: number; longitude: number } | null;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export const DiscoverySection = React.memo<DiscoverySectionProps>(({
  id,
  title,
  subtitle,
  items,
  onSelectItem,
  isAdmin = false,
  onLongPressAdmin,
  onViewAll,
  colorAccent,
  badgeBg,
  userCoordinates,
  hasMore,
  isLoadingMore,
  onLoadMore,
}) => {
  if (!items || items.length === 0) return null;

  return (
    <div id={id} className="space-y-3">
      {/* Section Header */}
      {title ? (
        <div className="px-6 flex items-end justify-between">
          <div className="space-y-0.5 text-left">
            <h4 className="text-sm font-bold text-white tracking-wide">
              {title}
            </h4>
            {subtitle && (
              <p className="text-[11px] text-zinc-400 font-normal">
                {subtitle}
              </p>
            )}
          </div>
          {onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="text-[11px] font-semibold text-[#FF6B2C] hover:text-[#ff8552] flex items-center gap-0.5 pb-0.5 transition cursor-pointer"
            >
              <span>View all</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      ) : null}

      {/* Horizontally scrolling snapping rail */}
      <div
        className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-2.5 scroll-smooth snap-x snap-mandatory"
        onScroll={(e) => {
          if (!hasMore || isLoadingMore || !onLoadMore) return;
          const el = e.currentTarget;
          if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 200) {
            onLoadMore();
          }
        }}
      >
        {items.map((item) => {
          const cat = item.category?.toUpperCase();
          const itemKey = extractCleanPlaceId(item.place_id || item.id) || item.place_id || item.id;
          const cardProps = {
            item,
            colorAccent,
            badgeBg,
            isAdmin,
            userCoordinates,
            onTap: () => onSelectItem(item),
            onLongPressAdmin: onLongPressAdmin ? () => onLongPressAdmin(item) : undefined,
          };

          if (cat === "DINING") {
            return <RestaurantCard key={itemKey} {...cardProps} />;
          }
          if (cat === "SPORTS") {
            return <SportsCard key={itemKey} {...cardProps} />;
          }
          if (cat === "MOVIES") {
            return <MovieCard key={itemKey} {...cardProps} />;
          }
          if (cat === "ACTIVITIES") {
            return <ActivityCard key={itemKey} {...cardProps} />;
          }
          return <DiscoveryCard key={itemKey} {...cardProps} />;
        })}
        {isLoadingMore && (
          <div className="shrink-0 w-36 h-48 rounded-2xl bg-zinc-900/40 border border-white/[0.06] flex flex-col items-center justify-center gap-2 snap-start">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
            <span className="text-[10px] text-zinc-500 font-medium">Loading more...</span>
          </div>
        )}
      </div>
    </div>
  );
});
