import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ArrowLeft, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { DiscoverySection as DiscoverySectionType, DiscoveryItem } from "../../../core/types/discovery";
import { PlacePreviewSheet } from "../components/PlacePreviewSheet";
import {
  fetchDiscoverMovies,
  searchMovies,
  getCachedMovieSection,
  TMDB_LANGUAGE_NAMES,
  isMovieReleased2026OrLater,
  hasValidTmdbPoster,
} from "../services/tmdbMovieService";
import { ADMIN_CONFIGS } from "../services/discoveryAdminService";
import { SearchBar } from "../../../shared/components/SearchBar";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { EndOfFeedIndicator } from "../components/EndOfFeedIndicator";
import { useDiscoverySeenTracker } from "../hooks/useDiscoverySeenTracker";
import { BackToTopButton } from "../components/BackToTopButton";


interface DiscoverMoviesProps {
  sections?: DiscoverySectionType[];
  isAdmin?: boolean;
  onBack: () => void;
  onSelectDiscoveryItem: (item: DiscoveryItem) => void;
  onLongPressAdmin?: (item: DiscoveryItem, config: any) => void;
  currentCity?: string;
  currentLocality?: string;
  currentCoordinates?: { latitude: number; longitude: number };
  initialHasMore?: boolean;
}

import { MoviePortraitCard } from "../components/MoviePortraitCard";
import type { MoviePortraitCardProps } from "../components/MoviePortraitCard";
export { MoviePortraitCard };
export type { MoviePortraitCardProps };

export const MovieGridSkeleton: React.FC = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pointer-events-none select-none">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <div
        key={i}
        className="flex flex-col rounded-2xl overflow-hidden bg-[#121216] border border-white/[0.06] animate-pulse"
      >
        <div className="w-full aspect-[2/3] bg-white/[0.04]" />
        <div className="p-2.5 space-y-2">
          <div className="h-3.5 w-3/4 bg-white/[0.07] rounded" />
          <div className="h-3 w-1/2 bg-white/[0.04] rounded" />
        </div>
      </div>
    ))}
  </div>
);

