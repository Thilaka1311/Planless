import { DiscoverySection, DiscoveryItem } from "../../../core/types/discovery";
import { supabase, SUPABASE_URL } from "../../../../lib/supabaseClient";
import * as queries from "./discoveryQueries";
import * as mapper from "./discoveryMapper";
import { calculateDistanceKm, formatDistanceKm } from "../components/DiscoveryCard";
import { isRelevantVenueForCategory } from "./venueRelevance";
import {
  SPORTS_CONFIGS,
  SportCategoryId,
  scoreSportsVenueRelevance,
  sortSportsVenues,
} from "./sportsRelevance";
import { searchCoordinator, planlessSearchCache } from "../search";
import { applyPlaceOverrides, subscribePlaceOverrides } from "./placeOverridesService";

import { isPlaceInCity, CityBoundingBox, cleanCityString } from "./cityBoundary";
import { onDiscoveryLocationChange, getStoredDiscoveryLocation } from "../hooks/useUserLocation";
import { preloadImage } from "../../../shared/imaging/preloadImage";

const sectionsCache = new Map<string, DiscoverySection[]>();
let inFlightRequest: Promise<DiscoverySection[]> | null = null;

export interface DiscoveryLocationParams {
  latitude?: number;
  longitude?: number;
  city?: string;
  cityBounds?: CityBoundingBox;
}

export function getCacheKey(coords?: DiscoveryLocationParams, city?: string): string {
  const rawCity = coords?.city || city;
  const cityPart = rawCity ? `_${rawCity.trim().toLowerCase()}` : "";
  if (
    typeof coords?.latitude === "number" &&
    !isNaN(coords.latitude) &&
    typeof coords?.longitude === "number" &&
    !isNaN(coords.longitude)
  ) {
    return `${coords.latitude.toFixed(4)}_${coords.longitude.toFixed(4)}${cityPart}`;
  }
  return `default${cityPart}`;
}

export function getCachedSections(coords?: DiscoveryLocationParams, city?: string): DiscoverySection[] | null {
  let raw: DiscoverySection[] | null = null;
  const effectiveCity = coords?.city || city;
  if (coords) {
    raw = sectionsCache.get(getCacheKey(coords, effectiveCity)) || sectionsCache.get(getCacheKey(coords)) || null;
  }
  if (!raw && effectiveCity && sectionsCache.has(`default_${effectiveCity.toLowerCase()}`)) {
    raw = sectionsCache.get(`default_${effectiveCity.toLowerCase()}`) || null;
  }
  if (!raw && sectionsCache.has("default")) {
    raw = sectionsCache.get("default") || null;
  }
  if (!raw && sectionsCache.has("default_bengaluru")) {
    raw = sectionsCache.get("default_bengaluru") || null;
  }
  if (!raw && sectionsCache.size > 0) {
    raw = Array.from(sectionsCache.values())[0] || null;
  }

  if (!raw || raw.length === 0) return null;
  return raw;
}

export function clearCachedSections(): void {
  sectionsCache.clear();
  inFlightRequest = null;
}

// Invalidate section cache whenever an override or exclusion changes
subscribePlaceOverrides(() => {
  clearCachedSections();
});

// Invalidate section cache whenever the user changes discovery location/city
onDiscoveryLocationChange(() => {
  clearCachedSections();
});

/**
 * Public API endpoint for retrieval of active sections and their nested items.
 * Powered by Google Places API via the maps Edge Function with fallback to DB sections.
 */
