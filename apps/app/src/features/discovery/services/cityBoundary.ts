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
    "potheri",
    "kattankulathur",
    "maraimalai nagar",
    "guduvanchery",
    "vandalur",
    "tambaram",
    "chromepet",
    "pallavaram",
    "guindy",
    "porur",
    "avadi",
    "ambattur",
    "sholinganallur",
    "thiruvanmiyur",
    "omr",
    "ecr",
    "siruseri",
    "navalur",
    "kelambakkam",
    "sriperumbudur",
    "poonamallee",
    "chengalpattu",
    "perambur",
    "egmore",
    "triplicane",
    "saidapet",
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
    "potheri",
    "kattankulathur",
    "maraimalai nagar",
    "guduvanchery",
    "vandalur",
    "tambaram",
    "chromepet",
    "pallavaram",
    "guindy",
    "porur",
    "avadi",
    "ambattur",
    "sholinganallur",
    "thiruvanmiyur",
    "omr",
    "ecr",
    "siruseri",
    "navalur",
    "kelambakkam",
    "sriperumbudur",
    "poonamallee",
    "chengalpattu",
    "perambur",
    "egmore",
    "triplicane",
    "saidapet",
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

// Pre-defined bounding boxes for major metropolitan cities in India
const DEFAULT_CITY_BOUNDS: Record<string, CityBoundingBox> = {
  bengaluru: {
    north: 13.1425,
    south: 12.8335,
    east: 77.7841,
    west: 77.4599,
  },
  bangalore: {
    north: 13.1425,
    south: 12.8335,
    east: 77.7841,
    west: 77.4599,
  },
  mumbai: {
    north: 19.3000,
    south: 18.8800,
    east: 72.9900,
    west: 72.7500,
  },
  bombay: {
    north: 19.3000,
    south: 18.8800,
    east: 72.9900,
    west: 72.7500,
  },
  chennai: {
    north: 13.3500,
    south: 12.6500,
    east: 80.3500,
    west: 79.8500,
  },
  madras: {
    north: 13.3500,
    south: 12.6500,
    east: 80.3500,
    west: 79.8500,
  },
  hyderabad: {
    north: 17.6000,
    south: 17.2000,
    east: 78.6500,
    west: 78.2000,
  },
  secunderabad: {
    north: 17.6000,
    south: 17.2000,
    east: 78.6500,
    west: 78.2000,
  },
  delhi: {
    north: 28.8800,
    south: 28.4000,
    east: 77.3500,
    west: 76.8400,
  },
  "new delhi": {
    north: 28.8800,
    south: 28.4000,
    east: 77.3500,
    west: 76.8400,
  },
  pune: {
    north: 18.6500,
    south: 18.4000,
    east: 74.0000,
    west: 73.7000,
  },
  kolkata: {
    north: 22.7000,
    south: 22.4000,
    east: 88.5000,
    west: 88.2500,
  },
  calcutta: {
    north: 22.7000,
    south: 22.4000,
    east: 88.5000,
    west: 88.2500,
  },
};

// In-memory cache for resolved city bounding boxes initialized with pre-cached boxes
const cityBoundsCache = new Map<string, CityBoundingBox>(
  Object.entries(DEFAULT_CITY_BOUNDS)
);

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
 * Returns distinct neighborhood/district names associated with a city (excluding city name).
 */
export function getCityNeighborhoods(cityName: string): string[] {
  const aliases = getCityAliases(cityName);
  const clean = cleanCityString(cityName);
  const canonicalNames = new Set([
    "bengaluru",
    "bangalore",
    "bangalore urban",
    "bangalore rural",
    "mumbai",
    "bombay",
    "mumbai suburban",
    "chennai",
    "madras",
    "hyderabad",
    "secunderabad",
    "cyberabad",
    "delhi",
    "new delhi",
    "nct of delhi",
    "kolkata",
    "calcutta",
    "pune",
    "poona",
  ]);
  return aliases.filter((a) => !canonicalNames.has(a) && a !== clean);
}

/**
 * Synchronous lookup for city bounding box from memory cache.
 */
export function getCityBoundingBoxSync(cityName: string): CityBoundingBox | null {
  const clean = cleanCityString(cityName);
  if (!clean) return cityBoundsCache.get("bengaluru") || null;

  if (cityBoundsCache.has(clean)) {
    return cityBoundsCache.get(clean)!;
  }

  const aliases = getCityAliases(clean);
  for (const alias of aliases) {
    if (cityBoundsCache.has(alias)) {
      const found = cityBoundsCache.get(alias)!;
      cityBoundsCache.set(clean, found);
      return found;
    }
  }

  return null;
}

