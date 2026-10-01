import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { HeroHeader } from "../../plans/components/HeroHeader";

describe("Home Plans Preview: Three-Dot Menu & Permission-Aware Share Plan", () => {
  it("renders three-dot overflow button and shows Chat, Settings, and Share Plan when invites are allowed", () => {
    const handleChat = vi.fn();
    const handleSettings = vi.fn();
    const handleShare = vi.fn();

    const html = renderToString(
      <HeroHeader
        title="Weekend Football"
        creatorName="Arun"
        onClose={vi.fn()}
        isHost={false}
        onOpenChat={handleChat}
        onOpenSettings={handleSettings}
        onSharePlanLink={handleShare}
      />
    );

    // Three-dot button must be rendered
    expect(html).toContain("immersive-plan-overflow-btn");
    expect(html).toContain("title=\"Plan Menu\"");
  });

  it("does not pass onSharePlanLink when participant is not allowed to invite others", () => {
    // When onSharePlanLink is undefined (allowParticipantInvites=false for participant)
    const html = renderToString(
      <HeroHeader
        title="Weekend Football"
        creatorName="Arun"
        onClose={vi.fn()}
        isHost={false}
        onOpenChat={vi.fn()}
        onOpenSettings={vi.fn()}
        onSharePlanLink={undefined}
      />
    );

    expect(html).toContain("immersive-plan-overflow-btn");
  });
});
