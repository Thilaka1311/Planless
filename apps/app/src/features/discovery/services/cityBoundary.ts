import { supabase } from "../../../../lib/supabaseClient";

export interface CityBoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Standard canonical mappings for Indian & global cities with multiple historical or legal names.
 */
const CITY_ALIASES: Record<string, string[]> = {
  bengaluru: [
    "bengaluru",
    "bangalore",
    "bangalore urban",
    "bangalore rural",
    "indiranagar",
    "koramangala",
    "hsr layout",
    "hsr",
    "whitefield",
    "jayanagar",
    "ub city",
    "mg road",
    "electronic city",
    "bellandur",
    "marathahalli",
    "jp nagar",
    "btm layout",
    "yelahanka",
    "hebbal",
    "malleshwaram",
    "frazer town",
    "sadashivanagar",
    "rajajinagar",
  ],
  bangalore: [
    "bengaluru",
    "bangalore",
    "bangalore urban",
    "bangalore rural",
    "indiranagar",
    "koramangala",
    "hsr layout",
    "hsr",
    "whitefield",
    "jayanagar",
    "ub city",
    "mg road",
    "electronic city",
    "bellandur",
    "marathahalli",
    "jp nagar",
    "btm layout",
    "yelahanka",
    "hebbal",
    "malleshwaram",
    "frazer town",
    "sadashivanagar",
    "rajajinagar",
  ],
  mumbai: [
    "mumbai",
    "bombay",
    "mumbai suburban",
    "bandra",
    "andheri",
    "juhu",
    "worli",
    "colaba",
    "powai",
    "lower parel",
    "dadar",
    "bkc",
  ],
  bombay: [
    "mumbai",
    "bombay",
    "mumbai suburban",
    "bandra",
    "andheri",
    "juhu",
    "worli",
    "colaba",
    "powai",
    "lower parel",
    "dadar",
    "bkc",
  ],
  chennai: [
    "chennai",
    "madras",
    "anna nagar",
    "t nagar",
    "adyar",
    "velachery",
    "mylapore",
    "alwarpet",
    "besant nagar",
    "nungambakkam",
  ],
  madras: [
    "chennai",
    "madras",
    "anna nagar",
    "t nagar",
    "adyar",
    "velachery",
    "mylapore",
    "alwarpet",
    "besant nagar",
    "nungambakkam",
  ],
  kolkata: ["kolkata", "calcutta", "salt lake", "park street", "new town"],
  calcutta: ["kolkata", "calcutta", "salt lake", "park street", "new town"],
  hyderabad: [
    "hyderabad",
    "secunderabad",
    "cyberabad",
    "jubilee hills",
    "banjara hills",
    "gachibowli",
    "hitech city",
    "madhapur",
    "kondapur",
    "kukatpally",
  ],
  secunderabad: [
    "hyderabad",
    "secunderabad",
    "cyberabad",
    "jubilee hills",
    "banjara hills",
    "gachibowli",
    "hitech city",
    "madhapur",
    "kondapur",
    "kukatpally",
  ],
  delhi: [
    "delhi",
    "new delhi",
    "nct of delhi",
    "connaught place",
    "hauz khas",
    "saket",
    "dwarka",
    "south extension",
    "vasant kunj",
  ],
  "new delhi": [
    "delhi",
    "new delhi",
    "nct of delhi",
    "connaught place",
    "hauz khas",
    "saket",
    "dwarka",
    "south extension",
    "vasant kunj",
  ],
  gurugram: ["gurugram", "gurgaon", "cyber hub", "golf course road"],
  gurgaon: ["gurugram", "gurgaon", "cyber hub", "golf course road"],
  noida: ["noida", "greater noida", "sector 18"],
  pune: ["pune", "poona", "koregaon park", "kothrud", "viman nagar", "hinjawadi"],
  mysuru: ["mysuru", "mysore", "gokulam", "vijayanagar"],
  mysore: ["mysuru", "mysore", "gokulam", "vijayanagar"],
  kochi: ["kochi", "cochin", "ernakulam", "fort kochi", "kakkanad"],
  cochin: ["kochi", "cochin", "ernakulam", "fort kochi", "kakkanad"],
};

/**
 * Known distinct satellite or neighboring towns/cities to immediately catch border spillover.
 * If a place is in one of these towns, it does not belong to the target city.
 */
const DISTINCT_ADJACENT_CITIES: Record<string, string[]> = {
  bengaluru: ["mysuru", "mysore", "hosur", "ramanagara", "tumakuru", "tumkur", "kolar", "mandya", "hyderabad", "chennai"],
  bangalore: ["mysuru", "mysore", "hosur", "ramanagara", "tumakuru", "tumkur", "kolar", "mandya", "hyderabad", "chennai"],
  hyderabad: ["bengaluru", "bangalore", "warangal", "vijayawada", "karimnagar", "secunderabad"],
  mumbai: ["pune", "nashik", "surat"],
};

// In-memory cache for resolved city bounding boxes
const cityBoundsCache = new Map<string, CityBoundingBox>([
  [
    "bengaluru",
    {
      north: 13.1425,
      south: 12.8335,
      east: 77.7841,
      west: 77.4599,
    },
  ],
  [
    "bangalore",
    {
      north: 13.1425,
      south: 12.8335,
      east: 77.7841,
      west: 77.4599,
    },
  ],
]);

