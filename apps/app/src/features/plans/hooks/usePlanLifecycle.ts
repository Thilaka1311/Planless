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

    const planUpdate = {
      host_id: resolvedNewHostUuid
    };

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

    // Previous host remains participant: status is preserved unchanged.


    if (participantUpdates.length > 0) {

      const { error: ppError } = await (supabase as any)
        .from("plan_participants")
        .upsert(participantUpdates, { onConflict: "plan_id,user_id" });
      if (ppError) {
        throw new Error("Failed to update participant statuses during host transfer: " + ppError.message);
      }
    }


    // Update plans.host_id to the new host
    const { error: planError } = await (supabase as any)
      .from("plans")
      .update(planUpdate)
      .eq("id", planUuid);
    if (planError) {
      throw new Error("Failed to update plan host_id in database: " + planError.message);
    }


    const newHostUser = dbUsers.find((u: any) => u.id === resolvedNewHostUuid || u.user_id === resolvedNewHostUuid || u.dbUuid === resolvedNewHostUuid);
    const newHostName = (newHostUser as any)?.name || newHostUser?.full_name || "Someone";
    await insertSystemMessage(planUuid, `Host transferred to ${newHostName}`, resolvedNewHostUuid);

    await promoteWaitlistIfSpotsAvailable(planUuid);

    // Recalculate wallet split expenses
    recalculateWalletExpenses(planUuid).catch(err =>
      console.error("[changePlanHost] recalculateWalletExpenses failed:", err)
    );


  }, [plans, dbPlanParticipants, dbUsers, resolveUserUuid, isUuid, insertSystemMessage, promoteWaitlistIfSpotsAvailable]);

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

  const updatePlanDetails = useCallback(async (rawPlanId: string, updates: Partial<DbPlan>) => {
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
      "description",
      "place_id",
      "place_name",
      "place_address",
      "scheduled_at",
      "rsvp_deadline",
      "max_participants",
      "total_cost",
      "status",
      "cover_image",
      "circle_id",
      "latitude",
      "longitude",
      "updated_at",
      "host_id",
      "participant_filtering",
    ];

    const planUpdate: any = {};
    for (const key of Object.keys(updates)) {
      if (VALID_PLAN_KEYS.includes(key)) {
        planUpdate[key] = (updates as any)[key];
      }
    }

    if (planUpdate.max_participants !== undefined) {
      await api.updatePlanCapacityRPC(planUuid, planUpdate.max_participants);
      delete planUpdate.max_participants;
    }

    if (Object.keys(planUpdate).length > 0) {
      const { error: planError } = await (supabase as any)
        .from("plans")
        .update(planUpdate)
        .eq("id", planUuid);
      if (planError) {
        throw new Error("Failed to update plan details in database: " + planError.message);
      }
    }

    // Fetch fresh participants to avoid stale state
    const { data: freshParticipantsData } = await (supabase as any)
      .from("plan_participants")
      .select("*");
    const freshParticipants = freshParticipantsData || dbPlanParticipants;

    // REBALANCE PARTICIPANTS IF CAPACITY CHANGED
    let rebalanceResult = { promotedCount: 0, demotedCount: 0 };
    if (newCapacity !== undefined && rebalanceCapacity) {
      rebalanceResult = await rebalanceCapacity(planUuid, newCapacity);
    }





    // Recalculate wallet split expenses
    recalculateWalletExpenses(planUuid).catch(err =>
      console.error("[updatePlanDetails] recalculateWalletExpenses failed:", err)
    );
    return rebalanceResult;
  }, [plans, dbPlans, dbPlanParticipants, dbCircleMembers, userId, resolveUserUuid, cleanPlanId]);

  // ─── completePlan ────────────────────────────────────────────────────────────

  const completePlan = useCallback(async (planId: string) => {



    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;

    if (!planUuid) {
      throw new Error("Cannot complete plan: invalid plan ID");
    }

    // host or moderator validation
    const dbPlanObj = dbPlans.find(p => p.id === planUuid);
    const hostUuid = resolveUserUuid(matchedPlan?.hostId || matchedPlan?.creatorId || dbPlanObj?.host_id || "");
    const activeUserUuidResolved = resolveUserUuid(userId || "");

    const isHost = hostUuid === activeUserUuidResolved;

    // Circle admin / Creator Admin check (circle association not in V2 DbPlan; skip for now)
    const circleUuid: string | undefined = undefined;
    let isCircleHost = false;
    let isCircleAdmin = false;

    if (circleUuid) {
      const circleObj = dbCircles.find((c: any) => c.id === circleUuid || c.circle_id === circleUuid);
      isCircleHost = circleObj?.created_by === activeUserUuidResolved;
      const circleMemberObj = dbCircleMembers.find((cm: any) => (cm.circle_id === circleUuid || cm.circle_id === circleObj?.id) && cm.user_id === activeUserUuidResolved);
      isCircleAdmin = circleMemberObj?.role === "admin";
    }

    const isAuthorized = isHost || isCircleHost || isCircleAdmin;
    if (!isAuthorized) {
      throw new Error("Unauthorized: Only Plan Host, Circle Creator, or Circle Admins can complete plans.");
    }

    // Determine memory_type from structured fields (kept for logging/future use)
    let memory_type = "football";
    if (dbPlanObj) {
      const dbItem = (dbPlanObj as any).discovery_items;
      const categoryVal = dbItem?.category || "CUSTOM";
      const subcategoryVal = dbItem?.subcategory || "OTHER";

      if (categoryVal === "MOVIES") {
        memory_type = "movie";
      } else if (categoryVal === "DINING") {
        memory_type = "dining";
      } else if (categoryVal === "SPORTS") {
        if (subcategoryVal === "FOOTBALL") {
          memory_type = "football";
        } else if (subcategoryVal === "BADMINTON") {
          memory_type = "badminton";
        }
      }
    }

    // Get going participants fresh from DB
    const { data: freshParticipantsData } = await (supabase as any)
      .from("plan_participants")
      .select("*");
    const freshParticipants = freshParticipantsData || dbPlanParticipants;

    const goingParticipants = freshParticipants.filter(
      pp => pp.plan_id === planUuid && pp.rsvp_status === "JOINED"
    );

    const now = new Date();
    const created_at = now.toISOString();
    const editable_until = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const memoryId = crypto.randomUUID();

    // 1. Update plan status to completed
    const { error: planError } = await (supabase as any)
      .from("plans")
      .update({ status: "COMPLETED" })
      .eq("id", planUuid);
    if (planError) {
      console.error("PLAN_COMPLETE_STATUS_ERROR", planError);
      throw new Error("Failed to update plan status to completed");
    }


    // System message for plan completion
    await insertSystemMessage(planUuid, "Plan completed", null);
  }, [plans, dbPlans, dbPlanParticipants, dbCircles, dbCircleMembers, userId, resolveUserUuid, insertSystemMessage]);

  return {
    changePlanHost,
    cancelPlan,
    updatePlanDetails,
    completePlan,
  };
}
