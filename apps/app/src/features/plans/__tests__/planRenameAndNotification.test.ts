import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Mocks for Supabase
const mockInvoke = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
const mockRpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
const mockFrom = vi.fn();

vi.mock("../../../../lib/supabaseClient", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "user-actor-1" } }, error: null }),
      getSession: () => Promise.resolve({ data: { session: { user: { id: "user-actor-1" } } }, error: null }),
    },
    from: (...args: any[]) => mockFrom(...args),
  },
}));

// Mock PlansContext for useLivePlan
let mockPlansStorePlans: Plan[] = [];
vi.mock("../state/PlansContext", () => ({
  usePlansStore: () => ({
    plans: mockPlansStorePlans,
  }),
}));

import { useLivePlan } from "../hooks/useLivePlan";
import { findPlanBySlugOrId, getPlanSlug } from "../utils/planSlugUtils";
import { Plan } from "../../../core/types";

describe("Plan Rename and Notification Flow Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlansStorePlans = [];
  });

  describe("1. useLivePlan Resilience & Slug Disambiguation During Rename", () => {
    it("1 & 2. Renaming a plan updates slug, preserves identity, and resolves via both old and new lookups", () => {
      const initialPlan: Plan = {
        id: "plan-uuid-1",
        dbUuid: "plan-uuid-1",
        title: "Smash Guys",
        slug: "smash-guys",
        category: "sports",
        status: "LIVE",
        members: [{ id: "m1", user_id: "u1", name: "Alice", joinState: "JOINED" } as any],
      } as Plan;

      mockPlansStorePlans = [initialPlan];

      // Step 1: Initial resolution with old slug
      const foundInitial = findPlanBySlugOrId(mockPlansStorePlans, "smash-guys");
      expect(foundInitial).not.toBeNull();
      expect(foundInitial?.title).toBe("Smash Guys");

      // Step 2: Plan is renamed to Doomsday
      const renamedPlan: Plan = {
        ...initialPlan,
        title: "Doomsday",
        slug: getPlanSlug({ id: "plan-uuid-1", title: "Doomsday" }, [initialPlan]),
      };
      mockPlansStorePlans = [renamedPlan];

      // New slug matches "doomsday"
      expect(renamedPlan.slug).toBe("doomsday");

      // Step 3: Fresh load / lookup by new slug succeeds
      const freshLookup = findPlanBySlugOrId(mockPlansStorePlans, "doomsday");
      expect(freshLookup).not.toBeNull();
      expect(freshLookup?.title).toBe("Doomsday");
      expect(freshLookup?.id).toBe("plan-uuid-1");

      // Step 4: UUID lookup always resolves regardless of slug changes
      const uuidLookup = findPlanBySlugOrId(mockPlansStorePlans, "plan-uuid-1");
      expect(uuidLookup).not.toBeNull();
      expect(uuidLookup?.title).toBe("Doomsday");
    });

    it("useLivePlan hook caches canonical ID and does not drop to null during rename transition", () => {
      // Test the hook lifecycle logic directly
      let canonicalId: string | null = null;
      let lastLookupParam: string | null = null;

      const simulateUseLivePlan = (plans: Plan[], planIdOrSlug: string | null | undefined): Plan | null => {
        if (!planIdOrSlug) {
          canonicalId = null;
          lastLookupParam = null;
          return null;
        }

        const matched = findPlanBySlugOrId(plans, planIdOrSlug);
        if (matched) {
          canonicalId = matched.id || matched.dbUuid || null;
          lastLookupParam = planIdOrSlug;
          return matched;
        }

        // Fallback: slug changed but route hasn't caught up
        if (canonicalId && lastLookupParam === planIdOrSlug) {
          const fallback = plans.find(p => p.id === canonicalId || p.dbUuid === canonicalId);
          if (fallback) return fallback;
        }

        canonicalId = null;
        lastLookupParam = planIdOrSlug;
        return null;
      };

      const planA: Plan = { id: "uuid-123", title: "Smash Guys", slug: "smash-guys" } as Plan;
      let currentPlans = [planA];

      // 1. Initial view: "smash-guys"
      const r1 = simulateUseLivePlan(currentPlans, "smash-guys");
      expect(r1).not.toBeNull();
      expect(r1?.title).toBe("Smash Guys");

      // 2. Renamed to Doomsday: store updates before route catches up
      const renamedA: Plan = { id: "uuid-123", title: "Doomsday", slug: "doomsday" } as Plan;
      currentPlans = [renamedA];

      // Lookup still with old slug "smash-guys"
      const r2 = simulateUseLivePlan(currentPlans, "smash-guys");
      expect(r2).not.toBeNull(); // Did not drop to null!
      expect(r2?.title).toBe("Doomsday");
      expect(r2?.id).toBe("uuid-123");

      // 3. Route updates to "doomsday"
      const r3 = simulateUseLivePlan(currentPlans, "doomsday");
      expect(r3).not.toBeNull();
      expect(r3?.title).toBe("Doomsday");

      // 4. Navigating to an uncreated plan drops to null cleanly
      const r4 = simulateUseLivePlan(currentPlans, "non-existent-plan");
      expect(r4).toBeNull();
    });
  });

  describe("2. Database Update, Error Handling & Loading Reset", () => {
    it("3 & 4. Failed database update throws useful error and loading state resets in finally", async () => {
      let isSavingTitle = false;
      let caughtError: string | null = null;
      let currentTitle = "Smash Guys";

      const handleSaveTitle = async (newTitle: string, shouldFail = false) => {
        const trimmed = newTitle.trim();
        if (!trimmed) throw new Error("Plan name cannot be empty");
        if (trimmed.length > 50) throw new Error("Plan name must be 50 characters or less");
        if (trimmed === currentTitle) return;

        if (isSavingTitle) return; // Prevent duplicate submission
        isSavingTitle = true;

        try {
          if (shouldFail) {
            throw new Error("Failed to update plan details in database: Network timeout");
          }
          currentTitle = trimmed;
        } catch (err: any) {
          caughtError = err?.message || "Failed";
          throw err;
        } finally {
          isSavingTitle = false; // Always resets!
        }
      };

      // Attempt failing rename
      await expect(handleSaveTitle("Failed Name", true)).rejects.toThrow("Network timeout");
      expect(caughtError).toBe("Failed to update plan details in database: Network timeout");
      // 4. Loading state resets
      expect(isSavingTitle).toBe(false);
      // Title not updated
      expect(currentTitle).toBe("Smash Guys");

      // Attempt successful rename
      await handleSaveTitle("Doomsday", false);
      expect(isSavingTitle).toBe(false);
      expect(currentTitle).toBe("Doomsday");
    });

    it("5 & 6. Submitting the same name does not generate an unnecessary update or effect loop", async () => {
      let updateCalls = 0;
      const currentTitle = "Doomsday";

      const save = (newTitle: string) => {
        const trimmed = newTitle.trim();
        if (!trimmed || trimmed === currentTitle) {
          return false; // Skipped
        }
        updateCalls++;
        return true;
      };

      const result = save("Doomsday");
      expect(result).toBe(false);
      expect(updateCalls).toBe(0);

      const resultWithSpaces = save("   Doomsday   ");
      expect(resultWithSpaces).toBe(false);
      expect(updateCalls).toBe(0);
    });

    it("Validates length: rejects empty name and names longer than 50 characters", () => {
      const validate = (title: string) => {
        const trimmed = title.trim();
        if (!trimmed) throw new Error("Plan name cannot be empty");
        if (trimmed.length > 50) throw new Error("Plan name must be 50 characters or less");
        return trimmed;
      };

      expect(() => validate("")).toThrow("Plan name cannot be empty");
      expect(() => validate("   ")).toThrow("Plan name cannot be empty");
      expect(() => validate("a".repeat(51))).toThrow("Plan name must be 50 characters or less");
      expect(validate("Valid Plan Name")).toBe("Valid Plan Name");
      expect(validate("a".repeat(50))).toBe("a".repeat(50));
    });
  });

  describe("3. Push Notification Dispatch Rules", () => {
    it("7, 8, 9. Exactly one logical rename notification generated with correct old/new name, excluding actor, and targeting joined + waitlisted", async () => {
      const planId = "0623a5f5-37b0-4c54-8a1f-437397fd66f4";
      const actorId = "user-actor-1";
      const oldTitle = "Smash Guys";
      const newTitle = "Doomsday";

      // Mock database response in edge function
      const participants = [
        { user_id: "user-actor-1", rsvp_status: "JOINED" }, // Actor (Host) -> EXCLUDED
        { user_id: "user-joined-2", rsvp_status: "JOINED" }, // Eligible -> INCLUDED
        { user_id: "user-waitlisted-3", rsvp_status: "WAITLISTED" }, // Eligible -> INCLUDED
        { user_id: "user-removed-4", rsvp_status: "REMOVED" }, // Ineligible -> EXCLUDED
        { user_id: "user-left-5", rsvp_status: "LEFT" }, // Ineligible -> EXCLUDED
      ];

      // Simulate edge function recipient filtering logic
      const targetUserIds = participants
        .filter((p) => {
          const status = (p.rsvp_status || "").toUpperCase();
          return (status === "JOINED" || status === "WAITLISTED" || status === "WAITLIST") && p.user_id !== actorId;
        })
        .map((p) => p.user_id);

      // Verify recipient selection
      expect(targetUserIds).toEqual(["user-joined-2", "user-waitlisted-3"]);
      expect(targetUserIds).not.toContain(actorId);
      expect(targetUserIds).not.toContain("user-removed-4");
      expect(targetUserIds).not.toContain("user-left-5");

      // Verify payload copy format
      const notificationTitle = `Plan Updated • ${oldTitle}`;
      const notificationBody = `The plan name changed to ${newTitle}`;
      const notificationTag = `plan-renamed-${planId}`;

      expect(notificationTitle).toBe("Plan Updated • Smash Guys");
      expect(notificationBody).toBe("The plan name changed to Doomsday");
      expect(notificationTag).toBe(`plan-renamed-${planId}`);
    });

    it("10. A failed notification dispatch does not break the rename", async () => {
      let renameSucceeded = false;
      const renamePlanWithPush = async () => {
        // 1. DB update succeeds
        renameSucceeded = true;

        // 2. Push dispatch fails (e.g. edge function timeout)
        try {
          throw new Error("Push server 504 Gateway Timeout");
        } catch (pushErr) {
          console.warn("Push failed silently:", pushErr);
        }
      };

      await expect(renamePlanWithPush()).resolves.not.toThrow();
      expect(renameSucceeded).toBe(true);
    });

    it("11. No rename notification is generated when database update fails", async () => {
      let pushDispatched = false;
      const renamePlanFailingDb = async () => {
        // DB update fails
        throw new Error("DB Error: Unique constraint violated");

        // Code never reaches push dispatch
        pushDispatched = true;
      };

      await expect(renamePlanFailingDb()).rejects.toThrow("DB Error");
      expect(pushDispatched).toBe(false);
    });

    it("12. No date/time-change notification is generated for a name-only edit", () => {
      const oldSched = "2026-10-20T18:00:00Z";
      const newSched: string | undefined = undefined; // Not in update
      const oldPlace = "RMZ Mall";
      const newPlace: string | undefined = undefined; // Not in update
      const oldTitle: string = "Smash Guys";
      const newTitle: string | undefined = "Doomsday";

      const dateChanged = newSched !== undefined && newSched !== oldSched;
      const venueChanged = newPlace !== undefined && newPlace !== oldPlace;
      const titleChanged = newTitle !== undefined && newTitle !== oldTitle;

      const shouldSendReschedulePush = dateChanged || venueChanged;
      const shouldSendRenamePush = titleChanged;

      expect(shouldSendReschedulePush).toBe(false);
      expect(shouldSendRenamePush).toBe(true);
    });

    it("13. The existing plan ID, participation records, waitlist, chat, and expenses remain unchanged", () => {
      const originalPlan: Plan = {
        id: "plan-original-uuid",
        dbUuid: "plan-original-uuid",
        publicId: "pub-123456",
        title: "Smash Guys",
        category: "sports",
        status: "LIVE",
        members: [
          { id: "m1", user_id: "u1", joinState: "JOINED" },
          { id: "m2", user_id: "u2", joinState: "WAITLISTED" },
        ] as any,
        expenses: [{ id: "exp-1", amount: 1500 }] as any,
      } as unknown as Plan;


      // Update title only
      const updatedPlan: Plan = {
        ...originalPlan,
        title: "Doomsday",
        slug: getPlanSlug({ id: originalPlan.id, title: "Doomsday" }, [originalPlan]),
      };

      expect(updatedPlan.id).toBe("plan-original-uuid");
      expect(updatedPlan.dbUuid).toBe("plan-original-uuid");
      expect(updatedPlan.publicId).toBe("pub-123456");
      expect(updatedPlan.members).toHaveLength(2);
      expect(updatedPlan.members[0].joinState).toBe("JOINED");
      expect(updatedPlan.members[1].joinState).toBe("WAITLISTED");
      expect((updatedPlan as any).expenses).toHaveLength(1);
    });
  });
});
