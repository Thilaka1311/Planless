import React from "react";
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

describe("Profile Name & About Save CTA Buttons Styling", () => {
  it("verifies Name screen Save button is fully pill-shaped (rounded-full)", () => {
    const filePath = path.resolve(__dirname, "../screens/Name.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Must be rounded-full (border-radius 9999px)
    expect(content).toContain("rounded-full font-bold text-xs");
    expect(content).not.toContain("rounded-xl font-bold text-xs");
    // Preserves existing orange background and white text
    expect(content).toContain("bg-[#FF6B2C]");
    expect(content).toContain("text-white");
    expect(content).toContain("py-3.5");
  });

  it("verifies About screen Save button is fully pill-shaped (rounded-full)", () => {
    const filePath = path.resolve(__dirname, "../screens/About.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Must be rounded-full (border-radius 9999px)
    expect(content).toContain("rounded-full font-bold text-xs");
    expect(content).not.toContain("rounded-xl font-bold text-xs");
    // Preserves existing orange background and white text
    expect(content).toContain("bg-[#FF6B2C]");
    expect(content).toContain("text-white");
    expect(content).toContain("py-3.5");
  });
});
