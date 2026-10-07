import { useState, useEffect, useRef, useCallback, useMemo } from "react";

import { DiscoveryItem } from "../../../core/types/discovery";
import {
  fetchProgressiveDiscoveryBatch,
  DiscoveryStreamCategory,
  GeoPoint,
  isVenueRelevantForCategory,
} from "../services/discoveryStreamService";
import {
  applyPlaceOverridesSync,
  getDatabasePlacesForCategoryAndDistanceBand,
  fetchPlaceOverrides,
} from "../services/placeOverridesService";
import { calculateDistanceKm, formatDistanceKm } from "../components/DiscoveryCard";
import { getStoredDiscoveryLocation } from "../hooks/useUserLocation";
import {
  extractCleanPlaceId,
  hasOwnerPostedPhoto,
  getVenueDeduplicationKeys,
  areVenuesIdentical,
  mergeDuplicateVenues,
} from "../services/venueRelevance";

export interface StreamSection {
  id: string;
  title: string;
  subtitle: string;
  items: DiscoveryItem[];
}

export interface UseDiscoveryStreamProps {
  category: DiscoveryStreamCategory;
  initialItems?: DiscoveryItem[];
  currentCoordinates?: GeoPoint | null;
  currentCity?: string;
  initialBatchSize?: number;
}

export interface UseDiscoveryStreamResult {
  sections: StreamSection[];
  allVenues: DiscoveryItem[];
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  sentinelRef: (node: HTMLElement | null) => void;
  resetStream: () => void;
}

export const DISCOVERY_CARDS_PER_ROW = 7;

export const SPORTS_SECTION_TITLES = [
  "Venues Around You",
  "More Venues",
  "You Can Also See",
  "Sports Around You",
  "More Sports to Explore",
  "Places Worth Exploring",
] as const;

export const DINING_SECTION_TITLES = [
  "Restaurants Around You",
  "More Restaurants",
  "You Can Also See",
  "Dining to Explore",
  "More Dining to Explore",
  "Places Worth Exploring",
] as const;

export const ACTIVITIES_SECTION_TITLES = [
  "Activities Around You",
  "More Activities",
  "You Can Also See",
  "Activities to Explore",
  "More Activities to Explore",
  "Places Worth Exploring",
] as const;

export function getCategorySectionTitles(category: DiscoveryStreamCategory): readonly string[] {
  switch (category) {
    case "SPORTS":
      return SPORTS_SECTION_TITLES;
    case "DINING":
      return DINING_SECTION_TITLES;
    case "ACTIVITIES":
      return ACTIVITIES_SECTION_TITLES;
  }
}

/**
 * Resolves the presentation title for a discovery row using the 6-title rotating cycle.
 * rowIndex is 0-indexed (Row 1 = 0, Row 2 = 1, etc.).
 *
 * Pattern:
 * Cycle 1 (Rows 1-6):   Title 1 -> Title 2 -> Title 3 -> Title 4 -> Title 5 -> Title 6
 * Cycle 2 (Rows 7-12):  Title 2 -> Title 3 -> Title 4 -> Title 5 -> Title 6 -> Title 1
 * Cycle 3 (Rows 13-18): Title 3 -> Title 4 -> Title 5 -> Title 6 -> Title 1 -> Title 2
 * Continues shifting the starting point continuously across subsequent cycles.
 */
export function getDiscoverySectionTitle(
  category: DiscoveryStreamCategory,
  rowIndex: number
): string {
  const titles = getCategorySectionTitles(category);
  const n = titles.length; // 6
  const cycleIndex = Math.floor(rowIndex / n);
  const positionInCycle = rowIndex % n;
  const titleIndex = (positionInCycle + cycleIndex) % n;
  return titles[titleIndex];
}

/**
 * Normalizes all venues, calculates distances from user origin,
 * sorts ALL venues strictly ascending by distance, and chunks into
 * rows of exactly 7 cards with rotating section titles.
 */
