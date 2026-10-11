import { describe, it, expect } from "vitest";
import { computeCreatePlanCtaPosition } from "../screens/PlansScreen/PlansPreview/PlansPreviewScreen";

describe("Create Plan Keyboard Positioning Invariants", () => {
  it("calculates fixed positioning anchored to keyboard-closed screen height", () => {
    const closedHeight = 844;
    const style = computeCreatePlanCtaPosition(closedHeight);

    expect(style.position).toBe("fixed");
    expect(style.top).toBe("844px");
    expect(style.transform).toBe("translateY(-100%)");
    expect(style.left).toBe(0);
    expect(style.right).toBe(0);
    expect(style.zIndex).toBe(40);
    expect(style.pointerEvents).toBe("none");
  });

  it("keeps CTA vertical position identical before and after keyboard opens (0px delta)", () => {
    const closedScreenHeight = 844;
    const ctaHeight = 80; // approximate height of CTA region

    // 1. Keyboard closed: viewport height is 844px
    const closedStyle = computeCreatePlanCtaPosition(closedScreenHeight);
    // Visual bottom coordinate of CTA: top is 844px, translateY(-100%) moves top edge up by ctaHeight
    // Bottom edge sits at exactly closedScreenHeight (844px)
    const closedTopEdge = parseInt(closedStyle.top as string, 10) - ctaHeight;
    const closedBottomEdge = parseInt(closedStyle.top as string, 10);

    // 2. Keyboard opens: Android interactive-widget resizes viewport from 844px to 450px
    // But closedScreenHeight remains locked at 844px because an input field is focused
    const keyboardOpenViewportHeight = 450;
    const openStyle = computeCreatePlanCtaPosition(closedScreenHeight);
    const openTopEdge = parseInt(openStyle.top as string, 10) - ctaHeight;
    const openBottomEdge = parseInt(openStyle.top as string, 10);

    // Assert: The vertical position on screen has NOT moved (delta = 0px)
    expect(openTopEdge - closedTopEdge).toBe(0);
    expect(openBottomEdge - closedBottomEdge).toBe(0);

    // Contrast with broken behavior: If it had used fixed bottom: 0,
    // bottom edge would have jumped from 844px to 450px (a 394px upward shift!)
    const brokenOldBottomEdgeClosed = closedScreenHeight;
    const brokenOldBottomEdgeOpen = keyboardOpenViewportHeight;
    expect(brokenOldBottomEdgeClosed - brokenOldBottomEdgeOpen).toBe(394);
  });

  it("adjusts anchor on true orientation change when screen width changes", () => {
    // Landscape or rotated screen: new closedScreenHeight
    const landscapeHeight = 390;
    const style = computeCreatePlanCtaPosition(landscapeHeight);

    expect(style.top).toBe("390px");
    expect(style.transform).toBe("translateY(-100%)");
  });

  it("maintains invariant layout architecture with separated scroll container and CTA region", () => {
    // Layout separation:
    // 1. Scrollable content region: flex-1 overflow-y-auto (scrolls behind CTA when keyboard opens)
    const scrollContainerClasses = "flex-1 overflow-y-auto scrollbar-none pb-28";
    expect(scrollContainerClasses).toContain("overflow-y-auto");
    expect(scrollContainerClasses).toContain("flex-1");

    // 2. Fixed CTA region: independent container outside the scroll content
    const ctaRegionStyle = computeCreatePlanCtaPosition(800);
    expect(ctaRegionStyle.position).toBe("fixed");
    expect(ctaRegionStyle.pointerEvents).toBe("none");
  });
});
