import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { DiscoverySection as DiscoverySectionType, DiscoveryItem } from "../../../core/types/discovery";
import { DiscoverySection } from "../components/DiscoverySection";
import { PlacePreviewSheet } from "../components/PlacePreviewSheet";
import { SearchBar } from "../../../shared/components/SearchBar";
import { useUserLocation } from "../hooks/useUserLocation";
import { usePlanlessSearch } from "../search/hooks/usePlanlessSearch";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { isAuthenticDiningVenue } from "../services/venueRelevance";
import {
  initPlaceOverridesRealtime,
  subscribePlaceOverrides,
  fetchPlaceOverrides,
  applyPlaceOverridesSync,
} from "../services/placeOverridesService";
import { useDiscoveryStream } from "../hooks/useDiscoveryStream";
import { DiscoveryFeedSkeleton } from "../components/DiscoveryFeedSkeleton";
import { ADMIN_CONFIGS } from "../services/discoveryAdminService";

interface DiscoverDiningProps {
  sections: DiscoverySectionType[];
  isAdmin: boolean;
  onBack: () => void;
  onSelectDiscoveryItem: (item: DiscoveryItem) => void;
  onLongPressAdmin?: (item: DiscoveryItem, config: any) => void;
  currentCity?: string;
  currentLocality?: string;
  currentCoordinates?: { latitude: number; longitude: number };
}

interface SectionItemDef {
  id: string;
  title: string;
  subtitle?: string;
  items: DiscoveryItem[];
}

export const DiningFeedSkeleton = DiscoveryFeedSkeleton;

