import React from "react";
import { DiscoveryItem } from "../../../core/types/discovery";
import { useLongPress } from "../../../shared/hooks/useLongPress";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { getStoredDiscoveryLocation } from "../hooks/useUserLocation";
import { TMDB_LANGUAGE_NAMES } from "../services/tmdbMovieService";

export interface DiscoveryCardProps {
  item: DiscoveryItem;
  colorAccent?: string;
  badgeBg?: string;
  isAdmin?: boolean;
  onTap: () => void;
  onLongPressAdmin?: () => void;
  userCoordinates?: { latitude: number; longitude: number } | null;
}

/**
 * Resolves exact categories for a venue based on its metadata and name.
 * Multiple categories are cleanly separated with " | " (e.g., "Bar | Restaurant", "North Indian | Dhaba").
 */
export function resolveVenueCategories(item: DiscoveryItem): string {
  const cat = (item.category || "").toUpperCase();
  const titleLower = (item.title || "").toLowerCase();
  const sub = item.subcategory || "";
  const subLower = sub.toLowerCase();
  const descLower = (item.description || "").toLowerCase();
  const combined = `${titleLower} ${subLower} ${descLower}`;

  // If subcategory already contains a customized pipe-separated list, preserve it
  if (sub.includes("|")) {
    return sub
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(" | ");
  }

  const matched: string[] = [];

  if (cat === "DINING") {
    // Specific cuisines and venue formats
    if (combined.includes("punjab") || combined.includes("dhaba") || combined.includes("balle") || combined.includes("tandoor")) {
      matched.push("North Indian");
      if (combined.includes("dhaba") || combined.includes("balle")) {
        matched.push("Dhaba");
      }
    }
    if (combined.includes("south indian") || combined.includes("dosa") || combined.includes("idli") || combined.includes("darshini") || combined.includes("bhavan") || combined.includes("sagar") || combined.includes("udupi")) {
      matched.push("South Indian");
    }
    if (combined.includes("biryani") || combined.includes("donne") || combined.includes("ambur")) {
      matched.push("Biryani");
    }
    if (combined.includes("bar") || combined.includes("pub") || combined.includes("brewery") || combined.includes("taproom")) {
      matched.push(combined.includes("brewery") ? "Brewery" : combined.includes("pub") ? "Pub" : "Bar");
    }
    if (combined.includes("lounge") || combined.includes("club") || combined.includes("nightlife")) {
      matched.push("Lounge");
    }
    if (combined.includes("rooftop")) {
      matched.push("Rooftop");
    }
    if (combined.includes("cafe") || combined.includes("coffee") || combined.includes("tea") || combined.includes("chai")) {
      matched.push("Cafe");
    }
    if (combined.includes("bakery") || combined.includes("bake") || combined.includes("cake") || combined.includes("dessert") || combined.includes("waffle") || combined.includes("ice cream")) {
      matched.push("Bakery & Desserts");
    }
    if (combined.includes("chicken") || combined.includes("burger") || combined.includes("pizza") || combined.includes("fast food") || combined.includes("roll") || combined.includes("quick bite") || combined.includes("takeaway")) {
      matched.push("Fast Food");
      matched.push("Quick Bites");
    }
    if (combined.includes("chinese") || combined.includes("momo") || combined.includes("noodle") || combined.includes("asian")) {
      matched.push("Chinese");
    }
    if (combined.includes("restaurant") || combined.includes("dine") || combined.includes("dining") || combined.includes("kitchen")) {
      if (matched.includes("Bar") || matched.includes("Pub") || matched.includes("Brewery")) {
        matched.push("Restaurant");
      } else if (!matched.includes("Fast Food") && !matched.includes("Cafe") && !matched.includes("Bakery & Desserts")) {
        matched.push("Casual Dining");
      }
    }

    if (matched.length === 0) {
      if (sub && !["restaurants", "restaurant", "dining"].includes(subLower)) {
        matched.push(sub.charAt(0).toUpperCase() + sub.slice(1));
      } else {
        matched.push("Casual Dining");
      }
    }
  } else if (cat === "SPORTS") {
    if (combined.includes("pickleball")) {
      matched.push("Pickleball");
    }
    if (combined.includes("badminton") || combined.includes("shuttle")) {
      matched.push("Badminton");
    }
    if (combined.includes("cricket") || combined.includes("box cricket")) {
      matched.push("Box Cricket");
    }
    if (combined.includes("football") || combined.includes("futsal") || combined.includes("soccer")) {
      matched.push("Football");
    }
    if (combined.includes("tennis") && !combined.includes("table tennis")) {
      matched.push("Tennis");
    }
    if (combined.includes("swimming") || combined.includes("pool")) {
      matched.push("Swimming");
    }
    if (combined.includes("fitness") || combined.includes("gym") || combined.includes("crossfit")) {
      matched.push("Fitness");
    }
    if (combined.includes("turf")) {
      matched.push("Turf");
    }
    if (combined.includes("court") && !matched.includes("Badminton") && !matched.includes("Pickleball")) {
      matched.push("Court");
    }
    if (combined.includes("arena") || combined.includes("sports complex") || combined.includes("academy")) {
      if (!matched.includes("Turf")) matched.push("Sports Arena");
    }

    if (matched.length === 0) {
      if (sub && !["turfs", "turf", "sports"].includes(subLower)) {
        matched.push(sub.charAt(0).toUpperCase() + sub.slice(1));
      } else {
        matched.push("Sports & Turf");
      }
    }
  } else if (cat === "MOVIES") {
    if (item.genres && item.genres.length > 0) {
      return item.genres.slice(0, 2).join(" · ");
    }
    if (sub && !["cinemas", "screenings", "premieres", "custom"].includes(subLower)) {
      return sub.includes("|") ? sub.split("|").slice(0, 2).map((s) => s.trim()).join(" · ") : sub;
    }
    if (combined.includes("imax")) matched.push("IMAX");
    if (combined.includes("4dx")) matched.push("4DX");
    if (combined.includes("multiplex") || combined.includes("pvr") || combined.includes("inox") || combined.includes("cinepolis")) {
      matched.push("Multiplex");
    }
    if (matched.length === 0) {
      matched.push("Cinema");
    }
  } else if (cat === "ACTIVITIES") {
    if (combined.includes("bowl")) {
      matched.push("Bowling");
    }
    if (combined.includes("escape") || combined.includes("mystery") || combined.includes("breakout")) {
      matched.push("Mystery Rooms");
    }
    if (combined.includes("kart") || combined.includes("karting")) {
      matched.push("Go-Karting");
    }
    if (combined.includes("amusement") || combined.includes("theme park") || combined.includes("water park") || combined.includes("wonderla")) {
      matched.push("Amusement Parks");
    }
    if (combined.includes("arcade") || combined.includes("gaming") || combined.includes("game zone") || combined.includes("smaash") || combined.includes("timezone") || combined.includes("vr")) {
      matched.push("Arcades");
    }
    if (combined.includes("trampoline") || combined.includes("bounce")) {
      matched.push("Trampoline Park");
    }
    if (combined.includes("laser tag") || combined.includes("laser")) {
      matched.push("Laser Tag");
    }
    if (combined.includes("paintball")) {
      matched.push("Paintball");
    }
    if (combined.includes("mini golf") || combined.includes("golf")) {
      matched.push("Mini Golf");
    }
    if (combined.includes("skat") || combined.includes("ice skat")) {
      matched.push("Skating");
    }
    if (combined.includes("adventure") || combined.includes("climbing") || combined.includes("rope") || combined.includes("play arena")) {
      matched.push("Adventure & Fun");
    }

    if (matched.length === 0) {
      if (sub && !["activities", "activity", "custom"].includes(subLower)) {
        matched.push(sub.charAt(0).toUpperCase() + sub.slice(1));
      } else {
        matched.push("Adventure & Fun");
      }
    }
  }

  const unique = Array.from(new Set(matched)).slice(0, 2);
  return unique.join(" | ");
}

