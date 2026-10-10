import { describe, it, expect } from "vitest";
import {
  getPlanAreaName,
  extractLocalityFromAddress,
  resolveVenueLocality,
} from "../services/addressUtils";
import { DiscoveryItem } from "../../../core/types/discovery";

describe("getPlanAreaName — Canonical Create + Plan Area Name Extraction", () => {
  describe("1. Canonical Examples from Specification", () => {
    it("extracts 'Vidyaranyapura' from '3GQW+G4W, Subbana Layout, Vinayak Nagar, Vidyaranyapura, Bengaluru'", () => {
      const result = getPlanAreaName(
        "3GQW+G4W, Subbana Layout, Vinayak Nagar, Vidyaranyapura, Bengaluru"
      );
      expect(result).toBe("Vidyaranyapura");
    });

    it("extracts 'Yelahanka' from 'Bellary Road, Byatarayanapura Village, Hobli, Yelahanka, Bengaluru'", () => {
      const result = getPlanAreaName(
        "Bellary Road, Byatarayanapura Village, Hobli, Yelahanka, Bengaluru"
      );
      expect(result).toBe("Yelahanka");
    });

    it("extracts 'Vidyaranyapura' from '..., Vidyaranyapura, Bengaluru'", () => {
      const result = getPlanAreaName(
        "Shop 4, Main Road, Vidyaranyapura, Bengaluru"
      );
      expect(result).toBe("Vidyaranyapura");
    });

    it("extracts 'Yelahanka' from '..., Yelahanka, Bengaluru'", () => {
      const result = getPlanAreaName(
        "Survey 45, BBMP Ward 1, Yelahanka, Bengaluru"
      );
      expect(result).toBe("Yelahanka");
    });

    it("extracts 'HSR Layout' from '..., HSR Layout, Bengaluru'", () => {
      const result = getPlanAreaName(
        "123, 27th Main Rd, Sector 1, HSR Layout, Bengaluru"
      );
      expect(result).toBe("HSR Layout");
    });
  });

  describe("2. Robust Address Formatting Variations", () => {
    it("handles trailing state, postal code, and country after Bengaluru", () => {
      const result = getPlanAreaName(
        "123, 27th Main Rd, Sector 1, HSR Layout, Bengaluru, Karnataka 560102, India"
      );
      expect(result).toBe("HSR Layout");
    });

    it("handles postal code directly following city 'Bangalore - 560102'", () => {
      const result = getPlanAreaName(
        "100 Feet Rd, Indiranagar, Bangalore - 560102"
      );
      expect(result).toBe("Indiranagar");
    });

    it("handles Bangalore spelling with multiple sub-localities", () => {
      const result = getPlanAreaName(
        "100 Feet Rd, HAL 2nd Stage, Indiranagar, Bangalore"
      );
      expect(result).toBe("Indiranagar");
    });

    it("skips standalone 'Hobli' marker when right before city and picks preceding village/locality", () => {
      const result = getPlanAreaName(
        "Bellary Road, Byatarayanapura Village, Hobli, Bengaluru"
      );
      expect(result).toBe("Byatarayanapura Village");
    });

    it("cleans plus codes embedded in the candidate segment", () => {
      const result = getPlanAreaName(
        "3GQW+G4W Vidyaranyapura, Bengaluru"
      );
      expect(result).toBe("Vidyaranyapura");
    });

    it("handles simple two-part 'Locality, City' address", () => {
      expect(getPlanAreaName("Koramangala, Bengaluru")).toBe("Koramangala");
      expect(getPlanAreaName("Whitefield, Bangalore")).toBe("Whitefield");
    });

    it("handles single-part address without city", () => {
      expect(getPlanAreaName("Vidyaranyapura")).toBe("Vidyaranyapura");
      expect(getPlanAreaName("HSR Layout")).toBe("HSR Layout");
    });

    it("gracefully returns null for empty or non-location sentinels", () => {
      expect(getPlanAreaName("")).toBeNull();
      expect(getPlanAreaName(null)).toBeNull();
      expect(getPlanAreaName(undefined)).toBeNull();
      expect(getPlanAreaName("Nearby")).toBeNull();
      expect(getPlanAreaName("Location removed")).toBeNull();
      expect(getPlanAreaName("In Theatres")).toBeNull();
    });
  });

  describe("3. Discovery UI Isolation (Discovery Screens Unchanged)", () => {
    it("extractLocalityFromAddress preserves existing behavior for Discovery cards", () => {
      const discoveryItem: DiscoveryItem = {
        id: "sports-1",
        public_id: "sports-pub-1",
        section_id: "sports",
        title: "Bengaluru Turf Inc.",
        category: "SPORTS",
        subcategory: "turf",
        description: "Sports turf",
        cover_image_url: null,
        location: "123, 27th Main Rd, Sector 1, HSR Layout, Bengaluru, Karnataka 560102, India",
        place_address: "123, 27th Main Rd, Sector 1, HSR Layout, Bengaluru, Karnataka 560102, India",
        suggested_duration_minutes: 60,
        suggested_cost_amount: 1000,
        suggested_capacity: 10,
        default_rsvp_offset_minutes: 60,
        display_order: 1,
        featured: false,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Discovery locality resolution still functions identically
      const locality = resolveVenueLocality(discoveryItem);
      expect(locality).toBe("HSR Layout");

      // Direct extractLocalityFromAddress still works for Discovery
      expect(
        extractLocalityFromAddress(
          "123, 27th Main Rd, Sector 1, HSR Layout, Bengaluru, Karnataka 560102, India",
          "Bengaluru Turf Inc."
        )
      ).toBe("HSR Layout");
    });
  });
});
