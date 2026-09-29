import React from "react";
import { ChevronRight } from "lucide-react";
import { DiscoveryItem } from "../../../core/types/discovery";
import { RestaurantCard, SportsCard, MovieCard, ActivityCard, DiscoveryCard } from "./DiscoveryCard";

export interface DiscoverySectionProps {
  id?: string;
  title: string;
  subtitle?: string;
  items: DiscoveryItem[];
  onSelectItem: (item: DiscoveryItem) => void;
  isAdmin?: boolean;
  onLongPressAdmin?: (item: DiscoveryItem) => void;
  onViewAll?: () => void;
  colorAccent?: string;
  badgeBg?: string;
  userCoordinates?: { latitude: number; longitude: number } | null;
}

export const DiscoverySection: React.FC<DiscoverySectionProps> = ({
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
}) => {
  if (!items || items.length === 0) return null;

  return (
    <div id={id} className="space-y-3">
      {/* Section Header */}
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

      {/* Horizontally scrolling snapping rail */}
      <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-2.5 scroll-smooth snap-x snap-mandatory">
        {items.map((item) => {
          const cat = item.category?.toUpperCase();
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
            return <RestaurantCard key={item.id} {...cardProps} />;
          }
          if (cat === "SPORTS") {
            return <SportsCard key={item.id} {...cardProps} />;
          }
          if (cat === "MOVIES") {
            return <MovieCard key={item.id} {...cardProps} />;
          }
          if (cat === "ACTIVITIES") {
            return <ActivityCard key={item.id} {...cardProps} />;
          }
          return <DiscoveryCard key={item.id} {...cardProps} />;
        })}
      </div>
    </div>
  );
};
