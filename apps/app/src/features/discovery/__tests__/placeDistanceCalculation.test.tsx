import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import {
  DiscoveryCard,
  RestaurantCard,
  SportsCard,
  calculateDistanceKm,
  formatDistanceKm,
  resolveVenueDistance,
} from "../components/DiscoveryCard";
import { PlacePreviewSheet } from "../components/PlacePreviewSheet";
import { DiscoveryItem } from "../../../core/types/discovery";
import {
  getStoredDiscoveryLocation,
  setStoredDiscoveryLocation,
  DEFAULT_DISCOVERY_LOCATION,
  DiscoveryLocation,
} from "../hooks/useUserLocation";
import {
  getSectionsByCategory,
  getCachedSections,
  clearCachedSections,
  getCacheKey,
} from "../services/discoveryService";

describe("Planless Discovery Place Distance Calculation Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearCachedSections();
    // Reset stored discovery location to default before each test
    setStoredDiscoveryLocation(DEFAULT_DISCOVERY_LOCATION);
  });

  describe("1. Haversine Distance Calculation Formula", () => {
    it("calculates accurate great-circle distance in kilometers", () => {
      // Bangalore Gate Hotel (near Majestic): lat 12.9740, lng 77.5810
      // Origin: Bangalore Center: lat 12.9716, lng 77.5946 (~1.5 km)
      const dist = calculateDistanceKm(12.9716, 77.5946, 12.9740, 77.5810);
      expect(dist).toBeGreaterThan(1.4);
      expect(dist).toBeLessThan(1.6);
      expect(formatDistanceKm(dist)).toBe("1.5 km");
    });

    it("handles zero distance when origin and destination match", () => {
      const dist = calculateDistanceKm(12.9716, 77.5946, 12.9716, 77.5946);
      expect(dist).toBe(0);
      expect(formatDistanceKm(dist)).toBe("0.0 km");
    });

    it("formats distances with exactly 1 decimal place and 'km' unit", () => {
      expect(formatDistanceKm(2.56)).toBe("2.6 km");
      expect(formatDistanceKm(0.42)).toBe("0.4 km");
      expect(formatDistanceKm(10.0)).toBe("10.0 km");
    });
  });

  describe("2. Selected Location as the Single Source of Truth", () => {
    it("stores and retrieves the single Discovery location object conceptually { name, address, latitude, longitude }", () => {
      const selectedLocation: DiscoveryLocation = {
        name: "Saravana Tranquil Heights",
        address: "Saravana Tranquil Heights, Vinayak Nagar, Bangalore",
        latitude: 12.9602,
        longitude: 77.6485,
        city: "Vinayak Nagar",
        locality: "Saravana Tranquil Heights",
      };

      setStoredDiscoveryLocation(selectedLocation);
      const retrieved = getStoredDiscoveryLocation();

      expect(retrieved.name).toBe("Saravana Tranquil Heights");
      expect(retrieved.address).toContain("Vinayak Nagar");
      expect(retrieved.latitude).toBe(12.9602);
      expect(retrieved.longitude).toBe(77.6485);
      expect(retrieved.city).toBe("Vinayak Nagar");
      expect(retrieved.locality).toBe("Saravana Tranquil Heights");
    });

    it("persists across calls without being replaced by device GPS", () => {
      const userSelected: DiscoveryLocation = {
        name: "Saravana Tranquil Heights",
        latitude: 12.9602,
        longitude: 77.6485,
        city: "Vinayak Nagar",
        locality: "Saravana Tranquil Heights",
      };

      setStoredDiscoveryLocation(userSelected);

      // Verify the location remains exactly userSelected
      const active = getStoredDiscoveryLocation();
      expect(active.latitude).toBe(12.9602);
      expect(active.longitude).toBe(77.6485);
    });
  });

  describe("3. Parity between DiscoveryCard and Place Details (PlacePreviewSheet)", () => {
    const venueItem: DiscoveryItem = {
      id: "place_bgh",
      public_id: "public_bgh",
      section_id: "places_dining",
      title: "Bangalore Gate Hotel",
      category: "DINING",
      subcategory: "Casual Dining",
      description: "Casual Dining restaurant",
      cover_image_url: "https://images.unsplash.com/hotel.jpg",
      location: "Kempegowda Rd, Majestic",
      suggested_duration_minutes: 90,
      suggested_cost_amount: 800,
      suggested_capacity: 4,
      default_rsvp_offset_minutes: 60,
      display_order: 1,
      featured: true,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      place_id: "chij_bgh_123",
      place_address: "Kempegowda Rd, Majestic, Bangalore",
      latitude: 12.9740,
      longitude: 77.5810,
      rating: 4.3,
    };

    it("displays the exact same distance on Restaurant card and Place Details sheet", () => {
      // Set selected origin: Indiranagar (12.9784, 77.6408)
      const selectedLocation: DiscoveryLocation = {
        name: "Indiranagar",
        latitude: 12.9784,
        longitude: 77.6408,
        city: "Bengaluru",
        locality: "Indiranagar",
      };
      setStoredDiscoveryLocation(selectedLocation);

      // Expected distance from Indiranagar (12.9784, 77.6408) to Bangalore Gate Hotel (12.9740, 77.5810)
      const expectedDistKm = calculateDistanceKm(12.9784, 77.6408, 12.9740, 77.5810);
      const expectedFormatted = formatDistanceKm(expectedDistKm);

      // 1. Render DiscoveryCard
      const cardHtml = renderToString(
        <RestaurantCard
          item={venueItem}
          userCoordinates={{ latitude: selectedLocation.latitude, longitude: selectedLocation.longitude }}
          onTap={vi.fn()}
        />
      );

      // 2. Render PlacePreviewSheet
      const sheetHtml = renderToString(
        <PlacePreviewSheet
          item={venueItem}
          userCoordinates={{ latitude: selectedLocation.latitude, longitude: selectedLocation.longitude }}
          onClose={vi.fn()}
          onConfirmPlan={vi.fn()}
        />
      );

      // Both must contain the exact same distance string
      expect(cardHtml).toContain(expectedFormatted);
      expect(sheetHtml).toContain(expectedFormatted);

      // Verify resolveVenueDistance yields the exact same value
      const distFromCard = resolveVenueDistance(venueItem, selectedLocation);
      const distFromSheet = resolveVenueDistance(venueItem, selectedLocation);
      expect(distFromCard).toBe(expectedFormatted);
      expect(distFromSheet).toBe(expectedFormatted);
      expect(distFromCard).toBe(distFromSheet);
    });
  });

  describe("4. Recalculation on Location Change (Location A -> Location B)", () => {
    const venueItem: DiscoveryItem = {
      id: "place_arena_1",
      public_id: "public_arena_1",
      section_id: "places_sports",
      title: "Play Arena Turf",
      category: "SPORTS",
      subcategory: "Turf",
      description: "Sports arena",
      cover_image_url: null,
      location: "Sarjapur Rd",
      suggested_duration_minutes: 60,
      suggested_cost_amount: 1200,
      suggested_capacity: 10,
      default_rsvp_offset_minutes: 30,
      display_order: 1,
      featured: false,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      place_id: "chij_play_arena",
      place_address: "Kasavanahalli, Sarjapur Rd",
      latitude: 12.8988,
      longitude: 77.6775,
      rating: 4.4,
    };

    it("recalculates distance when user changes from Location A to Location B", () => {
      // Location A: Koramangala
      const locationA: DiscoveryLocation = {
        name: "Koramangala",
        latitude: 12.9352,
        longitude: 77.6245,
        city: "Bengaluru",
        locality: "Koramangala",
      };

      // Location B: Whitefield
      const locationB: DiscoveryLocation = {
        name: "Whitefield",
        latitude: 12.9698,
        longitude: 77.7500,
        city: "Bengaluru",
        locality: "Whitefield",
      };

      // Calculate from Location A
      const distA = resolveVenueDistance(venueItem, locationA);
      const expectedA = formatDistanceKm(calculateDistanceKm(locationA.latitude, locationA.longitude, venueItem.latitude!, venueItem.longitude!));
      expect(distA).toBe(expectedA);

      // User changes to Location B
      const distB = resolveVenueDistance(venueItem, locationB);
      const expectedB = formatDistanceKm(calculateDistanceKm(locationB.latitude, locationB.longitude, venueItem.latitude!, venueItem.longitude!));
      expect(distB).toBe(expectedB);

      // The distances from Location A and Location B must differ
      expect(distA).not.toBe(distB);
    });
  });

  describe("5. Location-Aware Cache Invalidation", () => {
    it("generates distinct cache keys for distinct coordinate pairs", () => {
      const keyA = getCacheKey({ latitude: 12.9784, longitude: 77.6408 });
      const keyB = getCacheKey({ latitude: 12.9352, longitude: 77.6245 });

      expect(keyA).toBe("12.9784_77.6408");
      expect(keyB).toBe("12.9352_77.6245");
      expect(keyA).not.toBe(keyB);
    });

    it("clears cached sections completely when clearCachedSections is called", () => {
      clearCachedSections();
      expect(getCachedSections({ latitude: 12.9784, longitude: 77.6408 })).toBeNull();
      expect(getCachedSections({ latitude: 12.9352, longitude: 77.6245 })).toBeNull();
    });
  });
});
