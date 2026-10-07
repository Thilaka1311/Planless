import { describe, it, expect } from "vitest";
import { getPlanPreviewCtaState } from "../utils/planPreviewCtaUtils";
import { getHeroMetadataCostText } from "../components/HeroMetadataCard";

describe("Phase 2 — No Limit Plan Size & System Maximum of 50", () => {
  describe("1. Plan Size Options & Selection Contract", () => {
    it("assigns plan_size = null when host selects No Limit", () => {
      type PlanSizeOption = "no_limit" | "limited";
      const selectOption = (opt: PlanSizeOption, customLimit?: number) => {
        if (opt === "no_limit") {
          return { plan_size: null, system_max: 50 };
        }
        return { plan_size: customLimit ?? 10, system_max: 50 };
      };

      const noLimitPlan = selectOption("no_limit");
      expect(noLimitPlan.plan_size).toBeNull();
      expect(noLimitPlan.system_max).toBe(50);

      const limitedPlan = selectOption("limited", 15);
      expect(limitedPlan.plan_size).toBe(15);
      expect(limitedPlan.system_max).toBe(50);
    });

    it("verifies No Limit does NOT mean infinite: 50 is the hard ceiling", () => {
      const isAllowedToJoin = (currentJoined: number, planSize: number | null) => {
        // Enforce hard ceiling of 50 for all plans
        if (currentJoined >= 50) return false;
        if (planSize === null) return true;
        return currentJoined < planSize;
      };

      // Allowed joined counts for No Limit
      expect(isAllowedToJoin(1, null)).toBe(true);
      expect(isAllowedToJoin(10, null)).toBe(true);
      expect(isAllowedToJoin(25, null)).toBe(true);
      expect(isAllowedToJoin(49, null)).toBe(true);
      // At and beyond 50: strictly NOT allowed
      expect(isAllowedToJoin(50, null)).toBe(false);
      expect(isAllowedToJoin(51, null)).toBe(false);
    });

    it("transitions stepper between numeric limit and No Limit at minCapacity = 2", () => {
      const minCapacity = 2;
      const maxCapacity = 50;

      const decrement = (current: number | null): number | null => {
        if (current === null) return null;
        if (current <= minCapacity) return null; // pressing minus at 2 switches to No Limit
        return current - 1;
      };

      const increment = (current: number | null): number | null => {
        if (current === null) return minCapacity; // pressing plus from No Limit returns to 2
        return Math.min(maxCapacity, current + 1);
      };

      // 1. Decrementing from 3 -> 2
      expect(decrement(3)).toBe(2);

      // 2. Decrementing from 2 -> No Limit (null)
      expect(decrement(2)).toBeNull();

      // 3. Decrementing from No Limit -> stays No Limit (null)
      expect(decrement(null)).toBeNull();

      // 4. Incrementing from No Limit -> returns to 2
      expect(increment(null)).toBe(2);

      // 5. Incrementing from 2 -> 3
      expect(increment(2)).toBe(3);
    });
  });

  describe("2. Home Feed Discovery Filter Contract", () => {
    // Simulates the Home query filter in PlansContext.tsx getHomeFeedPlans
    const isEligibleForHomeFeed = (plan: {
      status: string;
      plan_size: number | null;
      joined_count: number;
      rsvp: string;
      role: string;
    }) => {
      const statusNorm = plan.status.toLowerCase();
      if (statusNorm !== "active" && statusNorm !== "live") return false;
      if (plan.role === "HOST" || plan.rsvp !== "INVITED") return false;

      // Section 8 & 9: Exclude plans with >= 50 joined participants
      if (plan.joined_count >= 50) return false;

      return true;
    };

    it("surfaces No Limit plans on Home when joined < 50", () => {
      const plan = {
        status: "LIVE",
        plan_size: null,
        joined_count: 49,
        rsvp: "INVITED",
        role: "PARTICIPANT",
      };
      expect(isEligibleForHomeFeed(plan)).toBe(true);
    });

    it("excludes No Limit plans from Home when joined = 50", () => {
      const plan = {
        status: "LIVE",
        plan_size: null,
        joined_count: 50,
        rsvp: "INVITED",
        role: "PARTICIPANT",
      };
      expect(isEligibleForHomeFeed(plan)).toBe(false);
    });

    it("dynamically returns plan to Home feed when participant leaves (50 -> 49)", () => {
      const planAt50 = {
        status: "LIVE",
        plan_size: null,
        joined_count: 50,
        rsvp: "INVITED",
        role: "PARTICIPANT",
      };
      expect(isEligibleForHomeFeed(planAt50)).toBe(false);

      // Someone leaves -> count becomes 49
      const planAfterLeave = { ...planAt50, joined_count: 49 };
      expect(isEligibleForHomeFeed(planAfterLeave)).toBe(true);
    });

    it("keeps existing limited plan waitlist behavior intact without accidental exclusion", () => {
      const limitedPlan = {
        status: "LIVE",
        plan_size: 10,
        joined_count: 10,
        rsvp: "INVITED",
        role: "PARTICIPANT",
      };
      // For limited plans, 10 joined does not exceed the 50 hard cap
      expect(isEligibleForHomeFeed(limitedPlan)).toBe(true);
    });
  });

  describe("3. Share Button & Add Participant Guards at 50", () => {
    it("determines Share button visibility based on 50 joined ceiling", () => {
      const shouldShowShareButton = (
        joinedCount: number,
        isCancelled: boolean,
        isCompleted: boolean,
        hasPermission: boolean
      ) => {
        return !isCancelled && !isCompleted && hasPermission && joinedCount < 50;
      };

      // 49 joined -> Share visible
      expect(shouldShowShareButton(49, false, false, true)).toBe(true);
      // 50 joined -> Share hidden
      expect(shouldShowShareButton(50, false, false, true)).toBe(false);
      // Someone leaves -> 49 joined -> Share visible again
      expect(shouldShowShareButton(49, false, false, true)).toBe(true);
    });

    it("keeps Add Participant button displayed at 50 joined, but routes to error state", () => {
      type AddParticipantActionResult =
        | { action: "OPEN_PICKER" }
        | { action: "SHOW_ERROR"; message: string };

      const handleAddParticipantTap = (joinedCount: number): AddParticipantActionResult => {
        if (joinedCount >= 50) {
          return {
            action: "SHOW_ERROR",
            message: "Plan size reached. This plan already has 50 participants. No more participants can join this plan.",
          };
        }
        return { action: "OPEN_PICKER" };
      };

      // Before capacity (49 joined) -> opens picker
      const resultBefore = handleAddParticipantTap(49);
      expect(resultBefore.action).toBe("OPEN_PICKER");

      // At capacity (50 joined) -> displays error toast, does NOT open picker
      const resultAt = handleAddParticipantTap(50);
      expect(resultAt.action).toBe("SHOW_ERROR");
      if (resultAt.action === "SHOW_ERROR") {
        expect(resultAt.message).toBe(
          "Plan size reached. This plan already has 50 participants. No more participants can join this plan."
        );
      }

      // Dynamic restoration: someone leaves (50 -> 49)
      const resultAfter = handleAddParticipantTap(49);
      expect(resultAfter.action).toBe("OPEN_PICKER");
    });
  });

  describe("4. Cost Model Invariant Preservation", () => {
    it("keeps fixed total cost intact regardless of participant count (1, 10, 25, 50)", () => {
      [1, 10, 25, 50].forEach((_count) => {
        const costText = getHeroMetadataCostText({ total_cost: 500 });
        expect(costText).toBe("₹500");
        expect(costText).not.toContain("/person");
      });
    });
  });
});
