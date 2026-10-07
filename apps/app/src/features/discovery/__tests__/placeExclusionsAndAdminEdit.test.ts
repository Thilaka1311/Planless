import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyPlaceOverrides,
  hidePlace,
  savePlaceOverride,
  subscribePlaceOverrides,
  fetchPlaceOverrides,
} from "../services/placeOverridesService";
import { supabase, SUPABASE_URL } from "../../../../lib/supabaseClient";

vi.mock("../../../../lib/supabaseClient", () => {
  const mockFrom = vi.fn();
  const mockFunctions = {
    invoke: vi.fn(),
  };
  return {
    supabase: {
      from: mockFrom,
      functions: mockFunctions,
    },
    SUPABASE_URL: "https://test.supabase.co",
  };
});

describe("Planless Place Exclusion and Admin Hold-to-Edit System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Place Overrides & Exclusion Filtering (discovery_place_overrides)", () => {
    it("completely filters out any Google Places item where is_deleted === true", async () => {
      // Mock Supabase returning overrides: one deleted, one non-deleted
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [
            {
              place_id: "place_hidden_123",
              is_deleted: true,
              subcategory: null,
            },
            {
              place_id: "place_active_456",
              name_override: "Super Turf Koramangala",
              is_deleted: false,
              subcategory: null,
            },
          ],
          error: null,
        }),
      });

      const testItems = [
        {
          id: "place_place_hidden_123",
          place_id: "place_hidden_123",
          category: "SPORTS",
          title: "Bad Turf",
          place_address: "Koramangala",
        },
        {
          id: "place_place_active_456",
          place_id: "place_active_456",
          category: "SPORTS",
          title: "Original Turf Name",
          place_address: "Koramangala",
        },
        {
          id: "place_other_789",
          place_id: "place_other_789",
          category: "DINING",
          title: "Truffles",
          place_address: "St Marks Road",
        },
      ];

      const filtered = await applyPlaceOverrides(testItems, true);

      // The deleted place MUST be completely removed from results
      expect(filtered.some((i) => i.place_id === "place_hidden_123")).toBe(false);
      expect(filtered.length).toBe(2);

      // Non-deleted override must have applied its name override
      const activeItem = filtered.find((i) => i.place_id === "place_active_456");
      expect(activeItem).toBeDefined();
      expect(activeItem?.title).toBe("Super Turf Koramangala");

      // Other item remains unaffected
      const otherItem = filtered.find((i) => i.place_id === "place_other_789");
      expect(otherItem).toBeDefined();
      expect(otherItem?.title).toBe("Truffles");
    });

    it("never filters out or modifies TMDB Movies, even if ID matches an exclusion", async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [
            {
              place_id: "movie_550",
              is_deleted: true,
              subcategory: null,
            },
          ],
          error: null,
        }),
      });

      const movieItems = [
        {
          id: "movie_550",
          category: "MOVIES",
          provider: "tmdb",
          title: "Fight Club",
          place_address: "Cinemas",
        },
      ];

      const result = await applyPlaceOverrides(movieItems, true);

      // Movies MUST remain untouched
      expect(result.length).toBe(1);
      expect(result[0].title).toBe("Fight Club");
    });

    it("correctly applies photo, address, and description overrides", async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [
            {
              place_id: "place_curated_1",
              name_override: "Curated Cafe",
              address_override: "100ft Road, Indiranagar",
              description_override: "Specialty coffee and manual brews",
              google_photo_reference: "g_photo_ref_xyz",
              is_deleted: false,
              subcategory: "CAFE",
            },
          ],
          error: null,
        }),
      });

      const items = [
        {
          id: "place_place_curated_1",
          place_id: "place_curated_1",
          category: "DINING",
          title: "Old Cafe Name",
          place_address: "Old Address",
          description: "Old description",
          cover_image_url: "https://old.url/image.jpg",
        },
      ];

      const result = await applyPlaceOverrides(items, true);
      expect(result.length).toBe(1);
      const item = result[0];

      expect(item.title).toBe("Curated Cafe");
      expect(item.place_address).toBe("100ft Road, Indiranagar");
      expect(item.description).toBe("Specialty coffee and manual brews");
      expect(item.cover_image_url).toContain("photo_reference=g_photo_ref_xyz");
    });
  });

  describe("2. Admin Hide / Exclude Place Action", () => {
    it("calls Supabase upsert with is_deleted = true and onConflict on place_id,subcategory", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      (supabase.from as any).mockReturnValue({
        upsert: mockUpsert,
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      });

      let listenerFired = false;
      const unsubscribe = subscribePlaceOverrides(({ action, placeId }) => {
        if (action === "hide" && placeId === "target_place_to_hide") {
          listenerFired = true;
        }
      });

      await hidePlace("target_place_to_hide");

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          place_id: "target_place_to_hide",
          is_deleted: true,
        }),
        { onConflict: "place_id" }
      );

      expect(listenerFired).toBe(true);
      unsubscribe();
    });

    it("immediately reflects in subsequent applyPlaceOverrides calls without waiting for network re-fetch", async () => {
      (supabase.from as any).mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      });

      await hidePlace("instant_hidden_venue");

      const items = [
        {
          id: "place_instant_hidden_venue",
          place_id: "instant_hidden_venue",
          category: "ACTIVITIES",
          title: "Escape Room",
        },
      ];

      const filtered = await applyPlaceOverrides(items, false);
      expect(filtered.length).toBe(0);
    });
  });

  describe("3. Admin Save Place Override Action", () => {
    it("saves field overrides with is_deleted = false and notifies listeners", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          place_id: "edited_place_1",
          name_override: "New Place Name",
          is_deleted: false,
        },
        error: null,
      });

      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });

      (supabase.from as any).mockReturnValue({
        upsert: mockUpsert,
      });

      let saveListenerFired = false;
      const unsubscribe = subscribePlaceOverrides(({ action, placeId }) => {
        if (action === "save" && placeId === "edited_place_1") {
          saveListenerFired = true;
        }
      });

      await savePlaceOverride("edited_place_1", {
        name_override: "New Place Name",
        address_override: "New Address",
      });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          place_id: "edited_place_1",
          name_override: "New Place Name",
          address_override: "New Address",
          is_deleted: false,
        }),
        { onConflict: "place_id" }
      );

      expect(saveListenerFired).toBe(true);
      unsubscribe();
    });
  });

  describe("4. Search Coordinator Exclusion & Realtime Purging", () => {
    it("purges hidden place from searchCoordinator active session upon hidePlace event", async () => {
      const { searchCoordinator } = await import("../search/session/searchCoordinator");

      (supabase.from as any).mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      });

      // Populate currentSession with a candidate
      (searchCoordinator as any).currentSession = {
        sessionId: "test_session",
        items: [
          { place_id: "place_to_purge_99", title: "Target Place" },
          { place_id: "place_to_keep_100", title: "Good Place" },
        ],
        seenPlaceIds: new Set(["place_to_purge_99", "place_to_keep_100"]),
      };

      // Hide the target place
      await hidePlace("place_to_purge_99");

      // Verify the target place was purged from currentSession
      const session = (searchCoordinator as any).currentSession;
      expect(session.items.some((i: any) => i.place_id === "place_to_purge_99")).toBe(false);
      expect(session.items.length).toBe(1);
      expect(session.items[0].place_id).toBe("place_to_keep_100");
    });
  });
});
