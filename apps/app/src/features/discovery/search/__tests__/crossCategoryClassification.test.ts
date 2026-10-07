import { describe, it, expect, beforeEach, vi } from "vitest";
import { SearchCoordinator } from "../session/searchCoordinator";
import { searchProviderRegistry } from "../providers/providerRegistry";
import { ISearchProvider, ProviderCandidateResult, SearchStrategy } from "../types/provider";
import { planlessRelevanceEngine } from "../engine/relevanceEngine";
import { understandQuery } from "../engine/queryUnderstanding";
import { normalizeCandidate } from "../engine/normalizer";
import {
  isAuthenticDiningVenue,
  isPlayableSportsVenue,
  isAuthenticActivityVenue,
  classifyVenueCategory,
} from "../../services/venueRelevance";
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

class MockGooglePlacesProvider implements ISearchProvider {
  readonly id = "GOOGLE_PLACES" as const;
  public candidateBatches: Record<string, ProviderCandidateResult> = {};
  public defaultCandidates: any[] = [];

  async search(strategy: SearchStrategy): Promise<ProviderCandidateResult> {
    const query = strategy.query || "";
    if (this.candidateBatches[query]) {
      return this.candidateBatches[query];
    }
    return {
      candidates: this.defaultCandidates,
      nextPageToken: null,
    };
  }
}

