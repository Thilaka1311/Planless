import { describe, it, expect } from "vitest";
import { intentAwareRankingEngine } from "../engine/rankingEngine";
import { parseUserQuery } from "../engine/queryUnderstanding";
import { SearchResultItem } from "../types/result";

function mockResultItem(partial: Partial<SearchResultItem>): SearchResultItem {
  return {
    id: partial.id || "test_id",
    public_id: partial.public_id || "test_id",
    section_id: partial.section_id || "places_dining",
    provider: "google",
    providerPlaceId: partial.providerPlaceId || "test_place_id",
    place_id: partial.place_id || "test_place_id",
    title: partial.title || "Sample Venue",
    category: partial.category || "DINING",
    subcategory: partial.subcategory || "Restaurant",
    displayLabel: partial.displayLabel || "Restaurant",
    description: partial.description || "",
    location: partial.location || "Indiranagar",
    place_address: partial.place_address || "Indiranagar, Bangalore",
    latitude: partial.latitude ?? 12.9716,
    longitude: partial.longitude ?? 77.5946,
    cover_image_url: partial.cover_image_url ?? "https://example.com/img.jpg",
    rating: partial.rating ?? 4.2,
    user_ratings_total: partial.user_ratings_total ?? 150,
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
    ...partial,
  };
}