export function createDistanceOrderedDiscoverySections(
  category: DiscoveryStreamCategory,
  venues: DiscoveryItem[],
  originCoords?: GeoPoint | null,
  chunkSize = DISCOVERY_CARDS_PER_ROW,
  startingRowIndex = 0
): { sections: StreamSection[]; sortedVenues: DiscoveryItem[] } {
  const origin = originCoords || getStoredDiscoveryLocation();
  const seenKeys = new Set<string>();
  const normalizedVenues: DiscoveryItem[] = [];

  for (const v of venues) {
    if (!v) continue;
    const cleanId = extractCleanPlaceId(v.place_id || v.id);
    const keys = getVenueDeduplicationKeys(v);
    if (!cleanId || keys.some((k) => seenKeys.has(k))) continue;
    if (normalizedVenues.some((existing) => areVenuesIdentical(existing, v))) continue;
    keys.forEach((k) => seenKeys.add(k));
    seenKeys.add(cleanId);

    const rawLat =
      v.latitude ??
      (v as any).geometry?.location?.lat ??
      (v as any).metadata?.latitude ??
      (v as any).lat;
    const rawLng =
      v.longitude ??
      (v as any).geometry?.location?.lng ??
      (v as any).metadata?.longitude ??
      (v as any).lng;
    const lat = rawLat != null ? Number(rawLat) : undefined;
    const lng = rawLng != null ? Number(rawLng) : undefined;

    let distKm: number =
      typeof (v as any)._distanceKm === "number" &&
      !isNaN((v as any)._distanceKm) &&
      (v as any)._distanceKm !== Infinity
        ? (v as any)._distanceKm
        : Infinity;

    if (
      origin &&
      typeof origin.latitude === "number" &&
      typeof origin.longitude === "number" &&
      typeof lat === "number" &&
      !isNaN(lat) &&
      typeof lng === "number" &&
      !isNaN(lng)
    ) {
      distKm = calculateDistanceKm(origin.latitude, origin.longitude, lat, lng);
    }

    normalizedVenues.push({
      ...v,
      place_id: cleanId,
      latitude: lat,
      longitude: lng,
      _distanceKm: distKm,
      distance: distKm !== Infinity ? formatDistanceKm(distKm) : v.distance,
    } as any);
  }

  // Pure distance ordering: strictly ascending distance across the combined result set
  normalizedVenues.sort((a, b) => {
    const da = typeof (a as any)._distanceKm === "number" ? (a as any)._distanceKm : Infinity;
    const db = typeof (b as any)._distanceKm === "number" ? (b as any)._distanceKm : Infinity;
    return da - db;
  });

  // Split into rows of EXACTLY chunkSize (7 cards) with rotating titles
  const sections: StreamSection[] = [];
  const prefix = category.toLowerCase();
  for (let i = 0; i < normalizedVenues.length; i += chunkSize) {
    const chunk = normalizedVenues.slice(i, i + chunkSize);
    const rowIndex = startingRowIndex + sections.length;
    const title = getDiscoverySectionTitle(category, rowIndex);
    sections.push({
      id: `sec_${prefix}_row_${rowIndex + 1}`,
      title,
      subtitle: "",
      items: chunk,
    });
  }

  return { sections, sortedVenues: normalizedVenues };
}

