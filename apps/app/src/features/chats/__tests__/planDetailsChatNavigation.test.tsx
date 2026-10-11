import React from "react";
import { describe, it, expect, vi } from "vitest";
import { HeroHeader } from "../../plans/components/HeroHeader";
import { getRoutePath, parseCurrentRoute } from "../../navigation/appRouter";
import { cleanPlanId } from "../../plans/utils/planUtils";
import { PlanChatScreen } from "../screens/PlanChatScreen";
import { renderToString } from "react-dom/server";

describe("Plan Details Chat Navigation Bug", () => {
  it("renders three-dot overflow button on HeroHeader when onOpenChat is provided", () => {
    const handleChat = vi.fn();
    const html = renderToString(
      <HeroHeader
        title="Badminton Session"
        creatorName="Thilak"
        onClose={vi.fn()}
        isHost={true}
        onOpenChat={handleChat}
      />
    );

    expect(html).toContain('id="immersive-plan-overflow-btn"');
    expect(html).toContain('title="Plan Menu"');
  });

  it("canonical router generates /plans/:id/chat when both selectedPlanId and selectedChatPlanId are active", () => {
    const path = getRoutePath({
      tab: "plans",
      selectedPlanId: "plan-12345",
      selectedChatPlanId: "plan-12345",
    });

    expect(path).toBe("/plans/plan-12345/chat");
  });

  it("parseCurrentRoute correctly parses /plans/:id/chat into tab plans with selectedPlanId and selectedChatPlanId", () => {
    (globalThis as any).window = {
      location: new URL("http://localhost/plans/plan-abc/chat"),
    };

    const parsed = parseCurrentRoute();
    expect(parsed.tab).toBe("plans");
    expect(parsed.selectedPlanId).toBe("plan-abc");
    expect(parsed.selectedChatPlanId).toBe("plan-abc");

    delete (globalThis as any).window;
  });

  it("cleanPlanId strips carousel loop duplicate suffixes to prevent unresolvable plan IDs", () => {
    expect(cleanPlanId("1234-loop-prev-dup")).toBe("1234");
    expect(cleanPlanId("5678-loop-next-dup")).toBe("5678");
    expect(cleanPlanId("normal-uuid-1234")).toBe("normal-uuid-1234");
  });

  it("renders graceful fallback error state with Go Back button in PlanChatScreen when plan is not found", () => {
    const handleBack = vi.fn();
    const html = renderToString(
      <PlanChatScreen
        planId="non-existent-plan-id"
        onBack={handleBack}
      />
    );

    expect(html).toContain("Unable to open chat");
    expect(html).toContain("Go Back");
  });
});
