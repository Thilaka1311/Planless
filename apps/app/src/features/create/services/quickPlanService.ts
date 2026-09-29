import { supabase } from "../../../../lib/supabaseClient";
import { QuickPlan, DbQuickPlanParticipant, QuickPlanList } from "../../../core/types";

const QUICK_PLANS_CACHE_PREFIX = "planless_quick_plans_";
const QUICK_PLAN_LISTS_CACHE_PREFIX = "planless_quick_plan_lists_";
export const QUICK_PLANS_UPDATED_EVENT = "planless_quick_plans_updated";

/**
 * Synchronous cache-first retrieval of quick plans from localStorage to guarantee zero-loading flash.
 */
export function getCachedQuickPlans(userId: string): QuickPlan[] {
  if (typeof window === "undefined" || !window.localStorage || !userId) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(`${QUICK_PLANS_CACHE_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("[quickPlanService] Failed reading cached quick plans:", err);
    return [];
  }
}

/**
 * Persists quick plans to local cache.
 */
export function saveCachedQuickPlans(userId: string, plans: QuickPlan[]): void {
  if (typeof window === "undefined" || !window.localStorage || !userId) return;
  try {
    window.localStorage.setItem(
      `${QUICK_PLANS_CACHE_PREFIX}${userId}`,
      JSON.stringify(plans)
    );
  } catch (err) {
    console.warn("[quickPlanService] Failed writing cached quick plans:", err);
  }
}

/**
 * Synchronous cache-first retrieval of quick plan lists from localStorage.
 */
export function getCachedQuickPlanLists(userId: string): QuickPlanList[] {
  if (typeof window === "undefined" || !window.localStorage || !userId) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(`${QUICK_PLAN_LISTS_CACHE_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("[quickPlanService] Failed reading cached quick plan lists:", err);
    return [];
  }
}

/**
 * Persists quick plan lists to local cache.
 */
export function saveCachedQuickPlanLists(userId: string, lists: QuickPlanList[]): void {
  if (typeof window === "undefined" || !window.localStorage || !userId) return;
  try {
    window.localStorage.setItem(
      `${QUICK_PLAN_LISTS_CACHE_PREFIX}${userId}`,
      JSON.stringify(lists)
    );
  } catch (err) {
    console.warn("[quickPlanService] Failed writing cached quick plan lists:", err);
  }
}

/**
 * Fetches the user's quick plan lists from Supabase and synchronizes the local cache.
 */
export async function fetchUserQuickPlanLists(userId: string): Promise<QuickPlanList[]> {
  if (!userId) return [];

  try {
    const { data, error } = await supabase
      .from("quick_plan_lists")
      .select(`
        *,
        quick_plans(id)
      `)
      .eq("creator_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("[quickPlanService] Error fetching quick plan lists from Supabase:", error);
      return getCachedQuickPlanLists(userId);
    }

    const cachedPlans = getCachedQuickPlans(userId);
    const planCountByList = cachedPlans.reduce((acc: Record<string, number>, p) => {
      if (p.quick_plan_list_id) {
        acc[p.quick_plan_list_id] = (acc[p.quick_plan_list_id] || 0) + 1;
      }
      return acc;
    }, {});

    const items: QuickPlanList[] = (data || []).map((row: any) => ({
      id: row.id,
      creator_id: row.creator_id,
      name: row.name,
      description: row.description,
      created_at: row.created_at,
      updated_at: row.updated_at,
      quick_plans_count: Array.isArray(row.quick_plans)
        ? row.quick_plans.length
        : (planCountByList[row.id] ?? 0),
    }));

    saveCachedQuickPlanLists(userId, items);
    return items;
  } catch (err) {
    console.warn("[quickPlanService] Unexpected error syncing quick plan lists:", err);
    return getCachedQuickPlanLists(userId);
  }
}

/**
 * Fetches the user's quick plans from Supabase and synchronizes the local cache.
 */
export async function fetchUserQuickPlans(userId: string): Promise<QuickPlan[]> {
  if (!userId) return [];

  try {
    const { data, error } = await supabase
      .from("quick_plans")
      .select(`
        *,
        participants:quick_plan_participants(
          id,
          quick_plan_id,
          user_id,
          created_at,
          user_profile:users(id, public_id, full_name, profile_photo_path, bio)
        )
      `)
      .eq("creator_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[quickPlanService] Error fetching quick plans from Supabase:", error);
      return getCachedQuickPlans(userId);
    }

    const items: QuickPlan[] = (data || []).map((row: any) => ({
      id: row.id,
      creator_id: row.creator_id,
      quick_plan_list_id: row.quick_plan_list_id || null,
      name: row.name,
      description: row.description,
      category: row.category,
      subcategory: row.subcategory,
      place_id: row.place_id,
      place_name: row.place_name || "",
      place_address: row.place_address || "",
      latitude: row.latitude,
      longitude: row.longitude,
      cover_image: row.cover_image,
      default_cost: Number(row.default_cost || 0),
      plan_size: row.plan_size,
      created_at: row.created_at,
      updated_at: row.updated_at,
      participants: row.participants || [],
    }));

    saveCachedQuickPlans(userId, items);

    // Sync quick plan counts into cached lists if lists exist
    const cachedLists = getCachedQuickPlanLists(userId);
    if (cachedLists.length > 0) {
      const counts: Record<string, number> = {};
      items.forEach((p) => {
        if (p.quick_plan_list_id) {
          counts[p.quick_plan_list_id] = (counts[p.quick_plan_list_id] || 0) + 1;
        }
      });
      const updatedLists = cachedLists.map((l) => ({
        ...l,
        quick_plans_count: counts[l.id] ?? 0,
      }));
      saveCachedQuickPlanLists(userId, updatedLists);
    }

    return items;
  } catch (err) {
    console.warn("[quickPlanService] Unexpected error syncing quick plans:", err);
    return getCachedQuickPlans(userId);
  }
}

