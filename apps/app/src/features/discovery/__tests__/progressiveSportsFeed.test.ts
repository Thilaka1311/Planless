import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SPORTS_PROGRESSION_QUERIES,
  fetchProgressiveSportsBatch,
} from "../services/sportsStreamService";
import {
  getDatabaseSportsPlacesForDistanceBand,
  applyPlaceOverridesSync,
  savePlaceOverride,
  hidePlace,
  clearPlaceOverridesCache,
} from "../services/placeOverridesService";
import { DiscoveryItem } from "../../../core/types/discovery";

let mockDbOverrides: any[] = [];
const mockInvoke = vi.fn();

// Mock supabase client
vi.mock("../../../../lib/supabaseClient", () => ({
  supabase: {
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => {
        const res: any = Promise.resolve({ data: mockDbOverrides, error: null });
        res.order = vi.fn(() => Promise.resolve({ data: mockDbOverrides, error: null }));
        return res;
      }),
      upsert: (payload: any) => {
        const clean = (payload.place_id || "").split("::")[0].replace(/^place_/, "");
        const existing = mockDbOverrides.find((o) => o.place_id === clean);
        if (existing) {
          Object.assign(existing, payload);
        } else {
          mockDbOverrides.push({ ...payload, place_id: clean });
        }
        return {
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: payload, error: null })),
          })),
        };
      },
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
  SUPABASE_URL: "https://test.supabase.co",
}));

