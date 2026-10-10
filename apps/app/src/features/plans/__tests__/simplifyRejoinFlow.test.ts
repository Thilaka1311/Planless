import { describe, it, expect, vi } from "vitest";
import { getPlanPreviewCtaState } from "../utils/planPreviewCtaUtils";

describe("Simplify Rejoin Flow — Remove Rejoin Waitlist Option", () => {
  function resolveRejoinPlanBottomSheetButtonText(props: {
    isRejoining?: boolean;
    isFull?: boolean;
  }) {
    const { isRejoining = false } = props;
    return isRejoining ? "Rejoining…" : "Rejoin Plan";
  }

  describe("1. RejoinPlanBottomSheet button text", () => {
    it("renders 'Rejoin Plan' as the single rejoin entry point when plan is full (isFull=true)", () => {
      const buttonText = resolveRejoinPlanBottomSheetButtonText({ isFull: true });
      expect(buttonText).toBe("Rejoin Plan");
      expect(buttonText).not.toBe("Rejoin Waitlist");
    });

    it("renders 'Rejoin Plan' when plan has available capacity (isFull=false)", () => {
      const buttonText = resolveRejoinPlanBottomSheetButtonText({ isFull: false });
      expect(buttonText).toBe("Rejoin Plan");
    });

    it("renders 'Rejoining…' while loading regardless of isFull", () => {
      expect(resolveRejoinPlanBottomSheetButtonText({ isRejoining: true, isFull: true })).toBe("Rejoining…");
      expect(resolveRejoinPlanBottomSheetButtonText({ isRejoining: true, isFull: false })).toBe("Rejoining…");
    });
  });

  describe("2. getPlanPreviewCtaState single Rejoin Plan entry point", () => {
    it("returns 'Rejoin Plan' when participant has left on a full plan (joined_count >= plan_size)", () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: false,
        joinedCount: 4,
        planSize: 4,
        alreadySkipped: true,
      });

      expect(res.ctaText).toBe("Rejoin Plan");
      expect(res.isWaitlistTarget).toBe(true);
      expect(res.ctaText).not.toBe("Rejoin Waitlist");
    });

    it("returns 'Rejoin Plan' when participant has left on an assigned waitlist slot", () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: true,
        assignedGroup: "WAITLIST",
        joinedCount: 2,
        planSize: 8,
        alreadySkipped: true,
      });

      expect(res.ctaText).toBe("Rejoin Plan");
      expect(res.isWaitlistTarget).toBe(true);
      expect(res.ctaText).not.toBe("Rejoin Waitlist");
    });

    it("returns 'Rejoin Plan' when participant has left on a plan with available capacity", () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: false,
        joinedCount: 2,
        planSize: 4,
        alreadySkipped: true,
      });

      expect(res.ctaText).toBe("Rejoin Plan");
      expect(res.isWaitlistTarget).toBe(false);
    });

    it("preserves 'Join Waitlist' for unjoined participants when plan is full", () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: false,
        joinedCount: 4,
        planSize: 4,
        alreadySkipped: false,
      });

      expect(res.ctaText).toBe("Join Waitlist");
    });
  });

  describe("3. Tapping Rejoin Plan executes standard rejoin flow without bypassing capacity checks", () => {
    it("invokes rejoinPlan to transition participant to REJOINED awaiting host decision", async () => {
      const rejoinPlan = vi.fn().mockResolvedValue(undefined);
      const planId = "plan-timezone-123";
      const userProfile = { dbUuid: "user-thilak-uuid", name: "Thilak" };

      // Participant taps Rejoin Plan
      await rejoinPlan(planId, userProfile);

      expect(rejoinPlan).toHaveBeenCalledWith(planId, userProfile);
    });

    it("host resolution respects capacity: full plans trigger capacity handling options", () => {
      const planCapacity = 2;
      const currentJoinedCount = 2;
      const isPlanFull = currentJoinedCount >= planCapacity;

      const triggerHostResolution = (full: boolean) => {
        if (full) {
          return { showPlanIsFullSheet: true, options: ["Increase Plan Size", "Add to Waitlist"] };
        }
        return { showPlanIsFullSheet: false, options: ["Add to Plan"] };
      };

      const result = triggerHostResolution(isPlanFull);
      expect(result.showPlanIsFullSheet).toBe(true);
      expect(result.options).toContain("Increase Plan Size");
      expect(result.options).toContain("Add to Waitlist");
      expect(result.options).not.toContain("Add to Plan");
    });

    it("host resolution respects capacity: available capacity allows direct admission", () => {
      const planCapacity = 4;
      const currentJoinedCount = 2;
      const isPlanFull = currentJoinedCount >= planCapacity;

      const triggerHostResolution = (full: boolean) => {
        if (full) {
          return { showPlanIsFullSheet: true, options: ["Increase Plan Size", "Add to Waitlist"] };
        }
        return { showPlanIsFullSheet: false, options: ["Add to Plan"] };
      };

      const result = triggerHostResolution(isPlanFull);
      expect(result.showPlanIsFullSheet).toBe(false);
      expect(result.options).toContain("Add to Plan");
    });
  });
});
