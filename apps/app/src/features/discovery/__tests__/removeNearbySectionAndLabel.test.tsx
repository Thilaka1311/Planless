import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import {
  DiscoveryCard,
  SportsCard,
  RestaurantCard,
  ActivityCard,
  MovieCard,
  formatDistanceKm,
  resolveVenueDistance,
} from "../components/DiscoveryCard";
import { DiscoverySection } from "../components/DiscoverySection";
import { DiscoveryItem, DiscoverySection as DiscoverySectionType } from "../../../core/types/discovery";
import { setStoredDiscoveryLocation, DEFAULT_DISCOVERY_LOCATION } from "../hooks/useUserLocation";
import { getSectionsByCategory } from "../services/discoveryService";
import { supabase } from "../../../../lib/supabaseClient";

describe("Remove Nearby Section and Card Label from Discovery Suite", () => {
  const mockUserOrigin = { latitude: 12.9716, longitude: 77.5946 }; // Bengaluru

  beforeEach(() => {
    vi.clearAllMocks();
    setStoredDiscoveryLocation(DEFAULT_DISCOVERY_LOCATION);
  });

  describe("1. formatDistanceKm and resolveVenueDistance never return 'Nearby'", () => {
    it("returns empty string instead of 'Nearby' when distanceKm is NaN or negative", () => {
      expect(formatDistanceKm(NaN)).toBe("");
      expect(formatDistanceKm(-1)).toBe("");
      expect(formatDistanceKm(-0.5)).toBe("");
    });

    it("formats valid numeric distances in km with 1 decimal place", () => {
      expect(formatDistanceKm(0.5)).toBe("0.5 km");
      expect(formatDistanceKm(1.23)).toBe("1.2 km");
      expect(formatDistanceKm(12.0)).toBe("12.0 km");
    });

    it("returns empty string instead of 'Nearby' when venue coordinates are missing/null", () => {
      const venueWithoutCoords: DiscoveryItem = {
        id: "place_no_coords",
        title: "Aries Sports Arena",
        category: "SPORTS",
        subcategory: "Sports Complex",
        cover_image_url: "https://images.unsplash.com/photo-1.jpg",
        location: "Ganesha Block, Sultanpalya, Hebbal, Bengaluru",
        place_address: "Ganesha Block, Sultanpalya, Hebbal, Bengaluru",
        latitude: null as any,
        longitude: null as any,
        rating: 4.5,
      } as any;

      const resolved = resolveVenueDistance(venueWithoutCoords, mockUserOrigin);
      expect(resolved).toBe("");
      expect(resolved).not.toBe("Nearby");
    });

    it("discards existing 'Nearby' string on item.distance property", () => {
      const venueWithNearbyString: DiscoveryItem = {
        id: "place_nearby_str",
        title: "BBMP Basketball Court",
        category: "SPORTS",
        cover_image_url: "https://images.unsplash.com/photo-2.jpg",
        distance: "Nearby",
      } as any;

      const resolved = resolveVenueDistance(venueWithNearbyString, mockUserOrigin);
      expect(resolved).toBe("");
      expect(resolved).not.toBe("Nearby");
    });

    it("preserves authentic precomputed numeric distance", () => {
      const venueWithNumericDist: DiscoveryItem = {
        id: "place_with_num",
        title: "Gen Z Beta Cafe",
        category: "DINING",
        cover_image_url: "https://images.unsplash.com/photo-3.jpg",
        _distanceKm: 0.54,
      } as any;

      const resolved = resolveVenueDistance(venueWithNumericDist, mockUserOrigin);
      expect(resolved).toBe("0.5 km");
    });
  });

  describe("2. Venue Card Metadata Row Verification", () => {
    it("SportsCard renders locality and rating, but never renders 'Nearby'", () => {
      const sportsVenue: DiscoveryItem = {
        id: "place_sports_1",
        title: "Aries Sports Arena",
        category: "SPORTS",
        subcategory: "Sports Complex",
        cover_image_url: "https://images.unsplash.com/photo-sports.jpg",
        place_address: "Ganesha Block, Sultanpalya, Hebbal, Bengaluru",
        location: "Hebbal, Bengaluru",
        latitude: null as any,
        longitude: null as any,
        rating: 4.5,
      } as any;

      const html = renderToString(
        <SportsCard
          item={sportsVenue}
          userCoordinates={mockUserOrigin}
          onTap={vi.fn()}
        />
      );

      // Must render title
      expect(html).toContain("Aries Sports Arena");
      // Must render locality (Hebbal)
      expect(html).toContain("Hebbal");
      // Must render rating
      expect(html).toContain("4.5");
      // Must NEVER contain the generic label "Nearby"
      expect(html).not.toContain("Nearby");
    });

    it("RestaurantCard displays distance if available and never falls back to 'Nearby'", () => {
      const restaurantVenue: DiscoveryItem = {
        id: "place_cafe_1",
        title: "Gen Z Beta Cafe",
        category: "DINING",
        subcategory: "Cafe",
        cover_image_url: "https://images.unsplash.com/photo-cafe.jpg",
        latitude: 12.9730,
        longitude: 77.5950,
        rating: 4.1,
      } as any;

      const html = renderToString(
        <RestaurantCard
          item={restaurantVenue}
          userCoordinates={mockUserOrigin}
          onTap={vi.fn()}
        />
      );

      expect(html).toContain("Gen Z Beta Cafe");
      expect(html).toContain("4.1");
      expect(html).toMatch(/\d+\.\d+ km/);
      expect(html).not.toContain("Nearby");
    });

    it("ActivityCard with missing coordinates renders cleanly without 'Nearby'", () => {
      const activityVenue: DiscoveryItem = {
        id: "place_activity_1",
        title: "Mystery Rooms",
        category: "ACTIVITIES",
        subcategory: "Escape Room",
        cover_image_url: "https://images.unsplash.com/photo-activity.jpg",
        latitude: null as any,
        longitude: null as any,
        rating: 4.7,
      } as any;

      const html = renderToString(
        <ActivityCard
          item={activityVenue}
          userCoordinates={mockUserOrigin}
          onTap={vi.fn()}
        />
      );

      expect(html).toContain("Mystery Rooms");
      expect(html).toContain("4.7");
      expect(html).not.toContain("Nearby");
    });
  });

  describe("3. Standalone Nearby Section Removal", () => {
    it("DiscoverySection completely rejects rendering sections titled 'Nearby' or 'Nearby Places'", () => {
      const dummyItems: DiscoveryItem[] = [
        {
          id: "item_1",
          title: "Venue 1",
          category: "SPORTS",
          cover_image_url: "https://images.unsplash.com/photo-1.jpg",
        } as any,
      ];

      const nearbySectionHtml = renderToString(
        <DiscoverySection
          title="Nearby"
          items={dummyItems}
          onSelectItem={vi.fn()}
        />
      );
      expect(nearbySectionHtml).toBe("");

      const nearbyPlacesSectionHtml = renderToString(
        <DiscoverySection
          title="Nearby Places"
          items={dummyItems}
          onSelectItem={vi.fn()}
        />
      );
      expect(nearbyPlacesSectionHtml).toBe("");
    });

    it("DiscoverySection still properly renders intended sections like Sports, Dining, Activities", () => {
      const dummyItems: DiscoveryItem[] = [
        {
          id: "item_sports_1",
          title: "Aries Arena",
          category: "SPORTS",
          cover_image_url: "https://images.unsplash.com/photo-1.jpg",
        } as any,
      ];

      const sportsSectionHtml = renderToString(
        <DiscoverySection
          title="Sports"
          items={dummyItems}
          onSelectItem={vi.fn()}
        />
      );
      expect(sportsSectionHtml).toContain("Sports");
      expect(sportsSectionHtml).toContain("Aries Arena");
      expect(sportsSectionHtml).not.toContain("Nearby");
    });
  });

  describe("4. discoveryService filters out any section with category NEARBY or title Nearby", () => {
    it("getSectionsByCategory drops any section titled Nearby from backend", async () => {
      const mockBackendSections = [
        {
          id: "places_sports",
          category: "SPORTS",
          title: "Sports",
          items: [
            {
              id: "item_1",
              title: "Turf Arena",
              category: "SPORTS",
              cover_image_url: "https://images.unsplash.com/turf.jpg",
              latitude: 12.9716,
              longitude: 77.5946,
            },
          ],
        },
        {
          id: "places_nearby",
          category: "NEARBY",
          title: "Nearby",
          items: [
            {
              id: "item_2",
              title: "Nearby Venue",
              category: "SPORTS",
              cover_image_url: "https://images.unsplash.com/venue.jpg",
              latitude: 12.9716,
              longitude: 77.5946,
            },
          ],
        },
        {
          id: "places_nearby_places",
          category: "DINING",
          title: "Nearby Places",
          items: [
            {
              id: "item_3",
              title: "Cafe Nearby",
              category: "DINING",
              cover_image_url: "https://images.unsplash.com/cafe.jpg",
              latitude: 12.9716,
              longitude: 77.5946,
            },
          ],
        },
      ];

      vi.spyOn(supabase.functions, "invoke").mockResolvedValueOnce({
        data: { sections: mockBackendSections },
        error: null,
      } as any);

      const result = await getSectionsByCategory("all", true, {
        latitude: 12.9716,
        longitude: 77.5946,
        city: "Bengaluru",
      });

      const titles = result.map((s) => s.title);
      expect(titles).toContain("Sports");
      expect(titles).not.toContain("Nearby");
      expect(titles).not.toContain("Nearby Places");

      const categories = result.map((s) => (s.category || "").toUpperCase());
      expect(categories).not.toContain("NEARBY");
    });
  });
});