export async function getSectionsByCategory(
  category: string,
  forceRefresh = false,
  coords?: DiscoveryLocationParams
): Promise<DiscoverySection[]> {
  try {
    const activeStored = getStoredDiscoveryLocation();
    const effectiveCity = coords?.city || activeStored?.city;
    const isSameCity =
      !coords?.city ||
      (activeStored?.city && cleanCityString(activeStored.city) === cleanCityString(coords.city));
    const effectiveBounds =
      coords?.cityBounds !== undefined
        ? coords.cityBounds
        : isSameCity
        ? activeStored?.cityBounds
        : undefined;
    const cacheKey = getCacheKey(coords, effectiveCity);
    const hasCached = sectionsCache.has(cacheKey);

    if (!hasCached || forceRefresh) {
      if (inFlightRequest && !forceRefresh) {
        await inFlightRequest;
      } else {
        inFlightRequest = (async () => {
          try {
            const photoBaseUrl = `${SUPABASE_URL}/functions/v1/maps`;
            const { data, error } = await supabase.functions.invoke("maps", {
              body: {
                action: "places-discovery",
                category: "ALL",
                latitude: coords?.latitude,
                longitude: coords?.longitude,
                city: effectiveCity,
                cityBounds: effectiveBounds,
                photoBaseUrl,
              },
            });

            if (error) {
              let errorDetail = error.message;
              try {
                if ((error as any).context && typeof (error as any).context.text === "function") {
                  const status = (error as any).context.status;
                  const body = await (error as any).context.clone().text();
                  errorDetail = `HTTP ${status}: ${body || error.message}`;
                }
              } catch {}
              throw new Error(errorDetail);
            }

            let loadedSections: DiscoverySection[] = [];
            if (data?.sections && Array.isArray(data.sections) && data.sections.length > 0) {
              loadedSections = data.sections as DiscoverySection[];
            } else {
              // Fallback to database queries
              const rawSections = await queries.fetchActiveSectionsWithItems();
              loadedSections = (rawSections || []).map(mapper.mapDbSectionToFrontend);
            }

            // Apply Planless strict relevance filter AND city boundary filter to every loaded section
            loadedSections = loadedSections.map((sec) => ({
              ...sec,
              items: (sec.items || []).filter((item) =>
                isRelevantVenueForCategory(item, sec.category || "ALL") &&
                (!effectiveCity || isPlaceInCity(item, effectiveCity, effectiveBounds))
              ),
            }));

            // Apply place overrides and exclusion filtering (is_deleted === true)
            for (const sec of loadedSections) {
              if (sec.items && sec.items.length > 0) {
                sec.items = await applyPlaceOverrides(sec.items);
              }
            }

            // Calculate exact distance for each item if coords provided
            if (
              typeof coords?.latitude === "number" &&
              !isNaN(coords.latitude) &&
              typeof coords?.longitude === "number" &&
              !isNaN(coords.longitude)
            ) {
              for (const sec of loadedSections) {
                for (const item of sec.items || []) {
                  const pLat = item.latitude != null ? Number(item.latitude) : (item as any).metadata?.latitude;
                  const pLng = item.longitude != null ? Number(item.longitude) : (item as any).metadata?.longitude;
                  if (typeof pLat === "number" && !isNaN(pLat) && typeof pLng === "number" && !isNaN(pLng)) {
                    const distKm = calculateDistanceKm(coords.latitude, coords.longitude, pLat, pLng);
                    (item as any).distance = formatDistanceKm(distKm);
                    (item as any)._distanceKm = distKm;
                  }
                }
              }
            }

            sectionsCache.set(cacheKey, loadedSections);

            // Pre-warm discovery card cover images in memory cache for instant render
            if (typeof window !== "undefined") {
              for (const sec of loadedSections) {
                for (const item of (sec.items || []).slice(0, 4)) {
                  if (item.cover_image_url) {
                    preloadImage(item.cover_image_url);
                  }
                }
              }
            }
            return loadedSections;
          } catch (err: any) {
            console.warn("[DiscoveryService] Places API failed, using database items:", err?.message || err);
            try {
              const rawSections = await queries.fetchActiveSectionsWithItems();
              let fallbackSections = (rawSections || []).map(mapper.mapDbSectionToFrontend);
              
              // Apply Planless strict relevance filter to fallback items
              fallbackSections = fallbackSections.map((sec) => ({
                ...sec,
                items: (sec.items || []).filter((item) =>
                  isRelevantVenueForCategory(item, sec.category || "ALL")
                ),
              }));

              // Apply place overrides and exclusion filtering to fallback items
              for (const sec of fallbackSections) {
                if (sec.items && sec.items.length > 0) {
                  sec.items = await applyPlaceOverrides(sec.items);
                }
              }

              if (
                typeof coords?.latitude === "number" &&
                !isNaN(coords.latitude) &&
                typeof coords?.longitude === "number" &&
                !isNaN(coords.longitude)
              ) {
                for (const sec of fallbackSections) {
                  for (const item of sec.items || []) {
                    const pLat = item.latitude != null ? Number(item.latitude) : (item as any).metadata?.latitude;
                    const pLng = item.longitude != null ? Number(item.longitude) : (item as any).metadata?.longitude;
                    if (typeof pLat === "number" && !isNaN(pLat) && typeof pLng === "number" && !isNaN(pLng)) {
                      const distKm = calculateDistanceKm(coords.latitude, coords.longitude, pLat, pLng);
                      (item as any).distance = formatDistanceKm(distKm);
                      (item as any)._distanceKm = distKm;
                    }
                  }
                }
              }
              sectionsCache.set(cacheKey, fallbackSections);
              return fallbackSections;
            } catch (dbErr) {
              console.error("[DiscoveryService] Database fallback also failed:", dbErr);
              return sectionsCache.get(cacheKey) || [];
            }
          } finally {
            inFlightRequest = null;
          }
        })();

        await inFlightRequest;
      }
    }

    const mappedSections = sectionsCache.get(cacheKey) || [];

    // If "all", we return sections belonging to primary categories
    if (category.toLowerCase() === "all") {
      return mappedSections.filter((sec) =>
        ["SPORTS", "MOVIES", "DINING", "DRINKS", "CUSTOM", "ACTIVITIES"].includes(sec.category.toUpperCase())
      );
    }

    // Otherwise, filter by specific category
    return mappedSections.filter(
      (sec) => sec.category.toUpperCase() === category.toUpperCase()
    );
  } catch (err: any) {
    console.error(`[DiscoveryService] Error loading sections for category ${category}:`, err?.message || err);
    return [];
  }
}

