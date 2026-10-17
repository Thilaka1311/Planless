import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  normalizeSearchText,
  isExactTitleMatch,
  analyzeTextMatchTier,
  TextMatchTier,
  isSynonymMatch,
  levenshteinDistance,
} from "../utils/stringMatching";
import { intentAwareRankingEngine } from "../engine/rankingEngine";
import { planlessRelevanceEngine } from "../engine/relevanceEngine";
import { understandQuery } from "../engine/queryUnderstanding";
import { isDisplayableCard } from "../../screens/MasterSearchScreen";
import { DiscoverySection } from "../../components/DiscoverySection";
import { DiscoveryItem } from "../../../../core/types/discovery";
import { SearchResultItem } from "../types/result";
import { markPhotoUrlBroken, resetBrokenPhotoRegistry } from "../../services/venueRelevance";

describe("Planless Search Engine — Comprehensive Verification Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBrokenPhotoRegistry();
  });

  describe("1. Query Normalization & Whitespace/Case Handling", () => {
    it("handles leading, trailing, and repeated whitespace identically", () => {
      const q1 = normalizeSearchText("absolute");
      const q2 = normalizeSearchText("  absolute  ");
      const q3 = normalizeSearchText("absolute   barbecues");

      expect(q1).toBe("absolute");
      expect(q2).toBe("absolute");
      expect(q3).toBe("absolute barbecues");
    });

    it("matches case-insensitively across mixed uppercase/lowercase", () => {
      const target = "Absolute Barbecues";
      expect(isExactTitleMatch(target, "ABSOLUTE BARBECUES")).toBe(true);
      expect(isExactTitleMatch(target, "absolute barbecues")).toBe(true);
      expect(isExactTitleMatch(target, "AbSoLuTe BaRbEcUeS")).toBe(true);
    });

    it("handles punctuation and hyphen variations gracefully", () => {
      expect(isExactTitleMatch("Spider-Man: No Way Home", "spiderman no way home")).toBe(true);
      expect(isExactTitleMatch("Mission: Impossible", "mission impossible")).toBe(true);
    });
  });

  describe("2. Dining Search Algorithm: 'absolute' & 'Absolute Barbecues'", () => {
    const candidateVenues: SearchResultItem[] = [
      {
        id: "venue_secondary",
        place_id: "venue_secondary",
        title: "The Grand Buffet & Barbecue",
        category: "DINING",
        subcategory: "Buffet Restaurant",
        types: ["restaurant", "barbecue_restaurant"],
        cover_image_url: "https://lh3.googleusercontent.com/places/grand_buffet.jpg",
        description: "Known for absolute perfection in grill dining",
        rating: 4.5,
        user_ratings_total: 500,
      } as any,
      {
        id: "venue_exact",
        place_id: "venue_exact",
        title: "Absolute Barbecues",
        category: "DINING",
        subcategory: "Barbecue Restaurant",
        types: ["restaurant", "barbecue_restaurant"],
        cover_image_url: "https://lh3.googleusercontent.com/places/ab_bbq.jpg",
        description: "Casual dining barbecue feast",
        rating: 4.4,
        user_ratings_total: 2000,
      } as any,
      {
        id: "venue_other",
        place_id: "venue_other",
        title: "Barbeque Nation",
        category: "DINING",
        subcategory: "Barbecue Restaurant",
        types: ["restaurant", "barbecue_restaurant"],
        cover_image_url: "https://lh3.googleusercontent.com/places/bbq_nation.jpg",
        description: "Live grills on table",
        rating: 4.3,
        user_ratings_total: 3000,
      } as any,
    ];

    it("ranks 'Absolute Barbecues' FIRST when searching for 'absolute'", () => {
      const parsed = understandQuery("absolute", "DINING");
      const filtered = planlessRelevanceEngine.filterBatch(candidateVenues, parsed);
      const ranked = intentAwareRankingEngine.rank(filtered, parsed);

      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].title).toBe("Absolute Barbecues");
      expect(ranked[0]._textMatchTier).toBe(TextMatchTier.PHRASE_AT_START);
    });

    it("ranks 'Absolute Barbecues' as Tier 1 exact match for 'Absolute Barbecues'", () => {
      const parsed = understandQuery("Absolute Barbecues", "DINING");
      const filtered = planlessRelevanceEngine.filterBatch(candidateVenues, parsed);
      const ranked = intentAwareRankingEngine.rank(filtered, parsed);

      expect(ranked[0].title).toBe("Absolute Barbecues");
      expect(ranked[0]._textMatchTier).toBe(TextMatchTier.EXACT_NAME);
    });

    it("handles minor spelling mistakes e.g. 'absolut' or 'absolutee'", () => {
      const analysis1 = analyzeTextMatchTier("absolut", { title: "Absolute Barbecues" });
      expect(analysis1.tier).toBeLessThanOrEqual(TextMatchTier.PREFIX_PARTIAL_IN_NAME);
      expect(analysis1.tier).toBeGreaterThan(0);

      const analysis2 = analyzeTextMatchTier("absolutee", { title: "Absolute Barbecues" });
      expect(analysis2.tier).toBeLessThanOrEqual(TextMatchTier.PREFIX_PARTIAL_IN_NAME);
      expect(analysis2.tier).toBeGreaterThan(0);
    });

    it("matches dining synonyms and alternate spellings: 'bbq' and 'barbeque'", () => {
      expect(isSynonymMatch("barbecues", "barbeque")).toBe(true);
      expect(isSynonymMatch("bbq", "barbecue")).toBe(true);

      const analysis = analyzeTextMatchTier("barbeque", { title: "Absolute Barbecues" });
      expect(analysis.tier).toBeLessThanOrEqual(TextMatchTier.PREFIX_PARTIAL_IN_NAME);
    });
  });

  describe("3. Activities Search Algorithm: Intent, Keywords & Synonyms", () => {
    it("recognizes activity intent and matches synonyms", () => {
      expect(isSynonymMatch("karting", "go-karting")).toBe(true);
      expect(isSynonymMatch("kart", "go-karting")).toBe(true);
      expect(isSynonymMatch("pool", "billiards")).toBe(true);
      expect(isSynonymMatch("bowling", "tenpin")).toBe(true);
      expect(isSynonymMatch("futsal", "football")).toBe(true);
    });

    it("matches venue when query uses activity synonym e.g. 'go-karting' -> 'Torq03 Karting'", () => {
      const analysis = analyzeTextMatchTier("go-karting", {
        title: "Torq03 Karting",
        subcategory: "Go-Karting Track",
      });
      expect(analysis.tier).toBeLessThanOrEqual(TextMatchTier.PREFIX_PARTIAL_IN_NAME);
    });
  });

  describe("4. Movie Search Algorithm: Exact Titles vs Metadata", () => {
    const movieCandidates: SearchResultItem[] = [
      {
        id: "movie_exact",
        place_id: "movie_exact",
        title: "Inception",
        category: "MOVIES",
        provider: "tmdb",
        cover_image_url: "/inception.jpg",
        release_date: "2010-07-16",
        rating: 8.8,
      } as any,
      {
        id: "movie_meta",
        place_id: "movie_meta",
        title: "The Art of Thought",
        category: "MOVIES",
        provider: "tmdb",
        cover_image_url: "/art_of_thought.jpg",
        description: "A psychological journey from the inception of human ideas",
        release_date: "2024-01-01",
        rating: 9.0,
      } as any,
    ];

    it("prioritizes exact movie title match above description metadata match", () => {
      const parsed = understandQuery("Inception", "MOVIES");
      const ranked = intentAwareRankingEngine.rank(movieCandidates, parsed);

      expect(ranked[0].title).toBe("Inception");
      expect(ranked[0]._textMatchTier).toBe(TextMatchTier.EXACT_NAME);
    });
  });

  describe("5. Master Search Aggregation & Ranking", () => {
    const multiCategoryCandidates: SearchResultItem[] = [
      {
        id: "cat_movie",
        place_id: "cat_movie",
        title: "Dune",
        category: "MOVIES",
        provider: "tmdb",
        cover_image_url: "/dune.jpg",
        release_date: "2021-10-22",
      } as any,
      {
        id: "cat_dining",
        place_id: "cat_dining",
        title: "Dune Desert Cafe",
        category: "DINING",
        cover_image_url: "https://lh3.googleusercontent.com/dune_cafe.jpg",
        rating: 4.6,
      } as any,
      {
        id: "cat_activity",
        place_id: "cat_activity",
        title: "Dune Buggy Adventure Arena",
        category: "ACTIVITIES",
        cover_image_url: "https://lh3.googleusercontent.com/dune_buggy.jpg",
        rating: 4.7,
      } as any,
      {
        id: "cat_meta_only",
        place_id: "cat_meta_only",
        title: "Golden Sands Club",
        category: "ACTIVITIES",
        description: "Ride over massive desert dune landscapes",
        cover_image_url: "https://lh3.googleusercontent.com/golden_sands.jpg",
        rating: 4.9,
      } as any,
    ];

    it("ranks exact title match 'Dune' ahead of prefix and metadata matches across all categories", () => {
      const parsed = understandQuery("Dune", "ALL");
      const ranked = intentAwareRankingEngine.rank(multiCategoryCandidates, parsed);

      expect(ranked[0].title).toBe("Dune");
      expect(ranked[0]._textMatchTier).toBe(TextMatchTier.EXACT_NAME);
      // Weaker metadata match must rank last
      expect(ranked[ranked.length - 1].title).toBe("Golden Sands Club");
    });
  });

  describe("6. Result Count & Rendered Card Synchronization (The 'absolute' Bug Invariant)", () => {
    it("isDisplayableCard rejects items missing cover images or with broken images", () => {
      const validItem: DiscoveryItem = {
        id: "valid_1",
        place_id: "valid_1",
        title: "Valid Restaurant",
        category: "DINING",
        cover_image_url: "https://lh3.googleusercontent.com/photo.jpg",
      } as any;

      const noImageItem: DiscoveryItem = {
        id: "invalid_1",
        place_id: "invalid_1",
        title: "Invalid Restaurant",
        category: "DINING",
        cover_image_url: null,
      } as any;

      const brokenItem: DiscoveryItem = {
        id: "broken_1",
        place_id: "broken_1",
        title: "Broken Restaurant",
        category: "DINING",
        cover_image_url: "https://example.com/broken.jpg",
      } as any;
      markPhotoUrlBroken("https://example.com/broken.jpg");

      expect(isDisplayableCard(validItem)).toBe(true);
      expect(isDisplayableCard(noImageItem)).toBe(false);
      expect(isDisplayableCard(brokenItem)).toBe(false);
    });

    it("DiscoverySection renders null when all items in list have broken/missing photos (never displays an empty header with nonzero count)", () => {
      const brokenVenues: DiscoveryItem[] = [
        {
          id: "bv_1",
          place_id: "bv_1",
          title: "Broken One",
          category: "DINING",
          cover_image_url: null,
        } as any,
        {
          id: "bv_2",
          place_id: "bv_2",
          title: "Broken Two",
          category: "DINING",
          cover_image_url: "https://example.com/broken2.jpg",
        } as any,
      ];
      markPhotoUrlBroken("https://example.com/broken2.jpg");

      const html = renderToString(
        <DiscoverySection
          id="test-dining"
          title="DINING"
          subtitle="2 restaurants"
          items={brokenVenues}
          onSelectItem={vi.fn()}
        />
      );

      // Section must render NOTHING rather than an empty void below a "2 restaurants" header
      expect(html).toBe("");
    });

    it("DiscoverySection subtitle accurately displays the count of renderable cards", () => {
      const mixedVenues: DiscoveryItem[] = [
        {
          id: "v_1",
          place_id: "v_1",
          title: "Absolute Barbecues",
          category: "DINING",
          cover_image_url: "https://lh3.googleusercontent.com/ab.jpg",
        } as any,
        {
          id: "v_2",
          place_id: "v_2",
          title: "No Image Dining",
          category: "DINING",
          cover_image_url: null,
        } as any,
      ];

      const html = renderToString(
        <DiscoverySection
          id="test-dining"
          title="DINING"
          subtitle="2 restaurants"
          items={mixedVenues}
          onSelectItem={vi.fn()}
        />
      );

      // Subtitle is adjusted from 2 to 1 matching the single renderable card
      expect(html).toContain("1 restaurant");
      expect(html).toContain("Absolute Barbecues");
    });
  });
});
