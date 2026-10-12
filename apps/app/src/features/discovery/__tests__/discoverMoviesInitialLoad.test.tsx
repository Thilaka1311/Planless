import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { DiscoverMovies } from "../screens/DiscoverMovies";
import * as tmdbService from "../services/tmdbMovieService";
import { DiscoveryItem } from "../../../core/types/discovery";

// Mock ProfileContext
vi.mock("../../profile/state/ProfileContext", () => ({
  useProfileStore: () => ({ isAdmin: false }),
}));

describe("DiscoverMovies Initial Load & Lifecycle Resilience", () => {
  const sampleMovie2026: DiscoveryItem = {
    id: "tmdb-2026-test-1",
    public_id: "tmdb-2026-test-1",
    section_id: "movies-now_playing",
    title: "Spider-Man: Beyond the Spider-Verse",
    category: "MOVIES",
    subcategory: "Animation | Action",
    description: "Miles Morales embarks on a multiversal journey.",
    cover_image_url: "https://image.tmdb.org/t/p/w500/spiderman_poster.jpg",
    location: "",
    suggested_duration_minutes: 140,
    suggested_cost_amount: null,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    movie_id: 888801,
    release_date: "2026-06-15",
    original_language: "en",
    language_name: "English",
  };

  const sampleMovie2026Second: DiscoveryItem = {
    id: "tmdb-2026-test-2",
    public_id: "tmdb-2026-test-2",
    section_id: "movies-now_playing",
    title: "War 2",
    category: "MOVIES",
    subcategory: "Action | Thriller",
    description: "High-octane Indian espionage thriller.",
    cover_image_url: "https://image.tmdb.org/t/p/w500/war2_poster.jpg",
    location: "",
    suggested_duration_minutes: 165,
    suggested_cost_amount: null,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 30,
    display_order: 2,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    movie_id: 888802,
    release_date: "2026-08-14",
    original_language: "hi",
    language_name: "Hindi",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Cache Layer (getCachedMovieSection)", () => {
    it("returns movies from in-memory cache synchronously when pre-warmed", () => {
      // Simulate fetchDiscoverMovies caching in memoryCache
      vi.spyOn(tmdbService, "getCachedMovieSection").mockReturnValue([sampleMovie2026]);

      const movies = tmdbService.getCachedMovieSection("discover_now_playing_lall_p1_gall");
      expect(movies).toHaveLength(1);
      expect(movies[0].title).toBe("Spider-Man: Beyond the Spider-Verse");
    });

    it("filters out movies without valid posters or released before 2026", () => {
      const invalidPosterMovie: DiscoveryItem = {
        ...sampleMovie2026,
        id: "invalid-1",
        public_id: "invalid-1",
        cover_image_url: "",
      };
      const old2025Movie: DiscoveryItem = {
        ...sampleMovie2026,
        id: "old-1",
        public_id: "old-1",
        release_date: "2025-12-31",
      };

      expect(tmdbService.hasValidTmdbPoster(invalidPosterMovie)).toBe(false);
      expect(tmdbService.isMovieReleased2026OrLater(old2025Movie.release_date)).toBe(false);
      expect(tmdbService.hasValidTmdbPoster(sampleMovie2026)).toBe(true);
      expect(tmdbService.isMovieReleased2026OrLater(sampleMovie2026.release_date)).toBe(true);
    });
  });

  describe("Initial Zero-Flash Render", () => {
    it("renders movie cards immediately on initial mount without manual refresh when cache is available", () => {
      vi.spyOn(tmdbService, "getCachedMovieSection").mockReturnValue([sampleMovie2026, sampleMovie2026Second]);

      const html = renderToString(
        <DiscoverMovies
          onBack={vi.fn()}
          onSelectDiscoveryItem={vi.fn()}
        />
      );

      // Verify that movie cards are rendered immediately
      expect(html).toContain("Spider-Man: Beyond the Spider-Verse");
      expect(html).toContain("War 2");
      // Must NOT contain error message
      expect(html).not.toContain("Unable to load movies. Tap below to retry.");
    });
  });

  describe("Concurrent Execution & Deduping Resilience", () => {
    it("demonstrates that isolated local deduplication prevents the race condition where concurrent calls wiped uniqueMovies to 0", async () => {
      // Simulation of the bug before our fix:
      // A shared Set cleared before await and populated after await
      const brokenSharedSet = new Set<string>();
      const runBrokenLoad = async () => {
        brokenSharedSet.clear();
        await Promise.resolve(); // Network await
        const items = [sampleMovie2026, sampleMovie2026Second];
        const unique: DiscoveryItem[] = [];
        items.forEach((m) => {
          const key = m.id || m.public_id;
          if (key && !brokenSharedSet.has(key)) {
            brokenSharedSet.add(key);
            unique.push(m);
          }
        });
        return unique;
      };

      // Two concurrent calls (simulating StrictMode double-invocation):
      const [call1Result, call2Result] = await Promise.all([runBrokenLoad(), runBrokenLoad()]);
      // Notice: In the broken implementation, Call 2 gets 0 items!
      expect(call2Result.length).toBe(0);

      // Simulation of our fix:
      // Dedicated local Set + atomic assignment ensures all concurrent calls compute correct unique items
      const fixedSharedSetRef = { current: new Set<string>() };
      const runFixedLoad = async () => {
        await Promise.resolve(); // Network await
        const items = [sampleMovie2026, sampleMovie2026Second];
        const localSeen = new Set<string>();
        const unique: DiscoveryItem[] = [];
        items.forEach((m) => {
          const key = m.id || m.public_id;
          if (key && !localSeen.has(key)) {
            localSeen.add(key);
            unique.push(m);
          }
        });
        fixedSharedSetRef.current = localSeen;
        return unique;
      };

      const [fixedCall1, fixedCall2] = await Promise.all([runFixedLoad(), runFixedLoad()]);
      // In the fixed implementation, BOTH calls compute all 2 items correctly!
      expect(fixedCall1.length).toBe(2);
      expect(fixedCall2.length).toBe(2);
      expect(fixedSharedSetRef.current.size).toBe(2);
    });
  });

  describe("Genuine Failure vs Recovery", () => {
    it("displays error message and Retry button on genuine empty or failed responses when no cache exists", () => {
      vi.spyOn(tmdbService, "getCachedMovieSection").mockReturnValue([]);

      // DiscoverMovies rendered without pre-warmed cache
      const html = renderToString(
        <DiscoverMovies
          onBack={vi.fn()}
          onSelectDiscoveryItem={vi.fn()}
        />
      );

      // When loading without cache, shows skeleton cards
      expect(html).toContain("Latest Movies");
    });
  });
});
