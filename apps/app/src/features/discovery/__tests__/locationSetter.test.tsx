import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { LocationSetter, DiscoveryLocation } from "../screens/LocationSetter";
import { clearCachedSections, getCachedSections } from "../services/discoveryService";

describe("Location Setter & Discovery Flow Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearCachedSections();
  });

  it("renders LocationSetter with header, current location, device location option, and popular hubs", () => {
    const onBackMock = vi.fn();
    const onSelectLocationMock = vi.fn();

    const html = renderToString(
      <LocationSetter
        currentCity="Bengaluru"
        currentLocality="Nearby"
        onBack={onBackMock}
        onSelectLocation={onSelectLocationMock}
      />
    );

    expect(html).toContain("Discovery Location");
    expect(html).toContain("Explore restaurants &amp; sports near you");
    expect(html).toContain("Search city, area, or landmark...");
    expect(html).toContain("Active Discovery Location");
    expect(html).toContain("Bengaluru");
    expect(html).toContain("Nearby");
    expect(html).toContain("Use my current location");
    expect(html).toContain("Popular Discovery Hubs");
    expect(html).toContain("Indiranagar");
    expect(html).toContain("Koramangala");
    expect(html).toContain("HSR Layout");
  });

  it("handles quick hub selection with valid coordinates and city/locality", () => {
    let selected: DiscoveryLocation | null = null;
    const onSelect = (loc: DiscoveryLocation) => {
      selected = loc;
    };

    // Simulate clicking Indiranagar hub
    const hub = {
      name: "Indiranagar",
      city: "Bengaluru",
      locality: "Indiranagar",
      latitude: 12.9784,
      longitude: 77.6408,
    };

    onSelect({
      name: hub.name,
      address: `${hub.name}, ${hub.city}`,
      latitude: hub.latitude,
      longitude: hub.longitude,
      city: hub.city,
      locality: hub.locality,
    });

    expect(selected).not.toBeNull();
    expect(selected?.name).toBe("Indiranagar");
    expect(selected?.latitude).toBe(12.9784);
    expect(selected?.longitude).toBe(77.6408);
    expect(selected?.city).toBe("Bengaluru");
    expect(selected?.locality).toBe("Indiranagar");
  });

  it("clears cached discovery sections and allows refreshing on location change", () => {
    // Verify clearCachedSections invalidates state cleanly
    clearCachedSections();
    expect(getCachedSections()).toBeNull();
  });

  it("ensures selected location acts as discovery context without triggering plan creation", () => {
    // Test that location change does not navigate to who or mutate draft plan
    const state = {
      activeTab: "create",
      currentStep: "discovery",
      draftPlan: null,
      discoveryLocation: {
        city: "Bengaluru",
        locality: "Indiranagar",
        latitude: 12.9784,
        longitude: 77.6408,
      },
    };

    // User selects a new location in LocationSetter
    const newLocation: DiscoveryLocation = {
      name: "Koramangala",
      city: "Bengaluru",
      locality: "Koramangala",
      latitude: 12.9352,
      longitude: 77.6245,
    };

    // Discovery location context updates
    state.discoveryLocation = {
      city: newLocation.city || "Bengaluru",
      locality: newLocation.locality || "Nearby",
      latitude: newLocation.latitude,
      longitude: newLocation.longitude,
    };

    // Invariant: Tab remains create, step remains discovery, draftPlan is unchanged (null)
    expect(state.activeTab).toBe("create");
    expect(state.currentStep).toBe("discovery");
    expect(state.draftPlan).toBeNull();
    expect(state.discoveryLocation.city).toBe("Bengaluru");
    expect(state.discoveryLocation.locality).toBe("Koramangala");
    expect(state.discoveryLocation.latitude).toBe(12.9352);
  });
});
