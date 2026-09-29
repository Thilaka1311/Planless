import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchDiscoveryPlaces } from "../services/discoveryService";
import { supabase } from "../../../../lib/supabaseClient";

describe("Places Search Betterment & Distance Verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
});
