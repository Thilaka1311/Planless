import { describe, it, expect } from "vitest";
import {
  classifyVenueCategory,
  isPlayableSportsVenue,
  extractCleanPlaceId,
} from "../services/venueRelevance";
import { isSportVenueRelevant } from "../services/sportsRelevance";

describe("Google Places Categorization & Normalization Suite", () => {
  describe("1. Strict Mutual Exclusion of 3 Google Places Categories (Sports, Dining, Activities)", () => {
    it("Classifies multi-sport complexes and turfs as SPORTS, never DINING or ACTIVITIES", () => {
      // Rush Koland sports arena
      const rushKoland = {
        title: "Rush Koland Arena",
        types: ["sports_complex", "establishment", "point_of_interest"],
        description: "Football turf and badminton court with refreshment counter",
      };
      expect(classifyVenueCategory(rushKoland)).toBe("SPORTS");

      // Turf with cafe mention in description
      const turfWithCafe = {
        title: "Kickoff Football Turf & Cafe",
        types: ["sports_club", "stadium"],
        description: "FIFA approved astro turf with sports lounge cafe",
      };
      expect(classifyVenueCategory(turfWithCafe)).toBe("SPORTS");
      expect(classifyVenueCategory(turfWithCafe)).not.toBe("DINING");
    });

    it("Classifies restaurants, cafes, and bakeries as DINING, never SPORTS or ACTIVITIES", () => {
      const cafe = {
        title: "Third Wave Coffee",
        types: ["cafe", "coffee_shop", "food", "establishment"],
      };
      expect(classifyVenueCategory(cafe)).toBe("DINING");

      const restaurant = {
        title: "Empire Restaurant",
        types: ["restaurant", "food", "point_of_interest"],
      };
      expect(classifyVenueCategory(restaurant)).toBe("DINING");

      const bakery = {
        title: "Thom's Bakery",
        types: ["bakery", "store", "food"],
      };
      expect(classifyVenueCategory(bakery)).toBe("DINING");
    });

    it("Classifies bowling alleys, arcades, and amusement venues as ACTIVITIES", () => {
      const bowling = {
        title: "Amoeba Bowling & Gaming",
        types: ["bowling_alley", "amusement_center", "point_of_interest"],
      };
      expect(classifyVenueCategory(bowling)).toBe("ACTIVITIES");
      // Bowling alley is an activity, not a competitive sport turf
      expect(classifyVenueCategory(bowling)).not.toBe("SPORTS");
      expect(classifyVenueCategory(bowling)).not.toBe("DINING");

      const escapeRoom = {
        title: "Breakout Escape Rooms",
        types: ["tourist_attraction", "point_of_interest"],
        description: "Immersive escape room puzzle mystery game",
      };
      expect(classifyVenueCategory(escapeRoom)).toBe("ACTIVITIES");

      const arcade = {
        title: "Timezone Gaming Arcade",
        types: ["video_arcade", "amusement_center"],
      };
      expect(classifyVenueCategory(arcade)).toBe("ACTIVITIES");
    });

    it("Classifies movie theaters as MOVIES", () => {
      const cinema = {
        title: "PVR Cinemas Forum Mall",
        types: ["movie_theater", "establishment"],
      };
      expect(classifyVenueCategory(cinema)).toBe("MOVIES");
    });

    it("Classifies 'Matchday' with address landmark 'opposite Paradise Biryani' as SPORTS, never DINING", () => {
      const matchday = {
        title: "Matchday",
        name: "Matchday",
        types: ["establishment", "point_of_interest"],
        description: "47, New BEL Rd, opposite Paradise Biryani, Ramakrishna Gardens, Bengaluru",
      };
      expect(classifyVenueCategory(matchday)).toBe("SPORTS");
      expect(classifyVenueCategory(matchday)).not.toBe("DINING");
    });

    it("Immune to address landmarks: non-dining venues near food landmarks are never DINING", () => {
      const clinicNearStarbucks = {
        title: "Apex Healthcare Clinic",
        name: "Apex Healthcare Clinic",
        types: ["health", "point_of_interest"],
        description: "Near Starbucks Coffee and Domino's Pizza, 100 Feet Rd, Indiranagar",
      };
      expect(classifyVenueCategory(clinicNearStarbucks)).not.toBe("DINING");
    });
  });

  describe("2. Sports Venue Relevance Filtering", () => {
    it("Identifies playable sports venues accurately based on sports types", () => {
      expect(isPlayableSportsVenue({
        title: "Decathlon Sports Arena",
        types: ["sports_complex"],
      })).toBe(true);

      expect(isPlayableSportsVenue({
        title: "Koramangala Badminton Academy",
        types: ["sports_club"],
      })).toBe(true);

      expect(isPlayableSportsVenue({
        title: "Urban Turf Football Ground",
        types: ["stadium"],
      })).toBe(true);
    });

    it("Rejects non-sports venues from sports feeds", () => {
      expect(isPlayableSportsVenue({
        title: "McDonald's",
        types: ["restaurant", "fast_food_restaurant"],
      })).toBe(false);

      expect(isPlayableSportsVenue({
        title: "Zara Clothing Store",
        types: ["clothing_store", "store"],
      })).toBe(false);

      expect(isPlayableSportsVenue({
        title: "State Bank of India",
        types: ["bank", "finance"],
      })).toBe(false);
    });
  });

  describe("3. Place ID Cleaning & Extraction", () => {
    it("Extracts clean Google place_id without place_ prefix or subcategory suffixes", () => {
      expect(extractCleanPlaceId("place_ChIJ_ABC123")).toBe("ChIJ_ABC123");
      expect(extractCleanPlaceId("ChIJ_ABC123")).toBe("ChIJ_ABC123");
      expect(extractCleanPlaceId("place_ChIJ_ABC123:::Football")).toBe("ChIJ_ABC123");
      expect(extractCleanPlaceId("")).toBe("");
    });
  });
});
