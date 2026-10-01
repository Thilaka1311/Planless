import { DiscoverySection, DiscoveryItem } from "../../../core/types/discovery";
import { supabase, SUPABASE_URL } from "../../../../lib/supabaseClient";
import * as queries from "./discoveryQueries";
import * as mapper from "./discoveryMapper";
import { calculateDistanceKm, formatDistanceKm } from "../components/DiscoveryCard";

const sectionsCache = new Map<string, DiscoverySection[]>();
let inFlightRequest: Promise<DiscoverySection[]> | null = null;

export interface DiscoveryLocationParams {
  latitude?: number;
  longitude?: number;
}

export function getCacheKey(coords?: DiscoveryLocationParams): string {
  if (
    typeof coords?.latitude === "number" &&
    !isNaN(coords.latitude) &&
    typeof coords?.longitude === "number" &&
    !isNaN(coords.longitude)
  ) {
    return `${coords.latitude.toFixed(4)}_${coords.longitude.toFixed(4)}`;
  }
  return "default";
}

export function getCachedSections(coords?: DiscoveryLocationParams): DiscoverySection[] | null {
  if (coords) {
    return sectionsCache.get(getCacheKey(coords)) || null;
  }
  // If no coords specified, return any existing cached sections or default
  if (sectionsCache.has("default")) return sectionsCache.get("default") || null;
  if (sectionsCache.size > 0) return Array.from(sectionsCache.values())[0];
  return null;
}

