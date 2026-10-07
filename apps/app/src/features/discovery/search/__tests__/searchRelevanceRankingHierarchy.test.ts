import { describe, it, expect } from "vitest";
import { planlessRelevanceEngine } from "../engine/relevanceEngine";
import { intentAwareRankingEngine } from "../engine/rankingEngine";
import { parseUserQuery } from "../engine/queryUnderstanding";
import { SearchResultItem } from "../types/result";
import { analyzeTextMatchTier, TextMatchTier } from "../utils/stringMatching";
import { planlessSearchCache } from "../cache/searchCache";

function mockResultItem(partial: Partial<SearchResultItem>): SearchResultItem {
  return {
    id: partial.id || "test_id",
    public_id: partial.public_id || "test_id",
    section_id: partial.section_id || "places_sports",
    provider: partial.provider || "google",
    providerPlaceId: partial.providerPlaceId || "test_place_id",
    place_id: partial.place_id || "test_place_id",
    title: partial.title || "Sample Place",
    category: partial.category || "SPORTS",
    subcategory: partial.subcategory || "Turf",
    displayLabel: partial.displayLabel || "Sports Arena",
    description: partial.description || "",
    location: partial.location || "",
    place_address: partial.place_address || "",
    latitude: partial.latitude ?? 12.9716,
    longitude: partial.longitude ?? 77.5946,
    cover_image_url: partial.cover_image_url ?? "https://example.com/img.jpg",
    rating: partial.rating ?? 4.5,
    user_ratings_total: partial.user_ratings_total ?? 100,
    distance: partial.distance ?? "1.0 km",
    suggested_duration_minutes: 90,
    suggested_cost_amount: null,
    suggested_capacity: null,
    default_rsvp_offset_minutes: 60,
    display_order: 1,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    _distanceKm: partial._distanceKm ?? 1.0,
    _relevanceScore: 0,
    _isExactMatch: false,
    types: partial.types || ["sports_complex", "point_of_interest"],
    ...partial,
  };
}

