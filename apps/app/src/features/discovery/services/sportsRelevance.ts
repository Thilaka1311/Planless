import { DiscoveryItem } from "../../../core/types/discovery";
import { VenueMetadataLike } from "./venueRelevance";

export function extractSportsList(sub: string[] | string | null | undefined): string[] {
  if (!sub) return [];
  if (Array.isArray(sub)) {
    return sub.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof sub === "string") {
    const trimmed = sub.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((s) => String(s).trim()).filter(Boolean);
        }
      } catch {}
    }
    if (trimmed.includes("|")) {
      return trimmed.split("|").map((s) => s.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  return [];
}

export type SportCategoryId =
  | "all"
  | "football"
  | "badminton"
  | "pickleball"
  | "tennis"
  | "basketball"
  | "cricket"
  | "table-tennis"
  | "other";

export interface SportSearchConfig {
  id: SportCategoryId;
  label: string;
  searchQueries: string[];
  relevantGoogleTypes: string[];
  strongPositiveKeywords: string[];
  unrelatedSportKeywords: string[];
}

export const SPORTS_CONFIGS: Record<SportCategoryId, SportSearchConfig> = {
  football: {
    id: "football",
    label: "Football",
    searchQueries: [
      "football turf",
      "turf",
      "sports turf",
      "football ground",
      "football field",
      "football court",
      "football arena",
      "5 a side football",
      "5 aside football",
      "7 a side football",
      "7 aside football",
      "futsal",
      "football sports complex",
      "football club",
      "football academy",
    ],
    relevantGoogleTypes: [
      "athletic_field",
      "sports_activity_location",
      "sports_club",
      "sports_complex",
      "stadium",
    ],
    strongPositiveKeywords: [
      "football",
      "soccer",
      "futsal",
      "turf",
      "football turf",
      "football ground",
      "football field",
      "football arena",
      "5-a-side",
      "5 aside",
      "7-a-side",
      "7 aside",
      "box football",
    ],
    unrelatedSportKeywords: [
      "badminton",
      "pickleball",
      "tennis",
      "cricket",
      "basketball",
      "table tennis",
      "ping pong",
      "squash",
      "swimming pool",
      "golf",
    ],
  },
  badminton: {
    id: "badminton",
    label: "Badminton",
    searchQueries: [
      "badminton court",
      "badminton courts",
      "badminton centre",
      "badminton center",
      "badminton club",
      "badminton academy",
      "badminton sports complex",
      "badminton arena",
    ],
    relevantGoogleTypes: [
      "sports_activity_location",
      "sports_club",
      "sports_complex",
      "sports_coaching",
      "sports_school",
    ],
    strongPositiveKeywords: [
      "badminton",
      "shuttle",
      "badminton court",
      "badminton courts",
      "badminton club",
      "badminton academy",
      "badminton centre",
      "badminton center",
    ],
    unrelatedSportKeywords: [
      "football",
      "soccer",
      "futsal",
      "cricket",
      "basketball",
      "pickleball",
      "table tennis",
      "golf",
    ],
  },
  pickleball: {
    id: "pickleball",
    label: "Pickleball",
    searchQueries: [
      "pickleball court",
      "pickleball courts",
      "pickleball club",
      "pickleball academy",
      "pickleball centre",
      "pickleball center",
      "pickleball sports complex",
    ],
    relevantGoogleTypes: [
      "sports_activity_location",
      "sports_club",
      "sports_complex",
      "sports_coaching",
      "sports_school",
      "tennis_court",
    ],
    strongPositiveKeywords: [
      "pickleball",
      "pickle ball",
      "dink",
      "pickleball court",
      "pickleball club",
      "pickleball academy",
    ],
    unrelatedSportKeywords: [
      "football",
      "soccer",
      "futsal",
      "cricket",
      "basketball",
      "golf",
    ],
  },
  tennis: {
    id: "tennis",
    label: "Tennis",
    searchQueries: [
      "tennis court",
      "tennis courts",
      "tennis club",
      "tennis academy",
      "tennis centre",
      "tennis center",
      "tennis sports complex",
    ],
    relevantGoogleTypes: [
      "tennis_court",
      "sports_activity_location",
      "sports_club",
      "sports_complex",
      "sports_coaching",
      "sports_school",
    ],
    strongPositiveKeywords: [
      "tennis",
      "tennis court",
      "tennis courts",
      "tennis club",
      "tennis academy",
    ],
    unrelatedSportKeywords: [
      "football",
      "soccer",
      "futsal",
      "cricket",
      "basketball",
      "table tennis",
      "ping pong",
      "golf",
    ],
  },
  basketball: {
    id: "basketball",
    label: "Basketball",
    searchQueries: [
      "basketball court",
      "basketball courts",
      "basketball club",
      "basketball academy",
      "basketball arena",
      "basketball sports complex",
    ],
    relevantGoogleTypes: [
      "sports_activity_location",
      "sports_club",
      "sports_complex",
      "athletic_field",
      "stadium",
    ],
    strongPositiveKeywords: [
      "basketball",
      "hoop",
      "basketball court",
      "basketball courts",
      "basketball club",
      "basketball academy",
    ],
    unrelatedSportKeywords: [
      "football",
      "soccer",
      "futsal",
      "cricket",
      "badminton",
      "pickleball",
      "golf",
    ],
  },
  cricket: {
    id: "cricket",
    label: "Cricket",
    searchQueries: [
      "cricket ground",
      "cricket field",
      "cricket stadium",
      "cricket club",
      "cricket academy",
      "cricket nets",
      "cricket practice ground",
      "cricket sports complex",
    ],
    relevantGoogleTypes: [
      "athletic_field",
      "sports_activity_location",
      "sports_club",
      "sports_complex",
      "stadium",
    ],
    strongPositiveKeywords: [
      "cricket",
      "cricket ground",
      "cricket field",
      "cricket stadium",
      "cricket club",
      "cricket academy",
      "cricket nets",
      "box cricket",
      "pitch",
    ],
    unrelatedSportKeywords: [
      "football",
      "soccer",
      "futsal",
      "badminton",
      "pickleball",
      "basketball",
      "golf",
    ],
  },
  "table-tennis": {
    id: "table-tennis",
    label: "Table Tennis",
    searchQueries: [
      "table tennis",
      "table tennis club",
      "table tennis academy",
      "table tennis centre",
      "table tennis center",
      "table tennis hall",
    ],
    relevantGoogleTypes: [
      "sports_activity_location",
      "sports_club",
      "sports_complex",
      "sports_coaching",
      "sports_school",
    ],
    strongPositiveKeywords: [
      "table tennis",
      "ping pong",
      "table tennis club",
      "table tennis academy",
      "tt club",
      "tt academy",
    ],
    unrelatedSportKeywords: [
      "football",
      "soccer",
      "cricket",
      "basketball",
      "golf",
    ],
  },
  other: {
    id: "other",
    label: "Other Sports",
    searchQueries: [
      "sports complex",
      "swimming pool",
      "squash court",
      "sports club facility",
      "skate park",
      "sports arena",
    ],
    relevantGoogleTypes: [
      "sports_complex",
      "swimming_pool",
      "sports_club",
      "stadium",
      "athletic_field",
      "sports_activity_location",
    ],
    strongPositiveKeywords: [
      "swim",
      "swimming pool",
      "aquatic",
      "squash",
      "golf",
      "volleyball",
      "skate",
      "sports complex",
      "sports club",
      "sports arena",
      "stadium",
      "athletic",
    ],
    unrelatedSportKeywords: [],
  },
  all: {
    id: "all",
    label: "All Sports",
    searchQueries: [
      "football turf ground",
      "badminton court centre",
      "pickleball court club",
      "tennis court club",
      "basketball court",
      "cricket ground turf nets",
      "table tennis centre",
      "sports complex facility",
    ],
    relevantGoogleTypes: [
      "stadium",
      "sports_complex",
      "athletic_field",
      "sports_club",
      "swimming_pool",
      "sports_activity_location",
      "tennis_court",
    ],
    strongPositiveKeywords: [
      "turf",
      "court",
      "ground",
      "pitch",
      "arena",
      "nets",
      "stadium",
      "football",
      "badminton",
      "pickleball",
      "tennis",
      "cricket",
      "basketball",
      "table tennis",
      "sports complex",
      "sports club",
      "swimming pool",
    ],
    unrelatedSportKeywords: [],
  },
};

export interface RelevanceScoreResult {
  score: number;
  isRelevant: boolean;
  isStronglyRelevant: boolean;
  breakdown: string[];
}

export const RELEVANCE_THRESHOLD = 40;
export const STRONGLY_RELEVANT_THRESHOLD = 100;

const PLAYABLE_VENUE_TERMS = [
  "turf",
  "court",
  "ground",
  "field",
  "arena",
  "stadium",
  "sports complex",
  "sports club",
  "club",
  "academy",
  "centre",
  "center",
  "facility",
  "pitch",
  "nets",
  "box cricket",
  "futsal",
];

const RETAIL_KEYWORDS = [
  "sporting goods",
  "sports goods",
  "sports store",
  "sports shop",
  "sportswear",
  "sports wear",
  "sports apparel",
  "sports equipment",
  "fitness equipment",
  "equipment dealer",
  "wholesaler",
  "distributor",
  "retailer",
  "showroom",
  "outlet",
  "shoe store",
  "footwear",
  "jersey",
  "t-shirt",
  "sales",
  "opticals",
];

const OFFICE_KEYWORDS = [
  "association office",
  "federation office",
  "board of control",
  "sports council",
  "sports management",
  "corporate office",
  "headquarters",
  "association",
  "federation",
  "physiotherapy",
  "rehab clinic",
  "hospital",
  "nutrition",
  "supplements store",
  "consultancy",
  "pvt ltd",
  "private limited",
];

function matchesSportKeyword(text: string, keyword: string): boolean {
  if (keyword === "tennis") {
    // Exclude occurrences where "tennis" is solely part of "table tennis"
    const textWithoutTableTennis = text.replace(/table\s*tennis/g, " ").replace(/ping\s*pong/g, " ");
    return textWithoutTableTennis.includes("tennis");
  }
  return text.includes(keyword);
}

export function normalizeSportCategory(sub: string): SportCategoryId | null {
  const s = sub.trim().toLowerCase();
  if (
    !s ||
    s === "establishment" ||
    s === "point of interest" ||
    s === "premise" ||
    s === "feature" ||
    s === "neighborhood" ||
    s === "sports facility" ||
    s === "venue" ||
    s === "activity venue" ||
    s === "dining venue" ||
    s.includes("establishment") ||
    s.includes("point of interest")
  ) {
    return null;
  }
  if (s.includes("football") || s.includes("soccer") || s.includes("futsal") || s.includes("turf")) return "football";
  if (s.includes("badminton") || s.includes("shuttle")) return "badminton";
  if (s.includes("pickleball") || s.includes("pickle ball")) return "pickleball";
  if (s.includes("table tennis") || s.includes("ping pong")) return "table-tennis";
  if (s.includes("tennis")) return "tennis";
  if (s.includes("basketball") || s.includes("hoops")) return "basketball";
  if (s.includes("cricket") || s.includes("box cricket")) return "cricket";
  if (
    s.includes("swimming") ||
    s.includes("pool") ||
    s.includes("aquatic") ||
    s.includes("squash") ||
    s.includes("golf") ||
    s.includes("skate")
  ) {
    return "other";
  }
  return null;
}

/**
 * Planless relevance scoring for Sports venues.
 * Gives each venue an explainable score based on name, Google types, venue terms, and query context.
 */
export function scoreSportsVenueRelevance(
  place: VenueMetadataLike,
  sportCategory: SportCategoryId,
  queryUsed?: string
): RelevanceScoreResult {
  if (!place) {
    return { score: 0, isRelevant: false, isStronglyRelevant: false, breakdown: ["Empty place"] };
  }

  const name = (place.title || place.name || "").toLowerCase();
  const sub = (place.subcategory || "").toLowerCase();
  const desc = (place.description || "").toLowerCase();
  const types: string[] = Array.isArray(place.types) ? place.types.map((t) => t.toLowerCase()) : [];
  const fullText = `${name} ${sub} ${desc}`.toLowerCase();
  const query = (queryUsed || "").toLowerCase();

  let score = 0;
  const breakdown: string[] = [];

  // ── 1. NEGATIVE SCORING & HARD REJECTIONS (Offices, Retail, Clinics) ──
  const isRetailType = types.some((t) =>
    [
      "sporting_goods_store",
      "clothing_store",
      "shoe_store",
      "department_store",
      "shopping_mall",
      "home_goods_store",
      "store",
    ].includes(t)
  );

  const hasRetailKeyword = RETAIL_KEYWORDS.some((k) => name.includes(k) || sub.includes(k));

  if (isRetailType || hasRetailKeyword) {
    // Only accept if explicitly named as an active playable facility (e.g. Decathlon Turf)
    const hasPlayableFacility = [
      "turf",
      "court",
      "ground",
      "pitch",
      "arena",
      "nets",
      "box cricket",
      "academy",
      "facility",
    ].some((w) => name.includes(w));

    if (!hasPlayableFacility) {
      score -= 100;
      breakdown.push("Retail / equipment store (-100)");
      return { score, isRelevant: false, isStronglyRelevant: false, breakdown };
    }
  }

  const hasOfficeKeyword = OFFICE_KEYWORDS.some((k) => name.includes(k) || sub.includes(k));
  if (hasOfficeKeyword) {
    score -= 100;
    breakdown.push("Office / Association / Corporate (-100)");
    return { score, isRelevant: false, isStronglyRelevant: false, breakdown };
  }

  // ── 2. DETECTED SPORTS MATCHING ──
  const detectedSports = new Set<SportCategoryId>();

  if (Array.isArray((place as any).supportedSports)) {
    for (const s of (place as any).supportedSports) {
      const norm = s ? normalizeSportCategory(s) : null;
      if (norm) detectedSports.add(norm);
    }
  }

  const explicitSubList = extractSportsList(place.subcategory);
  for (const s of explicitSubList) {
    const norm = normalizeSportCategory(s);
    if (norm) detectedSports.add(norm);
  }

  const explicitSub = (
    (place as any)._sportCategory ||
    ""
  ).toLowerCase().trim();
  if (explicitSub) {
    const norm = normalizeSportCategory(explicitSub);
    if (norm) detectedSports.add(norm);
  }

  if (detectedSports.size > 0) {
    if (sportCategory === "all") {
      return {
        score: 150,
        isRelevant: true,
        isStronglyRelevant: true,
        breakdown: [`Venue supports sports: ${Array.from(detectedSports).join(", ")} (+150)`],
      };
    }
    if (detectedSports.has(sportCategory)) {
      return {
        score: 150,
        isRelevant: true,
        isStronglyRelevant: true,
        breakdown: [`Venue supports explicit sport ${sportCategory} (+150)`],
      };
    }
  }

  const config = SPORTS_CONFIGS[sportCategory] || SPORTS_CONFIGS.all;

  // Check sport keyword match in name vs subcategory / description
  const nameMatchesSport = config.strongPositiveKeywords.some((k) => matchesSportKeyword(name, k));
  const otherFieldsMatchSport = config.strongPositiveKeywords.some((k) =>
    matchesSportKeyword(sub, k) || matchesSportKeyword(desc, k)
  );
  const hasCurrentSportMatch = nameMatchesSport || otherFieldsMatchSport;

  // Generic gym / fitness center penalty unless sport is specifically represented or user searched for it
  const isQueryForGym =
    query.includes("gym") || query.includes("fitness") || query.includes("cult") || query.includes("workout");
  const isGymType = types.includes("gym") || types.includes("fitness_center");
  const isGenericGym =
    (isGymType || name.includes("gym") || name.includes("fitness") || sub.includes("gym")) &&
    !PLAYABLE_VENUE_TERMS.some((term) => name.includes(term));

  if (isGenericGym && !isQueryForGym && sportCategory !== "other" && !hasCurrentSportMatch) {
    score -= 50;
    breakdown.push("Generic gym without selected sport facilities (-50)");
  }

  // Unrelated sport check: If a specific sport is selected (e.g. Football)
  // and the venue is exclusively branded for a different sport with NO evidence of the selected sport.
  // Multi-sport venues (e.g. Rush Koland — football + pickleball) must pass BOTH filters.
  if (sportCategory !== "all" && sportCategory !== "other") {
    const hasUnrelatedSportMatch = config.unrelatedSportKeywords.some((k) =>
      matchesSportKeyword(fullText, k)
    );

    if (hasUnrelatedSportMatch) {
      // Only penalise if there is genuinely NO evidence of the selected sport in ANY field.
      // Strategy:
      //   1. If the venue name exclusively brands itself for an unrelated sport (e.g. "CricKingdom Cricket Turf")
      //      AND has no keyword evidence of the selected sport in name/sub/desc → penalty applies,
      //      even if a generic Google type (like athletic_field) is shared between sports.
      //   2. Multi-sport venues (e.g. Rush Koland with football + pickleball) that do NOT exclusively brand
      //      for the unrelated sport in their name → escape the penalty as long as they have any positive
      //      evidence of the selected sport (keyword in any field OR an unambiguous Google type).

      // Is the unrelated sport explicitly in the venue NAME (exclusive branding)?
      const nameExclusivelyUnrelated = config.unrelatedSportKeywords.some((k) =>
        matchesSportKeyword(name, k)
      );

      // Is there keyword evidence of the selected sport anywhere (name, sub, desc)?
      // Google types are NOT used as escape hatch when name is exclusively branded for another sport.
      const hasKeywordEvidenceOfSelectedSport = hasCurrentSportMatch;

      const escapesPenalty = nameExclusivelyUnrelated
        ? hasKeywordEvidenceOfSelectedSport // strict: name says "cricket" → require sport keyword
        : hasKeywordEvidenceOfSelectedSport || // lenient: no exclusive name branding → keyword OR type OK
          types.some((t) => config.relevantGoogleTypes.includes(t));

      if (!escapesPenalty) {
        score -= 80;
        breakdown.push("Exclusively unrelated sport venue with no evidence of selected sport (-80)");
      }
    }
  }

  // ── 2. POSITIVE SCORING ──
  // +100 if the sport name appears clearly in the place name
  if (nameMatchesSport) {
    score += 100;
    breakdown.push("Sport name in place title (+100)");
  } else if (otherFieldsMatchSport) {
    // +80 if the sport appears in subcategory or description (e.g. "Football Facility", "Indoor shuttle courts")
    score += 80;
    breakdown.push("Sport keyword in subcategory / description (+80)");
  }

  // +60 if sport appears in the search query that returned it, or user search matches place title
  if (query && config.strongPositiveKeywords.some((k) => matchesSportKeyword(query, k))) {
    score += 60;
    breakdown.push("Sport query context match (+60)");
  } else if (query) {
    const queryTokens = query.split(/\s+/).filter((t) => t.length > 2);
    const matchesUserQuery = queryTokens.length > 0 && queryTokens.some((t) => name.includes(t) || sub.includes(t));
    if (matchesUserQuery) {
      score += 60;
      breakdown.push("User search query direct match (+60)");
    }
  }

  // +40 if primary Google type is strongly relevant
  const primaryType = types[0] || "";
  const isPrimaryStrong =
    (sportCategory === "football" && primaryType === "athletic_field") ||
    (sportCategory === "tennis" && primaryType === "tennis_court") ||
    (sportCategory === "pickleball" && (primaryType === "tennis_court" || primaryType === "sports_complex")) ||
    (sportCategory === "cricket" && (primaryType === "athletic_field" || primaryType === "stadium")) ||
    primaryType === "sports_complex" ||
    primaryType === "sports_club";

  if (isPrimaryStrong) {
    score += 40;
    breakdown.push(`Strong primary Google type (${primaryType}) (+40)`);
  } else if (types.some((t) => config.relevantGoogleTypes.includes(t))) {
    // +25 if one of the Google types is relevant
    score += 25;
    breakdown.push("Relevant Google type (+25)");
  }

  // +20 if the name contains a playable venue term
  const hasVenueTerm = PLAYABLE_VENUE_TERMS.some((term) => name.includes(term) || sub.includes(term) || desc.includes(term));
  if (hasVenueTerm) {
    score += 20;
    breakdown.push("Playable venue term (+20)");
  }

  // Generic place penalty if score is 0 and no sport evidence found
  if (score === 0 && sportCategory !== "all") {
    score -= 50;
    breakdown.push("Generic place with no evidence of sport (-50)");
  }

  const isRelevant = score >= RELEVANCE_THRESHOLD;
  const isStronglyRelevant = score >= STRONGLY_RELEVANT_THRESHOLD;

  return {
    score,
    isRelevant,
    isStronglyRelevant,
    breakdown,
  };
}

/**
 * Boolean predicate: is this venue relevant for the given sports category?
 */
export function isSportVenueRelevant(
  place: VenueMetadataLike,
  sportCategory: SportCategoryId,
  queryUsed?: string
): boolean {
  return scoreSportsVenueRelevance(place, sportCategory, queryUsed).isRelevant;
}

/**
 * Derives the complete set of sports that a venue supports.
 *
 * A single venue (e.g. Rush Koland) can host multiple sports (football + pickleball).
 * This function evaluates the venue against every concrete sport category and returns
 * the full list of sports for which it passes the relevance threshold.
 *
 * Usage:
 *   const sports = getSupportedSports(venue); // => ["football", "pickleball"]
 *   // The venue can then appear in BOTH the Football and Pickleball sections.
 */
export function getSupportedSports(place: VenueMetadataLike): SportCategoryId[] {
  if (Array.isArray((place as any).supportedSports) && (place as any).supportedSports.length > 0) {
    return (place as any).supportedSports;
  }

  const concreteSports: SportCategoryId[] = [
    "football",
    "badminton",
    "pickleball",
    "tennis",
    "basketball",
    "cricket",
    "table-tennis",
  ];

  return concreteSports.filter((sport) =>
    scoreSportsVenueRelevance(place, sport).isRelevant
  );
}

/**
 * Sort sports venues:
 * 1. Strongly relevant venues first (Tier 1: score >= 100)
 * 2. Relevant venues (Tier 2: score >= 40)
 * 3. Within each tier: sorted by nearest distance from discovery location
 */
export function sortSportsVenues(venues: DiscoveryItem[], sportCategory: SportCategoryId): DiscoveryItem[] {
  return [...venues].sort((a, b) => {
    const scoreResultA = scoreSportsVenueRelevance(a, sportCategory);
    const scoreResultB = scoreSportsVenueRelevance(b, sportCategory);

    // Tier 1: strongly relevant (score >= 100)
    const tierA = scoreResultA.isStronglyRelevant ? 0 : 1;
    const tierB = scoreResultB.isStronglyRelevant ? 0 : 1;
    if (tierA !== tierB) {
      return tierA - tierB;
    }

    // Within same tier: nearest distance first
    const distA = typeof (a as any)._distanceKm === "number" ? (a as any)._distanceKm : 99999;
    const distB = typeof (b as any)._distanceKm === "number" ? (b as any)._distanceKm : 99999;
    if (distA !== distB) {
      return distA - distB;
    }

    // Secondary fallback: higher relevance score first
    return scoreResultB.score - scoreResultA.score;
  });
}

/**
 * Resolves a human-readable, ranked Planless sports venue label.
 * Translates raw Google provider metadata (e.g. "Establishment | Point Of Interest")
 * into a meaningful, specific sport venue label based on strong evidence and priority.
 */
export function getSportsVenueLabel(
  place: VenueMetadataLike,
  selectedSport?: SportCategoryId
): string {
  if (!place) return "Sports Facility";

  // If a specific sport category view is selected, resolve that specific sport's label
  const specificSport =
    selectedSport && selectedSport !== "all"
      ? selectedSport
      : (place as any)._sportCategory && (place as any)._sportCategory !== "all"
      ? (place as any)._sportCategory
      : null;

  const name = (place.title || place.name || "").toLowerCase();
  const sub = (place.subcategory || "").toLowerCase();
  const desc = (place.description || "").toLowerCase();
  const types: string[] = Array.isArray(place.types) ? place.types.map((t) => t.toLowerCase()) : [];
  const full = `${name} ${sub} ${desc}`;

  // 1. Determine target sport category
  let targetSport: SportCategoryId | null = null;

  if (specificSport) {
    targetSport = specificSport;
  } else {
    // Deterministically pick the sport with the highest relevance score
    const sportCandidates: SportCategoryId[] = [
      "football",
      "badminton",
      "pickleball",
      "tennis",
      "basketball",
      "cricket",
      "table-tennis",
      "other",
    ];

    let bestScore = -999;
    let bestSport: SportCategoryId | null = null;

    for (const sport of sportCandidates) {
      const { score } = scoreSportsVenueRelevance(place, sport);
      if (score > bestScore) {
        bestScore = score;
        bestSport = sport;
      }
    }

    if (bestScore >= RELEVANCE_THRESHOLD && bestSport) {
      targetSport = bestSport;
    } else {
      // Keyword fallback
      if (matchesSportKeyword(full, "turf") || matchesSportKeyword(full, "football") || matchesSportKeyword(full, "futsal")) {
        targetSport = "football";
      } else if (matchesSportKeyword(full, "badminton") || matchesSportKeyword(full, "shuttle")) {
        targetSport = "badminton";
      } else if (matchesSportKeyword(full, "pickleball") || matchesSportKeyword(full, "pickle ball")) {
        targetSport = "pickleball";
      } else if (matchesSportKeyword(full, "tennis")) {
        targetSport = "tennis";
      } else if (matchesSportKeyword(full, "basketball") || matchesSportKeyword(full, "hoop")) {
        targetSport = "basketball";
      } else if (matchesSportKeyword(full, "cricket") || matchesSportKeyword(full, "pitch") || matchesSportKeyword(full, "nets")) {
        targetSport = "cricket";
      } else if (matchesSportKeyword(full, "table tennis") || matchesSportKeyword(full, "ping pong")) {
        targetSport = "table-tennis";
      } else {
        targetSport = "other";
      }
    }
  }

  // 2. Return the sport name exactly — no venue-type suffix (Turf, Court, Arena, etc.)
  //    The sport context is already established by _sportCategory / selectedSport.
  //    Football section → "Football", Pickleball section → "Pickleball", etc.
  if (targetSport && targetSport !== "other" && SPORTS_CONFIGS[targetSport]) {
    return SPORTS_CONFIGS[targetSport].label;
  }

  // Fallback for "other" / unlabelled venues
  return "Sports Facility";
}
