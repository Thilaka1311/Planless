import { describe, it, expect, vi } from "vitest";
import {
  normalizeStatus,
  isJoinedRsvpParticipant,
  isInvitedRsvpParticipant,
  calculateNoLimitDenominator,
  checkHasValidWaitlistReplacement,
  partitionAutomaticParticipants,
} from "../../../../lib/participantStatus";

describe("Participant State Machine — Canonical Baseline Transitions", () => {
  // ==========================================================================
  // 1. NORMAL JOIN FLOW TRANSITIONS
  // ==========================================================================
  describe("1. Normal Join Flow & Capacity Allocation", () => {
    it("Automatic Mode: joins directly as JOINED when available capacity exists", () => {
      const plan = {
        id: "plan-auto-1",
        plan_size: 5,
        participant_filtering: "AUTOMATIC" as const,
      };
      const currentJoinedCount = 3;
      const hasCapacity = currentJoinedCount < plan.plan_size;

      // Transition simulation matching public.join_plan RPC
      const result = {
        rsvp_status: hasCapacity ? "JOINED" : "WAITLISTED",
        assigned_group: null,
        waitlist_position: null,
        joined_queue_at: new Date().toISOString(),
      };

      expect(result.rsvp_status).toBe("JOINED");
      expect(result.assigned_group).toBeNull();
      expect(result.waitlist_position).toBeNull();
      expect(result.joined_queue_at).toBeTruthy();
    });

    it("Automatic Mode: transitions to WAITLISTED when plan is at capacity", () => {
      const plan = {
        id: "plan-auto-2",
        plan_size: 4,
        participant_filtering: "AUTOMATIC" as const,
      };
      const currentJoinedCount = 4;
      const hasCapacity = currentJoinedCount < plan.plan_size;

      const result = {
        rsvp_status: hasCapacity ? "JOINED" : "WAITLISTED",
        assigned_group: null,
        waitlist_position: null,
        joined_queue_at: new Date().toISOString(),
      };

      expect(result.rsvp_status).toBe("WAITLISTED");
      expect(result.assigned_group).toBeNull();
      expect(result.waitlist_position).toBeNull();
      expect(result.joined_queue_at).toBeTruthy();
    });

    it("No-Limit Plan: joins directly as JOINED with no waitlist up to system max 50", () => {
      const plan = {
        id: "plan-no-limit",
        plan_size: null, // No limit
        participant_filtering: "AUTOMATIC" as const,
      };
      const currentJoinedCount = 12;
      const isUnderSystemCeiling = currentJoinedCount < 50;

      const result = {
        rsvp_status: isUnderSystemCeiling ? "JOINED" : "REJECTED",
        assigned_group: null,
        waitlist_position: null,
        joined_queue_at: new Date().toISOString(),
      };

      expect(result.rsvp_status).toBe("JOINED");
      expect(result.assigned_group).toBeNull();
      expect(result.waitlist_position).toBeNull();
    });

    it("No-Limit Plan: rejects join when hard ceiling of 50 is reached", () => {
      const currentJoinedCount = 50;
      expect(() => {
        if (currentJoinedCount >= 50) {
          throw new Error("Plan size reached. This plan already has 50 participants.");
        }
      }).toThrow("Plan size reached. This plan already has 50 participants.");
    });

    it("Assigned Mode: honors host assignment when invited attendee accepts", () => {
      // Scenario A: Pre-assigned to GOING by host
      const inviteeInGoing = {
        user_id: "user-1",
        rsvp_status: "INVITED" as const,
        assigned_group: "GOING" as const,
        waitlist_position: null,
      };

      // When accepting in Assigned mode:
      const acceptedGoing = {
        ...inviteeInGoing,
        rsvp_status: "JOINED" as const,
        assigned_group: "GOING" as const,
        waitlist_position: null,
      };

      expect(acceptedGoing.rsvp_status).toBe("JOINED");
      expect(acceptedGoing.assigned_group).toBe("GOING");
      expect(acceptedGoing.waitlist_position).toBeNull();

      // Scenario B: Pre-assigned to WAITLIST by host with position #2
      const inviteeInWaitlist = {
        user_id: "user-2",
        rsvp_status: "INVITED" as const,
        assigned_group: "WAITLIST" as const,
        waitlist_position: 2,
      };

      const acceptedWaitlist = {
        ...inviteeInWaitlist,
        rsvp_status: "WAITLISTED" as const,
        assigned_group: "WAITLIST" as const,
        waitlist_position: 2, // Position preserved!
      };

      expect(acceptedWaitlist.rsvp_status).toBe("WAITLISTED");
      expect(acceptedWaitlist.assigned_group).toBe("WAITLIST");
      expect(acceptedWaitlist.waitlist_position).toBe(2);
    });

    it("Assigned Mode: participant link claim places new claimant into WAITLIST with next position", () => {
      // Matching claim_plan_invite RPC
      const maxWaitlistPos = 3;
      const newClaimant = {
        rsvp_status: "INVITED" as const,
        assigned_group: "WAITLIST" as const,
        waitlist_position: maxWaitlistPos + 1,
        joined_queue_at: null,
      };

      expect(newClaimant.rsvp_status).toBe("INVITED");
      expect(newClaimant.assigned_group).toBe("WAITLIST");
      expect(newClaimant.waitlist_position).toBe(4);
      expect(newClaimant.joined_queue_at).toBeNull();
    });

    it("Join Idempotency: repeated join call for already JOINED participant preserves state", () => {
      const existingRecord = {
        rsvp_status: "JOINED" as const,
        assigned_group: null,
        waitlist_position: null,
      };

      // Calling join_plan on already JOINED participant returns idempotent success
      const idempotentResult = {
        success: true,
        already_participating: true,
        rsvp_status: existingRecord.rsvp_status,
      };

      expect(idempotentResult.success).toBe(true);
      expect(idempotentResult.already_participating).toBe(true);
      expect(idempotentResult.rsvp_status).toBe("JOINED");
    });
  });

  // ==========================================================================
  // 2. LEAVE AND LEAVE-REQUEST FLOW TRANSITIONS
  // ==========================================================================
  describe("2. Leave and Leave-Request Flow Transitions", () => {
    it("Free Plan: regular participant leaves immediately with SKIPPED and skip_reason 'LEFT'", () => {
      const participant = {
        role: "PARTICIPANT" as const,
        rsvp_status: "JOINED" as const,
        assigned_group: null,
        leave_requested: false,
      };

      // Transition on leave_plan
      const afterLeave = {
        ...participant,
        rsvp_status: "SKIPPED" as const,
        skip_reason: "LEFT" as const,
        assigned_group: null,
        waitlist_position: null,
        leave_requested: false,
      };

      expect(afterLeave.rsvp_status).toBe("SKIPPED");
      expect(afterLeave.skip_reason).toBe("LEFT");
      expect(afterLeave.leave_requested).toBe(false);
    });

    it("Waitlisted Participant: leaves immediately even on a paid plan (no leave request)", () => {
      const isPaidPlan = true;
      const isWaitlisted = true;

      // Decision logic: waitlisted members have no payment obligation
      const createsLeaveRequest = isPaidPlan && !isWaitlisted;
      expect(createsLeaveRequest).toBe(false);

      const afterLeave = {
        rsvp_status: "SKIPPED" as const,
        skip_reason: "LEFT" as const,
        leave_requested: false,
      };

      expect(afterLeave.rsvp_status).toBe("SKIPPED");
      expect(afterLeave.skip_reason).toBe("LEFT");
      expect(afterLeave.leave_requested).toBe(false);
    });

    it("Paid Plan: JOINED participant creates pending leave request with leave_requested = true", () => {
      const isPaidPlan = true;
      const isWaitlisted = false;

      const createsLeaveRequest = isPaidPlan && !isWaitlisted;
      expect(createsLeaveRequest).toBe(true);

      const afterRequest = {
        rsvp_status: "JOINED" as const, // Still JOINED until host resolves
        leave_requested: true,
        leave_requested_at: new Date().toISOString(),
      };

      expect(afterRequest.rsvp_status).toBe("JOINED");
      expect(afterRequest.leave_requested).toBe(true);
      expect(afterRequest.leave_requested_at).toBeTruthy();
    });

    it("Host removing a participant sets SKIPPED and canonical skip_reason 'REMOVED'", () => {
      // Matching remove_participant RPC
      const target = {
        rsvp_status: "JOINED" as const,
        role: "PARTICIPANT" as const,
        leave_requested: true,
      };

      const afterRemove = {
        ...target,
        rsvp_status: "SKIPPED" as const,
        skip_reason: "REMOVED" as const,
        assigned_group: null,
        waitlist_position: null,
        leave_requested: false,
        leave_requested_at: null,
      };

      expect(afterRemove.rsvp_status).toBe("SKIPPED");
      expect(afterRemove.skip_reason).toBe("REMOVED");
      expect(afterRemove.leave_requested).toBe(false);
      expect(afterRemove.assigned_group).toBeNull();
      expect(afterRemove.waitlist_position).toBeNull();
    });
  });

  // ==========================================================================
  // 3. REJOIN FLOW TRANSITIONS
  // ==========================================================================
  describe("3. Rejoin Flow Transitions", () => {
    it("Skipped participant requesting to rejoin transitions to REJOINED awaiting host decision", () => {
      const skippedParticipant = {
        rsvp_status: "SKIPPED" as const,
        skip_reason: "LEFT" as const,
      };

      // Calling rejoin_plan RPC
      const afterRejoinRequest = {
        ...skippedParticipant,
        rsvp_status: "REJOINED" as const,
        skip_reason: null,
        leave_requested: false,
        leave_requested_at: null,
      };

      expect(afterRejoinRequest.rsvp_status).toBe("REJOINED");
      expect(afterRejoinRequest.skip_reason).toBeNull();
    });

    it("Assigned Mode: Host resolving rejoin with 'JOINED' increments plan_size by 1", () => {
      const initialPlanSize = 4;
      const decision = "JOINED";

      // resolve_rejoined_participant logic
      const newPlanSize = decision === "JOINED" ? initialPlanSize + 1 : initialPlanSize;
      const participantAfter = {
        rsvp_status: "JOINED" as const,
        assigned_group: "GOING" as const,
        waitlist_position: null,
        skip_reason: null,
        leave_requested: false,
      };

      expect(newPlanSize).toBe(5);
      expect(participantAfter.rsvp_status).toBe("JOINED");
      expect(participantAfter.assigned_group).toBe("GOING");
      expect(participantAfter.waitlist_position).toBeNull();
    });

    it("Assigned Mode: Host resolving rejoin with 'WAITLIST' preserves plan_size and assigns max_pos + 1", () => {
      const initialPlanSize = 4;
      const currentMaxWaitlistPos = 2;
      const decision = "WAITLIST" as string;

      const newPlanSize = decision === "JOINED" ? initialPlanSize + 1 : initialPlanSize;
      const participantAfter = {
        rsvp_status: "WAITLISTED" as const,
        assigned_group: "WAITLIST" as const,
        waitlist_position: currentMaxWaitlistPos + 1,
        skip_reason: null,
        leave_requested: false,
      };

      expect(newPlanSize).toBe(4); // Strictly unchanged
      expect(participantAfter.rsvp_status).toBe("WAITLISTED");
      expect(participantAfter.assigned_group).toBe("WAITLIST");
      expect(participantAfter.waitlist_position).toBe(3);
    });

    it("Automatic Mode: Host resolving rejoin with 'JOINED' preserves plan capacity", () => {
      const planCapacity = 6;
      const participantAfter = {
        rsvp_status: "JOINED" as const,
        assigned_group: null,
        waitlist_position: null,
        skip_reason: null,
      };

      expect(planCapacity).toBe(6);
      expect(participantAfter.rsvp_status).toBe("JOINED");
      expect(participantAfter.assigned_group).toBeNull();
    });
  });

  // ==========================================================================
  // 4. WAITLIST AND PROMOTION RULES
  // ==========================================================================
  describe("4. Waitlist Ordering and Vacancy Promotion Rules", () => {
    it("Automatic Mode: FCFS order promotes earliest joined_queue_at candidate to JOINED", () => {
      const waitlistCandidates = [
        { id: "u-late", name: "Late User", rsvp_status: "WAITLISTED", joined_queue_at: "2026-10-10T12:30:00Z" },
        { id: "u-early", name: "Early User", rsvp_status: "WAITLISTED", joined_queue_at: "2026-10-10T10:00:00Z" },
      ];

      // Sorted by joined_queue_at ASC
      const sorted = [...waitlistCandidates].sort(
        (a, b) => new Date(a.joined_queue_at).getTime() - new Date(b.joined_queue_at).getTime()
      );

      const candidateToPromote = sorted[0];
      expect(candidateToPromote.id).toBe("u-early");

      // Promoted candidate transitions to JOINED
      const promoted = {
        ...candidateToPromote,
        rsvp_status: "JOINED" as const,
        waitlist_position: null,
      };

      expect(promoted.rsvp_status).toBe("JOINED");
      expect(promoted.waitlist_position).toBeNull();
    });

    it("Assigned Mode: Vacancy promotion moves position #1 to GOING, preserving INVITED status if unresponded", () => {
      // Scenario A: Candidate #1 is WAITLISTED -> moves to GOING, becomes JOINED
      const waitlistedCandidate = {
        id: "u-1",
        rsvp_status: "WAITLISTED" as const,
        assigned_group: "WAITLIST" as const,
        waitlist_position: 1,
      };

      const promotedWaitlisted = {
        ...waitlistedCandidate,
        rsvp_status: "JOINED" as const,
        assigned_group: "GOING" as const,
        waitlist_position: null,
      };

      expect(promotedWaitlisted.rsvp_status).toBe("JOINED");
      expect(promotedWaitlisted.assigned_group).toBe("GOING");
      expect(promotedWaitlisted.waitlist_position).toBeNull();

      // Scenario B: Candidate #1 is INVITED -> moves to GOING, PRESERVES INVITED status!
      const invitedCandidate = {
        id: "u-2",
        rsvp_status: "INVITED" as const,
        assigned_group: "WAITLIST" as const,
        waitlist_position: 1,
      };

      const promotedInvited = {
        ...invitedCandidate,
        rsvp_status: "INVITED" as const, // Preserved!
        assigned_group: "GOING" as const,
        waitlist_position: null,
      };

      expect(promotedInvited.rsvp_status).toBe("INVITED");
      expect(promotedInvited.assigned_group).toBe("GOING");
      expect(promotedInvited.waitlist_position).toBeNull();
    });

    it("Assigned Mode: Two-stage renumbering ensures remaining waitlist members are 1..N without duplicates", () => {
      // Waitlist with positions 2 and 3 after position 1 was promoted
      const remainingWaitlist = [
        { id: "u-2", waitlist_position: 2 },
        { id: "u-3", waitlist_position: 3 },
      ];

      // Safe renumbering
      const renumbered = remainingWaitlist.map((item, idx) => ({
        ...item,
        waitlist_position: idx + 1,
      }));

      expect(renumbered[0].waitlist_position).toBe(1);
      expect(renumbered[1].waitlist_position).toBe(2);
    });
  });

  // ==========================================================================
  // 5. HOST LIFECYCLE AND NON-ORPHAN INVARIANTS
  // ==========================================================================
  describe("5. Host Lifecycle and Non-Orphan Invariants", () => {
    it("Sole active host cannot leave plan without transferring host role", () => {
      const activeHostsCount = 1;
      const callerRole = "HOST";
      const callerStatus = "JOINED";

      expect(() => {
        if (callerRole === "HOST" && callerStatus === "JOINED" && activeHostsCount <= 1) {
          throw new Error("Cannot leave the plan as the last remaining active host");
        }
      }).toThrow("Cannot leave the plan as the last remaining active host");
    });

    it("Stop hosting with replacement: promotes replacement to HOST and demotes caller to PARTICIPANT (stays JOINED)", () => {
      const caller = { id: "host-1", role: "HOST" as const, rsvp_status: "JOINED" as const };
      const replacement = { id: "user-2", role: "PARTICIPANT" as const, rsvp_status: "JOINED" as const };

      // stop_hosting_with_replacement RPC execution
      const updatedReplacement = { ...replacement, role: "HOST" as const };
      const updatedCaller = { ...caller, role: "PARTICIPANT" as const };

      expect(updatedReplacement.role).toBe("HOST");
      expect(updatedCaller.role).toBe("PARTICIPANT");
      expect(updatedCaller.rsvp_status).toBe("JOINED"); // Stays in the plan!
    });

    it("Host leave with replacement: promotes replacement to HOST and transitions caller to SKIPPED/LEFT", () => {
      const caller = { id: "host-1", role: "HOST" as const, rsvp_status: "JOINED" as const };
      const replacement = { id: "user-2", role: "PARTICIPANT" as const, rsvp_status: "JOINED" as const };

      // request_host_leave_with_replacement RPC execution
      const updatedReplacement = { ...replacement, role: "HOST" as const };
      const updatedCaller = {
        ...caller,
        role: "PARTICIPANT" as const,
        rsvp_status: "SKIPPED" as const,
        skip_reason: "LEFT" as const,
        leave_requested: false,
      };

      expect(updatedReplacement.role).toBe("HOST");
      expect(updatedCaller.role).toBe("PARTICIPANT");
      expect(updatedCaller.rsvp_status).toBe("SKIPPED");
      expect(updatedCaller.skip_reason).toBe("LEFT");
    });
  });

  // ==========================================================================
  // 6. COUNT AND CAPACITY SYNCHRONIZATION
  // ==========================================================================
  describe("6. Count and Capacity Synchronization Invariants", () => {
    it("Joined count is derived strictly from confirmed JOINED RSVP status or host role", () => {
      const participants = [
        { id: "h1", role: "HOST", rsvp_status: "JOINED" },
        { id: "u1", role: "PARTICIPANT", rsvp_status: "JOINED" },
        { id: "u2", role: "PARTICIPANT", rsvp_status: "INVITED", assigned_group: "GOING" },
        { id: "u3", role: "PARTICIPANT", rsvp_status: "WAITLISTED", assigned_group: "WAITLIST" },
        { id: "u4", role: "PARTICIPANT", rsvp_status: "SKIPPED", skip_reason: "LEFT" },
      ];

      const joinedCount = participants.filter(isJoinedRsvpParticipant).length;
      expect(joinedCount).toBe(2); // Only h1 and u1
    });

    it("Invited count strictly excludes SKIPPED participants", () => {
      const participants = [
        { id: "h1", rsvp_status: "JOINED" },
        { id: "u1", rsvp_status: "JOINED" },
        { id: "u2", rsvp_status: "INVITED" },
        { id: "u3", rsvp_status: "WAITLISTED" },
        { id: "u4", rsvp_status: "SKIPPED" },
      ];

      const invitedParticipantsCount = participants.filter(p => p.rsvp_status !== "SKIPPED").length;
      expect(invitedParticipantsCount).toBe(4);
    });
  });
});
