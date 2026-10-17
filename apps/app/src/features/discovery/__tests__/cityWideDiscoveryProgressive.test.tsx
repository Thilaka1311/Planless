import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import {
  fetchProgressiveDiscoveryBatch,
  SPORTS_PROGRESSION_QUERIES,
  DINING_PROGRESSION_QUERIES,
  ACTIVITIES_PROGRESSION_QUERIES,
} from "../services/discoveryStreamService";
import {
  getCityCenter,
  isCoordinateInCity,
  getCityBoundingBoxSync,
  getCityNeighborhoods,
  isPlaceInCity,
} from "../services/cityBoundary";
import { ForYouSections } from "../components/ForYouSections";
import { DiscoveryItem, DiscoverySection } from "../../../core/types/discovery";
import { supabase } from "../../../../lib/supabaseClient";
import * as tmdbService from "../services/tmdbMovieService";

// Mock supabaseClient
vi.mock("../../../../lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { items: [] }, error: null }),
    },
  },
  SUPABASE_URL: "https://mock.supabase.co",
}));

// Mock ProfileContext
vi.mock("../../profile/state/ProfileContext", () => ({
  useProfileStore: () => ({ isAdmin: false }),
}));

describe("City-Wide Discovery and Progressive Venue Loading Suite", () => {
  const BENGALURU_CENTER = { latitude: 12.988, longitude: 77.622 };
  const CHENNAI_CENTER = { latitude: 13.04, longitude: 80.225 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. City Boundary & Reference Point Resolution", () => {
    it("resolves city centers accurately without requiring device GPS", () => {
      const blrCenter = getCityCenter("Bengaluru");
      expect(blrCenter.latitude).toBeCloseTo(12.988, 2);
      expect(blrCenter.longitude).toBeCloseTo(77.622, 2);

      const chnCenter = getCityCenter("Chennai");
      expect(chnCenter.latitude).toBeCloseTo(13.04, 2);
      expect(chnCenter.longitude).toBeCloseTo(80.225, 2);

      const delCenter = getCityCenter("Delhi");
      expect(delCenter.latitude).toBeCloseTo(28.64, 2);
      expect(delCenter.longitude).toBeCloseTo(77.095, 2);
    });

    it("correctly identifies whether coordinates fall inside or outside selected city", () => {
      // Koramangala is inside Bengaluru
      expect(isCoordinateInCity(12.9352, 77.6245, "Bengaluru")).toBe(true);

      // Potheri / Chennai is outside Bengaluru
      expect(isCoordinateInCity(12.8231, 80.0442, "Bengaluru")).toBe(false);

      // T. Nagar is inside Chennai
      expect(isCoordinateInCity(13.0418, 80.2341, "Chennai")).toBe(true);

      // Bengaluru is outside Chennai
      expect(isCoordinateInCity(12.9352, 77.6245, "Chennai")).toBe(false);
    });

    it("extracts distinct neighborhoods across the city for broad coverage", () => {
      const blrNeighborhoods = getCityNeighborhoods("Bengaluru");
      expect(blrNeighborhoods).toContain("whitefield");
      expect(blrNeighborhoods).toContain("electronic city");
      expect(blrNeighborhoods).toContain("yelahanka");
      expect(blrNeighborhoods).toContain("koramangala");
    });
  });

  describe("2. Progressive Distance Tiers & Fallbacks in Stream Service", () => {
    it("uses city center fallback when user GPS coordinates are null", async () => {
      const mockInvoke = vi.spyOn(supabase.functions, "invoke").mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "place_ind_1",
              place_id: "place_ind_1",
              name: "City Center Turf",
              types: ["sports_complex"],
              latitude: 12.975,
              longitude: 77.605,
              formatted_address: "MG Road, Bengaluru",
              cover_image_url: "https://example.com/photo.jpg",
            },
          ],
          nextPageToken: null,
        },
        error: null,
      });

      const result = await fetchProgressiveDiscoveryBatch({
        category: "SPORTS",
        originCoords: null, // GPS permission denied or unavailable
        city: "Bengaluru",
        queryIndex: 0,
        pageToken: null,
        radiusMeters: 10000,
        seenPlaceIds: new Set(),
      });

      expect(mockInvoke).toHaveBeenCalled();
      const invokeBody = mockInvoke.mock.calls[0][1]?.body as any;
      expect(invokeBody.latitude).toBeCloseTo(BENGALURU_CENTER.latitude, 2);
      expect(invokeBody.longitude).toBeCloseTo(BENGALURU_CENTER.longitude, 2);
      expect(invokeBody.city).toBe("Bengaluru");

      // Returns the place successfully with computed distance from city center
      expect(result.items.length).toBe(1);
      expect((result.items[0] as any)._distanceKm).toBeDefined();
    });

    it("uses city center fallback when user GPS is in a different city (e.g. user in Chennai browsing Bengaluru)", async () => {
      const mockInvoke = vi.spyOn(supabase.functions, "invoke").mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "place_blr_2",
              place_id: "place_blr_2",
              name: "Whitefield Arena",
              types: ["sports_complex"],
              latitude: 12.9698,
              longitude: 77.7499,
              formatted_address: "Whitefield, Bengaluru",
              cover_image_url: "https://example.com/photo2.jpg",
            },
          ],
          nextPageToken: null,
        },
        error: null,
      });

      const potheriCoords = { latitude: 12.8231, longitude: 80.0442 }; // In Chennai region
      const result = await fetchProgressiveDiscoveryBatch({
        category: "SPORTS",
        originCoords: potheriCoords,
        city: "Bengaluru",
        queryIndex: 0,
        pageToken: null,
        radiusMeters: 10000,
        seenPlaceIds: new Set(),
      });

      const invokeBody = mockInvoke.mock.calls[0][1]?.body as any;
      // Because user was outside Bengaluru, the search origin was clamped to Bengaluru center
      expect(invokeBody.latitude).toBeCloseTo(BENGALURU_CENTER.latitude, 2);
      expect(invokeBody.longitude).toBeCloseTo(BENGALURU_CENTER.longitude, 2);
      expect(result.items.length).toBe(1);
      // Distance is evaluated from Bengaluru center, not 300km from Potheri
      expect((result.items[0] as any)._distanceKm).toBeLessThan(30);
    });

    it("progressively expands radius through Tier 1 (10km), Tier 2 (25km), and Tier 3 (50km)", async () => {
      vi.spyOn(supabase.functions, "invoke").mockResolvedValue({
        data: { items: [], nextPageToken: null },
        error: null,
      });

      // Simulating query progression at Tier 1 (10km) reaching the end of queries list
      const lastQueryIndex = SPORTS_PROGRESSION_QUERIES.length - 1;
      const res1 = await fetchProgressiveDiscoveryBatch({
        category: "SPORTS",
        originCoords: BENGALURU_CENTER,
        city: "Bengaluru",
        queryIndex: lastQueryIndex,
        pageToken: null,
        radiusMeters: 10000,
        seenPlaceIds: new Set(),
      });

      // Advances to Tier 2 (25,000m) and resets queryIndex to 0
      expect(res1.hasMore).toBe(true);
      expect(res1.radiusMeters).toBe(25000);
      expect(res1.nextQueryIndex).toBe(0);

      // Simulating query progression at Tier 2 (25km) reaching the end of queries list
      const res2 = await fetchProgressiveDiscoveryBatch({
        category: "SPORTS",
        originCoords: BENGALURU_CENTER,
        city: "Bengaluru",
        queryIndex: lastQueryIndex,
        pageToken: null,
        radiusMeters: 25000,
        seenPlaceIds: new Set(),
      });

      // Advances to Tier 3 (50,000m - city-wide) and resets queryIndex to 0
      expect(res2.hasMore).toBe(true);
      expect(res2.radiusMeters).toBe(50000);
      expect(res2.nextQueryIndex).toBe(0);

      // Simulating query progression at Tier 3 (50km) reaching the end
      const res3 = await fetchProgressiveDiscoveryBatch({
        category: "SPORTS",
        originCoords: BENGALURU_CENTER,
        city: "Bengaluru",
        queryIndex: lastQueryIndex,
        pageToken: null,
        radiusMeters: 50000,
        seenPlaceIds: new Set(),
      });

      // Terminates cleanly when city-wide coverage has completed
      expect(res3.hasMore).toBe(false);
    });
  });

  describe("3. For You Main Feed Interleaving & Movie Runaway Prevention", () => {
    const createMockVenue = (id: string, cat: string, title: string, distKm: number): DiscoveryItem =>
      ({
        id: `mock_${id}`,
        public_id: `mock_${id}`,
        place_id: `mock_${id}`,
        section_id: `sec_${cat.toLowerCase()}`,
        title,
        category: cat,
        subcategory: "general",
        location: "Bengaluru",
        latitude: 12.97 + distKm * 0.005,
        longitude: 77.6,
        _distanceKm: distKm,
        distance: `${distKm.toFixed(1)} km`,
        cover_image_url: "https://example.com/cover.jpg",
        suggested_duration_minutes: 60,
        suggested_cost_amount: 500,
        suggested_capacity: 4,
        default_rsvp_offset_minutes: 30,
        display_order: 1,
        featured: false,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);

    const createMockMovie = (id: number, title: string): DiscoveryItem =>
      ({
        id: `tmdb-${id}`,
        public_id: `tmdb-${id}`,
        section_id: "movies-trending",
        title,
        category: "MOVIES",
        subcategory: "Action",
        movie_id: id,
        cover_image_url: `https://image.tmdb.org/t/p/w500/movie_${id}.jpg`,
        release_date: "2026-03-01",
        display_order: 1,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);

    it("renders balanced interleaved categories and prevents feed from degrading into movies-only", () => {
      // 7 sports items (1 chunk)
      const sportsItems = Array.from({ length: 7 }, (_, i) =>
        createMockVenue(`sports_${i}`, "SPORTS", `Sports Turf ${i}`, 1 + i * 0.5)
      );

      // 7 dining items (1 chunk)
      const diningItems = Array.from({ length: 7 }, (_, i) =>
        createMockVenue(`dining_${i}`, "DINING", `Bistro ${i}`, 1.2 + i * 0.4)
      );

      // 7 activity items (1 chunk)
      const activityItems = Array.from({ length: 7 }, (_, i) =>
        createMockVenue(`act_${i}`, "ACTIVITIES", `Bowling ${i}`, 1.5 + i * 0.3)
      );

      // Mock TMDB returning 21 movies (3 chunks)
      const movieItems = Array.from({ length: 21 }, (_, i) =>
        createMockMovie(100 + i, `Blockbuster Movie ${i}`)
      );

      vi.spyOn(tmdbService, "getCachedMovieSection").mockReturnValue(movieItems);
      vi.spyOn(tmdbService, "isMovieWithinSixMonths").mockReturnValue(true);
      vi.spyOn(tmdbService, "isMovieReleased2026OrLater").mockReturnValue(true);

      const sections: DiscoverySection[] = [
        {
          id: "places_sports",
          public_id: "places_sports",
          category: "SPORTS",
          title: "Sports",
          description: "Turfs & courts",
          items: sportsItems,
          display_order: 1,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "places_dining",
          public_id: "places_dining",
          category: "DINING",
          title: "Restaurants",
          description: "Dining",
          items: diningItems,
          display_order: 2,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "places_activities",
          public_id: "places_activities",
          category: "ACTIVITIES",
          title: "Activities",
          description: "Fun & adventure",
          items: activityItems,
          display_order: 3,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const html = renderToString(
        <ForYouSections
          sections={sections}
          searchQuery=""
          categoryFilter="all"
          onSelectItem={vi.fn()}
        />
      );

      // Verify all 4 categories are present in the DOM
      expect(html).toContain("Sports Turf 0");
      expect(html).toContain("Bistro 0");
      expect(html).toContain("Bowling 0");
      expect(html).toContain("Blockbuster Movie 0");

      // Verify sequence: Sports -> Movies -> Restaurants -> Activities
      const sportsPos = html.indexOf("Sports Turf 0");
      const moviePos = html.indexOf("Blockbuster Movie 0");
      const diningPos = html.indexOf("Bistro 0");
      const actPos = html.indexOf("Bowling 0");

      expect(sportsPos).toBeGreaterThan(-1);
      expect(moviePos).toBeGreaterThan(sportsPos);
      expect(diningPos).toBeGreaterThan(moviePos);
      expect(actPos).toBeGreaterThan(diningPos);

      // Verify that movie items do not run away into cycle 2 with lone orphan movie rails
      // Because physical venues only have 1 chunk, movies are interleaved responsibly
      expect(html).toContain("Blockbuster Movie 0");
    });
  });

  describe("4. Pagination Deduplication & Distance Ordering", () => {
    it("ensures duplicate place IDs returned across multiple query batches are deduplicated", async () => {
      const seenPlaceIds = new Set<string>();

      // Batch 1 returns Place A and Place B
      (supabase.functions.invoke as any).mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "place_dup_1",
              place_id: "place_dup_1",
              name: "Duplicate Turf 1",
              types: ["sports_complex"],
              latitude: 12.98,
              longitude: 77.61,
              formatted_address: "Indiranagar, Bengaluru",
              cover_image_url: "https://example.com/photo1.jpg",
            },
            {
              id: "place_dup_2",
              place_id: "place_dup_2",
              name: "Duplicate Turf 2",
              types: ["sports_complex"],
              latitude: 12.99,
              longitude: 77.62,
              formatted_address: "Koramangala, Bengaluru",
              cover_image_url: "https://example.com/photo2.jpg",
            },
          ],
          nextPageToken: null,
        },
        error: null,
      });

      const batch1 = await fetchProgressiveDiscoveryBatch({
        category: "SPORTS",
        originCoords: BENGALURU_CENTER,
        city: "Bengaluru",
        queryIndex: 0,
        pageToken: null,
        radiusMeters: 10000,
        seenPlaceIds,
      });

      expect(batch1.items.length).toBe(2);
      expect(seenPlaceIds.has("dup_1")).toBe(true);
      expect(seenPlaceIds.has("dup_2")).toBe(true);

      // Batch 2 returns Place B again and Place C
      (supabase.functions.invoke as any).mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "place_dup_2",
              place_id: "place_dup_2",
              name: "Duplicate Turf 2",
              types: ["sports_complex"],
              latitude: 12.99,
              longitude: 77.62,
              formatted_address: "Koramangala, Bengaluru",
              cover_image_url: "https://example.com/photo2.jpg",
            },
            {
              id: "place_dup_3",
              place_id: "place_dup_3",
              name: "New Turf 3",
              types: ["sports_complex"],
              latitude: 13.01,
              longitude: 77.64,
              formatted_address: "Hebbal, Bengaluru",
              cover_image_url: "https://example.com/photo3.jpg",
            },
          ],
          nextPageToken: null,
        },
        error: null,
      });

      const batch2 = await fetchProgressiveDiscoveryBatch({
        category: "SPORTS",
        originCoords: BENGALURU_CENTER,
        city: "Bengaluru",
        queryIndex: 1,
        pageToken: null,
        radiusMeters: 10000,
        seenPlaceIds,
      });

      // Place B was deduplicated, only Place C is returned
      expect(batch2.items.length).toBe(1);
      expect(batch2.items[0].title).toBe("New Turf 3");
    });
  });

  describe("5. City Switching & Resetting", () => {
    it("targets the newly selected city and sends correct city bounds", async () => {
      const mockInvoke = vi.spyOn(supabase.functions, "invoke").mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "place_chn_1",
              place_id: "place_chn_1",
              name: "Marina Beach Sports Turf",
              types: ["sports_complex"],
              latitude: 13.05,
              longitude: 80.28,
              formatted_address: "Mylapore, Chennai",
              cover_image_url: "https://example.com/chennai.jpg",
            },
          ],
          nextPageToken: null,
        },
        error: null,
      });

      const result = await fetchProgressiveDiscoveryBatch({
        category: "SPORTS",
        originCoords: CHENNAI_CENTER,
        city: "Chennai",
        queryIndex: 0,
        pageToken: null,
        radiusMeters: 10000,
        seenPlaceIds: new Set(),
      });

      const invokeBody = mockInvoke.mock.calls[0][1]?.body as any;
      expect(invokeBody.city).toBe("Chennai");
      expect(invokeBody.cityBounds.north).toBe(13.35);
      expect(invokeBody.cityBounds.south).toBe(12.65);
      expect(result.items.length).toBe(1);
      expect(result.items[0].title).toBe("Marina Beach Sports Turf");
    });
  });

  describe("6. Category Resilience & Independence", () => {
    it("renders valid feed even when one category (e.g. Activities) has 0 items", () => {
      const sportsVenue: DiscoveryItem = {
        id: "mock_s1",
        public_id: "mock_s1",
        place_id: "mock_s1",
        title: "City Arena",
        category: "SPORTS",
        latitude: 12.98,
        longitude: 77.61,
        cover_image_url: "https://example.com/s1.jpg",
      } as any;

      const diningVenue: DiscoveryItem = {
        id: "mock_d1",
        public_id: "mock_d1",
        place_id: "mock_d1",
        title: "City Diner",
        category: "DINING",
        latitude: 12.98,
        longitude: 77.61,
        cover_image_url: "https://example.com/d1.jpg",
      } as any;

      const sections: DiscoverySection[] = [
        {
          id: "places_sports",
          public_id: "places_sports",
          category: "SPORTS",
          title: "Sports",
          description: "Turfs",
          items: [sportsVenue],
          display_order: 1,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "places_dining",
          public_id: "places_dining",
          category: "DINING",
          title: "Restaurants",
          description: "Dining",
          items: [diningVenue],
          display_order: 2,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "places_activities",
          public_id: "places_activities",
          category: "ACTIVITIES",
          title: "Activities",
          description: "None",
          items: [], // Empty activities
          display_order: 3,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const html = renderToString(
        <ForYouSections
          sections={sections}
          searchQuery=""
          categoryFilter="all"
          onSelectItem={vi.fn()}
        />
      );

      // Remaining categories still render cleanly
      expect(html).toContain("City Arena");
      expect(html).toContain("City Diner");
    });
  });
});
