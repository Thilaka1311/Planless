import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { EndOfFeedIndicator } from "../components/EndOfFeedIndicator";
import {
  getCategorySeenSet,
  resetCategorySeenSet,
  clearAllCategorySeenSets,
} from "../hooks/useDiscoverySeenTracker";
import { DiscoverMovies } from "../screens/DiscoverMovies";
import { DiscoverDining } from "../screens/DiscoverDining";
import { DiscoverSports } from "../screens/DiscoverSports";
import { DiscoverActivities } from "../screens/DiscoverActivities";
import * as tmdbService from "../services/tmdbMovieService";
import { DiscoveryItem } from "../../../core/types/discovery";

// Mock ProfileContext
vi.mock("../../profile/state/ProfileContext", () => ({
  useProfileStore: () => ({ isAdmin: false }),
}));

// Mock usePlanlessSearch for dining/sports/activities tests
const mockPlanlessSearch = vi.fn();
vi.mock("../search/hooks/usePlanlessSearch", () => ({
  usePlanlessSearch: (...args: any[]) => mockPlanlessSearch(...args),
}));

// Mock useDiscoveryStream for venue continuous feeds
const mockDiscoveryStream = vi.fn();
vi.mock("../hooks/useDiscoveryStream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/useDiscoveryStream")>();
  return {
    ...actual,
    useDiscoveryStream: (...args: any[]) => mockDiscoveryStream(...args),
  };
});

