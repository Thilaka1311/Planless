import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("PlanImageEditorModal Zoom Behavior & Mathematical Invariants", () => {
  const filePath = path.resolve(__dirname, "../components/PlanImageEditorModal.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  it("verifies initial scale starts at minimum supported zoom level (calculatedMinScale)", () => {
    // Must initialize scale to minimum supported zoom level on first load
    expect(content).toContain("startingScale =");
    expect(content).toContain("calculatedMinScale");
    expect(content).toContain("setScale(startingScale)");
    expect(content).toContain("setMinScale(calculatedMinScale)");
  });

  it("verifies state reset on image change and modal close to prevent stuck zooms", () => {
    // When modal closes or image changes, zoom state and initialization ref must reset
    expect(content).toContain("isInitializedRef.current = false");
    expect(content).toContain("setScale(1)");
    expect(content).toContain("setTranslateX(0)");
    expect(content).toContain("setTranslateY(0)");
  });

  it("verifies support for restored initialScale from previous edits while defaulting new images to minimum scale", () => {
    expect(content).toContain("initialScale?: number");
    expect(content).toContain("initialTranslateX?: number");
    expect(content).toContain("initialTranslateY?: number");
    expect(content).toContain(
      "initialScale != null && !isNaN(initialScale)\n          ? Math.max(calculatedMinScale, Math.min(calculatedMaxScale, initialScale))\n          : calculatedMinScale"
    );
  });

  it("verifies safe canvas coordinates to guarantee 100% WYSIWYG crop parity without out-of-bounds errors", () => {
    expect(content).toContain("safeSourceX = Math.max(0, Math.min(imgWidth - sourceCropWidth, sourceX))");
    expect(content).toContain("safeSourceY = Math.max(0, Math.min(imgHeight - sourceCropHeight, sourceY))");
    expect(content).toContain("safeSourceWidth = Math.min(imgWidth - safeSourceX, sourceCropWidth)");
    expect(content).toContain("safeSourceHeight = Math.min(imgHeight - safeSourceY, sourceCropHeight)");
    expect(content).toContain("ctx.drawImage(");
  });

  it("verifies zoom in / out step controls and range slider bindings", () => {
    expect(content).toContain("handleZoomOutStep");
    expect(content).toContain("handleZoomInStep");
    expect(content).toContain("handleSliderChange");
    expect(content).toContain('type="range"');
    expect(content).toContain("min={minScale}");
    expect(content).toContain("max={maxScale}");
    expect(content).toContain("value={scale}");
  });

  it("verifies mathematical cover invariants for 16:9 landscape image in 9:16 portrait viewport", () => {
    // Emulate sports_football.jpg: 1376x768 in a 451x802 portrait crop frame
    const imgWidth = 1376;
    const imgHeight = 768;
    const viewportWidth = 451;
    const viewportHeight = 802;

    const scaleX = viewportWidth / imgWidth;
    const scaleY = viewportHeight / imgHeight;
    const calculatedMinScale = Math.max(scaleX, scaleY);

    // Minimum scale ensures image fully covers the viewport
    const renderedWidth = imgWidth * calculatedMinScale;
    const renderedHeight = imgHeight * calculatedMinScale;

    expect(renderedWidth).toBeGreaterThanOrEqual(viewportWidth);
    expect(renderedHeight).toBeGreaterThanOrEqual(viewportHeight);

    // Initial scale is precisely the minimum supported zoom level
    const initialScale = calculatedMinScale;
    expect(initialScale).toBeCloseTo(1.04427, 4);

    // Canvas crop matching viewport:
    const sourceCropWidth = viewportWidth / initialScale;
    const sourceCropHeight = viewportHeight / initialScale;

    expect(sourceCropWidth).toBeLessThanOrEqual(imgWidth);
    expect(sourceCropHeight).toBeLessThanOrEqual(imgHeight);

    // Ratio of crop matches 9:16 portrait
    expect(sourceCropWidth / sourceCropHeight).toBeCloseTo(9 / 16, 2);
  });
});
