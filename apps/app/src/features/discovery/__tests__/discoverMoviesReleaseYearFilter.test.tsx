import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { DiscoverMovies, MoviePortraitCard } from "../screens/DiscoverMovies";
import * as tmdbService from "../services/tmdbMovieService";
import { DiscoveryItem } from "../../../core/types/discovery";

// Mock ProfileContext
vi.mock("../../profile/state/ProfileContext", () => ({
  useProfileStore: () => ({ isAdmin: false }),
}));

describe("DiscoverMovies Screen & Release Year Filtering", () => {
  const movie2026: DiscoveryItem = {
    id: "tmdb-2026-1",
    public_id: "tmdb-2026-1",
    section_id: "movies",
    title: "Avatar: Fire and Ash",
    category: "MOVIES",
    subcategory: "Sci-Fi | Adventure",
    description: "The third installment of Avatar.",
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

  const movie2025: DiscoveryItem = {
    id: "tmdb-2025-1",
    public_id: "tmdb-2025-1",
    section_id: "movies",
    title: "Old 2025 Movie",
    category: "MOVIES",
    subcategory: "Action",
    description: "An older movie from 2025.",
    cover_image_url: "https://image.tmdb.org/t/p/w500/old2025.jpg",
    location: "",
    suggested_duration_minutes: 120,
    suggested_cost_amount: null,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 30,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    movie_id: 888801,
    release_date: "2025-11-20",
    original_language: "hi",
    language_name: "Hindi",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render any language filter chips (All, English, Hindi, Tamil, Telugu, Kannada)", () => {
    vi.spyOn(tmdbService, "getCachedMovieSection").mockReturnValue([movie2026]);

    const html = renderToString(
      <DiscoverMovies
        onBack={vi.fn()}
        onSelectDiscoveryItem={vi.fn()}
      />
    );

    // Language chips should NOT be in the rendered HTML
    expect(html).not.toContain(">All<");
    expect(html).not.toContain(">Kannada<");
    expect(html).not.toContain(">Telugu<");
    // Ensure "Latest Movies" is rendered directly below search
    expect(html).toContain("Latest Movies");
  });

  it("renders 2026 movies and excludes pre-2026 movies", () => {
    vi.spyOn(tmdbService, "getCachedMovieSection").mockReturnValue([movie2026, movie2025]);

    const html = renderToString(
      <DiscoverMovies
        onBack={vi.fn()}
        onSelectDiscoveryItem={vi.fn()}
      />
    );

    expect(html).toContain("Avatar: Fire and Ash");
    expect(html).not.toContain("Old 2025 Movie");
  });

  it("MoviePortraitCard retains language and release year in card footer", () => {
    const html = renderToString(
      <MoviePortraitCard
        item={movie2026}
        onTap={vi.fn()}
      />
    );

    expect(html).toContain("Avatar: Fire and Ash");
    expect(html).toContain("English");
    expect(html).toContain("2026");
  });

  it("isMovieReleased2026OrLater strictly validates release date boundaries", () => {
    expect(tmdbService.isMovieReleased2026OrLater("2026-01-01")).toBe(true);
    expect(tmdbService.isMovieReleased2026OrLater("2026-06-15")).toBe(true);
    expect(tmdbService.isMovieReleased2026OrLater("2027-01-01")).toBe(true);

    expect(tmdbService.isMovieReleased2026OrLater("2025-12-31")).toBe(false);
    expect(tmdbService.isMovieReleased2026OrLater("2024-01-01")).toBe(false);
    expect(tmdbService.isMovieReleased2026OrLater("")).toBe(false);
    expect(tmdbService.isMovieReleased2026OrLater(null)).toBe(false);
    expect(tmdbService.isMovieReleased2026OrLater(undefined)).toBe(false);
    expect(tmdbService.isMovieReleased2026OrLater("not-a-date")).toBe(false);
  });
});
