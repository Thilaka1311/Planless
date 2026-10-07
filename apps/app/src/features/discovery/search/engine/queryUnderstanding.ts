import { ParsedQuery, SearchIntentType } from "../types/intent";
import { normalizeSearchText } from "../utils/stringMatching";
import { extractQueryLocation } from "../utils/locationExtraction";
import { SPORTS_CONFIGS, SportCategoryId } from "../../services/sportsRelevance";

export const DINING_CATEGORY_KEYWORDS = new Set([
  "restaurant",
  "restaurants",
  "cafe",
  "cafes",
  "dining",
  "food",
  "diner",
  "kitchen",
  "bar",
  "bars",
  "pub",
  "pubs",
  "brewery",
  "breweries",
  "pizza",
  "burger",
  "bakery",
  "coffee",
  "dessert",
  "fast food",
]);

const ACTIVITY_KEYWORDS = new Set([
  "bowling",
  "arcade",
  "arcades",
  "gaming",
  "karting",
  "go karting",
  "escape room",
  "mystery room",
  "trampoline",
  "laser tag",
  "paintball",
  "mini golf",
  "skating",
  "amusement park",
]);

const MOVIE_KEYWORDS = new Set([
  "movie",
  "movies",
  "cinema",
  "cinemas",
  "theatre",
  "theatres",
  "theater",
  "theaters",
  "multiplex",
  "imax",
]);

/**
 * Understands and parses a raw user search query into a structured contract.
 * Deterministic, lightweight, and extensible.
 */
function buildParsedQuery(
  base: {
    rawQuery: string;
    normalizedQuery: string;
    intent: SearchIntentType;
    cleanSearchTerm: string;
    cleanSearchTermIntent?: SearchIntentType;
    categoryHint?: "SPORTS" | "DINING" | "ACTIVITIES" | "MOVIES" | "ALL";
    sportCategory?: SportCategoryId;
    locationQualifier?: any;
    confidence: number;
  },
  contextCategory?: "SPORTS" | "DINING" | "ACTIVITIES" | "MOVIES" | "ALL",
  contextSubcategory?: string
): ParsedQuery {
  const effectiveCategory =
    contextCategory && contextCategory !== "ALL"
      ? contextCategory
      : (base.categoryHint !== "ALL" ? base.categoryHint : undefined);

  return {
    ...base,
    searchTerm: base.cleanSearchTerm,
    category: effectiveCategory,
    subcategory: contextSubcategory && contextSubcategory !== "all" ? contextSubcategory : undefined,
    sport: base.sportCategory,
    locationQuery: base.locationQualifier?.raw || base.locationQualifier?.normalized,
  };
}

const KNOWN_LOCALITIES_SET = new Set([
  "koramangala", "indiranagar", "hsr layout", "hsr", "whitefield",
  "jp nagar", "jayanagar", "mg road", "brigade road", "church street",
  "richmond town", "richmond road", "bellandur", "marathahalli",
  "electronic city", "sarjapur road", "sarjapur", "btm layout", "btm",
  "banashankari", "malleshwaram", "rajajinagar", "sadashivanagar",
  "hebbal", "yelahanka", "vidyaranyapura", "kammanahalli",
  "kalyan nagar", "frazer town", "ulsoor", "halasuru", "vasanth nagar",
  "cunningham road", "lavelle road", "residency road",
]);