describe("IntentAwareRankingEngine", () => {
  it("exact place beats closer unrelated place", () => {
    // User searches "Truffles"
    const parsed = parseUserQuery("Truffles");

    // Truffles is 3.5 km away
    const truffles = mockResultItem({
      id: "place_truffles",
      title: "Truffles",
      _distanceKm: 3.5,
      rating: 4.5,
      user_ratings_total: 2500,
    });

    // Unrelated cafe is 0.2 km away
    const closerCafe = mockResultItem({
      id: "place_closer_cafe",
      title: "Green Garden Cafe",
      _distanceKm: 0.2,
      rating: 4.1,
      user_ratings_total: 200,
    });

    const ranked = intentAwareRankingEngine.rank([closerCafe, truffles], parsed);
    expect(ranked[0].id).toBe("place_truffles");
  });

  it("brand match beats generic result", () => {
    // User searches "Third Wave Coffee"
    const parsed = parseUserQuery("Third Wave Coffee");

    // Brand branch 2.0 km away
    const brandMatch = mockResultItem({
      id: "place_third_wave_branch",
      title: "Third Wave Coffee Roasters - Indiranagar",
      _distanceKm: 2.0,
      rating: 4.4,
    });

    // Generic coffee shop 0.3 km away
    const genericCoffee = mockResultItem({
      id: "place_local_coffee",
      title: "Local Coffee Point",
      _distanceKm: 0.3,
      rating: 4.0,
    });

    const ranked = intentAwareRankingEngine.rank([genericCoffee, brandMatch], parsed);
    expect(ranked[0].id).toBe("place_third_wave_branch");
  });

  it("distance acts as a tie-breaker between multiple matching branches", () => {
    const parsed = parseUserQuery("Truffles");

    const closerTruffles = mockResultItem({
      id: "truffles_near",
      title: "Truffles",
      _distanceKm: 1.2,
      rating: 4.4,
      user_ratings_total: 1000,
    });

    const farTruffles = mockResultItem({
      id: "truffles_far",
      title: "Truffles",
      _distanceKm: 8.5,
      rating: 4.4,
      user_ratings_total: 1000,
    });

    const ranked = intentAwareRankingEngine.rank([farTruffles, closerTruffles], parsed);
    expect(ranked[0].id).toBe("truffles_near");
    expect(ranked[1].id).toBe("truffles_far");
  });

  it("location match scores higher for combined search", () => {
    // User searches "football turf in Koramangala"
    const parsed = parseUserQuery("football turf in Koramangala");

    const koramangalaTurf = mockResultItem({
      id: "turf_koramangala",
      title: "PlayOn Football Turf",
      place_address: "5th Block, Koramangala, Bengaluru",
      category: "SPORTS",
      displayLabel: "Football Turf",
      _distanceKm: 4.0,
    });

    const indiranagarTurf = mockResultItem({
      id: "turf_indiranagar",
      title: "Indiranagar Kickoff Turf",
      place_address: "100 Feet Rd, Indiranagar, Bengaluru",
      category: "SPORTS",
      displayLabel: "Football Turf",
      _distanceKm: 1.0,
    });

    const ranked = intentAwareRankingEngine.rank([indiranagarTurf, koramangalaTurf], parsed);
    expect(ranked[0].id).toBe("turf_koramangala");
  });

  it("relevant sports venue beats a sporting retail store with closer distance", () => {
    const parsed = parseUserQuery("badminton");

    const badmintonCourt = mockResultItem({
      id: "badminton_arena",
      title: "Smash Badminton Centre",
      category: "SPORTS",
      displayLabel: "Badminton Centre",
      _distanceKm: 3.0,
      rating: 4.6,
      user_ratings_total: 400,
    });

    const sportsStore = mockResultItem({
      id: "sports_store",
      title: "National Sports Store & Badminton Strings",
      category: "SPORTS",
      displayLabel: "Sporting Goods Store",
      _distanceKm: 0.5,
      rating: 4.1,
      user_ratings_total: 100,
    });

    const ranked = intentAwareRankingEngine.rank([sportsStore, badmintonCourt], parsed);
    expect(ranked[0].id).toBe("badminton_arena");
  });

  it("relevant restaurant beats supermarket / grocery with closer distance", () => {
    const parsed = parseUserQuery("restaurants");

    const restaurant = mockResultItem({
      id: "dining_restaurant",
      title: "The Fatty Bao Asian Gastro Bar",
      category: "DINING",
      displayLabel: "Asian Restaurant",
      _distanceKm: 2.5,
      rating: 4.5,
      user_ratings_total: 3000,
    });

    const supermarket = mockResultItem({
      id: "supermarket_food",
      title: "Daily Fresh Supermarket and Food Mart",
      category: "DINING",
      displayLabel: "Supermarket",
      _distanceKm: 0.2,
      rating: 3.8,
      user_ratings_total: 50,
    });

    const ranked = intentAwareRankingEngine.rank([supermarket, restaurant], parsed);
    expect(ranked[0].id).toBe("dining_restaurant");
  });

  it("specific place search 'Bengaluru Turf Inc' beats closer generic sport venues", () => {
    const parsed = parseUserQuery("Bengaluru Turf Inc");
    expect(parsed.intent).toBe("SEARCH_PLACE");

    const turfInc = mockResultItem({
      id: "turf_inc",
      title: "Bengaluru Turf Inc",
      category: "SPORTS",
      displayLabel: "Football Turf",
      _distanceKm: 6.2,
      rating: 4.6,
      user_ratings_total: 500,
    });

    const nearbyCourt = mockResultItem({
      id: "nearby_court",
      title: "City Badminton Courts",
      category: "SPORTS",
      displayLabel: "Badminton Court",
      _distanceKm: 0.5,
      rating: 4.2,
      user_ratings_total: 80,
    });

    const ranked = intentAwareRankingEngine.rank([nearbyCourt, turfInc], parsed);
    expect(ranked[0].id).toBe("turf_inc");
  });

  it("specific place search 'Cult Fit' beats closer unrelated gyms", () => {
    const parsed = parseUserQuery("Cult Fit");
    expect(parsed.intent).toBe("SEARCH_PLACE");

    const cultFit = mockResultItem({
      id: "cult_fit_branch",
      title: "Cult Fit Koramangala",
      category: "SPORTS",
      displayLabel: "Fitness Centre",
      _distanceKm: 4.0,
      rating: 4.7,
      user_ratings_total: 1200,
    });

    const localGym = mockResultItem({
      id: "local_gym",
      title: "Iron Paradise Gym",
      category: "SPORTS",
      displayLabel: "Gym",
      _distanceKm: 0.3,
      rating: 4.0,
      user_ratings_total: 50,
    });

    const ranked = intentAwareRankingEngine.rank([localGym, cultFit], parsed);
    expect(ranked[0].id).toBe("cult_fit_branch");
  });

  it("category search for 'football' prioritizes closer high-rated turf over distant turf with 'football' in name", () => {
    const parsed = parseUserQuery("football");
    expect(parsed.intent).toBe("SEARCH_SPORT");

    const closeTurf = mockResultItem({
      id: "close_kickoff_turf",
      title: "Kickoff Arena", // Doesn't have the word "football" in name
      category: "SPORTS",
      subcategory: "Football",
      displayLabel: "Football Turf",
      types: ["football_pitch", "sports_complex"],
      _distanceKm: 1.2,
      rating: 4.7,
      user_ratings_total: 600,
    });

    const distantTurf = mockResultItem({
      id: "distant_football_turf",
      title: "South City Football Ground & Turf", // Has the word "football" in name
      category: "SPORTS",
      subcategory: "Football",
      displayLabel: "Football Turf",
      types: ["football_pitch"],
      _distanceKm: 14.5,
      rating: 4.1,
      user_ratings_total: 40,
    });

    const ranked = intentAwareRankingEngine.rank([distantTurf, closeTurf], parsed);
    expect(ranked[0].id).toBe("close_kickoff_turf");
  });

  it("combined query 'restaurants in HSR' scores HSR Layout venue higher than Indiranagar venue", () => {
    const parsed = parseUserQuery("restaurants in HSR");
    expect(parsed.intent).toBe("SEARCH_COMBINED");
    expect(parsed.locationQuery).toBe("HSR");

    const hsrRestaurant = mockResultItem({
      id: "hsr_dining",
      title: "Third Wave Coffee",
      category: "DINING",
      displayLabel: "Cafe",
      place_address: "14th Main, Sector 7, HSR Layout, Bengaluru",
      _distanceKm: 5.0,
      rating: 4.5,
      user_ratings_total: 1000,
    });

    const indiranagarRestaurant = mockResultItem({
      id: "indiranagar_dining",
      title: "Third Wave Coffee",
      category: "DINING",
      displayLabel: "Cafe",
      place_address: "100 Feet Road, Indiranagar, Bengaluru",
      _distanceKm: 2.0,
      rating: 4.5,
      user_ratings_total: 1000,
    });

    const ranked = intentAwareRankingEngine.rank([indiranagarRestaurant, hsrRestaurant], parsed);
    expect(ranked[0].id).toBe("hsr_dining");
  });
});

