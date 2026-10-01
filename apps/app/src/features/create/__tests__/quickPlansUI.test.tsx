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
    expect(html).toContain("No Quick Plan lists yet.");
    expect(html).toContain("Create List");
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
});

