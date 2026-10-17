import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchCoordinator } from "../session/searchCoordinator";
import { searchProviderRegistry } from "../providers/providerRegistry";
import { ISearchProvider, ProviderCandidateResult, SearchStrategy } from "../types/provider";
import { clearPlaceOverridesCache } from "../../services/placeOverridesService";
import { analyzeTextMatchTier, isExactTitleMatch, normalizeSearchText, TextMatchTier } from "../utils/stringMatching";
import { understandQuery } from "../engine/queryUnderstanding";

// In-memory mock database rows for discovery_place_overrides
let mockDbRows: any[] = [];

vi.mock("../../../../../lib/supabaseClient", () => {
  const createMockBuilder = () => {
    let filtered = [...mockDbRows];
    const builder: any = {
      eq: vi.fn((col: string, val: any) => {
        filtered = filtered.filter((r) => r[col] === val);
        return builder;
      }),
      or: vi.fn(() => builder),
      then: (resolve: any, reject: any) => {
        return Promise.resolve({ data: filtered, error: null }).then(resolve, reject);
      },
    };
    return builder;
  };

  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => createMockBuilder()),
      })),
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      })),
      removeChannel: vi.fn(),
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    },
    SUPABASE_URL: "https://test.supabase.co",
  };
});

class MockProvider implements ISearchProvider {
  readonly id = "GOOGLE_PLACES" as const;
  public candidateBatches: Record<string, ProviderCandidateResult> = {};
  public shouldFail = false;

  async search(strategy: SearchStrategy): Promise<ProviderCandidateResult> {
    if (this.shouldFail) {
      throw new Error("Provider API timeout / rate limit");
    }
    const token = strategy.pageToken || "page1";
    return (
      this.candidateBatches[token] || {
        candidates: [],
        nextPageToken: null,
      }
    );
  }
}

