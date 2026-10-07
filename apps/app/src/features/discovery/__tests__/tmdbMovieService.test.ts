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
} from "../services/tmdbMovieService";
import { TmdbMovie } from "../../../core/types/discovery";
import { supabase } from "../../../../lib/supabaseClient";

describe("tmdbMovieService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("isMovieWithinSixMonths", () => {
    const fixedNow = new Date("2026-09-29T10:00:00Z");

    it("returns true for a movie released 2 months ago", () => {
      expect(isMovieWithinSixMonths("2026-07-15", fixedNow)).toBe(true);
    });

    it("returns true for a movie released today or in the future", () => {
      expect(isMovieWithinSixMonths("2026-09-29", fixedNow)).toBe(true);
      expect(isMovieWithinSixMonths("2026-11-01", fixedNow)).toBe(true);
    });

    it("returns true for a movie released exactly 5 months ago", () => {
      expect(isMovieWithinSixMonths("2026-04-29", fixedNow)).toBe(true);
    });

    it("returns false for a movie released 7 months ago", () => {
      expect(isMovieWithinSixMonths("2026-02-01", fixedNow)).toBe(false);
    });

    it("returns false for a movie released years ago", () => {
      expect(isMovieWithinSixMonths("2022-05-10", fixedNow)).toBe(false);
    });

    it("returns false if release_date is missing or invalid", () => {
      expect(isMovieWithinSixMonths("", fixedNow)).toBe(false);
      expect(isMovieWithinSixMonths(null, fixedNow)).toBe(false);
      expect(isMovieWithinSixMonths("invalid-date", fixedNow)).toBe(false);
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
            release_date: "2024-09-01",
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
            original_language: "kn",
            adult: false,
            video: false,
          },
          {
            id: 222,
            title: "Adult Feature",
            poster_path: "/adult.jpg",
            original_language: "hi",
            adult: true,
            video: false,
          },
          {
            id: 333,
            title: "German Movie",
            poster_path: "/german.jpg",
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

    it("returns movies older than 6 months when searching", async () => {
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
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockSearchResults,
      });

      const res = await searchMovies("Classic", 1);
      expect(res.items.length).toBe(1);
      expect(res.items[0].title).toBe("Classic Blockbuster");
      expect(res.items[0].release_date).toBe("2018-05-15");
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
});
