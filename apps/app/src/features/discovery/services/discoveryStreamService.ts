import { DiscoveryItem } from "../../../core/types/discovery";
import { supabase, SUPABASE_URL } from "../../../../lib/supabaseClient";
import {
  isPlayableSportsVenue,
  isAuthenticDiningVenue,
  isAuthenticActivityVenue,
  extractCleanPlaceId,
  hasOwnerPostedPhoto,
  getVenueDeduplicationKeys,
  areVenuesIdentical,
  mergeDuplicateVenues,
} from "./venueRelevance";
import { isPlaceInCity } from "./cityBoundary";
import { calculateDistanceKm, formatDistanceKm } from "../components/DiscoveryCard";
import {
  fetchPlaceOverrides,
  getDatabasePlacesForCategoryAndDistanceBand,
  getPlaceOverridesCache,
  parseSportsFromSubcategory,
} from "./placeOverridesService";

export type DiscoveryStreamCategory = "SPORTS" | "DINING" | "ACTIVITIES";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export const SPORTS_PROGRESSION_QUERIES = [
  "sports turf",
  "badminton court",
  "football turf",
  "pickleball court",
  "tennis court",
  "cricket ground box nets",
  "basketball court",
  "table tennis",
  "sports arena complex",
];

export const DINING_PROGRESSION_QUERIES = [
  "restaurants",
  "cafe coffee shop roastery",
  "brewery pub taproom bar",
  "bakery patisserie dessert parlour",
  "fine dining lounge",
  "burger pizza fast food roll",
];

export const ACTIVITIES_PROGRESSION_QUERIES = [
  "bowling alley",
  "escape room mystery rooms",
  "go-karting kart track",
  "amusement park theme park",
  "arcade gaming zone",
  "trampoline park adventure park",
  "mini golf",
];

export function getCategoryProgressionQueries(category: DiscoveryStreamCategory): string[] {
  switch (category) {
    case "SPORTS":
      return SPORTS_PROGRESSION_QUERIES;
    case "DINING":
      return DINING_PROGRESSION_QUERIES;
    case "ACTIVITIES":
      return ACTIVITIES_PROGRESSION_QUERIES;
  }
}

export function isVenueRelevantForCategory(item: any, category: DiscoveryStreamCategory): boolean {
  switch (category) {
    case "SPORTS":
      return isPlayableSportsVenue(item);
    case "DINING":
      return isAuthenticDiningVenue(item);
    case "ACTIVITIES":
      return isAuthenticActivityVenue(item);
  }
}

export interface StreamBatchParams {
  category: DiscoveryStreamCategory;
  originCoords: GeoPoint;
  city?: string;
  queryIndex: number;
  pageToken?: string | null;
  radiusMeters?: number;
  seenPlaceIds: Set<string>;
  minDistanceKm?: number;
  maxDistanceKm?: number;
}

export interface StreamBatchResult {
  items: DiscoveryItem[];
  nextQueryIndex: number;
  nextPageToken: string | null;
  hasMore: boolean;
  radiusMeters: number;
}

/**
 * Fetches a single progressive batch of authentic venues from Google Places
 * combined with matching database overrides, ordered strictly by proximity.
 */
