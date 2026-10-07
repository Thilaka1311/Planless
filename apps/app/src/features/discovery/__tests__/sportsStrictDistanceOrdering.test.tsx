import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  createDistanceOrderedSportsSections,
  getSportsSectionTitle,
  SPORTS_SECTION_TITLES,
  SPORTS_CARDS_PER_ROW,
} from "../hooks/useSportsStream";
import { DiscoveryItem } from "../../../core/types/discovery";
import { resolveVenueDistance } from "../components/DiscoveryCard";
import { DiscoverySection } from "../components/DiscoverySection";

describe("Sports Strict Distance Ordering & Layout Suite", () => {
  const userOrigin = { latitude: 12.9716, longitude: 77.5946 }; // Bengaluru center

  describe("1. Strict Monotonic Distance Sorting & 7 Cards per Row", () => {
    it("sorts all loaded venues purely ascending by distance before grouping into rows of 7", () => {
      // Create 21 venues scattered at random distances
      const distancesKm = [
        9.7, 5.1, 0.3, 11.0, 7.3, 1.6, 2.8, 15.0, 1.1, 4.4, 0.0, 7.9, 3.8, 28.3,
        2.1, 6.2, 1.7, 3.2, 5.4, 4.1, 1.9,
      ];

      const venues: DiscoveryItem[] = distancesKm.map((dist, idx) => ({
        id: `venue_${idx}`,
        title: `Venue ${idx} (${dist} km)`,
        category: "SPORTS",
        latitude: 12.9716 + dist * 0.009,
        longitude: 77.5946,
        _distanceKm: dist,
        distance: `${dist.toFixed(1)} km`,
      })) as any;

      const { sections, sortedVenues } = createDistanceOrderedSportsSections(
        venues,
        userOrigin,
        SPORTS_CARDS_PER_ROW
      );

      // Verify exactly 7 cards per row (21 / 7 = 3 rows)
      expect(sections.length).toBe(3);
      expect(sections[0].items.length).toBe(7);
      expect(sections[1].items.length).toBe(7);
      expect(sections[2].items.length).toBe(7);

      // Verify the closest venue is always first
      expect((sortedVenues[0] as any)._distanceKm).toBe(0.0);

      // Verify strict monotonic non-decreasing order across ALL venues
      for (let i = 1; i < sortedVenues.length; i++) {
        const prev = (sortedVenues[i - 1] as any)._distanceKm;
        const curr = (sortedVenues[i] as any)._distanceKm;
        expect(curr).toBeGreaterThanOrEqual(prev);
      }

      // Verify Row 1 matches user example:
      // 0.0 km → 0.3 km → 1.1 km → 1.6 km → 1.7 km → 1.9 km → 2.1 km
      const row1Distances = sections[0].items.map((it) => it.distance);
      expect(row1Distances).toEqual([
        "0.0 km",
        "0.3 km",
        "1.1 km",
        "1.6 km",
        "1.7 km",
        "1.9 km",
        "2.1 km",
      ]);

      // Verify Row 2:
      // 2.8 km → 3.2 km → 3.8 km → 4.1 km → 4.4 km → 5.1 km → 5.4 km
      const row2Distances = sections[1].items.map((it) => it.distance);
      expect(row2Distances).toEqual([
        "2.8 km",
        "3.2 km",
        "3.8 km",
        "4.1 km",
        "4.4 km",
        "5.1 km",
        "5.4 km",
      ]);

      // Verify Row 3:
      // 6.2 km → 7.3 km → 7.9 km → 9.7 km → 11.0 km → 15.0 km → 28.3 km
      const row3Distances = sections[2].items.map((it) => it.distance);
      expect(row3Distances).toEqual([
        "6.2 km",
        "7.3 km",
        "7.9 km",
        "9.7 km",
        "11.0 km",
        "15.0 km",
        "28.3 km",
      ]);

      // Verify no distance resets between sections:
      const row1Num = sections[0].items.map((it) => (it as any)._distanceKm);
      const row2Num = sections[1].items.map((it) => (it as any)._distanceKm);
      const row3Num = sections[2].items.map((it) => (it as any)._distanceKm);
      expect(row2Num[0]).toBeGreaterThanOrEqual(row1Num[row1Num.length - 1]);
      expect(row3Num[0]).toBeGreaterThanOrEqual(row2Num[row2Num.length - 1]);
    });
  });

  describe("2. Section Title Rotation (6-Title Continuous Shifted Cycle)", () => {
    it("defines the exact 6 base titles specified by user", () => {
      expect(SPORTS_SECTION_TITLES).toEqual([
        "Venues Around You",
        "More Venues",
        "You Can Also See",
        "Sports Around You",
        "More Sports to Explore",
        "Places Worth Exploring",
      ]);
    });

    it("rotates titles across rows 1 to 12 matching user's exact specification and shifted cycle", () => {
      // Cycle 1: Rows 1 to 6
      expect(getSportsSectionTitle(0)).toBe("Venues Around You"); // Row 1
      expect(getSportsSectionTitle(1)).toBe("More Venues"); // Row 2
      expect(getSportsSectionTitle(2)).toBe("You Can Also See"); // Row 3
      expect(getSportsSectionTitle(3)).toBe("Sports Around You"); // Row 4
      expect(getSportsSectionTitle(4)).toBe("More Sports to Explore"); // Row 5
      expect(getSportsSectionTitle(5)).toBe("Places Worth Exploring"); // Row 6

      // Cycle 2: Rows 7 to 12 (shifted start by +1)
      expect(getSportsSectionTitle(6)).toBe("More Venues"); // Row 7
      expect(getSportsSectionTitle(7)).toBe("You Can Also See"); // Row 8
      expect(getSportsSectionTitle(8)).toBe("Sports Around You"); // Row 9
      expect(getSportsSectionTitle(9)).toBe("More Sports to Explore"); // Row 10
      expect(getSportsSectionTitle(10)).toBe("Places Worth Exploring"); // Row 11
      expect(getSportsSectionTitle(11)).toBe("Venues Around You"); // Row 12

      // Cycle 3: Rows 13 to 18 (shifted start by +2)
      expect(getSportsSectionTitle(12)).toBe("You Can Also See"); // Row 13
      expect(getSportsSectionTitle(13)).toBe("Sports Around You"); // Row 14
      expect(getSportsSectionTitle(14)).toBe("More Sports to Explore"); // Row 15
      expect(getSportsSectionTitle(15)).toBe("Places Worth Exploring"); // Row 16
      expect(getSportsSectionTitle(16)).toBe("Venues Around You"); // Row 17
      expect(getSportsSectionTitle(17)).toBe("More Venues"); // Row 18
    });

    it("assigns rotating section titles to progressive rows of 7 cards", () => {
      // Create 84 venues (12 rows of 7 cards)
      const venues: DiscoveryItem[] = Array.from({ length: 84 }, (_, idx) => ({
        id: `v_${idx}`,
        place_id: `v_${idx}`,
        title: `Sports Venue ${idx + 1}`,
        category: "SPORTS",
        _distanceKm: idx * 0.2,
        distance: `${(idx * 0.2).toFixed(1)} km`,
      })) as any;

      const { sections } = createDistanceOrderedSportsSections(venues, userOrigin, 7);

      expect(sections.length).toBe(12);

      // Verify row titles match the rotating shifted pattern
      expect(sections[0].title).toBe("Venues Around You");
      expect(sections[1].title).toBe("More Venues");
      expect(sections[2].title).toBe("You Can Also See");
      expect(sections[3].title).toBe("Sports Around You");
      expect(sections[4].title).toBe("More Sports to Explore");
      expect(sections[5].title).toBe("Places Worth Exploring");

      expect(sections[6].title).toBe("More Venues");
      expect(sections[7].title).toBe("You Can Also See");
      expect(sections[8].title).toBe("Sports Around You");
      expect(sections[9].title).toBe("More Sports to Explore");
      expect(sections[10].title).toBe("Places Worth Exploring");
      expect(sections[11].title).toBe("Venues Around You");

      // Verify none of the old distance-based labels appear
      for (const sec of sections) {
        expect(sec.title).not.toContain("Nearby Sports Venues");
        expect(sec.title).not.toContain("Further Sports Venues");
        expect(sec.title).not.toContain("Sports Venues to Explore");
      }
    });

    it("DiscoverySection renders the section title in the section header", () => {
      const items: DiscoveryItem[] = [
        {
          id: "v1",
          title: "Bengaluru Turf Inc.",
          category: "SPORTS",
          _distanceKm: 0.0,
          cover_image_url: "https://example.com/1.jpg",
        },
      ] as any;

      const html = renderToString(
        <DiscoverySection
          id="sec_test"
          title="Venues Around You"
          items={items}
          onSelectItem={() => {}}
        />
      );

      expect(html).toContain("Venues Around You");
      expect(html).toContain("<h4");
    });
  });

  describe("3. Progressive Batch Merge with Scroll Stability", () => {
    it("re-sorts combined results globally when a new batch arrives without duplicating places", () => {
      // Initial batch of 3 places
      const batch1: DiscoveryItem[] = [
        { id: "p1", place_id: "p1", title: "P1", _distanceKm: 1.0 },
        { id: "p2", place_id: "p2", title: "P2", _distanceKm: 3.0 },
        { id: "p3", place_id: "p3", title: "P3", _distanceKm: 5.0 },
      ] as any;

      const res1 = createDistanceOrderedSportsSections(batch1, userOrigin, 7);
      expect(res1.sortedVenues.map((v) => (v as any)._distanceKm)).toEqual([1.0, 3.0, 5.0]);

      // Later batch arrives with places that fit in-between (e.g. 2.0 km) and duplicate of p2
      const batch2: DiscoveryItem[] = [
        { id: "p2", place_id: "p2", title: "P2 (Dup)", _distanceKm: 3.0 },
        { id: "p4", place_id: "p4", title: "P4", _distanceKm: 2.0 },
        { id: "p5", place_id: "p5", title: "P5", _distanceKm: 6.0 },
      ] as any;

      // Merge combined
      const res2 = createDistanceOrderedSportsSections([...batch1, ...batch2], userOrigin, 7);

      // Verify deduplication: exactly 5 unique venues (p1, p4, p2, p3, p5)
      expect(res2.sortedVenues.length).toBe(5);
      expect(res2.sortedVenues.map((v) => (v as any)._distanceKm)).toEqual([1.0, 2.0, 3.0, 5.0, 6.0]);
    });
  });

  describe("4. Accurate Distance Calculation vs 'Nearby' Fallback", () => {
    it("formats exact distance in km and never displays 'Nearby' when coordinates exist", () => {
      const itemWithCoords: DiscoveryItem = {
        id: "turf_coords",
        title: "Sahakara Nagara Badminton",
        category: "SPORTS",
        latitude: 13.0623,
        longitude: 77.5854,
      } as any;

      const formatted = resolveVenueDistance(itemWithCoords, userOrigin);
      expect(formatted).not.toBe("Nearby");
      expect(formatted).toMatch(/^\d+\.\d+ km$/);
    });

    it("handles coordinates in geometry.location or metadata without falling back to 'Nearby'", () => {
      const itemWithGeometry: DiscoveryItem = {
        id: "turf_geom",
        title: "The Game Changer",
        category: "SPORTS",
        geometry: {
          location: { lat: 13.0456, lng: 77.5712 },
        },
      } as any;

      const formatted = resolveVenueDistance(itemWithGeometry, userOrigin);
      expect(formatted).not.toBe("Nearby");
      expect(formatted).toMatch(/^\d+\.\d+ km$/);
    });
  });
});
