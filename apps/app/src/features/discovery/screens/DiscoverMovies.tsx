import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ArrowLeft, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { DiscoverySection as DiscoverySectionType, DiscoveryItem } from "../../../core/types/discovery";
import { PlacePreviewSheet } from "../components/PlacePreviewSheet";
import {
  fetchDiscoverMovies,
  searchMovies,
  getCachedMovieSection,
  TMDB_LANGUAGE_NAMES,
  isMovieWithinSixMonths,
} from "../services/tmdbMovieService";
import { ADMIN_CONFIGS } from "../services/discoveryAdminService";
import { useLongPress } from "../../../shared/hooks/useLongPress";
import { SearchBar } from "../../../shared/components/SearchBar";
import { useProfileStore } from "../../profile/state/ProfileContext";


interface DiscoverMoviesProps {
  sections?: DiscoverySectionType[];
  isAdmin?: boolean;
  onBack: () => void;
  onSelectDiscoveryItem: (item: DiscoveryItem) => void;
  onLongPressAdmin?: (item: DiscoveryItem, config: any) => void;
  currentCity?: string;
  currentLocality?: string;
  currentCoordinates?: { latitude: number; longitude: number };
}

const LANGUAGE_FILTERS = [
  { id: "all", label: "All" },
  { id: "en", label: "English" },
  { id: "hi", label: "Hindi" },
  { id: "ta", label: "Tamil" },
  { id: "te", label: "Telugu" },
  { id: "kn", label: "Kannada" },
] as const;

/**
 * MoviePortraitCard
 * Dedicated portrait-oriented card with complete 2:3 aspect ratio poster presentation.
 * Formatted cleanly for a compact 2-column mobile grid matching the reference design.
 */
interface MoviePortraitCardProps {
  item: DiscoveryItem;
  onTap: () => void;
  isAdmin?: boolean;
  onLongPressAdmin?: () => void;
}