export async function fetchProgressiveDiscoveryBatch(
  params: StreamBatchParams
): Promise<StreamBatchResult> {
  const {
    category,
    originCoords,
    city = "Bengaluru",
    queryIndex,
    pageToken,
    radiusMeters = 10000,
    seenPlaceIds,
    minDistanceKm = 0,
    maxDistanceKm = 50,
  } = params;

  const photoBaseUrl = `${SUPABASE_URL}/functions/v1/maps`;
  const progressionQueries = getCategoryProgressionQueries(category);
  const currentQuery = progressionQueries[queryIndex] || progressionQueries[0];

  // 1. Ensure fresh database overrides are loaded in memory
  await fetchPlaceOverrides();

  // 2. Fetch Google Places for the current single query + pageToken
  let rawCandidates: any[] = [];
  let returnedNextPageToken: string | null = null;

  const DINING_QUERY_INCLUDED_TYPES: Record<string, string> = {
    restaurants: "restaurant",
    "cafe coffee shop roastery": "cafe",
    "brewery pub taproom bar": "bar",
    "bakery patisserie dessert parlour": "bakery",
    "fine dining lounge": "fine_dining_restaurant",
    "burger pizza fast food roll": "fast_food_restaurant",
  };
  const includedType = category === "DINING" ? DINING_QUERY_INCLUDED_TYPES[currentQuery] : undefined;

  try {
    const { data, error } = await supabase.functions.invoke("maps", {
      body: {
        action: "places-discovery",
        query: currentQuery,
        pageToken: pageToken || undefined,
        category,
        includedType,
        latitude: originCoords.latitude,
        longitude: originCoords.longitude,
        city,
        radius: radiusMeters,
        photoBaseUrl,
      },
    });

    if (!error && data) {
      if (Array.isArray(data.items)) {
        rawCandidates = data.items;
      } else if (Array.isArray(data.rawPlaces)) {
        rawCandidates = data.rawPlaces;
      } else if (Array.isArray(data.sections?.[0]?.items)) {
        rawCandidates = data.sections[0].items;
      }
      returnedNextPageToken = data.nextPageToken || null;
    }
  } catch (err) {
    console.warn(`[discoveryStreamService] Batch fetch failed (${category}):`, currentQuery, err);
  }

  // 3. Relevance filtering & deduplication with immediate Database Override Merging
  const cache = getPlaceOverridesCache();
  const eligibleGooglePlaces: DiscoveryItem[] = [];

  for (const raw of rawCandidates) {
    if (!raw) continue;
    const cleanId = extractCleanPlaceId(raw.place_id || raw.id);
    if (!cleanId || seenPlaceIds.has(cleanId)) continue;

    // Check database override
    const override = cache.get(cleanId) || (raw.place_id ? cache.get(raw.place_id) : undefined);

    // If marked deleted in database, completely drop it
    if (override && override.is_deleted) {
      continue;
    }

    // Merge override into raw object before checking relevance
    const merged: any = {
      ...raw,
      place_id: cleanId,
    };

    if (override) {
      if (override.name_override) {
        merged.name = override.name_override;
        merged.title = override.name_override;
      }
      if (override.address_override) {
        merged.place_address = override.address_override;
        merged.location = override.address_override;
        merged.formatted_address = override.address_override;
      }
      if (override.description_override !== undefined && override.description_override !== null) {
        merged.description = override.description_override;
      }
      if (override.category_override) {
        merged.category = override.category_override;
      }
      if (override.subcategory) {
        merged.subcategory = override.subcategory;
        if (category === "SPORTS") {
          const parsedSports = parseSportsFromSubcategory(override.subcategory);
          if (parsedSports.length > 0) {
            merged.supported_sports = parsedSports;
            merged.supportedSports = parsedSports;
          }
        }
      }
      if (typeof override.latitude_override === "number") {
        merged.latitude = override.latitude_override;
      }
      if (typeof override.longitude_override === "number") {
        merged.longitude = override.longitude_override;
      }
      if (override.google_photo_reference) {
        merged.cover_image_url = `${photoBaseUrl}?action=photo&photo_reference=${encodeURIComponent(
          override.google_photo_reference
        )}&maxwidth=800`;
        merged.google_photo_reference = override.google_photo_reference;
      } else if (override.image_path) {
        merged.cover_image_url = override.image_path;
        merged.image_path = override.image_path;
      }
      merged._hasPlanlessOverride = true;
    }

    // Strict category relevance evaluated on merged venue
    if (!isVenueRelevantForCategory(merged, category)) continue;

    // City boundary filter
    if (city && !isPlaceInCity(merged, city)) continue;

    // Must have owner photo or valid cover image
    if (!hasOwnerPostedPhoto(merged) && !merged.cover_image_url) continue;

    const rawLat =
      merged.latitude ??
      merged.geometry?.location?.lat ??
      merged.metadata?.latitude ??
      merged.lat;
    const rawLng =
      merged.longitude ??
      merged.geometry?.location?.lng ??
      merged.metadata?.longitude ??
      merged.lng;
    const lat = rawLat != null ? Number(rawLat) : undefined;
    const lng = rawLng != null ? Number(rawLng) : undefined;

    let distKm: number | undefined =
      typeof merged._distanceKm === "number" && !isNaN(merged._distanceKm)
        ? merged._distanceKm
        : undefined;
    if (
      distKm === undefined &&
      typeof lat === "number" &&
      !isNaN(lat) &&
      typeof lng === "number" &&
      !isNaN(lng)
    ) {
      distKm = calculateDistanceKm(originCoords.latitude, originCoords.longitude, lat, lng);
    }

    seenPlaceIds.add(cleanId);
    getVenueDeduplicationKeys(merged).forEach((k) => seenPlaceIds.add(k));

    eligibleGooglePlaces.push({
      ...merged,
      place_id: cleanId,
      latitude: lat,
      longitude: lng,
      _distanceKm: distKm,
      distance: distKm !== undefined ? formatDistanceKm(distKm) : merged.distance,
    });
  }

  // 4. Inject any database-only venues matching this distance tier
  const dbVenuesInTier = getDatabasePlacesForCategoryAndDistanceBand(
    category,
    originCoords,
    0,
    maxDistanceKm,
    seenPlaceIds
  );

  // 5. Merge Google Places and database results into one unique result set first
  const combined = [...eligibleGooglePlaces, ...dbVenuesInTier];
  const uniqueCombined: DiscoveryItem[] = [];
  for (const item of combined) {
    const existingIdx = uniqueCombined.findIndex((ex) => areVenuesIdentical(ex, item));
    if (existingIdx === -1) {
      uniqueCombined.push(item);
    } else {
      uniqueCombined[existingIdx] = mergeDuplicateVenues(uniqueCombined[existingIdx], item);
    }
  }

  uniqueCombined.sort((a, b) => {
    const da = typeof (a as any)._distanceKm === "number" ? (a as any)._distanceKm : Infinity;
    const db = typeof (b as any)._distanceKm === "number" ? (b as any)._distanceKm : Infinity;
    return da - db;
  });

  // 6. Calculate next pagination state
  let nextQueryIdx = queryIndex;
  let nextToken: string | null = returnedNextPageToken;
  let nextRadius = radiusMeters;
  let hasMoreResults = true;

  // If Google Places returned a next-page token, preserve it and continue fetching next page for this query.
  // Only advance to the next progression query when the current query's pages are exhausted.
  if (returnedNextPageToken) {
    nextQueryIdx = queryIndex;
    nextToken = returnedNextPageToken;
    hasMoreResults = true;
  } else {
    nextQueryIdx = queryIndex + 1;
    nextToken = null;

    if (nextQueryIdx >= progressionQueries.length) {
      // If all queries have completed, expand radius once (up to 25km) or mark exhausted
      if (radiusMeters < 25000) {
        nextQueryIdx = 0; // Loop queries once at expanded radius
        nextRadius = 25000;
        hasMoreResults = true;
      } else {
        hasMoreResults = false;
      }
    }
  }

  return {
    items: uniqueCombined,
    nextQueryIndex: nextQueryIdx,
    nextPageToken: nextToken,
    hasMore: hasMoreResults,
    radiusMeters: nextRadius,
  };
}
