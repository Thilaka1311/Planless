import { supabase } from "../../../../lib/supabaseClient";

/**
 * Recalculates wallet split expenses for a plan by calling the
 * `recalculate_wallet_expenses` SECURITY DEFINER Postgres RPC.
 *
 * Using an RPC is necessary because:
 *  - The RPC runs as SECURITY DEFINER, bypassing RLS for this specific
 *    recalculation, and applies the full atomic logic in one Postgres call.
 *
 * The RPC logic (normalized schema):
 *  1. Fetches plan (total_cost, host_id, max_participants, title)
 *  2. Clears then sets legacy cost_per_participant on plan_participants
 *  3. If no cost: removes plan-level wallet_expense (message_id IS NULL)
 *  4. Finds or creates one plan-level wallet_expense (payer = host)
 *  5. Updates total_amount if changed
 *  6. Removes wallet_expense_participants for users no longer JOINED
 *  7. Upserts wallet_expense_participants for all JOINED participants
 */
export const recalculateWalletExpenses = async (planUuid: string): Promise<void> => {
  try {
    const { error } = await (supabase as any).rpc("recalculate_wallet_expenses", {
      p_plan_id: planUuid,
    });

    if (error) {
      console.error("[recalculateWalletExpenses] RPC failed:", error);
    }
  } catch (err) {
    console.error("[recalculateWalletExpenses] Exception calling RPC:", err);
  }
};


