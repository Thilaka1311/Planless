import { describe, it, expect, beforeEach } from "vitest";
import { SearchCoordinator } from "../session/searchCoordinator";
import { searchProviderRegistry } from "../providers/providerRegistry";
import { ISearchProvider, ProviderCandidateResult, SearchStrategy } from "../types/provider";
import { planlessSearchCache } from "../cache/searchCache";
import { sortSportsVenues } from "../../services/sportsRelevance";
import { DiscoveryItem } from "../../../../core/types/discovery";

class MockSportsProvider implements ISearchProvider {
  readonly id = "GOOGLE_PLACES" as const;
  public candidateBatches: Record<string, ProviderCandidateResult> = {};
  public receivedStrategies: SearchStrategy[] = [];

  async search(strategy: SearchStrategy): Promise<ProviderCandidateResult> {
    this.receivedStrategies.push(strategy);
    if (strategy.pageToken && this.candidateBatches[strategy.pageToken]) {
      return this.candidateBatches[strategy.pageToken];
    }
    const queryKey = strategy.queries ? strategy.queries.join("+") : strategy.query;
    if (queryKey && this.candidateBatches[queryKey]) {
      return this.candidateBatches[queryKey];
    }
    return (
      this.candidateBatches["default"] || {
        candidates: [],
        nextPageToken: null,
      }
    );
  }
}