describe("Search Relevance & Deterministic Ranking Hierarchy", () => {
  // ─── 1. CORE REGRESSION: "MATCH" (BEL Cricket Ground Exclusion) ───────────
  it("REGRESSION: query 'match' ranks Match day sports arena and Match Point Football Arena FIRST and EXCLUDES BEL Cricket Ground", () => {
    const query = "match";
    const parsed = parseUserQuery(query, "SPORTS");

    const candidates = [
      mockResultItem({
        id: "bel_1",
        title: "BEL Cricket Ground (KSCA ...)",
        category: "SPORTS",
        subcategory: "Cricket",
        _distanceKm: 4.4,
        distance: "4.4 km",
      }),
      mockResultItem({
        id: "match_point",
        title: "Match Point Football Arena",
        category: "SPORTS",
        subcategory: "Football",
        _distanceKm: 9.0,
        distance: "9.0 km",
      }),
      mockResultItem({
        id: "match_day",
        title: "Match day sports arena",
        category: "SPORTS",
        subcategory: "Sports Arena",
        _distanceKm: 13.6,
        distance: "13.6 km",
      }),
      mockResultItem({
        id: "bel_2",
        title: "BEL cricket ground (KSCA matches)",
        category: "SPORTS",
        subcategory: "Cricket",
        _distanceKm: 0.9,
        distance: "0.9 km",
      }),
    ];

    const filtered = planlessRelevanceEngine.filterBatch(candidates, parsed);

    // BEL cricket ground has NO match in primary name and must be EXCLUDED!
    expect(filtered.map((item) => item.id)).toEqual(["match_point", "match_day"]);

    const ranked = intentAwareRankingEngine.rank(filtered, parsed);
    expect(ranked.length).toBe(2);
    // Both are Tier 2. Alphabetical ordering ("d" before "p") ranks Match day before Match Point!
    expect(ranked[0].id).toBe("match_day");
    expect(ranked[1].id).toBe("match_point");
  });

  // ─── 2. ALPHABETICAL ORDERING BEFORE DISTANCE WITHIN SAME TIER ────────────
  it("Alphabetical ordering: within the same text-relevance tier, sorts alphabetically before distance", () => {
    const query = "match";
    const parsed = parseUserQuery(query);

    const matchday = mockResultItem({
      id: "m_day",
      title: "Matchday",
      _distanceKm: 25.0, // Furthest
    });

    const matchPointFootball = mockResultItem({
      id: "mp_football",
      title: "Match Point Football Arena",
      _distanceKm: 5.0,
    });

    const matchPointSports = mockResultItem({
      id: "mp_sports",
      title: "Match Point Sports Arena",
      _distanceKm: 1.0, // Closest
    });

    const filtered = planlessRelevanceEngine.filterBatch([matchPointSports, matchPointFootball, matchday], parsed);
    expect(filtered.length).toBe(3);

    const ranked = intentAwareRankingEngine.rank(filtered, parsed);
    // Alphabetical order:
    // 1. "Matchday" ("d") -> ranked 1 despite 25 km
    // 2. "Match Point Football Arena" ("f") -> ranked 2
    // 3. "Match Point Sports Arena" ("s") -> ranked 3 despite 1 km
    expect(ranked[0].id).toBe("m_day");
    expect(ranked[1].id).toBe("mp_football");
    expect(ranked[2].id).toBe("mp_sports");
  });

  // ─── 3. EXACT FULL NAME MATCH (Tier 1) ────────────────────────────────────
  it("Tier 1: exact full name match outranks start-of-name phrase match despite further distance", () => {
    const query = "match point";
    const parsed = parseUserQuery(query);

    const exactMatch = mockResultItem({
      id: "exact_match",
      title: "Match Point",
      _distanceKm: 15.0,
      distance: "15.0 km",
    });

    const phraseMatch = mockResultItem({
      id: "phrase_match",
      title: "Match Point Sports Arena",
      _distanceKm: 2.0,
      distance: "2.0 km",
    });

    const filtered = planlessRelevanceEngine.filterBatch([exactMatch, phraseMatch], parsed);
    expect(filtered.length).toBe(2);

    const ranked = intentAwareRankingEngine.rank(filtered, parsed);
    // Exact name match (Tier 1) MUST rank first over phrase match at start (Tier 2), even though it is 15 km away
    expect(ranked[0].id).toBe("exact_match");
    expect(ranked[0]._textMatchTier).toBe(TextMatchTier.EXACT_NAME);
    expect(ranked[1].id).toBe("phrase_match");
    expect(ranked[1]._textMatchTier).toBe(TextMatchTier.PHRASE_AT_START);
  });

  // ─── 4. QUERY PHRASE AT START OF NAME (Tier 2) vs ANYWHERE (Tier 3) ───────
  it("Tier 2 vs Tier 3: exact query phrase at START of name ranks above exact phrase buried inside name", () => {
    const query = "match point";
    const parsed = parseUserQuery(query);

    const atStart = mockResultItem({
      id: "at_start",
      title: "Match Point Sports Arena",
      _distanceKm: 12.0,
      distance: "12.0 km",
    });

    const inMiddle = mockResultItem({
      id: "in_middle",
      title: "The Match Point Arena",
      _distanceKm: 2.0,
      distance: "2.0 km",
    });

    const atEnd = mockResultItem({
      id: "at_end",
      title: "Sports Arena — Match Point",
      _distanceKm: 1.0,
      distance: "1.0 km",
    });

    const filtered = planlessRelevanceEngine.filterBatch([atEnd, inMiddle, atStart], parsed);
    expect(filtered.length).toBe(3);

    const ranked = intentAwareRankingEngine.rank(filtered, parsed);
    // 1. Match Point Sports Arena (Tier 2: phrase at start)
    // 2. The Match Point Arena (Tier 3: pos 4)
    // 3. Sports Arena — Match Point (Tier 3: pos 13)
    expect(ranked[0].id).toBe("at_start");
    expect(ranked[1].id).toBe("in_middle");
    expect(ranked[2].id).toBe("at_end");
  });

  // ─── 5. MATCH POSITION MATTERS WITHIN SAME TIER ───────────────────────────
  it("Match position: earlier occurrences in place name rank higher within the same tier", () => {
    const query = "match";
    const parsed = parseUserQuery(query);

    const candidates = [
      mockResultItem({
        id: "pos_late",
        title: "Some Arena — near Match Point",
        _distanceKm: 1.0, // Closer
      }),
      mockResultItem({
        id: "pos_mid",
        title: "Sports Arena — Match Point",
        _distanceKm: 2.0,
      }),
      mockResultItem({
        id: "pos_early",
        title: "The Match Point Arena",
        _distanceKm: 5.0,
      }),
      mockResultItem({
        id: "pos_start",
        title: "Match Point Sports Arena",
        _distanceKm: 10.0, // Furthest
      }),
    ];

    const filtered = planlessRelevanceEngine.filterBatch(candidates, parsed);
    const ranked = intentAwareRankingEngine.rank(filtered, parsed);

    // Expected order:
    // 1. Match Point Sports Arena (Tier 2, start of name, pos 0)
    // 2. The Match Point Arena (Tier 3, pos 4)
    // 3. Sports Arena — Match Point (Tier 3, pos 13)
    // 4. Some Arena — near Match Point (Tier 3, pos 16)
    expect(ranked.map((r) => r.id)).toEqual(["pos_start", "pos_early", "pos_mid", "pos_late"]);
  });

  // ─── 6. WORD ORDER MATTERS (Query words in order vs out of order) ─────────
  it("Word order matters: in-order matches strongly outrank out-of-order matches", () => {
    const query = "match point";
    const parsed = parseUserQuery(query);

    const inOrderVenue = mockResultItem({
      id: "in_order",
      title: "Match Point Sports Arena",
      _distanceKm: 10.0,
    });

    const outOfOrderVenue = mockResultItem({
      id: "out_of_order",
      title: "Point Sports Arena Match",
      _distanceKm: 1.0, // Much closer
    });

    const filtered = planlessRelevanceEngine.filterBatch([outOfOrderVenue, inOrderVenue], parsed);
    expect(filtered.length).toBe(2);

    const ranked = intentAwareRankingEngine.rank(filtered, parsed);
    // In-order phrase at start (Tier 2) MUST rank above out-of-order tokens (Tier 6)
    expect(ranked[0].id).toBe("in_order");
    expect(ranked[0]._textMatchTier).toBe(TextMatchTier.PHRASE_AT_START);
    expect(ranked[1].id).toBe("out_of_order");
    expect(ranked[1]._textMatchTier).toBe(TextMatchTier.QUERY_WORDS_INDIVIDUALLY);
  });

  // ─── 7. ALL QUERY WORDS IN ORDER AT START (Tier 4) vs ANYWHERE (Tier 5) ───
  it("Tier 4 vs Tier 5: all query words in order at start of name outrank in-order words starting later", () => {
    const query = "match arena";
    const parsed = parseUserQuery(query);

    const orderedAtStart = mockResultItem({
      id: "order_start",
      title: "Match Point Football Arena", // "match" at token 0, "arena" at token 3
      _distanceKm: 8.0,
    });

    const orderedAnywhere = mockResultItem({
      id: "order_anywhere",
      title: "The Match Point Football Arena", // "match" at token 1, "arena" at token 4
      _distanceKm: 2.0,
    });

    const filtered = planlessRelevanceEngine.filterBatch([orderedAnywhere, orderedAtStart], parsed);
    expect(filtered.length).toBe(2);

    const ranked = intentAwareRankingEngine.rank(filtered, parsed);
    expect(ranked[0].id).toBe("order_start");
    expect(ranked[0]._textMatchTier).toBe(TextMatchTier.ORDERED_TOKENS_AT_START);
    expect(ranked[1].id).toBe("order_anywhere");
    expect(ranked[1]._textMatchTier).toBe(TextMatchTier.ORDERED_TOKENS_ANYWHERE);
  });

  // ─── 8. QUERY WORDS INDIVIDUALLY (Tier 6): Partial Token Relevance ────────
  it("Tier 6: both query words present ranks above first query word only, which ranks above second word only", () => {
    const query = "match point";
    const parsed = parseUserQuery(query);

    const bothWordsUnordered = mockResultItem({
      id: "both_words",
      title: "Point Sports Arena Match", // Both words present (out of order)
    });

    const firstWordOnly = mockResultItem({
      id: "first_word",
      title: "Match Arena", // Only "match" present
    });

    const secondWordOnly = mockResultItem({
      id: "second_word",
      title: "Point Arena", // Only "point" present
    });

    const filtered = planlessRelevanceEngine.filterBatch([secondWordOnly, firstWordOnly, bothWordsUnordered], parsed);
    expect(filtered.length).toBe(3);

    const ranked = intentAwareRankingEngine.rank(filtered, parsed);
    // Both words > First word only ("match") > Second word only ("point")
    expect(ranked[0].id).toBe("both_words");
    expect(ranked[1].id).toBe("first_word");
    expect(ranked[2].id).toBe("second_word");
  });

  // ─── 9. PARTIAL / PREFIX SEARCH (Tier 7) ──────────────────────────────────
  it("Tier 7: partial/prefix search prefers prefix at start of name over prefix later in name", () => {
    const query = "mat";
    const parsed = parseUserQuery(query);

    const prefixAtStart = mockResultItem({
      id: "pref_start",
      title: "Match Point Sports Arena",
      _distanceKm: 15.0,
    });

    const prefixLater = mockResultItem({
      id: "pref_later",
      title: "Super Turf Matrix Arena",
      _distanceKm: 2.0,
    });

    const filtered = planlessRelevanceEngine.filterBatch([prefixLater, prefixAtStart], parsed);
    expect(filtered.length).toBe(2);

    const ranked = intentAwareRankingEngine.rank(filtered, parsed);
    expect(ranked[0].id).toBe("pref_start");
    expect(ranked[1].id).toBe("pref_later");
  });

  // ─── 10. NON-MATCHING RESULT EXCLUSION ────────────────────────────────────
  it("strictly excludes unrelated venues that have no textual match with user query", () => {
    const parsed = parseUserQuery("match point");

    const candidates = [
      mockResultItem({
        id: "match_1",
        title: "Match Point Sports Arena",
        category: "SPORTS",
      }),
      mockResultItem({
        id: "match_2",
        title: "Match Point Football Arena",
        category: "SPORTS",
      }),
      mockResultItem({
        id: "unrelated_1",
        title: "Bengaluru Turf Inc.",
        category: "SPORTS",
        subcategory: "Turf",
      }),
      mockResultItem({
        id: "unrelated_2",
        title: "ToughX Sports Arena",
        category: "SPORTS",
        subcategory: "Football",
      }),
      mockResultItem({
        id: "unrelated_3",
        title: "Finessedge TURF",
        category: "SPORTS",
        subcategory: "Turf",
      }),
    ];

    const filtered = planlessRelevanceEngine.filterBatch(candidates, parsed);
    expect(filtered.length).toBe(2);
    expect(filtered.map((item) => item.id)).toEqual(["match_1", "match_2"]);
  });

  // ─── 11. DISTANCE AS FINAL TIE-BREAKER FOR IDENTICAL NAMES ────────────────
  it("Distance tie-breaking: when place names are identical, distance breaks the tie", () => {
    const query = "truffles";
    const parsed = parseUserQuery(query, "DINING");

    const trufflesNear = mockResultItem({
      id: "truffles_near",
      title: "Truffles",
      category: "DINING",
      subcategory: "Burger",
      types: ["restaurant", "food"],
      _distanceKm: 2.1,
      distance: "2.1 km",
    });

    const trufflesFar = mockResultItem({
      id: "truffles_far",
      title: "Truffles",
      category: "DINING",
      subcategory: "Burger",
      types: ["restaurant", "food"],
      _distanceKm: 14.5,
      distance: "14.5 km",
    });

    const filtered = planlessRelevanceEngine.filterBatch([trufflesFar, trufflesNear], parsed);
    expect(filtered.length).toBe(2);

    const ranked = intentAwareRankingEngine.rank(filtered, parsed);
    // Identical name and tier -> closer branch ranks first!
    expect(ranked[0].id).toBe("truffles_near");
    expect(ranked[1].id).toBe("truffles_far");
  });

  // ─── 12. AREA / ADDRESS SEARCH BOOST ──────────────────────────────────────
  it("boosts venue matching the requested area higher than a same-tier venue in another area", () => {
    const query = "match point indiranagar";
    const parsed = parseUserQuery(query);

    const indiranagarBranch = mockResultItem({
      id: "mp_indiranagar",
      title: "Match Point Sports Arena",
      place_address: "100 Feet Road, Indiranagar, Bengaluru",
      _distanceKm: 21.9,
      distance: "21.9 km",
    });

    const whitefieldBranch = mockResultItem({
      id: "mp_whitefield",
      title: "Match Point Football Arena",
      place_address: "ITPL Main Rd, Whitefield, Bengaluru",
      _distanceKm: 9.0,
      distance: "9.0 km",
    });

    const filtered = planlessRelevanceEngine.filterBatch([whitefieldBranch, indiranagarBranch], parsed);
    expect(filtered.length).toBe(2);

    const ranked = intentAwareRankingEngine.rank(filtered, parsed);
    // Indiranagar branch MUST rank first because it matches the requested area, despite 21.9 km vs 9.0 km
    expect(ranked[0].id).toBe("mp_indiranagar");
    expect(ranked[1].id).toBe("mp_whitefield");
  });

  // ─── 13. MOVIES: TITLE RELEVANCE BEFORE RELEASE RECENCY ───────────────────
  it("ranks movies: exact title match beats phrase match despite release date; same title sorts by newest release", () => {
    const query = "match";
    const parsed = parseUserQuery(query, "MOVIES");

    const movieExactOld = mockResultItem({
      id: "movie_exact_2014",
      title: "Match",
      category: "MOVIES",
      provider: "tmdb",
      release_date: "2014-04-18",
    });

    const movieExactNew = mockResultItem({
      id: "movie_exact_2025",
      title: "Match",
      category: "MOVIES",
      provider: "tmdb",
      release_date: "2025-10-01",
    });

    const moviePhraseRecent = mockResultItem({
      id: "movie_phrase_2024",
      title: "Deadly Match",
      category: "MOVIES",
      provider: "tmdb",
      release_date: "2024-01-15",
    });

    const filtered = planlessRelevanceEngine.filterBatch([moviePhraseRecent, movieExactOld, movieExactNew], parsed);
    expect(filtered.length).toBe(3);

    const ranked = intentAwareRankingEngine.rank(filtered, parsed);
    // 1. Match (2025) (Tier 1: exact match, newest)
    // 2. Match (2014) (Tier 1: exact match, older)
    // 3. Deadly Match (2024) (Tier 3: phrase anywhere, recency does NOT override exact match)
    expect(ranked[0].id).toBe("movie_exact_2025");
    expect(ranked[1].id).toBe("movie_exact_2014");
    expect(ranked[2].id).toBe("movie_phrase_2024");
  });

  // ─── 14. SPECIFIC QUERIES: 'MATCH DAY', 'TRUFFLES', 'FOOTBALL TURF' ───────
  it("handles 'match day', 'truffles', and 'football turf' queries accurately", () => {
    // 1. "match day" -> matches Match day sports arena
    const parsedMatchDay = parseUserQuery("match day", "SPORTS");
    const matchDayVenue = mockResultItem({
      id: "md_1",
      title: "Match day sports arena",
      category: "SPORTS",
    });
    const evalMatchDay = planlessRelevanceEngine.evaluate(matchDayVenue, parsedMatchDay);
    expect(evalMatchDay.isRelevant).toBe(true);
    expect(matchDayVenue._textMatchTier).toBeLessThanOrEqual(TextMatchTier.PHRASE_AT_START);

    // 2. "truffles" -> matches Truffles
    const parsedTruffles = parseUserQuery("truffles", "DINING");
    const trufflesVenue = mockResultItem({
      id: "truf_1",
      title: "Truffles",
      category: "DINING",
      subcategory: "Burger",
      types: ["restaurant", "food"],
    });
    const evalTruffles = planlessRelevanceEngine.evaluate(trufflesVenue, parsedTruffles);
    expect(evalTruffles.isRelevant).toBe(true);
    expect(trufflesVenue._textMatchTier).toBe(TextMatchTier.EXACT_NAME);

    // 3. "football turf" -> generic sport query matches playable football facility
    const parsedSport = parseUserQuery("football turf", "SPORTS");
    expect(parsedSport.intent).toBe("SEARCH_SPORT");
    const turfVenue = mockResultItem({
      id: "turf_1",
      title: "Tiger Turf Football Arena",
      category: "SPORTS",
      subcategory: "Football Turf",
    });
    const evalSport = planlessRelevanceEngine.evaluate(turfVenue, parsedSport);
    expect(evalSport.isRelevant).toBe(true);
  });

  // ─── 15. CACHE KEY ISOLATION BETWEEN DIFFERENT QUERIES ────────────────────
  it("ensures search cache keys for 'match', 'match point', and 'match day' never collide", () => {
    const keyMatch = planlessSearchCache.buildKey({
      provider: "GOOGLE_PLACES",
      category: "SPORTS",
      normalizedQuery: "match",
    });

    const keyMatchPoint = planlessSearchCache.buildKey({
      provider: "GOOGLE_PLACES",
      category: "SPORTS",
      normalizedQuery: "match point",
    });

    const keyMatchDay = planlessSearchCache.buildKey({
      provider: "GOOGLE_PLACES",
      category: "SPORTS",
      normalizedQuery: "match day",
    });

    expect(keyMatch).not.toBe(keyMatchPoint);
    expect(keyMatch).not.toBe(keyMatchDay);
    expect(keyMatchPoint).not.toBe(keyMatchDay);
  });
});
