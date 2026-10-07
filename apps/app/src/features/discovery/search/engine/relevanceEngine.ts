import { ParsedQuery } from "../types/intent";
import { SearchResultItem } from "../types/result";
import {
  isPlayableSportsVenue,
  isAuthenticDiningVenue,
  isAuthenticActivityVenue,
  classifyVenueCategory,
} from "../../services/venueRelevance";
import {
  scoreSportsVenueRelevance,
  SportCategoryId,
  RELEVANCE_THRESHOLD,
} from "../../services/sportsRelevance";
import {
  analyzeTextMatchTier,
  TextMatchTier,
  normalizeSearchText,
} from "../utils/stringMatching";
import { DINING_CATEGORY_KEYWORDS } from "./queryUnderstanding";

export interface RelevanceFilterResult {
  isRelevant: boolean;
  assignedCategory?: "SPORTS" | "DINING" | "ACTIVITIES" | "MOVIES";
  relevanceConfidence: number; // 0 to 1
  reason?: string;
}

export class PlanlessRelevanceEngine {
  /**
   * Filters and validates whether a candidate is genuinely relevant for Planless.
   * Enforces the Planless Search Ranking & Cutoff Rules:
   * 1. Search text relevance is mandatory for text searches (no non-matching results allowed).
   * 2. Category classification happens post-retrieval.
   * 3. Prohibited businesses (corporate offices, wholesalers) are excluded.
   * 4. Browse mode allows category-specific discovery when no query is typed.
   */
  evaluate(item: SearchResultItem, parsedQuery: ParsedQuery): RelevanceFilterResult {
    const targetCategory = parsedQuery.category || "ALL";
    const rawQueryTrimmed = (parsedQuery.rawQuery || "").trim();
    const isTextSearch = rawQueryTrimmed.length > 0 && parsedQuery.intent !== "BROWSE_CATEGORY";

    // ─── 1. BROWSE MODE (Empty query / Browse category) ──────────────────────────
    if (!isTextSearch) {
      if (item.provider === "tmdb" || item.category === "MOVIES") {
        if (targetCategory !== "MOVIES" && targetCategory !== "ALL") {
          return {
            isRelevant: false,
            relevanceConfidence: 0,
            reason: `Movie item does not belong in ${targetCategory}`,
          };
        }
        return {
          isRelevant: true,
          assignedCategory: "MOVIES",
          relevanceConfidence: 1.0,
        };
      }

      const venueLike = {
        title: item.title,
        name: item.title,
        category: item.category,
        subcategory: item.subcategory,
        description: item.description,
        types: item.types || (item as any).genres || [],
      };

      const isSports = isPlayableSportsVenue(venueLike);
      const isDining = isAuthenticDiningVenue(venueLike);
      const isActivity = isAuthenticActivityVenue(venueLike);
      const intrinsicCat = classifyVenueCategory(venueLike);

      if (targetCategory === "SPORTS") {
        return {
          isRelevant: isSports,
          assignedCategory: "SPORTS",
          relevanceConfidence: isSports ? 0.9 : 0,
          reason: isSports ? "Playable sports facility" : "Excluded non-sports venue",
        };
      }
      if (targetCategory === "DINING") {
        return {
          isRelevant: isDining,
          assignedCategory: "DINING",
          relevanceConfidence: isDining ? 0.9 : 0,
          reason: isDining ? "Authentic dining venue" : "Excluded non-dining venue",
        };
      }
      if (targetCategory === "ACTIVITIES") {
        return {
          isRelevant: isActivity,
          assignedCategory: "ACTIVITIES",
          relevanceConfidence: isActivity ? 0.9 : 0,
          reason: isActivity ? "Activity or entertainment venue" : "Excluded non-activity venue",
        };
      }
      if (intrinsicCat) {
        return {
          isRelevant: true,
          assignedCategory: intrinsicCat,
          relevanceConfidence: 0.85,
          reason: `Qualified as ${intrinsicCat}`,
        };
      }
      return {
        isRelevant: false,
        relevanceConfidence: 0,
        reason: "Does not match any playable, dining, activity, or movie venue type",
      };
    }

    // ─── 2. TEXT SEARCH MODE (User typed a query) ────────────────────────────────
    // Determine the primary search text and optional location component
    let queryTerm = parsedQuery.searchTerm || rawQueryTrimmed;
    let locationTerm = parsedQuery.locationQuery;

    if (parsedQuery.intent === "SEARCH_COMBINED" && parsedQuery.cleanSearchTerm) {
      queryTerm = parsedQuery.cleanSearchTerm;
      locationTerm = parsedQuery.locationQualifier?.raw || parsedQuery.locationQuery;
    } else if (parsedQuery.intent === "SEARCH_LOCATION" && parsedQuery.cleanSearchTerm) {
      queryTerm = parsedQuery.cleanSearchTerm;
      locationTerm = parsedQuery.cleanSearchTerm;
    }

    // Deterministically compute text match tier
    const candidateFields = {
      title: item.title,
      name: item.title,
      place_address: item.place_address,
      location: item.location,
      description: item.description,
      subcategory: item.subcategory,
      displayLabel: item.displayLabel,
      types: item.types || (item as any).genres || [],
    };

    const analysis = analyzeTextMatchTier(queryTerm, candidateFields, locationTerm);

    const venueLike = {
      title: item.title,
      name: item.title,
      category: item.category,
      subcategory: item.subcategory,
      description: item.description,
      types: item.types || (item as any).genres || [],
    };

    const isSports = isPlayableSportsVenue(venueLike);
    const isDining = isAuthenticDiningVenue(venueLike);
    const isActivity = isAuthenticActivityVenue(venueLike);

    // For generic category searches (e.g. "food", "restaurants", "turf", "bowling"),
    // authentic venues in that category inherently match the category search
    const cleanNorm = normalizeSearchText(queryTerm);
    const isGenericDiningSearch =
      parsedQuery.intent === "SEARCH_DINING" ||
      (parsedQuery.intent === "SEARCH_COMBINED" &&
        (parsedQuery.cleanSearchTermIntent === "SEARCH_DINING" ||
          DINING_CATEGORY_KEYWORDS.has(cleanNorm)));

    const isGenericSportSearch =
      parsedQuery.intent === "SEARCH_SPORT" ||
      (parsedQuery.intent === "SEARCH_COMBINED" &&
        parsedQuery.cleanSearchTermIntent === "SEARCH_SPORT");

    const isGenericActivitySearch =
      parsedQuery.intent === "SEARCH_ACTIVITY" ||
      (parsedQuery.intent === "SEARCH_COMBINED" &&
        parsedQuery.cleanSearchTermIntent === "SEARCH_ACTIVITY");

    if (analysis.tier === TextMatchTier.NO_MATCH) {
      if (isGenericDiningSearch && isDining) {
        analysis.tier = TextMatchTier.METADATA_MATCH;
        analysis.tierScore = 1000;
        analysis.metadataMatches = true;
      } else if (isGenericSportSearch && isSports) {
        analysis.tier = TextMatchTier.METADATA_MATCH;
        analysis.tierScore = 1000;
        analysis.metadataMatches = true;
      } else if (isGenericActivitySearch && isActivity) {
        analysis.tier = TextMatchTier.METADATA_MATCH;
        analysis.tierScore = 1000;
        analysis.metadataMatches = true;
      }
    }

    // Save computed text relevance metadata on the item for downstream ranking
    item._textMatchTier = analysis.tier;
    item._matchPosition = analysis.matchPosition;
    item._tokenOrderScore = analysis.tokenOrderScore;
    item._addressMatchesLocality = analysis.addressMatchesLocality;
    item._isExactMatch = analysis.isExactName;

    // MANDATORY CUTOFF: If there is no meaningful text or category match, EXCLUDE IT.
    // Do not fill result lists with loosely related category results.
    if (analysis.tier === TextMatchTier.NO_MATCH) {
      return {
        isRelevant: false,
        relevanceConfidence: 0,
        reason: `No meaningful text match for "${queryTerm}"`,
      };
    }

    // For specific place text searches (e.g. "match", "match point", "truffles"),
    // weaker metadata matches (Tier 9) must NOT surface places that don't match the query!
    if (
      parsedQuery.intent === "SEARCH_PLACE" &&
      analysis.tier === TextMatchTier.WEAKER_SEARCHABLE_TEXT &&
      !isGenericDiningSearch &&
      !isGenericSportSearch &&
      !isGenericActivitySearch
    ) {
      return {
        isRelevant: false,
        relevanceConfidence: 0,
        reason: `Place does not match search query in name or address ("${queryTerm}")`,
      };
    }

    // Prohibit non-consumer businesses (corporate offices, wholesale headquarters)
    const isExcludedOffice = [
      "corporate office",
      "headquarters",
      "pvt ltd",
      "private limited",
      "wholesale",
    ].some((k) => item.title.toLowerCase().includes(k));

    if (isExcludedOffice) {
      return {
        isRelevant: false,
        relevanceConfidence: 0,
        reason: "Excluded corporate office or wholesale entity",
      };
    }

    // Determine intrinsic category of the matching item
    let assignedCategory: "SPORTS" | "DINING" | "ACTIVITIES" | "MOVIES" | null = null;

    if (item.provider === "tmdb" || item.category === "MOVIES") {
      assignedCategory = "MOVIES";
    } else {
      if (targetCategory === "SPORTS" && isSports) {
        assignedCategory = "SPORTS";
      } else if (targetCategory === "DINING" && isDining) {
        assignedCategory = "DINING";
      } else if (targetCategory === "ACTIVITIES" && isActivity) {
        assignedCategory = "ACTIVITIES";
      } else {
        assignedCategory = classifyVenueCategory(venueLike) ||
          (isSports ? "SPORTS" : isDining ? "DINING" : isActivity ? "ACTIVITIES" : null);
      }

      if (!assignedCategory) {
        return {
          isRelevant: false,
          relevanceConfidence: 0,
          reason: "Place does not match any playable, dining, activity, or movie venue type",
        };
      }
    }

    // Validate against requested targetCategory if scoped
    if (targetCategory !== "ALL" && assignedCategory !== targetCategory) {
      return {
        isRelevant: false,
        relevanceConfidence: 0,
        reason: `Item matches text but belongs in ${assignedCategory}, not requested ${targetCategory}`,
      };
    }

    // Validate against requested subcategory if scoped
    if (parsedQuery.subcategory && parsedQuery.subcategory.toLowerCase() !== "all") {
      const targetSub = parsedQuery.subcategory.toLowerCase().replace(/s$/, ""); // e.g. "turfs" -> "turf"
      const itemSub = [item.subcategory, item.displayLabel, item.title].filter(Boolean).join(" ").toLowerCase();
      if (!itemSub.includes(targetSub)) {
        return {
          isRelevant: false,
          relevanceConfidence: 0,
          reason: `Item subcategory does not match requested subcategory "${parsedQuery.subcategory}"`,
        };
      }
    }

    return {
      isRelevant: true,
      assignedCategory,
      relevanceConfidence: analysis.tierScore / 10000,
      reason: `Tier ${analysis.tier} match (${assignedCategory})`,
    };
  }

  /**
   * Batch filter search result items, updating their category if refined.
   */
  filterBatch(items: SearchResultItem[], parsedQuery: ParsedQuery): SearchResultItem[] {
    const relevantItems: SearchResultItem[] = [];

    for (const item of items) {
      if ((item as any)._isDeleted) {
        continue;
      }
      const result = this.evaluate(item, parsedQuery);
      if (result.isRelevant) {
        if (result.assignedCategory) {
          item.category = result.assignedCategory;
          item.section_id = `places_${result.assignedCategory.toLowerCase()}`;
        }
        relevantItems.push(item);
      }
    }

    return relevantItems;
  }
}

export const planlessRelevanceEngine = new PlanlessRelevanceEngine();
