import { describe, it, expect } from "vitest";
import {
  scoreSportsVenueRelevance,
  isSportVenueRelevant,
  sortSportsVenues,
  getSportsVenueLabel,
  SPORTS_CONFIGS,
  RELEVANCE_THRESHOLD,
  STRONGLY_RELEVANT_THRESHOLD,
  SportCategoryId,
} from "../services/sportsRelevance";
import { resolveVenueCategories } from "../components/DiscoveryCard";
import { DiscoveryItem } from "../../../core/types/discovery";

describe("Sports Relevance Dedicated Suite (Section 17 Requirements)", () => {
  const createPlace = (
    overrides: Partial<DiscoveryItem> & { types?: string[] } = {}
  ): DiscoveryItem & { types?: string[] } => ({
    id: "p1",
    public_id: "p1",
    section_id: "sec-sports",
    title: "Test Venue",
    category: "SPORTS",
    subcategory: "Sports Facility",
    description: "Venue description",
    cover_image_url: null,
    location: "Bengaluru",
    suggested_duration_minutes: null,
    suggested_cost_amount: null,
    suggested_capacity: null,
    default_rsvp_offset_minutes: null,
    display_order: 1,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  describe("Football Relevance", () => {
    it("accepts football turfs, grounds, and academies", () => {
      const turf = createPlace({ title: "Play Arena Football Turf" });
      const ground = createPlace({ title: "Koramangala Football Ground" });
      const academy = createPlace({ title: "Bengaluru FC Football Academy" });
      const futsal = createPlace({ title: "Arena Futsal Court" });
      const fiveAside = createPlace({ title: "5-a-side Football Turf" });

      expect(isSportVenueRelevant(turf, "football")).toBe(true);
      expect(isSportVenueRelevant(ground, "football")).toBe(true);
      expect(isSportVenueRelevant(academy, "football")).toBe(true);
      expect(isSportVenueRelevant(futsal, "football")).toBe(true);
      expect(isSportVenueRelevant(fiveAside, "football")).toBe(true);
    });

    it("rejects badminton venues when football is selected", () => {
      const badminton = createPlace({ title: "Smash Badminton Centre" });
      expect(isSportVenueRelevant(badminton, "football")).toBe(false);
    });

    it("rejects sports equipment stores, sportswear stores, and retail", () => {
      const decathlon = createPlace({
        title: "Decathlon Sports India",
        types: ["sporting_goods_store"],
      });
      const nike = createPlace({
        title: "Nike Football & Running Store",
        subcategory: "Shoe Store | Sportswear",
      });
      const equipment = createPlace({
        title: "National Sports Equipment Dealer",
        subcategory: "Retailer",
      });

      expect(isSportVenueRelevant(decathlon, "football")).toBe(false);
      expect(isSportVenueRelevant(nike, "football")).toBe(false);
      expect(isSportVenueRelevant(equipment, "football")).toBe(false);
    });

    it("rejects football associations, offices, and administrative bodies", () => {
      const association = createPlace({
        title: "Karnataka State Football Association Office",
      });
      const board = createPlace({
        title: "Football Management Board Headquarters",
      });

      expect(isSportVenueRelevant(association, "football")).toBe(false);
      expect(isSportVenueRelevant(board, "football")).toBe(false);
    });

    it("rejects generic gyms unless they explicitly have football facilities", () => {
      const genericGym = createPlace({
        title: "Gold's Gym Richmond Town",
        types: ["gym", "fitness_center"],
      });
      expect(isSportVenueRelevant(genericGym, "football")).toBe(false);

      const gymWithTurf = createPlace({
        title: "Fitness One Sports Hub & Football Turf",
      });
      expect(isSportVenueRelevant(gymWithTurf, "football")).toBe(true);
    });
  });

  describe("Badminton Relevance", () => {
    it("accepts badminton courts, clubs, and academies", () => {
      const court = createPlace({ title: "Whitefield Badminton Court" });
      const club = createPlace({ title: "Smash Badminton Club" });
      const academy = createPlace({ title: "Pullela Badminton Academy" });
      const centre = createPlace({ title: "Bangalore Badminton Centre" });

      expect(isSportVenueRelevant(court, "badminton")).toBe(true);
      expect(isSportVenueRelevant(club, "badminton")).toBe(true);
      expect(isSportVenueRelevant(academy, "badminton")).toBe(true);
      expect(isSportVenueRelevant(centre, "badminton")).toBe(true);
    });

    it("rejects football turfs when badminton is selected", () => {
      const turf = createPlace({ title: "Tiki Taka Football Turf" });
      expect(isSportVenueRelevant(turf, "badminton")).toBe(false);
    });

    it("rejects sporting goods stores and retail shops", () => {
      const store = createPlace({
        title: "Yonex Racquet & Sports Store",
        types: ["sporting_goods_store"],
      });
      expect(isSportVenueRelevant(store, "badminton")).toBe(false);
    });
  });

  describe("Tennis Relevance vs Table Tennis", () => {
    it("accepts lawn tennis courts, clubs, and academies", () => {
      const tennis = createPlace({ title: "Vantage Clay Tennis Academy" });
      const courts = createPlace({ title: "City Tennis Courts" });

      expect(isSportVenueRelevant(tennis, "tennis")).toBe(true);
      expect(isSportVenueRelevant(courts, "tennis")).toBe(true);
    });

    it("does not allow table tennis venues to pollute lawn tennis", () => {
      const tableTennis = createPlace({ title: "Spin Table Tennis Centre" });
      expect(isSportVenueRelevant(tableTennis, "tennis")).toBe(false);
    });

    it("correctly identifies Table Tennis venues for table-tennis category", () => {
      const ttVenue = createPlace({ title: "Spin Table Tennis Centre" });
      const pingPong = createPlace({ title: "Downtown Ping Pong Club" });
      const lawnTennis = createPlace({ title: "Vantage Clay Tennis Academy" });

      expect(isSportVenueRelevant(ttVenue, "table-tennis")).toBe(true);
      expect(isSportVenueRelevant(pingPong, "table-tennis")).toBe(true);
      expect(isSportVenueRelevant(lawnTennis, "table-tennis")).toBe(false);
    });
  });

  describe("Pickleball, Basketball, Cricket Relevance", () => {
    it("accepts pickleball venues and rejects other sports", () => {
      const pickle = createPlace({ title: "Dink Pickleball Courts" });
      const cricket = createPlace({ title: "Powerplay Cricket Nets" });

      expect(isSportVenueRelevant(pickle, "pickleball")).toBe(true);
      expect(isSportVenueRelevant(cricket, "pickleball")).toBe(false);
    });

    it("accepts basketball courts and rejects unrelated sports", () => {
      const bball = createPlace({ title: "Dunk Basketball Arena" });
      const football = createPlace({ title: "Tiki Taka Football Turf" });

      expect(isSportVenueRelevant(bball, "basketball")).toBe(true);
      expect(isSportVenueRelevant(football, "basketball")).toBe(false);
    });

    it("accepts cricket grounds, nets, and box cricket pitches", () => {
      const nets = createPlace({ title: "Powerplay Cricket Nets" });
      const ground = createPlace({ title: "National Cricket Stadium & Ground" });
      const box = createPlace({ title: "Koramangala Box Cricket Arena" });

      expect(isSportVenueRelevant(nets, "cricket")).toBe(true);
      expect(isSportVenueRelevant(ground, "cricket")).toBe(true);
      expect(isSportVenueRelevant(box, "cricket")).toBe(true);
    });
  });

  describe("All Sports Relevance (Section 12)", () => {
    it("accepts multiple playable sports venues across categories", () => {
      const turf = createPlace({ title: "Tiki Taka Football Turf" });
      const court = createPlace({ title: "Smash Badminton Centre" });
      const tennis = createPlace({ title: "City Tennis Courts" });
      const pool = createPlace({ title: "Olympian Swimming Pool" });
      const cricket = createPlace({ title: "Powerplay Cricket Nets" });

      expect(isSportVenueRelevant(turf, "all")).toBe(true);
      expect(isSportVenueRelevant(court, "all")).toBe(true);
      expect(isSportVenueRelevant(tennis, "all")).toBe(true);
      expect(isSportVenueRelevant(pool, "all")).toBe(true);
      expect(isSportVenueRelevant(cricket, "all")).toBe(true);
    });

    it("rejects retail stores, sports offices, and generic businesses in All Sports", () => {
      const decathlon = createPlace({
        title: "Decathlon Sports India",
        types: ["sporting_goods_store"],
      });
      const nikeStore = createPlace({
        title: "Nike Store Indiranagar",
        subcategory: "Shoe Store",
      });
      const office = createPlace({
        title: "State Sports Council Association Office",
      });
      const genericGym = createPlace({
        title: "Anytime Fitness 24/7",
        types: ["gym"],
      });

      expect(isSportVenueRelevant(decathlon, "all")).toBe(false);
      expect(isSportVenueRelevant(nikeStore, "all")).toBe(false);
      expect(isSportVenueRelevant(office, "all")).toBe(false);
      expect(isSportVenueRelevant(genericGym, "all")).toBe(false);
    });
  });

  describe("Sorting & Two-Tier Ranking (Section 9)", () => {
    it("prioritizes strongly relevant venues over weakly relevant venues even if the weaker one is closer", () => {
      // Venue A: Weakly relevant generic sports complex 1 km away
      const venueA = createPlace({
        id: "a",
        title: "City Sports Complex", // Playable term: +20, relevant type: +25 = 45 (tier 2)
        types: ["sports_complex"],
      });
      (venueA as any)._distanceKm = 1.0;

      // Venue B: Strongly relevant dedicated football turf 5 km away
      const venueB = createPlace({
        id: "b",
        title: "Koramangala Football Turf", // Sport name: +100, venue term: +20 = 120 (tier 1)
        types: ["athletic_field"],
      });
      (venueB as any)._distanceKm = 5.0;

      const sorted = sortSportsVenues([venueA, venueB], "football");

      expect(sorted[0].id).toBe("b"); // Strongly relevant football turf comes first
      expect(sorted[1].id).toBe("a");
    });

    it("sorts by nearest distance within the same relevance tier", () => {
      const closeTurf = createPlace({
        id: "close",
        title: "Indiranagar Football Turf",
      });
      (closeTurf as any)._distanceKm = 2.1;

      const farTurf = createPlace({
        id: "far",
        title: "Whitefield Football Turf",
      });
      (farTurf as any)._distanceKm = 12.5;

      const sorted = sortSportsVenues([farTurf, closeTurf], "football");

      expect(sorted[0].id).toBe("close");
      expect(sorted[1].id).toBe("far");
    });
  });

  describe("Multi-Query Search Configuration (Section 2 & 7)", () => {
    it("defines distinct targeted queries and types for each category", () => {
      for (const cat of Object.keys(SPORTS_CONFIGS)) {
        const cfg = SPORTS_CONFIGS[cat as keyof typeof SPORTS_CONFIGS];
        expect(cfg.searchQueries.length).toBeGreaterThan(0);
        expect(cfg.relevantGoogleTypes.length).toBeGreaterThan(0);
        expect(cfg.strongPositiveKeywords.length).toBeGreaterThan(0);
      }
    });

    it("football config includes futsal, turf, 5-a-side, and academy searches", () => {
      const football = SPORTS_CONFIGS.football;
      expect(football.searchQueries).toContain("football turf");
      expect(football.searchQueries).toContain("futsal");
      expect(football.searchQueries).toContain("5 a side football");
      expect(football.searchQueries).toContain("football academy");
    });

    it("cricket config includes cricket nets, grounds, and stadiums", () => {
      const cricket = SPORTS_CONFIGS.cricket;
      expect(cricket.searchQueries).toContain("cricket nets");
      expect(cricket.searchQueries).toContain("cricket ground");
      expect(cricket.searchQueries).toContain("cricket stadium");
    });
  });

  describe("Sports Venue Presentation Labels (Section 1-8 & 11)", () => {
    it("converts screenshot example 'Bengaluru Turf Inc.,' with generic provider types into 'Football Turf'", () => {
      const screenshotPlace = createPlace({
        title: "Bengaluru Turf Inc.,",
        subcategory: "Establishment | Point Of Interest",
        types: ["point_of_interest", "establishment"],
      });

      // Label must be exactly the sport name — no venue-type suffix
      expect(getSportsVenueLabel(screenshotPlace, "football")).toBe("Football");
      expect(getSportsVenueLabel(screenshotPlace)).toBe("Football");

      // Through the single source of truth resolveVenueCategories
      expect(resolveVenueCategories(screenshotPlace)).toBe("Football");
      expect(resolveVenueCategories(screenshotPlace)).not.toContain("Establishment");
      expect(resolveVenueCategories(screenshotPlace)).not.toContain("Point Of Interest");
    });

    it("label is always exactly the sport name — no venue-type suffix for any venue type", () => {
      const BANNED_SUFFIXES = [
        "Turf", "Arena", "Court", "Academy", "Club", "Ground",
        "Field", "Facility", "Centre", "Center", "Stadium", "Nets",
        "Complex", "Hub",
      ];

      const venueInputs: Array<{ title: string; sport: SportCategoryId; expected: string }> = [
        // Football — various venue types all resolve to "Football"
        { title: "Play Football Turf",           sport: "football",     expected: "Football" },
        { title: "Koramangala Football Ground",   sport: "football",     expected: "Football" },
        { title: "Arena Futsal Court",            sport: "football",     expected: "Football" },
        { title: "ABC Football Arena",            sport: "football",     expected: "Football" },
        { title: "East Bengal Football Stadium",  sport: "football",     expected: "Football" },
        { title: "Bengaluru Football Club",       sport: "football",     expected: "Football" },
        { title: "Elite Football Academy",        sport: "football",     expected: "Football" },
        { title: "City Sports Complex",           sport: "football",     expected: "Football" },
        { title: "Unnamed Football Venue",        sport: "football",     expected: "Football" },
        { title: "Bengaluru Turf Inc.,",          sport: "football",     expected: "Football" },
        // Badminton
        { title: "Smash Badminton Courts",        sport: "badminton",    expected: "Badminton" },
        { title: "XYZ Badminton Club",            sport: "badminton",    expected: "Badminton" },
        { title: "Pullela Badminton Academy",      sport: "badminton",    expected: "Badminton" },
        { title: "Whitefield Badminton Centre",   sport: "badminton",    expected: "Badminton" },
        { title: "Generic Badminton Hub",         sport: "badminton",    expected: "Badminton" },
        // Tennis
        { title: "Vantage Clay Tennis Academy",   sport: "tennis",       expected: "Tennis" },
        { title: "City Tennis Courts",            sport: "tennis",       expected: "Tennis" },
        { title: "Bangalore Tennis Club",         sport: "tennis",       expected: "Tennis" },
        // Pickleball
        { title: "Dink Pickleball Courts",        sport: "pickleball",   expected: "Pickleball" },
        // Basketball
        { title: "Dunk Basketball Court",         sport: "basketball",   expected: "Basketball" },
        // Cricket
        { title: "Powerplay Cricket Nets",        sport: "cricket",      expected: "Cricket" },
        { title: "National Cricket Ground",       sport: "cricket",      expected: "Cricket" },
        // Table Tennis
        { title: "Spin Table Tennis Centre",      sport: "table-tennis", expected: "Table Tennis" },
        // Multi-sport: Rush Koland in each section
        { title: "Rush Koland",                   sport: "football",     expected: "Football" },
        { title: "Rush Koland",                   sport: "pickleball",   expected: "Pickleball" },
      ];

      for (const { title, sport, expected } of venueInputs) {
        const label = getSportsVenueLabel(createPlace({ title }), sport);
        expect(label).toBe(expected);

        // Confirm no banned suffix appears in the label
        for (const suffix of BANNED_SUFFIXES) {
          expect(label).not.toContain(suffix);
        }
      }
    });

    it("correctly returns 'Sports Facility' only for 'other' / unlabelled sport context", () => {
      expect(getSportsVenueLabel(createPlace({ title: "Olympian Swimming Pool" }), "other")).toBe("Sports Facility");
      expect(getSportsVenueLabel(createPlace({ title: "Generic Complex" }))).toBe("Sports Facility");
    });

    it("never falls back to Google's generic types (Establishment / Point Of Interest / Generic Business)", () => {
      const places = [
        createPlace({ title: "Play Turf", subcategory: "Establishment | Point Of Interest" }),
        createPlace({ title: "City Court", subcategory: "Point Of Interest" }),
        createPlace({ title: "Sports Hub", subcategory: "Establishment" }),
      ];

      for (const p of places) {
        const label = resolveVenueCategories(p);
        expect(label).not.toContain("Establishment");
        expect(label).not.toContain("Point Of Interest");
        expect(label).not.toBe("Sports");
      }
    });
  });
});

