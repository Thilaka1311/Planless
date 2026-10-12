/**
 * venueRelevance.ts
 *
 * Strict Planless venue relevance layer for Google Places and discovery results.
 * Google Places provides the raw venue data, but Planless decides which venues are
 * genuinely relevant to:
 * - Eat (Dining)
 * - Play sports (Sports)
 * - Do an activity (Activities)
 *
 * Rule: "Can a user realistically go to this place to eat, play, or do an activity?"
 * If the answer is no, it MUST NOT reach the discovery UI.
 */

import {
  isStrictActivityVenue,
  isActivityVenueRelevant,
  extractActivityCategories,
  ACTIVITIES_CONFIGS,
} from "./activitiesRelevance";
import {
  DINING_CONFIGS,
  GOOGLE_TABLE_A_DINING_TYPES,
  HARD_EXCLUDED_DINING_TYPES,
  HARD_EXCLUDED_DINING_KEYWORDS,
  extractDiningSubcategory,
} from "./diningRelevance";
import { hasPlacePhotoOverride, getPlacePhotoOverride } from "./placeOverridesService";
import { SUPABASE_URL } from "../../../../lib/supabaseClient";
export {
  isStrictActivityVenue,
  isActivityVenueRelevant,
  extractActivityCategories,
  ACTIVITIES_CONFIGS,
  DINING_CONFIGS,
  GOOGLE_TABLE_A_DINING_TYPES,
  extractDiningSubcategory,
};

export function extractCleanPlaceId(
  itemOrId?: string | { place_id?: string | null; id?: string | null; movie_id?: number | null } | null
): string {
  if (!itemOrId) return "";
  if (typeof itemOrId === "string") {
    return itemOrId.split("::")[0].replace(/^place_/, "");
  }
  if (itemOrId.place_id) {
    return itemOrId.place_id.split("::")[0].replace(/^place_/, "");
  }
  if (itemOrId.movie_id) {
    return `tmdb-${itemOrId.movie_id}`;
  }
  const id = itemOrId.id || "";
  return id.split("::")[0].replace(/^place_/, "");
}

/**
 * Extracts all deduplication keys for a venue to ensure robust matching
 * across Google place_id, provider_place_id, internal database IDs, and overrides.
 */
export function getVenueDeduplicationKeys(item: any): string[] {
  if (!item) return [];
  const keys = new Set<string>();

  const addKey = (val?: string | null) => {
    if (!val || typeof val !== "string") return;
    const clean = val.split("::")[0].replace(/^place_/, "").trim();
    if (clean) {
      keys.add(clean);
      keys.add(clean.toLowerCase());
    }
  };

  addKey(item.place_id);
  addKey(item.provider_place_id);
  addKey(item.id);
  addKey(item.public_id);
  if (item.movie_id) {
    addKey(`tmdb-${item.movie_id}`);
  }

  return Array.from(keys);
}

function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Checks whether two venue representations refer to the exact same physical place.
 * Matches on:
 * 1. Clean place_id / provider_place_id / public_id / id
 * 2. Shared deduplication keys
 * 3. Identical primary brand name + physical proximity within 300 meters
 */
