import { DiscoveryItem } from "../../../core/types/discovery";
import { VenueMetadataLike } from "./venueRelevance";

export type ActivityCategoryId =
  | "all"
  | "bowling"
  | "mystery-rooms"
  | "mini-golf"
  | "go-karting"
  | "amusement-parks"
  | "arcades"
  | "adventure-fun"
  | "other";

export interface ActivitySearchConfig {
  id: ActivityCategoryId;
  label: string;
  searchQueries: string[];
  relevantGoogleTypes: string[];
  strongPositiveKeywords: string[];
}

/**
 * ── HARD EXCLUDED KEYWORDS FOR ACTIVITIES ──
 * These tokens represent non-activity businesses, utilities, offices, residential properties,
 * and geographic features that Google frequently misclassifies as amusement parks or activities.
 */
export const HARD_EXCLUDED_ACTIVITY_KEYWORDS: string[] = [
  // 1. Water supply, plants, treatment, purifiers, drinking water kiosks ("Neerina Ghataka")
  "water plant",
  "water supply",
  "water supplier",
  "water supplies",
  "packaged drinking water",
  "mineral water",
  "drinking water",
  "water tanker",
  "water station",
  "water purifiers",
  "water purifier",
  "ro water",
  "neerina ghataka",
  "kudiyuva neeru",
  "pure water",
  "aqua pure",
  "aqua water",
  "water technology",
  "water technologies",
  "water solutions",
  "water treatment",
  "water filter",
  "water can",
  "borewell",

  // 2. Natural water bodies / lakes / ponds / dams (not amusement parks)
  "lake",
  "pond",
  "kere",
  "kunte",
  "reservoir",
  "drainage",
  "canal",

  // 3. Corporate offices, tech companies, headquarters, industrial
  "head office",
  "corporate office",
  "headquarters",
  "branch office",
  "technologies",
  "infotech",
  "solutions",
  "enterprises",
  "consulting",
  "consultancy",
  "logistics",
  "courier",
  "packers and movers",
  "pvt ltd",
  "private limited",
  "co-working",
  "coworking",

  // 4. Real estate, residential buildings, apartments
  "apartment",
  "apartments",
  "enclave",
  "residency",
  "villas",
  "real estate",
  "builders",
  "developers",
  "properties",
  "pg for",
  "hostel",

  // 5. Retail stores, clinics, services
  "opticals",
  "tailor",
  "laundry",
  "dry cleaners",
  "pharmacy",
  "clinic",
  "hospital",
  "supermarket",
  "grocery",
  "hypermarket",
  "department store",
  "hardware store",
  "car wash",
  "car repair",
  "automobile repair",
];

/**
 * High-precision Activity configurations and search keywords.
 */
