import { describe, it, expect, vi } from "vitest";

describe("Participant Completed & Cancelled Actions Invariants", () => {
  // PlansPreview live action resolver mirroring PlansPreviewScreen.tsx lines 2650-2670
  function resolvePlansPreviewLiveAction({
    isCompleted,
    isCancelled,
    isHost,
    myParticipantRecord,
    currentStatus,
    alreadySkipped,
    actions,
  }: {
    isCompleted: boolean;
    isCancelled: boolean;
    isHost: boolean;
    myParticipantRecord?: any;
    currentStatus?: string;
    alreadySkipped?: boolean;
    actions: {
      setShowCancelPlanConfirm: (open: boolean) => void;
      setShowRestorePlanConfirm: (open: boolean) => void;
      setShowCancelLeaveRequestConfirmation: (open: boolean) => void;
      setShowLeavePlanConfirm: (open: boolean) => void;
      setShowSkipConfirmation: (open: boolean) => void;
      setShowRejoinSheet: (open: boolean) => void;
      setShowCancelRejoinRequestSheet: (open: boolean) => void;
    };
  }) {
    return isCompleted
      ? (isHost ? () => actions.setShowCancelPlanConfirm(true) : undefined)
      : isCancelled
        ? (isHost ? () => actions.setShowRestorePlanConfirm(true) : undefined)
        : isHost
          ? () => actions.setShowCancelPlanConfirm(true)
          : myParticipantRecord?.rsvp_status === "JOINED" && myParticipantRecord?.leave_requested
            ? () => actions.setShowCancelLeaveRequestConfirmation(true)
            : currentStatus === "JOINED" && !alreadySkipped
              ? () => actions.setShowLeavePlanConfirm(true)
              : currentStatus === "WAITLISTED" && !alreadySkipped
                ? () => actions.setShowSkipConfirmation(true)
                : alreadySkipped && myParticipantRecord?.skip_reason === "LEFT"
                  ? () => actions.setShowRejoinSheet(true)
                  : (currentStatus === "REJOINED" || myParticipantRecord?.rsvp_status === "REJOINED")
                    ? () => actions.setShowCancelRejoinRequestSheet(true)
                    : undefined;
  }

  // HomePlansPreview live action resolver mirroring HomePlansPreviewScreen.tsx
  function resolveHomePlansPreviewLiveAction({
    isCompleted,
    isCancelled,
    isHost,
    effectiveParticipantRecord,
    isSoleHost,
    actions,
  }: {
    isCompleted: boolean;
    isCancelled: boolean;
    isHost: boolean;
    effectiveParticipantRecord?: any;
    isSoleHost: boolean;
    actions: {
      setShowPlanActionsSheet: (open: boolean) => void;
      setShowCancelLeaveRequestConfirmation: (open: boolean) => void;
      setShowHostLeaveReplacementSheet: (open: boolean) => void;
      setShowLeavePlanConfirm: (open: boolean) => void;
    };
  }) {
    const handleLiveActionClick = () => {
      if (!isHost && (isCompleted || isCancelled)) {
        return;
      }
      const rawRsvp = effectiveParticipantRecord?.rsvp_status || effectiveParticipantRecord?.joinState;
      const status = String(rawRsvp || "").toUpperCase();
      if (status === "INVITED") {
        actions.setShowPlanActionsSheet(true);
      } else if (status === "JOINED") {
        if (effectiveParticipantRecord?.leave_requested) {
          actions.setShowCancelLeaveRequestConfirmation(true);
        } else if (isSoleHost) {
          actions.setShowHostLeaveReplacementSheet(true);
        } else {
          actions.setShowLeavePlanConfirm(true);
        }
      } else {
        actions.setShowPlanActionsSheet(true);
      }
    };

    const onClick = (!isHost && (isCompleted || isCancelled)) ? undefined : handleLiveActionClick;
    return { onClick, handleLiveActionClick };
  }

  describe("PlansPreviewScreen Invariants", () => {
    it("returns undefined onClick for participant when plan is COMPLETED (no bottom sheets opened)", () => {
      const actions = {
        setShowCancelPlanConfirm: vi.fn(),
        setShowRestorePlanConfirm: vi.fn(),
        setShowCancelLeaveRequestConfirmation: vi.fn(),
        setShowLeavePlanConfirm: vi.fn(),
        setShowSkipConfirmation: vi.fn(),
        setShowRejoinSheet: vi.fn(),
        setShowCancelRejoinRequestSheet: vi.fn(),
      };

      const onClick = resolvePlansPreviewLiveAction({
        isCompleted: true,
        isCancelled: false,
        isHost: false,
        myParticipantRecord: { rsvp_status: "JOINED" },
        currentStatus: "JOINED",
        alreadySkipped: false,
        actions,
      });

      expect(onClick).toBeUndefined();
      expect(actions.setShowCancelPlanConfirm).not.toHaveBeenCalled();
      expect(actions.setShowLeavePlanConfirm).not.toHaveBeenCalled();
    });

    it("returns undefined onClick for participant when plan is CANCELLED (no bottom sheets opened)", () => {
      const actions = {
        setShowCancelPlanConfirm: vi.fn(),
        setShowRestorePlanConfirm: vi.fn(),
        setShowCancelLeaveRequestConfirmation: vi.fn(),
        setShowLeavePlanConfirm: vi.fn(),
        setShowSkipConfirmation: vi.fn(),
        setShowRejoinSheet: vi.fn(),
        setShowCancelRejoinRequestSheet: vi.fn(),
      };

      const onClick = resolvePlansPreviewLiveAction({
        isCompleted: false,
        isCancelled: true,
        isHost: false,
        myParticipantRecord: { rsvp_status: "JOINED" },
        currentStatus: "JOINED",
        alreadySkipped: false,
        actions,
      });

      expect(onClick).toBeUndefined();
      expect(actions.setShowRestorePlanConfirm).not.toHaveBeenCalled();
      expect(actions.setShowLeavePlanConfirm).not.toHaveBeenCalled();
    });

    it("retains host action when user is host and plan is COMPLETED", () => {
      const actions = {
        setShowCancelPlanConfirm: vi.fn(),
        setShowRestorePlanConfirm: vi.fn(),
        setShowCancelLeaveRequestConfirmation: vi.fn(),
        setShowLeavePlanConfirm: vi.fn(),
        setShowSkipConfirmation: vi.fn(),
        setShowRejoinSheet: vi.fn(),
        setShowCancelRejoinRequestSheet: vi.fn(),
      };

      const onClick = resolvePlansPreviewLiveAction({
        isCompleted: true,
        isCancelled: false,
        isHost: true,
        myParticipantRecord: { role: "HOST" },
        actions,
      });

      expect(typeof onClick).toBe("function");
      onClick?.();
      expect(actions.setShowCancelPlanConfirm).toHaveBeenCalledWith(true);
    });

    it("retains restore action when user is host and plan is CANCELLED", () => {
      const actions = {
        setShowCancelPlanConfirm: vi.fn(),
        setShowRestorePlanConfirm: vi.fn(),
        setShowCancelLeaveRequestConfirmation: vi.fn(),
        setShowLeavePlanConfirm: vi.fn(),
        setShowSkipConfirmation: vi.fn(),
        setShowRejoinSheet: vi.fn(),
        setShowCancelRejoinRequestSheet: vi.fn(),
      };

      const onClick = resolvePlansPreviewLiveAction({
        isCompleted: false,
        isCancelled: true,
        isHost: true,
        myParticipantRecord: { role: "HOST" },
        actions,
      });

      expect(typeof onClick).toBe("function");
      onClick?.();
      expect(actions.setShowRestorePlanConfirm).toHaveBeenCalledWith(true);
    });

    it("preserves active live participant leave action on LIVE active plans", () => {
      const actions = {
        setShowCancelPlanConfirm: vi.fn(),
        setShowRestorePlanConfirm: vi.fn(),
        setShowCancelLeaveRequestConfirmation: vi.fn(),
        setShowLeavePlanConfirm: vi.fn(),
        setShowSkipConfirmation: vi.fn(),
        setShowRejoinSheet: vi.fn(),
        setShowCancelRejoinRequestSheet: vi.fn(),
      };

      const onClick = resolvePlansPreviewLiveAction({
        isCompleted: false,
        isCancelled: false,
        isHost: false,
        myParticipantRecord: { rsvp_status: "JOINED" },
        currentStatus: "JOINED",
        alreadySkipped: false,
        actions,
      });

      expect(typeof onClick).toBe("function");
      onClick?.();
      expect(actions.setShowLeavePlanConfirm).toHaveBeenCalledWith(true);
    });
  });

  describe("HomePlansPreviewScreen Invariants", () => {
    it("assigns undefined onClick for participant on completed or cancelled plans", () => {
      const actions = {
        setShowPlanActionsSheet: vi.fn(),
        setShowCancelLeaveRequestConfirmation: vi.fn(),
        setShowHostLeaveReplacementSheet: vi.fn(),
        setShowLeavePlanConfirm: vi.fn(),
      };

      const completedResult = resolveHomePlansPreviewLiveAction({
        isCompleted: true,
        isCancelled: false,
        isHost: false,
        effectiveParticipantRecord: { rsvp_status: "INVITED" },
        isSoleHost: false,
        actions,
      });
      expect(completedResult.onClick).toBeUndefined();

      const cancelledResult = resolveHomePlansPreviewLiveAction({
        isCompleted: false,
        isCancelled: true,
        isHost: false,
        effectiveParticipantRecord: { rsvp_status: "INVITED" },
        isSoleHost: false,
        actions,
      });
      expect(cancelledResult.onClick).toBeUndefined();
    });

    it("guards handleLiveActionClick from opening any sheet for participants on completed/cancelled plans", () => {
      const actions = {
        setShowPlanActionsSheet: vi.fn(),
        setShowCancelLeaveRequestConfirmation: vi.fn(),
        setShowHostLeaveReplacementSheet: vi.fn(),
        setShowLeavePlanConfirm: vi.fn(),
      };

      const result = resolveHomePlansPreviewLiveAction({
        isCompleted: true,
        isCancelled: false,
        isHost: false,
        effectiveParticipantRecord: { rsvp_status: "INVITED" },
        isSoleHost: false,
        actions,
      });

      result.handleLiveActionClick();
      expect(actions.setShowPlanActionsSheet).not.toHaveBeenCalled();
      expect(actions.setShowLeavePlanConfirm).not.toHaveBeenCalled();
    });

    it("allows invited participant to open plan actions sheet on active LIVE plans", () => {
      const actions = {
        setShowPlanActionsSheet: vi.fn(),
        setShowCancelLeaveRequestConfirmation: vi.fn(),
        setShowHostLeaveReplacementSheet: vi.fn(),
        setShowLeavePlanConfirm: vi.fn(),
      };

      const result = resolveHomePlansPreviewLiveAction({
        isCompleted: false,
        isCancelled: false,
        isHost: false,
        effectiveParticipantRecord: { rsvp_status: "INVITED" },
        isSoleHost: false,
        actions,
      });

      expect(typeof result.onClick).toBe("function");
      result.onClick?.();
      expect(actions.setShowPlanActionsSheet).toHaveBeenCalledWith(true);
    });
  });
});
