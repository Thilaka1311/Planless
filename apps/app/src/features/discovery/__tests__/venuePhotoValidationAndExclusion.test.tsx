import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  hasValidRealVenuePhoto,
  resolveAndValidateVenuePhoto,
  isPlaceholderImageUrl,
  markPhotoUrlBroken,
  isPhotoUrlBroken,
  resetBrokenPhotoRegistry,
} from "../services/venueRelevance";
import {
  setPlaceOverridesCacheForTesting,
} from "../services/placeOverridesService";
import {
  createDistanceOrderedDiscoverySections,
} from "../hooks/useDiscoveryStream";
import { DiscoveryCard } from "../components/DiscoveryCard";
import { DiscoveryItem } from "../../../core/types/discovery";

describe("Planless Discovery — Venue Photo Validation & Strict Exclusion Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBrokenPhotoRegistry();
    setPlaceOverridesCacheForTesting(new Map());
  });

  describe("1. Valid Database Photo Overrides", () => {
    it("accepts venue with valid database image_path override", () => {
      const dbOverrides = new Map<string, any>([
        [
          "venue_db_1",
          {
            place_id: "venue_db_1",
            image_path: "https://storage.supabase.co/place-overrides/sports_arena.jpg",
            is_deleted: false,
          },
        ],
      ]);
      setPlaceOverridesCacheForTesting(dbOverrides);

      const venue: DiscoveryItem = {
        id: "venue_db_1",
        place_id: "venue_db_1",
        title: "Premier Football Turf",
        category: "SPORTS",
        cover_image_url: null,
      } as any;

      expect(hasValidRealVenuePhoto(venue)).toBe(true);

      const resolved = resolveAndValidateVenuePhoto(venue);
      expect(resolved.hasValidPhoto).toBe(true);
      expect(resolved.resolvedUrl).toBe("https://storage.supabase.co/place-overrides/sports_arena.jpg");
      expect(venue.cover_image_url).toBe("https://storage.supabase.co/place-overrides/sports_arena.jpg");
    });

    it("accepts venue with valid database google_photo_reference override", () => {
      const dbOverrides = new Map<string, any>([
        [
          "venue_db_2",
          {
            place_id: "venue_db_2",
            google_photo_reference: "places/ChIJ12345/photos/AU3v_valid_photo_ref",
            is_deleted: false,
          },
        ],
      ]);
      setPlaceOverridesCacheForTesting(dbOverrides);

      const venue: DiscoveryItem = {
        id: "venue_db_2",
        place_id: "venue_db_2",
        title: "Artisan Cafe",
        category: "DINING",
        cover_image_url: null,
      } as any;

      expect(hasValidRealVenuePhoto(venue)).toBe(true);
      const resolved = resolveAndValidateVenuePhoto(venue);
      expect(resolved.hasValidPhoto).toBe(true);
      expect(resolved.resolvedUrl).toContain("photo_reference=places%2FChIJ12345%2Fphotos%2FAU3v_valid_photo_ref");
      expect(venue.cover_image_url).toBe(resolved.resolvedUrl);
    });
  });

  describe("2. Valid Google Places API (New) Photos", () => {
    it("accepts venue with Google Places photos containing authentic author attributions", () => {
      const venue: DiscoveryItem = {
        id: "venue_google_1",
        place_id: "venue_google_1",
        title: "Smash Badminton Academy",
        category: "SPORTS",
        cover_image_url: null,
        photos: [
          {
            name: "places/ChIJ999/photos/AU3v_google_photo_1",
            authorAttributions: [
              {
                displayName: "Smash Badminton Academy",
                uri: "//maps.google.com/maps/contrib/123",
              },
            ],
          },
        ],
      } as any;

      expect(hasValidRealVenuePhoto(venue)).toBe(true);
      const resolved = resolveAndValidateVenuePhoto(venue);
      expect(resolved.hasValidPhoto).toBe(true);
      expect(resolved.resolvedUrl).toContain("photo_reference=AU3v_google_photo_1");
      expect(venue.cover_image_url).toBe(resolved.resolvedUrl);
    });

    it("accepts venue with valid Google Places photo_references array", () => {
      const venue: DiscoveryItem = {
        id: "venue_google_2",
        place_id: "venue_google_2",
        title: "Mystery Escape Rooms",
        category: "ACTIVITIES",
        cover_image_url: null,
        photo_references: ["places/ChIJ888/photos/AU3v_photo_ref_2"],
      } as any;

      expect(hasValidRealVenuePhoto(venue)).toBe(true);
      const resolved = resolveAndValidateVenuePhoto(venue);
      expect(resolved.hasValidPhoto).toBe(true);
      expect(resolved.resolvedUrl).toContain("photo_reference=places%2FChIJ888%2Fphotos%2FAU3v_photo_ref_2");
    });

    it("accepts venue with authentic Google CDN cover_image_url already present", () => {
      const venue: DiscoveryItem = {
        id: "venue_google_3",
        place_id: "venue_google_3",
        title: "Rooftop Bistro",
        category: "DINING",
        cover_image_url: "https://lh3.googleusercontent.com/places/AU3v_authentic_cdn_photo.jpg",
      } as any;

      expect(hasValidRealVenuePhoto(venue)).toBe(true);
      const resolved = resolveAndValidateVenuePhoto(venue);
      expect(resolved.hasValidPhoto).toBe(true);
      expect(resolved.resolvedUrl).toBe("https://lh3.googleusercontent.com/places/AU3v_authentic_cdn_photo.jpg");
    });
  });

  describe("3. Missing Photos Rejection", () => {
    it("rejects venue when cover_image_url is null and no photos or overrides exist", () => {
      const venue: DiscoveryItem = {
        id: "venue_no_photo",
        place_id: "venue_no_photo",
        title: "Empty Photo Turf",
        category: "SPORTS",
        cover_image_url: null,
      } as any;

      expect(hasValidRealVenuePhoto(venue)).toBe(false);
      const resolved = resolveAndValidateVenuePhoto(venue);
      expect(resolved.hasValidPhoto).toBe(false);
      expect(resolved.resolvedUrl).toBeNull();
    });

    it("rejects venue when photos and photo_references are empty arrays", () => {
      const venue: DiscoveryItem = {
        id: "venue_empty_arrays",
        place_id: "venue_empty_arrays",
        title: "Empty Cafe",
        category: "DINING",
        cover_image_url: "",
        photos: [],
        photo_references: [],
      } as any;

      expect(hasValidRealVenuePhoto(venue)).toBe(false);
      const resolved = resolveAndValidateVenuePhoto(venue);
      expect(resolved.hasValidPhoto).toBe(false);
      expect(resolved.resolvedUrl).toBeNull();
    });
  });

  describe("4. Broken and Malformed URLs Rejection", () => {
    it("rejects URLs with malformed query parameters like photo_reference=undefined or photo_reference=null", () => {
      const brokenUrls = [
        "https://example.com/api/photo?photo_reference=undefined",
        "https://example.com/api/photo?photo_reference=null",
        "https://example.com/api/photo?photo_reference=",
        "https://example.com/api/photo?photo_reference=&width=400",
      ];

      for (const url of brokenUrls) {
        expect(isPlaceholderImageUrl(url)).toBe(true);

        const venue: DiscoveryItem = {
          id: "venue_malformed",
          place_id: "venue_malformed",
          title: "Malformed URL Venue",
          category: "ACTIVITIES",
          cover_image_url: url,
        } as any;

        expect(hasValidRealVenuePhoto(venue)).toBe(false);
      }
    });

    it("rejects URLs registered in runtime broken photo registry", () => {
      const brokenUrl = "https://images.example.com/venues/broken_turf_404.jpg";

      expect(isPhotoUrlBroken(brokenUrl)).toBe(false);
      markPhotoUrlBroken(brokenUrl);
      expect(isPhotoUrlBroken(brokenUrl)).toBe(true);

      const venue: DiscoveryItem = {
        id: "venue_runtime_broken",
        place_id: "venue_runtime_broken",
        title: "Broken Turf",
        category: "SPORTS",
        cover_image_url: brokenUrl,
      } as any;

      expect(hasValidRealVenuePhoto(venue)).toBe(false);
      const resolved = resolveAndValidateVenuePhoto(venue);
      expect(resolved.hasValidPhoto).toBe(false);

      // Reset registry clears broken status
      resetBrokenPhotoRegistry();
      expect(isPhotoUrlBroken(brokenUrl)).toBe(false);
    });
  });

  describe("5. Generic Fallback & Curated Placeholder Images Rejection", () => {
    it("rejects curated fallback assets", () => {
      const curatedAssets = [
        "/assets/curated/sports_turf.jpg",
        "/assets/curated/sports_badminton.jpg",
        "/assets/curated/sports_pickleball.jpg",
        "/assets/curated/dining_cafe.jpg",
        "/assets/curated/activity_bowling.jpg",
      ];

      for (const asset of curatedAssets) {
        expect(isPlaceholderImageUrl(asset)).toBe(true);

        const venue: DiscoveryItem = {
          id: "venue_curated",
          place_id: "venue_curated",
          title: "Curated Asset Venue",
          category: "SPORTS",
          cover_image_url: asset,
        } as any;

        expect(hasValidRealVenuePhoto(venue)).toBe(false);
      }
    });

    it("rejects generic category webp/png placeholders and planimagedefault", () => {
      const genericPlaceholders = [
        "/assets/sports.webp",
        "/assets/dining.webp",
        "/assets/categories/activity.png",
        "/assets/planimagedefault.png",
        "/assets/planimagedefault.webp",
        "planimagedefault.png",
        "planimagedefault.webp",
      ];

      for (const placeholder of genericPlaceholders) {
        expect(isPlaceholderImageUrl(placeholder)).toBe(true);

        const venue: DiscoveryItem = {
          id: "venue_generic",
          place_id: "venue_generic",
          title: "Generic Placeholder Venue",
          category: "DINING",
          cover_image_url: placeholder,
        } as any;

        expect(hasValidRealVenuePhoto(venue)).toBe(false);
      }
    });
  });

  describe("6. Pipeline Image Resolution Before Exclusion", () => {
    it("does NOT prematurely drop a venue whose cover_image_url is initially null if the pipeline resolves a photo", () => {
      const dbOverrides = new Map<string, any>([
        [
          "venue_delayed_db",
          {
            place_id: "venue_delayed_db",
            image_path: "https://storage.supabase.co/place-overrides/bowling_arena.jpg",
            is_deleted: false,
          },
        ],
      ]);
      setPlaceOverridesCacheForTesting(dbOverrides);

      const venue: DiscoveryItem = {
        id: "venue_delayed_db",
        place_id: "venue_delayed_db",
        title: "Strike Bowling Lounge",
        category: "ACTIVITIES",
        cover_image_url: null, // Initially empty
      } as any;

      // Pipeline resolution succeeds
      const result = resolveAndValidateVenuePhoto(venue);
      expect(result.hasValidPhoto).toBe(true);
      expect(venue.cover_image_url).toBe("https://storage.supabase.co/place-overrides/bowling_arena.jpg");
      expect(hasValidRealVenuePhoto(venue)).toBe(true);
    });

    it("does NOT prematurely drop a venue whose cover_image_url is initially null if Google photos exist", () => {
      const venue: DiscoveryItem = {
        id: "venue_delayed_google",
        place_id: "venue_delayed_google",
        title: "Smash Point Badminton",
        category: "SPORTS",
        cover_image_url: null, // Initially empty
        photos: [
          {
            name: "places/ChIJabc/photos/AU3v_owner_photo",
            authorAttributions: [{ displayName: "Smash Point Badminton", uri: "" }],
          },
        ],
      } as any;

      const result = resolveAndValidateVenuePhoto(venue);
      expect(result.hasValidPhoto).toBe(true);
      expect(venue.cover_image_url).toContain("photo_reference=AU3v_owner_photo");
      expect(hasValidRealVenuePhoto(venue)).toBe(true);
    });
  });

  describe("7. Pre-Assembly Section Filtering & Cross-Section Deduplication", () => {
    const origin = { latitude: 12.9716, longitude: 77.5946 };

    it("strictly filters venues without valid photos prior to chunking into discovery rows", () => {
      const rawVenues: DiscoveryItem[] = [
        {
          id: "sports_valid_1",
          place_id: "sports_valid_1",
          title: "Valid Sports Arena 1",
          category: "SPORTS",
          latitude: 12.972,
          longitude: 77.595,
          cover_image_url: "https://lh3.googleusercontent.com/places/arena_1.jpg",
        },
        {
          id: "sports_missing_photo",
          place_id: "sports_missing_photo",
          title: "Missing Photo Turf",
          category: "SPORTS",
          latitude: 12.973,
          longitude: 77.596,
          cover_image_url: null, // No photo
        },
        {
          id: "sports_placeholder_photo",
          place_id: "sports_placeholder_photo",
          title: "Placeholder Turf",
          category: "SPORTS",
          latitude: 12.974,
          longitude: 77.597,
          cover_image_url: "/assets/curated/sports_turf.jpg", // Curated placeholder
        },
        {
          id: "sports_valid_2",
          place_id: "sports_valid_2",
          title: "Valid Sports Arena 2",
          category: "SPORTS",
          latitude: 12.975,
          longitude: 77.598,
          cover_image_url: "https://lh3.googleusercontent.com/places/arena_2.jpg",
        },
      ] as any;

      const { sections, sortedVenues } = createDistanceOrderedDiscoverySections(
        "SPORTS",
        rawVenues,
        origin,
        7
      );

      // Only the 2 valid venues are kept in sortedVenues
      expect(sortedVenues.length).toBe(2);
      expect(sortedVenues.map((v) => v.place_id)).toEqual(["sports_valid_1", "sports_valid_2"]);

      // Missing and placeholder venues never appear anywhere in the sections
      const allItemIds = sections.flatMap((sec) => sec.items.map((it) => it.place_id));
      expect(allItemIds).not.toContain("sports_missing_photo");
      expect(allItemIds).not.toContain("sports_placeholder_photo");
    });

    it("ensures excluded venues without valid photos cannot reappear in subsequent sections or rows", () => {
      // 14 venues with valid photos + 3 venues with broken/fallback photos
      const venues: DiscoveryItem[] = Array.from({ length: 17 }, (_, i) => {
        if (i === 3) {
          return {
            id: `venue_${i}`,
            place_id: `venue_${i}`,
            title: `Broken Venue ${i}`,
            category: "DINING",
            latitude: origin.latitude + i * 0.005,
            longitude: origin.longitude,
            cover_image_url: "https://example.com/api?photo_reference=undefined",
          } as any;
        }
        if (i === 8) {
          return {
            id: `venue_${i}`,
            place_id: `venue_${i}`,
            title: `Fallback Venue ${i}`,
            category: "DINING",
            latitude: origin.latitude + i * 0.005,
            longitude: origin.longitude,
            cover_image_url: "/assets/dining.webp",
          } as any;
        }
        if (i === 12) {
          return {
            id: `venue_${i}`,
            place_id: `venue_${i}`,
            title: `No Photo Venue ${i}`,
            category: "DINING",
            latitude: origin.latitude + i * 0.005,
            longitude: origin.longitude,
            cover_image_url: null,
          } as any;
        }
        return {
          id: `venue_${i}`,
          place_id: `venue_${i}`,
          title: `Dining Spot ${i}`,
          category: "DINING",
          latitude: origin.latitude + i * 0.005,
          longitude: origin.longitude,
          cover_image_url: `https://lh3.googleusercontent.com/places/dining_${i}.jpg`,
        } as any;
      });

      const { sections, sortedVenues } = createDistanceOrderedDiscoverySections(
        "DINING",
        venues,
        origin,
        7
      );

      // Exactly 14 valid venues are divided into 2 rows of 7
      expect(sortedVenues.length).toBe(14);
      expect(sections.length).toBe(2);
      expect(sections[0].items.length).toBe(7);
      expect(sections[1].items.length).toBe(7);

      const allRenderedIds = sections.flatMap((sec) => sec.items.map((it) => it.place_id));
      expect(allRenderedIds).not.toContain("venue_3");
      expect(allRenderedIds).not.toContain("venue_8");
      expect(allRenderedIds).not.toContain("venue_12");
    });
  });

  describe("8. Movie Exemption (TMDB Posters)", () => {
    it("does not exclude movies that use TMDB poster paths", () => {
      const movieItem: DiscoveryItem = {
        id: "movie_tmdb_1",
        place_id: "movie_tmdb_1",
        title: "Inception",
        category: "MOVIES",
        cover_image_url: "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
        release_date: "2010-07-16",
      } as any;

      // Movies are exempt from strict venue photo requirements
      expect(hasValidRealVenuePhoto(movieItem)).toBe(true);
      const resolved = resolveAndValidateVenuePhoto(movieItem);
      expect(resolved.hasValidPhoto).toBe(true);
      expect(resolved.resolvedUrl).toBe("/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg");

      // DiscoveryCard renders movie card with poster
      const html = renderToString(
        <DiscoveryCard item={movieItem} onTap={vi.fn()} />
      );
      expect(html).toContain("Inception");
    });
  });

  describe("9. UI Runtime Omission in DiscoveryCard", () => {
    it("returns null (omits card) when DiscoveryCard is rendered with null cover_image_url in SPORTS", () => {
      const item: DiscoveryItem = {
        id: "card_no_image",
        place_id: "card_no_image",
        title: "Turf Without Image",
        category: "SPORTS",
        cover_image_url: null,
      } as any;

      const html = renderToString(
        <DiscoveryCard item={item} onTap={vi.fn()} />
      );
      expect(html).toBe("");
    });

    it("returns null (omits card) when DiscoveryCard is rendered with placeholder image in DINING", () => {
      const item: DiscoveryItem = {
        id: "card_placeholder",
        place_id: "card_placeholder",
        title: "Bistro With Placeholder",
        category: "DINING",
        cover_image_url: "/assets/curated/dining_cafe.jpg",
      } as any;

      const html = renderToString(
        <DiscoveryCard item={item} onTap={vi.fn()} />
      );
      expect(html).toBe("");
    });

    it("returns null (omits card) when DiscoveryCard is rendered with broken URL in ACTIVITIES", () => {
      const brokenUrl = "https://example.com/broken_activity.jpg";
      markPhotoUrlBroken(brokenUrl);

      const item: DiscoveryItem = {
        id: "card_broken",
        place_id: "card_broken",
        title: "Activity With Broken Photo",
        category: "ACTIVITIES",
        cover_image_url: brokenUrl,
      } as any;

      const html = renderToString(
        <DiscoveryCard item={item} onTap={vi.fn()} />
      );
      expect(html).toBe("");
    });

    it("successfully renders DiscoveryCard when venue has a valid real photo", () => {
      const item: DiscoveryItem = {
        id: "card_valid",
        place_id: "card_valid",
        title: "Authentic Football Arena",
        category: "SPORTS",
        subcategory: "Football Turf",
        latitude: 12.9716,
        longitude: 77.5946,
        cover_image_url: "https://lh3.googleusercontent.com/places/valid_turf_photo.jpg",
      } as any;

      const html = renderToString(
        <DiscoveryCard item={item} onTap={vi.fn()} />
      );
      expect(html).toContain("Authentic Football Arena");
      expect(html).toContain("https://lh3.googleusercontent.com/places/valid_turf_photo.jpg");
    });
  });
});
