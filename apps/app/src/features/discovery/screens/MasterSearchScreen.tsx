import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
import { DiscoveryItem } from "../../../core/types/discovery";
import { searchCoordinator } from "../search";
import { SearchBar } from "../../../shared/components/SearchBar";
import { DiscoverySection } from "../components/DiscoverySection";
import { PlacePreviewSheet } from "../components/PlacePreviewSheet";
import { AdminPlaceEditSheet } from "../components/AdminPlaceEditSheet";
import { extractCleanPlaceId } from "../services/venueRelevance";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { subscribePlaceOverrides } from "../services/placeOverridesService";

export interface MasterSearchScreenProps {
  onBack: () => void;
  onSelectDiscoveryItem: (item: DiscoveryItem) => void;
  currentCity?: string;
  currentLocality?: string;
  currentCoordinates?: { latitude: number; longitude: number };
  isAdmin?: boolean;
}

interface CategoryResultState {
  items: DiscoveryItem[];
  nextPageToken?: string | null;
  moviePage?: number;
  movieTotalPages?: number;
  hasMore: boolean;
  isLoadingMore: boolean;
}

const INITIAL_CATEGORY_STATE: CategoryResultState = {
  items: [],
  nextPageToken: null,
  moviePage: 1,
  movieTotalPages: 1,
  hasMore: false,
  isLoadingMore: false,
};

type ActiveFilter = "all" | "dining" | "sports" | "activities" | "movies";

const FILTER_TABS: { id: ActiveFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "dining", label: "Dining" },
  { id: "sports", label: "Sports" },
  { id: "activities", label: "Activities" },
  { id: "movies", label: "Movies" },
];

