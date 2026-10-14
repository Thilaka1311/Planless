import { supabase } from "../../../../lib/supabaseClient";

export async function syncOverduePlansRPC(): Promise<void> {
  try {
    await (supabase.rpc as any)("sync_overdue_plans");
  } catch (err) {
    console.warn("[syncOverduePlansRPC] Non-blocking sync failed:", err);
  }
}

export async function getCurrentUserPlans(activeUserUuid: string): Promise<any[]> {
  // Non-blocking background sync: Postgres overdue status is synchronized in the background
  // without adding a blocking network round-trip to startup (PlansContext evaluates overdue in-memory).
  void syncOverduePlansRPC().catch((err) => {
    console.warn("[syncOverduePlansRPC] Non-blocking sync failed:", err);
  });

  // Phase 1: Fetch all plan IDs where user is a participant or host
  const { data: partData, error: partError } = await supabase
    .from("plan_participants")
    .select("plan_id, rsvp_status, skip_reason")
    .eq("user_id", activeUserUuid);

  if (partError) throw partError;

  const allPlanIds = Array.from(new Set((partData || []).map(p => p.plan_id))).filter(Boolean);

  if (allPlanIds.length === 0) {
    return [];
  }

  // Phase 2 & 3: Concurrently fetch independent Plan details and participant details
  const [
    { data: plansData, error: plansError },
    { data: participantsData, error: participantsError }
  ] = await Promise.all([
    supabase
      .from("plans")
      .select("*")
      .in("id", allPlanIds),
    supabase
      .from("plan_participants")
      .select(`
        *,
        user_profile:users(id, public_id, full_name, profile_photo_path, bio)
      `)
      .in("plan_id", allPlanIds)
  ]);

  if (plansError) throw plansError;
  if (participantsError) throw participantsError;

  const plans = plansData || [];
  const participants = participantsData || [];

  // Phase 4 - Merge
  const participantsByPlanId: Record<string, any[]> = {};
  participants.forEach(p => {
    if (!participantsByPlanId[p.plan_id]) {
      participantsByPlanId[p.plan_id] = [];
    }
    participantsByPlanId[p.plan_id].push(p);
  });

  return plans.map(plan => ({
    ...plan,
    plan_participants: participantsByPlanId[plan.id] || []
  }));
}

export async function createPlan(newDbPlan: any): Promise<any> {
  const { discovery_item_id, subcategory, ...planPayload } = newDbPlan;
  if (planPayload.plan_size === null || planPayload.plan_size === undefined) {
    planPayload.participant_filtering = null;
  }
  const { data, error } = await supabase
    .from("plans")
    .insert(planPayload)
    .select()
    .single();

  if (error) throw error;
  return data;
}