/**
 * Fetch all items for admin panel filtering by category.
 */
export async function adminFetchItems(category: string): Promise<DiscoveryItem[]> {
  try {
    const rawItems = await queries.fetchAllItems();
    const mappedItems = rawItems.map(mapper.mapDbItemToFrontend);
    return mappedItems.filter(item => item.category.toUpperCase() === category.toUpperCase());
  } catch (err: any) {
    console.error(`[DiscoveryService] Admin failed to fetch items:`, err.message || err);
    return [];
  }
}

/**
 * Admin: Create a new discovery item.
 */
export async function adminCreateItem(payload: Record<string, any>, config: any): Promise<void> {
  const record = mapper.buildDbItemPayload(payload, config);
  await queries.insertItem(record);
}

/**
 * Admin: Update an existing discovery item.
 */
export async function adminUpdateItem(id: string, payload: Record<string, any>, config: any): Promise<void> {
  const record = mapper.buildDbItemPayload(payload, config);
  await queries.updateItem(id, record);
}

/**
 * Admin: Soft-delete a discovery item.
 */
export async function adminDeleteItem(id: string): Promise<void> {
  await queries.deleteItem(id);
}

// ── Unified Places Search Implementation ──────────────────────────────────────

export interface PlacesSearchParams {
  category: "DINING" | "MOVIES" | "SPORTS" | "ACTIVITIES" | "ALL";
  query: string;
  queries?: string[];
  subCategoryFilter?: string;
  currentCoordinates?: { latitude: number; longitude: number };
  defaultCity?: string;
  pageToken?: string;
  radius?: number;
}

export interface PlacesSearchResult {
  items: DiscoveryItem[];
  searchCoordinates: { latitude: number; longitude: number };
  resolvedLocationName: string;
  nextPageToken?: string | null;
}

const placesSearchCache = new Map<string, PlacesSearchResult>();
const placesInFlightSearches = new Map<string, Promise<PlacesSearchResult>>();

export function getPlacesSearchCacheKey(params: PlacesSearchParams): string {
  const q = params.query.trim().toLowerCase();
  const sub = (params.subCategoryFilter || "all").toLowerCase();
  const cat = params.category.toUpperCase();
  const lat = params.currentCoordinates?.latitude?.toFixed(4) || "default";
  const lng = params.currentCoordinates?.longitude?.toFixed(4) || "default";
  const rad = params.radius || 15000;
  const page = params.pageToken || "p1";
  return `${cat}:${q}:${sub}:${lat}_${lng}:${rad}:${page}`;
}

export function clearPlacesSearchCache(): void {
  placesSearchCache.clear();
  placesInFlightSearches.clear();
  planlessSearchCache.clear();
}

/**
 * Resolves geographical coordinates for a user search query using Google Maps Geocoding API.
 * Detects whether the query is a locality/area (e.g. "Koramangala", "Indiranagar") vs a generic keyword.
 */
function isGeographicalArea(result: any): boolean {
  if (!result || !result.geometry?.location) return false;
  if (result.geometry.location_type === "ROOFTOP") return false;

  const types: string[] = result.types || [];
  const venueTypes = [
    "establishment",
    "point_of_interest",
    "store",
    "food",
    "restaurant",
    "cafe",
    "bar",
    "bakery",
    "premise",
  ];
  if (types.some((t) => venueTypes.includes(t))) {
    return false;
  }

  if (types.length > 0) {
    const areaTypes = [
      "locality",
      "sublocality",
      "sublocality_level_1",
      "sublocality_level_2",
      "sublocality_level_3",
      "neighborhood",
      "administrative_area_level_1",
      "administrative_area_level_2",
      "administrative_area_level_3",
      "postal_code",
      "colloquial_area",
      "political",
    ];
    return types.some((t) => areaTypes.includes(t));
  }

  return true;
}

