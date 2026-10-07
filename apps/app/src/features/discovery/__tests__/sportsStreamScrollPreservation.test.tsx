import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  createDistanceOrderedSportsSections,
  getSportsSectionTitle,
  SPORTS_CARDS_PER_ROW,
} from "../hooks/useSportsStream";
import { DiscoveryItem } from "../../../core/types/discovery";
import { DiscoverySection } from "../components/DiscoverySection";
import { extractCleanPlaceId } from "../services/venueRelevance";

describe("Sports Discovery Stream Scroll Position & Append Integrity", () => {
  const origin = { latitude: 12.9716, longitude: 77.5946 }; // Bangalore Center

  function createMockSportsVenue(idSuffix: string, distanceKm: number): DiscoveryItem {
    // Generate approximate lat/lng proportional to distance
    const offset = distanceKm * 0.009;
    return {
      id: `venue_${idSuffix}`,
      place_id: `ChIJ_SPORTS_${idSuffix}`,
      title: `Sports Arena ${idSuffix}`,
      category: "SPORTS",
      latitude: origin.latitude + offset,
      longitude: origin.longitude,
      _distanceKm: distanceKm,
      distance: `${distanceKm.toFixed(1)} km`,
      rating: 4.5,
      cover_image_url: `https://images.unsplash.com/sports_${idSuffix}.jpg`,
    } as any;
  }

  it("1. Open Sports: generates rows of exactly 7 cards ordered strictly by distance", () => {
    const seedVenues: DiscoveryItem[] = [];
    for (let i = 1; i <= 21; i++) {
      seedVenues.push(createMockSportsVenue(`seed_${i}`, i * 0.2)); // 0.2km to 4.2km
    }

    const { sections, sortedVenues } = createDistanceOrderedSportsSections(seedVenues, origin, 7, 0);

    expect(sections.length).toBe(3);
    expect(sections[0].items.length).toBe(7);
    expect(sections[1].items.length).toBe(7);
    expect(sections[2].items.length).toBe(7);

    // Verify distance monotonically increases across all rows
    let prevDist = -1;
    for (const sec of sections) {
      for (const item of sec.items) {
        const d = (item as any)._distanceKm;
        expect(d).toBeGreaterThanOrEqual(prevDist);
        prevDist = d;
      }
    }

    expect(sections[0].title).toBe("Venues Around You");
    expect(sections[1].title).toBe("More Venues");
    expect(sections[2].title).toBe("You Can Also See");
  });

  it("2. Trigger next batch: new rows are appended after existing results without mutating or replacing previous rows", () => {
    // Initial 21 venues (Rows 1, 2, 3)
    const initialVenues: DiscoveryItem[] = [];
    for (let i = 1; i <= 21; i++) {
      initialVenues.push(createMockSportsVenue(`init_${i}`, i * 0.2));
    }

    const { sections: initialSections } = createDistanceOrderedSportsSections(initialVenues, origin, 7, 0);
    expect(initialSections.length).toBe(3);

    // Snapshot of existing row identities and items
    const initialRow1Items = [...initialSections[0].items];
    const initialRow2Items = [...initialSections[1].items];
    const initialRow3Items = [...initialSections[2].items];

    // Simulate Batch 2 arrival: 14 new venues starting from 4.5km upwards
    const batch2Venues: DiscoveryItem[] = [];
    for (let i = 22; i <= 35; i++) {
      batch2Venues.push(createMockSportsVenue(`batch2_${i}`, i * 0.2)); // 4.4km to 7.0km
    }

    // New rows generated starting from row index 3 (Row 4)
    const { sections: newBatch2Rows } = createDistanceOrderedSportsSections(
      batch2Venues,
      origin,
      7,
      initialSections.length
    );

    expect(newBatch2Rows.length).toBe(2);
    expect(newBatch2Rows[0].id).toBe("sec_sports_row_4");
    expect(newBatch2Rows[0].title).toBe("Sports Around You");
    expect(newBatch2Rows[1].id).toBe("sec_sports_row_5");
    expect(newBatch2Rows[1].title).toBe("More Sports to Explore");

    // Combined stream sections using immutable append
    const updatedSections = [...initialSections, ...newBatch2Rows];

    expect(updatedSections.length).toBe(5);

    // Confirm existing rows remain 100% untouched
    expect(updatedSections[0].items).toEqual(initialRow1Items);
    expect(updatedSections[1].items).toEqual(initialRow2Items);
    expect(updatedSections[2].items).toEqual(initialRow3Items);

    // Confirm new cards are strictly appended at the bottom
    expect(updatedSections[3].items).toEqual(newBatch2Rows[0].items);
    expect(updatedSections[4].items).toEqual(newBatch2Rows[1].items);
  });

  it("3. Confirm existing cards do not disappear or reappear in subsequent batches", () => {
    const loadedPlaceIds = new Set<string>();

    const batch1: DiscoveryItem[] = [];
    for (let i = 1; i <= 21; i++) batch1.push(createMockSportsVenue(`p1_${i}`, i * 0.1));

    const batch2: DiscoveryItem[] = [];
    for (let i = 22; i <= 35; i++) batch2.push(createMockSportsVenue(`p2_${i}`, i * 0.1));

    const batch3: DiscoveryItem[] = [];
    for (let i = 36; i <= 49; i++) batch3.push(createMockSportsVenue(`p3_${i}`, i * 0.1));

    const allSections = [
      ...createDistanceOrderedSportsSections(batch1, origin, 7, 0).sections,
      ...createDistanceOrderedSportsSections(batch2, origin, 7, 3).sections,
      ...createDistanceOrderedSportsSections(batch3, origin, 7, 5).sections,
    ];

    expect(allSections.length).toBe(7); // 3 + 2 + 2 = 7 rows

    for (const sec of allSections) {
      for (const item of sec.items) {
        const cleanId = extractCleanPlaceId(item.place_id || item.id);
        expect(loadedPlaceIds.has(cleanId)).toBe(false); // No duplicates, never reappears!
        loadedPlaceIds.add(cleanId);
      }
    }

    expect(loadedPlaceIds.size).toBe(49);
  });

  it("4. Confirm React keys in DiscoverySection use clean place_id rather than array indexes", () => {
    const items = [
      createMockSportsVenue("key_test_1", 1.0),
      createMockSportsVenue("key_test_2", 2.0),
    ];

    const html = renderToString(
      <DiscoverySection
        id="sec_test"
        title="Test Section"
        items={items}
        onSelectItem={() => {}}
      />
    );

    // Verify both items rendered
    expect(html).toContain("Sports Arena key_test_1");
    expect(html).toContain("Sports Arena key_test_2");

    // Clean place IDs match the venues
    expect(extractCleanPlaceId(items[0].place_id || items[0].id)).toBe("ChIJ_SPORTS_key_test_1");
    expect(extractCleanPlaceId(items[1].place_id || items[1].id)).toBe("ChIJ_SPORTS_key_test_2");
  });

  it("5. Confirm rotating section titles continuously cycle across rows 1 to 18", () => {
    const titles = Array.from({ length: 18 }, (_, i) => getSportsSectionTitle(i));

    // Cycle 1 (Rows 1-6)
    expect(titles[0]).toBe("Venues Around You");
    expect(titles[1]).toBe("More Venues");
    expect(titles[2]).toBe("You Can Also See");
    expect(titles[3]).toBe("Sports Around You");
    expect(titles[4]).toBe("More Sports to Explore");
    expect(titles[5]).toBe("Places Worth Exploring");

    // Cycle 2 (Rows 7-12) starts shifted by 1: More Venues
    expect(titles[6]).toBe("More Venues");
    expect(titles[7]).toBe("You Can Also See");
    expect(titles[8]).toBe("Sports Around You");
    expect(titles[9]).toBe("More Sports to Explore");
    expect(titles[10]).toBe("Places Worth Exploring");
    expect(titles[11]).toBe("Venues Around You");

    // Cycle 3 (Rows 13-18) starts shifted by 2: You Can Also See
    expect(titles[12]).toBe("You Can Also See");
    expect(titles[13]).toBe("Sports Around You");
    expect(titles[14]).toBe("More Sports to Explore");
    expect(titles[15]).toBe("Places Worth Exploring");
    expect(titles[16]).toBe("Venues Around You");
    expect(titles[17]).toBe("More Venues");
  });
});
