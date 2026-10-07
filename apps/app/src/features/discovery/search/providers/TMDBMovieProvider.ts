import { ISearchProvider, SearchProviderType, SearchStrategy, ProviderCandidateResult, RawCandidatePlace } from "../types/provider";
import { searchMovies, fetchDiscoverMovies } from "../../services/tmdbMovieService";

export class TMDBMovieProvider implements ISearchProvider {
  readonly id: SearchProviderType = "TMDB";

  async search(strategy: SearchStrategy): Promise<ProviderCandidateResult> {
    try {
      const page = strategy.pageToken ? parseInt(strategy.pageToken, 10) || 1 : 1;
      const query = strategy.query.trim();

      let items: any[] = [];
      let totalPages = 1;

      try {
        if (!query || query.toLowerCase() === "movies" || query.toLowerCase() === "cinema") {
          // Browse mode: fetch now playing movies
          const res = await fetchDiscoverMovies("now_playing", page);
          items = res.items || [];
          totalPages = res.totalPages || 1;
        } else {
          const res = await searchMovies(query, page, "all");
          items = res.items || [];
          totalPages = res.totalPages || 1;
        }
      } catch (tmdbErr) {
        console.warn("[TMDBMovieProvider] TMDB search error:", tmdbErr);
        items = [];
      }

      const candidates: RawCandidatePlace[] = items.map((item) => ({
        place_id: item.id || item.public_id,
        name: item.title,
        title: item.title,
        category: "MOVIES",
        subcategory: item.subcategory || "Movie",
        description: item.description || item.location,
        types: ["movie", "cinema"],
        latitude: null,
        longitude: null,
        vicinity: item.location || "In Theatres",
        formatted_address: item.place_address || item.location || "In Theatres",
        rating: item.rating,
        user_ratings_total: item.user_ratings_total,
        photos: [],
        cover_image_url: item.cover_image_url,
        release_date: item.release_date || null,
        _raw: item,
      }));

      const nextPageToken = page < totalPages ? String(page + 1) : null;

      return {
        candidates,
        nextPageToken,
        searchCoordinates: null,
      };
    } catch (err) {
      console.error("[TMDBMovieProvider] Search failed:", err);
      return {
        candidates: [],
        nextPageToken: null,
      };
    }
  }
}
