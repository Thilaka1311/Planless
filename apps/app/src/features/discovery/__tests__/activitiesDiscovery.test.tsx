import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import {
  DiscoveryCard,
  ActivityCard,
  resolveVenueCategories,
} from "../components/DiscoveryCard";
import { DiscoverySection } from "../components/DiscoverySection";
import { ForYouSections } from "../components/ForYouSections";
import { DiscoverActivities } from "../screens/DiscoverActivities";
import { DiscoveryItem, DiscoverySection as DiscoverySectionType } from "../../../core/types/discovery";
import { getSectionsByCategory, clearCachedSections } from "../services/discoveryService";
import { supabase } from "../../../../lib/supabaseClient";

describe("Activities Discovery Category Suite", () => {
  beforeEach(() => {
    clearCachedSections();
    vi.restoreAllMocks();
  });

  const mockActivityItem: DiscoveryItem = {
    id: "item_activity_1",
    public_id: "public_activity_1",
    section_id: "sec_activities",
    title: "Mystery Rooms Koramangala",
    category: "ACTIVITIES",
    subcategory: "Mystery Rooms",
    description: "Real life escape game experience with immersive puzzles",
    cover_image_url: "/assets/Activities.png",
    location: "Koramangala, Bangalore",
    suggested_duration_minutes: 60,
    suggested_cost_amount: 900,
    suggested_capacity: 6,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    place_id: "place_act_123",
    place_address: "100 Feet Rd, Koramangala, Bangalore",
    latitude: 12.9352,
    longitude: 77.6245,
    distance: "1.5 km",
    rating: 4.8,
  };

  const mockBowlingItem: DiscoveryItem = {
    id: "item_bowling_1",
    public_id: "public_bowling_1",
    section_id: "sec_activities",
    title: "Amoeba Cosmic Bowling",
    category: "ACTIVITIES",
    subcategory: "Bowling",
    description: "Cosmic bowling alley with arcade games",
    cover_image_url: "/assets/Activities.png",
    location: "Church Street, Bangalore",
    suggested_duration_minutes: 90,
    suggested_cost_amount: 500,
    suggested_capacity: 6,
    default_rsvp_offset_minutes: 30,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    place_id: "place_act_456",
    latitude: 12.9752,
    longitude: 77.6045,
    rating: 4.5,
  };

  describe("Activity Category Resolution & Card Rendering", () => {
    it("correctly resolves category labels for activities", () => {
      expect(resolveVenueCategories(mockActivityItem)).toContain("Mystery Rooms");
      expect(resolveVenueCategories(mockBowlingItem)).toContain("Bowling");

      const kartItem: DiscoveryItem = {
        ...mockActivityItem,
        title: "Torq03 Karting",
        subcategory: null,
      };
      expect(resolveVenueCategories(kartItem)).toContain("Go-Karting");

      const arcadeItem: DiscoveryItem = {
        ...mockActivityItem,
        title: "Timezone Gaming Zone",
        subcategory: null,
      };
      expect(resolveVenueCategories(arcadeItem)).toContain("Arcades");
    });

    it("renders semantic ActivityCard with standard dimensions (220x225px) and pink accent", () => {
      const html = renderToString(
        <ActivityCard
          item={mockActivityItem}
          isAdmin={false}
          onTap={vi.fn()}
        />
      );

      expect(html).toContain("width:220px");
      expect(html).toContain("height:225px");
      expect(html).toContain("Mystery Rooms Koramangala");
      expect(html).toContain("4.8");
      expect(html).toContain("★");
      expect(html).not.toContain("100 Feet Rd"); // Full address omitted from main card
    });
  });

  describe("DiscoverActivities Screen UI", () => {
    const mockSections: DiscoverySectionType[] = [
      {
        id: "places_activities",
        public_id: "places_activities",
        category: "ACTIVITIES",
        title: "Activities",
        description: "Recreational activities nearby",
        display_order: 4,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [mockActivityItem, mockBowlingItem],
      },
    ];

    it("renders dedicated Activities screen with ArrowLeft, pink subtitle, search bar, and pink chips", () => {
      const html = renderToString(
        <DiscoverActivities
          sections={mockSections}
          isAdmin={false}
          onBack={vi.fn()}
          onSelectDiscoveryItem={vi.fn()}
          currentCity="Bengaluru"
        />
      );

      // Header
      expect(html).toContain("Activities");
      expect(html).toContain("Discover fun things to do");
      expect(html).toContain("text-pink-400");

      // Search bar
      expect(html).toContain("search-activities-input");
      expect(html).toContain("Search activities, places...");

      // Pink chips
      expect(html).toContain("Bowling");
      expect(html).toContain("Mystery Rooms");
      expect(html).toContain("Mini Golf");
      expect(html).toContain("Go-Karting");
      expect(html).toContain("Amusement Parks");
      expect(html).toContain("Arcades");
      expect(html).toContain("Adventure &amp; Fun");
      expect(html).toContain("bg-pink-500"); // Selected 'All' chip

      // Content section
      expect(html).toContain("Mystery Rooms Koramangala");
    });
  });

  describe("Activities in Main Create Feed (ForYouSections)", () => {
    it("renders 'Activities near you' section with pink accent in ForYouSections", () => {
      const mockSections: DiscoverySectionType[] = [
        {
          id: "places_dining",
          public_id: "places_dining",
          category: "DINING",
          title: "Dining",
          description: "Food",
          display_order: 1,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          items: [],
        },
        {
          id: "places_activities",
          public_id: "places_activities",
          category: "ACTIVITIES",
          title: "Activities",
          description: "Activities",
          display_order: 4,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          items: [mockActivityItem],
        },
      ];

      const html = renderToString(
        <ForYouSections
          sections={mockSections}
          searchQuery=""
          categoryFilter="activities"
          onSelectItem={vi.fn()}
          onViewAllCategory={vi.fn()}
        />
      );

      expect(html).toContain("Activities near you");
      expect(html).not.toContain("Great places to do something together");
      expect(html).toContain("Mystery Rooms Koramangala");
    });
  });

  describe("Places API Discovery Service integration for ACTIVITIES", () => {
    it("includes ACTIVITIES in primary categories when fetching category 'all'", async () => {
      const mockInvoke = vi.spyOn(Object.getPrototypeOf(supabase.functions) as any, "invoke").mockResolvedValue({
        data: {
          sections: [
            {
              id: "places_activities",
              public_id: "places_activities",
              category: "ACTIVITIES",
              title: "Activities",
              description: "Activities nearby",
              display_order: 4,
              status: "ACTIVE",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              items: [mockActivityItem],
            },
          ],
        },
        error: null,
      });

      const sections = await getSectionsByCategory("all", true);
      expect(sections.some((s) => s.category === "ACTIVITIES")).toBe(true);

      mockInvoke.mockRestore();
    });
  });
});
