import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Loader2, ChevronRight } from "lucide-react";
import { DiscoverySection as DiscoverySectionType, DiscoveryItem } from "../../../core/types/discovery";
import { DiscoverySection } from "./DiscoverySection";
import { ADMIN_CONFIGS, ContentConfig } from "../services/discoveryAdminService";
import {
  getCachedMovieSection,
  fetchDiscoverMovies,
  isMovieWithinSixMonths,
} from "../services/tmdbMovieService";
import { MoviePortraitCard } from "../screens/DiscoverMovies";
import { usePlanlessSearch } from "../search";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { useDiscoveryStream } from "../hooks/useDiscoveryStream";

export interface ForYouSectionsProps {
  sections: DiscoverySectionType[];
  searchQuery: string;
  categoryFilter?: "all" | "sports" | "dining" | "activities";
  onSelectItem: (item: DiscoveryItem) => void;
  isAdmin?: boolean;
  onLongPressAdmin?: (item: DiscoveryItem, config: ContentConfig) => void;
  onViewAllCategory?: (category: "sports" | "dining" | "activities") => void;
  onViewAllMovies?: () => void;
  userCoordinates?: { latitude: number; longitude: number } | null;
  currentCity?: string;
}

interface SectionDef {
  id: string;
  title: string;
  items: DiscoveryItem[];
  colorAccent?: string;
  adminConfig?: ContentConfig;
}

// ─── Movie Rail Section ───────────────────────────────────────────────────────

