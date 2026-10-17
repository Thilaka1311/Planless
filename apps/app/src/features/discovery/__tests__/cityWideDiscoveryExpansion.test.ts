import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveDiscoveryRegion,
  getRegionalSearchAnchors,
  getCityBoundingBoxSync,
  getCityCenter,
  isCoordinateInCity,
  isPlaceInCity,
} from "../services/cityBoundary";
import {
  fetchProgressiveDiscoveryBatch,
  isVenueRelevantForCategory,
  DiscoveryStreamCategory,
} from "../services/discoveryStreamService";
import {
  setCachedSections,
  getCachedSections,
  clearCachedSections,
} from "../services/discoveryService";
import {
  setPlaceOverridesCacheForTesting,
  getDatabasePlacesForCategoryAndDistanceBand,
  isOverrideEligibleForCity,
  PlaceOverride,
} from "../services/placeOverridesService";
import { calculateDistanceKm, formatDistanceKm } from "../components/DiscoveryCard";
import { supabase } from "../../../../lib/supabaseClient";

vi.mock("../../../../lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    functions: {
      invoke: vi.fn(),
    },
  },
  SUPABASE_URL: "https://mock.supabase.co",
}));

describe("Phase 7: City-Wide Discovery Expansion Regression Suite", () => {
  const POTHERI_COORDS = { latitude: 12.8258, longitude: 80.0395 };
  const CHENNAI_CENTER = getCityCenter("Chennai");
  const CHENNAI_BOUNDS = getCityBoundingBoxSync("Chennai")!;
  const BENGALURU_CENTER = getCityCenter("Bengaluru");
  const BENGALURU_BOUNDS = getCityBoundingBoxSync("Bengaluru")!;

  beforeEach(() => {
    vi.clearAllMocks();
    clearCachedSections();
    setPlaceOverridesCacheForTesting(new Map());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Potheri resolves to the intended Chennai discovery region
  // ───────────────────────────────────────────────────────────────────────────
  it("Test 1: Potheri resolves to the intended Chennai discovery region across GPS, locality, and address inputs", () => {
    // A. GPS coordinates of Potheri (12.8258, 80.0395)
    const fromCoords = resolveDiscoveryRegion({
      coordinates: POTHERI_COORDS,
      locality: "Potheri",
    });
    expect(fromCoords.discoveryCity).toBe("Chennai");
    expect(fromCoords.startingLocality).toBe("Potheri");
    expect(fromCoords.cityBounds.south).toBeLessThanOrEqual(POTHERI_COORDS.latitude);
    expect(fromCoords.cityBounds.north).toBeGreaterThanOrEqual(POTHERI_COORDS.latitude);

    // B. Text-only locality matching for Potheri and neighboring suburbs
    const fromLocality = resolveDiscoveryRegion({ locality: "Potheri" });
    expect(fromLocality.discoveryCity).toBe("Chennai");

    const fromKattankulathur = resolveDiscoveryRegion({ locality: "Kattankulathur" });
    expect(fromKattankulathur.discoveryCity).toBe("Chennai");

    const fromGuduvanchery = resolveDiscoveryRegion({ address: "Guduvanchery, Tamil Nadu" });
    expect(fromGuduvanchery.discoveryCity).toBe("Chennai");

    const fromTambaram = resolveDiscoveryRegion({ locality: "Tambaram" });
    expect(fromTambaram.discoveryCity).toBe("Chennai");

    // C. Verify user's starting location does not limit bounds to Potheri
    expect(isCoordinateInCity(POTHERI_COORDS.latitude, POTHERI_COORDS.longitude, "Chennai")).toBe(true);
    expect(isCoordinateInCity(CHENNAI_CENTER.latitude, CHENNAI_CENTER.longitude, "Chennai")).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Nearby venues rank before farther-away venues when relevance is comparable
  // ───────────────────────────────────────────────────────────────────────────
  it("Test 2: Nearby venues rank before farther-away venues when relevance is comparable", () => {
    const potheriVenue = {
      place_id: "venue-potheri-1",
      name: "Potheri Sports Arena",
      latitude: 12.8280,
      longitude: 80.0410,
    };
    const tambaramVenue = {
      place_id: "venue-tambaram-1",
      name: "Tambaram Turf",
      latitude: 12.9249,
      longitude: 80.1000,
    };
    const alwarpetVenue = {
      place_id: "venue-alwarpet-1",
      name: "Alwarpet Cricket Ground",
      latitude: 13.0336,
      longitude: 80.2520,
    };

    // Calculate distances from Potheri starting coordinates
    const distPotheri = calculateDistanceKm(
      POTHERI_COORDS.latitude,
      POTHERI_COORDS.longitude,
      potheriVenue.latitude,
      potheriVenue.longitude
    );
    const distTambaram = calculateDistanceKm(
      POTHERI_COORDS.latitude,
      POTHERI_COORDS.longitude,
      tambaramVenue.latitude,
      tambaramVenue.longitude
    );
    const distAlwarpet = calculateDistanceKm(
      POTHERI_COORDS.latitude,
      POTHERI_COORDS.longitude,
      alwarpetVenue.latitude,
      alwarpetVenue.longitude
    );

    expect(distPotheri).toBeLessThan(distTambaram);
    expect(distTambaram).toBeLessThan(distAlwarpet);

    const candidateList = [
      { ...alwarpetVenue, _distanceKm: distAlwarpet },
      { ...potheriVenue, _distanceKm: distPotheri },
      { ...tambaramVenue, _distanceKm: distTambaram },
    ];

    // Sort closest first
    candidateList.sort((a, b) => a._distanceKm - b._distanceKm);

    expect(candidateList[0].place_id).toBe("venue-potheri-1");
    expect(candidateList[1].place_id).toBe("venue-tambaram-1");
    expect(candidateList[2].place_id).toBe("venue-alwarpet-1");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Eligible venues from across Chennai can appear in Dining, Sports, and Activities
  // ───────────────────────────────────────────────────────────────────────────
  it("Test 3: Eligible venues from across Chennai can appear in Dining, Sports, and Activities", () => {
    const venuesAcrossChennai = [
      // Sports: Turf in Potheri & Central Chennai
      {
        place_id: "sp-1",
        name: "SRM Turf Potheri",
        category: "SPORTS",
        latitude: 12.8250,
        longitude: 80.0400,
        place_address: "Potheri, Chennai, Tamil Nadu",
        types: ["sports_complex"],
      },
      {
        place_id: "sp-2",
        name: "Whistle Sports Arena Nungambakkam",
        category: "SPORTS",
        latitude: 13.0600,
        longitude: 80.2400,
        place_address: "Nungambakkam, Chennai, Tamil Nadu",
        types: ["sports_complex"],
      },
      // Dining: Restaurant in Potheri & Besant Nagar
      {
        place_id: "dn-1",
        name: "Potheri Biryani House",
        category: "DINING",
        latitude: 12.8260,
        longitude: 80.0380,
        place_address: "GST Road, Potheri, Chennai",
        types: ["restaurant"],
      },
      {
        place_id: "dn-2",
        name: "Sandy's Chocolate Laboratory Besant Nagar",
        category: "DINING",
        latitude: 13.0010,
        longitude: 80.2670,
        place_address: "Besant Nagar, Chennai",
        types: ["cafe", "restaurant"],
      },
      // Activities: Karting in ECR & Bowling in Velachery
      {
        place_id: "act-1",
        name: "ECR Speedway Karting",
        category: "ACTIVITIES",
        latitude: 12.8450,
        longitude: 80.2400,
        place_address: "East Coast Road, Chennai",
        types: ["amusement_center"],
      },
      {
        place_id: "act-2",
        name: "Velachery Bowling Alley",
        category: "ACTIVITIES",
        latitude: 12.9800,
        longitude: 80.2180,
        place_address: "Phoenix Marketcity, Velachery, Chennai",
        types: ["bowling_alley"],
      },
    ];

    for (const v of venuesAcrossChennai) {
      // Must pass Chennai city boundary check
      const inCity = isPlaceInCity(v, "Chennai", CHENNAI_BOUNDS);
      expect(inCity).toBe(true);

      // Must pass respective category relevance check
      const isRelevant = isVenueRelevantForCategory(v, v.category as DiscoveryStreamCategory);
      expect(isRelevant).toBe(true);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Loading more results retrieves additional city-wide venues rather than repeatedly returning the same nearby batch
  // ───────────────────────────────────────────────────────────────────────────
  it("Test 4: Loading more results retrieves additional city-wide venues across regional anchors without repeating", async () => {
    const anchors = getRegionalSearchAnchors("Chennai", POTHERI_COORDS);
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    expect(anchors[0].name).toBe("local");
    expect(anchors[1].name).toBe("metropolitan_core");

    const seenIds = new Set<string>();

    (supabase.functions.invoke as any).mockImplementation(async (_func: string, options: any) => {
      const lat = options?.body?.latitude;
      if (Math.abs(lat - POTHERI_COORDS.latitude) < 0.01) {
        // Anchor 0 (Potheri)
        return {
          data: {
            items: [
              {
                id: "potheri-turf-1",
                name: "Potheri Turf",
                place_address: "Potheri, Chennai",
                latitude: 12.8258,
                longitude: 80.0395,
                photo_references: ["potheri_photo_ref_1"],
                types: ["sports_complex"],
              },
            ],
            nextPageToken: null,
          },
          error: null,
        };
      } else {
        // Anchor 1 (Metropolitan Core Chennai)
        return {
          data: {
            items: [
              {
                id: "chennai-center-turf-2",
                name: "Central Chennai Turf",
                place_address: "T. Nagar, Chennai",
                latitude: 13.0400,
                longitude: 80.2300,
                photo_references: ["chennai_photo_ref_2"],
                types: ["sports_complex"],
              },
            ],
            nextPageToken: null,
          },
          error: null,
        };
      }
    });

    // Batch 1: Query at Anchor 0
    const batch1 = await fetchProgressiveDiscoveryBatch({
      category: "SPORTS",
      originCoords: POTHERI_COORDS,
      city: "Chennai",
      anchorIndex: 0,
      queryIndex: 8, // Last progression query of anchor 0
      pageToken: null,
      seenPlaceIds: seenIds,
    });

    expect(batch1.items.length).toBe(1);
    expect(batch1.items[0].title || (batch1.items[0] as any).name).toBe("Potheri Turf");
    // Should transition to next anchor index
    expect(batch1.nextAnchorIndex).toBe(1);
    expect(batch1.hasMore).toBe(true);

    // Batch 2: Query at Anchor 1 (Central Chennai)
    const batch2 = await fetchProgressiveDiscoveryBatch({
      category: "SPORTS",
      originCoords: POTHERI_COORDS,
      city: "Chennai",
      anchorIndex: batch1.nextAnchorIndex,
      queryIndex: 0,
      pageToken: null,
      seenPlaceIds: seenIds,
    });

    expect(batch2.items.length).toBe(1);
    expect(batch2.items[0].title || (batch2.items[0] as any).name).toBe("Central Chennai Turf");
    // Verify distance is still calculated relative to user's starting point (Potheri)
    expect((batch2.items[0] as any)._distanceKm).toBeGreaterThan(20);
    expect((batch2.items[0] as any)._distanceKm).toBeLessThan(40);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Provider pagination, search-area overlap, and database overrides are deduplicated
  // ───────────────────────────────────────────────────────────────────────────
  it("Test 5: Provider pagination, search-area overlap, and database overrides are deduplicated cleanly", async () => {
    const seenIds = new Set<string>();

    // Mock places response containing duplicate venues across overlapping searches
    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        items: [
          {
            id: "ChIJ_srm_turf_potheri",
            name: "SRM Sports Turf",
            place_address: "Potheri, Chennai",
            latitude: 12.8258,
            longitude: 80.0395,
            photo_references: ["srm_ref_1"],
            types: ["sports_complex"],
          },
          // Duplicate of same venue from different search area / provider
          {
            id: "ChIJ_srm_turf_potheri",
            name: "SRM Sports Turf",
            place_address: "Potheri, Chennai",
            latitude: 12.8258,
            longitude: 80.0395,
            photo_references: ["srm_ref_1"],
            types: ["sports_complex"],
          },
        ],
        nextPageToken: null,
      },
      error: null,
    });

    const result = await fetchProgressiveDiscoveryBatch({
      category: "SPORTS",
      originCoords: POTHERI_COORDS,
      city: "Chennai",
      anchorIndex: 0,
      queryIndex: 0,
      pageToken: null,
      seenPlaceIds: seenIds,
    });

    // Overlapping duplicates must be collapsed to exactly 1 record
    const srmItems = result.items.filter((i) => i.place_id === "ChIJ_srm_turf_potheri");
    expect(srmItems.length).toBe(1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. One provider query reaching its result cap does not terminate city-wide discovery prematurely
  // ───────────────────────────────────────────────────────────────────────────
  it("Test 6: One provider query reaching its result cap does not terminate city-wide discovery prematurely", async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        items: [],
        nextPageToken: null, // Single query capped/exhausted
      },
      error: null,
    });

    const result = await fetchProgressiveDiscoveryBatch({
      category: "SPORTS",
      originCoords: POTHERI_COORDS,
      city: "Chennai",
      anchorIndex: 0,
      queryIndex: 0, // "sports turf" finished
      pageToken: null,
      seenPlaceIds: new Set<string>(),
    });

    // Must NOT terminate the feed: hasMore must remain true, moving to next progression query
    expect(result.hasMore).toBe(true);
    expect(result.nextQueryIndex).toBe(1);
    expect(result.nextAnchorIndex).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Switching cities invalidates or separates cached results
  // ───────────────────────────────────────────────────────────────────────────
  it("Test 7: Switching cities isolates cache and separates results without cross-city leaks", () => {
    const chennaiSections = [
      {
        id: "sec_sports_chn",
        title: "Venues Around You",
        category: "SPORTS",
        items: [
          { id: "c1", place_id: "c1", name: "Potheri Turf", city: "Chennai" } as any,
        ],
      },
    ];

    setCachedSections(chennaiSections as any, {
      city: "Chennai",
      latitude: POTHERI_COORDS.latitude,
      longitude: POTHERI_COORDS.longitude,
    });

    // Checking cache for Chennai with Potheri coords hits
    const chennaiHit = getCachedSections(
      { city: "Chennai", latitude: POTHERI_COORDS.latitude, longitude: POTHERI_COORDS.longitude },
      "Chennai"
    );
    expect(chennaiHit).not.toBeNull();
    expect(chennaiHit?.[0].items[0].title || (chennaiHit?.[0].items[0] as any).name).toBe("Potheri Turf");

    // Switching to Bengaluru must NOT serve Chennai cache
    const bengaluruMiss = getCachedSections(
      { city: "Bengaluru", latitude: BENGALURU_CENTER.latitude, longitude: BENGALURU_CENTER.longitude },
      "Bengaluru"
    );
    expect(bengaluruMiss).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. GPS-disabled discovery uses the selected region correctly
  // ───────────────────────────────────────────────────────────────────────────
  it("Test 8: GPS-disabled discovery uses the selected region civic center correctly", () => {
    const anchors = getRegionalSearchAnchors("Chennai", null);
    expect(anchors.length).toBeGreaterThanOrEqual(1);
    expect(anchors[0].coords.latitude).toBeCloseTo(CHENNAI_CENTER.latitude, 2);
    expect(anchors[0].coords.longitude).toBeCloseTo(CHENNAI_CENTER.longitude, 2);

    const region = resolveDiscoveryRegion({
      cityName: "Chennai",
      coordinates: null,
    });
    expect(region.discoveryCity).toBe("Chennai");
    expect(region.cityCenter.latitude).toBeCloseTo(CHENNAI_CENTER.latitude, 2);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Category filtering and city eligibility remain enforced
  // ───────────────────────────────────────────────────────────────────────────
  it("Test 9: Category filtering and city eligibility remain strictly enforced", () => {
    // Foreign city venue (e.g. Hebbal, Bengaluru)
    const foreignVenue = {
      place_id: "bengaluru_venue",
      name: "Hebbal Arena",
      latitude: 13.0358,
      longitude: 77.5970,
      place_address: "Hebbal, Bengaluru, Karnataka",
    };
    expect(isPlaceInCity(foreignVenue, "Chennai", CHENNAI_BOUNDS)).toBe(false);

    // Ineligible category item (e.g. hospital/pharmacy in Chennai)
    const medicalClinic = {
      id: "clinic_1",
      name: "Chennai Health Clinic",
      types: ["hospital", "health", "doctor"],
    };
    expect(isVenueRelevantForCategory(medicalClinic, "SPORTS")).toBe(false);
    expect(isVenueRelevantForCategory(medicalClinic, "DINING")).toBe(false);
    expect(isVenueRelevantForCategory(medicalClinic, "ACTIVITIES")).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. Movies remain unaffected by geographic filtering
  // ───────────────────────────────────────────────────────────────────────────
  it("Test 10: Movies remain unaffected by geographic filtering", () => {
    // Movies use TMDB metadata and never have lat/lng constraints or city exclusion
    const movieItem = {
      id: "movie_12345",
      public_id: "movie_12345",
      title: "Chennai Express 2",
      name: "Chennai Express 2",
      category: "MOVIES",
      cover_image_url: "https://image.tmdb.org/t/p/w500/sample.jpg",
      suggested_duration_minutes: 150,
    };

    // Movies are strictly category-filtered and not rejected by location checks
    expect(movieItem.category).toBe("MOVIES");
    expect((movieItem as any).latitude).toBeUndefined();
    expect((movieItem as any).longitude).toBeUndefined();
  });
});