export function clearCachedSections(): void {
  sectionsCache.clear();
  inFlightRequest = null;
}

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
    const cacheKey = getCacheKey(coords);
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
                photoBaseUrl,
              },
            });

            if (error) {
              throw error;
            }

            let loadedSections: DiscoverySection[] = [];
            if (data?.sections && Array.isArray(data.sections) && data.sections.length > 0) {
              loadedSections = data.sections as DiscoverySection[];
            } else {
              // Fallback to database queries
              const rawSections = await queries.fetchActiveSectionsWithItems();
              loadedSections = (rawSections || []).map(mapper.mapDbSectionToFrontend);
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
                  }
                }
              }
            }

            sectionsCache.set(cacheKey, loadedSections);
            return loadedSections;
          } catch (err: any) {
            console.warn("[DiscoveryService] Places API failed, using database items:", err?.message || err);
            try {
              const rawSections = await queries.fetchActiveSectionsWithItems();
              const fallbackSections = (rawSections || []).map(mapper.mapDbSectionToFrontend);
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
  subCategoryFilter?: string;
  currentCoordinates?: { latitude: number; longitude: number };
  defaultCity?: string;
}

export interface PlacesSearchResult {
  items: DiscoveryItem[];
  searchCoordinates: { latitude: number; longitude: number };
  resolvedLocationName: string;
}

const placesSearchCache = new Map<string, PlacesSearchResult>();
const placesInFlightSearches = new Map<string, Promise<PlacesSearchResult>>();

export function getPlacesSearchCacheKey(params: PlacesSearchParams): string {
  const q = params.query.trim().toLowerCase();
  const sub = (params.subCategoryFilter || "all").toLowerCase();
  const cat = params.category.toUpperCase();
  return `${cat}:${q}:${sub}`;
}

export function clearPlacesSearchCache(): void {
  placesSearchCache.clear();
  placesInFlightSearches.clear();
}

/**
 * Resolves geographical coordinates for a user search query using Google Maps Geocoding API.
 * Detects whether the query is a locality/area (e.g. "Koramangala", "Indiranagar") vs a generic keyword.
 */
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
      const lat = first.geometry?.location?.lat;
      const lng = first.geometry?.location?.lng;
      if (typeof lat === "number" && typeof lng === "number") {
        const shortName = first.address_components?.[0]?.long_name || first.formatted_address?.split(",")?.[0]?.trim() || trimmed;
        return {
          coordinates: { latitude: lat, longitude: lng },
          locationName: shortName,
          isGeocodedLocation: true,
        };
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
      const lat = first.geometry?.location?.lat;
      const lng = first.geometry?.location?.lng;
      if (typeof lat === "number" && typeof lng === "number") {
        const shortName = first.address_components?.[0]?.long_name || first.formatted_address?.split(",")?.[0]?.trim() || trimmed;
        return {
          coordinates: { latitude: lat, longitude: lng },
          locationName: shortName,
          isGeocodedLocation: true,
        };
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
    if (filter === "turf" || filter === "turfs" || filter === "football") {
      return full.includes("turf") || full.includes("football") || full.includes("soccer") || full.includes("futsal");
    }
    if (filter === "badminton" || filter === "court" || filter === "courts") {
      return full.includes("badminton") || full.includes("court") || full.includes("shuttle");
    }
    if (filter === "box-cricket" || filter === "cricket") {
      return full.includes("cricket");
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
export async function searchDiscoveryPlaces(params: PlacesSearchParams): Promise<PlacesSearchResult> {
  const { category, query, subCategoryFilter = "all", currentCoordinates, defaultCity = "Bengaluru" } = params;
  const trimmed = query.trim();

  if (!trimmed) {
    return {
      items: [],
      searchCoordinates: currentCoordinates || { latitude: 12.9716, longitude: 77.5946 },
      resolvedLocationName: defaultCity,
    };
  }

  const cacheKey = getPlacesSearchCacheKey(params);
  if (placesSearchCache.has(cacheKey)) {
    return placesSearchCache.get(cacheKey)!;
  }

  if (placesInFlightSearches.has(cacheKey)) {
    return placesInFlightSearches.get(cacheKey)!;
  }

  const searchPromise = (async (): Promise<PlacesSearchResult> => {
    try {
      const seen = new Set<string>();
      const combinedItems: DiscoveryItem[] = [];

      // 1. Query the entire database table first (server-side indexed search)
      try {
        const dbRecords = await queries.searchDiscoveryItems({
          query: trimmed,
          category,
        });
        if (dbRecords && dbRecords.length > 0) {
          const mapped = dbRecords.map(mapper.mapDbItemToFrontend);
          for (const item of mapped) {
            const key = item.place_id || item.id;
            if (!seen.has(key)) {
              seen.add(key);
              combinedItems.push(item);
            }
          }
        }
      } catch (dbErr) {
        console.warn("[DiscoveryService] DB search query error:", dbErr);
      }

      // 2. Resolve search coordinates and location context
      const { coordinates: searchCoords, locationName, isGeocodedLocation } =
        await resolveSearchCoordinates(trimmed, currentCoordinates, defaultCity);

      // 3. If query is a geocoded location, or if additional places can be found via Places API:
      try {
        const photoBaseUrl = `${SUPABASE_URL}/functions/v1/maps`;
        const { data, error } = await supabase.functions.invoke("maps", {
          body: {
            action: "places-discovery",
            category: category === "ALL" ? "ALL" : category.toUpperCase(),
            latitude: searchCoords.latitude,
            longitude: searchCoords.longitude,
            photoBaseUrl,
          },
        });

        if (!error && data?.sections && Array.isArray(data.sections)) {
          const placesItems: DiscoveryItem[] = data.sections.flatMap((s: any) => s.items || []);
          for (const item of placesItems) {
            const key = item.place_id || item.id;
            if (!seen.has(key)) {
              seen.add(key);
              combinedItems.push(item);
            }
          }
        }
      } catch (placesErr) {
        console.warn("[DiscoveryService] Places API discovery query failed:", placesErr);
      }

      // 4. If query is a specific brand/venue (e.g. "Toit", "Truffles", "PVR", "Decathlon"),
      // query autocomplete across India to find matching venues
      if (trimmed.length >= 3 && !isGeocodedLocation) {
        try {
          const { data: autoData } = await supabase.functions.invoke("maps", {
            body: { action: "autocomplete", input: trimmed },
          });
          if (autoData?.predictions && Array.isArray(autoData.predictions) && autoData.predictions.length > 0) {
            for (const top of autoData.predictions.slice(0, 3)) {
              if (top?.place_id && !seen.has(top.place_id)) {
                const { data: detailsData } = await supabase.functions.invoke("maps", {
                  body: { action: "place-details", place_id: top.place_id },
                });
                const dResult = detailsData?.result;
                if (dResult?.geometry?.location) {
                  const dLat = dResult.geometry.location.lat;
                  const dLng = dResult.geometry.location.lng;

                  const specificItem: DiscoveryItem = {
                    id: `place-${top.place_id}`,
                    public_id: `place-${top.place_id}`,
                    section_id: `search-${category.toLowerCase()}`,
                    title: dResult.name || top.structured_formatting?.main_text || trimmed,
                    category: category === "ALL" ? "DINING" : category,
                    subcategory:
                      category === "DINING"
                        ? "Restaurant"
                        : category === "SPORTS"
                        ? "Sports Venue"
                        : category === "MOVIES"
                        ? "Cinema"
                        : "Activity",
                    description: dResult.formatted_address || top.description,
                    cover_image_url: dResult.photos?.[0]?.photo_reference
                      ? `${SUPABASE_URL}/functions/v1/maps?action=photo&photo_reference=${dResult.photos[0].photo_reference}&maxwidth=800`
                      : null,
                    location: dResult.vicinity || dResult.formatted_address || "Nearby",
                    place_address: dResult.formatted_address || top.description,
                    latitude: dLat,
                    longitude: dLng,
                    place_id: top.place_id,
                    rating: dResult.rating || null,
                    user_ratings_total: dResult.user_ratings_total || null,
                    suggested_duration_minutes: category === "DINING" ? 60 : 90,
                    suggested_cost_amount: null,
                    suggested_capacity: null,
                    default_rsvp_offset_minutes: 30,
                    display_order: 0,
                    featured: true,
                    status: "ACTIVE",
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                  combinedItems.unshift(specificItem);
                  seen.add(top.place_id);
                }
              }
            }
          }
        } catch (autoErr) {
          console.warn("[DiscoveryService] Specific place autocomplete lookup bypassed:", autoErr);
        }
      }

      // 5. Calculate exact distances relative to origin for display, without dropping distant places
      const origin = isGeocodedLocation ? searchCoords : (currentCoordinates || searchCoords);
      for (const item of combinedItems) {
        const pLat = item.latitude != null ? Number(item.latitude) : (item as any).metadata?.latitude;
        const pLng = item.longitude != null ? Number(item.longitude) : (item as any).metadata?.longitude;
        if (typeof pLat === "number" && !isNaN(pLat) && typeof pLng === "number" && !isNaN(pLng)) {
          const distKm = calculateDistanceKm(origin.latitude, origin.longitude, pLat, pLng);
          item.distance = formatDistanceKm(distKm);
        }
      }

      // 6. Filter by subcategory chip if selected
      let filtered = combinedItems.filter((item) =>
        matchesCategoryFilter(item, category, subCategoryFilter)
      );

      // 7. If non-geocoded keywords (e.g. "pizza", "toit", "badminton", "mcdonald's hyderabad"),
      // ensure items match each search term across fields
      if (!isGeocodedLocation) {
        const terms = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
        filtered = filtered.filter((item) => {
          const fullText = `${item.title || ""} ${item.description || ""} ${item.subcategory || ""} ${item.place_address || ""} ${item.location || ""}`.toLowerCase();
          return terms.every((term) => fullText.includes(term));
        });
      }

      const result: PlacesSearchResult = {
        items: filtered,
        searchCoordinates: searchCoords,
        resolvedLocationName: locationName,
      };

      placesSearchCache.set(cacheKey, result);
      return result;
    } catch (err: any) {
      console.error(`[DiscoveryService] Places search failed for ${category} "${trimmed}":`, err?.message || err);
      const fallbackResult: PlacesSearchResult = {
        items: [],
        searchCoordinates: currentCoordinates || { latitude: 12.9716, longitude: 77.5946 },
        resolvedLocationName: defaultCity,
      };
      return fallbackResult;
    } finally {
      placesInFlightSearches.delete(cacheKey);
    }
  })();

  placesInFlightSearches.set(cacheKey, searchPromise);
  return searchPromise;
}
