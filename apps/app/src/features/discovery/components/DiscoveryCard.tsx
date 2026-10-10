import React from "react";
import { DiscoveryItem } from "../../../core/types/discovery";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { TMDB_LANGUAGE_NAMES } from "../services/tmdbMovieService";
import { getSportsVenueLabel, extractSportsList } from "../services/sportsRelevance";
import { getStoredDiscoveryLocation } from "../hooks/useUserLocation";
import { useLongPress } from "../../../shared/hooks/useLongPress";
import { resolveVenueLocality } from "../services/addressUtils";

export { resolveVenueLocality };

export interface DiscoveryCardProps {
  item: DiscoveryItem;
  colorAccent?: string;
  badgeBg?: string;
  isAdmin?: boolean;
  onTap: () => void;
  onLongPressAdmin?: () => void;
  userCoordinates?: { latitude: number; longitude: number } | null;
  showLocality?: boolean;
}

/**
 * Filter out Google's raw generic provider types (e.g. "Establishment | Point Of Interest", "Athletic Field | Sports Club").
 */
function isGenericGoogleProviderType(str: string): boolean {
  const s = str.trim().toLowerCase();
  return (
    s === "establishment" ||
    s === "point of interest" ||
    s === "premise" ||
    s === "feature" ||
    s === "neighborhood" ||
    s === "generic business" ||
    s === "establishment | point of interest" ||
    s === "point of interest | establishment" ||
    s === "athletic field" ||
    s === "sports club" ||
    s === "sports complex" ||
    s === "sports activity location" ||
    s === "playground" ||
    s === "stadium" ||
    s === "association or organization" ||
    s === "sports coaching" ||
    s === "sports school" ||
    s === "athletic field | sports club" ||
    s === "sports club | athletic field" ||
    s === "sports complex | athletic field" ||
    s === "sports club | association or organization" ||
    s === "sports complex | sports activity location"
  );
}


/** Canonical display names for normalized sport category IDs. */
const SPORT_LABELS: Record<string, string> = {
  football: "Football",
  badminton: "Badminton",
  pickleball: "Pickleball",
  tennis: "Tennis",
  basketball: "Basketball",
  cricket: "Cricket",
  "table-tennis": "Table Tennis",
  swimming: "Swimming",
  squash: "Squash",
  volleyball: "Volleyball",
};

/**
 * Formats a list of sport IDs or names for compact card display.
 * Up to 2 sports shown by name; excess are shown as "+N".
 * Example: ["football", "badminton", "pickleball"] → "Football · Badminton +1"
 */
function formatSupportedSportsList(sports: string[], maxVisible = 2): string {
  const names = sports.map((s) => {
    const lower = s.toLowerCase();
    return SPORT_LABELS[lower] || s.charAt(0).toUpperCase() + s.slice(1);
  });
  if (names.length <= maxVisible) return names.join(" · ");
  return `${names.slice(0, maxVisible).join(" · ")} +${names.length - maxVisible}`;
}

/**
 * Resolves exact categories for a venue based on its metadata and name.
 * For Sports venues, uses the Planless ranked sports venue label engine (e.g. "Football Turf", "Badminton Court").
 * Multiple categories are cleanly separated with " | " (e.g., "Bar | Restaurant", "North Indian | Dhaba").
 */
export function resolveVenueCategories(item: DiscoveryItem): string {
  const cat = (item.category || "").toUpperCase();
  let sub = item.subcategory || "";
  if (Array.isArray(sub)) {
    sub = (sub as string[]).join(" | ");
  }
  const sportCat = (item as any)._sportCategory;

  // 1. Movies: use TMDB genres
  if (cat === "MOVIES" && item.genres && item.genres.length > 0) {
    return item.genres.slice(0, 2).join(" · ");
  }

  // 2. Specific Sport Category (filtered view): show the relevant sport label for that section
  if (sportCat && sportCat !== "all") {
    return getSportsVenueLabel(item, sportCat);
  }

  // 3. Sports All-view: show every supported sport compactly (e.g. "Football · Badminton +1")
  if (cat === "SPORTS") {
    // Prefer stamped supported_sports / supportedSports array
    const supported: string[] =
      Array.isArray((item as any).supported_sports) && (item as any).supported_sports.length > 0
        ? (item as any).supported_sports
        : Array.isArray((item as any).supportedSports) && (item as any).supportedSports.length > 0
        ? (item as any).supportedSports
        : [];
    if (supported.length > 0) {
      return formatSupportedSportsList(supported);
    }
    // Fall back to subcategory if non-generic (e.g. from database override ["Football", "Pickleball"] or "Football | Pickleball" or "Badminton")
    const extractedSports = extractSportsList(item.subcategory).filter(
      (s) => !isGenericGoogleProviderType(s)
    );
    if (extractedSports.length > 0) {
      return formatSupportedSportsList(extractedSports);
    }
    // Fallback: use ranked sports venue label engine (which checks name keywords)
    return getSportsVenueLabel(item, sportCat);
  }

  // 4. Non-sports Admin Override / Grouped Categories (Dining, Activities)
  if (sub && !isGenericGoogleProviderType(sub)) {
    if (sub.includes("|")) {
      const parts = sub
        .split("|")
        .map((s) => s.trim())
        .filter((s) => Boolean(s) && !isGenericGoogleProviderType(s));
      if (parts.length > 0) {
        return parts.join(" | ");
      }
    } else if (item._hasPlanlessOverride) {
      return sub;
    }
  }

  // 5. Sports via sportCat (legacy path)
  if (sportCat) {
    return getSportsVenueLabel(item, sportCat);
  }

  if (sub && !isGenericGoogleProviderType(sub)) {
    return sub;
  }

  // Fallback if no specific subcategory exists
  if (cat === "MOVIES") return "Cinema";
  if (cat === "DINING") return "Dining";
  if (cat === "SPORTS") return getSportsVenueLabel(item);
  if (cat === "ACTIVITIES") {
    const t = (item.title || "").toLowerCase();
    if (t.includes("kart")) return "Go-Karting";
    if (t.includes("bowl")) return "Bowling";
    if (t.includes("mystery") || t.includes("escape")) return "Mystery Rooms";
    if (t.includes("arcade") || t.includes("gaming") || t.includes("timezone")) return "Arcades";
    if (t.includes("mini golf") || t.includes("golf")) return "Mini Golf";
    if (t.includes("amusement") || t.includes("theme park")) return "Amusement Parks";
    if (t.includes("adventure") || t.includes("trampoline")) return "Adventure & Fun";
    return "Activities";
  }

  return "Venue";
}

