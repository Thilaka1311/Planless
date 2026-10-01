import { describe, it, expect } from "vitest";
import { getHeroMetadataCostText } from "../components/HeroMetadataCard";

describe("Plan Total Cost Model", () => {
  it("displays fixed total cost regardless of participant count or capacity", () => {
    // 5 joined, total cost 500
    const plan5Joined = {
      id: "p1",
      total_cost: 500,
      plan_size: 5,
      members: new Array(5).fill({}),
    };
    expect(getHeroMetadataCostText(plan5Joined, plan5Joined)).toBe("₹500");

    // 10 joined, total cost 500
    const plan10Joined = {
      id: "p1",
      total_cost: 500,
      plan_size: 10,
      members: new Array(10).fill({}),
    };
    expect(getHeroMetadataCostText(plan10Joined, plan10Joined)).toBe("₹500");

    // 20 joined, total cost 500
    const plan20Joined = {
      id: "p1",
      total_cost: 500,
      plan_size: 20,
      members: new Array(20).fill({}),
    };
    expect(getHeroMetadataCostText(plan20Joined, plan20Joined)).toBe("₹500");
  });

  it("never includes '/ person' or per-person text in displayed cost", () => {
    const plan = {
      id: "p2",
      total_cost: 1000,
      plan_size: 4,
    };
    const result = getHeroMetadataCostText(plan, plan);
    expect(result).toBe("₹1,000");
    expect(result).not.toContain("/ person");
    expect(result).not.toContain("/person");
    expect(result).not.toContain("each");
  });

  it("returns null when total_cost is 0 or not configured", () => {
    expect(getHeroMetadataCostText({ total_cost: 0 }, null)).toBeNull();
    expect(getHeroMetadataCostText(null, null)).toBeNull();
  });
});
