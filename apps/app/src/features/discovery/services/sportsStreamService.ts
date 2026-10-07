import { DiscoveryItem } from "../../../core/types/discovery";
import {
  fetchProgressiveDiscoveryBatch,
  SPORTS_PROGRESSION_QUERIES,
  GeoPoint,
  StreamBatchResult,
} from "./discoveryStreamService";

export { SPORTS_PROGRESSION_QUERIES };
export type { GeoPoint, StreamBatchResult };

export interface StreamBatchParams {
  originCoords: GeoPoint;
  city?: string;
  queryIndex: number;
  pageToken?: string | null;
  radiusMeters?: number;
  seenPlaceIds: Set<string>;
  minDistanceKm?: number;
  maxDistanceKm?: number;
}

/**
 * Fetches a single progressive batch of sports venues from Google Places
 * combined with matching database overrides, ordered by proximity.
 * Delegates to the unified progressive discovery stream service.
 */
export async function fetchProgressiveSportsBatch(
  params: StreamBatchParams
): Promise<StreamBatchResult> {
  return fetchProgressiveDiscoveryBatch({
    ...params,
    category: "SPORTS",
  });
}
