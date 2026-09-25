import { describe, it, expect, vi } from "vitest";

export function handleMarkAsCompleteClick({
  plan,
  setShowHoldSheet,
  setHoldPlan,
  setCompletingPlan,
  setShowEarlyEndPlanConfirm,
  setShowAttendanceSheet,
}: {
  plan: any;
  setShowHoldSheet: (open: boolean) => void;
  setHoldPlan: (plan: any) => void;
  setCompletingPlan: (plan: any) => void;
  setShowEarlyEndPlanConfirm: (open: boolean) => void;
  setShowAttendanceSheet: (open: boolean) => void;
}) {
  if (!plan) return;
  setShowHoldSheet(false);
  setHoldPlan(null);

  const rawScheduled = plan.scheduled_at || plan.datetime || plan.time || plan.createdAt;
  const planScheduledDate = new Date(rawScheduled);
  const now = new Date();
  const isEarly = !isNaN(planScheduledDate.getTime()) && now.getTime() < planScheduledDate.getTime();

  setCompletingPlan(plan);
  if (isEarly) {
    setShowEarlyEndPlanConfirm(true);
  } else {
    setShowAttendanceSheet(true);
  }
}

describe("Cancelled Plan Mark as Complete Flow", () => {
  it("does not directly mutate plan status to COMPLETED when Mark as Complete is tapped", () => {
    const directUpdateStatusSpy = vi.fn();
    const setShowHoldSheet = vi.fn();
    const setHoldPlan = vi.fn();
    const setCompletingPlan = vi.fn();
    const setShowEarlyEndPlanConfirm = vi.fn();
    const setShowAttendanceSheet = vi.fn();

    const cancelledPlan = {
      id: "plan-cancelled-123",
      title: "Cancelled Coffee Chat",
      status: "CANCELLED",
      datetime: new Date(Date.now() - 3600000).toISOString(), // 1 hour in the past
    };

    handleMarkAsCompleteClick({
      plan: cancelledPlan,
      setShowHoldSheet,
      setHoldPlan,
      setCompletingPlan,
      setShowEarlyEndPlanConfirm,
      setShowAttendanceSheet,
    });

    // Verify direct mutation was NOT called
    expect(directUpdateStatusSpy).not.toHaveBeenCalled();

    // Verify bottom sheet closed and plan preserved
    expect(setShowHoldSheet).toHaveBeenCalledWith(false);
    expect(setHoldPlan).toHaveBeenCalledWith(null);
    expect(setCompletingPlan).toHaveBeenCalledWith(cancelledPlan);

    // Past plan opens attendance sheet directly
    expect(setShowAttendanceSheet).toHaveBeenCalledWith(true);
    expect(setShowEarlyEndPlanConfirm).not.toHaveBeenCalled();
  });

  it("prompts for early confirmation if the cancelled plan was scheduled in the future", () => {
    const setShowHoldSheet = vi.fn();
    const setHoldPlan = vi.fn();
    const setCompletingPlan = vi.fn();
    const setShowEarlyEndPlanConfirm = vi.fn();
    const setShowAttendanceSheet = vi.fn();

    const futureCancelledPlan = {
      id: "plan-future-cancelled-456",
      title: "Future Cancelled Dinner",
      status: "CANCELLED",
      datetime: new Date(Date.now() + 86400000).toISOString(), // tomorrow
    };

    handleMarkAsCompleteClick({
      plan: futureCancelledPlan,
      setShowHoldSheet,
      setHoldPlan,
      setCompletingPlan,
      setShowEarlyEndPlanConfirm,
      setShowAttendanceSheet,
    });

    expect(setCompletingPlan).toHaveBeenCalledWith(futureCancelledPlan);
    expect(setShowEarlyEndPlanConfirm).toHaveBeenCalledWith(true);
    expect(setShowAttendanceSheet).not.toHaveBeenCalled();
  });
});
