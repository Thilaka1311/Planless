declare const Deno: any;

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
  const token = Deno.env.get("TMDB_ACCESS_TOKEN");
  const apiKey = Deno.env.get("TMDB_API_KEY");

  if (!token && !apiKey) {
    throw new Error("TMDB credentials not configured on server (TMDB_ACCESS_TOKEN or TMDB_API_KEY).");
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
 * Handles movie discovery (popular, now_playing, upcoming, top_rated)
 */
async function handleMoviesDiscover(body: any): Promise<any> {
  const type = body.type || "popular";
  const page = parseInt(String(body.page), 10) || 1;
  const genre = body.genre ? String(body.genre) : undefined;
  const rawLang = (body.lang || "all").toLowerCase();
  const lang = (SUPPORTED_LANGUAGES as readonly string[]).includes(rawLang) ? rawLang : "all";

  const cacheKey = `discover_${type}_l${lang}_g${genre || "all"}_p${page}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }

  let finalResults: any[] = [];
  let totalPages = 1;

  if (type === "now_playing") {
    const pageBase = (page - 1) * 3;
    const [res1, res2, res3, popRes] = await Promise.all([
      fetchFromTmdb("/movie/now_playing", { page: pageBase + 1, region: DEFAULT_REGION }).catch(() => ({ results: [] })),
      fetchFromTmdb("/movie/now_playing", { page: pageBase + 2, region: DEFAULT_REGION }).catch(() => ({ results: [] })),
      fetchFromTmdb("/movie/now_playing", { page: pageBase + 3, region: DEFAULT_REGION }).catch(() => ({ results: [] })),
      fetchFromTmdb("/movie/popular", { page, region: DEFAULT_REGION }).catch(() => ({ results: [] })),
    ]);

    const npRaw = [
      ...(res1.results || []),
      ...(res2.results || []),
      ...(res3.results || []),
      ...(popRes.results || []),
    ];

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
    totalPages = popRes.total_pages || 10;
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
  return payload;
}

/**
 * Handles movie search
 */
async function handleMoviesSearch(body: any): Promise<any> {
  const query = (body.query || "").trim();
  const page = parseInt(String(body.page), 10) || 1;
  const rawLang = (body.lang || "all").toLowerCase();
  const lang = (SUPPORTED_LANGUAGES as readonly string[]).includes(rawLang) ? rawLang : "all";

  if (!query) {
    return { page: 1, results: [], total_pages: 0, total_results: 0 };
  }

  const cacheKey = `search_${query.toLowerCase()}_l${lang}_p${page}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
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
  return payload;
}

/**
 * Handles movie details
 */
async function handleMovieDetails(body: any): Promise<any> {
  const movieId = body.movieId || body.id;
  if (!movieId) {
    throw new Error("Missing 'movieId' parameter.");
  }

  const cacheKey = `movie_${movieId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }

  const data = await fetchFromTmdb(`/movie/${movieId}`, {
    append_to_response: "release_dates",
  });

  setCached(cacheKey, data, 60 * 60 * 1000);
  return data;
}

/**
 * Handles movie genres
 */
async function handleMovieGenres(): Promise<any> {
  const cached = getCached("genres");
  if (cached) {
    return cached;
  }

  const data = await fetchFromTmdb("/genre/movie/list");
  setCached("genres", data, 24 * 60 * 60 * 1000);
  return data;
}

/**
 * Main dispatcher for all movie-related actions
 */
export async function handleMovies(body: any): Promise<any> {
  const action = body.action || body.subaction;

  if (action === "movies-discover" || action === "discover") {
    return await handleMoviesDiscover(body);
  }
  if (action === "movies-search" || action === "search") {
    return await handleMoviesSearch(body);
  }
  if (action === "movie-details" || action === "details") {
    return await handleMovieDetails(body);
  }
  if (action === "movies-genres" || action === "genres") {
    return await handleMovieGenres();
  }

  throw new Error(`Unsupported movie action: ${action}`);
}
