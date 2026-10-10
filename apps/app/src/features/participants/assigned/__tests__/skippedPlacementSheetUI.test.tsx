import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("AssignedParticipantActions - Skipped Placement Sheet UI", () => {
  const filePath = path.resolve(__dirname, "../AssignedParticipantActions.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  it("ensures 'How should they be added?' text has been completely removed", () => {
    expect(content).not.toContain("How should they be added?");
  });

  it("verifies 'Increase plan size' button uses white text and green background", () => {
    expect(content).toContain("Increase plan size");
    // Look for the Increase plan size button style block
    const match = content.match(/background:\s*'rgba\(5,\s*150,\s*105,\s*0\.12\)'[\s\S]*?color:\s*'#FFFFFF'[\s\S]*?Increase plan size/);
    expect(match).not.toBeNull();
  });

  it("verifies 'Add to waitlist' button preserves orange text and background", () => {
    expect(content).toContain("Add to waitlist");
    const match = content.match(/background:\s*'rgba\(180,\s*83,\s*9,\s*0\.12\)'[\s\S]*?color:\s*'#F59E0B'[\s\S]*?Add to waitlist/);
    expect(match).not.toBeNull();
  });

  it("preserves participant avatar, name, and Cancel button in step 2", () => {
    expect(content).toContain("selectedItem.avatar");
    expect(content).toContain("selectedItem.name");
    expect(content).toContain("Cancel");
  });
});
