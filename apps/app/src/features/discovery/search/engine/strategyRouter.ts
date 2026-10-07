import { ParsedQuery } from "../types/intent";
import { SearchStrategy, GeoPoint } from "../types/provider";
import { SPORTS_CONFIGS, SportCategoryId } from "../../services/sportsRelevance";

export interface StrategyRouterContext {
  discoveryLocation?: (GeoPoint & { name?: string }) | null;
  searchLocation?: GeoPoint | null;
  category?: "SPORTS" | "DINING" | "ACTIVITIES" | "MOVIES" | "ALL";
  subCategoryFilter?: string;
  subcategory?: string;
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

/**
 * Strategy Router: Decides WHAT to search, WHERE to search, and WHICH provider/API endpoint to use.
 * Does NOT rank or score results.
 */
export function routeSearchStrategy(
  parsedQuery: ParsedQuery,
  context: StrategyRouterContext
): SearchStrategy {
  const { discoveryLocation, category = "ALL", pageToken, radiusMeters = 15000, city, cityBounds } = context;
  const effectiveCategory = parsedQuery.categoryHint || (category !== "ALL" ? category : undefined);

  const locBias = discoveryLocation
    ? {
        latitude: discoveryLocation.latitude,
        longitude: discoveryLocation.longitude,
        radiusMeters,
      }
    : undefined;

  // 1. Movie Searches -> TMDB
  if (parsedQuery.intent === "SEARCH_MOVIE" || category === "MOVIES") {
    return {
      providerType: "TMDB",
      endpoint: "tmdb_search",
      query: parsedQuery.cleanSearchTerm || parsedQuery.rawQuery,
      category: "MOVIES",
      pageToken,
      city,
      cityBounds,
    };
  }

  // 2. Sport Searches -> Google Places Text Search for user's sport query term
  if (parsedQuery.intent === "SEARCH_SPORT" && parsedQuery.sportCategory) {
    return {
      providerType: "GOOGLE_PLACES",
      endpoint: "text_search",
      query: parsedQuery.cleanSearchTerm,
      category: "SPORTS",
      locationBias: locBias,
      pageToken,
      radiusMeters,
      city,
      cityBounds,
    };
  }

  // 3. Combined Query ("football turf near Koramangala") -> Text Search with location anchor
  if (parsedQuery.intent === "SEARCH_COMBINED" && parsedQuery.locationQualifier) {
    const formattedQuery = `${parsedQuery.cleanSearchTerm} ${parsedQuery.locationQualifier.normalized}`;
    const expandedBias = discoveryLocation
      ? {
          latitude: discoveryLocation.latitude,
          longitude: discoveryLocation.longitude,
          radiusMeters: 25000,
        }
      : undefined;

    return {
      providerType: "GOOGLE_PLACES",
      endpoint: "text_search",
      query: formattedQuery,
      queries: [formattedQuery],
      category: effectiveCategory,
      locationBias: expandedBias,
      pageToken,
      radiusMeters: 25000,
      city,
      cityBounds,
    };
  }

  // 4. Specific Place ("Truffles", "Toit", "Play Arena") -> Text Search with location bias
  if (parsedQuery.intent === "SEARCH_PLACE") {
    return {
      providerType: "GOOGLE_PLACES",
      endpoint: "text_search",
      query: parsedQuery.cleanSearchTerm,
      category: effectiveCategory,
      locationBias: locBias,
      pageToken,
      radiusMeters,
      city,
      cityBounds,
    };
  }

  // 5. Category Browsing Mode (Empty query)
  if (parsedQuery.intent === "BROWSE_CATEGORY") {
    const activeSportKey =
      parsedQuery.sportCategory ||
      (context.subcategory && context.subcategory in SPORTS_CONFIGS && context.subcategory !== "all"
        ? (context.subcategory as SportCategoryId)
        : undefined);

    if (activeSportKey) {
      const config = SPORTS_CONFIGS[activeSportKey];
      const targeted = config ? config.searchQueries.slice(0, 5) : [activeSportKey];
      return {
        providerType: "GOOGLE_PLACES",
        endpoint: "nearby_search",
        query: config ? config.searchQueries[0] : activeSportKey,
        queries: targeted,
        category: "SPORTS",
        locationBias: locBias,
        strictLocation: true,
        pageToken,
        radiusMeters,
        city,
        cityBounds,
      };
    }

    if (effectiveCategory === "SPORTS") {
      const allSportsQueries = [
        "turf",
        "sports turf",
        "football turf",
        "badminton court",
        "pickleball court",
        "tennis court",
        "basketball court",
        "cricket ground",
        "table tennis",
      ];
      return {
        providerType: "GOOGLE_PLACES",
        endpoint: "nearby_search",
        query: "sports turf",
        queries: allSportsQueries,
        category: "SPORTS",
        locationBias: locBias,
        strictLocation: true,
        pageToken,
        radiusMeters,
        city,
        cityBounds,
      };
    }

    return {
      providerType: "GOOGLE_PLACES",
      endpoint: "nearby_search",
      query: parsedQuery.cleanSearchTerm || (context.subCategoryFilter || "all"),
      category: effectiveCategory,
      locationBias: locBias,
      strictLocation: true,
      pageToken,
      radiusMeters,
      city,
      cityBounds,
    };
  }

  // 6. Generic Text Search (Dining, Activities, Categories) -> Text Search
  return {
    providerType: "GOOGLE_PLACES",
    endpoint: "text_search",
    query: parsedQuery.cleanSearchTerm,
    category: effectiveCategory,
    locationBias: locBias,
    pageToken,
    radiusMeters,
    city,
    cityBounds,
  };
}
