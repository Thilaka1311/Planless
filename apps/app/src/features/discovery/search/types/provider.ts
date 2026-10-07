export type SearchProviderType = "GOOGLE_PLACES" | "TMDB" | "INTERNAL_DB";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface SearchStrategy {
  providerType: SearchProviderType;
  endpoint: "text_search" | "nearby_search" | "autocomplete" | "tmdb_search";
  query: string;
  queries?: string[];
  category?: "SPORTS" | "DINING" | "ACTIVITIES" | "MOVIES" | "ALL";
  locationBias?: {
    latitude: number;
    longitude: number;
    radiusMeters?: number;
  };
  strictLocation?: boolean;
  pageToken?: string | null;
  radiusMeters?: number;
  city?: string;
  cityBounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null;
}

export interface RawCandidatePlace {
  place_id: string;
  name?: string;
  title?: string;
  category?: string;
  subcategory?: string | null;
  description?: string | null;
  types?: string[];
  latitude?: number | null;
  longitude?: number | null;
  vicinity?: string;
  formatted_address?: string;
  rating?: number | null;
  user_ratings_total?: number | null;
  photos?: any[];
  cover_image_url?: string | null;
  photo_references?: string[] | null;
  _raw?: any;
  [key: string]: any;
}

export interface ProviderCandidateResult {
  candidates: RawCandidatePlace[];
  nextPageToken?: string | null;
  resolvedLocationName?: string | null;
  searchCoordinates?: GeoPoint | null;
}

export interface ISearchProvider {
  readonly id: SearchProviderType;
  search(strategy: SearchStrategy): Promise<ProviderCandidateResult>;
}
