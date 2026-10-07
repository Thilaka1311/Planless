import { ParsedQuery } from "../types/intent";
import { GeoPoint, SearchStrategy, ProviderCandidateResult, RawCandidatePlace } from "../types/provider";
import { SearchResultItem } from "../types/result";
import { DiscoveryCategory } from "../../../../core/types/discovery";
import { understandQuery } from "../engine/queryUnderstanding";
import { routeSearchStrategy } from "../engine/strategyRouter";
import { searchProviderRegistry } from "../providers/providerRegistry";
import { normalizeCandidate } from "../engine/normalizer";
import { planlessRelevanceEngine } from "../engine/relevanceEngine";
import { intentAwareRankingEngine } from "../engine/rankingEngine";
import { planlessSearchCache } from "../cache/searchCache";
import { supabase } from "../../../../../lib/supabaseClient";
import { searchDiscoveryItems } from "../../services/discoveryQueries";
import { extractCleanPlaceId } from "../../services/venueRelevance";
import { applyPlaceOverrides, subscribePlaceOverrides, getDatabaseSportsCandidatePlaces } from "../../services/placeOverridesService";
import { isPlaceInCity, CityBoundingBox, cleanCityString } from "../../services/cityBoundary";
import { onDiscoveryLocationChange, getStoredDiscoveryLocation } from "../../hooks/useUserLocation";

export interface SearchExecutionOptions {
  category?: DiscoveryCategory | "ALL";
  subcategory?: string;
  discoveryCoordinates?: GeoPoint | null;
  searchCoordinates?: GeoPoint | null;
  pageToken?: string | null;
  forceRefresh?: boolean;
  city?: string;
  cityBounds?: CityBoundingBox | null;
}

export interface SearchSessionState {
  sessionId: string;
  requestId: number;
  sessionKey: string;
  rawQuery: string;
  parsedQuery: ParsedQuery;
  strategy: SearchStrategy;
  items: SearchResultItem[];
  nextPageToken: string | null;
  isExhausted: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  seenPlaceIds: Set<string>;
  seenPageTokens: Set<string>;
  searchCoordinates: GeoPoint | null;
}

