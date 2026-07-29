import React, { useCallback } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { normalizeStatus } from "../../../../lib/participantStatus";
import { Plan, DbPlan, DbPlanParticipant, User } from "../../../core/types";
import { updateParticipantStatus, insertParticipant, deleteParticipant, syncUserStats } from "../../../../lib/db";
import { cleanPlanId, isUuid as isUuidUtil, resolveUserUuid as resolveUserUuidUtil } from "../utils/planUtils";
import { syncPlanFriendships } from "../../friendships/services/friendshipService";
import { recalculateWalletExpenses } from "../../wallet/services/walletSyncService";
import * as api from "../api/plans";

export interface JoinOptions {
  forceStatus?: "going" | "waitlist";
  skipPayment?: boolean;
}

export interface UsePlanParticipantsProps {
  userId: string;
  dbUsers: User[];
  dbPlans: DbPlan[];
  plans: Plan[];
  dbPlanParticipants: DbPlanParticipant[];
  setDbPlanParticipants: React.Dispatch<React.SetStateAction<DbPlanParticipant[]>>;
  insertSystemMessage: (planUuid: string, content: string, actorUuid: string | null) => Promise<void>;
  refreshPlans: (targetTables?: string[]) => Promise<void>;
  unassignTeam: (planUuid: string, userUuid: string) => Promise<void>;
  dbCircleMembers?: any[];
}

export interface AddParticipantsOptions {
  planId: string;
  inviteeUuids: string[];
  userProfile?: any;
  planTitle?: string;
  inviteeCircleMap?: Record<string, string | null>;
  assignedGroup?: 'GOING' | 'WAITLIST' | null;
}

