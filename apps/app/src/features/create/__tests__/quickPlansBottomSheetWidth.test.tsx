import React from "react";
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

describe("QuickPlansScreen Bottom Sheet Full Width Responsiveness (Prompt 2)", () => {
  it("ensures all bottom sheets in QuickPlansScreen are full-width and never constrained by max-w", () => {
    const filePath = path.resolve(__dirname, "../screens/QuickPlansScreen.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Must not contain max-w-md mx-auto or max-w-sm mx-auto on any bottom sheet motion div
    expect(content).not.toContain("pointer-events-auto max-w-md mx-auto");
    expect(content).not.toContain("pointer-events-auto max-w-sm mx-auto");

    // All bottom sheets must use w-full
    const fullWidthMatches = content.match(/pointer-events-auto w-full/g);
    expect(fullWidthMatches).not.toBeNull();
    expect(fullWidthMatches!.length).toBeGreaterThanOrEqual(5);
  });
});
