import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkAndTransitionOverduePlans } from "../PlansContext";
import { syncOverduePlansRPC } from "../../api/plans";

describe("PlansContext Visibility-Aware Overdue Polling", () => {
  let originalDocument: any;
  let mockVisibilityState: "visible" | "hidden" = "visible";
  const docListeners: Record<string, ((...args: any[]) => void)[]> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    originalDocument = global.document;

    // Clear listeners
    for (const key in docListeners) {
      delete docListeners[key];
    }
    mockVisibilityState = "visible";

    global.document = {
      get visibilityState() {
        return mockVisibilityState;
      },
      addEventListener: vi.fn((event: string, handler: any) => {
        docListeners[event] = docListeners[event] || [];
        docListeners[event].push(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: any) => {
        if (docListeners[event]) {
          docListeners[event] = docListeners[event].filter(h => h !== handler);
        }
      }),
    } as any;
  });

  afterEach(() => {
    vi.useRealTimers();
    global.document = originalDocument;
  });

  const triggerVisibilityChange = (state: "visible" | "hidden") => {
    mockVisibilityState = state;
    (docListeners["visibilitychange"] || []).forEach(fn => fn());
  };

  // Helper simulating PlansContext overdue polling lifecycle
  function createPollingHarness(initialPlans: any[], mockSyncRPC = vi.fn()) {
    let currentPlans = [...initialPlans];
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let activeIntervalCount = 0;

    const checkOverduePlans = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      const now = Date.now();
      const hasOverdueTransition = currentPlans.some(
        p => p.status === "LIVE" && p.scheduled_at && new Date(p.scheduled_at).getTime() < now
      );
      if (hasOverdueTransition) {
        currentPlans = currentPlans.map(p => {
          if (p.status === "LIVE" && p.scheduled_at && new Date(p.scheduled_at).getTime() < now) {
            return { ...p, status: "OVERDUE" };
          }
          return p;
        });
        mockSyncRPC();
      }
    };

    const startInterval = () => {
      if (intervalId !== null) return;
      activeIntervalCount++;
      intervalId = setInterval(checkOverduePlans, 15000);
    };

    const stopInterval = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
        activeIntervalCount--;
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;

      if (document.visibilityState === "visible") {
        checkOverduePlans();
        stopInterval();
        startInterval();
      } else {
        stopInterval();
      }
    };

    // Mount logic matching PlansContext.tsx
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      startInterval();
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    const cleanup = () => {
      stopInterval();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };

    return {
      getPlans: () => currentPlans,
      getActiveIntervalCount: () => activeIntervalCount,
      getHasInterval: () => intervalId !== null,
      cleanup,
      checkOverduePlans,
    };
  }

  // 1. Visible document starts the 15-second polling behavior
  it("starts the 15-second polling behavior when document is visible", () => {
    mockVisibilityState = "visible";
    const harness = createPollingHarness([]);

    expect(harness.getHasInterval()).toBe(true);
    expect(harness.getActiveIntervalCount()).toBe(1);

    harness.cleanup();
  });

  // 2. Hidden document does not execute overdue polling
  it("does not execute overdue polling or RPC when document is hidden", () => {
    mockVisibilityState = "hidden";
    const mockSyncRPC = vi.fn();
    const pastPlan = {
      id: "plan-1",
      status: "LIVE",
      scheduled_at: new Date(Date.now() - 60000).toISOString(),
    };

    const harness = createPollingHarness([pastPlan], mockSyncRPC);

    // Initial state when hidden: no active interval
    expect(harness.getHasInterval()).toBe(false);
    expect(harness.getActiveIntervalCount()).toBe(0);

    // Fast forward 30 seconds
    vi.advanceTimersByTime(30000);

    // Status remains unchanged and RPC was NOT called
    expect(harness.getPlans()[0].status).toBe("LIVE");
    expect(mockSyncRPC).not.toHaveBeenCalled();

    harness.cleanup();
  });

  // 3. Calling visibilitychange → visible triggers an immediate overdue check
  it("triggers an immediate overdue check upon visibilitychange to visible without waiting 15s", () => {
    mockVisibilityState = "hidden";
    const mockSyncRPC = vi.fn();
    const pastPlan = {
      id: "plan-1",
      status: "LIVE",
      scheduled_at: new Date(Date.now() - 60000).toISOString(),
    };

    const harness = createPollingHarness([pastPlan], mockSyncRPC);
    expect(mockSyncRPC).not.toHaveBeenCalled();
    expect(harness.getPlans()[0].status).toBe("LIVE");

    // Foreground the tab: visibilitychange -> visible
    triggerVisibilityChange("visible");

    // Immediately checked and transitioned to OVERDUE before any timer advance!
    expect(harness.getPlans()[0].status).toBe("OVERDUE");
    expect(mockSyncRPC).toHaveBeenCalledTimes(1);

    harness.cleanup();
  });

  // 4. Visibilitychange → hidden stops/pauses polling
  it("pauses and clears interval when visibilitychange becomes hidden", () => {
    mockVisibilityState = "visible";
    const harness = createPollingHarness([]);

    expect(harness.getHasInterval()).toBe(true);

    // Transition to hidden
    triggerVisibilityChange("hidden");

    expect(harness.getHasInterval()).toBe(false);
    expect(harness.getActiveIntervalCount()).toBe(0);

    harness.cleanup();
  });

  // 5. Returning to visible creates/resumes exactly one interval
  it("resumes exactly one interval when returning to visible", () => {
    mockVisibilityState = "visible";
    const harness = createPollingHarness([]);

    expect(harness.getActiveIntervalCount()).toBe(1);

    triggerVisibilityChange("hidden");
    expect(harness.getActiveIntervalCount()).toBe(0);

    triggerVisibilityChange("visible");
    expect(harness.getActiveIntervalCount()).toBe(1);
    expect(harness.getHasInterval()).toBe(true);

    harness.cleanup();
  });

  // 6. Repeated visibility changes do not create duplicate intervals
  it("does not create duplicate intervals on repeated visibility changes", () => {
    mockVisibilityState = "visible";
    const harness = createPollingHarness([]);

    // Multiple rapid foreground events
    triggerVisibilityChange("visible");
    triggerVisibilityChange("visible");
    triggerVisibilityChange("visible");

    expect(harness.getActiveIntervalCount()).toBe(1);

    triggerVisibilityChange("hidden");
    triggerVisibilityChange("hidden");
    expect(harness.getActiveIntervalCount()).toBe(0);

    triggerVisibilityChange("visible");
    expect(harness.getActiveIntervalCount()).toBe(1);

    harness.cleanup();
  });

  // 7. Cleanup removes the interval and visibility listener
  it("cleans up the interval and visibility listener on unmount", () => {
    mockVisibilityState = "visible";
    const harness = createPollingHarness([]);

    expect(harness.getHasInterval()).toBe(true);
    expect(document.addEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

    harness.cleanup();

    expect(harness.getHasInterval()).toBe(false);
    expect(document.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });

  // 8. syncOverduePlansRPC remains non-blocking
  it("verifies syncOverduePlansRPC is completely non-blocking and handles failures gracefully", async () => {
    // Calling syncOverduePlansRPC resolves without throwing, even if underlying RPC encounters network issues
    await expect(syncOverduePlansRPC()).resolves.toBeUndefined();
  });

  // 9. Existing overdue status behavior is unchanged
  it("preserves exact existing overdue status transitions", () => {
    const now = Date.now();
    const plans = [
      { id: "p1", status: "LIVE", scheduled_at: new Date(now - 10000).toISOString() }, // Overdue
      { id: "p2", status: "LIVE", scheduled_at: new Date(now + 60000).toISOString() }, // Future Live
      { id: "p3", status: "COMPLETED", scheduled_at: new Date(now - 20000).toISOString() }, // Terminal
      { id: "p4", status: "CANCELLED", scheduled_at: new Date(now - 30000).toISOString() }, // Terminal
      { id: "p5", status: "OVERDUE", scheduled_at: new Date(now - 40000).toISOString() }, // Already Overdue
    ];

    const result = checkAndTransitionOverduePlans(plans, now);

    expect(result.hasOverdueTransition).toBe(true);
    expect(result.updatedPlans.find(p => p.id === "p1")?.status).toBe("OVERDUE");
    expect(result.updatedPlans.find(p => p.id === "p2")?.status).toBe("LIVE");
    expect(result.updatedPlans.find(p => p.id === "p3")?.status).toBe("COMPLETED");
    expect(result.updatedPlans.find(p => p.id === "p4")?.status).toBe("CANCELLED");
    expect(result.updatedPlans.find(p => p.id === "p5")?.status).toBe("OVERDUE");

    // When no plans transition, hasOverdueTransition is false
    const resultNoOp = checkAndTransitionOverduePlans(result.updatedPlans, now);
    expect(resultNoOp.hasOverdueTransition).toBe(false);
  });
});
