import { DiscoveryItem } from "../../../core/types/discovery";
import { GeoPoint } from "../services/discoveryStreamService";
import {
  StreamSection,
  UseDiscoveryStreamProps,
  UseDiscoveryStreamResult,
  useDiscoveryStream,
  DISCOVERY_CARDS_PER_ROW,
  SPORTS_SECTION_TITLES,
  getDiscoverySectionTitle,
  createDistanceOrderedDiscoverySections,
} from "./useDiscoveryStream";

export type { StreamSection, GeoPoint };

export interface UseSportsStreamProps {
  initialItems?: DiscoveryItem[];
  currentCoordinates?: GeoPoint | null;
  currentCity?: string;
  initialBatchSize?: number;
}

export type UseSportsStreamResult = UseDiscoveryStreamResult;

export const SPORTS_CARDS_PER_ROW = DISCOVERY_CARDS_PER_ROW;

export { SPORTS_SECTION_TITLES };

export function getSportsSectionTitle(rowIndex: number): string {
  return getDiscoverySectionTitle("SPORTS", rowIndex);
}

export function createDistanceOrderedSportsSections(
  venues: DiscoveryItem[],
  originCoords?: GeoPoint | null,
  chunkSize = SPORTS_CARDS_PER_ROW,
  startingRowIndex = 0
): { sections: StreamSection[]; sortedVenues: DiscoveryItem[] } {
  return createDistanceOrderedDiscoverySections(
    "SPORTS",
    venues,
    originCoords,
    chunkSize,
    startingRowIndex
  );
}

export function useSportsStream(props: UseSportsStreamProps): UseSportsStreamResult {
  return useDiscoveryStream({
    ...props,
    category: "SPORTS",
  });
}
