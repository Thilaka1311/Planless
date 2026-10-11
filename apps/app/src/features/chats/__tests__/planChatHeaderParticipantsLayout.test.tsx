import React from "react";
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("PlanChatScreen Header & Participants Tab Layout", () => {
  it("dynamically measures the header height and does not use hardcoded 96px padding", () => {
    const filePath = path.resolve(__dirname, "../screens/PlanChatScreen.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Must not have the old hardcoded 96px padding
    expect(content).not.toContain("pt-[calc(96px+env(safe-area-inset-top,0px))]");

    // Must have dynamic header measurement
    expect(content).toContain("headerRef = useRef<HTMLDivElement>(null)");
    expect(content).toContain("const [headerHeight, setHeaderHeight] = useState<number>(0)");
    expect(content).toContain("ref={headerRef}");

    // Must apply dynamic paddingTop to containerRef
    expect(content).toContain("paddingTop: headerHeight > 0 ? `${headerHeight}px`");
  });
});