export const DiscoverMovies: React.FC<DiscoverMoviesProps> = ({
  sections = [],
  isAdmin: propIsAdmin = false,
  onBack,
  onSelectDiscoveryItem,
  onLongPressAdmin,
  currentCity = "India",
  currentLocality,
  currentCoordinates,
  initialHasMore,
}) => {
  const { isAdmin: storeIsAdmin } = useProfileStore();
  const isAdmin = Boolean(propIsAdmin || storeIsAdmin);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() =>
    typeof initialHasMore === "boolean" ? initialHasMore : true
  );

  // Pre-load from sections or localStorage cache for instant zero-flash render (filtered to >= 2026-01-01 and valid poster)
  const [movies, setMovies] = useState<DiscoveryItem[]>(() => {
    const rawMovies = (sections || [])
      .filter((s) => s.category?.toUpperCase() === "MOVIES")
      .flatMap((s) => s.items || [])
      .filter((m) => isMovieReleased2026OrLater(m.release_date) && hasValidTmdbPoster(m));
    if (rawMovies.length > 0) return rawMovies;
    return getCachedMovieSection("discover_now_playing_lall_p1_gall").filter((m) =>
      isMovieReleased2026OrLater(m.release_date) && hasValidTmdbPoster(m)
    );
  });
  const [searchResults, setSearchResults] = useState<DiscoveryItem[]>([]);

  const [isLoadingFeeds, setIsLoadingFeeds] = useState(() => {
    if (typeof initialHasMore === "boolean" && !initialHasMore) return false;
    const rawMovies = (sections || [])
      .filter((s) => s.category?.toUpperCase() === "MOVIES")
      .flatMap((s) => s.items || [])
      .filter((m) => isMovieReleased2026OrLater(m.release_date) && hasValidTmdbPoster(m));
    if (rawMovies.length > 0) return false;
    return (
      getCachedMovieSection("discover_now_playing_lall_p1_gall").filter((m) =>
        isMovieReleased2026OrLater(m.release_date) && hasValidTmdbPoster(m)
      ).length === 0
    );
  });
  const [loadError, setLoadError] = useState<string | null>(null);

  const [previewItem, setPreviewItem] = useState<DiscoveryItem | null>(null);
  const [adminEditTarget, setAdminEditTarget] = useState<DiscoveryItem | null>(null);

  // Pagination refs for movie feed
  const pageRef = useRef<number>(1);
  const totalPagesRef = useRef<number>(10);
  const seenIdsRef = useRef<Set<string>>(
    new Set(movies.map((m) => (m.id || m.public_id) as string).filter(Boolean))
  );

  const searchPageRef = useRef<number>(1);
  const searchTotalPagesRef = useRef<number>(1);
  const searchSeenIdsRef = useRef<Set<string>>(new Set());

  const isMountedRef = useRef(true);
  const activeLoadIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Search debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Execute Search across TMDB movies (strictly 2026 or later)
  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      searchPageRef.current = 1;
      searchTotalPagesRef.current = 1;
      searchSeenIdsRef.current.clear();
      setHasMore(pageRef.current < totalPagesRef.current);
      return;
    }

    let active = true;
    setIsSearching(true);
    searchPageRef.current = 1;
    searchTotalPagesRef.current = 1;
    searchSeenIdsRef.current.clear();
    setHasMore(true);

    searchMovies(debouncedQuery, 1, "all")
      .then((res) => {
        if (!active) return;
        const movieItems = (res.items || []).filter((m) =>
          isMovieReleased2026OrLater(m.release_date) && hasValidTmdbPoster(m)
        );
        const seen = new Set<string>();
        const deduped: DiscoveryItem[] = [];
        for (const item of movieItems) {
          const key = item.id || item.public_id;
          if (key && !seen.has(key)) {
            seen.add(key);
            deduped.push(item);
          }
        }
        searchSeenIdsRef.current = seen;
        setSearchResults(deduped);
        const total = res.totalPages || 1;
        searchTotalPagesRef.current = total;
        setHasMore(1 < total && deduped.length > 0);
        setIsSearching(false);
      })
      .catch((err) => {
        console.error("[DiscoverMovies] Search error:", err);
        if (active) {
          setSearchResults([]);
          setHasMore(false);
          setIsSearching(false);
        }
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  // Load Primary Movie Catalogue (strictly 2026 or later)
  const loadCatalogue = useCallback(async () => {
    if (typeof initialHasMore === "boolean" && !initialHasMore) return;
    const currentLoadId = ++activeLoadIdRef.current;
    setLoadError(null);
    setIsLoadingFeeds(true);
    pageRef.current = 1;
    totalPagesRef.current = 10;
    setHasMore(true);

    try {
      const res = await fetchDiscoverMovies("now_playing", 1, undefined, "all");
      if (!isMountedRef.current || activeLoadIdRef.current !== currentLoadId) {
        return;
      }

      const filtered = (res.items || []).filter((m) =>
        isMovieReleased2026OrLater(m.release_date) && hasValidTmdbPoster(m)
      );

      const localSeen = new Set<string>();
      const uniqueMovies: DiscoveryItem[] = [];
      filtered.forEach((m) => {
        const key = m.id || m.public_id;
        if (key && !localSeen.has(key)) {
          localSeen.add(key);
          uniqueMovies.push(m);
        }
      });

      if (res.totalPages) {
        totalPagesRef.current = res.totalPages;
      }

      if (uniqueMovies.length > 0) {
        seenIdsRef.current = localSeen;
        setMovies(uniqueMovies);
        setLoadError(null);
        setHasMore(1 < totalPagesRef.current);
      } else {
        setMovies((prev) => {
          if (prev.length > 0) {
            return prev;
          }
          setLoadError("Unable to load movies. Tap below to retry.");
          setHasMore(false);
          return [];
        });
      }
    } catch (err: any) {
      if (!isMountedRef.current || activeLoadIdRef.current !== currentLoadId) return;
      console.error("[DiscoverMovies] Error loading movie catalogue:", err);
      setMovies((prev) => {
        if (prev.length === 0) {
          setLoadError("Failed to load movies. Tap below to retry.");
          setHasMore(false);
        }
        return prev;
      });
    } finally {
      if (isMountedRef.current && activeLoadIdRef.current === currentLoadId) {
        setIsLoadingFeeds(false);
      }
    }
  }, [initialHasMore]);

  useEffect(() => {
    loadCatalogue();
  }, [loadCatalogue]);

  // Re-check catalogue on window focus if feed is empty or in error state
  useEffect(() => {
    const handleFocus = () => {
      if (movies.length === 0 && !isLoadingFeeds && !isSearching && !debouncedQuery) {
        loadCatalogue();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [movies.length, isLoadingFeeds, isSearching, debouncedQuery, loadCatalogue]);

  // Pagination loader (strictly no looping/cycling)
  const loadMoreMovies = useCallback(async () => {
    if (isLoadingFeeds || isLoadingMore || !hasMore) return;

    if (debouncedQuery.trim()) {
      if (searchPageRef.current >= searchTotalPagesRef.current) {
        setHasMore(false);
        return;
      }

      setIsLoadingMore(true);
      try {
        const nextSearchPage = searchPageRef.current + 1;
        const res = await searchMovies(debouncedQuery, nextSearchPage, "all");
        const nextMovieItems = (res.items || []).filter((m) =>
          isMovieReleased2026OrLater(m.release_date) && hasValidTmdbPoster(m)
        );

        const newItems: DiscoveryItem[] = [];
        for (const item of nextMovieItems) {
          const key = item.id || item.public_id;
          if (key && !searchSeenIdsRef.current.has(key)) {
            searchSeenIdsRef.current.add(key);
            newItems.push(item);
          }
        }

        searchPageRef.current = nextSearchPage;
        if (res.totalPages) {
          searchTotalPagesRef.current = res.totalPages;
        }

        if (newItems.length > 0) {
          setSearchResults((prev) => [...prev, ...newItems]);
        }

        if (
          nextSearchPage >= searchTotalPagesRef.current ||
          (newItems.length === 0 && nextSearchPage >= (res.totalPages || searchTotalPagesRef.current))
        ) {
          setHasMore(false);
        }
      } catch (err) {
        console.warn("[DiscoverMovies] Error loading more search results:", err);
      } finally {
        setIsLoadingMore(false);
      }
      return;
    }

    // Catalogue pagination (no query)
    if (pageRef.current >= totalPagesRef.current) {
      setHasMore(false);
      return;
    }

    setIsLoadingMore(true);
    try {
      let currentPage = pageRef.current;
      let newBatch: DiscoveryItem[] = [];
      const maxLookaheadPages = 3;
      let lookaheadCount = 0;

      while (
        newBatch.length === 0 &&
        currentPage < totalPagesRef.current &&
        lookaheadCount < maxLookaheadPages
      ) {
        currentPage += 1;
        lookaheadCount += 1;
        const res = await fetchDiscoverMovies("now_playing", currentPage, undefined, "all");
        if (res.totalPages) {
          totalPagesRef.current = res.totalPages;
        }

        const validMovies = (res.items || []).filter((m) =>
          isMovieReleased2026OrLater(m.release_date) && hasValidTmdbPoster(m)
        );

        for (const m of validMovies) {
          const key = m.id || m.public_id;
          if (key && !seenIdsRef.current.has(key)) {
            seenIdsRef.current.add(key);
            newBatch.push(m);
          }
        }
      }

      pageRef.current = currentPage;

      if (newBatch.length > 0) {
        setMovies((prev) => [...prev, ...newBatch]);
      }

      if (
        currentPage >= totalPagesRef.current ||
        (newBatch.length === 0 && lookaheadCount >= maxLookaheadPages)
      ) {
        setHasMore(false);
      }
    } catch (err) {
      console.warn("[DiscoverMovies] Error loading more movies:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [debouncedQuery, isLoadingFeeds, isLoadingMore, hasMore]);

  // Auto-prefetch sentinel using IntersectionObserver
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef(loadMoreMovies);
  loadMoreRef.current = loadMoreMovies;

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (!hasMore || isLoadingFeeds || isLoadingMore) {
        return;
      }

      if (node && typeof IntersectionObserver !== "undefined") {
        observerRef.current = new IntersectionObserver(
          (entries) => {
            const first = entries[0];
            if (first && first.isIntersecting) {
              loadMoreRef.current();
            }
          },
          {
            root: null,
            rootMargin: "300px",
            threshold: 0,
          }
        );
        observerRef.current.observe(node);
      }
    },
    [hasMore, isLoadingFeeds, isLoadingMore]
  );

  // When searching, show searchResults. Otherwise show catalogue. Both filtered to 2026 or later and valid poster.
  const displayedMovies = useMemo(() => {
    if (debouncedQuery) {
      return searchResults.filter((m) => isMovieReleased2026OrLater(m.release_date) && hasValidTmdbPoster(m));
    }
    return movies.filter((m) => isMovieReleased2026OrLater(m.release_date) && hasValidTmdbPoster(m));
  }, [debouncedQuery, searchResults, movies]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const displayedMovieIds = useMemo(
    () => displayedMovies.map((m) => (m.id || m.public_id) as string).filter(Boolean),
    [displayedMovies]
  );

  useDiscoverySeenTracker({
    category: "movies",
    containerRef: scrollContainerRef,
    itemIds: displayedMovieIds,
  });

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 flex flex-col h-full bg-[#000000] overflow-y-auto no-scrollbar pb-6 pb-[env(safe-area-inset-bottom,16px)] text-left select-none"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      <BackToTopButton scrollContainerRef={scrollContainerRef} />

      {/* ── 1. HEADER BAR ── */}
      <div className="w-full shrink-0 px-5 pt-[env(safe-area-inset-top,0px)] bg-black border-b border-white/[0.06]">
        <div className="py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="text-white hover:text-zinc-300 active:scale-95 transition cursor-pointer p-1 -ml-1 flex items-center justify-center"
              aria-label="Back"
            >
              <ArrowLeft className="w-6 h-6 text-white" />
            </button>
            <div className="flex flex-col text-left">
              <h2 className="text-base font-bold text-white tracking-tight leading-tight">
                Movies
              </h2>
              <span className="text-[11px] text-violet-400 font-medium mt-0.5 leading-none">
                Latest & Popular
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. SEARCH BAR ── */}
      <div className="shrink-0 bg-[#000000] px-4 pt-2 pb-1.5 select-none">
        <SearchBar
          id="search-movies-input"
          name="searchMoviesInput"
          placeholder="Search movies, titles, genres..."
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

      {/* ── 3. SINGLE MOVIE SECTION HEADER (Reclaims vertical space directly) ── */}
      <div className="px-5 pt-3 pb-2 text-left shrink-0">
        <h3 className="text-sm font-bold text-white tracking-wide">
          {debouncedQuery ? "Search Results" : "Latest Movies"}
        </h3>
      </div>

      {/* ── 4. COMPACT TWO-COLUMN MOVIE GRID ── */}
      <div className="flex-1 px-5 pt-1 pb-8">
        {/* Loading state */}
        {isSearching || (isLoadingFeeds && displayedMovies.length === 0) ? (
          <MovieGridSkeleton />
        ) : loadError && displayedMovies.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-400/80" />
            <p className="text-zinc-300 text-sm font-medium">{loadError}</p>
            <button
              type="button"
              onClick={loadCatalogue}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition active:scale-95 cursor-pointer shadow-lg"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        ) : displayedMovies.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {displayedMovies.map((item, idx) => (
              <MoviePortraitCard
                key={`${item.id || item.public_id || "m"}_${idx}`}
                item={item}
                onTap={() => setPreviewItem(item)}
                isAdmin={isAdmin}
                onLongPressAdmin={
                  isAdmin
                    ? () => {
                        setAdminEditTarget(item);
                        if (onLongPressAdmin) onLongPressAdmin(item, ADMIN_CONFIGS.movies);
                      }
                    : undefined
                }
              />
            ))}

            {/* Endless Scroll Sentinel & Bottom Loading / End of List Indicator */}
            {hasMore && (
              <div ref={sentinelRef} className="h-6 w-full pointer-events-none col-span-full" />
            )}

            {isLoadingMore && (
              <div className="flex items-center justify-center py-6 gap-2 text-zinc-400 col-span-full">
                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                <span className="text-xs font-medium">Loading more movies...</span>
              </div>
            )}

            {!hasMore && !isLoadingMore && !isLoadingFeeds && !loadError && displayedMovies.length > 0 && (
              <EndOfFeedIndicator className="col-span-full" />
            )}
          </div>
        ) : debouncedQuery ? (
          <div className="px-6 py-16 text-center space-y-2">
            <p className="text-zinc-300 text-sm font-medium">
              No 2026 movies found matching your search.
            </p>
            <p className="text-zinc-500 text-xs">
              Try searching for another movie title.
            </p>
          </div>
        ) : (
          <div className="py-16 text-center space-y-2">
            <p className="text-zinc-400 text-sm font-medium">
              No 2026 movies found.
            </p>
            <p className="text-zinc-600 text-xs">
              Check back soon for new releases.
            </p>
          </div>
        )}

      </div>

      {/* ── 5. PLACE PREVIEW SHEET ── */}
      {previewItem && (
        <PlacePreviewSheet
          item={previewItem}
          userCoordinates={currentCoordinates}
          onClose={() => setPreviewItem(null)}
          onConfirmPlan={(item) => {
            setPreviewItem(null);
            onSelectDiscoveryItem(item);
          }}
        />
      )}
    </div>
  );
};