export const MasterSearchScreen: React.FC<MasterSearchScreenProps> = ({
  onBack,
  onSelectDiscoveryItem,
  currentCity = "Bengaluru",
  currentCoordinates,
  isAdmin: propIsAdmin = false,
}) => {
  const { isAdmin: storeIsAdmin } = useProfileStore();
  const isAdmin = Boolean(propIsAdmin || storeIsAdmin);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [isSearching, setIsSearching] = useState(false);
  const [previewItem, setPreviewItem] = useState<DiscoveryItem | null>(null);
  const [adminSearchTarget, setAdminSearchTarget] = useState<DiscoveryItem | null>(null);

  const [diningResults, setDiningResults] = useState<CategoryResultState>(INITIAL_CATEGORY_STATE);
  const [sportsResults, setSportsResults] = useState<CategoryResultState>(INITIAL_CATEGORY_STATE);
  const [activitiesResults, setActivitiesResults] = useState<CategoryResultState>(INITIAL_CATEGORY_STATE);
  const [moviesResults, setMoviesResults] = useState<CategoryResultState>(INITIAL_CATEGORY_STATE);

  const requestCounterRef = useRef(0);

  // Debounce search query (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Subscribe to real-time place exclusions / overrides
  useEffect(() => {
    const unsubscribe = subscribePlaceOverrides(({ action, placeId }) => {
      if (action === "hide") {
        setDiningResults((prev) => ({
          ...prev,
          items: prev.items.filter((i) => extractCleanPlaceId(i.place_id || i.id) !== placeId),
        }));
        setSportsResults((prev) => ({
          ...prev,
          items: prev.items.filter((i) => extractCleanPlaceId(i.place_id || i.id) !== placeId),
        }));
        setActivitiesResults((prev) => ({
          ...prev,
          items: prev.items.filter((i) => extractCleanPlaceId(i.place_id || i.id) !== placeId),
        }));
      }
    });
    return unsubscribe;
  }, []);

  // Execute global search when debouncedQuery changes
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      setDiningResults(INITIAL_CATEGORY_STATE);
      setSportsResults(INITIAL_CATEGORY_STATE);
      setActivitiesResults(INITIAL_CATEGORY_STATE);
      setMoviesResults(INITIAL_CATEGORY_STATE);
      setIsSearching(false);
      return;
    }

    const currentRequestId = ++requestCounterRef.current;
    setIsSearching(true);

    // Concurrently search Dining, Sports, Activities (via searchCoordinator) and Movies (via TMDB)
    Promise.allSettled([
      searchCoordinator.executeSearch(trimmed, {
        category: "DINING",
        discoveryCoordinates: currentCoordinates,
      }),
      searchCoordinator.executeSearch(trimmed, {
        category: "SPORTS",
        discoveryCoordinates: currentCoordinates,
      }),
      searchCoordinator.executeSearch(trimmed, {
        category: "ACTIVITIES",
        discoveryCoordinates: currentCoordinates,
      }),
      searchCoordinator.executeSearch(trimmed, {
        category: "MOVIES",
        discoveryCoordinates: currentCoordinates,
      }),
    ]).then(([diningRes, sportsRes, activitiesRes, moviesRes]) => {
      // Discard results if a newer search was initiated
      if (currentRequestId !== requestCounterRef.current) return;

      if (diningRes.status === "fulfilled") {
        setDiningResults({
          items: diningRes.value.items || [],
          nextPageToken: diningRes.value.nextPageToken || null,
          hasMore: !diningRes.value.isExhausted,
          isLoadingMore: false,
        });
      } else {
        setDiningResults(INITIAL_CATEGORY_STATE);
      }

      if (sportsRes.status === "fulfilled") {
        setSportsResults({
          items: sportsRes.value.items || [],
          nextPageToken: sportsRes.value.nextPageToken || null,
          hasMore: !sportsRes.value.isExhausted,
          isLoadingMore: false,
        });
      } else {
        setSportsResults(INITIAL_CATEGORY_STATE);
      }

      if (activitiesRes.status === "fulfilled") {
        setActivitiesResults({
          items: activitiesRes.value.items || [],
          nextPageToken: activitiesRes.value.nextPageToken || null,
          hasMore: !activitiesRes.value.isExhausted,
          isLoadingMore: false,
        });
      } else {
        setActivitiesResults(INITIAL_CATEGORY_STATE);
      }

      if (moviesRes.status === "fulfilled") {
        setMoviesResults({
          items: moviesRes.value.items || [],
          nextPageToken: moviesRes.value.nextPageToken || null,
          hasMore: !moviesRes.value.isExhausted,
          isLoadingMore: false,
        });
      } else {
        setMoviesResults(INITIAL_CATEGORY_STATE);
      }

      setIsSearching(false);
    });
  }, [debouncedQuery, currentCoordinates, currentCity]);

  // Load more pagination handlers per category using searchCoordinator
  const loadMoreDining = async () => {
    if (diningResults.isLoadingMore || !diningResults.hasMore) return;
    setDiningResults((prev) => ({ ...prev, isLoadingMore: true }));
    try {
      const res = await searchCoordinator.loadNextPage("DINING");
      if (res) {
        setDiningResults({
          items: res.items,
          nextPageToken: res.nextPageToken || null,
          hasMore: !res.isExhausted,
          isLoadingMore: false,
        });
      } else {
        setDiningResults((prev) => ({ ...prev, isLoadingMore: false }));
      }
    } catch {
      setDiningResults((prev) => ({ ...prev, isLoadingMore: false }));
    }
  };

  const loadMoreSports = async () => {
    if (sportsResults.isLoadingMore || !sportsResults.hasMore) return;
    setSportsResults((prev) => ({ ...prev, isLoadingMore: true }));
    try {
      const res = await searchCoordinator.loadNextPage("SPORTS");
      if (res) {
        setSportsResults({
          items: res.items,
          nextPageToken: res.nextPageToken || null,
          hasMore: !res.isExhausted,
          isLoadingMore: false,
        });
      } else {
        setSportsResults((prev) => ({ ...prev, isLoadingMore: false }));
      }
    } catch {
      setSportsResults((prev) => ({ ...prev, isLoadingMore: false }));
    }
  };

  const loadMoreActivities = async () => {
    if (activitiesResults.isLoadingMore || !activitiesResults.hasMore) return;
    setActivitiesResults((prev) => ({ ...prev, isLoadingMore: true }));
    try {
      const res = await searchCoordinator.loadNextPage("ACTIVITIES");
      if (res) {
        setActivitiesResults({
          items: res.items,
          nextPageToken: res.nextPageToken || null,
          hasMore: !res.isExhausted,
          isLoadingMore: false,
        });
      } else {
        setActivitiesResults((prev) => ({ ...prev, isLoadingMore: false }));
      }
    } catch {
      setActivitiesResults((prev) => ({ ...prev, isLoadingMore: false }));
    }
  };

  const loadMoreMovies = async () => {
    if (moviesResults.isLoadingMore || !moviesResults.hasMore) return;
    setMoviesResults((prev) => ({ ...prev, isLoadingMore: true }));
    try {
      const res = await searchCoordinator.loadNextPage("MOVIES");
      if (res) {
        setMoviesResults({
          items: res.items,
          nextPageToken: res.nextPageToken || null,
          hasMore: !res.isExhausted,
          isLoadingMore: false,
        });
      } else {
        setMoviesResults((prev) => ({ ...prev, isLoadingMore: false }));
      }
    } catch {
      setMoviesResults((prev) => ({ ...prev, isLoadingMore: false }));
    }
  };

  const showDining = (activeFilter === "all" || activeFilter === "dining") && diningResults.items.length > 0;
  const showSports = (activeFilter === "all" || activeFilter === "sports") && sportsResults.items.length > 0;
  const showActivities = (activeFilter === "all" || activeFilter === "activities") && activitiesResults.items.length > 0;
  const showMovies = (activeFilter === "all" || activeFilter === "movies") && moviesResults.items.length > 0;

  const totalResultsCount =
    diningResults.items.length +
    sportsResults.items.length +
    activitiesResults.items.length +
    moviesResults.items.length;

  return (
    <div
      className="flex-1 flex flex-col h-full bg-[#000000] overflow-y-auto no-scrollbar pb-24 text-left select-none"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* ── 1. HEADER WITH BACK ARROW & SEARCH INPUT ── */}
      <section className="px-4 pt-3.5 pb-2 shrink-0 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-white hover:text-zinc-300 active:scale-95 transition cursor-pointer p-1 -ml-1 flex items-center justify-center shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </button>

        <div className="flex-1 min-w-0">
          <SearchBar
            id="master-search-input"
            name="masterSearchInput"
            placeholder="Search restaurants, sports, activities, movies..."
            value={searchQuery}
            onChange={setSearchQuery}
            autoFocus
          />
        </div>
      </section>

      {/* ── 2. CATEGORY TABS (when results exist or while searching) ── */}
      {debouncedQuery && totalResultsCount > 0 && (
        <section className="px-5 pt-2 pb-2 shrink-0 border-b border-white/[0.04]">
          <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth py-0.5">
            {FILTER_TABS.map((tab) => {
              const isSelected = activeFilter === tab.id;
              let count = 0;
              if (tab.id === "all") count = totalResultsCount;
              if (tab.id === "dining") count = diningResults.items.length;
              if (tab.id === "sports") count = sportsResults.items.length;
              if (tab.id === "activities") count = activitiesResults.items.length;
              if (tab.id === "movies") count = moviesResults.items.length;

              if (tab.id !== "all" && count === 0) return null;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer active:scale-95 ${
                    isSelected
                      ? "bg-[#FF6B2C] text-white shadow-[0_0_12px_rgba(255,107,44,0.35)] border border-[#FF6B2C]"
                      : "bg-[#121216] text-zinc-400 border border-white/[0.06] hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  {tab.label} {count > 0 && <span className="opacity-75 font-normal">({count})</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 3. SEARCH CONTENT / SECTIONS ── */}
      <div className="flex-1 space-y-7 pt-4 pb-12">
        {/* Loading Spinner */}
        {isSearching && (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-[#FF6B2C]" />
            <p className="text-xs text-zinc-400 font-medium">Searching all places & movies...</p>
          </div>
        )}

        {/* Empty / Idle State when no query is typed */}
        {!debouncedQuery && !isSearching && (
          <div className="px-6 py-24 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#FF6B2C]">
              <Search className="w-5 h-5 text-[#FF6B2C]" />
            </div>
            <div className="space-y-1">
              <p className="text-white text-sm font-semibold">Search Planless</p>
              <p className="text-zinc-400 text-xs max-w-xs">
                Search restaurants, sports venues, activities, and movie titles across the city.
              </p>
            </div>
          </div>
        )}

        {/* No Results Found State */}
        {!isSearching && debouncedQuery && totalResultsCount === 0 && (
          <div className="px-6 py-20 text-center space-y-2">
            <p className="text-zinc-300 text-sm font-semibold">
              No results found for &ldquo;{debouncedQuery}&rdquo;
            </p>
            <p className="text-zinc-500 text-xs">
              Try searching for another place, activity, or movie title.
            </p>
          </div>
        )}

        {/* ── DINING SECTION ── */}
        {!isSearching && showDining && (
          <DiscoverySection
            id="master-search-dining"
            title="DINING"
            subtitle={`${diningResults.items.length} ${diningResults.items.length === 1 ? "restaurant" : "restaurants"}`}
            items={diningResults.items}
            colorAccent="text-red-500"
            userCoordinates={currentCoordinates}
            isAdmin={isAdmin}
            onSelectItem={(item) => setPreviewItem(item)}
            onLongPressAdmin={isAdmin ? (item) => setAdminSearchTarget(item) : undefined}
            hasMore={diningResults.hasMore}
            isLoadingMore={diningResults.isLoadingMore}
            onLoadMore={loadMoreDining}
          />
        )}

        {/* ── SPORTS SECTION ── */}
        {!isSearching && showSports && (
          <DiscoverySection
            id="master-search-sports"
            title="SPORTS"
            subtitle={`${sportsResults.items.length} ${sportsResults.items.length === 1 ? "venue" : "venues"}`}
            items={sportsResults.items}
            colorAccent="text-emerald-500"
            userCoordinates={currentCoordinates}
            isAdmin={isAdmin}
            onSelectItem={(item) => setPreviewItem(item)}
            onLongPressAdmin={isAdmin ? (item) => setAdminSearchTarget(item) : undefined}
            hasMore={sportsResults.hasMore}
            isLoadingMore={sportsResults.isLoadingMore}
            onLoadMore={loadMoreSports}
          />
        )}

        {/* ── ACTIVITIES SECTION ── */}
        {!isSearching && showActivities && (
          <DiscoverySection
            id="master-search-activities"
            title="ACTIVITIES"
            subtitle={`${activitiesResults.items.length} ${activitiesResults.items.length === 1 ? "venue" : "venues"}`}
            items={activitiesResults.items}
            colorAccent="text-pink-500"
            userCoordinates={currentCoordinates}
            isAdmin={isAdmin}
            onSelectItem={(item) => setPreviewItem(item)}
            onLongPressAdmin={isAdmin ? (item) => setAdminSearchTarget(item) : undefined}
            hasMore={activitiesResults.hasMore}
            isLoadingMore={activitiesResults.isLoadingMore}
            onLoadMore={loadMoreActivities}
          />
        )}

        {/* ── MOVIES SECTION ── */}
        {!isSearching && showMovies && (
          <DiscoverySection
            id="master-search-movies"
            title="MOVIES"
            subtitle={`${moviesResults.items.length} ${moviesResults.items.length === 1 ? "title" : "titles"}`}
            items={moviesResults.items}
            colorAccent="text-purple-500"
            userCoordinates={currentCoordinates}
            isAdmin={isAdmin}
            onSelectItem={(item) => setPreviewItem(item)}
            onLongPressAdmin={isAdmin ? (item) => setAdminSearchTarget(item) : undefined}
            hasMore={moviesResults.hasMore}
            isLoadingMore={moviesResults.isLoadingMore}
            onLoadMore={loadMoreMovies}
          />
        )}
      </div>

      {/* ── PLACE PREVIEW SHEET ── */}
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

      {/* ── ADMIN: PLACE EDIT SHEET ── */}
      {isAdmin && adminSearchTarget && (
        <AdminPlaceEditSheet
          item={adminSearchTarget}
          userCoordinates={currentCoordinates}
          onClose={() => setAdminSearchTarget(null)}
          onSaved={(updated) => {
            setAdminSearchTarget(null);
            const updateList = (list: DiscoveryItem[]) =>
              list.map((it) =>
                extractCleanPlaceId(it.place_id || it.id) === extractCleanPlaceId(updated.place_id || updated.id)
                  ? updated
                  : it
              );
            setDiningResults((p) => ({ ...p, items: updateList(p.items) }));
            setSportsResults((p) => ({ ...p, items: updateList(p.items) }));
            setActivitiesResults((p) => ({ ...p, items: updateList(p.items) }));
          }}
          onHidden={(hiddenPlaceId) => {
            setAdminSearchTarget(null);
            setDiningResults((prev) => ({
              ...prev,
              items: prev.items.filter((i) => extractCleanPlaceId(i.place_id || i.id) !== hiddenPlaceId),
            }));
            setSportsResults((prev) => ({
              ...prev,
              items: prev.items.filter((i) => extractCleanPlaceId(i.place_id || i.id) !== hiddenPlaceId),
            }));
            setActivitiesResults((prev) => ({
              ...prev,
              items: prev.items.filter((i) => extractCleanPlaceId(i.place_id || i.id) !== hiddenPlaceId),
            }));
          }}
        />
      )}
    </div>
  );
};
