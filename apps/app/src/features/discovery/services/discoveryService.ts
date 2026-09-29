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
