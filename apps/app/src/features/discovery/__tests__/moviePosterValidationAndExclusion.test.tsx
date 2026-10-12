import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { PlacePreviewSheet } from "../components/PlacePreviewSheet";
import { MoviePortraitCard } from "../components/MoviePortraitCard";
import { DiscoveryCard } from "../components/DiscoveryCard";
import { DiscoveryItem } from "../../../core/types/discovery";
import { hasValidTmdbPoster } from "../services/tmdbMovieService";
import { markPhotoUrlBroken, resetBrokenPhotoRegistry } from "../services/venueRelevance";

// Mock ProfileContext
vi.mock("../../profile/state/ProfileContext", () => ({
  useProfileStore: () => ({ isAdmin: false }),
}));

describe("Movie Details CTA & Poster Validation Suite", () => {
  beforeEach(() => {
    resetBrokenPhotoRegistry();
    vi.restoreAllMocks();
  });

  const validMovie: DiscoveryItem = {
    id: "tmdb-500",
    public_id: "tmdb-500",
    section_id: "movies-trending",
    title: "Sardar 2",
    category: "MOVIES",
    subcategory: "Action | Thriller",
    description: "When the mysterious Black Dagger threatens national security...",
    cover_image_url: "https://image.tmdb.org/t/p/w500/sardar2_poster.jpg",
    location: "",
    suggested_duration_minutes: 150,
    suggested_cost_amount: null,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    release_date: "2026-09-10",
    language_name: "Tamil",
    original_language: "ta",
    movie_id: 500,
  };

  const movieWithoutPoster: DiscoveryItem = {
    ...validMovie,
    id: "tmdb-501",
    public_id: "tmdb-501",
    title: "Ghost Movie Without Image",
    cover_image_url: "",
  };

  const movieWithPlaceholderPoster: DiscoveryItem = {
    ...validMovie,
    id: "tmdb-502",
    public_id: "tmdb-502",
    title: "Movie With Placeholder",
    cover_image_url: "/assets/plan-covers/movie.png",
  };

  describe("Task 1: Movie Details Bottom Sheet CTA", () => {
    it("renders exactly 'Create a Plan' CTA (not 'Create Plan with this Movie')", () => {
      const html = renderToString(
        <PlacePreviewSheet
          item={validMovie}
          onClose={vi.fn()}
          onConfirmPlan={vi.fn()}
        />
      );

      // Verify exact new CTA text
      expect(html).toContain("Create a Plan");
      expect(html).not.toContain("Create Plan with this Movie");
      expect(html).not.toContain("Create a plan");
    });
  });

  describe("Task 2: hasValidTmdbPoster & Component Exclusion", () => {
    it("validates poster paths and cover URLs correctly", () => {
      expect(hasValidTmdbPoster(validMovie)).toBe(true);
      expect(hasValidTmdbPoster(movieWithoutPoster)).toBe(false);
      expect(hasValidTmdbPoster(movieWithPlaceholderPoster)).toBe(false);
      expect(hasValidTmdbPoster({ poster_path: null })).toBe(false);
      expect(hasValidTmdbPoster({ poster_path: "" })).toBe(false);
      expect(hasValidTmdbPoster({ poster_path: "/real_poster.jpg" })).toBe(true);
    });

    it("rejects movies whose poster is marked broken", () => {
      const brokenUrl = "https://image.tmdb.org/t/p/w500/broken_test.jpg";
      const brokenMovie: DiscoveryItem = { ...validMovie, cover_image_url: brokenUrl };

      expect(hasValidTmdbPoster(brokenMovie)).toBe(true);
      markPhotoUrlBroken(brokenUrl);
      expect(hasValidTmdbPoster(brokenMovie)).toBe(false);
    });

    it("MoviePortraitCard renders valid movie card", () => {
      const html = renderToString(
        <MoviePortraitCard item={validMovie} onTap={vi.fn()} />
      );

      expect(html).toContain("Sardar 2");
      expect(html).toContain("Tamil");
      expect(html).toContain("2026");
      expect(html).toContain("https://image.tmdb.org/t/p/w500/sardar2_poster.jpg");
    });

    it("MoviePortraitCard hides completely (renders null/empty) when poster is missing or empty", () => {
      const htmlEmpty = renderToString(
        <MoviePortraitCard item={movieWithoutPoster} onTap={vi.fn()} />
      );
      expect(htmlEmpty).toBe("");

      const htmlNull = renderToString(
        <MoviePortraitCard item={{ ...validMovie, cover_image_url: null as any }} onTap={vi.fn()} />
      );
      expect(htmlNull).toBe("");
    });

    it("MoviePortraitCard hides completely when poster is a placeholder", () => {
      const htmlPlaceholder = renderToString(
        <MoviePortraitCard item={movieWithPlaceholderPoster} onTap={vi.fn()} />
      );
      expect(htmlPlaceholder).toBe("");
    });

    it("DiscoveryCard hides movie card when poster is missing or placeholder", () => {
      const htmlMissing = renderToString(
        <DiscoveryCard item={movieWithoutPoster} onTap={vi.fn()} />
      );
      expect(htmlMissing).toBe("");

      const htmlPlaceholder = renderToString(
        <DiscoveryCard item={movieWithPlaceholderPoster} onTap={vi.fn()} />
      );
      expect(htmlPlaceholder).toBe("");
    });
  });
});
