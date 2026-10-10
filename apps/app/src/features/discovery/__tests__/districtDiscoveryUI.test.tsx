import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  DiscoveryCard,
  RestaurantCard,
  SportsCard,
  MovieCard,
} from "../components/DiscoveryCard";
import { DiscoverySection } from "../components/DiscoverySection";
import { ForYouSections } from "../components/ForYouSections";
import { PlacePreviewSheet } from "../components/PlacePreviewSheet";
import { DiscoveryItem, DiscoverySection as DiscoverySectionType } from "../../../core/types/discovery";

describe("District Discovery UI Architecture Suite", () => {
  const mockSportsItem: DiscoveryItem = {
    id: "item_sports_1",
    public_id: "public_sports_1",
    section_id: "sec_sports",
    title: "Fusion The Turf",
    category: "SPORTS",
    subcategory: "turfs",
    description: "FIFA standard artificial turf with floodlights",
    cover_image_url: "https://images.unsplash.com/turf-1.jpg",
    location: "Koramangala, Bangalore",
    suggested_duration_minutes: 90,
    suggested_cost_amount: 1500,
    suggested_capacity: 10,
    default_rsvp_offset_minutes: 120,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    place_id: "place_123",
    place_address: "100 Feet Rd, Koramangala",
    latitude: 12.9352,
    longitude: 77.6245,
    distance: "1.9 km",
  };

  const mockDiningItem: DiscoveryItem = {
    id: "item_dining_1",
    public_id: "public_dining_1",
    section_id: "sec_dining",
    title: "The Chancery Pavilion",
    category: "DINING",
    subcategory: "restaurants",
    description: "Multi-cuisine fine dining restaurant",
    cover_image_url: "https://images.unsplash.com/dining-1.jpg",
    location: "Residency Road, Bangalore",
    suggested_duration_minutes: 120,
    suggested_cost_amount: 2000,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 60,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    place_id: "place_dining_456",
    place_address: "Residency Road, Bangalore",
  };

  const mockMovieItem: DiscoveryItem = {
    id: "item_movie_1",
    public_id: "public_movie_1",
    section_id: "sec_movies",
    title: "PVR Cinemas Nexus",
    category: "MOVIES",
    subcategory: "cinemas",
    description: "IMAX and 4DX cinema multiplex",
    cover_image_url: "https://images.unsplash.com/movie-1.jpg",
    location: "Koramangala, Bangalore",
    suggested_duration_minutes: 150,
    suggested_cost_amount: 500,
    suggested_capacity: 2,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    place_id: "place_movie_789",
    place_address: "Nexus Mall, Koramangala",
  };

  describe("DiscoveryCard Mobile Anatomy (Two-Section Clean Card)", () => {
    it("renders with snap-start and modern discovery card dimensions (220x225px)", () => {
      const html = renderToString(
        <DiscoveryCard
          item={mockSportsItem}
          isAdmin={false}
          onTap={vi.fn()}
        />
      );

      expect(html).toContain("snap-start");
      expect(html).toContain("width:220px");
      expect(html).toContain("height:225px");
      expect(html).toContain("rounded-2xl");
      expect(html).toContain("Fusion The Turf");
      expect(html).toContain("5.2 km");
      expect(html).not.toContain("Koramangala, Bangalore");
      // Clean photograph with opacity: 1 and no text gradient overlay
      expect(html).toContain("opacity:1");
      expect(html).not.toContain("bg-gradient-to-t");
      // Information section with rating star
      expect(html).toContain("★");
    });

    it("renders semantic RestaurantCard, SportsCard, and MovieCard components", () => {
      const restaurantHtml = renderToString(
        <RestaurantCard item={mockDiningItem} onTap={vi.fn()} />
      );
      expect(restaurantHtml).toContain("The Chancery Pavilion");
      expect(restaurantHtml).toContain("width:220px");

      const sportsHtml = renderToString(
        <SportsCard item={mockSportsItem} onTap={vi.fn()} />
      );
      expect(sportsHtml).toContain("Fusion The Turf");
      expect(sportsHtml).toContain("width:220px");

      const movieHtml = renderToString(
        <MovieCard item={mockMovieItem} onTap={vi.fn()} />
      );
      expect(movieHtml).toContain("PVR Cinemas Nexus");
      expect(movieHtml).toContain("width:220px");
    });
  });

  describe("DiscoverySection Horizontal Rail", () => {
    it("renders title, subtitle, view all CTA, and horizontal snapping items", () => {
      const html = renderToString(
        <DiscoverySection
          title="Restaurants near you"
          subtitle="Great hangout spots for food &amp; drinks"
          items={[mockDiningItem]}
          onSelectItem={vi.fn()}
          onViewAll={vi.fn()}
        />
      );

      expect(html).toContain("Restaurants near you");
      expect(html).toContain("Great hangout spots for food &amp; drinks");
      expect(html).toContain("View all");
      expect(html).toContain("The Chancery Pavilion");
    });
  });

  describe("ForYouSections Dynamic Multi-Section Feed", () => {
    const mockSections: DiscoverySectionType[] = [
      {
        id: "sec_sports",
        public_id: "sec_sports",
        category: "SPORTS",
        title: "Sports",
        description: "Sports venues",
        display_order: 1,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [mockSportsItem],
      },
      {
        id: "sec_dining",
        public_id: "sec_dining",
        category: "DINING",
        title: "Dining",
        description: "Dining venues",
        display_order: 2,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [mockDiningItem],
      },
      {
        id: "sec_movies",
        public_id: "sec_movies",
        category: "MOVIES",
        title: "Movies",
        description: "Cinema venues",
        display_order: 3,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [mockMovieItem],
      },
    ];

    it("renders interleaved dining and sports rails in For You feed", () => {
      const html = renderToString(
        <ForYouSections
          sections={mockSections}
          searchQuery=""
          categoryFilter="all"
          onSelectItem={vi.fn()}
        />
      );

      // Sports and Restaurants rails are present
      expect(html).toContain("Sports");
      expect(html).toContain("Restaurants");
      expect(html).toContain("The Chancery Pavilion");
      expect(html).toContain("Fusion The Turf");
    });

    it("filters sections cleanly by search query without faking data", () => {
      const html = renderToString(
        <ForYouSections
          sections={mockSections}
          searchQuery="Turf"
          categoryFilter="all"
          onSelectItem={vi.fn()}
        />
      );

      expect(html).toContain("Fusion The Turf");
      expect(html).not.toContain("The Chancery Pavilion");
    });
  });

  describe("PlacePreviewSheet Bottom Sheet", () => {
    it("renders place details and Create a plan CTA", () => {
      const html = renderToString(
        <PlacePreviewSheet
          item={mockSportsItem}
          onClose={vi.fn()}
          onConfirmPlan={vi.fn()}
        />
      );

      expect(html).toContain("Fusion The Turf");
      expect(html).toContain("Koramangala");
      expect(html).not.toContain("100 Feet Rd, Koramangala");
      expect(html).toContain("Turf");
      expect(html).toContain("5.2 km");
      expect(html).toContain("Create a plan");
      expect(html).not.toContain("Pick a date, invite your squad");
      expect(html).not.toContain("DINING &amp; CAFE");
    });

    it("renders nothing when item is null", () => {
      const html = renderToString(
        <PlacePreviewSheet
          item={null}
          onClose={vi.fn()}
          onConfirmPlan={vi.fn()}
        />
      );
      expect(html).toBe("");
    });
  });

  describe("BrowseExperiencesStep Layout Hierarchy (District Layout)", () => {
    it("renders top location, 2x2 category grid, search bar, and For You feed without large Planless header", async () => {
      const { BrowseExperiencesStep } = await import("../screens/Discovery");
      const html = renderToString(
        <BrowseExperiencesStep
          userProfile={{
            name: "Thilak",
            avatar: "https://example.com/avatar.jpg",
            phone: "+919999999999",
            bio: "Founder",
            joined: true,
          }}
          setActiveTab={vi.fn()}
          onSelectDiscoveryItem={vi.fn()}
          onSelectCustomPlan={vi.fn()}
        />
      );

      // 1. No large Planless header
      expect(html).not.toContain("font-script text-white text-3xl");

      // 2. Top Location bar
      expect(html).toContain("Nearby");

      // 3. Category cards with primary categories
      expect(html).toContain("Dining");
      expect(html).toContain("Movies");
      expect(html).toContain("Sports");

      // 4. Search bar and For You header removed
      expect(html).not.toContain("Search activities, movies, restaurants...");
      expect(html).not.toContain('<h3 class="text-base font-bold text-white tracking-tight">For You</h3>');
    });
  });
});