export function understandQuery(
  rawQuery: string,
  contextCategory: "SPORTS" | "DINING" | "ACTIVITIES" | "MOVIES" | "ALL" = "ALL",
  contextSubcategory?: string
): ParsedQuery {
  const trimmed = rawQuery.trim().replace(/\s+/g, " ");
  const normalized = normalizeSearchText(trimmed);
  const createParsed = (base: any) => buildParsedQuery(base, contextCategory, contextSubcategory);

  // 1. Empty query handling -> Browse Mode
  if (!trimmed) {
    return createParsed({
      rawQuery: "",
      normalizedQuery: "",
      intent: "BROWSE_CATEGORY",
      cleanSearchTerm: "",
      categoryHint: contextCategory !== "ALL" ? contextCategory : undefined,
      sportCategory:
        contextCategory === "SPORTS" && contextSubcategory && contextSubcategory in SPORTS_CONFIGS
          ? (contextSubcategory as SportCategoryId)
          : undefined,
      confidence: 1.0,
    });
  }

  // 2. Extract location anchors ("near Koramangala", "in Indiranagar", etc.)
  let { hasLocationQualifier, cleanSearchTerm, locationQualifier, isPureLocation } =
    extractQueryLocation(trimmed);

  // Check if query is a category keyword + known locality (e.g. "food indiranagar", "turf indiranagar")
  if (!hasLocationQualifier) {
    for (const loc of KNOWN_LOCALITIES_SET) {
      if (normalized.endsWith(" " + loc)) {
        const potentialTerm = normalized.slice(0, normalized.length - loc.length).trim();
        const isCategoryTerm =
          DINING_CATEGORY_KEYWORDS.has(potentialTerm) ||
          ACTIVITY_KEYWORDS.has(potentialTerm);
        if (isCategoryTerm) {
          hasLocationQualifier = true;
          cleanSearchTerm = trimmed.slice(0, trimmed.length - loc.length).trim();
          locationQualifier = {
            raw: trimmed.slice(trimmed.length - loc.length).trim(),
            normalized: loc,
          };
          break;
        }
      }
    }
  }

  const cleanNormalized = normalizeSearchText(cleanSearchTerm);

  // 3. Pure location query ("Koramangala")
  if (isPureLocation) {
    return createParsed({
      rawQuery: trimmed,
      normalizedQuery: normalized,
      intent: "SEARCH_LOCATION",
      cleanSearchTerm: cleanSearchTerm,
      categoryHint: contextCategory !== "ALL" ? contextCategory : undefined,
      locationQualifier,
      confidence: 0.95,
    });
  }

  // 4. Combined query ("football turf near Koramangala", "restaurants in Indiranagar")
  if (hasLocationQualifier && locationQualifier) {
    // Determine the category of the cleanSearchTerm
    const subResult = understandQuery(cleanSearchTerm, contextCategory, contextSubcategory);
    return createParsed({
      rawQuery: trimmed,
      normalizedQuery: normalized,
      intent: "SEARCH_COMBINED",
      cleanSearchTerm: cleanSearchTerm,
      cleanSearchTermIntent: subResult.intent,
      categoryHint: subResult.categoryHint || (contextCategory !== "ALL" ? contextCategory : undefined),
      sportCategory: subResult.sportCategory,
      locationQualifier,
      confidence: 0.92,
    });
  }

// 5. Sport activity / venue search matching SPORTS_CONFIGS
  const GENERIC_SPORT_VENUE_TERMS = new Set([
    "turf",
    "turfs",
    "ground",
    "grounds",
    "court",
    "courts",
    "club",
    "clubs",
    "centre",
    "center",
    "centres",
    "centers",
    "academy",
    "academies",
    "nets",
    "pitch",
    "field",
    "arena",
    "facility",
    "facilities",
    "complex",
    "stadium",
    "rink",
    "pool",
  ]);

  const GENERIC_SPORT_MODIFIERS = new Set([
    "indoor",
    "outdoor",
    "box",
    "synthetic",
    "wooden",
    "best",
    "top",
    "good",
    "local",
    "nearby",
    "near",
    "open",
  ]);

  const ALL_SPORT_TOKENS = new Set([
    "football",
    "soccer",
    "futsal",
    "badminton",
    "shuttle",
    "pickleball",
    "pickle",
    "ball",
    "tennis",
    "cricket",
    "basketball",
    "table",
    "ping",
    "pong",
    "squash",
    "swimming",
    "swim",
    "volleyball",
    "golf",
    "sports",
    "sport",
    "a",
    "side",
    "aside",
    "5",
    "7",
  ]);

  const isGenericSportTokens = (norm: string): boolean => {
    const tokens = norm.split(/[\s-]+/).filter(Boolean);
    if (tokens.length === 0) return false;
    return tokens.every(
      (t) =>
        ALL_SPORT_TOKENS.has(t) ||
        GENERIC_SPORT_VENUE_TERMS.has(t) ||
        GENERIC_SPORT_MODIFIERS.has(t)
    );
  };

  for (const sportId of Object.keys(SPORTS_CONFIGS) as SportCategoryId[]) {
    if (sportId === "all") continue;
    const config = SPORTS_CONFIGS[sportId];
    const isSportMatch = config.strongPositiveKeywords.some((k) => {
      if (k === "tennis") return cleanNormalized.includes("tennis") && !cleanNormalized.includes("table tennis");
      return cleanNormalized.includes(k);
    });

    if (isSportMatch) {
      const isGeneric = isGenericSportTokens(cleanNormalized);
      if (isGeneric) {
        return createParsed({
          rawQuery: trimmed,
          normalizedQuery: normalized,
          intent: "SEARCH_SPORT",
          cleanSearchTerm: cleanSearchTerm,
          categoryHint: "SPORTS",
          sportCategory: sportId,
          confidence: 0.9,
        });
      } else {
        // Specific venue search containing sport word (e.g. "Bengaluru Turf Inc", "Tiger Turf")
        return createParsed({
          rawQuery: trimmed,
          normalizedQuery: normalized,
          intent: "SEARCH_PLACE",
          cleanSearchTerm: cleanSearchTerm,
          categoryHint: "SPORTS",
          sportCategory: sportId,
          confidence: 0.92,
        });
      }
    }
  }

  // 6. Dining Category Queries ("restaurants", "cafes", "pizza", "burger", "coffee shop")
  const GENERIC_PREFIXES = new Set(["best", "top", "good", "local", "famous", "popular", "nearby", "open"]);
  const GENERIC_SUFFIXES = new Set(["shop", "shops", "place", "places", "spot", "spots", "joint", "joints", "outlet", "outlets", "center", "centre"]);

  const isGenericDiningCategory = (norm: string, k: string): boolean => {
    if (norm === k) return true;
    const tokens = norm.split(/\s+/);
    if (tokens.length === 2) {
      if (GENERIC_PREFIXES.has(tokens[0]) && tokens[1] === k) return true;
      if (tokens[0] === k && GENERIC_SUFFIXES.has(tokens[1])) return true;
    }
    if (tokens.length === 3) {
      if (GENERIC_PREFIXES.has(tokens[0]) && tokens[1] === k && GENERIC_SUFFIXES.has(tokens[2])) return true;
    }
    return false;
  };

  for (const k of DINING_CATEGORY_KEYWORDS) {
    if (isGenericDiningCategory(cleanNormalized, k)) {
      return createParsed({
        rawQuery: trimmed,
        normalizedQuery: normalized,
        intent: "SEARCH_DINING",
        cleanSearchTerm: cleanSearchTerm,
        categoryHint: "DINING",
        confidence: 0.88,
      });
    }
  }

  // 7. Activity Category Queries ("bowling", "arcade", "go-karting")
  const ALL_ACTIVITY_TOKENS = new Set([
    "bowling",
    "arcade",
    "arcades",
    "gaming",
    "games",
    "game",
    "karting",
    "go",
    "escape",
    "mystery",
    "room",
    "rooms",
    "trampoline",
    "laser",
    "tag",
    "paintball",
    "mini",
    "golf",
    "skating",
    "skate",
    "rink",
    "amusement",
    "park",
    "alley",
    "alleys",
    "zone",
    "zones",
    "arena",
    "arenas",
    "center",
    "centre",
    "place",
    "places",
    "spot",
    "spots",
    "best",
    "top",
    "good",
    "local",
    "nearby",
    "open",
    "near",
    "in",
  ]);

  const hasActivityKeyword = Array.from(ACTIVITY_KEYWORDS).some((k) => cleanNormalized.includes(k));
  if (hasActivityKeyword) {
    const tokens = cleanNormalized.split(/[\s-]+/).filter(Boolean);
    const isGeneric = tokens.length > 0 && tokens.every((t) => ALL_ACTIVITY_TOKENS.has(t));
    if (isGeneric) {
      return createParsed({
        rawQuery: trimmed,
        normalizedQuery: normalized,
        intent: "SEARCH_ACTIVITY",
        cleanSearchTerm: cleanSearchTerm,
        categoryHint: "ACTIVITIES",
        confidence: 0.88,
      });
    } else {
      // Specific activity venue (e.g. "Amoeba Bowling", "Smaaash Gaming")
      return createParsed({
        rawQuery: trimmed,
        normalizedQuery: normalized,
        intent: "SEARCH_PLACE",
        cleanSearchTerm: cleanSearchTerm,
        categoryHint: "ACTIVITIES",
        confidence: 0.9,
      });
    }
  }

  // 8. Movie Queries ("movie", "theatre", "imax")
  const ALL_MOVIE_TOKENS = new Set([
    "movie",
    "movies",
    "cinema",
    "cinemas",
    "theatre",
    "theatres",
    "theater",
    "theaters",
    "multiplex",
    "imax",
    "film",
    "films",
    "hall",
    "halls",
    "screen",
    "screens",
    "in",
    "near",
    "best",
    "top",
    "good",
    "nearby",
    "local",
    "open",
    "show",
    "shows",
  ]);

  const hasMovieKeyword = Array.from(MOVIE_KEYWORDS).some((k) => cleanNormalized.includes(k));
  if (hasMovieKeyword) {
    const tokens = cleanNormalized.split(/[\s-]+/).filter(Boolean);
    const isGeneric = tokens.length > 0 && tokens.every((t) => ALL_MOVIE_TOKENS.has(t));
    if (isGeneric) {
      return createParsed({
        rawQuery: trimmed,
        normalizedQuery: normalized,
        intent: "SEARCH_MOVIE",
        cleanSearchTerm: cleanSearchTerm,
        categoryHint: "MOVIES",
        confidence: 0.88,
      });
    } else {
      return createParsed({
        rawQuery: trimmed,
        normalizedQuery: normalized,
        intent: "SEARCH_PLACE",
        cleanSearchTerm: cleanSearchTerm,
        categoryHint: "MOVIES",
        confidence: 0.9,
      });
    }
  }

  // 9. Specific Place Search (Default for specific venue names like "Truffles", "Toit", "Play Arena")
  return createParsed({
    rawQuery: trimmed,
    normalizedQuery: normalized,
    intent: "SEARCH_PLACE",
    cleanSearchTerm: cleanSearchTerm,
    categoryHint: contextCategory !== "ALL" ? contextCategory : undefined,
    sportCategory:
      contextCategory === "SPORTS" && contextSubcategory && contextSubcategory in SPORTS_CONFIGS
        ? (contextSubcategory as SportCategoryId)
        : undefined,
    confidence: 0.85,
  });
}

export const parseUserQuery = understandQuery;