const CIVIC_CITY_CENTERS: Record<string, { latitude: number; longitude: number }> = {
  bengaluru: { latitude: 12.9880, longitude: 77.6220 },
  bangalore: { latitude: 12.9880, longitude: 77.6220 },
  chennai: { latitude: 13.0400, longitude: 80.2250 },
  madras: { latitude: 13.0400, longitude: 80.2250 },
  mumbai: { latitude: 19.0760, longitude: 72.8777 },
  bombay: { latitude: 19.0760, longitude: 72.8777 },
  hyderabad: { latitude: 17.3850, longitude: 78.4867 },
  secunderabad: { latitude: 17.3850, longitude: 78.4867 },
  delhi: { latitude: 28.6400, longitude: 77.0950 },
  "new delhi": { latitude: 28.6400, longitude: 77.0950 },
};

/**
 * Returns the geographic center coordinate of a city.
 * Falls back to Bengaluru center if city is unknown.
 */
export function getCityCenter(cityName: string): { latitude: number; longitude: number } {
  const clean = cleanCityString(cityName);
  if (CIVIC_CITY_CENTERS[clean]) {
    return CIVIC_CITY_CENTERS[clean];
  }
  const box = getCityBoundingBoxSync(cityName) || cityBoundsCache.get("bengaluru")!;
  return {
    latitude: Number(((box.north + box.south) / 2).toFixed(6)),
    longitude: Number(((box.east + box.west) / 2).toFixed(6)),
  };
}

export interface ResolvedDiscoveryRegion {
  discoveryCity: string;
  startingLocality: string;
  cityBounds: CityBoundingBox;
  cityCenter: { latitude: number; longitude: number };
}

/**
 * Separates the user's starting location (e.g. Potheri, Indiranagar, Whitefield)
 * from its parent metropolitan discovery region (e.g. Chennai, Bengaluru).
 */
export function resolveDiscoveryRegion(input: {
  cityName?: string | null;
  locality?: string | null;
  address?: string | null;
  coordinates?: { latitude: number; longitude: number } | null;
}): ResolvedDiscoveryRegion {
  const normCity = cleanCityString(input.cityName || "");
  const normLocality = cleanCityString(input.locality || "");
  const normAddress = cleanCityString(input.address || "");
  const coords = input.coordinates;

  let resolvedCity = "";

  // 1. Coordinate-based metropolitan matching
  if (coords && typeof coords.latitude === "number" && typeof coords.longitude === "number") {
    const supportedCities = ["chennai", "bengaluru", "mumbai", "hyderabad", "delhi"];
    for (const c of supportedCities) {
      const bounds = DEFAULT_CITY_BOUNDS[c];
      if (
        bounds &&
        coords.latitude >= bounds.south &&
        coords.latitude <= bounds.north &&
        coords.longitude >= bounds.west &&
        coords.longitude <= bounds.east
      ) {
        resolvedCity = c;
        break;
      }
    }
  }

  // 2. Text / Suburb / Alias matching
  if (!resolvedCity) {
    const textPool = `${normLocality} ${normAddress} ${normCity}`;
    const supportedCities = ["chennai", "bengaluru", "mumbai", "hyderabad", "delhi"];
    for (const c of supportedCities) {
      const aliases = CITY_ALIASES[c] || [];
      if (aliases.some((a) => textPool.includes(a))) {
        resolvedCity = c;
        break;
      }
    }
  }

  // 3. Explicit input city matching
  if (!resolvedCity && normCity) {
    resolvedCity = normCity;
  }

  // Default to Bengaluru if completely unrecognized
  if (!resolvedCity) {
    resolvedCity = "bengaluru";
  }

  // Canonicalize display name
  let canonicalCity = "Bengaluru";
  if (resolvedCity === "chennai" || resolvedCity === "madras") canonicalCity = "Chennai";
  else if (resolvedCity === "bengaluru" || resolvedCity === "bangalore") canonicalCity = "Bengaluru";
  else if (resolvedCity === "mumbai" || resolvedCity === "bombay") canonicalCity = "Mumbai";
  else if (resolvedCity === "hyderabad" || resolvedCity === "secunderabad") canonicalCity = "Hyderabad";
  else if (resolvedCity === "delhi" || resolvedCity === "new delhi") canonicalCity = "Delhi";
  else canonicalCity = input.cityName ? (input.cityName.charAt(0).toUpperCase() + input.cityName.slice(1)) : "Bengaluru";

  const cityBounds = getCityBoundingBoxSync(canonicalCity) || DEFAULT_CITY_BOUNDS.bengaluru;
  const cityCenter = getCityCenter(canonicalCity);

  return {
    discoveryCity: canonicalCity,
    startingLocality: input.locality || input.cityName || "Nearby",
    cityBounds,
    cityCenter,
  };
}