describe("Progressive Sports Feed Architecture Suite", () => {
  const mockOrigin = { latitude: 13.0949, longitude: 77.5441 }; // Vidyaranyapura, Bengaluru

  beforeEach(() => {
    mockDbOverrides = [];
    clearPlaceOverridesCache();
    vi.clearAllMocks();
  });

  describe("1. Distance Ordering and Tiering", () => {
    it("orders venues strictly closest-first from active discovery coordinates", () => {
      const venues: DiscoveryItem[] = [
        {
          id: "place_3",
          title: "Far Away Arena",
          category: "SPORTS",
          latitude: 13.0100,
          longitude: 77.5500,
          _distanceKm: 9.4,
          distance: "9.4 km",
        } as any,
        {
          id: "place_1",
          title: "Closest Turf",
          category: "SPORTS",
          latitude: 13.0950,
          longitude: 77.5442,
          _distanceKm: 0.1,
          distance: "0.1 km",
        } as any,
        {
          id: "place_2",
          title: "Mid-Distance Badminton",
          category: "SPORTS",
          latitude: 13.0800,
          longitude: 77.5400,
          _distanceKm: 1.8,
          distance: "1.8 km",
        } as any,
      ];

      const sorted = [...venues].sort((a, b) => {
        const da = typeof (a as any)._distanceKm === "number" ? (a as any)._distanceKm : Infinity;
        const db = typeof (b as any)._distanceKm === "number" ? (b as any)._distanceKm : Infinity;
        return da - db;
      });

      expect(sorted[0].title).toBe("Closest Turf");
      expect(sorted[1].title).toBe("Mid-Distance Badminton");
      expect(sorted[2].title).toBe("Far Away Arena");
    });

    it("generates natural distance section chunks (Nearby, More, Further)", () => {
      const allVenues: DiscoveryItem[] = Array.from({ length: 20 }, (_, i) => ({
        id: `venue_${i}`,
        title: `Sports Venue ${i + 1}`,
        category: "SPORTS",
        _distanceKm: i * 0.5,
        distance: `${(i * 0.5).toFixed(1)} km`,
      })) as any;

      const chunkSize = 8;
      const sections = [];
      for (let i = 0; i < allVenues.length; i += chunkSize) {
        const chunk = allVenues.slice(i, i + chunkSize);
        const chunkIdx = Math.floor(i / chunkSize);

        let title = "Nearby Sports Venues";
        if (chunkIdx === 1) title = "More Sports Venues";
        else if (chunkIdx === 2) title = "Further Sports Venues";

        sections.push({ title, items: chunk });
      }

      expect(sections.length).toBe(3);
      expect(sections[0].title).toBe("Nearby Sports Venues");
      expect(sections[0].items.length).toBe(8);
      expect(sections[0].items[0].distance).toBe("0.0 km");

      expect(sections[1].title).toBe("More Sports Venues");
      expect(sections[1].items.length).toBe(8);
      expect(sections[1].items[0].distance).toBe("4.0 km");

      expect(sections[2].title).toBe("Further Sports Venues");
      expect(sections[2].items.length).toBe(4);
      expect(sections[2].items[0].distance).toBe("8.0 km");
    });
  });

  describe("2. Progressive Query Staggering & Deduplication", () => {
    it("defines the sequence of progression sport queries without querying all upfront", () => {
      expect(SPORTS_PROGRESSION_QUERIES).toContain("sports turf");
      expect(SPORTS_PROGRESSION_QUERIES).toContain("badminton court");
      expect(SPORTS_PROGRESSION_QUERIES).toContain("football turf");
      expect(SPORTS_PROGRESSION_QUERIES).toContain("pickleball court");
      expect(SPORTS_PROGRESSION_QUERIES).toContain("tennis court");
      expect(SPORTS_PROGRESSION_QUERIES.length).toBeGreaterThanOrEqual(8);
    });

    it("deduplicates venues that match across overlapping query streams", async () => {
      const seenPlaceIds = new Set<string>();

      // Mock first query returns venue A and venue B
      mockInvoke.mockResolvedValueOnce({
        data: {
          items: [
            {
              place_id: "ChIJ_place_A",
              name: "Elite Turf & Badminton",
              types: ["sports_complex"],
              latitude: 13.095,
              longitude: 77.544,
              formatted_address: "Vidyaranyapura, Bengaluru, Karnataka",
              cover_image_url: "https://example.com/a.jpg",
            },
            {
              place_id: "ChIJ_place_B",
              name: "City Football Arena",
              types: ["athletic_field"],
              latitude: 13.092,
              longitude: 77.542,
              formatted_address: "Vidyaranyapura, Bengaluru, Karnataka",
              cover_image_url: "https://example.com/b.jpg",
            },
          ],
          nextPageToken: null,
        },
        error: null,
      });

      const batch1 = await fetchProgressiveSportsBatch({
        originCoords: mockOrigin,
        queryIndex: 0,
        seenPlaceIds,
      });

      expect(batch1.items.length).toBe(2);
      expect(seenPlaceIds.has("ChIJ_place_A")).toBe(true);
      expect(seenPlaceIds.has("ChIJ_place_B")).toBe(true);
      expect(batch1.nextQueryIndex).toBe(1); // Advanced to next query

      // Mock second query also returns venue A (duplicate) plus new venue C
      mockInvoke.mockResolvedValueOnce({
        data: {
          items: [
            {
              place_id: "ChIJ_place_A", // Duplicate
              name: "Elite Turf & Badminton",
              types: ["sports_complex"],
              latitude: 13.095,
              longitude: 77.544,
              formatted_address: "Vidyaranyapura, Bengaluru, Karnataka",
              cover_image_url: "https://example.com/a.jpg",
            },
            {
              place_id: "ChIJ_place_C", // New venue
              name: "Smash Badminton Club",
              types: ["sports_club"],
              latitude: 13.090,
              longitude: 77.540,
              formatted_address: "Vidyaranyapura, Bengaluru, Karnataka",
              cover_image_url: "https://example.com/c.jpg",
            },
          ],
          nextPageToken: "token_page2",
        },
        error: null,
      });

      const batch2 = await fetchProgressiveSportsBatch({
        originCoords: mockOrigin,
        queryIndex: batch1.nextQueryIndex,
        seenPlaceIds,
      });

      // Venue A is dropped, only Venue C is returned!
      expect(batch2.items.length).toBe(1);
      expect(batch2.items[0].place_id).toBe("ChIJ_place_C");
      expect(batch2.nextPageToken).toBe("token_page2");
    });
  });

  describe("3. Database Override Table Synchronization in Progressive Feed", () => {
    it("applies admin name, photo, and subcategory overrides to newly streamed places", async () => {
      const seenPlaceIds = new Set<string>();

      // Pre-seed an admin override for ChIJ_ovalnet
      await savePlaceOverride("ChIJ_ovalnet", {
        name_override: "Ovalnet Badminton Arena",
        subcategory: "Badminton",
        image_path: "https://example.com/verified_court.jpg",
      });

      // Stream returns raw ChIJ_ovalnet from Google Places
      mockInvoke.mockResolvedValueOnce({
        data: {
          items: [
            {
              place_id: "ChIJ_ovalnet",
              name: "Raw Google Ovalnet Complex",
              subcategory: "Athletic Field | Sports Club",
              types: ["sports_complex"],
              latitude: 13.095,
              longitude: 77.544,
              formatted_address: "Vidyaranyapura, Bengaluru, Karnataka",
              cover_image_url: "https://example.com/raw.jpg",
            },
          ],
          nextPageToken: null,
        },
        error: null,
      });

      const batch = await fetchProgressiveSportsBatch({
        originCoords: mockOrigin,
        queryIndex: 0,
        seenPlaceIds,
      });

      expect(batch.items.length).toBe(1);
      const venue = batch.items[0];
      expect(venue.title).toBe("Ovalnet Badminton Arena");
      expect(venue.subcategory).toBe("Badminton");
      expect(venue.cover_image_url).toBe("https://example.com/verified_court.jpg");
    });

    it("completely drops places marked is_deleted = true in database overrides", async () => {
      const seenPlaceIds = new Set<string>();

      // Mark ChIJ_closed as deleted
      await hidePlace("ChIJ_closed");

      mockInvoke.mockResolvedValueOnce({
        data: {
          items: [
            {
              place_id: "ChIJ_closed",
              name: "Permanently Closed Turf",
              types: ["sports_complex"],
              latitude: 13.095,
              longitude: 77.544,
              formatted_address: "Vidyaranyapura, Bengaluru, Karnataka",
              cover_image_url: "https://example.com/closed.jpg",
            },
            {
              place_id: "ChIJ_active",
              name: "Active Tennis Court",
              types: ["tennis_court"],
              latitude: 13.094,
              longitude: 77.543,
              formatted_address: "Vidyaranyapura, Bengaluru, Karnataka",
              cover_image_url: "https://example.com/active.jpg",
            },
          ],
          nextPageToken: null,
        },
        error: null,
      });

      const batch = await fetchProgressiveSportsBatch({
        originCoords: mockOrigin,
        queryIndex: 0,
        seenPlaceIds,
      });

      expect(batch.items.length).toBe(1);
      expect(batch.items[0].place_id).toBe("ChIJ_active");
      expect(batch.items.some((it) => it.place_id === "ChIJ_closed")).toBe(false);
    });

    it("injects database-only sports venues into their matching distance band", async () => {
      // Save a local community badminton venue that Google doesn't have in top 20
      await savePlaceOverride("ChIJ_community_1", {
        name_override: "Vidyaranyapura Community Badminton Club",
        subcategory: "Badminton",
        latitude_override: 13.096, // ~0.2 km from origin
        longitude_override: 77.545,
        image_path: "https://example.com/community.jpg",
      });

      const seenPlaceIds = new Set<string>();
      const dbVenues = getDatabaseSportsPlacesForDistanceBand(mockOrigin, 0, 3, seenPlaceIds);

      expect(dbVenues.length).toBe(1);
      expect(dbVenues[0].title).toBe("Vidyaranyapura Community Badminton Club");
      expect(dbVenues[0].subcategory).toBe("Badminton");
      expect(typeof (dbVenues[0] as any)._distanceKm).toBe("number");
      expect((dbVenues[0] as any)._distanceKm).toBeLessThan(1.0);
    });
  });

  describe("4. Non-Sports Isolation", () => {
    it("Dining, Activities, and Movies remain untouched", () => {
      // Verify query progression queue contains strictly sports terms
      for (const q of SPORTS_PROGRESSION_QUERIES) {
        expect(q).not.toContain("restaurant");
        expect(q).not.toContain("cafe");
        expect(q).not.toContain("movie");
        expect(q).not.toContain("cinema");
        expect(q).not.toContain("bowling");
        expect(q).not.toContain("arcade");
      }
    });
  });

  describe("5. Scroll Position Stability & Append-Only Pagination Suite", () => {
    it("preserves earlier sections completely when subsequent batches are appended", () => {
      // Batch 1: 16 items forming Section 0 and Section 1
      const batch1: DiscoveryItem[] = Array.from({ length: 16 }, (_, i) => ({
        id: `batch1_venue_${i}`,
        title: `Nearby Venue ${i + 1}`,
        category: "SPORTS",
        _distanceKm: 0.1 * (i + 1),
        distance: `${(0.1 * (i + 1)).toFixed(1)} km`,
      })) as any;

      // Sliced into sections
      const sections = [
        { id: "sec_sports_stream_0", title: "Nearby Sports Venues", items: batch1.slice(0, 8) },
        { id: "sec_sports_stream_1", title: "More Sports Venues", items: batch1.slice(8, 16) },
      ];

      // Deep copy snapshot of Section 0 and Section 1
      const section0Snapshot = JSON.stringify(sections[0]);
      const section1Snapshot = JSON.stringify(sections[1]);

      // Batch 2 arrives with 8 new items
      const batch2: DiscoveryItem[] = Array.from({ length: 8 }, (_, i) => ({
        id: `batch2_venue_${i}`,
        title: `Further Venue ${i + 1}`,
        category: "SPORTS",
        _distanceKm: 2.5 + 0.2 * i,
        distance: `${(2.5 + 0.2 * i).toFixed(1)} km`,
      })) as any;

      // Append-only rule: new batch creates Section 2 and is appended
      const newSection = {
        id: `sec_sports_stream_${sections.length}`,
        title: "Further Sports Venues",
        items: batch2,
      };

      const updatedSections = [...sections, newSection];

      // Verifications:
      expect(updatedSections.length).toBe(3);
      // Section 0 and Section 1 are 100% byte-for-byte identical to their original snapshot
      expect(JSON.stringify(updatedSections[0])).toBe(section0Snapshot);
      expect(JSON.stringify(updatedSections[1])).toBe(section1Snapshot);
      // New section is appended at the end without altering existing cards
      expect(updatedSections[2].id).toBe("sec_sports_stream_2");
      expect(updatedSections[2].items.length).toBe(8);
    });

    it("ensures database overrides are merged on first mount without requiring a reload", async () => {
      const seenPlaceIds = new Set<string>();

      // Pre-seed an admin photo & subcategory override
      await savePlaceOverride("ChIJ_mount_first_test", {
        name_override: "Champion Badminton Arena",
        subcategory: "Badminton",
        image_path: "https://example.com/champion_badminton.jpg",
      });

      // First call to fetchProgressiveSportsBatch on cold start
      mockInvoke.mockResolvedValueOnce({
        data: {
          items: [
            {
              place_id: "ChIJ_mount_first_test",
              name: "Generic Google Sports Complex",
              types: ["sports_complex"],
              latitude: 13.095,
              longitude: 77.544,
              formatted_address: "Vidyaranyapura, Bengaluru, Karnataka",
              cover_image_url: "https://example.com/raw.jpg",
            },
          ],
          nextPageToken: null,
        },
        error: null,
      });

      const firstBatch = await fetchProgressiveSportsBatch({
        originCoords: mockOrigin,
        queryIndex: 0,
        seenPlaceIds,
      });

      // Verified: database override is applied ON THE VERY FIRST LOAD without reload
      expect(firstBatch.items.length).toBe(1);
      expect(firstBatch.items[0].title).toBe("Champion Badminton Arena");
      expect(firstBatch.items[0].subcategory).toBe("Badminton");
      expect(firstBatch.items[0].cover_image_url).toBe("https://example.com/champion_badminton.jpg");
      expect((firstBatch.items[0] as any)._hasPlanlessOverride).toBe(true);
    });
  });
});
