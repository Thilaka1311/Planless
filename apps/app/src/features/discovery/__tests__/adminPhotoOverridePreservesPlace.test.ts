import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  applyPlaceOverrides,
  savePlaceOverride,
  hidePlace,
  mergeSportsPlacesWithOverrides,
  initPlaceOverridesRealtime,
  subscribePlaceOverrides,
  fetchPlaceOverrides,
  getPlaceOverridesCache,
} from "../services/placeOverridesService";
import {
  isPlayableSportsVenue,
  hasOwnerPostedPhoto,
  extractCleanPlaceId,
  isRelevantVenueForCategory,
} from "../services/venueRelevance";
import { isSportVenueRelevant, getSupportedSports } from "../services/sportsRelevance";
import { isPaidBookableVenue } from "../screens/DiscoverSports";
import { supabase } from "../../../../lib/supabaseClient";

// Hoisted channel mocks for vitest
const { channelHandlers, mockChannel } = vi.hoisted(() => {
  const handlers: Record<string, ((payload: any) => void)[]> = {};
  const channel = {
    on: vi.fn((event: string, filter: any, callback: (payload: any) => void) => {
      const key = `${filter.table || "all"}`;
      if (!handlers[key]) handlers[key] = [];
      handlers[key].push(callback);
      return channel;
    }),
    subscribe: vi.fn().mockReturnThis(),
  };
  return { channelHandlers: handlers, mockChannel: channel };
});

vi.mock("../../../../lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  },
  SUPABASE_URL: "https://test.supabase.co",
}));

