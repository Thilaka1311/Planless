import { describe, it, expect } from "vitest";
import {
  isStrictActivityVenue,
  isActivityVenueRelevant,
  extractActivityCategories,
  scoreActivityVenueRelevance,
  ACTIVITIES_CONFIGS,
  HARD_EXCLUDED_ACTIVITY_KEYWORDS,
  ActivityCategoryId,
} from "../services/activitiesRelevance";
import { isAuthenticActivityVenue } from "../services/venueRelevance";
import { DiscoveryItem } from "../../../core/types/discovery";

describe("Activities Relevance Dedicated Suite", () => {
  const createVenue = (
    overrides: Partial<DiscoveryItem> & { types?: string[] } = {}
  ): DiscoveryItem & { types?: string[] } => ({
    id: "act-1",
    public_id: "act-1",
    section_id: "sec-activities",
    title: "Test Activity Venue",
    category: "ACTIVITIES",
    subcategory: "Activities",
    description: "Venue description",
    cover_image_url: null,
    location: "Bengaluru",
    suggested_duration_minutes: 120,
    suggested_cost_amount: null,
    suggested_capacity: null,
    default_rsvp_offset_minutes: 60,
    display_order: 1,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  describe("Hard Negative Exclusions (Bad Google Places Results)", () => {
    it("rejects water plants, drinking water kiosks, purifiers, and water supply businesses", () => {
      const waterBusinesses = [
        createVenue({ title: "Shuddha Kudiyuva Neerina Ghataka", types: ["amusement_park", "point_of_interest"] }),
        createVenue({ title: "Dr Raju Water Plant", types: ["amusement_park", "establishment"] }),
        createVenue({ title: "Kudiyuva Neerina Ghataka Unit 4", types: ["point_of_interest"] }),
        createVenue({ title: "SLV Packaged Drinking Water Supply", types: ["amusement_park"] }),
        createVenue({ title: "Cauvery Drinking Water Station", types: ["point_of_interest"] }),
        createVenue({ title: "Aqua Pure Water Supplier", types: ["establishment"] }),
        createVenue({ title: "Pure RO Water Plant", types: ["amusement_park"] }),
        createVenue({ title: "Bisleri Water Can Supplier", types: ["store"] }),
        createVenue({ title: "Sri Manjunatha Borewell & Water Tanker", types: ["establishment"] }),
      ];

      for (const venue of waterBusinesses) {
        expect(isStrictActivityVenue(venue)).toBe(false);
        expect(isAuthenticActivityVenue(venue)).toBe(false);
        expect(isActivityVenueRelevant(venue)).toBe(false);
        expect(scoreActivityVenueRelevance(venue)).toBe(0);
      }
    });

    it("rejects natural water bodies, lakes, retention ponds, and reservoirs", () => {
      const waterBodies = [
        createVenue({ title: "Arpa lake", types: ["amusement_park", "point_of_interest"] }),
        createVenue({ title: "Orion pond", types: ["amusement_park", "tourist_attraction"] }),
        createVenue({ title: "Ulsoor Lake", types: ["tourist_attraction"] }),
        createVenue({ title: "Sankey Tank Lake", types: ["point_of_interest"] }),
        createVenue({ title: "Agara Lake Kere", types: ["park"] }),
        createVenue({ title: "Bellandur Reservoir Drainage", types: ["establishment"] }),
      ];

      for (const venue of waterBodies) {
        expect(isStrictActivityVenue(venue)).toBe(false);
        expect(isAuthenticActivityVenue(venue)).toBe(false);
      }
    });

    it("rejects corporate offices, headquarters, logistics, and co-working spaces", () => {
      const corporateOffices = [
        createVenue({ title: "Head Office - Param Innovation", types: ["amusement_park", "point_of_interest"] }),
        createVenue({ title: "Param Innovation Technologies Pvt Ltd", types: ["amusement_park"] }),
        createVenue({ title: "Corporate Office Hub", types: ["establishment"] }),
        createVenue({ title: "Wipro Technologies Headquarters", types: ["point_of_interest"] }),
        createVenue({ title: "WeWork Co-working Space", types: ["establishment"] }),
        createVenue({ title: "Blue Dart Logistics & Courier", types: ["establishment"] }),
      ];

      for (const venue of corporateOffices) {
        expect(isStrictActivityVenue(venue)).toBe(false);
        expect(isAuthenticActivityVenue(venue)).toBe(false);
      }
    });

    it("rejects residential apartments, real estate, and hostels", () => {
      const residential = [
        createVenue({ title: "Ali 501", types: ["amusement_park", "point_of_interest"] }),
        createVenue({ title: "Prestige Silver Oak Apartments", types: ["amusement_park"] }),
        createVenue({ title: "Sobha Forest View Residency", types: ["establishment"] }),
        createVenue({ title: "Godrej Properties Developers Enclave", types: ["real_estate_agency"] }),
        createVenue({ title: "Sri Lakshmi PG For Gents", types: ["establishment"] }),
      ];

      for (const venue of residential) {
        expect(isStrictActivityVenue(venue)).toBe(false);
        expect(isAuthenticActivityVenue(venue)).toBe(false);
      }
    });

    it("rejects pure sports facilities (which belong strictly in Sports, not Activities)", () => {
      const pureSports = [
        createVenue({ title: "Dribble Football Turf", types: ["sports_complex"] }),
        createVenue({ title: "Smash Badminton Academy", types: ["sports_club"] }),
        createVenue({ title: "Apex Cricket Ground Turf Nets", types: ["athletic_field"] }),
        createVenue({ title: "Ace Tennis Court Academy", types: ["sports_complex"] }),
      ];

      for (const venue of pureSports) {
        expect(isStrictActivityVenue(venue)).toBe(false);
      }
    });

    it("permits multi-activity entertainment hubs that feature sports (Play Arena, Torq03)", () => {
      const multiHubs = [
        createVenue({ title: "Play Arena", types: ["amusement_center"] }),
        createVenue({ title: "Torq03 Entertainment Hub", types: ["amusement_center"] }),
        createVenue({ title: "Loco Bear Entertainment", types: ["amusement_center"] }),
      ];

      for (const venue of multiHubs) {
        expect(isStrictActivityVenue(venue)).toBe(true);
      }
    });
  });

  describe("Positive Authentic Activity Venues Acceptance", () => {
    it("accepts authentic Mystery Rooms & Escape Room venues", () => {
      const mysteryVenues = [
        createVenue({ title: "Mystery Rooms Indiranagar", types: ["establishment", "point_of_interest"] }),
        createVenue({ title: "Breakout Escape Games Koramangala", types: ["point_of_interest"] }),
        createVenue({ title: "The Amazing Escape Room", types: ["amusement_center"] }),
        createVenue({ title: "Mystery Owl Escape Games", types: ["establishment"] }),
        createVenue({ title: "Lock N Escape Puzzle Room", types: ["amusement_center"] }),
      ];

      for (const venue of mysteryVenues) {
        expect(isStrictActivityVenue(venue)).toBe(true);
        expect(isActivityVenueRelevant(venue, "mystery-rooms")).toBe(true);
        expect(extractActivityCategories(venue)).toContain("Mystery Rooms");
      }
    });

    it("accepts authentic Bowling venues", () => {
      const bowlingVenues = [
        createVenue({ title: "Amoeba Cosmic Bowling Alley", types: ["bowling_alley"] }),
        createVenue({ title: "Loco Lane Bowling", types: ["bowling_alley", "point_of_interest"] }),
        createVenue({ title: "Smaaash Bowling Arena", types: ["bowling_alley"] }),
        createVenue({ title: "Go Bowl Bowling Center", types: ["establishment"] }),
      ];

      for (const venue of bowlingVenues) {
        expect(isStrictActivityVenue(venue)).toBe(true);
        expect(isActivityVenueRelevant(venue, "bowling")).toBe(true);
        expect(extractActivityCategories(venue)).toContain("Bowling");
      }
    });

    it("accepts authentic Go-Karting venues", () => {
      const kartVenues = [
        createVenue({ title: "Racepace Go-Karting Track", types: ["amusement_center"] }),
        createVenue({ title: "Torq03 Karting Arena", types: ["amusement_center"] }),
        createVenue({ title: "Meco Kartopia Go Kart Track", types: ["point_of_interest"] }),
      ];

      for (const venue of kartVenues) {
        expect(isStrictActivityVenue(venue)).toBe(true);
        expect(isActivityVenueRelevant(venue, "go-karting")).toBe(true);
        expect(extractActivityCategories(venue)).toContain("Go-Karting");
      }
    });

    it("accepts authentic Amusement & Water Parks", () => {
      const amusementVenues = [
        createVenue({ title: "Wonderla Amusement Park", types: ["amusement_park"] }),
        createVenue({ title: "Fun World Amusement Park", types: ["amusement_park"] }),
        createVenue({ title: "Snow City Theme Park", types: ["amusement_park"] }),
        createVenue({ title: "Water World Bengaluru", types: ["water_park"] }),
      ];

      for (const venue of amusementVenues) {
        expect(isStrictActivityVenue(venue)).toBe(true);
        expect(isActivityVenueRelevant(venue, "amusement-parks")).toBe(true);
        expect(extractActivityCategories(venue)).toContain("Amusement Parks");
      }
    });

    it("accepts authentic Arcades & Gaming Zones", () => {
      const arcadeVenues = [
        createVenue({ title: "Timezone Gaming Zone", types: ["amusement_center"] }),
        createVenue({ title: "The Grid Gaming Lounge", types: ["amusement_center"] }),
        createVenue({ title: "Zero Latency VR Gaming Park", types: ["point_of_interest"] }),
        createVenue({ title: "Freakout Gaming Zone Arcade", types: ["amusement_center"] }),
      ];

      for (const venue of arcadeVenues) {
        expect(isStrictActivityVenue(venue)).toBe(true);
        expect(isActivityVenueRelevant(venue, "arcades")).toBe(true);
        expect(extractActivityCategories(venue)).toContain("Arcades");
      }
    });

    it("accepts authentic Adventure & Fun venues (trampoline, climbing, laser tag, paintball)", () => {
      const adventureVenues = [
        createVenue({ title: "SkyJumper Trampoline Park", types: ["amusement_center"] }),
        createVenue({ title: "Bounce Trampoline Park", types: ["amusement_center"] }),
        createVenue({ title: "Laser Tag Arena", types: ["amusement_center"] }),
        createVenue({ title: "Paintball Arena Bangalore", types: ["amusement_center"] }),
        createVenue({ title: "Equilibrium Climbing Gym & Bouldering", types: ["sports_complex"] }),
      ];

      for (const venue of adventureVenues) {
        expect(isStrictActivityVenue(venue)).toBe(true);
        expect(isActivityVenueRelevant(venue, "adventure-fun")).toBe(true);
        expect(extractActivityCategories(venue)).toContain("Adventure & Fun");
      }
    });

    it("accepts Mini Golf venues", () => {
      const miniGolf = createVenue({ title: "Putt Putt Mini Golf Arena", types: ["amusement_center"] });
      expect(isStrictActivityVenue(miniGolf)).toBe(true);
      expect(isActivityVenueRelevant(miniGolf, "mini-golf")).toBe(true);
      expect(extractActivityCategories(miniGolf)).toContain("Mini Golf");
    });
  });

  describe("Subcategory Disambiguation", () => {
    it("distinguishes bowling from escape rooms", () => {
      const bowling = createVenue({ title: "Amoeba Cosmic Bowling Alley", types: ["bowling_alley"] });
      const escape = createVenue({ title: "Breakout Mystery Rooms", types: ["amusement_center"] });

      expect(isActivityVenueRelevant(bowling, "bowling")).toBe(true);
      expect(isActivityVenueRelevant(bowling, "mystery-rooms")).toBe(false);

      expect(isActivityVenueRelevant(escape, "mystery-rooms")).toBe(true);
      expect(isActivityVenueRelevant(escape, "bowling")).toBe(false);
    });

    it("distinguishes go-karting from arcades", () => {
      const karting = createVenue({ title: "Torq03 Go-Karting Track", types: ["amusement_center"] });
      const arcade = createVenue({ title: "Timezone Arcade Gaming Zone", types: ["amusement_center"] });

      expect(isActivityVenueRelevant(karting, "go-karting")).toBe(true);
      expect(isActivityVenueRelevant(karting, "arcades")).toBe(false);

      expect(isActivityVenueRelevant(arcade, "arcades")).toBe(true);
      expect(isActivityVenueRelevant(arcade, "go-karting")).toBe(false);
    });
  });

  describe("Taxonomy Configuration Integrity", () => {
    it("verifies all ACTIVITIES_CONFIGS subcategories have valid properties", () => {
      const categoryIds: ActivityCategoryId[] = [
        "all",
        "bowling",
        "mystery-rooms",
        "mini-golf",
        "go-karting",
        "amusement-parks",
        "arcades",
        "adventure-fun",
        "other",
      ];

      for (const catId of categoryIds) {
        const config = ACTIVITIES_CONFIGS[catId];
        expect(config).toBeDefined();
        expect(config.id).toBe(catId);
        expect(config.label).toBeTruthy();
        expect(config.searchQueries.length).toBeGreaterThan(0);
        expect(config.strongPositiveKeywords.length).toBeGreaterThan(0);
      }
    });

    it("verifies hard excluded keywords contains critical Bangalore edge-cases", () => {
      expect(HARD_EXCLUDED_ACTIVITY_KEYWORDS).toContain("water plant");
      expect(HARD_EXCLUDED_ACTIVITY_KEYWORDS).toContain("neerina ghataka");
      expect(HARD_EXCLUDED_ACTIVITY_KEYWORDS).toContain("kudiyuva neeru");
      expect(HARD_EXCLUDED_ACTIVITY_KEYWORDS).toContain("lake");
      expect(HARD_EXCLUDED_ACTIVITY_KEYWORDS).toContain("pond");
      expect(HARD_EXCLUDED_ACTIVITY_KEYWORDS).toContain("head office");
      expect(HARD_EXCLUDED_ACTIVITY_KEYWORDS).toContain("apartment");
    });
  });
});
