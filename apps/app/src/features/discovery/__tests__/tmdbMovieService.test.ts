import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getTmdbPosterUrl,
  getTmdbBackdropUrl,
  mapTmdbMovieToDiscoveryItem,
  fetchDiscoverMovies,
  searchMovies,
  fetchMovieDetails,
  getLanguageLabel,
  TMDB_SUPPORTED_LANGUAGES,
  TMDB_LANGUAGE_NAMES,
  isMovieWithinSixMonths,
  isMovieReleased2026OrLater,
  MIN_MOVIE_RELEASE_DATE,
  hasValidTmdbPoster,
} from "../services/tmdbMovieService";
import { TmdbMovie } from "../../../core/types/discovery";
import { supabase } from "../../../../lib/supabaseClient";
import { markPhotoUrlBroken, resetBrokenPhotoRegistry } from "../services/venueRelevance";

describe("tmdbMovieService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("isMovieReleased2026OrLater & isMovieWithinSixMonths", () => {
    it("returns true for a movie released in 2026 or later", () => {
      expect(isMovieReleased2026OrLater("2026-01-01")).toBe(true);
      expect(isMovieReleased2026OrLater("2026-07-15")).toBe(true);
      expect(isMovieReleased2026OrLater("2026-12-31")).toBe(true);
      expect(isMovieReleased2026OrLater("2027-04-10")).toBe(true);
      expect(isMovieWithinSixMonths("2026-07-15")).toBe(true);
    });

    it("returns false for a movie released prior to 2026", () => {
      expect(isMovieReleased2026OrLater("2025-12-31")).toBe(false);
      expect(isMovieReleased2026OrLater("2024-05-10")).toBe(false);
      expect(isMovieReleased2026OrLater("2022-05-10")).toBe(false);
      expect(isMovieWithinSixMonths("2025-12-31")).toBe(false);
    });

    it("returns false if release_date is missing, empty, or invalid", () => {
      expect(isMovieReleased2026OrLater("")).toBe(false);
      expect(isMovieReleased2026OrLater(null)).toBe(false);
      expect(isMovieReleased2026OrLater(undefined)).toBe(false);
      expect(isMovieReleased2026OrLater("invalid-date")).toBe(false);
      expect(isMovieWithinSixMonths("")).toBe(false);
    });
  });

  describe("getLanguageLabel and TMDB_SUPPORTED_LANGUAGES", () => {
    it("supports the five required Indian regional languages", () => {
      expect(TMDB_SUPPORTED_LANGUAGES).toEqual(["hi", "en", "ta", "kn", "te"]);
    });

    it("returns friendly language names for supported codes", () => {
      expect(getLanguageLabel("hi")).toBe("Hindi");
      expect(getLanguageLabel("en")).toBe("English");
      expect(getLanguageLabel("ta")).toBe("Tamil");
      expect(getLanguageLabel("kn")).toBe("Kannada");
      expect(getLanguageLabel("te")).toBe("Telugu");
      expect(getLanguageLabel("HI")).toBe("Hindi");
      expect(getLanguageLabel(null)).toBe("");
    });
  });

  describe("getTmdbPosterUrl", () => {
    it("returns default movie cover if poster path is missing", () => {
      expect(getTmdbPosterUrl(null)).toBe("/assets/plan-covers/movie.png");
      expect(getTmdbPosterUrl("")).toBe("/assets/plan-covers/movie.png");
      expect(getTmdbPosterUrl(undefined)).toBe("/assets/plan-covers/movie.png");
    });

    it("constructs full TMDB CDN URL for relative poster path", () => {
      const url = getTmdbPosterUrl("/sample_poster.jpg", "w500");
      expect(url).toBe("https://image.tmdb.org/t/p/w500/sample_poster.jpg");
    });

    it("preserves full external URL if provided", () => {
      const external = "https://custom-cdn.com/poster.jpg";
      expect(getTmdbPosterUrl(external)).toBe(external);
    });
  });

  describe("getTmdbBackdropUrl", () => {
    it("constructs full TMDB CDN URL with w780 default size", () => {
      const url = getTmdbBackdropUrl("/sample_backdrop.jpg");
      expect(url).toBe("https://image.tmdb.org/t/p/w780/sample_backdrop.jpg");
    });
  });

  describe("mapTmdbMovieToDiscoveryItem", () => {
    const mockMovie: TmdbMovie = {
      id: 1022789,
      title: "Kantara - Chapter 1",
      original_title: "Kantara - Chapter 1",
      overview: "A legendary folklore tale from Karnataka.",
      poster_path: "/kantara.jpg",
      backdrop_path: "/kantara_bg.jpg",
      release_date: "2025-10-02",
      vote_average: 8.5,
      vote_count: 3200,
      popularity: 382.4,
      original_language: "kn",
      genre_ids: [28, 14, 18], // Action, Fantasy, Drama
      adult: false,
      video: false,
    };

    it("maps TMDB movie fields into a compliant Planless DiscoveryItem with language", () => {
      const item = mapTmdbMovieToDiscoveryItem(mockMovie, "movies-now_playing");

      expect(item.id).toBe("tmdb-1022789");
      expect(item.title).toBe("Kantara - Chapter 1");
      expect(item.category).toBe("MOVIES");
      expect(item.subcategory).toBe("Action | Fantasy");
      expect(item.description).toBe("A legendary folklore tale from Karnataka.");
      expect(item.cover_image_url).toBe("https://image.tmdb.org/t/p/w500/kantara.jpg");
      expect(item.backdrop_url).toBe("https://image.tmdb.org/t/p/w780/kantara_bg.jpg");
      expect(item.rating).toBe(8.5);
      expect(item.user_ratings_total).toBe(3200);
      expect(item.release_date).toBe("2025-10-02");
      // Movies must never set location to the release year — it must always be empty
      expect(item.location).toBe("");
      expect(item.original_language).toBe("kn");
      expect(item.language_name).toBe("Kannada");
      expect(item.genres).toEqual(["Action", "Fantasy", "Drama"]);
      expect(item.suggested_cost_amount).toBeNull();
    });

    it("handles movies without release date or genres gracefully", () => {
      const bareMovie: TmdbMovie = {
        id: 99999,
        title: "Untitled Project",
        original_title: "Untitled Project",
        overview: "",
        poster_path: null,
        backdrop_path: null,
        release_date: "",
        vote_average: 0,
        vote_count: 0,
        popularity: 0,
        original_language: "hi",
        genre_ids: [],
        adult: false,
        video: false,
      };

      const item = mapTmdbMovieToDiscoveryItem(bareMovie);
      expect(item.id).toBe("tmdb-99999");
      expect(item.title).toBe("Untitled Project");
      // Movies always produce an empty location, even when release_date is present
      expect(item.location).toBe("");
      expect(item.subcategory).toBe("Feature Film");
      expect(item.language_name).toBe("Hindi");
      expect(item.genres).toEqual([]);
    });
  });

  describe("fetchDiscoverMovies caching and mapping", () => {
    it("fetches and caches discover movies respecting supported languages", async () => {
      const mockApiResponse = {
        page: 1,
        total_pages: 5,
        results: [
          {
            id: 12345,
            title: "Tamil Action Thriller",
            overview: "An exciting Tamil action film",
            poster_path: "/test.jpg",
            release_date: "2026-09-01",
            vote_average: 8.1,
            vote_count: 500,
            original_language: "ta",
            genre_ids: [28],
            adult: false,
            video: false,
          },
          {
            id: 99991,
            title: "French Drama",
            overview: "Unsupported language film",
            poster_path: "/french.jpg",
            release_date: "2026-09-01",
            original_language: "fr",
            adult: false,
            video: false,
          },
        ],
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockApiResponse,
      });
      globalThis.fetch = fetchMock;

      const res1 = await fetchDiscoverMovies("now_playing", 88);
      // French movie (fr) must be filtered out; Tamil movie (ta) must remain
      expect(res1.items.length).toBe(1);
      expect(res1.items[0].title).toBe("Tamil Action Thriller");
      expect(res1.items[0].original_language).toBe("ta");
      expect(res1.items[0].language_name).toBe("Tamil");

      // Second call for the same cache key should return cached result without calling fetch again
      const res2 = await fetchDiscoverMovies("now_playing", 88);
      expect(res2.items.length).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("searchMovies", () => {
    it("returns empty result if query is empty or whitespace", async () => {
      const res = await searchMovies("   ");
      expect(res.items).toEqual([]);
      expect(res.totalPages).toBe(0);
    });

    it("searches and filters out non-supported languages and adult/video titles", async () => {
      const mockSearchResults = {
        page: 1,
        total_pages: 1,
        results: [
          {
            id: 111,
            title: "Kantara",
            poster_path: "/safe.jpg",
            release_date: "2026-03-01",
            original_language: "kn",
            adult: false,
            video: false,
          },
          {
            id: 222,
            title: "Adult Feature",
            poster_path: "/adult.jpg",
            release_date: "2026-03-01",
            original_language: "hi",
            adult: true,
            video: false,
          },
          {
            id: 333,
            title: "German Movie",
            poster_path: "/german.jpg",
            release_date: "2026-03-01",
            original_language: "de",
            adult: false,
            video: false,
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockSearchResults,
      });

      const res = await searchMovies("Kantara", 1);
      // Only the Kannada movie (kn) is kept; adult and German movies are filtered out
      expect(res.items.length).toBe(1);
      expect(res.items[0].title).toBe("Kantara");
      expect(res.items[0].original_language).toBe("kn");
      expect(res.items[0].language_name).toBe("Kannada");
    });

    it("filters out movies released before 2026 when searching", async () => {
      const mockSearchResults = {
        page: 1,
        total_pages: 1,
        results: [
          {
            id: 999,
            title: "Classic Blockbuster",
            release_date: "2018-05-15",
            original_language: "hi",
            adult: false,
            video: false,
          },
          {
            id: 1000,
            title: "2026 Blockbuster",
            release_date: "2026-02-15",
            original_language: "hi",
            poster_path: "/blockbuster.jpg",
            adult: false,
            video: false,
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockSearchResults,
      });

      const res = await searchMovies("Blockbuster", 1);
      expect(res.items.length).toBe(1);
      expect(res.items[0].title).toBe("2026 Blockbuster");
      expect(res.items[0].release_date).toBe("2026-02-15");
    });
  });

  describe("fetchMovieDetails", () => {
    it("fetches full movie details via Supabase Edge Function", async () => {
      const mockDetails = {
        id: 858485,
        title: "Kantara",
        overview: "A legendary folklore tale.",
        release_date: "2022-09-30",
        original_language: "kn",
      };

      const invokeSpy = vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockResolvedValueOnce({
        data: mockDetails,
        error: null,
      } as any);

      const res = await fetchMovieDetails(858485);
      expect(invokeSpy).toHaveBeenCalledWith("maps", {
        body: {
          action: "movie-details",
          movieId: 858485,
        },
      });
      expect(res).toEqual(mockDetails);
    });

    it("falls back to local proxy when Supabase Edge Function fails", async () => {
      const mockDetails = {
        id: 777,
        title: "Fallback Title",
      };

      vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockRejectedValueOnce(new Error("Network error"));
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockDetails,
      });

      const res = await fetchMovieDetails(777);
      expect(res).toEqual(mockDetails);
    });
  });

  describe("Production Edge Function Routing", () => {
    it("routes discover calls to maps Edge Function with action movies-discover", async () => {
      const mockDiscoverData = {
        page: 1,
        total_pages: 1,
        results: [
          {
            id: 555,
            title: "Super Cinema",
            original_language: "hi",
            release_date: "2026-08-01",
            poster_path: "/super.jpg",
            adult: false,
            video: false,
          },
        ],
      };

      const invokeSpy = vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockResolvedValueOnce({
        data: mockDiscoverData,
        error: null,
      } as any);

      const res = await fetchDiscoverMovies("popular", 999);
      expect(invokeSpy).toHaveBeenCalledWith("maps", {
        body: {
          action: "movies-discover",
          type: "popular",
          page: 999,
          genre: undefined,
          lang: "all",
        },
      });
      expect(res.items.length).toBe(1);
      expect(res.items[0].title).toBe("Super Cinema");
    });
  });

  describe("hasValidTmdbPoster & photo exclusion rule", () => {
    beforeEach(() => {
      resetBrokenPhotoRegistry();
    });

    it("accepts movies with a valid TMDB poster path or cover image URL", () => {
      expect(hasValidTmdbPoster({ poster_path: "/avatar.jpg" })).toBe(true);
      expect(hasValidTmdbPoster({ poster_path: "https://image.tmdb.org/t/p/w500/avatar.jpg" })).toBe(true);
      expect(hasValidTmdbPoster({ cover_image_url: "https://image.tmdb.org/t/p/w500/avatar.jpg" })).toBe(true);
    });

    it("rejects movies with missing, null, undefined, or empty poster_path", () => {
      expect(hasValidTmdbPoster({ poster_path: null })).toBe(false);
      expect(hasValidTmdbPoster({ poster_path: undefined })).toBe(false);
      expect(hasValidTmdbPoster({ poster_path: "" })).toBe(false);
      expect(hasValidTmdbPoster({ poster_path: "   " })).toBe(false);
      expect(hasValidTmdbPoster({ poster_path: "null" })).toBe(false);
      expect(hasValidTmdbPoster({ poster_path: "undefined" })).toBe(false);
      expect(hasValidTmdbPoster({})).toBe(false);
      expect(hasValidTmdbPoster(null)).toBe(false);
    });

    it("rejects movies whose cover image is a generic placeholder or fallback", () => {
      expect(hasValidTmdbPoster({ cover_image_url: "/assets/plan-covers/movie.png" })).toBe(false);
      expect(hasValidTmdbPoster({ cover_image_url: "https://example.com/placeholder.jpg" })).toBe(false);
      expect(hasValidTmdbPoster({ cover_image_url: "https://example.com/default-cover.jpg" })).toBe(false);
    });

    it("rejects movies whose poster image has been marked broken at runtime", () => {
      const brokenUrl = "https://image.tmdb.org/t/p/w500/broken_poster.jpg";
      expect(hasValidTmdbPoster({ cover_image_url: brokenUrl })).toBe(true);

      // Register broken URL
      markPhotoUrlBroken(brokenUrl);

      // Now it must be rejected
      expect(hasValidTmdbPoster({ cover_image_url: brokenUrl })).toBe(false);
      expect(hasValidTmdbPoster({ poster_path: "/broken_poster.jpg" })).toBe(false);
    });

    it("excludes movies without posters from fetchDiscoverMovies results", async () => {
      const mockApiResponse = {
        page: 1,
        total_pages: 1,
        results: [
          {
            id: 111,
            title: "Movie With Poster",
            poster_path: "/poster.jpg",
            release_date: "2026-05-01",
            original_language: "hi",
            adult: false,
            video: false,
          },
          {
            id: 222,
            title: "Movie Without Poster",
            poster_path: null,
            release_date: "2026-05-01",
            original_language: "hi",
            adult: false,
            video: false,
          },
          {
            id: 333,
            title: "Movie With Empty Poster",
            poster_path: "",
            release_date: "2026-05-01",
            original_language: "hi",
            adult: false,
            video: false,
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockApiResponse,
      });

      const res = await fetchDiscoverMovies("now_playing", 777);
      expect(res.items.length).toBe(1);
      expect(res.items[0].title).toBe("Movie With Poster");
    });
  });
});
