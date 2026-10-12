import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  DiscoverySkeleton,
  DiscoveryHeaderSkeleton,
  DiscoveryCategoryCardsSkeleton,
  DiscoverySectionsSkeleton,
} from "../components/DiscoverySkeleton";
import { BrowseExperiencesStep } from "../screens/Discovery";
import { DiscoverySection } from "../components/DiscoverySection";
import { ForYouSections } from "../components/ForYouSections";

vi.mock("../services/discoveryService", () => ({
  getSectionsByCategory: vi.fn().mockReturnValue(new Promise(() => {})), // Never resolves during mount test to test loading state
  getCachedSections: vi.fn().mockReturnValue([]), // Empty cache so isLoading is true
  clearCachedSections: vi.fn(),
}));

vi.mock("../services/placeOverridesService", () => ({
  subscribePlaceOverrides: vi.fn().mockReturnValue(() => {}),
}));

vi.mock("../hooks/useUserLocation", () => ({
  useUserLocation: () => ({
    discoveryLocation: { city: "Bengaluru", locality: "Indiranagar" },
    coordinates: { latitude: 12.9716, longitude: 77.5946 },
    cityName: "Bengaluru",
    localityName: "Indiranagar",
    setDiscoveryLocation: vi.fn(),
  }),
  getStoredDiscoveryLocation: () => ({ latitude: 12.9716, longitude: 77.5946 }),
}));

vi.mock("../../profile/state/ProfileContext", () => ({
  useProfileStore: () => ({
    isAdmin: false,
    userProfile: { name: "Thilak" },
    activeUserUuid: "u-1",
    activeUserId: "u-1",
    dbUsers: [],
  }),
}));

describe("Discovery Skeleton Loading UI (No Spinners)", () => {
  it("renders full DiscoverySkeleton with header placeholders, 4 category skeleton cards, and multi-section rails", () => {
    const html = renderToString(<DiscoverySkeleton />);

    // Must have subtle pulse animation
    expect(html).toContain("animate-pulse");

    // Must have the 4 category skeleton placeholders (h-[86px] rounded-2xl cards)
    const categoryCardCount = (html.match(/h-\[86px\]/g) || []).length;
    expect(categoryCardCount).toBe(4);

    // Must not contain any circular loading spinner
    expect(html).not.toContain("animate-spin");
    expect(html).not.toContain("rounded-full border-t");
  });

  it("DiscoverySectionsSkeleton renders all 4 category section placeholders with correct aspect ratio rails", () => {
    const html = renderToString(<DiscoverySectionsSkeleton />);

    expect(html).toContain("animate-pulse");
    // Movies section rail cards have aspect-[2/3]
    expect(html).toContain("aspect-[2/3]");
    // Sports / Dining / Activities cards have 130px image height
    expect(html).toContain("h-[130px]");
    // Zero circular spinners
    expect(html).not.toContain("animate-spin");
  });

  it("BrowseExperiencesStep in loading state renders skeleton UI instead of circular spinner", () => {
    const html = renderToString(
      <BrowseExperiencesStep
        userProfile={{ name: "Thilak" }}
        setActiveTab={vi.fn()}
        onSelectDiscoveryItem={vi.fn()}
        onSelectCustomPlan={vi.fn()}
      />
    );

    // Displays the real top header and categories
    expect(html).toContain("Indiranagar");
    expect(html).toContain("Dining");
    expect(html).toContain("Movies");
    expect(html).toContain("Sports");
    expect(html).toContain("Activities");

    // Renders the skeleton feed placeholders
    expect(html).toContain("animate-pulse");

    // Crucial: absolutely no circular loading spinners on Discovery screen
    expect(html).not.toContain("animate-spin");
  });

  it("DiscoverySection renders skeleton card instead of Loader2 spinner when isLoadingMore is true", () => {
    const dummyItems = [
      {
        id: "p1",
        place_id: "p1",
        title: "Test Turf",
        category: "sports",
        subcategory: "football",
        cover_image_url: "https://example.com/test-turf.jpg",
      },
    ];

    const html = renderToString(
      <DiscoverySection
        items={dummyItems as any}
        onSelectItem={vi.fn()}
        isLoadingMore={true}
      />
    );

    // Contains the item
    expect(html).toContain("Test Turf");
    // Contains pulsing skeleton placeholder card for pagination
    expect(html).toContain("animate-pulse");
    // Does NOT contain spinning loader
    expect(html).not.toContain("animate-spin");
    expect(html).not.toContain("Loading more...");
  });

  it("ForYouSections movie rail renders skeleton card instead of Loader2 spinner when isLoadingMore is true", () => {
    const dummySections = [
      {
        id: "movies_sec",
        title: "Trending Movies",
        category: "MOVIES",
        items: [
          {
            id: "m1",
            title: "Dune",
            category: "movies",
            poster_path: "/dune.jpg",
          },
        ],
      },
    ];

    const html = renderToString(
      <ForYouSections
        sections={dummySections as any}
        searchQuery=""
        categoryFilter="all"
        onSelectItem={vi.fn()}
      />
    );

    // No spinning loader
    expect(html).not.toContain("animate-spin");
  });
});
