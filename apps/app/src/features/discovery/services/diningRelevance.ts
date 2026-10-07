/**
 * diningRelevance.ts
 *
 * Dedicated Planless dining relevance layer based strictly on Google Places API (New)
 * official Table A place types and structured categories.
 *
 * Mirrors the architecture of sportsRelevance.ts:
 * 1. Curated, intent-driven Google Places queries paired with official `includedType` filters.
 * 2. Whitelist of all official Google Places API (New) Table A "Food and Drink" types.
 * 3. Strict hard exclusions (liquor stores, cloud kitchens without seating, catering offices,
 *    supermarkets, banquet halls, lodging without dining, and sports facilities).
 * 4. Helper predicates for authentic dining classification and subcategory mapping.
 */

import { DiscoveryItem } from "../../../core/types/discovery";
import { VenueMetadataLike } from "./venueRelevance";

export type DiningCategoryId =
  | "all"
  | "restaurants"
  | "cafes"
  | "pubs-bars"
  | "bakeries-desserts"
  | "fine-dining"
  | "quick-bites"
  | "other";

export interface DiningSearchConfig {
  id: DiningCategoryId;
  label: string;
  searchQueries: string[];
  googleIncludedType: string;
  relevantGoogleTypes: string[];
  strongPositiveKeywords: string[];
}

/**
 * Official Google Places API (New) Table A "Food and Drink" Place Types.
 * Source: https://developers.google.com/maps/documentation/places/web-service/place-types
 */
export const GOOGLE_TABLE_A_DINING_TYPES: readonly string[] = [
  // Full-service & casual restaurants
  "restaurant",
  "fine_dining_restaurant",
  "diner",
  "family_restaurant",
  "buffet_restaurant",
  "brunch_restaurant",
  "breakfast_restaurant",

  // Cafes & beverage establishments
  "cafe",
  "coffee_shop",
  "tea_house",

  // Pubs, bars & microbreweries
  "bar",
  "pub",
  "brewpub",
  "wine_bar",
  "cocktail_bar",

  // Bakeries & dessert parlours
  "bakery",
  "dessert_shop",
  "dessert_restaurant",
  "ice_cream_shop",

  // Quick bites & fast casual
  "fast_food_restaurant",
  "pizza_restaurant",
  "sandwich_shop",
  "hamburger_restaurant",
  "juice_shop",
  "food_court",

  // Cuisine-specific Table A types returned by Google
  "indian_restaurant",
  "south_indian_restaurant",
  "north_indian_restaurant",
  "biryani_restaurant",
  "dhaba",
  "sweet_shop",
  "italian_restaurant",
  "asian_restaurant",
  "chinese_restaurant",
  "japanese_restaurant",
  "korean_restaurant",
  "thai_restaurant",
  "mexican_restaurant",
  "middle_eastern_restaurant",
  "mediterranean_restaurant",
  "seafood_restaurant",
  "barbecue_restaurant",
  "steak_house",
  "sushi_restaurant",
  "ramen_restaurant",
  "vegetarian_restaurant",
  "vegan_restaurant",
  "american_restaurant",
  "brazilian_restaurant",
  "french_restaurant",
  "greek_restaurant",
  "indonesian_restaurant",
  "lebanese_restaurant",
  "spanish_restaurant",
  "turkish_restaurant",
  "vietnamese_restaurant",
] as const;

