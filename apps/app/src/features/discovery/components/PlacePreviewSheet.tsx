import React from "react";
import { createPortal } from "react-dom";
import { MapPin, ArrowRight, Calendar, Film, Globe } from "lucide-react";
import { DiscoveryItem } from "../../../core/types/discovery";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { resolveVenueCategories, resolveVenueRating, resolveVenueDistance } from "./DiscoveryCard";
import { TMDB_LANGUAGE_NAMES } from "../services/tmdbMovieService";

export interface PlacePreviewSheetProps {
  item: DiscoveryItem | null;
  onClose: () => void;
  onConfirmPlan: (item: DiscoveryItem) => void;
  userCoordinates?: { latitude: number; longitude: number } | null;
}

export const PlacePreviewSheet: React.FC<PlacePreviewSheetProps> = ({
  item,
  onClose,
  onConfirmPlan,
  userCoordinates,
}) => {
  const effectiveItem = item;
  if (!effectiveItem) return null;

  const isMovie = (effectiveItem.category || "").toUpperCase() === "MOVIES";

  // Single source of truth across DiscoveryCard and Place Details sheet
  const rating = resolveVenueRating(effectiveItem);
  const placeType = resolveVenueCategories(effectiveItem);
  const distance = resolveVenueDistance(effectiveItem, userCoordinates);

  const locationText = effectiveItem.place_address || effectiveItem.location || "Nearby";
  const hasDistinctDescription =
    Boolean(effectiveItem.description) &&
    effectiveItem.description !== effectiveItem.location &&
    effectiveItem.description !== effectiveItem.place_address;

  const formattedReleaseDate = effectiveItem.release_date
    ? new Date(effectiveItem.release_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const languageLabel =
    effectiveItem.language_name ||
    (effectiveItem.original_language
      ? TMDB_LANGUAGE_NAMES[effectiveItem.original_language.toLowerCase()] || effectiveItem.original_language.toUpperCase()
      : null);

  const heroImageSrc = isMovie
    ? effectiveItem.backdrop_url || effectiveItem.cover_image_url
    : effectiveItem.cover_image_url;

  const content = (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-label="Close sheet overlay"
      />

      {/* Bottom Sheet Modal */}
      <div className="relative w-full bg-[#111113] border-t border-white/[0.08] rounded-t-3xl z-10 max-h-[90vh] flex flex-col shadow-2xl animate-slide-up overflow-hidden">
        {/* Grab Handle Header (Dismissible) */}
        <div
          onClick={onClose}
          className="pt-3 pb-2.5 px-6 flex items-center justify-center shrink-0 cursor-pointer active:opacity-70 transition"
          aria-label="Dismiss sheet"
        >
          <div className="w-10 h-1 bg-white/20 hover:bg-white/40 rounded-full transition-colors" />
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4 no-scrollbar">
          {/* 1. Pure Photograph - Clean image with zero badges or text overlays */}
          <div className="relative w-full h-52 rounded-2xl overflow-hidden bg-zinc-900 border border-white/[0.06] shrink-0">
            <DiscoveryImages
              src={heroImageSrc}
              category={effectiveItem.category}
              alt={effectiveItem.title}
              className="w-full h-full object-cover"
            />
          </div>

          {/* 2. Structured Information Below Image */}
          <div className="space-y-2 text-left">
            {/* Title */}
            <h3 className="text-xl font-bold text-white tracking-tight leading-snug font-sans">
              {effectiveItem.title}
            </h3>

            {isMovie ? (
              /* Movie Specific Metadata */
              <div className="space-y-2.5 pt-0.5">
                {item.genres && item.genres.length > 0 && (
                  <div className="flex items-center gap-2 text-xs flex-wrap font-sans">
                    <span className="text-zinc-300 font-medium">
                      {item.genres.join(", ")}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 text-xs text-zinc-400 font-sans flex-wrap">
                  {formattedReleaseDate && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span>Release: {formattedReleaseDate}</span>
                    </div>
                  )}
                  {languageLabel && (
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span>Language: <strong className="text-zinc-300 font-medium">{languageLabel}</strong></span>
                    </div>
                  )}
                </div>

                {item.description && (
                  <div className="pt-1">
                    <h5 className="text-[11px] font-semibold text-zinc-400 tracking-wide mb-1">
                      Overview
                    </h5>
                    <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                      {item.description}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Venue Specific Metadata (Dining, Sports) */
              <>
                <div className="flex items-center gap-2 text-xs flex-wrap font-sans">
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#178544] text-white font-bold rounded text-[11px] shrink-0 leading-none">
                    {rating}
                    <span className="text-[10px]">★</span>
                  </span>

                  <span className="text-zinc-300 font-medium truncate max-w-[200px]">
                    {placeType}
                  </span>

                  <span className="text-zinc-600">·</span>

                  <span className="text-zinc-400 font-medium shrink-0">
                    {distance}
                  </span>
                </div>

                <div className="flex items-start gap-1.5 text-xs text-zinc-400 leading-relaxed pt-0.5 font-sans">
                  <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                  <span>{locationText}</span>
                </div>

                {hasDistinctDescription && (
                  <p className="text-xs text-zinc-400 font-normal leading-relaxed pt-1 line-clamp-3 font-sans">
                    {item.description}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* 3. Sticky Action Footer */}
        <div className="p-4 px-6 bg-[#111113]/95 border-t border-white/[0.06] backdrop-blur-md shrink-0 pb-[calc(1.25rem+env(safe-area-inset-bottom,16px))]">
          <button
            onClick={() => onConfirmPlan(item)}
            className="w-full h-12 rounded-xl bg-[#FF6B2C] hover:bg-[#ff5a14] active:scale-[0.98] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B2C]/20 transition-all duration-200 cursor-pointer"
          >
            <span>{isMovie ? "Create Plan with this Movie" : "Start a Plan Here"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(content, document.body);
  }
  return content;
};
