import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchProgressiveDiscoveryBatch,
  DINING_PROGRESSION_QUERIES,
  GeoPoint,
} from "../services/discoveryStreamService";
import {
  createDistanceOrderedDiscoverySections,
  getDiscoverySectionTitle,
  DISCOVERY_CARDS_PER_ROW,
} from "../hooks/useDiscoveryStream";
import { supabase } from "../../../../lib/supabaseClient";
import { DiscoveryItem } from "../../../core/types/discovery";
import { setPlaceOverridesCacheForTesting } from "../services/placeOverridesService";

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

describe("Dining Infinite-Loading & Progressive Pagination Suite", () => {
  const originCoords: GeoPoint = { latitude: 12.9716, longitude: 77.5946 };

  beforeEach(() => {
    vi.clearAllMocks();
    setPlaceOverridesCacheForTesting(new Map());
  });

  describe("1. Next-Page Token Preservation when batch contains duplicates", () => {
    it("preserves nextPageToken and DOES NOT advance queryIndex when batch has duplicates", async () => {
      // Simulate Google Places returning 20 items for "restaurants", all of which are already seen
      const seenPlaceIds = new Set<string>(["place_1", "place_2", "place_3"]);

      const mockPlacesResponse = {
        data: {
          items: [
            {
              id: "place_1",
              place_id: "place_1",
              name: "Existing Restaurant 1",
              types: ["restaurant"],
              latitude: 12.972,
              longitude: 77.595,
              cover_image_url: "https://example.com/res1.jpg",
            },
            {
              id: "place_2",
              place_id: "place_2",
              name: "Existing Restaurant 2",
              types: ["restaurant"],
              latitude: 12.973,
              longitude: 77.596,
              cover_image_url: "https://example.com/res2.jpg",
            },
          ],
          nextPageToken: "google_places_page_2_token",
        },
        error: null,
      };

      (supabase.functions.invoke as any).mockResolvedValueOnce(mockPlacesResponse);

      const result = await fetchProgressiveDiscoveryBatch({
        category: "DINING",
        originCoords,
        city: "Bengaluru",
        queryIndex: 0,
        pageToken: null,
        radiusMeters: 10000,
        seenPlaceIds,
        minDistanceKm: 0,
        maxDistanceKm: 25,
      });

      // Because both items were already in seenPlaceIds, items returned is 0
      expect(result.items.length).toBe(0);

      // CRITICAL FIX VERIFICATION:
      // Must NOT advance to query 1 ("cafe...") and must NOT discard nextPageToken!
      // It must stay on query 0 so the subsequent request fetches Page 2 of "restaurants"
      expect(result.nextQueryIndex).toBe(0);
      expect(result.nextPageToken).toBe("google_places_page_2_token");
      expect(result.hasMore).toBe(true);
    });

    it("advances to next progression query ONLY when Google Places pages are genuinely exhausted", async () => {
      // When nextPageToken is null, Google Places has finished all pages for this query
      const mockPlacesResponse = {
        data: {
          items: [
            {
              id: "place_new_1",
              place_id: "place_new_1",
              name: "New Restaurant 1",
              types: ["restaurant"],
              latitude: 12.975,
              longitude: 77.598,
              formatted_address: "Indiranagar, Bengaluru",
              cover_image_url: "https://example.com/res_new.jpg",
            },
          ],
          nextPageToken: null, // End of pages for this query
        },
        error: null,
      };

      (supabase.functions.invoke as any).mockResolvedValueOnce(mockPlacesResponse);

      const result = await fetchProgressiveDiscoveryBatch({
        category: "DINING",
        originCoords,
        city: "Bengaluru",
        queryIndex: 0,
        pageToken: "google_places_page_2_token",
        radiusMeters: 10000,
        seenPlaceIds: new Set<string>(),
        minDistanceKm: 0,
        maxDistanceKm: 25,
      });

      expect(result.items.length).toBe(1);
      // Query 0 exhausted, moves cleanly to Query 1 ("cafe coffee shop roastery")
      expect(result.nextQueryIndex).toBe(1);
      expect(result.nextPageToken).toBeNull();
      expect(result.hasMore).toBe(true);
    });
  });

  describe("2. Progressive Section Generation Past Row 3", () => {
    it("generates continuous unique rows past Row 3 following exact section-title rotation", () => {
      // Create 49 unique restaurants (7 rows of 7 cards each)
      const allUniqueRestaurants: DiscoveryItem[] = Array.from({ length: 49 }, (_, idx) => ({
        id: `place_unique_${idx}`,
        place_id: `place_unique_${idx}`,
        title: `Restaurant ${idx + 1}`,
        category: "DINING",
        subcategory: "Restaurant",
        latitude: originCoords.latitude + idx * 0.002,
        longitude: originCoords.longitude,
        _distanceKm: 0.1 + idx * 0.1,
        distance: `${(0.1 + idx * 0.1).toFixed(1)} km`,
      })) as any;

      // ── Initial Load: 3 rows (21 items) ──
      const initialBatch = allUniqueRestaurants.slice(0, 21);
      const { sections: initialSections } = createDistanceOrderedDiscoverySections(
        "DINING",
        initialBatch,
        originCoords,
        DISCOVERY_CARDS_PER_ROW,
        0
      );

      expect(initialSections.length).toBe(3);
      expect(initialSections[0].title).toBe("Restaurants Around You"); // Row 1
      expect(initialSections[1].title).toBe("More Restaurants"); // Row 2
      expect(initialSections[2].title).toBe("You Can Also See"); // Row 3
      initialSections.forEach((sec) => expect(sec.items.length).toBe(7));

      // ── User Scrolls: Row 4 & Row 5 (14 items) ──
      const secondBatch = allUniqueRestaurants.slice(21, 35);
      const { sections: secondSections } = createDistanceOrderedDiscoverySections(
        "DINING",
        secondBatch,
        originCoords,
        DISCOVERY_CARDS_PER_ROW,
        initialSections.length // starting at rowIndex 3
      );

      expect(secondSections.length).toBe(2);
      expect(secondSections[0].title).toBe("Dining to Explore"); // Row 4
      expect(secondSections[1].title).toBe("More Dining to Explore"); // Row 5
      secondSections.forEach((sec) => expect(sec.items.length).toBe(7));

      // ── User Continues Scrolling: Row 6 & Row 7 (14 items) ──
      const thirdBatch = allUniqueRestaurants.slice(35, 49);
      const { sections: thirdSections } = createDistanceOrderedDiscoverySections(
        "DINING",
        thirdBatch,
        originCoords,
        DISCOVERY_CARDS_PER_ROW,
        initialSections.length + secondSections.length // starting at rowIndex 5
      );

      expect(thirdSections.length).toBe(2);
      expect(thirdSections[0].title).toBe("Places Worth Exploring"); // Row 6
      expect(thirdSections[1].title).toBe("More Restaurants"); // Row 7 (cycle rotates to title 2)
      thirdSections.forEach((sec) => expect(sec.items.length).toBe(7));

      // ── Verify Combined Screen Results ──
      const allRenderedSections = [
        ...initialSections,
        ...secondSections,
        ...thirdSections,
      ];
      expect(allRenderedSections.length).toBe(7);

      // Verify ZERO duplicates across all 7 rows
      const allRenderedIds = allRenderedSections.flatMap((sec) =>
        sec.items.map((it) => it.place_id)
      );
      const uniqueRenderedIds = new Set(allRenderedIds);
      expect(allRenderedIds.length).toBe(49);
      expect(uniqueRenderedIds.size).toBe(49);

      // Verify strictly ascending distance ordering across consecutive batches
      for (let i = 0; i < allRenderedSections.length - 1; i++) {
        const lastCardCurrentRow =
          allRenderedSections[i].items[allRenderedSections[i].items.length - 1];
        const firstCardNextRow = allRenderedSections[i + 1].items[0];
        expect((lastCardCurrentRow as any)._distanceKm).toBeLessThanOrEqual(
          (firstCardNextRow as any)._distanceKm
        );
      }
    });

    it("verifies rotating section title sequence for first 12 dining rows", () => {
      const expectedTitles = [
        "Restaurants Around You", // Row 1 (index 0)
        "More Restaurants", // Row 2 (index 1)
        "You Can Also See", // Row 3 (index 2)
        "Dining to Explore", // Row 4 (index 3)
        "More Dining to Explore", // Row 5 (index 4)
        "Places Worth Exploring", // Row 6 (index 5)
        "More Restaurants", // Row 7 (index 6, cycle 2 start)
        "You Can Also See", // Row 8 (index 7)
        "Dining to Explore", // Row 9 (index 8)
        "More Dining to Explore", // Row 10 (index 9)
        "Places Worth Exploring", // Row 11 (index 10)
        "Restaurants Around You", // Row 12 (index 11)
      ];

      expectedTitles.forEach((expected, rowIndex) => {
        expect(getDiscoverySectionTitle("DINING", rowIndex)).toBe(expected);
      });
    });
  });

  describe("3. Database Overrides Merging during Stream Pagination", () => {
    it("merges database-only venues into progressive stream batches without duplicates", async () => {
      const dbMockOverrides = new Map<string, any>([
        [
          "db_dining_override_1",
          {
            place_id: "db_dining_override_1",
            name_override: "Handcrafted Sourdough Pizzeria",
            category_override: "DINING",
            subcategory: "Pizza & Italian",
            latitude_override: 12.973,
            longitude_override: 77.595,
            image_path: "https://example.com/pizza.jpg",
            is_deleted: false,
          },
        ],
      ]);

      setPlaceOverridesCacheForTesting(dbMockOverrides);

      const mockPlacesResponse = {
        data: {
          items: [
            {
              id: "google_dining_1",
              place_id: "google_dining_1",
              name: "Sunny Side Cafe",
              types: ["cafe"],
              latitude: 12.974,
              longitude: 77.596,
              formatted_address: "Indiranagar, Bengaluru",
              cover_image_url: "https://example.com/cafe.jpg",
            },
          ],
          nextPageToken: "next_token_test",
        },
        error: null,
      };

      (supabase.functions.invoke as any).mockResolvedValueOnce(mockPlacesResponse);

      const result = await fetchProgressiveDiscoveryBatch({
        category: "DINING",
        originCoords,
        city: "Bengaluru",
        queryIndex: 0,
        pageToken: null,
        radiusMeters: 10000,
        seenPlaceIds: new Set<string>(),
        minDistanceKm: 0,
        maxDistanceKm: 25,
      });

      // Both the Google place and DB venue are present
      expect(result.items.some((it) => (it.title || (it as any).name) === "Handcrafted Sourdough Pizzeria")).toBe(true);
      expect(result.items.some((it) => (it.title || (it as any).name) === "Sunny Side Cafe")).toBe(true);

      // DB venue has planless override flag
      const dbItem = result.items.find((it) => it.title === "Handcrafted Sourdough Pizzeria");
      expect((dbItem as any)?._hasPlanlessOverride).toBe(true);
    });
  });

  describe("4. End-to-End Batch Ingestion & Deduplication Isolation (Dining & Sports)", () => {
    it("Dining: correctly accepts newly fetched Google places and does not reject them against batch query keys", async () => {
      // Simulate 21 already displayed restaurants in seenPlaceIds
      const displayedIds = new Set<string>(
        Array.from({ length: 21 }, (_, i) => `displayed_dining_${i}`)
      );

      // Google returns 3 items: 1 already displayed, 2 brand new
      const mockPlacesResponse = {
        data: {
          items: [
            {
              id: "displayed_dining_0",
              place_id: "displayed_dining_0",
              name: "Existing Restaurant 0",
              types: ["restaurant"],
              latitude: 12.972,
              longitude: 77.595,
              cover_image_url: "https://example.com/res0.jpg",
            },
            {
              id: "new_dining_1",
              place_id: "new_dining_1",
              name: "New Restaurant 1",
              types: ["restaurant"],
              latitude: 12.975,
              longitude: 77.596,
              formatted_address: "Indiranagar, Bengaluru",
              cover_image_url: "https://example.com/res1.jpg",
            },
            {
              id: "new_dining_2",
              place_id: "new_dining_2",
              name: "New Restaurant 2",
              types: ["cafe"],
              latitude: 12.976,
              longitude: 77.597,
              formatted_address: "Indiranagar, Bengaluru",
              cover_image_url: "https://example.com/res2.jpg",
            },
          ],
          nextPageToken: "token_p2",
        },
        error: null,
      };

      (supabase.functions.invoke as any).mockResolvedValueOnce(mockPlacesResponse);

      const querySeenPlaceIds = new Set<string>(displayedIds);
      const result = await fetchProgressiveDiscoveryBatch({
        category: "DINING",
        originCoords,
        city: "Bengaluru",
        queryIndex: 0,
        pageToken: null,
        radiusMeters: 10000,
        seenPlaceIds: querySeenPlaceIds,
        minDistanceKm: 0,
        maxDistanceKm: 25,
      });

      // Exactly 2 new items returned (duplicate displayed_dining_0 correctly omitted)
      expect(result.items.length).toBe(2);
      expect(result.items.map((i) => i.place_id)).toEqual(["new_dining_1", "new_dining_2"]);

      // Verify caller's deduplication check against displayedIds accepts the new items
      const candidateVenues: DiscoveryItem[] = [];
      for (const item of result.items) {
        const isAlreadyDisplayed = displayedIds.has(item.place_id || item.id);
        expect(isAlreadyDisplayed).toBe(false);
        if (!isAlreadyDisplayed) {
          candidateVenues.push(item);
        }
      }
      expect(candidateVenues.length).toBe(2);
    });

    it("Sports: correctly accepts newly fetched Google sports venues and does not reject them against batch query keys", async () => {
      // Simulate 21 already displayed sports venues in seenPlaceIds
      const displayedIds = new Set<string>(
        Array.from({ length: 21 }, (_, i) => `displayed_sport_${i}`)
      );

      // Google returns 3 items: 1 already displayed, 2 brand new sports venues
      const mockPlacesResponse = {
        data: {
          items: [
            {
              id: "displayed_sport_5",
              place_id: "displayed_sport_5",
              name: "Existing Turf 5",
              types: ["sports_complex"],
              latitude: 12.972,
              longitude: 77.595,
              cover_image_url: "https://example.com/turf0.jpg",
            },
            {
              id: "new_sport_1",
              place_id: "new_sport_1",
              name: "Apex Football Turf",
              types: ["sports_complex"],
              latitude: 12.977,
              longitude: 77.598,
              formatted_address: "Indiranagar, Bengaluru",
              cover_image_url: "https://example.com/turf1.jpg",
            },
            {
              id: "new_sport_2",
              place_id: "new_sport_2",
              name: "Smash Badminton Arena",
              types: ["sports_complex"],
              latitude: 12.978,
              longitude: 77.599,
              formatted_address: "Indiranagar, Bengaluru",
              cover_image_url: "https://example.com/court2.jpg",
            },
          ],
          nextPageToken: "sports_token_p2",
        },
        error: null,
      };

      (supabase.functions.invoke as any).mockResolvedValueOnce(mockPlacesResponse);

      const querySeenPlaceIds = new Set<string>(displayedIds);
      const result = await fetchProgressiveDiscoveryBatch({
        category: "SPORTS",
        originCoords,
        city: "Bengaluru",
        queryIndex: 0,
        pageToken: null,
        radiusMeters: 10000,
        seenPlaceIds: querySeenPlaceIds,
        minDistanceKm: 0,
        maxDistanceKm: 25,
      });

      // Exactly 2 new items returned (duplicate displayed_sport_5 correctly omitted)
      expect(result.items.length).toBe(2);
      expect(result.items.map((i) => i.place_id)).toEqual(["new_sport_1", "new_sport_2"]);

      // Verify caller's deduplication check against displayedIds accepts the new items
      const candidateVenues: DiscoveryItem[] = [];
      for (const item of result.items) {
        const isAlreadyDisplayed = displayedIds.has(item.place_id || item.id);
        expect(isAlreadyDisplayed).toBe(false);
        if (!isAlreadyDisplayed) {
          candidateVenues.push(item);
        }
      }
      expect(candidateVenues.length).toBe(2);
    });
  });
});
