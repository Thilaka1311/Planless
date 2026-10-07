import { getGoogleApiKey } from "../shared/google.ts";

const GOOGLE_NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
const GOOGLE_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const GOOGLE_PLACES_NEW_SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";

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

export function getCuratedPhotoForVenue(
  category?: string | null,
  types?: string[] | null,
  venueName?: string | null
): string {
  const normCat = (category || "").toUpperCase().trim();
  const normName = (venueName || "").toLowerCase().trim();
  const typesStr = Array.isArray(types) ? types.join(" ").toLowerCase() : "";
  const text = `${normName} ${typesStr}`;

  // Activities
  if (text.includes("bowling") || text.includes("bowl")) return "/assets/curated/bowling.jpg";
  if (text.includes("escape") || text.includes("mystery") || text.includes("breakout")) return "/assets/curated/mystery_rooms.jpg";
  if (text.includes("kart") || text.includes("karting")) return "/assets/curated/go_karting.jpg";
  if (text.includes("arcade") || text.includes("gaming") || text.includes("timezone")) return "/assets/curated/arcade.jpg";
  if (text.includes("golf")) return "/assets/curated/mini_golf.jpg";
  if (text.includes("trampoline") || text.includes("bounce") || text.includes("skyjumper")) return "/assets/curated/trampoline.jpg";
  if (text.includes("amusement") || text.includes("theme park") || text.includes("water park") || text.includes("wonderla")) {
    return "/assets/curated/amusement_park.jpg";
  }

  // Sports
  if (text.includes("pickleball") || text.includes("pickle")) return "/assets/curated/sports_pickleball.jpg";
  if (text.includes("badminton") || text.includes("shuttle")) return "/assets/curated/sports_badminton.jpg";
  if (text.includes("football") || text.includes("futsal") || text.includes("soccer")) return "/assets/curated/sports_football.jpg";
  if (text.includes("turf") || text.includes("cricket") || text.includes("arena")) return "/assets/curated/sports_turf.jpg";

  // Dining
  if (text.includes("cafe") || text.includes("coffee") || text.includes("roaster") || text.includes("bakery")) return "/assets/curated/cafe.jpg";
  if (text.includes("brewery") || text.includes("pub") || text.includes("bar") || text.includes("beer") || text.includes("taproom")) return "/assets/curated/pub.jpg";
  if (text.includes("fine dining") || text.includes("lounge")) return "/assets/curated/fine_dining.jpg";

  // Category-level fallbacks
  if (normCat === "ACTIVITIES") return "/assets/curated/arcade.jpg";
  if (normCat === "SPORTS") return "/assets/curated/sports_turf.jpg";
  if (normCat === "DINING") return "/assets/curated/restaurant.jpg";

  return "/assets/curated/bowling.jpg";
}

// Default coordinates: Bangalore center (used as fallback when user location is unavailable)
const DEFAULT_LATITUDE = 12.9716;
const DEFAULT_LONGITUDE = 77.5946;
const DEFAULT_RADIUS_METERS = 15000;
const MAX_CATEGORY_RESULTS = 50;

interface SearchQueryDef {
  type?: string;
  keyword?: string;
}

interface PlaceItem {
  id: string;
  public_id: string;
  section_id: string;
  title: string;
  name: string;
  category: "SPORTS" | "MOVIES" | "DINING" | "ACTIVITIES";
  subcategory: string | null;
  description: string | null;
  cover_image_url: string | null;
  /** All available photo references from Google Places (for sport-aware photo selection on the client). */
  photo_references?: string[] | null;
  location: string;
  suggested_duration_minutes: number | null;
  suggested_cost_amount: number | null;
  suggested_capacity: number | null;
  default_rsvp_offset_minutes: number;
  display_order: number;
  featured: boolean;
  status: "ACTIVE";
  created_at: string;
  updated_at: string;
  place_id: string;
  provider_place_id: string;
  place_address: string;
  latitude?: number;
  longitude?: number;
  distance?: string;
  rating?: number | null;
  user_ratings_total?: number | null;
  types?: string[];
}

interface PlaceSection {
  id: string;
  public_id: string;
  category: "SPORTS" | "MOVIES" | "DINING" | "ACTIVITIES";
  title: string;
  description: string;
  display_order: number;
  status: "ACTIVE";
  created_at: string;
  updated_at: string;
  items: PlaceItem[];
}

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

const DISTINCT_ADJACENT_CITIES: Record<string, string[]> = {
  bengaluru: ["mysuru", "mysore", "hosur", "ramanagara", "tumakuru", "tumkur", "kolar", "mandya", "hyderabad", "chennai"],
  bangalore: ["mysuru", "mysore", "hosur", "ramanagara", "tumakuru", "tumkur", "kolar", "mandya", "hyderabad", "chennai"],
  hyderabad: ["bengaluru", "bangalore", "warangal", "vijayawada", "karimnagar"],
  mumbai: ["pune", "nashik", "surat"],
};

