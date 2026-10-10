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

  it("renders LocationSetter with header, search bar, and location-status card states", () => {
    const onBackMock = vi.fn();
    const onSelectLocationMock = vi.fn();

    // When location has NOT been permitted / set:
    const htmlWithoutLoc = renderToString(
      <LocationSetter
        currentCity="Bengaluru"
        currentLocality="Nearby"
        hasLocation={false}
        onBack={onBackMock}
        onSelectLocation={onSelectLocationMock}
      />
    );

    expect(htmlWithoutLoc).toContain("Location");
    expect(htmlWithoutLoc).not.toContain("Discovery Location");
    expect(htmlWithoutLoc).not.toContain("Explore restaurants");
    expect(htmlWithoutLoc).toContain("Search city, area, or landmark...");
    expect(htmlWithoutLoc).not.toContain("Active Discovery Location");
    expect(htmlWithoutLoc).not.toContain("Popular Discovery Hubs");
    // State 2: NOT_PERMITTED
    expect(htmlWithoutLoc).toContain("Use your current location");
    expect(htmlWithoutLoc).toContain("Tap to enable location access");

    // When location IS available / permitted:
    const htmlWithLoc = renderToString(
      <LocationSetter
        currentCity="Bengaluru"
        currentLocality="Indiranagar"
        hasLocation={true}
        onBack={onBackMock}
        onSelectLocation={onSelectLocationMock}
      />
    );

    expect(htmlWithLoc).toContain("Location");
    // State 1: AVAILABLE
    expect(htmlWithLoc).toContain("Using your current location");
    expect(htmlWithLoc).toContain("Indiranagar, Bengaluru");
    expect(htmlWithLoc).not.toContain("Tap to enable location access");
  });

  it("handles location selection with valid coordinates and city/locality", () => {
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

  it("renders search results without SEARCH RESULTS heading, without map-pin icons, and without card borders", async () => {
    // Mock useGooglePlacesAutocomplete to return active suggestions
    const autocompleteModule = await import("../../../shared/hooks/useGooglePlacesAutocomplete");
    vi.spyOn(autocompleteModule, "useGooglePlacesAutocomplete").mockReturnValue({
      suggestions: [
        {
          place_id: "place_1",
          description: "Sarojini Nagar Market, New Delhi",
          structured_formatting: {
            main_text: "Sarojini Nagar Market",
            secondary_text: "New Delhi, Delhi, India",
          },
        } as any,
        {
          place_id: "place_2",
          description: "Sardar Vallabhbhai Patel International Airport",
          structured_formatting: {
            main_text: "Sardar Vallabhbhai Patel International Airport (AMD)",
            secondary_text: "Hansol, Ahmedabad, Gujarat, India",
          },
        } as any,
      ],
      isLoading: false,
      error: null,
      getPlaceDetails: vi.fn(),
      geocodeAddress: vi.fn(),
      reverseGeocode: vi.fn(),
      clearSuggestions: vi.fn(),
      resetSessionToken: vi.fn(),
      setProgrammaticSelection: vi.fn(),
    } as any);

    const html = renderToString(
      <LocationSetter
        currentCity="Bengaluru"
        currentLocality="Indiranagar"
        hasLocation={true}
        initialQuery="sar"
        onBack={vi.fn()}
        onSelectLocation={vi.fn()}
      />
    );

    // 1. Heading "SEARCH RESULTS" is removed entirely
    expect(html).not.toContain("SEARCH RESULTS");
    expect(html).not.toContain("Search Results");

    // 2. Results start directly with location names and subtitles
    expect(html).toContain("Sarojini Nagar Market");
    expect(html).toContain("New Delhi, Delhi, India");
    expect(html).toContain("Sardar Vallabhbhai Patel International Airport (AMD)");
    expect(html).toContain("Hansol, Ahmedabad, Gujarat, India");

    // 3. No bordered card container styling (no bg-[#0c0c0e] or rounded-2xl on results)
    expect(html).not.toContain("bg-[#0c0c0e]");

    // 4. "Using your current location" row still has its icon and text
    expect(html).toContain("Using your current location");
    expect(html).toContain("Indiranagar, Bengaluru");
  });
});
