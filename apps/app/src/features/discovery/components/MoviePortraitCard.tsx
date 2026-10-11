import React from "react";
import { DiscoveryItem } from "../../../core/types/discovery";
import { TMDB_LANGUAGE_NAMES } from "../services/tmdbMovieService";

export interface MoviePortraitCardProps {
  item: DiscoveryItem;
  onTap: () => void;
  isAdmin?: boolean;
  onLongPressAdmin?: () => void;
}

/**
 * MoviePortraitCard
 * Dedicated portrait-oriented card with complete 2:3 aspect ratio poster presentation.
 * Formatted cleanly for a compact 2-column mobile grid matching the reference design.
 */
export const MoviePortraitCard: React.FC<MoviePortraitCardProps> = ({
  item,
  onTap,
}) => {
  const effectiveItem = item;

  const langLabel =
    effectiveItem.language_name ||
    (effectiveItem.original_language
      ? TMDB_LANGUAGE_NAMES[effectiveItem.original_language.toLowerCase()] || effectiveItem.original_language.toUpperCase()
      : "");

  const releaseYear = effectiveItem.release_date
    ? new Date(effectiveItem.release_date).getFullYear().toString()
    : "";

  return (
    <div
      data-discovery-item-id={effectiveItem.id || effectiveItem.public_id}
      onClick={onTap}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "pan-x pan-y",
      }}
      className="group relative flex flex-col rounded-2xl overflow-hidden bg-[#121216] border border-white/[0.08] shadow-md hover:border-white/20 active:brightness-95 transition-all duration-200 cursor-pointer select-none"
    >
      {/* 1. Portrait Poster Area (Exact 2:3 ratio ensuring the entire poster is visible) - Display only */}
      <div
        className="relative w-full aspect-[2/3] overflow-hidden bg-[#0a0a0d] shrink-0 pointer-events-none select-none"
        style={{ userSelect: "none", WebkitUserSelect: "none", pointerEvents: "none" }}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img
          src={effectiveItem.cover_image_url || "/assets/plan-covers/movie.png"}
          alt={effectiveItem.title}
          width={130}
          height={195}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none select-none"
          loading="lazy"
          decoding="async"
          style={{
            aspectRatio: "2 / 3",
            pointerEvents: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = "/assets/plan-covers/movie.png";
          }}
        />
      </div>

      {/* 2. Structured Information Section - Display only, parent card handles click & hold */}
      <div
        className="p-2.5 flex flex-col justify-between flex-1 min-w-0 text-left bg-[#121216] pointer-events-none select-none"
        style={{ userSelect: "none", WebkitUserSelect: "none", pointerEvents: "none" }}
      >
        {/* Movie Title (max 2 lines with consistent min-height for uniform card alignment) */}
        <h4 className="text-[13px] font-bold text-white tracking-tight leading-snug line-clamp-2 min-h-[34px] group-hover:text-violet-300 transition-colors select-none">
          {effectiveItem.title}
        </h4>

        {/* Language and Release Year */}
        <div className="pt-1.5 flex items-center justify-between text-[11px] min-w-0 select-none">
          {langLabel ? (
            <span className="text-zinc-300 font-medium truncate text-[11px] select-none">
              {langLabel}
            </span>
          ) : (
            <div />
          )}
          {releaseYear && (
            <span className="text-zinc-400 font-normal text-[11px] shrink-0 select-none">
              {releaseYear}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
