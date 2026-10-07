import { describe, it, expect } from "vitest";
import {
  isAuthenticDiningVenue,
  DINING_CONFIGS,
  GOOGLE_TABLE_A_DINING_TYPES,
  extractDiningSubcategory,
} from "../services/venueRelevance";

describe("Google Places Dining Relevance & Classification Suite", () => {
  describe("1. Authentic Dining Classification (Google Places Table A)", () => {
    it("qualifies standard full-service and casual restaurants", () => {
      expect(
        isAuthenticDiningVenue({
          name: "Vidyarthi Bhavan",
          types: ["restaurant", "food", "point_of_interest", "establishment"],
        })
      ).toBe(true);

      expect(
        isAuthenticDiningVenue({
          name: "The Black Pearl",
          types: ["fine_dining_restaurant", "restaurant", "point_of_interest"],
        })
      ).toBe(true);
    });

    it("qualifies cafes, coffee shops, and tea houses without requiring the generic 'restaurant' type", () => {
      expect(
        isAuthenticDiningVenue({
          name: "Third Wave Coffee",
          types: ["coffee_shop", "cafe", "point_of_interest", "establishment"],
        })
      ).toBe(true);

      expect(
        isAuthenticDiningVenue({
          name: "Infinitea Tea Room",
          types: ["tea_house", "point_of_interest"],
        })
      ).toBe(true);
    });

    it("qualifies breweries, pubs, and gastropubs", () => {
      expect(
        isAuthenticDiningVenue({
          name: "Toit",
          types: ["brewpub", "bar", "pub", "point_of_interest"],
        })
      ).toBe(true);

      expect(
        isAuthenticDiningVenue({
          name: "Windmills Craftworks",
          types: ["brewpub", "restaurant", "point_of_interest"],
        })
      ).toBe(true);
    });

    it("qualifies bakeries, patisseries, and ice cream parlours", () => {
      expect(
        isAuthenticDiningVenue({
          name: "Corner House Ice Cream",
          types: ["ice_cream_shop", "dessert_shop", "point_of_interest"],
        })
      ).toBe(true);

      expect(
        isAuthenticDiningVenue({
          name: "Glen's Bakehouse",
          types: ["bakery", "point_of_interest"],
        })
      ).toBe(true);
    });

    it("qualifies quick bites and casual eateries (pizzerias, burger joints, fast food)", () => {
      expect(
        isAuthenticDiningVenue({
          name: "Brik Oven",
          types: ["pizza_restaurant", "restaurant", "point_of_interest"],
        })
      ).toBe(true);

      expect(
        isAuthenticDiningVenue({
          name: "Leon's Burgers & Wings",
          types: ["fast_food_restaurant", "hamburger_restaurant"],
        })
      ).toBe(true);
    });
  });

  describe("2. Strict Negative Filtering (Exclusions)", () => {
    it("excludes retail liquor shops, wine stores, and MRP outlets with no dining/drinking on site", () => {
      expect(
        isAuthenticDiningVenue({
          name: "Madhu Wines MRP Outlet",
          types: ["liquor_store", "store", "point_of_interest"],
        })
      ).toBe(false);

      expect(
        isAuthenticDiningVenue({
          name: "SLV Liquor Shop",
          types: ["liquor_store", "establishment"],
        })
      ).toBe(false);

      expect(
        isAuthenticDiningVenue({
          name: "Drops Total Spirits Wine Store",
          types: ["store", "point_of_interest"],
        })
      ).toBe(false);
    });

    it("excludes delivery-only / dark / ghost kitchens that have no dine-in seating", () => {
      expect(
        isAuthenticDiningVenue({
          name: "FreshMenu Cloud Kitchen Hub",
          types: ["meal_delivery", "establishment"],
        })
      ).toBe(false);

      expect(
        isAuthenticDiningVenue({
          name: "Faasos Dark Kitchen",
          types: ["meal_delivery", "point_of_interest"],
        })
      ).toBe(false);
    });

    it("excludes commercial caterers and food wholesalers", () => {
      expect(
        isAuthenticDiningVenue({
          name: "Shree Krishna Catering Services",
          types: ["caterer", "point_of_interest"],
        })
      ).toBe(false);

      expect(
        isAuthenticDiningVenue({
          name: "Metro Cash & Carry Wholesale Grocer",
          types: ["wholesale_grocer", "store"],
        })
      ).toBe(false);
    });

    it("excludes supermarkets and grocery stores", () => {
      expect(
        isAuthenticDiningVenue({
          name: "Nature's Basket",
          types: ["supermarket", "grocery_or_supermarket", "store"],
        })
      ).toBe(false);

      expect(
        isAuthenticDiningVenue({
          name: "MK Retail Supermarket",
          types: ["supermarket", "store"],
        })
      ).toBe(false);
    });

    it("excludes banquet halls and wedding function venues", () => {
      expect(
        isAuthenticDiningVenue({
          name: "Sri Raja Kalyana Mantapa Banquet Hall",
          types: ["banquet_hall", "wedding_venue", "point_of_interest"],
        })
      ).toBe(false);
    });

    it("excludes sports facilities, courts, and turfs from qualifying as Dining", () => {
      expect(
        isAuthenticDiningVenue({
          name: "Bengaluru Turf Inc",
          types: ["sports_complex", "stadium", "point_of_interest"],
        })
      ).toBe(false);

      expect(
        isAuthenticDiningVenue({
          name: "Rush Koland Arena",
          types: ["sports_activity_location", "establishment"],
        })
      ).toBe(false);
    });
  });

  describe("3. Dining Subcategory Extraction", () => {
    it("extracts clean, user-friendly subcategories", () => {
      expect(
        extractDiningSubcategory({
          name: "Geist Brewing Factory",
          types: ["brewpub", "bar"],
        })
      ).toBe("Microbrewery");

      expect(
        extractDiningSubcategory({
          name: "Blue Tokai Coffee Roasters",
          types: ["coffee_shop", "cafe"],
        })
      ).toBe("Cafe");

      expect(
        extractDiningSubcategory({
          name: "Milano Ice Cream",
          types: ["ice_cream_shop", "dessert_shop"],
        })
      ).toBe("Ice Cream & Desserts");

      expect(
        extractDiningSubcategory({
          name: "Toscano",
          types: ["italian_restaurant", "restaurant"],
        })
      ).toBe("Italian");

      expect(
        extractDiningSubcategory({
          name: "Nagarjuna Restaurant",
          types: ["indian_restaurant", "restaurant"],
        })
      ).toBe("Indian Restaurant");
    });
  });

  describe("4. DINING_CONFIGS Google Alignment", () => {
    it("configures valid Google Table A includedType for every dining category", () => {
      const validTableASet = new Set(GOOGLE_TABLE_A_DINING_TYPES);

      for (const [key, cfg] of Object.entries(DINING_CONFIGS)) {
        if (key === "all" || key === "other") continue;
        expect(validTableASet.has(cfg.googleIncludedType as any)).toBe(true);
        expect(cfg.searchQueries.length).toBeGreaterThan(0);
      }
    });

    it("includes regional Indian restaurant types in GOOGLE_TABLE_A_DINING_TYPES", () => {
      expect(GOOGLE_TABLE_A_DINING_TYPES).toContain("south_indian_restaurant");
      expect(GOOGLE_TABLE_A_DINING_TYPES).toContain("north_indian_restaurant");
      expect(GOOGLE_TABLE_A_DINING_TYPES).toContain("biryani_restaurant");
      expect(GOOGLE_TABLE_A_DINING_TYPES).toContain("dhaba");
      expect(GOOGLE_TABLE_A_DINING_TYPES).toContain("sweet_shop");
    });

    it("qualifies regional Indian restaurants via primaryType or types", () => {
      expect(
        isAuthenticDiningVenue({
          name: "Sai Sogadu Yelahanka",
          types: ["south_indian_restaurant", "vegetarian_restaurant", "restaurant"],
        })
      ).toBe(true);

      expect(
        isAuthenticDiningVenue({
          name: "Karigari Restaurant",
          types: ["north_indian_restaurant", "restaurant"],
        })
      ).toBe(true);

      expect(
        isAuthenticDiningVenue({
          name: "Shetty Biriyani Center",
          types: ["biryani_restaurant", "restaurant"],
        })
      ).toBe(true);
    });
  });
});
