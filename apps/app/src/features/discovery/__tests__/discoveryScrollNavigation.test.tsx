import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { BrowseExperiencesStep } from "../screens/Discovery";

vi.mock("../services/discoveryService", () => ({
  getSectionsByCategory: vi.fn().mockResolvedValue([]),
  getCachedSections: vi.fn().mockReturnValue([]),
  clearCachedSections: vi.fn(),
}));

vi.mock("../services/placeOverridesService", () => ({
  subscribePlaceOverrides: vi.fn().mockReturnValue(() => {}),
}));

vi.mock("../hooks/useUserLocation", () => ({
  useUserLocation: () => ({
    discoveryLocation: { city: "Bengaluru", locality: "Vidyaranyapura" },
    coordinates: { latitude: 12.9716, longitude: 77.5946 },
    cityName: "Bengaluru",
    localityName: "Vidyaranyapura",
    setDiscoveryLocation: vi.fn(),
  }),
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

describe("Discovery Scroll Navigation", () => {
  it("wraps only location, search, and quick plans inside the sticky header container, while categories are scrollable content outside it", () => {
    const html = renderToString(
      <BrowseExperiencesStep
        userProfile={{ name: "Thilak" }}
        setActiveTab={vi.fn()}
        onSelectDiscoveryItem={vi.fn()}
        onSelectCustomPlan={vi.fn()}
      />
    );

    // Sticky header container present with dark background and border
    expect(html).toContain('class="sticky top-0 z-30 bg-[#000000] shrink-0 border-b border-white/[0.04]"');

    // Extract the content inside the sticky <header>...</header>
    const headerMatch = html.match(/<header class="sticky top-0 z-30 bg-\[#000000\] shrink-0 border-b border-white\/\[0\.04\]"[^>]*>([\s\S]*?)<\/header>/);
    expect(headerMatch).not.toBeNull();
    const headerContent = headerMatch![1];

    // Sticky header must contain location, search, and quick plans
    expect(headerContent).toContain("Vidyaranyapura");
    expect(headerContent).toContain("Bengaluru");
    expect(headerContent).toContain('aria-label="Search"');
    expect(headerContent).toContain('aria-label="Quick Plans"');

    // Categories must NOT be inside the sticky header
    expect(headerContent).not.toContain("Dining");
    expect(headerContent).not.toContain("Movies");
    expect(headerContent).not.toContain("Sports");
    expect(headerContent).not.toContain("Activities");

    // But all 4 categories must still exist in the overall scrollable page html
    expect(html).toContain("Dining");
    expect(html).toContain("Movies");
    expect(html).toContain("Sports");
    expect(html).toContain("Activities");
  });

  it("renders a floating back-to-top button centered below the sticky header", () => {
    const html = renderToString(
      <BrowseExperiencesStep
        userProfile={{ name: "Thilak" }}
        setActiveTab={vi.fn()}
        onSelectDiscoveryItem={vi.fn()}
        onSelectCustomPlan={vi.fn()}
      />
    );

    // Back to top button rendered with aria-label and fixed centered classes
    expect(html).toContain('aria-label="Back to top"');
    expect(html).toContain("fixed top-[68px] left-1/2 -translate-x-1/2 z-30");
    // Initially hidden / opacity-0 at the top
    expect(html).toContain("opacity-0 scale-90 pointer-events-none");
  });
});
