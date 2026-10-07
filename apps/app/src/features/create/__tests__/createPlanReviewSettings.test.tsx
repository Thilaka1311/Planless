import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { CreatePlanActionsBottomSheet } from "../../plans/components/BottomSheets";
import { SelectQuickPlanListBottomSheet } from "../components/SelectQuickPlanListBottomSheet";
import { HeroHeader } from "../../plans/components/HeroHeader";

describe("Create Plan Review Screen Settings & Actions", () => {
  it("renders CreatePlanActionsBottomSheet with plan identity and exactly two actions", () => {
    const html = renderToString(
      <CreatePlanActionsBottomSheet
        isOpen={true}
        onClose={vi.fn()}
        planTitle="Friday Night Football"
        planCoverImage="https://example.com/football.jpg"
        planCategory="sports"
        planSubcategory="football"
        onEditImage={vi.fn()}
        onAddToQuickPlan={vi.fn()}
      />
    );

    // Plan identity
    expect(html).toContain("Friday Night Football");
    expect(html).toContain("Plan Actions");

    // Exactly two options
    expect(html).toContain("Edit plan image");
    expect(html).toContain("Add to quick plan");

    // Verify forbidden actions are completely absent
    expect(html).not.toContain("Edit plan<");
    expect(html).not.toContain("Delete plan");
    expect(html).not.toContain("Cancel plan");
    expect(html).not.toContain("Share<");
    expect(html).not.toContain("Manage participants");
    expect(html).not.toContain("Duplicate");
  });

  it("renders SelectQuickPlanListBottomSheet with list choices and custom lists", () => {
    const mockLists = [
      {
        id: "list-1",
        user_id: "user-1",
        creator_id: "user-1",
        name: "Sports Squad",
        description: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        quick_plans_count: 2,
      },
    ];

    const html = renderToString(
      <SelectQuickPlanListBottomSheet
        isOpen={true}
        onClose={vi.fn()}
        quickPlanLists={mockLists}
        allQuickPlans={[]}
        onSelectList={vi.fn()}
        onCreateAndSelectList={vi.fn()}
      />
    );

    expect(html).toContain("Add to Quick Plan");
    expect(html).toContain("Quick Plans (Default)");
    expect(html).toContain("Save directly to all quick plans");
    expect(html).toContain("Sports Squad");
    expect(html).toContain("2 plans");
    expect(html).toContain("Create new list");
  });

  it("HeroHeader renders MoreVertical button when onOpenMenu is passed", () => {
    const onOpenMenu = vi.fn();
    const html = renderToString(
      <HeroHeader
        title="Dinner at Nobu"
        onClose={vi.fn()}
        isCloseIcon={true}
        onOpenMenu={onOpenMenu}
      />
    );

    expect(html).toContain("Dinner at Nobu");
    expect(html).toContain("immersive-plan-overflow-btn");
    expect(html).toContain("Plan Menu");
  });
});
