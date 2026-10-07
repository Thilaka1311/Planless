import { describe, it, expect, beforeEach, vi } from "vitest";
import { SearchCoordinator } from "../session/searchCoordinator";
import { searchProviderRegistry } from "../providers/providerRegistry";
import { ISearchProvider, ProviderCandidateResult, SearchStrategy } from "../types/provider";
import { planlessSearchCache } from "../cache/searchCache";
import { clearPlaceOverridesCache, PlaceOverride } from "../../services/placeOverridesService";

// In-memory mock database for discovery_place_overrides
let mockDbOverrides: PlaceOverride[] = [];

vi.mock("../../../../../lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "discovery_place_overrides") {
        return {
          select: vi.fn().mockImplementation(() => ({
            data: mockDbOverrides,
            error: null,
          })),
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
  SUPABASE_URL: "https://test.supabase.co",
}));

class MockUnifiedProvider implements ISearchProvider {
  readonly id = "GOOGLE_PLACES" as const;
  public candidateBatches: Record<string, ProviderCandidateResult> = {};
  public receivedStrategies: SearchStrategy[] = [];

  async search(strategy: SearchStrategy): Promise<ProviderCandidateResult> {
    this.receivedStrategies.push(strategy);
    const token = strategy.pageToken;
    if (token && this.candidateBatches[token]) {
      return this.candidateBatches[token];
    }
    const query = strategy.query || "";
    if (this.candidateBatches[query]) {
      return this.candidateBatches[query];
    }
    return {
      candidates: [],
      nextPageToken: null,
    };
  }
}

