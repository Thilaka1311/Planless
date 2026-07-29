import { supabase } from "../../../../lib/supabaseClient";

export async function getCurrentUserPlans(activeUserUuid: string): Promise<any[]> {
  // Phase 1 - Query A: Fetch plans where host_id = activeUserUuid
  const { data: hostedData, error: hostedError } = await supabase
    .from("plans")
    .select("id")
    .eq("host_id", activeUserUuid);

  if (hostedError) throw hostedError;

  // Phase 1 - Query B: Fetch participant rows where user_id = activeUserUuid
  const { data: partData, error: partError } = await supabase
    .from("plan_participants")
    .select("plan_id, rsvp_status, skip_reason")
    .eq("user_id", activeUserUuid);

  if (partError) throw partError;

  // Phase 1 - Merge
  const hostedPlanIds = (hostedData || []).map(p => p.id);
  const participantPlanIds = (partData || []).map(p => p.plan_id);

  const allPlanIds = Array.from(new Set([...hostedPlanIds, ...participantPlanIds])).filter(Boolean);

  if (allPlanIds.length === 0) {
    return [];
  }

  // Phase 2 - Fetch Plans
  const { data: plansData, error: plansError } = await supabase
    .from("plans")
    .select(`
      *,
      host_profile:users!plans_host_id_fkey(id, public_id, full_name, profile_photo_path, bio),
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
      user_profile:users(id, public_id, full_name, profile_photo_path, bio)
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
 * Authorized for any Host (role IN ('HOST', 'CO_HOST') or plans.host_id).
 * Updates plan_participants.role to 'HOST'.
 */
export async function promoteToHostRPC(
  planId: string,
  targetUserId: string
): Promise<any> {
  const { data, error } = await supabase.rpc("promote_to_host" as any, {
    p_plan_id: planId,
    p_target_user_id: targetUserId
  });

  if (error) throw error;
  return data;
}

/**
 * Invokes the demote_from_host SECURITY DEFINER RPC.
 * Authorized for any Host (role IN ('HOST', 'CO_HOST') or plans.host_id).
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
 * Authorized for any Host (role IN ('HOST', 'CO_HOST') or plans.host_id).
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

  if (error) throw error;
  return data;
}

/**
 * Invokes the cancel_plan SECURITY DEFINER RPC.
 * Authorized for any Host (role IN ('HOST', 'CO_HOST') or plans.host_id).
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
 * Authorized for Creator Host or Additional Hosts (role IN ('HOST', 'CO_HOST')).
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