export function useDiscoveryStream(props: UseDiscoveryStreamProps): UseDiscoveryStreamResult {
  const {
    category,
    initialItems = [],
    currentCoordinates,
    currentCity = "Bengaluru",
    initialBatchSize = 21,
  } = props;

  // Deduplicate and filter initialItems upfront using canonical place identity
  const sanitizedInitialItems = useMemo(() => {
    if (!initialItems || initialItems.length === 0) return [];
    const relevant = initialItems.filter((it) => isVenueRelevantForCategory(it, category));
    const unique: DiscoveryItem[] = [];
    for (const item of relevant) {
      const idx = unique.findIndex((ex) => areVenuesIdentical(ex, item));
      if (idx === -1) {
        unique.push(item);
      } else {
        unique[idx] = mergeDuplicateVenues(unique[idx], item);
      }
    }
    return unique;
  }, [initialItems, category]);

  // Compute synchronous initial sections from preloaded items (if provided)
  // to avoid any skeleton flash on first mount and support SSR / testing
  const initialCalculated = useMemo(() => {
    if (sanitizedInitialItems.length === 0) {
      return { sections: [] as StreamSection[], venues: [] as DiscoveryItem[] };
    }
    const { sections, sortedVenues } = createDistanceOrderedDiscoverySections(
      category,
      sanitizedInitialItems.slice(0, initialBatchSize),
      currentCoordinates,
      DISCOVERY_CARDS_PER_ROW
    );
    return { sections, venues: sortedVenues };
  }, [sanitizedInitialItems, category, currentCoordinates, initialBatchSize]);

  const [sections, setSections] = useState<StreamSection[]>(initialCalculated.sections);
  const [allVenues, setAllVenues] = useState<DiscoveryItem[]>(initialCalculated.venues);
  const [isLoadingInitial, setIsLoadingInitial] = useState(() => initialCalculated.sections.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // In-memory registry of all unique loaded venues keyed by clean place_id
  const venuesMapRef = useRef<Map<string, DiscoveryItem>>(
    new Map(
      initialCalculated.venues
        .map((v) => {
          const cid = extractCleanPlaceId(v.place_id || v.id);
          return cid ? [cid, v] : null;
        })
        .filter(Boolean) as [string, DiscoveryItem][]
    )
  );

  // Buffer of sorted venues not yet committed into a 7-card row
  const pendingVenuesRef = useRef<DiscoveryItem[]>(
    sanitizedInitialItems.slice(initialBatchSize)
  );

  // Tracks maximum distance of already committed venues to guarantee monotonic append
  const currentMaxDistRef = useRef<number>(
    initialCalculated.venues.length > 0
      ? (initialCalculated.venues[initialCalculated.venues.length - 1] as any)._distanceKm || 0
      : 0
  );

  // Tracks how many rows have been committed
  const committedRowCountRef = useRef<number>(initialCalculated.sections.length);

  // Progressive query queue state stored in refs to prevent dependency loops
  const queryIndexRef = useRef<number>(0);
  const pageTokenRef = useRef<string | null>(null);
  const radiusMetersRef = useRef<number>(10000);

  // Authoritative Set of ALL place IDs and keys ever displayed in visible sections
  const seenPlaceIdsRef = useRef<Set<string>>(
    new Set(
      initialCalculated.venues.flatMap((v) => getVenueDeduplicationKeys(v)).filter(Boolean)
    )
  );

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelNodeRef = useRef<HTMLElement | null>(null);
  const isLoadingMoreRef = useRef(false);
  const isLoadingInitialRef = useRef(false);
  const hasMoreRef = useRef(true);
  const isInitializedRef = useRef(false);

  // Track previous coordinates to detect genuine location changes (> 500m)
  const prevCoordsRef = useRef<GeoPoint | null>(null);
  const prevCityRef = useRef<string>(currentCity);
  const prevCategoryRef = useRef<DiscoveryStreamCategory>(category);

  // Reset stream helper
  const resetStream = useCallback(() => {
    isInitializedRef.current = false;
    queryIndexRef.current = 0;
    pageTokenRef.current = null;
    radiusMetersRef.current = 10000;
    seenPlaceIdsRef.current.clear();
    venuesMapRef.current.clear();
    pendingVenuesRef.current = [];
    currentMaxDistRef.current = 0;
    committedRowCountRef.current = 0;
    setSections([]);
    setAllVenues([]);
    setHasMore(true);
    hasMoreRef.current = true;
    setIsLoadingInitial(true);
    isLoadingInitialRef.current = false;
    setIsLoadingMore(false);
    isLoadingMoreRef.current = false;
  }, []);

  // Fetch next batch helper: merges new venues, appends strictly sorted 7-card rows after existing results
  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || isLoadingInitialRef.current || !hasMoreRef.current || !currentCoordinates) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      // 1. Sync seenPlaceIdsRef with all currently displayed sections and venuesMap
      sections.forEach((sec) => {
        sec.items.forEach((item) => {
          getVenueDeduplicationKeys(item).forEach((k) => seenPlaceIdsRef.current.add(k));
          const cid = extractCleanPlaceId(item.place_id || item.id);
          if (cid) venuesMapRef.current.set(cid, item);
        });
      });

      // 2. Ingest uncommitted pending venues from memory buffer directly into candidateVenues
      const candidateVenues: DiscoveryItem[] = [];
      for (const item of pendingVenuesRef.current) {
        if (
          !candidateVenues.some((ex) => areVenuesIdentical(ex, item)) &&
          !sections.some((sec) => sec.items.some((ex) => areVenuesIdentical(ex, item)))
        ) {
          candidateVenues.push(item);
        }
      }
      pendingVenuesRef.current = [];

      // 3. Track all keys across displayed items and current candidate batch to avoid duplicate queries
      const querySeenPlaceIds = new Set<string>(seenPlaceIdsRef.current);
      candidateVenues.forEach((item) => {
        getVenueDeduplicationKeys(item).forEach((k) => querySeenPlaceIds.add(k));
      });

      // Helper to determine if incoming candidate venue is duplicate of any ALREADY DISPLAYED or buffered item.
      // Must check seenPlaceIdsRef.current (displayed items) and candidateVenues, NOT querySeenPlaceIds
      // (which fetchProgressiveDiscoveryBatch mutates with the incoming batch).
      const isAlreadyDisplayedOrBuffered = (candidate: DiscoveryItem): boolean => {
        if (candidateVenues.some((ex) => areVenuesIdentical(ex, candidate))) return true;
        if (sections.some((sec) => sec.items.some((ex) => areVenuesIdentical(ex, candidate)))) return true;
        const cid = extractCleanPlaceId(candidate.place_id || candidate.id);
        if (cid && (venuesMapRef.current.has(cid) || seenPlaceIdsRef.current.has(cid))) return true;
        const keys = getVenueDeduplicationKeys(candidate);
        if (keys.some((k) => seenPlaceIdsRef.current.has(k))) return true;
        return false;
      };

      // 4. If we don't have enough candidates to form at least 1 section of 7 cards, fetch progressive batches
      let loopAttempts = 0;
      while (candidateVenues.length < DISCOVERY_CARDS_PER_ROW && hasMoreRef.current && loopAttempts < 15) {
        loopAttempts++;
        const currentResult = await fetchProgressiveDiscoveryBatch({
          category,
          originCoords: currentCoordinates,
          city: currentCity,
          queryIndex: queryIndexRef.current,
          pageToken: pageTokenRef.current,
          radiusMeters: radiusMetersRef.current,
          seenPlaceIds: querySeenPlaceIds,
          minDistanceKm: 0,
          maxDistanceKm: 25,
        });

        queryIndexRef.current = currentResult.nextQueryIndex;
        pageTokenRef.current = currentResult.nextPageToken;
        radiusMetersRef.current = currentResult.radiusMeters;
        hasMoreRef.current = currentResult.hasMore;
        setHasMore(currentResult.hasMore);

        for (const item of currentResult.items) {
          if (!isAlreadyDisplayedOrBuffered(item)) {
            candidateVenues.push(item);
            getVenueDeduplicationKeys(item).forEach((k) => querySeenPlaceIds.add(k));
          }
        }
      }

      // Apply overrides and ensure distances are computed
      const processedCandidates = applyPlaceOverridesSync(candidateVenues).map((v) => {
        let dist = typeof (v as any)._distanceKm === "number" ? (v as any)._distanceKm : undefined;
        if (dist === undefined && v.latitude != null && v.longitude != null) {
          dist = calculateDistanceKm(
            currentCoordinates.latitude,
            currentCoordinates.longitude,
            Number(v.latitude),
            Number(v.longitude)
          );
        }
        return {
          ...v,
          _distanceKm: dist !== undefined ? dist : Infinity,
          distance: dist !== undefined && dist !== Infinity ? formatDistanceKm(dist) : v.distance,
        };
      });

      // Deduplicate processedCandidates one final time before splitting into rows
      const strictlyUniqueCandidates: DiscoveryItem[] = [];
      for (const item of processedCandidates) {
        if (
          !strictlyUniqueCandidates.some((ex) => areVenuesIdentical(ex, item)) &&
          !sections.some((sec) => sec.items.some((ex) => areVenuesIdentical(ex, item)))
        ) {
          strictlyUniqueCandidates.push(item);
        }
      }

      // Pure distance ordering: strictly ascending distance
      strictlyUniqueCandidates.sort((a, b) => ((a as any)._distanceKm || Infinity) - ((b as any)._distanceKm || Infinity));

      const newRows: StreamSection[] = [];
      const newCommittedVenues: DiscoveryItem[] = [];
      let cursor = 0;
      const prefix = category.toLowerCase();

      while (cursor + DISCOVERY_CARDS_PER_ROW <= strictlyUniqueCandidates.length) {
        const chunk = strictlyUniqueCandidates.slice(cursor, cursor + DISCOVERY_CARDS_PER_ROW);
        const rowIndex = committedRowCountRef.current;
        const title = getDiscoverySectionTitle(category, rowIndex);
        newRows.push({
          id: `sec_${prefix}_row_${rowIndex + 1}`,
          title,
          subtitle: "",
          items: chunk,
        });
        committedRowCountRef.current += 1;
        chunk.forEach((item) => {
          const cid = extractCleanPlaceId(item.place_id || item.id);
          if (cid) venuesMapRef.current.set(cid, item);
          getVenueDeduplicationKeys(item).forEach((k) => seenPlaceIdsRef.current.add(k));
          newCommittedVenues.push(item);
        });
        cursor += DISCOVERY_CARDS_PER_ROW;
      }

      // If feed is exhausted, flush remaining items (< 7) into final row
      if (!hasMoreRef.current && cursor < strictlyUniqueCandidates.length) {
        const chunk = strictlyUniqueCandidates.slice(cursor);
        const rowIndex = committedRowCountRef.current;
        const title = getDiscoverySectionTitle(category, rowIndex);
        newRows.push({
          id: `sec_${prefix}_row_${rowIndex + 1}`,
          title,
          subtitle: "",
          items: chunk,
        });
        committedRowCountRef.current += 1;
        chunk.forEach((item) => {
          const cid = extractCleanPlaceId(item.place_id || item.id);
          if (cid) venuesMapRef.current.set(cid, item);
          getVenueDeduplicationKeys(item).forEach((k) => seenPlaceIdsRef.current.add(k));
          newCommittedVenues.push(item);
        });
        cursor = strictlyUniqueCandidates.length;
      }

      // Buffer leftovers not yet committed into a 7-card row
      pendingVenuesRef.current = strictlyUniqueCandidates.slice(cursor);

      if (newRows.length > 0) {
        const lastRow = newRows[newRows.length - 1];
        const lastCard = lastRow.items[lastRow.items.length - 1];
        if (typeof (lastCard as any)._distanceKm === "number" && (lastCard as any)._distanceKm !== Infinity) {
          currentMaxDistRef.current = (lastCard as any)._distanceKm;
        }

        // APPEND new rows smoothly — existing rows remain untouched in DOM
        setSections((prev) => [...prev, ...newRows]);
        setAllVenues((prev) => [...prev, ...newCommittedVenues]);
      }
    } catch (err) {
      console.warn(`[useDiscoveryStream] Error in loadMore (${category}):`, err);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [category, currentCoordinates, currentCity, sections]);

  // Keep loadMore in a ref so sentinelRef does not re-create on every render
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  // Initial load effect
  useEffect(() => {
    let isCancelled = false;

    // Detect if category or location changed genuinely
    const categoryChanged = prevCategoryRef.current !== category;
    const coordsChanged =
      Boolean(prevCoordsRef.current && currentCoordinates &&
      (Math.abs(prevCoordsRef.current.latitude - currentCoordinates.latitude) > 0.005 ||
       Math.abs(prevCoordsRef.current.longitude - currentCoordinates.longitude) > 0.005)) ||
      Boolean(prevCoordsRef.current && prevCityRef.current !== currentCity);

    if (categoryChanged || coordsChanged) {
      prevCoordsRef.current = currentCoordinates || null;
      prevCityRef.current = currentCity;
      prevCategoryRef.current = category;
      resetStream();
    } else if (!prevCoordsRef.current && currentCoordinates) {
      prevCoordsRef.current = currentCoordinates;
    }

    if (!currentCoordinates) return;

    // Do NOT re-initialize feed if already initialized for these coordinates and category!
    // Prevents wiping dynamically loaded batches on parent re-renders.
    if (isInitializedRef.current) return;

    const initializeFeed = async () => {
      isLoadingInitialRef.current = true;
      setIsLoadingInitial(true);

      // ALWAYS guarantee fresh database overrides are loaded in memory BEFORE processing
      await fetchPlaceOverrides();

      if (isCancelled) return;

      // 1. Check if sanitizedInitialItems has relevant places
      if (sanitizedInitialItems.length > 0) {
        const seedItems: DiscoveryItem[] = [];

        // Prepare initial items with calculated distance
        for (const it of sanitizedInitialItems) {
          if (hasOwnerPostedPhoto(it) || it.cover_image_url) {
            const rawLat =
              it.latitude ??
              (it as any).geometry?.location?.lat ??
              (it as any).metadata?.latitude ??
              (it as any).lat;
            const rawLng =
              it.longitude ??
              (it as any).geometry?.location?.lng ??
              (it as any).metadata?.longitude ??
              (it as any).lng;
            const pLat = rawLat != null ? Number(rawLat) : undefined;
            const pLng = rawLng != null ? Number(rawLng) : undefined;
            let distKm =
              typeof (it as any)._distanceKm === "number" && !isNaN((it as any)._distanceKm)
                ? (it as any)._distanceKm
                : undefined;
            if (distKm === undefined && pLat != null && pLng != null && currentCoordinates) {
              distKm = calculateDistanceKm(
                currentCoordinates.latitude,
                currentCoordinates.longitude,
                pLat,
                pLng
              );
            }

            const cleanId = extractCleanPlaceId(it.place_id || it.id);
            const normalizedItem: DiscoveryItem = {
              ...it,
              place_id: cleanId,
              latitude: pLat,
              longitude: pLng,
              _distanceKm: distKm,
              distance: distKm !== undefined ? formatDistanceKm(distKm) : it.distance,
            } as any;

            const existingIdx = seedItems.findIndex((ex) => areVenuesIdentical(ex, normalizedItem));
            if (existingIdx === -1) {
              seedItems.push(normalizedItem);
            } else {
              seedItems[existingIdx] = mergeDuplicateVenues(seedItems[existingIdx], normalizedItem);
            }
          }
        }

        // Sort seed items closest-first
        seedItems.sort((a, b) => {
          const da = typeof (a as any)._distanceKm === "number" ? (a as any)._distanceKm : Infinity;
          const db = typeof (b as any)._distanceKm === "number" ? (b as any)._distanceKm : Infinity;
          return da - db;
        });

        // Take initial batch
        const initialBatch = seedItems.slice(0, initialBatchSize);
        const leftovers = seedItems.slice(initialBatchSize);

        // Reset and rebuild refs cleanly
        venuesMapRef.current.clear();
        seenPlaceIdsRef.current.clear();

        initialBatch.forEach((it) => {
          const cid = extractCleanPlaceId(it.place_id || it.id);
          if (cid) venuesMapRef.current.set(cid, it);
          getVenueDeduplicationKeys(it).forEach((k) => seenPlaceIdsRef.current.add(k));
        });

        // Inject database venues in this immediate proximity band (0-3km)
        const dbVenues = getDatabasePlacesForCategoryAndDistanceBand(
          category,
          currentCoordinates,
          0,
          3,
          seenPlaceIdsRef.current
        );
        dbVenues.forEach((it) => {
          if (!initialBatch.some((ex) => areVenuesIdentical(ex, it))) {
            const cid = extractCleanPlaceId(it.place_id || it.id);
            if (cid) venuesMapRef.current.set(cid, it);
            getVenueDeduplicationKeys(it).forEach((k) => seenPlaceIdsRef.current.add(k));
          }
        });

        // Set pending leftovers
        pendingVenuesRef.current = [];
        for (const it of leftovers) {
          if (
            !initialBatch.some((ex) => areVenuesIdentical(ex, it)) &&
            !dbVenues.some((ex) => areVenuesIdentical(ex, it))
          ) {
            pendingVenuesRef.current.push(it);
          }
        }

        const mergedInitial = applyPlaceOverridesSync(Array.from(venuesMapRef.current.values()));
        // Sort merged venues strictly ascending by distance
        mergedInitial.sort((a, b) => {
          const da = typeof (a as any)._distanceKm === "number" ? (a as any)._distanceKm : Infinity;
          const db = typeof (b as any)._distanceKm === "number" ? (b as any)._distanceKm : Infinity;
          return da - db;
        });

        let itemsToCommit = mergedInitial;
        let initialLeftovers: DiscoveryItem[] = [];
        if (mergedInitial.length >= DISCOVERY_CARDS_PER_ROW) {
          const fullRows = Math.floor(mergedInitial.length / DISCOVERY_CARDS_PER_ROW);
          const count = fullRows * DISCOVERY_CARDS_PER_ROW;
          itemsToCommit = mergedInitial.slice(0, count);
          initialLeftovers = mergedInitial.slice(count);
        }

        const { sections: initialSections, sortedVenues } = createDistanceOrderedDiscoverySections(
          category,
          itemsToCommit,
          currentCoordinates,
          DISCOVERY_CARDS_PER_ROW
        );

        pendingVenuesRef.current = [...initialLeftovers, ...pendingVenuesRef.current];

        // Ensure seenPlaceIdsRef and venuesMapRef match the committed visible venues
        venuesMapRef.current.clear();
        seenPlaceIdsRef.current.clear();
        sortedVenues.forEach((v) => {
          const cid = extractCleanPlaceId(v.place_id || v.id);
          if (cid) venuesMapRef.current.set(cid, v);
          getVenueDeduplicationKeys(v).forEach((k) => seenPlaceIdsRef.current.add(k));
        });

        if (!isCancelled) {
          committedRowCountRef.current = initialSections.length;
          if (sortedVenues.length > 0) {
            const lastVenue = sortedVenues[sortedVenues.length - 1];
            if (typeof (lastVenue as any)._distanceKm === "number" && (lastVenue as any)._distanceKm !== Infinity) {
              currentMaxDistRef.current = (lastVenue as any)._distanceKm;
            }
          }
          isInitializedRef.current = true;
          setSections(initialSections);
          setAllVenues(sortedVenues);
          isLoadingInitialRef.current = false;
          setIsLoadingInitial(false);

          if (sentinelNodeRef.current && observerRef.current) {
            observerRef.current.unobserve(sentinelNodeRef.current);
            observerRef.current.observe(sentinelNodeRef.current);
          }
        }
        return;
      }

      // 2. If no initial items provided, fetch Batch 1 directly from stream service
      try {
        const result = await fetchProgressiveDiscoveryBatch({
          category,
          originCoords: currentCoordinates,
          city: currentCity,
          queryIndex: 0,
          radiusMeters: 10000,
          seenPlaceIds: seenPlaceIdsRef.current,
          minDistanceKm: 0,
          maxDistanceKm: 5,
        });

        if (!isCancelled) {
          queryIndexRef.current = result.nextQueryIndex;
          pageTokenRef.current = result.nextPageToken;
          radiusMetersRef.current = result.radiusMeters;
          hasMoreRef.current = result.hasMore;
          setHasMore(result.hasMore);

          let batchToCommit = result.items;
          let batchLeftovers: DiscoveryItem[] = [];
          if (result.items.length >= DISCOVERY_CARDS_PER_ROW && result.hasMore) {
            const fullRows = Math.floor(result.items.length / DISCOVERY_CARDS_PER_ROW);
            const count = fullRows * DISCOVERY_CARDS_PER_ROW;
            batchToCommit = result.items.slice(0, count);
            batchLeftovers = result.items.slice(count);
          }

          const { sections: initialSections, sortedVenues } = createDistanceOrderedDiscoverySections(
            category,
            batchToCommit,
            currentCoordinates,
            DISCOVERY_CARDS_PER_ROW
          );

          committedRowCountRef.current = initialSections.length;
          sortedVenues.forEach((v) => {
            const cid = extractCleanPlaceId(v.place_id || v.id);
            if (cid) venuesMapRef.current.set(cid, v);
            getVenueDeduplicationKeys(v).forEach((k) => seenPlaceIdsRef.current.add(k));
          });

          pendingVenuesRef.current = batchLeftovers;

          if (sortedVenues.length > 0) {
            const lastVenue = sortedVenues[sortedVenues.length - 1];
            if (typeof (lastVenue as any)._distanceKm === "number" && (lastVenue as any)._distanceKm !== Infinity) {
              currentMaxDistRef.current = (lastVenue as any)._distanceKm;
            }
          }

          isInitializedRef.current = true;
          setSections(initialSections);
          setAllVenues(sortedVenues);
          isLoadingInitialRef.current = false;
          setIsLoadingInitial(false);

          if (sentinelNodeRef.current && observerRef.current) {
            observerRef.current.unobserve(sentinelNodeRef.current);
            observerRef.current.observe(sentinelNodeRef.current);
          }
        }
      } catch (err) {
        console.warn(`[useDiscoveryStream] Failed to load initial batch (${category}):`, err);
        if (!isCancelled) {
          isLoadingInitialRef.current = false;
          setIsLoadingInitial(false);
        }
      }
    };

    initializeFeed();

    return () => {
      isCancelled = true;
    };
  }, [category, currentCoordinates, currentCity, sanitizedInitialItems, initialBatchSize, resetStream]);

  // Infinite scroll intersection observer sentinel
  const sentinelRef = useCallback((node: HTMLElement | null) => {
    sentinelNodeRef.current = node;

    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (!node) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first && first.isIntersecting) {
          loadMoreRef.current();
        }
      },
      {
        root: null,
        rootMargin: "600px 0px",
      }
    );

    observerRef.current.observe(node);
  }, []);

  return {
    sections,
    allVenues,
    isLoadingInitial,
    isLoadingMore,
    hasMore,
    loadMore,
    sentinelRef,
    resetStream,
  };
}