export const ACTIVITIES_CONFIGS: Record<ActivityCategoryId, ActivitySearchConfig> = {
  all: {
    id: "all",
    label: "All",
    searchQueries: [
      "bowling alley",
      "escape room",
      "go karting",
      "trampoline park",
      "arcade gaming zone",
      "laser tag",
      "paintball",
      "amusement park",
      "water park",
      "bouldering climbing gym",
    ],
    relevantGoogleTypes: [
      "bowling_alley",
      "amusement_center",
      "amusement_park",
      "water_park",
    ],
    strongPositiveKeywords: [
      "bowling",
      "bowl",
      "amoeba",
      "escape",
      "escape room",
      "escape rooms",
      "escape games",
      "mystery room",
      "mystery rooms",
      "breakout",
      "puzzle room",
      "go kart",
      "go-kart",
      "gokart",
      "karting",
      "racepace",
      "torq03",
      "trampoline",
      "bounce",
      "skyjumper",
      "arcade",
      "gaming zone",
      "game zone",
      "gaming lounge",
      "virtual reality",
      "vr gaming",
      "vr park",
      "laser tag",
      "paintball",
      "amusement park",
      "theme park",
      "water park",
      "water world",
      "wonderla",
      "fun world",
      "snow city",
      "bouldering",
      "climbing gym",
      "mini golf",
      "putt putt",
      "play arena",
      "timezone",
      "smaaash",
      "smaash",
      "loco bear",
    ],
  },
  bowling: {
    id: "bowling",
    label: "Bowling",
    searchQueries: [
      "bowling alley",
      "bowling center",
      "cosmic bowling",
      "bowling arena",
    ],
    relevantGoogleTypes: ["bowling_alley"],
    strongPositiveKeywords: [
      "bowling",
      "bowling alley",
      "bowling center",
      "bowling arena",
      "cosmic bowling",
      "bowl",
      "go bowl",
      "amoeba",
    ],
  },
  "mystery-rooms": {
    id: "mystery-rooms",
    label: "Mystery Rooms",
    searchQueries: [
      "escape room",
      "mystery rooms",
      "breakout games",
      "escape games",
      "puzzle room",
    ],
    relevantGoogleTypes: ["amusement_center"],
    strongPositiveKeywords: [
      "escape",
      "escape room",
      "escape rooms",
      "mystery room",
      "mystery rooms",
      "breakout",
      "escape games",
      "mystery owl",
      "puzzle room",
      "the amazing escape",
    ],
  },
  "go-karting": {
    id: "go-karting",
    label: "Go-Karting",
    searchQueries: [
      "go karting track",
      "go-kart track",
      "karting arena",
      "go karting",
    ],
    relevantGoogleTypes: ["amusement_center"],
    strongPositiveKeywords: [
      "go kart",
      "go-kart",
      "gokart",
      "karting",
      "kart track",
      "racepace",
      "torq03",
      "karting arena",
    ],
  },
  "amusement-parks": {
    id: "amusement-parks",
    label: "Amusement Parks",
    searchQueries: [
      "amusement park",
      "theme park rides",
      "water park water world",
      "snow theme park",
    ],
    relevantGoogleTypes: ["amusement_park", "water_park"],
    strongPositiveKeywords: [
      "amusement park",
      "theme park",
      "water park",
      "water world",
      "wonderla",
      "fun world",
      "snow city",
      "snow park",
      "rides park",
    ],
  },
  arcades: {
    id: "arcades",
    label: "Arcades",
    searchQueries: [
      "arcade gaming zone",
      "gaming lounge arcade",
      "vr gaming center",
      "timezone arcade",
    ],
    relevantGoogleTypes: ["amusement_center", "bowling_alley"],
    strongPositiveKeywords: [
      "arcade",
      "gaming zone",
      "game zone",
      "gaming lounge",
      "timezone",
      "virtual reality",
      "vr gaming",
      "vr park",
      "the grid",
      "smaash",
      "smaaash",
      "freakout gaming",
    ],
  },
  "adventure-fun": {
    id: "adventure-fun",
    label: "Adventure & Fun",
    searchQueries: [
      "trampoline park bounce",
      "laser tag arena",
      "paintball arena",
      "adventure park climbing",
      "bouldering climbing gym",
    ],
    relevantGoogleTypes: ["amusement_center", "amusement_park"],
    strongPositiveKeywords: [
      "trampoline",
      "bounce",
      "skyjumper",
      "laser tag",
      "lasertag",
      "paintball",
      "adventure park",
      "play arena",
      "bouldering",
      "climbing gym",
      "climbing wall",
      "rock climbing",
      "equilibrium climbing",
    ],
  },
  "mini-golf": {
    id: "mini-golf",
    label: "Mini Golf",
    searchQueries: [
      "mini golf",
      "miniature golf",
      "putt putt golf",
    ],
    relevantGoogleTypes: ["amusement_center"],
    strongPositiveKeywords: [
      "mini golf",
      "miniature golf",
      "putt putt",
      "crazy golf",
      "mini golf madness",
    ],
  },
  other: {
    id: "other",
    label: "Other Activities",
    searchQueries: ["recreational games activities"],
    relevantGoogleTypes: ["amusement_center"],
    strongPositiveKeywords: ["recreation", "activities", "board game cafe", "pottery workshop"],
  },
};

