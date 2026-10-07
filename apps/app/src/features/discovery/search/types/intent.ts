import { SportCategoryId } from "../../services/sportsRelevance";

export type SearchIntentType =
  | "SEARCH_PLACE"
  | "SEARCH_CATEGORY"
  | "SEARCH_SPORT"
  | "SEARCH_ACTIVITY"
  | "SEARCH_DINING"
  | "SEARCH_MOVIE"
  | "SEARCH_LOCATION"
  | "SEARCH_COMBINED"
  | "BROWSE_CATEGORY";

export interface LocationQualifier {
  raw: string;
  normalized: string;
}

export interface ParsedQuery {
  rawQuery: string;
  normalizedQuery: string;
  intent: SearchIntentType;
  cleanSearchTerm: string;
  cleanSearchTermIntent?: SearchIntentType;
  searchTerm?: string;
  categoryHint?: "SPORTS" | "DINING" | "ACTIVITIES" | "MOVIES" | "ALL";
  category?: "SPORTS" | "DINING" | "ACTIVITIES" | "MOVIES" | "ALL";
  subcategory?: string;
  sportCategory?: SportCategoryId;
  sport?: string;
  locationQualifier?: LocationQualifier;
  locationQuery?: string;
  confidence: number;
}

