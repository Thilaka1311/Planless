import { describe, it, expect } from "vitest";
import { CORE_STATIC_IMAGES, preloadCoreStaticAssets } from "../coreStaticAssets";

describe("coreStaticAssets", () => {
  it("exports all required core static images as valid strings", () => {
    expect(CORE_STATIC_IMAGES.length).toBeGreaterThanOrEqual(4);
    CORE_STATIC_IMAGES.forEach((imgSrc) => {
      expect(typeof imgSrc).toBe("string");
      expect(imgSrc.length).toBeGreaterThan(0);
    });
  });

  it("can call preloadCoreStaticAssets safely in any environment without throwing", () => {
    expect(() => preloadCoreStaticAssets()).not.toThrow();
  });
});
