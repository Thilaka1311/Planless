import { supabase, SUPABASE_URL } from "../../../../lib/supabaseClient";
import { DiscoveryItem } from "../../../core/types/discovery";
import { RawCandidatePlace } from "../search/types/provider";
import { searchDiscoveryItems } from "./discoveryQueries";

export interface PlaceOverride {
  id?: string;
  place_id: string;
  name_override?: string | null;
  address_override?: string | null;
  latitude_override?: number | null;
  longitude_override?: number | null;
  image_path?: string | null;
  image_source?: string | null;
  google_photo_reference?: string | null;
  description_override?: string | null;
  category_override?: string | null;
  subcategory?: string | null;
  provider?: string;
  is_deleted?: boolean;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

// In-memory cache for ultra-fast lookup during search & section feeds
let overridesCache: Map<string, PlaceOverride> = new Map();
let lastFetchTime = 0;
const CACHE_TTL_MS = 60_000; // 1 minute TTL
let inFlightFetch: Promise<Map<string, PlaceOverride>> | null = null;

// Pub/sub listeners for instant UI updates when overrides change
type OverrideListener = (event: { action: "hide" | "save"; placeId: string; override?: PlaceOverride }) => void;
const listeners = new Set<OverrideListener>();

// Supabase Realtime channel state
let realtimeChannel: any = null;
let realtimeRefCount = 0;

/**
 * Initializes a Supabase Realtime listener on discovery_place_overrides table.
 * Automatically keeps the local in-memory cache synchronized when changes occur
 * (e.g. from another client, admin sheet, or database update) and notifies local listeners.
 */
export function initPlaceOverridesRealtime(): () => void {
  realtimeRefCount++;

  if (!realtimeChannel && supabase && typeof supabase.channel === "function") {
    try {
      realtimeChannel = supabase
        .channel("discovery_place_overrides_realtime")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "discovery_place_overrides",
          },
          (payload) => {
            const { eventType, new: newRecord, old: oldRecord } = payload;
            if (eventType === "DELETE") {
              const placeId = (oldRecord as any)?.place_id;
              if (placeId) {
                const cleanId = placeId.split("::")[0].replace(/^place_/, "");
                overridesCache.delete(cleanId);
                overridesCache.delete(placeId);
                notifyListeners("save", cleanId, undefined);
              }
            } else if (newRecord && (newRecord as any).place_id) {
              const override = newRecord as PlaceOverride;
              const cleanId = override.place_id.split("::")[0].replace(/^place_/, "");
              overridesCache.set(cleanId, override);
              if (cleanId !== override.place_id) {
                overridesCache.set(override.place_id, override);
              }
              if (override.is_deleted) {
                notifyListeners("hide", cleanId, override);
              } else {
                notifyListeners("save", cleanId, override);
              }
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn("[placeOverridesService] Failed to initialize realtime channel:", err);
    }
  }

  return () => {
    realtimeRefCount = Math.max(0, realtimeRefCount - 1);
    if (realtimeRefCount === 0 && realtimeChannel) {
      try {
        supabase.removeChannel(realtimeChannel);
      } catch {}
      realtimeChannel = null;
    }
  };
}

export function subscribePlaceOverrides(listener: OverrideListener): () => void {
  listeners.add(listener);
  const cleanupRealtime = initPlaceOverridesRealtime();
  return () => {
    listeners.delete(listener);
    cleanupRealtime();
  };
}

export function getPlaceOverridesCache(): Map<string, PlaceOverride> {
  return overridesCache;
}

function notifyListeners(action: "hide" | "save", placeId: string, override?: PlaceOverride) {
  listeners.forEach((fn) => {
    try {
      fn({ action, placeId, override });
    } catch (err) {
      console.warn("[placeOverridesService] Listener error:", err);
    }
  });
}

/**
 * Fetch all place overrides from Supabase discovery_place_overrides.
 * Cached in-memory with automatic TTL.
 */
export async function fetchPlaceOverrides(forceRefresh = false): Promise<Map<string, PlaceOverride>> {
  const now = Date.now();
  if (!forceRefresh && overridesCache.size > 0 && now - lastFetchTime < CACHE_TTL_MS) {
    return overridesCache;
  }

  if (inFlightFetch && !forceRefresh) {
    return inFlightFetch;
  }

  inFlightFetch = (async () => {
    try {
      const { data, error } = await supabase
        .from("discovery_place_overrides")
        .select("*");

      if (error) {
        console.warn("[placeOverridesService] Error fetching overrides:", error.message);
        return overridesCache;
      }

      const newMap = new Map<string, PlaceOverride>();
      if (Array.isArray(data)) {
        for (const row of data) {
          if (row.place_id) {
            newMap.set(row.place_id, row as PlaceOverride);
            const cleanId = row.place_id.split("::")[0].replace(/^place_/, "");
            if (cleanId && cleanId !== row.place_id) {
              newMap.set(cleanId, row as PlaceOverride);
            }
          }
        }
      }

      overridesCache = newMap;
      lastFetchTime = Date.now();
      return overridesCache;
    } catch (err) {
      console.warn("[placeOverridesService] Exception fetching overrides:", err);
      return overridesCache;
    } finally {
      inFlightFetch = null;
    }
  })();

  return inFlightFetch;
}

/**
 * Checks if a place has an active photo override in memory.
 */
export function hasPlacePhotoOverride(placeId: string): boolean {
  if (!placeId) return false;
  const cleanId = placeId.split("::")[0].replace(/^place_/, "");
  const override = overridesCache.get(cleanId) || overridesCache.get(placeId);
  if (!override || override.is_deleted) return false;
  return Boolean(override.google_photo_reference || override.image_path);
}

export type PlaceOverrideTarget = {
  id?: string;
  place_id?: string;
  category?: string;
  provider?: string;
  title?: string;
  name?: string;
  place_address?: string;
  location?: string;
  description?: string | null;
  cover_image_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  subcategory?: string | null;
};

export function parseSportsFromSubcategory(sub: string | null | undefined): string[] {
  if (!sub) return [];
  const trimmed = sub.trim();
  if (!trimmed) return [];

  let parts: string[] = [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsedJson = JSON.parse(trimmed);
      if (Array.isArray(parsedJson)) {
        parts = parsedJson.map((p) => String(p).toLowerCase().trim()).filter(Boolean);
      }
    } catch {}
  }

  if (parts.length === 0) {
    const lower = trimmed.toLowerCase();
    parts = lower.includes("|") ? lower.split("|").map((p) => p.trim()).filter(Boolean) : [lower];
  }

  const parsed: string[] = [];
  const knownSports: Array<{ id: string; tokens: string[] }> = [
    { id: "table-tennis", tokens: ["table-tennis", "table tennis", "ping pong"] },
    { id: "tennis", tokens: ["tennis", "lawn tennis"] },
    { id: "football", tokens: ["football", "futsal", "soccer"] },
    { id: "badminton", tokens: ["badminton", "shuttle"] },
    { id: "pickleball", tokens: ["pickleball", "pickle ball"] },
    { id: "cricket", tokens: ["cricket", "box cricket"] },
    { id: "basketball", tokens: ["basketball", "hoop"] },
    { id: "swimming", tokens: ["swimming"] },
    { id: "squash", tokens: ["squash"] },
    { id: "volleyball", tokens: ["volleyball"] },
  ];

  for (const part of parts) {
    let matched = false;
    for (const sport of knownSports) {
      if (sport.id === "tennis" && (part.includes("table tennis") || part.includes("table-tennis"))) {
        continue;
      }
      if (sport.tokens.some((t) => part.includes(t))) {
        if (!parsed.includes(sport.id)) parsed.push(sport.id);
        matched = true;
        break;
      }
    }
    if (!matched && part.length > 2) {
      const slug = part.replace(/\s+/g, "-");
      if (!parsed.includes(slug)) parsed.push(slug);
    }
  }

  return parsed;
}

/**
 * Synchronously applies active overrides from in-memory cache to a list of items.
 * - COMPLETELY FILTERS OUT any venue where `is_deleted === true`.
 * - Applies non-deleted overrides (name, address, description, photo, subcategory).
 * - Never modifies TMDB/movie items.
 * - Does NOT append any candidate that is not already in the list.
 */
export function applyPlaceOverridesSync<T extends PlaceOverrideTarget>(items: T[]): T[] {
  if (!items || items.length === 0) return items;
  if (overridesCache.size === 0) return items;

  const photoBaseUrl = `${SUPABASE_URL}/functions/v1/maps`;

  const getOverrideForItem = (item: T): PlaceOverride | undefined => {
    const rawId = item.place_id || (typeof item.id === "string" ? item.id : "");
    const cleanId = rawId.split("::")[0].replace(/^place_/, "");
    if (cleanId && overridesCache.has(cleanId)) return overridesCache.get(cleanId);
    if (item.place_id && overridesCache.has(item.place_id)) return overridesCache.get(item.place_id);
    if (typeof item.id === "string" && overridesCache.has(item.id)) return overridesCache.get(item.id);
    return undefined;
  };

  return items
    .filter((item) => {
      // Do not filter out TMDB movies
      if ((item.category || "").toUpperCase() === "MOVIES" || item.provider === "tmdb") {
        return true;
      }

      const override = getOverrideForItem(item);
      if (override && override.is_deleted) {
        return false; // COMPLETELY EXCLUDE DELETED PLACE
      }

      return true;
    })
    .map((item) => {
      if ((item.category || "").toUpperCase() === "MOVIES" || item.provider === "tmdb") {
        return item;
      }

      const override = getOverrideForItem(item);
      if (!override || override.is_deleted) return item;

      // Apply field overrides
      const updated = { ...item };

      if (override.name_override) {
        updated.title = override.name_override;
        updated.name = override.name_override;
      }

      if (override.address_override) {
        updated.place_address = override.address_override;
        updated.location = override.address_override;
      }

      if (override.description_override !== undefined && override.description_override !== null) {
        updated.description = override.description_override;
      }

      if (override.category_override) {
        updated.category = override.category_override;
      }

      if (override.subcategory) {
        updated.subcategory = override.subcategory;
        const parsedSports = parseSportsFromSubcategory(override.subcategory);
        if (parsedSports.length > 0) {
          (updated as any).supported_sports = parsedSports;
          (updated as any).supportedSports = parsedSports;
        }
      }

      if (typeof override.latitude_override === "number") {
        updated.latitude = override.latitude_override;
      }

      if (typeof override.longitude_override === "number") {
        updated.longitude = override.longitude_override;
      }

      if (override.google_photo_reference) {
        updated.cover_image_url = `${photoBaseUrl}?action=photo&photo_reference=${encodeURIComponent(
          override.google_photo_reference
        )}&maxwidth=800`;
        (updated as any).google_photo_reference = override.google_photo_reference;
      } else if (override.image_path) {
        updated.cover_image_url = override.image_path;
        (updated as any).image_path = override.image_path;
      }

      // Preserve explicit flag indicating planless admin override is applied
      (updated as any)._hasPlanlessOverride = true;

      return updated;
    });
}

/**
 * Applies overrides to a list of discovery items or search results.
 * Fetches fresh overrides if not cached, then applies synchronously.
 */
export async function applyPlaceOverrides<T extends PlaceOverrideTarget>(
  items: T[],
  forceRefresh = false
): Promise<T[]> {
  if (!items || items.length === 0) return items;
  await fetchPlaceOverrides(forceRefresh);
  return applyPlaceOverridesSync(items);
}

/**
 * Merges Google Places results with database overrides specifically for Sports.
 * - Uses the Google Place as the base place.
 * - Applies any matching database override to that same place using `place_id`.
 * - If a place exists in both: merges into ONE place (no duplicates).
 * - If a place exists only in Google: shows normally.
 * - If a place exists only in database: includes it as a sports candidate place.
 * - Completely excludes places where `is_deleted === true`.
 */
export function mergeSportsPlacesWithOverrides<
  T extends {
    id?: string;
    place_id?: string;
    category?: string;
    provider?: string;
    title?: string;
    name?: string;
    place_address?: string;
    location?: string;
    description?: string | null;
    cover_image_url?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    subcategory?: string | null;
    types?: string[] | null;
  }
>(googlePlaces: T[]): T[] {
  const photoBaseUrl = `${SUPABASE_URL}/functions/v1/maps`;
  const merged: T[] = [];
  const seenPlaceIds = new Set<string>();

  const getCleanId = (itemOrId: any): string => {
    if (!itemOrId) return "";
    if (typeof itemOrId === "string") {
      return itemOrId.split("::")[0].replace(/^place_/, "");
    }
    return (itemOrId.place_id || itemOrId.id || "").split("::")[0].replace(/^place_/, "");
  };

  // 1. Process Google Places and merge any matching database overrides
  for (const item of googlePlaces || []) {
    const cleanId = getCleanId(item);
    if (!cleanId) {
      merged.push(item);
      continue;
    }

    const override = overridesCache.get(cleanId) || (item.place_id ? overridesCache.get(item.place_id) : undefined);

    // If marked deleted in database, completely exclude
    if (override && override.is_deleted) {
      seenPlaceIds.add(cleanId);
      continue;
    }

    if (!override) {
      // Place exists only in Google: show normally
      seenPlaceIds.add(cleanId);
      merged.push(item);
      continue;
    }

    // Place exists in both: merge into one place
    seenPlaceIds.add(cleanId);
    const updated: any = { ...item };

    if (override.name_override) {
      updated.title = override.name_override;
      updated.name = override.name_override;
    }
    if (override.address_override) {
      updated.place_address = override.address_override;
      updated.location = override.address_override;
    }
    if (override.description_override !== undefined && override.description_override !== null) {
      updated.description = override.description_override;
    }
    if (override.category_override) {
      updated.category = override.category_override;
    }
    if (override.subcategory) {
      updated.subcategory = override.subcategory;
      const parsedSports = parseSportsFromSubcategory(override.subcategory);
      if (parsedSports.length > 0) {
        updated.supported_sports = parsedSports;
        updated.supportedSports = parsedSports;
      }
    }
    if (typeof override.latitude_override === "number") {
      updated.latitude = override.latitude_override;
    }
    if (typeof override.longitude_override === "number") {
      updated.longitude = override.longitude_override;
    }
    if (override.google_photo_reference) {
      updated.cover_image_url = `${photoBaseUrl}?action=photo&photo_reference=${encodeURIComponent(
        override.google_photo_reference
      )}&maxwidth=800`;
      updated.google_photo_reference = override.google_photo_reference;
    } else if (override.image_path) {
      updated.cover_image_url = override.image_path;
      updated.image_path = override.image_path;
    }
    updated._hasPlanlessOverride = true;

    merged.push(updated as T);
  }

  // 2. Include database-only sports overrides (not present in current Google batch)
  overridesCache.forEach((override, overrideKey) => {
    if (override.is_deleted) return;
    const cleanId = getCleanId(override.place_id || overrideKey);
    if (!cleanId || seenPlaceIds.has(cleanId)) return;

    const cat = (override.category_override || "").toUpperCase();
    const isSportsCat = cat === "SPORTS";
    const sub = (override.subcategory || "").toLowerCase();
    const isSportsSub = [
      "football", "cricket", "badminton", "pickleball", "tennis",
      "basketball", "sports", "turf", "arena", "court", "pitch"
    ].some((k) => sub.includes(k));

    if (isSportsCat || isSportsSub) {
      seenPlaceIds.add(cleanId);
      const parsedSports = parseSportsFromSubcategory(override.subcategory);
      const dbPlace: any = {
        id: `place_${cleanId}`,
        public_id: `place_${cleanId}`,
        section_id: "places_sports",
        place_id: cleanId,
        provider_place_id: cleanId,
        title: override.name_override || "Sports Venue",
        name: override.name_override || "Sports Venue",
        category: "SPORTS",
        subcategory: override.subcategory || "Sports Facility",
        supported_sports: parsedSports,
        supportedSports: parsedSports,
        place_address: override.address_override || "",
        location: override.address_override || "",
        description: override.description_override || null,
        latitude: override.latitude_override ?? null,
        longitude: override.longitude_override ?? null,
        cover_image_url: override.google_photo_reference
          ? `${photoBaseUrl}?action=photo&photo_reference=${encodeURIComponent(
              override.google_photo_reference
            )}&maxwidth=800`
          : override.image_path || null,
        types: ["sports_complex", "sports_club", "athletic_field"],
        _hasPlanlessOverride: true,
        google_photo_reference: override.google_photo_reference,
        image_path: override.image_path,
      };
      merged.push(dbPlace as T);
    }
  });

  return merged;
}

/**
 * Hides a place from Planless discovery across all categories, searches, and sections.
 * Sets is_deleted = true in discovery_place_overrides using place_id as the stable identifier.
 */
export async function hidePlace(placeId: string): Promise<void> {
  if (!placeId) return;

  const cleanId = placeId.split("::")[0].replace(/^place_/, "");
  const now = new Date().toISOString();
  const existing = overridesCache.get(cleanId) || overridesCache.get(placeId);

  const payload: Partial<PlaceOverride> = {
    place_id: cleanId,
    is_deleted: true,
    updated_at: now,
  };

  // Immediate optimistic cache update
  overridesCache.set(cleanId, {
    ...(existing || {}),
    ...payload,
    place_id: cleanId,
    is_deleted: true,
  });
  if (cleanId !== placeId) {
    overridesCache.set(placeId, {
      ...(existing || {}),
      ...payload,
      place_id: cleanId,
      is_deleted: true,
    });
  }

  notifyListeners("hide", cleanId);

  // Persist to Supabase
  const { error } = await supabase
    .from("discovery_place_overrides")
    .upsert(
      {
        place_id: cleanId,
        subcategory: existing?.subcategory || null,
        is_deleted: true,
        updated_at: now,
      },
      { onConflict: "place_id" }
    );

  if (error) {
    console.error("[placeOverridesService] Error hiding place:", error.message);
    throw new Error(`Failed to hide place: ${error.message}`);
  }
}

/**
 * Saves or updates place overrides (name, address, description, photo, subcategory).
 * Sets is_deleted = false.
 */
export async function savePlaceOverride(
  placeId: string,
  updates: {
    name_override?: string | null;
    address_override?: string | null;
    description_override?: string | null;
    category_override?: string | null;
    subcategory?: string | null;
    google_photo_reference?: string | null;
    image_path?: string | null;
    latitude_override?: number | null;
    longitude_override?: number | null;
  }
): Promise<PlaceOverride> {
  if (!placeId) throw new Error("Missing place_id");

  const cleanId = placeId.split("::")[0].replace(/^place_/, "");
  const now = new Date().toISOString();
  const existing = overridesCache.get(cleanId) || overridesCache.get(placeId);

  const payload: Record<string, any> = {
    place_id: cleanId,
    name_override: updates.name_override ?? existing?.name_override ?? null,
    address_override: updates.address_override ?? existing?.address_override ?? null,
    description_override: updates.description_override ?? existing?.description_override ?? null,
    category_override: updates.category_override ?? existing?.category_override ?? null,
    subcategory: updates.subcategory ?? existing?.subcategory ?? null,
    google_photo_reference: updates.google_photo_reference ?? existing?.google_photo_reference ?? null,
    image_path: updates.image_path ?? existing?.image_path ?? null,
    latitude_override: updates.latitude_override ?? existing?.latitude_override ?? null,
    longitude_override: updates.longitude_override ?? existing?.longitude_override ?? null,
    is_deleted: false,
    updated_at: now,
  };

  const savedRecord: PlaceOverride = {
    ...(existing || {}),
    ...payload,
    place_id: cleanId,
  };

  // Immediate optimistic cache update
  overridesCache.set(cleanId, savedRecord);
  if (cleanId !== placeId) {
    overridesCache.set(placeId, savedRecord);
  }
  notifyListeners("save", cleanId, savedRecord);

  const { data, error } = await supabase
    .from("discovery_place_overrides")
    .upsert(payload, { onConflict: "place_id" })
    .select()
    .single();

  if (error) {
    console.error("[placeOverridesService] Error saving place override:", error.message);
    throw new Error(`Failed to save place override: ${error.message}`);
  }

  const finalRecord = (data as PlaceOverride) || savedRecord;
  overridesCache.set(cleanId, finalRecord);
  if (cleanId !== placeId) {
    overridesCache.set(placeId, finalRecord);
  }
  return finalRecord;
}

/**
 * Clears the in-memory overrides cache (useful for testing and manual sync).
 */
export function clearPlaceOverridesCache(): void {
  overridesCache.clear();
  lastFetchTime = 0;
  inFlightFetch = null;
}

/**
 * Sets the in-memory overrides cache for testing.
 */
export function setPlaceOverridesCacheForTesting(newCache: Map<string, any>): void {
  overridesCache = new Map(newCache);
  lastFetchTime = Date.now();
}


/**
 * Fetches candidate sports places from discovery_place_overrides data.
 * Used by the combined Sports search pipeline to merge database records with Google Places results.
 */
export async function getDatabaseSportsCandidatePlaces(
  query: string
): Promise<RawCandidatePlace[]> {
  const trimmedQuery = (query || "").trim().toLowerCase();
  if (!trimmedQuery) {
    return [];
  }

  const photoBaseUrl = `${SUPABASE_URL}/functions/v1/maps`;
  const candidates: RawCandidatePlace[] = [];
  const seenIds = new Set<string>();

  const queryTokens = trimmedQuery.split(/\s+/).filter(Boolean);

  // 1. Ensure overrides are fetched
  await fetchPlaceOverrides();

  // 2. Scan overridesCache for sports places matching query
  overridesCache.forEach((override, overrideKey) => {
    if (override.is_deleted) return;
    const cleanId = (override.place_id || overrideKey || "").split("::")[0].replace(/^place_/, "");
    if (!cleanId || seenIds.has(cleanId)) return;

    const cat = (override.category_override || "").toUpperCase();
    if (cat && cat !== "SPORTS") {
      return;
    }
    const sub = (override.subcategory || "").toLowerCase();
    const name = (override.name_override || "").toLowerCase();
    const isSportsCat = cat === "SPORTS";
    const isSportsSub = [
      "football", "cricket", "badminton", "pickleball", "tennis",
      "basketball", "sports", "turf", "arena", "court", "pitch",
      "box cricket", "padel", "swimming", "squash", "stadium"
    ].some((k) => sub.includes(k) || name.includes(k));

    if (!isSportsCat && !isSportsSub) {
      return;
    }

    const fullSearchable = [
      override.name_override,
      override.address_override,
      override.subcategory,
      override.description_override,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesAllTokens = queryTokens.length > 0 && queryTokens.every((t) => fullSearchable.includes(t));
    const matchesPhrase = fullSearchable.includes(trimmedQuery);

    if (!matchesAllTokens && !matchesPhrase) {
      return;
    }

    seenIds.add(cleanId);
    candidates.push({
      place_id: cleanId,
      title: override.name_override || "Sports Venue",
      name: override.name_override || "Sports Venue",
      category: "SPORTS",
      subcategory: override.subcategory || "Sports Facility",
      description: override.description_override || null,
      types: ["sports_complex", "sports_club", "athletic_field"],
      latitude: override.latitude_override ?? null,
      longitude: override.longitude_override ?? null,
      vicinity: override.address_override || "",
      formatted_address: override.address_override || "",
      rating: 4.5,
      user_ratings_total: 10,
      cover_image_url: override.google_photo_reference
        ? `${photoBaseUrl}?action=photo&photo_reference=${encodeURIComponent(
            override.google_photo_reference
          )}&maxwidth=800`
        : override.image_path || null,
      _hasPlanlessOverride: true,
      _raw: override,
    });
  });

  return candidates;
}

function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Retrieves database places from discovery_place_overrides within a distance band for a specific category.
 * Used by progressive discovery feeds to inject curated/community venues at their true physical distance.
 */
export function getDatabasePlacesForCategoryAndDistanceBand(
  category: "SPORTS" | "DINING" | "ACTIVITIES",
  originCoords: { latitude: number; longitude: number } | null | undefined,
  minDistKm = 0,
  maxDistKm = Infinity,
  seenPlaceIds?: Set<string>
): DiscoveryItem[] {
  const photoBaseUrl = `${SUPABASE_URL}/functions/v1/maps`;
  const items: DiscoveryItem[] = [];

  const seenKeys = new Set<string>();
  overridesCache.forEach((override, overrideKey) => {
    if (override.is_deleted) return;
    const cleanId = (override.place_id || overrideKey || "").split("::")[0].replace(/^place_/, "");
    if (!cleanId || seenKeys.has(cleanId) || seenPlaceIds?.has(cleanId)) return;
    seenKeys.add(cleanId);
    seenPlaceIds?.add(cleanId);

    const cat = (override.category_override || "").toUpperCase();
    const sub = (override.subcategory || "").toLowerCase();
    const name = (override.name_override || "").toLowerCase();

    if (category === "SPORTS") {
      if (cat && cat !== "SPORTS") return;
      const isSportsCat = cat === "SPORTS";
      const isSportsSub = [
        "football", "cricket", "badminton", "pickleball", "tennis",
        "basketball", "sports", "turf", "arena", "court", "pitch",
        "box cricket", "padel", "swimming", "squash", "stadium"
      ].some((k) => sub.includes(k) || name.includes(k));
      if (!isSportsCat && !isSportsSub) return;
    } else if (category === "DINING") {
      if (cat && cat !== "DINING") return;
      const isDiningCat = cat === "DINING";
      const isDiningSub = [
        "restaurant", "cafe", "coffee", "bakery", "bakehouse", "brewery",
        "pub", "bar", "fine dining", "diner", "bistro", "eatery",
        "food", "kitchen", "lounge", "roaster", "dessert", "burger", "pizza"
      ].some((k) => sub.includes(k) || name.includes(k));
      if (!isDiningCat && !isDiningSub) return;
    } else if (category === "ACTIVITIES") {
      if (cat && cat !== "ACTIVITIES") return;
      const isActivityCat = cat === "ACTIVITIES";
      const isActivitySub = [
        "bowling", "escape", "mystery", "kart", "karting", "amusement",
        "theme park", "arcade", "gaming", "trampoline", "laser tag",
        "mini golf", "adventure", "snow city", "play arena"
      ].some((k) => sub.includes(k) || name.includes(k));
      if (!isActivityCat && !isActivitySub) return;
    }

    const lat = override.latitude_override ?? null;
    const lng = override.longitude_override ?? null;
    let distKm: number | undefined = undefined;

    if (originCoords && typeof lat === "number" && typeof lng === "number") {
      distKm = calculateHaversineDistance(originCoords.latitude, originCoords.longitude, lat, lng);
    }

    if (distKm !== undefined && (distKm < minDistKm || distKm >= maxDistKm)) {
      return;
    }

    seenPlaceIds?.add(cleanId);
    const parsedSports = category === "SPORTS" ? parseSportsFromSubcategory(override.subcategory) : [];

    const defaultTitle =
      category === "SPORTS"
        ? "Sports Venue"
        : category === "DINING"
        ? "Dining Place"
        : "Activity Venue";

    const defaultSub =
      category === "SPORTS"
        ? "Sports Facility"
        : category === "DINING"
        ? "Restaurant"
        : "Activity";

    items.push({
      id: `place_${cleanId}`,
      public_id: `place_${cleanId}`,
      section_id: `places_${category.toLowerCase()}`,
      place_id: cleanId,
      title: override.name_override || defaultTitle,
      name: override.name_override || defaultTitle,
      category,
      subcategory: override.subcategory || defaultSub,
      ...(category === "SPORTS" ? { supported_sports: parsedSports, supportedSports: parsedSports } : {}),
      description: override.description_override || override.address_override || null,
      location: override.address_override || "",
      place_address: override.address_override || "",
      latitude: lat,
      longitude: lng,
      distance: distKm !== undefined ? `${distKm.toFixed(1)} km` : undefined,
      _distanceKm: distKm,
      rating: 4.5,
      cover_image_url: override.google_photo_reference
        ? `${photoBaseUrl}?action=photo&photo_reference=${encodeURIComponent(
            override.google_photo_reference
          )}&maxwidth=800`
        : override.image_path || null,
      suggested_duration_minutes: category === "DINING" ? 60 : 90,
      suggested_cost_amount: null,
      suggested_capacity: null,
      default_rsvp_offset_minutes: 30,
      display_order: items.length + 1,
      featured: false,
      status: "ACTIVE",
      created_at: override.created_at || new Date().toISOString(),
      updated_at: override.updated_at || new Date().toISOString(),
      _hasPlanlessOverride: true,
      google_photo_reference: override.google_photo_reference,
      image_path: override.image_path,
    } as any);
  });

  return items;
}

/**
 * Retrieves database sports places from discovery_place_overrides within a distance band.
 * Used by the progressive sports feed to inject curated/community venues at their true physical distance.
 */
export function getDatabaseSportsPlacesForDistanceBand(
  originCoords: { latitude: number; longitude: number } | null | undefined,
  minDistKm = 0,
  maxDistKm = Infinity,
  seenPlaceIds?: Set<string>
): DiscoveryItem[] {
  return getDatabasePlacesForCategoryAndDistanceBand("SPORTS", originCoords, minDistKm, maxDistKm, seenPlaceIds);
}

/**
 * Retrieves database dining places from discovery_place_overrides within a distance band.
 */
export function getDatabaseDiningPlacesForDistanceBand(
  originCoords: { latitude: number; longitude: number } | null | undefined,
  minDistKm = 0,
  maxDistKm = Infinity,
  seenPlaceIds?: Set<string>
): DiscoveryItem[] {
  return getDatabasePlacesForCategoryAndDistanceBand("DINING", originCoords, minDistKm, maxDistKm, seenPlaceIds);
}

/**
 * Retrieves database activity places from discovery_place_overrides within a distance band.
 */
export function getDatabaseActivityPlacesForDistanceBand(
  originCoords: { latitude: number; longitude: number } | null | undefined,
  minDistKm = 0,
  maxDistKm = Infinity,
  seenPlaceIds?: Set<string>
): DiscoveryItem[] {
  return getDatabasePlacesForCategoryAndDistanceBand("ACTIVITIES", originCoords, minDistKm, maxDistKm, seenPlaceIds);
}

