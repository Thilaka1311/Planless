import { DiscoveryItem, TmdbMovie } from "../../../core/types/discovery";

export const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/";
export const TMDB_REGION = "IN";

export const TMDB_SUPPORTED_LANGUAGES = ["hi", "en", "ta", "kn", "te"] as const;
export type SupportedMovieLanguage = typeof TMDB_SUPPORTED_LANGUAGES[number];

export const TMDB_LANGUAGE_NAMES: Record<string, string> = {
  hi: "Hindi",
  en: "English",
  ta: "Tamil",
  kn: "Kannada",
  te: "Telugu",
};

/**
 * Returns a human-friendly language name for supported Indian regional languages.
 */
export function getLanguageLabel(code: string | null | undefined): string {
  if (!code) return "";
  const lower = code.toLowerCase();
  return TMDB_LANGUAGE_NAMES[lower] || code;
}

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

// Default movie fallback image from local assets
const DEFAULT_MOVIE_COVER = "/assets/plan-covers/movie.png";

export const TMDB_GENRES_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

/**
 * Resolves a high quality poster URL from a TMDB poster_path.
 */
export function getTmdbPosterUrl(posterPath: string | null | undefined, size = "w500"): string {
  if (!posterPath) {
    return DEFAULT_MOVIE_COVER;
  }
  if (posterPath.startsWith("http")) {
    return posterPath;
  }
  return `${TMDB_IMAGE_BASE_URL}${size}${posterPath.startsWith("/") ? "" : "/"}${posterPath}`;
}

/**
 * Resolves a backdrop URL from a TMDB backdrop_path.
 */
export function getTmdbBackdropUrl(backdropPath: string | null | undefined, size = "w780"): string {
  if (!backdropPath) {
    return DEFAULT_MOVIE_COVER;
  }
  if (backdropPath.startsWith("http")) {
    return backdropPath;
  }
  return `${TMDB_IMAGE_BASE_URL}${size}${backdropPath.startsWith("/") ? "" : "/"}${backdropPath}`;
}

/**
 * Converts a TMDB movie result into a Planless DiscoveryItem.
 */
export function mapTmdbMovieToDiscoveryItem(
  movie: TmdbMovie,
  sectionId = "movies-trending"
): DiscoveryItem {
  const genreNames = (movie.genre_ids || [])
    .map((gid) => TMDB_GENRES_MAP[gid])
    .filter(Boolean);

  const releaseYear = movie.release_date ? movie.release_date.split("-")[0] : "";
  const subcategory = genreNames.slice(0, 2).join(" | ") || "Feature Film";
  const languageName = getLanguageLabel(movie.original_language);

  return {
    id: `tmdb-${movie.id}`,
    public_id: `tmdb-${movie.id}`,
    section_id: sectionId,
    title: movie.title || movie.original_title || "Untitled Movie",
    category: "MOVIES",
    subcategory,
    description: movie.overview || "No synopsis available for this title.",
    cover_image_url: getTmdbPosterUrl(movie.poster_path, "w500"),
    // Movies do not have a physical location — leave it empty so the create flow
    // does not populate the location field with the release year.
    location: "",
    suggested_duration_minutes: 150,
    suggested_cost_amount: null,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: (movie.popularity || 0) > 100,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    rating: movie.vote_average ? Number(movie.vote_average.toFixed(1)) : null,
    user_ratings_total: movie.vote_count || 0,
    // Exact TMDB metadata preserved
    movie_id: movie.id,
    original_title: movie.original_title,
    backdrop_url: getTmdbBackdropUrl(movie.backdrop_path || movie.poster_path, "w780"),
    release_date: movie.release_date || null,
    vote_average: movie.vote_average,
    vote_count: movie.vote_count,
    popularity: movie.popularity,
    original_language: movie.original_language,
    language_name: languageName,
    genre_ids: movie.genre_ids || [],
    genres: genreNames,
    adult: Boolean(movie.adult),
    video: Boolean(movie.video),
  };
}

