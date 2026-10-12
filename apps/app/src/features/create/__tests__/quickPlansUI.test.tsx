import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { QuickPlansSection } from "../components/QuickPlansSection";
import { QuickPlan, QuickPlanList } from "../../../core/types";
import * as quickPlanService from "../services/quickPlanService";

describe("QuickPlansSection UI Component", () => {
  it("renders empty state with 'Add' button when there are 0 quick plans", () => {
    const handleAdd = vi.fn();
    const html = renderToString(
      <QuickPlansSection
        quickPlans={[]}
        onSelectQuickPlan={vi.fn()}
        onAddQuickPlan={handleAdd}
      />
    );

    expect(html).toContain("Quick Plans");
    expect(html).toContain("Create your first Quick Plan");
    expect(html).toContain("Add");
  });

  it("renders saved quick plan cards with title, place, and friends", () => {
    const mockPlans: QuickPlan[] = [
      {
        id: "qp-1",
        creator_id: "user-1",
        name: "Sunday Football",
        category: "SPORTS",
        subcategory: "FOOTBALL",
        place_name: "Rush Koland",
        place_address: "Koramangala",
        default_cost: 0,
        plan_size: 4,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        participants: [
          {
            id: "part-1",
            quick_plan_id: "qp-1",
            user_id: "u-1",
            created_at: new Date().toISOString(),
            user_profile: { id: "u-1", full_name: "Arun" },
          },
          {
            id: "part-2",
            quick_plan_id: "qp-1",
            user_id: "u-2",
            created_at: new Date().toISOString(),
            user_profile: { id: "u-2", full_name: "Rahul" },
          },
        ],
      },
    ];

    const html = renderToString(
      <QuickPlansSection
        quickPlans={mockPlans}
        onSelectQuickPlan={vi.fn()}
        onAddQuickPlan={vi.fn()}
      />
    );

    expect(html).toContain("Sunday Football");
    expect(html).toContain("FOOTBALL · Rush Koland");
    expect(html).toContain("2 friends");
    expect(html).toContain("Use Quick Plan");
    expect(html).toContain("Add Quick Plan");
  });
});