function extractAreaName(result: any, fallback: string): string {
  const comp = result.address_components?.find((c: any) =>
    c.types?.some((t: string) =>
      ["sublocality_level_1", "sublocality", "neighborhood", "locality"].includes(t)
    )
  );
  return comp?.long_name || result.formatted_address?.split(",")?.[0]?.trim() || fallback;
}

async function resolveSearchCoordinates(
  query: string,
  currentCoordinates?: { latitude: number; longitude: number },
  defaultCity = "Bengaluru"
): Promise<{
  coordinates: { latitude: number; longitude: number };
  locationName: string;
  isGeocodedLocation: boolean;
}> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      coordinates: currentCoordinates || { latitude: 12.9716, longitude: 77.5946 },
      locationName: defaultCity,
      isGeocodedLocation: false,
    };
  }

  // 1. Try geocoding the raw query first (e.g. "Koramangala", "Indiranagar", "Whitefield")
  try {
    const { data } = await supabase.functions.invoke("maps", {
      body: { action: "geocode", address: trimmed },
    });
    if (data?.status === "OK" && data.results && data.results.length > 0) {
      const first = data.results[0];
      if (isGeographicalArea(first)) {
        const lat = first.geometry?.location?.lat;
        const lng = first.geometry?.location?.lng;
        if (typeof lat === "number" && typeof lng === "number") {
          const shortName = extractAreaName(first, trimmed);
          return {
            coordinates: { latitude: lat, longitude: lng },
            locationName: shortName,
            isGeocodedLocation: true,
          };
        }
      }
    }
  } catch (err) {
    console.warn("[DiscoveryService] Direct geocode failed for query:", trimmed, err);
  }

  // 2. Try geocoding with defaultCity + India context (e.g. "HSR Layout, Bengaluru, India")
  try {
    const { data } = await supabase.functions.invoke("maps", {
      body: { action: "geocode", address: `${trimmed}, ${defaultCity}, India` },
    });
    if (data?.status === "OK" && data.results && data.results.length > 0) {
      const first = data.results[0];
      if (isGeographicalArea(first)) {
        const lat = first.geometry?.location?.lat;
        const lng = first.geometry?.location?.lng;
        if (typeof lat === "number" && typeof lng === "number") {
          const shortName = extractAreaName(first, trimmed);
          return {
            coordinates: { latitude: lat, longitude: lng },
            locationName: shortName,
            isGeocodedLocation: true,
          };
        }
      }
    }
  } catch (err) {
    console.warn("[DiscoveryService] Contextual geocode failed for query:", trimmed, err);
  }

  // 3. Fallback to currentCoordinates if geocoding didn't identify a location
  return {
    coordinates: currentCoordinates || { latitude: 12.9716, longitude: 77.5946 },
    locationName: defaultCity,
    isGeocodedLocation: false,
  };
}

/**
 * Helper to match category-specific subcategory filters
 */