/**
 * Format category, subcategory and price text for discovery card.
 * Uses exact multi-categories separated by " | " (e.g. "Bar | Restaurant").
 */
const getCategoryPriceText = (item: DiscoveryItem): string => {
  const cat = (item.category || "").toUpperCase();
  const categoryLabel = resolveVenueCategories(item);

  if (cat === "MOVIES") {
    const langLabel =
      item.language_name ||
      (item.original_language ? TMDB_LANGUAGE_NAMES[item.original_language.toLowerCase()] || item.original_language.toUpperCase() : "");

    const genreText =
      item.genres && item.genres.length > 0
        ? item.genres.slice(0, 2).join(" · ")
        : item.subcategory &&
          !["cinemas", "screenings", "premieres", "custom", "feature film"].includes(item.subcategory.toLowerCase())
        ? item.subcategory.replace(/\s*\|\s*/g, " · ")
        : "";

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
  // Determine origin coordinates: explicit parameter or single source of truth discovery location
  const origin = originCoords || getStoredDiscoveryLocation();
  const originLat = origin?.latitude;
  const originLng = origin?.longitude;

  // Determine venue destination coordinates
  const destLat = item.latitude != null ? Number(item.latitude) : (item as any).metadata?.latitude;
  const destLng = item.longitude != null ? Number(item.longitude) : (item as any).metadata?.longitude;

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
  if (typeof (item as any).distance === "string" && (item as any).distance) {
    return (item as any).distance;
  }

  return "Nearby";
}

/**
 * DiscoveryCard - Two-section discovery card inspired by modern discovery UI.
 * - Upper section: Pure, clean venue photograph (zero text overlays, zero gradients).
 * - Lower section: Structured information (Venue Name, Rating/Cuisine/Price, Distance). Address is omitted from the card.
 */
export const DiscoveryCard: React.FC<DiscoveryCardProps> = ({
  item,
  isAdmin = false,
  onTap,
  onLongPressAdmin,
  userCoordinates,
}) => {
  const longPress = useLongPress(() => {
    if (isAdmin && onLongPressAdmin) onLongPressAdmin();
  }, { threshold: 500 });

  const rating = resolveVenueRating(item);
  const distance = resolveVenueDistance(item, userCoordinates);
  const categoryPrice = getCategoryPriceText(item);
  const isMovie = (item.category || "").toUpperCase() === "MOVIES";
  const movieMeta = isMovie
    ? item.release_date
      ? new Date(item.release_date).toLocaleDateString("en-IN", { year: "numeric", month: "short" })
      : item.location || ""
    : null;

  return (
    <div
      {...(isAdmin && onLongPressAdmin ? longPress : {})}
      onClick={onTap}
      style={{
        width: "220px",
        minWidth: "220px",
        maxWidth: "220px",
        height: "225px",
        minHeight: "225px",
      }}
      className="shrink-0 rounded-2xl snap-start overflow-hidden bg-[#121216] border border-white/[0.08] shadow-lg flex flex-col cursor-pointer hover:border-white/20 transition-all duration-300 group select-none active:scale-[0.98]"
    >
      {/* 1. Pure Photograph Section - Clean image, zero text or overlays */}
      <div className="relative w-full h-[130px] overflow-hidden bg-zinc-900 shrink-0">
        <DiscoveryImages
          src={item.cover_image_url}
          category={item.category}
          alt={item.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 1 }}
        />
      </div>

      {/* 2. Information Section Below Image */}
      <div className="p-3 flex flex-col justify-between flex-1 min-w-0 text-left bg-[#121216]">
        {/* Venue / Movie Name */}
        <h4 className="text-[14px] font-bold text-white tracking-tight leading-snug truncate">
          {item.title}
        </h4>

        {/* Rating, Category & Price */}
        <div className="flex items-center gap-1.5 text-[11px] min-w-0">
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#178544] text-white font-bold rounded text-[10px] shrink-0 leading-none">
            {rating}
            <span className="text-[9px]">★</span>
          </span>
          <span className="text-zinc-400 truncate font-normal">
            {categoryPrice}
          </span>
        </div>

        {/* Distance for venues or Release Date for movies */}
        <div className="text-[11px] text-zinc-400 font-normal">
          <span className="text-zinc-300 font-medium">
            {isMovie ? movieMeta : distance}
          </span>
        </div>
      </div>
    </div>
  );
};

/**
 * RestaurantCard - Venue card for dining places.
 */
export const RestaurantCard: React.FC<DiscoveryCardProps> = (props) => {
  return <DiscoveryCard {...props} colorAccent={props.colorAccent || "text-rose-500"} />;
};

/**
 * SportsCard - Venue card for sports, turfs, and courts.
 */
export const SportsCard: React.FC<DiscoveryCardProps> = (props) => {
  return <DiscoveryCard {...props} colorAccent={props.colorAccent || "text-emerald-500"} />;
};

/**
 * MovieCard - Venue card for movies.
 */
export const MovieCard: React.FC<DiscoveryCardProps> = (props) => {
  return <DiscoveryCard {...props} colorAccent={props.colorAccent || "text-violet-500"} />;
};

/**
 * ActivityCard - Venue card for activities, gaming, and recreation.
 */
export const ActivityCard: React.FC<DiscoveryCardProps> = (props) => {
  return <DiscoveryCard {...props} colorAccent={props.colorAccent || "text-pink-500"} />;
};