describe("QuickPlansScreen Dedicated Screen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders list-first screen with empty state when user has no lists", async () => {
    vi.spyOn(quickPlanService, "getCachedQuickPlanLists").mockReturnValue([]);
    vi.spyOn(quickPlanService, "getCachedQuickPlans").mockReturnValue([]);

    const { QuickPlansScreen } = await import("../screens/QuickPlansScreen");
    const html = renderToString(
      <QuickPlansScreen
        userId="user-empty"
        onBack={vi.fn()}
        onSelectQuickPlan={vi.fn()}
        onAddQuickPlan={vi.fn()}
      />
    );

    expect(html).toContain("Quick Plans");
    expect(html).toContain("No lists have been made");
    expect(html).not.toContain("No Quick Plan lists yet.");
    expect(html).not.toContain("Organize your quick plans into lists");
    expect(html).toContain("Create List");
    expect(html).toContain("rounded-full");
  });

  it("renders list-first screen showing user's lists and accurate counts", async () => {
    const mockLists: QuickPlanList[] = [
      {
        id: "list-1",
        creator_id: "user-1",
        name: "Football",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        quick_plans_count: 3,
      },
      {
        id: "list-2",
        creator_id: "user-1",
        name: "Movies",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        quick_plans_count: 1,
      },
    ];

    vi.spyOn(quickPlanService, "getCachedQuickPlanLists").mockReturnValue(mockLists);
    vi.spyOn(quickPlanService, "getCachedQuickPlans").mockReturnValue([]);

    const { QuickPlansScreen } = await import("../screens/QuickPlansScreen");
    const html = renderToString(
      <QuickPlansScreen
        userId="user-1"
        onBack={vi.fn()}
        onSelectQuickPlan={vi.fn()}
        onAddQuickPlan={vi.fn()}
      />
    );

    expect(html).toContain("Quick Plans");
    expect(html).toContain("Football");
    expect(html).toContain("3 plans");
    expect(html).toContain("Movies");
    expect(html).toContain("1 plan");
    expect(html).toContain("Create List");
    // Verify grid layout class is present
    expect(html).toContain("grid-cols-2");
  });

  it("renders collections using representative plan cover image", async () => {
    const mockLists: QuickPlanList[] = [
      {
        id: "list-food",
        creator_id: "user-1",
        name: "Dinner",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        quick_plans_count: 1,
      },
    ];

    const mockPlans: QuickPlan[] = [
      {
        id: "qp-toscano",
        creator_id: "user-1",
        quick_plan_list_id: "list-food",
        name: "Dinner at Toscano",
        category: "DINING",
        place_name: "Toscano UB City",
        place_address: "Vittal Mallya Rd",
        cover_image: "https://images.unsplash.com/photo-toscano-pasta.jpg",
        default_cost: 1200,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    vi.spyOn(quickPlanService, "getCachedQuickPlanLists").mockReturnValue(mockLists);
    vi.spyOn(quickPlanService, "getCachedQuickPlans").mockReturnValue(mockPlans);

    const { QuickPlansScreen } = await import("../screens/QuickPlansScreen");
    const html = renderToString(
      <QuickPlansScreen
        userId="user-1"
        onBack={vi.fn()}
        onSelectQuickPlan={vi.fn()}
        onAddQuickPlan={vi.fn()}
      />
    );

    expect(html).toContain("Dinner");
    expect(html).toContain("1 plan");
    expect(html).toContain("https://images.unsplash.com/photo-toscano-pasta.jpg");
  });

  it("renders QuickPlanCard in collection variant with title and friends below, without address", async () => {
    const { QuickPlanCard } = await import("../components/QuickPlanCard");
    const plan: QuickPlan = {
      id: "qp-turf",
      creator_id: "user-1",
      name: "Bengaluru Turf Inc.,",
      category: "SPORTS",
      subcategory: "TURF",
      place_name: "Bengaluru Turf Inc.",
      place_address: "3GQW+G4W, Subbana Layout",
      default_cost: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      participants: [
        {
          id: "p-no-photo",
          quick_plan_id: "qp-turf",
          user_id: "u-1",
          created_at: new Date().toISOString(),
          user_profile: { id: "u-1", full_name: "Bob", profile_photo_path: null },
        },
        {
          id: "p-photo",
          quick_plan_id: "qp-turf",
          user_id: "u-2",
          created_at: new Date().toISOString(),
          user_profile: { id: "u-2", full_name: "Alice", profile_photo_path: "https://example.com/alice.jpg" },
        },
      ],
    };

    const html = renderToString(
      <QuickPlanCard
        plan={plan}
        variant="collection"
        onTap={vi.fn()}
      />
    );

    expect(html).toContain("Bengaluru Turf Inc.,");
    // Address must NOT be displayed in collection variant
    expect(html).not.toContain("3GQW+G4W, Subbana Layout");
    // Friends count displayed
    expect(html).toContain("2 friends");
    // Alice (with photo) appears first before Bob (no photo)
    const aliceIndex = html.indexOf("https://example.com/alice.jpg");
    expect(aliceIndex).toBeGreaterThan(-1);
  });

  it("does not render three-dot overflow buttons on quick plan cards or list cards", async () => {
    const { QuickPlanCard } = await import("../components/QuickPlanCard");
    const plan: QuickPlan = {
      id: "qp-turf",
      creator_id: "user-1",
      name: "Bengaluru Turf Inc.",
      category: "SPORTS",
      place_name: "Bengaluru Turf Inc.",
      place_address: "Subbana Layout",
      default_cost: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const html = renderToString(
      <QuickPlanCard
        plan={plan}
        variant="collection"
        onTap={vi.fn()}
        onLongPress={vi.fn()}
      />
    );

    // Verify there are no three-dot / overflow buttons or aria labels
    expect(html).not.toContain("MoreHorizontal");
    expect(html).not.toContain("overflow-menu");
    expect(html).not.toContain("aria-label=\"Plan options\"");
  });

  it("verifies Rename List bottom sheet styling matches canonical Planless action sheet design", () => {
    const filePath = require("path").resolve(__dirname, "../screens/QuickPlansScreen.tsx");
    const content = require("fs").readFileSync(filePath, "utf-8");

    // Must have Rename List bottom sheet
    expect(content).toContain("Rename List");
    expect(content).toContain("Update the name of this Quick Plan list");

    // Primary action button must be pill with #FF6B2C
    expect(content).toContain('id="edit_list_submit_btn"');
    expect(content).toContain('borderRadius: 9999');
    expect(content).toContain('#FF6B2C');
    expect(content).toContain('height: 40');
    expect(content).toContain('Save Changes');

    // Cancel button must be text-only
    expect(content).toContain('id="edit_list_cancel_btn"');
    expect(content).toContain('color: "rgba(255, 255, 255, 0.4)"');
    expect(content).toContain('background: "none"');
    expect(content).toContain('border: "none"');
  });

  it("verifies Create Quick Plan List bottom sheet styling matches Option 5 Native Planless design", () => {
    const filePath = require("path").resolve(__dirname, "../screens/QuickPlansScreen.tsx");
    const content = require("fs").readFileSync(filePath, "utf-8");

    // Title kept, helper text and suggestions removed
    expect(content).toContain("Create Quick Plan List");
    expect(content).not.toContain("Group your setups into a dedicated list");
    expect(content).not.toContain("Suggestions:");

    // Input has orange border and placeholder 'Enter list name'
    expect(content).toContain('id="new-list-name-input"');
    expect(content).toContain('placeholder="Enter list name"');
    expect(content).toContain('border-[#FF6B2C]');

    // Primary action button is pill with #FF6B2C and label 'Create List'
    expect(content).toContain('id="create_list_submit_btn"');
    expect(content).toContain('borderRadius: 9999');
    expect(content).toContain('#FF6B2C');
    expect(content).toContain('height: 40');
    expect(content).toContain('Create List');

    // Cancel button is text-only secondary action
    expect(content).toContain('id="create_list_cancel_btn"');
    expect(content).toContain('color: "rgba(255, 255, 255, 0.4)"');
    expect(content).toContain('background: "none"');
    expect(content).toContain('border: "none"');
  });

  it("renders refined Quick Plan list empty state when an active list has 0 plans", async () => {
    const mockLists: QuickPlanList[] = [
      {
        id: "list-empty",
        creator_id: "user-1",
        name: "Weekend Squad",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        quick_plans_count: 0,
      },
    ];

    vi.spyOn(quickPlanService, "getCachedQuickPlanLists").mockReturnValue(mockLists);
    vi.spyOn(quickPlanService, "getCachedQuickPlans").mockReturnValue([]);

    const { QuickPlansScreen } = await import("../screens/QuickPlansScreen");
    const html = renderToString(
      <QuickPlansScreen
        userId="user-1"
        initialListId="list-empty"
        onBack={vi.fn()}
        onSelectQuickPlan={vi.fn()}
        onAddQuickPlan={vi.fn()}
      />
    );

    // List title and heading present
    expect(html).toContain("Weekend Squad");
    expect(html).toContain("No Quick Plans in this list yet.");

    // Helper text completely removed
    expect(html).not.toContain("Save a favorite setup");

    // White icon with no orange background / border container
    expect(html).toContain("text-white fill-white");

    // Pill-shaped CTA button without plus icon
    expect(html).toContain("Add Quick Plan");
    expect(html).toContain("rounded-full");
  });

  it("renders individual Quick Plan list screen with 'Quick Plan' heading, list name, back button, and add button", async () => {
    const mockLists: QuickPlanList[] = [
      {
        id: "list-squad",
        creator_id: "user-1",
        name: "Weekend Squad",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        quick_plans_count: 0,
      },
    ];

    vi.spyOn(quickPlanService, "getCachedQuickPlanLists").mockReturnValue(mockLists);
    vi.spyOn(quickPlanService, "getCachedQuickPlans").mockReturnValue([]);

    const { QuickPlansScreen } = await import("../screens/QuickPlansScreen");
    const html = renderToString(
      <QuickPlansScreen
        userId="user-1"
        initialListId="list-squad"
        onBack={vi.fn()}
        onSelectQuickPlan={vi.fn()}
        onAddQuickPlan={vi.fn()}
      />
    );

    // Heading says "Quick Plan"
    expect(html).toContain("Quick Plan");
    // List name is preserved
    expect(html).toContain("Weekend Squad");
    // Back button is present to the left of the heading
    expect(html).toContain('aria-label="Back to lists"');
    // Top-right add button is present
    expect(html).toContain('aria-label="Add Quick Plan"');
  });

  it("renders CreateCategoryScreen with 'Quick Plan' header (not 'Create'), back button, and category cards", async () => {
    const { CreateCategoryScreen } = await import("../screens/CreateCategoryScreen");
    const handleBack = vi.fn();
    const handleSelectCategory = vi.fn();

    const html = renderToString(
      <CreateCategoryScreen
        title="Quick Plan"
        onBack={handleBack}
        onSelectCategory={handleSelectCategory}
      />
    );

    // Header says "Quick Plan", not "Create"
    expect(html).toContain("Quick Plan");
    expect(html).not.toContain("title=\"Create\"");
    // Back button is present
    expect(html).toContain('aria-label="Back"');
    // Category selection instruction is present
    expect(html).toContain("Choose a category.");
    // All 4 categories are present
    expect(html).toContain("Dining");
    expect(html).toContain("Movies");
    expect(html).toContain("Sports");
    expect(html).toContain("Activities");
  });

  it("reuses existing Discovery screens for Dining, Movies, Sports, and Activities with search bar and cards", async () => {
    const { DiscoverDining } = await import("../../discovery/screens/DiscoverDining");
    const { DiscoverMovies } = await import("../../discovery/screens/DiscoverMovies");
    const { DiscoverSports } = await import("../../discovery/screens/DiscoverSports");
    const { DiscoverActivities } = await import("../../discovery/screens/DiscoverActivities");

    // DiscoverDining renders with back button and search bar
    const diningHtml = renderToString(
      <DiscoverDining
        onBack={vi.fn()}
        onSelectDiscoveryItem={vi.fn()}
      />
    );
    expect(diningHtml).toContain("Dining");
    expect(diningHtml).toContain("Search");

    // DiscoverMovies renders with back button and search bar
    const moviesHtml = renderToString(
      <DiscoverMovies
        onBack={vi.fn()}
        onSelectDiscoveryItem={vi.fn()}
      />
    );
    expect(moviesHtml).toContain("Movies");
    expect(moviesHtml).toContain("Search");

    // DiscoverSports renders with back button and search bar
    const sportsHtml = renderToString(
      <DiscoverSports
        onBack={vi.fn()}
        onSelectDiscoveryItem={vi.fn()}
      />
    );
    expect(sportsHtml).toContain("Sports");
    expect(sportsHtml).toContain("Search");

    // DiscoverActivities renders with back button and search bar
    const activitiesHtml = renderToString(
      <DiscoverActivities
        onBack={vi.fn()}
        onSelectDiscoveryItem={vi.fn()}
      />
    );
    expect(activitiesHtml).toContain("Activities");
    expect(activitiesHtml).toContain("Search");
  });

  it("renders discovery content (ForYouSections and discovery cards) underneath category selector", async () => {
    const { CreateCategoryScreen } = await import("../screens/CreateCategoryScreen");
    const mockSections: any[] = [
      {
        id: "dining-trending",
        title: "Trending Restaurants",
        category: "dining",
        items: [
          {
            id: "d1",
            title: "Truffles Koramangala",
            category: "dining",
            cover_image_url: "https://example.com/truffles.jpg",
            location: "Koramangala, Bengaluru",
            rating: 4.5,
          },
        ],
      },
      {
        id: "sports-trending",
        title: "Turfs & Courts",
        category: "sports",
        items: [
          {
            id: "s1",
            title: "Play Arena Turf",
            category: "sports",
            cover_image_url: "https://example.com/turf.jpg",
            location: "Sarjapur Road, Bengaluru",
            rating: 4.6,
          },
        ],
      },
    ];

    const html = renderToString(
      <CreateCategoryScreen
        title="Quick Plan"
        onBack={vi.fn()}
        onSelectCategory={vi.fn()}
        sections={mockSections}
      />
    );

    // Header & Categories preserved
    expect(html).toContain("Quick Plan");
    expect(html).toContain("Dining");
    expect(html).toContain("Movies");
    expect(html).toContain("Sports");
    expect(html).toContain("Activities");

    // Discovery content rendered underneath
    expect(html).toContain("Restaurants");
    expect(html).toContain("Truffles Koramangala");
    expect(html).toContain("Sports");
    expect(html).toContain("Play Arena Turf");
  });
});