export const MoviePortraitCard: React.FC<MoviePortraitCardProps> = ({
  item,
  onTap,
}) => {
  const effectiveItem = item;


  const langLabel =
    effectiveItem.language_name ||
    (effectiveItem.original_language
      ? TMDB_LANGUAGE_NAMES[effectiveItem.original_language.toLowerCase()] || effectiveItem.original_language.toUpperCase()
      : "");

  const releaseYear = effectiveItem.release_date
    ? new Date(effectiveItem.release_date).getFullYear().toString()
    : "";

  return (
    <div
      onClick={onTap}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "pan-x pan-y",
      }}
      className="group relative flex flex-col rounded-2xl overflow-hidden bg-[#121216] border border-white/[0.08] shadow-md hover:border-white/20 active:brightness-95 transition-all duration-200 cursor-pointer select-none"
    >
      {/* 1. Portrait Poster Area (Exact 2:3 ratio ensuring the entire poster is visible) - Display only */}
      <div
        className="relative w-full aspect-[2/3] overflow-hidden bg-[#0a0a0d] shrink-0 pointer-events-none select-none"
        style={{ userSelect: "none", WebkitUserSelect: "none", pointerEvents: "none" }}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img
          src={effectiveItem.cover_image_url || "/assets/plan-covers/movie.png"}
          alt={effectiveItem.title}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none select-none"
          loading="lazy"
          style={{
            pointerEvents: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = "/assets/plan-covers/movie.png";
          }}
        />
      </div>

      {/* 2. Structured Information Section - Display only, parent card handles click & hold */}
      <div
        className="p-2.5 flex flex-col justify-between flex-1 min-w-0 text-left bg-[#121216] pointer-events-none select-none"
        style={{ userSelect: "none", WebkitUserSelect: "none", pointerEvents: "none" }}
      >
        {/* Movie Title (max 2 lines with consistent min-height for uniform card alignment) */}
        <h4 className="text-[13px] font-bold text-white tracking-tight leading-snug line-clamp-2 min-h-[34px] group-hover:text-violet-300 transition-colors select-none">
          {effectiveItem.title}
        </h4>

        {/* Language and Release Year */}
        <div className="pt-1.5 flex items-center justify-between text-[11px] min-w-0 select-none">
          {langLabel ? (
            <span className="text-zinc-300 font-medium truncate text-[11px] select-none">
              {langLabel}
            </span>
          ) : (
            <div />
          )}
          {releaseYear && (
            <span className="text-zinc-500 font-normal text-[11px] shrink-0 select-none">
              {releaseYear}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const DiscoverMovies: React.FC<DiscoverMoviesProps> = ({
  isAdmin: propIsAdmin = false,
  onBack,
  onSelectDiscoveryItem,
  onLongPressAdmin,
  currentCity = "India",
  currentLocality,
  currentCoordinates,
}) => {
  const { isAdmin: storeIsAdmin } = useProfileStore();
  const isAdmin = Boolean(propIsAdmin || storeIsAdmin);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [cycleCount, setCycleCount] = useState<number>(1);

  // Pre-load from localStorage cache for instant zero-flash render (filtered to <= 6 months)
  const [movies, setMovies] = useState<DiscoveryItem[]>(() =>
    getCachedMovieSection("discover_now_playing_lall_p1_gall").filter((m) =>
      isMovieWithinSixMonths(m.release_date)
    )
  );
  const [searchResults, setSearchResults] = useState<DiscoveryItem[]>([]);

  const [isLoadingFeeds, setIsLoadingFeeds] = useState(() => {
    return getCachedMovieSection("discover_now_playing_lall_p1_gall").length === 0;
  });
  const [loadError, setLoadError] = useState<string | null>(null);

  const [previewItem, setPreviewItem] = useState<DiscoveryItem | null>(null);
  const [adminEditTarget, setAdminEditTarget] = useState<DiscoveryItem | null>(null);

  const activeLanguageLabel =
    selectedLanguage !== "all" ? TMDB_LANGUAGE_NAMES[selectedLanguage] || selectedLanguage : null;

  // Pagination refs for endless movie feed
  const pageRef = useRef<number>(1);
  const totalPagesRef = useRef<number>(10);
  const uniquePoolRef = useRef<DiscoveryItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const cycleCountRef = useRef<number>(1);
  const searchPageRef = useRef<number>(1);
  const searchUniquePoolRef = useRef<DiscoveryItem[]>([]);
  const searchSeenIdsRef = useRef<Set<string>>(new Set());
  const searchCycleCountRef = useRef<number>(1);

  // Independent state cache per language filter
  const languageStateCache = useRef<
    Map<
      string,
      {
        items: DiscoveryItem[];
        uniquePool: DiscoveryItem[];
        seenIds: Set<string>;
        page: number;
        totalPages: number;
        cycleCount: number;
      }
    >
  >(new Map());

  // Search debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Execute Search across TMDB movies and places database
  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      searchPageRef.current = 1;
      searchUniquePoolRef.current = [];
      searchSeenIdsRef.current.clear();
      searchCycleCountRef.current = 1;
      return;
    }

    let active = true;
    setIsSearching(true);
    searchPageRef.current = 1;
    searchUniquePoolRef.current = [];
    searchSeenIdsRef.current.clear();
    searchCycleCountRef.current = 1;

    searchMovies(debouncedQuery, 1, selectedLanguage)
      .then((res) => {
        if (!active) return;
        const movieItems = res.items || [];
        const seen = new Set<string>();
        const deduped: DiscoveryItem[] = [];
        for (const item of movieItems) {
          const key = item.id || item.public_id;
          if (key && !seen.has(key)) {
            seen.add(key);
            deduped.push(item);
            searchSeenIdsRef.current.add(key);
            searchUniquePoolRef.current.push(item);
          }
        }
        setSearchResults(deduped);
        setIsSearching(false);
      })
      .catch((err) => {
        console.error("[DiscoverMovies] Search error:", err);
        if (active) {
          setSearchResults([]);
          setIsSearching(false);
        }
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery, selectedLanguage]);

  // Load Primary Movie Catalogue (strictly <= 6 months from current date)
  const loadCatalogue = useCallback(async () => {
    // Check if state is already cached for this language tab to restore immediately
    const cached = languageStateCache.current.get(selectedLanguage);
    if (cached && cached.items.length > 0) {
      setMovies(cached.items);
      pageRef.current = cached.page;
      totalPagesRef.current = cached.totalPages;
      uniquePoolRef.current = cached.uniquePool;
      seenIdsRef.current = cached.seenIds;
      cycleCountRef.current = cached.cycleCount;
      setCycleCount(cached.cycleCount);
      setIsLoadingFeeds(false);
      return;
    }

    setLoadError(null);
    setIsLoadingFeeds(true);
    pageRef.current = 1;
    totalPagesRef.current = 10;
    uniquePoolRef.current = [];
    seenIdsRef.current.clear();
    cycleCountRef.current = 1;
    setCycleCount(1);

    try {
      const res = await fetchDiscoverMovies("now_playing", 1, undefined, selectedLanguage);
      const filtered = (res.items || []).filter((m) =>
        isMovieWithinSixMonths(m.release_date)
      );

      filtered.forEach((m) => {
        const key = m.id || m.public_id;
        if (key && !seenIdsRef.current.has(key)) {
          seenIdsRef.current.add(key);
          uniquePoolRef.current.push(m);
        }
      });

      if (res.totalPages) {
        totalPagesRef.current = res.totalPages;
      }

      setMovies(filtered);
      languageStateCache.current.set(selectedLanguage, {
        items: filtered,
        uniquePool: [...uniquePoolRef.current],
        seenIds: new Set(seenIdsRef.current),
        page: 1,
        totalPages: totalPagesRef.current,
        cycleCount: 1,
      });
    } catch (err: any) {
      console.error("[DiscoverMovies] Error loading movie catalogue:", err);
      setLoadError("Failed to load movies. Tap below to retry.");
    } finally {
      setIsLoadingFeeds(false);
    }
  }, [selectedLanguage]);

  useEffect(() => {
    loadCatalogue();
  }, [loadCatalogue]);

  // Endless pagination loader
  const loadMoreMovies = useCallback(async () => {
    if (isLoadingFeeds || isLoadingMore) return;

    if (debouncedQuery.trim()) {
      setIsLoadingMore(true);
      try {
        const nextSearchPage = searchPageRef.current + 1;
        const [tmdbRes] = await Promise.allSettled([
          searchMovies(debouncedQuery, nextSearchPage, selectedLanguage),
        ]);

        const nextMovieItems =
          tmdbRes.status === "fulfilled" && tmdbRes.value.items ? tmdbRes.value.items : [];

        const newItems: DiscoveryItem[] = [];
        for (const item of nextMovieItems) {
          const key = item.id || item.public_id;
          if (key && !searchSeenIdsRef.current.has(key)) {
            searchSeenIdsRef.current.add(key);
            searchUniquePoolRef.current.push(item);
            newItems.push(item);
          }
        }

        if (newItems.length > 0) {
          searchPageRef.current = nextSearchPage;
          setSearchResults((prev) => [...prev, ...newItems]);
        } else if (searchUniquePoolRef.current.length > 0) {
          searchCycleCountRef.current += 1;
          const cycle = searchCycleCountRef.current;
          const cycled = searchUniquePoolRef.current.map((item, idx) => ({
            ...item,
            id: `${item.id || item.public_id}_c${cycle}_${idx}`,
          }));
          setSearchResults((prev) => [...prev, ...cycled]);
        }
      } catch (err) {
        console.warn("[DiscoverMovies] Error loading more search results:", err);
      } finally {
        setIsLoadingMore(false);
      }
      return;
    }

    setIsLoadingMore(true);
    try {
      if (pageRef.current < totalPagesRef.current) {
        const nextPage = pageRef.current + 1;
        const res = await fetchDiscoverMovies("now_playing", nextPage, undefined, selectedLanguage);
        const validMovies = (res.items || []).filter((m) => isMovieWithinSixMonths(m.release_date));

        const newBatch: DiscoveryItem[] = [];
        for (const m of validMovies) {
          const key = m.id || m.public_id;
          if (key && !seenIdsRef.current.has(key)) {
            seenIdsRef.current.add(key);
            uniquePoolRef.current.push(m);
            newBatch.push(m);
          }
        }

        if (newBatch.length > 0) {
          pageRef.current = nextPage;
          if (res.totalPages) totalPagesRef.current = res.totalPages;
          setMovies((prev) => {
            const nextList = [...prev, ...newBatch];
            languageStateCache.current.set(selectedLanguage, {
              items: nextList,
              uniquePool: [...uniquePoolRef.current],
              seenIds: new Set(seenIdsRef.current),
              page: pageRef.current,
              totalPages: totalPagesRef.current,
              cycleCount: cycleCountRef.current,
            });
            return nextList;
          });
          setIsLoadingMore(false);
          return;
        }
      }

      // Provider exhausted for current language: cycle through available unique pool
      if (uniquePoolRef.current.length > 0) {
        cycleCountRef.current += 1;
        const cycle = cycleCountRef.current;
        setCycleCount(cycle);
        pageRef.current = 1;

        const cycledBatch = uniquePoolRef.current.map((item, idx) => ({
          ...item,
          id: `${item.id || item.public_id}_c${cycle}_${idx}`,
        }));

        setMovies((prev) => {
          const nextList = [...prev, ...cycledBatch];
          languageStateCache.current.set(selectedLanguage, {
            items: nextList,
            uniquePool: [...uniquePoolRef.current],
            seenIds: new Set(seenIdsRef.current),
            page: 1,
            totalPages: totalPagesRef.current,
            cycleCount: cycle,
          });
          return nextList;
        });
      }
    } catch (err) {
      console.warn("[DiscoverMovies] Error loading more movies:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [debouncedQuery, selectedLanguage, isLoadingFeeds, isLoadingMore]);

  // Auto-prefetch sentinel using IntersectionObserver (rootMargin: 500px)
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef(loadMoreMovies);
  loadMoreRef.current = loadMoreMovies;

  const sentinelRef = useCallback((node: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
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
          rootMargin: "500px",
          threshold: 0,
        }
      );
      observerRef.current.observe(node);
    }
  }, []);

  // When searching, show searchResults. Otherwise show filtered catalogue.
  const displayedMovies = useMemo(() => {
    if (debouncedQuery) {
      return searchResults;
    }
    return movies.filter((m) => isMovieWithinSixMonths(m.release_date));
  }, [debouncedQuery, searchResults, movies]);

  return (
    <div
      className="flex-1 flex flex-col h-full bg-[#000000] overflow-y-auto no-scrollbar pb-6 pb-[env(safe-area-inset-bottom,16px)] text-left select-none"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* ── 1. HEADER BAR ── */}
      <div className="w-full shrink-0 px-5 pt-3.5 pb-2 flex items-center justify-between bg-black border-b border-white/[0.06]">
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

      {/* ── 3. LANGUAGE FILTERS (Single Row: All | English | Hindi | Tamil | Telugu | Kannada) ── */}
      {!debouncedQuery && (
        <section className="px-5 pt-2 pb-2 shrink-0 border-b border-white/[0.04]">
          <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth py-0.5">
            {LANGUAGE_FILTERS.map((l) => {
              const isSelected = selectedLanguage === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelectedLanguage(l.id)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer active:scale-95 ${
                    isSelected
                      ? "bg-violet-600 text-white shadow-[0_0_12px_rgba(139,92,246,0.35)] border border-violet-400/40"
                      : "bg-[#121216] text-zinc-400 border border-white/[0.06] hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 4. SINGLE MOVIE SECTION HEADER ── */}
      <div className="px-5 pt-4 pb-2 text-left shrink-0">
        <h3 className="text-sm font-bold text-white tracking-wide">
          {debouncedQuery ? "Search Results" : "Latest Movies"}
        </h3>
      </div>

      {/* ── 5. COMPACT TWO-COLUMN MOVIE GRID ── */}
      <div className="flex-1 px-5 pt-1 pb-8">
        {/* Loading state */}
        {isSearching ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
            <p className="text-xs text-zinc-400 font-medium">
              Searching all places...
            </p>
          </div>
        ) : isLoadingFeeds && displayedMovies.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
                key={`${item.id || item.public_id || idx}_${idx}`}
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

            {/* Endless Scroll Sentinel & Subtle Bottom Loading Indicator */}
            <div ref={sentinelRef} className="h-6 w-full pointer-events-none col-span-full" />
            {isLoadingMore && (
              <div className="flex items-center justify-center py-6 gap-2 text-zinc-400 col-span-full">
                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                <span className="text-xs font-medium">
                  {cycleCount > 1 ? "Continuing feed..." : "Loading more movies..."}
                </span>
              </div>
            )}
          </div>
        ) : debouncedQuery ? (
          <div className="px-6 py-16 text-center space-y-2">
            <p className="text-zinc-300 text-sm font-medium">
              No places found
            </p>
            <p className="text-zinc-500 text-xs">
              Try searching for another place.
            </p>
          </div>
        ) : (
          <div className="py-16 text-center space-y-2">
            <p className="text-zinc-400 text-sm font-medium">
              No movies found {activeLanguageLabel ? `in ${activeLanguageLabel}` : ""}.
            </p>
            <p className="text-zinc-600 text-xs">
              Try switching the language filter or searching another title.
            </p>
          </div>
        )}

      </div>

      {/* ── 7. PLACE PREVIEW SHEET ── */}
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
