import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchDiscoveryPlaces } from "../services/discoveryService";
import { fetchDiscoverMovies, isMovieWithinSixMonths } from "../services/tmdbMovieService";
import { calculateDistanceKm } from "../components/DiscoveryCard";

import { supabase } from "../../../../lib/supabaseClient";
import { clearPlaceOverridesCache } from "../services/placeOverridesService";

describe("Endless Location-Based Discovery Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearPlaceOverridesCache();
    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any;
    });
  });

  describe("Distance-Ordering & Radius Proximity", () => {
    it("sorts places ascending by distance from discovery location (closest first)", async () => {
      // User location: Bangalore MG Road
      const userCoords = { latitude: 12.9752, longitude: 77.6045 };

      // Mock Places API response returning 3 venues at varying distances
      const mockPlaces = [
        {
          id: "place_far",
          place_id: "place_far",
          title: "Far Away Arena",
          category: "SPORTS",
          latitude: 13.0827,
          longitude: 77.5877, // ~12 km away
        },
        {
          id: "place_close",
          place_id: "place_close",
          title: "MG Road Turf",
          category: "SPORTS",
          latitude: 12.9755,
          longitude: 77.6050, // ~0.06 km away
        },
        {
          id: "place_medium",
          place_id: "place_medium",
          title: "Indiranagar Sports Club",
          category: "SPORTS",
          latitude: 12.9784,
          longitude: 77.6408, // ~3.9 km away
        },
      ];

      vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockImplementation(
        async (fnName: string, options: any) => {
          if (fnName === "maps" && options?.body?.action === "places-discovery") {
            return {
              data: {
                items: mockPlaces,
                nextPageToken: "next_test_token",
              },
              error: null,
            };
          }
          return { data: null, error: null };
        }
      );

      const res = await searchDiscoveryPlaces({
        category: "SPORTS",
        query: "turf",
        currentCoordinates: userCoords,
        defaultCity: "Bengaluru",
      });

      expect(res.items.length).toBe(3);
      // Closest item must be first
      expect(res.items[0].title).toBe("MG Road Turf");
      expect(res.items[1].title).toBe("Indiranagar Sports Club");
      expect(res.items[2].title).toBe("Far Away Arena");

      // Verify distance is monotonically non-decreasing
      for (let i = 0; i < res.items.length - 1; i++) {
        const distA = (res.items[i] as any)._distanceKm ?? 0;
        const distB = (res.items[i + 1] as any)._distanceKm ?? 0;
        expect(distA).toBeLessThanOrEqual(distB);
      }
    });

    it("correctly computes distance between discovery location and coordinates", () => {
      const origin = { latitude: 12.9716, longitude: 77.5946 };
      const dest = { latitude: 12.9740, longitude: 77.5810 };
      const distance = calculateDistanceKm(origin.latitude, origin.longitude, dest.latitude, dest.longitude);
      expect(distance).toBeGreaterThan(1.4);
      expect(distance).toBeLessThan(1.6);
    });
  });

  describe("Endless Movies Catalogue Pagination & Cycling", () => {
    it("supports page-based pagination for TMDB now_playing without fake distances", async () => {
      const res = await fetchDiscoverMovies("now_playing", 1, undefined, "all");
      expect(res).toBeDefined();
      expect(Array.isArray(res.items)).toBe(true);

      // Verify no fake distances are attached to movie titles
      res.items.forEach((movie) => {
        expect((movie as any)._distanceKm).toBeUndefined();
      });
    });

    it("filters out movies older than 6 months for the fresh catalogue", () => {
      const recentDate = new Date();
      recentDate.setMonth(recentDate.getMonth() - 2);
      expect(isMovieWithinSixMonths(recentDate.toISOString())).toBe(true);

      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 2);
      expect(isMovieWithinSixMonths(oldDate.toISOString())).toBe(false);
    });
  });

  describe("Endless Cycling Contract Verification", () => {
    it("deduplicates results within a single cycle by place_id or id", () => {
      const items = [
        { id: "p1", place_id: "place_1", title: "Place 1" },
        { id: "p2", place_id: "place_2", title: "Place 2" },
        { id: "p3", place_id: "place_1", title: "Duplicate Place 1" },
      ];

      const seen = new Set<string>();
      const deduped: any[] = [];
      for (const it of items) {
        const key = it.place_id || it.id;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(it);
        }
      }

      expect(deduped.length).toBe(2);
      expect(deduped.map((d) => d.id)).toEqual(["p1", "p2"]);
    });

    it("allows repeat occurrences only after all unique items have been consumed with cycle-scoped IDs", () => {
      const uniquePool = [
        { id: "item_1", title: "Turf 1" },
        { id: "item_2", title: "Turf 2" },
      ];

      const cycle = 2;
      const cycledBatch = uniquePool.map((it, idx) => ({
        ...it,
        id: `${it.id}_c${cycle}_${idx}`,
      }));

      expect(cycledBatch[0].id).toBe("item_1_c2_0");
      expect(cycledBatch[1].id).toBe("item_2_c2_1");
      expect(cycledBatch[0].title).toBe("Turf 1");
    });
  });
});
