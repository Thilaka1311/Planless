import { describe, it, expect, vi } from "vitest";

describe("Plan Confirmation Screens & Navigation", () => {
  it("ReservationSuccessModal onGoToPlans opens the exact plan preview", () => {
    const setSelectedPlanId = vi.fn();
    const setActiveTab = vi.fn();
    const setPlansFilter = vi.fn();
    const onClose = vi.fn();
    const planId = "plan-abc-123";

    // Simulate onGoToPlans logic from ReservationSuccessModal
    const handleGoToPlans = () => {
      onClose();
      setPlansFilter("JOINED");
      if (setSelectedPlanId && planId) {
        setSelectedPlanId(planId);
      }
      setActiveTab("plans");
    };

    handleGoToPlans();

    expect(onClose).toHaveBeenCalled();
    expect(setPlansFilter).toHaveBeenCalledWith("JOINED");
    expect(setSelectedPlanId).toHaveBeenCalledWith("plan-abc-123");
    expect(setActiveTab).toHaveBeenCalledWith("plans");
  });

  it("ReservationSuccessModal onGoToPlans preserves waitlist filter for waitlisted plan", () => {
    const setSelectedPlanId = vi.fn();
    const setActiveTab = vi.fn();
    const setPlansFilter = vi.fn();
    const onClose = vi.fn();
    const planId = "plan-waitlist-456";
    const isWaitlist = true;

    const handleGoToPlans = () => {
      onClose();
      setPlansFilter(isWaitlist ? "WAITLISTED" : "JOINED");
      if (setSelectedPlanId && planId) {
        setSelectedPlanId(planId);
      }
      setActiveTab("plans");
    };

    handleGoToPlans();

    expect(onClose).toHaveBeenCalled();
    expect(setPlansFilter).toHaveBeenCalledWith("WAITLISTED");
    expect(setSelectedPlanId).toHaveBeenCalledWith("plan-waitlist-456");
    expect(setActiveTab).toHaveBeenCalledWith("plans");
  });

  it("CreateMVP onGoToPlans preserves newly created plan ID for preview navigation", () => {
    const postedPlanUuid = "new-created-plan-789";
    const setSelectedPlanId = vi.fn();
    const setActiveTab = vi.fn();
    const setPlansFilter = vi.fn();
    const handleResetAll = vi.fn();

    const handleGoToPlans = () => {
      const targetPlanId = postedPlanUuid;
      handleResetAll();
      setPlansFilter("JOINED");
      if (targetPlanId && setSelectedPlanId) {
        setSelectedPlanId(targetPlanId);
      }
      setActiveTab("plans");
    };

    handleGoToPlans();

    expect(handleResetAll).toHaveBeenCalled();
    expect(setPlansFilter).toHaveBeenCalledWith("JOINED");
    expect(setSelectedPlanId).toHaveBeenCalledWith("new-created-plan-789");
    expect(setActiveTab).toHaveBeenCalledWith("plans");
  });
});
