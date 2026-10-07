import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { CreatePlanConfirmation } from "../../../create/components/CreatePlanConfirmation";

describe("CreatePlanConfirmation Action Hiding & Centering", () => {
  it("renders 'Friday plans', 'Plan Created!', and omits Share and Go to Plans CTAs when hideActions is true", () => {
    const html = renderToString(
      <CreatePlanConfirmation
        planTitle="Friday plans"
        hideActions={true}
        initialStage="content"
        onGoToPlans={() => {}}
        onCopyInviteLink={() => {}}
      />
    );

    expect(html).toContain("Friday plans");
    expect(html).toContain("Plan Created!");
    expect(html).not.toContain("Share");
    expect(html).not.toContain("Go to Plans");
    expect(html).toContain("justify-center items-center");
  });

  it("renders Share and Go to Plans CTAs when hideActions is false (default production behavior)", () => {
    const html = renderToString(
      <CreatePlanConfirmation
        planTitle="Weekend Hike"
        hideActions={false}
        initialStage="content"
        onGoToPlans={() => {}}
        onCopyInviteLink={() => {}}
      />
    );

    expect(html).toContain("Weekend Hike");
    expect(html).toContain("Plan Created!");
    expect(html).toContain("Share");
    expect(html).toContain("Go to Plans");
    expect(html).toContain("justify-between");
  });
});