function matchesCategoryFilter(
  item: DiscoveryItem,
  category: "DINING" | "MOVIES" | "SPORTS" | "ACTIVITIES" | "ALL",
  filter: string
): boolean {
  if (!filter || filter === "all") return true;

  const t = (item.title || "").toLowerCase();
  const s = (item.subcategory || "").toLowerCase();
  const d = (item.description || "").toLowerCase();
  const full = `${t} ${s} ${d}`;

  if (category === "DINING") {
    if (filter === "cafes") {
      return full.includes("cafe") || full.includes("coffee") || full.includes("tea") || full.includes("bake") || full.includes("dessert");
    }
    if (filter === "restaurants") {
      return full.includes("restaurant") || full.includes("dining") || full.includes("kitchen") || full.includes("diner");
    }
    if (filter === "fine-dining") {
      return full.includes("fine") || full.includes("pavilion") || full.includes("grand") || (typeof item.suggested_cost_amount === "number" && item.suggested_cost_amount >= 1800);
    }
    if (filter === "fast-food") {
      return full.includes("burger") || full.includes("pizza") || full.includes("fast food") || full.includes("fries") || full.includes("snack");
    }
    if (filter === "pubs-breweries") {
      return full.includes("pub") || full.includes("bar") || full.includes("brewery") || full.includes("beer") || full.includes("taproom");
    }
  } else if (category === "SPORTS") {
    if (filter === "football" || filter === "turf" || filter === "turfs") {
      return (
        full.includes("football") ||
        full.includes("turf") ||
        full.includes("soccer") ||
        full.includes("futsal") ||
        full.includes("5-a-side") ||
        full.includes("7-a-side")
      );
    }
    if (filter === "badminton" || filter === "court" || filter === "courts") {
      return full.includes("badminton") || full.includes("shuttle");
    }
    if (filter === "pickleball") {
      return full.includes("pickleball") || full.includes("pickle ball") || full.includes("dink");
    }
    if (filter === "tennis") {
      return full.includes("tennis") && !full.includes("table tennis");
    }
    if (filter === "basketball") {
      return full.includes("basketball") || full.includes("hoop");
    }
    if (filter === "cricket" || filter === "box-cricket") {
      return full.includes("cricket") || full.includes("pitch") || full.includes("nets");
    }
    if (filter === "table-tennis" || filter === "table tennis") {
      return full.includes("table tennis") || full.includes("ping pong") || full.includes("tt ");
    }
    if (filter === "other") {
      return (
        full.includes("swim") ||
        full.includes("squash") ||
        full.includes("golf") ||
        full.includes("volleyball") ||
        full.includes("skate") ||
        full.includes("sports complex") ||
        full.includes("sports club") ||
        full.includes("stadium") ||
        full.includes("gym") ||
        full.includes("fitness") ||
        full.includes("athletic")
      );
    }
    if (filter === "swimming") {
      return full.includes("swim") || full.includes("pool");
    }
    if (filter === "gym-fitness" || filter === "fitness") {
      return full.includes("gym") || full.includes("fitness") || full.includes("workout");
    }
    if (filter === "adventure") {
      return full.includes("adventure") || full.includes("kart") || full.includes("skate") || full.includes("bowling");
    }
  } else if (category === "ACTIVITIES") {
    if (filter === "bowling") return full.includes("bowl");
    if (filter === "mystery-rooms" || filter === "escape-rooms") return full.includes("escape") || full.includes("mystery") || full.includes("breakout");
    if (filter === "mini-golf") return full.includes("mini golf") || full.includes("putt");
    if (filter === "go-karting") return full.includes("kart");
    if (filter === "amusement-parks") return full.includes("amusement") || full.includes("theme park") || full.includes("water park");
    if (filter === "arcades") return full.includes("arcade") || full.includes("gaming") || full.includes("vr") || full.includes("timezone");
    if (filter === "adventure-fun") return full.includes("adventure") || full.includes("trampoline") || full.includes("laser");
  } else if (category === "MOVIES") {
    if (filter === "theatres" || filter === "cinemas") {
      return full.includes("theatre") || full.includes("theater") || full.includes("cinema") || full.includes("multiplex") || full.includes("imax") || full.includes("pvr") || full.includes("inox");
    }
  }

  return full.includes(filter.replace(/-/g, " "));
}

/**
 * ONE reusable Places search mechanism supporting Dining, Movies, Sports, and Activities.
 * Queries the entire database table directly without geographic limitations,
 * resolves search coordinates for distance information, and retains all matching places.
 */
/**
 * @deprecated Legacy search entry point.
 * Migrated to decoupled search domain (src/features/discovery/search).
 * Delegates to searchCoordinator to guarantee intent-aware ranking, relevance filtering, and clean pagination.
 */
export async function searchDiscoveryPlaces(params: PlacesSearchParams): Promise<PlacesSearchResult> {
  const { category, query, subCategoryFilter = "all", currentCoordinates, defaultCity = "Bengaluru" } = params;
  const trimmed = query.trim();

  if (!trimmed) {
    return {
      items: [],
      searchCoordinates: currentCoordinates || { latitude: 12.9716, longitude: 77.5946 },
      resolvedLocationName: defaultCity,
      nextPageToken: null,
    };
  }

  const session = await searchCoordinator.executeSearch(trimmed, {
    category,
    subcategory: subCategoryFilter,
    discoveryCoordinates: currentCoordinates,
    city: defaultCity,
    pageToken: params.pageToken,
  });

  return {
    items: session.items,
    searchCoordinates: session.searchCoordinates || currentCoordinates || { latitude: 12.9716, longitude: 77.5946 },
    resolvedLocationName:
      session.parsedQuery.locationQualifier?.raw ||
      (session.parsedQuery.intent === "SEARCH_LOCATION" ? session.parsedQuery.cleanSearchTerm : defaultCity),
    nextPageToken: session.nextPageToken,
  };
}

