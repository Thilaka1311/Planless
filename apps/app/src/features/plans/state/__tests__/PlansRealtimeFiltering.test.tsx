import { describe, it, expect } from "vitest";
import {
  shouldProcessPlanEvent,
  shouldProcessParticipantEvent,
  shouldProcessMemoryEvent,
  shouldProcessWalletParticipantEvent,
  shouldAppendUserToDbUsers,
} from "../../utils/plansRealtimeFilters";

describe("Plans Realtime Event Filtering", () => {
  const loadedPlans = [
    { id: "plan-1", title: "My Dinner Plan", host_id: "user-123" },
    { id: "plan-2", title: "Weekend Football", host_id: "host-456" },
  ];

  describe("shouldProcessPlanEvent", () => {
    it("accepts UPDATE for a currently loaded plan", () => {
      const result = shouldProcessPlanEvent(
        "UPDATE",
        { id: "plan-1", title: "My Dinner Plan (Rescheduled)" },
        "user-123",
        loadedPlans
      );
      expect(result).toBe(true);
    });

    it("drops UPDATE for an unrelated plan not in loaded plans", () => {
      const result = shouldProcessPlanEvent(
        "UPDATE",
        { id: "plan-stranger-999", title: "Stranger Plan" },
        "user-123",
        loadedPlans
      );
      expect(result).toBe(false);
    });

    it("accepts INSERT when the active user is the host/creator of the new plan", () => {
      const result = shouldProcessPlanEvent(
        "INSERT",
        { id: "plan-new-mine", title: "Created by me", host_id: "user-123" },
        "user-123",
        loadedPlans
      );
      expect(result).toBe(true);
    });

    it("accepts INSERT when host_profile matches the active user", () => {
      const result = shouldProcessPlanEvent(
        "INSERT",
        { id: "plan-new-mine-2", title: "Created by me", host_profile: { id: "user-123" } },
        "user-123",
        loadedPlans
      );
      expect(result).toBe(true);
    });

    it("drops INSERT when another user creates an unrelated plan", () => {
      const result = shouldProcessPlanEvent(
        "INSERT",
        { id: "plan-stranger-new", title: "Created by stranger", host_id: "stranger-user" },
        "user-123",
        loadedPlans
      );
      expect(result).toBe(false);
    });

    it("accepts DELETE for a currently loaded plan", () => {
      const result = shouldProcessPlanEvent(
        "DELETE",
        { id: "plan-2" },
        "user-123",
        loadedPlans
      );
      expect(result).toBe(true);
    });

    it("drops DELETE for an unrelated plan", () => {
      const result = shouldProcessPlanEvent(
        "DELETE",
        { id: "plan-unrelated-777" },
        "user-123",
        loadedPlans
      );
      expect(result).toBe(false);
    });
  });

  describe("shouldProcessParticipantEvent", () => {
    it("accepts participant event for a plan the user is already part of", () => {
      const result = shouldProcessParticipantEvent(
        "INSERT",
        { id: "part-new", plan_id: "plan-1", user_id: "friend-555" },
        "user-123",
        loadedPlans
      );
      expect(result).toEqual({ shouldProcess: true, needsPlanRefresh: false });
    });

    it("drops participant event on an unrelated plan", () => {
      const result = shouldProcessParticipantEvent(
        "INSERT",
        { id: "part-foreign", plan_id: "plan-foreign-999", user_id: "stranger-user" },
        "user-123",
        loadedPlans
      );
      expect(result).toEqual({ shouldProcess: false, needsPlanRefresh: false });
    });

    it("signals needsPlanRefresh when the active user is added/invited to a new plan", () => {
      const result = shouldProcessParticipantEvent(
        "INSERT",
        { id: "part-invited-me", plan_id: "plan-new-invitation-888", user_id: "user-123" },
        "user-123",
        loadedPlans
      );
      expect(result).toEqual({ shouldProcess: true, needsPlanRefresh: true });
    });

    it("accepts DELETE when a participant leaves an existing plan", () => {
      const result = shouldProcessParticipantEvent(
        "DELETE",
        { plan_id: "plan-1", user_id: "friend-555" },
        "user-123",
        loadedPlans
      );
      expect(result).toEqual({ shouldProcess: true, needsPlanRefresh: false });
    });

    it("drops DELETE when a participant leaves an unrelated plan", () => {
      const result = shouldProcessParticipantEvent(
        "DELETE",
        { plan_id: "plan-unrelated", user_id: "stranger" },
        "user-123",
        loadedPlans
      );
      expect(result).toEqual({ shouldProcess: false, needsPlanRefresh: false });
    });
  });

  describe("shouldProcessMemoryEvent", () => {
    it("accepts memory event belonging to a loaded plan", () => {
      const result = shouldProcessMemoryEvent(
        { id: "mem-1", plan_id: "plan-1" },
        loadedPlans
      );
      expect(result).toBe(true);
    });

    it("drops memory event belonging to an unrelated plan", () => {
      const result = shouldProcessMemoryEvent(
        { id: "mem-foreign", plan_id: "plan-unrelated" },
        loadedPlans
      );
      expect(result).toBe(false);
    });
  });

  describe("shouldProcessWalletParticipantEvent", () => {
    const walletPlans = [{ id: "plan-wallet-1" }];

    it("triggers wallet refresh when the active user themselves is updated", () => {
      const result = shouldProcessWalletParticipantEvent(
        { user_id: "user-123", plan_id: "any-plan" },
        null,
        "user-123",
        walletPlans
      );
      expect(result).toBe(true);
    });

    it("triggers wallet refresh when a participant in the user's wallet plan is updated", () => {
      const result = shouldProcessWalletParticipantEvent(
        { user_id: "friend-999", plan_id: "plan-wallet-1" },
        null,
        "user-123",
        walletPlans
      );
      expect(result).toBe(true);
    });

    it("drops participant event on an unrelated plan to prevent wasteful 5-query wallet refresh cascades", () => {
      const result = shouldProcessWalletParticipantEvent(
        { user_id: "stranger-111", plan_id: "stranger-plan-999" },
        null,
        "user-123",
        walletPlans
      );
      expect(result).toBe(false);
    });
  });

  describe("shouldAppendUserToDbUsers", () => {
    const existingUserIds = new Set(["user-123", "friend-1", "friend-2"]);

    it("permits updating the active user", () => {
      expect(shouldAppendUserToDbUsers("user-123", "user-123", existingUserIds)).toBe(true);
    });

    it("permits updating an existing tracked friend/participant", () => {
      expect(shouldAppendUserToDbUsers("friend-1", "user-123", existingUserIds)).toBe(true);
    });

    it("rejects appending random platform users who are not friends or co-participants", () => {
      expect(shouldAppendUserToDbUsers("stranger-random-999", "user-123", existingUserIds)).toBe(false);
    });
  });
});