describe("Sports Unified Search (Master Search Architecture + Google & DB Pipeline)", () => {
  let coordinator: SearchCoordinator;
  let mockProvider: MockUnifiedProvider;

  const BENGALURU_LOCATION = { latitude: 12.9716, longitude: 77.5946 };

  beforeEach(() => {
    planlessSearchCache.clear();
    clearPlaceOverridesCache();
    mockDbOverrides = [];
    coordinator = new SearchCoordinator();
    mockProvider = new MockUnifiedProvider();
    searchProviderRegistry.register(mockProvider);
  });

  it("1. Performs real text search for user query (e.g. 'match point') rather than switching into generic sports browse", async () => {
    mockProvider.candidateBatches["match point"] = {
      candidates: [
        {
          place_id: "ChIJ_match_point_1",
          name: "Match Point Tennis Academy",
          types: ["sports_complex", "tennis_court"],
          subcategory: "Tennis Academy",
          latitude: 12.972,
          longitude: 77.595,
          vicinity: "Bengaluru",
        },
      ],
      nextPageToken: null,
    };

    const session = await coordinator.executeSearch("match point", {
      category: "SPORTS",
      discoveryCoordinates: BENGALURU_LOCATION,
      forceRefresh: true,
    });

    // Verify provider received exact query "match point"
    expect(mockProvider.receivedStrategies.length).toBeGreaterThan(0);
    const lastStrat = mockProvider.receivedStrategies[mockProvider.receivedStrategies.length - 1];
    expect(lastStrat.query).toBe("match point");
    expect(lastStrat.category).toBe("SPORTS");

    // Results reflect real text match
    expect(session.items.length).toBe(1);
    expect(session.items[0].title).toBe("Match Point Tennis Academy");
  });

  it("2. 'match' returns relevant sports places from BOTH Google and Database sources", async () => {
    // Google candidate
    mockProvider.candidateBatches["match"] = {
      candidates: [
        {
          place_id: "ChIJ_google_match_1",
          name: "Match Day Football Arena",
          types: ["sports_complex", "athletic_field"],
          subcategory: "Football Turf",
          latitude: 12.975,
          longitude: 77.595,
          vicinity: "Bengaluru",
        },
      ],
      nextPageToken: null,
    };

    // Database candidate
    mockDbOverrides = [
      {
        place_id: "ChIJ_db_match_2",
        name_override: "Match Point Badminton Club",
        category_override: "SPORTS",
        subcategory: "Badminton Court",
        latitude_override: 12.973,
        longitude_override: 77.595,
        address_override: "Indiranagar, Bengaluru",
        is_deleted: false,
      },
    ];

    const session = await coordinator.executeSearch("match", {
      category: "SPORTS",
      discoveryCoordinates: BENGALURU_LOCATION,
      forceRefresh: true,
    });

    const placeIds = session.items.map((i) => i.place_id);
    expect(placeIds).toContain("ChIJ_google_match_1");
    expect(placeIds).toContain("ChIJ_db_match_2");
    expect(session.items.length).toBe(2);
  });

  it("3. 'match point' prioritizes exact/strong name matches", async () => {
    mockProvider.candidateBatches["match point"] = {
      candidates: [
        {
          place_id: "place_partial_match",
          name: "Point Arena Sports Hub", // contains point, not match point
          types: ["sports_complex"],
          subcategory: "Sports Hub",
          latitude: 12.972,
          longitude: 77.594,
          vicinity: "Bengaluru",
        },
        {
          place_id: "place_exact_match",
          name: "Match Point", // Exact name match
          types: ["sports_complex", "tennis_court"],
          subcategory: "Tennis Court",
          latitude: 12.980,
          longitude: 77.600, // further away
          vicinity: "Bengaluru",
        },
      ],
      nextPageToken: null,
    };

    const session = await coordinator.executeSearch("match point", {
      category: "SPORTS",
      discoveryCoordinates: BENGALURU_LOCATION,
      forceRefresh: true,
    });

    expect(session.items.length).toBe(2);
    // Exact name match "Match Point" MUST rank #1 ahead of partial match despite being further
    expect(session.items[0].place_id).toBe("exact_match");
    expect(session.items[0].title).toBe("Match Point");
    expect(session.items[1].place_id).toBe("partial_match");
  });

  it("4. Database-only sports places appear in sports search", async () => {
    // Provider returns 0 candidates
    mockProvider.candidateBatches["prime turf"] = {
      candidates: [],
      nextPageToken: null,
    };

    // Database has the place
    mockDbOverrides = [
      {
        place_id: "ChIJ_prime_turf_db",
        name_override: "Prime Sports Turf",
        category_override: "SPORTS",
        subcategory: "Football Turf",
        latitude_override: 12.971,
        longitude_override: 77.594,
        address_override: "Koramangala, Bengaluru",
        is_deleted: false,
      },
    ];

    const session = await coordinator.executeSearch("prime turf", {
      category: "SPORTS",
      discoveryCoordinates: BENGALURU_LOCATION,
      forceRefresh: true,
    });

    expect(session.items.length).toBe(1);
    expect(session.items[0].place_id).toBe("ChIJ_prime_turf_db");
    expect(session.items[0].title).toBe("Prime Sports Turf");
  });

  it("5. Google-only sports places appear normally", async () => {
    mockDbOverrides = []; // Database is empty

    mockProvider.candidateBatches["smash badminton"] = {
      candidates: [
        {
          place_id: "ChIJ_smash_badminton_g",
          name: "Smash Badminton Arena",
          types: ["sports_complex"],
          subcategory: "Badminton",
          latitude: 12.971,
          longitude: 77.594,
          vicinity: "Bengaluru",
        },
      ],
      nextPageToken: null,
    };

    const session = await coordinator.executeSearch("smash badminton", {
      category: "SPORTS",
      discoveryCoordinates: BENGALURU_LOCATION,
      forceRefresh: true,
    });

    expect(session.items.length).toBe(1);
    expect(session.items[0].place_id).toBe("ChIJ_smash_badminton_g");
    expect(session.items[0].title).toBe("Smash Badminton Arena");
  });

  it("6. Places existing in both Google and Database appear only ONCE with admin overrides applied", async () => {
    const sharedPlaceId = "ChIJ_toughx_sports_123";

    // Google Places data
    mockProvider.candidateBatches["toughx"] = {
      candidates: [
        {
          place_id: sharedPlaceId,
          name: "ToughX Raw Google Name",
          types: ["sports_complex", "athletic_field"],
          subcategory: "Sports Facility",
          latitude: 12.971,
          longitude: 77.594,
          vicinity: "Vidyaranyapura, Bengaluru",
          cover_image_url: "https://google.com/raw_photo.jpg",
        },
      ],
      nextPageToken: null,
    };

    // Database override data
    mockDbOverrides = [
      {
        place_id: sharedPlaceId,
        name_override: "ToughX Sports Arena (Football, Cricket)",
        category_override: "SPORTS",
        subcategory: "Sports Club & Turf",
        google_photo_reference: "admin_curated_photo_ref_abc",
        is_deleted: false,
      },
    ];

    const session = await coordinator.executeSearch("toughx", {
      category: "SPORTS",
      discoveryCoordinates: BENGALURU_LOCATION,
      forceRefresh: true,
    });

    // Must deduplicate to EXACTLY 1 item
    expect(session.items.length).toBe(1);
    const item = session.items[0];
    expect(item.place_id).toBe(sharedPlaceId);
    // Overridden title applied
    expect(item.title).toBe("ToughX Sports Arena (Football, Cricket)");
    // Overridden photo applied
    expect(item.cover_image_url).toContain("photo_reference=admin_curated_photo_ref_abc");
    // Base Google attributes preserved
    expect(item.location).toBe("Vidyaranyapura, Bengaluru");
  });

  it("7. Irrelevant Google businesses (retail, corporate office, dining) do NOT appear in Sports search", async () => {
    mockProvider.candidateBatches["cricket"] = {
      candidates: [
        {
          place_id: "place_cricket_store",
          name: "Decathlon Cricket Equipment Store",
          types: ["sporting_goods_store", "store"],
        },
        {
          place_id: "place_cricket_office",
          name: "Karnataka Cricket Association Headquarters Pvt Ltd",
          types: ["office"],
        },
        {
          place_id: "place_cricket_cafe",
          name: "Cricket Lovers Cafe & Bistro",
          types: ["cafe", "restaurant"],
        },
        {
          place_id: "place_cricket_ground",
          name: "Chinnaswamy Cricket Stadium Ground",
          types: ["stadium", "sports_complex"],
          latitude: 12.978,
          longitude: 77.599,
          vicinity: "Bengaluru",
        },
      ],
      nextPageToken: null,
    };

    const session = await coordinator.executeSearch("cricket", {
      category: "SPORTS",
      discoveryCoordinates: BENGALURU_LOCATION,
      forceRefresh: true,
    });

    // Only genuine playable cricket ground passes
    expect(session.items.length).toBe(1);
    expect(session.items[0].place_id).toBe("cricket_ground");
  });

  it("8. Pagination works across the combined result set", async () => {
    // Page 1: Google candidate A
    mockProvider.candidateBatches["turf"] = {
      candidates: [
        {
          place_id: "turf_page1_google",
          name: "Alpha Football Turf",
          types: ["sports_complex"],
          latitude: 12.971,
          longitude: 77.594,
          vicinity: "Bengaluru",
        },
      ],
      nextPageToken: "token_page_2",
    };

    // Page 2: Google candidate B
    mockProvider.candidateBatches["token_page_2"] = {
      candidates: [
        {
          place_id: "turf_page2_google",
          name: "Beta Football Turf",
          types: ["sports_complex"],
          latitude: 12.973,
          longitude: 77.594,
          vicinity: "Bengaluru",
        },
      ],
      nextPageToken: null,
    };

    // Database candidate C (included on initial search)
    mockDbOverrides = [
      {
        place_id: "turf_db_candidate",
        name_override: "Gamma Football Turf",
        category_override: "SPORTS",
        subcategory: "Football Turf",
        latitude_override: 12.972,
        longitude_override: 77.594,
        address_override: "Bengaluru",
        is_deleted: false,
      },
    ];

    const s1 = await coordinator.executeSearch("turf", {
      category: "SPORTS",
      discoveryCoordinates: BENGALURU_LOCATION,
      forceRefresh: true,
    });

    // Page 1 contains Alpha + Gamma
    expect(s1.items.length).toBe(2);
    expect(s1.nextPageToken).toBe("token_page_2");

    const s2 = await coordinator.loadNextPage();
    // Page 2 appends Beta without duplicating Gamma or Alpha
    expect(s2?.items.length).toBe(3);
    const ids = s2?.items.map((i) => i.place_id);
    expect(ids).toContain("turf_page1_google");
    expect(ids).toContain("turf_db_candidate");
    expect(ids).toContain("turf_page2_google");
    expect(s2?.isExhausted).toBe(true);
  });

  it("9. Search cache works and returns cached results instantly without re-querying provider", async () => {
    mockProvider.candidateBatches["pickleball"] = {
      candidates: [
        {
          place_id: "pickle_1",
          name: "Bangalore Pickleball Club",
          types: ["sports_complex"],
          latitude: 12.971,
          longitude: 77.594,
          vicinity: "Bengaluru",
        },
      ],
      nextPageToken: null,
    };

    const s1 = await coordinator.executeSearch("pickleball", {
      category: "SPORTS",
      discoveryCoordinates: BENGALURU_LOCATION,
    });
    expect(mockProvider.receivedStrategies.length).toBe(1);
    expect(s1.items.length).toBe(1);

    // Second call without forceRefresh
    const s2 = await coordinator.executeSearch("pickleball", {
      category: "SPORTS",
      discoveryCoordinates: BENGALURU_LOCATION,
    });
    // Provider was NOT called a second time
    expect(mockProvider.receivedStrategies.length).toBe(1);
    expect(s2.items.length).toBe(1);
    expect(s2.items[0].place_id).toBe("pickle_1");
  });

  it("10. Location/city boundary filtering excludes venues outside target city", async () => {
    mockProvider.candidateBatches["badminton arena"] = {
      candidates: [
        {
          place_id: "place_in_bengaluru",
          name: "Bengaluru Central Badminton Arena",
          types: ["sports_complex"],
          latitude: 12.9716, // Bengaluru center
          longitude: 77.5946,
          vicinity: "Bengaluru, Karnataka",
        },
        {
          place_id: "place_in_delhi",
          name: "Delhi Badminton Arena",
          types: ["sports_complex"],
          latitude: 28.6139, // Delhi (~1700km away)
          longitude: 77.2090,
          vicinity: "New Delhi, Delhi",
        },
      ],
      nextPageToken: null,
    };

    const session = await coordinator.executeSearch("badminton arena", {
      category: "SPORTS",
      discoveryCoordinates: BENGALURU_LOCATION,
      city: "Bengaluru",
      cityBounds: {
        north: 13.15,
        south: 12.83,
        east: 77.78,
        west: 77.45,
      },
      forceRefresh: true,
    });

    // Delhi venue strictly excluded by city bounds
    expect(session.items.length).toBe(1);
    expect(session.items[0].place_id).toBe("in_bengaluru");
  });
});
