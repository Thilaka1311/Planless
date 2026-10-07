import { RawCandidatePlace, GeoPoint } from "../types/provider";
import { SearchResultItem } from "../types/result";
import { DiscoveryCategory } from "../../../../core/types/discovery";
import { SUPABASE_URL } from "../../../../../lib/supabaseClient";
import { getSportsVenueLabel } from "../../services/sportsRelevance";
import {
  classifyVenueCategory,
  isAuthenticDiningVenue,
  isPlayableSportsVenue,
  isAuthenticActivityVenue,
  extractOwnerPhotos,
  getCuratedPhotoForVenue,
} from "../../services/venueRelevance";


function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
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

const GENERIC_TYPES = new Set([
  "point_of_interest",
  "establishment",
  "premise",
  "feature",
  "neighborhood",
  "political",
  "locality",
  "sublocality",
  "sublocality_level_1",
  "sublocality_level_2",
]);

function deriveDisplayLabel(candidate: RawCandidatePlace, category: DiscoveryCategory): string {
  if (category === "SPORTS") {
    try {
      return getSportsVenueLabel(candidate);
    } catch {
      return "Sports Facility";
    }
  }

  if (category === "MOVIES") {
    return candidate.subcategory || "Movie";
  }

  const types = candidate.types || [];
  const specificTypes = types.filter((t) => !GENERIC_TYPES.has(t));

  if (specificTypes.length > 0) {
    const primary = specificTypes[0];
    return primary
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  if (category === "DINING") return "Dining Venue";
  if (category === "ACTIVITIES") return "Activity Venue";
  return "Venue";
}

export function normalizeCandidate(
  candidate: RawCandidatePlace,
  options: {
    discoveryCoords?: GeoPoint | null;
    searchCoords?: GeoPoint | null;
    category?: DiscoveryCategory;
    provider?: "google" | "tmdb" | "planless";
    photoBaseUrl?: string;
  } = {}
): SearchResultItem {
  const provider = options.provider || (candidate.types?.includes("movie") ? "tmdb" : "google");

  const candidateLike = {
    title: candidate.title || candidate.name,
    name: candidate.name || candidate.title,
    types: candidate.types,
    subcategory: candidate.subcategory,
    description: candidate.description || candidate.formatted_address || candidate.vicinity,
  };

  const intrinsicCategory =
    (candidate.category && (candidate.category as string) !== "ALL" ? (candidate.category as DiscoveryCategory) : null) ||
    classifyVenueCategory(candidateLike);

  // If an options.category is requested (e.g. from a category search screen),
  // verify whether the candidate actually qualifies for that requested category.
  // If the candidate contradicts the requested category (e.g. sports venue in dining),
  // retain its intrinsic category so it is not misrepresented.
  let category: DiscoveryCategory;
  if (options.category) {
    const isCompatible =
      options.category === intrinsicCategory ||
      (options.category === "DINING" && isAuthenticDiningVenue(candidateLike)) ||
      (options.category === "SPORTS" && isPlayableSportsVenue(candidateLike)) ||
      (options.category === "ACTIVITIES" && isAuthenticActivityVenue(candidateLike)) ||
      (options.category === "MOVIES" && (candidate.types?.includes("movie") || (candidate as any).genres));

    category = isCompatible ? options.category : (intrinsicCategory || options.category);
  } else {
    category = intrinsicCategory || (candidate.category as DiscoveryCategory) || "ACTIVITIES";
  }

  // Calculate distance relative to explicit search location if provided, else discovery location
  const centerCoords = options.searchCoords || options.discoveryCoords;
  let distanceKm = 999;
  let formattedDistance = "";

  if (
    centerCoords &&
    typeof candidate.latitude === "number" &&
    typeof candidate.longitude === "number"
  ) {
    distanceKm = calculateHaversineKm(
      centerCoords.latitude,
      centerCoords.longitude,
      candidate.latitude,
      candidate.longitude
    );
    formattedDistance = formatDistanceKm(distanceKm);
  }

  // Build photo cover URL: prioritize owner-posted photo for non-movies
  let coverImageUrl = candidate.cover_image_url || null;
  const ownerPhotos = extractOwnerPhotos(candidate.name || candidate.title || "", candidate.photos);
  if (!coverImageUrl && candidate.photos && candidate.photos.length > 0) {
    const photoRef = ownerPhotos.length > 0
      ? ownerPhotos[0].photoReference
      : (category === "MOVIES" ? candidate.photos[0]?.photo_reference : null);
    if (photoRef) {
      const baseUrl = options.photoBaseUrl || `${SUPABASE_URL}/functions/v1/maps`;
      coverImageUrl = `${baseUrl}?action=photo&photo_reference=${encodeURIComponent(photoRef)}&maxwidth=800`;
    }
  }

  // If still no cover image and category is non-movie, assign curated aesthetic subcategory photo
  if (!coverImageUrl && category !== "MOVIES") {
    coverImageUrl = getCuratedPhotoForVenue(
      category,
      candidate.subcategory || (Array.isArray(candidate.types) ? candidate.types.join(" ") : ""),
      candidate.name || candidate.title || ""
    );
  }

  const name = candidate.name || candidate.title || "Unnamed Place";
  const address = candidate.formatted_address || candidate.vicinity || "Nearby";
  const displayCategory = intrinsicCategory || category;
  const displayLabel = deriveDisplayLabel(candidate, displayCategory);

  const subcategory =
    candidate.subcategory &&
    !["Dining Venue", "Activity Venue", "Sports Facility", "Venue"].includes(candidate.subcategory)
      ? candidate.subcategory
      : displayLabel;

  const raw = candidate._raw || {};

  const item: SearchResultItem = {
    id: candidate.place_id.startsWith("place_") ? candidate.place_id : `place_${candidate.place_id}`,
    public_id: candidate.place_id.startsWith("place_") ? candidate.place_id : `place_${candidate.place_id}`,
    section_id: `places_${category.toLowerCase()}`,
    provider,
    providerPlaceId: candidate.place_id.replace(/^place_/, ""),
    place_id: candidate.place_id.replace(/^place_/, ""),

    title: name,
    category,
    subcategory,
    displayLabel,
    description: candidate.description || address,
    types: candidate.types || (candidate.subcategory ? [candidate.subcategory.toLowerCase()] : (raw.types || [])),

    location: address,
    place_address: address,
    latitude: candidate.latitude ?? null,
    longitude: candidate.longitude ?? null,

    cover_image_url: coverImageUrl,
    photo_references:
      candidate.photo_references ||
      (ownerPhotos.length > 0 ? ownerPhotos.map((p) => p.photoReference) : null) ||
      raw.photo_references ||
      null,

    rating: typeof candidate.rating === "number" ? candidate.rating : null,
    user_ratings_total: typeof candidate.user_ratings_total === "number" ? candidate.user_ratings_total : null,
    distance: formattedDistance,

    suggested_duration_minutes: raw.suggested_duration_minutes ?? (category === "MOVIES" ? 150 : category === "ACTIVITIES" ? 120 : 90),
    suggested_cost_amount: raw.suggested_cost_amount ?? null,
    suggested_capacity: raw.suggested_capacity ?? null,
    default_rsvp_offset_minutes: raw.default_rsvp_offset_minutes ?? 60,
    display_order: raw.display_order ?? 1,
    featured: raw.featured ?? false,
    status: "ACTIVE",
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: raw.updated_at || new Date().toISOString(),

    _distanceKm: distanceKm,
    _relevanceScore: 0,
    _isExactMatch: false,

    movie_id: raw.movie_id,
    original_title: raw.original_title,
    backdrop_url: raw.backdrop_url,
    release_date: raw.release_date || (raw as any)._raw?.release_date || null,
    vote_average: raw.vote_average,
    vote_count: raw.vote_count,
    original_language: raw.original_language,
    language_name: raw.language_name,
    genres: raw.genres,
  };

  return item;
}