export const DINING_CONFIGS: Record<DiningCategoryId, DiningSearchConfig> = {
  all: {
    id: "all",
    label: "All Dining",
    searchQueries: [
      "restaurants",
      "cafe coffee shop roastery",
      "brewery pub taproom bar",
      "bakery patisserie dessert parlour",
      "fine dining lounge",
      "burger pizza fast food roll",
    ],
    googleIncludedType: "restaurant",
    relevantGoogleTypes: [...GOOGLE_TABLE_A_DINING_TYPES],
    strongPositiveKeywords: ["restaurant", "cafe", "coffee", "bistro", "pub", "bar", "brewery", "bakery", "diner"],
  },
  restaurants: {
    id: "restaurants",
    label: "Restaurants",
    searchQueries: [
      "restaurants",
      "casual dining restaurant",
      "family dining restaurant",
      "bistro kitchen restaurant",
    ],
    googleIncludedType: "restaurant",
    relevantGoogleTypes: [
      "restaurant",
      "family_restaurant",
      "buffet_restaurant",
      "brunch_restaurant",
      "breakfast_restaurant",
      "diner",
      "indian_restaurant",
      "italian_restaurant",
      "asian_restaurant",
      "chinese_restaurant",
      "japanese_restaurant",
      "thai_restaurant",
      "mexican_restaurant",
      "mediterranean_restaurant",
      "seafood_restaurant",
      "vegetarian_restaurant",
    ],
    strongPositiveKeywords: [
      "restaurant",
      "bistro",
      "kitchen",
      "dhaba",
      "bhavan",
      "darshini",
      "sagar",
      "mess",
      "bhojanalaya",
      "biryani",
      "thali",
      "curry",
      "dosa",
    ],
  },
  cafes: {
    id: "cafes",
    label: "Cafes & Coffee",
    searchQueries: [
      "cafe coffee shop roastery",
      "specialty coffee cafe",
      "artisan cafe tea house",
    ],
    googleIncludedType: "cafe",
    relevantGoogleTypes: ["cafe", "coffee_shop", "tea_house"],
    strongPositiveKeywords: [
      "cafe",
      "coffee",
      "roastery",
      "espresso",
      "brew",
      "tea house",
      "chai",
      "latte",
      "cappuccino",
    ],
  },
  "pubs-bars": {
    id: "pubs-bars",
    label: "Breweries & Pubs",
    searchQueries: [
      "brewery pub taproom bar",
      "microbrewery gastropub",
      "craft beer brewery",
      "cocktail bar lounge",
    ],
    googleIncludedType: "bar",
    relevantGoogleTypes: ["bar", "pub", "brewpub", "wine_bar", "cocktail_bar"],
    strongPositiveKeywords: [
      "brewery",
      "microbrewery",
      "pub",
      "taproom",
      "brewhouse",
      "craft beer",
      "gastropub",
      "cocktail",
      "lounge",
      "bar",
    ],
  },
  "bakeries-desserts": {
    id: "bakeries-desserts",
    label: "Bakeries & Desserts",
    searchQueries: [
      "bakery patisserie dessert parlour",
      "artisan bakery bakehouse",
      "ice cream parlour gelato",
      "dessert studio waffle",
    ],
    googleIncludedType: "bakery",
    relevantGoogleTypes: [
      "bakery",
      "dessert_shop",
      "dessert_restaurant",
      "ice_cream_shop",
    ],
    strongPositiveKeywords: [
      "bakery",
      "bakehouse",
      "patisserie",
      "cake",
      "pastry",
      "dessert",
      "ice cream",
      "gelato",
      "waffle",
      "sweets",
      "chocolate",
    ],
  },
  "fine-dining": {
    id: "fine-dining",
    label: "Fine Dining",
    searchQueries: [
      "fine dining lounge",
      "gourmet fine dining restaurant",
      "rooftop fine dining lounge",
    ],
    googleIncludedType: "fine_dining_restaurant",
    relevantGoogleTypes: ["fine_dining_restaurant", "steak_house"],
    strongPositiveKeywords: [
      "fine dining",
      "gourmet",
      "tasting menu",
      "luxury dining",
      "chef's table",
      "steakhouses",
    ],
  },
  "quick-bites": {
    id: "quick-bites",
    label: "Quick Bites",
    searchQueries: [
      "burger pizza fast food roll",
      "pizzeria burger joint",
      "shawarma roll momos chaat",
      "sandwich shop food court",
    ],
    googleIncludedType: "fast_food_restaurant",
    relevantGoogleTypes: [
      "fast_food_restaurant",
      "pizza_restaurant",
      "sandwich_shop",
      "hamburger_restaurant",
      "juice_shop",
      "food_court",
    ],
    strongPositiveKeywords: [
      "pizza",
      "pizzeria",
      "burger",
      "fast food",
      "shawarma",
      "roll",
      "momos",
      "chaat",
      "sandwich",
      "quick bites",
      "food court",
    ],
  },
  other: {
    id: "other",
    label: "Other Eateries",
    searchQueries: ["popular eateries food"],
    googleIncludedType: "restaurant",
    relevantGoogleTypes: [...GOOGLE_TABLE_A_DINING_TYPES],
    strongPositiveKeywords: ["eatery", "canteen", "bites", "food"],
  },
};

/**
 * ── HARD EXCLUDED TYPES FOR DINING ──
 * Establishments that sell food or drinks but are NOT places to go out and dine/eat/drink.
 */
export const HARD_EXCLUDED_DINING_TYPES: readonly string[] = [
  // Retail alcohol bottle shops (strictly takeaway retail, no seating/drinking on premise)
  "liquor_store",

  // Delivery-only / ghost / dark kitchens (no dine-in customer seating)
  "meal_delivery",

  // Commercial food supplies & catering services
  "caterer",
  "wholesale_grocer",

  // Retail grocery & supermarkets
  "grocery_or_supermarket",
  "supermarket",
  "convenience_store",
  "department_store",
  "home_goods_store",
  "clothing_store",
  "shoe_store",

  // Services & corporate utilities
  "gas_station",
  "car_repair",
  "pharmacy",
  "hospital",
  "bank",
  "atm",
  "real_estate_agency",
  "travel_agency",
  "storage",
  "wholesaler",
  "post_office",
  "school",
  "university",

  // Event halls & venues
  "banquet_hall",
  "wedding_venue",

  // Sports & fitness venues (must NEVER leak into Dining)
  "sports_complex",
  "stadium",
  "athletic_field",
  "sports_club",
  "gym",
  "fitness_center",
  "sports_activity_location",
  "sports_school",
  "sports_coaching",
  "swimming_pool",
  "golf_course",
  "ice_skating_rink",
] as const;

/**
 * ── HARD EXCLUDED KEYWORDS FOR DINING ──
 */
