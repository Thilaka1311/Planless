import { DiscoveryCategory, DiscoveryStatus } from "../../../../core/types/discovery";
import { SearchIntentType } from "./intent";

export interface SearchResultMetrics {
  distanceKm: number;
  formattedDistance: string;
  rating: number | null;
  userRatingsTotal: number | null;
}

export interface SearchResultItem {
  id: string;
  public_id: string;
  section_id: string;
  provider: "google" | "tmdb" | "planless";
  providerPlaceId: string;
  place_id: string;

  title: string;
  category: DiscoveryCategory;
  subcategory: string | null;
  displayLabel: string;
  description: string | null;
  types?: string[];

  location: string;
  place_address: string;
  latitude: number | null;
  longitude: number | null;

  cover_image_url: string | null;

  rating: number | null;
  user_ratings_total: number | null;
  distance: string;

  suggested_duration_minutes: number | null;
  suggested_cost_amount: number | null;
  suggested_capacity: number | null;
  default_rsvp_offset_minutes: number | null;
  display_order: number;
  featured: boolean;
  status: DiscoveryStatus;
  created_at: string;
  updated_at: string;

  // Search ranking & attribution metadata
  _distanceKm: number;
  _relevanceScore: number;
  _isExactMatch: boolean;
  _textMatchTier?: number;
  _matchPosition?: number;
  _tokenOrderScore?: number;
  _addressMatchesLocality?: boolean;
  _matchedIntent?: SearchIntentType;
  _sportCategory?: string | null;
  /** Derived list of sports this venue supports. Populated by getSupportedSports(). */
  supportedSports?: string[] | null;
  /** All Google photo references (for sport-aware photo selection). Index 0 = primary photo. */
  photo_references?: string[] | null;
  /** Indicates whether this venue's details/image are overridden by a Planless admin. */
  _hasPlanlessOverride?: boolean;

  // Movie specific optional fields
  movie_id?: number | null;
  original_title?: string | null;
  backdrop_url?: string | null;
  release_date?: string | null;
  vote_average?: number | null;
  vote_count?: number | null;
  original_language?: string | null;
  language_name?: string | null;
  genres?: string[] | null;
}
