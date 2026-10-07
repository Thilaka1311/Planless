import { describe, it, expect } from "vitest";
import { resolveVenueCategories } from "../components/DiscoveryCard";
import {
  parseSportsFromSubcategory,
  applyPlaceOverridesSync,
  mergeSportsPlacesWithOverrides,
  PlaceOverride,
} from "../services/placeOverridesService";
import { DiscoveryItem } from "../../../core/types/discovery";

describe("Sports Venue Supported Sports & Database Overrides Suite", () => {
  const baseSportsVenue: DiscoveryItem = {
    id: "place_ovalnet_123",
    public_id: "place_ovalnet_123",
    section_id: "places_sports",
    place_id: "ChIJb7M8Q4sjrjsR1KMR6wzkSGA",
    title: "Ovalnet Arena",
    category: "SPORTS",
    subcategory: "Athletic Field | Sports Club",
    place_address: "26, Subhash Chandra Bose Rd, MS Palya, Bengaluru",
    location: "MS Palya, Bengaluru",
    description: "26, Subhash Chandra Bose Rd, MS Palya, Bengaluru",
    latitude: 13.0949,
    longitude: 77.5441,
    rating: 4.5,
    distance: "0.7 km",
    cover_image_url: "https://example.com/ovalnet.jpg",
    suggested_duration_minutes: 90,
    suggested_cost_amount: null,
    suggested_capacity: null,
    default_rsvp_offset_minutes: 60,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  describe("1. Suppression of Generic Google Facility Types", () => {
    it("never displays raw Google types like 'Athletic Field · Sports Club' in category label", () => {
      const genericVenue: DiscoveryItem = {
        ...baseSportsVenue,
        subcategory: "Athletic Field | Sports Club",
      };

      const resolved = resolveVenueCategories(genericVenue);
      expect(resolved).not.toContain("Athletic Field");
      expect(resolved).not.toContain("Sports Club");
      // Falls back to clean label instead of raw provider types
      expect(["Sports Facility", "Venue", "Sports Complex"]).toContain(resolved);
    });

    it("suppresses generic types even when present in different orders or combinations", () => {
      const comboVenue: DiscoveryItem = {
        ...baseSportsVenue,
        subcategory: "Sports Complex | Sports Activity Location",
      };
      const resolved = resolveVenueCategories(comboVenue);
      expect(resolved).not.toContain("Sports Activity Location");
      expect(resolved).not.toContain("Sports Complex | Sports Activity Location");
    });
  });

  describe("2. Google-Detected Sports Resolution", () => {
    it("resolves single sport correctly when supported_sports is stamped (e.g. Badminton)", () => {
      const badmintonVenue: DiscoveryItem = {
        ...baseSportsVenue,
        subcategory: "Badminton",
        supported_sports: ["badminton"],
      } as any;

      const label = resolveVenueCategories(badmintonVenue);
      expect(label).toBe("Badminton");
    });

    it("resolves multi-sport venue with 2 sports using middle dot separator", () => {
      const multiSportVenue: DiscoveryItem = {
        ...baseSportsVenue,
        title: "Rush Arena",
        subcategory: "Football | Pickleball",
        supported_sports: ["football", "pickleball"],
      } as any;

      const label = resolveVenueCategories(multiSportVenue);
      expect(label).toBe("Football · Pickleball");
    });

    it("resolves multi-sport venue with 3+ sports showing first 2 and excess count (+N)", () => {
      const multiSportVenue: DiscoveryItem = {
        ...baseSportsVenue,
        title: "Machaxi Active Sports",
        subcategory: "Badminton | Table Tennis | Cricket",
        supported_sports: ["badminton", "table-tennis", "cricket"],
      } as any;

      const label = resolveVenueCategories(multiSportVenue);
      expect(label).toBe("Badminton · Table Tennis +1");
    });
  });

  describe("3. Database Override Precedence & Synchronization", () => {
    it("parses single and multi-sport strings from subcategory accurately", () => {
      expect(parseSportsFromSubcategory("Badminton")).toEqual(["badminton"]);
      expect(parseSportsFromSubcategory("Football | Pickleball")).toEqual(["football", "pickleball"]);
      expect(parseSportsFromSubcategory("Badminton | Table Tennis | Cricket")).toEqual([
        "badminton",
        "table-tennis",
        "cricket",
      ]);
      expect(parseSportsFromSubcategory("")).toEqual([]);
      expect(parseSportsFromSubcategory(null)).toEqual([]);
    });

    it("allows database override to supersede Google-detected sport with 100% priority", () => {
      // Suppose Google originally tagged Ovalnet Arena as Football or generic:
      const googleVenue: DiscoveryItem = {
        ...baseSportsVenue,
        subcategory: "Football",
        supported_sports: ["football"],
      } as any;

      // Admin explicitly saves an override in the database with Badminton:
      const adminOverrideVenue: DiscoveryItem = {
        ...googleVenue,
        subcategory: "Badminton",
        supported_sports: ["badminton"],
        _hasPlanlessOverride: true,
      } as any;

      const label = resolveVenueCategories(adminOverrideVenue);
      expect(label).toBe("Badminton");
      expect(label).not.toBe("Football");
    });

    it("allows database override to define multiple sports (e.g. Football | Pickleball)", () => {
      const adminOverrideVenue: DiscoveryItem = {
        ...baseSportsVenue,
        subcategory: "Football | Pickleball",
        supported_sports: ["football", "pickleball"],
        _hasPlanlessOverride: true,
      } as any;

      const label = resolveVenueCategories(adminOverrideVenue);
      expect(label).toBe("Football · Pickleball");
    });

    it("preserves Google-detected sports when admin override only modifies photo or title", () => {
      const venueWithDetectedSport: DiscoveryItem = {
        ...baseSportsVenue,
        subcategory: "Badminton",
        supported_sports: ["badminton"],
        supportedSports: ["badminton"],
      } as any;

      // Simulate applying an image-only override (no subcategory override provided)
      const overrideWithoutSubcat: PlaceOverride = {
        place_id: "ChIJb7M8Q4sjrjsR1KMR6wzkSGA",
        image_path: "https://example.com/custom_court.jpg",
      };

      const updated = {
        ...venueWithDetectedSport,
        cover_image_url: overrideWithoutSubcat.image_path,
        _hasPlanlessOverride: true,
      };

      // Ensure sport is preserved
      const label = resolveVenueCategories(updated);
      expect(label).toBe("Badminton");
      expect(updated.cover_image_url).toBe("https://example.com/custom_court.jpg");
    });
  });

  describe("4. Non-Sports Categories Remain Untouched", () => {
    it("Dining cards continue to resolve Dining subcategories", () => {
      const diningItem: DiscoveryItem = {
        ...baseSportsVenue,
        id: "dining_1",
        category: "DINING",
        subcategory: "Cafe | Bakery",
      };

      expect(resolveVenueCategories(diningItem)).toBe("Cafe | Bakery");
    });

    it("Activity cards continue to resolve Activity subcategories", () => {
      const activityItem: DiscoveryItem = {
        ...baseSportsVenue,
        id: "act_1",
        category: "ACTIVITIES",
        subcategory: "Go-Karting",
      };

      expect(resolveVenueCategories(activityItem)).toBe("Go-Karting");
    });

    it("Movie cards continue to resolve genres", () => {
      const movieItem: DiscoveryItem = {
        ...baseSportsVenue,
        id: "movie_1",
        category: "MOVIES",
        genres: ["Sci-Fi", "Action"],
      };

      expect(resolveVenueCategories(movieItem)).toBe("Sci-Fi · Action");
    });
  });
});
