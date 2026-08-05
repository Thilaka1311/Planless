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

  const renumberWaitlistPositions = useCallback(async (planUuid: string) => {
    const matchedPlan = plans.find(p => p.id === planUuid || p.dbUuid === planUuid);
    const orderMode = matchedPlan?.waitlistOrderMode || (matchedPlan as any)?.waitlist_order_mode || 'AUTO';

    // Fetch fresh plan participants from state / DB
    const { data: freshParts } = await (supabase as any)
      .from("plan_participants")
      .select("*")
      .eq("plan_id", planUuid);

    const participants = freshParts || dbPlanParticipants.filter(pp => pp.plan_id === planUuid);

    // Filter waitlist participants (assigned_group == 'WAITLIST' or default waitlisted)
    const waitlistParts = participants.filter(pp => {
      if (pp.rsvp_status === 'SKIPPED') return false;
      const group = (pp as any).assigned_group || (pp as any).assignedGroup;
      return group === 'WAITLIST' || (!group && pp.rsvp_status === 'WAITLISTED');
    });

    // Sort using canonical waitlist ordering mechanism
    const sortedWaitlist = [...waitlistParts].sort((a, b) => {
      if (orderMode === 'CUSTOM') {
        const posA = a.waitlist_position ?? Number.MAX_SAFE_INTEGER;
        const posB = b.waitlist_position ?? Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;
      }
      const qA = a.join_queue ?? Number.MAX_SAFE_INTEGER;
      const qB = b.join_queue ?? Number.MAX_SAFE_INTEGER;
      if (qA !== qB) return qA - qB;

      const timeA = a.joined_queue_at ? new Date(a.joined_queue_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : Number.MAX_SAFE_INTEGER);
      const timeB = b.joined_queue_at ? new Date(b.joined_queue_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : Number.MAX_SAFE_INTEGER);
      return timeA - timeB;
    });

    // Optimistically update local state with contiguous positions 1..N
    setDbPlanParticipants(prev => {
      return prev.map(pp => {
        if (pp.plan_id === planUuid) {
          const group = (pp as any).assigned_group || (pp as any).assignedGroup;
          const isWaitlist = group === 'WAITLIST' || (!group && pp.rsvp_status === 'WAITLISTED');
          if (!isWaitlist) {
            return { ...pp, waitlist_position: null };
          }
          const idx = sortedWaitlist.findIndex(w => w.user_id === pp.user_id);
          if (idx !== -1) {
            return { ...pp, waitlist_position: idx + 1 };
          }
        }
        return pp;
      });
    });

    // Persist 1..N to DB for waitlist participants
    for (let i = 0; i < sortedWaitlist.length; i++) {
      const part = sortedWaitlist[i];
      await (supabase as any)
        .from("plan_participants")
        .update({ waitlist_position: i + 1 })
        .eq("plan_id", planUuid)
        .eq("user_id", part.user_id);
    }

    // Guarantee any SKIPPED or GOING participant has waitlist_position = null in DB
    await (supabase as any)
      .from("plan_participants")
      .update({ waitlist_position: null })
      .eq("plan_id", planUuid)
      .or("rsvp_status.eq.SKIPPED,assigned_group.eq.GOING");
  }, [plans, dbPlanParticipants, setDbPlanParticipants]);

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
          assigned_group: "GOING",
          waitlist_position: null,
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

      // Calculate new waitlist position if joining/rejoining waitlist
      let newWaitlistPos: number | null = null;
      if (targetDbState === "WAITLISTED") {
        const currentWaitlist = dbPlanParticipants.filter(pp => {
          if (pp.plan_id !== planUuid) return false;
          if (pp.rsvp_status === 'SKIPPED') return false;
          const group = (pp as any).assigned_group || (pp as any).assignedGroup;
          return group === 'WAITLIST' || (!group && pp.rsvp_status === 'WAITLISTED');
        });
        const maxPos = currentWaitlist.reduce((max, p) => Math.max(max, p.waitlist_position || 0), 0);
        newWaitlistPos = maxPos + 1;
      }

      // Optimistic Update
      const optimisticRecord = existingBefore ? {
        ...existingBefore,
        rsvp_status: targetDbState as any,
        waitlist_position: targetDbState === "WAITLISTED" ? newWaitlistPos : null,
        responded_at: new Date().toISOString(),
        skip_reason: null,
        circle_id: circleId
      } : {
        plan_id: planUuid,
        user_id: userUuid,
        role: "PARTICIPANT" as const,
        rsvp_status: targetDbState as any,
        waitlist_position: targetDbState === "WAITLISTED" ? newWaitlistPos : null,
        responded_at: new Date().toISOString(),
        skip_reason: null,
        circle_id: circleId
      };

      applyParticipantOptimisticUpdate(planUuid, userUuid, optimisticRecord as any);

      if (existingBefore) {
        try {
          const res = await (supabase as any)
            .from("plan_participants")
            .update({
              rsvp_status: targetDbState,
              waitlist_position: targetDbState === "WAITLISTED" ? newWaitlistPos : null,
              responded_at: new Date().toISOString(),
              skip_reason: null,
              circle_id: circleId,
              updated_at: new Date().toISOString()
            })
            .eq("plan_id", planUuid)
            .eq("user_id", userUuid);

          if (!res) {
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
          waitlist_position: targetDbState === "WAITLISTED" ? newWaitlistPos : null,
          role: "PARTICIPANT" as const,
          responded_at: new Date().toISOString(),
          skip_reason: null,
          circle_id: circleId
        };

        try {
          const res = await insertParticipant(payload);
          if (!res) {
            console.error("[WAITLIST WRITE] FAILED (returned null)");
          }
        } catch (err) {
          console.error("[WAITLIST WRITE] FAILED", err);
        }
      }
      await handleParticipantStatusChange(planUuid, userUuid, existingBefore?.rsvp_status, targetDbState);
      await syncUserStats(userUuid, "join_plan");
      await promoteWaitlistIfSpotsAvailable(planUuid);
      await renumberWaitlistPositions(planUuid);
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

    console.group("🔥 [DB_LEAVE_AUDIT] leavePlan Database Execution Started");
    console.log("📍 Input Parameters -> planId:", rawPlanId, "| resolved planUuid:", planUuid);
    console.log("📍 Input Parameters -> leaverId:", leaverId, "| resolved userUuid:", userUuid);
    console.log("📍 Local State -> matchedPlan.hostId:", matchedPlan?.hostId);

    if (!userUuid || !isUuid(userUuid)) {
      console.error("❌ [DB_LEAVE_AUDIT] ABORT: Invalid user UUID:", userUuid);
      console.groupEnd();
      throw new Error("Invalid user UUID");
    }

    // ─── STEP 1: Direct Database Queries Before Any Updates ───────────────────────
    console.group("📊 [DB_LEAVE_AUDIT] STEP 1: Direct DB Fetch Before Updates");
    
    // Fetch plans.host_id directly from PostgreSQL
    const { data: dbPlanBefore, error: planFetchErrBefore } = await (supabase as any)
      .from("plans")
      .select("id, host_id, created_by")
      .eq("id", planUuid)
      .maybeSingle();

    console.log("📥 DB Query: SELECT id, host_id, created_by FROM plans WHERE id =", planUuid, {
      data: dbPlanBefore,
      error: planFetchErrBefore
    });

    // Fetch plan_participants directly from PostgreSQL
    const { data: dbParticipantsBefore, error: partFetchErrBefore } = await (supabase as any)
      .from("plan_participants")
      .select("user_id, role, rsvp_status")
      .eq("plan_id", planUuid);

    console.log("📥 DB Query: SELECT user_id, role, rsvp_status FROM plan_participants WHERE plan_id =", planUuid, {
      data: dbParticipantsBefore,
      error: partFetchErrBefore
    });

    console.groupEnd();

    const currentOwnerUuid = resolveUserUuid(matchedPlan?.hostId || dbPlanBefore?.host_id || "");
    const isCurrentOwnerLeaving = currentOwnerUuid === userUuid;

    // ─── STEP 2: Host Ownership Transfer (If Owner Leaving) ─────────────────────
    if (isCurrentOwnerLeaving) {
      console.group("🔄 [DB_LEAVE_AUDIT] STEP 2: Updating plans.host_id");
      console.log("📍 Owner leaving detected. Previous host_id:", currentOwnerUuid);

      // Find replacement host candidate from DB rows or local memory
      const replacementCandidate = (dbParticipantsBefore || []).find(
        (pp: any) => pp.user_id !== userUuid && pp.role === "HOST"
      ) || dbPlanParticipants.find(
        pp => pp.plan_id === planUuid && pp.user_id !== userUuid && (pp.role === "HOST" || (pp as any).isHost)
      );

      console.log("📍 Selected replacement host candidate:", replacementCandidate);

      if (replacementCandidate) {
        const nextHostUuid = resolveUserUuid(replacementCandidate.user_id);
        console.log("📍 Executing DB Update -> plans.host_id =", nextHostUuid, "WHERE id =", planUuid);

        const { data: hostUpdateData, error: hostUpdateError } = await (supabase as any)
          .from("plans")
          .update({ host_id: nextHostUuid })
          .eq("id", planUuid)
          .select();

        console.log("📤 DB Update Response (plans.host_id):", {
          rowsAffected: hostUpdateData ? hostUpdateData.length : 0,
          returnedData: hostUpdateData,
          returnedError: hostUpdateError
        });

        if (hostUpdateError) {
          console.error("❌ [DB_LEAVE_AUDIT] Host ownership update FAILED:", hostUpdateError);
          console.groupEnd();
          console.groupEnd();
          throw new Error("Failed to transfer host ownership in plans table: " + hostUpdateError.message);
        }

        // Immediately query plans table again to verify persistence
        const { data: dbPlanPostTransfer, error: postTransferErr } = await (supabase as any)
          .from("plans")
          .select("id, host_id")
          .eq("id", planUuid)
          .maybeSingle();

        console.log("📥 Verification Query: SELECT host_id FROM plans WHERE id =", planUuid, {
          persistedHostId: dbPlanPostTransfer?.host_id,
          expectedHostId: nextHostUuid,
          updatePersistedSuccessfully: dbPlanPostTransfer?.host_id === nextHostUuid,
          error: postTransferErr
        });
      } else {
        console.warn("⚠️ [DB_LEAVE_AUDIT] No candidate found with role = 'HOST' in participants!");
      }
      console.groupEnd();
    }

    // ─── STEP 3: Update Participant Record ─────────────────────────────────────
    const leaverParticipantRecord = (dbParticipantsBefore || []).find((p: any) => p.user_id === userUuid)
      || dbPlanParticipants.find(p => p.plan_id === planUuid && p.user_id === userUuid);

    console.group("📝 [DB_LEAVE_AUDIT] STEP 3: Updating Participant Record");
    console.log("📍 Leaver user_id:", userUuid);
    console.log("📍 Old role:", leaverParticipantRecord?.role);
    console.log("📍 Old RSVP:", leaverParticipantRecord?.rsvp_status);

    applyParticipantOptimisticUpdate(planUuid, userUuid, {
      role: "PARTICIPANT",
      rsvp_status: "SKIPPED",
      responded_at: new Date().toISOString(),
      skip_reason: "LEFT"
    } as any);

    // ─── STEP 4: Execute RPC / Fallback Participant Update ──────────────────────
    console.log("🚀 [DB_LEAVE_AUDIT] STEP 4: Executing RPC leave_plan with input:", { p_plan_id: planUuid });

    let rpcSuccess = false;
    try {
      const rpcResult = await (supabase as any).rpc("leave_plan", {
        p_plan_id: planUuid
      });

      console.log("📤 RPC leave_plan Response:", {
        input: { p_plan_id: planUuid },
        output: rpcResult.data,
        error: rpcResult.error,
        fullResponseObject: rpcResult
      });

      if (rpcResult.error) {
        console.warn("⚠️ [DB_LEAVE_AUDIT] RPC leave_plan error encountered, executing direct DB fallback update...");
        const fallbackRes = await updateParticipantStatus(planUuid, userUuid, "SKIPPED", undefined, new Date().toISOString(), "LEFT");
        console.log("📤 Fallback updateParticipantStatus result:", fallbackRes);
      } else {
        rpcSuccess = true;
      }

      await handleParticipantStatusChange(planUuid, userUuid, leaverParticipantRecord?.rsvp_status, "SKIPPED");
      await unassignTeam(planUuid, userUuid);
      await promoteWaitlistIfSpotsAvailable(planUuid);
      await renumberWaitlistPositions(planUuid);

    } catch (err) {
      console.error("❌ [DB_LEAVE_AUDIT] Participant update threw exception:", err);
      console.groupEnd();
      console.groupEnd();
      throw err;
    }

    console.groupEnd();

    // ─── STEP 5: Immediately Fetch Participant Row Again to Verify ──────────────
    console.group("🔎 [DB_LEAVE_AUDIT] STEP 5: Post-Leave Verification Query (plan_participants)");

    const { data: dbLeaverPostCheck, error: leaverPostErr } = await (supabase as any)
      .from("plan_participants")
      .select("role, rsvp_status, skip_reason, responded_at, updated_at")
      .eq("plan_id", planUuid)
      .eq("user_id", userUuid)
      .maybeSingle();

    console.log("📥 Verification Query: SELECT role, rsvp_status, skip_reason, responded_at, updated_at FROM plan_participants:", {
      data: dbLeaverPostCheck,
      error: leaverPostErr,
      roleIsParticipant: dbLeaverPostCheck?.role === "PARTICIPANT",
      rsvpIsSkipped: dbLeaverPostCheck?.rsvp_status === "SKIPPED",
      skipReasonIsLeft: dbLeaverPostCheck?.skip_reason === "LEFT"
    });

    console.groupEnd();

    // ─── STEP 6: Final Verification at the End of leavePlan() ───────────────────
    console.group("🏁 [DB_LEAVE_AUDIT] STEP 6: Final State Verification at end of leavePlan()");

    const { data: finalPlanDb } = await (supabase as any)
      .from("plans")
      .select("id, host_id")
      .eq("id", planUuid)
      .maybeSingle();

    const { data: finalParticipantDb } = await (supabase as any)
      .from("plan_participants")
      .select("role, rsvp_status, skip_reason")
      .eq("plan_id", planUuid)
      .eq("user_id", userUuid)
      .maybeSingle();

    console.log("📥 Final DB Snapshot -> plans.host_id:", finalPlanDb?.host_id);
    console.log("📥 Final DB Snapshot -> participant row:", finalParticipantDb);

    if (isCurrentOwnerLeaving && finalPlanDb?.host_id === userUuid) {
      console.error("🚨 [DB_LEAVE_AUDIT] FAILURE: plans.host_id DID NOT CHANGE! Still references leaving creator:", userUuid);
    }
    if (finalParticipantDb?.rsvp_status !== "SKIPPED") {
      console.error("🚨 [DB_LEAVE_AUDIT] FAILURE: plan_participants.rsvp_status DID NOT CHANGE! Still:", finalParticipantDb?.rsvp_status);
    }
    if (finalParticipantDb?.role !== "PARTICIPANT") {
      console.error("🚨 [DB_LEAVE_AUDIT] FAILURE: plan_participants.role DID NOT CHANGE! Still:", finalParticipantDb?.role);
    }

    console.log("🎉 [DB_LEAVE_AUDIT] leavePlan finished");
    console.groupEnd();
    console.groupEnd();
  }, [plans, dbPlans, resolveUserUuid, isUuid, dbPlanParticipants, handleParticipantStatusChange, unassignTeam, applyParticipantOptimisticUpdate]);

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
        waitlist_position: null,
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
      await promoteWaitlistIfSpotsAvailable(planUuid);
      await renumberWaitlistPositions(planUuid);
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

    // 4. Renumber remaining waitlist positions contiguously 1..N
    await renumberWaitlistPositions(planUuid);

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

    if (isRsvpDeadlinePassed) {
      throw new Error("This plan is no longer accepting new participants because the RSVP deadline has already passed.");
    }

    if (isPlanStarted) {
      throw new Error("You can't invite new participants after the plan has started.");
    }



    // 1. Calculate base max waitlist position if assigned to WAITLIST
    const currentWaitlist = dbPlanParticipants.filter(pp => {
      if (pp.plan_id !== planUuid) return false;
      if (pp.rsvp_status === 'SKIPPED') return false;
      const group = (pp as any).assigned_group || (pp as any).assignedGroup;
      return group === 'WAITLIST' || (!group && pp.rsvp_status === 'WAITLISTED');
    });
    let maxWaitlistPos = currentWaitlist.reduce((max, p) => Math.max(max, p.waitlist_position || 0), 0);

    // Optimistic updates
    inviteeUuids.forEach((inviteeUuid) => {
      const waitlistPos = effectiveAssignedGroup === 'WAITLIST' ? ++maxWaitlistPos : null;
      applyParticipantOptimisticUpdate(planUuid, inviteeUuid, {
        plan_id: planUuid,
        user_id: inviteeUuid,
        role: "PARTICIPANT",
        rsvp_status: "INVITED",
        assigned_group: effectiveAssignedGroup,
        waitlist_position: waitlistPos,
        responded_at: null,
        skip_reason: null,
      } as any);
    });

    // 2. Persist via trusted SECURITY DEFINER RPC
    await api.inviteParticipantsRPC(planUuid, inviteeUuids, effectiveAssignedGroup);

    // 3. Ensure contiguous renumbering 1..N
    await renumberWaitlistPositions(planUuid);

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
      assigned_group: "GOING",
      waitlist_position: null,
      responded_at: new Date().toISOString()
    });

    // Promote target
    participantRecords.push({
      plan_id: planUuid,
      user_id: resolvedUserUuid,
      rsvp_status: "JOINED",
      assigned_group: "GOING",
      waitlist_position: null,
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

    await renumberWaitlistPositions(planUuid);
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

    // Optimistic state update: update assigned_group to GOING and clear waitlist_position
    setDbPlanParticipants(prev => prev.map(pp => {
      if ((pp.plan_id === planUuid || pp.plan_id === planId) && (pp.user_id === resolvedUserUuid || pp.user_id === participantUserUuid)) {
        const nextStatus = pp.rsvp_status === 'WAITLISTED' ? 'JOINED' : pp.rsvp_status;
        return {
          ...pp,
          assigned_group: 'GOING' as const,
          waitlist_position: null,
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
          waitlist_position: null,
          rsvp_status: nextRsvp,
          skip_reason: null,
          updated_at: new Date().toISOString()
        })
        .eq("plan_id", planUuid)
        .eq("user_id", resolvedUserUuid);

      if (updateErr) {
        throw updateErr;
      }

      // Log host management activity event (Host moved participant to Going)
      if (userId) {
        await (supabase as any)
          .from("plan_activity")
          .insert({
            plan_id: planUuid,
            actor_id: userId,
            target_user_id: resolvedUserUuid,
            activity_type: "participant_moved_to_going",
            metadata: {}
          });
      }

      await renumberWaitlistPositions(planUuid);
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

    // Calculate next waitlist position (MAX + 1)
    const currentWaitlist = dbPlanParticipants.filter(pp => {
      if (pp.plan_id !== planUuid) return false;
      if (pp.rsvp_status === 'SKIPPED') return false;
      const group = (pp as any).assigned_group || (pp as any).assignedGroup;
      return group === 'WAITLIST' || (!group && pp.rsvp_status === 'WAITLISTED');
    });
    const nextWaitlistPos = currentWaitlist.reduce((max, p) => Math.max(max, p.waitlist_position || 0), 0) + 1;

    // Optimistic state update: update assigned_group to WAITLIST and set waitlist_position
    setDbPlanParticipants(prev => prev.map(pp => {
      if ((pp.plan_id === planUuid || pp.plan_id === planId) && (pp.user_id === resolvedUserUuid || pp.user_id === participantUserUuid)) {
        const nextStatus = pp.rsvp_status === 'JOINED' ? 'WAITLISTED' : pp.rsvp_status;
        return {
          ...pp,
          assigned_group: "WAITLIST" as const,
          waitlist_position: nextWaitlistPos,
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
          waitlist_position: nextWaitlistPos,
          rsvp_status: nextRsvp,
          skip_reason: null,
          updated_at: new Date().toISOString()
        })
        .eq("plan_id", planUuid)
        .eq("user_id", resolvedUserUuid);

      if (updateError) {
        throw new Error("Failed to update status to waitlist");
      }

      // Log host management activity event (Host moved participant to Waitlist)
      if (userId) {
        await (supabase as any)
          .from("plan_activity")
          .insert({
            plan_id: planUuid,
            actor_id: userId,
            target_user_id: resolvedUserUuid,
            activity_type: "participant_moved_to_waitlist",
            metadata: {}
          });
      }

      await renumberWaitlistPositions(planUuid);
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

  const reorderDebounceTimersRef = React.useRef<Map<string, NodeJS.Timeout>>(new Map());

  const reorderWaitlist = useCallback((planId: string, orderedUserUuids: string[]) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    if (!planUuid || orderedUserUuids.length === 0) return;

    // 1. Immediately update local cache (state) for instant UI re-render and smooth dragging
    setDbPlanParticipants(prev => {
      return prev.map(pp => {
        if (pp.plan_id === planUuid || pp.plan_id === planId) {
          const group = (pp as any).assigned_group || (pp as any).assignedGroup;
          const isWaitlist = group === 'WAITLIST' || (!group && pp.rsvp_status === 'WAITLISTED');
          if (!isWaitlist) {
            return { ...pp, waitlist_position: null };
          }
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

    // 2. Clear any existing debounce timer for this plan
    const existingTimer = reorderDebounceTimersRef.current.get(planUuid);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 3. Set a new 3-second debounce timer before writing final order to DB
    const timer = setTimeout(async () => {
      reorderDebounceTimersRef.current.delete(planUuid);
      try {
        // Switch plan waitlist_order_mode to CUSTOM
        await (supabase as any)
          .from("plans")
          .update({ waitlist_order_mode: "CUSTOM" })
          .eq("id", planUuid);

        // Persist 1-indexed waitlist_position to plan_participants for waitlist participants
        for (let i = 0; i < orderedUserUuids.length; i++) {
          const userUuid = resolveUserUuid(orderedUserUuids[i]);
          await (supabase as any)
            .from("plan_participants")
            .update({ waitlist_position: i + 1 })
            .eq("plan_id", planUuid)
            .eq("user_id", userUuid);
        }

        // Guarantee any participant assigned to GOING has waitlist_position = null in DB
        await (supabase as any)
          .from("plan_participants")
          .update({ waitlist_position: null })
          .eq("plan_id", planUuid)
          .eq("assigned_group", "GOING");

        await refreshPlans();
      } catch (err) {
        console.error("[reorderWaitlist] Failed to persist new order to DB after 3s debounce:", err);
        await refreshPlans(); // Revert/sync to current DB state if save fails
      }
    }, 3000);

    reorderDebounceTimersRef.current.set(planUuid, timer);
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
