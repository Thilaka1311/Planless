import React, { useCallback } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { normalizeStatus } from "../../../../lib/participantStatus";
import { Plan, DbPlan, DbPlanParticipant, User } from "../../../core/types";
import { updateParticipantStatus, insertParticipant, deleteParticipant, syncUserStats } from "../../../../lib/db";
import { cleanPlanId, isUuid as isUuidUtil, resolveUserUuid as resolveUserUuidUtil } from "../utils/planUtils";
import { syncPlanFriendships } from "../../friendships/services/friendshipService";
import { recalculateWalletExpenses } from "../../wallet/services/walletSyncService";
import { invalidatePlanCache } from "../../chats/hooks/useChatCache";
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
          id: (updates as any).id || `opt-${planUuid.slice(0, 8)}-${userUuid.slice(0, 8)}`,
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
    const filteringMode = matchedPlan?.participantFiltering || (matchedPlan as any)?.participant_filtering || 'AUTOMATIC';
    const isAssigned = filteringMode === 'ASSIGNED';

    if (filteringMode === 'AUTOMATIC') {
      // Backend triggers and RPCs handle Automatic queue renumbering atomically.
      return;
    }

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
      if (orderMode === 'CUSTOM' || isAssigned) {
        const posA = a.waitlist_position ?? Number.MAX_SAFE_INTEGER;
        const posB = b.waitlist_position ?? Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;
      }

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

    // 1. Guarantee any SKIPPED or GOING participant has waitlist_position = null in DB first
    await (supabase as any)
      .from("plan_participants")
      .update({ waitlist_position: null })
      .eq("plan_id", planUuid)
      .or("rsvp_status.eq.SKIPPED,assigned_group.eq.GOING");

    // 2. Persist 1..N to DB for waitlist participants
    for (let i = 0; i < sortedWaitlist.length; i++) {
      const part = sortedWaitlist[i];
      await (supabase as any)
        .from("plan_participants")
        .update({ waitlist_position: i + 1 })
        .eq("plan_id", planUuid)
        .eq("user_id", part.user_id);
    }
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

  const promoteWaitlistIfSpotsAvailable = useCallback(async (planUuid: string, options?: { bypassDeadlineCheck?: boolean }) => {
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

    if (mode === 'AUTOMATIC') {
      // Backend triggers handle Automatic promotion atomically.
      return;
    }
    const rsvpDeadline = (matchedPlan as any).response_deadline_at || dbPlanObj.rsvp_deadline;
    const isPastDeadline = rsvpDeadline ? new Date() > new Date(rsvpDeadline) : false;

    // In ASSIGNED mode, automatic promotion ONLY occurs if RSVP deadline has passed
    if (isAssigned && !isPastDeadline && !options?.bypassDeadlineCheck) {
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
        .filter(pp => {
          const status = normalizeStatus(pp.rsvp_status);
          if (status === "SKIPPED" || status === "INVITED") return false;
          const group = String((pp as any).assigned_group || (pp as any).assignedGroup || '').trim().toUpperCase();
          if (isAssigned) {
            return group === "WAITLIST";
          }
          return status === "WAITLISTED" || group === "WAITLIST";
        })
        .sort((a, b) => {
          if (isAssigned) {
            // Assigned mode: waitlist_position is the source of truth
            const posA = a.waitlist_position ?? Number.MAX_SAFE_INTEGER;
            const posB = b.waitlist_position ?? Number.MAX_SAFE_INTEGER;
            if (posA !== posB) return posA - posB;
          }
          const timeA = (a as any).created_at ? new Date((a as any).created_at).getTime() : 0;
          const timeB = (b as any).created_at ? new Date((b as any).created_at).getTime() : 0;
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
          skip_reason: pToPromote.skip_reason === "PAYMENT_KEPT" ? "PAYMENT_KEPT" : null
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
        if (existingBefore?.waitlist_position != null) {
          newWaitlistPos = existingBefore.waitlist_position;
        } else {
          const currentWaitlist = dbPlanParticipants.filter(pp => {
            if (pp.plan_id !== planUuid) return false;
            if (pp.rsvp_status === 'SKIPPED') return false;
            const group = (pp as any).assigned_group || (pp as any).assignedGroup;
            return group === 'WAITLIST' || (!group && pp.rsvp_status === 'WAITLISTED');
          });
          const maxPos = currentWaitlist.reduce((max, p) => Math.max(max, p.waitlist_position || 0), 0);
          newWaitlistPos = maxPos + 1;
        }
      }

      const existingSr = existingBefore?.skip_reason === "PAYMENT_KEPT" ? "PAYMENT_KEPT" : null;

      // Optimistic Update
      const optimisticRecord = existingBefore ? {
        ...existingBefore,
        rsvp_status: targetDbState as any,
        waitlist_position: targetDbState === "WAITLISTED" ? newWaitlistPos : null,
        responded_at: new Date().toISOString(),
        skip_reason: existingSr,
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
              skip_reason: existingSr,
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
    if (!userUuid || !isUuid(userUuid)) {
      throw new Error("Invalid user UUID");
    }

    const { data: dbPlanBefore } = await (supabase as any)
      .from("plans")
      .select("id, host_id")
      .eq("id", planUuid)
      .maybeSingle();

    const { data: dbParticipantsBefore } = await (supabase as any)
      .from("plan_participants")
      .select("user_id, role, rsvp_status")
      .eq("plan_id", planUuid);

    const currentOwnerUuid = resolveUserUuid(matchedPlan?.hostId || dbPlanBefore?.host_id || "");
    const isCurrentOwnerLeaving = currentOwnerUuid === userUuid;

    if (isCurrentOwnerLeaving) {
      const replacementCandidate = (dbParticipantsBefore || []).find(
        (pp: any) => pp.user_id !== userUuid && pp.role === "HOST"
      ) || dbPlanParticipants.find(
        pp => pp.plan_id === planUuid && pp.user_id !== userUuid && (pp.role === "HOST" || (pp as any).isHost)
      );

      if (replacementCandidate) {
        const nextHostUuid = resolveUserUuid(replacementCandidate.user_id);
        const { error: hostUpdateError } = await (supabase as any)
          .from("plans")
          .update({ host_id: nextHostUuid })
          .eq("id", planUuid);

        if (hostUpdateError) {
          throw new Error("Failed to transfer host ownership in plans table: " + hostUpdateError.message);
        }
      }
    }

    const leaverParticipantRecord = (dbParticipantsBefore || []).find((p: any) => p.user_id === userUuid)
      || dbPlanParticipants.find(p => p.plan_id === planUuid && p.user_id === userUuid);

    applyParticipantOptimisticUpdate(planUuid, userUuid, {
      role: "PARTICIPANT",
      rsvp_status: "SKIPPED",
      assigned_group: null,
      waitlist_position: null,
      responded_at: new Date().toISOString(),
      skip_reason: "LEFT"
    } as any);

    // Persist via trusted SECURITY DEFINER RPC
    try {
      await api.leavePlanRPC(planUuid);
    } catch (rpcError) {
      console.error("[PlansContext leavePlan] leavePlanRPC failed.", rpcError);
      await refreshPlans();
      throw rpcError;
    }

    await handleParticipantStatusChange(planUuid, userUuid, leaverParticipantRecord?.rsvp_status, "SKIPPED");
    await unassignTeam(planUuid, userUuid);

    // Refresh everything because RPC might have promoted Waitlist #1
    await refreshPlans(["plan_participants", "wallet_expenses", "wallet_expense_participants"]);
  }, [plans, dbPlans, resolveUserUuid, isUuid, dbPlanParticipants, handleParticipantStatusChange, unassignTeam, applyParticipantOptimisticUpdate, refreshPlans]);

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
      const targetSkipReason = "LEFT";

      applyParticipantOptimisticUpdate(planUuid, userUuid, {
        role: "PARTICIPANT",
        rsvp_status: "SKIPPED",
        assigned_group: null,
        waitlist_position: null,
        responded_at: new Date().toISOString(),
        skip_reason: targetSkipReason
      } as any);

      // Persist via trusted SECURITY DEFINER RPC
      await api.leavePlanRPC(planUuid);

      await handleParticipantStatusChange(planUuid, userUuid, existingBefore.rsvp_status, "SKIPPED");
      await unassignTeam(planUuid, userUuid);

      // Refresh everything because RPC might have promoted Waitlist #1
      await refreshPlans(["plan_participants", "wallet_expenses", "wallet_expense_participants"]);
    } catch (error) {
      console.error(`[PlansContext] skipPlan DB write failed:`, error);
      await refreshPlans();
      throw error;
    }
  }, [plans, resolveUserUuid, isUuid, dbPlanParticipants, handleParticipantStatusChange, unassignTeam, applyParticipantOptimisticUpdate, refreshPlans]);

  const requestPaidPlanLeave = useCallback(async (rawPlanId: string) => {
    const planId = cleanPlanId(rawPlanId);
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const userUuid = resolveUserUuid(userId);

    if (!userUuid || !isUuid(userUuid)) {
      console.error(`[PlansContext] Cannot request paid plan leave: user UUID is missing or invalid:`, userUuid);
      return;
    }

    // Optimistic Update
    applyParticipantOptimisticUpdate(planUuid, userUuid, {
      leave_requested: true,
      leave_requested_at: new Date().toISOString()
    } as any);

    try {
      const { data, error } = await (supabase as any).rpc("request_paid_plan_leave", {
        p_plan_id: planUuid
      });

      if (error) {
        console.error(`[requestPaidPlanLeave] RPC error details:`, {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }

      await refreshPlans(["plan_participants"]);
    } catch (err) {
      console.error("[requestPaidPlanLeave] Exception:", err);
      throw err;
    }
  }, [plans, userId, resolveUserUuid, isUuid, applyParticipantOptimisticUpdate, refreshPlans]);

  const cancelPaidPlanLeaveRequest = useCallback(async (rawPlanId: string) => {
    const planId = cleanPlanId(rawPlanId);
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const userUuid = resolveUserUuid(userId);

    if (!userUuid || !isUuid(userUuid)) {
      console.error(`[PlansContext] Cannot cancel paid plan leave request: user UUID is missing or invalid:`, userUuid);
      return;
    }

    // Optimistic Update
    applyParticipantOptimisticUpdate(planUuid, userUuid, {
      leave_requested: false,
      leave_requested_at: null
    } as any);

    try {
      const { data, error } = await (supabase as any).rpc("cancel_paid_plan_leave_request", {
        p_plan_id: planUuid
      });

      if (error) {
        console.error(`[cancelPaidPlanLeaveRequest] RPC failed:`, error);
        throw error;
      }

      await refreshPlans(["plan_participants"]);
    } catch (err) {
      console.error("[cancelPaidPlanLeaveRequest] Exception:", err);
      throw err;
    }
  }, [plans, userId, resolveUserUuid, isUuid, applyParticipantOptimisticUpdate, refreshPlans]);

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

    // Optimistic state update: set target participant as SKIPPED immediately
    setDbPlanParticipants(prev => prev.map(pp => {
      if ((pp.plan_id === planUuid || pp.plan_id === planId) && (pp.user_id === resolvedParticipantUuid || pp.user_id === participantUserUuid)) {
        return {
          ...pp,
          rsvp_status: "SKIPPED" as const,
          assigned_group: null,
          waitlist_position: null,
          skip_reason: "REMOVED"
        };
      }
      return pp;
    }));

    // 1. Pre-emptively clean up any team assignment before deleting participant
    try {
      await unassignTeam(planUuid, resolvedParticipantUuid);
    } catch (teamErr) {
      console.warn("[PlansContext removeParticipant] Team assignment cleanup warning (non-blocking):", teamErr);
    }

    // 2. Persist removal via trusted SECURITY DEFINER RPC
    try {
      await api.removeParticipantRPC(planUuid, resolvedParticipantUuid);

      renumberWaitlistPositions(planUuid).catch(() => {});
      // Recalculate wallet expenses when a participant is removed
      recalculateWalletExpenses(planUuid).catch(err =>
        console.error("[removeParticipant] recalculateWalletExpenses failed:", err)
      );
      await refreshPlans(["plans", "plan_participants", "wallet_expenses", "wallet_expense_participants"]);
    } catch (rpcError: any) {
      console.error("[PlansContext removeParticipant] removeParticipantRPC failed.", rpcError);
      await refreshPlans(); // Rollback optimistic state on failure
      throw new Error(rpcError?.message || "Failed to remove participant.");
    }


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

    // Insert plan_activity entries for each added participant
    if (userId) {
      const actorUser = dbUsers.find(u => u.id === userId);
      const actorName = actorUser?.full_name || (actorUser as any)?.name || "Host";

      for (const inviteeUuid of inviteeUuids) {
        const inviteeUser = dbUsers.find(u => u.id === inviteeUuid);
        const participantName = inviteeUser?.full_name || (inviteeUser as any)?.name || "Participant";
        const participantAvatarUrl = (inviteeUser as any)?.avatar_url || (inviteeUser as any)?.profile_photo || null;

        const activityType = effectiveAssignedGroup === 'GOING'
          ? 'participant_moved_to_joined'
          : effectiveAssignedGroup === 'WAITLIST'
            ? 'participant_moved_to_waitlist'
            : 'participant_invites_toggled';
        const groupValue = effectiveAssignedGroup === 'GOING' ? 'going' : effectiveAssignedGroup === 'WAITLIST' ? 'waitlist' : null;

        (supabase as any)
          .from("plan_activity")
          .insert({
            plan_id: planUuid,
            actor_id: userId,
            target_user_id: inviteeUuid,
            activity_type: activityType,
            metadata: {
              participant_user_id: inviteeUuid,
              participant_name: participantName,
              participant_avatar_url: participantAvatarUrl,
              assigned_group: groupValue,
              rsvp_status: "invited",
              performed_by: userId,
              performed_by_name: actorName,
            }
          })
          .then();
      }
    }

    // 3. Ensure contiguous renumbering 1..N
    await renumberWaitlistPositions(planUuid);

    // Recalculate wallet splits when a participant is added directly to Going
    if (effectiveAssignedGroup === 'GOING') {
      recalculateWalletExpenses(planUuid).catch(err =>
        console.error("[addParticipantsToPlan] recalculateWalletExpenses failed:", err)
      );
    }

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

  const moveParticipantToGoing = useCallback(async (planId: string, participantUserUuid: string, options?: { bypassCapacityCheck?: boolean }) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const resolvedUserUuid = resolveUserUuid(participantUserUuid);

    if (!planUuid || !resolvedUserUuid) {
      console.error("[usePlanParticipants moveParticipantToGoing] Missing plan UUID or user UUID");
      return;
    }

    // Assigned Mode Capacity Validation: Count all active participants assigned to GOING (accepted + invited)
    const capacity = matchedPlan?.joinLimit || matchedPlan?.capacity || matchedPlan?.maxSpots || 0;
    if (capacity > 0 && !options?.bypassCapacityCheck) {
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

    const waitlistMode = (matchedPlan as any)?.participant_filtering || (matchedPlan as any)?.participantFiltering || 'AUTOMATIC';
    const isAssigned = waitlistMode === 'ASSIGNED';

    const existingPart = (dbPlanParticipants || []).find((p: any) => (p.plan_id === planUuid || p.plan_id === planId) && (p.user_id === resolvedUserUuid || p.user_id === participantUserUuid));
    let nextRsvp = existingPart?.rsvp_status || 'INVITED';
    if (nextRsvp === 'WAITLISTED') nextRsvp = 'JOINED';

    // Optimistic state update: update assigned_group to GOING and sync rsvp_status to JOINED where applicable
    setDbPlanParticipants(prev => prev.map(pp => {
      if ((pp.plan_id === planUuid || pp.plan_id === planId) && (pp.user_id === resolvedUserUuid || pp.user_id === participantUserUuid)) {
        return {
          ...pp,
          assigned_group: isAssigned ? 'GOING' : null,
          waitlist_position: null,
          rsvp_status: nextRsvp as any,
          responded_at: pp.responded_at || new Date().toISOString()
        };
      }
      return pp;
    }));

    try {
      const existingSr = existingPart?.skip_reason === "PAYMENT_KEPT" ? "PAYMENT_KEPT" : null;

      const { error: updateErr } = await (supabase as any)
        .from("plan_participants")
        .update({
          assigned_group: "GOING",
          waitlist_position: null,
          rsvp_status: nextRsvp,
          skip_reason: existingSr,
          updated_at: new Date().toISOString()
        })
        .eq("plan_id", planUuid)
        .eq("user_id", resolvedUserUuid);

      if (updateErr) {
        throw updateErr;
      }

      renumberWaitlistPositions(planUuid).catch(() => {});
      // Recalculate wallet splits: moving a participant to Going changes the JOINED count
      recalculateWalletExpenses(planUuid).catch(err =>
        console.error("[moveParticipantToGoing] recalculateWalletExpenses failed:", err)
      );
    } catch (err) {
      await refreshPlans(); // Rollback optimistic state on failure
      throw err;
    }
  }, [plans, dbPlanParticipants, resolveUserUuid, refreshPlans, setDbPlanParticipants]);

  const moveParticipantToWaitlist = useCallback(async (planId: string, participantUserUuid: string) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const resolvedUserUuid = resolveUserUuid(participantUserUuid);

    if (!planUuid || !resolvedUserUuid) {
      console.error("[usePlanParticipants moveParticipantToWaitlist] Missing plan UUID or user UUID");
      return;
    }

    let calculatedPos = 1;

    const waitlistMode = (matchedPlan as any)?.participant_filtering || (matchedPlan as any)?.participantFiltering || 'AUTOMATIC';
    const isAssigned = waitlistMode === 'ASSIGNED';

    const existingPart = (dbPlanParticipants || []).find((p: any) => (p.plan_id === planUuid || p.plan_id === planId) && (p.user_id === resolvedUserUuid || p.user_id === participantUserUuid));
    let nextRsvp = existingPart?.rsvp_status || 'INVITED';
    if (nextRsvp === 'JOINED') nextRsvp = 'WAITLISTED';

    // Optimistic state update: update assigned_group to WAITLIST and set waitlist_position immediately
    setDbPlanParticipants(prev => {
      const currentWaitlist = prev.filter(pp => {
        if (pp.plan_id !== planUuid && (pp as any).plan_id !== planId) return false;
        if (pp.rsvp_status === 'SKIPPED') return false;
        const group = (pp as any).assigned_group || (pp as any).assignedGroup;
        return group === 'WAITLIST' || (!group && pp.rsvp_status === 'WAITLISTED');
      });
      calculatedPos = currentWaitlist.reduce((max, p) => Math.max(max, p.waitlist_position || 0), 0) + 1;

      return prev.map(pp => {
        if ((pp.plan_id === planUuid || pp.plan_id === planId) && (pp.user_id === resolvedUserUuid || pp.user_id === participantUserUuid)) {
          return {
            ...pp,
            assigned_group: isAssigned ? "WAITLIST" : null,
            waitlist_position: calculatedPos,
            rsvp_status: nextRsvp as any,
            responded_at: nextRsvp === 'WAITLISTED' ? (pp.responded_at || new Date().toISOString()) : pp.responded_at
          };
        }
        return pp;
      });
    });

    try {
      // 1. Fetch MAX waitlist_position directly from database to guarantee absolute uniqueness across parallel client actions
      const { data: dbWaitlist } = await (supabase as any)
        .from("plan_participants")
        .select("waitlist_position")
        .eq("plan_id", planUuid)
        .eq("assigned_group", "WAITLIST")
        .not("waitlist_position", "is", null);

      const dbMaxPos = (dbWaitlist || []).reduce((max: number, p: any) => Math.max(max, p.waitlist_position || 0), 0);
      const dbCalculatedPos = Math.max(calculatedPos, dbMaxPos + 1);

      const existingSr = existingPart?.skip_reason === "PAYMENT_KEPT" ? "PAYMENT_KEPT" : null;

      const { error: updateError } = await (supabase as any)
        .from("plan_participants")
        .update({
          assigned_group: "WAITLIST",
          waitlist_position: dbCalculatedPos,
          rsvp_status: nextRsvp,
          skip_reason: existingSr,
          updated_at: new Date().toISOString()
        })
        .eq("plan_id", planUuid)
        .eq("user_id", resolvedUserUuid);

      if (updateError) {
        console.error("[moveParticipantToWaitlist] Update error:", updateError);
        throw new Error("Failed to update status to waitlist: " + updateError.message);
      }

      renumberWaitlistPositions(planUuid).catch(() => {});
      // Recalculate wallet splits: moving a participant off Going changes the JOINED count
      recalculateWalletExpenses(planUuid).catch(err =>
        console.error("[moveParticipantToWaitlist] recalculateWalletExpenses failed:", err)
      );
    } catch (err) {
      await refreshPlans(); // Rollback optimistic state on failure
      throw err;
    }
  }, [plans, dbPlanParticipants, resolveUserUuid, refreshPlans, setDbPlanParticipants]);

  const swapParticipants = useCallback(async (planId: string, goingParticipantUserUuid: string, waitlistParticipantUserUuid: string) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const resolvedGoingUuid = resolveUserUuid(goingParticipantUserUuid);
    const resolvedWaitlistUuid = resolveUserUuid(waitlistParticipantUserUuid);

    if (!planUuid || !resolvedGoingUuid || !resolvedWaitlistUuid) {
      console.error("[usePlanParticipants swapParticipants] Missing plan UUID or user UUIDs", {
        planUuid, resolvedGoingUuid, resolvedWaitlistUuid,
        rawPlanId: planId, goingParticipantUserUuid, waitlistParticipantUserUuid
      });
      throw new Error("Cannot swap: missing participant or plan IDs");
    }

    // 1. Snapshot the current participant states for rollback
    const snapshotBefore = dbPlanParticipants.map(pp => ({ ...pp }));

    // 2. Compute optimistic next states
    let calculatedWaitlistPos = 1;
    let outgoingNextRsvp: string = 'WAITLISTED';

    const waitlistMode = (matchedPlan as any)?.participant_filtering || (matchedPlan as any)?.participantFiltering || 'AUTOMATIC';
    const isAssigned = waitlistMode === 'ASSIGNED';

    setDbPlanParticipants(prev => {
      const currentWaitlist = prev.filter(pp => {
        if (pp.plan_id !== planUuid && pp.plan_id !== planId) return false;
        if (pp.rsvp_status === 'SKIPPED') return false;
        const group = (pp as any).assigned_group || (pp as any).assignedGroup;
        return group === 'WAITLIST' || (!group && pp.rsvp_status === 'WAITLISTED');
      });
      calculatedWaitlistPos = currentWaitlist.reduce((max, p) => Math.max(max, p.waitlist_position || 0), 0) + 1;

      const outgoingPp = prev.find(
        pp => (pp.plan_id === planUuid || pp.plan_id === planId) && (pp.user_id === resolvedGoingUuid || pp.user_id === goingParticipantUserUuid)
      );
      outgoingNextRsvp = outgoingPp?.rsvp_status === 'JOINED' ? 'WAITLISTED' : (outgoingPp?.rsvp_status || 'WAITLISTED');

      return prev.map(pp => {
        // GOING → WAITLIST
        if ((pp.plan_id === planUuid || pp.plan_id === planId) && (pp.user_id === resolvedGoingUuid || pp.user_id === goingParticipantUserUuid)) {
          return {
            ...pp,
            assigned_group: isAssigned ? "WAITLIST" : null,
            waitlist_position: calculatedWaitlistPos,
            rsvp_status: outgoingNextRsvp as any,
            responded_at: pp.responded_at || new Date().toISOString()
          };
        }
        // WAITLIST → GOING
        if ((pp.plan_id === planUuid || pp.plan_id === planId) && (pp.user_id === resolvedWaitlistUuid || pp.user_id === waitlistParticipantUserUuid)) {
          const nextStatus = pp.rsvp_status === 'WAITLISTED' ? 'JOINED' : pp.rsvp_status;
          return {
            ...pp,
            assigned_group: isAssigned ? "GOING" : null,
            waitlist_position: null,
            rsvp_status: nextStatus as any,
            responded_at: pp.responded_at || new Date().toISOString()
          };
        }
        return pp;
      });
    });

    try {
      // 3. Single atomic RPC call — handles both updates in one Postgres transaction
      const { data: rpcResult, error: rpcError } = await (supabase as any)
        .rpc("swap_plan_participants", {
          p_plan_id:          planUuid,
          p_going_user_id:    resolvedGoingUuid,
          p_waitlist_user_id: resolvedWaitlistUuid,
        });

      if (rpcError) {
        console.error("[swapParticipants] RPC error:", rpcError);
        throw rpcError;
      }

      // 4. Insert exactly ONE plan_activity record
      if (userId) {
        const outgoingUser = dbUsers.find(u => u.id === resolvedGoingUuid || u.id === goingParticipantUserUuid);
        const incomingUser = dbUsers.find(u => u.id === resolvedWaitlistUuid || u.id === waitlistParticipantUserUuid);
        const actorUser    = dbUsers.find(u => u.id === userId);

        const outgoingName   = outgoingUser?.full_name || (outgoingUser as any)?.name || "Participant";
        const outgoingAvatar = (outgoingUser as any)?.avatar_url || (outgoingUser as any)?.profile_photo || null;

        const incomingName   = incomingUser?.full_name || (incomingUser as any)?.name || "Participant";
        const incomingAvatar = (incomingUser as any)?.avatar_url || (incomingUser as any)?.profile_photo || null;

        const actorName = actorUser?.full_name || (actorUser as any)?.name || "Host";

        const { error: activityErr } = await (supabase as any)
          .from("plan_activity")
          .insert({
            plan_id:        planUuid,
            actor_id:       userId,
            target_user_id: resolvedGoingUuid,
            activity_type:  "participants_swapped",
            metadata: {
              // going_* = participant who ended up GOING after the swap (was on waitlist before)
              going_user_id:      resolvedWaitlistUuid,
              going_user_name:    incomingName,
              going_avatar_url:   incomingAvatar,
              // waitlist_* = participant who ended up on WAITLIST after the swap (was going before)
              waitlist_user_id:   resolvedGoingUuid,
              waitlist_user_name: outgoingName,
              waitlist_avatar_url: outgoingAvatar,
              performed_by:       userId,
              performed_by_name:  actorName,
            }
          });

        if (activityErr) {
          // Non-fatal: swap already succeeded in DB, just log
          console.warn("[swapParticipants] Activity log failed (non-fatal):", activityErr);
        }
      }

      renumberWaitlistPositions(planUuid).catch(() => {});
      // Recalculate wallet splits: a swap changes who is in Going
      recalculateWalletExpenses(planUuid).catch(err =>
        console.error("[swapParticipants] recalculateWalletExpenses failed:", err)
      );
    } catch (err) {
      console.error("[swapParticipants] Error during atomic swap, rolling back optimistic state:", err);
      // Roll back to pre-swap snapshot
      setDbPlanParticipants(snapshotBefore);
      throw err;
    }
  }, [plans, dbUsers, dbPlanParticipants, resolveUserUuid, refreshPlans, setDbPlanParticipants]);

  /**
   * Atomically removes a GOING participant from the plan and promotes a WAITLIST
   * participant to GOING. Writes exactly ONE participants_swapped activity record
   * with outgoing_result='removed' and incoming_result='going'.
   *
   * @param planId           - plan's public id or UUID
   * @param removeUserUuid   - the GOING participant to remove entirely
   * @param promoteUserUuid  - the WAITLIST participant to promote to Going
   */
  const removeAndReplaceWithWaitlist = useCallback(async (
    planId: string,
    removeUserUuid: string,
    promoteUserUuid: string,
  ) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const resolvedRemoveUuid  = resolveUserUuid(removeUserUuid);
    const resolvedPromoteUuid = resolveUserUuid(promoteUserUuid);

    if (!planUuid || !resolvedRemoveUuid || !resolvedPromoteUuid) {
      console.error("[removeAndReplaceWithWaitlist] Missing IDs", { planUuid, resolvedRemoveUuid, resolvedPromoteUuid });
      throw new Error("Cannot replace: missing participant or plan IDs");
    }

    // Snapshot for rollback
    const snapshotBefore = dbPlanParticipants.map(pp => ({ ...pp }));

    const waitlistMode = (matchedPlan as any)?.participant_filtering || (matchedPlan as any)?.participantFiltering || 'AUTOMATIC';
    const isAssigned = waitlistMode === 'ASSIGNED';

    // Optimistic update: remove the outgoing participant, promote the incoming one
    setDbPlanParticipants(prev =>
      prev
        .filter(pp => !(
          (pp.plan_id === planUuid || pp.plan_id === planId) &&
          (pp.user_id === resolvedRemoveUuid || pp.user_id === removeUserUuid)
        ))
        .map(pp => {
          if (
            (pp.plan_id === planUuid || pp.plan_id === planId) &&
            (pp.user_id === resolvedPromoteUuid || pp.user_id === promoteUserUuid)
          ) {
            const nextStatus = pp.rsvp_status === 'WAITLISTED' ? 'JOINED' : pp.rsvp_status;
            return {
              ...pp,
              assigned_group: isAssigned ? 'GOING' : null,
              waitlist_position: null,
              rsvp_status: nextStatus as any,
              responded_at: pp.responded_at || new Date().toISOString(),
            };
          }
          return pp;
        })
    );

    try {
      // Single atomic RPC: removes + promotes in one transaction
      const { data: rpcResult, error: rpcError } = await (supabase as any)
        .rpc('remove_and_replace_participant', {
          p_plan_id:         planUuid,
          p_remove_user_id:  resolvedRemoveUuid,
          p_promote_user_id: resolvedPromoteUuid,
        });

      if (rpcError) {
        console.error('[removeAndReplaceWithWaitlist] RPC error:', rpcError);
        throw rpcError;
      }

      // Write exactly ONE participants_swapped activity
      if (userId) {
        const removedUser  = dbUsers.find(u => u.id === resolvedRemoveUuid  || u.id === removeUserUuid);
        const promotedUser = dbUsers.find(u => u.id === resolvedPromoteUuid || u.id === promoteUserUuid);
        const actorUser    = dbUsers.find(u => u.id === userId);

        const removedName    = removedUser?.full_name  || (removedUser  as any)?.name || 'Participant';
        const removedAvatar  = (removedUser  as any)?.avatar_url || (removedUser  as any)?.profile_photo || null;
        const promotedName   = promotedUser?.full_name || (promotedUser as any)?.name || 'Participant';
        const promotedAvatar = (promotedUser as any)?.avatar_url || (promotedUser as any)?.profile_photo || null;
        const actorName      = actorUser?.full_name    || (actorUser    as any)?.name || 'Host';

        const { error: activityErr } = await (supabase as any)
          .from('plan_activity')
          .insert({
            plan_id:        planUuid,
            actor_id:       userId,
            target_user_id: resolvedPromoteUuid,
            activity_type:  'participants_swapped',
            metadata: {
              // going_* = participant who ended up GOING after the operation
              going_user_id:      resolvedPromoteUuid,
              going_user_name:    promotedName,
              going_avatar_url:   promotedAvatar,
              // waitlist_* = participant who was removed (result field communicates this)
              waitlist_user_id:   resolvedRemoveUuid,
              waitlist_user_name: removedName,
              waitlist_avatar_url: removedAvatar,
              // Result flags so the UI knows this is a remove+replace, not a going↔waitlist swap
              going_result:    'going',
              waitlist_result: 'removed',
              performed_by:      userId,
              performed_by_name: actorName,
            },
          });

        if (activityErr) {
          console.warn('[removeAndReplaceWithWaitlist] Activity log failed (non-fatal):', activityErr);
        }
      }

      renumberWaitlistPositions(planUuid).catch(() => {});
      // Recalculate wallet splits: removing a Going participant and promoting another changes the count
      recalculateWalletExpenses(planUuid).catch(err =>
        console.error("[removeAndReplaceWithWaitlist] recalculateWalletExpenses failed:", err)
      );
    } catch (err) {
      console.error('[removeAndReplaceWithWaitlist] Error, rolling back:', err);
      setDbPlanParticipants(snapshotBefore);
      throw err;
    }
  }, [plans, dbUsers, dbPlanParticipants, resolveUserUuid, refreshPlans, setDbPlanParticipants]);

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

    // 2. Immediately execute atomic PostgreSQL RPC to persist reordered waitlist
    try {
      const resolvedUserUuids = orderedUserUuids.map(uId => resolveUserUuid(uId) || uId);
      
      const { error } = await (supabase as any).rpc("reorder_waitlist", {
        p_plan_id: planUuid,
        p_ordered_user_ids: resolvedUserUuids,
      });

      if (error) {
        console.error("[ASSIGNED_WAITLIST_REORDER] RPC Error:", error);
        await refreshPlans(["plans", "plan_participants"]);
      }
    } catch (err) {
      console.error("[ASSIGNED_WAITLIST_REORDER] RPC Exception:", err);
      await refreshPlans(["plans", "plan_participants"]);
    }
  }, [plans, resolveUserUuid, setDbPlanParticipants, refreshPlans]);

  const resolvePaidPlanLeaveRequest = useCallback(async (
    planId: string,
    targetUserId: string,
    resolution: 'REPLACED' | 'KEEP_PAYMENT',
    replacementUserId?: string
  ) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const resolvedTargetUuid = resolveUserUuid(targetUserId);
    const resolvedReplacementUuid = replacementUserId ? resolveUserUuid(replacementUserId) : undefined;

    if (!planUuid || !resolvedTargetUuid) {
      throw new Error("Missing plan or target participant ID");
    }

    const { data: rpcResult, error: rpcError } = await (supabase as any)
      .rpc('resolve_paid_plan_leave_request', {
        p_plan_id: planUuid,
        p_target_user_id: resolvedTargetUuid,
        p_resolution: resolution,
        p_replacement_user_id: resolvedReplacementUuid || null,
      });

    if (rpcError) {
      console.error("[resolvePaidPlanLeaveRequest] RPC error details:", {
        code: rpcError.code,
        message: rpcError.message,
        details: rpcError.details,
        hint: rpcError.hint,
        rawError: rpcError,
        params: {
          p_plan_id: planUuid,
          p_target_user_id: resolvedTargetUuid,
          p_resolution: resolution,
          p_replacement_user_id: resolvedReplacementUuid || null,
        }
      });
      throw rpcError;
    }

    // Refresh local state and invalidate in-memory activity cache
    invalidatePlanCache(planUuid, 'activities');
    refreshPlans(['plan_participants', 'plan_activity', 'wallet_expenses', 'wallet_expense_participants']);
    return rpcResult;
  }, [plans, resolveUserUuid, refreshPlans]);

  /**
   * Host-Initiated Participant Replacement Flow (Flow 2).
   * Atomically replaces a target participant with a replacement participant
   * without requiring an active leave request (never calls resolve_paid_plan_leave_request).
   */
  const replaceParticipant = useCallback(async (
    planId: string,
    targetUserId: string,
    replacementUserId: string
  ) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const resolvedTargetUuid = resolveUserUuid(targetUserId);
    const resolvedReplacementUuid = resolveUserUuid(replacementUserId);

    if (!planUuid || !resolvedTargetUuid || !resolvedReplacementUuid) {
      console.error("[replaceParticipant] Missing plan or target/replacement participant ID");
      throw new Error("Cannot replace participant: missing ID");
    }

    const targetPp = dbPlanParticipants.find(pp =>
      (pp.plan_id === planUuid || pp.plan_id === planId) &&
      (pp.user_id === resolvedTargetUuid || pp.user_id === targetUserId)
    );
    const replacementPp = dbPlanParticipants.find(pp =>
      (pp.plan_id === planUuid || pp.plan_id === planId) &&
      (pp.user_id === resolvedReplacementUuid || pp.user_id === replacementUserId)
    );

    const { data: rpcResult, error: rpcError } = await (supabase as any)
      .rpc('replace_participant', {
        p_plan_id: planUuid,
        p_target_user_id: resolvedTargetUuid,
        p_replacement_user_id: resolvedReplacementUuid,
      });

    if (rpcError) {
      console.error('[replaceParticipant] RPC error details:', {
        code: rpcError.code,
        message: rpcError.message,
        details: rpcError.details,
        hint: rpcError.hint,
        rawError: rpcError,
        params: {
          p_plan_id: planUuid,
          p_target_user_id: resolvedTargetUuid,
          p_replacement_user_id: resolvedReplacementUuid,
        }
      });
      throw rpcError;
    }

    invalidatePlanCache(planUuid, 'activities');
    await refreshPlans(['plan_participants', 'plan_activity', 'wallet_expenses', 'wallet_expense_participants']);
    return rpcResult;
  }, [plans, resolveUserUuid, dbPlanParticipants, refreshPlans]);

  /**
   * Atomically moves a participant from GOING to WAITLIST and decreases plan capacity by 1.
   */
  const moveParticipantToWaitlistAndDecreaseCapacity = useCallback(async (
    planId: string,
    targetUserId: string
  ) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const resolvedTargetUuid = resolveUserUuid(targetUserId);

    if (!planUuid || !resolvedTargetUuid) {
      console.error("[moveParticipantToWaitlistAndDecreaseCapacity] Missing plan or target participant ID");
      throw new Error("Cannot move participant to waitlist: missing ID");
    }

    const { data: rpcResult, error: rpcError } = await (supabase as any)
      .rpc('move_participant_to_waitlist_and_decrease_capacity', {
        p_plan_id: planUuid,
        p_target_user_id: resolvedTargetUuid,
      });

    if (rpcError) {
      console.error('[moveParticipantToWaitlistAndDecreaseCapacity] RPC error:', rpcError);
      throw rpcError;
    }

    invalidatePlanCache(planUuid, 'activities');
    await refreshPlans(['plans', 'plan_participants', 'plan_activity', 'wallet_expenses', 'wallet_expense_participants']);
    return rpcResult;
  }, [plans, resolveUserUuid, refreshPlans]);

  return {
    joinPlan,
    leavePlan,
    skipPlan,
    requestPaidPlanLeave,
    cancelPaidPlanLeaveRequest,
    resolvePaidPlanLeaveRequest,
    replaceParticipant,
    moveParticipantToWaitlistAndDecreaseCapacity,
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
    swapParticipants,
    removeAndReplaceWithWaitlist,
    reorderWaitlist
  };
}