export async function upsertParticipants(records: any[]): Promise<any[]> {
  const { data, error } = await supabase
    .from("plan_participants")
    .upsert(records, { onConflict: "plan_id,user_id" })
    .select();

  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchMemories(): Promise<any[]> {
  // Obsolete prototype memories table removed; return empty list in-memory
  return [];
}

export async function updatePlanDetails(planId: string, updates: any): Promise<any> {
  const { discovery_item_id, subcategory, ...sanitizedUpdates } = updates;
  if (sanitizedUpdates.plan_size === null) {
    sanitizedUpdates.participant_filtering = null;
  }
  const { data, error } = await supabase
    .from("plans")
    .update(sanitizedUpdates)
    .eq("id", planId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getFreshParticipants(): Promise<any[]> {
  const { data, error } = await supabase
    .from("plan_participants")
    .select("*");

  if (error) throw error;
  return (data || []) as any[];
}

/**
 * Invokes the leave_plan SECURITY DEFINER RPC in PostgreSQL.
 * Atomically marks participant as SKIPPED with skip_reason = LEFT,
 * promotes the earliest waitlisted participant, and recalculates costs.
 */
export async function leavePlanRPC(planId: string): Promise<any> {
  const { data, error } = await supabase.rpc("leave_plan" as any, {
    p_plan_id: planId
  });

  if (error) throw error;

  if (data && data.success) {
    void (async () => {
      try {
        await supabase.functions.invoke("send-push", {
          body: {
            event: "PLAN_LEAVE",
            planId,
            actorId: data.user_id,
            previousStatus: "JOINED",
          },
        });
      } catch (pushErr) {
        console.warn("[leavePlanRPC] Push dispatch failed:", pushErr);
      }
    })();
  }

  return data;
}


/**
 * Invokes request_host_leave_with_replacement SECURITY DEFINER RPC in PostgreSQL.
 * Atomically promotes a joined participant to HOST and executes immediate leave for the current host without creating a leave request.
 */
export async function requestHostLeaveWithReplacementRPC(planId: string, replacementUserId: string): Promise<any> {
  const { data, error } = await supabase.rpc("request_host_leave_with_replacement" as any, {
    p_plan_id: planId,
    p_replacement_user_id: replacementUserId
  });

  if (error) throw error;
  return data;
}

export async function updatePlanSettingsInDb(
  planId: string,
  settings: {
    allow_participant_invites?: boolean;
    plan_size?: number;
  }
): Promise<any> {
  if (settings.plan_size !== undefined) {
    await updatePlanCapacityRPC(planId, settings.plan_size);
  }

  const remainingSettings: any = { ...settings };
  delete remainingSettings.plan_size;

  if (Object.keys(remainingSettings).length > 0) {
    const { data, error } = await supabase
      .from("plans")
      .update(remainingSettings)
      .eq("id", planId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
  return { success: true };
}

/**
 * Invokes the invite_participants SECURITY DEFINER RPC in PostgreSQL.
 * Atomically inserts or reactivates participants, enforcing plan_participants.role
 * and allow_participant_invites permission checks on the server.
 */
export async function inviteParticipantsRPC(
  planId: string,
  inviteeUserIds: string[],
  assignedGroup?: 'GOING' | 'WAITLIST' | null
): Promise<any> {
  const normalizedGroup = typeof assignedGroup === 'string' && (assignedGroup === 'GOING' || assignedGroup === 'WAITLIST')
    ? assignedGroup
    : null;

  const MAX_RETRIES = 3;
  let attempt = 0;
  let data: any = null;

  while (attempt < MAX_RETRIES) {
    attempt++;
    const { data: resData, error } = await supabase.rpc("invite_participants" as any, {
      p_plan_id: planId,
      p_invitee_user_ids: inviteeUserIds,
      p_assigned_group: normalizedGroup
    });

    if (error) {
      // Only retry transient concurrency conflicts: 40P01 (deadlock_detected) or 55P03 (lock_not_available)
      const isTransient = error.code === '40P01' || error.code === '55P03';
      if (isTransient && attempt < MAX_RETRIES) {
        const backoffMs = Math.min(250, 50 * Math.pow(2, attempt - 1) + Math.random() * 50);
        console.warn(`[inviteParticipantsRPC] Transient DB lock conflict (${error.code}). Retrying attempt ${attempt + 1}/${MAX_RETRIES} in ${Math.round(backoffMs)}ms...`);
        await new Promise((res) => setTimeout(res, backoffMs));
        continue;
      }
      throw error;
    }

    data = resData;
    break;
  }

  // Dispatch push notifications to invited participants (non-blocking, exactly once after success)
  if (Array.isArray(inviteeUserIds) && inviteeUserIds.length > 0) {
    void (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const inviterId = authData?.user?.id;
        const { data: pushRes, error: pushErr } = await supabase.functions.invoke("send-push", {
          body: {
            event: "PLAN_INVITATION",
            planId,
            userIds: inviteeUserIds,
            inviterId,
            appUrl: typeof window !== "undefined" ? window.location.origin : undefined,
          },
        });
        if (pushErr) {
          console.warn("[inviteParticipantsRPC] Push dispatch failed:", pushErr.message || pushErr);
        } else if (pushRes?.deliveredCount !== undefined) {
          console.log(`[inviteParticipantsRPC] Push delivered to ${pushRes.deliveredCount} devices.`);
        }
      } catch (pushErr) {
        console.warn("[inviteParticipantsRPC] Non-critical push delivery error:", pushErr);
      }
    })();
  }

  return data;
}

/**
 * Invokes the promote_to_host SECURITY DEFINER RPC.
 * Authorized for any Host (role = 'HOST' or plans.host_id).
 * Updates plan_participants.role to 'HOST'.
 */
export async function promoteToHostRPC(
  planId: string,
  targetUserId: string,
  customActorId?: string
): Promise<any> {
  let resolvedActorId = customActorId;
  if (!resolvedActorId) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      resolvedActorId = authData?.user?.id;
    } catch {
      // Fallback
    }
  }

  const { data, error } = await supabase.rpc("promote_to_host" as any, {
    p_plan_id: planId,
    p_target_user_id: targetUserId,
  });

  if (error) throw error;

  void (async () => {
    try {
      await supabase.functions.invoke("send-push", {
        body: {
          event: "HOST_ASSIGNED",
          planId,
          targetUserId,
          actorId: resolvedActorId,
        },
      });
    } catch (pushErr) {
      console.warn("[promoteToHostRPC] Push dispatch failed:", pushErr);
    }
  })();

  return data;
}

/**
 * Invokes the demote_from_host SECURITY DEFINER RPC.
 * Authorized for any Host (role = 'HOST' or plans.host_id).
 * Updates plan_participants.role back to 'PARTICIPANT'.
 */
export async function demoteFromHostRPC(
  planId: string,
  targetUserId: string
): Promise<any> {
  const { data, error } = await supabase.rpc("demote_from_host" as any, {
    p_plan_id: planId,
    p_target_user_id: targetUserId
  });

  if (error) throw error;
  return data;
}

/**
 * Invokes the update_plan_capacity SECURITY DEFINER RPC.
 * Authorized for any Host (role = 'HOST' or plans.host_id).
 * Updates plan_size (JOINED capacity) on a plan.
 */
export async function updatePlanCapacityRPC(
  planId: string,
  planSize: number,
  autoPromote?: boolean
): Promise<any> {
  const params: any = {
    p_plan_id: planId,
    p_plan_size: planSize,
  };
  if (autoPromote !== undefined) {
    params.p_auto_promote = autoPromote;
  }

  const { data, error } = await supabase.rpc("update_plan_capacity" as any, params);

  if (error) {
    console.error("[updatePlanCapacityRPC] Supabase RPC error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      planId,
      planSize,
      autoPromote,
    });
    throw error;
  }
  return data;
}

