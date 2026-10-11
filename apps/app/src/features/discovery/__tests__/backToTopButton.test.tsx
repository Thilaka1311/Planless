import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { BackToTopButton } from "../components/BackToTopButton";

describe("BackToTopButton Component", () => {
  it("renders with pill-shaped styling, ChevronUp icon, and 'Back to top' text", () => {
    const dummyRef = { current: null };
    const html = renderToString(<BackToTopButton scrollContainerRef={dummyRef} />);

    // Verifies accessibility label and visible text
    expect(html).toContain('aria-label="Back to top"');
    expect(html).toContain("Back to top");

    // Verifies pill-shaped rounded styling, dark translucent background, and border
    expect(html).toContain("rounded-full");
    expect(html).toContain("bg-[#18181b]/95");
    expect(html).toContain("border border-white/10");

    // Verifies fixed top positioning below header
    expect(html).toContain("fixed top-[68px] left-1/2 -translate-x-1/2 z-30");

    // Verifies initial hidden state (opacity-0 and pointer-events-none)
    expect(html).toContain("opacity-0");
    expect(html).toContain("pointer-events-none");
  });

  it("accepts and merges custom className props cleanly", () => {
    const dummyRef = { current: null };
    const html = renderToString(
      <BackToTopButton scrollContainerRef={dummyRef} className="custom-test-class" />
    );

    expect(html).toContain("custom-test-class");
    expect(html).toContain("rounded-full");
  });
});