export interface CreateQuickPlanListInput {
  creator_id: string;
  name: string;
  description?: string | null;
}

/**
 * Creates a new Quick Plan List.
 */
export async function createQuickPlanList(input: CreateQuickPlanListInput): Promise<QuickPlanList> {
  const insertPayload = {
    creator_id: input.creator_id,
    name: input.name.trim(),
    description: input.description || null,
  };

  const { data, error } = await supabase
    .from("quick_plan_lists")
    .insert([insertPayload])
    .select()
    .single();

  if (error) {
    console.error("[quickPlanService] Failed creating quick_plan_list:", error);
    throw error;
  }

  const newList: QuickPlanList = {
    ...data,
    quick_plans_count: 0,
  };

  const existing = getCachedQuickPlanLists(input.creator_id);
  const updated = [...existing, newList];
  saveCachedQuickPlanLists(input.creator_id, updated);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(QUICK_PLANS_UPDATED_EVENT));
  }

  return newList;
}

/**
 * Updates a Quick Plan List's name or description.
 */
export async function updateQuickPlanList(
  listId: string,
  userId: string,
  updates: { name?: string; description?: string | null }
): Promise<QuickPlanList> {
  const updatePayload: { name?: string; description?: string | null; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (updates.name !== undefined) updatePayload.name = updates.name.trim();
  if (updates.description !== undefined) updatePayload.description = updates.description;

  const { data, error } = await supabase
    .from("quick_plan_lists")
    .update(updatePayload)
    .eq("id", listId)
    .eq("creator_id", userId)
    .select()
    .single();

  if (error) {
    console.error("[quickPlanService] Failed updating quick_plan_list:", error);
    throw error;
  }

  const existing = getCachedQuickPlanLists(userId);
  const updated = existing.map((l) => (l.id === listId ? { ...l, ...data } : l));
  saveCachedQuickPlanLists(userId, updated);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(QUICK_PLANS_UPDATED_EVENT));
  }

  return {
    ...data,
    quick_plans_count: existing.find((l) => l.id === listId)?.quick_plans_count ?? 0,
  };
}

/**
 * Deletes a Quick Plan List and cascades to its quick plans.
 */
export async function deleteQuickPlanList(listId: string, userId: string): Promise<void> {
  if (!listId || !userId) return;

  const { error } = await supabase
    .from("quick_plan_lists")
    .delete()
    .eq("id", listId)
    .eq("creator_id", userId);

  if (error) {
    console.error("[quickPlanService] Failed deleting quick_plan_list:", error);
    throw error;
  }

  // Update local lists cache
  const existingLists = getCachedQuickPlanLists(userId);
  saveCachedQuickPlanLists(userId, existingLists.filter((l) => l.id !== listId));

  // Purge any child plans belonging to this list from cached quick plans
  const existingPlans = getCachedQuickPlans(userId);
  const remainingPlans = existingPlans.filter((p) => p.quick_plan_list_id !== listId);
  saveCachedQuickPlans(userId, remainingPlans);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(QUICK_PLANS_UPDATED_EVENT));
  }
}

