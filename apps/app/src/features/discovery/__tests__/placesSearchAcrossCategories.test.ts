import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchDiscoveryPlaces } from "../services/discoveryService";
import { supabase } from "../../../../lib/supabaseClient";

describe("Places Search Across Categories (Dining, Sports, Activities)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("triggers fresh Google Places search for Dining ('Truffles') preserving user location context", async () => {
    const invokeSpy = vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockImplementation(
      async (fnName: string, options: any) => {
        if (fnName === "maps") {
          const action = options?.body?.action;
          if (action === "geocode") {
            return { data: { status: "ZERO_RESULTS", results: [] }, error: null };
          }
          if (action === "places-discovery") {
            expect(options.body.query).toBe("Truffles");
            expect(options.body.category).toBe("DINING");
            expect(options.body.latitude).toBe(12.9784);
            expect(options.body.longitude).toBe(77.6408);
            return {
              data: {
                items: [
                  {
                    id: "truffles-indiranagar",
                    place_id: "truffles-indiranagar",
                    title: "Truffles Indiranagar",
                    category: "DINING",
                    subcategory: "Restaurant",
                    latitude: 12.9785,
                    longitude: 77.6409,
                  },
                ],
                nextPageToken: "next-token-dining",
              },
              error: null,
            };
          }
        }
        return { data: null, error: null };
      }
    );

    const result = await searchDiscoveryPlaces({
      category: "DINING",
      query: "Truffles",
      currentCoordinates: { latitude: 12.9784, longitude: 77.6408 }, // User's discovery location (Indiranagar)
      defaultCity: "Bengaluru",
    });

    expect(invokeSpy).toHaveBeenCalled();
    expect(result.items.length).toBe(1);
    expect(result.items[0].title).toBe("Truffles Indiranagar");
    expect(result.nextPageToken).toBe("next-token-dining");
    // Ensure coordinates match user discovery location context
    expect(result.searchCoordinates).toEqual({ latitude: 12.9784, longitude: 77.6408 });
  });

  it("triggers fresh Google Places search for Sports ('Cult Fit', 'football turf')", async () => {
    const invokeSpy = vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockImplementation(
      async (fnName: string, options: any) => {
        if (fnName === "maps" && options?.body?.action === "places-discovery") {
          expect(options.body.category).toBe("SPORTS");
          expect(options.body.query).toBe("Cult Fit");
          return {
            data: {
              items: [
                {
                  id: "cult-fit-1",
                  place_id: "cult-fit-1",
                  title: "Cult Gym Richmond Road",
                  category: "SPORTS",
                  subcategory: "Gym",
                  latitude: 12.966,
                  longitude: 77.607,
                },
              ],
              nextPageToken: null,
            },
            error: null,
          };
        }
        return { data: { status: "ZERO_RESULTS", results: [] }, error: null };
      }
    );

    const result = await searchDiscoveryPlaces({
      category: "SPORTS",
      query: "Cult Fit",
      currentCoordinates: { latitude: 12.9716, longitude: 77.5946 },
    });

    expect(invokeSpy).toHaveBeenCalled();
    expect(result.items.length).toBe(1);
    expect(result.items[0].title).toBe("Cult Gym Richmond Road");
  });

  it("triggers fresh Google Places search for Activities ('bowling', 'escape room')", async () => {
    const invokeSpy = vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockImplementation(
      async (fnName: string, options: any) => {
        if (fnName === "maps" && options?.body?.action === "places-discovery") {
          expect(options.body.category).toBe("ACTIVITIES");
          expect(options.body.query).toBe("bowling");
          return {
            data: {
              items: [
                {
                  id: "bowling-amoeba-1",
                  place_id: "bowling-amoeba-1",
                  title: "Amoeba Bowling",
                  category: "ACTIVITIES",
                  subcategory: "Bowling Alley",
                  latitude: 12.973,
                  longitude: 77.608,
                },
              ],
              nextPageToken: "next-token-act",
            },
            error: null,
          };
        }
        return { data: { status: "ZERO_RESULTS", results: [] }, error: null };
      }
    );

    const result = await searchDiscoveryPlaces({
      category: "ACTIVITIES",
      query: "bowling",
      currentCoordinates: { latitude: 12.9716, longitude: 77.5946 },
    });

    expect(invokeSpy).toHaveBeenCalled();
    expect(result.items.length).toBe(1);
    expect(result.items[0].title).toBe("Amoeba Bowling");
    expect(result.nextPageToken).toBe("next-token-act");
  });

  it("supports pagination with pageToken and preserves subsequent results", async () => {
    const invokeSpy = vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockImplementation(
      async (fnName: string, options: any) => {
        if (fnName === "maps" && options?.body?.action === "places-discovery") {
          if (options.body.pageToken === "page-2-token") {
            return {
              data: {
                items: [
                  {
                    id: "pizza-hut-2",
                    place_id: "pizza-hut-2",
                    title: "Pizza Hut Indiranagar",
                    category: "DINING",
                    latitude: 12.978,
                    longitude: 77.64,
                  },
                ],
                nextPageToken: null,
              },
              error: null,
            };
          }
        }
        return { data: { status: "ZERO_RESULTS", results: [] }, error: null };
      }
    );

    const page2Result = await searchDiscoveryPlaces({
      category: "DINING",
      query: "Pizza Hut",
      pageToken: "page-2-token",
      currentCoordinates: { latitude: 12.9716, longitude: 77.5946 },
    });

    expect(invokeSpy).toHaveBeenCalled();
    expect(page2Result.items.length).toBe(1);
    expect(page2Result.items[0].title).toBe("Pizza Hut Indiranagar");
    expect(page2Result.nextPageToken).toBeNull();
  });

  it("falls back to database items when Google Places returns non-2xx status code", async () => {
    // Simulate Edge Function throwing non-2xx error
    vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockImplementation(
      async (fnName: string, options: any) => {
        if (fnName === "maps") {
          return { data: null, error: new Error("Edge Function returned a non-2xx status code") };
        }
        return { data: null, error: null };
      }
    );

    // Mock DB fallback search
    const mockDbItem = {
      id: "db-truffles-1",
      public_id: "db-truffles-1",
      title: "Truffles St Marks Road",
      category: "DINING",
      subcategory: "Restaurant",
      description: "Famous burger joint",
      latitude: 12.972,
      longitude: 77.601,
      status: "ACTIVE",
    };

    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockOr = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockResolvedValue({ data: [mockDbItem], error: null });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "discovery_items") {
        return {
          select: mockSelect,
          eq: mockEq,
          or: mockOr,
          order: mockOrder,
        } as any;
      }
      return {} as any;
    });

    const result = await searchDiscoveryPlaces({
      category: "DINING",
      query: "Truffles",
      currentCoordinates: { latitude: 12.9716, longitude: 77.5946 },
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0].title).toBe("Truffles St Marks Road");
  });

  it("returns clean empty state when search query is empty", async () => {
    const result = await searchDiscoveryPlaces({
      category: "DINING",
      query: "",
      currentCoordinates: { latitude: 12.9716, longitude: 77.5946 },
    });

    expect(result.items).toEqual([]);
    expect(result.nextPageToken).toBeNull();
  });
});
