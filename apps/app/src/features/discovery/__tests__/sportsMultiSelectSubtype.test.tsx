import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  AVAILABLE_SPORTS,
  normalizeSportToTitleCase,
  resolveDefaultSports,
  AdminPlaceEditSheet,
} from "../components/AdminPlaceEditSheet";
import { parseSportsFromSubcategory } from "../services/placeOverridesService";
import { resolveVenueCategories } from "../components/DiscoveryCard";
import { DiscoveryItem } from "../../../core/types/discovery";

// Mock Supabase client
vi.mock("../../../../lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
  SUPABASE_URL: "https://mock.supabase.co",
}));

describe("Sports Multi-Select Subtype Suite", () => {
  describe("Available Sports & Normalization", () => {
    it("only contains concrete sports and excludes generic categories", () => {
      expect(AVAILABLE_SPORTS).toContain("Football");
      expect(AVAILABLE_SPORTS).toContain("Pickleball");
      expect(AVAILABLE_SPORTS).toContain("Badminton");
      expect(AVAILABLE_SPORTS).toContain("Tennis");
      expect(AVAILABLE_SPORTS).toContain("Cricket");
      expect(AVAILABLE_SPORTS).toContain("Basketball");
      expect(AVAILABLE_SPORTS).toContain("Table Tennis");
      expect(AVAILABLE_SPORTS).toContain("Swimming");
      expect(AVAILABLE_SPORTS).toContain("Squash");
      expect(AVAILABLE_SPORTS).toContain("Volleyball");

      // Verify NO generic options exist
      expect(AVAILABLE_SPORTS).not.toContain("Sports Facility");
      expect(AVAILABLE_SPORTS).not.toContain("Sports Activity Center");
      expect(AVAILABLE_SPORTS).not.toContain("Athletic Field");
      expect(AVAILABLE_SPORTS).not.toContain("Default (SPORTS)");
    });

    it("normalizes various sport aliases to Title Case canonical names", () => {
      expect(normalizeSportToTitleCase("football")).toBe("Football");
      expect(normalizeSportToTitleCase("SOCCER")).toBe("Football");
      expect(normalizeSportToTitleCase("futsal")).toBe("Football");
      expect(normalizeSportToTitleCase("table-tennis")).toBe("Table Tennis");
      expect(normalizeSportToTitleCase("table tennis")).toBe("Table Tennis");
      expect(normalizeSportToTitleCase("badminton")).toBe("Badminton");
      expect(normalizeSportToTitleCase("pickleball")).toBe("Pickleball");
      expect(normalizeSportToTitleCase("Sports Facility")).toBeNull();
      expect(normalizeSportToTitleCase("athletic_field")).toBeNull();
    });
  });

  describe("resolveDefaultSports derivation", () => {
    it("derives from existing JSON array subcategory override", () => {
      const item = {
        id: "turf-1",
        title: "Bengaluru Turf Inc.",
        category: "SPORTS",
        subcategory: '["Football", "Pickleball"]',
        cover_image_url: "https://example.com/pic.jpg",
      };
      const defaults = resolveDefaultSports(item as any);
      expect(defaults).toEqual(["Football", "Pickleball"]);
    });

    it("derives from existing legacy pipe-delimited subcategory", () => {
      const item = {
        id: "turf-2",
        title: "Smash Arena",
        category: "SPORTS",
        subcategory: "Badminton | Table Tennis",
        cover_image_url: "https://example.com/pic.jpg",
      };
      const defaults = resolveDefaultSports(item as any);
      expect(defaults).toEqual(["Badminton", "Table Tennis"]);
    });

    it("derives from stamped discovery supported_sports array", () => {
      const item = {
        id: "turf-3",
        title: "Play Arena",
        category: "SPORTS",
        supported_sports: ["football", "pickleball", "cricket"],
        cover_image_url: "https://example.com/pic.jpg",
      } as any;
      const defaults = resolveDefaultSports(item);
      expect(defaults).toEqual(["Football", "Pickleball", "Cricket"]);
    });

    it("identifies sports via existing discovery classification logic from venue name keywords", () => {
      const item = {
        id: "turf-4",
        title: "Eagles Badminton & Tennis Club",
        category: "SPORTS",
        types: ["sports_complex"],
        cover_image_url: "https://example.com/pic.jpg",
      };
      const defaults = resolveDefaultSports(item as any);
      expect(defaults).toContain("Badminton");
      expect(defaults).toContain("Tennis");
    });

    it("returns empty array (null representation) when no concrete sport can be determined", () => {
      const item = {
        id: "turf-5",
        title: "General Municipal Sports Ground",
        category: "SPORTS",
        types: ["sports_complex"],
        cover_image_url: "https://example.com/pic.jpg",
      };
      const defaults = resolveDefaultSports(item as any);
      expect(defaults).toEqual([]);
    });
  });

  describe("parseSportsFromSubcategory support for JSON arrays", () => {
    it("parses JSON array strings correctly", () => {
      expect(parseSportsFromSubcategory('["Football", "Pickleball"]')).toEqual([
        "football",
        "pickleball",
      ]);
      expect(parseSportsFromSubcategory('["Badminton", "Table Tennis"]')).toEqual([
        "badminton",
        "table-tennis",
      ]);
    });

    it("preserves backward compatibility with pipe-delimited and single strings", () => {
      expect(parseSportsFromSubcategory("Football | Pickleball")).toEqual([
        "football",
        "pickleball",
      ]);
      expect(parseSportsFromSubcategory("Badminton")).toEqual(["badminton"]);
      expect(parseSportsFromSubcategory(null)).toEqual([]);
      expect(parseSportsFromSubcategory("")).toEqual([]);
    });
  });

  describe("DiscoveryCard category rendering with JSON array subcategories", () => {
    it("renders JSON array subcategory as formatted card sports label", () => {
      const item = {
        id: "turf-multi",
        title: "Bengaluru Turf Inc.",
        category: "SPORTS",
        subcategory: '["Football", "Pickleball"]',
        cover_image_url: "https://example.com/pic.jpg",
      };
      const label = resolveVenueCategories(item as any);
      expect(label).toBe("Football · Pickleball");
    });

    it("compacts 3+ sports with +N notation", () => {
      const item = {
        id: "turf-triple",
        title: "Bengaluru Sports Hub",
        category: "SPORTS",
        subcategory: '["Football", "Pickleball", "Badminton"]',
        cover_image_url: "https://example.com/pic.jpg",
      };
      const label = resolveVenueCategories(item as any);
      expect(label).toBe("Football · Pickleball +1");
    });
  });

  describe("AdminPlaceEditSheet UI rendering", () => {
    it("renders multi-select chips with pre-selected defaults for sports venue", () => {
      const item = {
        id: "turf-edit",
        place_id: "place_123",
        title: "Bengaluru Turf Inc.",
        category: "SPORTS",
        subcategory: '["Football", "Pickleball"]',
        cover_image_url: "https://example.com/pic.jpg",
      };

      const html = renderToString(
        <AdminPlaceEditSheet item={item as any} onClose={() => {}} />
      );

      // Verify category subtype title & counter
      expect(html).toContain("Category Subtype (Sports)");
      expect(html).toContain("2 selected");

      // Verify chip options are rendered
      expect(html).toContain("Football");
      expect(html).toContain("Pickleball");
      expect(html).toContain("Badminton");
      expect(html).toContain("Clear all (set to null)");

      // Verify NO generic options rendered
      expect(html).not.toContain("Default (SPORTS)");
      expect(html).not.toContain("Sports Facility");
    });

    it("renders dropdown for non-sports categories (e.g. Dining)", () => {
      const item = {
        id: "cafe-edit",
        place_id: "place_456",
        title: "Third Wave Coffee",
        category: "DINING",
        subcategory: "CAFE",
        cover_image_url: "https://example.com/pic.jpg",
      };

      const html = renderToString(
        <AdminPlaceEditSheet item={item as any} onClose={() => {}} />
      );

      // Verify standard dropdown for dining
      expect(html).toContain("Default (<!-- -->DINING<!-- -->)");
      expect(html).toContain("<select");
      expect(html).toContain("Cafe");
      expect(html).not.toContain("Category Subtype (Sports)");
    });
  });
});
