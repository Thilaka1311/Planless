import { supabase } from "../../../../lib/supabaseClient";

/**
 * Fetch active sections with nested active items, ordered by display_order.
 */
export async function fetchActiveSectionsWithItems() {
  const { data, error } = await (supabase as any)
    .from("discovery_sections")
    .select(`
      *,
      discovery_items (
        *
      )
    `)
    .eq("status", "ACTIVE")
    .eq("discovery_items.status", "ACTIVE")
    .order("display_order", { ascending: true })
    .order("display_order", { foreignTable: "discovery_items", ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Fetch all discovery items (active/inactive) ordered by created_at descending.
 */
export async function fetchAllItems() {
  const { data, error } = await (supabase as any)
    .from("discovery_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Create a new discovery item.
 */
export async function insertItem(record: Record<string, any>) {
  const { data, error } = await (supabase as any)
    .from("discovery_items")
    .insert([record])
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update an existing discovery item.
 */
export async function updateItem(id: string, record: Record<string, any>) {
  const { data, error } = await (supabase as any)
    .from("discovery_items")
    .update(record)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Soft-delete a discovery item.
 */
export async function deleteItem(id: string) {
  const { data, error } = await (supabase as any)
    .from("discovery_items")
    .update({ status: "INACTIVE" })
    .eq("id", id)
    .select();

  if (error) throw error;
  return data;
}

export interface SearchDbItemsParams {
  query: string;
  category?: string;
}

/**
 * Searches the entire discovery_items database table for matching places.
 * Queries across searchable fields: title, place_name, place_address, location, description, subcategory.
 * Respects category filtering (DINING, MOVIES, SPORTS, ACTIVITIES) without any geographic or local area restriction.
 */
export async function searchDiscoveryItems(params: SearchDbItemsParams) {
  const { query, category = "ALL" } = params;
  const trimmed = query.trim();
  if (!trimmed) return [];

  let queryBuilder = (supabase as any)
    .from("discovery_items")
    .select("*")
    .eq("status", "ACTIVE");

  if (category && category.toUpperCase() !== "ALL") {
    const cat = category.toUpperCase();
    if (cat === "ACTIVITIES") {
      queryBuilder = queryBuilder.or("category.eq.ACTIVITIES,category.eq.CUSTOM");
    } else {
      queryBuilder = queryBuilder.eq("category", cat);
    }
  }

  // Multi-term search across title, place_name, place_address, location, description, subcategory
  const terms = trimmed.split(/\s+/).filter(Boolean);
  for (const term of terms) {
    const clean = term.replace(/[%_,()]/g, "");
    if (!clean) continue;
    queryBuilder = queryBuilder.or(
      `title.ilike.%${clean}%,place_name.ilike.%${clean}%,place_address.ilike.%${clean}%,location.ilike.%${clean}%,description.ilike.%${clean}%,subcategory.ilike.%${clean}%`
    );
  }

  const { data, error } = await queryBuilder.order("display_order", { ascending: true });
  if (error) {
    console.error("[discoveryQueries] searchDiscoveryItems error:", error);
    throw error;
  }
  return data || [];
}

