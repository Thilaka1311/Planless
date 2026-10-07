/**
 * curatedPhotos.ts
 *
 * Dedicated aesthetic image catalog for Planless discovery venues that lack owner-posted photos.
 * Ensures every authentic venue gets a magazine-quality photograph matching its exact activity,
 * with ZERO customer selfies or blurry photos.
 */

export const CURATED_CATEGORY_PHOTOS: Record<string, string> = {
  // Activities
  bowling: "/assets/curated/bowling.jpg",
  "mystery-rooms": "/assets/curated/mystery_rooms.jpg",
  "escape-rooms": "/assets/curated/mystery_rooms.jpg",
  "go-karting": "/assets/curated/go_karting.jpg",
  karting: "/assets/curated/go_karting.jpg",
  "amusement-parks": "/assets/curated/amusement_park.jpg",
  amusement: "/assets/curated/amusement_park.jpg",
  arcades: "/assets/curated/arcade.jpg",
  arcade: "/assets/curated/arcade.jpg",
  "mini-golf": "/assets/curated/mini_golf.jpg",
  "adventure-fun": "/assets/curated/adventure.jpg",
  trampoline: "/assets/curated/trampoline.jpg",
  climbing: "/assets/curated/adventure.jpg",

  // Sports
  pickleball: "/assets/curated/sports_pickleball.jpg",
  badminton: "/assets/curated/sports_badminton.jpg",
  football: "/assets/curated/sports_football.jpg",
  turf: "/assets/curated/sports_turf.jpg",
  cricket: "/assets/curated/sports_turf.jpg",
  basketball: "/assets/curated/sports_turf.jpg",
  tennis: "/assets/curated/sports_pickleball.jpg",
  swimming: "/assets/curated/sports_turf.jpg",

  // Dining
  cafes: "/assets/curated/cafe.jpg",
  cafe: "/assets/curated/cafe.jpg",
  coffee: "/assets/curated/cafe.jpg",
  "fine-dining": "/assets/curated/fine_dining.jpg",
  restaurants: "/assets/curated/restaurant.jpg",
  restaurant: "/assets/curated/restaurant.jpg",
  "pubs-breweries": "/assets/curated/pub.jpg",
  pubs: "/assets/curated/pub.jpg",
  pub: "/assets/curated/pub.jpg",
  brewery: "/assets/curated/brewery.jpg",
  "fast-food": "/assets/curated/cafe.jpg",
};

export function getCuratedPhotoForVenue(
  category?: string | null,
  subcategory?: string | null,
  venueName?: string | null
): string {
  const normCat = (category || "").toUpperCase().trim();
  const normSub = (subcategory || "").toLowerCase().trim();
  const normName = (venueName || "").toLowerCase().trim();
  const text = `${normSub} ${normName}`;

  // 1. Check granular activities keywords
  if (text.includes("bowling") || text.includes("bowl")) return CURATED_CATEGORY_PHOTOS.bowling;
  if (text.includes("escape") || text.includes("mystery") || text.includes("breakout")) return CURATED_CATEGORY_PHOTOS["mystery-rooms"];
  if (text.includes("kart") || text.includes("karting")) return CURATED_CATEGORY_PHOTOS["go-karting"];
  if (text.includes("arcade") || text.includes("gaming") || text.includes("timezone")) return CURATED_CATEGORY_PHOTOS.arcades;
  if (text.includes("golf")) return CURATED_CATEGORY_PHOTOS["mini-golf"];
  if (text.includes("trampoline") || text.includes("bounce") || text.includes("skyjumper")) return CURATED_CATEGORY_PHOTOS.trampoline;
  if (text.includes("amusement") || text.includes("theme park") || text.includes("water park") || text.includes("wonderla")) {
    return CURATED_CATEGORY_PHOTOS["amusement-parks"];
  }

  // 2. Check granular sports keywords
  if (text.includes("pickleball") || text.includes("pickle")) return CURATED_CATEGORY_PHOTOS.pickleball;
  if (text.includes("badminton") || text.includes("shuttle")) return CURATED_CATEGORY_PHOTOS.badminton;
  if (text.includes("football") || text.includes("futsal") || text.includes("soccer")) return CURATED_CATEGORY_PHOTOS.football;
  if (text.includes("turf") || text.includes("cricket") || text.includes("box cricket")) return CURATED_CATEGORY_PHOTOS.turf;

  // 3. Check granular dining keywords
  if (text.includes("cafe") || text.includes("coffee") || text.includes("roaster") || text.includes("bakery")) return CURATED_CATEGORY_PHOTOS.cafes;
  if (text.includes("brewery") || text.includes("pub") || text.includes("bar") || text.includes("beer") || text.includes("taproom")) return CURATED_CATEGORY_PHOTOS.pubs;
  if (text.includes("fine dining") || text.includes("lounge")) return CURATED_CATEGORY_PHOTOS["fine-dining"];

  // 4. Category-level fallbacks
  if (normCat === "ACTIVITIES") return CURATED_CATEGORY_PHOTOS.arcades;
  if (normCat === "SPORTS") return CURATED_CATEGORY_PHOTOS.turf;
  if (normCat === "DINING") return CURATED_CATEGORY_PHOTOS.restaurants;

  return CURATED_CATEGORY_PHOTOS.bowling;
}
