import { describe, it, expect } from "vitest";
import {
  getSportAwarePlacePhoto,
  PlaceWithPhotos,
} from "../services/sportPhotoSelector";

describe("Sport Photo Selector (getSportAwarePlacePhoto)", () => {
  const photoBaseUrl = "/functions/v1/maps";

  describe("Rush Koland Multi-Sport Photo Differentiation", () => {
    const rushKolandMultiPhotos: PlaceWithPhotos = {
      title: "Rush Koland",
      name: "Rush Koland",
      cover_image_url: `${photoBaseUrl}?action=photo&photo_reference=pickleball_ref_0&maxwidth=800`,
      photo_references: [
        "pickleball_ref_0",
        "football_turf_ref_1",
        "general_ref_2",
      ],
      _photoBaseUrl: photoBaseUrl,
    };

    it("selects the football photo for Rush Koland in Football section", () => {
      const footballPhoto = getSportAwarePlacePhoto(
        rushKolandMultiPhotos,
        "football"
      );
      expect(footballPhoto).toBeDefined();
      expect(footballPhoto).toContain("photo_reference=football_turf_ref_1");
    });

    it("selects the pickleball photo for Rush Koland in Pickleball section", () => {
      const pickleballPhoto = getSportAwarePlacePhoto(
        rushKolandMultiPhotos,
        "pickleball"
      );
      expect(pickleballPhoto).toBeDefined();
      expect(pickleballPhoto).toContain("photo_reference=pickleball_ref_0");
    });

    it("ensures Football and Pickleball photos are DIFFERENT for Rush Koland", () => {
      const footballPhoto = getSportAwarePlacePhoto(
        rushKolandMultiPhotos,
        "football"
      );
      const pickleballPhoto = getSportAwarePlacePhoto(
        rushKolandMultiPhotos,
        "pickleball"
      );
      expect(footballPhoto).not.toBe(pickleballPhoto);
    });

    it("uses verified football photo override even if Rush Koland only had 1 photo returned initially", () => {
      const rushKolandSinglePhoto: PlaceWithPhotos = {
        title: "Rush Koland",
        name: "Rush Koland",
        cover_image_url: `${photoBaseUrl}?action=photo&photo_reference=pickleball_ref_0&maxwidth=800`,
        photo_references: ["pickleball_ref_0"],
        _photoBaseUrl: photoBaseUrl,
      };

      const footballPhoto = getSportAwarePlacePhoto(
        rushKolandSinglePhoto,
        "football"
      );
      expect(footballPhoto).toBeDefined();
      // Should not be the pickleball cover photo!
      expect(footballPhoto).not.toBe(rushKolandSinglePhoto.cover_image_url);
      expect(footballPhoto).toContain("action=photo");
    });
  });

  describe("General Multi-Sport Venues with Multiple Photos", () => {
    const multiSportVenue: PlaceWithPhotos = {
      title: "PlayZone Sports Arena",
      name: "PlayZone Sports Arena",
      cover_image_url: `${photoBaseUrl}?action=photo&photo_reference=ref_primary&maxwidth=800`,
      photo_references: [
        "ref_slot_0",
        "ref_slot_1",
        "ref_slot_2",
        "ref_slot_3",
        "ref_slot_4",
      ],
      _photoBaseUrl: photoBaseUrl,
    };

    it("assigns distinct photo slots to different sports", () => {
      const footballPhoto = getSportAwarePlacePhoto(multiSportVenue, "football");
      const pickleballPhoto = getSportAwarePlacePhoto(multiSportVenue, "pickleball");
      const badmintonPhoto = getSportAwarePlacePhoto(multiSportVenue, "badminton");

      expect(footballPhoto).toBeDefined();
      expect(pickleballPhoto).toBeDefined();
      expect(badmintonPhoto).toBeDefined();

      // Distinct sports receive different photos
      expect(footballPhoto).not.toBe(pickleballPhoto);
      expect(footballPhoto).not.toBe(badmintonPhoto);
      expect(pickleballPhoto).not.toBe(badmintonPhoto);
    });
  });

  describe("Fallback Behavior & Graceful Degradation", () => {
    it("falls back to primary cover_image_url if only 1 photo exists and venue has no specific rule", () => {
      const singlePhotoVenue: PlaceWithPhotos = {
        title: "ToughX Sports Arena",
        cover_image_url: `${photoBaseUrl}?action=photo&photo_reference=only_one&maxwidth=800`,
        photo_references: ["only_one"],
      };

      const photo = getSportAwarePlacePhoto(singlePhotoVenue, "football");
      expect(photo).toBe(singlePhotoVenue.cover_image_url);
    });

    it("falls back to primary cover_image_url if photo_references is empty", () => {
      const noRefsVenue: PlaceWithPhotos = {
        title: "Neighborhood Court",
        cover_image_url: "https://example.com/fallback.jpg",
        photo_references: [],
      };

      const photo = getSportAwarePlacePhoto(noRefsVenue, "badminton");
      expect(photo).toBe("https://example.com/fallback.jpg");
    });

    it("falls back to primary cover_image_url if sport context is null, 'all', or 'other'", () => {
      const venue: PlaceWithPhotos = {
        title: "Multi Arena",
        cover_image_url: "https://example.com/primary.jpg",
        photo_references: ["ref_0", "ref_1", "ref_2"],
      };

      expect(getSportAwarePlacePhoto(venue, null)).toBe("https://example.com/primary.jpg");
      expect(getSportAwarePlacePhoto(venue, "all")).toBe("https://example.com/primary.jpg");
      expect(getSportAwarePlacePhoto(venue, "other")).toBe("https://example.com/primary.jpg");
    });

    it("safely handles venues with no images at all without throwing", () => {
      const emptyVenue: PlaceWithPhotos = {
        title: "New Unknown Turf",
        cover_image_url: null,
        photo_references: null,
      };

      expect(() => getSportAwarePlacePhoto(emptyVenue, "football")).not.toThrow();
      expect(getSportAwarePlacePhoto(emptyVenue, "football")).toBeNull();
    });
  });
});
