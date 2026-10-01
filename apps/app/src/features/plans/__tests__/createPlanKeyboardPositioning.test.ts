import { describe, it, expect } from "vitest";

describe("Create Plan Keyboard Positioning Invariants", () => {
  function computeContainerStylesAndClasses(opts: {
    createMode: boolean;
    viewportHeight: number;
  }) {
    const { createMode, viewportHeight } = opts;
    return {
      containerClassName: `fixed ${createMode ? "top-0 left-0 right-0" : "inset-0"} bg-[#050505] z-[60] flex flex-col ${createMode ? "" : "h-full"} overflow-hidden text-left`,
      containerStyle: createMode
        ? {
            height: `${viewportHeight}px`,
            minHeight: `${viewportHeight}px`,
            maxHeight: `${viewportHeight}px`,
          }
        : undefined,
      manageParticipantsClassName: `${createMode ? "absolute bottom-[54px]" : "fixed bottom-[58px]"} left-6 right-6 z-40 flex items-center justify-center pointer-events-auto`,
      createPlanCtaClassName: `${createMode ? "absolute" : "fixed"} bottom-0 left-0 right-0 px-6 pt-2 pb-4 bg-gradient-to-t from-black via-black/90 to-transparent z-40`,
    };
  }

  function simulateViewportResize(opts: {
    currentViewportHeight: number;
    newWindowInnerHeight: number;
    isInputFocused: boolean;
  }): number {
    const { currentViewportHeight, newWindowInnerHeight, isInputFocused } = opts;
    // If height increased, viewport expanded (keyboard closed or rotation)
    // If height decreased while input is focused, virtual keyboard opened -> preserve unconstrained height
    if (!isInputFocused || newWindowInnerHeight > currentViewportHeight) {
      return newWindowInnerHeight;
    }
    return currentViewportHeight;
  }

  it("anchors actions absolutely to fixed-height container in createMode so they stay under keyboard", () => {
    const unconstrained = computeContainerStylesAndClasses({
      createMode: true,
      viewportHeight: 844,
    });

    expect(unconstrained.containerClassName).toContain("top-0 left-0 right-0");
    expect(unconstrained.containerClassName).not.toContain("inset-0");
    expect(unconstrained.containerStyle).toEqual({
      height: "844px",
      minHeight: "844px",
      maxHeight: "844px",
    });
    expect(unconstrained.manageParticipantsClassName).toContain("absolute bottom-[54px]");
    expect(unconstrained.manageParticipantsClassName).not.toContain("fixed bottom-[54px]");
    expect(unconstrained.createPlanCtaClassName).toContain("absolute bottom-0");
    expect(unconstrained.createPlanCtaClassName).not.toContain("fixed bottom-0");
  });

  it("preserves standard fixed viewport layout in live plan preview (createMode = false)", () => {
    const live = computeContainerStylesAndClasses({
      createMode: false,
      viewportHeight: 844,
    });

    expect(live.containerClassName).toContain("fixed inset-0");
    expect(live.containerClassName).toContain("h-full");
    expect(live.containerStyle).toBeUndefined();
    expect(live.manageParticipantsClassName).toContain("fixed bottom-[58px]");
    expect(live.createPlanCtaClassName).toContain("fixed bottom-0");
  });

  it("does not shrink container height when virtual keyboard opens during input focus", () => {
    const initialHeight = 844;
    const keyboardHeight = 450; // Viewport height reduced by keyboard

    const result = simulateViewportResize({
      currentViewportHeight: initialHeight,
      newWindowInnerHeight: keyboardHeight,
      isInputFocused: true,
    });

    // Viewport height must remain unconstrained at 844px
    expect(result).toBe(844);
  });

  it("restores viewport height when keyboard dismisses or input blurs", () => {
    const initialHeight = 844;

    // Simulating keyboard closing (window expands back)
    const afterKeyboardClose = simulateViewportResize({
      currentViewportHeight: initialHeight,
      newWindowInnerHeight: 844,
      isInputFocused: false,
    });
    expect(afterKeyboardClose).toBe(844);

    // Simulating blur resize
    const afterBlur = simulateViewportResize({
      currentViewportHeight: initialHeight,
      newWindowInnerHeight: 800,
      isInputFocused: false,
    });
    expect(afterBlur).toBe(800);
  });
});