const getCategoryPriceText = (item: DiscoveryItem): string => {
  const cat = (item.category || "").toUpperCase();
  const categoryLabel = resolveVenueCategories(item);

  if (cat === "MOVIES") {
    const langLabel =
      item.language_name ||
      (item.original_language ? TMDB_LANGUAGE_NAMES[item.original_language.toLowerCase()] || item.original_language.toUpperCase() : "");

    const genreText = categoryLabel.replace(/\s*\|\s*/g, " · ");

    if (genreText && langLabel) {
      return `${genreText} · ${langLabel}`;
    }
    if (genreText) return genreText;
    if (langLabel) return langLabel;
    return "Cinema";
  }

  const hasExactCost = typeof item.suggested_cost_amount === "number" && item.suggested_cost_amount > 0;
  if (!hasExactCost) {
    return categoryLabel;
  }

  if (cat === "DINING") {
    return `${categoryLabel} · ₹${item.suggested_cost_amount} for two`;
  }
  if (cat === "SPORTS") {
    return `${categoryLabel} · ₹${item.suggested_cost_amount}/hr`;
  }
  return `${categoryLabel} · ₹${item.suggested_cost_amount}`;
};

/**
 * Resolves the exact display rating for a discovery item.
 * Single source of truth across DiscoveryCard and PlacePreviewSheet.
 */
export function resolveVenueRating(item: DiscoveryItem): string {
  if (typeof item.rating === "number" && item.rating > 0) {
    return item.rating.toFixed(1);
  }
  if ((item as any).rating) {
    const parsed = Number((item as any).rating);
    if (!isNaN(parsed) && parsed > 0) return parsed.toFixed(1);
  }
  return (4.0 + (item.display_order % 8) * 0.1).toFixed(1);
}

/**
 * Haversine formula to compute great-circle distance between two coordinates in kilometers.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistanceKm(distanceKm: number): string {
  if (isNaN(distanceKm) || distanceKm < 0) return "Nearby";
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Resolves the exact display distance for a discovery item.
 * Single source of truth across DiscoveryCard, PlacePreviewSheet, and place details.
 */
export function resolveVenueDistance(
  item: DiscoveryItem,
  originCoords?: { latitude: number; longitude: number } | null
): string {
  // If item already has a computed numeric distance in km, use it
  if (
    typeof (item as any)._distanceKm === "number" &&
    !isNaN((item as any)._distanceKm) &&
    (item as any)._distanceKm !== Infinity
  ) {
    return formatDistanceKm((item as any)._distanceKm);
  }

  // Determine origin coordinates: explicit parameter or single source of truth discovery location
  const origin = originCoords || getStoredDiscoveryLocation();
  const originLat = origin?.latitude;
  const originLng = origin?.longitude;

  // Determine venue destination coordinates
  const rawLat =
    item.latitude ??
    (item as any).geometry?.location?.lat ??
    (item as any).metadata?.latitude ??
    (item as any).lat;
  const rawLng =
    item.longitude ??
    (item as any).geometry?.location?.lng ??
    (item as any).metadata?.longitude ??
    (item as any).lng;
  const destLat = rawLat != null ? Number(rawLat) : undefined;
  const destLng = rawLng != null ? Number(rawLng) : undefined;

  if (
    typeof originLat === "number" &&
    !isNaN(originLat) &&
    typeof originLng === "number" &&
    !isNaN(originLng) &&
    typeof destLat === "number" &&
    !isNaN(destLat) &&
    typeof destLng === "number" &&
    !isNaN(destLng)
  ) {
    const dist = calculateDistanceKm(originLat, originLng, destLat, destLng);
    return formatDistanceKm(dist);
  }

  // If item already has a distance string property
  if (
    typeof (item as any).distance === "string" &&
    (item as any).distance &&
    (item as any).distance !== "Nearby"
  ) {
    return (item as any).distance;
  }

  return "Nearby";
}

