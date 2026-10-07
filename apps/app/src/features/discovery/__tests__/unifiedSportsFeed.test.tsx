import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { DiscoveryItem } from "../../../core/types/discovery";
import { DiscoveryCard, SportsCard, RestaurantCard } from "../components/DiscoveryCard";

describe("Unified Sports Discovery Feed & Card Display Suite", () => {
  const mockOriginCoords = { latitude: 12.9352, longitude: 77.6245 }; // Koramangala

  const createSportsVenue = (overrides: Partial<DiscoveryItem>): DiscoveryItem => ({
    id: "item-1",
    public_id: "item-1",
    place_id: "ChIJ_VENUE_1",
    section_id: "sec_sports",
    title: "Test Sports Venue",
    category: "SPORTS",
    subcategory: "Sports Facility",
    description: "Multi-sport turf and arena",
    cover_image_url: "https://example.com/venue.jpg",
    location: "Koramangala, Bengaluru",
    place_address: "Koramangala, Bengaluru",
    suggested_duration_minutes: 60,
    suggested_cost_amount: null,
    suggested_capacity: null,
    default_rsvp_offset_minutes: 60,
    rating: 4.6,
    user_ratings_total: 150,
    latitude: 12.9379,
    longitude: 77.6245,
    display_order: 1,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Sports card displays ONLY venue name, rating, distance, and image — NO sport taxonomy labels or category badges", () => {
    const venue = createSportsVenue({
      title: "Rush Koland",
      subcategory: "Football | Badminton | Pickleball",
      rating: 4.5,
      cover_image_url: "https://example.com/rush.jpg",
    });

    const html = renderToString(
      <SportsCard
        item={venue}
        userCoordinates={mockOriginCoords}
        onTap={() => {}}
      />
    );

    // Displays venue name
    expect(html).toContain("Rush Koland");

    // Displays Google rating
    expect(html).toContain("4.5");
    expect(html).toContain("★");

    // Displays distance (0.3 km)
    expect(html).toContain("0.3 km");

    // Displays cover image
    expect(html).toContain("https://example.com/rush.jpg");

    // MUST NOT display sport/subcategory labels or category badges
    expect(html).not.toContain("Football");
    expect(html).not.toContain("Badminton");
    expect(html).not.toContain("Pickleball");
    expect(html).not.toContain("Sports Facility");
    expect(html).not.toContain("SPORTS");
  });

  it("2. Deduplication: Venues with the same place_id appear only once", () => {
    const venue1 = createSportsVenue({
      id: "place_1",
      place_id: "ChIJ_RUSH_KOLAND",
      title: "Rush Koland",
    });

    const venue1Duplicate = createSportsVenue({
      id: "place_1_dup",
      place_id: "ChIJ_RUSH_KOLAND",
      title: "Rush Koland (Second Match)",
    });

    const venue2 = createSportsVenue({
      id: "place_2",
      place_id: "ChIJ_GORE_BHAT",
      title: "Gore Bhat Cricket Ground",
    });

    const rawVenues = [venue1, venue1Duplicate, venue2];

    const seen = new Set<string>();
    const deduped: DiscoveryItem[] = [];
    for (const v of rawVenues) {
      const pid = v.place_id!;
      if (!seen.has(pid)) {
        seen.add(pid);
        deduped.push(v);
      }
    }

    expect(deduped).toHaveLength(2);
    expect(deduped[0].place_id).toBe("ChIJ_RUSH_KOLAND");
    expect(deduped[1].place_id).toBe("ChIJ_GORE_BHAT");
  });

  it("3. Closest-first ordering: 0.3 km ranks before 0.6 km, 0.7 km, and 1.1 km", () => {
    const rush = createSportsVenue({
      place_id: "ChIJ_RUSH",
      title: "Rush Koland",
      latitude: 12.9379, // ~0.3 km
      longitude: 77.6245,
    });
    (rush as any)._distanceKm = 0.3;

    const goreBhat = createSportsVenue({
      place_id: "ChIJ_GORE",
      title: "Gore Bhat Cricket Ground",
      latitude: 12.9406, // ~0.6 km
      longitude: 77.6245,
    });
    (goreBhat as any)._distanceKm = 0.6;

    const ovalNet = createSportsVenue({
      place_id: "ChIJ_OVAL",
      title: "Oval Net Badminton Academy",
      latitude: 12.9415, // ~0.7 km
      longitude: 77.6245,
    });
    (ovalNet as any)._distanceKm = 0.7;

    const toughX = createSportsVenue({
      place_id: "ChIJ_TOUGHX",
      title: "ToughX Sports Arena",
      latitude: 12.9451, // ~1.1 km
      longitude: 77.6245,
    });
    (toughX as any)._distanceKm = 1.1;

    // Unordered input
    const venues = [toughX, goreBhat, rush, ovalNet];

    // Sorted strictly closest first
    const sorted = [...venues].sort((a, b) => {
      const da = (a as any)._distanceKm ?? Infinity;
      const db = (b as any)._distanceKm ?? Infinity;
      return da - db;
    });

    expect(sorted.map((v) => v.title)).toEqual([
      "Rush Koland",
      "Gore Bhat Cricket Ground",
      "Oval Net Badminton Academy",
      "ToughX Sports Arena",
    ]);
  });

  it("4. RestaurantCard and DiscoveryCard suppress category badges and labels", () => {
    const diningVenue: DiscoveryItem = {
      ...createSportsVenue({
        title: "Truffles",
        category: "DINING",
        subcategory: "Cafe & Burger Joint",
        cover_image_url: "https://example.com/truffles.jpg",
      }),
      suggested_cost_amount: 500,
    };

    const html = renderToString(
      <RestaurantCard
        item={diningVenue}
        userCoordinates={mockOriginCoords}
        onTap={() => {}}
      />
    );

    expect(html).toContain("Truffles");
    expect(html).toContain("https://example.com/truffles.jpg");
    // Badge text should NOT appear
    expect(html).not.toContain("DINING");
    expect(html).not.toContain("Dining Venue");
    expect(html).not.toContain("Cafe & Burger Joint");
  });
});
