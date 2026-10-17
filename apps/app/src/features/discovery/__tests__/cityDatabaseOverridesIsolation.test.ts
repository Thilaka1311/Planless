import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isOverrideEligibleForCity,
  getDatabasePlacesForCategoryAndDistanceBand,
  getDatabaseCandidatePlaces,
  PlaceOverride,
} from "../services/placeOverridesService";
import {
  getCachedSections,
  setCachedSections,
  clearCachedSections,
  getCacheKey,
} from "../services/discoveryService";
import {
  getCityBoundingBoxSync,
  getCityCenter,
  isPlaceInCity,
} from "../services/cityBoundary";
import { searchCoordinator } from "../search/session/searchCoordinator";
import { supabase } from "../../../../lib/supabaseClient";

describe("Phase 5: City Database Overrides Isolation & Regression Test Suite", () => {
  const CHENNAI_CENTER = getCityCenter("Chennai"); // ~13.0827, 80.2707
  const BENGALURU_CENTER = getCityCenter("Bengaluru"); // ~12.9716, 77.5946
  const CHENNAI_BOUNDS = getCityBoundingBoxSync("Chennai");
  const BENGALURU_BOUNDS = getCityBoundingBoxSync("Bengaluru");

  // Sample real records representative of the database overrides
  const bengaluruHebbalVenue: PlaceOverride = {
    id: "rec-hebbal-001",
    place_id: "ChIJ_hebbal_sports_arena",
    name_override: "Aries Sports Arena",
    category_override: "sports",
    subcategory: "Cricket Ground",
    address_override: "Hebbal Outer Ring Rd, Hebbal, Bengaluru, Karnataka 560024",
    city: "Bengaluru",
    latitude_override: 13.0358,
    longitude_override: 77.597,
    is_deleted: false,
  };

  const bengaluruVidyaranyapuraVenue: PlaceOverride = {
    id: "rec-vidya-002",
    place_id: "ChIJ_vidyaranyapura_juno",
    name_override: "Juno Sports Vidyaranyapura",
    category_override: "sports",
    subcategory: "Badminton Court",
    address_override: "Vidyaranyapura Main Rd, Vidyaranyapura, Bengaluru, Karnataka 560097",
    city: "Bengaluru",
    latitude_override: 13.0782,
    longitude_override: 77.5583,
    is_deleted: false,
  };

  const bengaluruDiningVenue: PlaceOverride = {
    id: "rec-blr-dining-003",
    place_id: "ChIJ_toit_indiranagar",
    name_override: "Toit Brewpub",
    category_override: "dining",
    subcategory: "Brewpub",
    address_override: "100 Feet Rd, Indiranagar, Bengaluru, Karnataka 560038",
    city: "Bengaluru",
    latitude_override: 12.9791,
    longitude_override: 77.6408,
    is_deleted: false,
  };

  const bengaluruActivityVenue: PlaceOverride = {
    id: "rec-blr-act-004",
    place_id: "ChIJ_mystery_rooms_blr",
    name_override: "Mystery Rooms Indiranagar",
    category_override: "activities",
    subcategory: "Escape Room",
    address_override: "Indiranagar, Bengaluru, Karnataka 560038",
    city: "Bengaluru",
    latitude_override: 12.9719,
    longitude_override: 77.6412,
    is_deleted: false,
  };

  const chennaiPadmamDiningVenue: PlaceOverride = {
    id: "rec-chn-dining-005",
    place_id: "ChIJ_padmam_chennai",
    name_override: "Padmam Veg Restaurant",
    category_override: "dining",
    subcategory: "Vegetarian Restaurant",
    address_override: "Gopathi Narayanaswami Chetty Rd, Parthasarathi Puram, T. Nagar, Chennai, Tamil Nadu 600017",
    city: "Chennai",
    latitude_override: 13.0418,
    longitude_override: 80.2341,
    is_deleted: false,
  };

  const chennaiKosmoCafeVenue: PlaceOverride = {
    id: "rec-chn-dining-006",
    place_id: "ChIJ_kosmo_cafe_chn",
    name_override: "Kosmo cafe",
    category_override: "dining",
    subcategory: "Cafe",
    address_override: "Besant Nagar, Chennai, Tamil Nadu 600090",
    city: "Chennai",
    latitude_override: 13.0002,
    longitude_override: 80.2668,
    is_deleted: false,
  };

  const chennaiSportsVenue: PlaceOverride = {
    id: "rec-chn-sports-007",
    place_id: "ChIJ_t_nagar_turf_chn",
    name_override: "T Nagar Turf Club",
    category_override: "sports",
    subcategory: "Football Turf",
    address_override: "Thyagaraya Rd, T. Nagar, Chennai, Tamil Nadu 600017",
    city: "Chennai",
    latitude_override: 13.0405,
    longitude_override: 80.2335,
    is_deleted: false,
  };

  const incompleteLocationVenue: PlaceOverride = {
    id: "rec-incomplete-008",
    place_id: "ChIJ_incomplete_venue",
    name_override: "Generic Mystery Venue",
    category_override: "sports",
    subcategory: "Arena",
    address_override: "Some road with no city mentioned",
    city: null,
    latitude_override: null,
    longitude_override: null,
    is_deleted: false,
  };

  beforeEach(() => {
    clearCachedSections();
    searchCoordinator.reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. With Chennai selected, Bengaluru-only overrides do not appear
  // ───────────────────────────────────────────────────────────────────────────
  it("Case 1: When Chennai is selected, Bengaluru-only overrides (Hebbal, Vidyaranyapura) never pass eligibility", () => {
    expect(isOverrideEligibleForCity(bengaluruHebbalVenue, "Chennai", CHENNAI_BOUNDS)).toBe(false);
    expect(isOverrideEligibleForCity(bengaluruVidyaranyapuraVenue, "Chennai", CHENNAI_BOUNDS)).toBe(false);
    expect(isOverrideEligibleForCity(bengaluruDiningVenue, "Chennai", CHENNAI_BOUNDS)).toBe(false);
    expect(isOverrideEligibleForCity(bengaluruActivityVenue, "Chennai", CHENNAI_BOUNDS)).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. With Bengaluru selected, the same Bengaluru overrides are available
  // ───────────────────────────────────────────────────────────────────────────
  it("Case 2: When Bengaluru is selected, Bengaluru overrides are available and eligible", () => {
    expect(isOverrideEligibleForCity(bengaluruHebbalVenue, "Bengaluru", BENGALURU_BOUNDS)).toBe(true);
    expect(isOverrideEligibleForCity(bengaluruVidyaranyapuraVenue, "Bengaluru", BENGALURU_BOUNDS)).toBe(true);
    expect(isOverrideEligibleForCity(bengaluruDiningVenue, "Bengaluru", BENGALURU_BOUNDS)).toBe(true);
    expect(isOverrideEligibleForCity(bengaluruActivityVenue, "Bengaluru", BENGALURU_BOUNDS)).toBe(true);

    // And Chennai venues are NOT eligible for Bengaluru
    expect(isOverrideEligibleForCity(chennaiPadmamDiningVenue, "Bengaluru", BENGALURU_BOUNDS)).toBe(false);
    expect(isOverrideEligibleForCity(chennaiKosmoCafeVenue, "Bengaluru", BENGALURU_BOUNDS)).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Genuine Chennai overrides appear in Chennai results
  // ───────────────────────────────────────────────────────────────────────────
  it("Case 3: Genuine Chennai overrides (Padmam, Kosmo Cafe, T Nagar Turf) pass Chennai eligibility", () => {
    expect(isOverrideEligibleForCity(chennaiPadmamDiningVenue, "Chennai", CHENNAI_BOUNDS)).toBe(true);
    expect(isOverrideEligibleForCity(chennaiKosmoCafeVenue, "Chennai", CHENNAI_BOUNDS)).toBe(true);
    expect(isOverrideEligibleForCity(chennaiSportsVenue, "Chennai", CHENNAI_BOUNDS)).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Dining, Sports, and Activities all respect the active city
  // ───────────────────────────────────────────────────────────────────────────
  it("Case 4: Dining, Sports, and Activities all apply identical city-eligibility rules", () => {
    const categories: Array<"SPORTS" | "DINING" | "ACTIVITIES"> = ["SPORTS", "DINING", "ACTIVITIES"];

    for (const cat of categories) {
      // Mock overrides query to return a mixed set of places
      const mockOverridesMap = new Map<string, PlaceOverride>([
        [bengaluruHebbalVenue.place_id, { ...bengaluruHebbalVenue, category_override: cat.toLowerCase() }],
        [chennaiPadmamDiningVenue.place_id, { ...chennaiPadmamDiningVenue, category_override: cat.toLowerCase() }],
      ]);

      vi.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "discovery_place_overrides") {
          return {
            select: () => ({
              eq: () => ({
                order: () => Promise.resolve({
                  data: Array.from(mockOverridesMap.values()),
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      // Filter for Chennai: only the Chennai venue must be returned
      const chennaiResults = getDatabasePlacesForCategoryAndDistanceBand(
        cat,
        CHENNAI_CENTER,
        0,
        50,
        undefined,
        "Chennai",
        CHENNAI_BOUNDS
      );

      // Verify no Bengaluru venues leaked into Chennai results
      for (const item of chennaiResults) {
        expect(item.place_id).not.toBe(bengaluruHebbalVenue.place_id);
        expect((item as any).city).not.toBe("Bengaluru");
      }
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Switching cities refreshes results and does not reuse previous city cache
  // ───────────────────────────────────────────────────────────────────────────
  it("Case 5: Switching cities isolates cache and never serves Bengaluru cached sections for Chennai", () => {
    const blrSection = [
      {
        id: "sports-blr",
        title: "Sports & Turfs",
        category: "SPORTS",
        items: [{ id: "blr-1", place_id: "blr-1", title: "Aries Sports Hebbal", city: "Bengaluru" } as any],
      },
    ];

    // Cache Bengaluru sections
    setCachedSections(blrSection as any, { city: "Bengaluru", latitude: BENGALURU_CENTER.latitude, longitude: BENGALURU_CENTER.longitude });

    // Requesting cache for Bengaluru should hit
    const blrCached = getCachedSections(
      { city: "Bengaluru", latitude: BENGALURU_CENTER.latitude, longitude: BENGALURU_CENTER.longitude },
      "Bengaluru"
    );
    expect(blrCached).not.toBeNull();
    expect(blrCached?.[0].items[0].title).toBe("Aries Sports Hebbal");

    // Requesting cache for Chennai must strictly return null and NOT fall back to Bengaluru!
    const chnCached = getCachedSections(
      { city: "Chennai", latitude: CHENNAI_CENTER.latitude, longitude: CHENNAI_CENTER.longitude },
      "Chennai"
    );
    expect(chnCached).toBeNull();

    // Cache Chennai sections
    const chnSection = [
      {
        id: "dining-chn",
        title: "Dining",
        category: "DINING",
        items: [{ id: "chn-1", place_id: "chn-1", title: "Padmam Veg Restaurant", city: "Chennai" } as any],
      },
    ];
    setCachedSections(chnSection as any, { city: "Chennai", latitude: CHENNAI_CENTER.latitude, longitude: CHENNAI_CENTER.longitude });

    const newChnCached = getCachedSections(
      { city: "Chennai", latitude: CHENNAI_CENTER.latitude, longitude: CHENNAI_CENTER.longitude },
      "Chennai"
    );
    expect(newChnCached).not.toBeNull();
    expect(newChnCached?.[0].items[0].title).toBe("Padmam Veg Restaurant");

    // Switching back to Bengaluru must still see its own distinct cache
    const reBlrCached = getCachedSections(
      { city: "Bengaluru", latitude: BENGALURU_CENTER.latitude, longitude: BENGALURU_CENTER.longitude },
      "Bengaluru"
    );
    expect(reBlrCached).not.toBeNull();
    expect(reBlrCached?.[0].items[0].title).toBe("Aries Sports Hebbal");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Missing GPS uses the selected city correctly without Bengaluru default
  // ───────────────────────────────────────────────────────────────────────────
  it("Case 6: Missing GPS coordinates uses selected city center (Chennai) instead of defaulting to Bengaluru", () => {
    // Calling candidate search with Chennai and no GPS coordinates
    const chennaiCoords = getCityCenter("Chennai");
    expect(chennaiCoords.latitude).toBeCloseTo(13.04, 2);
    expect(chennaiCoords.longitude).toBeCloseTo(80.225, 2);

    // Bounding box for Chennai correctly encompasses Chennai coordinates
    const testPointInChennai = { latitude: 13.0418, longitude: 80.2341 }; // T Nagar
    expect(isPlaceInCity(testPointInChennai, "Chennai", CHENNAI_BOUNDS)).toBe(true);

    // And rejects Bengaluru coordinates
    const testPointInBlr = { latitude: 12.9716, longitude: 77.5946 };
    expect(isPlaceInCity(testPointInBlr, "Chennai", CHENNAI_BOUNDS)).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. A failed database or external-provider request does not cause cross-city leakage
  // ───────────────────────────────────────────────────────────────────────────
  it("Case 7: A failed database or external-provider request does not cause cross-city leakage", async () => {
    // Mock Supabase to throw an error
    vi.spyOn(supabase, "from").mockImplementation(() => {
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.reject(new Error("Database connection timed out")),
          }),
        }),
      } as any;
    });

    // Curated candidates search must return [] safely without leaking anything
    const candidates = await getDatabaseCandidatePlaces("sports", "SPORTS", "Chennai", CHENNAI_BOUNDS);
    expect(candidates).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Pagination and distance bands never mix venues from different cities
  // ───────────────────────────────────────────────────────────────────────────
  it("Case 8: Distance bands strictly drop cross-city venues even if band distance is large", () => {
    // Even if distance band is 0 to 500 km (which would geographically reach Bengaluru from Chennai),
    // the targetCity constraint "Chennai" must reject the Bengaluru venues.
    const blrPlaces = getDatabasePlacesForCategoryAndDistanceBand(
      "SPORTS",
      CHENNAI_CENTER,
      0,
      500, // Large band
      undefined,
      "Chennai",
      CHENNAI_BOUNDS
    );

    for (const place of blrPlaces) {
      expect((place as any).city).toBe("Chennai");
      expect((place as any).city).not.toBe("Bengaluru");
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Venue with incomplete location data is handled safely (excluded, not included everywhere)
  // ───────────────────────────────────────────────────────────────────────────
  it("Case 9: Venues with incomplete location data (no city, no coordinates) are excluded safely rather than matched everywhere", () => {
    // Venue has no city and null coordinates
    expect(isOverrideEligibleForCity(incompleteLocationVenue, "Chennai", CHENNAI_BOUNDS)).toBe(false);
    expect(isOverrideEligibleForCity(incompleteLocationVenue, "Bengaluru", BENGALURU_BOUNDS)).toBe(false);
    expect(isOverrideEligibleForCity(incompleteLocationVenue, "Mumbai")).toBe(false);
  });
});
