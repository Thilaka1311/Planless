import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { DbPlan, DbPlanParticipant, DbPlanOutcome, User } from "../../../core/types";
import { DbPlanTeamAssignment } from "../../../../lib/db";
import { deleteAllPlanTeamAssignments, removePlanTeamAssignment } from "../../../../lib/db";
import { normalizeStatus } from "../../../../lib/participantStatus";
import { cleanPlanId as cleanPlanIdUtil, isUuid as isUuidUtil, resolveUserUuid as resolveUserUuidUtil } from "../utils/planUtils";
import { recalculateWalletExpenses } from "../../wallet/services/walletSyncService";
import * as api from "../api/plans";

// ─── Dependency injection types ───────────────────────────────────────────────

export interface PlanLifecycleDeps {
  // Core state
  plans: any[];
  dbPlans: DbPlan[];
  dbPlanParticipants: DbPlanParticipant[];
  dbPlanOutcomes: DbPlanOutcome[];
  dbCircles: any[];
  dbCircleMembers: any[];
  dbUsers: User[];
  userId: string;

  // State setters
  setDbPlans?: Dispatch<SetStateAction<DbPlan[]>>;
  setDbPlanTeamAssignments: Dispatch<SetStateAction<DbPlanTeamAssignment[]>>;

  // Shared side-effect helpers
  refreshPlans: (targetTables?: string[]) => Promise<void>;
  insertSystemMessage: (planUuid: string, content: string, actorUuid: string | null) => Promise<void>;
  promoteWaitlistIfSpotsAvailable: (planUuid: string) => Promise<void>;
  rebalanceCapacity?: (planId: string, newCapacity: number) => Promise<{ promotedCount: number; demotedCount: number }>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePlanLifecycle(deps: PlanLifecycleDeps) {
  const {
    plans,
    dbPlans,
    dbPlanParticipants,
    dbCircles,
    dbCircleMembers,
    dbUsers,
    userId,
    setDbPlans,
    setDbPlanTeamAssignments,
    refreshPlans,
    insertSystemMessage,
    promoteWaitlistIfSpotsAvailable,
    rebalanceCapacity,
  } = deps;

  const resolveUserUuid = useCallback((uId: string) => {
    return resolveUserUuidUtil(uId, dbUsers);
  }, [dbUsers]);

  const isUuid = useCallback((val: any) => isUuidUtil(val), []);

  const cleanPlanId = useCallback((id: string) => cleanPlanIdUtil(id), []);

  // ─── changePlanHost ─────────────────────────────────────────────────────────

  const changePlanHost = useCallback(async (planId: string, newHostUuid: string, oldHostUuid: string) => {


    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;

    const resolvedNewHostUuid = resolveUserUuid(newHostUuid);
    const resolvedOldHostUuid = resolveUserUuid(oldHostUuid);



    if (!isUuid(resolvedNewHostUuid)) {
      console.error("[usePlanLifecycle] changePlanHost: invalid new host UUID detected");
      throw new Error("Invalid host UUID");
    }

    const newHostPp = dbPlanParticipants.find(pp => pp.plan_id === planUuid && pp.user_id === resolvedNewHostUuid);
    const oldHostPp = dbPlanParticipants.find(pp => pp.plan_id === planUuid && pp.user_id === resolvedOldHostUuid);

    const isNewHostInvited = newHostPp && newHostPp.rsvp_status === "INVITED";
    const participantUpdates: any[] = [];

    if (isNewHostInvited) {
      // 1. Promote new host to 'JOINED'
      participantUpdates.push({
        plan_id: planUuid,
        user_id: resolvedNewHostUuid,
        rsvp_status: "JOINED",
        responded_at: new Date().toISOString()
      });

      // 2. Check capacity
      const capacity = matchedPlan?.joinLimit || matchedPlan?.capacity || matchedPlan?.maxSpots || 0;
      const goingPps = dbPlanParticipants.filter(pp =>
        pp.plan_id === planUuid &&
        pp.rsvp_status === "JOINED"
      );

      // Total going if we add new host
      const currentGoingCount = goingPps.length;
      if (capacity > 0 && (currentGoingCount + 1) > capacity) {
        // Demote the most recently admitted non-host participant
        const candidates = goingPps.filter(pp =>
          pp.user_id !== resolvedNewHostUuid &&
          pp.user_id !== resolvedOldHostUuid
        );

        // Sort candidates: newest responded_at first (descending)
        candidates.sort((a, b) => {
          const timeA = a.responded_at ? new Date(a.responded_at).getTime() : 0;
          const timeB = b.responded_at ? new Date(b.responded_at).getTime() : 0;
          return timeB - timeA;
        });

        if (candidates.length > 0) {
          const demoteTarget = candidates[0];
          participantUpdates.push({
            plan_id: planUuid,
            user_id: demoteTarget.user_id,
            rsvp_status: "INVITED",
            responded_at: null
          });

        }
      }
    } else if (!newHostPp) {

      participantUpdates.push({
        plan_id: planUuid,
        user_id: resolvedNewHostUuid,
        role: "HOST",
        rsvp_status: "JOINED",
        responded_at: new Date().toISOString()
      });
    }

    // Demote former host role in plan_participants to 'PARTICIPANT'
    if (resolvedOldHostUuid) {
      participantUpdates.push({
        plan_id: planUuid,
        user_id: resolvedOldHostUuid,
        role: "PARTICIPANT"
      });
    }

    if (participantUpdates.length > 0) {
      const { error: ppError } = await (supabase as any)
        .from("plan_participants")
        .upsert(participantUpdates, { onConflict: "plan_id,user_id" });
      if (ppError) {
        throw new Error("Failed to update participant statuses during host transfer: " + ppError.message);
      }
    }

    const newHostUser = dbUsers.find((u: any) => u.id === resolvedNewHostUuid || u.user_id === resolvedNewHostUuid || u.dbUuid === resolvedNewHostUuid);
    const newHostName = (newHostUser as any)?.name || newHostUser?.full_name || "Someone";
    await insertSystemMessage(planUuid, `Host transferred to ${newHostName}`, resolvedNewHostUuid);

    await promoteWaitlistIfSpotsAvailable(planUuid);
    await refreshPlans(["plans", "plan_participants"]);

    // Recalculate wallet split expenses
    recalculateWalletExpenses(planUuid).catch(err =>
      console.error("[changePlanHost] recalculateWalletExpenses failed:", err)
    );


  }, [plans, dbPlanParticipants, dbUsers, resolveUserUuid, isUuid, insertSystemMessage, promoteWaitlistIfSpotsAvailable, refreshPlans]);

  // ─── cancelPlan ─────────────────────────────────────────────────────────────

  const cancelPlan = useCallback(async (planId: string) => {


    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;



    // 2. Clean up all team assignments for this plan in DB and local state
    await deleteAllPlanTeamAssignments(planUuid);
    setDbPlanTeamAssignments(prev => prev.filter(a => a.plan_id !== planUuid));

    // 3. Write PLAN_CANCELLED notifications to all participants except the host
    const planParticipantsList = dbPlanParticipants.filter(pp => pp.plan_id === planUuid);


    // 4. System message for plan cancellation
    await insertSystemMessage(planUuid, "Plan cancelled", null);

    // 5. Update the plan status to CANCELLED in the database via RPC
    await api.cancelPlanRPC(planUuid);

    // 6. Explicitly refresh plans and memories state to ensure cancellation memory appears immediately
    await refreshPlans(["plans", "plan_participants", "memories"]);


  }, [plans, dbPlanParticipants, setDbPlanTeamAssignments, resolveUserUuid, insertSystemMessage, userId, refreshPlans]);

  // ─── updatePlanDetails ──────────────────────────────────────────────────────

  const updatePlanDetails = useCallback(async (rawPlanId: string, updates: Partial<DbPlan> & { skipDbWrite?: boolean }) => {
    const planId = cleanPlanId(rawPlanId);
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;

    const oldCapacity = matchedPlan?.joinLimit || matchedPlan?.capacity || matchedPlan?.maxSpots || 0;
    const newCapacity = updates.max_participants !== undefined ? Math.max(1, updates.max_participants) : undefined;

    // Validate and clamp capacity to at least 1
    if (updates.max_participants !== undefined) {
      updates.max_participants = Math.max(1, updates.max_participants);
    }







    // Persist updates to the plans table
    const VALID_PLAN_KEYS = [
      "title",
      "place_id",
      "place_name",
      "place_address",
      "scheduled_at",
      "rsvp_deadline",
      "max_participants",
      "total_cost",
      "status",
      "cover_image",
      "latitude",
      "longitude",
      "updated_at",
      "participant_filtering",
    ];

    const planUpdate: any = {};
    for (const key of Object.keys(updates)) {
      if (VALID_PLAN_KEYS.includes(key)) {
        planUpdate[key] = (updates as any)[key];
      }
    }

    if (planUpdate.max_participants !== undefined) {
      const newMax = planUpdate.max_participants;
      if (setDbPlans) {
        setDbPlans(prev => prev.map(p => {
          if (p.id === planUuid || (p as any).dbUuid === planUuid) {
            return {
              ...p,
              max_participants: newMax,
              joinLimit: newMax,
              capacity: newMax,
              ...(planUpdate.total_cost !== undefined ? { total_cost: planUpdate.total_cost, totalCost: planUpdate.total_cost } : {}),
            };
          }
          return p;
        }));
      }
      await api.updatePlanCapacityRPC(planUuid, planUpdate.max_participants);
      delete planUpdate.max_participants;
    }

    const updatedCoverImage = updates.cover_image;
    if (Object.keys(planUpdate).length > 0) {
      // If skipDbWrite is specified, skip updating cover_image in the database
      // because persistence is already handled by replacePlanImage or deleteCustomPlanImage
      if ((updates as any).skipDbWrite) {
        delete planUpdate.cover_image;
      }

      if (planUpdate.cover_image !== undefined) {
        const currentPlan = (plans || []).find(p => p.id === planUuid || p.dbUuid === planUuid);
        console.log(`[PLAN COVER IMAGE WRITE]
source = updatePlanDetails (usePlanLifecycle.ts)
planId = ${planUuid}
old = ${currentPlan?.coverImage || "none"}
new = ${planUpdate.cover_image}`);
      }

      if (Object.keys(planUpdate).length > 0) {
        const { error: planError } = await (supabase as any)
          .from("plans")
          .update(planUpdate)
          .eq("id", planUuid);
        if (planError) {
          throw new Error("Failed to update plan details in database: " + planError.message);
        }
        if (setDbPlans) {
          setDbPlans(prev => prev.map(p => {
            if (p.id === planUuid || (p as any).dbUuid === planUuid) {
              return {
                ...p,
                ...planUpdate,
              };
            }
            return p;
          }));
        }
      }
    }

    // Always keep setDbPlans updated in memory with cover_image
    if (setDbPlans && updatedCoverImage !== undefined) {
      setDbPlans(prev => prev.map(p => {
        if (p.id === planUuid || (p as any).dbUuid === planUuid || p.id === planId) {
          return {
            ...p,
            cover_image: updatedCoverImage,
          };
        }
        return p;
      }));
    }

    // Fetch fresh participants to avoid stale state
    const { data: freshParticipantsData } = await (supabase as any)
      .from("plan_participants")
      .select("*");
    const freshParticipants = freshParticipantsData || dbPlanParticipants;

    // REBALANCE PARTICIPANTS IF CAPACITY CHANGED (AUTOMATIC Mode Only)
    let rebalanceResult = { promotedCount: 0, demotedCount: 0 };
    const filteringMode = matchedPlan?.participantFiltering || (matchedPlan as any)?.participant_filtering || 'AUTOMATIC';
    if (newCapacity !== undefined && rebalanceCapacity && filteringMode !== 'ASSIGNED') {
      rebalanceResult = await rebalanceCapacity(planUuid, newCapacity);
    }





    // Recalculate wallet split expenses
    recalculateWalletExpenses(planUuid).catch(err =>
      console.error("[updatePlanDetails] recalculateWalletExpenses failed:", err)
    );
    return rebalanceResult;
  }, [plans, dbPlans, dbPlanParticipants, dbCircleMembers, userId, resolveUserUuid, cleanPlanId]);

  // ─── completePlan ────────────────────────────────────────────────────────────

  const completePlan = useCallback(async (
    planId: string, 
    attendanceInput: Array<{ user_id: string; attendance: 'ATTENDED' | 'DID_NOT_ATTEND' }>, 
    opts?: { isEarly?: boolean; expenseMode?: 'SPLIT_ALL' | 'KEEP_CURRENT_COST' | 'NONE' }
  ) => {
    console.log("[PLAN_COMPLETE_START] Completing plan:", planId);

    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;

    if (!planUuid) {
      console.error("[PLAN_COMPLETE_ERROR] Invalid plan ID:", planId);
      throw new Error("Cannot complete plan: invalid plan ID");
    }

    // Host validation
    const hostUuid = resolveUserUuid(matchedPlan?.hostId || matchedPlan?.creatorId || "");
    const activeUserUuidResolved = resolveUserUuid(userId || "");

    const isHost = hostUuid === activeUserUuidResolved || matchedPlan?.isOwner;
    if (!isHost) {
      console.error("[PLAN_COMPLETE_ERROR] Unauthorized user attempting completion:", userId);
      throw new Error("Only the plan host can complete the plan.");
    }

    try {
      const res = await api.completePlan(planUuid, attendanceInput, opts?.expenseMode || 'NONE');
      console.log("[PLAN_COMPLETE_SUCCESS] Plan successfully marked completed:", res);
      
      // System message for plan completion (fire and forget)
      insertSystemMessage(planUuid, "Plan completed", null).catch(msgErr => {
        console.warn("[PLAN_COMPLETE_WARNING] System message failed (non-critical):", msgErr);
      });
      
      return res;
    } catch (err: any) {
      console.error("[PLAN_COMPLETE_ERROR] Failed DB update:", err);
      throw new Error(err.message || "Failed to complete plan");
    }

  }, [plans, dbPlans, userId, resolveUserUuid, insertSystemMessage]);

  // ─── manageCompletedPlanParticipants ──────────────────────────────────────────

  const manageCompletedPlanParticipants = useCallback(async (
    planId: string,
    usersToAdd: string[],
    usersToRemove: string[],
    expenseMode: 'SPLIT_ALL' | 'KEEP_CURRENT_COST' | 'NONE' = 'NONE'
  ) => {
    console.log("[PLAN_MANAGE_COMPLETED_START] Managing completed plan participants:", planId);

    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;

    if (!planUuid) {
      throw new Error("Cannot manage participants: invalid plan ID");
    }

    // Host validation
    const dbPlanObj = dbPlans.find(p => p.id === planUuid || p.id === matchedPlan?.id);
    const hostUuid = resolveUserUuid(matchedPlan?.hostId || matchedPlan?.creatorId || "");
    const activeUserUuidResolved = resolveUserUuid(userId || "");

    const isHost = hostUuid === activeUserUuidResolved || matchedPlan?.isOwner;
    if (!isHost) {
      throw new Error("Only the plan host can manage participants of a completed plan.");
    }

    // 24-hour window check from scheduled_at
    const scheduledAtRaw = (matchedPlan as any)?.scheduled_at || (matchedPlan as any)?.datetime || (matchedPlan as any)?.time || dbPlanObj?.scheduled_at;
    if (scheduledAtRaw) {
      const endTimeMs = new Date(scheduledAtRaw).getTime();
      if (!isNaN(endTimeMs) && Date.now() >= endTimeMs + 24 * 60 * 60 * 1000) {
        throw new Error("Participant management is no longer available. You can only make changes within 24 hours after the plan ends.");
      }
    }

    try {
      const res = await api.manageCompletedPlanParticipantsRPC(planUuid, usersToAdd, usersToRemove, expenseMode);
      
      // Explicitly refresh plans and participants to ensure local state updates
      await refreshPlans(["plans", "plan_participants"]);

      return res;
    } catch (err: any) {
      console.error("[PLAN_MANAGE_COMPLETED_ERROR] Failed DB update:", JSON.stringify(err, null, 2));
      const rawMsg = err?.message || err?.details || String(err);
      if (rawMsg.includes("24-hour") || rawMsg.includes("MANAGEMENT_WINDOW_EXPIRED") || rawMsg.includes("expired")) {
        throw new Error("Participant management is no longer available. You can only make changes within 24 hours after the plan ends.");
      }
      throw new Error(rawMsg || "Failed to manage participants");
    }
  }, [plans, dbPlans, userId, resolveUserUuid, refreshPlans]);

  return {
    changePlanHost,
    cancelPlan,
    updatePlanDetails,
    completePlan,
    manageCompletedPlanParticipants,
  };
}