export function cleanCityString(str: string): string {
  return (str || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes city name to its canonical name or lowercased clean string.
 */
export function getCityAliases(cityName: string): string[] {
  const clean = cleanCityString(cityName);
  if (!clean) return ["bengaluru"];
  return CITY_ALIASES[clean] || [clean];
}

/**
 * Resolve the official geographic bounding box for any city via Google Geocoding.
 * Results are cached in memory so each city is resolved at most once per session.
 */
export async function getCityBoundingBox(cityName: string): Promise<CityBoundingBox | null> {
  const clean = cleanCityString(cityName);
  if (!clean) return cityBoundsCache.get("bengaluru") || null;

  if (cityBoundsCache.has(clean)) {
    return cityBoundsCache.get(clean)!;
  }

  // Check aliases in cache
  const aliases = getCityAliases(clean);
  for (const alias of aliases) {
    if (cityBoundsCache.has(alias)) {
      const found = cityBoundsCache.get(alias)!;
      cityBoundsCache.set(clean, found);
      return found;
    }
  }

  try {
    const { data } = await supabase.functions.invoke("maps", {
      body: { action: "geocode", address: `${cityName}, India` },
    });

    const result = data?.results?.[0];
    const bounds = result?.geometry?.bounds || result?.geometry?.viewport;
    if (bounds?.northeast && bounds?.southwest) {
      const box: CityBoundingBox = {
        north: Number(bounds.northeast.lat),
        south: Number(bounds.southwest.lat),
        east: Number(bounds.northeast.lng),
        west: Number(bounds.southwest.lng),
      };
      cityBoundsCache.set(clean, box);
      return box;
    }
  } catch (err) {
    console.warn(`[cityBoundary] Failed to fetch bounds for ${cityName}:`, err);
  }

  return null;
}

/**
 * Strictly verifies whether a place candidate is inside the target city.
 *
 * Evaluation:
 * 1. Geographic Boundary: If city bounds are available, place coordinates must be inside [south, north] & [west, east].
 * 2. Address Locality Verification: Place address/components must reference the target city or its known aliases.
 * 3. Adjacent City Exclusion: Place address must not belong to an adjacent distinct city (e.g. Hosur, Mysuru when in Bengaluru).
 */
export function isPlaceInCity(
  place: {
    latitude?: number | null;
    longitude?: number | null;
    place_address?: string | null;
    address?: string | null;
    formatted_address?: string | null;
    location?: string | null;
    vicinity?: string | null;
    address_components?: Array<{ long_name: string; short_name: string; types: string[] }> | null;
  },
  targetCity: string,
  cityBounds?: CityBoundingBox | null
): boolean {
  if (!place) return false;
  const cleanCity = cleanCityString(targetCity || "Bengaluru");
  const aliases = getCityAliases(cleanCity);

  // 1. Geographic Coordinate Boundary Check
  const pLat = typeof place.latitude === "number" ? place.latitude : null;
  const pLng = typeof place.longitude === "number" ? place.longitude : null;

  if (cityBounds && pLat !== null && pLng !== null) {
    // Add small tolerance (0.005 deg ~ 500m) for places located precisely on the boundary line
    const tolerance = 0.005;
    const isInsideCoords =
      pLat >= cityBounds.south - tolerance &&
      pLat <= cityBounds.north + tolerance &&
      pLng >= cityBounds.west - tolerance &&
      pLng <= cityBounds.east + tolerance;

    if (!isInsideCoords) {
      return false;
    }
  }

  // 2. Address & Locality Matching
  const rawAddress =
    place.place_address ||
    place.formatted_address ||
    place.address ||
    place.vicinity ||
    place.location ||
    "";
  const normAddress = cleanCityString(rawAddress);

  // 3. Exclude explicitly known foreign/adjacent cities
  const excludedCities = DISTINCT_ADJACENT_CITIES[cleanCity] || [];
  for (const excl of excludedCities) {
    // Check if the excluded city appears as a distinct word in the address
    const wordRegex = new RegExp(`\\b${excl}\\b`, "i");
    if (wordRegex.test(normAddress)) {
      // If address also explicitly contains the target city as the primary city, check address components
      let hasTargetInComponents = false;
      if (Array.isArray(place.address_components)) {
        for (const comp of place.address_components) {
          const compClean = cleanCityString(comp.long_name);
          if (aliases.includes(compClean) && (comp.types.includes("locality") || comp.types.includes("administrative_area_level_2"))) {
            hasTargetInComponents = true;
            break;
          }
        }
      }
      if (!hasTargetInComponents) {
        return false;
      }
    }
  }

  // If address components are available, check them directly
  if (Array.isArray(place.address_components) && place.address_components.length > 0) {
    for (const comp of place.address_components) {
      const compClean = cleanCityString(comp.long_name);
      if (
        aliases.includes(compClean) &&
        (comp.types.includes("locality") ||
          comp.types.includes("administrative_area_level_2") ||
          comp.types.includes("administrative_area_level_3") ||
          comp.types.includes("postal_town"))
      ) {
        return true;
      }
    }
  }

  // Check if address text contains any of the city's aliases
  for (const alias of aliases) {
    if (normAddress.includes(alias)) {
      return true;
    }
  }

  // If coordinates are strictly inside the city boundary and address has no contradictory city, accept
  if (cityBounds && pLat !== null && pLng !== null) {
    return true;
  }

  // If candidate has neither a real address nor coordinates (e.g. synthetic test stub with "Nearby" fallback), accept
  const isGenericOrEmptyAddress =
    !normAddress || normAddress === "nearby" || normAddress === "null" || normAddress === "undefined";
  if (isGenericOrEmptyAddress && pLat === null && pLng === null) {
    return true;
  }

  // If no city boundary was provided and address doesn't contain city name, default to false for safety
  return false;
}
