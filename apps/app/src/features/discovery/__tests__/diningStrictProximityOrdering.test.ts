import { describe, it, expect } from "vitest";
import {
  createDistanceOrderedDiscoverySections,
  getDiscoverySectionTitle,
  DINING_SECTION_TITLES,
} from "../hooks/useDiscoveryStream";
import { DiscoveryItem } from "../../../core/types/discovery";
import { applyPlaceOverridesSync } from "../services/placeOverridesService";
import { areVenuesIdentical, mergeDuplicateVenues } from "../services/venueRelevance";

describe("Dining Strict Proximity & Distance Ordering Suite", () => {
  const origin = { latitude: 13.1000, longitude: 77.5900 };

  const mockRestaurants: DiscoveryItem[] = ([
    {
      id: "place_far_1",
      place_id: "place_far_1",
      title: "Ishaara",
      category: "DINING",
      subcategory: "Indian Restaurant",
      latitude: 13.0706, // ~3.3km away
      longitude: 77.5914,
    },
    {
      id: "place_far_2",
      place_id: "place_far_2",
      title: "Chili's Grill & Bar",
      category: "DINING",
      subcategory: "American",
      latitude: 13.0707, // ~3.3km away
      longitude: 77.5906,
    },
    {
      id: "place_close_1",
      place_id: "place_close_1",
      title: "Monk's Adda",
      category: "DINING",
      subcategory: "Cafe",
      latitude: 13.0993, // ~100m away
      longitude: 77.5894,
    },
    {
      id: "place_close_2",
      place_id: "place_close_2",
      title: "Sai Sogadu Yelahanka",
      category: "DINING",
      subcategory: "South Indian",
      latitude: 13.0993, // ~110m away
      longitude: 77.5893,
    },
    {
      id: "place_close_3",
      place_id: "place_close_3",
      title: "Polar Bear Ice Cream",
      category: "DINING",
      subcategory: "Ice Cream",
      latitude: 13.0992, // ~120m away
      longitude: 77.5893,
    },
    {
      id: "place_mid_1",
      place_id: "place_mid_1",
      title: "California Burrito",
      category: "DINING",
      subcategory: "Fast Food",
      latitude: 13.0986, // ~200m away
      longitude: 77.5901,
    },
    {
      id: "place_mid_2",
      place_id: "place_mid_2",
      title: "Cafe Sanman",
      category: "DINING",
      subcategory: "South Indian",
      latitude: 13.0970, // ~400m away
      longitude: 77.5905,
    },
    {
      id: "place_mid_3",
      place_id: "place_mid_3",
      title: "Sri Vishnu Park",
      category: "DINING",
      subcategory: "Vegetarian",
      latitude: 13.0990, // ~550m away
      longitude: 77.5847,
    },
  ] as unknown[]) as DiscoveryItem[];

  it("sorts all dining venues strictly ascending by distance from user origin", () => {
    const { sortedVenues } = createDistanceOrderedDiscoverySections(
      "DINING",
      mockRestaurants,
      origin,
      7
    );

    // The first venues must be the closest (~100-120m away), not the ~3.3km places
    expect(sortedVenues[0].title).toBe("Monk's Adda");
    expect((sortedVenues[0] as any)._distanceKm).toBeLessThan(0.2);

    expect(sortedVenues[1].title).toBe("Sai Sogadu Yelahanka");
    expect((sortedVenues[1] as any)._distanceKm).toBeLessThan(0.2);

    // Verify strictly ascending monotonic ordering
    for (let i = 0; i < sortedVenues.length - 1; i++) {
      const currentDist = (sortedVenues[i] as any)._distanceKm;
      const nextDist = (sortedVenues[i + 1] as any)._distanceKm;
      expect(currentDist).toBeLessThanOrEqual(nextDist);
    }

    // Far venues must be at the very end
    const lastVenue = sortedVenues[sortedVenues.length - 1];
    expect((lastVenue as any)._distanceKm).toBeGreaterThan(2.0);
  });

  it("places the closest venues in Row 1 with the title 'Restaurants Around You'", () => {
    const { sections } = createDistanceOrderedDiscoverySections(
      "DINING",
      mockRestaurants,
      origin,
      7
    );

    expect(sections.length).toBeGreaterThan(0);
    expect(sections[0].title).toBe("Restaurants Around You");

    // All items in Row 1 must be closest first
    const row1Items = sections[0].items;
    expect(row1Items.length).toBe(7);
    expect(row1Items[0].title).toBe("Monk's Adda");
  });

  it("rotates dining section titles according to DINING_SECTION_TITLES cycle", () => {
    expect(getDiscoverySectionTitle("DINING", 0)).toBe(DINING_SECTION_TITLES[0]); // "Restaurants Around You"
    expect(getDiscoverySectionTitle("DINING", 1)).toBe(DINING_SECTION_TITLES[1]); // "More Restaurants"
    expect(getDiscoverySectionTitle("DINING", 2)).toBe(DINING_SECTION_TITLES[2]); // "You Can Also See"
    expect(getDiscoverySectionTitle("DINING", 3)).toBe(DINING_SECTION_TITLES[3]); // "Dining to Explore"
    expect(getDiscoverySectionTitle("DINING", 4)).toBe(DINING_SECTION_TITLES[4]); // "More Dining to Explore"
    expect(getDiscoverySectionTitle("DINING", 5)).toBe(DINING_SECTION_TITLES[5]); // "Places Worth Exploring"
  });

  it("merges database overrides without duplicating place_ids", () => {
    const itemsWithDupes = [
      ...mockRestaurants,
      { ...mockRestaurants[0], title: "Ishaara Duplicate" },
    ];

    const { sortedVenues } = createDistanceOrderedDiscoverySections(
      "DINING",
      itemsWithDupes,
      origin,
      7
    );

    const ids = sortedVenues.map((v) => v.place_id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  describe("Dining Deduplication & Cross-Section Isolation", () => {
    it("ensures a restaurant (e.g. Toit) appears ONLY ONCE across the entire screen and never duplicates between 'Dining to Explore' and 'More Dining to Explore'", () => {
      // Create 28 dining places (enough for 4 sections of 7 cards)
      // Place "Toit" initially at index 21 (which would be Row 4, "Dining to Explore")
      // And introduce a duplicate "Toit Brewpub" / "Toit" in candidate batch for Row 5 ("More Dining to Explore")
      const toitOrigin = { latitude: 12.9784, longitude: 77.6408 }; // Indiranagar, Bengaluru
      const toitGooglePlaceId = "ChIJ7xG9Z3UTrjsR-78m9F3hM0I";

      const venues: DiscoveryItem[] = [];
      for (let i = 0; i < 28; i++) {
        const dist = 0.5 + i * 0.2;
        if (i === 21) {
          // Row 4 (index 21 to 27), item 0: Toit from database/initial seed
          venues.push({
            id: "place_dining_toit_seed",
            place_id: toitGooglePlaceId,
            title: "Toit",
            category: "DINING",
            subcategory: "Microbrewery",
            latitude: 12.9790,
            longitude: 77.6410,
            _distanceKm: dist,
            distance: `${dist.toFixed(1)} km`,
          } as any);
        } else {
          venues.push({
            id: `place_dining_${i}`,
            place_id: `ChIJ_restaurant_${i}`,
            title: `Restaurant ${i}`,
            category: "DINING",
            subcategory: "Restaurant",
            latitude: 12.9784 + (dist * 0.009),
            longitude: 77.6408,
            _distanceKm: dist,
            distance: `${dist.toFixed(1)} km`,
          } as any);
        }
      }

      // Add a duplicate representation of Toit (e.g., from Google Places progressive query with slightly different metadata)
      venues.push({
        id: "place_ChIJ7xG9Z3UTrjsR-78m9F3hM0I",
        place_id: toitGooglePlaceId,
        title: "Toit Brewpub",
        category: "DINING",
        subcategory: "Brewpub",
        latitude: 12.9790,
        longitude: 77.6410,
        _distanceKm: 4.8,
        distance: "4.8 km",
      } as any);

      // Add an internal DB override representation of Toit
      venues.push({
        id: `place_${toitGooglePlaceId}`,
        place_id: toitGooglePlaceId,
        title: "Toit Indiranagar",
        category: "DINING",
        subcategory: "Microbrewery",
        latitude: 12.9790,
        longitude: 77.6410,
        _distanceKm: 4.9,
        distance: "4.9 km",
        _hasPlanlessOverride: true,
      } as any);

      const { sections, sortedVenues } = createDistanceOrderedDiscoverySections(
        "DINING",
        venues,
        toitOrigin,
        7
      );

      // 1. Verify deduplication happened BEFORE splitting into sections
      const allPlaceIds = sortedVenues.map((v) => v.place_id);
      const uniquePlaceIds = new Set(allPlaceIds);
      expect(allPlaceIds.length).toBe(uniquePlaceIds.size);

      // Count occurrences of Toit in sortedVenues
      const toitInSorted = sortedVenues.filter(
        (v) =>
          v.place_id === toitGooglePlaceId ||
          (v.title && v.title.toLowerCase().includes("toit"))
      );
      expect(toitInSorted.length).toBe(1);

      // 2. Verify Toit appears in exactly ONE section on the entire screen
      let toitSectionCount = 0;
      const sectionsContainingToit: string[] = [];

      sections.forEach((sec) => {
        const hasToit = sec.items.some(
          (it) =>
            it.place_id === toitGooglePlaceId ||
            (it.title && it.title.toLowerCase().includes("toit"))
        );
        if (hasToit) {
          toitSectionCount++;
          sectionsContainingToit.push(sec.title);
        }
      });

      expect(toitSectionCount).toBe(1);
      // If it appears in Row 4 ("Dining to Explore"), it must NOT appear in Row 5 ("More Dining to Explore")
      expect(sectionsContainingToit).not.toContain("More Dining to Explore");

      // 3. Verify every section has exactly 7 cards
      sections.forEach((sec) => {
        expect(sec.items.length).toBe(7);
      });

      // 4. Verify strictly ascending distance ordering is maintained
      for (let i = 0; i < sortedVenues.length - 1; i++) {
        const curr = (sortedVenues[i] as any)._distanceKm;
        const next = (sortedVenues[i + 1] as any)._distanceKm;
        expect(curr).toBeLessThanOrEqual(next);
      }
    });

    it("identifies matching physical restaurants via areVenuesIdentical and merges them without duplicating", () => {
      const dbSeed = {
        id: "item_dining_toit",
        title: "Toit",
        category: "DINING",
        latitude: 12.9790,
        longitude: 77.6410,
        _distanceKm: 0.8,
      };

      const googlePlace = {
        id: "place_ChIJ7xG9Z3UTrjsR-78m9F3hM0I",
        place_id: "ChIJ7xG9Z3UTrjsR-78m9F3hM0I",
        name: "Toit Brewpub",
        category: "DINING",
        latitude: 12.9791,
        longitude: 77.6411,
        _distanceKm: 0.8,
      };

      // Two representations of the same physical venue (name overlap within 15 meters)
      expect(areVenuesIdentical(dbSeed, googlePlace)).toBe(true);

      const merged = mergeDuplicateVenues(dbSeed as any, googlePlace as any);
      expect(merged.place_id).toBe("ChIJ7xG9Z3UTrjsR-78m9F3hM0I");
    });

    it("does not merge distinctly identified Google Places with different place_ids", () => {
      const place1 = {
        id: "place_ChIJ11111111111111111111",
        place_id: "ChIJ11111111111111111111",
        name: "Sports Arena 1",
        category: "SPORTS",
        latitude: 12.9790,
        longitude: 77.6410,
      };

      const place2 = {
        id: "place_ChIJ22222222222222222222",
        place_id: "ChIJ22222222222222222222",
        name: "Sports Arena 2",
        category: "SPORTS",
        latitude: 12.9791,
        longitude: 77.6411,
      };

      expect(areVenuesIdentical(place1, place2)).toBe(false);
    });

    it("ingests buffer leftovers to form full rows without self-cannibalization", () => {
      // 35 venues total: 21 for initial rows 1-3, 14 leftovers for rows 4-5
      const origin = { latitude: 12.9716, longitude: 77.5946 };
      const venues: DiscoveryItem[] = Array.from({ length: 35 }, (_, idx) => ({
        id: `venue_${idx}`,
        place_id: `ChIJ_dining_${idx}`,
        title: `Dining Venue ${idx}`,
        category: "DINING",
        latitude: origin.latitude + (idx * 0.005),
        longitude: origin.longitude,
        _distanceKm: 0.5 + idx * 0.2,
        distance: `${(0.5 + idx * 0.2).toFixed(1)} km`,
      })) as any;

      // First 21 venues (Rows 1-3)
      const initialBatch = venues.slice(0, 21);
      const leftovers = venues.slice(21); // 14 venues

      const { sections: initialSections } = createDistanceOrderedDiscoverySections(
        "DINING",
        initialBatch,
        origin,
        7
      );
      expect(initialSections.length).toBe(3);
      expect(initialSections[0].title).toBe("Restaurants Around You");
      expect(initialSections[1].title).toBe("More Restaurants");
      expect(initialSections[2].title).toBe("You Can Also See");

      // Progressive consumption of leftovers (Rows 4 and 5)
      const { sections: progressiveSections } = createDistanceOrderedDiscoverySections(
        "DINING",
        leftovers,
        origin,
        7,
        initialSections.length
      );

      expect(progressiveSections.length).toBe(2);
      expect(progressiveSections[0].title).toBe("Dining to Explore"); // Row 4
      expect(progressiveSections[1].title).toBe("More Dining to Explore"); // Row 5
      expect(progressiveSections[0].items.length).toBe(7);
      expect(progressiveSections[1].items.length).toBe(7);

      // Verify all combined sections have strictly unique places
      const allCombined = [...initialSections, ...progressiveSections];
      const allIds = allCombined.flatMap((s) => s.items.map((it) => it.place_id));
      const uniqueIds = new Set(allIds);
      expect(allIds.length).toBe(35);
      expect(uniqueIds.size).toBe(35);
    });
  });
});
