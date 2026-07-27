import { supabase } from "../../../../lib/supabaseClient";

/**
 * Recalculates wallet split expenses for a plan, directly via Supabase.
 *
 * Ported from the Express /api/db/recalculate-wallet route which called
 * recalculatePlanParticipantsCosts(). All business logic is preserved exactly.
 *
 * Steps:
 *  1. Fetch plan (total_cost, host_id, max_participants)
 *  2. Compute share = ceil(total_cost / max_participants)
 *  3. Clear all cost_per_participant, then set it for JOINED participants
 *  4. Sync wallet_expenses rows: delete stale, upsert active non-host participants
 */
export const recalculateWalletExpenses = async (planUuid: string): Promise<void> => {
  try {
    const db = supabase as any;

    // 1. Fetch plan details
    const { data: plan, error: planErr } = await db
      .from("plans")
      .select("total_cost, host_id, max_participants")
      .eq("id", planUuid)
      .single();

    if (planErr || !plan) {
      console.error("[recalculateWalletExpenses] Plan not found:", planUuid, planErr);
      return;
    }

    const totalCost = Number(plan.total_cost || 0);
    const hostUuid = plan.host_id;
    const divisor = plan.max_participants > 0 ? plan.max_participants : 1;
    const shareAmount = totalCost <= 0 ? 0 : Math.round((totalCost / divisor) * 100) / 100;

    // Small delay to let the preceding write commit before we read participants
    await new Promise(r => setTimeout(r, 80));

    // 2. Fetch all plan participants
    const { data: participants, error: ppErr } = await db
      .from("plan_participants")
      .select("user_id, rsvp_status, circle_id")
      .eq("plan_id", planUuid);

    if (ppErr || !participants) {
      console.error("[recalculateWalletExpenses] Failed to fetch participants:", ppErr);
      return;
    }

    // 3a. Clear all cost_per_participant
    await db
      .from("plan_participants")
      .update({ cost_per_participant: null })
      .eq("plan_id", planUuid);

    // 3b. Set cost_per_participant for JOINED participants
    await db
      .from("plan_participants")
      .update({ cost_per_participant: shareAmount })
      .eq("plan_id", planUuid)
      .in("rsvp_status", ["JOINED"]);

    // 4. Sync wallet_expenses
    if (totalCost <= 0) {
      // No cost — remove all expense rows for this plan
      await db.from("wallet_expenses").delete().eq("plan_id", planUuid);
      return;
    }

    // Re-fetch participants with updated cost_per_participant
    const { data: freshParticipants } = await db
      .from("plan_participants")
      .select("user_id, cost_per_participant, rsvp_status, circle_id")
      .eq("plan_id", planUuid);

    if (!freshParticipants) return;

    // Non-host joined participants are the ones who owe the host
    const joinedNonHosts = (freshParticipants as any[]).filter(p => {
      const status = String(p.rsvp_status || "").toUpperCase();
      return status === "JOINED" && p.user_id !== hostUuid;
    });

    const activeParticipantUuids = joinedNonHosts.map((p: any) => p.user_id);

    // Remove expense rows for participants who are no longer active
    if (activeParticipantUuids.length > 0) {
      await db
        .from("wallet_expenses")
        .delete()
        .eq("plan_id", planUuid)
        .filter("sender_id", "not.in", `(${activeParticipantUuids.join(",")})`);
    } else {
      await db.from("wallet_expenses").delete().eq("plan_id", planUuid);
    }

    // Upsert expense rows for each active non-host participant
    for (const participant of joinedNonHosts) {
      const actualShare = Number(participant.cost_per_participant || 0);
      if (actualShare <= 0) continue;

      const { data: existing } = await db
        .from("wallet_expenses")
        .select("id")
        .eq("plan_id", planUuid)
        .eq("sender_id", participant.user_id);

      if (existing && existing.length > 0) {
        await db
          .from("wallet_expenses")
          .update({
            cost_per_participant: actualShare,
            rsvp_status: participant.rsvp_status,
            circle_id: participant.circle_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing[0].id);
      } else if (hostUuid) {
        await db.from("wallet_expenses").insert({
          plan_id: planUuid,
          circle_id: participant.circle_id || null,
          sender_id: participant.user_id,
          receiver_id: hostUuid,
          cost_per_participant: actualShare,
          rsvp_status: participant.rsvp_status,
          status: "PENDING",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.error("[recalculateWalletExpenses] Failed:", err);
  }
};
