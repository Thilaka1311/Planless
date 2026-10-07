import { ParsedQuery } from "../types/intent";
import { SearchResultItem } from "../types/result";
import {
  analyzeTextMatchTier,
  TextMatchTier,
  normalizeSearchText,
} from "../utils/stringMatching";
import { DINING_CATEGORY_KEYWORDS } from "./queryUnderstanding";

export interface RankingSignals {
  textTier: TextMatchTier;
  matchPosition: number;
  tokenOrderScore: number;
  addressMatchesLocality: boolean;
  distanceKm: number;
  releaseDateTimestamp: number;
  qualityScore: number;
  finalScore: number;
}

export class IntentAwareRankingEngine {
  /**
   * Computes the individual ranking signals for a single candidate.
   */
  computeSignals(item: SearchResultItem, parsedQuery: ParsedQuery): RankingSignals {
    const rawQueryTrimmed = (parsedQuery.rawQuery || "").trim();
    const isTextSearch = rawQueryTrimmed.length > 0 && parsedQuery.intent !== "BROWSE_CATEGORY";

    let textTier: TextMatchTier = (item._textMatchTier as TextMatchTier) ?? TextMatchTier.NO_MATCH;
    let addressMatchesLocality: boolean = item._addressMatchesLocality ?? false;
    let matchPosition: number = item._matchPosition ?? 9999;
    let tokenOrderScore: number = item._tokenOrderScore ?? 0;

    // If text match tier was not pre-computed by relevance engine, compute it now
    if (isTextSearch && (textTier === undefined || textTier === TextMatchTier.NO_MATCH)) {
      let queryTerm = parsedQuery.searchTerm || rawQueryTrimmed;
      let locationTerm = parsedQuery.locationQuery;

      if (parsedQuery.intent === "SEARCH_COMBINED" && parsedQuery.cleanSearchTerm) {
        queryTerm = parsedQuery.cleanSearchTerm;
        locationTerm = parsedQuery.locationQualifier?.raw || parsedQuery.locationQuery;
      } else if (parsedQuery.intent === "SEARCH_LOCATION" && parsedQuery.cleanSearchTerm) {
        queryTerm = parsedQuery.cleanSearchTerm;
        locationTerm = parsedQuery.cleanSearchTerm;
      }

      const analysis = analyzeTextMatchTier(queryTerm, {
        title: item.title,
        name: item.title,
        place_address: item.place_address,
        location: item.location,
        description: item.description,
        subcategory: item.subcategory,
        displayLabel: item.displayLabel,
      }, locationTerm);

      textTier = analysis.tier;
      addressMatchesLocality = analysis.addressMatchesLocality;
      matchPosition = analysis.matchPosition;
      tokenOrderScore = analysis.tokenOrderScore ?? 0;
      item._textMatchTier = textTier;
      item._addressMatchesLocality = addressMatchesLocality;
      item._isExactMatch = analysis.isExactName;
      item._matchPosition = matchPosition;
      item._tokenOrderScore = tokenOrderScore;
    }

    // Quality score (0 to 200)
    let qualityScore = 0;
    if (typeof item.rating === "number" && item.rating > 0) {
      qualityScore += Math.min(100, item.rating * 20);
    }
    if (typeof item.user_ratings_total === "number" && item.user_ratings_total > 0) {
      qualityScore += Math.min(50, Math.floor(Math.log10(item.user_ratings_total + 1) * 15));
    }
    if (item.cover_image_url) {
      qualityScore += 20;
    }

    // Release date recency for movies
    let releaseDateTimestamp = 0;
    if (item.release_date) {
      const parsedTime = Date.parse(item.release_date);
      if (!isNaN(parsedTime)) {
        releaseDateTimestamp = parsedTime;
      }
    }

    const distanceKm =
      typeof item._distanceKm === "number" && !isNaN(item._distanceKm) && item._distanceKm >= 0
        ? item._distanceKm
        : 9999;

    // Deterministic composite score (used for debugging & telemetry)
    // Tiers are spaced by 10,000 points so distance/quality can NEVER bridge a tier gap
    const tierValue = textTier === TextMatchTier.NO_MATCH ? 0 : 10 - textTier; // Tier 1 -> 9, Tier 9 -> 1, NO_MATCH -> 0
    const tierBase = isTextSearch ? tierValue * 10000 : 50000;
    const locationBonus = addressMatchesLocality ? 5000 : 0;
    const distanceScore = Math.max(0, 3000 - Math.min(3000, distanceKm * 60));
    const movieRecencyScore = Math.min(3000, Math.max(0, Math.floor((releaseDateTimestamp - 946684800000) / (86400000 * 30)))); // ~1 pt per month since 2000

    const finalScore =
      tierBase +
      locationBonus +
      (item.category === "MOVIES" ? movieRecencyScore : distanceScore) +
      qualityScore;

    return {
      textTier,
      matchPosition,
      tokenOrderScore,
      addressMatchesLocality,
      distanceKm,
      releaseDateTimestamp,
      qualityScore,
      finalScore,
    };
  }

