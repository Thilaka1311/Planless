import { describe, it, expect } from "vitest";
import {
  isOwnerAuthor,
  extractOwnerPhotos,
  hasOwnerPostedPhoto,
  isPlaceholderImageUrl,
} from "../services/venueRelevance";
import { normalizeCandidate } from "../search/engine/normalizer";

describe("Owner-Posted Photo Verification & Enforcement Suite", () => {
  describe("1. Author Attribution Matching (isOwnerAuthor)", () => {
    it("matches exact business and author names (case-insensitive)", () => {
      expect(isOwnerAuthor("Loco Lane", "Loco Lane")).toBe(true);
      expect(isOwnerAuthor("loco lane", "LOCO LANE")).toBe(true);
      expect(isOwnerAuthor("Torq03", "Torq03")).toBe(true);
    });

    it("matches venue names with punctuation, trademarks, and location suffixes", () => {
      expect(isOwnerAuthor("Loco Bear™", "Loco Bear")).toBe(true);
      expect(isOwnerAuthor("Toit", "Toit Indiranagar")).toBe(true);
      expect(isOwnerAuthor("The Grid - Gaming Arena", "The Grid")).toBe(true);
      expect(isOwnerAuthor("Play Arena", "Play Arena Sports & Adventure")).toBe(true);
      expect(isOwnerAuthor("Mystery Rooms Bangalore", "Mystery Rooms")).toBe(true);
    });

    it("rejects individual customer, reviewer, and local guide names", () => {
      expect(isOwnerAuthor("Loco Lane", "Athul hari")).toBe(false);
      expect(isOwnerAuthor("Torq03", "SasidharanAnnamalai")).toBe(false);
      expect(isOwnerAuthor("Toit", "Sameer Bihan")).toBe(false);
      expect(isOwnerAuthor("Play Arena", "John Doe")).toBe(false);
      expect(isOwnerAuthor("Mystery Rooms", "Ramesh Kumar (Local Guide)")).toBe(false);
      expect(isOwnerAuthor("Amoeba Bowling", "Priya Sharma")).toBe(false);
    });

    it("rejects generic token false positives", () => {
      expect(isOwnerAuthor("Cafe Coffee Day", "Coffee Lover")).toBe(false);
      expect(isOwnerAuthor("Sports Arena", "John Sports")).toBe(false);
      expect(isOwnerAuthor("Bangalore Club", "Bangalore Traveler")).toBe(false);
    });

    it("handles null, empty, and undefined gracefully", () => {
      expect(isOwnerAuthor("", "")).toBe(false);
      expect(isOwnerAuthor("Toit", "")).toBe(false);
      expect(isOwnerAuthor("", "Toit")).toBe(false);
      expect(isOwnerAuthor(undefined as any, null as any)).toBe(false);
    });
  });

  describe("2. Owner Photo Extraction (extractOwnerPhotos)", () => {
    it("extracts owner photos from Places API (New) authorAttributions", () => {
      const photos = [
        {
          name: "places/ChIJ123/photos/customer_photo_1",
          authorAttributions: [{ displayName: "Athul hari" }],
        },
        {
          name: "places/ChIJ123/photos/owner_photo_main",
          authorAttributions: [{ displayName: "Loco Lane" }],
        },
        {
          name: "places/ChIJ123/photos/customer_photo_2",
          authorAttributions: [{ displayName: "SasidharanAnnamalai" }],
        },
      ];

      const extracted = extractOwnerPhotos("Loco Lane", photos);
      expect(extracted).toHaveLength(1);
      expect(extracted[0].photoReference).toBe("owner_photo_main");
      expect(extracted[0].authorName).toBe("Loco Lane");
    });

    it("extracts owner photos from Legacy API html_attributions", () => {
      const photos = [
        {
          photo_reference: "legacy_user_photo",
          html_attributions: ['<a href="...">John Doe</a>'],
        },
        {
          photo_reference: "legacy_owner_photo",
          html_attributions: ['<a href="...">Toit Indiranagar</a>'],
        },
      ];

      const extracted = extractOwnerPhotos("Toit", photos);
      expect(extracted).toHaveLength(1);
      expect(extracted[0].photoReference).toBe("legacy_owner_photo");
      expect(extracted[0].authorName).toBe("Toit Indiranagar");
    });

    it("returns empty array when place only has customer-contributed photos", () => {
      const customerOnlyPhotos = [
        {
          name: "places/ChIJ456/photos/cust_1",
          authorAttributions: [{ displayName: "Sameer Bihan" }],
        },
        {
          name: "places/ChIJ456/photos/cust_2",
          authorAttributions: [{ displayName: "Sneha Rao" }],
        },
      ];

      const extracted = extractOwnerPhotos("Mystery Rooms", customerOnlyPhotos);
      expect(extracted).toHaveLength(0);
    });

    it("returns empty array when photos is empty or null", () => {
      expect(extractOwnerPhotos("Toit", [])).toHaveLength(0);
      expect(extractOwnerPhotos("Toit", null)).toHaveLength(0);
      expect(extractOwnerPhotos("Toit", undefined)).toHaveLength(0);
    });
  });

  describe("3. Strict Discovery Eligibility (hasOwnerPostedPhoto)", () => {
    it("qualifies a place with authentic owner-posted photos", () => {
      const validPlace = {
        title: "Loco Lane",
        category: "ACTIVITIES",
        photos: [
          {
            name: "places/ChIJ123/photos/owner_ref",
            authorAttributions: [{ displayName: "Loco Lane" }],
          },
        ],
      };

      expect(hasOwnerPostedPhoto(validPlace)).toBe(true);
    });

    it("rejects places with customer photos even if photos.length > 0", () => {
      const customerOnlyPlace = {
        title: "Loco Lane",
        category: "ACTIVITIES",
        photos: [
          {
            name: "places/ChIJ123/photos/cust_ref",
            authorAttributions: [{ displayName: "Athul hari" }],
          },
        ],
      };

      expect(hasOwnerPostedPhoto(customerOnlyPlace)).toBe(false);
    });

    it("rejects places with no photos", () => {
      const noPhotoPlace = {
        title: "Some Venue",
        category: "ACTIVITIES",
        photos: [],
      };

      expect(hasOwnerPostedPhoto(noPhotoPlace)).toBe(false);
    });

    it("accepts authentic venues with curated subcategory photos", () => {
      const curatedPlace = {
        title: "Mystery Rooms",
        category: "ACTIVITIES",
        cover_image_url: "/assets/curated/mystery_rooms.jpg",
      };

      expect(hasOwnerPostedPhoto(curatedPlace)).toBe(true);
      expect(isPlaceholderImageUrl("/assets/curated/mystery_rooms.jpg")).toBe(false);
    });

    it("rejects places using default or placeholder images", () => {
      expect(isPlaceholderImageUrl("/assets/Activities.png")).toBe(true);
      expect(isPlaceholderImageUrl("/assets/placeholder.jpg")).toBe(true);
      expect(isPlaceholderImageUrl("https://planless.app/planimagedefault.png")).toBe(true);

      const placeholderPlace = {
        title: "Fake Venue",
        category: "ACTIVITIES",
        cover_image_url: "/assets/Activities.png",
      };

      expect(hasOwnerPostedPhoto(placeholderPlace)).toBe(false);
    });

    it("accepts places from backend with verified photo_references and valid photo url", () => {
      const backendPlace = {
        title: "Toit",
        category: "DINING",
        cover_image_url: "/functions/v1/maps?action=photo&photo_reference=toit_owner_ref&maxwidth=800",
        photo_references: ["toit_owner_ref"],
      };

      expect(hasOwnerPostedPhoto(backendPlace)).toBe(true);
    });

    it("exempts Movies category from owner photo check (uses TMDB poster)", () => {
      const moviePlace = {
        title: "Inception",
        category: "MOVIES",
        cover_image_url: "https://image.tmdb.org/t/p/w500/inception.jpg",
      };

      expect(hasOwnerPostedPhoto(moviePlace)).toBe(true);
    });
  });

  describe("4. Normalizer Owner Photo Prioritization & Curated Fallback", () => {
    it("selects primary owner photo for non-movie candidates even when user photo is index 0", () => {
      const candidate: any = {
        place_id: "test_place_999",
        name: "Torq03",
        category: "ACTIVITIES",
        photos: [
          {
            photo_reference: "customer_ref_0",
            authorAttributions: [{ displayName: "SasidharanAnnamalai" }],
          },
          {
            photo_reference: "owner_ref_1",
            authorAttributions: [{ displayName: "Torq03" }],
          },
        ],
      };

      const normalized = normalizeCandidate(candidate, {
        category: "ACTIVITIES",
      });

      // cover_image_url must use the owner photo reference, NOT customer photo reference
      expect(normalized.cover_image_url).toContain("owner_ref_1");
      expect(normalized.cover_image_url).not.toContain("customer_ref_0");

      // photo_references must only include owner photos
      expect(normalized.photo_references).toEqual(["owner_ref_1"]);
    });

    it("assigns curated subcategory photo instead of customer photo when no owner photo exists", () => {
      const candidate: any = {
        place_id: "test_place_888",
        name: "Torq03 Go Karting",
        category: "ACTIVITIES",
        photos: [
          {
            photo_reference: "customer_ref_0",
            authorAttributions: [{ displayName: "Athul hari" }],
          },
        ],
      };

      const normalized = normalizeCandidate(candidate, {
        category: "ACTIVITIES",
      });

      // Customer photo is NEVER assigned
      expect(normalized.cover_image_url).not.toContain("customer_ref_0");
      // Curated go-karting photo is assigned
      expect(normalized.cover_image_url).toBe("/assets/curated/go_karting.jpg");
      // Google photo references remain null since no owner photos exist
      expect(normalized.photo_references).toBeNull();
    });
  });
});