/**
 * Invokes the cancel_plan SECURITY DEFINER RPC.
 * Authorized for any Host (role = 'HOST' or plans.host_id).
 * Updates plans.status to 'CANCELLED'.
 */
export async function cancelPlanRPC(
  planId: string,
  customActorId?: string
): Promise<any> {
  let resolvedActorId = customActorId;
  if (!resolvedActorId) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      resolvedActorId = authData?.user?.id;
    } catch {
      // Fallback
    }
  }

  const { data, error } = await supabase.rpc("cancel_plan" as any, {
    p_plan_id: planId
  });

  if (error) throw error;

  void (async () => {
    try {
      await supabase.functions.invoke("send-push", {
        body: {
          event: "PLAN_CANCELLED",
          planId,
          actorId: resolvedActorId,
        },
      });
    } catch (pushErr) {
      console.warn("[cancelPlanRPC] Push dispatch failed:", pushErr);
    }
  })();

  return data;
}

/**
 * Invokes the remove_participant SECURITY DEFINER RPC.
 * Authorized for Creator Host or Additional Hosts (role = 'HOST').
 * Updates participant rsvp_status to 'SKIPPED' with skip_reason = 'REMOVED'.
 */
export async function removeParticipantRPC(
  planId: string,
  targetUserId: string
): Promise<any> {
  const { data, error } = await supabase.rpc("remove_participant" as any, {
    p_plan_id: planId,
    p_target_user_id: targetUserId
  });

  if (error) throw error;

  void (async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      await supabase.functions.invoke("send-push", {
        body: {
          event: "PARTICIPANT_REMOVED",
          planId,
          targetUserId,
          actorId: authData?.user?.id,
        },
      });
    } catch (pushErr) {
      console.warn("[removeParticipantRPC] Push dispatch failed:", pushErr);
    }
  })();

  return data;
}

/**
 * Invokes the join_plan SECURITY DEFINER RPC.
 * Atomically transitions an invited user (or link claimer) to JOINED or WAITLISTED.
 */
export async function joinPlanRPC(planId: string): Promise<any> {
  const { data, error } = await supabase.rpc("join_plan" as any, {
    p_plan_id: planId
  });

  if (error) throw error;

  if (data && data.success) {
    void (async () => {
      try {
        await supabase.functions.invoke("send-push", {
          body: {
            event: data.rsvp_status === "WAITLISTED" ? "WAITLIST_JOIN" : "PLAN_JOIN",
            planId,
            actorId: data.user_id,
            rsvpStatus: data.rsvp_status,
          },
        });
      } catch (pushErr) {
        console.warn("[joinPlanRPC] Push dispatch failed:", pushErr);
      }
    })();
  }

  return data;
}


/**
 * Invokes the rejoin_plan SECURITY DEFINER RPC.
 * Transition a skipped participant's status to 'REJOINED' awaiting host decision.
 */
export async function rejoinPlanRPC(
  planId: string
): Promise<any> {
  const { data, error } = await supabase.rpc("rejoin_plan" as any, {
    p_plan_id: planId
  });

  if (error) throw error;
  return data;
}