export interface CreateQuickPlanInput {
  creator_id: string;
  quick_plan_list_id?: string | null;
  name: string;
  description?: string | null;
  category: string;
  subcategory?: string | null;
  place_id?: string | null;
  place_name: string;
  place_address: string;
  latitude?: number | null;
  longitude?: number | null;
  cover_image?: string | null;
  default_cost?: number;
  plan_size?: number | null;
}

/**
 * Creates a new Quick Plan in Supabase and persists its invited participants.
 */
export async function createQuickPlan(
  input: CreateQuickPlanInput,
  participantUserIds: string[] = []
): Promise<QuickPlan> {
  const insertPayload = {
    creator_id: input.creator_id,
    quick_plan_list_id: input.quick_plan_list_id || null,
    name: input.name.trim(),
    description: input.description || null,
    category: (input.category || "CUSTOM").toUpperCase(),
    subcategory: input.subcategory ? input.subcategory.toUpperCase() : "OTHER",
    place_id: input.place_id || null,
    place_name: input.place_name || "",
    place_address: input.place_address || "",
    latitude: input.latitude || null,
    longitude: input.longitude || null,
    cover_image: input.cover_image || null,
    default_cost: Math.max(0, Number(input.default_cost || 0)),
    plan_size: input.plan_size !== undefined && input.plan_size !== null ? Number(input.plan_size) : null,
  };

  const { data: qpData, error: qpError } = await supabase
    .from("quick_plans")
    .insert([insertPayload])
    .select()
    .single();

  if (qpError) {
    console.error("[quickPlanService] Failed creating quick_plan:", qpError);
    throw qpError;
  }

  let resolvedParticipants: DbQuickPlanParticipant[] = [];

  const uniqueUserIds = Array.from(new Set(participantUserIds)).filter(Boolean);
  if (uniqueUserIds.length > 0) {
    const participantRows = uniqueUserIds.map((uid) => ({
      quick_plan_id: qpData.id,
      user_id: uid,
    }));

    const { data: partData, error: partError } = await supabase
      .from("quick_plan_participants")
      .insert(participantRows)
      .select(`
        id,
        quick_plan_id,
        user_id,
        created_at,
        user_profile:users(id, public_id, full_name, profile_photo_path, bio)
      `);

    if (partError) {
      console.warn("[quickPlanService] Non-fatal: failed adding participants:", partError);
    } else {
      resolvedParticipants = partData || [];
    }
  }

  const newQuickPlan: QuickPlan = {
    ...qpData,
    quick_plan_list_id: qpData.quick_plan_list_id || input.quick_plan_list_id || null,
    default_cost: Number(qpData.default_cost || 0),
    participants: resolvedParticipants,
  };

  // Synchronize local cache immediately
  const existingCached = getCachedQuickPlans(input.creator_id);
  const updatedList = [newQuickPlan, ...existingCached.filter((p) => p.id !== newQuickPlan.id)];
  saveCachedQuickPlans(input.creator_id, updatedList);

  // Increment list count in cached lists
  if (newQuickPlan.quick_plan_list_id) {
    const cachedLists = getCachedQuickPlanLists(input.creator_id);
    const updatedLists = cachedLists.map((l) =>
      l.id === newQuickPlan.quick_plan_list_id
        ? { ...l, quick_plans_count: (l.quick_plans_count || 0) + 1 }
        : l
    );
    saveCachedQuickPlanLists(input.creator_id, updatedLists);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(QUICK_PLANS_UPDATED_EVENT));
  }

  return newQuickPlan;
}

/**
 * Deletes a Quick Plan and purges it from local cache.
 */
export async function deleteQuickPlan(quickPlanId: string, userId: string): Promise<void> {
  if (!quickPlanId || !userId) return;

  const existingCached = getCachedQuickPlans(userId);
  const planToDelete = existingCached.find((p) => p.id === quickPlanId);

  const { error } = await supabase
    .from("quick_plans")
    .delete()
    .eq("id", quickPlanId)
    .eq("creator_id", userId);

  if (error) {
    console.error("[quickPlanService] Failed deleting quick_plan:", error);
    throw error;
  }

  // Update local cache
  const updatedList = existingCached.filter((p) => p.id !== quickPlanId);
  saveCachedQuickPlans(userId, updatedList);

  // Decrement list count in cached lists
  if (planToDelete?.quick_plan_list_id) {
    const cachedLists = getCachedQuickPlanLists(userId);
    const updatedLists = cachedLists.map((l) =>
      l.id === planToDelete.quick_plan_list_id
        ? { ...l, quick_plans_count: Math.max(0, (l.quick_plans_count || 0) - 1) }
        : l
    );
    saveCachedQuickPlanLists(userId, updatedLists);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(QUICK_PLANS_UPDATED_EVENT));
  }
}