describe("Planless Place-Name Search Accuracy & Regression Suite", () => {
  let coordinator: SearchCoordinator;
  let mockProvider: MockProvider;

  beforeEach(() => {
    mockDbRows = [];
    clearPlaceOverridesCache();
    coordinator = new SearchCoordinator();
    mockProvider = new MockProvider();
    searchProviderRegistry.register(mockProvider);
  });

  describe("String Normalization & Typo Tolerance (Phase 2)", () => {
    it("handles hyphens, underscores, slashes and whitespace identically", () => {
      expect(normalizeSearchText("spider-man")).toBe("spider man");
      expect(normalizeSearchText("spider_man")).toBe("spider man");
      expect(normalizeSearchText("spider/man")).toBe("spider man");
      expect(normalizeSearchText("  spider   man  ")).toBe("spider man");
    });

    it("matches collapsed names like playarena vs Play Arena and spider man vs Spider-Man", () => {
      expect(isExactTitleMatch("playarena", "Play Arena")).toBe(true);
      expect(isExactTitleMatch("Play Arena", "playarena")).toBe(true);
      expect(isExactTitleMatch("spider man", "Spider-Man")).toBe(true);
      expect(isExactTitleMatch("spiderman", "Spider-Man")).toBe(true);
    });

    it("matches realistic typos using Jaro-Winkler and Levenshtein (trufel -> Truffles)", () => {
      const match = analyzeTextMatchTier("trufel", "Truffles");
      expect(match.tier).toBeGreaterThan(TextMatchTier.NO_MATCH);
      expect(match.tier).toBeLessThanOrEqual(TextMatchTier.PREFIX_PARTIAL_IN_NAME);
    });

    it("matches badmiton -> badminton and bowlin -> bowling", () => {
      const badmiton = analyzeTextMatchTier("badmiton", "Badminton Arena");
      expect(badmiton.tier).toBeGreaterThan(TextMatchTier.NO_MATCH);

      const bowlin = analyzeTextMatchTier("bowlin", "Amoeba Bowling");
      expect(bowlin.tier).toBeGreaterThan(TextMatchTier.NO_MATCH);
    });

    it("does not match unrelated words", () => {
      const match = analyzeTextMatchTier("astronomy", "Truffles");
      expect(match.tier).toBe(TextMatchTier.NO_MATCH);
    });
  });

  describe("Intent Query Understanding", () => {
    it("strips intent filler words and detects category", () => {
      const badmintonIntent = understandQuery("places to play badminton");
      expect(badmintonIntent.cleanSearchTerm).toBe("badminton");
      expect(badmintonIntent.categoryHint).toBe("SPORTS");

      const biryaniIntent = understandQuery("restaurants serving biryani");
      expect(biryaniIntent.cleanSearchTerm).toBe("biryani");
      expect(biryaniIntent.categoryHint).toBe("DINING");

      const bowlingIntent = understandQuery("places to bowl");
      expect(bowlingIntent.cleanSearchTerm).toBe("bowling");
      expect(bowlingIntent.categoryHint).toBe("ACTIVITIES");
    });
  });

  describe("Exact-Name Searches & Ranking", () => {
    it("finds and prioritizes exact name matches (Toit, Truffles, Play Arena, Absolute Barbecues)", async () => {
      mockProvider.candidateBatches["page1"] = {
        candidates: [
          {
            place_id: "random_cafe",
            name: "Toit Beer Co Distributor",
            vicinity: "Indiranagar, Bengaluru",
            types: ["bar"],
            geometry: { location: { lat: 12.978, lng: 77.64 } },
          },
          {
            place_id: "exact_toit",
            name: "Toit",
            vicinity: "100 Feet Rd, Indiranagar, Bengaluru",
            types: ["restaurant", "bar", "food"],
            geometry: { location: { lat: 12.979, lng: 77.641 } },
          },
        ],
        nextPageToken: null,
      };

      const result = await coordinator.executeSearch("Toit", {
        category: "DINING",
        discoveryCoordinates: { latitude: 12.9716, longitude: 77.5946 },
        city: "Bengaluru",
        forceRefresh: true,
      });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0].place_id).toBe("exact_toit");
      expect(result.items[0].title).toBe("Toit");
    });

    it("ranks exact name match at 15km above weaker match at 1km (distance does not drop exact match)", async () => {
      mockProvider.candidateBatches["page1"] = {
        candidates: [
          {
            place_id: "nearby_weak",
            name: "Barbeque Corner Fast Food",
            vicinity: "MG Road, Bengaluru",
            types: ["restaurant"],
            geometry: { location: { lat: 12.972, lng: 77.595 } },
          },
          {
            place_id: "far_exact",
            name: "Absolute Barbecues",
            vicinity: "Marathahalli, Bengaluru",
            types: ["restaurant"],
            geometry: { location: { lat: 12.956, lng: 77.701 } },
          },
        ],
        nextPageToken: null,
      };

      const result = await coordinator.executeSearch("Absolute Barbecues", {
        category: "DINING",
        discoveryCoordinates: { latitude: 12.9716, longitude: 77.5946 },
        city: "Bengaluru",
        forceRefresh: true,
      });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0].place_id).toBe("far_exact");
      expect(result.items[0].title).toBe("Absolute Barbecues");
    });
  });

  describe("Database Overrides as First-Class Citizens (Dining, Sports, Activities)", () => {
    it("searches and returns curated Dining records even when provider returns empty", async () => {
      mockDbRows = [
        {
          id: "d1",
          place_id: "curated_dining_1",
          name_override: "Truffles Central",
          address_override: "St Marks Road, Bengaluru",
          latitude_override: 12.972,
          longitude_override: 77.601,
          category_override: "dining",
          subcategory: "Burgers & American",
          is_deleted: false,
        },
      ];

      mockProvider.candidateBatches["page1"] = {
        candidates: [],
        nextPageToken: null,
      };

      const result = await coordinator.executeSearch("Truffles", {
        category: "DINING",
        city: "Bengaluru",
        forceRefresh: true,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].place_id).toBe("curated_dining_1");
      expect(result.items[0].title).toBe("Truffles Central");
      expect(result.items[0].category).toBe("DINING");
    });

    it("searches and returns curated Activities records", async () => {
      mockDbRows = [
        {
          id: "a1",
          place_id: "curated_activity_1",
          name_override: "Mystery Rooms Escape Game",
          address_override: "Indiranagar, Bengaluru",
          latitude_override: 12.975,
          longitude_override: 77.64,
          category_override: "activities",
          subcategory: "Escape Room",
          is_deleted: false,
        },
      ];

      const result = await coordinator.executeSearch("Mystery Rooms", {
        category: "ACTIVITIES",
        city: "Bengaluru",
        forceRefresh: true,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].place_id).toBe("curated_activity_1");
      expect(result.items[0].title).toBe("Mystery Rooms Escape Game");
      expect(result.items[0].category).toBe("ACTIVITIES");
    });

    it("searches and returns curated Sports records", async () => {
      mockDbRows = [
        {
          id: "s1",
          place_id: "curated_sport_1",
          name_override: "Play Arena Sports Complex",
          address_override: "Sarjapur Road, Bengaluru",
          latitude_override: 12.908,
          longitude_override: 77.682,
          category_override: "sports",
          subcategory: "Badminton, Go-Karting",
          is_deleted: false,
        },
      ];

      const result = await coordinator.executeSearch("playarena", {
        category: "SPORTS",
        city: "Bengaluru",
        forceRefresh: true,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].place_id).toBe("curated_sport_1");
      expect(result.items[0].title).toBe("Play Arena Sports Complex");
    });

    it("respects category filtering: dining override is excluded from SPORTS query", async () => {
      mockDbRows = [
        {
          id: "d1",
          place_id: "curated_dining_1",
          name_override: "Truffles",
          address_override: "St Marks Road, Bengaluru",
          latitude_override: 12.972,
          longitude_override: 77.601,
          category_override: "dining",
          is_deleted: false,
        },
      ];

      const sportsResult = await coordinator.executeSearch("Truffles", {
        category: "SPORTS",
        city: "Bengaluru",
        forceRefresh: true,
      });

      expect(sportsResult.items.length).toBe(0);
    });

    it("survives external provider failure and returns curated database results", async () => {
      mockDbRows = [
        {
          id: "d1",
          place_id: "curated_dining_resilient",
          name_override: "Toit Brewpub",
          address_override: "Indiranagar, Bengaluru",
          latitude_override: 12.979,
          longitude_override: 77.641,
          category_override: "dining",
          is_deleted: false,
        },
      ];

      mockProvider.shouldFail = true;

      const result = await coordinator.executeSearch("Toit", {
        category: "DINING",
        city: "Bengaluru",
        forceRefresh: true,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].place_id).toBe("curated_dining_resilient");
      expect(result.items[0].title).toBe("Toit Brewpub");
    });

    it("merges curated database record and external provider record without duplicate cards", async () => {
      const sharedPlaceId = "ChIJ_toit_unique";
      mockDbRows = [
        {
          id: "d1",
          place_id: sharedPlaceId,
          name_override: "Toit Craft Brewery (Curated)",
          address_override: "100 Feet Rd, Indiranagar, Bengaluru",
          latitude_override: 12.979,
          longitude_override: 77.641,
          category_override: "dining",
          subcategory: "Microbrewery",
          is_deleted: false,
        },
      ];

      mockProvider.candidateBatches["page1"] = {
        candidates: [
          {
            place_id: sharedPlaceId,
            name: "Toit",
            vicinity: "Indiranagar, Bengaluru",
            types: ["restaurant", "bar"],
            geometry: { location: { lat: 12.979, lng: 77.641 } },
          },
        ],
        nextPageToken: null,
      };

      const result = await coordinator.executeSearch("Toit", {
        category: "DINING",
        city: "Bengaluru",
        forceRefresh: true,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].place_id).toBe(sharedPlaceId);
      expect(result.items[0].title).toBe("Toit Craft Brewery (Curated)");
    });
  });

  describe("Geographic Eligibility & GPS Fallback", () => {
    it("uses selected city center when GPS coordinates are unavailable", async () => {
      mockProvider.candidateBatches["page1"] = {
        candidates: [
          {
            place_id: "mumbai_place",
            name: "Pizza By The Bay",
            vicinity: "Marine Drive, Mumbai",
            types: ["restaurant"],
            geometry: { location: { lat: 18.932, lng: 72.823 } },
          },
        ],
        nextPageToken: null,
      };

      const result = await coordinator.executeSearch("Pizza By The Bay", {
        category: "DINING",
        discoveryCoordinates: null,
        city: "Mumbai",
        forceRefresh: true,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].title).toBe("Pizza By The Bay");
    });

    it("biases search to target city center when device GPS is in another city", async () => {
      // User is physically in Chennai/Potheri (12.823, 80.044) but searching in Bengaluru
      mockProvider.candidateBatches["page1"] = {
        candidates: [
          {
            place_id: "toit_blr",
            name: "Toit",
            vicinity: "Indiranagar, Bengaluru",
            types: ["restaurant", "bar"],
            geometry: { location: { lat: 12.979, lng: 77.641 } },
          },
        ],
        nextPageToken: null,
      };

      const result = await coordinator.executeSearch("toit", {
        category: "DINING",
        discoveryCoordinates: { latitude: 12.823, longitude: 80.044 }, // Chennai coords
        city: "Bengaluru",
        forceRefresh: true,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].title).toBe("Toit");
      expect(result.items[0].place_id).toBe("toit_blr");
    });

    it("surfaces cross-city place when target city has 0 matches for a specific place name", async () => {
      // User is in Chennai, searching for Toit (which is in Bengaluru)
      // Initial search in Chennai returns nothing or places in Bengaluru that fail city boundary
      mockProvider.candidateBatches["page1"] = {
        candidates: [
          {
            place_id: "toit_indiranagar",
            name: "Toit",
            vicinity: "Indiranagar, Bengaluru",
            types: ["restaurant", "bar"],
            geometry: { location: { lat: 12.979, lng: 77.641 } },
          },
        ],
        nextPageToken: null,
      };

      const result = await coordinator.executeSearch("toit", {
        category: "DINING",
        city: "Chennai",
        forceRefresh: true,
      });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0].title).toBe("Toit");
      expect((result.items[0] as any)._isCrossCity).toBe(true);
    });
  });
});

