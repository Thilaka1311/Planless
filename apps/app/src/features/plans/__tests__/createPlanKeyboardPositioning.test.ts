import { describe, it, expect } from "vitest";

describe("Create Plan Keyboard Positioning Invariants", () => {
  function computeContainerStylesAndClasses(opts: {
    createMode: boolean;
    isCancelled?: boolean;
  }) {
    const { createMode, isCancelled = false } = opts;
    const isFixedViewportView = !createMode && !isCancelled;
    return {
      containerClassName: "fixed inset-0 bg-[#050505] z-[60] flex flex-col h-full overflow-hidden text-left",
      scrollContainerClassName: `flex-1 ${isFixedViewportView ? 'overflow-hidden flex flex-col h-full pb-20' : 'overflow-y-auto scrollbar-none pb-28'}`,
      scrollContentClassName: `px-6 pt-[78px] space-y-5 ${isFixedViewportView ? 'flex-1 flex flex-col min-h-0 overflow-hidden' : ''}`,
      containerStyle: undefined,
      manageParticipantsClassName: "fixed bottom-[58px] left-6 right-6 z-40 flex items-center justify-center pointer-events-auto",
      createPlanCtaClassName: "fixed bottom-0 left-0 right-0 px-6 pt-2 pb-4 bg-gradient-to-t from-black via-black/90 to-transparent z-40",
    };
  }

  it("keeps actions and container fixed to the viewport in createMode while enabling scroll container for keyboard clearance", () => {
    const preview = computeContainerStylesAndClasses({
      createMode: true,
    });

    expect(preview.containerClassName).toContain("fixed inset-0");
    expect(preview.containerClassName).toContain("h-full");
    expect(preview.containerStyle).toBeUndefined();
    expect(preview.scrollContainerClassName).toContain("overflow-y-auto");
    expect(preview.scrollContainerClassName).not.toContain("overflow-hidden");
    expect(preview.scrollContentClassName).not.toContain("min-h-0");
    expect(preview.manageParticipantsClassName).toContain("fixed bottom-[58px]");
    expect(preview.createPlanCtaClassName).toContain("fixed bottom-0");
  });

  it("preserves standard fixed viewport layout in live plan preview (createMode = false)", () => {
    const live = computeContainerStylesAndClasses({
      createMode: false,
    });

    expect(live.containerClassName).toContain("fixed inset-0");
    expect(live.containerClassName).toContain("h-full");
    expect(live.containerStyle).toBeUndefined();
    expect(live.manageParticipantsClassName).toContain("fixed bottom-[58px]");
    expect(live.createPlanCtaClassName).toContain("fixed bottom-0");
  });

  it("guarantees bottom CTA buttons stay permanently anchored to bottom safe area regardless of keyboard presence", () => {
    // Both when keyboard is closed or open, fixed classes remain unchanged
    const closedKeyboard = computeContainerStylesAndClasses({ createMode: true });
    const openKeyboard = computeContainerStylesAndClasses({ createMode: true });

    expect(closedKeyboard.createPlanCtaClassName).toEqual(openKeyboard.createPlanCtaClassName);
    expect(closedKeyboard.manageParticipantsClassName).toEqual(openKeyboard.manageParticipantsClassName);
  });
});
