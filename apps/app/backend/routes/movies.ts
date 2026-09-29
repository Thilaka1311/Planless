import { Router, Request, Response } from "express";
import { env } from "../config/env";

const router = Router();

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const DEFAULT_REGION = "IN";

export const SUPPORTED_LANGUAGES = ["hi", "en", "ta", "kn", "te"] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export const TMDB_LANGUAGE_NAMES: Record<string, string> = {
  hi: "Hindi",
  en: "English",
  ta: "Tamil",
  kn: "Kannada",
  te: "Telugu",
};

/**
 * Checks if a movie release date is within the past 6 months from the current date.
 * Future releases are also valid. Older than 6 months is excluded.
 */
export function isMovieWithinSixMonths(releaseDateStr?: string | null, referenceDate = new Date()): boolean {
  if (!releaseDateStr) return false;
  const releaseDate = new Date(releaseDateStr);
  if (isNaN(releaseDate.getTime())) return false;

  const sixMonthsAgo = new Date(referenceDate);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  return releaseDate >= sixMonthsAgo;
}

// In-memory cache for server-side response deduplication (TTL: 15 minutes)
const serverCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;
// Longer TTL for per-movie release-date classification (1 hour — this data rarely changes)
const RELEASE_CACHE_TTL_MS = 60 * 60 * 1000;

function getCached(key: string): any | null {
  const item = serverCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    serverCache.delete(key);
    return null;
  }
  return item.data;
}

function setCached(key: string, data: any, ttl = CACHE_TTL_MS): void {
  serverCache.set(key, { data, expiry: Date.now() + ttl });
}



/**
 * Helper to fetch from TMDB API with Bearer token authentication or API key fallback.
 */
async function fetchFromTmdb(endpoint: string, searchParams: Record<string, string | number | undefined> = {}) {
  const token = env.TMDB_ACCESS_TOKEN || process.env.TMDB_ACCESS_TOKEN;
  const apiKey = env.TMDB_API_KEY || process.env.TMDB_API_KEY;

  if (!token && !apiKey) {
    throw new Error("TMDB credentials not configured on server.");
  }

  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);

  // Always enforce India regional discovery context
  if (!searchParams.region && !endpoint.includes("/genre/")) {
    url.searchParams.set("region", DEFAULT_REGION);
  }

  Object.entries(searchParams).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  });

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token.trim()}`;
  } else if (apiKey) {
    url.searchParams.set("api_key", apiKey.trim());
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`TMDB HTTP Error ${response.status}: ${errorText || response.statusText}`);
  }

  return response.json();
}

/**
 * Interleave movie results round-robin across languages so no single language dominates.
 */
function interleaveLanguageResults(resultsByLang: any[][]): any[] {
  const combined: any[] = [];
  const seenIds = new Set<number>();
  const maxLen = Math.max(...resultsByLang.map((list) => list.length), 0);

  for (let i = 0; i < maxLen; i++) {
    for (const list of resultsByLang) {
      const item = list[i];
      if (item && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        combined.push(item);
      }
    }
  }

  return combined;
}

/**
 * GET /api/movies/discover
 * Retrieves popular, now_playing, upcoming, or top_rated movies for India.
 * Strictly enforces the 5 supported languages: Hindi, English, Tamil, Kannada, Telugu.
 */
router.get("/discover", async (req: Request, res: Response) => {
  try {
    const type = (req.query.type as string) || "popular";
    const page = parseInt(req.query.page as string, 10) || 1;
    const genre = req.query.genre as string | undefined;
    const rawLang = ((req.query.lang as string) || "all").toLowerCase();
    const lang = (SUPPORTED_LANGUAGES as readonly string[]).includes(rawLang)
      ? rawLang
      : "all";

    const cacheKey = `discover_${type}_l${lang}_g${genre || "all"}_p${page}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    let finalResults: any[] = [];
    let totalPages = 1;

    if (type === "now_playing") {
      // ── Step 1: Fetch latest now_playing and popular releases for India ────────
      const [res1, res2, res3, popRes] = await Promise.all([
        fetchFromTmdb("/movie/now_playing", { page: 1, region: DEFAULT_REGION }).catch(() => ({ results: [] })),
        fetchFromTmdb("/movie/now_playing", { page: 2, region: DEFAULT_REGION }).catch(() => ({ results: [] })),
        fetchFromTmdb("/movie/now_playing", { page: 3, region: DEFAULT_REGION }).catch(() => ({ results: [] })),
        fetchFromTmdb("/movie/popular", { page: 1, region: DEFAULT_REGION }).catch(() => ({ results: [] })),
      ]);

      const npRaw = [
        ...(res1.results || []),
        ...(res2.results || []),
        ...(res3.results || []),
        ...(popRes.results || []),
      ];

      // ── Step 2: Language + recency filter (dedup, supported langs, 6-month window) ──
      const seen = new Set<number>();
      let candidates: any[] = [];

      if (lang !== "all") {
        for (const m of npRaw) {
          if (!m || !m.title || m.adult || m.video || seen.has(m.id)) continue;
          if (!isMovieWithinSixMonths(m.release_date)) continue;
          if (m.original_language === lang) {
            seen.add(m.id);
            candidates.push(m);
          }
        }
      } else {
        const byLang: Record<string, any[]> = { hi: [], ta: [], te: [], kn: [], en: [] };
        for (const m of npRaw) {
          if (!m || !m.title || m.adult || m.video || seen.has(m.id)) continue;
          if (!isMovieWithinSixMonths(m.release_date)) continue;
          if (byLang[m.original_language]) {
            seen.add(m.id);
            byLang[m.original_language].push(m);
          }
        }
        candidates = interleaveLanguageResults([byLang.hi, byLang.ta, byLang.te, byLang.kn, byLang.en]);
      }

      finalResults = candidates;
    } else if (type === "top_rated") {
      if (lang !== "all") {
        const data = await fetchFromTmdb("/discover/movie", {
          page,
          region: DEFAULT_REGION,
          with_original_language: lang,
          sort_by: "vote_average.desc",
          "vote_count.gte": 50,
          include_adult: "false",
          include_video: "false",
          with_genres: genre,
        });
        finalResults = (data.results || []).filter(
          (m: any) => m && m.title && !m.adult && !m.video
        );
        totalPages = data.total_pages || 1;
      } else {
        // Fetch top rated for each supported language in parallel and interleave
        const languagePromises = SUPPORTED_LANGUAGES.map((l) =>
          fetchFromTmdb("/discover/movie", {
            page: 1,
            region: DEFAULT_REGION,
            with_original_language: l,
            sort_by: "vote_average.desc",
            "vote_count.gte": 50,
            include_adult: "false",
            include_video: "false",
            with_genres: genre,
          })
            .then((d) => (d.results || []).filter((m: any) => m && m.title && !m.adult && !m.video))
            .catch(() => [])
        );

        const resultsByLang = await Promise.all(languagePromises);
        finalResults = interleaveLanguageResults(resultsByLang);
      }
    } else {
      // Default to "popular"
      if (lang !== "all") {
        const data = await fetchFromTmdb("/discover/movie", {
          page,
          region: DEFAULT_REGION,
          with_original_language: lang,
          sort_by: "popularity.desc",
          include_adult: "false",
          include_video: "false",
          with_genres: genre,
        });
        finalResults = (data.results || []).filter(
          (m: any) => m && m.title && !m.adult && !m.video
        );
        totalPages = data.total_pages || 1;
      } else {
        // Fetch popular for each supported language in parallel and interleave
        const languagePromises = SUPPORTED_LANGUAGES.map((l) =>
          fetchFromTmdb("/discover/movie", {
            page: 1,
            region: DEFAULT_REGION,
            with_original_language: l,
            sort_by: "popularity.desc",
            include_adult: "false",
            include_video: "false",
            with_genres: genre,
          })
            .then((d) => (d.results || []).filter((m: any) => m && m.title && !m.adult && !m.video))
            .catch(() => [])
        );

        const resultsByLang = await Promise.all(languagePromises);
        finalResults = interleaveLanguageResults(resultsByLang);
      }
    }

    const payload = {
      page,
      results: finalResults,
      total_pages: totalPages,
      total_results: finalResults.length,
    };

    setCached(cacheKey, payload);
    return res.json(payload);
  } catch (error: any) {
    console.error("[MoviesRouter] Discover Error:", error);
    return res.status(500).json({ error: error.message || "Failed to discover movies." });
  }
});

