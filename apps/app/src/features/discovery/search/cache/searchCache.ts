import { SearchResultItem } from "../types/result";
import { SearchIntentType } from "../types/intent";
import { GeoPoint, SearchProviderType } from "../types/provider";

export interface CachedSearchEntry {
  results: SearchResultItem[];
  nextPageToken: string | null;
  isExhausted: boolean;
  timestamp: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

import { onDiscoveryLocationChange } from "../../hooks/useUserLocation";

export class PlanlessSearchCache {
  private cache = new Map<string, CachedSearchEntry>();
  private inFlight = new Map<string, Promise<any>>();
  private maxEntries: number;

  constructor(maxEntries = 100) {
    this.maxEntries = maxEntries;
    if (typeof window !== "undefined") {
      try {
        onDiscoveryLocationChange(() => {
          this.clear();
        });
      } catch {}
    }
  }

  buildKey(params: {
    provider?: SearchProviderType;
    category?: string;
    subcategory?: string;
    intent?: SearchIntentType;
    normalizedQuery: string;
    coordinates?: GeoPoint | null;
    city?: string;
  }): string {
    const prov = params.provider || "GOOGLE_PLACES";
    const cat = params.category || "ALL";
    const sub = (params.subcategory || "all").trim().toLowerCase();
    const intent = params.intent || "SEARCH_PLACE";
    const query = params.normalizedQuery.trim().toLowerCase();
    const city = (params.city || "bengaluru").trim().toLowerCase();

    let locKey = "none";
    if (
      params.coordinates &&
      typeof params.coordinates.latitude === "number" &&
      typeof params.coordinates.longitude === "number"
    ) {
      // Grid coordinates to ~1 km accuracy (0.01 deg) for high cache hit rate
      locKey = `${params.coordinates.latitude.toFixed(2)},${params.coordinates.longitude.toFixed(2)}`;
    }

    return `${prov}:${cat}:${sub}:${intent}:${query}:${city}:${locKey}`;
  }

  get(key: string, ttlMs = DEFAULT_TTL_MS): CachedSearchEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  set(key: string, data: { results: SearchResultItem[]; nextPageToken: string | null; isExhausted: boolean }): void {
    if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      ...data,
      timestamp: Date.now(),
    });
  }

  has(key: string, ttlMs = DEFAULT_TTL_MS): boolean {
    return this.get(key, ttlMs) !== null;
  }

  getInFlight<T>(key: string): Promise<T> | undefined {
    return this.inFlight.get(key);
  }

  setInFlight<T>(key: string, promise: Promise<T>): void {
    this.inFlight.set(key, promise);
    promise.finally(() => {
      this.inFlight.delete(key);
    });
  }

  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
  }
}

export const planlessSearchCache = new PlanlessSearchCache();
