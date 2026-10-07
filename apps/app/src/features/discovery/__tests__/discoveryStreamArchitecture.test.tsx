import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { DiscoveryItem, DiscoverySection as DiscoverySectionType } from "../../../core/types/discovery";
import {
  getDiscoverySectionTitle,
  createDistanceOrderedDiscoverySections,
  SPORTS_SECTION_TITLES,
  DINING_SECTION_TITLES,
  ACTIVITIES_SECTION_TITLES,
  DISCOVERY_CARDS_PER_ROW,
} from "../hooks/useDiscoveryStream";
import { getSportsSectionTitle } from "../hooks/useSportsStream";
import {
  getDatabasePlacesForCategoryAndDistanceBand,
  getDatabaseDiningPlacesForDistanceBand,
  getDatabaseActivityPlacesForDistanceBand,
  getDatabaseSportsPlacesForDistanceBand,
  setPlaceOverridesCacheForTesting,
} from "../services/placeOverridesService";
import { DiscoverDining } from "../screens/DiscoverDining";
import { DiscoverActivities } from "../screens/DiscoverActivities";

describe("Unified Discovery Stream Architecture", () => {
  describe("Rotating Section Titles", () => {
    it("cycles through all 6 titles and continuously shifts starting points for SPORTS", () => {
      // Cycle 1: rows 0 to 5
      expect(getDiscoverySectionTitle("SPORTS", 0)).toBe("Venues Around You");
      expect(getDiscoverySectionTitle("SPORTS", 1)).toBe("More Venues");
      expect(getDiscoverySectionTitle("SPORTS", 2)).toBe("You Can Also See");
      expect(getDiscoverySectionTitle("SPORTS", 3)).toBe("Sports Around You");
      expect(getDiscoverySectionTitle("SPORTS", 4)).toBe("More Sports to Explore");
      expect(getDiscoverySectionTitle("SPORTS", 5)).toBe("Places Worth Exploring");

      // Cycle 2: row 6 starts at Title 2 (index 1)
      expect(getDiscoverySectionTitle("SPORTS", 6)).toBe("More Venues");
      expect(getDiscoverySectionTitle("SPORTS", 7)).toBe("You Can Also See");
      expect(getDiscoverySectionTitle("SPORTS", 11)).toBe("Venues Around You");

      // Cycle 3: row 12 starts at Title 3 (index 2)
      expect(getDiscoverySectionTitle("SPORTS", 12)).toBe("You Can Also See");

      // Backward compatibility check
      expect(getSportsSectionTitle(0)).toBe("Venues Around You");
      expect(getSportsSectionTitle(6)).toBe("More Venues");
    });

    it("cycles through all 6 titles and continuously shifts starting points for DINING", () => {
      // Cycle 1: rows 0 to 5
      expect(getDiscoverySectionTitle("DINING", 0)).toBe("Restaurants Around You");
      expect(getDiscoverySectionTitle("DINING", 1)).toBe("More Restaurants");
      expect(getDiscoverySectionTitle("DINING", 2)).toBe("You Can Also See");
      expect(getDiscoverySectionTitle("DINING", 3)).toBe("Dining to Explore");
      expect(getDiscoverySectionTitle("DINING", 4)).toBe("More Dining to Explore");
      expect(getDiscoverySectionTitle("DINING", 5)).toBe("Places Worth Exploring");

      // Cycle 2: row 6 starts at Title 2 (index 1)
      expect(getDiscoverySectionTitle("DINING", 6)).toBe("More Restaurants");
    });

    it("cycles through all 6 titles and continuously shifts starting points for ACTIVITIES", () => {
      // Cycle 1: rows 0 to 5
      expect(getDiscoverySectionTitle("ACTIVITIES", 0)).toBe("Activities Around You");
      expect(getDiscoverySectionTitle("ACTIVITIES", 1)).toBe("More Activities");
      expect(getDiscoverySectionTitle("ACTIVITIES", 2)).toBe("You Can Also See");
      expect(getDiscoverySectionTitle("ACTIVITIES", 3)).toBe("Activities to Explore");
      expect(getDiscoverySectionTitle("ACTIVITIES", 4)).toBe("More Activities to Explore");
      expect(getDiscoverySectionTitle("ACTIVITIES", 5)).toBe("Places Worth Exploring");

      // Cycle 2: row 6 starts at Title 2 (index 1)
      expect(getDiscoverySectionTitle("ACTIVITIES", 6)).toBe("More Activities");
    });
  });

  describe("Distance-Ordered Section Chunker", () => {
    const origin = { latitude: 12.9716, longitude: 77.5946 }; // Bengaluru central

    const createMockVenues = (count: number, category: "SPORTS" | "DINING" | "ACTIVITIES"): DiscoveryItem[] => {
      return Array.from({ length: count }, (_, idx) => ({
        id: `mock_${category}_${idx}`,
        public_id: `mock_${category}_${idx}`,
        section_id: `places_${category.toLowerCase()}`,
        title: `${category} Place ${idx + 1}`,
        category,
        latitude: origin.latitude + (count - idx) * 0.01, // reverse ordered so idx=0 is farthest
        longitude: origin.longitude,
        rating: 4.5,
        display_order: idx + 1,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })) as any as DiscoveryItem[];
    };


    it("chunks 14 venues into exactly two 7-card sections sorted ascending by distance", () => {
      const venues = createMockVenues(14, "DINING");
      const { sections, sortedVenues } = createDistanceOrderedDiscoverySections("DINING", venues, origin);

      expect(sections.length).toBe(2);
      expect(sections[0].items.length).toBe(DISCOVERY_CARDS_PER_ROW);
      expect(sections[1].items.length).toBe(DISCOVERY_CARDS_PER_ROW);
      expect(sections[0].title).toBe("Restaurants Around You");
      expect(sections[1].title).toBe("More Restaurants");

      // Verify strict distance ascending order
      for (let i = 0; i < sortedVenues.length - 1; i++) {
        const d1 = (sortedVenues[i] as any)._distanceKm;
        const d2 = (sortedVenues[i + 1] as any)._distanceKm;
        expect(d1).toBeLessThanOrEqual(d2);
      }
    });
  });

  describe("Database Overrides Extraction by Category Band", () => {
    it("extracts database places matching category and distance band", () => {
      const origin = { latitude: 12.9716, longitude: 77.5946 };

      const mockOverrides = new Map<string, any>([
        [
          "dining_spot_1",
          {
            place_id: "dining_spot_1",
            name_override: "Corner Cafe & Roastery",
            category_override: "DINING",
            subcategory: "Cafe",
            latitude_override: 12.972,
            longitude_override: 77.595,
            is_deleted: false,
          },
        ],
        [
          "activity_spot_1",
          {
            place_id: "activity_spot_1",
            name_override: "Mystery Escape Room",
            category_override: "ACTIVITIES",
            subcategory: "Escape Game",
            latitude_override: 12.973,
            longitude_override: 77.596,
            is_deleted: false,
          },
        ],
        [
          "sports_spot_1",
          {
            place_id: "sports_spot_1",
            name_override: "Central Turf Arena",
            category_override: "SPORTS",
            subcategory: "Football Turf",
            latitude_override: 12.974,
            longitude_override: 77.597,
            is_deleted: false,
          },
        ],
      ]);

      setPlaceOverridesCacheForTesting(mockOverrides);

      const diningPlaces = getDatabaseDiningPlacesForDistanceBand(origin, 0, 5);
      expect(diningPlaces.some((p) => p.title === "Corner Cafe & Roastery")).toBe(true);
      expect(diningPlaces.some((p) => p.title === "Central Turf Arena")).toBe(false);

      const activityPlaces = getDatabaseActivityPlacesForDistanceBand(origin, 0, 5);
      expect(activityPlaces.some((p) => p.title === "Mystery Escape Room")).toBe(true);
      expect(activityPlaces.some((p) => p.title === "Corner Cafe & Roastery")).toBe(false);

      const sportsPlaces = getDatabaseSportsPlacesForDistanceBand(origin, 0, 5);
      expect(sportsPlaces.some((p) => p.title === "Central Turf Arena")).toBe(true);

      // Clean up test cache
      setPlaceOverridesCacheForTesting(new Map());
    });
  });

  describe("DiscoverDining UI Rendering", () => {
    const mockDiningItem: DiscoveryItem = {
      id: "place_dining_test_1",
      public_id: "place_dining_test_1",
      section_id: "places_dining",
      place_id: "dining_test_1",
      title: "Truffles Koramangala",
      category: "DINING",
      subcategory: "Burger & American Diner",
      location: "Koramangala 5th Block, Bengaluru",
      place_address: "Koramangala 5th Block, Bengaluru",
      latitude: 12.9352,
      longitude: 77.6245,
      rating: 4.6,
      distance: "1.2 km",
      display_order: 1,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any as DiscoveryItem;

    const mockSections: DiscoverySectionType[] = [
      {
        id: "places_dining",
        public_id: "places_dining",
        category: "DINING",
        title: "Dining",
        description: "Food and drinks",
        display_order: 2,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [mockDiningItem],
      },
    ];

    it("renders DiscoverDining screen with header, search bar, and distance-tiered stream feed", () => {
      const html = renderToString(
        <DiscoverDining
          sections={mockSections}
          isAdmin={false}
          onBack={vi.fn()}
          onSelectDiscoveryItem={vi.fn()}
          currentCity="Bengaluru"
        />
      );

      // Header
      expect(html).toContain("Dining");
      expect(html).toContain("Discover places to eat");
      expect(html).toContain("text-rose-400");

      // Search bar
      expect(html).toContain("search-dining-input");
      expect(html).toContain("Search restaurants, cafes, places...");

      // Stream feed
      expect(html).toContain("Restaurants Around You");
      expect(html).toContain("Truffles Koramangala");

      // No chips should exist
      expect(html).not.toContain("DINING_CATEGORIES");
    });
  });

  describe("DiscoverActivities UI Rendering", () => {
    const mockActivityItem: DiscoveryItem = {
      id: "place_act_test_1",
      public_id: "place_act_test_1",
      section_id: "places_activities",
      place_id: "act_test_1",
      title: "Mystery Rooms Indiranagar",
      category: "ACTIVITIES",
      subcategory: "Escape Game",
      location: "100 Feet Rd, Indiranagar, Bengaluru",
      place_address: "100 Feet Rd, Indiranagar, Bengaluru",
      latitude: 12.9784,
      longitude: 77.6408,
      rating: 4.7,
      distance: "2.4 km",
      display_order: 1,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any as DiscoveryItem;

    const mockSections: DiscoverySectionType[] = [
      {
        id: "places_activities",
        public_id: "places_activities",
        category: "ACTIVITIES",
        title: "Activities",
        description: "Recreational activities",
        display_order: 3,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [mockActivityItem],
      },
    ];

    it("renders DiscoverActivities screen with header, search bar, and distance-tiered stream feed", () => {
      const html = renderToString(
        <DiscoverActivities
          sections={mockSections}
          isAdmin={false}
          onBack={vi.fn()}
          onSelectDiscoveryItem={vi.fn()}
          currentCity="Bengaluru"
        />
      );

      // Header
      expect(html).toContain("Activities");
      expect(html).toContain("Discover fun things to do");
      expect(html).toContain("text-pink-400");

      // Search bar
      expect(html).toContain("search-activities-input");
      expect(html).toContain("Search activities, places...");

      // Stream feed
      expect(html).toContain("Activities Around You");
      expect(html).toContain("Mystery Rooms Indiranagar");
    });
  });
});
