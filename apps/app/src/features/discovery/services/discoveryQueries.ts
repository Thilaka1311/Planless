import { supabase } from "../../../../lib/supabaseClient";

/**
 * @deprecated Legacy database sections query.
 * Discovery sections are now fetched via Google Places Edge Function.
 */
export async function fetchActiveSectionsWithItems() {
  return [];
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
 * Searches curated database places from discovery_place_overrides.
 * Queries across name, address, description, and subcategory.
 */
export async function searchDiscoveryItems(params: SearchDbItemsParams) {
  const { query, category = "ALL" } = params;
  const trimmed = query.trim();
  if (!trimmed) return [];

  let queryBuilder = (supabase as any)
    .from("discovery_place_overrides")
    .select("*")
    .eq("is_deleted", false);

  if (category && category.toUpperCase() !== "ALL") {
    const cat = category.toUpperCase();
    if (cat === "ACTIVITIES") {
      queryBuilder = queryBuilder.or("category_override.eq.ACTIVITIES,category_override.eq.CUSTOM");
    } else {
      queryBuilder = queryBuilder.eq("category_override", cat);
    }
  }

  // Multi-term search across name_override, address_override, description_override, subcategory
  const terms = trimmed.split(/\s+/).filter(Boolean);
  for (const term of terms) {
    const clean = term.replace(/[%_,()]/g, "");
    if (!clean) continue;
    queryBuilder = queryBuilder.or(
      `name_override.ilike.%${clean}%,address_override.ilike.%${clean}%,description_override.ilike.%${clean}%,subcategory.ilike.%${clean}%`
    );
  }

  let promise = queryBuilder;
  if (queryBuilder && typeof queryBuilder.order === "function") {
    promise = queryBuilder.order("created_at", { ascending: false });
  }
  const { data, error } = await promise;
  if (error) {
    console.error("[discoveryQueries] searchDiscoveryItems error:", error);
    return [];
  }
  return (data || []).map((d: any) => ({
    place_id: d.place_id || d.id,
    id: d.place_id || d.id,
    title: d.name_override || d.title || "Place",
    name: d.name_override || d.title || "Place",
    category: d.category_override || d.category || "ALL",
    subcategory: d.subcategory || "",
    description: d.description_override || d.description || "",
    latitude: d.latitude_override ?? d.latitude,
    longitude: d.longitude_override ?? d.longitude,
    place_address: d.address_override || d.place_address || d.location || "",
    location: d.address_override || d.place_address || d.location || "",
    rating: d.rating ?? 4.5,
    user_ratings_total: d.user_ratings_total ?? 10,
    cover_image_url: d.image_path || d.cover_image_url || null,
    status: "ACTIVE",
  }));
}

