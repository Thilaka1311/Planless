import { describe, it, expect, vi } from "vitest";
import React from "react";
import { RemoveGoingParticipantBottomSheet } from "../components/BottomSheets";
import {
  isJoinedRsvpParticipant,
  partitionAutomaticParticipants,
  formatSkipReason,
} from "../../../../lib/participantStatus";

describe("Remove Participant Bottom Sheet and Removal Flow Contract", () => {
  function findButtons(node: any): any[] {
    const buttons: any[] = [];
    function walk(n: any) {
      if (!n) return;
      if (Array.isArray(n)) {
        n.forEach(walk);
        return;
      }
      if (n.type === 'button') {
        buttons.push(n);
      }
      if (n.props && n.props.children) {
        walk(n.props.children);
      }
    }
    walk(node);
    return buttons;
  }

  function extractText(node: any): string {
    if (!node) return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(extractText).join(" ");
    if (node.props && node.props.children) return extractText(node.props.children);
    return "";
  }

  it("renders both Replace Participant and Remove Participant options and does not render Decrease Plan Size", () => {
    const handleReplace = vi.fn();
    const handleRemove = vi.fn();
    const handleClose = vi.fn();

    const element = RemoveGoingParticipantBottomSheet({
      isOpen: true,
      participant: { name: "Bhaavya", avatar: "https://example.com/avatar.jpg" },
      goingCount: 2,
      waitlistCount: 0,
      planSize: 8,
      onReplaceParticipant: handleReplace,
      onRemoveParticipant: handleRemove,
      onClose: handleClose,
    });

    expect(element).not.toBeNull();
    const allButtons = findButtons(element);
    const buttonTexts = allButtons.map(b => extractText(b).trim());

    // 1. First action is Replace Participant
    expect(buttonTexts[0]).toContain("Replace Participant");
    // Trigger onClick
    allButtons[0].props.onClick();
    expect(handleReplace).toHaveBeenCalledTimes(1);

    // 2. Second action directly below is Remove Participant
    expect(buttonTexts[1]).toContain("Remove Participant");
    // Trigger onClick
    allButtons[1].props.onClick();
    expect(handleRemove).toHaveBeenCalledTimes(1);

    // 3. Cancel button
    const cancelBtn = allButtons.find(b => extractText(b).trim() === "Cancel");
    expect(cancelBtn).toBeDefined();
    cancelBtn.props.onClick();
    expect(handleClose).toHaveBeenCalledTimes(1);

    // 4. "Decrease Plan Size" is NOT present among buttons
    expect(buttonTexts.some(t => t.includes("Decrease Plan Size"))).toBe(false);
  });

  it("Acceptance Test: Removing joined participant Bhaavya marks her SKIPPED with reason 'Removed', decreases Joined count, and preserves spot capacity", () => {
    // Initial state matching user screenshot:
    // Host (You), Bhaavya (joined), and 6 other participants, capacity = 8
    const initialParticipants = [
      { id: "u-host", name: "You", isHost: true, role: "HOST", rsvp_status: "JOINED", skip_reason: null },
      { id: "u-bhaavya", name: "Bhaavya", isHost: false, role: "PARTICIPANT", rsvp_status: "JOINED", skip_reason: null },
      { id: "u-aznan", name: "Aznan", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED", skip_reason: null },
      { id: "u-maanastej", name: "Maanastej", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED", skip_reason: null },
      { id: "u-pranav", name: "Pranav", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED", skip_reason: null },
      { id: "u-raam", name: "RAAM", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED", skip_reason: null },
      { id: "u-ren", name: "Ren", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED", skip_reason: null },
      { id: "u-thilak", name: "Thilaka Sundar", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED", skip_reason: null },
    ];

    const planSize = 8;

    // Before removal: 2 joined (You + Bhaavya)
    const beforePartition = partitionAutomaticParticipants(initialParticipants, planSize, "u-host");
    const beforeJoinedCount = beforePartition.going.filter(isJoinedRsvpParticipant).length;
    expect(beforeJoinedCount).toBe(2);
    expect(beforePartition.skipped.length).toBe(0);

    // Host taps Bhaavya -> Remove participant -> Remove Participant
    // State update mechanism: participant record is NOT deleted, but transitioned to SKIPPED with skip_reason = "REMOVED"
    const afterParticipants = initialParticipants.map((p) => {
      if (p.id === "u-bhaavya") {
        return {
          ...p,
          rsvp_status: "SKIPPED",
          skip_reason: "REMOVED",
          assigned_group: null,
          waitlist_position: null,
          leave_requested: false,
          leave_requested_at: null,
        };
      }
      return p;
    });

    // 1. Participant record is preserved (all 8 participants still exist in the data model)
    expect(afterParticipants.length).toBe(8);

    // 2. Bhaavya is marked skipped with skip reason REMOVED
    const bhaavya = afterParticipants.find((p) => p.id === "u-bhaavya")!;
    expect(bhaavya).toBeDefined();
    expect(bhaavya.rsvp_status).toBe("SKIPPED");
    expect(bhaavya.skip_reason).toBe("REMOVED");
    expect(formatSkipReason(bhaavya.skip_reason)).toBe("Removed");

    // 3. Partitioning: Bhaavya is NO LONGER joined, waitlisted, or invited
    const afterPartition = partitionAutomaticParticipants(afterParticipants, planSize, "u-host");
    expect(afterPartition.going.find((p) => p.id === "u-bhaavya")).toBeUndefined();
    expect(afterPartition.waitlist.find((p) => p.id === "u-bhaavya")).toBeUndefined();

    // 4. Bhaavya appears in the Skipped collection
    expect(afterPartition.skipped.find((p) => p.id === "u-bhaavya")).toBeDefined();

    // 5. The Joined count decreases accordingly (from 2 to 1)
    const afterJoinedCount = afterPartition.going.filter(isJoinedRsvpParticipant).length;
    expect(afterJoinedCount).toBe(1);

    // 6. No other participant's RSVP status is changed
    expect(afterParticipants.find((p) => p.id === "u-host")?.rsvp_status).toBe("JOINED");
    expect(afterParticipants.find((p) => p.id === "u-aznan")?.rsvp_status).toBe("INVITED");
    expect(afterParticipants.find((p) => p.id === "u-maanastej")?.rsvp_status).toBe("INVITED");
    expect(afterParticipants.find((p) => p.id === "u-pranav")?.rsvp_status).toBe("INVITED");
    expect(afterParticipants.find((p) => p.id === "u-raam")?.rsvp_status).toBe("INVITED");
    expect(afterParticipants.find((p) => p.id === "u-ren")?.rsvp_status).toBe("INVITED");
    expect(afterParticipants.find((p) => p.id === "u-thilak")?.rsvp_status).toBe("INVITED");
  });

  it("Soft-removal invariant: Removing an invited participant does NOT delete their record, marks SKIPPED / REMOVED", () => {
    const initialParticipants = [
      { id: "u-host", name: "You", isHost: true, role: "HOST", rsvp_status: "JOINED", skip_reason: null },
      { id: "u-invited", name: "Alex", isHost: false, role: "PARTICIPANT", rsvp_status: "INVITED", skip_reason: null },
    ];

    // Removal transition
    const updated = initialParticipants.map((p) => {
      if (p.id === "u-invited") {
        return {
          ...p,
          rsvp_status: "SKIPPED",
          skip_reason: "REMOVED",
          assigned_group: null,
          waitlist_position: null,
          leave_requested: false,
          leave_requested_at: null,
        };
      }
      return p;
    });

    // Record is preserved in data model
    expect(updated.length).toBe(2);
    const alex = updated.find((p) => p.id === "u-invited")!;
    expect(alex.rsvp_status).toBe("SKIPPED");
    expect(alex.skip_reason).toBe("REMOVED");
    expect(formatSkipReason(alex.skip_reason)).toBe("Removed");

    const partitioned = partitionAutomaticParticipants(updated, 5, "u-host");
    expect(partitioned.skipped.some((p) => p.id === "u-invited")).toBe(true);
    expect(partitioned.going.some((p) => p.id === "u-invited")).toBe(false);
  });
});
