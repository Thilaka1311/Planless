import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isPlayableSportsVenue,
  isAuthenticDiningVenue,
  isAuthenticActivityVenue,
  isRelevantVenueForCategory,
} from "../services/venueRelevance";
import { searchDiscoveryPlaces } from "../services/discoveryService";
import { supabase } from "../../../../lib/supabaseClient";

describe("Strict Venue Relevance Layer Unit & Integration Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("SPORTS / PLACES TO PLAY Relevance", () => {
    it("accepts genuine playable sports venues (turfs, courts, grounds, nets, pools, centres)", () => {
      const validVenues = [
        { title: "Dribble Football Turf", types: ["sports_complex"] },
        { title: "Bangalore 5-a-side Football Ground", subcategory: "football" },
        { title: "Smash Badminton Courts", types: ["sports_club"] },
        { title: "Pickle Pro Pickleball Court", subcategory: "pickleball" },
        { title: "Topspin Tennis Academy & Courts", types: ["athletic_field"] },
        { title: "HoopZone Basketball Court", subcategory: "basketball" },
        { title: "Lords Cricket Ground & Box Nets", subcategory: "cricket" },
        { title: "Spin Table Tennis Facility", subcategory: "table-tennis" },
        { title: "Elite Squash Courts", types: ["sports_complex"] },
        { title: "AquaFit Swimming Pool Centre", types: ["swimming_pool"] },
        { title: "Koramangala Sports Club", types: ["sports_club"] },
        { title: "Active Sports Centre", types: ["sports_complex"] },
      ];

      for (const venue of validVenues) {
        expect(isPlayableSportsVenue(venue)).toBe(true);
        expect(isRelevantVenueForCategory(venue, "SPORTS")).toBe(true);
      }
    });

    it("rejects sporting goods stores, sportswear shops, equipment stores, and offices", () => {
      const invalidPlaces = [
        { title: "Decathlon Sporting Goods Store", types: ["sporting_goods_store", "store"] },
        { title: "Nike Sportswear Store", types: ["clothing_store", "shoe_store"] },
        { title: "Champion Sports Equipment Shop", subcategory: "Sporting goods" },
        { title: "Karnataka State Cricket Association Office", types: ["corporate_office"] },
        { title: "National Sports Federation Board Office", types: ["point_of_interest"] },
        { title: "Apex Sports Management Pvt Ltd", types: ["establishment"] },
        { title: "Sports Nutrition & Supplement Store", types: ["store"] },
        { title: "Sports Physiotherapy & Rehab Clinic", types: ["health"] },
      ];

      for (const place of invalidPlaces) {
        expect(isPlayableSportsVenue(place)).toBe(false);
        expect(isRelevantVenueForCategory(place, "SPORTS")).toBe(false);
      }
    });
  });

  describe("DINING / PLACES TO EAT Relevance", () => {
    it("accepts genuine food and dining venues (restaurants, cafes, fast food, bakeries, pubs)", () => {
      const validDining = [
        { title: "Truffles Burger Bistro", types: ["restaurant", "food"] },
        { title: "Third Wave Coffee Cafe", types: ["cafe", "food"] },
        { title: "Glen's Bakehouse & Bakery", types: ["bakery"] },
        { title: "Brik Oven Pizzeria", types: ["restaurant"] },
        { title: "Corner House Dessert Parlour", subcategory: "dessert" },
        { title: "Forum Mall Food Court", subcategory: "food court" },
        { title: "Toit Brewpub & Taproom", types: ["bar", "restaurant"] },
        { title: "Leon's Fast Food & Wings", subcategory: "fast food" },
        { title: "Meghana Biryani House", types: ["restaurant"] },
      ];

      for (const place of validDining) {
        expect(isAuthenticDiningVenue(place)).toBe(true);
        expect(isRelevantVenueForCategory(place, "DINING")).toBe(true);
      }
    });

    it("rejects supermarkets, grocery stores, food wholesalers, manufacturers, and offices", () => {
      const invalidDining = [
        { title: "Nature's Basket Supermarket", types: ["supermarket", "grocery_or_supermarket"] },
        { title: "Spencers Grocery Mart", types: ["convenience_store", "food"] },
        { title: "Bangalore Food Wholesalers & Distributors", types: ["wholesaler", "food"] },
        { title: "Metro Cash & Carry Hypermarket", types: ["department_store"] },
        { title: "Krishna Kirana & General Store", subcategory: "kirana store" },
        { title: "Royal Caterers Corporate Office", subcategory: "catering office" },
        { title: "Sun Agro Food Processing Pvt Ltd", types: ["establishment"] },
        { title: "Pooja Organic Food & Provisions Store", subcategory: "organic store" },
        { title: "Bark Pet Food Shop", subcategory: "pet food" },
      ];

      for (const place of invalidDining) {
        expect(isAuthenticDiningVenue(place)).toBe(false);
        expect(isRelevantVenueForCategory(place, "DINING")).toBe(false);
      }
    });
  });

  describe("ACTIVITIES / THINGS TO DO Relevance", () => {
    it("accepts real participatory activity venues (bowling, escape rooms, go-karting, arcades, parks)", () => {
      const validActivities = [
        { title: "Amoeba Cosmic Bowling Alley", types: ["bowling_alley"] },
        { title: "Wonderla Amusement & Water Park", types: ["amusement_park"] },
        { title: "Breakout Mystery Escape Rooms", subcategory: "mystery-rooms" },
        { title: "Torq03 Go-Karting Track", subcategory: "go-karting" },
        { title: "Paintball Arena Bangalore", subcategory: "adventure-fun" },
        { title: "Bounce Trampoline Adventure Park", types: ["amusement_center"] },
        { title: "Timezone Arcade Game Zone", subcategory: "arcades" },
        { title: "Laser Tag Zone", subcategory: "adventure-fun" },
      ];

      for (const place of validActivities) {
        expect(isAuthenticActivityVenue(place)).toBe(true);
        expect(isRelevantVenueForCategory(place, "ACTIVITIES")).toBe(true);
      }
    });

    it("rejects offices, retail stores, banks, generic shopping malls without activities", () => {
      const invalidActivities = [
        { title: "Microsoft Corporate Office", types: ["corporate_office"] },
        { title: "Lifestyle Clothing & Retail Store", types: ["clothing_store", "store"] },
        { title: "HDFC Bank & Financial Services", types: ["bank", "finance"] },
        { title: "Regus Coworking Office Space", types: ["point_of_interest"] },
        { title: "Prestige Real Estate Agency Office", types: ["real_estate_agency"] },
        { title: "Dr. Batra's Homeopathy Clinic", types: ["health"] },
      ];

      for (const place of invalidActivities) {
        expect(isAuthenticActivityVenue(place)).toBe(false);
        expect(isRelevantVenueForCategory(place, "ACTIVITIES")).toBe(false);
      }
    });
  });

  describe("Multi-Category Classification", () => {
    it("allows a bowling centre with food to belong to Activities and Dining", () => {
      const bowlingWithFood = {
        title: "Smaaash Bowling & Sports Bar Diner",
        types: ["bowling_alley", "restaurant", "bar"],
      };

      expect(isAuthenticActivityVenue(bowlingWithFood)).toBe(true);
      expect(isAuthenticDiningVenue(bowlingWithFood)).toBe(true);
    });

    it("allows a sports club with courts to belong to Sports", () => {
      const sportsClub = {
        title: "Indiranagar Club Badminton & Tennis Courts",
        types: ["sports_club"],
      };

      expect(isPlayableSportsVenue(sportsClub)).toBe(true);
      expect(isRelevantVenueForCategory(sportsClub, "SPORTS")).toBe(true);
    });
  });

  describe("Endless Search Filtering Integration with Provider Batches", () => {
    it("filters out supermarkets and offices from searchDiscoveryPlaces results", async () => {
      const mockRawPlaces = [
        {
          id: "p1",
          place_id: "p1",
          title: "Truffles Burger Restaurant",
          types: ["restaurant", "food"],
          latitude: 12.9716,
          longitude: 77.5946,
        },
        {
          id: "p2",
          place_id: "p2",
          title: "Nature's Basket Food Supermarket",
          types: ["grocery_or_supermarket", "food"],
          latitude: 12.972,
          longitude: 77.595,
        },
        {
          id: "p3",
          place_id: "p3",
          title: "Spencers Grocery & Provisions",
          types: ["convenience_store", "food"],
          latitude: 12.973,
          longitude: 77.596,
        },
        {
          id: "p4",
          place_id: "p4",
          title: "Toit Microbrewery & Pub",
          types: ["bar", "restaurant"],
          latitude: 12.974,
          longitude: 77.597,
        },
        {
          id: "p5",
          place_id: "p5",
          title: "Food Tech Consulting Office",
          types: ["corporate_office"],
          latitude: 12.975,
          longitude: 77.598,
        },
      ];

      vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockResolvedValue({
        data: {
          items: mockRawPlaces,
          nextPageToken: "next_token_abc",
        },
        error: null,
      });

      const res = await searchDiscoveryPlaces({
        category: "DINING",
        query: "food indiranagar",
        currentCoordinates: { latitude: 12.9716, longitude: 77.5946 },
        defaultCity: "Bengaluru",
      });

      // ONLY Truffles and Toit should pass. Supermarket, Grocery, and Office MUST be filtered out!
      expect(res.items.length).toBe(2);
      expect(res.items.map((i) => i.title)).toEqual([
        "Truffles Burger Restaurant",
        "Toit Microbrewery & Pub",
      ]);
      expect(res.nextPageToken).toBe("next_token_abc");
    });
  });
});