export function usePlanParticipants({
  userId,
  dbUsers,
  dbPlans,
  plans,
  dbPlanParticipants,
  setDbPlanParticipants,
  insertSystemMessage,
  refreshPlans,
  unassignTeam,
  dbCircleMembers
}: UsePlanParticipantsProps) {

  const resolveUserUuid = useCallback((uId: string) => {
    return resolveUserUuidUtil(uId, dbUsers);
  }, [dbUsers]);

  const isUuid = useCallback((val: any) => isUuidUtil(val), []);

  const applyParticipantOptimisticUpdate = useCallback((
    planUuid: string,
    userUuid: string,
    updates: Partial<DbPlanParticipant>
  ) => {
    setDbPlanParticipants(prev => {
      const matchIndex = prev.findIndex(pp => pp.plan_id === planUuid && pp.user_id === userUuid);
      if (matchIndex > -1) {
        const updated = [...prev];
        updated[matchIndex] = { ...updated[matchIndex], ...updates };
        return updated;
      } else {
        const newRecord: DbPlanParticipant = {
          plan_id: planUuid,
          user_id: userUuid,
          role: "PARTICIPANT",
          rsvp_status: "INVITED",
          responded_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...updates
        } as any;
        return [...prev, newRecord];
      }
    });
  }, [setDbPlanParticipants]);

  const handleParticipantStatusChange = useCallback(async (
    planUuid: string,
    participantUserUuid: string,
    oldStatus: string | null | undefined,
    newStatus: string
  ) => {
    const matchedPlan = plans.find(p => p.id === planUuid || p.dbUuid === planUuid);
    const dbPlanObj = dbPlans.find(p => p.id === planUuid);
    const hostUuid = resolveUserUuid(matchedPlan?.hostId || dbPlanObj?.host_id || "");

    const participantUuid = resolveUserUuid(participantUserUuid);
    const normOld = oldStatus ? normalizeStatus(oldStatus) : null;
    const normNew = normalizeStatus(newStatus);

    if (planUuid && participantUuid) {
      const participantUser = dbUsers.find(u => u.id === participantUuid || u.user_id === participantUuid || (u as any).dbUuid === participantUuid);
      const participantName = participantUser?.full_name || "Someone";
      const planTitle = matchedPlan?.title || dbPlanObj?.title || "meetup";



      // Phase 7: System message insertion on status changes
      if (normOld === "WAITLISTED" && normNew === "JOINED") {
        await insertSystemMessage(planUuid, `${participantName} moved from waitlist to confirmed`, participantUuid);
      } else if (normOld !== "JOINED" && normOld !== "WAITLISTED" && normNew === "JOINED") {
        await insertSystemMessage(planUuid, `${participantName} joined the plan`, participantUuid);
      } else if (normOld !== "JOINED" && normOld !== "WAITLISTED" && normNew === "WAITLISTED") {
        await insertSystemMessage(planUuid, `${participantName} joined the waitlist`, participantUuid);
      } else if ((normOld === "JOINED" || normOld === "WAITLISTED") && normNew === "SKIPPED") {
        await insertSystemMessage(planUuid, `${participantName} left the plan`, participantUuid);
      }
    }
  }, [plans, dbPlans, dbUsers, resolveUserUuid, insertSystemMessage]);

  const promoteWaitlistIfSpotsAvailable = useCallback(async (planUuid: string) => {
    const matchedPlan = plans.find(p => p.id === planUuid || p.dbUuid === planUuid);
    const resolvedPlanUuid = matchedPlan?.dbUuid || planUuid;
    const dbPlanObj = dbPlans.find(p => p.id === resolvedPlanUuid);
    if (!matchedPlan || !dbPlanObj) {

      return;
    }

    const limit = matchedPlan.joinLimit || matchedPlan.capacity || matchedPlan.maxSpots || 0;
    if (limit <= 0) {
      return;
    }

    // Check filtering mode & deadline
    const mode = matchedPlan.participantFiltering || (matchedPlan as any).participant_filtering || dbPlanObj.participant_filtering || 'AUTOMATIC';
    const isAssigned = mode === 'ASSIGNED';
    const rsvpDeadline = (matchedPlan as any).response_deadline_at || dbPlanObj.rsvp_deadline;
    const isPastDeadline = rsvpDeadline ? new Date() > new Date(rsvpDeadline) : false;

    // In ASSIGNED mode, automatic promotion ONLY occurs if RSVP deadline has passed
    if (isAssigned && !isPastDeadline) {
      return;
    }

    try {
      const { data: freshParticipantsData, error: participantsError } = await (supabase as any)
        .from("plan_participants")
        .select("*");
      if (participantsError) {
        throw new Error("Failed to fetch fresh participants");
      }
      const freshParticipants: DbPlanParticipant[] = freshParticipantsData || dbPlanParticipants;

      const planParticipants = freshParticipants.filter(
        pp => pp.plan_id === planUuid || pp.plan_id === resolvedPlanUuid
      );

      const acceptedCount = planParticipants.filter(
        pp => pp.rsvp_status === "JOINED"
      ).length;

      const availableCapacity = limit - acceptedCount;


      if (availableCapacity <= 0) {

        return;
      }

      const waitlisted = planParticipants
        .filter(pp => pp.rsvp_status === "WAITLISTED")
        .sort((a, b) => {
          const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return timeA - timeB;
        });

      if (waitlisted.length === 0) {

        return;
      }

      const countToPromote = Math.min(availableCapacity, waitlisted.length);
      const updates = [];
      for (let i = 0; i < countToPromote; i++) {
        const pToPromote = waitlisted[i];
        updates.push({
          id: pToPromote.id,
          rsvp_status: "JOINED",
          responded_at: new Date().toISOString(),
          skip_reason: null
        });
      }

      if (updates.length > 0) {

        const { error: ppError } = await (supabase as any)
          .from("plan_participants")
          .upsert(updates);
        if (ppError) {
          console.error("[PlansContext promoteWaitlist] Failed to upsert promoted participants", ppError);
        } else {
          // Send PARTICIPANT_JOINED notifications to host for each promoted participant
          for (const upd of updates) {
            const pToPromote = waitlisted.find(w => w.id === upd.id);
            if (pToPromote?.user_id) {
              await handleParticipantStatusChange(planUuid, pToPromote.user_id, "waitlist", "going");
            }
          }



          // Recalculate wallet expenses for this plan to set cost_per_participant for promoted guests
          recalculateWalletExpenses(planUuid).catch(err =>
            console.error("[promoteWaitlist] recalculateWalletExpenses failed:", err)
          );
        }
      }
    } catch (err) {
      console.error(`[PlansContext promoteWaitlist] Failed:`, err);
    }
  }, [plans, dbPlans, dbPlanParticipants, handleParticipantStatusChange]);

  const joinPlan = useCallback(async (rawPlanId: string, userProfile: any, options?: JoinOptions) => {
    const planId = cleanPlanId(rawPlanId);
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const userUuid = userProfile.dbUuid || resolveUserUuid(userProfile.user_id || userId);

    if (!userUuid || !isUuid(userUuid)) {
      console.error(`[PlansContext] Cannot join plan: user UUID is missing or invalid:`, userUuid);
      return;
    }

    // Logging: status before action
    const existingBefore = dbPlanParticipants.find(p => p.plan_id === planUuid && p.user_id === userUuid);



    const acceptedCount = dbPlanParticipants.filter(
      pp => pp.plan_id === planUuid && pp.rsvp_status === "JOINED"
    ).length;
    const dbPlanObj = dbPlans.find(p => p.id === planUuid || p.public_id === planUuid);
    const limit = matchedPlan?.capacity || matchedPlan?.joinLimit || matchedPlan?.maxSpots || (dbPlanObj as any)?.max_participants || 0;
    const isWaitlistMode = !!(limit > 0 && acceptedCount >= limit);



    const hostUuid = matchedPlan?.hostId;
    const isHost = hostUuid === userUuid;

    // 2. Database Persistence
    if (planUuid && userUuid) {
      if (existingBefore && isHost) {

        return;
      }

      const dbPlan = dbPlans.find(p => p.id === planUuid || p.public_id === planUuid);
      const planCircleId = dbPlan?.circle_id || (matchedPlan as any).circle_id || null;
      const belongsToCircle = planCircleId && dbCircleMembers
        ? dbCircleMembers.some((m: any) => (m.circle_id === planCircleId) && (m.user_id === userUuid))
        : false;
      const circleId = belongsToCircle ? planCircleId : null;

      const filteringMode = matchedPlan?.participantFiltering || (matchedPlan as any)?.participant_filtering || 'AUTOMATIC';
      const isAssigned = filteringMode === 'ASSIGNED';

      let targetDbState: "JOINED" | "WAITLISTED" = "JOINED";
      if (options?.forceStatus === "waitlist") {
        targetDbState = "WAITLISTED";
      } else if (options?.forceStatus) {
        targetDbState = options.forceStatus === "going" ? "JOINED" : "WAITLISTED";
      } else if (isAssigned) {
        // ASSIGNED mode: Position is determined BY THE HOST's assigned_group in DB, NOT by capacity or join order.
        const assignedGroup = (existingBefore as any)?.assigned_group || (existingBefore as any)?.assignedGroup;
        const preAssignedStatus = normalizeStatus(existingBefore?.rsvp_status);
        if (assignedGroup === "WAITLIST" || preAssignedStatus === "WAITLISTED") {
          targetDbState = "WAITLISTED";
        } else {
          targetDbState = "JOINED";
        }
      } else {
        // AUTOMATIC mode: First-come, first-served based on capacity limit.
        targetDbState = isWaitlistMode ? "WAITLISTED" : "JOINED";
      }

      // Optimistic Update
      const optimisticRecord = existingBefore ? {
        ...existingBefore,
        rsvp_status: targetDbState as any,
        responded_at: new Date().toISOString(),
        skip_reason: null,
        circle_id: circleId
      } : {
        plan_id: planUuid,
        user_id: userUuid,
        role: "PARTICIPANT" as const,
        rsvp_status: targetDbState as any,
        responded_at: new Date().toISOString(),
        skip_reason: null,
        circle_id: circleId
      };

      applyParticipantOptimisticUpdate(planUuid, userUuid, optimisticRecord as any);

      if (existingBefore) {
        try {
          const res = await updateParticipantStatus(planUuid, userUuid, targetDbState as any, undefined, new Date().toISOString(), null, circleId);
          if (res) {

          } else {
            console.error("[WAITLIST WRITE] FAILED (returned null)");
          }
        } catch (err) {
          console.error("[WAITLIST WRITE] FAILED", err);
        }
      } else {
        const payload = {
          plan_id: planUuid,
          user_id: userUuid,
          rsvp_status: targetDbState as any,
          role: "PARTICIPANT" as const,
          responded_at: new Date().toISOString(),
          skip_reason: null,
          circle_id: circleId
        };

        try {
          const res = await insertParticipant(payload);
          if (res) {

          } else {
            console.error("[WAITLIST WRITE] FAILED (returned null)");
          }
        } catch (err) {
          console.error("[WAITLIST WRITE] FAILED", err);
        }
      }
      await handleParticipantStatusChange(planUuid, userUuid, existingBefore?.rsvp_status, targetDbState);
      await syncUserStats(userUuid, "join_plan");
      await promoteWaitlistIfSpotsAvailable(planUuid);
      // Recalculate wallet expenses after participant writes are fully committed
      try {
        await recalculateWalletExpenses(planUuid);
      } catch (err) {
        console.error("[joinPlan] recalculateWalletExpenses failed:", err);
      }
      // Auto-create accepted friendships with all plan co-participants
      syncPlanFriendships(userUuid, planUuid).catch(err =>
        console.error("[joinPlan] syncPlanFriendships failed:", err)
      );
    }

    // 3. Sync state from DB (handled by realtime)

  }, [plans, dbPlanParticipants, userId, resolveUserUuid, isUuid, handleParticipantStatusChange, promoteWaitlistIfSpotsAvailable, applyParticipantOptimisticUpdate]);

  const leavePlan = useCallback(async (rawPlanId: string, leaverId: string) => {
    const planId = cleanPlanId(rawPlanId);
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const userUuid = resolveUserUuid(leaverId);

    if (!userUuid || !isUuid(userUuid)) {
      console.error(`[PlansContext] Cannot leave plan: user UUID is missing or invalid:`, userUuid);
      throw new Error("Invalid user UUID");
    }

    const existingBefore = dbPlanParticipants.find(p => p.plan_id === planUuid && p.user_id === userUuid);

    // 2. Database Persistence - invoke SECURITY DEFINER RPC
    if (existingBefore) {
      applyParticipantOptimisticUpdate(planUuid, userUuid, {
        role: "PARTICIPANT",
        rsvp_status: "SKIPPED",
        responded_at: new Date().toISOString(),
        skip_reason: "LEFT"
      } as any);
      try {
        const { error: rpcError } = await (supabase as any).rpc("leave_plan", {
          p_plan_id: planUuid
        });
        if (rpcError) {
          console.warn("[leavePlan] RPC leave_plan failed, fallback to direct update:", rpcError);
          await updateParticipantStatus(planUuid, userUuid, "SKIPPED", undefined, new Date().toISOString(), "LEFT");
        }

        await handleParticipantStatusChange(planUuid, userUuid, existingBefore.rsvp_status, "SKIPPED");
        await unassignTeam(planUuid, userUuid);
      } catch (err) {
        console.error(`[PlansContext] leavePlan DB write failed:`, err);
        throw err;
      }
    } else {
      throw new Error("Participant record not found");
    }

    // 3. Sync state from DB (handled by realtime)

  }, [plans, resolveUserUuid, isUuid, dbPlanParticipants, handleParticipantStatusChange, unassignTeam, applyParticipantOptimisticUpdate]);

  const skipPlan = useCallback(async (rawPlanId: string, userId: string) => {
    const planId = cleanPlanId(rawPlanId);

    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const userUuid = resolveUserUuid(userId);

    if (!userUuid || !isUuid(userUuid)) {
      console.error(`[PlansContext] Cannot skip plan: user UUID is missing or invalid:`, userUuid);

      return;
    }

    const existingBefore = dbPlanParticipants.find(p => p.plan_id === planUuid && p.user_id === userUuid);

    if (!existingBefore) {
      return;
    }

    const hostUuid = matchedPlan?.hostId;
    const isHost = hostUuid === userUuid;
    if (isHost) {
      return;
    }

    const normStatus = normalizeStatus(existingBefore.rsvp_status);
    const isSkippable = normStatus === "JOINED" || normStatus === "WAITLISTED" || normStatus === "INVITED";
    if (!isSkippable) {
      return;
    }

    try {
      const wasActive = existingBefore.rsvp_status === "JOINED" || existingBefore.rsvp_status === "WAITLISTED";
      const targetSkipReason = wasActive ? "LEFT" : null;

      applyParticipantOptimisticUpdate(planUuid, userUuid, {
        role: "PARTICIPANT",
        rsvp_status: "SKIPPED",
        responded_at: new Date().toISOString(),
        skip_reason: targetSkipReason
      } as any);

      const { error: rpcError } = await (supabase as any).rpc("leave_plan", {
        p_plan_id: planUuid
      });

      if (rpcError) {
        console.warn("[skipPlan] RPC leave_plan failed, fallback to direct update:", rpcError);
        const result = await updateParticipantStatus(planUuid, userUuid, "SKIPPED", undefined, new Date().toISOString(), targetSkipReason);
        if (!result) throw new Error("Fallback status update failed");
      }

      await handleParticipantStatusChange(planUuid, userUuid, existingBefore.rsvp_status, "SKIPPED");
      await unassignTeam(planUuid, userUuid);
    } catch (error) {
      console.error(`[PlansContext] skipPlan DB write failed:`, error);

      throw error;
    }
  }, [plans, resolveUserUuid, isUuid, dbPlanParticipants, handleParticipantStatusChange, unassignTeam, applyParticipantOptimisticUpdate]);

  const rejoinPlan = useCallback(async (rawPlanId: string, userProfile: any) => {
    const planId = cleanPlanId(rawPlanId);
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const userUuid = userProfile.dbUuid || resolveUserUuid(userProfile.user_id || userId);

    if (!userUuid || !isUuid(userUuid)) {
      console.error(`[PlansContext] Cannot rejoin plan: user UUID is missing or invalid:`, userUuid);
      return;
    }

    const existingBefore = dbPlanParticipants.find(p => p.plan_id === planUuid && p.user_id === userUuid);

    if (!existingBefore) {

      return;
    }

    const hostUuid = matchedPlan?.hostId;
    const isHost = hostUuid === userUuid;
    if (isHost) {

      return;
    }

    const normStatus = normalizeStatus(existingBefore.rsvp_status);
    const isRejoinable = normStatus === "SKIPPED";
    if (!isRejoinable) {

      return;
    }



    // Delegate core admission logic to joinPlan, skipping payment checkout
    await joinPlan(planId, userProfile, {
      skipPayment: true
    });
  }, [plans, userId, resolveUserUuid, isUuid, dbPlanParticipants, joinPlan]);

  const removeParticipant = useCallback(async (planId: string, participantUserUuid: string) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;

    if (!participantUserUuid) {
      console.error("[PlansContext removeParticipant] participantUserUuid is missing. Cannot proceed.");
      throw new Error("Cannot identify the participant to remove. Please try again.");
    }

    const resolvedParticipantUuid = resolveUserUuid(participantUserUuid);

    const beforeRemovalParticipantCount = dbPlanParticipants.filter(pp => pp.plan_id === planUuid).length;


    if (!planUuid || !resolvedParticipantUuid) {
      console.error("[PlansContext removeParticipant] Missing plan UUID or participant UUID");
      return;
    }

    // host validation (Creator Host or Additional Host with role === "HOST")
    const dbPlanObj = dbPlans.find(p => p.id === planUuid);
    const hostUuid = resolveUserUuid(matchedPlan?.hostId || dbPlanObj?.host_id || "");
    const activeUserUuidResolved = resolveUserUuid(userId || "");

    const callerParticipant = dbPlanParticipants.find(
      pp => pp.plan_id === planUuid && pp.user_id === activeUserUuidResolved
    );
    const isHost = hostUuid === activeUserUuidResolved || callerParticipant?.role === "HOST";

    if (!isHost) {
      console.error("[PlansContext removeParticipant] Unauthorized: Only a Plan Host can manage or remove participants.");
      throw new Error("Unauthorized: Only a Plan Host can manage or remove participants.");
    }

    // 1. Pre-emptively clean up any team assignment before deleting participant
    try {
      await unassignTeam(planUuid, resolvedParticipantUuid);
    } catch (teamErr) {
      console.warn("[PlansContext removeParticipant] Team assignment cleanup warning (non-blocking):", teamErr);
    }

    // 2. Persist removal via trusted SECURITY DEFINER RPC
    try {
      await api.removeParticipantRPC(planUuid, resolvedParticipantUuid);
    } catch (rpcError: any) {
      console.error("[PlansContext removeParticipant] removeParticipantRPC failed.", rpcError);
      throw new Error(rpcError?.message || "Failed to remove participant.");
    }





    // Phase 7: System message for participant removal (Removed for silent operation)



    // 3. Promote waitlist if spots available
    await promoteWaitlistIfSpotsAvailable(planUuid);

    // Recalculate wallet expenses for this plan
    recalculateWalletExpenses(planUuid).catch(err =>
      console.error("[removeParticipant] recalculateWalletExpenses failed:", err)
    );


  }, [plans, dbPlans, userId, resolveUserUuid, dbPlanParticipants, deleteParticipant, dbUsers, insertSystemMessage, promoteWaitlistIfSpotsAvailable, unassignTeam, applyParticipantOptimisticUpdate]);


  const getAvailableCapacity = useCallback((planId: string) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    if (!planUuid) return { capacity: 0, goingCount: 0, availableSpots: 999 };

    const capacity = matchedPlan?.joinLimit || matchedPlan?.capacity || matchedPlan?.maxSpots || 0;
    const goingCount = dbPlanParticipants.filter(pp =>
      pp.plan_id === planUuid && normalizeStatus(pp.rsvp_status) === "JOINED"
    ).length;

    const availableSpots = capacity > 0 ? Math.max(0, capacity - goingCount) : 999;

    return { capacity, goingCount, availableSpots };
  }, [plans, dbPlanParticipants]);

  const addParticipantsToPlan = useCallback(async (options: AddParticipantsOptions) => {
    const {
      planId,
      inviteeUuids,
      userProfile,
      planTitle,
      inviteeCircleMap,
      assignedGroup,
    } = options;

    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;

    if (!planUuid || inviteeUuids.length === 0) return;

    const dbPlan = dbPlans.find(p => p.id === planUuid || p.public_id === planUuid);
    const planCircleId = dbPlan?.circle_id || (matchedPlan as any).circle_id || null;

    const filteringMode = matchedPlan?.participantFiltering || (matchedPlan as any)?.participant_filtering || 'AUTOMATIC';
    const effectiveAssignedGroup = filteringMode === 'ASSIGNED' ? (assignedGroup || 'GOING') : null;

    // ── Pre-invite Timing Validation ──
    const currentTime = new Date();
    const currentTimeIso = currentTime.toISOString();
    const planStartTimeStr = matchedPlan?.datetime || dbPlan?.scheduled_at || null;
    const rsvpDeadlineStr = matchedPlan?.response_deadline_at || dbPlan?.rsvp_deadline || null;

    const planStartTime = planStartTimeStr ? new Date(planStartTimeStr) : null;
    const rsvpDeadline = rsvpDeadlineStr ? new Date(rsvpDeadlineStr) : null;

    const isRsvpDeadlinePassed = rsvpDeadline ? currentTime.getTime() > rsvpDeadline.getTime() : false;
    const isPlanStarted = planStartTime ? currentTime.getTime() > planStartTime.getTime() : false;

    let validationResult = 'ALLOW';
    let blockReason = 'NONE';

    if (isRsvpDeadlinePassed) {
      validationResult = 'BLOCK';
      blockReason = 'RSVP_DEADLINE_PASSED';
    } else if (isPlanStarted) {
      validationResult = 'BLOCK';
      blockReason = 'PLAN_ALREADY_STARTED';
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`========================================`);
      console.log(`Participant Invite Validation`);
      console.log(`========================================`);
      console.log(`Plan ID:\n${planUuid}`);
      console.log(`Current Time:\n${currentTimeIso}`);
      console.log(`Plan Start Time:\n${planStartTimeStr || 'N/A'}`);
      console.log(`RSVP Deadline:\n${rsvpDeadlineStr || 'N/A'}`);
      console.log(`Selected Invitees:\n${inviteeUuids.length}`);
      console.log(`Invitee UUIDs:\n${JSON.stringify(inviteeUuids)}`);
      console.log(`RSVP Deadline Passed:\n${isRsvpDeadlinePassed}`);
      console.log(`Plan Started:\n${isPlanStarted}`);
      console.log(`Validation Result:\n${validationResult}`);
      console.log(`Reason:\n${blockReason}`);
      console.log(`========================================`);
    }

    if (isRsvpDeadlinePassed) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`❌ Invite blocked.\nReason:\nRSVP deadline has passed.`);
      }
      throw new Error("This plan is no longer accepting new participants because the RSVP deadline has already passed.");
    }

    if (isPlanStarted) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`❌ Invite blocked.\nReason:\nPlan has already started.`);
      }
      throw new Error("You can't invite new participants after the plan has started.");
    }



    // 1. Optimistic updates
    inviteeUuids.forEach((inviteeUuid) => {
      applyParticipantOptimisticUpdate(planUuid, inviteeUuid, {
        plan_id: planUuid,
        user_id: inviteeUuid,
        role: "PARTICIPANT",
        rsvp_status: "INVITED",
        assigned_group: effectiveAssignedGroup,
        responded_at: null,
        skip_reason: null,
      } as any);
    });

    // 2. Persist via trusted SECURITY DEFINER RPC
    await api.inviteParticipantsRPC(planUuid, inviteeUuids, effectiveAssignedGroup);

    await refreshPlans();
  }, [plans, dbPlans, dbPlanParticipants, refreshPlans, applyParticipantOptimisticUpdate]);

  const promoteWaitlistParticipant = useCallback(async (planId: string, participantUserUuid: string) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const resolvedUserUuid = resolveUserUuid(participantUserUuid);

    if (!planUuid || !resolvedUserUuid) {
      console.error("[usePlanParticipants promoteWaitlistParticipant] Missing plan UUID or user UUID");
      return;
    }

    // Strict Capacity Check
    const { capacity, availableSpots } = getAvailableCapacity(planUuid);
    if (capacity > 0 && availableSpots <= 0) {
      throw new Error("Max Attendees reached.\n\nIncrease the limit before promoting a waitlisted participant.");
    }

    const participantRecords: any[] = [];

    const targetPp = dbPlanParticipants.find(pp => pp.plan_id === planUuid && pp.user_id === resolvedUserUuid);
    if (!targetPp) {
      console.error("[usePlanParticipants promoteWaitlistParticipant] Participant not found");
      return;
    }

    applyParticipantOptimisticUpdate(planUuid, resolvedUserUuid, {
      rsvp_status: "JOINED",
      responded_at: new Date().toISOString()
    });

    // Promote target
    participantRecords.push({
      plan_id: planUuid,
      user_id: resolvedUserUuid,
      rsvp_status: "JOINED",
      responded_at: new Date().toISOString()
    });

    // Upsert to DB
    const { error: ppError } = await (supabase as any)
      .from("plan_participants")
      .upsert(participantRecords, { onConflict: "plan_id,user_id" });
    if (ppError) {
      throw new Error("Failed to promote waitlisted participant: " + ppError.message);
    }



    // Recalculate wallet splits for the plan after waitlist promotion
    recalculateWalletExpenses(planUuid).catch(err =>
      console.error("[promoteWaitlistParticipant] recalculateWalletExpenses failed:", err)
    );

    await refreshPlans();
  }, [plans, dbPlanParticipants, resolveUserUuid, refreshPlans, getAvailableCapacity, applyParticipantOptimisticUpdate]);

  const rebalanceCapacity = useCallback(async (planId: string, newCapacity: number) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;

    if (!planUuid) return { promotedCount: 0, demotedCount: 0 };

    // Fetch fresh participants to avoid stale state
    const { data: freshParticipantsData } = await (supabase as any)
      .from("plan_participants")
      .select("*");
    const freshParticipants = freshParticipantsData || dbPlanParticipants;

    const planParts = freshParticipants.filter(pp => pp.plan_id === planUuid);

    // Filter and sort going participants by responded_at ASC (oldest first)
    const going = planParts
      .filter(pp => pp.rsvp_status === "JOINED")
      .sort((a, b) => {
        const timeA = a.responded_at ? new Date(a.responded_at).getTime() : 0;
        const timeB = b.responded_at ? new Date(b.responded_at).getTime() : 0;
        return timeA - timeB;
      });

    // Filter and sort waitlisted participants by responded_at or created_at ASC (oldest first)
    const waitlist = planParts
      .filter(pp => pp.rsvp_status === "WAITLISTED")
      .sort((a, b) => {
        const timeA = a.responded_at ? new Date(a.responded_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
        const timeB = b.responded_at ? new Date(b.responded_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
        return timeA - timeB;
      });

    const updatedParticipants: any[] = [];
    let promotedCount = 0;
    let demotedCount = 0;

    const currentGoingCount = going.length;
    const waitlistedCount = waitlist.length;

    if (newCapacity > 0 && currentGoingCount > newCapacity) {
      // Capacity reduced: Demote the newest accepted non-host going participants (responded_at DESC)
      const planHostUuid = resolveUserUuid(matchedPlan?.hostId || matchedPlan?.creatorId || "");

      // Exclude host before sorting
      const eligibleForDemotion = going
        .filter(pp => pp.user_id !== planHostUuid)
        .reverse(); // Newest joined first

      const overflow = currentGoingCount - newCapacity;
      const demoted = eligibleForDemotion.slice(0, overflow);
      demotedCount = demoted.length;

      for (const pp of demoted) {
        applyParticipantOptimisticUpdate(planUuid, pp.user_id, {
          rsvp_status: "WAITLISTED",
          responded_at: new Date().toISOString()
        } as any);
        updatedParticipants.push({
          plan_id: planUuid,
          user_id: pp.user_id,
          rsvp_status: "WAITLISTED",
          responded_at: new Date().toISOString()
        });


      }
    } else if (newCapacity > 0 && currentGoingCount < newCapacity && waitlistedCount > 0) {
      // For AUTOMATIC mode, capacity increase promotion is handled entirely on the backend in Postgres (update_plan_capacity RPC / auto_promote_waitlist_for_automatic).
      // Frontend does NOT perform manual client-side upserts for WAITLISTED -> JOINED.
    }

    if (updatedParticipants.length > 0) {
      const { error: upsertError } = await (supabase as any)
        .from("plan_participants")
        .upsert(updatedParticipants, { onConflict: "plan_id,user_id" });
      if (upsertError) {
        console.error("[rebalanceCapacity] Failed to rebalance plan participants in database", upsertError);
      }
    }



    await refreshPlans();

    return { promotedCount, demotedCount };
  }, [plans, dbPlanParticipants, resolveUserUuid, refreshPlans, applyParticipantOptimisticUpdate]);

  const moveParticipantToGoing = useCallback(async (planId: string, participantUserUuid: string) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const resolvedUserUuid = resolveUserUuid(participantUserUuid);

    if (!planUuid || !resolvedUserUuid) {
      console.error("[usePlanParticipants moveParticipantToGoing] Missing plan UUID or user UUID");
      return;
    }

    const filteringMode = matchedPlan?.participantFiltering || (matchedPlan as any)?.participant_filtering || 'AUTOMATIC';
    if (filteringMode !== 'ASSIGNED') {
      throw new Error("Manual queue movement is not allowed on Automatic plans.");
    }

    // Assigned Mode Capacity Validation: Count all active participants assigned to GOING (accepted + invited)
    const capacity = matchedPlan?.joinLimit || matchedPlan?.capacity || matchedPlan?.maxSpots || 0;
    if (capacity > 0) {
      const currentGoingCount = dbPlanParticipants.filter(pp => {
        if (pp.plan_id !== planUuid) return false;
        if (pp.rsvp_status === 'SKIPPED') return false;
        const group = (pp as any).assigned_group || (pp as any).assignedGroup;
        return group === 'GOING' || (!group && pp.rsvp_status !== 'WAITLISTED');
      }).length;

      if (currentGoingCount >= capacity) {
        throw new Error("Plan capacity has been reached. Increase the plan size before adding another participant to Going.");
      }
    }

    // Optimistic state update: update assigned_group to GOING
    setDbPlanParticipants(prev => prev.map(pp => {
      if ((pp.plan_id === planUuid || pp.plan_id === planId) && (pp.user_id === resolvedUserUuid || pp.user_id === participantUserUuid)) {
        const nextStatus = pp.rsvp_status === 'WAITLISTED' ? 'JOINED' : pp.rsvp_status;
        return {
          ...pp,
          assigned_group: 'GOING' as const,
          rsvp_status: nextStatus,
          responded_at: pp.responded_at || new Date().toISOString()
        };
      }
      return pp;
    }));

    try {
      const existingPp = dbPlanParticipants.find(
        pp => (pp.plan_id === planUuid || pp.plan_id === planId) && (pp.user_id === resolvedUserUuid || pp.user_id === participantUserUuid)
      );
      const nextRsvp = existingPp?.rsvp_status === 'WAITLISTED' ? 'JOINED' : (existingPp?.rsvp_status || 'INVITED');

      const { error: updateErr } = await (supabase as any)
        .from("plan_participants")
        .update({
          assigned_group: "GOING",
          rsvp_status: nextRsvp,
          skip_reason: null,
          updated_at: new Date().toISOString()
        })
        .eq("plan_id", planUuid)
        .eq("user_id", resolvedUserUuid);

      if (updateErr) {
        throw updateErr;
      }
      await refreshPlans();
    } catch (err) {
      await refreshPlans(); // Rollback on failure
      throw err;
    }
  }, [plans, dbPlanParticipants, resolveUserUuid, getAvailableCapacity, refreshPlans, setDbPlanParticipants]);

  const moveParticipantToWaitlist = useCallback(async (planId: string, participantUserUuid: string) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const resolvedUserUuid = resolveUserUuid(participantUserUuid);

    if (!planUuid || !resolvedUserUuid) {
      console.error("[usePlanParticipants moveParticipantToWaitlist] Missing plan UUID or user UUID");
      return;
    }

    // Block manual queue movement on AUTOMATIC plans
    const filteringMode = matchedPlan?.participantFiltering || (matchedPlan as any)?.participant_filtering || 'AUTOMATIC';
    if (filteringMode !== 'ASSIGNED') {
      throw new Error("Manual queue movement is not allowed on Automatic plans.");
    }

    // Optimistic state update: update assigned_group to WAITLIST
    setDbPlanParticipants(prev => prev.map(pp => {
      if ((pp.plan_id === planUuid || pp.plan_id === planId) && (pp.user_id === resolvedUserUuid || pp.user_id === participantUserUuid)) {
        const nextStatus = pp.rsvp_status === 'JOINED' ? 'WAITLISTED' : pp.rsvp_status;
        return {
          ...pp,
          assigned_group: "WAITLIST" as const,
          rsvp_status: nextStatus,
          responded_at: pp.responded_at || new Date().toISOString()
        };
      }
      return pp;
    }));

    try {
      const existingPp = dbPlanParticipants.find(
        pp => (pp.plan_id === planUuid || pp.plan_id === planId) && (pp.user_id === resolvedUserUuid || pp.user_id === participantUserUuid)
      );
      const nextRsvp = existingPp?.rsvp_status === 'JOINED' ? 'WAITLISTED' : (existingPp?.rsvp_status || 'INVITED');

      const { error: updateError } = await (supabase as any)
        .from("plan_participants")
        .update({
          assigned_group: "WAITLIST",
          rsvp_status: nextRsvp,
          skip_reason: null,
          updated_at: new Date().toISOString()
        })
        .eq("plan_id", planUuid)
        .eq("user_id", resolvedUserUuid);

      if (updateError) {
        throw new Error("Failed to update status to waitlist");
      }
      await refreshPlans();
    } catch (err) {
      await refreshPlans(); // Rollback on failure
      throw err;
    }
  }, [plans, dbPlanParticipants, resolveUserUuid, refreshPlans, setDbPlanParticipants]);

  const moveParticipantToInvited = useCallback(async (planId: string, participantUserUuid: string) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const resolvedUserUuid = resolveUserUuid(participantUserUuid);

    if (!planUuid || !resolvedUserUuid) {
      console.error("[usePlanParticipants moveParticipantToInvited] Missing plan UUID or user UUID");
      return;
    }

    const targetPp = dbPlanParticipants.find(pp => pp.plan_id === planUuid && pp.user_id === resolvedUserUuid);
    if (!targetPp) {
      throw new Error("Participant not found");
    }

    if (targetPp.rsvp_status !== "SKIPPED") {
      throw new Error("This participant left the plan and must be invited again.");
    }

    // Optimistic state update
    setDbPlanParticipants(prev => prev.map(pp => {
      if (pp.plan_id === planUuid && pp.user_id === resolvedUserUuid) {
        return {
          ...pp,
          rsvp_status: "INVITED",
          responded_at: null
        };
      }
      return pp;
    }));

    try {
      const records = [{
        plan_id: planUuid,
        user_id: resolvedUserUuid,
        rsvp_status: "INVITED",
        responded_at: null
      }];

      const { error: upsertError } = await (supabase as any)
        .from("plan_participants")
        .upsert(records, { onConflict: "plan_id,user_id" });
      if (upsertError) {
        throw new Error("Failed to update status to invited");
      }
      await refreshPlans();
    } catch (err) {
      await refreshPlans(); // Rollback on failure
      throw err;
    }
  }, [plans, dbPlanParticipants, resolveUserUuid, refreshPlans, setDbPlanParticipants]);

  const reorderWaitlist = useCallback(async (planId: string, orderedUserUuids: string[]) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    if (!planUuid || orderedUserUuids.length === 0) return;

    // Optimistically update waitlist_position sequence in local state
    setDbPlanParticipants(prev => {
      return prev.map(pp => {
        if (pp.plan_id === planUuid || pp.plan_id === planId) {
          const idx = orderedUserUuids.findIndex(uId => {
            const resolved = resolveUserUuid(uId);
            return resolved === pp.user_id || uId === pp.user_id;
          });
          if (idx !== -1) {
            return {
              ...pp,
              waitlist_position: idx + 1
            };
          }
        }
        return pp;
      });
    });

    try {
      // 1. Switch plan waitlist_order_mode to CUSTOM
      await (supabase as any)
        .from("plans")
        .update({ waitlist_order_mode: "CUSTOM" })
        .eq("id", planUuid);

      // 2. Persist 1-indexed waitlist_position to plan_participants
      for (let i = 0; i < orderedUserUuids.length; i++) {
        const userUuid = resolveUserUuid(orderedUserUuids[i]);
        await (supabase as any)
          .from("plan_participants")
          .update({ waitlist_position: i + 1 })
          .eq("plan_id", planUuid)
          .eq("user_id", userUuid);
      }
      await refreshPlans();
    } catch (err) {
      console.error("[reorderWaitlist] Failed to persist new order to DB:", err);
      await refreshPlans();
    }
  }, [plans, resolveUserUuid, setDbPlanParticipants, refreshPlans]);

  return {
    joinPlan,
    leavePlan,
    skipPlan,
    rejoinPlan,
    removeParticipant,
    promoteWaitlistIfSpotsAvailable,
    handleParticipantStatusChange,
    addParticipantsToPlan,
    promoteWaitlistParticipant,
    rebalanceCapacity,
    getAvailableCapacity,
    moveParticipantToGoing,
    moveParticipantToWaitlist,
    moveParticipantToInvited,
    reorderWaitlist
  };
}