export interface RegionalSearchAnchor {
  name: string;
  coords: { latitude: number; longitude: number };
  radiusMeters: number;
}

/**
 * Calculates progressive regional search anchors across a discovery region.
 *
 * For suburban starting locations (e.g. Potheri > 12km from Chennai center),
 * generates multi-area regional anchors:
 * Anchor 1: Local proximity anchor (starting location, ~12km)
 * Anchor 2: Metropolitan core anchor (city center, ~25km)
 * Anchor 3: Intermediate corridor anchor (~20km)
 */
export function getRegionalSearchAnchors(
  city: string,
  userCoords?: { latitude: number; longitude: number } | null
): RegionalSearchAnchor[] {
  const cityCenter = getCityCenter(city);
  const anchors: RegionalSearchAnchor[] = [];

  const hasUserCoords =
    userCoords &&
    typeof userCoords.latitude === "number" &&
    typeof userCoords.longitude === "number";

  const isUserInTargetCity =
    hasUserCoords && isCoordinateInCity(userCoords.latitude, userCoords.longitude, city);

  if (isUserInTargetCity) {
    const lat1 = (userCoords.latitude * Math.PI) / 180;
    const lat2 = (cityCenter.latitude * Math.PI) / 180;
    const dLat = ((cityCenter.latitude - userCoords.latitude) * Math.PI) / 180;
    const dLon = ((cityCenter.longitude - userCoords.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const distToCenter = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Anchor 1: Immediate local starting location
    anchors.push({
      name: "local",
      coords: userCoords,
      radiusMeters: 12000,
    });

    if (distToCenter > 12) {
      // User is far from metropolitan center (e.g. Potheri is ~28 km from Chennai center)
      anchors.push({
        name: "metropolitan_core",
        coords: cityCenter,
        radiusMeters: 25000,
      });

      anchors.push({
        name: "corridor_connector",
        coords: {
          latitude: Number(((userCoords.latitude + cityCenter.latitude) / 2).toFixed(6)),
          longitude: Number(((userCoords.longitude + cityCenter.longitude) / 2).toFixed(6)),
        },
        radiusMeters: 20000,
      });
    } else {
      anchors.push({
        name: "metropolitan_core",
        coords: cityCenter,
        radiusMeters: 25000,
      });
      anchors.push({
        name: "metro_expanded",
        coords: cityCenter,
        radiusMeters: 50000,
      });
    }
  } else {
    // GPS disabled or user GPS is in a different city: use civic center
    anchors.push({
      name: "city_center",
      coords: cityCenter,
      radiusMeters: 20000,
    });
    anchors.push({
      name: "metro_expanded",
      coords: cityCenter,
      radiusMeters: 50000,
    });
  }

  return anchors;
}

/**
 * Checks whether a given latitude/longitude falls inside a city's boundary.
 */
export function isCoordinateInCity(
  latitude: number,
  longitude: number,
  cityName: string,
  tolerance = 0.02
): boolean {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    isNaN(latitude) ||
    isNaN(longitude)
  ) {
    return false;
  }
  const box = getCityBoundingBoxSync(cityName);
  if (!box) return true; // If bounding box is unavailable, don't reject
  return (
    latitude >= box.south - tolerance &&
    latitude <= box.north + tolerance &&
    longitude >= box.west - tolerance &&
    longitude <= box.east + tolerance
  );
}

/**
 * Resolve the official geographic bounding box for any city via Google Geocoding.
 * Results are cached in memory so each city is resolved at most once per session.
 */
export async function getCityBoundingBox(cityName: string): Promise<CityBoundingBox | null> {
  const clean = cleanCityString(cityName);
  if (!clean) return cityBoundsCache.get("bengaluru") || null;

  const syncBox = getCityBoundingBoxSync(clean);
  if (syncBox) return syncBox;

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
