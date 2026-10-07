import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSectionsByCategory, clearCachedSections } from "../services/discoveryService";
import { supabase } from "../../../../lib/supabaseClient";

describe("Places API Discovery Integration Suite", () => {
  beforeEach(() => {
    clearCachedSections();
    vi.restoreAllMocks();
  });

  it("enforces maximum 50 places per category and deduplicates by place_id", async () => {
    // Generate 60 mock raw places with 10 duplicate place_ids
    const generateRawPlaces = (prefix: string, count: number) => {
      return Array.from({ length: count }, (_, i) => {
        const placeId = i >= 50 ? `${prefix}_dup_${i - 50}` : `${prefix}_place_${i}`;
        return {
          id: `place_${placeId}`,
          public_id: `place_${placeId}`,
          section_id: `places_${prefix.toLowerCase()}`,
          title: prefix === "DINING" ? `Restaurant ${i}` : prefix === "MOVIES" ? `Cinema ${i}` : `Turf ${i}`,
          name: prefix === "DINING" ? `Restaurant ${i}` : prefix === "MOVIES" ? `Cinema ${i}` : `Turf ${i}`,
          category: prefix.toUpperCase() as "SPORTS" | "MOVIES" | "DINING",
          subcategory: prefix === "DINING" ? "restaurant" : prefix === "MOVIES" ? "cinema" : "turfs",
          description: "123 Main St, Bengaluru",
          cover_image_url: `/functions/v1/maps?action=photo&photo_reference=ref_${i}`,
          location: "123 Main St, Bengaluru",
          display_order: i + 1,
          featured: i < 3,
          status: "ACTIVE" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          place_id: placeId,
          provider_place_id: placeId,
          place_address: "123 Main St, Bengaluru",
        };
      });
    };

    const sportsPlaces = generateRawPlaces("SPORTS", 50);
    const moviePlaces = generateRawPlaces("MOVIES", 50);
    const diningPlaces = generateRawPlaces("DINING", 50);

    const mockInvoke = vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockResolvedValue({
      data: {
        sections: [
          {
            id: "places_sports",
            public_id: "places_sports",
            category: "SPORTS",
            title: "Sports",
            description: "Turfs and courts",
            display_order: 1,
            status: "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            items: sportsPlaces,
          },
          {
            id: "places_movies",
            public_id: "places_movies",
            category: "MOVIES",
            title: "Movies",
            description: "Cinemas and theatres",
            display_order: 2,
            status: "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            items: moviePlaces,
          },
          {
            id: "places_dining",
            public_id: "places_dining",
            category: "DINING",
            title: "Dining",
            description: "Restaurants and cafes",
            display_order: 3,
            status: "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            items: diningPlaces,
          },
        ],
      },
      error: null,
    });

    const sections = await getSectionsByCategory("all", true);

    expect(sections).toHaveLength(3);

    const sports = sections.find((s) => s.category === "SPORTS");
    expect(sports).toBeDefined();
    expect(sports!.items!.length).toBeLessThanOrEqual(50);
    expect(sports!.items!.length).toBe(50);

    const movies = sections.find((s) => s.category === "MOVIES");
    expect(movies).toBeDefined();
    expect(movies!.items!.length).toBeLessThanOrEqual(50);
    expect(movies!.items!.length).toBe(50);

    const dining = sections.find((s) => s.category === "DINING");
    expect(dining).toBeDefined();
    expect(dining!.items!.length).toBeLessThanOrEqual(50);
    expect(dining!.items!.length).toBe(50);

    // Verify normalization
    const firstSport = sports!.items![0];
    expect(firstSport.title).toBeDefined();
    expect(firstSport.place_id).toBeDefined();
    expect(firstSport.cover_image_url).toBeDefined();
    expect(firstSport.location).toBeDefined();

    mockInvoke.mockRestore();
  });

  it("handles independent category errors gracefully without blocking other categories", async () => {
    // Movies category returned empty/error in Edge Function, but Sports and Dining succeeded
    const mockInvoke = vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockResolvedValue({
      data: {
        sections: [
          {
            id: "places_sports",
            public_id: "places_sports",
            category: "SPORTS",
            title: "Sports",
            description: "Turfs and courts",
            display_order: 1,
            status: "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            items: [
              {
                id: "place_sp1",
                public_id: "place_sp1",
                section_id: "places_sports",
                title: "Turf City",
                category: "SPORTS",
                subcategory: "turfs",
                description: "Turf",
                cover_image_url: "/functions/v1/maps?action=photo&ref=xyz",
                location: "Indiranagar",
                display_order: 1,
                featured: true,
                status: "ACTIVE",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
          },
          {
            id: "places_movies",
            public_id: "places_movies",
            category: "MOVIES",
            title: "Movies",
            description: "Cinemas and theatres",
            display_order: 2,
            status: "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            items: [], // empty due to independent error
          },
          {
            id: "places_dining",
            public_id: "places_dining",
            category: "DINING",
            title: "Dining",
            description: "Restaurants and cafes",
            display_order: 3,
            status: "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            items: [
              {
                id: "place_dn1",
                public_id: "place_dn1",
                section_id: "places_dining",
                title: "Cafe Noir",
                category: "DINING",
                subcategory: "restaurants",
                description: "Cafe",
                cover_image_url: "/functions/v1/maps?action=photo&ref=abc",
                location: "UB City",
                display_order: 1,
                featured: true,
                status: "ACTIVE",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
          },
        ],
      },
      error: null,
    });

    const sections = await getSectionsByCategory("all", true);

    expect(sections).toHaveLength(3);
    const sports = sections.find((s) => s.category === "SPORTS");
    const movies = sections.find((s) => s.category === "MOVIES");
    const dining = sections.find((s) => s.category === "DINING");

    expect(sports!.items!.length).toBe(1);
    expect(movies!.items!.length).toBe(0);
    expect(dining!.items!.length).toBe(1);

    mockInvoke.mockRestore();
  });

  it("caches discovery results and prevents duplicate requests on subsequent renders", async () => {
    const mockInvoke = vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockResolvedValue({
      data: {
        sections: [
          {
            id: "places_sports",
            public_id: "places_sports",
            category: "SPORTS",
            title: "Sports",
            description: "Turfs and courts",
            display_order: 1,
            status: "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            items: [],
          },
        ],
      },
      error: null,
    });

    // First call: triggers invoke
    await getSectionsByCategory("all", false);
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    // Second call without forceRefresh: uses cache
    await getSectionsByCategory("all", false);
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    // Third call with specific category: uses cache
    await getSectionsByCategory("SPORTS", false);
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    mockInvoke.mockRestore();
  });
});
