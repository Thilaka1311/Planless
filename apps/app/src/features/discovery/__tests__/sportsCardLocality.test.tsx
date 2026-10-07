import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  extractLocalityFromAddress,
  resolveVenueLocality,
} from "../services/addressUtils";
import {
  SportsCard,
  RestaurantCard,
  ActivityCard,
  MovieCard,
  DiscoveryCard,
} from "../components/DiscoveryCard";
import { DiscoveryItem } from "../../../core/types/discovery";

describe("Sports Card Locality / Area Extraction & UI Rendering Suite", () => {
  describe("1. Address / Locality Parser Logic", () => {
    it("extracts 'HSR Layout' from screenshot example 'Bengaluru Turf Inc.' with full address", () => {
      const loc = extractLocalityFromAddress(
        "123, 27th Main Rd, Sector 1, HSR Layout, Bengaluru, Karnataka 560102, India",
        "Bengaluru Turf Inc."
      );
      expect(loc).toBe("HSR Layout");
    });

    it("extracts 'HSR Layout' from standard vicinity 'HSR Layout, Bengaluru'", () => {
      const loc = extractLocalityFromAddress(
        "HSR Layout, Bengaluru",
        "Bengaluru Turf Inc."
      );
      expect(loc).toBe("HSR Layout");
    });

    it("extracts 'HSR Layout' when address is just 'HSR Layout'", () => {
      const loc = extractLocalityFromAddress(
        "HSR Layout",
        "Bengaluru Turf Inc."
      );
      expect(loc).toBe("HSR Layout");
    });

    it("extracts 'Vidyaranyapura' from 'devi circle, Vidyaranyapura, Bengaluru' for ToughX", () => {
      const loc = extractLocalityFromAddress(
        "devi circle, Vidyaranyapura, Bengaluru",
        "ToughX Sports Arena"
      );
      expect(loc).toBe("Vidyaranyapura");
    });

    it("extracts 'Yelahanka' from 'Yelahanka, Bengaluru' for Ovalnet Arena", () => {
      const loc = extractLocalityFromAddress(
        "Yelahanka, Bengaluru",
        "Ovalnet Arena"
      );
      expect(loc).toBe("Yelahanka");
    });

    it("extracts 'Okalipuram' from 'BDSA grounds, Mg Railway colony, Okalipuram, Bengaluru'", () => {
      const loc = extractLocalityFromAddress(
        "BDSA grounds, Mg Railway colony, Okalipuram, Bengaluru",
        "Terra Arena"
      );
      expect(loc).toBe("Okalipuram");
    });

    it("extracts 'Shivaji Nagar' from 'palace mall, Seppings Rd, Bharati Nagar, Shivaji Nagar, Bengaluru'", () => {
      const loc = extractLocalityFromAddress(
        "palace mall, Seppings Rd, Bharati Nagar, Shivaji Nagar, Bengaluru",
        "11 star cricket turf"
      );
      expect(loc).toBe("Shivaji Nagar");
    });

    it("extracts 'Langford Gardens' from '1, Cornwell Rd, Akkithimana Halli, Bheemanna Garden, Langford Gardens, Bengaluru'", () => {
      const loc = extractLocalityFromAddress(
        "1, Cornwell Rd, Akkithimana Halli, Bheemanna Garden, Langford Gardens, Bengaluru",
        "Fusion The Turf"
      );
      expect(loc).toBe("Langford Gardens");
    });

    it("extracts 'Ashok Nagar' from '27, Museum Rd, Shanthala Nagar, Ashok Nagar, Bengaluru'", () => {
      const loc = extractLocalityFromAddress(
        "27, Museum Rd, Shanthala Nagar, Ashok Nagar, Bengaluru",
        "Machaxi Active Sports"
      );
      expect(loc).toBe("Ashok Nagar");
    });

    it("extracts 'Bandra West' from Mumbai address 'Bandra West, Mumbai, Maharashtra 400050'", () => {
      const loc = extractLocalityFromAddress(
        "Bandra West, Mumbai, Maharashtra 400050",
        "Bandra Turf"
      );
      expect(loc).toBe("Bandra West");
    });

    it("extracts locality from structured Google Places address_components when present", () => {
      const item: DiscoveryItem = {
        id: "place_structured_1",
        public_id: "place_structured_1",
        section_id: "places_sports",
        title: "Koramangala Football Arena",
        category: "SPORTS",
        subcategory: "Football Turf",
        description: null,
        cover_image_url: null,
        location: "Koramangala, Bengaluru",
        place_address: "Koramangala, Bengaluru",
        suggested_duration_minutes: 60,
        suggested_cost_amount: null,
        suggested_capacity: null,
        default_rsvp_offset_minutes: 60,
        display_order: 1,
        featured: false,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        address_components: [
          {
            long_name: "Koramangala 4th Block",
            short_name: "Koramangala 4th Block",
            types: ["sublocality_level_1", "sublocality"],
          },
          {
            long_name: "Bengaluru",
            short_name: "Bengaluru",
            types: ["locality"],
          },
        ],
      } as any;

      const loc = resolveVenueLocality(item);
      expect(loc).toBe("Koramangala 4th Block");
    });

    it("returns null gracefully when address is missing or generic ('Nearby', empty)", () => {
      expect(extractLocalityFromAddress("Nearby")).toBeNull();
      expect(extractLocalityFromAddress("")).toBeNull();
      expect(extractLocalityFromAddress(null)).toBeNull();
    });
  });

  describe("2. SportsCard UI Layout & Hierarchy", () => {
    const mockSportsItem: DiscoveryItem = {
      id: "place_bti_1",
      public_id: "place_bti_1",
      section_id: "places_sports",
      title: "Bengaluru Turf Inc.",
      category: "SPORTS",
      subcategory: "Football Turf",
      description: "HSR Layout, Bengaluru",
      place_address: "123, 27th Main Rd, Sector 1, HSR Layout, Bengaluru, Karnataka 560102, India",
      location: "HSR Layout, Bengaluru",
      latitude: 12.9716,
      longitude: 77.5946,
      rating: 3.3,
      distance: "0.0 km",
      cover_image_url: "https://example.com/turf.jpg",
      suggested_duration_minutes: 90,
      suggested_cost_amount: null,
      suggested_capacity: null,
      default_rsvp_offset_minutes: 60,
      display_order: 1,
      featured: true,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it("renders Place Name, Area / Locality, Rating, and Distance in exact sequence for SportsCard", () => {
      const html = renderToString(
        <SportsCard item={mockSportsItem} onTap={() => {}} />
      );

      // 1. Place name
      expect(html).toContain("Bengaluru Turf Inc.");

      // 2. Area / Locality directly below place name
      expect(html).toContain("HSR Layout");
      expect(html).toContain("text-zinc-400");
      expect(html).toContain("truncate");

      // 3. Rating badge
      expect(html).toContain("3.3");
      expect(html).toContain("★");

      // 4. Distance
      expect(html).toContain("0.0 km");

      // Check sequence order in rendered HTML: Place Name (Row 1) -> Locality (Row 2) -> Rating (Row 3) -> Distance (Row 4)
      const titleIndex = html.indexOf("Bengaluru Turf Inc.");
      const areaIndex = html.indexOf("HSR Layout");
      const ratingIndex = html.indexOf("3.3");
      const distanceIndex = html.indexOf("0.0 km");

      expect(titleIndex).toBeGreaterThan(-1);
      expect(areaIndex).toBeGreaterThan(titleIndex);
      expect(ratingIndex).toBeGreaterThan(areaIndex);
      expect(distanceIndex).toBeGreaterThan(ratingIndex);
    });

    it("truncates long place names and area names with 'truncate' class without overflowing layout", () => {
      const longItem: DiscoveryItem = {
        ...mockSportsItem,
        id: "long_item_1",
        title: "Very Long Name Sports Academy Athletic Complex (Badminton and Tennis)",
        place_address: "Near Water Tank, Very Long Extended Locality Area Name Sector 99, Bengaluru",
      };

      const html = renderToString(<SportsCard item={longItem} onTap={() => {}} />);

      expect(html).toContain("Very Long Name Sports Academy Athletic Complex (Badminton and Tennis)");
      expect(html).toContain("Very Long Extended Locality Area Name Sector 99");
      expect(html).toContain("truncate");
    });

    it("keeps Dining cards (RestaurantCard) unchanged without the locality line", () => {
      const diningItem: DiscoveryItem = {
        ...mockSportsItem,
        id: "dining_1",
        title: "Truffles",
        category: "DINING",
        subcategory: "Cafe & Burger",
        place_address: "100 Feet Rd, Indiranagar, Bengaluru, Karnataka 560038",
        rating: 4.5,
        latitude: null,
        longitude: null,
        distance: "2.3 km",
      };

      const html = renderToString(
        <RestaurantCard item={diningItem} onTap={() => {}} />
      );

      // Verify Title, Rating, and Distance are present
      expect(html).toContain("Truffles");
      expect(html).toContain("4.5");
      expect(html).toContain("★");
      expect(html).toContain("2.3 km");
      // Locality is not rendered for non-sports cards
      expect(html).not.toContain("Indiranagar");
    });

    it("keeps Activities cards (ActivityCard) unchanged without the locality line", () => {
      const activityItem: DiscoveryItem = {
        ...mockSportsItem,
        id: "activity_1",
        title: "Mystery Rooms",
        category: "ACTIVITIES",
        subcategory: "Escape Game",
        place_address: "80 Feet Rd, Koramangala 4th Block, Bengaluru, Karnataka 560034",
        rating: 4.8,
        latitude: null,
        longitude: null,
        distance: "3.1 km",
      };

      const html = renderToString(
        <ActivityCard item={activityItem} onTap={() => {}} />
      );

      expect(html).toContain("Mystery Rooms");
      expect(html).toContain("4.8");
      expect(html).toContain("★");
      expect(html).toContain("3.1 km");
      // Locality is not rendered for non-sports cards
      expect(html).not.toContain("Koramangala 4th Block");
    });

    it("keeps Movie cards (MovieCard) with the movie layout (release date, no venue locality line)", () => {
      const movieItem: DiscoveryItem = {
        ...mockSportsItem,
        id: "movie_1",
        title: "Interstellar",
        category: "MOVIES",
        subcategory: "Sci-Fi",
        release_date: "2014-11-07",
        place_address: "PVR Cinemas, Forum Mall, Koramangala, Bengaluru",
      };

      const html = renderToString(
        <MovieCard item={movieItem} onTap={() => {}} />
      );

      expect(html).toContain("Interstellar");
      // MovieCard renders release date, not venue locality line
      expect(html).toContain("Nov 2014");
      expect(html).not.toContain("Koramangala");
    });

    it("renders locality line when DiscoveryCard is passed a SPORTS category item", () => {
      const html = renderToString(
        <DiscoveryCard item={mockSportsItem} onTap={() => {}} />
      );

      expect(html).toContain("Bengaluru Turf Inc.");
      expect(html).toContain("HSR Layout");
      expect(html).toContain("3.3");
      expect(html).toContain("0.0 km");
    });
  });
});