/**
 * GET /api/movies/search
 * Searches TMDB movies in India region context.
 * Strictly filters results to the 5 supported languages: Hindi, English, Tamil, Kannada, Telugu.
 */
router.get("/search", async (req: Request, res: Response) => {
  try {
    const query = (req.query.query as string || "").trim();
    const page = parseInt(req.query.page as string, 10) || 1;
    const rawLang = ((req.query.lang as string) || "all").toLowerCase();
    const lang = (SUPPORTED_LANGUAGES as readonly string[]).includes(rawLang)
      ? rawLang
      : "all";

    if (!query) {
      return res.json({ page: 1, results: [], total_pages: 0, total_results: 0 });
    }

    const cacheKey = `search_${query.toLowerCase()}_l${lang}_p${page}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const rawData = await fetchFromTmdb("/search/movie", {
      query,
      page,
      region: DEFAULT_REGION,
      include_adult: "false",
    });

    let results = (rawData.results || []).filter(
      (m: any) => m && m.title && !m.adult && !m.video
    );

    // Strictly enforce supported languages
    if (lang !== "all") {
      results = results.filter((m: any) => m.original_language === lang);
    } else {
      results = results.filter((m: any) =>
        (SUPPORTED_LANGUAGES as readonly string[]).includes(m.original_language)
      );
    }

    const payload = {
      page,
      results,
      total_pages: rawData.total_pages || 1,
      total_results: results.length,
    };

    setCached(cacheKey, payload);
    return res.json(payload);
  } catch (error: any) {
    console.error("[MoviesRouter] Search Error:", error);
    return res.status(500).json({ error: error.message || "Failed to search movies." });
  }
});

/**
 * GET /api/movies/genres
 * Returns movie genres list.
 */
router.get("/genres", async (_req: Request, res: Response) => {
  try {
    const cached = getCached("genres");
    if (cached) {
      return res.json(cached);
    }

    const data = await fetchFromTmdb("/genre/movie/list");
    setCached("genres", data);
    return res.json(data);
  } catch (error: any) {
    console.error("[MoviesRouter] Genres Error:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch genres." });
  }
});

/**
 * GET /api/movies/:id
 * Fetches full detail for a single movie by TMDB ID.
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const movieId = req.params.id;
    const cacheKey = `movie_${movieId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const data = await fetchFromTmdb(`/movie/${movieId}`, {
      append_to_response: "release_dates",
    });

    setCached(cacheKey, data);
    return res.json(data);
  } catch (error: any) {
    console.error(`[MoviesRouter] Movie ${req.params.id} Error:`, error);
    return res.status(500).json({ error: error.message || "Failed to fetch movie details." });
  }
});

export default router;