/**
 * Invokes the resolve_rejoined_participant SECURITY DEFINER RPC.
 * Authorized for any active Host.
 * Resolves a REJOINED participant via 'JOINED', 'WAITLISTED', or 'REMOVE'.
 */
export async function resolveRejoinedParticipantRPC(
  planId: string,
  targetUserId: string,
  decision: 'JOINED' | 'WAITLIST' | 'WAITLISTED' | 'REMOVE'
): Promise<any> {
  const { data, error } = await supabase.rpc("resolve_rejoined_participant" as any, {
    p_plan_id: planId,
    p_target_user_id: targetUserId,
    p_decision: decision
  });

  if (error) throw error;
  return data;
}

/**
 * Invokes the replace_participant SECURITY DEFINER RPC.
 * Authorized for any Host.
 * Atomically replaces a target participant with a replacement participant
 * without requiring an active leave request.
 */
export async function replaceParticipantRPC(
  planId: string,
  targetUserId: string,
  replacementUserId: string
): Promise<any> {
  const { data, error } = await supabase.rpc("replace_participant" as any, {
    p_plan_id: planId,
    p_target_user_id: targetUserId,
    p_replacement_user_id: replacementUserId,
  });

  if (error) throw error;
  return data;
}

/**
 * Invokes the move_participant_to_waitlist_and_decrease_capacity SECURITY DEFINER RPC.
 * Authorized for any Host.
 * Atomically moves a target participant from GOING to WAITLIST and decreases plan capacity by 1.
 */
export async function moveParticipantToWaitlistAndDecreaseCapacityRPC(
  planId: string,
  targetUserId: string
): Promise<any> {
  const { data, error } = await supabase.rpc("move_participant_to_waitlist_and_decrease_capacity" as any, {
    p_plan_id: planId,
    p_target_user_id: targetUserId,
  });

  if (error) throw error;
  return data;
}

/**
 * Invokes the complete_plan SECURITY DEFINER RPC.
 * Authorized only for the Plan Host.
 * Finalizes participant attendance and completes the plan.
 */
export async function completePlan(
  planId: string,
  attendanceInput: Array<{ user_id: string; attendance: 'ATTENDED' | 'DID_NOT_ATTEND' }>,
  expenseMode: 'SPLIT_ALL' | 'KEEP_CURRENT_COST' | 'NONE' = 'NONE'
): Promise<any> {
  const { data, error } = await supabase.rpc("complete_plan", {
    p_plan_id: planId,
    p_attendance_input: attendanceInput,
    p_expense_mode: expenseMode,
  });

  if (error) throw error;

  void (async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const attendingUserIds = attendanceInput
        .filter((a) => a.attendance === "ATTENDED")
        .map((a) => a.user_id);

      await supabase.functions.invoke("send-push", {
        body: {
          event: "PLAN_COMPLETED",
          planId,
          actorId: authData?.user?.id,
          attendingUserIds,
        },
      });
    } catch (pushErr) {
      console.warn("[completePlan] Push dispatch failed:", pushErr);
    }
  })();

  return data;
}


/**
 * Invokes the manage_completed_plan_participants SECURITY DEFINER RPC.
 * Authorized only for the Plan Host.
 * Adds or removes participants after a plan is already COMPLETED.
 */
export async function manageCompletedPlanParticipantsRPC(
  planId: string,
  usersToAdd: string[],
  usersToRemove: string[],
  expenseMode: 'SPLIT_ALL' | 'KEEP_CURRENT_COST' | 'NONE' = 'NONE'
): Promise<any> {
  const { data, error } = await (supabase.rpc as any)("manage_completed_plan_participants", {
    p_plan_id: planId,
    p_users_to_add: usersToAdd,
    p_users_to_remove: usersToRemove,
    p_expense_mode: expenseMode,
  });

  if (error) throw error;
  return data;
}

/**
 * Invokes the stop_hosting_with_replacement SECURITY DEFINER RPC.
 * Authorized for active Hosts.
 * Atomically promotes a joined participant to HOST and demotes the caller to PARTICIPANT,
 * keeping the caller in the plan without creating a leave request.
 */
export async function stopHostingWithReplacementRPC(
  planId: string,
  replacementUserId: string
): Promise<any> {
  const { data, error } = await (supabase.rpc as any)("stop_hosting_with_replacement", {
    p_plan_id: planId,
    p_replacement_user_id: replacementUserId,
  });

  if (error) throw error;
  return data;
}