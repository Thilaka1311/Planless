import { getGoogleApiKey } from "../shared/google.ts";

const GOOGLE_NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";

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

async function fetchNearbyQuery(
  apiKey: string,
  lat: number,
  lng: number,
  radius: number,
  query: SearchQueryDef
): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: String(radius),
      key: apiKey,
      language: "en",
    });

    if (query.type) {
      params.append("type", query.type);
    }
    if (query.keyword) {
      params.append("keyword", query.keyword);
    }

    const res = await fetch(`${GOOGLE_NEARBY_URL}?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status === "OK" || data.status === "ZERO_RESULTS") {
      return data.results || [];
    }
    return [];
  } catch (err) {
    console.error("[discoveryPlaces] Query failed:", query, err);
    return [];
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

function normalizePlaces(
  rawPlaces: any[],
  category: "SPORTS" | "MOVIES" | "DINING" | "ACTIVITIES",
  photoBaseUrl: string,
  originLat?: number,
  originLng?: number
): PlaceItem[] {
  // 1. Deduplicate by provider place_id and filter out non-recreational venues for ACTIVITIES
  const placeMap = new Map<string, any>();
  for (const p of rawPlaces) {
    if (!p || !p.place_id || placeMap.has(p.place_id)) continue;

    if (category === "ACTIVITIES") {
      const nameLower = (p.name || "").toLowerCase();
      const types: string[] = Array.isArray(p.types) ? p.types : [];

      // Exclude pure stores, supermarkets, medical, finance, etc.
      const excludedTypes = [
        "clothing_store",
        "supermarket",
        "grocery_or_supermarket",
        "department_store",
        "car_repair",
        "hospital",
        "doctor",
        "pharmacy",
        "bank",
        "real_estate_agency",
      ];
      if (types.some((t) => excludedTypes.includes(t))) continue;

      // Exclude pure food venues without recreation keyword
      const isPureFoodType = types.includes("restaurant") || types.includes("cafe") || types.includes("bar") || types.includes("bakery");
      const hasActivityKeyword =
        nameLower.includes("bowl") ||
        nameLower.includes("escape") ||
        nameLower.includes("mystery") ||
        nameLower.includes("breakout") ||
        nameLower.includes("kart") ||
        nameLower.includes("arcade") ||
        nameLower.includes("game") ||
        nameLower.includes("gaming") ||
        nameLower.includes("laser") ||
        nameLower.includes("paintball") ||
        nameLower.includes("trampoline") ||
        nameLower.includes("bounce") ||
        nameLower.includes("amusement") ||
        nameLower.includes("water park") ||
        nameLower.includes("theme park") ||
        nameLower.includes("mini golf") ||
        nameLower.includes("golf") ||
        nameLower.includes("skat") ||
        nameLower.includes("adventure") ||
        nameLower.includes("play arena") ||
        nameLower.includes("torq") ||
        nameLower.includes("smaash") ||
        nameLower.includes("timezone");

      if (isPureFoodType && !hasActivityKeyword) continue;

      // Exclude pure sports turfs/courts unless multi-activity complex
      const isPureSport =
        (nameLower.includes("turf") ||
         nameLower.includes("badminton court") ||
         nameLower.includes("pickleball") ||
         nameLower.includes("cricket academy") ||
         nameLower.includes("football turf")) &&
        !hasActivityKeyword;
      if (isPureSport) continue;
    }

    placeMap.set(p.place_id, p);
  }

  // 2. Sort so places with photos are prioritized at the top
  const sorted = Array.from(placeMap.values()).sort((a, b) => {
    const aHasPhoto = a.photos && a.photos.length > 0 ? 1 : 0;
    const bHasPhoto = b.photos && b.photos.length > 0 ? 1 : 0;
    return bHasPhoto - aHasPhoto;
  });

  // 3. Limit to maximum 50 results
  const limited = sorted.slice(0, MAX_CATEGORY_RESULTS);

  // 4. Map to normalized DiscoveryItem
  return limited.map((place, index) => {
    const photoRef = place.photos?.[0]?.photo_reference;
    const coverUrl = photoRef
      ? `${photoBaseUrl}?action=photo&photo_reference=${encodeURIComponent(photoRef)}&maxwidth=800`
      : null;

    const locText = place.vicinity || place.formatted_address || "Nearby";
    
    // Derive exact categories/cuisines from Google types and venue name separated by " | "
    const nameLower = (place.name || "").toLowerCase();
    const types: string[] = Array.isArray(place.types) ? place.types : [];
    const matchedCategories: string[] = [];

    if (category === "DINING") {
      if (types.includes("bar") || types.includes("night_club") || nameLower.includes("bar") || nameLower.includes("pub") || nameLower.includes("brewery") || nameLower.includes("lounge")) {
        matchedCategories.push(nameLower.includes("brewery") ? "Brewery" : nameLower.includes("pub") ? "Pub" : "Bar");
      }
      if (types.includes("cafe") || nameLower.includes("cafe") || nameLower.includes("coffee") || nameLower.includes("tea")) {
        matchedCategories.push("Cafe");
      }
      if (types.includes("bakery") || nameLower.includes("bakery") || nameLower.includes("bake") || nameLower.includes("cake")) {
        matchedCategories.push("Bakery & Desserts");
      }
      if (nameLower.includes("biryani")) {
        matchedCategories.push("Biryani");
      }
      if (nameLower.includes("punjab") || nameLower.includes("dhaba") || nameLower.includes("north indian") || nameLower.includes("balle")) {
        matchedCategories.push("North Indian");
        if (nameLower.includes("dhaba") || nameLower.includes("balle")) {
          matchedCategories.push("Dhaba");
        }
      }
      if (nameLower.includes("south indian") || nameLower.includes("dosa") || nameLower.includes("idli") || nameLower.includes("darshini") || nameLower.includes("bhavan") || nameLower.includes("sagar") || nameLower.includes("udupi")) {
        matchedCategories.push("South Indian");
      }
      if (nameLower.includes("pizza") || nameLower.includes("burger") || nameLower.includes("fried chicken") || nameLower.includes("chicken") || types.includes("meal_takeaway") || types.includes("fast_food_restaurant")) {
        matchedCategories.push("Fast Food");
        matchedCategories.push("Quick Bites");
      }
      if (nameLower.includes("rooftop")) {
        matchedCategories.push("Rooftop");
      }
      if (types.includes("restaurant") || nameLower.includes("restaurant") || nameLower.includes("kitchen")) {
        if (matchedCategories.includes("Bar") || matchedCategories.includes("Pub") || matchedCategories.includes("Brewery")) {
          matchedCategories.push("Restaurant");
        } else if (!matchedCategories.includes("Fast Food") && !matchedCategories.includes("Cafe") && !matchedCategories.includes("Bakery & Desserts")) {
          matchedCategories.push("Casual Dining");
        }
      }
      if (matchedCategories.length === 0) {
        matchedCategories.push("Casual Dining");
      }
    } else if (category === "SPORTS") {
      if (nameLower.includes("pickleball")) {
        matchedCategories.push("Pickleball");
      }
      if (nameLower.includes("badminton") || nameLower.includes("shuttle")) {
        matchedCategories.push("Badminton");
      }
      if (nameLower.includes("cricket") || nameLower.includes("box cricket")) {
        matchedCategories.push("Box Cricket");
      }
      if (nameLower.includes("football") || nameLower.includes("futsal") || nameLower.includes("soccer")) {
        matchedCategories.push("Football");
      }
      if (nameLower.includes("tennis") && !nameLower.includes("table tennis")) {
        matchedCategories.push("Tennis");
      }
      if (nameLower.includes("swimming") || nameLower.includes("pool")) {
        matchedCategories.push("Swimming");
      }
      if (nameLower.includes("fitness") || nameLower.includes("gym") || types.includes("gym")) {
        matchedCategories.push("Fitness");
      }
      if (nameLower.includes("turf")) {
        matchedCategories.push("Turf");
      }
      if (nameLower.includes("court") && !matchedCategories.includes("Badminton") && !matchedCategories.includes("Pickleball")) {
        matchedCategories.push("Court");
      }
      if (nameLower.includes("arena") || nameLower.includes("sports complex") || types.includes("sports_complex")) {
        if (!matchedCategories.includes("Turf")) matchedCategories.push("Sports Arena");
      }
      if (matchedCategories.length === 0) {
        matchedCategories.push("Sports & Turf");
      }
    } else if (category === "MOVIES") {
      if (nameLower.includes("imax")) matchedCategories.push("IMAX");
      if (nameLower.includes("4dx")) matchedCategories.push("4DX");
      if (matchedCategories.length === 0) matchedCategories.push("Cinema");
    } else if (category === "ACTIVITIES") {
      if (nameLower.includes("bowl") || types.includes("bowling_alley")) {
        matchedCategories.push("Bowling");
      }
      if (nameLower.includes("escape") || nameLower.includes("mystery") || nameLower.includes("breakout")) {
        matchedCategories.push("Mystery Rooms");
      }
      if (nameLower.includes("kart") || nameLower.includes("karting")) {
        matchedCategories.push("Go-Karting");
      }
      if (nameLower.includes("amusement") || nameLower.includes("theme park") || nameLower.includes("water park") || nameLower.includes("wonderla") || types.includes("amusement_park")) {
        matchedCategories.push("Amusement Parks");
      }
      if (nameLower.includes("arcade") || nameLower.includes("gaming") || nameLower.includes("game zone") || nameLower.includes("smaash") || nameLower.includes("timezone") || nameLower.includes("vr")) {
        matchedCategories.push("Arcades");
      }
      if (nameLower.includes("trampoline") || nameLower.includes("bounce")) {
        matchedCategories.push("Trampoline Park");
      }
      if (nameLower.includes("laser tag") || nameLower.includes("laser")) {
        matchedCategories.push("Laser Tag");
      }
      if (nameLower.includes("paintball")) {
        matchedCategories.push("Paintball");
      }
      if (nameLower.includes("mini golf") || nameLower.includes("golf")) {
        matchedCategories.push("Mini Golf");
      }
      if (nameLower.includes("skat") || nameLower.includes("ice skat")) {
        matchedCategories.push("Skating");
      }
      if (nameLower.includes("adventure") || nameLower.includes("climbing") || nameLower.includes("rope") || nameLower.includes("play arena")) {
        matchedCategories.push("Adventure & Fun");
      }
      if (matchedCategories.length === 0) {
        matchedCategories.push("Adventure & Fun");
      }
    }

    const subcat = Array.from(new Set(matchedCategories)).slice(0, 2).join(" | ");

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
      id: `place_${place.place_id}`,
      public_id: `place_${place.place_id}`,
      section_id: `places_${category.toLowerCase()}`,
      title: place.name || "Unnamed Place",
      name: place.name || "Unnamed Place",
      category,
      subcategory: subcat,
      description: locText,
      cover_image_url: coverUrl,
      location: locText,
      suggested_duration_minutes: category === "MOVIES" ? 150 : category === "ACTIVITIES" ? 120 : 90,
      suggested_cost_amount: null,
      suggested_capacity: null,
      default_rsvp_offset_minutes: 60,
      display_order: index + 1,
      featured: index < 3,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      place_id: place.place_id,
      provider_place_id: place.place_id,
      place_address: locText,
      latitude: pLat,
      longitude: pLng,
      distance: distanceStr,
      rating: typeof place.rating === "number" ? place.rating : null,
      user_ratings_total: typeof place.user_ratings_total === "number" ? place.user_ratings_total : null,
    };
  });
}

export async function handleDiscoveryPlaces(body: any, req: Request): Promise<{ sections: PlaceSection[] }> {
  const apiKey = getGoogleApiKey();
  const photoBaseUrl = body?.photoBaseUrl || "/functions/v1/maps";

  const lat = typeof body?.latitude === "number" ? body.latitude : DEFAULT_LATITUDE;
  const lng = typeof body?.longitude === "number" ? body.longitude : DEFAULT_LONGITUDE;
  const radius = typeof body?.radius === "number" ? body.radius : DEFAULT_RADIUS_METERS;
  const requestedCategory = (body?.category || "ALL").toUpperCase();

  const sections: PlaceSection[] = [];

  // ─── 1. SPORTS (Max 50) ──────────────────────────────────────────────────────
  if (requestedCategory === "ALL" || requestedCategory === "SPORTS") {
    try {
      const sportsQueries: SearchQueryDef[] = [
        { keyword: "turf" },
        { keyword: "badminton court" },
        { keyword: "sports complex ground" },
        { keyword: "football cricket turf arena" },
        { keyword: "basketball tennis court" },
        { keyword: "sports club facility" },
      ];

      const sportsRaw = (await Promise.all(
        sportsQueries.map((q) => fetchNearbyQuery(apiKey, lat, lng, radius, q))
      )).flat();

      const sportsItems = normalizePlaces(sportsRaw, "SPORTS", photoBaseUrl, lat, lng);

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

  // ─── 2. MOVIES (Max 50) ──────────────────────────────────────────────────────
  if (requestedCategory === "ALL" || requestedCategory === "MOVIES") {
    try {
      const movieQueries: SearchQueryDef[] = [
        { type: "movie_theater" },
        { keyword: "cinema multiplex" },
        { keyword: "theatre movies" },
        { keyword: "imax cinema" },
        { keyword: "film theater" },
      ];

      const moviesRaw = (await Promise.all(
        movieQueries.map((q) => fetchNearbyQuery(apiKey, lat, lng, radius, q))
      )).flat();

      const movieItems = normalizePlaces(moviesRaw, "MOVIES", photoBaseUrl, lat, lng);

      sections.push({
        id: "places_movies",
        public_id: "places_movies",
        category: "MOVIES",
        title: "Movies",
        description: "Cinemas and movie theatres nearby",
        display_order: 2,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: movieItems,
      });
    } catch (err) {
      console.error("[discoveryPlaces] Movies query failed:", err);
      sections.push({
        id: "places_movies",
        public_id: "places_movies",
        category: "MOVIES",
        title: "Movies",
        description: "Cinemas and movie theatres nearby",
        display_order: 2,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [],
      });
    }
  }

  // ─── 3. DINING (Max 50) ──────────────────────────────────────────────────────
  if (requestedCategory === "ALL" || requestedCategory === "DINING") {
    try {
      const diningQueries: SearchQueryDef[] = [
        { type: "restaurant" },
        { keyword: "cafe bistro dining" },
        { keyword: "popular restaurant food" },
        { keyword: "fine dining lounge" },
        { keyword: "eatery restaurant" },
      ];

      const diningRaw = (await Promise.all(
        diningQueries.map((q) => fetchNearbyQuery(apiKey, lat, lng, radius, q))
      )).flat();

      const diningItems = normalizePlaces(diningRaw, "DINING", photoBaseUrl, lat, lng);

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
      const activityQueries: SearchQueryDef[] = [
        { type: "bowling_alley" },
        { keyword: "bowling alley" },
        { keyword: "escape room mystery room" },
        { keyword: "go karting karting track" },
        { type: "amusement_park" },
        { keyword: "amusement park theme park water park" },
        { keyword: "trampoline park bounce" },
        { keyword: "arcade gaming zone laser tag" },
        { keyword: "paintball mini golf adventure park" },
      ];

      const activityRaw = (await Promise.all(
        activityQueries.map((q) => fetchNearbyQuery(apiKey, lat, lng, radius, q))
      )).flat();

      const activityItems = normalizePlaces(activityRaw, "ACTIVITIES", photoBaseUrl, lat, lng);

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