describe("Unified Discovery End-of-Feed Experience", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearAllCategorySeenSets();
    mockPlanlessSearch.mockReturnValue({
      searchQuery: "",
      setSearchQuery: vi.fn(),
      isSearching: false,
      isSearchLoading: false,
      isSearchLoadingMore: false,
      hasMore: false,
      searchError: null,
      searchResults: [],
      loadMoreSearchResults: vi.fn(),
    });
    mockDiscoveryStream.mockReturnValue({
      sections: [],
      allVenues: [],
      hasMore: false,
      isLoadingMore: false,
      isLoadingInitial: false,
      loadMore: vi.fn(),
      sentinelRef: vi.fn(),
      resetStream: vi.fn(),
    });
  });

  describe("1. EndOfFeedIndicator Component", () => {
    it("renders the exact standardized text 'You\\'re all caught up'", () => {
      const html = renderToString(<EndOfFeedIndicator />);
      expect(html).toContain("You&#x27;re all caught up");
      expect(html).not.toContain("2026 Releases");
      expect(html).not.toContain("•");
    });

    it("applies understated typography, muted color, centered alignment, and not fixed", () => {
      const html = renderToString(<EndOfFeedIndicator />);
      expect(html).toContain("text-xs");
      expect(html).toContain("text-zinc-500");
      expect(html).toContain("text-center");
      expect(html).toContain("py-6");
      expect(html).not.toContain("fixed");
      expect(html).not.toContain("sticky");
    });
  });

  describe("2. Seen Content Tracking & Category Isolation", () => {
    it("maintains separate, isolated seen sets per category", () => {
      const moviesSeen = getCategorySeenSet("movies");
      const diningSeen = getCategorySeenSet("dining");
      const sportsSeen = getCategorySeenSet("sports");
      const activitiesSeen = getCategorySeenSet("activities");

      moviesSeen.add("movie-123");
      diningSeen.add("place-dining-456");

      expect(getCategorySeenSet("movies").has("movie-123")).toBe(true);
      expect(getCategorySeenSet("dining").has("movie-123")).toBe(false);
      expect(getCategorySeenSet("sports").has("movie-123")).toBe(false);
      expect(getCategorySeenSet("activities").has("movie-123")).toBe(false);

      expect(getCategorySeenSet("dining").has("place-dining-456")).toBe(true);
      expect(getCategorySeenSet("movies").has("place-dining-456")).toBe(false);
    });

    it("resetCategorySeenSet resets only the target category", () => {
      getCategorySeenSet("movies").add("movie-1");
      getCategorySeenSet("sports").add("sport-1");

      resetCategorySeenSet("movies");

      expect(getCategorySeenSet("movies").size).toBe(0);
      expect(getCategorySeenSet("sports").has("sport-1")).toBe(true);
    });
  });

  describe("3. Movies Screen End-of-Feed", () => {
    const movie2026: DiscoveryItem = {
      id: "tmdb-2026-1",
      public_id: "tmdb-2026-1",
      section_id: "movies",
      title: "Avatar 3",
      category: "MOVIES",
      subcategory: "Sci-Fi",
      description: "Avatar 3 description",
      cover_image_url: "https://image.tmdb.org/t/p/w500/avatar3.jpg",
      location: "",
      suggested_duration_minutes: 190,
      suggested_cost_amount: null,
      suggested_capacity: 4,
      default_rsvp_offset_minutes: 30,
      display_order: 1,
      featured: true,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      movie_id: 999901,
      release_date: "2026-12-18",
      original_language: "en",
      language_name: "English",
    };

    it("displays 'You\\'re all caught up' without '2026 Releases' when feed has items and is exhausted", () => {
      vi.spyOn(tmdbService, "getCachedMovieSection").mockReturnValue([movie2026]);

      const html = renderToString(
        <DiscoverMovies
          onBack={vi.fn()}
          onSelectDiscoveryItem={vi.fn()}
          initialHasMore={false}
        />
      );

      expect(html).toContain("Avatar 3");
      // Standardized indicator present
      expect(html).toContain("You&#x27;re all caught up");
      // Category suffix removed from end-of-feed message
      expect(html).not.toContain("You&#x27;re all caught up • 2026 Releases");
    });
  });

  describe("4. Dining Screen End-of-Feed", () => {
    const diningVenue: DiscoveryItem = {
      id: "place_dining_1",
      public_id: "place_dining_1",
      place_id: "place_dining_1",
      section_id: "dining",
      title: "Truffles Koramangala",
      category: "DINING",
      subcategory: "Burger joint",
      description: "Famous burgers",
      cover_image_url: "https://example.com/truffles.jpg",
      location: "Koramangala, Bangalore",
      place_address: "Koramangala 5th Block",
      suggested_duration_minutes: 60,
      suggested_cost_amount: null,
      suggested_capacity: 4,
      default_rsvp_offset_minutes: 30,
      display_order: 1,
      featured: true,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it("shows 'You\\'re all caught up' when stream feed has items and hasMore is false", () => {
      mockDiscoveryStream.mockReturnValue({
        sections: [
          {
            id: "sec_tier_0",
            title: "Within 5 km",
            subtitle: "Closest venues",
            items: [diningVenue],
          },
        ],
        allVenues: [diningVenue],
        hasMore: false,
        isLoadingMore: false,
        isLoadingInitial: false,
        loadMore: vi.fn(),
        sentinelRef: vi.fn(),
        resetStream: vi.fn(),
      });

      const html = renderToString(
        <DiscoverDining
          onBack={vi.fn()}
          onSelectDiscoveryItem={vi.fn()}
        />
      );

      expect(html).toContain("Truffles Koramangala");
      expect(html).toContain("You&#x27;re all caught up");
    });

    it("does NOT show 'You\\'re all caught up' when stream still has more content (hasMore: true)", () => {
      mockDiscoveryStream.mockReturnValue({
        sections: [
          {
            id: "sec_tier_0",
            title: "Within 5 km",
            subtitle: "Closest venues",
            items: [diningVenue],
          },
        ],
        allVenues: [diningVenue],
        hasMore: true,
        isLoadingMore: false,
        isLoadingInitial: false,
        loadMore: vi.fn(),
        sentinelRef: vi.fn(),
        resetStream: vi.fn(),
      });

      const html = renderToString(
        <DiscoverDining
          onBack={vi.fn()}
          onSelectDiscoveryItem={vi.fn()}
        />
      );

      expect(html).toContain("Truffles Koramangala");
      expect(html).not.toContain("You&#x27;re all caught up");
    });

    it("does NOT show 'You\\'re all caught up' when next page is loading (isLoadingMore: true)", () => {
      mockDiscoveryStream.mockReturnValue({
        sections: [
          {
            id: "sec_tier_0",
            title: "Within 5 km",
            subtitle: "Closest venues",
            items: [diningVenue],
          },
        ],
        allVenues: [diningVenue],
        hasMore: false,
        isLoadingMore: true,
        isLoadingInitial: false,
        loadMore: vi.fn(),
        sentinelRef: vi.fn(),
        resetStream: vi.fn(),
      });

      const html = renderToString(
        <DiscoverDining
          onBack={vi.fn()}
          onSelectDiscoveryItem={vi.fn()}
        />
      );

      expect(html).toContain("Loading more dining places...");
      expect(html).not.toContain("You&#x27;re all caught up");
    });

    it("does NOT show 'You\\'re all caught up' when category is empty", () => {
      mockDiscoveryStream.mockReturnValue({
        sections: [],
        allVenues: [],
        hasMore: false,
        isLoadingMore: false,
        isLoadingInitial: false,
        loadMore: vi.fn(),
        sentinelRef: vi.fn(),
        resetStream: vi.fn(),
      });

      const html = renderToString(
        <DiscoverDining
          onBack={vi.fn()}
          onSelectDiscoveryItem={vi.fn()}
        />
      );

      expect(html).toContain("No dining places found near");
      expect(html).not.toContain("You&#x27;re all caught up");
    });
  });

  describe("5. Sports Screen End-of-Feed", () => {
    const sportsVenue: DiscoveryItem = {
      id: "place_sports_1",
      public_id: "place_sports_1",
      place_id: "place_sports_1",
      section_id: "sports",
      title: "Play Arena Turf",
      category: "SPORTS",
      subcategory: "Football turf",
      description: "FIFA standard turf",
      cover_image_url: "https://example.com/turf.jpg",
      location: "Sarjapur Road, Bangalore",
      place_address: "Sarjapur Road",
      suggested_duration_minutes: 60,
      suggested_cost_amount: null,
      suggested_capacity: 10,
      default_rsvp_offset_minutes: 30,
      display_order: 1,
      featured: true,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it("shows 'You\\'re all caught up' when sports feed has items and is exhausted", () => {
      mockDiscoveryStream.mockReturnValue({
        sections: [
          {
            id: "sec_tier_0",
            title: "Within 5 km",
            subtitle: "Closest venues",
            items: [sportsVenue],
          },
        ],
        allVenues: [sportsVenue],
        hasMore: false,
        isLoadingMore: false,
        isLoadingInitial: false,
        loadMore: vi.fn(),
        sentinelRef: vi.fn(),
        resetStream: vi.fn(),
      });

      const html = renderToString(
        <DiscoverSports
          onBack={vi.fn()}
          onSelectDiscoveryItem={vi.fn()}
        />
      );

      expect(html).toContain("Play Arena Turf");
      expect(html).toContain("You&#x27;re all caught up");
    });
  });

  describe("6. Activities Screen End-of-Feed", () => {
    const activityVenue: DiscoveryItem = {
      id: "place_activity_1",
      public_id: "place_activity_1",
      place_id: "place_activity_1",
      section_id: "activities",
      title: "Mystery Rooms Escape",
      category: "ACTIVITIES",
      subcategory: "Escape room",
      description: "Live puzzle game",
      cover_image_url: "https://example.com/escape.jpg",
      location: "Indiranagar, Bangalore",
      place_address: "100 Feet Rd, Indiranagar",
      suggested_duration_minutes: 60,
      suggested_cost_amount: null,
      suggested_capacity: 6,
      default_rsvp_offset_minutes: 30,
      display_order: 1,
      featured: true,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it("shows 'You\\'re all caught up' when activities feed has items and is exhausted", () => {
      mockDiscoveryStream.mockReturnValue({
        sections: [
          {
            id: "sec_tier_0",
            title: "Within 5 km",
            subtitle: "Closest venues",
            items: [activityVenue],
          },
        ],
        allVenues: [activityVenue],
        hasMore: false,
        isLoadingMore: false,
        isLoadingInitial: false,
        loadMore: vi.fn(),
        sentinelRef: vi.fn(),
        resetStream: vi.fn(),
      });

      const html = renderToString(
        <DiscoverActivities
          onBack={vi.fn()}
          onSelectDiscoveryItem={vi.fn()}
        />
      );

      expect(html).toContain("Mystery Rooms Escape");
      expect(html).toContain("You&#x27;re all caught up");
    });
  });
});
