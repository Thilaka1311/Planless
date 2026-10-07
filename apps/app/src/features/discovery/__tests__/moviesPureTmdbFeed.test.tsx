import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import * as tmdbService from "../services/tmdbMovieService";
import { ForYouSections, useMoviesStream } from "../components/ForYouSections";
import { DiscoveryItem, DiscoverySection as DiscoverySectionType } from "../../../core/types/discovery";

// Mock ProfileContext
vi.mock("../../profile/state/ProfileContext", () => ({
  useProfileStore: () => ({ isAdmin: false }),
}));

// Mock stream hooks for venues
vi.mock("../hooks/useDiscoveryStream", () => ({
  useDiscoveryStream: ({ category, initialItems }: any) => ({
    allVenues: initialItems || [],
    isLoadingInitial: false,
    isLoadingMore: false,
    hasMore: false,
    loadMore: vi.fn(),
  }),
}));

describe("Movies Pure TMDB Feed Integration", () => {
  const mockSportsItem: DiscoveryItem = {
    id: "item_sports_1",
    public_id: "public_sports_1",
    section_id: "sec_sports",
    title: "Bengaluru Turf Inc.",
    category: "SPORTS",
    subcategory: "turfs",
    description: "Football turf",
    cover_image_url: "https://images.unsplash.com/turf.jpg",
    location: "Vidyaranyapura",
    suggested_duration_minutes: 90,
    suggested_cost_amount: 1500,
    suggested_capacity: 10,
    default_rsvp_offset_minutes: 120,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    place_id: "place_turf_1",
    place_address: "Vidyaranyapura, Bengaluru",
    latitude: 13.08,
    longitude: 77.56,
  };

  const mockDiningItem: DiscoveryItem = {
    id: "item_dining_1",
    public_id: "public_dining_1",
    section_id: "sec_dining",
    title: "Truffles Cafe",
    category: "DINING",
    subcategory: "restaurants",
    description: "Burgers & shakes",
    cover_image_url: "https://images.unsplash.com/dining.jpg",
    location: "Koramangala",
    suggested_duration_minutes: 60,
    suggested_cost_amount: 800,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 60,
    display_order: 2,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    place_id: "place_dining_1",
    place_address: "Koramangala, Bengaluru",
    latitude: 12.93,
    longitude: 77.62,
  };

  const mockActivityItem: DiscoveryItem = {
    id: "item_act_1",
    public_id: "public_act_1",
    section_id: "sec_act",
    title: "Mystery Rooms",
    category: "ACTIVITIES",
    subcategory: "escape_room",
    description: "Real escape game experience",
    cover_image_url: "https://images.unsplash.com/escape.jpg",
    location: "Indiranagar",
    suggested_duration_minutes: 60,
    suggested_cost_amount: 1000,
    suggested_capacity: 6,
    default_rsvp_offset_minutes: 60,
    display_order: 3,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    place_id: "place_act_1",
    place_address: "Indiranagar, Bengaluru",
    latitude: 12.97,
    longitude: 77.64,
  };

  // Google Places cinema venue (MUST NEVER APPEAR UNDER MOVIES)
  const mockPlacesCinemaVenue: DiscoveryItem = {
    id: "place_cinema_99",
    public_id: "place_cinema_99",
    section_id: "places_movies",
    title: "Vainidhi Cinemas Dolby Lazer",
    category: "MOVIES",
    subcategory: "movie_theater",
    description: "Multiplex Cinema",
    cover_image_url: "",
    location: "Vidyaranyapura",
    suggested_duration_minutes: 150,
    suggested_cost_amount: null,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    place_id: "ChIJ_cinema_fake_id",
  };

  const mockTmdbMovie: DiscoveryItem = {
    id: "tmdb-12345",
    public_id: "tmdb-12345",
    section_id: "movies-trending",
    title: "Kalki 2898 AD",
    category: "MOVIES",
    subcategory: "Sci-Fi | Action",
    description: "A modern avatar of Vishnu descends to protect the world.",
    cover_image_url: "https://image.tmdb.org/t/p/w500/kalki_poster.jpg",
    location: "",
    suggested_duration_minutes: 180,
    suggested_cost_amount: null,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    movie_id: 12345,
    release_date: "2025-01-15",
  };

  beforeEach(() => {
    vi.spyOn(tmdbService, "getCachedMovieSection").mockReturnValue([mockTmdbMovie]);
    vi.spyOn(tmdbService, "isMovieWithinSixMonths").mockReturnValue(true);
  });

  it("does not render Google Places cinema venues even if passed in sections prop", () => {
    const sectionsWithUnwantedPlacesMovies: DiscoverySectionType[] = [
      {
        id: "places_sports",
        public_id: "places_sports",
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
        id: "places_movies",
        public_id: "places_movies",
        category: "MOVIES",
        title: "Movies",
        description: "Theatres nearby",
        display_order: 2,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [mockPlacesCinemaVenue], // Unwanted Google Places cinema
      },
      {
        id: "places_dining",
        public_id: "places_dining",
        category: "DINING",
        title: "Restaurants",
        description: "Dining places",
        display_order: 3,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [mockDiningItem],
      },
      {
        id: "places_activities",
        public_id: "places_activities",
        category: "ACTIVITIES",
        title: "Activities",
        description: "Activities",
        display_order: 4,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [mockActivityItem],
      },
    ];

    const html = renderToString(
      <ForYouSections
        sections={sectionsWithUnwantedPlacesMovies}
        searchQuery=""
        categoryFilter="all"
        onSelectItem={vi.fn()}
      />
    );

    // Sports, Restaurants, Activities venues are rendered from their respective discovery items
    expect(html).toContain("Bengaluru Turf Inc.");
    expect(html).toContain("Truffles Cafe");
    expect(html).toContain("Mystery Rooms");

    // The Google Places cinema venue MUST NOT appear anywhere in the output
    expect(html).not.toContain("Vainidhi Cinemas Dolby Lazer");
    expect(html).not.toContain("ChIJ_cinema_fake_id");

    // Actual TMDB movie is rendered
    expect(html).toContain("Kalki 2898 AD");
    expect(html).toContain("https://image.tmdb.org/t/p/w500/kalki_poster.jpg");
  });

  it("maintains the interleaved category structure (Sports -> Movies -> Restaurants -> Activities)", () => {
    const sections: DiscoverySectionType[] = [
      {
        id: "places_sports",
        public_id: "places_sports",
        category: "SPORTS",
        title: "Sports",
        description: "Sports venues",
        items: [mockSportsItem],
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
        description: "Dining places",
        items: [mockDiningItem],
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
        description: "Activities",
        items: [mockActivityItem],
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

    // Verify all four category headers are present in the DOM
    const sportsIndex = html.indexOf("Sports");
    const moviesIndex = html.indexOf("Movies");
    const restaurantsIndex = html.indexOf("Restaurants");
    const activitiesIndex = html.indexOf("Activities");

    expect(sportsIndex).toBeGreaterThan(-1);
    expect(moviesIndex).toBeGreaterThan(sportsIndex);
    expect(restaurantsIndex).toBeGreaterThan(moviesIndex);
    expect(activitiesIndex).toBeGreaterThan(restaurantsIndex);
  });
});
