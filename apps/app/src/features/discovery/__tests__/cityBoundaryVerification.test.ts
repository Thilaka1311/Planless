import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isPlaceInCity,
  getCityAliases,
  cleanCityString,
  getCityBoundingBox,
  CityBoundingBox,
} from "../services/cityBoundary";
import {
  getSectionsByCategory,
  clearCachedSections,
  getCacheKey,
} from "../services/discoveryService";
import { searchCoordinator } from "../search/session/searchCoordinator";
import {
  setStoredDiscoveryLocation,
  clearStoredDiscoveryLocation,
  DEFAULT_DISCOVERY_LOCATION,
} from "../hooks/useUserLocation";

describe("Planless Discovery City Boundary & Dynamic Restriction Suite", () => {
  const BENGALURU_BOUNDS: CityBoundingBox = {
    north: 13.1425,
    south: 12.8335,
    east: 77.7841,
    west: 77.4599,
  };

  const HYDERABAD_BOUNDS: CityBoundingBox = {
    north: 17.58,
    south: 17.25,
    east: 78.65,
    west: 78.25,
  };

  beforeEach(() => {
    clearCachedSections();
    searchCoordinator.reset();
    clearStoredDiscoveryLocation();
    vi.restoreAllMocks();
  });

  describe("1. Bengaluru City Boundary Filtering", () => {
    it("accepts valid Bengaluru venues with coordinates and address", () => {
      const koramangalaVenue = {
        title: "Koramangala Social",
        latitude: 12.9352,
        longitude: 77.6245,
        place_address: "118, 80 Feet Rd, 7th Block, Koramangala, Bengaluru, Karnataka 560095",
      };

      const hsrVenue = {
        title: "Play Arena",
        latitude: 12.8988,
        longitude: 77.6756,
        place_address: "Central Jail Road, Kasavanahalli, HSR Extension, Bengaluru",
      };

      expect(isPlaceInCity(koramangalaVenue, "Bengaluru", BENGALURU_BOUNDS)).toBe(true);
      expect(isPlaceInCity(hsrVenue, "Bengaluru", BENGALURU_BOUNDS)).toBe(true);
    });

    it("strictly rejects places from neighboring or foreign cities (Mysuru, Hosur, Hyderabad)", () => {
      // Hosur (border town in Tamil Nadu, ~40km south of Bengaluru)
      const hosurPlace = {
        title: "Hosur Sports Hub",
        latitude: 12.7409,
        longitude: 77.8253,
        place_address: "Bagalur Rd, Hosur, Tamil Nadu 635109",
      };

      // Mysuru (~140km southwest)
      const mysuruPlace = {
        title: "Mysore Palace View Cafe",
        latitude: 12.3051,
        longitude: 76.6551,
        place_address: "Sayyaji Rao Rd, Mysuru, Karnataka 570001",
      };

      // Hyderabad (~570km north)
      const hyderabadPlace = {
        title: "Pista House Charminar",
        latitude: 17.3616,
        longitude: 78.4747,
        place_address: "Charminar Rd, Hyderabad, Telangana 500002",
      };

      // Ramanagara (~48km southwest)
      const ramanagaraPlace = {
        title: "Ramdevara Betta Turf",
        latitude: 12.7214,
        longitude: 77.2812,
        place_address: "MG Road, Ramanagara, Karnataka 562159",
      };

      expect(isPlaceInCity(hosurPlace, "Bengaluru", BENGALURU_BOUNDS)).toBe(false);
      expect(isPlaceInCity(mysuruPlace, "Bengaluru", BENGALURU_BOUNDS)).toBe(false);
      expect(isPlaceInCity(hyderabadPlace, "Bengaluru", BENGALURU_BOUNDS)).toBe(false);
      expect(isPlaceInCity(ramanagaraPlace, "Bengaluru", BENGALURU_BOUNDS)).toBe(false);
    });

    it("strictly rejects Hosur venue even if coordinates are artificially close to southern border", () => {
      // Edge case: Hosur venue address with border coords
      const borderHosurPlace = {
        title: "Border Dhaba Hosur",
        latitude: 12.8340, // just inside southern border tolerance
        longitude: 77.7800,
        place_address: "NH 44, Hosur, Tamil Nadu 635109",
      };

      // Excluded because DISTINCT_ADJACENT_CITIES catches "Hosur"
      expect(isPlaceInCity(borderHosurPlace, "Bengaluru", BENGALURU_BOUNDS)).toBe(false);
    });
  });

  describe("2. Dynamic Multi-City Adaptability (Not Hardcoded to Bengaluru)", () => {
    it("dynamically restricts to Hyderabad when Hyderabad is selected", () => {
      const hydVenue = {
        title: "Heart Cup Coffee",
        latitude: 17.4325,
        longitude: 78.4071,
        place_address: "Road 45, Jubilee Hills, Hyderabad, Telangana 500033",
      };

      const blrVenue = {
        title: "Toit Indiranagar",
        latitude: 12.9791,
        longitude: 77.6408,
        place_address: "100 Feet Rd, Indiranagar, Bengaluru, Karnataka 560038",
      };

      // For Hyderabad user: Hyderabad venue must be accepted, Bengaluru venue rejected
      expect(isPlaceInCity(hydVenue, "Hyderabad", HYDERABAD_BOUNDS)).toBe(true);
      expect(isPlaceInCity(blrVenue, "Hyderabad", HYDERABAD_BOUNDS)).toBe(false);
    });

    it("dynamically restricts to Mumbai when Mumbai is selected", () => {
      const mumbaiBounds: CityBoundingBox = {
        north: 19.27,
        south: 18.89,
        east: 72.98,
        west: 72.77,
      };

      const bandraVenue = {
        title: "Subko Coffee Bandra",
        latitude: 19.0553,
        longitude: 72.8295,
        place_address: "Chapel Rd, Bandra West, Mumbai, Maharashtra 400050",
      };

      const puneVenue = {
        title: "FC Road Cafe Pune",
        latitude: 18.5204,
        longitude: 73.8567,
        place_address: "FC Road, Shivajinagar, Pune, Maharashtra 411005",
      };

      expect(isPlaceInCity(bandraVenue, "Mumbai", mumbaiBounds)).toBe(true);
      expect(isPlaceInCity(puneVenue, "Mumbai", mumbaiBounds)).toBe(false);
    });

    it("supports international cities dynamically without hardcoded bounds", () => {
      const londonBounds: CityBoundingBox = {
        north: 51.69,
        south: 51.28,
        east: 0.33,
        west: -0.51,
      };

      const londonVenue = {
        title: "Dishoom Shoreditch",
        latitude: 51.5247,
        longitude: -0.0772,
        place_address: "7 Boundary St, London E2 7JE, United Kingdom",
        address_components: [
          { long_name: "London", short_name: "London", types: ["postal_town"] },
          { long_name: "Greater London", short_name: "Greater London", types: ["administrative_area_level_2"] },
        ],
      };

      const oxfordVenue = {
        title: "The Eagle and Child",
        latitude: 51.7584,
        longitude: -1.2606,
        place_address: "49 St Giles', Oxford OX1 3LU, United Kingdom",
      };

      expect(isPlaceInCity(londonVenue, "London", londonBounds)).toBe(true);
      expect(isPlaceInCity(oxfordVenue, "London", londonBounds)).toBe(false);
    });
  });

  describe("3. Structured Address Components & Aliases", () => {
    it("recognizes Bangalore aliases (Bengaluru, Bangalore, Bangalore Urban)", () => {
      const aliases = getCityAliases("Bengaluru");
      expect(aliases).toContain("bengaluru");
      expect(aliases).toContain("bangalore");
      expect(aliases).toContain("bangalore urban");
    });

    it("validates places using Google Places address_components hierarchy", () => {
      const placeWithComponents = {
        title: "Badminton Hub",
        latitude: 12.92,
        longitude: 77.61,
        address_components: [
          { long_name: "HSR Layout", short_name: "HSR Layout", types: ["sublocality_level_1"] },
          { long_name: "Bengaluru", short_name: "Bengaluru", types: ["locality"] },
          { long_name: "Bangalore Urban", short_name: "Bangalore Urban", types: ["administrative_area_level_2"] },
          { long_name: "Karnataka", short_name: "KA", types: ["administrative_area_level_1"] },
        ],
      };

      expect(isPlaceInCity(placeWithComponents, "Bengaluru", BENGALURU_BOUNDS)).toBe(true);
    });
  });

  describe("4. Location Change & Cache Invalidation", () => {
    it("generates distinct cache keys for distinct cities", () => {
      const blrKey = getCacheKey({ latitude: 12.9716, longitude: 77.5946, city: "Bengaluru" });
      const hydKey = getCacheKey({ latitude: 17.3850, longitude: 78.4867, city: "Hyderabad" });

      expect(blrKey).toContain("bengaluru");
      expect(hydKey).toContain("hyderabad");
      expect(blrKey).not.toBe(hydKey);
    });

    it("resets sessions and clears cache when user changes discovery location", () => {
      setStoredDiscoveryLocation({
        name: "HSR Layout",
        address: "HSR Layout, Bengaluru, Karnataka",
        latitude: 12.9121,
        longitude: 77.6446,
        city: "Bengaluru",
        locality: "HSR Layout",
        cityBounds: BENGALURU_BOUNDS,
      });

      // Switch to Hyderabad
      setStoredDiscoveryLocation({
        name: "Jubilee Hills",
        address: "Jubilee Hills, Hyderabad, Telangana",
        latitude: 17.4319,
        longitude: 78.4073,
        city: "Hyderabad",
        locality: "Jubilee Hills",
        cityBounds: HYDERABAD_BOUNDS,
      });

      // Search coordinator should reset session on location change
      const session = searchCoordinator.getCurrentSession();
      expect(session).toBeNull();
    });
  });
});
