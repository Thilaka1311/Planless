import { DiscoveryItem } from "../../../core/types/discovery";
import { usePlanlessSearch, UsePlanlessSearchProps, UsePlanlessSearchResult } from "../search";

export interface UsePlacesSearchProps extends UsePlanlessSearchProps {
  category: "DINING" | "MOVIES" | "SPORTS" | "ACTIVITIES" | "ALL";
  searchQuery: string;
  subCategoryFilter?: string;
  currentCoordinates?: { latitude: number; longitude: number };
  currentCity?: string;
  debounceMs?: number;
  enableEndlessCycling?: boolean;
}

export type UsePlacesSearchResult = UsePlanlessSearchResult;

/**
 * @deprecated Legacy search hook. Migrated to usePlanlessSearch from src/features/discovery/search.
 * Preserved for backwards compatibility with legacy tests and components.
 */
export function usePlacesSearch(props: UsePlacesSearchProps): UsePlacesSearchResult {
  return usePlanlessSearch({
    category: props.category,
    searchQuery: props.searchQuery,
    subCategoryFilter: props.subCategoryFilter,
    currentCoordinates: props.currentCoordinates,
    currentCity: props.currentCity,
    debounceMs: props.debounceMs,
    enableEndlessCycling: props.enableEndlessCycling,
  });
}
