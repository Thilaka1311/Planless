import { supabase } from "../../../../lib/supabaseClient";

export async function getCurrentUserPlans(activeUserUuid: string): Promise<any[]> {
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

  // Phase 2 - Fetch Plans
  const { data: plansData, error: plansError } = await supabase
    .from("plans")
    .select(`
      *,
      discovery_items(category, subcategory, cover_image_url)
    `)
    .in("id", allPlanIds);

  if (plansError) throw plansError;

  const plans = plansData || [];

  // Phase 3 - Fetch Participants
  const { data: participantsData, error: participantsError } = await supabase
    .from("plan_participants")
    .select(`
      *,
      user_profile:users(id, public_id, full_name, profile_photo_path)
    `)
    .in("plan_id", allPlanIds);

  if (participantsError) throw participantsError;

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
  const { data, error } = await supabase
    .from("plans")
    .insert(newDbPlan)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createPlanInvite(planId: string, inviteToken: string, createdBy: string): Promise<void> {
  const { error } = await supabase
    .from("plan_invites")
    .insert({
      plan_id: planId,
      invite_token: inviteToken,
      created_by: createdBy,
      is_active: true
    });

  if (error) throw error;
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
  const { data, error } = await supabase
    .from("memories")
    .select("*");

  if (error) throw error;
  return (data || []) as any[];
}

export async function updatePlanDetails(planId: string, updates: any): Promise<any> {
  const { data, error } = await supabase
    .from("plans")
    .update(updates)
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
  return data;
}

/**
 * Invokes request_host_leave_with_replacement SECURITY DEFINER RPC in PostgreSQL.
 * Atomically promotes a joined participant to HOST and creates a leave request / executes leave for the current host.
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
    max_participants?: number;
  }
): Promise<any> {
  if (settings.max_participants !== undefined) {
    await updatePlanCapacityRPC(planId, settings.max_participants);
  }

  const remainingSettings: any = { ...settings };
  delete remainingSettings.max_participants;

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
  const { data, error } = await supabase.rpc("invite_participants" as any, {
    p_plan_id: planId,
    p_invitee_user_ids: inviteeUserIds,
    p_assigned_group: assignedGroup || null
  });

  if (error) throw error;
  return data;
}

/**
 * Invokes the promote_to_host SECURITY DEFINER RPC.
 * Authorized for any Host (role = 'HOST' or plans.host_id).
 * Updates plan_participants.role to 'HOST'.
 */
export async function promoteToHostRPC(
  planId: string,
  targetUserId: string
): Promise<any> {
  const { data, error } = await supabase.rpc("promote_to_host" as any, {
    p_plan_id: planId,
    p_target_user_id: targetUserId,
  });

  if (error) throw error;
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
 * Updates max_participants on a plan.
 */
export async function updatePlanCapacityRPC(
  planId: string,
  maxParticipants: number
): Promise<any> {
  const { data, error } = await supabase.rpc("update_plan_capacity" as any, {
    p_plan_id: planId,
    p_max_participants: maxParticipants
  });

  if (error) {
    console.error("[updatePlanCapacityRPC] Supabase RPC error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      planId,
      maxParticipants,
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
export async function cancelPlanRPC(planId: string): Promise<any> {
  const { data, error } = await supabase.rpc("cancel_plan" as any, {
    p_plan_id: planId
  });

  if (error) throw error;
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