import { describe, it, expect } from "vitest";
import { DiscoveryItem } from "../../../core/types/discovery";
import {
  isFootballItem,
  isBadmintonItem,
  isPickleballItem,
  isTennisItem,
  isBasketballItem,
  isCricketItem,
  isTableTennisItem,
  isOtherSportsItem,
  isPaidBookableVenue,
  SPORTS_CATEGORIES,
} from "../screens/DiscoverSports";

describe("Sports Discovery Suite", () => {
  const createMockItem = (overrides: Partial<DiscoveryItem>): DiscoveryItem => ({
    id: "item-1",
    public_id: "item-1",
    section_id: "sec-sports",
    title: "Test Venue",
    category: "SPORTS",
    subcategory: "Sports Complex",
    description: "A sports place",
    cover_image_url: null,
    location: "Bengaluru",
    suggested_duration_minutes: null,
    suggested_cost_amount: null,
    suggested_capacity: null,
    default_rsvp_offset_minutes: null,
    display_order: 1,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  describe("Venue Filtering (Bookable Venues vs Generic Stores)", () => {
    it("permits legitimate bookable sports venues", () => {
      const turf = createMockItem({
        title: "Tiki Taka Football Turf",
        subcategory: "Sports Complex | Stadium",
      });
      const court = createMockItem({
        title: "Smash Badminton Centre",
        subcategory: "Athletic Field",
      });
      const club = createMockItem({
        title: "Indiranagar Pickleball Club",
        subcategory: "Sports Club",
      });

      expect(isPaidBookableVenue(turf)).toBe(true);
      expect(isPaidBookableVenue(court)).toBe(true);
      expect(isPaidBookableVenue(club)).toBe(true);
    });

    it("excludes generic retail sports stores, shoe stores, and apparel shops", () => {
      const decathlonStore = createMockItem({
        title: "Decathlon Sports India",
        subcategory: "Sporting Goods Store | Department Store",
      });
      const shoeStore = createMockItem({
        title: "Nike Running & Sports Shoes",
        subcategory: "Shoe Store | Clothing Store",
      });
      const generalStore = createMockItem({
        title: "Champion Sporting Goods",
        subcategory: "Sporting Goods Store",
      });

      expect(isPaidBookableVenue(decathlonStore)).toBe(false);
      expect(isPaidBookableVenue(shoeStore)).toBe(false);
      expect(isPaidBookableVenue(generalStore)).toBe(false);
    });

    it("permits retail locations that explicitly house an active playing turf or court facility", () => {
      const arenaWithStore = createMockItem({
        title: "Decathlon Anubhava Football Turf & Arena",
        subcategory: "Sporting Goods Store | Sports Complex",
      });
      expect(isPaidBookableVenue(arenaWithStore)).toBe(true);
    });
  });

  describe("Sports Category Grouping", () => {
    it("correctly identifies Football venues (turfs, 5-a-side, grounds)", () => {
      const item1 = createMockItem({ title: "Koramangala 5-a-side Football Turf" });
      const item2 = createMockItem({ title: "Arena Futsal Ground" });
      const item3 = createMockItem({ subcategory: "Football Facility" });

      expect(isFootballItem(item1)).toBe(true);
      expect(isFootballItem(item2)).toBe(true);
      expect(isFootballItem(item3)).toBe(true);
      expect(isBadmintonItem(item1)).toBe(false);
    });

    it("correctly identifies Badminton venues (courts, centres, facilities)", () => {
      const item1 = createMockItem({ title: "Whitefield Badminton Court" });
      const item2 = createMockItem({ subcategory: "Badminton Centre" });
      const item3 = createMockItem({ description: "Indoor wooden shuttle courts" });

      expect(isBadmintonItem(item1)).toBe(true);
      expect(isBadmintonItem(item2)).toBe(true);
      expect(isBadmintonItem(item3)).toBe(true);
      expect(isFootballItem(item1)).toBe(false);
    });

    it("correctly identifies Pickleball venues (courts, clubs, facilities)", () => {
      const item1 = createMockItem({ title: "Bangalore Pickleball Club" });
      const item2 = createMockItem({ description: "4 regulation pickleball courts with floodlights" });

      expect(isPickleballItem(item1)).toBe(true);
      expect(isPickleballItem(item2)).toBe(true);
      expect(isTennisItem(item1)).toBe(false);
    });

    it("correctly identifies Tennis venues while distinguishing from Table Tennis", () => {
      const tennisItem = createMockItem({ title: "Vantage Clay Tennis Academy" });
      const tableTennisItem = createMockItem({ title: "Spin Table Tennis Centre" });

      expect(isTennisItem(tennisItem)).toBe(true);
      expect(isTennisItem(tableTennisItem)).toBe(false);

      expect(isTableTennisItem(tableTennisItem)).toBe(true);
      expect(isTableTennisItem(tennisItem)).toBe(false);
    });

    it("correctly identifies Basketball venues", () => {
      const item1 = createMockItem({ title: "Dunk Basketball Court" });
      const item2 = createMockItem({ subcategory: "Basketball Facility" });

      expect(isBasketballItem(item1)).toBe(true);
      expect(isBasketballItem(item2)).toBe(true);
    });

    it("correctly identifies Cricket venues (grounds, nets, facilities)", () => {
      const item1 = createMockItem({ title: "Powerplay Cricket Nets & Ground" });
      const item2 = createMockItem({ description: "Box cricket pitch with bowling machine" });

      expect(isCricketItem(item1)).toBe(true);
      expect(isCricketItem(item2)).toBe(true);
    });

    it("preserves multi-sport venue membership across multiple sports", () => {
      const multiSport = createMockItem({
        title: "Active Arena Sports Complex",
        description: "5-a-side football turf, 4 badminton courts, and 2 cricket nets",
      });

      expect(isFootballItem(multiSport)).toBe(true);
      expect(isBadmintonItem(multiSport)).toBe(true);
      expect(isCricketItem(multiSport)).toBe(true);
      expect(isPickleballItem(multiSport)).toBe(false);
    });

    it("identifies other sports (swimming, squash, golf, gym/complexes)", () => {
      const pool = createMockItem({ title: "Olympian Swimming Pool" });
      const complex = createMockItem({ title: "Sarjapur Sports Complex & Gym" });

      expect(isOtherSportsItem(pool)).toBe(true);
      expect(isOtherSportsItem(complex)).toBe(true);
    });
  });

  describe("Sports Screen Category Configuration", () => {
    it("does not include 'Other Sports' option in SPORTS_CATEGORIES", () => {
      const otherCategory = SPORTS_CATEGORIES.find((cat) => cat.id === "other" || cat.label === "Other Sports");
      expect(otherCategory).toBeUndefined();
    });

    it("maintains the exact intended sport category filters", () => {
      const categoryIds = SPORTS_CATEGORIES.map((cat) => cat.id);
      expect(categoryIds).toEqual([
        "all",
        "football",
        "badminton",
        "pickleball",
        "tennis",
        "basketball",
        "cricket",
        "table-tennis",
      ]);

      const categoryLabels = SPORTS_CATEGORIES.map((cat) => cat.label);
      expect(categoryLabels).toEqual([
        "All",
        "Football",
        "Badminton",
        "Pickleball",
        "Tennis",
        "Basketball",
        "Cricket",
        "Table Tennis",
      ]);
    });
  });
});

