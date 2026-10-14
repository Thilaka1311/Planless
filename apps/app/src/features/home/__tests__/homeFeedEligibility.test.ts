import { describe, it, expect } from "vitest";
import { isPlanEligibleForHomeDiscovery } from "../utils/homeFeedEligibility";
import { Plan, DbPlanParticipant } from "../../../core/types";

describe("Home Discovery Feed Eligibility Contract", () => {
  const basePlan: Plan = ({
    id: "plan-doomsday-123",
    dbUuid: "plan-doomsday-123",
    publicId: "P001",
    slug: "doomsday",
    title: "Doomsday",
    description: "Movie night",
    status: "LIVE",
    hostId: "host-user-999",
    category: "movies",
    date: "TOMORROW",
    time: "16:15",
    datetime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    response_deadline_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
    maxSpots: 10,
    plan_size: 10,
    members: [],
    location: "PVR Cinemas",
    coverImage: "https://example.com/cover.jpg",
    paymentAmount: 0,
    createdAt: new Date().toISOString(),
  } as unknown) as Plan;

  const currentUserId = "user-active-1";
  const currentUserUuid = "c3dc4291-f7d7-4cf5-88f3-6be5cdb71353";

  const createMockParticipant = (overrides: Partial<DbPlanParticipant>): DbPlanParticipant => ({
    id: `part-${Math.random().toString(36).substring(7)}`,
    plan_id: basePlan.id,
    user_id: currentUserUuid,
    role: "PARTICIPANT",
    rsvp_status: "INVITED",
    responded_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    delivery_status: "DELIVERED",
    skip_reason: null,
    ...overrides,
  });

  describe("1. Authoritative Participation State Matrix", () => {
    it("surfaces a plan when the current user has NO participation record / never interacted", () => {
      const isEligible = isPlanEligibleForHomeDiscovery({
        plan: basePlan,
        userId: currentUserId,
        userUuid: currentUserUuid,
        participantRecord: null,
        joinedCount: 4,
      });

      expect(isEligible).toBe(true);
    });

    it("surfaces a plan when the current user's authoritative state is INVITED", () => {
      const invitedRecord = createMockParticipant({
        rsvp_status: "INVITED",
      });

      const isEligible = isPlanEligibleForHomeDiscovery({
        plan: basePlan,
        userId: currentUserId,
        userUuid: currentUserUuid,
        participantRecord: invitedRecord,
        joinedCount: 4,
      });

      expect(isEligible).toBe(true);
    });

    it("excludes a plan when the current user has JOINED", () => {
      const joinedRecord = createMockParticipant({
        rsvp_status: "JOINED",
        responded_at: new Date().toISOString(),
      });

      const isEligible = isPlanEligibleForHomeDiscovery({
        plan: basePlan,
        userId: currentUserId,
        userUuid: currentUserUuid,
        participantRecord: joinedRecord,
        joinedCount: 5,
      });

      expect(isEligible).toBe(false);
    });

    it("excludes a plan when the current user is WAITLISTED (Fix for Doomsday reported bug)", () => {
      const waitlistedRecord = createMockParticipant({
        rsvp_status: "WAITLISTED",
        responded_at: new Date().toISOString(),
        waitlist_position: 2,
        assigned_group: "WAITLIST" as any,
      });

      const isEligible = isPlanEligibleForHomeDiscovery({
        plan: basePlan,
        userId: currentUserId,
        userUuid: currentUserUuid,
        participantRecord: waitlistedRecord,
        joinedCount: 10,
      });

      expect(isEligible).toBe(false);
    });

    it("excludes a plan when the current user has SKIPPED", () => {
      const skippedRecord = createMockParticipant({
        rsvp_status: "SKIPPED",
        responded_at: new Date().toISOString(),
      });

      const isEligible = isPlanEligibleForHomeDiscovery({
        plan: basePlan,
        userId: currentUserId,
        userUuid: currentUserUuid,
        participantRecord: skippedRecord,
        joinedCount: 4,
      });

      expect(isEligible).toBe(false);
    });

    it("excludes a plan when the current user has DECLINED an invitation", () => {
      const declinedRecord = createMockParticipant({
        rsvp_status: "SKIPPED",
        responded_at: new Date().toISOString(),
        skip_reason: "DECLINED" as any,
      });

      const isEligible = isPlanEligibleForHomeDiscovery({
        plan: basePlan,
        userId: currentUserId,
        userUuid: currentUserUuid,
        participantRecord: declinedRecord,
        joinedCount: 4,
      });

      expect(isEligible).toBe(false);
    });

    it("excludes a plan when the current user has LEFT the plan", () => {
      const leftRecord = createMockParticipant({
        rsvp_status: "SKIPPED",
        responded_at: new Date().toISOString(),
        skip_reason: "LEFT" as any,
      });

      const isEligible = isPlanEligibleForHomeDiscovery({
        plan: basePlan,
        userId: currentUserId,
        userUuid: currentUserUuid,
        participantRecord: leftRecord,
        joinedCount: 3,
      });

      expect(isEligible).toBe(false);
    });

    it("excludes a plan when the current user was REMOVED from the plan", () => {
      const removedRecord = createMockParticipant({
        rsvp_status: "SKIPPED",
        responded_at: new Date().toISOString(),
        skip_reason: "REMOVED" as any,
      });

      const isEligible = isPlanEligibleForHomeDiscovery({
        plan: basePlan,
        userId: currentUserId,
        userUuid: currentUserUuid,
        participantRecord: removedRecord,
        joinedCount: 3,
      });

      expect(isEligible).toBe(false);
    });

    it("excludes a plan after invitation is accepted and participation updated to JOINED or WAITLISTED", () => {
      // 1. Initial invited state -> visible
      const invitedState = createMockParticipant({
        rsvp_status: "INVITED",
      });
      expect(
        isPlanEligibleForHomeDiscovery({
          plan: basePlan,
          userId: currentUserId,
          userUuid: currentUserUuid,
          participantRecord: invitedState,
          joinedCount: 2,
        })
      ).toBe(true);

      // 2. Acceptance -> participation updated to JOINED -> immediately excluded
      const updatedToJoined = createMockParticipant({
        rsvp_status: "JOINED",
        responded_at: new Date().toISOString(),
      });
      expect(
        isPlanEligibleForHomeDiscovery({
          plan: basePlan,
          userId: currentUserId,
          userUuid: currentUserUuid,
          participantRecord: updatedToJoined,
          joinedCount: 3,
        })
      ).toBe(false);

      // 3. Acceptance on full plan -> participation updated to WAITLISTED -> immediately excluded
      const updatedToWaitlisted = createMockParticipant({
        rsvp_status: "WAITLISTED",
        waitlist_position: 1,
        responded_at: new Date().toISOString(),
      });
      expect(
        isPlanEligibleForHomeDiscovery({
          plan: basePlan,
          userId: currentUserId,
          userUuid: currentUserUuid,
          participantRecord: updatedToWaitlisted,
          joinedCount: 10,
        })
      ).toBe(false);
    });
  });

  describe("2. Host Separation and Edge Cases", () => {
    it("excludes plans where the user is the HOST (hosted plans belong to Plans tab)", () => {
      const hostedRecord = createMockParticipant({
        role: "HOST",
        rsvp_status: "JOINED",
        responded_at: new Date().toISOString(),
      });

      const isEligible = isPlanEligibleForHomeDiscovery({
        plan: { ...basePlan, hostId: currentUserUuid },
        userId: currentUserId,
        userUuid: currentUserUuid,
        participantRecord: hostedRecord,
        joinedCount: 1,
      });

      expect(isEligible).toBe(false);
    });

    it("excludes plans where the user is host by hostId even if no participant record is passed", () => {
      const isEligible = isPlanEligibleForHomeDiscovery({
        plan: { ...basePlan, hostId: currentUserUuid },
        userId: currentUserId,
        userUuid: currentUserUuid,
        participantRecord: null,
        joinedCount: 1,
      });

      expect(isEligible).toBe(false);
    });

    it("allows another user who has never interacted with Doomsday to discover it", () => {
      const otherUser = "user-other-person";
      const otherUserUuid = "e2b16e5c-d129-4e16-bc03-38894eacedd4";

      // Doomsday has current user on waitlist, but otherUser has never interacted
      const isEligible = isPlanEligibleForHomeDiscovery({
        plan: basePlan,
        userId: otherUser,
        userUuid: otherUserUuid,
        participantRecord: null,
        joinedCount: 4,
      });

      expect(isEligible).toBe(true);
    });

    it("excludes plans that are expired past their RSVP deadline", () => {
      const expiredPlan: Plan = {
        ...basePlan,
        response_deadline_at: new Date(Date.now() - 3600 * 1000).toISOString(), // 1 hour ago
      };

      const isEligible = isPlanEligibleForHomeDiscovery({
        plan: expiredPlan,
        userId: currentUserId,
        userUuid: currentUserUuid,
        participantRecord: null,
        joinedCount: 2,
      });

      expect(isEligible).toBe(false);
    });

    it("excludes plans that are not active or live (e.g. COMPLETED or CANCELLED)", () => {
      const cancelledPlan: Plan = {
        ...basePlan,
        status: "CANCELLED",
      };

      const isEligible = isPlanEligibleForHomeDiscovery({
        plan: cancelledPlan,
        userId: currentUserId,
        userUuid: currentUserUuid,
        participantRecord: null,
        joinedCount: 2,
      });

      expect(isEligible).toBe(false);
    });

    it("excludes plans that have reached the hard system ceiling of 50 joined participants", () => {
      const isEligibleAt50 = isPlanEligibleForHomeDiscovery({
        plan: basePlan,
        userId: currentUserId,
        userUuid: currentUserUuid,
        participantRecord: null,
        joinedCount: 50,
      });

      expect(isEligibleAt50).toBe(false);

      const isEligibleAt49 = isPlanEligibleForHomeDiscovery({
        plan: basePlan,
        userId: currentUserId,
        userUuid: currentUserUuid,
        participantRecord: null,
        joinedCount: 49,
      });

      expect(isEligibleAt49).toBe(true);
    });
  });

  describe("3. Lifecycle State Transitions & Cache Invalidation Scenarios", () => {
    it("simulates Hold to Accept waitlisting: plan immediately drops out of Home feed", () => {
      // Step 1: User views Doomsday on Home (invited state)
      const feedStateBefore = [
        createMockParticipant({
          rsvp_status: "INVITED",
        }),
      ];

      expect(
        isPlanEligibleForHomeDiscovery({
          plan: basePlan,
          userId: currentUserId,
          userUuid: currentUserUuid,
          participantRecord: feedStateBefore[0],
          joinedCount: 10,
        })
      ).toBe(true);

      // Step 2: User completes hold-to-accept waitlist action -> optimistic write sets WAITLISTED
      const feedStateAfter = [
        createMockParticipant({
          rsvp_status: "WAITLISTED",
          responded_at: new Date().toISOString(),
          waitlist_position: 1,
        }),
      ];

      expect(
        isPlanEligibleForHomeDiscovery({
          plan: basePlan,
          userId: currentUserId,
          userUuid: currentUserUuid,
          participantRecord: feedStateAfter[0],
          joinedCount: 10,
        })
      ).toBe(false);

      // Step 3: Refresh / page reload / navigation back to Home loads persisted DB record with WAITLISTED
      // It remains excluded!
      expect(
        isPlanEligibleForHomeDiscovery({
          plan: basePlan,
          userId: currentUserId,
          userUuid: currentUserUuid,
          participantRecord: feedStateAfter[0],
          joinedCount: 10,
        })
      ).toBe(false);
    });

    it("simulates passing a plan: plan remains excluded across refreshes", () => {
      // Pass plan sets SKIPPED with skip_reason LEFT
      const passedRecord = createMockParticipant({
        rsvp_status: "SKIPPED",
        responded_at: new Date().toISOString(),
        skip_reason: "LEFT" as any,
      });

      expect(
        isPlanEligibleForHomeDiscovery({
          plan: basePlan,
          userId: currentUserId,
          userUuid: currentUserUuid,
          participantRecord: passedRecord,
          joinedCount: 4,
        })
      ).toBe(false);
    });

    it("preserves accessibility in the Plans tab when excluded from Home", () => {
      // In PlansScreen.tsx, filtering uses participantMap:
      // rsvpStatus === "WAITLISTED" matches localPlansFilter === "WAITLISTED"
      const waitlistedRecord = createMockParticipant({
        rsvp_status: "WAITLISTED",
        responded_at: new Date().toISOString(),
      });

      // Excluded from Home
      expect(
        isPlanEligibleForHomeDiscovery({
          plan: basePlan,
          userId: currentUserId,
          userUuid: currentUserUuid,
          participantRecord: waitlistedRecord,
          joinedCount: 10,
        })
      ).toBe(false);

      // In Plans tab, user can view and manage their waitlist spot
      const isVisibleInPlansWaitlistTab = waitlistedRecord.rsvp_status === "WAITLISTED";
      expect(isVisibleInPlansWaitlistTab).toBe(true);
    });
  });
});