describe("Cross-Category Classification & Search Relevance Isolation", () => {
  let coordinator: SearchCoordinator;
  let mockProvider: MockGooglePlacesProvider;

  beforeEach(() => {
    clearPlaceOverridesCache();
    coordinator = new SearchCoordinator();
    mockProvider = new MockGooglePlacesProvider();
    searchProviderRegistry.register(mockProvider);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SPECIFIC PLACE SEARCHES (User-required verification queries)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("User Verification Queries: 'rush koland', 'rush football academy', 'bengaluru turf inc', 'truffles', 'third wave coffee', 'amoeba bowling'", () => {
    it("'rush koland' classifies strictly as Sports and is rejected from Dining and Activities", async () => {
      const rushKolandCandidate = {
        place_id: "place_rush_koland",
        name: "Rush Koland",
        title: "Rush Koland",
        types: ["sports_complex", "point_of_interest", "establishment"],
      };

      mockProvider.candidateBatches["rush koland"] = {
        candidates: [rushKolandCandidate],
        nextPageToken: null,
      };

      // 1. Dining Search -> MUST BE EMPTY
      const diningResult = await coordinator.executeSearch("rush koland", {
        category: "DINING",
        forceRefresh: true,
      });
      expect(diningResult.items).toHaveLength(0);

      // 2. Activities Search -> MUST BE EMPTY
      const activitiesResult = await coordinator.executeSearch("rush koland", {
        category: "ACTIVITIES",
        forceRefresh: true,
      });
      expect(activitiesResult.items).toHaveLength(0);

      // 3. Sports Search -> MUST BE PRESENT
      const sportsResult = await coordinator.executeSearch("rush koland", {
        category: "SPORTS",
        forceRefresh: true,
      });
      expect(sportsResult.items).toHaveLength(1);
      expect(sportsResult.items[0].title).toBe("Rush Koland");
      expect(sportsResult.items[0].category).toBe("SPORTS");
      expect(sportsResult.items[0].displayLabel).not.toBe("Dining Venue");
    });

    it("'rush football academy' classifies strictly as Sports and is rejected from Dining and Activities", async () => {
      const rushAcademyCandidate = {
        place_id: "place_rush_academy",
        name: "Rush Football Academy - Hennur",
        title: "Rush Football Academy - Hennur",
        types: ["sports_complex", "point_of_interest", "establishment"],
      };

      mockProvider.candidateBatches["rush football academy"] = {
        candidates: [rushAcademyCandidate],
        nextPageToken: null,
      };

      // Dining Search -> rejected
      const diningResult = await coordinator.executeSearch("rush football academy", {
        category: "DINING",
        forceRefresh: true,
      });
      expect(diningResult.items).toHaveLength(0);

      // Activities Search -> rejected
      const activitiesResult = await coordinator.executeSearch("rush football academy", {
        category: "ACTIVITIES",
        forceRefresh: true,
      });
      expect(activitiesResult.items).toHaveLength(0);

      // Sports Search -> accepted with football label
      const sportsResult = await coordinator.executeSearch("rush football academy", {
        category: "SPORTS",
        forceRefresh: true,
      });
      expect(sportsResult.items).toHaveLength(1);
      expect(sportsResult.items[0].title).toBe("Rush Football Academy - Hennur");
      expect(sportsResult.items[0].category).toBe("SPORTS");
      expect(sportsResult.items[0].displayLabel).toBe("Football");
    });

    it("'bengaluru turf inc' classifies strictly as Sports and is rejected from Dining and Activities", async () => {
      const turfCandidate = {
        place_id: "place_bengaluru_turf",
        name: "Bengaluru Turf Inc",
        title: "Bengaluru Turf Inc",
        types: ["athletic_field", "point_of_interest", "establishment"],
      };

      mockProvider.candidateBatches["bengaluru turf inc"] = {
        candidates: [turfCandidate],
        nextPageToken: null,
      };

      const diningResult = await coordinator.executeSearch("bengaluru turf inc", {
        category: "DINING",
        forceRefresh: true,
      });
      expect(diningResult.items).toHaveLength(0);

      const activitiesResult = await coordinator.executeSearch("bengaluru turf inc", {
        category: "ACTIVITIES",
        forceRefresh: true,
      });
      expect(activitiesResult.items).toHaveLength(0);

      const sportsResult = await coordinator.executeSearch("bengaluru turf inc", {
        category: "SPORTS",
        forceRefresh: true,
      });
      expect(sportsResult.items).toHaveLength(1);
      expect(sportsResult.items[0].category).toBe("SPORTS");
      expect(sportsResult.items[0].displayLabel).toBe("Football");
    });

    it("'truffles' classifies strictly as Dining and is rejected from Sports and Activities", async () => {
      const trufflesCandidate = {
        place_id: "place_truffles_koramangala",
        name: "Truffles",
        title: "Truffles",
        types: ["restaurant", "point_of_interest", "establishment"],
      };

      mockProvider.candidateBatches["truffles"] = {
        candidates: [trufflesCandidate],
        nextPageToken: null,
      };

      // Sports Search -> rejected
      const sportsResult = await coordinator.executeSearch("truffles", {
        category: "SPORTS",
        forceRefresh: true,
      });
      expect(sportsResult.items).toHaveLength(0);

      // Activities Search -> rejected
      const activitiesResult = await coordinator.executeSearch("truffles", {
        category: "ACTIVITIES",
        forceRefresh: true,
      });
      expect(activitiesResult.items).toHaveLength(0);

      // Dining Search -> accepted
      const diningResult = await coordinator.executeSearch("truffles", {
        category: "DINING",
        forceRefresh: true,
      });
      expect(diningResult.items).toHaveLength(1);
      expect(diningResult.items[0].title).toBe("Truffles");
      expect(diningResult.items[0].category).toBe("DINING");
      expect(diningResult.items[0].displayLabel).toBe("Restaurant");
    });

    it("'third wave coffee' classifies strictly as Dining and is rejected from Sports and Activities", async () => {
      const coffeeCandidate = {
        place_id: "place_third_wave",
        name: "Third Wave Coffee",
        title: "Third Wave Coffee",
        types: ["cafe", "point_of_interest", "establishment"],
      };

      mockProvider.candidateBatches["third wave coffee"] = {
        candidates: [coffeeCandidate],
        nextPageToken: null,
      };

      const sportsResult = await coordinator.executeSearch("third wave coffee", {
        category: "SPORTS",
        forceRefresh: true,
      });
      expect(sportsResult.items).toHaveLength(0);

      const activitiesResult = await coordinator.executeSearch("third wave coffee", {
        category: "ACTIVITIES",
        forceRefresh: true,
      });
      expect(activitiesResult.items).toHaveLength(0);

      const diningResult = await coordinator.executeSearch("third wave coffee", {
        category: "DINING",
        forceRefresh: true,
      });
      expect(diningResult.items).toHaveLength(1);
      expect(diningResult.items[0].category).toBe("DINING");
      expect(diningResult.items[0].displayLabel).toBe("Cafe");
    });

    it("'amoeba bowling' classifies strictly as Activities and is rejected from Sports and Dining", async () => {
      const amoebaCandidate = {
        place_id: "place_amoeba_bowling",
        name: "Amoeba Bowling",
        title: "Amoeba Bowling",
        types: ["bowling_alley", "point_of_interest", "establishment"],
      };

      mockProvider.candidateBatches["amoeba bowling"] = {
        candidates: [amoebaCandidate],
        nextPageToken: null,
      };

      const sportsResult = await coordinator.executeSearch("amoeba bowling", {
        category: "SPORTS",
        forceRefresh: true,
      });
      expect(sportsResult.items).toHaveLength(0);

      const diningResult = await coordinator.executeSearch("amoeba bowling", {
        category: "DINING",
        forceRefresh: true,
      });
      expect(diningResult.items).toHaveLength(0);

      const activitiesResult = await coordinator.executeSearch("amoeba bowling", {
        category: "ACTIVITIES",
        forceRefresh: true,
      });
      expect(activitiesResult.items).toHaveLength(1);
      expect(activitiesResult.items[0].category).toBe("ACTIVITIES");
      expect(activitiesResult.items[0].displayLabel).toBe("Bowling Alley");
    });

    it("'matchday' with landmark address 'opposite Paradise Biryani' classifies strictly as Sports and is rejected from Dining and Activities", async () => {
      const matchdayCandidate = {
        place_id: "place_matchday",
        name: "Matchday",
        title: "Matchday",
        types: ["establishment", "point_of_interest"],
        vicinity: "47, New BEL Rd, opposite Paradise Biryani, Ramakrishna Gardens, Bengaluru",
        formatted_address: "47, New BEL Rd, opposite Paradise Biryani, Ramakrishna Gardens, Bengaluru",
      };

      mockProvider.candidateBatches["matchday"] = {
        candidates: [matchdayCandidate],
        nextPageToken: null,
      };

      // 1. Dining Search -> MUST BE EMPTY (Must NOT match "biryani" landmark from address)
      const diningResult = await coordinator.executeSearch("matchday", {
        category: "DINING",
        forceRefresh: true,
      });
      expect(diningResult.items).toHaveLength(0);

      // 2. Activities Search -> MUST BE EMPTY
      const activitiesResult = await coordinator.executeSearch("matchday", {
        category: "ACTIVITIES",
        forceRefresh: true,
      });
      expect(activitiesResult.items).toHaveLength(0);

      // 3. Sports Search -> MUST BE PRESENT
      const sportsResult = await coordinator.executeSearch("matchday", {
        category: "SPORTS",
        forceRefresh: true,
      });
      expect(sportsResult.items).toHaveLength(1);
      expect(sportsResult.items[0].title).toBe("Matchday");
      expect(sportsResult.items[0].category).toBe("SPORTS");
      expect(sportsResult.items[0].displayLabel).toBe("Sports Facility");
      expect(sportsResult.items[0].displayLabel).not.toBe("Dining Venue");
    });

    it("'match day' (with space) matches 'Matchday' via whitespace-collapsed text matching", async () => {
      const matchdayCandidate = {
        place_id: "place_matchday",
        name: "Matchday",
        title: "Matchday",
        types: ["establishment", "point_of_interest"],
        vicinity: "47, New BEL Rd, AG's Layout, Bengaluru",
      };

      mockProvider.candidateBatches["match day"] = {
        candidates: [matchdayCandidate],
        nextPageToken: null,
      };

      const result = await coordinator.executeSearch("match day", {
        category: "SPORTS",
        forceRefresh: true,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Matchday");
      expect(result.items[0].category).toBe("SPORTS");
    });

    it("'match' (prefix) matches 'Matchday' via prefix brand matching and ranks it at #1", async () => {
      const matchdayCandidate = {
        place_id: "place_matchday",
        name: "Matchday",
        title: "Matchday",
        types: ["establishment", "point_of_interest"],
        vicinity: "47, New BEL Rd, AG's Layout, Bengaluru",
      };

      mockProvider.candidateBatches["match"] = {
        candidates: [matchdayCandidate],
        nextPageToken: null,
      };

      const result = await coordinator.executeSearch("match", {
        category: "SPORTS",
        forceRefresh: true,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Matchday");
      expect(result.items[0].category).toBe("SPORTS");
    });

    it("'toughx' searches directly with user text without generic category query expansion", async () => {
      const toughxCandidate = {
        place_id: "place_toughx",
        name: "ToughX Sports Arena",
        title: "ToughX Sports Arena",
        types: ["sports_complex", "point_of_interest"],
        vicinity: "HSR Layout, Bengaluru",
      };

      mockProvider.candidateBatches["toughx"] = {
        candidates: [toughxCandidate],
        nextPageToken: null,
      };

      const result = await coordinator.executeSearch("toughx", {
        category: "SPORTS",
        forceRefresh: true,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("ToughX Sports Arena");
      expect(result.items[0].category).toBe("SPORTS");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. REGRESSION REQUIREMENT: Generic establishment / point_of_interest
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Generic Google Types: 'establishment' and 'point_of_interest' are never sufficient evidence", () => {
    it("generic establishment without dining types or keywords does NOT qualify for Dining", () => {
      const genericPlace = {
        title: "Apex Technologies Solutions",
        name: "Apex Technologies Solutions",
        types: ["point_of_interest", "establishment"],
      };

      expect(isAuthenticDiningVenue(genericPlace)).toBe(false);
      expect(classifyVenueCategory(genericPlace)).toBeNull();

      const item = normalizeCandidate(
        { place_id: "generic_1", ...genericPlace },
        { category: "DINING" }
      );
      const query = understandQuery("apex technologies", "DINING");
      const evaluation = planlessRelevanceEngine.evaluate(item, query);

      expect(evaluation.isRelevant).toBe(false);
    });

    it("generic place with establishment does not pass Activities or Sports without evidence", () => {
      const officePlace = {
        title: "Bangalore Logistics Centre",
        name: "Bangalore Logistics Centre",
        types: ["point_of_interest", "establishment"],
      };

      expect(isPlayableSportsVenue(officePlace)).toBe(false);
      expect(isAuthenticActivityVenue(officePlace)).toBe(false);
      expect(classifyVenueCategory(officePlace)).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. REGRESSION REQUIREMENT: Global All Search Category Isolation
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Global All Search category relevance consistency and count matching", () => {
    it("All search assigns places to their true categories and does not cross-contaminate counts", async () => {
      // Simulate Global Search (as in MasterSearchScreen) searching "rush koland"
      const rawCandidates = [
        {
          place_id: "rk_1",
          name: "Rush Koland",
          title: "Rush Koland",
          types: ["sports_complex", "point_of_interest", "establishment"],
        },
        {
          place_id: "rk_2",
          name: "Rush Football Academy - Hennur",
          title: "Rush Football Academy - Hennur",
          types: ["sports_complex", "point_of_interest", "establishment"],
        },
      ];

      mockProvider.candidateBatches["rush koland"] = {
        candidates: rawCandidates,
        nextPageToken: null,
      };

      // MasterSearchScreen executes searches concurrently for DINING, SPORTS, ACTIVITIES, MOVIES
      const [diningRes, sportsRes, activitiesRes] = await Promise.all([
        coordinator.executeSearch("rush koland", { category: "DINING", forceRefresh: true }),
        coordinator.executeSearch("rush koland", { category: "SPORTS", forceRefresh: true }),
        coordinator.executeSearch("rush koland", { category: "ACTIVITIES", forceRefresh: true }),
      ]);

      // Dining must receive 0 items
      expect(diningRes.items).toHaveLength(0);
      // Activities must receive 0 items
      expect(activitiesRes.items).toHaveLength(0);
      // Sports must receive exactly 2 items
      expect(sportsRes.items).toHaveLength(2);

      // Verify category counts match the actual filtered results:
      // Dining count = 0, Sports count = 2, Activities count = 0, Total = 2 (NOT 6!)
      const diningCount = diningRes.items.length;
      const sportsCount = sportsRes.items.length;
      const activitiesCount = activitiesRes.items.length;
      const totalCount = diningCount + sportsCount + activitiesCount;

      expect(diningCount).toBe(0);
      expect(activitiesCount).toBe(0);
      expect(sportsCount).toBe(2);
      expect(totalCount).toBe(2);
    });

    it("evaluating candidate in Global ALL search assigns single authentic category", () => {
      const sportVenue = normalizeCandidate({
        place_id: "sport_1",
        name: "Play Arena Football Turf",
        title: "Play Arena Football Turf",
        types: ["sports_complex", "athletic_field"],
      });

      const diningVenue = normalizeCandidate({
        place_id: "dine_1",
        name: "Corner House Ice Cream",
        title: "Corner House Ice Cream",
        types: ["bakery", "restaurant"],
      });

      const allQuery = understandQuery("", "ALL");

      const sportEval = planlessRelevanceEngine.evaluate(sportVenue, allQuery);
      expect(sportEval.isRelevant).toBe(true);
      expect(sportEval.assignedCategory).toBe("SPORTS");

      const diningEval = planlessRelevanceEngine.evaluate(diningVenue, allQuery);
      expect(diningEval.isRelevant).toBe(true);
      expect(diningEval.assignedCategory).toBe("DINING");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. MULTI-CATEGORY VALIDATION: Genuine multi-category satisfaction
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Multi-category venues genuine qualification", () => {
    it("a bowling alley with a restaurant genuinely satisfies both Activities and Dining", async () => {
      const multiVenue = {
        place_id: "smaaash_1",
        name: "Smaaash Bowling & Sports Bar Diner",
        title: "Smaaash Bowling & Sports Bar Diner",
        types: ["bowling_alley", "restaurant", "bar"],
      };

      mockProvider.candidateBatches["smaaash"] = {
        candidates: [multiVenue],
        nextPageToken: null,
      };

      const diningResult = await coordinator.executeSearch("smaaash", {
        category: "DINING",
        forceRefresh: true,
      });
      const activitiesResult = await coordinator.executeSearch("smaaash", {
        category: "ACTIVITIES",
        forceRefresh: true,
      });

      expect(diningResult.items).toHaveLength(1);
      expect(activitiesResult.items).toHaveLength(1);
    });
  });
});