describe("Sports Discovery Architecture: Google + Database Merge & Realtime Suite", () => {
  const toughXPlaceId = "ChIJ9dGk7qwjrjsRo6UMOHAhOjg";
  const decathlonPlaceId = "ChIJdecathlon123";
  const databaseOnlyPlaceId = "ChIJdbOnlyTurf456";

  const toughXGooglePlace = {
    id: `place_${toughXPlaceId}`,
    public_id: `place_${toughXPlaceId}`,
    section_id: "places_sports",
    title: "ToughX Sports Arena (Football, Cricket, Snooker)",
    name: "ToughX Sports Arena (Football, Cricket, Snooker)",
    category: "SPORTS",
    subcategory: "Sports Club | Event Venue",
    description: "Toughx sports arena, devi circle, Vidyaranyapura, Bengaluru",
    cover_image_url: "https://test.supabase.co/functions/v1/maps?action=photo&photo_reference=initial_google_photo&maxwidth=800",
    location: "Vidyaranyapura, Bengaluru",
    place_address: "Vidyaranyapura, Bengaluru",
    latitude: 13.0865,
    longitude: 77.5546,
    distance: "2.1 km",
    rating: 4.4,
    user_ratings_total: 86,
    photo_references: ["initial_google_photo"],
    photos: [
      {
        name: `places/${toughXPlaceId}/photos/cust_1`,
        authorAttributions: [{ displayName: "Visitor A" }],
      },
    ],
    types: ["sports_club", "sports_complex", "athletic_field"],
    status: "ACTIVE",
    place_id: toughXPlaceId,
    provider_place_id: toughXPlaceId,
  };

  const decathlonGooglePlace = {
    id: `place_${decathlonPlaceId}`,
    public_id: `place_${decathlonPlaceId}`,
    section_id: "places_sports",
    title: "Decathlon Anubhava Turf",
    name: "Decathlon Anubhava Turf",
    category: "SPORTS",
    subcategory: "Football Turf",
    description: "Decathlon Sports Turf near Airport Road",
    cover_image_url: "https://test.supabase.co/functions/v1/maps?action=photo&photo_reference=decathlon_photo_ref&maxwidth=800",
    location: "Bellary Road, Bengaluru",
    place_address: "Bellary Road, Bengaluru",
    latitude: 13.1200,
    longitude: 77.6000,
    distance: "5.5 km",
    rating: 4.6,
    user_ratings_total: 320,
    photo_references: ["decathlon_photo_ref"],
    photos: [],
    types: ["sports_complex", "athletic_field"],
    status: "ACTIVE",
    place_id: decathlonPlaceId,
    provider_place_id: decathlonPlaceId,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getPlaceOverridesCache().clear();
  });

  afterEach(() => {
    getPlaceOverridesCache().clear();
  });

  it("1. Google-only places load normally without database overrides", () => {
    const merged = mergeSportsPlacesWithOverrides([decathlonGooglePlace]);
    expect(merged.length).toBe(1);
    expect(merged[0].place_id).toBe(decathlonPlaceId);
    expect(merged[0].title).toBe("Decathlon Anubhava Turf");
    expect(merged[0].cover_image_url).toContain("decathlon_photo_ref");
    expect(isPaidBookableVenue(merged[0] as any)).toBe(true);
    expect(hasOwnerPostedPhoto(merged[0] as any)).toBe(true);
  });

  it("2. Merges Google Places + Database overrides by place_id into ONE single card (no duplicates)", () => {
    const adminSelectedPhoto = "Aa-ngMb-admin-photo-ref-777";
    getPlaceOverridesCache().set(toughXPlaceId, {
      place_id: toughXPlaceId,
      name_override: "ToughX Arena (Admin Verified)",
      google_photo_reference: adminSelectedPhoto,
      is_deleted: false,
    });

    const merged = mergeSportsPlacesWithOverrides([toughXGooglePlace, decathlonGooglePlace]);

    // Exactly 2 venues, ToughX is merged into ONE card
    expect(merged.length).toBe(2);
    const toughXMerged = merged.find((p) => p.place_id === toughXPlaceId);
    expect(toughXMerged).toBeDefined();

    // Overridden fields used from database
    expect(toughXMerged.title).toBe("ToughX Arena (Admin Verified)");
    expect(toughXMerged.cover_image_url).toContain(`photo_reference=${adminSelectedPhoto}`);

    // Preserves base Google Place fields
    expect(toughXMerged.rating).toBe(4.4);
    expect(toughXMerged.user_ratings_total).toBe(86);
    expect(toughXMerged.latitude).toBe(13.0865);
    expect(toughXMerged.types).toContain("sports_complex");

    // Decathlon is untouched
    const decathlonMerged = merged.find((p) => p.place_id === decathlonPlaceId);
    expect(decathlonMerged.title).toBe("Decathlon Anubhava Turf");
  });

  it("3. Database-only sports places are included in candidate list and pass through existing sports ranking", () => {
    getPlaceOverridesCache().set(databaseOnlyPlaceId, {
      place_id: databaseOnlyPlaceId,
      name_override: "Whitefield Badminton & Box Cricket",
      category_override: "SPORTS",
      subcategory: "Badminton Court",
      address_override: "ITPL Main Road, Whitefield",
      google_photo_reference: "whitefield_court_photo",
      latitude_override: 12.9800,
      longitude_override: 77.7400,
      is_deleted: false,
    });

    const merged = mergeSportsPlacesWithOverrides([toughXGooglePlace]);

    // ToughX from Google + Database-only venue
    expect(merged.length).toBe(2);
    const dbOnly = merged.find((p) => p.place_id === databaseOnlyPlaceId);
    expect(dbOnly).toBeDefined();
    expect(dbOnly.category).toBe("SPORTS");
    expect(isPaidBookableVenue(dbOnly as any)).toBe(true);
    expect(hasOwnerPostedPhoto(dbOnly as any)).toBe(true);
  });

  it("4. When admin changes photo, local cache updates immediately and card does NOT disappear", async () => {
    (supabase.from as any).mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              place_id: toughXPlaceId,
              google_photo_reference: "new_instant_photo_ref",
              is_deleted: false,
            },
            error: null,
          }),
        }),
      }),
    });

    let listenerFiredCount = 0;
    const unsubscribe = subscribePlaceOverrides(({ action, placeId, override }) => {
      if (action === "save" && placeId === toughXPlaceId) {
        listenerFiredCount++;
        expect(override?.google_photo_reference).toBe("new_instant_photo_ref");
      }
    });

    // Admin saves photo override
    await savePlaceOverride(toughXPlaceId, {
      google_photo_reference: "new_instant_photo_ref",
    });

    expect(listenerFiredCount).toBe(1);

    // Instant local merge from cache
    const merged = mergeSportsPlacesWithOverrides([toughXGooglePlace]);
    expect(merged.length).toBe(1);
    expect(merged[0].cover_image_url).toContain("photo_reference=new_instant_photo_ref");
    expect(hasOwnerPostedPhoto(merged[0] as any)).toBe(true);
    expect(isPaidBookableVenue(merged[0] as any)).toBe(true);

    unsubscribe();
  });

  it("5. Realtime sync updates another open client automatically", () => {
    initPlaceOverridesRealtime();

    let clientNotified = false;
    let notifiedOverride: any = null;
    const unsubscribe = subscribePlaceOverrides(({ action, placeId, override }) => {
      if (action === "save" && placeId === toughXPlaceId) {
        clientNotified = true;
        notifiedOverride = override;
      }
    });

    // Simulate Supabase Realtime event from Postgres broadcast
    const realtimeCallback = channelHandlers["discovery_place_overrides"]?.[0];
    expect(realtimeCallback).toBeDefined();

    realtimeCallback({
      eventType: "UPDATE",
      new: {
        place_id: toughXPlaceId,
        google_photo_reference: "realtime_broadcast_photo_ref",
        category_override: "SPORTS",
        is_deleted: false,
      },
      old: {
        place_id: toughXPlaceId,
      },
    });

    expect(clientNotified).toBe(true);
    expect(notifiedOverride.google_photo_reference).toBe("realtime_broadcast_photo_ref");

    // Local cache is immediately in sync
    const merged = mergeSportsPlacesWithOverrides([toughXGooglePlace]);
    expect(merged[0].cover_image_url).toContain("photo_reference=realtime_broadcast_photo_ref");
    expect(hasOwnerPostedPhoto(merged[0])).toBe(true);

    unsubscribe();
  });

  it("6. Existing Sports ranking/sorting (closest-first distance) remains exactly unchanged", () => {
    const venueClose = {
      ...toughXGooglePlace,
      place_id: "venue_1km",
      _distanceKm: 1.0,
    };
    const venueMid = {
      ...decathlonGooglePlace,
      place_id: "venue_3km",
      _distanceKm: 3.2,
    };
    const venueFar = {
      ...toughXGooglePlace,
      place_id: "venue_10km",
      _distanceKm: 10.5,
    };

    // Database overrides applied to venueMid photo
    getPlaceOverridesCache().set("venue_3km", {
      place_id: "venue_3km",
      google_photo_reference: "mid_photo_ref",
      is_deleted: false,
    });

    const candidates = [venueFar, venueClose, venueMid];
    const merged = mergeSportsPlacesWithOverrides(candidates);

    // Existing sports sort: closest first
    const sorted = merged.sort((a, b) => {
      const da = typeof a._distanceKm === "number" ? a._distanceKm : Infinity;
      const db = typeof b._distanceKm === "number" ? b._distanceKm : Infinity;
      return da - db;
    });

    expect(sorted[0].place_id).toBe("venue_1km");
    expect(sorted[1].place_id).toBe("venue_3km");
    expect(sorted[2].place_id).toBe("venue_10km");

    // Photo on venueMid updated while preserving exact position in ranking
    expect(sorted[1].cover_image_url).toContain("mid_photo_ref");
  });

  it("7. Soft-deleted / hidden place is completely excluded from feed", () => {
    getPlaceOverridesCache().set(toughXPlaceId, {
      place_id: toughXPlaceId,
      is_deleted: true,
    });

    const merged = mergeSportsPlacesWithOverrides([toughXGooglePlace, decathlonGooglePlace]);
    expect(merged.length).toBe(1);
    expect(merged[0].place_id).toBe(decathlonPlaceId);
  });
});