  /**
   * Scores and sorts candidate items strictly following the Search Ranking Hierarchy:
   * 1. Text Relevance Tier (Tier 1 > Tier 2 > Tier 3 > Tier 4 > Tier 5 > Tier 6 > Tier 7 > Tier 8 > Tier 9)
   * 2. Within same tier: Earlier match position in place name (lower matchPosition)
   * 3. Within same tier: Token order score
   * 4. For Location/Combined Queries: Name Match + Address Locality Match
   * 5. For Places: Distance (closer ranks first among equal text relevance tier and position)
   * 6. For Movies: Release Date (latest release date ranks first; distance is NOT used)
   * 7. Tie breaker: Quality / rating score
   */
  rank(items: SearchResultItem[], parsedQuery: ParsedQuery): SearchResultItem[] {
    const rawQueryTrimmed = (parsedQuery.rawQuery || "").trim();
    const isTextSearch = rawQueryTrimmed.length > 0 && parsedQuery.intent !== "BROWSE_CATEGORY";
    const hasLocationQuery = Boolean(
      parsedQuery.locationQuery ||
      parsedQuery.locationQualifier ||
      parsedQuery.intent === "SEARCH_COMBINED"
    );

    const scoredItems = items.map((item) => {
      const signals = this.computeSignals(item, parsedQuery);
      item._relevanceScore = signals.finalScore;
      item._matchedIntent = parsedQuery.intent;
      return { item, signals };
    });

    const isRetailOrSupermarket = (item: SearchResultItem): boolean => {
      const text = [item.title, item.displayLabel, item.subcategory, ...(item.types || [])].join(" ").toLowerCase();
      return [
        "sporting goods", "sports store", "sports shop", "equipment store",
        "supermarket", "grocery", "convenience store", "provisions", "corporate office", "consulting office",
      ].some((k) => text.includes(k));
    };

    const cleanNorm = normalizeSearchText(parsedQuery.cleanSearchTerm || parsedQuery.rawQuery || "");
    const isCategorySearch =
      parsedQuery.intent === "SEARCH_SPORT" ||
      parsedQuery.intent === "SEARCH_DINING" ||
      parsedQuery.intent === "SEARCH_ACTIVITY" ||
      (parsedQuery.intent === "SEARCH_COMBINED" &&
        (parsedQuery.cleanSearchTermIntent === "SEARCH_SPORT" ||
          parsedQuery.cleanSearchTermIntent === "SEARCH_DINING" ||
          parsedQuery.cleanSearchTermIntent === "SEARCH_ACTIVITY" ||
          DINING_CATEGORY_KEYWORDS.has(cleanNorm)));

    scoredItems.sort((a, b) => {
      // ─── 0. AUTHENTICITY PRIORITY ───────────────────────────────────────────
      // Authentic consumer places (restaurants, turfs, activity centers) always beat retail shops / supermarkets
      const aRetail = isRetailOrSupermarket(a.item);
      const bRetail = isRetailOrSupermarket(b.item);
      if (aRetail !== bRetail) {
        return aRetail ? 1 : -1;
      }

      // ─── 1. PRIMARY: TEXT RELEVANCE TIER (for specific text searches) ───────
      // For specific place searches ("match point", "truffles"), text tier is strictly primary
      if (isTextSearch && !isCategorySearch) {
        const tierRank = (t: TextMatchTier): number => (t === TextMatchTier.NO_MATCH ? 999 : t);
        const rankA = tierRank(a.signals.textTier);
        const rankB = tierRank(b.signals.textTier);

        if (rankA !== rankB) {
          // Lower tier number = higher relevance (Tier 1 beats Tier 2, etc.)
          return rankA - rankB;
        }

        // ─── 1a. SUB-TIER: MATCH POSITION IN PLACE NAME ────────────────────────
        // Within the same tier (e.g. PHRASE_ANYWHERE, PREFIX), matches earlier in name rank higher!
        // E.g. "Match Point Sports Arena" (pos 0) > "The Match Point Arena" (pos 4) > "Sports Arena — Match Point" (pos 15)
        const posA = a.signals.matchPosition ?? 0;
        const posB = b.signals.matchPosition ?? 0;
        if (Math.abs(posA - posB) > 0) {
          return posA - posB;
        }

        // ─── 1b. SUB-TIER: TOKEN ORDER SCORE (for Tier 6 / word matching) ──────
        const orderScoreA = a.signals.tokenOrderScore ?? 0;
        const orderScoreB = b.signals.tokenOrderScore ?? 0;
        if (Math.abs(orderScoreA - orderScoreB) > 0.05) {
          return orderScoreB - orderScoreA;
        }

        // ─── 1c. LOCATION QUERY BOOST (WITHIN SAME TEXT RELEVANCE) ─────────────
        if (hasLocationQuery || a.signals.addressMatchesLocality || b.signals.addressMatchesLocality) {
          if (a.signals.addressMatchesLocality !== b.signals.addressMatchesLocality) {
            return a.signals.addressMatchesLocality ? -1 : 1;
          }
        }
      } else if (hasLocationQuery) {
        // Location query boost for category searches ("football turf in Koramangala", "restaurants in HSR")
        if (a.signals.addressMatchesLocality !== b.signals.addressMatchesLocality) {
          return a.signals.addressMatchesLocality ? -1 : 1;
        }
      }

      // ─── 2. SECONDARY: MOVIE RECENCY vs VENUE DISTANCE ───────────────────────
      const aIsMovie = a.item.provider === "tmdb" || a.item.category === "MOVIES";
      const bIsMovie = b.item.provider === "tmdb" || b.item.category === "MOVIES";

      if (aIsMovie && bIsMovie) {
        // Movies: release date recency (newer first). Distance is NEVER used.
        if (a.signals.releaseDateTimestamp !== b.signals.releaseDateTimestamp) {
          return b.signals.releaseDateTimestamp - a.signals.releaseDateTimestamp;
        }
      } else if (!aIsMovie && !bIsMovie) {
        // ─── 3. PLACES: ALPHABETICAL ORDER BY PLACE NAME (BEFORE DISTANCE) ────
        // For place-name text searches, after determining that results have the same text-relevance tier,
        // sort them alphabetically by the normalized place name.
        // For generic category searches ("turf", "food", "restaurants"), proximity/distance is primary,
        // unless both items have a strong direct name match in the same tier.
        const hasDirectNameMatch =
          a.signals.textTier <= TextMatchTier.PREFIX_PARTIAL_IN_NAME &&
          b.signals.textTier <= TextMatchTier.PREFIX_PARTIAL_IN_NAME;

        const shouldSortAlphabetically =
          isTextSearch &&
          (!isCategorySearch || hasDirectNameMatch) &&
          a.signals.textTier === b.signals.textTier;

        if (shouldSortAlphabetically) {
          const alphaA = normalizeSearchText(a.item.title).replace(/[^\w]/g, "");
          const alphaB = normalizeSearchText(b.item.title).replace(/[^\w]/g, "");
          const alphaDiff = alphaA.localeCompare(alphaB);
          if (alphaDiff !== 0) {
            return alphaDiff;
          }
        }

        // ─── 4. PLACES: DISTANCE AS FINAL TIE-BREAKER (or primary for category discovery) ─────
        if (Math.abs(a.signals.distanceKm - b.signals.distanceKm) > 0.05) {
          return a.signals.distanceKm - b.signals.distanceKm;
        }
      }

      // ─── 3. TIE-BREAKER: QUALITY / RATING ───────────────────────────────────
      if (b.signals.qualityScore !== a.signals.qualityScore) {
        return b.signals.qualityScore - a.signals.qualityScore;
      }

      // ─── 4. FINAL TIE-BREAKER: FINAL SCORE ──────────────────────────────────
      return b.signals.finalScore - a.signals.finalScore;
    });

    return scoredItems.map((s, index) => {
      s.item.display_order = index + 1;
      return s.item;
    });
  }
}

export const intentAwareRankingEngine = new IntentAwareRankingEngine();