/**
 * Checks whether text contains any keyword from a list.
 */
function containsKeyword(text: string, keywords: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some((k) => {
    if (k.length <= 4) {
      const regex = new RegExp(`\\b${k}\\b`, "i");
      return regex.test(lower);
    }
    return lower.includes(k);
  });
}

/**
 * Strict Activity Venue Evaluator.
 * Answers: "Is this place an authentic social activity or entertainment venue?"
 */
export function isStrictActivityVenue(place: VenueMetadataLike): boolean {
  if (!place) return false;

  const name = (place.title || place.name || "").toLowerCase().trim();
  const sub = (place.subcategory || "").toLowerCase().trim();
  const desc = (place.description || "").toLowerCase().trim();
  const types: string[] = Array.isArray(place.types) ? place.types.map((t) => t.toLowerCase()) : [];
  const fullText = `${name} ${sub} ${desc}`;

  // 1. HARD TYPE EXCLUSIONS
  const excludedTypes = [
    "real_estate_agency",
    "travel_agency",
    "insurance_agency",
    "car_dealer",
    "car_repair",
    "lawyer",
    "accounting",
    "local_government_office",
    "finance",
    "bank",
    "doctor",
    "dentist",
    "hospital",
    "pharmacy",
    "hardware_store",
    "supermarket",
  ];
  if (types.some((t) => excludedTypes.includes(t))) {
    return false;
  }

  // 2. HARD NEGATIVE KEYWORD EXCLUSIONS (Water plants, lakes, ponds, corporate offices, flats)
  if (containsKeyword(name, HARD_EXCLUDED_ACTIVITY_KEYWORDS)) {
    return false;
  }
  if (
    containsKeyword(desc, HARD_EXCLUDED_ACTIVITY_KEYWORDS) &&
    !containsKeyword(name, ACTIVITIES_CONFIGS.all.strongPositiveKeywords)
  ) {
    return false;
  }

  // 3. PURE SPORTS TURF / ACADEMY EXCLUSIONS (turfs belong in Sports, not Activities, unless mixed arena)
  const pureSportsFacilityKeywords = [
    "football turf",
    "cricket turf",
    "badminton court",
    "pickleball court",
    "tennis court",
    "basketball court",
    "cricket ground",
    "cricket net",
    "football academy",
    "badminton academy",
    "cricket academy",
    "futsal turf",
  ];
  const hasPureSportsKeyword = pureSportsFacilityKeywords.some((k) => name.includes(k));

  // Multi-activity entertainment hubs that feature sports (e.g. "Play Arena", "Torq03") are permitted
  const isMultiActivityHub = [
    "play arena",
    "torq03",
    "loco bear",
    "amoeba",
    "smaaash",
    "smaash",
    "the grid",
    "timezone",
  ].some((hub) => name.includes(hub));

  if (hasPureSportsKeyword && !isMultiActivityHub) {
    return false;
  }

  // 4. STRONG POSITIVE ACTIVITY EVIDENCE
  const hasStrongActivityKeyword = containsKeyword(
    fullText,
    ACTIVITIES_CONFIGS.all.strongPositiveKeywords
  );

  if (hasStrongActivityKeyword) {
    return true;
  }

  // 5. GOOGLE TYPE SUPPORTING CHECKS
  // If venue has activity Google types, verify it is NOT a generic or utility entity
  const hasActivityType = types.some((t) =>
    ["bowling_alley", "amusement_center", "amusement_park", "water_park"].includes(t)
  );

  if (hasActivityType) {
    // A place with amusement_park / water_park must have at least general entertainment tokens
    // to protect against unlabelled water kiosks or random shops
    const generalRecreationTokens = [
      "park",
      "world",
      "city",
      "wonder",
      "resort",
      "hub",
      "zone",
      "lounge",
      "center",
      "centre",
      "club",
      "fun",
      "play",
      "adventure",
      "arena",
      "entertainment",
      "games",
      "gaming",
      "lane",
      "lanes",
      "bowl",
      "strike",
      "escape",
      "bounce",
      "jump",
      "climb",
    ];
    const hasRecreationNameToken = generalRecreationTokens.some((tok) => name.includes(tok));
    if (hasRecreationNameToken) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts normalized activity subcategories for a venue (e.g. ["Bowling", "Arcades"]).
 */
export function extractActivityCategories(place: VenueMetadataLike): string[] {
  if (!place) return ["Activities"];
  const name = (place.title || place.name || "").toLowerCase();
  const desc = (place.description || "").toLowerCase();
  const sub = (place.subcategory || "").toLowerCase();
  const types: string[] = Array.isArray(place.types) ? place.types.map((t) => t.toLowerCase()) : [];
  const text = `${name} ${sub} ${desc}`;

  const matched = new Set<string>();

  // Bowling
  if (
    types.includes("bowling_alley") ||
    containsKeyword(text, ACTIVITIES_CONFIGS.bowling.strongPositiveKeywords)
  ) {
    matched.add("Bowling");
  }

  // Mystery Rooms / Escape
  if (containsKeyword(text, ACTIVITIES_CONFIGS["mystery-rooms"].strongPositiveKeywords)) {
    matched.add("Mystery Rooms");
  }

  // Go-Karting
  if (containsKeyword(text, ACTIVITIES_CONFIGS["go-karting"].strongPositiveKeywords)) {
    matched.add("Go-Karting");
  }

  // Amusement Parks
  if (
    types.includes("amusement_park") ||
    types.includes("water_park") ||
    containsKeyword(text, ACTIVITIES_CONFIGS["amusement-parks"].strongPositiveKeywords)
  ) {
    matched.add("Amusement Parks");
  }

  // Arcades & Gaming
  if (containsKeyword(text, ACTIVITIES_CONFIGS.arcades.strongPositiveKeywords)) {
    matched.add("Arcades");
  }

  // Adventure & Fun (Trampoline, Laser Tag, Paintball, Climbing)
  if (containsKeyword(text, ACTIVITIES_CONFIGS["adventure-fun"].strongPositiveKeywords)) {
    matched.add("Adventure & Fun");
  }

  // Mini Golf
  if (containsKeyword(text, ACTIVITIES_CONFIGS["mini-golf"].strongPositiveKeywords)) {
    matched.add("Mini Golf");
  }

  if (matched.size === 0) {
    return ["Activities"];
  }

  return Array.from(matched);
}

/**
 * Computes relevance confidence score [0.0 - 1.0] for an activity venue.
 */
export function scoreActivityVenueRelevance(
  place: VenueMetadataLike,
  targetCategory?: ActivityCategoryId
): number {
  if (!isStrictActivityVenue(place)) return 0;

  const name = (place.title || place.name || "").toLowerCase();
  const fullText = `${name} ${place.description || ""} ${place.subcategory || ""}`.toLowerCase();

  // If a specific subcategory is targeted, check match
  if (targetCategory && targetCategory !== "all") {
    const config = ACTIVITIES_CONFIGS[targetCategory];
    if (config) {
      const matchesTarget = containsKeyword(fullText, config.strongPositiveKeywords);
      if (matchesTarget) return 1.0;
      return 0.3; // Matches general activity but not this specific subcategory
    }
  }

  // General activity confidence
  const hasDirectTitleMatch = containsKeyword(name, ACTIVITIES_CONFIGS.all.strongPositiveKeywords);
  if (hasDirectTitleMatch) return 1.0;

  return 0.85;
}

/**
 * Checks whether an activity venue is relevant to a specific activity subcategory.
 * If targetCategory is "all" or omitted, returns true as long as it's an authentic activity venue.
 */
export function isActivityVenueRelevant(
  place: VenueMetadataLike,
  targetCategory?: ActivityCategoryId
): boolean {
  if (!isStrictActivityVenue(place)) return false;
  if (!targetCategory || targetCategory === "all") return true;

  const config = ACTIVITIES_CONFIGS[targetCategory];
  if (!config) return false;

  const categories = extractActivityCategories(place);
  return categories.includes(config.label);
}
