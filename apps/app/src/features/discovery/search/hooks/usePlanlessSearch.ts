import { useState, useEffect, useRef, useCallback } from "react";
import { DiscoveryCategory, DiscoveryItem } from "../../../../core/types/discovery";
import { SearchResultItem } from "../types/result";
import { GeoPoint } from "../types/provider";
import { ParsedQuery } from "../types/intent";
import { searchCoordinator, SearchExecutionOptions } from "../session/searchCoordinator";

export interface UsePlanlessSearchProps {
  category?: DiscoveryCategory | "ALL";
  searchQuery?: string;
  subCategoryFilter?: string;
  currentCoordinates?: GeoPoint | null;
  currentCity?: string;
  debounceMs?: number;
  enableEndlessCycling?: boolean;
}

export interface UsePlanlessSearchResult {
  isSearching: boolean;
  isLoading: boolean;
  isSearchLoading: boolean;
  searchResults: SearchResultItem[];
  items: SearchResultItem[];
  searchCoordinates: GeoPoint | null;
  activeSearchCoordinates: GeoPoint | null;
  resolvedLocationName: string | null;
  searchError: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
  sentinelRef: (node: HTMLElement | null) => void;
  cycleCount: number;
  resetPagination: () => void;
  executeSearch: (query: string, options?: SearchExecutionOptions) => Promise<SearchResultItem[]>;
  parsedQuery: ParsedQuery | null;
}

export function usePlanlessSearch(props: UsePlanlessSearchProps = {}): UsePlanlessSearchResult {
  const {
    category = "ALL",
    searchQuery = "",
    subCategoryFilter,
    currentCoordinates,
    currentCity,
    debounceMs = 300,
    enableEndlessCycling = false,
  } = props;

  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchCoordinates, setSearchCoordinates] = useState<GeoPoint | null>(null);
  const [resolvedLocationName, setResolvedLocationName] = useState<string | null>(null);
  const [cycleCount, setCycleCount] = useState(0);
  const [parsedQuery, setParsedQuery] = useState<ParsedQuery | null>(null);

  // Pool for endless scrolling if cycling is enabled
  const uniquePoolRef = useRef<SearchResultItem[]>([]);
  const cycleOffsetRef = useRef<number>(0);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Debounce search query changes
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, debounceMs);
    return () => clearTimeout(handler);
  }, [searchQuery, debounceMs]);

  // Primary execution function
  const runSearch = useCallback(
    async (queryToRun: string, extraOptions: SearchExecutionOptions = {}) => {
      setIsLoading(true);
      setSearchError(null);

      try {
        const session = await searchCoordinator.executeSearch(queryToRun, {
          category: extraOptions.category || category,
          subcategory: extraOptions.subcategory || subCategoryFilter,
          discoveryCoordinates: extraOptions.discoveryCoordinates || currentCoordinates,
          searchCoordinates: extraOptions.searchCoordinates,
          forceRefresh: extraOptions.forceRefresh,
          city: extraOptions.city || currentCity,
        });

        const isQuerySearch = Boolean(queryToRun.trim());
        setSearchResults(session.items);
        setHasMore(!session.isExhausted || (enableEndlessCycling && !isQuerySearch));
        setSearchCoordinates(session.searchCoordinates);
        setParsedQuery(session.parsedQuery);
        setSearchError(session.error);

        if (session.parsedQuery?.locationQualifier?.raw) {
          setResolvedLocationName(session.parsedQuery.locationQualifier.raw);
        } else {
          setResolvedLocationName(null);
        }

        uniquePoolRef.current = session.items;
        cycleOffsetRef.current = 0;
        setCycleCount(0);

        return session.items;
      } catch (err: any) {
        console.error("[usePlanlessSearch] Error executing search:", err);
        setSearchError(err?.message || "Search failed.");
        setSearchResults([]);
        setHasMore(false);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [category, subCategoryFilter, currentCoordinates, currentCity, enableEndlessCycling]
  );

  const prevCityRef = useRef<string | undefined>(currentCity);
  useEffect(() => {
    if (prevCityRef.current !== undefined && prevCityRef.current !== currentCity) {
      searchCoordinator.reset();
      setSearchResults([]);
      setHasMore(false);
      setCycleCount(0);
      uniquePoolRef.current = [];
      cycleOffsetRef.current = 0;
    }
    prevCityRef.current = currentCity;
  }, [currentCity]);

  // Trigger search when debouncedQuery, category, subcategory, coordinates, or city change
  useEffect(() => {
    runSearch(debouncedQuery);
  }, [debouncedQuery, category, subCategoryFilter, currentCoordinates?.latitude, currentCoordinates?.longitude, currentCity]);

  // Load next page
  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    const isQuerySearch = Boolean(debouncedQuery.trim());

    try {
      const session = await searchCoordinator.loadNextPage(
        searchCoordinator.getSessionKey(category, subCategoryFilter, currentCity)
      );

      if (session && session.items.length > searchResults.length) {
        setSearchResults(session.items);
        uniquePoolRef.current = session.items;
        setHasMore(!session.isExhausted || (enableEndlessCycling && !isQuerySearch));
      } else if (enableEndlessCycling && !isQuerySearch && uniquePoolRef.current.length > 0) {
        // Endless cycling mode: ONLY for empty-query browsing feeds when provider has exhausted real venues.
        // Recycle existing unique items seamlessly without duplicating IDs in React keys.
        const pool = uniquePoolRef.current;
        const batchSize = Math.min(8, pool.length);
        const nextBatch: SearchResultItem[] = [];

        for (let i = 0; i < batchSize; i++) {
          const itemIndex = (cycleOffsetRef.current + i) % pool.length;
          const template = pool[itemIndex];
          const newCycleNum = cycleCount + 1;
          nextBatch.push({
            ...template,
            id: `${template.id}_cycle${newCycleNum}_${i}`,
            public_id: `${template.public_id}_cycle${newCycleNum}_${i}`,
            display_order: searchResults.length + i + 1,
          });
        }

        cycleOffsetRef.current = (cycleOffsetRef.current + batchSize) % pool.length;
        setCycleCount((c) => c + 1);
        setSearchResults((prev) => [...prev, ...nextBatch]);
        setHasMore(true);
      } else {
        setHasMore(false);
      }
    } catch (err: any) {
      console.warn("[usePlanlessSearch] Error loading next page:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoading, isLoadingMore, hasMore, searchResults.length, enableEndlessCycling, cycleCount, debouncedQuery, category, subCategoryFilter]);

  // Sentinel ref for infinite scroll observer
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (!node) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            loadMore();
          }
        },
        { rootMargin: "600px 0px" }
      );

      observerRef.current.observe(node);
    },
    [loadMore]
  );

  const resetPagination = useCallback(() => {
    searchCoordinator.reset();
    setSearchResults([]);
    setHasMore(false);
    setCycleCount(0);
    uniquePoolRef.current = [];
    cycleOffsetRef.current = 0;
  }, []);

  const isSearching = Boolean(debouncedQuery.trim());

  return {
    isSearching,
    isLoading,
    isSearchLoading: isLoading,
    searchResults,
    items: searchResults,
    searchCoordinates,
    activeSearchCoordinates: searchCoordinates,
    resolvedLocationName,
    searchError,
    hasMore,
    isLoadingMore,
    loadMore,
    sentinelRef,
    cycleCount,
    resetPagination,
    executeSearch: runSearch,
    parsedQuery,
  };
}
