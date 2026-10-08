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

describe("Discovery Header Layout (Request 2)", () => {
  it("renders Vidyaranyapura (locality) on top line and Bengaluru (city) on second line", () => {
    const html = renderToString(
      <BrowseExperiencesStep
        userProfile={{ name: "Thilak" }}
        setActiveTab={vi.fn()}
        onSelectDiscoveryItem={vi.fn()}
        onSelectCustomPlan={vi.fn()}
      />
    );

    // Primary label is Vidyaranyapura
    expect(html).toContain("Vidyaranyapura");
    // Secondary label is Bengaluru
    expect(html).toContain("Bengaluru");

    // Primary label occurs before secondary label
    const localityIndex = html.indexOf("Vidyaranyapura");
    const cityIndex = html.indexOf("Bengaluru");
    expect(localityIndex).toBeLessThan(cityIndex);
  });

  it("renders location pin and quick plans icons without circular wrapper containers and with grey styling", () => {
    const html = renderToString(
      <BrowseExperiencesStep
        userProfile={{ name: "Thilak" }}
        setActiveTab={vi.fn()}
        onSelectDiscoveryItem={vi.fn()}
        onSelectCustomPlan={vi.fn()}
      />
    );

    // There should be no circular outlined wrappers with orange background/borders
    expect(html).not.toContain("rounded-full bg-white/[0.05] border border-white/[0.08]");
    expect(html).not.toContain("bg-[#FF6B2C]/10 border border-[#FF6B2C]/30");
    // Both icons styled with neutral grey
    expect(html).toContain("text-zinc-400");
  });
});
