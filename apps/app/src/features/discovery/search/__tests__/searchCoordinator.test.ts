import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchCoordinator } from "../session/searchCoordinator";
import { searchProviderRegistry } from "../providers/providerRegistry";
import { ISearchProvider, ProviderCandidateResult, SearchStrategy } from "../types/provider";
import { clearPlaceOverridesCache } from "../../services/placeOverridesService";

vi.mock("../../../../../lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
  SUPABASE_URL: "https://test.supabase.co",
}));

class MockProvider implements ISearchProvider {
  readonly id = "GOOGLE_PLACES" as const;
  public delayMs = 10;
  public candidateBatches: Record<string, ProviderCandidateResult> = {};

  async search(strategy: SearchStrategy): Promise<ProviderCandidateResult> {
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
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

describe("SearchCoordinator", () => {
  let coordinator: SearchCoordinator;
  let mockProvider: MockProvider;

  beforeEach(() => {
    clearPlaceOverridesCache();
    coordinator = new SearchCoordinator();
    mockProvider = new MockProvider();
    searchProviderRegistry.register(mockProvider);
  });

  it("stale requests cannot overwrite newer queries", async () => {
    // Request A ("tru") takes 50ms
    // Request B ("truffles") takes 10ms
    mockProvider.candidateBatches["page1"] = {
      candidates: [
        {
          place_id: "tru_candidate",
          name: "Tru Juice Bar",
          types: ["restaurant"],
        },
      ],
      nextPageToken: null,
    };

    const slowPromise = (async () => {
      mockProvider.delayMs = 50;
      return coordinator.executeSearch("tru", { forceRefresh: true });
    })();

    // Start fast request right after
    mockProvider.delayMs = 5;
    mockProvider.candidateBatches["page1"] = {
      candidates: [
        {
          place_id: "truffles_candidate",
          name: "Truffles",
          types: ["restaurant"],
        },
      ],
      nextPageToken: null,
    };

    const fastResult = await coordinator.executeSearch("truffles", { forceRefresh: true });
    expect(fastResult.rawQuery).toBe("truffles");
    expect(fastResult.items[0]?.place_id).toBe("truffles_candidate");

    // Wait for slow promise to resolve
    await slowPromise;

    // Active session MUST still be truffles, not overwritten by "tru"
    const current = coordinator.getCurrentSession();
    expect(current?.rawQuery).toBe("truffles");
    expect(current?.items[0]?.place_id).toBe("truffles_candidate");
  });

  it("duplicate provider IDs are removed and deduplicated", async () => {
    mockProvider.delayMs = 0;
    mockProvider.candidateBatches["page1"] = {
      candidates: [
        {
          place_id: "dup_1",
          name: "Truffles St Marks",
          types: ["restaurant"],
        },
        {
          place_id: "dup_1", // duplicate
          name: "Truffles St Marks Duplicate",
          types: ["restaurant"],
        },
        {
          place_id: "dup_2",
          name: "Truffles Koramangala",
          types: ["restaurant"],
        },
      ],
      nextPageToken: null,
    };

    const result = await coordinator.executeSearch("Truffles", { forceRefresh: true });
    const placeIds = result.items.map((i) => i.place_id);
    expect(placeIds.length).toBe(2);
    expect(new Set(placeIds)).toEqual(new Set(["dup_1", "dup_2"]));
  });

  it("pagination retrieves next page and appends cleanly", async () => {
    mockProvider.delayMs = 0;
    mockProvider.candidateBatches["page1"] = {
      candidates: [
        {
          place_id: "p1_1",
          name: "Third Wave Coffee 1",
          types: ["cafe"],
        },
      ],
      nextPageToken: "token_page_2",
    };
    mockProvider.candidateBatches["token_page_2"] = {
      candidates: [
        {
          place_id: "p2_1",
          name: "Third Wave Coffee 2",
          types: ["cafe"],
        },
      ],
      nextPageToken: null,
    };

    const session1 = await coordinator.executeSearch("Third Wave Coffee", { forceRefresh: true });
    expect(session1.items.length).toBe(1);
    expect(session1.isExhausted).toBe(false);
    expect(session1.nextPageToken).toBe("token_page_2");

    const session2 = await coordinator.loadNextPage();
    expect(session2?.items.length).toBe(2);
    expect(session2?.items.map((i) => i.place_id)).toEqual(["p1_1", "p2_1"]);
    expect(session2?.isExhausted).toBe(true);
    expect(session2?.nextPageToken).toBe(null);
  });

  it("changing query resets pagination and search state", async () => {
    mockProvider.delayMs = 0;
    mockProvider.candidateBatches["page1"] = {
      candidates: [
        {
          place_id: "query_1",
          name: "Truffles Koramangala",
          types: ["restaurant"],
        },
      ],
      nextPageToken: "token_truffles_2",
    };

    const s1 = await coordinator.executeSearch("Truffles", { forceRefresh: true });
    expect(s1.nextPageToken).toBe("token_truffles_2");

    // Change query to "Toit"
    mockProvider.candidateBatches["page1"] = {
      candidates: [
        {
          place_id: "query_2",
          name: "Toit Brewpub",
          types: ["restaurant"],
        },
      ],
      nextPageToken: null,
    };

    const s2 = await coordinator.executeSearch("Toit", { forceRefresh: true });
    expect(s2.rawQuery).toBe("Toit");
    expect(s2.items.map((i) => i.place_id)).toEqual(["query_2"]);
    expect(s2.nextPageToken).toBeNull();
    expect(s2.isExhausted).toBe(true);
  });

  it("changing location resets the appropriate search state", async () => {
    mockProvider.delayMs = 0;
    mockProvider.candidateBatches["page1"] = {
      candidates: [
        {
          place_id: "place_loc_1",
          name: "Corner House Ice Cream",
          types: ["cafe"],
          latitude: 12.9716,
          longitude: 77.5946,
        },
      ],
      nextPageToken: "token_loc_2",
    };

    const loc1 = { latitude: 12.9716, longitude: 77.5946 };
    const s1 = await coordinator.executeSearch("Corner House", {
      discoveryCoordinates: loc1,
      forceRefresh: true,
    });
    expect(s1.strategy.locationBias?.latitude).toBe(loc1.latitude);
    expect(s1.nextPageToken).toBe("token_loc_2");

    // Location changes to Koramangala
    const loc2 = { latitude: 12.9352, longitude: 77.6245 };
    const s2 = await coordinator.executeSearch("Corner House", {
      discoveryCoordinates: loc2,
      forceRefresh: true,
    });
    expect(s2.strategy.locationBias?.latitude).toBe(loc2.latitude);
    expect(s2.strategy.locationBias?.longitude).toBe(loc2.longitude);
  });

  it("irrelevant pages continue fetching when necessary and exhausted providers stop cleanly", async () => {
    mockProvider.delayMs = 0;
    // Page 1 contains only irrelevant offices / retail for sports search
    mockProvider.candidateBatches["page1"] = {
      candidates: [
        {
          place_id: "irrelevant_office_1",
          name: "Karnataka Football Association Office",
          types: ["office"],
        },
      ],
      nextPageToken: "token_auto_page_2",
    };
    // Page 2 contains genuine playable turf
    mockProvider.candidateBatches["token_auto_page_2"] = {
      candidates: [
        {
          place_id: "relevant_turf_1",
          name: "PlayOn Football Turf",
          types: ["stadium"],
        },
      ],
      nextPageToken: null,
    };

    const result = await coordinator.executeSearch("football turf", {
      category: "SPORTS",
      forceRefresh: true,
    });

    // Auto-pagination should have bypassed the empty/irrelevant page 1 and retrieved page 2
    expect(result.items.some((i) => i.place_id === "relevant_turf_1")).toBe(true);
    expect(result.items.some((i) => i.place_id === "irrelevant_office_1")).toBe(false);
    expect(result.isExhausted).toBe(true);
    expect(result.nextPageToken).toBeNull();

    // Calling loadNextPage on exhausted session should stop cleanly without error
    const nextOnExhausted = await coordinator.loadNextPage();
    expect(nextOnExhausted?.isExhausted).toBe(true);
  });

  it("cache properly separates subcategories, categories, locations, and queries without collision", async () => {
    mockProvider.delayMs = 0;
    // Set up mock responses for football vs badminton
    mockProvider.candidateBatches["page1"] = {
      candidates: [
        {
          place_id: "turf_place_1",
          name: "Bengaluru Football Turf",
          types: ["stadium"],
        },
      ],
      nextPageToken: null,
    };

    // 1. Search Football subcategory with empty query
    const footballSession = await coordinator.executeSearch("", {
      category: "SPORTS",
      subcategory: "football",
    });
    expect(footballSession.items[0]?.place_id).toBe("turf_place_1");

    // 2. Change mock provider to return badminton
    mockProvider.candidateBatches["page1"] = {
      candidates: [
        {
          place_id: "badminton_place_1",
          name: "Smash Badminton Centre",
          types: ["stadium"],
        },
      ],
      nextPageToken: null,
    };

    // 3. Search Badminton subcategory with empty query
    const badmintonSession = await coordinator.executeSearch("", {
      category: "SPORTS",
      subcategory: "badminton",
    });
    expect(badmintonSession.items[0]?.place_id).toBe("badminton_place_1");

    // 4. Switching back to Football subcategory should hit football cache, not badminton
    const cachedFootballSession = await coordinator.executeSearch("", {
      category: "SPORTS",
      subcategory: "football",
    });
    expect(cachedFootballSession.items[0]?.place_id).toBe("turf_place_1");
  });

  it("regression: page 2 cannot contain page 1 results even if provider returns overlapping candidates", async () => {
    mockProvider.delayMs = 0;
    // Page 1 returns items A and B
    mockProvider.candidateBatches["page1"] = {
      candidates: [
        { place_id: "place_A", name: "Play Arena", types: ["amusement_park"] },
        { place_id: "place_B", name: "Torq03", types: ["bowling_alley"] },
      ],
      nextPageToken: "token_page_2_overlap",
    };

    // Page 2 returns items B, C (B is an overlapping duplicate from page 1)
    mockProvider.candidateBatches["token_page_2_overlap"] = {
      candidates: [
        { place_id: "place_B", name: "Torq03 Duplicate", types: ["bowling_alley"] },
        { place_id: "place_C", name: "Smaaash", types: ["bowling_alley"] },
      ],
      nextPageToken: null,
    };

    const s1 = await coordinator.executeSearch("bowling", { category: "ACTIVITIES", forceRefresh: true });
    expect(s1.items.length).toBe(2);
    expect(s1.items.map((i) => i.place_id)).toEqual(["A", "B"]);

    const s2 = await coordinator.loadNextPage();
    // Only place_C should have been appended, place_B must be deduplicated
    expect(s2?.items.length).toBe(3);
    expect(s2?.items.map((i) => i.place_id)).toEqual(["A", "B", "C"]);
    expect(s2?.isExhausted).toBe(true);
  });

  it("regression: duplicate provider pages are detected and do not endlessly append duplicates", async () => {
    mockProvider.delayMs = 0;
    // Provider repeatedly returns the exact same results with identical or cyclical tokens
    mockProvider.candidateBatches["page1"] = {
      candidates: [
        { place_id: "turf_inc_1", name: "Bengaluru Turf Inc.", types: ["stadium"] },
      ],
      nextPageToken: "loop_token",
    };
    mockProvider.candidateBatches["loop_token"] = {
      candidates: [
        { place_id: "turf_inc_1", name: "Bengaluru Turf Inc.", types: ["stadium"] },
      ],
      nextPageToken: "loop_token", // Same cyclic token
    };

    const s1 = await coordinator.executeSearch("Bengaluru Turf Inc", { category: "SPORTS", forceRefresh: true });
    expect(s1.items.length).toBe(1);

    const s2 = await coordinator.loadNextPage();
    // Must NOT append duplicate turf_inc_1 and must mark session exhausted due to cycle detection
    expect(s2?.items.length).toBe(1);
    expect(s2?.isExhausted).toBe(true);
    expect(s2?.nextPageToken).toBeNull();
  });

  it("regression: specific place search 'bengaluru turf inc' stops cleanly and does not produce duplicate results", async () => {
    mockProvider.delayMs = 0;
    // Provider returns exact place and exhausts
    mockProvider.candidateBatches["page1"] = {
      candidates: [
        { place_id: "bti_unique_1", name: "Bengaluru Turf Inc.", types: ["stadium"] },
      ],
      nextPageToken: null,
    };

    const s1 = await coordinator.executeSearch("bengaluru turf inc", { category: "SPORTS", forceRefresh: true });
    expect(s1.items.length).toBe(1);
    expect(s1.isExhausted).toBe(true);
    expect(s1.nextPageToken).toBeNull();

    // Calling loadNextPage on exhausted exact-place search must not duplicate
    const s2 = await coordinator.loadNextPage();
    expect(s2?.items.length).toBe(1);
    expect(s2?.isExhausted).toBe(true);
  });
});