function cleanCityString(str: string): string {
  return (str || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCityAliases(cityName: string): string[] {
  const clean = cleanCityString(cityName);
  if (!clean) return ["bengaluru"];
  return CITY_ALIASES[clean] || [clean];
}

export function isPlaceInCityBoundary(
  place: any,
  targetCity: string,
  cityBounds?: { north: number; south: number; east: number; west: number } | null
): boolean {
  if (!place) return false;
  const cleanCity = cleanCityString(targetCity || "Bengaluru");
  const aliases = getCityAliases(cleanCity);

  const pLat = place.geometry?.location?.lat ?? place.latitude;
  const pLng = place.geometry?.location?.lng ?? place.longitude;

  // 1. Geographic Boundary Check
  if (
    cityBounds &&
    typeof cityBounds.north === "number" &&
    typeof cityBounds.south === "number" &&
    typeof pLat === "number" &&
    typeof pLng === "number"
  ) {
    const tolerance = 0.005; // ~500m edge tolerance
    const inside =
      pLat >= cityBounds.south - tolerance &&
      pLat <= cityBounds.north + tolerance &&
      pLng >= cityBounds.west - tolerance &&
      pLng <= cityBounds.east + tolerance;
    if (!inside) {
      return false;
    }
  }

  // 2. Address text
  const address =
    place.formatted_address ||
    place.vicinity ||
    place.place_address ||
    place.location ||
    "";
  const normAddress = cleanCityString(address);

  // 3. Exclude known distinct foreign cities
  const excluded = DISTINCT_ADJACENT_CITIES[cleanCity] || [];
  for (const excl of excluded) {
    const wordRegex = new RegExp(`\\b${excl}\\b`, "i");
    if (wordRegex.test(normAddress)) {
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

  // Check structured address components if present
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

  // Check if address string mentions the city or aliases
  for (const alias of aliases) {
    if (normAddress.includes(alias)) {
      return true;
    }
  }

  // If inside city boundary rectangle and not in excluded city, accept
  if (cityBounds && typeof pLat === "number" && typeof pLng === "number") {
    return true;
  }

  return false;
}

async function fetchPlacesSearchNew(
  apiKey: string,
  query: string,
  lat?: number,
  lng?: number,
  radius?: number,
  pageToken?: string,
  cityBounds?: { north: number; south: number; east: number; west: number } | null,
  includedType?: string
): Promise<{ results: any[]; nextPageToken?: string | null }> {
  try {
    const headers = {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.primaryType,places.primaryTypeDisplayName,places.photos,places.addressComponents,nextPageToken",
    };
    const body: any = {
      textQuery: query,
      pageSize: 20,
    };
    if (includedType) {
      body.includedType = includedType;
    }
    if (typeof lat === "number" && typeof lng === "number") {
      body.locationBias = {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radius || DEFAULT_RADIUS_METERS,
        },
      };
      body.rankPreference = "DISTANCE";
    } else if (cityBounds && typeof cityBounds.north === "number" && typeof cityBounds.south === "number") {
      body.locationRestriction = {
        rectangle: {
          low: { latitude: cityBounds.south, longitude: cityBounds.west },
          high: { latitude: cityBounds.north, longitude: cityBounds.east },
        },
      };
    }
    if (pageToken) {
      body.pageToken = pageToken;
    }

    const res = await fetch(GOOGLE_PLACES_NEW_SEARCH_TEXT_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn("[discoveryPlaces] Places API New search non-ok status:", res.status);
      return fetchTextSearchQuery(apiKey, query, lat, lng, radius, pageToken);
    }

    const data = await res.json();
    const rawPlaces = Array.isArray(data.places) ? data.places : [];

    const results = rawPlaces.map((p: any) => ({
      place_id: p.id,
      id: p.id,
      name: p.displayName?.text || "",
      formatted_address: p.formattedAddress || p.shortFormattedAddress || "",
      vicinity: p.shortFormattedAddress || p.formattedAddress || "",
      geometry: {
        location: {
          lat: p.location?.latitude,
          lng: p.location?.longitude,
        },
      },
      latitude: p.location?.latitude,
      longitude: p.location?.longitude,
      rating: p.rating,
      user_ratings_total: p.userRatingCount,
      types: Array.isArray(p.types) ? p.types : [],
      primary_type: p.primaryType || null,
      primary_type_display_name: p.primaryTypeDisplayName?.text || null,
      photos: Array.isArray(p.photos) ? p.photos : [],
      address_components: Array.isArray(p.addressComponents)
        ? p.addressComponents.map((c: any) => ({
            long_name: c.longText || c.shortText || "",
            short_name: c.shortText || c.longText || "",
            types: Array.isArray(c.types) ? c.types : [],
          }))
        : [],
      _raw: p,
    }));

    return {
      results,
      nextPageToken: data.nextPageToken || null,
    };
  } catch (err) {
    console.warn("[discoveryPlaces] Places API New search error, falling back to legacy:", err);
    return fetchTextSearchQuery(apiKey, query, lat, lng, radius, pageToken);
  }
}

async function fetchPlacesSearchWithPagination(
  apiKey: string,
  query: string,
  lat?: number,
  lng?: number,
  radius?: number,
  minEligibleCount = 15,
  initialPageToken?: string,
  maxPages = 3,
  targetCity?: string,
  cityBounds?: { north: number; south: number; east: number; west: number } | null,
  includedType?: string
): Promise<{ results: any[]; nextPageToken?: string | null }> {
  let combinedResults: any[] = [];
  let currentPageToken: string | undefined = initialPageToken;
  let finalNextPageToken: string | null = null;
  let pagesFetched = 0;

  while (pagesFetched < maxPages) {
    pagesFetched++;
    const { results, nextPageToken } = await fetchPlacesSearchNew(
      apiKey,
      query,
      lat,
      lng,
      radius,
      currentPageToken,
      cityBounds,
      includedType
    );

    combinedResults = combinedResults.concat(results);
    finalNextPageToken = nextPageToken || null;

    // Count how many current accumulated items are authentic venues inside the target city
    const eligibleCount = combinedResults.filter((p) => {
      const isEligibleCategory =
        isPlayableSportsVenue(p) ||
        isAuthenticDiningVenue(p) ||
        isAuthenticActivityVenue(p);
      const isInsideCity = !targetCity || isPlaceInCityBoundary(p, targetCity, cityBounds);
      return isEligibleCategory && isInsideCity;
    }).length;

    // If we have met or exceeded the minimum eligible count, or there is no next page, stop
    if (eligibleCount >= minEligibleCount || !nextPageToken) {
      break;
    }

    currentPageToken = nextPageToken;
  }

  return {
    results: combinedResults,
    nextPageToken: finalNextPageToken,
  };
}

async function fetchTextSearchQuery(
  apiKey: string,
  query: string,
  lat?: number,
  lng?: number,
  radius?: number,
  pageToken?: string
): Promise<{ results: any[]; nextPageToken?: string | null }> {
  try {
    const params = new URLSearchParams({
      key: apiKey,
      language: "en",
    });

    if (pageToken) {
      params.append("pagetoken", pageToken);
    } else {
      params.append("query", query);
      if (typeof lat === "number" && typeof lng === "number") {
        params.append("location", `${lat},${lng}`);
        params.append("radius", String(radius || DEFAULT_RADIUS_METERS));
      }
    }

    let res = await fetch(`${GOOGLE_TEXT_SEARCH_URL}?${params.toString()}`);
    if (!res.ok) return { results: [] };
    let data = await res.json();

    // If Google returns INVALID_REQUEST when a pageToken was just issued, wait 2s and retry once
    if (pageToken && data.status === "INVALID_REQUEST") {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      res = await fetch(`${GOOGLE_TEXT_SEARCH_URL}?${params.toString()}`);
      if (res.ok) {
        data = await res.json();
      }
    }

    if (data.status === "OK" || data.status === "ZERO_RESULTS") {
      return {
        results: data.results || [],
        nextPageToken: data.next_page_token || null,
      };
    }
    return { results: [] };
  } catch (err) {
    console.error("[discoveryPlaces] Text search failed:", query, err);
    return { results: [] };
  }
}

async function fetchNearbyQuery(
  apiKey: string,
  lat: number,
  lng: number,
  radius: number,
  query: SearchQueryDef,
  pageToken?: string
): Promise<{ results: any[]; nextPageToken?: string | null }> {
  try {
    const params = new URLSearchParams({
      key: apiKey,
      language: "en",
    });

    if (pageToken) {
      params.append("pagetoken", pageToken);
    } else {
      params.append("location", `${lat},${lng}`);
      params.append("radius", String(radius));
      if (query.type) {
        params.append("type", query.type);
      }
      if (query.keyword) {
        params.append("keyword", query.keyword);
      }
    }

    let res = await fetch(`${GOOGLE_NEARBY_URL}?${params.toString()}`);
    if (!res.ok) return { results: [] };
    let data = await res.json();

    // If Google returns INVALID_REQUEST when a pageToken was just issued, wait 2s and retry once
    if (pageToken && data.status === "INVALID_REQUEST") {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      res = await fetch(`${GOOGLE_NEARBY_URL}?${params.toString()}`);
      if (res.ok) {
        data = await res.json();
      }
    }

    if (data.status === "OK" || data.status === "ZERO_RESULTS") {
      return {
        results: data.results || [],
        nextPageToken: data.next_page_token || null,
      };
    }
    return { results: [] };
  } catch (err) {
    console.error("[discoveryPlaces] Query failed:", query, err);
    return { results: [] };
  }
}

function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
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

function isPlayableSportsVenue(p: any): boolean {
  if (!p) return false;
  const name = (p.name || "").toLowerCase();
  const types: string[] = Array.isArray(p.types) ? p.types.map((t: string) => t.toLowerCase()) : [];

  // Exclude retail stores, merchandise, apparel, equipment shops, offices
  const isRetail = types.some((t) =>
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
    "sporting goods", "sports goods", "sports store", "sports shop",
    "sportswear", "sports wear", "sports apparel", "sports equipment",
    "fitness equipment", "cycle store", "bicycle shop", "jersey",
    "t-shirt", "shoe store", "footwear", "racquet stringing",
    "equipment dealer", "wholesaler", "distributor", "retailer",
    "showroom", "outlet", "sales", "opticals"
  ];
  const hasRetailKeyword = retailKeywords.some((k) => name.includes(k));

  const officeKeywords = [
    "association office", "federation office", "board of control",
    "sports council", "sports management", "corporate office", "headquarters",
    "physiotherapy", "rehab clinic", "hospital", "nutrition", "supplements store",
    "consultancy", "pvt ltd", "private limited"
  ];
  if (officeKeywords.some((k) => name.includes(k))) return false;

  const playableVenueKeywords = [
    "matchday", "sports zone", "sports arena", "turf club", "playfield",
    "turf", "court", "arena", "ground", "pitch", "nets", "box cricket",
    "badminton", "football", "futsal", "soccer", "pickleball", "tennis",
    "basketball", "table tennis", "ping pong", "squash", "swimming pool",
    "swim centre", "swim center", "aquatic centre", "sports club",
    "sports centre", "sports center", "sports complex", "sports academy",
    "sports facility", "skate park", "skating rink", "stadium"
  ];
  const hasPlayableKeyword = playableVenueKeywords.some((k) => name.includes(k));

  if (isRetail || hasRetailKeyword) {
    const isExplicitFacility = [
      "turf", "court", "ground", "pitch", "arena", "nets", "box cricket", "academy", "facility"
    ].some((k) => name.includes(k));
    if (!isExplicitFacility) return false;
  }

  const playableTypes = [
    "stadium", "sports_complex", "athletic_field", "sports_club", "swimming_pool", "golf_course"
  ];
  if (types.some((t) => playableTypes.includes(t)) || hasPlayableKeyword) {
    return true;
  }

  const isGym = types.includes("gym") || types.includes("fitness_center") || name.includes("gym") || name.includes("fitness");
  if (isGym && !hasRetailKeyword && !isRetail) {
    return true;
  }

  return false;
}

function isAuthenticDiningVenue(p: any): boolean {
  if (!p) return false;
  const name = (p.name || "").toLowerCase();
  const types: string[] = Array.isArray(p.types) ? p.types.map((t: string) => t.toLowerCase()) : [];

  const excludedTypes = [
    "grocery_or_supermarket", "supermarket", "convenience_store", "department_store",
    "gas_station", "car_repair", "pharmacy", "hospital", "bank", "atm",
    "real_estate_agency", "travel_agency", "storage", "wholesaler", "post_office",
    "school", "university", "clothing_store", "shoe_store", "home_goods_store", "store",
    // Retail liquor, cloud kitchens without dining, catering & event halls
    "liquor_store", "meal_delivery", "caterer", "wholesale_grocer", "banquet_hall", "wedding_venue",
    // Sports types MUST NEVER qualify as Dining
    "sports_complex", "stadium", "athletic_field", "sports_club", "gym",
    "fitness_center", "sports_activity_location", "sports_school", "sports_coaching",
    "swimming_pool", "golf_course", "ice_skating_rink"
  ];
  if (types.some((t) => excludedTypes.includes(t))) return false;

  const nonDiningKeywords = [
    "supermarket", "hypermarket", "grocery", "groceries", "provisions",
    "general store", "kirana", "departmental store", "department store",
    "ration", "mart", "organic store", "wholesale", "wholesaler",
    "trader", "distributor", "fmcg", "packaging", "enterprises",
    "feed store", "agro food", "pet food", "warehouse",
    // Retail liquor / bottle shops (not bars/pubs)
    "wine shop", "liquor shop", "liquor store", "wine store", "mrp outlet", "beverages store", "tasmac", "mrp wine", "mrp liquor",
    // Commercial catering & ghost kitchens
    "caterers office", "catering office", "catering services", "commercial kitchen", "cloud kitchen hub", "dark kitchen",
    // Event & banquet halls
    "banquet hall", "convention hall", "kalyana mantapa", "marriage hall", "wedding hall",
    "consultancy", "hardware", "opticals", "footwear", "chemist", "tailor", "garments",
    "machinery", "pvt ltd", "private limited", "corporate office", "headquarters",
    // Sports keywords that disqualify venue from dining
    "matchday", "sports zone", "sports arena", "turf club", "playfield",
    "turf", "football", "futsal", "soccer", "badminton", "pickleball", "pickle ball",
    "tennis court", "cricket", "basketball court", "sports academy", "football academy",
    "badminton academy", "sports club", "sports complex", "sports facility",
    "koland", "rush koland", "swimming pool", "skate park", "skating rink", "athletics",
    "fitness centre", "fitness center", "gymnasium", "sporting goods"
  ];
  const hasNonDiningKeyword = nonDiningKeywords.some((k) => name.includes(k));
  if (hasNonDiningKeyword) {
    const hasExplicitFoodCombo = [
      "sports bar", "turf cafe", "bar", "cafe", "coffee", "pub", "brewery",
      "restaurant", "bistro", "kitchen", "diner"
    ].some((k) => name.includes(k));
    if (!hasExplicitFoodCombo) return false;
  }

  // Google Places API (New) Table A Food & Drink types
  const diningTypes = [
    "restaurant", "fine_dining_restaurant", "diner", "family_restaurant", "buffet_restaurant",
    "brunch_restaurant", "breakfast_restaurant", "cafe", "coffee_shop", "tea_house",
    "bar", "pub", "brewpub", "wine_bar", "cocktail_bar", "bakery", "dessert_shop",
    "dessert_restaurant", "ice_cream_shop", "fast_food_restaurant", "pizza_restaurant",
    "sandwich_shop", "hamburger_restaurant", "juice_shop", "food_court",
    "indian_restaurant", "italian_restaurant", "asian_restaurant", "chinese_restaurant",
    "japanese_restaurant", "thai_restaurant", "mexican_restaurant", "mediterranean_restaurant",
    "seafood_restaurant", "steak_house", "sushi_restaurant", "vegetarian_restaurant", "vegan_restaurant"
  ];
  const hasDiningType = types.some((t) => diningTypes.includes(t));

  const diningKeywords = [
    "restaurant", "cafe", "coffee", "bistro", "diner", "kitchen", "dhaba",
    "bhavan", "darshini", "sagar", "mess", "bhojanalaya", "biryani", "pizza",
    "pizzeria", "burger", "bakery", "bakehouse", "patisserie", "cake", "pastry",
    "dessert", "ice cream", "gelato", "waffle", "chai", "tea", "roastery",
    "eatery", "tandoor", "grill", "bbq", "barbeque", "pub", "bar", "brewery",
    "brewhouse", "taproom", "lounge", "food court", "street food", "shawarma",
    "roll", "momos", "chaat", "dosa", "idli", "sweets", "thali", "fine dining",
    "canteen", "bites"
  ];
  const hasDiningKeyword = diningKeywords.some((k) => name.includes(k));
  return hasDiningType || hasDiningKeyword;
}

function isAuthenticActivityVenue(p: any): boolean {
  if (!p) return false;
  const name = (p.name || "").toLowerCase().trim();
  const desc = (p.description || "").toLowerCase().trim();
  const types: string[] = Array.isArray(p.types) ? p.types.map((t: string) => t.toLowerCase()) : [];

  const excludedTypes = [
    "real_estate_agency", "travel_agency", "insurance_agency", "car_dealer",
    "car_repair", "lawyer", "accounting", "local_government_office", "finance",
    "bank", "doctor", "dentist", "hospital", "pharmacy", "hardware_store",
    "supermarket"
  ];
  if (types.some((t) => excludedTypes.includes(t))) return false;

  const hardExcludedKeywords = [
    // Water supply, plants, treatment, purifiers, drinking water kiosks ("Neerina Ghataka")
    "water plant", "water supply", "water supplier", "water supplies",
    "packaged drinking water", "mineral water", "drinking water", "water tanker",
    "water station", "water purifiers", "water purifier", "ro water",
    "neerina ghataka", "kudiyuva neeru", "pure water", "aqua pure", "aqua water",
    "water technology", "water technologies", "water solutions", "water treatment",
    "water filter", "water can", "borewell",

    // Natural water bodies / lakes / ponds / dams
    "lake", "pond", "kere", "kunte", "reservoir", "drainage", "canal",

    // Corporate offices, tech companies, headquarters, industrial
    "head office", "corporate office", "headquarters", "branch office",
    "technologies", "infotech", "solutions", "enterprises", "consulting",
    "consultancy", "logistics", "courier", "packers and movers", "pvt ltd",
    "private limited", "co-working", "coworking",

    // Real estate, residential buildings, apartments
    "apartment", "apartments", "enclave", "residency", "villas", "real estate",
    "builders", "developers", "properties", "pg for", "hostel",

    // Retail stores, clinics, services
    "opticals", "tailor", "laundry", "dry cleaners", "pharmacy", "clinic",
    "hospital", "supermarket", "grocery", "hypermarket", "department store",
    "hardware store", "car wash", "car repair"
  ];

  if (hardExcludedKeywords.some((k) => name.includes(k))) return false;
  if (hardExcludedKeywords.some((k) => desc.includes(k)) && !name.includes("park") && !name.includes("arena")) {
    return false;
  }

  const sportsFacilityKeywords = [
    "football turf", "cricket turf", "badminton court", "pickleball court",
    "tennis court", "basketball court", "cricket ground", "cricket net",
    "sports academy", "football academy", "badminton academy", "cricket academy",
    "futsal turf", "koland", "rush koland"
  ];
  const hasSportsKeyword = sportsFacilityKeywords.some((k) => name.includes(k));

  const multiActivityHubs = [
    "play arena", "torq03", "loco bear", "amoeba", "smaaash", "smaash",
    "the grid", "timezone"
  ];
  const isMultiActivityHub = multiActivityHubs.some((hub) => name.includes(hub));

  if (hasSportsKeyword && !isMultiActivityHub) return false;

  const explicitActivityKeywords = [
    "bowling", "alley", "escape room", "escape", "mystery room", "breakout", "puzzle room",
    "go kart", "go-kart", "karting", "amusement park", "theme park",
    "water park", "water world", "trampoline", "bounce", "arcade",
    "gaming zone", "gaming lounge", "timezone", "laser tag", "paintball",
    "mini golf", "miniature golf", "adventure park", "adventure centre",
    "adventure center", "climbing", "bouldering", "vr park", "virtual reality",
    "play arena", "game zone", "recreation centre", "recreation center",
    "snow city", "snow park", "wonderla", "fun world", "skyjumper",
    "torq03", "loco bear", "freakout gaming", "racepace"
  ];
  const hasActivityKeyword = explicitActivityKeywords.some((k) => name.includes(k));
  if (hasActivityKeyword) return true;

  // Google Activity types validation: must NOT be an arbitrary unverified business
  const activityTypes = [
    "amusement_park", "bowling_alley", "aquarium", "zoo", "casino", "water_park"
  ];
  if (types.some((t) => activityTypes.includes(t))) {
    const generalRecreationTokens = [
      "park", "world", "city", "wonder", "resort", "hub", "zone", "lounge",
      "center", "centre", "club", "fun", "play", "adventure", "arena",
      "entertainment", "games", "gaming", "lane", "lanes", "bowl", "strike",
      "escape", "bounce", "jump", "climb", "kart", "snow", "ice", "water"
    ];
    if (generalRecreationTokens.some((tok) => name.includes(tok))) {
      return true;
    }
  }

  return false;
}

function isCinemaVenue(p: any): boolean {
  if (!p) return false;
  const types: string[] = Array.isArray(p.types) ? p.types.map((t: string) => t.toLowerCase()) : [];
  const name = (p.name || "").toLowerCase();
  if (types.includes("movie_theater")) return true;
  return (
    name.includes("cinema") ||
    name.includes("multiplex") ||
    name.includes("theatre") ||
    name.includes("theater") ||
    name.includes("imax") ||
    name.includes("talkies")
  );
}

function determinePlanlessCategory(p: any): "SPORTS" | "DINING" | "ACTIVITIES" | null {
  if (isPlayableSportsVenue(p)) return "SPORTS";
  if (isAuthenticDiningVenue(p)) return "DINING";
  if (isAuthenticActivityVenue(p)) return "ACTIVITIES";
  return null;
}

async function enrichMultiSportPhotos(apiKey: string, places: any[]): Promise<void> {
  const multiSportCandidates = places.filter((p) => {
    if (!p?.place_id) return false;
    if (Array.isArray(p.photos) && p.photos.length > 1) return false;
    const name = (p.name || "").toLowerCase();
    return (
      name.includes("koland") ||
      name.includes("sports complex") ||
      name.includes("sports arena") ||
      name.includes("sports facility") ||
      name.includes("sports club") ||
      (name.includes("turf") && (name.includes("badminton") || name.includes("pickleball") || name.includes("cricket"))) ||
      (name.includes("football") && (name.includes("badminton") || name.includes("pickleball") || name.includes("cricket")))
    );
  });

  if (multiSportCandidates.length === 0) return;

  const targets = multiSportCandidates.slice(0, 5);
  await Promise.all(
    targets.map(async (p) => {
      try {
        const params = new URLSearchParams({
          place_id: p.place_id,
          fields: "photos",
          key: apiKey,
        });
        const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data?.result?.photos) && data.result.photos.length > 0) {
          p.photos = data.result.photos;
        }
      } catch (err) {
        console.warn(`[discoveryPlaces] Photo enrichment failed for ${p.place_id}:`, err);
      }
    })
  );
}

function normalizePlaces(
  rawPlaces: any[],
  category: "SPORTS" | "MOVIES" | "DINING" | "ACTIVITIES" | "ALL",
  photoBaseUrl: string,
  originLat?: number,
  originLng?: number,
  capAtMax = true,
  targetCity?: string,
  cityBounds?: { north: number; south: number; east: number; west: number } | null
): PlaceItem[] {
  // 1. Deduplicate by provider place_id, enforce owner photo presence, and apply strict Planless relevance & city boundary filter
  const placeMap = new Map<string, any>();
  for (const p of rawPlaces) {
    if (!p) continue;
    const placeId = p.place_id || p.id;
    if (!placeId) continue;
    const placeName = p.name || p.displayName?.text || p.title || "Unnamed Place";

    // Extract sports from placeName keywords
    const lowerName = placeName.toLowerCase();
    const detectedNameSports: string[] = [];
    if (lowerName.includes("badminton") || lowerName.includes("shuttle")) detectedNameSports.push("badminton");
    if (lowerName.includes("football") || lowerName.includes("futsal") || lowerName.includes("soccer")) detectedNameSports.push("football");
    if (lowerName.includes("pickleball") || lowerName.includes("pickle ball")) detectedNameSports.push("pickleball");
    if (lowerName.includes("tennis") && !lowerName.includes("table tennis")) detectedNameSports.push("tennis");
    if (lowerName.includes("table tennis") || lowerName.includes("ping pong")) detectedNameSports.push("table-tennis");
    if (lowerName.includes("cricket") || lowerName.includes("box cricket")) detectedNameSports.push("cricket");
    if (lowerName.includes("basketball") || lowerName.includes("hoop")) detectedNameSports.push("basketball");
    if (lowerName.includes("squash")) detectedNameSports.push("squash");
    if (lowerName.includes("swimming")) detectedNameSports.push("swimming");

    const rawTypes: string[] = Array.isArray(p.types) ? p.types.map((t: string) => t.toLowerCase()) : [];
    if (rawTypes.includes("tennis_court") && !detectedNameSports.includes("tennis")) detectedNameSports.push("tennis");
    if (rawTypes.includes("swimming_pool") && !detectedNameSports.includes("swimming")) detectedNameSports.push("swimming");

    if (detectedNameSports.length > 0) {
      if (!p._supportedSports) p._supportedSports = [];
      for (const s of detectedNameSports) {
        if (!p._supportedSports.includes(s)) p._supportedSports.push(s);
      }
    }

    const existing = placeMap.get(placeId);
    if (existing) {
      if (Array.isArray(p._supportedSports)) {
        if (!existing._supportedSports) existing._supportedSports = [];
        for (const s of p._supportedSports) {
          if (!existing._supportedSports.includes(s)) {
            existing._supportedSports.push(s);
          }
        }
      }
      if (Array.isArray(p.photos) && p.photos.length > 0) {
        const existingPhotos = Array.isArray(existing.photos) ? existing.photos : [];
        const seenRefs = new Set(existingPhotos.map((ph: any) => ph.photo_reference || ph.name));
        for (const ph of p.photos) {
          const ref = ph?.photo_reference || ph?.name;
          if (ref && !seenRefs.has(ref)) {
            existingPhotos.push(ph);
            seenRefs.add(ref);
          }
        }
        existing.photos = existingPhotos;
      }
      continue;
    }

    // FINAL SAFETY FILTER: Place must strictly be inside the target discovery city boundary
    if (targetCity && !isPlaceInCityBoundary(p, targetCity, cityBounds)) {
      continue;
    }

    // 0. OWNER-POSTED PHOTO & CURATED FALLBACK LOGIC:
    // Extract authentic owner-posted photos from Google Places.
    // Customer-contributed photos are NEVER stored or used as fallbacks.
    if (category !== "MOVIES") {
      const ownerPhotos = extractOwnerPhotos(placeName, p.photos);
      p._ownerPhotos = ownerPhotos;
    }

    // Apply strict relevance layer: only keep places user can eat, play, or do activities
    if (category === "SPORTS" && !isPlayableSportsVenue(p)) continue;
    if (category === "DINING" && !isAuthenticDiningVenue(p)) continue;
    if (category === "ACTIVITIES" && !isAuthenticActivityVenue(p)) continue;
    if (category === "MOVIES") continue;
    if (category === "ALL" && !determinePlanlessCategory(p)) continue;

    placeMap.set(placeId, p);
  }

  // 2. Sort prioritizing proximity and photos
  const sorted = Array.from(placeMap.values()).sort((a, b) => {
    const aLat = a.geometry?.location?.lat ?? a.latitude;
    const aLng = a.geometry?.location?.lng ?? a.longitude;
    const bLat = b.geometry?.location?.lat ?? b.latitude;
    const bLng = b.geometry?.location?.lng ?? b.longitude;

    if (
      typeof originLat === "number" &&
      typeof originLng === "number" &&
      typeof aLat === "number" &&
      typeof aLng === "number" &&
      typeof bLat === "number" &&
      typeof bLng === "number"
    ) {
      const distA = calculateHaversineKm(originLat, originLng, aLat, aLng);
      const distB = calculateHaversineKm(originLat, originLng, bLat, bLng);
      // Strictly sort ascending by proximity
      if (distA !== distB) {
        return distA - distB;
      }
    }
    const aHasPhoto = a.photos && a.photos.length > 0 ? 1 : 0;
    const bHasPhoto = b.photos && b.photos.length > 0 ? 1 : 0;
    return bHasPhoto - aHasPhoto;
  });

  // 3. Limit to maximum 50 results only when capAtMax is true
  const limited = capAtMax ? sorted.slice(0, MAX_CATEGORY_RESULTS) : sorted;

  // 4. Map to normalized DiscoveryItem
  return limited.map((place, index) => {
    const ownerPhotos: Array<{ photoReference: string; authorName: string }> = place._ownerPhotos || [];
    const primaryOwnerPhoto = ownerPhotos[0];
    const photoRef = primaryOwnerPhoto ? primaryOwnerPhoto.photoReference : null;
    const ownerPhotoRefs = ownerPhotos.map((ph) => ph.photoReference);

    let coverUrl = photoRef
      ? `${photoBaseUrl}?action=photo&photo_reference=${encodeURIComponent(photoRef)}&maxwidth=800`
      : null;

    const locText = place.vicinity || place.formatted_address || "Nearby";
    const placeId = place.place_id || place.id;
    const placeName = place.name || "Unnamed Place";
    
    // Derive categories directly from Google types
    const types: string[] = Array.isArray(place.types) ? place.types : [];
    
    // Determine target planar category
    const itemCategory = category === "ALL" ? determinePlanlessCategory(place) || "DINING" : category;
    
    // If no owner photo available on Google, assign curated aesthetic subcategory photo
    if (!coverUrl && itemCategory !== "MOVIES") {
      coverUrl = getCuratedPhotoForVenue(itemCategory, place.types, placeName);
    }
    
    const sportLabels: Record<string, string> = {
      football: "Football",
      badminton: "Badminton",
      pickleball: "Pickleball",
      tennis: "Tennis",
      basketball: "Basketball",
      cricket: "Cricket",
      "table-tennis": "Table Tennis",
      swimming: "Swimming",
      squash: "Squash",
      volleyball: "Volleyball",
    };

    let subcat: string = "";
    const sportsList: string[] = Array.isArray(place._supportedSports) ? place._supportedSports : [];

    if (itemCategory === "SPORTS") {
      if (sportsList.length > 0) {
        subcat = sportsList.map((s) => sportLabels[s] || (s.charAt(0).toUpperCase() + s.slice(1))).join(" | ");
      } else {
        subcat = "Sports Facility";
      }
    } else if (itemCategory === "DINING" && place.primary_type_display_name) {
      subcat = place.primary_type_display_name;
    } else {
      // Filter out highly generic Google Place types to surface the meaningful ones
      const genericTypes = new Set([
        "point_of_interest",
        "establishment",
        "premise",
        "feature",
        "neighborhood",
        "association_or_organization",
        "athletic_field",
        "sports_club",
        "sports_complex",
        "sports_activity_location",
        "playground",
      ]);

      let specificTypes = types.filter((t) => !genericTypes.has(t));
      if (specificTypes.length === 0) {
        specificTypes = types; // Fallback if they only have generic types
      }

      const matchedCategories = specificTypes.map((t) => {
        // Convert snake_case to Title Case (e.g. "amusement_park" -> "Amusement Park")
        return t.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      });

      subcat = Array.from(new Set(matchedCategories)).slice(0, 2).join(" | ");
    }

    const pLat = place.geometry?.location?.lat;
    const pLng = place.geometry?.location?.lng;
    let distanceStr: string | undefined = undefined;
    if (
      typeof originLat === "number" &&
      typeof originLng === "number" &&
      typeof pLat === "number" &&
      typeof pLng === "number"
    ) {
      const d = calculateHaversineKm(originLat, originLng, pLat, pLng);
      distanceStr = `${d.toFixed(1)} km`;
    }

    return {
      id: `place_${placeId}`,
      public_id: `place_${placeId}`,
      section_id: `places_${itemCategory.toLowerCase()}`,
      title: placeName,
      name: placeName,
      category: itemCategory,
      subcategory: subcat,
      supported_sports: sportsList,
      supportedSports: sportsList,
      description: locText,
      cover_image_url: coverUrl,
      location: locText,
      suggested_duration_minutes: itemCategory === "MOVIES" ? 150 : itemCategory === "ACTIVITIES" ? 120 : 90,
      suggested_cost_amount: null,
      suggested_capacity: null,
      default_rsvp_offset_minutes: 60,
      display_order: index + 1,
      featured: index < 3,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      place_id: placeId,
      provider_place_id: placeId,
      place_address: locText,
      latitude: pLat,
      longitude: pLng,
      distance: distanceStr,
      rating: typeof place.rating === "number" ? place.rating : null,
      user_ratings_total: typeof place.user_ratings_total === "number" ? place.user_ratings_total : null,
      photo_references: ownerPhotoRefs.length > 0 ? ownerPhotoRefs : null,
      photos: place.photos,
      types: Array.isArray(place.types) ? place.types : [],
    };
  });
}

export async function handleDiscoveryPlaces(
  body: any,
  req: Request
): Promise<{ sections: PlaceSection[]; items?: PlaceItem[]; nextPageToken?: string | null }> {
  const apiKey = getGoogleApiKey();
  const photoBaseUrl = body?.photoBaseUrl || "/functions/v1/maps";

  const lat = typeof body?.latitude === "number" ? body.latitude : DEFAULT_LATITUDE;
  const lng = typeof body?.longitude === "number" ? body.longitude : DEFAULT_LONGITUDE;
  const radius = typeof body?.radius === "number" ? body.radius : DEFAULT_RADIUS_METERS;
  const requestedCategory = (body?.category || "ALL").toUpperCase();
  const targetCity = typeof body?.city === "string" ? body.city.trim() : "Bengaluru";
  const cityBounds = body?.cityBounds && typeof body.cityBounds.north === "number" ? body.cityBounds : null;

  const searchQuery = typeof body?.query === "string" ? body.query.trim() : "";
  const queriesList: string[] = Array.isArray(body?.queries) && body.queries.length > 0
    ? body.queries.map((q: any) => String(q).trim()).filter(Boolean)
    : searchQuery
    ? [searchQuery]
    : [];
  const pageToken = typeof body?.pageToken === "string" ? body.pageToken.trim() : undefined;

  // Google Places API must NEVER handle MOVIES (TMDB handles Movies exclusively)
  if (requestedCategory === "MOVIES") {
    return { sections: [], items: [], nextPageToken: null };
  }

  // ── 1. SEARCH MODE (Direct Places Search by query keyword(s) & location context) ──
  if (queriesList.length > 0) {
    let combinedResults: any[] = [];
    let combinedNextPageToken: string | null = null;

    const searchIncludedType = typeof body?.includedType === "string" ? body.includedType.trim() : undefined;

    // Execute search with Places API (New) with pagination to collect enough eligible places
    if (queriesList.length === 1 || pageToken) {
      const { results, nextPageToken } = await fetchPlacesSearchWithPagination(
        apiKey,
        queriesList[0],
        lat,
        lng,
        radius,
        15,
        pageToken,
        3,
        targetCity,
        cityBounds,
        searchIncludedType
      );
      combinedResults = results;
      combinedNextPageToken = nextPageToken || null;
    } else {
      // Multi-query search: Execute up to 10 targeted queries in parallel and merge
      const queryDefs = queriesList.slice(0, 10);
      const fetchResults = await Promise.all(
        queryDefs.map((q) => fetchPlacesSearchNew(apiKey, q, lat, lng, radius, undefined, cityBounds, searchIncludedType))
      );
      combinedResults = fetchResults.flatMap((r) => r.results);
      combinedNextPageToken = fetchResults.find((r) => r.nextPageToken)?.nextPageToken || null;
    }

    const items = normalizePlaces(combinedResults, requestedCategory as any, photoBaseUrl, lat, lng, false, targetCity, cityBounds);

    const sectionCategory = requestedCategory === "ALL" ? "DINING" : requestedCategory;

    const section: PlaceSection = {
      id: `places_${sectionCategory.toLowerCase()}_search`,
      public_id: `places_${sectionCategory.toLowerCase()}_search`,
      category: sectionCategory as any,
      title: "Search Results",
      description: `Results for "${queriesList[0]}"`,
      display_order: 1,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items,
    };

    return {
      sections: [section],
      items,
      rawPlaces: combinedResults,
      nextPageToken: combinedNextPageToken,
    };
  }

  // ── 2. DEFAULT DISCOVERY MODE ────────────────────────────────────────────────
  const sections: PlaceSection[] = [];

  // ─── 1. SPORTS (Max 50) ──────────────────────────────────────────────────────
  if (requestedCategory === "ALL" || requestedCategory === "SPORTS") {
    try {
      const sportsQueries: Array<{ query: string; sport?: string }> = [
        { query: "sports arena complex" },
        { query: "sports turf" },
        { query: "football turf", sport: "football" },
        { query: "badminton court", sport: "badminton" },
        { query: "pickleball court", sport: "pickleball" },
        { query: "tennis court", sport: "tennis" },
        { query: "basketball court", sport: "basketball" },
        { query: "cricket ground box nets", sport: "cricket" },
      ];

      const queryResults = await Promise.all(
        sportsQueries.map(async ({ query, sport }) => {
          const res = await fetchPlacesSearchNew(apiKey, query, lat, lng, radius, undefined, cityBounds);
          if (sport) {
            for (const p of res.results) {
              if (!p._supportedSports) p._supportedSports = [];
              if (!p._supportedSports.includes(sport)) p._supportedSports.push(sport);
            }
          }
          return res.results;
        })
      );
      const sportsRaw = queryResults.flat();

      await enrichMultiSportPhotos(apiKey, sportsRaw);

      const sportsItems = normalizePlaces(sportsRaw, "SPORTS", photoBaseUrl, lat, lng, true, targetCity, cityBounds);

      sections.push({
        id: "places_sports",
        public_id: "places_sports",
        category: "SPORTS",
        title: "Sports",
        description: "Turfs, courts, and activity venues nearby",
        display_order: 1,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: sportsItems,
      });
    } catch (err) {
      console.error("[discoveryPlaces] Sports query failed:", err);
      sections.push({
        id: "places_sports",
        public_id: "places_sports",
        category: "SPORTS",
        title: "Sports",
        description: "Turfs, courts, and activity venues nearby",
        display_order: 1,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [],
      });
    }
  }

  // ─── 2. DINING (Max 50) ──────────────────────────────────────────────────────
  if (requestedCategory === "ALL" || requestedCategory === "DINING") {
    try {
      const diningQueries: Array<{ query: string; includedType: string }> = [
        { query: "restaurants", includedType: "restaurant" },
        { query: "cafe coffee shop roastery", includedType: "cafe" },
        { query: "brewery pub taproom bar", includedType: "bar" },
        { query: "bakery patisserie dessert parlour", includedType: "bakery" },
        { query: "fine dining lounge", includedType: "fine_dining_restaurant" },
        { query: "burger pizza fast food roll", includedType: "fast_food_restaurant" },
      ];

      const diningRaw = (await Promise.all(
        diningQueries.map(({ query, includedType }) =>
          fetchPlacesSearchNew(apiKey, query, lat, lng, radius, undefined, cityBounds, includedType)
        )
      )).flatMap((r) => r.results);

      const diningItems = normalizePlaces(diningRaw, "DINING", photoBaseUrl, lat, lng, true, targetCity, cityBounds);

      sections.push({
        id: "places_dining",
        public_id: "places_dining",
        category: "DINING",
        title: "Dining",
        description: "Restaurants, cafes, and popular dining nearby",
        display_order: 3,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: diningItems,
      });
    } catch (err) {
      console.error("[discoveryPlaces] Dining query failed:", err);
      sections.push({
        id: "places_dining",
        public_id: "places_dining",
        category: "DINING",
        title: "Dining",
        description: "Restaurants, cafes, and popular dining nearby",
        display_order: 3,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [],
      });
    }
  }

  // ─── 4. ACTIVITIES (Max 50) ───────────────────────────────────────────────────
  if (requestedCategory === "ALL" || requestedCategory === "ACTIVITIES") {
    try {
      const activityQueries = [
        "bowling alley",
        "escape room",
        "mystery rooms breakout",
        "go karting karting track",
        "amusement park theme park",
        "water park water world",
        "trampoline park bounce",
        "arcade gaming zone timezone",
        "laser tag paintball",
        "bouldering climbing gym",
      ];

      const activityRaw = (await Promise.all(
        activityQueries.map((q) => fetchPlacesSearchNew(apiKey, q, lat, lng, radius, undefined, cityBounds))
      )).flatMap((r) => r.results);

      const activityItems = normalizePlaces(activityRaw, "ACTIVITIES", photoBaseUrl, lat, lng, true, targetCity, cityBounds);

      sections.push({
        id: "places_activities",
        public_id: "places_activities",
        category: "ACTIVITIES",
        title: "Activities",
        description: "Recreational experiences, games, and fun places nearby",
        display_order: 4,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: activityItems,
      });
    } catch (err) {
      console.error("[discoveryPlaces] Activities query failed:", err);
      sections.push({
        id: "places_activities",
        public_id: "places_activities",
        category: "ACTIVITIES",
        title: "Activities",
        description: "Recreational experiences, games, and fun places nearby",
        display_order: 4,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [],
      });
    }
  }

  return { sections };
}
