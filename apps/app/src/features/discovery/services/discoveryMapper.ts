import { DiscoverySection, DiscoveryItem } from "../../../core/types/discovery";

export function mapDbItemToFrontend(dbItem: any): DiscoveryItem {
  return {
    id: dbItem.id,
    public_id: dbItem.public_id,
    section_id: dbItem.section_id,
    title: dbItem.title,
    category: dbItem.category,
    subcategory: dbItem.subcategory || null,
    description: dbItem.description || null,
    cover_image_url: dbItem.cover_image_url || null,
    location: dbItem.location || null,
    suggested_duration_minutes: null,
    suggested_cost_amount: null,
    suggested_capacity: null,
    default_rsvp_offset_minutes: 60,
    display_order: Number(dbItem.display_order || 0),
    featured: false,
    status: dbItem.status,
    created_at: dbItem.created_at,
    updated_at: dbItem.updated_at,
    // Include extra properties like map coordinates/details if present
    ...({
      place_id: dbItem.place_id || null,
      place_name: dbItem.place_name || null,
      place_address: dbItem.place_address || null,
      latitude: dbItem.latitude != null ? Number(dbItem.latitude) : null,
      longitude: dbItem.longitude != null ? Number(dbItem.longitude) : null,
      rating: dbItem.rating != null ? Number(dbItem.rating) : null,
      user_ratings_total: dbItem.user_ratings_total != null ? Number(dbItem.user_ratings_total) : null,
    } as any)
  };
}

export function mapDbSectionToFrontend(dbSection: any): DiscoverySection {
  return {
    id: dbSection.id,
    public_id: dbSection.public_id,
    category: dbSection.category,
    title: dbSection.title,
    description: dbSection.description || null,
    display_order: Number(dbSection.display_order || 0),
    status: dbSection.status,
    created_at: dbSection.created_at,
    updated_at: dbSection.updated_at,
    items: Array.isArray(dbSection.discovery_items)
      ? dbSection.discovery_items.map(mapDbItemToFrontend)
      : []
  };
}

/**
 * Shared payload builder to format database writes (insert/update)
 * containing ONLY the columns present in the database table schema.
 */
export function buildDbItemPayload(payload: Record<string, any>, config: any): Record<string, any> {
  return {
    section_id: config.section_id,
    title: payload.title,
    category: config.category,
    subcategory: payload.subcategory || null,
    description: payload.description || null,
    cover_image_url: payload.cover_image_url || null,
    location: payload.location || null,
    display_order: payload.display_order != null ? Number(payload.display_order) : 0,
    status: payload.status || "ACTIVE",
    place_id: payload.place_id || null,
    place_name: payload.place_name || null,
    place_address: payload.place_address || null,
    latitude: payload.latitude != null ? Number(payload.latitude) : null,
    longitude: payload.longitude != null ? Number(payload.longitude) : null,
  };
}