/**
 * DiscoveryCard - Two-section discovery card inspired by modern discovery UI.
 * - Upper section: Pure, clean venue photograph (zero text overlays, zero gradients).
 * - Lower section: Structured information (Venue Name, Rating/Cuisine/Price, Distance). Address is omitted from the card.
 */
export const DiscoveryCard = React.memo<DiscoveryCardProps>(({
  item,
  isAdmin = false,
  onTap,
  onLongPressAdmin,
  userCoordinates,
  showLocality,
}) => {
  const isMovie = (item.category || "").toUpperCase() === "MOVIES";
  const cat = (item.category || "").toUpperCase();
  const isSports = !isMovie && (showLocality === true || cat === "SPORTS");
  const locality = isSports ? resolveVenueLocality(item) : null;
  const shouldEnableAdminHold = isAdmin && Boolean(onLongPressAdmin) && !isMovie;

  const longPress = useLongPress(
    () => {
      if (shouldEnableAdminHold && onLongPressAdmin) {
        onLongPressAdmin();
      }
    },
    { threshold: 500, onTap }
  );

  const rating = resolveVenueRating(item);
  const distance = resolveVenueDistance(item, userCoordinates);
  const movieMeta = isMovie
    ? item.release_date
      ? new Date(item.release_date).toLocaleDateString("en-IN", { year: "numeric", month: "short" })
      : ""
    : null;

  return (
    <div
      {...(shouldEnableAdminHold ? longPress : { onClick: onTap })}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={(e) => {
        if (shouldEnableAdminHold) e.preventDefault();
      }}
      style={{
        width: "220px",
        minWidth: "220px",
        maxWidth: "220px",
        height: "225px",
        minHeight: "225px",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "pan-x pan-y",
      }}
      className="shrink-0 rounded-2xl snap-start overflow-hidden bg-[#121216] border border-white/[0.08] shadow-lg flex flex-col cursor-pointer hover:border-white/20 transition-all duration-300 group select-none active:brightness-95"
    >
      {/* 1. Pure Photograph Section - Display only, non-interactive */}
      <div
        className="relative w-full h-[130px] overflow-hidden bg-zinc-900 shrink-0 pointer-events-none select-none"
        style={{ userSelect: "none", WebkitUserSelect: "none", pointerEvents: "none" }}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <DiscoveryImages
          src={item.cover_image_url}
          category={item.category}
          alt={item.title}
          draggable={false}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none select-none"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 1,
            pointerEvents: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        />
      </div>

      {/* 2. Information Section Below Image - Display only, parent card handles click */}
      <div
        className="p-3 flex flex-col justify-between flex-1 min-w-0 text-left bg-[#121216] pointer-events-none select-none"
        style={{ userSelect: "none", WebkitUserSelect: "none", pointerEvents: "none" }}
      >
        {/* Top Block: Place Name & Area / Locality */}
        <div className="min-w-0 flex flex-col">
          <h4 className="text-[14px] font-bold text-white tracking-tight leading-snug truncate select-none">
            {item.title}
          </h4>
          {locality && (
            <p className="text-[12px] text-zinc-400 font-normal truncate leading-tight mt-0.5 select-none">
              {locality}
            </p>
          )}
        </div>

        {/* Bottom Row: Distance on the left, Rating on the right */}
        <div className="flex items-center justify-between text-[11px] min-w-0 select-none pt-1">
          <span className="text-zinc-300 font-medium select-none truncate">
            {isMovie ? movieMeta : distance}
          </span>
          {rating && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#178544] text-white font-bold rounded text-[10px] shrink-0 leading-none select-none ml-2">
              {rating}
              <span className="text-[9px]">★</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * RestaurantCard - Venue card for dining places.
 */
export const RestaurantCard = React.memo<DiscoveryCardProps>((props) => {
  return <DiscoveryCard {...props} colorAccent={props.colorAccent || "text-rose-500"} />;
});

/**
 * SportsCard - Venue card for sports, turfs, and courts.
 */
export const SportsCard = React.memo<DiscoveryCardProps>((props) => {
  return <DiscoveryCard {...props} showLocality={true} colorAccent={props.colorAccent || "text-emerald-500"} />;
});

/**
 * MovieCard - Venue card for movies.
 */
export const MovieCard = React.memo<DiscoveryCardProps>((props) => {
  return <DiscoveryCard {...props} colorAccent={props.colorAccent || "text-violet-500"} />;
});

/**
 * ActivityCard - Venue card for activities, gaming, and recreation.
 */
export const ActivityCard = React.memo<DiscoveryCardProps>((props) => {
  return <DiscoveryCard {...props} colorAccent={props.colorAccent || "text-pink-500"} />;
});