export class SearchCoordinator {
  private activeRequestIds = new Map<string, number>();
  private sessions = new Map<string, SearchSessionState>();
  private currentSession: SearchSessionState | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        onDiscoveryLocationChange(() => {
          this.reset();
        });
      } catch {}
    }
  }

  public getSessionKey(category?: string, subcategory?: string, city?: string): string {
    const cityPart = (city || "bengaluru").trim().toLowerCase();
    return `${(category || "ALL").toUpperCase()}:${(subcategory || "all").toLowerCase()}:${cityPart}`;
  }

  /**
   * Executes a fresh search query through the decoupled search pipeline.
   */
  async executeSearch(
    rawQuery: string,
    options: SearchExecutionOptions = {}
  ): Promise<SearchSessionState> {
    const rawCat = String(options.category || "ALL").toUpperCase();
    const category: "SPORTS" | "DINING" | "ACTIVITIES" | "MOVIES" | "ALL" =
      rawCat === "SPORTS" || rawCat === "DINING" || rawCat === "ACTIVITIES" || rawCat === "MOVIES"
        ? rawCat
        : "ALL";
    const storedLoc = getStoredDiscoveryLocation();
    const targetCity = options.city || storedLoc?.city;
    const isSameCityAsStored =
      !options.city ||
      (storedLoc?.city && cleanCityString(storedLoc.city) === cleanCityString(options.city));
    const targetCityBounds =
      options.cityBounds !== undefined
        ? options.cityBounds
        : isSameCityAsStored
        ? storedLoc?.cityBounds
        : undefined;
    const sessionKey = this.getSessionKey(category, options.subcategory, targetCity);
    const requestId = (this.activeRequestIds.get(sessionKey) || 0) + 1;
    this.activeRequestIds.set(sessionKey, requestId);

    // 1. Query Understanding
    const parsedQuery = understandQuery(rawQuery, category, options.subcategory);

    // 2. Determine Search Location vs Discovery Location
    const discoveryCoords = options.discoveryCoordinates || null;
    let searchCoords = options.searchCoordinates || null;

    // Resolve explicit location query if provided ("in Koramangala", "near Indiranagar", or pure location)
    const locQuery =
      parsedQuery.locationQualifier?.raw ||
      (parsedQuery.intent === "SEARCH_LOCATION" ? parsedQuery.cleanSearchTerm : null);

    if (locQuery && !searchCoords) {
      try {
        const queryWithContext =
          locQuery.toLowerCase().includes("bengaluru") || locQuery.toLowerCase().includes("bangalore")
            ? locQuery
            : `${locQuery}, Bengaluru, India`;

        const { data: geoData } = await supabase.functions.invoke("maps", {
          body: { action: "geocode", address: queryWithContext },
        });
        let loc = geoData?.results?.[0]?.geometry?.location;
        if (!loc && queryWithContext !== locQuery) {
          const { data: directData } = await supabase.functions.invoke("maps", {
            body: { action: "geocode", address: locQuery },
          });
          loc = directData?.results?.[0]?.geometry?.location;
        }
        if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
          searchCoords = { latitude: loc.lat, longitude: loc.lng };
        }
      } catch (geoErr) {
        console.warn("[SearchCoordinator] Geocoding location failed:", geoErr);
      }
    }

    // 3. Formulate Search Strategy
    const strategy = routeSearchStrategy(parsedQuery, {
      discoveryLocation: searchCoords || discoveryCoords,
      searchLocation: searchCoords,
      category,
      subcategory: options.subcategory,
      pageToken: options.pageToken,
      city: targetCity,
      cityBounds: targetCityBounds,
    });

    const sessionId = `session_${requestId}_${Date.now()}`;
    const initialSession: SearchSessionState = {
      sessionId,
      requestId,
      sessionKey,
      rawQuery,
      parsedQuery,
      strategy,
      items: [],
      nextPageToken: null,
      isExhausted: false,
      isLoading: true,
      isLoadingMore: false,
      error: null,
      seenPlaceIds: new Set<string>(),
      seenPageTokens: new Set<string>(),
      searchCoordinates: searchCoords,
    };
    this.currentSession = initialSession;
    this.sessions.set(sessionKey, initialSession);

    // 4. Cache Check (if not forced refresh)
    const cacheKey = planlessSearchCache.buildKey({
      provider: strategy.providerType,
      category,
      subcategory: options.subcategory,
      intent: parsedQuery.intent,
      normalizedQuery: parsedQuery.normalizedQuery,
      coordinates: searchCoords || discoveryCoords,
      city: targetCity,
    });

    if (!options.forceRefresh) {
      const cached = planlessSearchCache.get(cacheKey);
      if (cached) {
        const seen = new Set<string>(cached.results.map((i) => i.place_id));
        const resolvedSession: SearchSessionState = {
          ...initialSession,
          items: cached.results,
          nextPageToken: cached.nextPageToken,
          isExhausted: cached.isExhausted,
          isLoading: false,
          seenPlaceIds: seen,
        };
        this.currentSession = resolvedSession;
        this.sessions.set(sessionKey, resolvedSession);
        return resolvedSession;
      }

      // In-flight deduplication check
      const inFlight = planlessSearchCache.getInFlight<SearchSessionState>(cacheKey);
      if (inFlight) {
        return inFlight;
      }
    }

    // 5. Provider Retrieval with Pipeline Processing
    const executionPromise = (async () => {
      try {
        const provider = searchProviderRegistry.get(strategy.providerType);
        let candidateResult: ProviderCandidateResult;
        try {
          candidateResult = await provider.search(strategy);
        } catch (providerErr) {
          console.warn("[SearchCoordinator] Provider search failed:", providerErr);
          candidateResult = { candidates: [], nextPageToken: null };
        }

        let allCandidates: RawCandidatePlace[] = [...candidateResult.candidates];

        if (category === "SPORTS") {
          // SPORTS-SPECIFIC REQUIREMENT:
          // Search from BOTH: 1. Google Places API + 2. discovery_place_overrides / database data.
          // Deduplicate using Google place_id (Google Places candidate is base, DB candidates appended).
          try {
            const dbCandidates = await getDatabaseSportsCandidatePlaces(rawQuery);
            if (dbCandidates.length > 0) {
              const seenIds = new Set<string>();
              for (const gc of candidateResult.candidates) {
                const cleanId = extractCleanPlaceId(gc.place_id || gc.id);
                if (cleanId) seenIds.add(cleanId);
              }
              for (const dc of dbCandidates) {
                const cleanId = extractCleanPlaceId(dc.place_id || dc.id);
                if (!cleanId || !seenIds.has(cleanId)) {
                  if (cleanId) seenIds.add(cleanId);
                  allCandidates.push(dc);
                }
              }
            }
          } catch (dbErr) {
            console.warn("[SearchCoordinator] Error fetching sports database candidates:", dbErr);
          }
        } else if (candidateResult.candidates.length === 0) {
          // Database fallback if provider returned 0 candidates
          try {
            const dbRecords = await searchDiscoveryItems({
              query: rawQuery,
              category: (category as any) || "ALL",
            });
            if (dbRecords && dbRecords.length > 0) {
              allCandidates = dbRecords.map((d: any) => ({
                place_id: d.place_id || d.id,
                name: d.title,
                title: d.title,
                category: d.category,
                subcategory: d.subcategory,
                description: d.description,
                types: Array.isArray(d.types) ? d.types : (d.subcategory ? [d.subcategory.toLowerCase()] : []),
                latitude: d.latitude,
                longitude: d.longitude,
                vicinity: d.place_address || d.location || "",
                formatted_address: d.place_address || d.location || "",
                rating: d.rating,
                user_ratings_total: d.user_ratings_total,
                photos: [],
                cover_image_url: d.cover_image_url,
                photo_references: d.photo_references || null,
                _raw: d,
              }));
            }
          } catch (dbErr) {
            console.warn("[SearchCoordinator] DB fallback failed:", dbErr);
          }
        }

        // Stale request guard: if another search started on this key while fetching, discard this result
        if (requestId !== this.activeRequestIds.get(sessionKey)) {
          return this.sessions.get(sessionKey) || initialSession;
        }

        // 6. Normalization
        let normalizedItems = allCandidates
          .map((c) =>
            normalizeCandidate(c, {
              discoveryCoords,
              searchCoords,
              category: (parsedQuery.categoryHint as DiscoveryCategory) || (category !== "ALL" ? (category as DiscoveryCategory) : undefined),
            })
          );

        // Apply overrides and place exclusions (is_deleted === true)
        normalizedItems = await applyPlaceOverrides(normalizedItems);

        // 7. Planless Strict Relevance Filtering, City Boundary Filtering & Deduplication
        const filteredItems = planlessRelevanceEngine.filterBatch(normalizedItems, parsedQuery);
        let relevantItems: SearchResultItem[] = [];
        const seen = new Set<string>();

        for (const item of filteredItems) {
          // FINAL SAFETY FILTER: Place must strictly be inside the target discovery city boundary
          if (targetCity && !isPlaceInCity(item, targetCity, targetCityBounds)) {
            continue;
          }
          if (!seen.has(item.place_id)) {
            seen.add(item.place_id);
            relevantItems.push(item);
          }
        }

        // Auto-pagination if provider page returned candidates but all were rejected as irrelevant or outside city
        let currentNextPageToken = candidateResult.nextPageToken || null;
        let fetchAttempts = 0;

        while (relevantItems.length === 0 && candidateResult.candidates.length > 0 && currentNextPageToken && fetchAttempts < 3) {
          fetchAttempts++;
          const nextStrategy = { ...strategy, pageToken: currentNextPageToken };
          const nextPageResult = await provider.search(nextStrategy);
          currentNextPageToken = nextPageResult.nextPageToken || null;

          let nextNormalized = nextPageResult.candidates
            .map((c) =>
              normalizeCandidate(c, {
                discoveryCoords,
                searchCoords,
                category: (parsedQuery.categoryHint as DiscoveryCategory) || (category !== "ALL" ? (category as DiscoveryCategory) : undefined),
              })
            );
          nextNormalized = await applyPlaceOverrides(nextNormalized);
          const nextRelevant = planlessRelevanceEngine.filterBatch(nextNormalized, parsedQuery);

          for (const item of nextRelevant) {
            if (!isPlaceInCity(item, targetCity, targetCityBounds)) {
              continue;
            }
            if (!seen.has(item.place_id)) {
              seen.add(item.place_id);
              relevantItems.push(item);
            }
          }
        }

        // 8. Intent-Aware Ranking
        const rankedItems = intentAwareRankingEngine.rank(relevantItems, parsedQuery);

        // 9. Update Cache
        const isExhausted = !currentNextPageToken || rankedItems.length === 0;
        planlessSearchCache.set(cacheKey, {
          results: rankedItems,
          nextPageToken: currentNextPageToken,
          isExhausted,
        });

        const finalSession: SearchSessionState = {
          sessionId,
          requestId,
          sessionKey,
          rawQuery,
          parsedQuery,
          strategy,
          items: rankedItems,
          nextPageToken: currentNextPageToken,
          isExhausted,
          isLoading: false,
          isLoadingMore: false,
          error: null,
          seenPlaceIds: seen,
          seenPageTokens: strategy.pageToken ? new Set<string>([strategy.pageToken]) : new Set<string>(),
          searchCoordinates: candidateResult.searchCoordinates || searchCoords,
        };

        if (requestId === this.activeRequestIds.get(sessionKey)) {
          this.currentSession = finalSession;
          this.sessions.set(sessionKey, finalSession);
        }

        return finalSession;
      } catch (err: any) {
        console.error("[SearchCoordinator] Execution error:", err);
        const errorSession: SearchSessionState = {
          ...initialSession,
          isLoading: false,
          error: err?.message || "Search failed. Please try again.",
        };
        if (requestId === this.activeRequestIds.get(sessionKey)) {
          this.currentSession = errorSession;
          this.sessions.set(sessionKey, errorSession);
        }
        return errorSession;
      }
    })();

    planlessSearchCache.setInFlight(cacheKey, executionPromise);
    return executionPromise;
  }

  /**
   * Loads the next batch of results for the given session or current active session.
   */
  async loadNextPage(sessionKeyOrCategory?: string): Promise<SearchSessionState | null> {
    const targetKey = sessionKeyOrCategory
      ? (this.sessions.has(sessionKeyOrCategory) ? sessionKeyOrCategory : this.getSessionKey(sessionKeyOrCategory))
      : this.currentSession?.sessionKey;

    const session = targetKey ? this.sessions.get(targetKey) : this.currentSession;
    if (!session) return null;
    if (session.isLoading || session.isLoadingMore || session.isExhausted || !session.nextPageToken) {
      return session;
    }

    const requestedToken = session.nextPageToken;
    if (!session.seenPageTokens) {
      session.seenPageTokens = new Set<string>();
    }
    if (!requestedToken || session.seenPageTokens.has(requestedToken)) {
      session.isExhausted = true;
      session.nextPageToken = null;
      return session;
    }
    session.seenPageTokens.add(requestedToken);

    session.isLoadingMore = true;
    const currentRequestId = session.requestId;

    try {
      const provider = searchProviderRegistry.get(session.strategy.providerType);
      const nextStrategy: SearchStrategy = {
        ...session.strategy,
        pageToken: requestedToken,
      };

      const pageResult = await provider.search(nextStrategy);

      // Stale request guard
      if (currentRequestId !== this.activeRequestIds.get(session.sessionKey)) {
        return this.sessions.get(session.sessionKey) || session;
      }

      const discoveryCoords = session.strategy.locationBias
        ? {
            latitude: session.strategy.locationBias.latitude,
            longitude: session.strategy.locationBias.longitude,
          }
        : null;

      let normalized = pageResult.candidates
        .map((c) =>
          normalizeCandidate(c, {
            discoveryCoords,
            searchCoords: session.searchCoordinates,
            category: (session.parsedQuery.categoryHint as DiscoveryCategory) || (session.strategy.category !== "ALL" ? (session.strategy.category as DiscoveryCategory) : "DINING"),
          })
        );
      normalized = await applyPlaceOverrides(normalized);

      const relevant = planlessRelevanceEngine.filterBatch(normalized, session.parsedQuery);

      const storedLoc = getStoredDiscoveryLocation();
      const sessionCity = session.strategy.city || storedLoc?.city;
      const isSameCitySession =
        !session.strategy.city ||
        (storedLoc?.city && cleanCityString(storedLoc.city) === cleanCityString(session.strategy.city));
      const sessionBounds =
        session.strategy.cityBounds !== undefined
          ? session.strategy.cityBounds
          : isSameCitySession
          ? storedLoc?.cityBounds
          : undefined;

      // Deduplicate against seen IDs and verify city boundary
      const newItems: SearchResultItem[] = [];
      for (const item of relevant) {
        if (sessionCity && !isPlaceInCity(item, sessionCity, sessionBounds)) {
          continue;
        }
        if (!session.seenPlaceIds.has(item.place_id)) {
          session.seenPlaceIds.add(item.place_id);
          newItems.push(item);
        }
      }

      // If page yielded 0 new unique relevant items (duplicate or filtered), attempt to fetch the subsequent page
      let currentToken = pageResult.nextPageToken || null;
      let loadAttempts = 0;

      while (
        newItems.length === 0 &&
        currentToken &&
        !session.seenPageTokens.has(currentToken) &&
        loadAttempts < 3
      ) {
        loadAttempts++;
        session.seenPageTokens.add(currentToken);
        const nextStrategy: SearchStrategy = {
          ...session.strategy,
          pageToken: currentToken,
        };
        const nextResult = await provider.search(nextStrategy);
        currentToken = nextResult.nextPageToken || null;

        let nextNorm = nextResult.candidates
          .map((c) =>
            normalizeCandidate(c, {
              discoveryCoords,
              searchCoords: session.searchCoordinates,
              category: (session.parsedQuery.categoryHint as DiscoveryCategory) || (session.strategy.category !== "ALL" ? (session.strategy.category as DiscoveryCategory) : "DINING"),
            })
          );
        nextNorm = await applyPlaceOverrides(nextNorm);
        const nextRel = planlessRelevanceEngine.filterBatch(nextNorm, session.parsedQuery);
        for (const item of nextRel) {
          if (!isPlaceInCity(item, sessionCity, sessionBounds)) {
            continue;
          }
          if (!session.seenPlaceIds.has(item.place_id)) {
            session.seenPlaceIds.add(item.place_id);
            newItems.push(item);
          }
        }
      }

      // Score and rank only genuinely new items
      if (newItems.length > 0) {
        const rankedNewItems = intentAwareRankingEngine.rank(newItems, session.parsedQuery);
        const startIndex = session.items.length;
        const numberedNewItems = rankedNewItems.map((item, index) => {
          item.display_order = startIndex + index + 1;
          return item;
        });
        session.items = [...session.items, ...numberedNewItems];
      }

      const isExhausted =
        !currentToken ||
        session.seenPageTokens.has(currentToken) ||
        (newItems.length === 0 && !currentToken);

      session.nextPageToken = !isExhausted ? currentToken : null;
      session.isExhausted = isExhausted;
      session.isLoadingMore = false;

      return session;
    } catch (err: any) {
      console.warn("[SearchCoordinator] loadNextPage error:", err);
      session.isLoadingMore = false;
      return session;
    }
  }

  public purgeDeletedPlace(cleanId: string): void {
    const targetClean = extractCleanPlaceId(cleanId);
    this.sessions.forEach((session) => {
      session.items = session.items.filter(
        (item) => extractCleanPlaceId(item.place_id || item.id) !== targetClean
      );
      session.seenPlaceIds.delete(targetClean);
      session.seenPlaceIds.delete(cleanId);
    });
    if (this.currentSession) {
      this.currentSession.items = this.currentSession.items.filter(
        (item) => extractCleanPlaceId(item.place_id || item.id) !== targetClean
      );
      this.currentSession.seenPlaceIds.delete(targetClean);
      this.currentSession.seenPlaceIds.delete(cleanId);
    }
  }

  getCurrentSession(sessionKeyOrCategory?: string): SearchSessionState | null {
    if (sessionKeyOrCategory) {
      const key = this.sessions.has(sessionKeyOrCategory)
        ? sessionKeyOrCategory
        : this.getSessionKey(sessionKeyOrCategory);
      return this.sessions.get(key) || null;
    }
    return this.currentSession;
  }

  reset(sessionKeyOrCategory?: string): void {
    if (sessionKeyOrCategory) {
      const key = this.sessions.has(sessionKeyOrCategory)
        ? sessionKeyOrCategory
        : this.getSessionKey(sessionKeyOrCategory);
      this.sessions.delete(key);
      const curr = this.activeRequestIds.get(key) || 0;
      this.activeRequestIds.set(key, curr + 1);
    } else {
      this.activeRequestIds.clear();
      this.sessions.clear();
      this.currentSession = null;
    }
  }
}

export const searchCoordinator = new SearchCoordinator();

// Subscribe to real-time place overrides & exclusions
subscribePlaceOverrides(({ action, placeId }) => {
  planlessSearchCache.clear();
  if (action === "hide") {
    searchCoordinator.purgeDeletedPlace(placeId);
  }
});
