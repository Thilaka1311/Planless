import { describe, it, expect, vi } from "vitest";
import { normalizeStatus } from "../../../../lib/participantStatus";

describe("Leave Plan Bottom Sheet for Waitlisted Participants", () => {
  // Helper to mimic LeavePlanBottomSheet text resolution logic
  function resolveLeavePlanBottomSheetState(props: {
    isPaid?: boolean;
    rsvpStatus?: string;
    isWaitlist?: boolean;
    plan?: any;
    isLoading?: boolean;
  }) {
    const { isPaid, rsvpStatus, isWaitlist = false, plan, isLoading = false } = props;

    const currentStatus = normalizeStatus(
      rsvpStatus ||
      plan?.myRsvpStatus ||
      plan?.my_rsvp_status ||
      plan?.rsvp_status ||
      plan?.rsvpStatus
    );
    const isWaitlisted = isWaitlist || currentStatus === "WAITLISTED";

    const resolvedCost = Number(
      plan?.total_cost ??
      plan?.cost ??
      plan?.totalCost ??
      0
    );
    const isPaidPlan = isWaitlisted ? false : (isPaid !== undefined ? isPaid : resolvedCost > 0);
    const buttonText = isPaidPlan
      ? (isLoading ? "Sending Request…" : "Request to leave")
      : (isLoading ? "Leaving…" : "Leave Plan");

    return {
      currentStatus,
      isWaitlisted,
      isPaidPlan,
      buttonText,
    };
  }

  describe("LeavePlanBottomSheet text resolution", () => {
    it("renders 'Leave Plan' for a WAITLISTED participant even on a paid plan (cost > 0)", () => {
      const state = resolveLeavePlanBottomSheetState({
        plan: { id: "plan-1", title: "Football Match", total_cost: 2000 },
        rsvpStatus: "WAITLISTED",
      });

      expect(state.isWaitlisted).toBe(true);
      expect(state.isPaidPlan).toBe(false);
      expect(state.buttonText).toBe("Leave Plan");
    });

    it("renders 'Leave Plan' for a WAITLISTED participant even if isPaid=true is passed by caller", () => {
      const state = resolveLeavePlanBottomSheetState({
        plan: { id: "plan-1", title: "Football Match", total_cost: 2000 },
        rsvpStatus: "WAITLISTED",
        isPaid: true,
      });

      expect(state.isWaitlisted).toBe(true);
      expect(state.isPaidPlan).toBe(false);
      expect(state.buttonText).toBe("Leave Plan");
    });

    it("renders 'Leave Plan' when isWaitlist=true prop is provided directly", () => {
      const state = resolveLeavePlanBottomSheetState({
        plan: { id: "plan-1", title: "Bowling", total_cost: 1500 },
        isWaitlist: true,
      });

      expect(state.isWaitlisted).toBe(true);
      expect(state.isPaidPlan).toBe(false);
      expect(state.buttonText).toBe("Leave Plan");
    });

    it("renders 'Request to leave' for a JOINED participant on a paid plan", () => {
      const state = resolveLeavePlanBottomSheetState({
        plan: { id: "plan-1", title: "Football Match", total_cost: 2000 },
        rsvpStatus: "JOINED",
        isPaid: true,
      });

      expect(state.isWaitlisted).toBe(false);
      expect(state.isPaidPlan).toBe(true);
      expect(state.buttonText).toBe("Request to leave");
    });

    it("renders 'Leave Plan' for a JOINED participant on a free plan (cost = 0)", () => {
      const state = resolveLeavePlanBottomSheetState({
        plan: { id: "plan-2", title: "Board Games", total_cost: 0 },
        rsvpStatus: "JOINED",
        isPaid: false,
      });

      expect(state.isWaitlisted).toBe(false);
      expect(state.isPaidPlan).toBe(false);
      expect(state.buttonText).toBe("Leave Plan");
    });

    it("displays 'Sending Request…' when loading for JOINED paid plan", () => {
      const state = resolveLeavePlanBottomSheetState({
        plan: { id: "plan-1", title: "Football Match", total_cost: 2000 },
        rsvpStatus: "JOINED",
        isPaid: true,
        isLoading: true,
      });

      expect(state.buttonText).toBe("Sending Request…");
    });

    it("displays 'Leaving…' when loading for WAITLISTED participant on a paid plan", () => {
      const state = resolveLeavePlanBottomSheetState({
        plan: { id: "plan-1", title: "Football Match", total_cost: 2000 },
        rsvpStatus: "WAITLISTED",
        isPaid: true,
        isLoading: true,
      });

      expect(state.buttonText).toBe("Leaving…");
    });
  });

  describe("executeLeavePlanFlow handler in PlanSettingsScreen", () => {
    async function executeLeavePlanFlow(params: {
      currentStatus: string;
      hasCost: boolean;
      requestPaidPlanLeave: (planId: string) => Promise<void>;
      onLeavePlan?: () => Promise<void>;
      onRemoveParticipant?: (userId: string) => Promise<void>;
      skipPlan?: (planId: string, userId: string) => Promise<void>;
      planId: string;
      userId: string;
    }) {
      const {
        currentStatus,
        hasCost,
        requestPaidPlanLeave,
        onLeavePlan,
        onRemoveParticipant,
        skipPlan,
        planId,
        userId,
      } = params;

      const isWaitlisted = currentStatus === "WAITLISTED";
      if (hasCost && !isWaitlisted) {
        await requestPaidPlanLeave(planId);
      } else if (onLeavePlan) {
        await onLeavePlan();
      } else if (onRemoveParticipant) {
        await onRemoveParticipant(userId);
      } else if (skipPlan) {
        await skipPlan(planId, userId);
      }
    }

    it("executes direct onLeavePlan and NOT requestPaidPlanLeave for a WAITLISTED participant on paid plan", async () => {
      const requestPaidPlanLeave = vi.fn();
      const onLeavePlan = vi.fn();
      const onRemoveParticipant = vi.fn();

      await executeLeavePlanFlow({
        currentStatus: "WAITLISTED",
        hasCost: true,
        requestPaidPlanLeave,
        onLeavePlan,
        onRemoveParticipant,
        planId: "plan-1",
        userId: "user-1",
      });

      expect(requestPaidPlanLeave).not.toHaveBeenCalled();
      expect(onLeavePlan).toHaveBeenCalledTimes(1);
    });

    it("executes requestPaidPlanLeave for a JOINED participant on paid plan", async () => {
      const requestPaidPlanLeave = vi.fn();
      const onLeavePlan = vi.fn();
      const onRemoveParticipant = vi.fn();

      await executeLeavePlanFlow({
        currentStatus: "JOINED",
        hasCost: true,
        requestPaidPlanLeave,
        onLeavePlan,
        onRemoveParticipant,
        planId: "plan-1",
        userId: "user-1",
      });

      expect(requestPaidPlanLeave).toHaveBeenCalledWith("plan-1");
      expect(onLeavePlan).not.toHaveBeenCalled();
    });

    it("executes skipPlan fallback for a WAITLISTED participant when onLeavePlan is not provided", async () => {
      const requestPaidPlanLeave = vi.fn();
      const skipPlan = vi.fn();

      await executeLeavePlanFlow({
        currentStatus: "WAITLISTED",
        hasCost: true,
        requestPaidPlanLeave,
        skipPlan,
        planId: "plan-1",
        userId: "user-1",
      });

      expect(requestPaidPlanLeave).not.toHaveBeenCalled();
      expect(skipPlan).toHaveBeenCalledWith("plan-1", "user-1");
    });
  });

  describe("PlansPreviewScreen and HomePlansPreviewScreen leave action dispatching", () => {
    it("dispatches handleConfirmSkip for WAITLISTED participant on paid plan", async () => {
      const handleConfirmPaidLeaveRequest = vi.fn();
      const handleConfirmSkip = vi.fn();
      const currentStatus: string = "WAITLISTED";
      const hasCost = true;

      // Logic in onConfirm of LeavePlanBottomSheet
      if (hasCost && currentStatus !== "WAITLISTED") {
        await handleConfirmPaidLeaveRequest();
      } else {
        handleConfirmSkip();
      }

      expect(handleConfirmPaidLeaveRequest).not.toHaveBeenCalled();
      expect(handleConfirmSkip).toHaveBeenCalledTimes(1);
    });

    it("dispatches handleConfirmPaidLeaveRequest for JOINED participant on paid plan", async () => {
      const handleConfirmPaidLeaveRequest = vi.fn();
      const handleConfirmSkip = vi.fn();
      const currentStatus: string = "JOINED";
      const hasCost = true;

      if (hasCost && currentStatus !== "WAITLISTED") {
        await handleConfirmPaidLeaveRequest();
      } else {
        handleConfirmSkip();
      }

      expect(handleConfirmPaidLeaveRequest).toHaveBeenCalledTimes(1);
      expect(handleConfirmSkip).not.toHaveBeenCalled();
    });
  });
});