describe("Sports Discovery Ranking & Retrieval Suite", () => {
  let coordinator: SearchCoordinator;
  let mockProvider: MockSportsProvider;

  const BENGALURU_LOCATION = { latitude: 12.9716, longitude: 77.5946 };
  const INDIRANAGAR_LOCATION = { latitude: 12.9784, longitude: 77.6408 };

  beforeEach(() => {
    planlessSearchCache.clear();
    coordinator = new SearchCoordinator();
    mockProvider = new MockSportsProvider();
    searchProviderRegistry.register(mockProvider);
  });

  it("ranks Football venues strictly by relevance and proximity: Bengaluru Turf Inc. at 0.0 km ranks #1 ahead of ToughX at 1.1 km and farther venues", async () => {
    // 1. Setup mock provider to return the exact 4 candidates
    mockProvider.candidateBatches["default"] = {
      candidates: [
        {
          place_id: "place_toughx",
          name: "ToughX Sports Arena",
          types: ["sports_complex", "athletic_field"],
          subcategory: "Football Turf",
          description: "5-a-side football turf and sports arena",
          latitude: 12.9815,
          longitude: 77.5946, // ~1.1 km
          rating: 4.7,
          user_ratings_total: 350,
          photos: [{ photo_reference: "photo_toughx" }],
        },
        {
          place_id: "place_bangalore_football_turf",
          name: "Bangalore Football Turf",
          types: ["athletic_field", "sports_complex"],
          subcategory: "Football Turf",
          latitude: 13.0780,
          longitude: 77.5946, // ~11.8 km
          rating: 4.6,
          user_ratings_total: 1200,
          photos: [{ photo_reference: "photo_bft" }],
        },
        {
          place_id: "place_turf_tactics",
          name: "Turf Tactics Sports Arena",
          types: ["sports_complex", "athletic_field"],
          subcategory: "Football Turf",
          latitude: 13.0716,
          longitude: 77.5946, // ~11.1 km
          rating: 4.5,
          user_ratings_total: 220,
          photos: [{ photo_reference: "photo_tt" }],
        },
        {
          place_id: "place_bengaluru_turf_inc",
          name: "Bengaluru Turf Inc.",
          types: ["sports_complex", "athletic_field"],
          subcategory: "Football Turf",
          latitude: 12.9716,
          longitude: 77.5946, // 0.0 km
          rating: 3.3,
          user_ratings_total: 25,
          photos: [{ photo_reference: "photo_bti" }],
        },
      ],
      nextPageToken: null,
    };

    // 2. Execute category discovery search for Football
    const session = await coordinator.executeSearch("", {
      category: "SPORTS",
      subcategory: "football",
      discoveryCoordinates: BENGALURU_LOCATION,
    });

    expect(session.items.length).toBe(4);

    // Verify distance calculation
    const bti = session.items.find((i) => i.id === "place_bengaluru_turf_inc");
    const toughx = session.items.find((i) => i.id === "place_toughx");
    const bft = session.items.find((i) => i.id === "place_bangalore_football_turf");
    const tt = session.items.find((i) => i.id === "place_turf_tactics");

    expect(bti?._distanceKm).toBeCloseTo(0.0, 1);
    expect(toughx?._distanceKm).toBeCloseTo(1.1, 1);
    expect(tt?._distanceKm).toBeCloseTo(11.1, 1);
    expect(bft?._distanceKm).toBeCloseTo(11.8, 1);

    // Expected Football ordering:
    // 1. Bengaluru Turf Inc. (0.0 km)
    // 2. ToughX Sports Arena (1.1 km)
    // 3. Turf Tactics Sports Arena (11.1 km)
    // 4. Bangalore Football Turf (11.8 km)
    expect(session.items[0].id).toBe("place_bengaluru_turf_inc");
    expect(session.items[1].id).toBe("place_toughx");
    expect(session.items[2].id).toBe("place_turf_tactics");
    expect(session.items[3].id).toBe("place_bangalore_football_turf");
  });

  it("sortSportsVenues also orders Bengaluru Turf Inc. #1 ahead of ToughX and farther venues", () => {
    const rawVenues: DiscoveryItem[] = [
      {
        id: "toughx",
        public_id: "toughx",
        place_id: "toughx",
        title: "ToughX Sports Arena",
        category: "SPORTS",
        subcategory: "Football Turf",
        description: "Football turf and sports facility",
        rating: 4.7,
        _distanceKm: 1.1,
      } as any,
      {
        id: "bft",
        public_id: "bft",
        place_id: "bft",
        title: "Bangalore Football Turf",
        category: "SPORTS",
        subcategory: "Football Turf",
        rating: 4.6,
        _distanceKm: 11.8,
      } as any,
      {
        id: "turf_tactics",
        public_id: "turf_tactics",
        place_id: "turf_tactics",
        title: "Turf Tactics Sports Arena",
        category: "SPORTS",
        subcategory: "Football Arena",
        rating: 4.5,
        _distanceKm: 11.1,
      } as any,
      {
        id: "bengaluru_turf_inc",
        public_id: "bengaluru_turf_inc",
        place_id: "bengaluru_turf_inc",
        title: "Bengaluru Turf Inc.",
        category: "SPORTS",
        subcategory: "Football Turf",
        rating: 3.3,
        _distanceKm: 0.0,
      } as any,
    ];

    const sorted = sortSportsVenues(rawVenues, "football");
    expect(sorted[0].id).toBe("bengaluru_turf_inc");
    expect(sorted[1].id).toBe("toughx");
    expect(sorted[2].id).toBe("turf_tactics");
    expect(sorted[3].id).toBe("bft");
  });

  it("merges multi-query candidates and does not lose valid venues from different queries", async () => {
    mockProvider.candidateBatches["default"] = {
      candidates: [
        {
          place_id: "query_1_venue",
          name: "Kickoff Football Turf",
          types: ["sports_complex"],
          latitude: 12.9720,
          longitude: 77.5950,
        },
        {
          place_id: "query_2_venue",
          name: "Aries Futsal Arena",
          types: ["sports_complex"],
          latitude: 12.9730,
          longitude: 77.5960,
        },
      ],
      nextPageToken: null,
    };

    const session = await coordinator.executeSearch("", {
      category: "SPORTS",
      subcategory: "football",
      discoveryCoordinates: BENGALURU_LOCATION,
    });

    expect(session.items.some((i) => i.id === "place_query_1_venue")).toBe(true);
    expect(session.items.some((i) => i.id === "place_query_2_venue")).toBe(true);
  });

  it("removes duplicate place_ids from candidate results", async () => {
    mockProvider.candidateBatches["default"] = {
      candidates: [
        {
          place_id: "dup_football_turf",
          name: "Bengaluru Turf Inc.",
          types: ["sports_complex"],
          latitude: 12.9716,
          longitude: 77.5946,
        },
        {
          place_id: "dup_football_turf", // identical place_id
          name: "Bengaluru Turf Inc. Branch",
          types: ["sports_complex"],
          latitude: 12.9716,
          longitude: 77.5946,
        },
      ],
      nextPageToken: null,
    };

    const session = await coordinator.executeSearch("", {
      category: "SPORTS",
      subcategory: "football",
      discoveryCoordinates: BENGALURU_LOCATION,
    });

    expect(session.items.length).toBe(1);
    expect(session.items[0].id).toBe("place_dup_football_turf");
  });

  it("excludes unrelated places such as sporting retail stores and pharmacies", async () => {
    mockProvider.candidateBatches["default"] = {
      candidates: [
        {
          place_id: "valid_turf",
          name: "Tiki Taka Football Arena",
          types: ["sports_complex"],
          latitude: 12.9716,
          longitude: 77.5946,
        },
        {
          place_id: "retail_store",
          name: "Decathlon Sporting Goods Store",
          types: ["sporting_goods_store", "store"],
          latitude: 12.9716,
          longitude: 77.5946,
        },
        {
          place_id: "medical_store",
          name: "Apollo Pharmacy Medical Care",
          types: ["pharmacy", "health"],
          latitude: 12.9716,
          longitude: 77.5946,
        },
      ],
      nextPageToken: null,
    };

    const session = await coordinator.executeSearch("", {
      category: "SPORTS",
      subcategory: "football",
      discoveryCoordinates: BENGALURU_LOCATION,
    });

    expect(session.items.length).toBe(1);
    expect(session.items[0].id).toBe("place_valid_turf");
  });

  it("location changes invalidate and recompute the category results", async () => {
    // Location 1: Central Bengaluru
    mockProvider.candidateBatches["default"] = {
      candidates: [
        {
          place_id: "central_turf",
          name: "Central Turf Ground",
          types: ["sports_complex"],
          latitude: 12.9716,
          longitude: 77.5946,
        },
      ],
      nextPageToken: null,
    };

    const session1 = await coordinator.executeSearch("", {
      category: "SPORTS",
      subcategory: "football",
      discoveryCoordinates: BENGALURU_LOCATION,
    });
    expect(session1.items[0].id).toBe("place_central_turf");

    // Location 2: Indiranagar
    mockProvider.candidateBatches["default"] = {
      candidates: [
        {
          place_id: "indiranagar_turf",
          name: "Indiranagar Kickoff Arena",
          types: ["sports_complex"],
          latitude: 12.9784,
          longitude: 77.6408,
        },
      ],
      nextPageToken: null,
    };

    const session2 = await coordinator.executeSearch("", {
      category: "SPORTS",
      subcategory: "football",
      discoveryCoordinates: INDIRANAGAR_LOCATION,
    });
    expect(session2.items[0].id).toBe("place_indiranagar_turf");
    expect(session2.items[0].id).not.toBe(session1.items[0].id);
  });

  it("cache does not mix Football with other sports", async () => {
    // Football search
    mockProvider.candidateBatches["default"] = {
      candidates: [
        {
          place_id: "football_venue",
          name: "Dribble Football Ground",
          types: ["sports_complex"],
          latitude: 12.9716,
          longitude: 77.5946,
        },
      ],
      nextPageToken: null,
    };

    const footballSession = await coordinator.executeSearch("", {
      category: "SPORTS",
      subcategory: "football",
      discoveryCoordinates: BENGALURU_LOCATION,
    });
    expect(footballSession.items[0].id).toBe("place_football_venue");

    // Cricket search at the same location
    mockProvider.candidateBatches["default"] = {
      candidates: [
        {
          place_id: "cricket_venue",
          name: "Powerplay Cricket Nets",
          types: ["stadium"],
          latitude: 12.9716,
          longitude: 77.5946,
        },
      ],
      nextPageToken: null,
    };

    const cricketSession = await coordinator.executeSearch("", {
      category: "SPORTS",
      subcategory: "cricket",
      discoveryCoordinates: BENGALURU_LOCATION,
    });
    expect(cricketSession.items[0].id).toBe("place_cricket_venue");
    expect(cricketSession.items[0].id).not.toBe("place_football_venue");
  });

  it("pagination loads the next page of venues seamlessly", async () => {
    mockProvider.candidateBatches["default"] = {
      candidates: [
        {
          place_id: "page1_turf",
          name: "First Half Football Turf",
          types: ["sports_complex"],
          latitude: 12.9716,
          longitude: 77.5946,
        },
      ],
      nextPageToken: "token_page_2",
    };
    mockProvider.candidateBatches["token_page_2"] = {
      candidates: [
        {
          place_id: "page2_turf",
          name: "Second Half Football Turf",
          types: ["sports_complex"],
          latitude: 12.9750,
          longitude: 77.5950,
        },
      ],
      nextPageToken: null,
    };

    const session = await coordinator.executeSearch("", {
      category: "SPORTS",
      subcategory: "football",
      discoveryCoordinates: BENGALURU_LOCATION,
    });
    expect(session.items.length).toBe(1);
    expect(session.nextPageToken).toBe("token_page_2");

    const sessionKey = coordinator.getSessionKey("SPORTS", "football");
    const nextPageSession = await coordinator.loadNextPage(sessionKey);
    expect(nextPageSession?.items.length).toBe(2);
    expect(nextPageSession?.items[1].id).toBe("place_page2_turf");
  });

  it("manual search and category discovery find the same underlying place", async () => {
    mockProvider.candidateBatches["default"] = {
      candidates: [
        {
          place_id: "place_bengaluru_turf_inc",
          name: "Bengaluru Turf Inc.",
          types: ["sports_complex"],
          latitude: 12.9716,
          longitude: 77.5946,
        },
      ],
      nextPageToken: null,
    };

    // Category discovery
    const discoverySession = await coordinator.executeSearch("", {
      category: "SPORTS",
      subcategory: "football",
      discoveryCoordinates: BENGALURU_LOCATION,
    });
    const discoveryPlace = discoverySession.items.find((i) => i.id === "place_bengaluru_turf_inc");
    expect(discoveryPlace).toBeDefined();

    // Manual search for the same venue
    const searchSession = await coordinator.executeSearch("bengaluru turf inc", {
      category: "SPORTS",
      discoveryCoordinates: BENGALURU_LOCATION,
    });
    const searchPlace = searchSession.items.find((i) => i.id === "place_bengaluru_turf_inc");
    expect(searchPlace).toBeDefined();
    expect(searchPlace?.place_id).toBe(discoveryPlace?.place_id);
    expect(searchPlace?.title).toBe(discoveryPlace?.title);
  });
});