export const HARD_EXCLUDED_DINING_KEYWORDS: readonly string[] = [
  // Retail grocery & wholesale
  "supermarket",
  "hypermarket",
  "grocery",
  "groceries",
  "provisions",
  "general store",
  "kirana",
  "departmental store",
  "department store",
  "ration",
  "mart",
  "organic store",
  "wholesale",
  "wholesaler",
  "trader",
  "distributor",
  "fmcg",
  "packaging",
  "enterprises",
  "feed store",
  "agro food",
  "pet food",
  "warehouse",

  // Retail liquor / bottle shops (not bars/pubs)
  "wine shop",
  "liquor shop",
  "liquor store",
  "wine store",
  "mrp outlet",
  "beverages store",
  "tasmac",
  "mrp wine",
  "mrp liquor",

  // Commercial catering offices & industrial kitchens
  "caterers office",
  "catering office",
  "catering services",
  "commercial kitchen",
  "commissary kitchen",
  "cloud kitchen hub",
  "dark kitchen",

  // Event / wedding / function halls
  "banquet hall",
  "convention hall",
  "kalyana mantapa",
  "marriage hall",
  "wedding hall",
  "party hall only",

  // Corporate offices & non-dining business entities
  "consultancy",
  "hardware",
  "opticals",
  "footwear",
  "chemist",
  "tailor",
  "garments",
  "machinery",
  "pvt ltd",
  "private limited",
  "corporate office",
  "headquarters",

  // Sports terms that disqualify non-sports-bar venues
  "matchday",
  "sports zone",
  "sports arena",
  "turf club",
  "playfield",
  "turf",
  "football",
  "futsal",
  "soccer",
  "badminton",
  "pickleball",
  "tennis court",
  "cricket",
  "basketball court",
  "sports academy",
  "football academy",
  "badminton academy",
  "sports club",
  "sports complex",
  "sports facility",
  "swimming pool",
  "skate park",
  "skating rink",
  "athletics",
  "fitness centre",
  "fitness center",
  "gymnasium",
  "sporting goods",
] as const;

/**
 * Normalizes and extracts a human-friendly dining subcategory from Google Places metadata.
 */
export function extractDiningSubcategory(item: VenueMetadataLike): string {
  const types = Array.isArray(item.types) ? item.types.map((t) => t.toLowerCase()) : [];
  const rawSub = (item.subcategory || "").toLowerCase();
  const name = (item.title || item.name || "").toLowerCase();

  // 1. Breweries & Pubs
  if (
    types.some((t) => ["brewpub", "pub", "bar", "wine_bar", "cocktail_bar"].includes(t)) ||
    ["brewery", "microbrewery", "pub", "taproom", "bar"].some((k) => name.includes(k) || rawSub.includes(k))
  ) {
    if (name.includes("brewery") || name.includes("microbrewery") || types.includes("brewpub")) {
      return "Microbrewery";
    }
    return "Pub & Bar";
  }

  // 2. Cafes & Coffee
  if (
    types.some((t) => ["cafe", "coffee_shop", "tea_house"].includes(t)) ||
    ["cafe", "coffee", "roastery", "tea house"].some((k) => name.includes(k) || rawSub.includes(k))
  ) {
    return "Cafe";
  }

  // 3. Bakeries & Desserts
  if (
    types.some((t) => ["bakery", "dessert_shop", "dessert_restaurant", "ice_cream_shop"].includes(t)) ||
    ["bakery", "patisserie", "cake", "ice cream", "gelato", "dessert", "waffle"].some(
      (k) => name.includes(k) || rawSub.includes(k)
    )
  ) {
    if (name.includes("ice cream") || name.includes("gelato") || types.includes("ice_cream_shop")) {
      return "Ice Cream & Desserts";
    }
    return "Bakery & Desserts";
  }

  // 4. Fine Dining
  if (
    types.includes("fine_dining_restaurant") ||
    ["fine dining", "gourmet", "steak house"].some((k) => name.includes(k) || rawSub.includes(k))
  ) {
    return "Fine Dining";
  }

  // 5. Quick Bites & Casual Fast Food
  if (
    types.some((t) => ["fast_food_restaurant", "pizza_restaurant", "sandwich_shop", "hamburger_restaurant"].includes(t)) ||
    ["pizza", "pizzeria", "burger", "fast food", "shawarma", "momos", "chaat"].some(
      (k) => name.includes(k) || rawSub.includes(k)
    )
  ) {
    if (name.includes("pizza") || types.includes("pizza_restaurant")) return "Pizzeria";
    if (name.includes("burger") || types.includes("hamburger_restaurant")) return "Burger Joint";
    return "Quick Bites";
  }

  // 6. Regional / Cuisine Specific
  if (types.includes("indian_restaurant") || ["biryani", "dhaba", "bhavan", "darshini", "sagar", "thali"].some((k) => name.includes(k))) {
    return "Indian Restaurant";
  }
  if (types.includes("asian_restaurant") || types.includes("chinese_restaurant") || types.includes("japanese_restaurant")) {
    return "Asian & Pan-Asian";
  }
  if (types.includes("italian_restaurant")) {
    return "Italian";
  }

  // Default clean fallback
  return "Restaurant";
}