// Client-side in-memory cache and in-flight request deduplication
const memoryCache = new Map<string, { items: DiscoveryItem[]; totalPages: number; timestamp: number }>();
const inFlightRequests = new Map<string, Promise<{ items: DiscoveryItem[]; totalPages: number }>>();

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache validity

function getFromMemoryCache(key: string): { items: DiscoveryItem[]; totalPages: number } | null {
  const cached = memoryCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return { items: cached.items, totalPages: cached.totalPages };
}

function setMemoryCache(key: string, data: { items: DiscoveryItem[]; totalPages: number }): void {
  memoryCache.set(key, { ...data, timestamp: Date.now() });

  // Persist to localStorage for first page results to ensure instant zero-flash reload
  if (typeof window !== "undefined" && window.localStorage && key.includes("_p1_")) {
    try {
      window.localStorage.setItem(`planless_tmdb_${key}`, JSON.stringify(data));
    } catch {
      // Ignore quota errors
    }
  }
}

/**
 * Synchronous local storage retrieval for zero-flash startup.
 */
export function getCachedMovieSection(key: string): DiscoveryItem[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(`planless_tmdb_${key}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return items.map((item: any) => ({
      ...item,
      location: "",
    }));
  } catch {
    return [];
  }
}

/**
 * Helper to interleave lists of movies round-robin across languages.
 */
function interleaveLanguageMovies(lists: TmdbMovie[][]): TmdbMovie[] {
  const combined: TmdbMovie[] = [];
  const seenIds = new Set<number>();
  const maxLen = Math.max(...lists.map((l) => l.length), 0);

  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
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
 * Discovers movies by type (now_playing, popular, upcoming, top_rated) or genre in the Indian regional context.
 * Strictly enforces the 5 supported languages: Hindi, English, Tamil, Kannada, Telugu.
 */
export async function fetchDiscoverMovies(
  type: "now_playing" | "popular" | "upcoming" | "top_rated" = "now_playing",
  page = 1,
  genre?: number,
  lang = "all"
): Promise<{ items: DiscoveryItem[]; totalPages: number }> {
  const normalizedLang = (TMDB_SUPPORTED_LANGUAGES as readonly string[]).includes(lang.toLowerCase())
    ? lang.toLowerCase()
    : "all";

  const cacheKey = `discover_${type}_l${normalizedLang}_p${page}_g${genre || "all"}`;

  const cached = getFromMemoryCache(cacheKey);
  if (cached) {
    return cached;
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const requestPromise = (async () => {
    try {
      let rawData: any = null;

      // 1. First attempt: call local/production backend proxy
      try {
        const queryParams = new URLSearchParams({
          type,
          page: String(page),
          lang: normalizedLang,
        });
        if (genre) queryParams.set("genre", String(genre));

        const proxyRes = await fetch(`/api/movies/discover?${queryParams.toString()}`);
        if (proxyRes.ok) {
          const contentType = proxyRes.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            rawData = await proxyRes.json();
          }
        }
      } catch (proxyErr) {
        console.warn("[tmdbMovieService] Backend proxy unavailable, falling back to direct API:", proxyErr);
      }

      // 2. Direct TMDB fallback if backend proxy not reachable
      if (!rawData || !Array.isArray(rawData.results)) {
        const token =
          (typeof import.meta !== "undefined" && import.meta.env?.VITE_TMDB_ACCESS_TOKEN) ||
          (typeof process !== "undefined" && (process.env?.VITE_TMDB_ACCESS_TOKEN || process.env?.TMDB_ACCESS_TOKEN));
        const apiKey =
          (typeof import.meta !== "undefined" && import.meta.env?.VITE_TMDB_API_KEY) ||
          (typeof process !== "undefined" && (process.env?.VITE_TMDB_API_KEY || process.env?.TMDB_API_KEY));

        const headers: Record<string, string> = { Accept: "application/json" };
        if (token) {
          headers["Authorization"] = `Bearer ${token.trim()}`;
        }

        const buildTmdbUrl = (path: string, params: Record<string, string>) => {
          const u = new URL(`https://api.themoviedb.org/3${path}`);
          u.searchParams.set("region", TMDB_REGION);
          if (!token && apiKey) u.searchParams.set("api_key", apiKey.trim());
          Object.entries(params).forEach(([k, v]) => {
            if (v) u.searchParams.set(k, v);
          });
          return u.toString();
        };

        if (type === "now_playing") {
          // Fetch pages 1, 2, and 3 from now_playing for India
          const [r1, r2, r3] = await Promise.all([
            fetch(buildTmdbUrl("/movie/now_playing", { page: "1" }), { headers })
              .then((r) => r.json())
              .catch(() => ({ results: [] })),
            fetch(buildTmdbUrl("/movie/now_playing", { page: "2" }), { headers })
              .then((r) => r.json())
              .catch(() => ({ results: [] })),
            fetch(buildTmdbUrl("/movie/now_playing", { page: "3" }), { headers })
              .then((r) => r.json())
              .catch(() => ({ results: [] })),
          ]);

          const npRaw = [...(r1.results || []), ...(r2.results || []), ...(r3.results || [])];

          // Also fetch top recent releases for the supported languages
          let popRaw: any[] = [];
          if (normalizedLang === "all") {
            const popPromises = TMDB_SUPPORTED_LANGUAGES.map((l) =>
              fetch(
                buildTmdbUrl("/discover/movie", {
                  page: "1",
                  with_original_language: l,
                  sort_by: "popularity.desc",
                  include_adult: "false",
                  include_video: "false",
                }),
                { headers }
              )
                .then((r) => r.json())
                .then((d) => (d.results || []).slice(0, 10))
                .catch(() => [])
            );
            const popByLang = await Promise.all(popPromises);
            popRaw = popByLang.flat();
          } else {
            const d = await fetch(
              buildTmdbUrl("/discover/movie", {
                page: "1",
                with_original_language: normalizedLang,
                sort_by: "popularity.desc",
                include_adult: "false",
                include_video: "false",
              }),
              { headers }
            )
              .then((r) => r.json())
              .catch(() => ({ results: [] }));
            popRaw = d.results || [];
          }

          const allRaw = [...npRaw, ...popRaw];
          let filtered: TmdbMovie[] = [];
          const seen = new Set<number>();

          if (normalizedLang !== "all") {
            for (const m of allRaw) {
              if (!m || !m.title || m.adult || m.video || seen.has(m.id)) continue;
              if (!isMovieWithinSixMonths(m.release_date)) continue;
              if (m.original_language === normalizedLang) {
                seen.add(m.id);
                filtered.push(m);
              }
            }
          } else {
            const byLang: Record<string, TmdbMovie[]> = { hi: [], ta: [], te: [], kn: [], en: [] };

            for (const m of allRaw) {
              if (!m || !m.title || m.adult || m.video || seen.has(m.id)) continue;
              if (!isMovieWithinSixMonths(m.release_date)) continue;
              if (byLang[m.original_language]) {
                seen.add(m.id);
                byLang[m.original_language].push(m);
              }
            }

            filtered = interleaveLanguageMovies([
              byLang.hi,
              byLang.ta,
              byLang.te,
              byLang.kn,
              byLang.en,
            ]);
          }

          rawData = { results: filtered, total_pages: 1 };
        } else if (type === "top_rated") {
          if (normalizedLang !== "all") {
            const d = await fetch(
              buildTmdbUrl("/discover/movie", {
                page: String(page),
                with_original_language: normalizedLang,
                sort_by: "vote_average.desc",
                "vote_count.gte": "50",
                include_adult: "false",
                include_video: "false",
                with_genres: genre ? String(genre) : "",
              }),
              { headers }
            ).then((r) => r.json());
            rawData = d;
          } else {
            const promises = TMDB_SUPPORTED_LANGUAGES.map((l) =>
              fetch(
                buildTmdbUrl("/discover/movie", {
                  page: "1",
                  with_original_language: l,
                  sort_by: "vote_average.desc",
                  "vote_count.gte": "50",
                  include_adult: "false",
                  include_video: "false",
                  with_genres: genre ? String(genre) : "",
                }),
                { headers }
              )
                .then((r) => r.json())
                .then((d) => (d.results || []).filter((m: any) => m && m.title && !m.adult && !m.video))
                .catch(() => [])
            );

            const resultsByLang = await Promise.all(promises);
            rawData = { results: interleaveLanguageMovies(resultsByLang), total_pages: 1 };
          }
        } else {
          // Popular
          if (normalizedLang !== "all") {
            const d = await fetch(
              buildTmdbUrl("/discover/movie", {
                page: String(page),
                with_original_language: normalizedLang,
                sort_by: "popularity.desc",
                include_adult: "false",
                include_video: "false",
                with_genres: genre ? String(genre) : "",
              }),
              { headers }
            ).then((r) => r.json());
            rawData = d;
          } else {
            const promises = TMDB_SUPPORTED_LANGUAGES.map((l) =>
              fetch(
                buildTmdbUrl("/discover/movie", {
                  page: "1",
                  with_original_language: l,
                  sort_by: "popularity.desc",
                  include_adult: "false",
                  include_video: "false",
                  with_genres: genre ? String(genre) : "",
                }),
                { headers }
              )
                .then((r) => r.json())
                .then((d) => (d.results || []).filter((m: any) => m && m.title && !m.adult && !m.video))
                .catch(() => [])
            );

            const resultsByLang = await Promise.all(promises);
            rawData = { results: interleaveLanguageMovies(resultsByLang), total_pages: 1 };
          }
        }
      }

      if (!rawData || !Array.isArray(rawData.results)) {
        return { items: [], totalPages: 0 };
      }

      // Filter to strictly supported languages and non-adult/non-video
      const validMovies: TmdbMovie[] = rawData.results.filter((m: any) => {
        if (!m || !m.title || m.adult || m.video) return false;
        if (normalizedLang !== "all") {
          return m.original_language === normalizedLang;
        }
        return (TMDB_SUPPORTED_LANGUAGES as readonly string[]).includes(m.original_language);
      });

      const items: DiscoveryItem[] = validMovies.map((m) =>
        mapTmdbMovieToDiscoveryItem(m, `movies-${type}`)
      );

      const result = {
        items,
        totalPages: rawData.total_pages || 1,
      };

      setMemoryCache(cacheKey, result);
      return result;
    } catch (err) {
      console.error("[tmdbMovieService] Failed fetching discover movies:", err);
      return { items: [], totalPages: 0 };
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

/**
 * Searches movies by title in the Indian regional context.
 * Strictly filters results to the supported languages (Hindi, English, Tamil, Kannada, Telugu).
 */
export async function searchMovies(
  query: string,
  page = 1,
  lang = "all"
): Promise<{ items: DiscoveryItem[]; totalPages: number }> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { items: [], totalPages: 0 };
  }

  const normalizedLang = (TMDB_SUPPORTED_LANGUAGES as readonly string[]).includes(lang.toLowerCase())
    ? lang.toLowerCase()
    : "all";

  const cacheKey = `search_${trimmed.toLowerCase()}_l${normalizedLang}_p${page}`;
  const cached = getFromMemoryCache(cacheKey);
  if (cached) {
    return cached;
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const requestPromise = (async () => {
    try {
      let rawData: any = null;

      // 1. First attempt: call backend proxy
      try {
        const queryParams = new URLSearchParams({
          query: trimmed,
          page: String(page),
          lang: normalizedLang,
        });

        const proxyRes = await fetch(`/api/movies/search?${queryParams.toString()}`);
        if (proxyRes.ok) {
          const contentType = proxyRes.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            rawData = await proxyRes.json();
          }
        }
      } catch (proxyErr) {
        console.warn("[tmdbMovieService] Search proxy failed, falling back to direct API:", proxyErr);
      }

      // 2. Direct TMDB fallback
      if (!rawData || !Array.isArray(rawData.results)) {
        const token =
          (typeof import.meta !== "undefined" && import.meta.env?.VITE_TMDB_ACCESS_TOKEN) ||
          (typeof process !== "undefined" && (process.env?.VITE_TMDB_ACCESS_TOKEN || process.env?.TMDB_ACCESS_TOKEN));
        const apiKey =
          (typeof import.meta !== "undefined" && import.meta.env?.VITE_TMDB_API_KEY) ||
          (typeof process !== "undefined" && (process.env?.VITE_TMDB_API_KEY || process.env?.TMDB_API_KEY));

        const url = new URL("https://api.themoviedb.org/3/search/movie");
        url.searchParams.set("query", trimmed);
        url.searchParams.set("region", TMDB_REGION);
        url.searchParams.set("page", String(page));
        url.searchParams.set("include_adult", "false");

        const headers: Record<string, string> = { Accept: "application/json" };
        if (token) {
          headers["Authorization"] = `Bearer ${token.trim()}`;
        } else if (apiKey) {
          url.searchParams.set("api_key", apiKey.trim());
        }

        const directRes = await fetch(url.toString(), { headers });
        if (directRes.ok) {
          rawData = await directRes.json();
        }
      }

      if (!rawData || !Array.isArray(rawData.results)) {
        return { items: [], totalPages: 0 };
      }

      // Filter to strictly supported languages and non-adult/non-video
      const validMovies: TmdbMovie[] = rawData.results.filter((m: any) => {
        if (!m || !m.title || m.adult || m.video) return false;
        if (normalizedLang !== "all") {
          return m.original_language === normalizedLang;
        }
        return (TMDB_SUPPORTED_LANGUAGES as readonly string[]).includes(m.original_language);
      });

      const items: DiscoveryItem[] = validMovies.map((m) =>
        mapTmdbMovieToDiscoveryItem(m, "movies-search")
      );

      const result = {
        items,
        totalPages: rawData.total_pages || 1,
      };

      setMemoryCache(cacheKey, result);
      return result;
    } catch (err) {
      console.error("[tmdbMovieService] Search failed:", err);
      return { items: [], totalPages: 0 };
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

/**
 * Fetches full details for a specific movie when opened.
 */
export async function fetchMovieDetails(movieId: number): Promise<any | null> {
  const cacheKey = `movie_detail_${movieId}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    let rawData: any = null;

    try {
      const proxyRes = await fetch(`/api/movies/${movieId}`);
      if (proxyRes.ok) {
        rawData = await proxyRes.json();
      }
    } catch {
      // Fallback
    }

    if (!rawData) {
      const token =
        (typeof import.meta !== "undefined" && import.meta.env?.VITE_TMDB_ACCESS_TOKEN) ||
        (typeof process !== "undefined" && (process.env?.VITE_TMDB_ACCESS_TOKEN || process.env?.TMDB_ACCESS_TOKEN));
      const apiKey =
        (typeof import.meta !== "undefined" && import.meta.env?.VITE_TMDB_API_KEY) ||
        (typeof process !== "undefined" && (process.env?.VITE_TMDB_API_KEY || process.env?.TMDB_API_KEY));

      const url = new URL(`https://api.themoviedb.org/3/movie/${movieId}`);
      url.searchParams.set("append_to_response", "release_dates");

      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token.trim()}`;
      } else if (apiKey) {
        url.searchParams.set("api_key", apiKey.trim());
      }

      const directRes = await fetch(url.toString(), { headers });
      if (directRes.ok) {
        rawData = await directRes.json();
      }
    }

    if (rawData) {
      memoryCache.set(cacheKey, rawData);
    }
    return rawData;
  } catch (err) {
    console.error(`[tmdbMovieService] Error fetching details for movie ${movieId}:`, err);
    return null;
  }
}
