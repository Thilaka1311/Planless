import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchDiscoveryPlaces } from "../services/discoveryService";
import { supabase } from "../../../../lib/supabaseClient";

import { clearPlaceOverridesCache } from "../services/placeOverridesService";

describe("Places Search Betterment & Distance Verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearPlaceOverridesCache();
    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any;
    });
  });

  it("calculates distance relative to searched location when user searches a specific locality", async () => {
    // Mock maps function
    vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockImplementation(async (fnName: string, options: any) => {
      if (fnName === "maps") {
        const action = options?.body?.action;
        if (action === "geocode") {
          // Geocode Koramangala
          return {
            data: {
              status: "OK",
              results: [
                {
                  formatted_address: "Koramangala, Bengaluru, Karnataka, India",
                  geometry: {
                    location: { lat: 12.9352, lng: 77.6245 },
                  },
                },
              ],
            },
            error: null,
          };
        }
        if (action === "places-discovery") {
          return {
            data: {
              sections: [
                {
                  id: "sec-dining",
                  title: "Restaurants",
                  items: [
                    {
                      id: "place-koramangala-cafe-1",
                      title: "Koramangala Social",
                      category: "DINING",
                      subcategory: "Restaurant",
                      latitude: 12.9355,
                      longitude: 77.6248, // ~0.05 km from Koramangala center (12.9352, 77.6245)
                    },
                  ],
                },
              ],
            },
            error: null,
          };
        }
      }
      return { data: null, error: null };
    });

    const result = await searchDiscoveryPlaces({
      category: "DINING",
      query: "Koramangala",
      currentCoordinates: { latitude: 12.9716, longitude: 77.5946 }, // MG Road (~6km away)
      defaultCity: "Bengaluru",
    });

    expect(result.resolvedLocationName).toBe("Koramangala");
    expect(result.searchCoordinates).toEqual({ latitude: 12.9352, longitude: 77.6245 });
    expect(result.items.length).toBeGreaterThan(0);
    // Distance should be close to 0 km (measured from Koramangala center, NOT 6km from MG Road)
    expect(result.items[0].distance).toMatch(/0(\.0|\.1)? km/);
  });

  it("filters search results by active subcategory filter", async () => {
    vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockImplementation(async (fnName: string, options: any) => {
      if (fnName === "maps") {
        const action = options?.body?.action;
        if (action === "places-discovery") {
          return {
            data: {
              sections: [
                {
                  id: "sec-sports",
                  title: "Sports",
                  items: [
                    {
                      id: "turf-1",
                      place_id: "turf-1",
                      title: "Kick on Turf Football Ground",
                      category: "SPORTS",
                      subcategory: "Turf",
                      latitude: 12.9784,
                      longitude: 77.6408,
                    },
                    {
                      id: "badminton-1",
                      place_id: "badminton-1",
                      title: "Smash Badminton Arena",
                      category: "SPORTS",
                      subcategory: "Badminton",
                      latitude: 12.9788,
                      longitude: 77.6412,
                    },
                  ],
                },
              ],
            },
            error: null,
          };
        }
      }
      return { data: null, error: null };
    });

    // Subcategory = turfs
    const result = await searchDiscoveryPlaces({
      category: "SPORTS",
      query: "turf",
      subCategoryFilter: "turfs",
      currentCoordinates: { latitude: 12.9784, longitude: 77.6408 },
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0].title).toBe("Kick on Turf Football Ground");
  });

  it("queries the database globally and retains distant places without geographic filtering", async () => {
    // Mock Supabase from('discovery_items') query builder
    const mockDbPlace = {
      id: "place-hyd-mcd-1",
      public_id: "place-hyd-mcd-1",
      title: "McDonald's Jubilee Hills",
      category: "DINING",
      subcategory: "Fast Food",
      description: "Fast food restaurant in Hyderabad",
      location: "Jubilee Hills, Hyderabad",
      place_address: "Road No 36, Jubilee Hills, Hyderabad, Telangana",
      latitude: 17.4319,
      longitude: 78.4073, // Hyderabad (~500 km from Bengaluru)
      status: "ACTIVE",
    };

    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockOr = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockResolvedValue({ data: [mockDbPlace], error: null });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "discovery_items") {
        return {
          select: mockSelect,
          eq: mockEq,
          or: mockOr,
          order: mockOrder,
        } as any;
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any;
    });

    // Mock maps API to return nothing for places discovery to isolate DB results
    vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await searchDiscoveryPlaces({
      category: "DINING",
      query: "McDonald's Hyderabad",
      currentCoordinates: { latitude: 12.9716, longitude: 77.5946 }, // Bengaluru user
      defaultCity: "Hyderabad",
    });

    expect(result.items.length).toBeGreaterThan(0);
    const item = result.items.find((i) => i.title.includes("McDonald's Jubilee Hills"));
    expect(item).toBeDefined();
    // Distance should be calculated (~500 km) and NOT filtered out
    expect(item?.distance).toMatch(/\d{2,4}\.?\d*\s*km/);
    expect(parseFloat(item?.distance?.replace(" km", "") || "0")).toBeGreaterThan(400);
  });

  it("respects category filter for Movies, Sports, and Activities", async () => {
    const mockMoviesPlace = {
      id: "place-pvr-1",
      public_id: "place-pvr-1",
      title: "PVR Cinemas Forum",
      category: "MOVIES",
      subcategory: "Cinema",
      description: "Multiplex cinema hall",
      location: "Koramangala, Bengaluru",
      place_address: "Forum Mall, Koramangala",
      latitude: 12.9352,
      longitude: 77.6133,
      status: "ACTIVE",
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "discovery_items") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [mockMoviesPlace], error: null }),
        } as any;
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any;
    });

    vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await searchDiscoveryPlaces({
      category: "MOVIES",
      query: "PVR",
      currentCoordinates: { latitude: 12.9716, longitude: 77.5946 },
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0].title).toBe("PVR Cinemas Forum");
    expect(result.items[0].category).toBe("MOVIES");
  });
});
