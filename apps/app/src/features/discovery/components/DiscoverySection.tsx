import React from "react";
import { ChevronRight } from "lucide-react";
import { DiscoveryItem } from "../../../core/types/discovery";
import { RestaurantCard, SportsCard, MovieCard, ActivityCard, DiscoveryCard } from "./DiscoveryCard";
import { extractCleanPlaceId, isPlaceholderImageUrl, isPhotoUrlBroken } from "../services/venueRelevance";

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
  // Guard: Completely exclude any standalone "Nearby" section
  if (
    title &&
    (title.trim().toLowerCase() === "nearby" ||
      title.trim().toLowerCase() === "nearby places")
  ) {
    return null;
  }

  const renderableItems = React.useMemo(() => {
    if (!items || items.length === 0) return [];
    return items.filter((item) => {
      const cat = (item.category || "").toUpperCase();
      const isStrict = cat === "SPORTS" || cat === "DINING" || cat === "ACTIVITIES" || cat === "MOVIES";
      if (isStrict) {
        if (!item.cover_image_url) return false;
        if (isPlaceholderImageUrl(item.cover_image_url)) return false;
        if (isPhotoUrlBroken(item.cover_image_url)) return false;
      }
      return true;
    });
  }, [items]);

  if (renderableItems.length === 0) return null;

  const displaySubtitle = subtitle
    ? subtitle.replace(/\b\d+\b/, String(renderableItems.length))
    : undefined;

  return (
    <div id={id} className="space-y-3">
      {/* Section Header */}
      {title ? (
        <div className="px-6 flex items-end justify-between">
          <div className="space-y-0.5 text-left">
            <h4 className="text-sm font-bold text-white tracking-wide">
              {title}
            </h4>
            {displaySubtitle && (
              <p className="text-[11px] text-zinc-400 font-normal">
                {displaySubtitle}
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
        {renderableItems.map((item) => {
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
          <div
            style={{ width: "220px", minWidth: "220px", maxWidth: "220px", height: "225px", minHeight: "225px" }}
            className="shrink-0 rounded-2xl bg-[#121216] border border-white/[0.06] overflow-hidden flex flex-col shadow-lg animate-pulse snap-start"
          >
            <div className="w-full h-[130px] bg-white/[0.04]" />
            <div className="p-3 flex flex-col justify-between flex-1 space-y-2">
              <div className="h-4 w-3/4 bg-white/[0.07] rounded" />
              <div className="h-3 w-1/2 bg-white/[0.04] rounded" />
              <div className="h-3 w-2/3 bg-white/[0.04] rounded" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