export function areVenuesIdentical(a: any, b: any): boolean {
  if (!a || !b) return false;

  // 1. Direct clean place_id match
  const aClean = extractCleanPlaceId(a.place_id || a.id);
  const bClean = extractCleanPlaceId(b.place_id || b.id);
  if (aClean && bClean && aClean.toLowerCase() === bClean.toLowerCase()) {
    return true;
  }

  // 2. Shared deduplication keys
  const aKeys = getVenueDeduplicationKeys(a);
  const bKeys = new Set(getVenueDeduplicationKeys(b));
  for (const k of aKeys) {
    if (bKeys.has(k)) return true;
  }

  // If BOTH items have distinct valid Google Place IDs (starting with "ChI"),
  // they are confirmed distinct physical places from Google and must NOT be merged.
  const aIsGoogle = typeof aClean === "string" && aClean.startsWith("ChI");
  const bIsGoogle = typeof bClean === "string" && bClean.startsWith("ChI");
  if (aIsGoogle && bIsGoogle && aClean !== bClean) {
    return false;
  }

  // 3. Name & Physical Proximity match (e.g. Google Place "Toit" vs DB seed "item_dining_toit")
  const aName = (a.name || a.title || "").toLowerCase().trim();
  const bName = (b.name || b.title || "").toLowerCase().trim();
  if (aName && bName) {
    const GENERIC_PREFIXES = new Set([
      "sports",
      "sport",
      "restaurant",
      "cafe",
      "activity",
      "arena",
      "complex",
      "ground",
      "grounds",
      "club",
      "hotel",
      "kitchen",
      "bar",
      "pub",
      "lounge",
      "bistro",
      "bakery",
      "pizzeria",
      "diner",
      "house",
      "grill",
      "the",
      "royal",
      "new",
      "city",
      "turf",
      "court",
      "venue",
      "place",
      "center",
      "centre",
      "park",
    ]);

    const aFirst = aName.split(/[\s,&|-]+/)[0];
    const bFirst = bName.split(/[\s,&|-]+/)[0];

    const isGeneric = GENERIC_PREFIXES.has(aFirst) || GENERIC_PREFIXES.has(bFirst);
    const brandMatches =
      aName === bName ||
      (!isGeneric &&
        aFirst.length >= 4 &&
        aFirst === bFirst &&
        (aName.includes(bName) || bName.includes(aName)) &&
        Math.min(aName.length, bName.length) >= 4);

    if (brandMatches) {
      const aLat = a.latitude ?? a.geometry?.location?.lat;
      const aLng = a.longitude ?? a.geometry?.location?.lng;
      const bLat = b.latitude ?? b.geometry?.location?.lat;
      const bLng = b.longitude ?? b.geometry?.location?.lng;

      if (aLat != null && aLng != null && bLat != null && bLng != null) {
        const lat1 = Number(aLat);
        const lng1 = Number(aLng);
        const lat2 = Number(bLat);
        const lng2 = Number(bLng);
        if (!isNaN(lat1) && !isNaN(lng1) && !isNaN(lat2) && !isNaN(lng2)) {
          const distKm = calculateHaversineKm(lat1, lng1, lat2, lng2);
          if (distKm <= 0.3) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Merges duplicate venue representations, preserving the stable Google place_id
 * while incorporating any database / override metadata.
 */
export function mergeDuplicateVenues<T extends Record<string, any> = any, U extends Record<string, any> = any>(
  existing: T,
  incoming: U
): T & U {
  const isGoogle = (item: any) =>
    typeof item?.place_id === "string" && item.place_id.startsWith("ChI");

  const base: any = isGoogle(incoming) && !isGoogle(existing) ? incoming : existing;
  const overlay: any = base === existing ? incoming : existing;

  return {
    ...overlay,
    ...base,
    place_id: base.place_id || overlay.place_id,
    id: base.id || overlay.id,
    _hasPlanlessOverride: Boolean(base._hasPlanlessOverride || overlay._hasPlanlessOverride),
  };
}

export interface VenueMetadataLike {
  place_id?: string | null;
  id?: string | null;
  title?: string;
  name?: string;
  category?: string;
  subcategory?: string | null;
  description?: string | null;
  types?: string[] | null;
}

/**
 * ── 1. SPORTS / PLACES TO PLAY ──
 * Only show venues where someone can actually play or participate in a sport,
 * preferably something that can be booked or paid for.
 * Exclude: sporting goods stores, sportswear shops, equipment stores, sports offices,
 * associations, physiotherapy, and non-playable facilities.
 */
/**
 * ── GENERAL-PURPOSE GYM & FITNESS CENTER EXCLUSION ──
 * Excludes commercial workout gyms, fitness centres, CrossFit boxes, bodybuilding gyms,
 * and aerobics/pilates studios from Sports discovery.
 *
 * PRESERVES:
 * - Traditional sports clubs & gymkhanas (e.g. "Bangalore Gymkhana Club")
 * - Dedicated sports facilities / academies that include fitness training (e.g. "Baseline Badminton & Fitness Academy")
 */
export function isGeneralPurposeGym(place: VenueMetadataLike): boolean {
  if (!place) return false;
  const name = (place.title || place.name || "").toLowerCase();
  const sub = (place.subcategory || "").toLowerCase();
  const desc = (place.description || "").toLowerCase();
  const types: string[] = Array.isArray(place.types) ? place.types.map((t) => t.toLowerCase()) : [];

  // Exception 1: Traditional sports clubs & gymkhanas (e.g. "Bangalore Gymkhana Club") are multi-sport facilities, not gyms
  if (name.includes("gymkhana") || sub.includes("gymkhana")) {
    return false;
  }

  // Exception 2: Dedicated playable sports facilities/academies that also offer fitness/gym coaching
  const dedicatedSportKeywords = [
    "badminton",
    "tennis",
    "squash",
    "pickleball",
    "table tennis",
    "football",
    "futsal",
    "soccer",
    "cricket",
    "basketball",
    "swimming pool",
    "swim centre",
    "swim center",
    "aquatic centre",
    "aquatic center",
    "turf",
    "court",
    "arena",
    "stadium",
    "box cricket",
    "sports club",
    "sports complex",
  ];
  const hasDedicatedSportFacility = dedicatedSportKeywords.some(
    (k) => name.includes(k) || sub.includes(k)
  );

  const gymTypes = ["gym", "fitness_center", "health_club"];
  const hasGymType = types.some((t) => gymTypes.includes(t));

  const gymBrandOrKeywords = [
    "fitness",
    "crossfit",
    "workout",
    "health club",
    "bodybuilding",
    "aerobics",
    "pilates",
    "zumba",
    "calisthenics",
    "cult fit",
    "cult.fit",
    "gold's gym",
    "golds gym",
    "anytime fitness",
    "snap fitness",
    "slam fitness",
    "talwalkars",
    "chisel",
    "fitness first",
    "powerhouse gym",
    "iron gym",
    "barbell",
    "gymnasium",
  ];
  const hasGymKeyword =
    gymBrandOrKeywords.some((k) => name.includes(k) || sub.includes(k)) ||
    /\b(gym|gyms)\b/i.test(name) ||
    /\b(gym|gyms)\b/i.test(sub);

  if (hasGymType || hasGymKeyword) {
    if (hasDedicatedSportFacility) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * ── PUBLIC GROUNDS & MUNICIPAL OPEN PLAYGROUNDS EXCLUSION ──
 * Excludes generic public grounds, BBMP/municipal/government grounds, open maidans,
 * and generic public playgrounds from Sports discovery.
 *
 * PRESERVES:
 * - Legitimate sports venues with dedicated facilities: turfs, courts, arenas, stadiums, academies,
 *   complexes, and cricket box nets.
 * - Sports grounds that explicitly specify a concrete sport or facility (e.g., "Koramangala Football Ground",
 *   "Lords Cricket Ground & Box Nets", "Urban Turf Football Ground").
 */
export function isPublicGround(place: VenueMetadataLike): boolean {
  if (!place) return false;
  const name = (place.title || place.name || "").toLowerCase();
  const sub = (place.subcategory || "").toLowerCase();
  const desc = (place.description || "").toLowerCase();
  const types: string[] = Array.isArray(place.types) ? place.types.map((t) => t.toLowerCase()) : [];

  // Dedicated facility indicators that distinguish legitimate sports facilities
  const dedicatedFacilityIndicators = [
    "turf",
    "court",
    "arena",
    "stadium",
    "academy",
    "complex",
    "box cricket",
    "box nets",
    "cricket nets",
    "nets",
    "futsal",
    "5-a-side",
    "5 aside",
    "7-a-side",
    "7 aside",
    "swimming pool",
    "swim centre",
    "swim center",
    "aquatic centre",
    "aquatic center",
    "squash",
    "sports club",
    "indoor stadium",
  ];
  const hasDedicatedFacility = dedicatedFacilityIndicators.some(
    (k) => name.includes(k) || sub.includes(k)
  );

  // 1. Explicit public/municipal ground keyword patterns
  const publicGroundPrefixes = [
    "public ground",
    "public playground",
    "bbmp ground",
    "bbmp play ground",
    "bbmp playground",
    "bda ground",
    "corporation ground",
    "corporation public ground",
    "municipal ground",
    "municipal sports ground",
    "government ground",
    "austin town sports ground",
    "austin town ground",
    "children playground",
    "children's playground",
    "children park",
  ];
  const isExplicitPublicGround = publicGroundPrefixes.some((p) => name.includes(p) || sub.includes(p));
  if (isExplicitPublicGround && !hasDedicatedFacility) {
    return true;
  }

  // 2. Google type 'playground' or 'park'
  const isPlaygroundType = types.includes("playground") || types.includes("park");
  if (isPlaygroundType && !hasDedicatedFacility) {
    return true;
  }

  // 3. Generic ground / maidan names without sport or dedicated facility
  const isGenericGroundName =
    /\b(ground|grounds|maidan|maidana)\b/i.test(name) ||
    /\b(ground|grounds|maidan|maidana)\b/i.test(sub);

  if (isGenericGroundName) {
    if (hasDedicatedFacility) {
      return false;
    }

    // Concrete sports grounds (e.g., "Koramangala Football Ground", "National Cricket Ground")
    const concreteSports = ["football", "cricket", "basketball", "hockey", "rugby"];
    const hasConcreteSport = concreteSports.some((s) => name.includes(s) || sub.includes(s));
    const isMunicipalOrPublic = [
      "bbmp",
      "bda",
      "municipal",
      "corporation",
      "government",
      "public",
      "civic",
      "austin town",
      "rbanm",
      "shantinagar",
      "national college",
    ].some((m) => name.includes(m));

    if (hasConcreteSport && !isMunicipalOrPublic) {
      return false;
    }

    return true;
  }

  return false;
}

export function isPlayableSportsVenue(place: VenueMetadataLike): boolean {
  if (!place) return false;
  const name = (place.title || place.name || "").toLowerCase();
  const sub = (place.subcategory || "").toLowerCase();
  const desc = (place.description || "").toLowerCase();
  const types: string[] = Array.isArray(place.types) ? place.types.map((t) => t.toLowerCase()) : [];
  const text = `${name} ${sub} ${desc}`;

  // 1. HARD EXCLUSIONS: Public grounds & General-purpose gyms
  if (isGeneralPurposeGym(place)) return false;
  if (isPublicGround(place)) return false;

  const isSyntheticSub = [
    "dining venue",
    "activity venue",
    "sports facility",
    "venue",
    "movie",
  ].includes(sub);
  const cleanSub = isSyntheticSub ? "" : sub;

  // 2. HARD EXCLUSIONS: Retail stores, equipment shops, merchandise, offices, medical
  const isRetailStore = types.some((t) =>
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

  const retailKeywords = [
    "sporting goods",
    "sports goods",
    "sports store",
    "sports shop",
    "sportswear",
    "sports wear",
    "sports apparel",
    "sports equipment",
    "fitness equipment",
    "cycle store",
    "bicycle shop",
    "bicycle store",
    "jersey",
    "t-shirt",
    "shoe store",
    "shoe house",
    "footwear",
    "racquet stringing",
    "equipment dealer",
    "wholesaler",
    "distributor",
    "retailer",
    "showroom",
    "outlet",
    "opticals",
    "sales",
  ];
  const hasRetailKeyword = retailKeywords.some((k) => name.includes(k));

  const officeKeywords = [
    "association office",
    "federation office",
    "board of control",
    "sports council",
    "sports management",
    "corporate office",
    "headquarters",
    "physiotherapy",
    "orthopaedic",
    "rehab clinic",
    "hospital",
    "nutrition",
    "supplements store",
    "consultancy",
    "pvt ltd",
    "private limited",
  ];
  const hasOfficeKeyword = officeKeywords.some((k) => name.includes(k));
  if (hasOfficeKeyword) return false;

  // Pure dining venue exclusion (e.g. "Truffles", "Third Wave Coffee", "Glen's Bakehouse")
  const diningTypes = [
    "restaurant",
    "cafe",
    "bakery",
    "bar",
    "meal_takeaway",
    "meal_delivery",
  ];
  const hasDiningType = types.some((t) => diningTypes.includes(t));
  const diningOnlyKeywords = [
    "restaurant",
    "cafe",
    "coffee",
    "bistro",
    "pizzeria",
    "bakery",
    "dhaba",
    "darshini",
    "sweets",
    "ice cream",
  ];
  const hasDiningOnlyKeyword = diningOnlyKeywords.some((k) => name.includes(k));

  // Explicit playable venue keywords
  const playableVenueKeywords = [
    "matchday",
    "sports zone",
    "sports arena",
    "sports hub",
    "turf club",
    "turf",
    "court",
    "arena",
    "football ground",
    "cricket ground",
    "pitch",
    "nets",
    "box cricket",
    "badminton",
    "football",
    "futsal",
    "soccer",
    "pickleball",
    "pickle ball",
    "tennis",
    "basketball",
    "table tennis",
    "ping pong",
    "squash",
    "swimming pool",
    "swim centre",
    "swim center",
    "aquatic centre",
    "aquatic center",
    "sports club",
    "sports centre",
    "sports center",
    "sports complex",
    "sports academy",
    "sports facility",
    "skate park",
    "skating rink",
    "stadium",
  ];
  const hasPlayableKeyword = playableVenueKeywords.some((k) => name.includes(k) || cleanSub.includes(k));

  // If venue has dining characteristics and lacks explicit playable facility keywords, exclude from sports
  if ((hasDiningType || hasDiningOnlyKeyword) && !hasPlayableKeyword) {
    return false;
  }

  // If marked as retail store or containing retail keyword:
  // ONLY keep if it is an explicit playable venue/turf/court (e.g. "Decathlon Anubhava Turf")
  if (isRetailStore || hasRetailKeyword) {
    const isExplicitPlayableFacility = [
      "turf",
      "court",
      "pitch",
      "arena",
      "nets",
      "box cricket",
      "academy",
      "facility",
    ].some((k) => name.includes(k));
    if (!isExplicitPlayableFacility) return false;
  }

  // Google Playable venue types (excluding playground/park)
  const playableTypes = [
    "stadium",
    "sports_complex",
    "athletic_field",
    "sports_club",
    "swimming_pool",
    "golf_course",
    "sports_activity_location",
    "sports_school",
    "sports_coaching",
    "ice_skating_rink",
  ];
  const hasPlayableType = types.some((t) => playableTypes.includes(t));

  if (hasPlayableType || hasPlayableKeyword) {
    return true;
  }

  return false;
}

function matchesKeyword(text: string, keyword: string): boolean {
  if (keyword.length <= 4) {
    return new RegExp(`\\b${keyword}\\b`, "i").test(text);
  }
  return text.includes(keyword);
}

/**
 * ── 2. DINING / PLACES TO EAT ──
 * Only show places where someone can actually eat or get food.
 * Exclude: grocery stores, supermarkets, food wholesalers, manufacturers, catering offices,
 * generic shops, and unrelated businesses.
 * Do NOT classify sports facilities, turfs, courts, gyms, academies, or generic establishments as Dining.
 */
export function isAuthenticDiningVenue(place: VenueMetadataLike): boolean {
  if (!place) return false;
  const name = (place.title || place.name || "").toLowerCase();
  const sub = (place.subcategory || "").toLowerCase();
  const desc = (place.description || "").toLowerCase();
  const types: string[] = Array.isArray(place.types) ? place.types.map((t) => t.toLowerCase()) : [];

  // Ignore synthetic placeholder/fallback subcategories generated by normalizer
  const isSyntheticSub = [
    "dining venue",
    "activity venue",
    "sports facility",
    "venue",
    "movie",
  ].includes(sub);
  const cleanSub = isSyntheticSub ? "" : sub;

  // 1. HARD EXCLUSIONS: Supermarkets, liquor bottle shops, cloud kitchens, catering offices, banquet halls, and sports venues
  if (types.some((t) => HARD_EXCLUDED_DINING_TYPES.includes(t))) return false;

  // Generic retail store exclusion ONLY IF the venue lacks an authentic Google Table A dining type
  const hasPositiveDiningType = types.some((t) => GOOGLE_TABLE_A_DINING_TYPES.includes(t) || t === "bar" || t === "pub");
  if (types.includes("store") && !hasPositiveDiningType) {
    return false;
  }

  if (HARD_EXCLUDED_DINING_KEYWORDS.some((k) => name.includes(k) || cleanSub.includes(k))) {
    // Explicit food combos like "sports bar" or "turf cafe" can qualify if they are truly places to eat
    const hasExplicitFoodCombo = [
      "sports bar",
      "turf cafe",
      "sports pub",
      "restaurant",
      "bistro",
      "kitchen",
      "diner",
      "cafe",
      "brewery",
      "pub",
    ].some((k) => name.includes(k) || cleanSub.includes(k));
    if (!hasExplicitFoodCombo) return false;
  }

  // 2. POSITIVE DINING INDICATORS:
  // Must match either an official Google Table A Food & Drink type or explicit culinary keywords
  const hasDiningType = types.some((t) => GOOGLE_TABLE_A_DINING_TYPES.includes(t));

  const diningKeywords = [
    "restaurant",
    "cafe",
    "coffee",
    "bistro",
    "diner",
    "kitchen",
    "dhaba",
    "bhavan",
    "darshini",
    "sagar",
    "mess",
    "bhojanalaya",
    "biryani",
    "pizza",
    "pizzeria",
    "burger",
    "fast food",
    "fast-food",
    "fine dining",
    "bakery",
    "bakehouse",
    "patisserie",
    "cake",
    "pastry",
    "dessert",
    "ice cream",
    "gelato",
    "waffle",
    "chai",
    "tea",
    "roastery",
    "eatery",
    "tandoor",
    "grill",
    "bbq",
    "barbeque",
    "pub",
    "bar",
    "brewery",
    "brewhouse",
    "taproom",
    "lounge",
    "food court",
    "street food",
    "shawarma",
    "roll",
    "momos",
    "chaat",
    "dosa",
    "idli",
    "sweets",
    "thali",
    "canteen",
    "bites",
    "mcdonald",
    "kfc",
    "subway",
    "domino",
    "starbucks",
    "cuisine",
  ];
  // Physical street landmarks in address/vicinity (e.g. "opp Paradise Biryani", "near Starbucks")
  // must NEVER be used to classify a place as a dining venue. Match ONLY against title/name and cleanSub.
  const venueText = `${name} ${cleanSub}`.trim();
  const hasDiningKeyword = diningKeywords.some((k) => matchesKeyword(venueText, k));

  // Generic Google types like establishment / point_of_interest must NEVER be sufficient evidence
  return hasDiningType || hasDiningKeyword;
}

/**
 * ── 3. ACTIVITIES / THINGS TO DO ──
 * Only show places that represent an actual activity or experience a person can go to
 * and participate in/do.
 * Exclude: offices, retail stores, shopping centres (without activities), pure sports pitches/turfs,
 * and misclassified water plants / utilities.
 */
export function isAuthenticActivityVenue(place: VenueMetadataLike): boolean {
  return isStrictActivityVenue(place);
}

/**
 * ── 4. CANONICAL VENUE CATEGORY CLASSIFIER ──
 * Classifies a place into its single authentic Planless category using strong evidence.
 */
export function classifyVenueCategory(
  place: VenueMetadataLike
): "SPORTS" | "DINING" | "ACTIVITIES" | "MOVIES" | null {
  if (!place) return null;
  const types: string[] = Array.isArray(place.types) ? place.types.map((t) => t.toLowerCase()) : [];
  const name = (place.title || place.name || "").toLowerCase();

  // 1. Movies (cinemas, movie theaters, multiplexes, imax)
  if (
    types.includes("movie") ||
    types.includes("movie_theater") ||
    name.includes("cinema") ||
    name.includes("multiplex") ||
    name.includes("imax") ||
    name.includes("talkies")
  ) {
    return "MOVIES";
  }

  // 2. Playable Sports (turfs, courts, grounds, arenas, stadiums, swimming pools, academies)
  if (isPlayableSportsVenue(place)) {
    return "SPORTS";
  }

  // 3. Authentic Activities (bowling, escape rooms, amusement parks, gaming zones, karting)
  if (isAuthenticActivityVenue(place)) {
    return "ACTIVITIES";
  }

  // 4. Authentic Dining (restaurants, cafes, bakeries, pubs, eateries)
  if (isAuthenticDiningVenue(place)) {
    return "DINING";
  }

  return null;
}

/**
 * ── 5. MASTER VENUE RELEVANCE CHECK ──
 * Answers: "Can a user realistically go to this place to eat, play, or do an activity?"
 */
export function isRelevantVenueForCategory(
  place: VenueMetadataLike,
  targetCategory: "SPORTS" | "DINING" | "ACTIVITIES" | "MOVIES" | "ALL" | string
): boolean {
  if (!place) return false;
  const cat = targetCategory.toUpperCase();

  if (cat === "SPORTS") {
    return isPlayableSportsVenue(place);
  }
  if (cat === "DINING") {
    return isAuthenticDiningVenue(place);
  }
  if (cat === "ACTIVITIES") {
    return isAuthenticActivityVenue(place);
  }
  if (cat === "MOVIES") {
    return true;
  }
  if (cat === "ALL") {
    return (
      isPlayableSportsVenue(place) ||
      isAuthenticDiningVenue(place) ||
      isAuthenticActivityVenue(place)
    );
  }

  return false;
}

/**
 * ── 6. OWNER-POSTED PHOTO RELEVANCE CHECK ──
 * Ensures that only venues with authentic owner-posted photos from Google Places
 * are displayed in Planless discovery. Customer photos and generic placeholders
 * are strictly prohibited from qualifying a venue.
 */

function cleanAttributionHtml(html: string): string {
  return (html || "").replace(/<[^>]*>/g, "").trim();
}

function normalizeAuthorToken(str: string): string {
  return (str || "")
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_AUTHOR_VENUE_TOKENS = new Set([
  "the", "and", "or", "of", "in", "at", "by", "for", "with",
  "restaurant", "restaurants", "cafe", "cafes", "bistro", "lounge", "bar", "pub",
  "hotel", "resort", "park", "parks", "center", "centre", "arena", "club", "house",
  "bangalore", "bengaluru", "sports", "indoor", "outdoor", "ground", "turf",
  "zone", "gaming", "arcade", "bowling", "escape", "room", "rooms", "play",
  "coffee", "tea", "food", "foods", "kitchen", "bakery", "bakes", "pizza",
  "burger", "biryani", "dosa", "sweets", "ice", "cream", "water", "juice",
  "fitness", "gym", "store", "shop", "place", "hub", "station", "point"
]);

export function isOwnerAuthor(venueName: string, authorName: string): boolean {
  if (!venueName || !authorName) return false;
  const vNorm = normalizeAuthorToken(venueName);
  const aNorm = normalizeAuthorToken(authorName);
  if (!vNorm || !aNorm) return false;

  // 1. Direct exact or substring match
  if (vNorm === aNorm) return true;
  if (vNorm.includes(aNorm) && aNorm.length >= 4) return true;
  if (aNorm.includes(vNorm) && vNorm.length >= 4) return true;

  // 2. Distinctive token matching
  const vTokens = vNorm.split(/\s+/).filter((t) => t.length >= 3 && !GENERIC_AUTHOR_VENUE_TOKENS.has(t));
  const aTokens = aNorm.split(/\s+/).filter((t) => t.length >= 3 && !GENERIC_AUTHOR_VENUE_TOKENS.has(t));

  if (vTokens.length === 0 || aTokens.length === 0) return false;

  // Check if first major brand token matches (e.g. "Toit" in "Toit Indiranagar")
  const brandToken = vTokens[0];
  if (brandToken.length >= 3 && aTokens.includes(brandToken)) {
    return true;
  }

  // Check multi-token overlap
  const common = vTokens.filter((t) => aTokens.includes(t));
  if (common.length >= 2) return true;

  return false;
}

export function extractOwnerPhotos(
  venueName: string,
  photos?: any[] | null
): Array<{ photoReference: string; authorName: string }> {
  if (!Array.isArray(photos) || photos.length === 0) return [];
  const ownerPhotos: Array<{ photoReference: string; authorName: string }> = [];

  for (const ph of photos) {
    let author = "";
    if (ph.authorAttributions && ph.authorAttributions.length > 0) {
      author = ph.authorAttributions[0].displayName || "";
    } else if (ph.html_attributions && ph.html_attributions.length > 0) {
      author = cleanAttributionHtml(ph.html_attributions[0]);
    }

    if (isOwnerAuthor(venueName, author)) {
      const ref = ph.name?.includes("/photos/")
        ? ph.name.split("/photos/")[1]
        : ph.photo_reference || ph.name || "";
      if (ref) {
        ownerPhotos.push({ photoReference: ref, authorName: author });
      }
    }
  }

  return ownerPhotos;
}

const brokenPhotoUrlsSet = new Set<string>();

export function markPhotoUrlBroken(url?: string | null): void {
  if (url && typeof url === "string") {
    brokenPhotoUrlsSet.add(url.trim().toLowerCase());
  }
}

export function isPhotoUrlBroken(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  return brokenPhotoUrlsSet.has(url.trim().toLowerCase());
}

export function resetBrokenPhotoRegistry(): void {
  brokenPhotoUrlsSet.clear();
}

export function isPlaceholderImageUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return true;
  const lower = url.toLowerCase().trim();
  if (!lower) return true;

  // Broken or malformed query string parameters
  if (
    lower.includes("photo_reference=undefined") ||
    lower.includes("photo_reference=null") ||
    lower.includes("photo_reference=&") ||
    lower.endsWith("photo_reference=")
  ) {
    return true;
  }

  // Runtime registered broken URLs
  if (isPhotoUrlBroken(url)) {
    return true;
  }

  // Generic assets, curated category fallbacks, and placeholders
  // Curated category artwork (/assets/curated/) is a fallback image, NEVER a real venue photo.
  return (
    lower.includes("/assets/") ||
    lower.includes("placeholder") ||
    lower.includes("planimagedefault") ||
    lower.includes("default-") ||
    lower.includes("no-image")
  );
}

export function hasOwnerPostedPhoto(place: any, allowCurated = false): boolean {
  if (!place) return false;
  const category = (place.category || "").toUpperCase();
  // Movies use TMDB poster paths, exempt from Google owner photo rule
  if (category === "MOVIES" || place.movie_id) return true;

  // 1. Admin Overrides: An admin-selected photo is explicitly approved and human-verified.
  // It must NEVER be rejected by automated Google author attribution rules.
  const placeId = place.place_id || (typeof place.id === "string" ? place.id : null);
  if (
    place._hasPlanlessOverride ||
    Boolean(place.google_photo_reference) ||
    Boolean(place.image_path) ||
    (placeId && hasPlacePhotoOverride(placeId))
  ) {
    if (!isPlaceholderImageUrl(place.cover_image_url)) {
      return true;
    }
  }

  const venueName = place.title || place.name || "";

  // If place has a curated subcategory photo and allowCurated is explicitly true: accept
  if (allowCurated && typeof place.cover_image_url === "string" && place.cover_image_url.includes("/assets/curated/")) {
    return true;
  }

  // If the place has raw photos array with author attributions, verify directly
  if (Array.isArray(place.photos) && place.photos.length > 0) {
    const ownerPhotos = extractOwnerPhotos(venueName, place.photos);
    if (ownerPhotos.length > 0) return true;
    // If only customer photos are present and no curated cover is set, reject!
    if (!allowCurated || !place.cover_image_url?.includes("/assets/curated/")) {
      return false;
    }
  }

  // If place was processed by backend discoveryPlaces, it has photo_references containing owner photos
  // AND a non-placeholder cover_image_url.
  if (isPlaceholderImageUrl(place.cover_image_url)) {
    return false;
  }

  if (
    Array.isArray(place.photo_references) &&
    place.photo_references.length > 0 &&
    Boolean(place.cover_image_url)
  ) {
    return true;
  }

  if (
    typeof place.cover_image_url === "string" &&
    (place.cover_image_url.includes("action=photo") ||
      place.cover_image_url.includes("googleusercontent.com") ||
      place.cover_image_url.includes("maps.googleapis.com") ||
      place.cover_image_url.includes("/storage/v1/object/") ||
      place.cover_image_url.includes("supabase.co"))
  ) {
    return true;
  }

  return false;
}

export interface ResolvedVenuePhoto {
  hasValidPhoto: boolean;
  resolvedUrl: string | null;
}

/**
 * Resolves the venue's image using the existing Planless image pipeline:
 * 1. Checks current cover_image_url (if valid and not a placeholder/broken).
 * 2. Checks database overrides (image_path or google_photo_reference from override cache or object).
 * 3. Checks Google Places authentic owner photos (photo_references or photos array with owner attribution).
 *
 * If valid photo is found, attaches resolvedUrl to place.cover_image_url and returns { hasValidPhoto: true, resolvedUrl }.
 * If resolution fails or yields a placeholder/fallback/broken URL, sets place.cover_image_url to null and returns { hasValidPhoto: false, resolvedUrl: null }.
 */
export function resolveAndValidateVenuePhoto(
  place: any,
  photoBaseUrl?: string
): ResolvedVenuePhoto {
  if (!place) {
    return { hasValidPhoto: false, resolvedUrl: null };
  }

  const category = (place.category || "").toUpperCase();
  // Movies use TMDB posters/backdrops and are exempt from venue photo rules
  if (category === "MOVIES" || place.movie_id) {
    const movieCover = place.cover_image_url || place.poster_url || place.backdrop_url || null;
    return { hasValidPhoto: Boolean(movieCover), resolvedUrl: movieCover };
  }

  const baseUrl = photoBaseUrl || `${SUPABASE_URL}/functions/v1/maps`;
  const placeId = extractCleanPlaceId(place.place_id || place.id || "");

  // 1. If place already has a valid non-placeholder, non-broken cover_image_url:
  if (
    typeof place.cover_image_url === "string" &&
    place.cover_image_url.trim().length > 0 &&
    !isPlaceholderImageUrl(place.cover_image_url)
  ) {
    return { hasValidPhoto: true, resolvedUrl: place.cover_image_url };
  }

  // 2. Check Database Overrides (from place properties or overrides cache)
  const overrideRef =
    place.google_photo_reference ||
    (placeId ? getPlacePhotoOverride(placeId)?.google_photo_reference : null);

  if (overrideRef && typeof overrideRef === "string" && !isPlaceholderImageUrl(overrideRef)) {
    const constructedUrl = `${baseUrl}?action=photo&photo_reference=${encodeURIComponent(
      overrideRef
    )}&maxwidth=800${placeId ? `&place_id=${encodeURIComponent(placeId)}` : ""}`;
    if (!isPlaceholderImageUrl(constructedUrl)) {
      place.cover_image_url = constructedUrl;
      return { hasValidPhoto: true, resolvedUrl: constructedUrl };
    }
  }

  const overrideImagePath =
    place.image_path ||
    (placeId ? getPlacePhotoOverride(placeId)?.image_path : null);

  if (
    typeof overrideImagePath === "string" &&
    overrideImagePath.trim().length > 0 &&
    !isPlaceholderImageUrl(overrideImagePath)
  ) {
    let storageUrl = overrideImagePath;
    if (!storageUrl.startsWith("http://") && !storageUrl.startsWith("https://") && !storageUrl.startsWith("/")) {
      storageUrl = `${SUPABASE_URL}/storage/v1/object/public/${storageUrl}`;
    }
    if (!isPlaceholderImageUrl(storageUrl)) {
      place.cover_image_url = storageUrl;
      return { hasValidPhoto: true, resolvedUrl: storageUrl };
    }
  }

  // 3. Check Google Places Authentic Owner Photos
  // First, check already extracted photo_references
  if (Array.isArray(place.photo_references) && place.photo_references.length > 0) {
    const firstRef = place.photo_references[0];
    if (firstRef && typeof firstRef === "string" && !isPlaceholderImageUrl(firstRef)) {
      const constructedUrl = `${baseUrl}?action=photo&photo_reference=${encodeURIComponent(
        firstRef
      )}&maxwidth=800${placeId ? `&place_id=${encodeURIComponent(placeId)}` : ""}`;
      if (!isPlaceholderImageUrl(constructedUrl)) {
        place.cover_image_url = constructedUrl;
        return { hasValidPhoto: true, resolvedUrl: constructedUrl };
      }
    }
  }

  // Next, check raw photos array with author attributions
  const venueName = place.title || place.name || "";
  if (Array.isArray(place.photos) && place.photos.length > 0) {
    const ownerPhotos = extractOwnerPhotos(venueName, place.photos);
    if (ownerPhotos.length > 0) {
      const firstRef = ownerPhotos[0].photoReference;
      if (firstRef && typeof firstRef === "string" && !isPlaceholderImageUrl(firstRef)) {
        const constructedUrl = `${baseUrl}?action=photo&photo_reference=${encodeURIComponent(
          firstRef
        )}&maxwidth=800${placeId ? `&place_id=${encodeURIComponent(placeId)}` : ""}`;
        if (!isPlaceholderImageUrl(constructedUrl)) {
          place.cover_image_url = constructedUrl;
          if (!place.photo_references) {
            place.photo_references = ownerPhotos.map((p) => p.photoReference);
          }
          return { hasValidPhoto: true, resolvedUrl: constructedUrl };
        }
      }
    }
  }

  // Image resolution failed or only placeholder/fallback photos were found
  place.cover_image_url = null;
  return { hasValidPhoto: false, resolvedUrl: null };
}

/**
 * Checks if a venue has a valid, real photo using the existing resolution pipeline.
 * If valid, updates place.cover_image_url with the resolved photo URL.
 * If resolution fails or yields a fallback/placeholder, returns false.
 */
export function hasValidRealVenuePhoto(place: any, photoBaseUrl?: string): boolean {
  return resolveAndValidateVenuePhoto(place, photoBaseUrl).hasValidPhoto;
}

export { getCuratedPhotoForVenue, CURATED_CATEGORY_PHOTOS } from "./curatedPhotos";


