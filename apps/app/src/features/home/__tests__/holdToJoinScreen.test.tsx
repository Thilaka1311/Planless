import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { HeroHeader } from "../../plans/components/HeroHeader";

describe("Hold to Join - Hero Header Excluded Elements", () => {
  it("renders back button and overflow button with no-hold class in preview mode", () => {
    const html = renderToString(
      <HeroHeader
        title="Cricket Match"
        creatorName="Rohit"
        onClose={vi.fn()}
        isHost={true}
        onOpenChat={vi.fn()}
        onOpenSettings={vi.fn()}
        onSharePlanLink={vi.fn()}
      />
    );

    // Back button must have id and no-hold class
    expect(html).toContain('id="immersive-plan-back-btn"');
    expect(html).toContain('no-hold');

    // Overflow button must have id and no-hold class
    expect(html).toContain('id="immersive-plan-overflow-btn"');
    expect(html).toContain('no-hold');
  });

  it("renders settings button with no-hold class in chat header mode", () => {
    const html = renderToString(
      <HeroHeader
        title="Cricket Match"
        hideHostAttribution={true}
        onClose={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    );

    expect(html).toContain('id="immersive-plan-settings-btn"');
    expect(html).toContain('no-hold');
  });
});
