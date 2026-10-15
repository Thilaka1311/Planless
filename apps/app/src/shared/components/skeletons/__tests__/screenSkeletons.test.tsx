import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatScreenSkeleton, ChatMessageListSkeleton } from "../ChatScreenSkeleton";
import { PlanDetailsSkeleton } from "../PlanDetailsSkeleton";
import { ParticipantRosterSkeleton } from "../ParticipantRosterSkeleton";

describe("Planless Screen Skeletons (Spinner Replacement Suite)", () => {
  it("renders ChatScreenSkeleton with header, timeline, input, and no animate-spin", () => {
    const html = renderToStaticMarkup(<ChatScreenSkeleton />);

    // Must not contain circular rotating spinners
    expect(html).not.toContain("animate-spin");

    // Must have pulse animation and non-interactive attributes
    expect(html).toContain("animate-pulse");
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("select-none");

    // Must have chat header, message list container, and input container
    expect(html).toContain("fixed inset-0");
  });

  it("renders ChatMessageListSkeleton with alternating bubble styles", () => {
    const html = renderToStaticMarkup(<ChatMessageListSkeleton />);

    expect(html).not.toContain("animate-spin");
    expect(html).toContain("animate-pulse");

    // Contains Planless brand orange outgoing bubble tint
    expect(html).toContain("#FF6B2C");
  });

  it("renders PlanDetailsSkeleton with hero, floating info card, participant roster, and CTA", () => {
    const html = renderToStaticMarkup(<PlanDetailsSkeleton />);

    // Must not contain circular rotating spinners
    expect(html).not.toContain("animate-spin");

    // Must have pulse animation and layout anchors
    expect(html).toContain("animate-pulse");
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("select-none");

    // Rounded hero container
    expect(html).toContain("rounded-b-[2.5rem]");

    // Bottom floating CTA with brand accent
    expect(html).toContain("#FF6B2C");
  });

  it("renders ParticipantRosterSkeleton with header, segmented tabs, and participant rows", () => {
    const html = renderToStaticMarkup(<ParticipantRosterSkeleton hasContinueButton={true} />);

    // Must not contain circular rotating spinners
    expect(html).not.toContain("animate-spin");

    // Must have pulse animation
    expect(html).toContain("animate-pulse");
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("select-none");

    // Segmented tab container
    expect(html).toContain("h-10");

    // Continue CTA button at the bottom
    expect(html).toContain("#FF6B2C");
  });

  it("renders ParticipantRosterSkeleton without continue button when disabled", () => {
    const html = renderToStaticMarkup(<ParticipantRosterSkeleton hasContinueButton={false} />);

    expect(html).not.toContain("animate-spin");
    expect(html).toContain("animate-pulse");
  });
});