export const DiscoverDining: React.FC<DiscoverDiningProps> = ({
  sections,
  isAdmin: propIsAdmin,
  onBack,
  onSelectDiscoveryItem,
  onLongPressAdmin,
  currentCity,
  currentLocality,
  currentCoordinates,
}) => {
  const { isAdmin: storeIsAdmin } = useProfileStore();
  const isAdmin = Boolean(propIsAdmin || storeIsAdmin);
  const { coordinates: hookCoords, cityName, localityName } = useUserLocation();
  const activeCoordinates = currentCoordinates || hookCoords;
  const resolvedCity = currentCity || cityName || "Bengaluru";

  const [previewItem, setPreviewItem] = useState<DiscoveryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Active search query
  const activePlacesQuery = useMemo(() => {
    return searchQuery.trim();
  }, [searchQuery]);

  const isSearching = Boolean(activePlacesQuery);

  // Preloaded dining items from Discovery sections (used as lean starting seed if available)
  const rawSectionDiningItems = useMemo(() => {
    return sections
      .filter((s) => s.category?.toUpperCase() === "DINING")
      .flatMap((s) => s.items || []);
  }, [sections]);

  // 1. Progressive Dining Stream: Loads a lean initial batch, then progressively discovers
  // and appends additional distance-tiered sections as user scrolls.
  const {
    sections: streamSections,
    isLoadingInitial: isStreamLoading,
    isLoadingMore: isStreamLoadingMore,
    hasMore: hasMoreStream,
    sentinelRef: streamSentinelRef,
    loadMore: loadMoreStream,
  } = useDiscoveryStream({
    category: "DINING",
    initialItems: rawSectionDiningItems,
    currentCoordinates: activeCoordinates,
    currentCity: resolvedCity,
    initialBatchSize: 21,
  });

  // Stable callbacks and coordinates to prevent DiscoverySection remounts
  const handleSelectItem = useCallback((item: DiscoveryItem) => {
    setPreviewItem(item);
  }, []);

  const handleLongPressAdmin = useCallback(
    (item: DiscoveryItem) => {
      if (isAdmin && onLongPressAdmin) {
        onLongPressAdmin(item, ADMIN_CONFIGS.dining);
      }
    },
    [isAdmin, onLongPressAdmin]
  );

  const stableStreamCoordinates = useMemo(() => {
    if (!activeCoordinates) return null;
    return {
      latitude: activeCoordinates.latitude,
      longitude: activeCoordinates.longitude,
    };
  }, [activeCoordinates?.latitude, activeCoordinates?.longitude]);

  // Preserve scroll position when new venues are appended
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef<number>(0);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

      // Discard spurious layout-reset to 0 during background batch loading
      if (scrollTop === 0 && isStreamLoadingMore && lastScrollTopRef.current > 150) {
        return;
      }
      lastScrollTopRef.current = scrollTop;

      // Continuous infinite scroll trigger: fetch next row batch when user approaches bottom
      if (!isSearching && scrollHeight - (scrollTop + clientHeight) < 600) {
        if (!isStreamLoadingMore && hasMoreStream) {
          loadMoreStream();
        }
      }
    },
    [isSearching, isStreamLoadingMore, hasMoreStream, loadMoreStream]
  );

  React.useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (el && lastScrollTopRef.current > 0) {
      if (el.scrollTop === 0 && lastScrollTopRef.current > 0) {
        el.scrollTop = lastScrollTopRef.current;
      }
    }
  }, [streamSections]);

  // 2. Intent-Aware Search (active ONLY when user enters a non-empty search query)
  const {
    isSearching: isSearchHookActive,
    isLoading: isSearchLoading,
    searchResults,
    searchCoordinates: activeSearchCoordinates,
    resolvedLocationName,
    isLoadingMore: isSearchLoadingMore,
    sentinelRef: searchSentinelRef,
  } = usePlanlessSearch({
    category: "DINING",
    searchQuery: activePlacesQuery,
    currentCoordinates: activeCoordinates,
    currentCity: resolvedCity,
    debounceMs: 300,
    enableEndlessCycling: false,
  });

  const effectiveOriginCoords = activeSearchCoordinates || activeCoordinates;

  // Local cache reactive trigger for instant updates on local admin edits and realtime events
  const [overridesVersion, setOverridesVersion] = useState(0);

  useEffect(() => {
    // 1. Ensure realtime subscription is active on discovery_place_overrides
    const unsubscribeRealtime = initPlaceOverridesRealtime();

    // 2. Fetch fresh overrides into memory
    fetchPlaceOverrides();

    // 3. Subscribe to local and remote override events to update local UI cache immediately
    const unsubscribeListener = subscribePlaceOverrides(() => {
      setOverridesVersion((v) => v + 1);
    });

    return () => {
      unsubscribeListener();
      unsubscribeRealtime();
    };
  }, []);

  // Search Results: Filtered strictly for authentic dining places, applying database overrides
  const searchPlaces = useMemo(() => {
    if (!isSearching) return [];
    const valid = searchResults.filter((it) => isAuthenticDiningVenue(it));
    return applyPlaceOverridesSync(valid);
  }, [isSearching, searchResults, overridesVersion]);

  // Continuous search section when search query is active
  const searchSection = useMemo((): SectionItemDef[] => {
    if (!isSearching) return [];
    if (searchPlaces.length === 0) return [];
    const title = resolvedLocationName
      ? `Places in ${resolvedLocationName}`
      : `Results for "${searchQuery.trim()}"`;
    return [
      {
        id: "sec_dining_search",
        title,
        subtitle: `${searchPlaces.length} places found`,
        items: searchPlaces,
      },
    ];
  }, [isSearching, searchPlaces, resolvedLocationName, searchQuery]);

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 flex flex-col h-full bg-[#000000] overflow-y-auto no-scrollbar pb-6 pb-[env(safe-area-inset-bottom,16px)] text-left select-none"
      style={{
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        overflowAnchor: "none",
      }}
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
              Dining
            </h2>
            <span className="text-[11px] text-rose-400 font-medium mt-0.5 leading-none">
              Discover places to eat
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. SEARCH BAR ── */}
      <div className="shrink-0 bg-[#000000] px-4 pt-2 pb-1.5 select-none">
        <SearchBar
          id="search-dining-input"
          name="searchDiningInput"
          placeholder="Search restaurants, cafes, places..."
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

      {/* ── 3. CONTINUOUS DINING FEED (Closest-First, Distance-Tiered) ── */}
      <div className="space-y-8 pt-4 pb-8 flex-1">
        {isSearching ? (
          isSearchLoading && searchPlaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
              <p className="text-xs text-zinc-400 font-medium">
                Searching Google Places...
              </p>
            </div>
          ) : searchSection.length > 0 ? (
            <div className="space-y-8">
              {searchSection.map((sec) => (
                <DiscoverySection
                  key={sec.id}
                  id={sec.id}
                  title={sec.title}
                  subtitle={sec.subtitle}
                  items={sec.items}
                  colorAccent="text-rose-500"
                  userCoordinates={effectiveOriginCoords}
                  isAdmin={isAdmin}
                  onSelectItem={handleSelectItem}
                  onLongPressAdmin={
                    isAdmin && onLongPressAdmin ? handleLongPressAdmin : undefined
                  }
                />
              ))}

              {/* Endless Scroll Sentinel for search */}
              <div ref={searchSentinelRef} className="h-6 w-full pointer-events-none" />
              {isSearchLoadingMore && (
                <div className="flex items-center justify-center py-6 gap-2 text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                  <span className="text-xs font-medium">Finding more eateries nearby...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="px-6 py-16 text-center space-y-2">
              <p className="text-zinc-300 text-sm font-medium">
                No places found for &quot;{searchQuery.trim()}&quot;
              </p>
              <p className="text-zinc-500 text-xs">
                Try searching for another place or location.
              </p>
            </div>
          )
        ) : streamSections.length > 0 ? (
          <div className="space-y-8">
            {streamSections.map((sec) => (
              <DiscoverySection
                key={sec.id}
                id={sec.id}
                title={sec.title}
                subtitle={sec.subtitle}
                items={sec.items}
                colorAccent="text-rose-500"
                userCoordinates={stableStreamCoordinates}
                isAdmin={isAdmin}
                onSelectItem={handleSelectItem}
                onLongPressAdmin={
                  isAdmin && onLongPressAdmin ? handleLongPressAdmin : undefined
                }
              />
            ))}

            {/* Progressive Infinite Stream Sentinel for continuous feed */}
            {hasMoreStream && (
              <div ref={streamSentinelRef} className="h-6 w-full pointer-events-none" />
            )}
            {isStreamLoadingMore && (
              <div className="flex items-center justify-center py-6 gap-2 text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                <span className="text-xs font-medium">Loading more dining places...</span>
              </div>
            )}
          </div>
        ) : isStreamLoading ? (
          <DiscoveryFeedSkeleton />
        ) : (
          <div className="px-6 py-16 text-center space-y-2">
            <p className="text-zinc-500 text-sm font-normal">
              No dining places found near {resolvedCity}.
            </p>
          </div>
        )}
      </div>

      {/* ── 4. PLACE PREVIEW SHEET ── */}
      {previewItem && (
        <PlacePreviewSheet
          item={previewItem}
          userCoordinates={effectiveOriginCoords}
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