export interface MovieRailProps {
  id?: string;
  title: string;
  movies: DiscoveryItem[];
  isLoading: boolean;
  onSelectItem: (item: DiscoveryItem) => void;
  isAdmin?: boolean;
  onLongPressAdmin?: (item: DiscoveryItem) => void;
  onViewAll?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export const MovieRailSection: React.FC<MovieRailProps> = ({
  id,
  title,
  movies,
  isLoading,
  onSelectItem,
  isAdmin,
  onLongPressAdmin,
  onViewAll,
  hasMore,
  isLoadingMore,
  onLoadMore,
}) => {
  if (!isLoading && movies.length === 0) return null;

  return (
    <div id={id} className="space-y-3">
      <div className="px-6 flex items-end justify-between">
        <div className="space-y-0.5 text-left">
          <h4 className="text-sm font-bold text-white tracking-wide">{title}</h4>
        </div>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-[11px] font-semibold text-[#FF6B2C] hover:text-[#ff8552] flex items-center gap-0.5 pb-0.5 transition cursor-pointer"
          >
            <span>View all</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <div
        className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-2.5 scroll-smooth snap-x snap-mandatory"
        onScroll={(e) => {
          if (!hasMore || isLoadingMore || !onLoadMore) return;
          const el = e.currentTarget;
          if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 200) {
            onLoadMore();
          }
        }}
      >
        {isLoading && movies.length === 0
          ? [1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{ width: 130, minWidth: 130 }}
                className="shrink-0 rounded-2xl bg-[#121216] border border-white/[0.06] overflow-hidden animate-pulse snap-start"
              >
                <div className="w-full aspect-[2/3] bg-white/[0.04]" />
                <div className="p-2.5 space-y-2">
                  <div className="h-3.5 w-3/4 bg-white/[0.07] rounded" />
                  <div className="h-3 w-1/2 bg-white/[0.04] rounded" />
                </div>
              </div>
            ))
          : movies.map((item) => (
              <div
                key={item.id}
                style={{ width: 130, minWidth: 130 }}
                className="shrink-0 snap-start"
              >
                <MoviePortraitCard
                  item={item}
                  onTap={() => onSelectItem(item)}
                  isAdmin={isAdmin}
                  onLongPressAdmin={
                    onLongPressAdmin ? () => onLongPressAdmin(item) : undefined
                  }
                />
              </div>
            ))}
        {isLoadingMore && (
          <div
            style={{ width: 130, minWidth: 130 }}
            className="shrink-0 aspect-[2/3] rounded-2xl bg-[#121216] border border-white/[0.06] flex flex-col items-center justify-center gap-2 snap-start"
          >
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
            <span className="text-[10px] text-zinc-500 font-medium">Loading...</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── TMDB movie hook with progressive pagination ──────────────────────────────
const NOW_PLAYING_KEY = "discover_now_playing_lall_p1_gall";

export interface UseMoviesStreamResult {
  movies: DiscoveryItem[];
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

export function useMoviesStream(initialMovies?: DiscoveryItem[]): UseMoviesStreamResult {
  const [movies, setMovies] = useState<DiscoveryItem[]>(() => {
    if (initialMovies && initialMovies.length > 0) {
      // Filter strictly for authentic TMDB movie items; never accept Google Places venues
      const validMovies = initialMovies.filter(
        (m) =>
          m.category === "MOVIES" &&
          (m.movie_id || String(m.id || "").startsWith("tmdb-")) &&
          !String(m.id || "").startsWith("place_") &&
          !(m as any).place_id
      );
      if (validMovies.length > 0) return validMovies;
    }
    return getCachedMovieSection(NOW_PLAYING_KEY).filter((m) =>
      isMovieWithinSixMonths(m.release_date)
    );
  });

  const [isLoadingInitial, setIsLoadingInitial] = useState(() => {
    if (initialMovies && initialMovies.length > 0) {
      const validMovies = initialMovies.filter(
        (m) =>
          m.category === "MOVIES" &&
          (m.movie_id || String(m.id || "").startsWith("tmdb-")) &&
          !String(m.id || "").startsWith("place_") &&
          !(m as any).place_id
      );
      if (validMovies.length > 0) return false;
    }
    return getCachedMovieSection(NOW_PLAYING_KEY).length === 0;
  });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const pageRef = useRef(1);
  const totalPagesRef = useRef(5);
  const seenIdsRef = useRef<Set<string | number>>(new Set());

  // Populate seen IDs
  useEffect(() => {
    movies.forEach((m) => {
      const key = m.id || m.public_id || (m as any).movie_id;
      if (key) seenIdsRef.current.add(key);
    });
  }, []);

  // Sync if initialMovies changes (e.g. from props or test mocks)
  useEffect(() => {
    if (initialMovies && initialMovies.length > 0 && movies.length === 0) {
      const validMovies = initialMovies.filter(
        (m) =>
          m.category === "MOVIES" &&
          (m.movie_id || String(m.id || "").startsWith("tmdb-")) &&
          !String(m.id || "").startsWith("place_") &&
          !(m as any).place_id
      );
      if (validMovies.length > 0) {
        validMovies.forEach((m) => {
          const key = m.id || m.public_id || (m as any).movie_id;
          if (key) seenIdsRef.current.add(key);
        });
        setMovies(validMovies);
        setIsLoadingInitial(false);
      }
    }
  }, [initialMovies]);

  // Initial fetch / background revalidation from TMDB API
  useEffect(() => {
    let active = true;
    if (movies.length === 0) {
      setIsLoadingInitial(true);
    }

    (async () => {
      try {
        const res = await fetchDiscoverMovies("now_playing", 1, undefined, "all");
        if (!active) return;
        const valid = (res.items || []).filter((m) => isMovieWithinSixMonths(m.release_date));
        valid.forEach((m) => {
          const key = m.id || m.public_id || (m as any).movie_id;
          if (key) seenIdsRef.current.add(key);
        });
        totalPagesRef.current = res.totalPages || 5;
        if (valid.length > 0) {
          setMovies((prev) => {
            if (prev.length === 0 || pageRef.current === 1) return valid;
            return prev;
          });
        }
      } catch (err) {
        console.error("[ForYouSections] Failed loading movie stream:", err);
      } finally {
        if (active) setIsLoadingInitial(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || pageRef.current >= totalPagesRef.current) return;
    setIsLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const res = await fetchDiscoverMovies("now_playing", nextPage, undefined, "all");
      const valid = (res.items || []).filter((m) => isMovieWithinSixMonths(m.release_date));
      const newItems: DiscoveryItem[] = [];
      valid.forEach((m) => {
        const key = m.id || m.public_id || (m as any).movie_id;
        if (key && !seenIdsRef.current.has(key)) {
          seenIdsRef.current.add(key);
          newItems.push(m);
        }
      });
      pageRef.current = nextPage;
      totalPagesRef.current = res.totalPages || 5;
      if (nextPage >= totalPagesRef.current) {
        setHasMore(false);
      }
      if (newItems.length > 0) {
        setMovies((prev) => [...prev, ...newItems]);
      }
    } catch (err) {
      console.warn("[ForYouSections] Failed loading more movies:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore]);

  return {
    movies,
    isLoadingInitial,
    isLoadingMore,
    hasMore,
    loadMore,
  };
}

// ─── Approaching Sentinel for Progressive Loading ─────────────────────────────
const ApproachingSentinel: React.FC<{
  onNearEnd: () => void;
  enabled: boolean;
}> = ({ onNearEnd, enabled }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onNearEnd();
        }
      },
      {
        root: null,
        rootMargin: "600px 0px 600px 0px",
        threshold: 0,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [onNearEnd, enabled]);

  return <div ref={ref} className="h-0 w-full pointer-events-none" aria-hidden="true" />;
};

// ─── Repeating Interleaved Constants ──────────────────────────────────────────
export const DISCOVERY_CARDS_PER_ROW = 7;

type CategoryType = "SPORTS" | "MOVIES" | "DINING" | "ACTIVITIES";

interface InterleavedFeedSection {
  key: string;
  category: CategoryType;
  title: string;
  items: DiscoveryItem[];
  colorAccent?: string;
  adminConfig?: ContentConfig;
  isLastOfCategory: boolean;
}

// ─── Main ForYouSections ──────────────────────────────────────────────────────

export const ForYouSections: React.FC<ForYouSectionsProps> = ({
  sections,
  searchQuery,
  categoryFilter = "all",
  onSelectItem,
  isAdmin: propIsAdmin = false,
  onLongPressAdmin,
  onViewAllCategory,
  onViewAllMovies,
  userCoordinates,
  currentCity,
}) => {
  const { isAdmin: storeIsAdmin } = useProfileStore();
  const isAdmin = Boolean(propIsAdmin || storeIsAdmin);
  const normalizedQuery = searchQuery.toLowerCase().trim();

  const diningSection = sections.find((s) => s.category?.toUpperCase() === "DINING");
  const sportsSection = sections.find((s) => s.category?.toUpperCase() === "SPORTS");
  const activitiesSection = sections.find((s) => s.category?.toUpperCase() === "ACTIVITIES");

  const rawDiningItems = useMemo(() => diningSection?.items || [], [diningSection]);
  const rawSportsItems = useMemo(() => sportsSection?.items || [], [sportsSection]);
  const rawActivitiesItems = useMemo(() => activitiesSection?.items || [], [activitiesSection]);

  // ── Independent Progressive Streams for All 4 Categories ───────────────────
  const sportsStream = useDiscoveryStream({
    category: "SPORTS",
    initialItems: rawSportsItems,
    currentCoordinates: userCoordinates,
    currentCity,
    initialBatchSize: 21,
  });

  // Movies strictly use TMDB API only — never Google Places or backend places discovery
  const moviesStream = useMoviesStream();

  const diningStream = useDiscoveryStream({
    category: "DINING",
    initialItems: rawDiningItems,
    currentCoordinates: userCoordinates,
    currentCity,
    initialBatchSize: 21,
  });

  const activitiesStream = useDiscoveryStream({
    category: "ACTIVITIES",
    initialItems: rawActivitiesItems,
    currentCoordinates: userCoordinates,
    currentCity,
    initialBatchSize: 21,
  });

  // ── Search mode ─────────────────────────────────────────────────────────────
  const searchCategory =
    categoryFilter === "dining"
      ? "DINING"
      : categoryFilter === "sports"
      ? "SPORTS"
      : categoryFilter === "activities"
      ? "ACTIVITIES"
      : "ALL";

  const {
    isSearching,
    isSearchLoading,
    searchResults,
  } = usePlanlessSearch({
    category: searchCategory,
    searchQuery,
    currentCoordinates: userCoordinates || undefined,
  });

  // Preserve pre-sorted raw items as immediate fallback for SSR / initial tests
  const sortedRawSports = useMemo(() => {
    return [...rawSportsItems].sort((a, b) => {
      const da = typeof (a as any)._distanceKm === "number" ? (a as any)._distanceKm : Infinity;
      const db = typeof (b as any)._distanceKm === "number" ? (b as any)._distanceKm : Infinity;
      return da - db;
    });
  }, [rawSportsItems]);

  const sortedRawDining = useMemo(() => {
    return [...rawDiningItems].sort((a, b) => {
      const da = typeof (a as any)._distanceKm === "number" ? (a as any)._distanceKm : Infinity;
      const db = typeof (b as any)._distanceKm === "number" ? (b as any)._distanceKm : Infinity;
      return da - db;
    });
  }, [rawDiningItems]);

  const sortedRawActivities = useMemo(() => {
    return [...rawActivitiesItems].sort((a, b) => {
      const da = typeof (a as any)._distanceKm === "number" ? (a as any)._distanceKm : Infinity;
      const db = typeof (b as any)._distanceKm === "number" ? (b as any)._distanceKm : Infinity;
      return da - db;
    });
  }, [rawActivitiesItems]);

  const sportsItems = sportsStream.allVenues.length > 0 ? sportsStream.allVenues : sortedRawSports;
  const diningItems = diningStream.allVenues.length > 0 ? diningStream.allVenues : sortedRawDining;
  const activitiesItems = activitiesStream.allVenues.length > 0 ? activitiesStream.allVenues : sortedRawActivities;
  const movieItems = moviesStream.movies;

  // ── Search mode rendering ────────────────────────────────────────────────────
  if (isSearching) {
    if (isSearchLoading) {
      return (
        <div className="space-y-6 pt-2">
          {["Search results", "More matches"].map((title) => (
            <div key={title} className="space-y-3">
              <div className="px-6 flex items-end justify-between">
                <div className="h-4 w-32 bg-white/[0.08] rounded animate-pulse" />
              </div>
              <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-2.5">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{ width: 220, minWidth: 220, height: 225 }}
                    className="shrink-0 rounded-2xl bg-[#121216] border border-white/[0.06] overflow-hidden animate-pulse"
                  >
                    <div className="h-[130px] w-full bg-white/[0.04]" />
                    <div className="p-3 space-y-2">
                      <div className="h-3.5 w-3/4 bg-white/[0.07] rounded" />
                      <div className="h-3 w-1/2 bg-white/[0.04] rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    const filterByQuery = (items: DiscoveryItem[]) =>
      items.filter(
        (item) =>
          item.title.toLowerCase().includes(normalizedQuery) ||
          (item.description && item.description.toLowerCase().includes(normalizedQuery)) ||
          (item.location && item.location.toLowerCase().includes(normalizedQuery)) ||
          (item.place_address && item.place_address.toLowerCase().includes(normalizedQuery)) ||
          (item.subcategory && item.subcategory.toLowerCase().includes(normalizedQuery))
      );

    const apiDining = Array.isArray(searchResults)
      ? searchResults.filter((item) => (item.category || "").toUpperCase() === "DINING")
      : [];
    const apiSports = Array.isArray(searchResults)
      ? searchResults.filter((item) => (item.category || "").toUpperCase() === "SPORTS")
      : [];
    const apiActivities = Array.isArray(searchResults)
      ? searchResults.filter((item) => (item.category || "").toUpperCase() === "ACTIVITIES")
      : [];

    const dining = apiDining.length > 0 ? (apiDining as DiscoveryItem[]) : filterByQuery(sortedRawDining);
    const sports = apiSports.length > 0 ? (apiSports as DiscoveryItem[]) : filterByQuery(sortedRawSports);
    const activities = apiActivities.length > 0 ? (apiActivities as DiscoveryItem[]) : filterByQuery(sortedRawActivities);

    const hasAnyResults =
      dining.length > 0 || sports.length > 0 || activities.length > 0;

    if (!hasAnyResults) {
      return (
        <div className="px-6 py-16 text-center space-y-2">
          <p className="text-white text-base font-semibold">
            No results for &ldquo;{searchQuery}&rdquo;
          </p>
          <p className="text-zinc-500 text-sm font-normal">
            Try searching for a different food, sport, turf, activity, or place name.
          </p>
        </div>
      );
    }

    const searchSecs: SectionDef[] = [];
    if (sports.length > 0) {
      searchSecs.push({
        id: "search_sec_sports",
        title: "Sports",
        items: sports,
        colorAccent: "text-emerald-500",
        adminConfig: ADMIN_CONFIGS.turfs,
      });
    }
    if (dining.length > 0) {
      searchSecs.push({
        id: "search_sec_dining",
        title: "Restaurants",
        items: dining,
        colorAccent: "text-rose-500",
        adminConfig: ADMIN_CONFIGS.dining,
      });
    }
    if (activities.length > 0) {
      searchSecs.push({
        id: "search_sec_activities",
        title: "Activities",
        items: activities,
        colorAccent: "text-pink-500",
        adminConfig: ADMIN_CONFIGS.activities,
      });
    }

    return (
      <div className="space-y-8 pt-2">
        {searchSecs.map((sec) => (
          <DiscoverySection
            key={sec.id}
            id={sec.id}
            title={sec.title}
            items={sec.items}
            colorAccent={sec.colorAccent}
            userCoordinates={userCoordinates}
            isAdmin={isAdmin}
            onSelectItem={onSelectItem}
            onLongPressAdmin={
              onLongPressAdmin
                ? (item) => onLongPressAdmin(item, (sec.adminConfig || ADMIN_CONFIGS.turfs) as any)
                : undefined
            }
          />
        ))}
      </div>
    );
  }

  // ── Dining/Sports/Activities single-category filter ─────────────────────────
  if (categoryFilter === "dining") {
    const secs: SectionDef[] = [];
    if (diningItems.length > 0) secs.push({ id: "dining_sec_1", title: "Restaurants near you", items: diningItems.slice(0, 12), colorAccent: "text-rose-500", adminConfig: ADMIN_CONFIGS.dining });
    if (diningItems.length > 12) secs.push({ id: "dining_sec_2", title: "Dining spots", items: diningItems.slice(12, 25), colorAccent: "text-rose-500", adminConfig: ADMIN_CONFIGS.dining });
    if (diningItems.length > 25) secs.push({ id: "dining_sec_3", title: "More restaurants", items: diningItems.slice(25, 38), colorAccent: "text-rose-500", adminConfig: ADMIN_CONFIGS.dining });
    if (diningItems.length > 38) secs.push({ id: "dining_sec_4", title: "More places to eat", items: diningItems.slice(38, 50), colorAccent: "text-rose-500", adminConfig: ADMIN_CONFIGS.dining });
    if (secs.length === 0) return <div className="px-6 py-16 text-center"><p className="text-zinc-500 text-sm">No places found in this category yet.</p></div>;
    return (
      <div className="space-y-8 pt-2">
        {secs.map((sec) => (
          <DiscoverySection key={sec.id} id={sec.id} title={sec.title} items={sec.items} colorAccent={sec.colorAccent} userCoordinates={userCoordinates} isAdmin={isAdmin} onSelectItem={onSelectItem}
            onLongPressAdmin={onLongPressAdmin ? (item) => onLongPressAdmin(item, (sec.adminConfig || ADMIN_CONFIGS.dining) as any) : undefined} />
        ))}
      </div>
    );
  }

  if (categoryFilter === "sports") {
    const secs: SectionDef[] = [];
    if (sportsItems.length > 0) secs.push({ id: "sports_sec_1", title: "Sports near you", items: sportsItems.slice(0, 12), colorAccent: "text-emerald-500", adminConfig: ADMIN_CONFIGS.turfs });
    if (sportsItems.length > 12) secs.push({ id: "sports_sec_2", title: "Turfs & courts near you", items: sportsItems.slice(12, 25), colorAccent: "text-emerald-500", adminConfig: ADMIN_CONFIGS.turfs });
    if (sportsItems.length > 25) secs.push({ id: "sports_sec_3", title: "More sports facilities", items: sportsItems.slice(25, 38), colorAccent: "text-emerald-500", adminConfig: ADMIN_CONFIGS.turfs });
    if (sportsItems.length > 38) secs.push({ id: "sports_sec_4", title: "More sports venues", items: sportsItems.slice(38, 50), colorAccent: "text-emerald-500", adminConfig: ADMIN_CONFIGS.turfs });
    if (secs.length === 0) return <div className="px-6 py-16 text-center"><p className="text-zinc-500 text-sm">No places found in this category yet.</p></div>;
    return (
      <div className="space-y-8 pt-2">
        {secs.map((sec) => (
          <DiscoverySection key={sec.id} id={sec.id} title={sec.title} items={sec.items} colorAccent={sec.colorAccent} userCoordinates={userCoordinates} isAdmin={isAdmin} onSelectItem={onSelectItem}
            onLongPressAdmin={onLongPressAdmin ? (item) => onLongPressAdmin(item, (sec.adminConfig || ADMIN_CONFIGS.turfs) as any) : undefined} />
        ))}
      </div>
    );
  }

  if (categoryFilter === "activities") {
    const secs: SectionDef[] = [];
    if (activitiesItems.length > 0) secs.push({ id: "activities_sec_1", title: "Activities near you", items: activitiesItems.slice(0, 12), colorAccent: "text-pink-500", adminConfig: ADMIN_CONFIGS.activities });
    if (activitiesItems.length > 12) secs.push({ id: "activities_sec_2", title: "More fun activities", items: activitiesItems.slice(12, 25), colorAccent: "text-pink-500", adminConfig: ADMIN_CONFIGS.activities });
    if (activitiesItems.length > 25) secs.push({ id: "activities_sec_3", title: "More recreational spots", items: activitiesItems.slice(25, 38), colorAccent: "text-pink-500", adminConfig: ADMIN_CONFIGS.activities });
    if (activitiesItems.length > 38) secs.push({ id: "activities_sec_4", title: "Explore more activities", items: activitiesItems.slice(38, 50), colorAccent: "text-pink-500", adminConfig: ADMIN_CONFIGS.activities });
    if (secs.length === 0) return <div className="px-6 py-16 text-center"><p className="text-zinc-500 text-sm">No places found in this category yet.</p></div>;
    return (
      <div className="space-y-8 pt-2">
        {secs.map((sec) => (
          <DiscoverySection key={sec.id} id={sec.id} title={sec.title} items={sec.items} colorAccent={sec.colorAccent} userCoordinates={userCoordinates} isAdmin={isAdmin} onSelectItem={onSelectItem}
            onLongPressAdmin={onLongPressAdmin ? (item) => onLongPressAdmin(item, (sec.adminConfig || ADMIN_CONFIGS.activities) as any) : undefined} />
        ))}
      </div>
    );
  }

  // ── "all" — Repeating Interleaved Pattern: Sports → Movies → Restaurants → Activities ──
  //
  // Order:
  // 1. Sports — first 7 Sports cards (closest)
  // 2. Movies — first 7 Movies cards
  // 3. Restaurants — first 7 Dining cards
  // 4. Activities — first 7 Activities cards
  // Repeat:
  // 5. Sports — next 7 Sports cards
  // 6. Movies — next 7 Movies cards
  // 7. Restaurants — next 7 Dining cards
  // 8. Activities — next 7 Activities cards
  // ...

  // Chunk each category into 7-card slices
  const sportsChunks = useMemo(() => {
    const chunks: DiscoveryItem[][] = [];
    for (let i = 0; i < sportsItems.length; i += DISCOVERY_CARDS_PER_ROW) {
      chunks.push(sportsItems.slice(i, i + DISCOVERY_CARDS_PER_ROW));
    }
    return chunks;
  }, [sportsItems]);

  const moviesChunks = useMemo(() => {
    const chunks: DiscoveryItem[][] = [];
    for (let i = 0; i < movieItems.length; i += DISCOVERY_CARDS_PER_ROW) {
      chunks.push(movieItems.slice(i, i + DISCOVERY_CARDS_PER_ROW));
    }
    return chunks;
  }, [movieItems]);

  const diningChunks = useMemo(() => {
    const chunks: DiscoveryItem[][] = [];
    for (let i = 0; i < diningItems.length; i += DISCOVERY_CARDS_PER_ROW) {
      chunks.push(diningItems.slice(i, i + DISCOVERY_CARDS_PER_ROW));
    }
    return chunks;
  }, [diningItems]);

  const activityChunks = useMemo(() => {
    const chunks: DiscoveryItem[][] = [];
    for (let i = 0; i < activitiesItems.length; i += DISCOVERY_CARDS_PER_ROW) {
      chunks.push(activitiesItems.slice(i, i + DISCOVERY_CARDS_PER_ROW));
    }
    return chunks;
  }, [activitiesItems]);

  // Interleave repeating cycles: Sports -> Movies -> Restaurants -> Activities
  const interleavedSections = useMemo((): InterleavedFeedSection[] => {
    const result: InterleavedFeedSection[] = [];
    const maxCycles = Math.max(
      sportsChunks.length,
      moviesChunks.length,
      diningChunks.length,
      activityChunks.length,
      1
    );

    for (let c = 0; c < maxCycles; c++) {
      // 1. Sports
      if (sportsChunks[c] && sportsChunks[c].length > 0) {
        result.push({
          key: `foryou_sports_cycle_${c}`,
          category: "SPORTS",
          title: "Sports",
          items: sportsChunks[c],
          colorAccent: "text-emerald-500",
          adminConfig: ADMIN_CONFIGS.turfs,
          isLastOfCategory: c === sportsChunks.length - 1,
        });
      }

      // 2. Movies
      if (moviesChunks[c] && moviesChunks[c].length > 0) {
        result.push({
          key: `foryou_movies_cycle_${c}`,
          category: "MOVIES",
          title: "Movies",
          items: moviesChunks[c],
          colorAccent: "text-purple-500",
          adminConfig: ADMIN_CONFIGS.movies,
          isLastOfCategory: c === moviesChunks.length - 1,
        });
      } else if (c === 0 && moviesStream.isLoadingInitial && movieItems.length === 0) {
        // Reserve cycle 0 movie skeleton while initial TMDB page loads
        result.push({
          key: "foryou_movies_cycle_0_loading",
          category: "MOVIES",
          title: "Movies",
          items: [],
          colorAccent: "text-purple-500",
          adminConfig: ADMIN_CONFIGS.movies,
          isLastOfCategory: true,
        });
      }

      // 3. Restaurants
      if (diningChunks[c] && diningChunks[c].length > 0) {
        result.push({
          key: `foryou_dining_cycle_${c}`,
          category: "DINING",
          title: "Restaurants",
          items: diningChunks[c],
          colorAccent: "text-rose-500",
          adminConfig: ADMIN_CONFIGS.dining,
          isLastOfCategory: c === diningChunks.length - 1,
        });
      }

      // 4. Activities
      if (activityChunks[c] && activityChunks[c].length > 0) {
        result.push({
          key: `foryou_activities_cycle_${c}`,
          category: "ACTIVITIES",
          title: "Activities",
          items: activityChunks[c],
          colorAccent: "text-pink-500",
          adminConfig: ADMIN_CONFIGS.activities,
          isLastOfCategory: c === activityChunks.length - 1,
        });
      }
    }

    return result;
  }, [
    sportsChunks,
    moviesChunks,
    diningChunks,
    activityChunks,
    moviesStream.isLoadingInitial,
    movieItems.length,
  ]);

  const hasContent =
    interleavedSections.length > 0 ||
    sportsStream.isLoadingInitial ||
    moviesStream.isLoadingInitial ||
    diningStream.isLoadingInitial ||
    activitiesStream.isLoadingInitial;

  if (!hasContent) {
    return (
      <div className="px-6 py-16 text-center space-y-2">
        <p className="text-zinc-500 text-sm font-normal">
          No places found in this category yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pt-2">
      {interleavedSections.map((section) => {
        const isLastSports = section.category === "SPORTS" && section.isLastOfCategory;
        const isLastMovies = section.category === "MOVIES" && section.isLastOfCategory;
        const isLastDining = section.category === "DINING" && section.isLastOfCategory;
        const isLastActivities = section.category === "ACTIVITIES" && section.isLastOfCategory;

        if (section.category === "MOVIES") {
          return (
            <React.Fragment key={section.key}>
              <MovieRailSection
                id={section.key}
                title={section.title}
                movies={section.items}
                isLoading={moviesStream.isLoadingInitial && movieItems.length === 0}
                onSelectItem={onSelectItem}
                isAdmin={isAdmin}
                onLongPressAdmin={
                  onLongPressAdmin
                    ? (item) => onLongPressAdmin(item, ADMIN_CONFIGS.movies)
                    : undefined
                }
                onViewAll={onViewAllMovies}
                hasMore={isLastMovies ? moviesStream.hasMore : false}
                isLoadingMore={isLastMovies ? moviesStream.isLoadingMore : false}
                onLoadMore={isLastMovies ? moviesStream.loadMore : undefined}
              />
              {isLastMovies && (
                <ApproachingSentinel
                  onNearEnd={moviesStream.loadMore}
                  enabled={moviesStream.hasMore && !moviesStream.isLoadingMore}
                />
              )}
            </React.Fragment>
          );
        }

        // Venue rails (Sports, Dining, Activities)
        const isSports = section.category === "SPORTS";
        const isDining = section.category === "DINING";
        const isActivities = section.category === "ACTIVITIES";

        const categoryStream = isSports
          ? sportsStream
          : isDining
          ? diningStream
          : activitiesStream;

        const isLastOfThisCategory = isSports
          ? isLastSports
          : isDining
          ? isLastDining
          : isLastActivities;

        const viewAllHandler = isSports
          ? onViewAllCategory ? () => onViewAllCategory("sports") : undefined
          : isDining
          ? onViewAllCategory ? () => onViewAllCategory("dining") : undefined
          : onViewAllCategory ? () => onViewAllCategory("activities") : undefined;

        return (
          <React.Fragment key={section.key}>
            <DiscoverySection
              id={section.key}
              title={section.title}
              items={section.items}
              colorAccent={section.colorAccent}
              userCoordinates={userCoordinates}
              isAdmin={isAdmin}
              onSelectItem={onSelectItem}
              onLongPressAdmin={
                onLongPressAdmin
                  ? (item) =>
                      onLongPressAdmin(
                        item,
                        (section.adminConfig || ADMIN_CONFIGS.turfs) as any
                      )
                  : undefined
              }
              onViewAll={viewAllHandler}
              hasMore={isLastOfThisCategory ? categoryStream.hasMore : false}
              isLoadingMore={isLastOfThisCategory ? categoryStream.isLoadingMore : false}
              onLoadMore={isLastOfThisCategory ? categoryStream.loadMore : undefined}
            />
            {isLastOfThisCategory && (
              <ApproachingSentinel
                onNearEnd={categoryStream.loadMore}
                enabled={categoryStream.hasMore && !categoryStream.isLoadingMore}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Bottom Sentinel to ensure seamless endless streaming when reaching feed bottom */}
      <ApproachingSentinel
        onNearEnd={() => {
          if (sportsStream.hasMore && !sportsStream.isLoadingMore) sportsStream.loadMore();
          if (moviesStream.hasMore && !moviesStream.isLoadingMore) moviesStream.loadMore();
          if (diningStream.hasMore && !diningStream.isLoadingMore) diningStream.loadMore();
          if (activitiesStream.hasMore && !activitiesStream.isLoadingMore) activitiesStream.loadMore();
        }}
        enabled={
          (sportsStream.hasMore && !sportsStream.isLoadingMore) ||
          (moviesStream.hasMore && !moviesStream.isLoadingMore) ||
          (diningStream.hasMore && !diningStream.isLoadingMore) ||
          (activitiesStream.hasMore && !activitiesStream.isLoadingMore)
        }
      />
    </div>
  );
};
