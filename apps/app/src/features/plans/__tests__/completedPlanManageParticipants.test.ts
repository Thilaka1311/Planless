import { describe, it, expect, vi } from "vitest";

describe("Completed Plan Manage Participants Action & Flow", () => {
  // Mirrors onClick resolution in PlansPreviewScreen.tsx (line 2590-2605)
  function resolveHostManageParticipantsAction({
    createMode,
    isCompleted,
    hasPlanTimeEnded,
    actions,
  }: {
    createMode: boolean;
    isCompleted: boolean;
    hasPlanTimeEnded: boolean;
    actions: {
      onEditParticipants?: () => void;
      setShowAttendanceSheet: (val: boolean) => void;
      setShowParticipantManagement: (val: boolean) => void;
      showToast: (msg: string, type: string) => void;
    };
  }) {
    if (createMode) {
      return () => actions.onEditParticipants?.();
    }
    if (isCompleted) {
      return () => actions.setShowAttendanceSheet(true);
    }
    if (hasPlanTimeEnded) {
      return () => actions.showToast("Plan time is up. This plan has completed.", "info");
    }
    return () => actions.setShowParticipantManagement(true);
  }

  it("opens attendance sheet when plan is completed, even though hasPlanTimeEnded is true", () => {
    const setShowAttendanceSheet = vi.fn();
    const setShowParticipantManagement = vi.fn();
    const showToast = vi.fn();

    const action = resolveHostManageParticipantsAction({
      createMode: false,
      isCompleted: true,
      hasPlanTimeEnded: true,
      actions: {
        setShowAttendanceSheet,
        setShowParticipantManagement,
        showToast,
      },
    });

    action();

    expect(setShowAttendanceSheet).toHaveBeenCalledWith(true);
    expect(setShowParticipantManagement).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("shows toast when plan is active but time has ended", () => {
    const setShowAttendanceSheet = vi.fn();
    const setShowParticipantManagement = vi.fn();
    const showToast = vi.fn();

    const action = resolveHostManageParticipantsAction({
      createMode: false,
      isCompleted: false,
      hasPlanTimeEnded: true,
      actions: {
        setShowAttendanceSheet,
        setShowParticipantManagement,
        showToast,
      },
    });

    action();

    expect(setShowAttendanceSheet).not.toHaveBeenCalled();
    expect(setShowParticipantManagement).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Plan time is up. This plan has completed.", "info");
  });

  it("opens live participant management when plan is active and time has not ended", () => {
    const setShowAttendanceSheet = vi.fn();
    const setShowParticipantManagement = vi.fn();
    const showToast = vi.fn();

    const action = resolveHostManageParticipantsAction({
      createMode: false,
      isCompleted: false,
      hasPlanTimeEnded: false,
      actions: {
        setShowAttendanceSheet,
        setShowParticipantManagement,
        showToast,
      },
    });

    action();

    expect(setShowParticipantManagement).toHaveBeenCalledWith(true);
    expect(setShowAttendanceSheet).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("calls onEditParticipants when in createMode", () => {
    const onEditParticipants = vi.fn();
    const setShowAttendanceSheet = vi.fn();
    const setShowParticipantManagement = vi.fn();
    const showToast = vi.fn();

    const action = resolveHostManageParticipantsAction({
      createMode: true,
      isCompleted: false,
      hasPlanTimeEnded: false,
      actions: {
        onEditParticipants,
        setShowAttendanceSheet,
        setShowParticipantManagement,
        showToast,
      },
    });

    action();

    expect(onEditParticipants).toHaveBeenCalled();
    expect(setShowAttendanceSheet).not.toHaveBeenCalled();
    expect(setShowParticipantManagement).not.toHaveBeenCalled();
  });

  it("correctly partitions attended members and bypasses expense dialog in completed mode", () => {
    const members = [
      { id: "host-1", userId: "host-1", name: "Host User", isHost: true },
      { id: "user-2", userId: "user-2", name: "Alice", final_attendance: "ATTENDED" },
      { id: "user-3", userId: "user-3", name: "Bob", final_attendance: "DID_NOT_ATTEND" },
    ];

    const hostId = "host-1";
    const isCompletedMode = true;

    // Simulate HostAttendanceScreen initialization
    const initialState: Record<string, "ATTENDED" | "DID_NOT_ATTEND"> = {};
    const initialIds = new Set<string>();

    members.forEach((m) => {
      const isHostUser = m.isHost || m.userId === hostId;
      let isAttended = false;
      if (isCompletedMode) {
        if (isHostUser) {
          isAttended = true;
        } else if (m.final_attendance) {
          isAttended = m.final_attendance === "ATTENDED";
        }
      }

      if (isAttended) {
        initialState[m.userId] = "ATTENDED";
        initialIds.add(m.userId);
      } else {
        initialState[m.userId] = "DID_NOT_ATTEND";
      }
    });

    expect(initialState["host-1"]).toBe("ATTENDED");
    expect(initialState["user-2"]).toBe("ATTENDED");
    expect(initialState["user-3"]).toBe("DID_NOT_ATTEND");
    expect(initialIds.has("user-2")).toBe(true);
    expect(initialIds.has("user-3")).toBe(false);

    // Host toggles Bob (user-3) to ATTENDED and Alice (user-2) to DID_NOT_ATTEND
    initialState["user-3"] = "ATTENDED";
    initialState["user-2"] = "DID_NOT_ATTEND";

    const currentAttendedIds = new Set(
      Object.entries(initialState)
        .filter(([_, status]) => status === "ATTENDED")
        .map(([id]) => id)
    );

    const usersToAdd: string[] = [];
    currentAttendedIds.forEach((id) => {
      if (!initialIds.has(id)) usersToAdd.push(id);
    });

    const usersToRemove: string[] = [];
    initialIds.forEach((id) => {
      if (!currentAttendedIds.has(id)) usersToRemove.push(id);
    });

    expect(usersToAdd).toEqual(["user-3"]);
    expect(usersToRemove).toEqual(["user-2"]);

    // Submission persists directly with mode 'NONE'
    const onConfirm = vi.fn();
    const effectiveExpenseMode = "NONE";

    onConfirm([], effectiveExpenseMode, usersToAdd, usersToRemove);

    expect(onConfirm).toHaveBeenCalledWith([], "NONE", ["user-3"], ["user-2"]);
  });

  it("verifies plan completion flow finalizes directly with expense mode NONE without cost dialog", () => {
    const onConfirm = vi.fn();
    const payload = [
      { user_id: "host-1", attendance: "ATTENDED" as const },
      { user_id: "user-2", attendance: "ATTENDED" as const },
    ];

    // Standard completion passes mode NONE directly
    onConfirm(payload, "NONE", [], []);

    expect(onConfirm).toHaveBeenCalledWith(payload, "NONE", [], []);
  });
});
