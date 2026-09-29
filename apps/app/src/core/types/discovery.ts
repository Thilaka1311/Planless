export type DiscoveryCategory = "SPORTS" | "MOVIES" | "DINING" | "DRINKS" | "CUSTOM" | "QUICK_PLAN" | "ACTIVITIES";
export type DiscoveryStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export interface DiscoverySection {
  id: string;
  public_id: string;
  category: DiscoveryCategory;
  title: string;
  description: string | null;
  display_order: number;
  status: DiscoveryStatus;
  created_at: string;
  updated_at: string;
  items?: DiscoveryItem[];
}

export interface DiscoveryItem {
  id: string;
  public_id: string;
  section_id: string;
  title: string;
  category: DiscoveryCategory;
  subcategory: string | null;
  description: string | null;
  cover_image_url: string | null;
  location: string | null;
  suggested_duration_minutes: number | null;
  suggested_cost_amount: number | null;
  suggested_capacity: number | null;
  default_rsvp_offset_minutes: number | null;
  display_order: number;
  featured: boolean;
  status: DiscoveryStatus;
  created_at: string;
  updated_at: string;
  place_id?: string | null;
  place_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  distance?: string | null;
  rating?: number | null;
  user_ratings_total?: number | null;
  // TMDB Movie metadata
  movie_id?: number | null;
  original_title?: string | null;
  backdrop_url?: string | null;
  release_date?: string | null;
  vote_average?: number | null;
  vote_count?: number | null;
  popularity?: number | null;
  original_language?: string | null;
  language_name?: string | null;
  genre_ids?: number[] | null;
  genres?: string[] | null;
  adult?: boolean | null;
  video?: boolean | null;
}

export interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  original_language: string;
  genre_ids: number[];
  adult: boolean;
  video: boolean;
}
