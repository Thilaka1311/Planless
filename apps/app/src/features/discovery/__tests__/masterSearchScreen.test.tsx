import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { MasterSearchScreen } from "../screens/MasterSearchScreen";
import { BrowseExperiencesStep } from "../screens/Discovery";
import * as discoveryService from "../services/discoveryService";
import * as tmdbMovieService from "../services/tmdbMovieService";

vi.mock("../services/discoveryService", () => ({
  searchDiscoveryPlaces: vi.fn(),
  getSectionsByCategory: vi.fn().mockResolvedValue([]),
  getCachedSections: vi.fn().mockReturnValue([]),
  clearCachedSections: vi.fn(),
}));

vi.mock("../services/tmdbMovieService", () => ({
  searchMovies: vi.fn(),
  fetchDiscoverMovies: vi.fn().mockResolvedValue({ items: [], totalPages: 0 }),
  getCachedMovieSection: vi.fn().mockReturnValue([]),
  TMDB_LANGUAGE_NAMES: {},
  isMovieWithinSixMonths: vi.fn().mockReturnValue(true),
}));

describe("MasterSearchScreen & Master Search Header Icon", () => {
  const mockOnBack = vi.fn();
  const mockOnSelectDiscoveryItem = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Master Search icon immediately to the left of Quick Plans in Discovery header", () => {
    const html = renderToString(
      <BrowseExperiencesStep
        userProfile={{ name: "Thilak" }}
        setActiveTab={vi.fn()}
        onSelectDiscoveryItem={mockOnSelectDiscoveryItem}
        onSelectCustomPlan={vi.fn()}
      />
    );

    // 1. Must render Master Search icon button with aria-label="Search"
    expect(html).toContain('aria-label="Search"');
    // 2. Must render Quick Plans icon button with aria-label="Quick Plans"
    expect(html).toContain('aria-label="Quick Plans"');
    // 3. Both are in the header container
    expect(html).toContain('flex items-center gap-2');
  });

  it("renders idle empty state initially when no query is typed in MasterSearchScreen", () => {
    const html = renderToString(
      <MasterSearchScreen
        onBack={mockOnBack}
        onSelectDiscoveryItem={mockOnSelectDiscoveryItem}
        currentCity="Bengaluru"
        currentCoordinates={{ latitude: 12.9716, longitude: 77.5946 }}
      />
    );

    expect(html).toContain("Search Planless");
    expect(html).toContain("Search restaurants, sports venues, activities, and movie titles across the city");
    expect(html).toContain('placeholder="Search restaurants, sports, activities, movies..."');
    expect(html).toContain('aria-label="Back"');
  });

  it("renders active master-search subscreen overlay when initialSubScreen is master-search", () => {
    const html = renderToString(
      <BrowseExperiencesStep
        userProfile={{ name: "Thilak" }}
        setActiveTab={vi.fn()}
        onSelectDiscoveryItem={mockOnSelectDiscoveryItem}
        onSelectCustomPlan={vi.fn()}
        initialSubScreen="master-search"
      />
    );

    expect(html).toContain("Search Planless");
    expect(html).toContain('placeholder="Search restaurants, sports, activities, movies..."');
  });

  it("calls searchDiscoveryPlaces and searchMovies when executing a master search", async () => {
    vi.mocked(discoveryService.searchDiscoveryPlaces).mockResolvedValue({
      items: [
        {
          id: "truffles-1",
          place_id: "truffles-1",
          title: "Truffles",
          category: "DINING",
          subcategory: "Restaurant",
        } as any,
      ],
      searchCoordinates: { latitude: 12.9716, longitude: 77.5946 },
      resolvedLocationName: "Bengaluru",
      nextPageToken: null,
    });

    vi.mocked(tmdbMovieService.searchMovies).mockResolvedValue({
      items: [],
      totalPages: 0,
    });

    // Verify searchDiscoveryPlaces can be called with DINING, SPORTS, ACTIVITIES and TMDB for MOVIES
    const diningPromise = discoveryService.searchDiscoveryPlaces({
      category: "DINING",
      query: "Truffles",
      currentCoordinates: { latitude: 12.9716, longitude: 77.5946 },
      defaultCity: "Bengaluru",
    });

    const sportsPromise = discoveryService.searchDiscoveryPlaces({
      category: "SPORTS",
      query: "football turf",
      currentCoordinates: { latitude: 12.9716, longitude: 77.5946 },
      defaultCity: "Bengaluru",
    });

    const moviePromise = tmdbMovieService.searchMovies("Spider-Man", 1, "all");

    const [diningRes, sportsRes, movieRes] = await Promise.all([diningPromise, sportsPromise, moviePromise]);

    expect(diningRes.items.length).toBe(1);
    expect(diningRes.items[0].title).toBe("Truffles");
    expect(discoveryService.searchDiscoveryPlaces).toHaveBeenCalledWith(
      expect.objectContaining({ category: "DINING", query: "Truffles" })
    );
    expect(discoveryService.searchDiscoveryPlaces).toHaveBeenCalledWith(
      expect.objectContaining({ category: "SPORTS", query: "football turf" })
    );
    expect(tmdbMovieService.searchMovies).toHaveBeenCalledWith("Spider-Man", 1, "all");
  });
});
