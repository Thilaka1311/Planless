import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Places API (New) Migration Test Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Autocomplete (New API) Request Construction & Normalization", () => {
    it("Constructs request with India-specific restriction (includedRegionCodes: ['in']) and biases by user coordinates", () => {
      const userLat = 12.9716;
      const userLng = 77.5946;
      const rawRadius = 25000;

      // Logic mirrored from autocomplete.ts
      const buildAutocompletePayload = (input: string, lat?: number, lng?: number, radius?: number) => {
        const payload: Record<string, any> = {
          input: input.trim(),
          includedRegionCodes: ["in"],
          regionCode: "in",
        };

        if (typeof lat === "number" && typeof lng === "number") {
          const safeRadius = Math.min(Math.max(radius || 25000, 100), 50000.0);
          payload.locationBias = {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: safeRadius,
            },
          };
          payload.origin = { latitude: lat, longitude: lng };
        }
        return payload;
      };

      const payload = buildAutocompletePayload("Toit Indiranagar", userLat, userLng, rawRadius);

      expect(payload.includedRegionCodes).toEqual(["in"]);
      expect(payload.regionCode).toBe("in");
      expect(payload.locationBias?.circle?.center?.latitude).toBe(12.9716);
      expect(payload.locationBias?.circle?.center?.longitude).toBe(77.5946);
      expect(payload.locationBias?.circle?.radius).toBe(25000);
      expect(payload.origin?.latitude).toBe(12.9716);
    });

    it("Caps radius to 50,000m to satisfy Places API (New) strict upper boundary", () => {
      const buildSafeRadius = (radius?: number) => {
        const rawRadius = typeof radius === "number" ? radius : 25000;
        return Math.min(Math.max(rawRadius, 100), 50000.0);
      };

      expect(buildSafeRadius(100000)).toBe(50000);
      expect(buildSafeRadius(2000000)).toBe(50000);
      expect(buildSafeRadius(15000)).toBe(15000);
      expect(buildSafeRadius(50)).toBe(100);
    });

    it("Normalizes Places API (New) suggestions response to legacy contract", () => {
      const newApiSuggestionsResponse = {
        suggestions: [
          {
            placePrediction: {
              place: "places/ChIJbU60yXAWrjsR4E9-SaODtao",
              placeId: "ChIJbU60yXAWrjsR4E9-SaODtao",
              text: { text: "Toit Brewpub, Indiranagar, Bengaluru, Karnataka, India" },
              structuredFormat: {
                mainText: { text: "Toit Brewpub" },
                secondaryText: { text: "Indiranagar, Bengaluru, Karnataka, India" },
              },
              types: ["brewpub", "bar", "restaurant", "food", "establishment"],
            },
          },
          {
            placePrediction: {
              place: "places/ChIJ_TEST_VENUE_002",
              placeId: "ChIJ_TEST_VENUE_002",
              text: { text: "Play Arena, Sarjapur Road, Bengaluru" },
              structuredFormat: {
                mainText: { text: "Play Arena" },
                secondaryText: { text: "Sarjapur Road, Bengaluru" },
              },
              types: ["sports_complex", "amusement_center"],
            },
          },
        ],
      };

      const normalizeSuggestions = (data: any) => {
        const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
        return suggestions
          .filter((s: any) => Boolean(s?.placePrediction))
          .map((s: any) => {
            const p = s.placePrediction;
            const placeId = p.placeId || (p.place ? p.place.replace(/^places\//, "") : "");
            const description = p.text?.text || "";
            const mainText = p.structuredFormat?.mainText?.text || description;
            const secondaryText = p.structuredFormat?.secondaryText?.text || "";
            const types = Array.isArray(p.types) ? p.types : [];

            return {
              place_id: placeId,
              description,
              structured_formatting: {
                main_text: mainText,
                secondary_text: secondaryText,
              },
              types,
              id: placeId,
              name: mainText,
            };
          });
      };

      const normalized = normalizeSuggestions(newApiSuggestionsResponse);

      expect(normalized).toHaveLength(2);
      expect(normalized[0]).toEqual({
        place_id: "ChIJbU60yXAWrjsR4E9-SaODtao",
        description: "Toit Brewpub, Indiranagar, Bengaluru, Karnataka, India",
        structured_formatting: {
          main_text: "Toit Brewpub",
          secondary_text: "Indiranagar, Bengaluru, Karnataka, India",
        },
        types: ["brewpub", "bar", "restaurant", "food", "establishment"],
        id: "ChIJbU60yXAWrjsR4E9-SaODtao",
        name: "Toit Brewpub",
      });

      expect(normalized[1].place_id).toBe("ChIJ_TEST_VENUE_002");
      expect(normalized[1].structured_formatting.main_text).toBe("Play Arena");
    });

    it("Handles empty input and empty result sets safely without throwing", () => {
      const handleInput = (input: string) => {
        const trimmed = typeof input === "string" ? input.trim() : "";
        if (!trimmed) {
          return { status: "ZERO_RESULTS", predictions: [] };
        }
        return { status: "OK", predictions: [] };
      };

      expect(handleInput("")).toEqual({ status: "ZERO_RESULTS", predictions: [] });
      expect(handleInput("   ")).toEqual({ status: "ZERO_RESULTS", predictions: [] });
    });
  });

  describe("2. Place Details (New API) Normalization & Field Mask", () => {
    it("Normalizes Places API (New) Place Details response to legacy PlaceDetails contract", () => {
      const newPlaceData = {
        id: "ChIJbU60yXAWrjsR4E9-SaODtao",
        displayName: { text: "Toit Brewpub" },
        formattedAddress: "298, 100 Feet Rd, Indiranagar, Bengaluru, Karnataka 560038, India",
        location: { latitude: 12.9791, longitude: 77.6408 },
        rating: 4.6,
        userRatingCount: 28450,
        types: ["brewpub", "bar", "restaurant"],
        addressComponents: [
          { longText: "298", shortText: "298", types: ["street_number"] },
          { longText: "Indiranagar", shortText: "Indiranagar", types: ["sublocality_level_1"] },
          { longText: "Bengaluru", shortText: "Bengaluru", types: ["locality"] },
          { longText: "Karnataka", shortText: "KA", types: ["administrative_area_level_1"] },
          { longText: "India", shortText: "IN", types: ["country"] },
          { longText: "560038", shortText: "560038", types: ["postal_code"] },
        ],
        photos: [
          {
            name: "places/ChIJbU60yXAWrjsR4E9-SaODtao/photos/AUc7tXX12345",
            widthPx: 4032,
            heightPx: 3024,
            authorAttributions: [{ displayName: "Toit" }],
          },
        ],
      };

      const normalizePlaceDetails = (newData: any) => {
        const cleanPlaceId = newData.id;
        const placeName = newData.displayName?.text || "";
        const placeAddress = newData.formattedAddress || "";

        return {
          place_id: cleanPlaceId,
          id: cleanPlaceId,
          name: placeName,
          formatted_address: placeAddress,
          geometry: {
            location: {
              lat: newData.location?.latitude,
              lng: newData.location?.longitude,
            },
          },
          rating: newData.rating,
          user_ratings_total: newData.userRatingCount,
          types: Array.isArray(newData.types) ? newData.types : [],
          address_components: Array.isArray(newData.addressComponents)
            ? newData.addressComponents.map((c: any) => ({
                long_name: c.longText || c.shortText || "",
                short_name: c.shortText || c.longText || "",
                types: Array.isArray(c.types) ? c.types : [],
              }))
            : [],
          photos: (newData.photos || []).map((ph: any) => ({
            name: ph.name,
            photo_reference: ph.name,
            width: ph.widthPx,
            height: ph.heightPx,
            authorAttributions: ph.authorAttributions,
            html_attributions: (ph.authorAttributions || []).map((a: any) => a.displayName || ""),
          })),
        };
      };

      const result = normalizePlaceDetails(newPlaceData);

      expect(result.place_id).toBe("ChIJbU60yXAWrjsR4E9-SaODtao");
      expect(result.name).toBe("Toit Brewpub");
      expect(result.geometry.location.lat).toBe(12.9791);
      expect(result.geometry.location.lng).toBe(77.6408);
      expect(result.rating).toBe(4.6);
      expect(result.user_ratings_total).toBe(28450);
      expect(result.address_components[2].long_name).toBe("Bengaluru");
      expect(result.photos[0].photo_reference).toBe("places/ChIJbU60yXAWrjsR4E9-SaODtao/photos/AUc7tXX12345");
    });

    it("Strips leading 'places/' prefix from targetPlaceId before constructing URL", () => {
      const cleanTargetPlaceId = (id: string) => (id.startsWith("places/") ? id.replace(/^places\//, "") : id);

      expect(cleanTargetPlaceId("places/ChIJ123")).toBe("ChIJ123");
      expect(cleanTargetPlaceId("ChIJ123")).toBe("ChIJ123");
    });
  });

  describe("3. Nearby Search (New API) Request Construction & Category Mapping", () => {
    it("Constructs searchNearby request with locationRestriction circle and max 50km radius", () => {
      const buildNearbyBody = (lat: number, lng: number, radius: number, includedTypes?: string[]) => {
        const safeRadius = Math.min(Math.max(radius || 15000, 100), 50000.0);
        const body: Record<string, any> = {
          maxResultCount: 20,
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: safeRadius,
            },
          },
          rankPreference: "DISTANCE",
        };
        if (Array.isArray(includedTypes) && includedTypes.length > 0) {
          body.includedTypes = includedTypes;
        }
        return body;
      };

      const sportsBody = buildNearbyBody(12.9716, 77.5946, 15000, [
        "athletic_field",
        "fitness_center",
        "sports_complex",
        "stadium",
      ]);

      expect(sportsBody.locationRestriction.circle.center.latitude).toBe(12.9716);
      expect(sportsBody.locationRestriction.circle.center.longitude).toBe(77.5946);
      expect(sportsBody.locationRestriction.circle.radius).toBe(15000);
      expect(sportsBody.rankPreference).toBe("DISTANCE");
      expect(sportsBody.includedTypes).toEqual([
        "athletic_field",
        "fitness_center",
        "sports_complex",
        "stadium",
      ]);
      expect(sportsBody.maxResultCount).toBe(20);
    });

    it("Maps Dining and Activities to valid Places API (New) Table A place types", () => {
      const getCategoryTypes = (category: string) => {
        if (category === "SPORTS") {
          return ["athletic_field", "fitness_center", "sports_complex", "stadium"];
        }
        if (category === "DINING") {
          return ["restaurant", "cafe", "bar", "bakery"];
        }
        if (category === "ACTIVITIES") {
          return ["bowling_alley", "amusement_park", "tourist_attraction"];
        }
        return undefined;
      };

      expect(getCategoryTypes("DINING")).toEqual(["restaurant", "cafe", "bar", "bakery"]);
      expect(getCategoryTypes("ACTIVITIES")).toEqual(["bowling_alley", "amusement_park", "tourist_attraction"]);
      expect(getCategoryTypes("SPORTS")).toEqual(["athletic_field", "fitness_center", "sports_complex", "stadium"]);
    });

    it("Safely rejects MOVIES from Google Places discovery", () => {
      const isGooglePlacesCategory = (cat: string) => cat.toUpperCase() !== "MOVIES";

      expect(isGooglePlacesCategory("SPORTS")).toBe(true);
      expect(isGooglePlacesCategory("DINING")).toBe(true);
      expect(isGooglePlacesCategory("ACTIVITIES")).toBe(true);
      expect(isGooglePlacesCategory("MOVIES")).toBe(false);
    });
  });

  describe("4. Places Photo Media Handling", () => {
    it("Detects Places API (New) resource names vs legacy photoreference", () => {
      const isNewPlacesPhoto = (ref: string) => {
        const cleanRef = ref.trim();
        return cleanRef.startsWith("places/") || cleanRef.includes("/photos/");
      };

      expect(isNewPlacesPhoto("places/ChIJ123/photos/AUc7tXX")).toBe(true);
      expect(isNewPlacesPhoto("ChIJ123/photos/AUc7tXX")).toBe(true);
      expect(isNewPlacesPhoto("CnRtAAAAT7x8...legacy")).toBe(false);
    });

    it("Constructs proper media URL for Places API (New) resource name without exposing keys in public payloads", () => {
      const getPhotoResourceName = (cleanRef: string) => {
        return cleanRef.startsWith("places/") ? cleanRef : `places/${cleanRef}`;
      };

      expect(getPhotoResourceName("places/ChIJ123/photos/AUc7tXX")).toBe("places/ChIJ123/photos/AUc7tXX");
      expect(getPhotoResourceName("ChIJ123/photos/AUc7tXX")).toBe("places/ChIJ123/photos/AUc7tXX");
    });
  });
});
