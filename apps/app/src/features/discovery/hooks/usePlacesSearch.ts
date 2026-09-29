import { useState, useEffect, useRef } from "react";
import { DiscoveryItem } from "../../../core/types/discovery";
import { searchDiscoveryPlaces } from "../services/discoveryService";

export interface UsePlacesSearchProps {
  category: "DINING" | "SPORTS" | "ACTIVITIES";
  searchQuery: string;
  subCategoryFilter?: string;
  currentCoordinates?: { latitude: number; longitude: number };
  currentCity?: string;
  debounceMs?: number;
}

export interface UsePlacesSearchResult {
  isSearching: boolean;
  isLoading: boolean;
  isSearchLoading: boolean;
  searchResults: DiscoveryItem[];
  searchCoordinates: { latitude: number; longitude: number } | null;
  activeSearchCoordinates: { latitude: number; longitude: number } | null;
  resolvedLocationName: string | null;
  searchError: string | null;
}

export function usePlacesSearch({
  category,
  searchQuery,
  subCategoryFilter = "all",
  currentCoordinates,
  currentCity = "Bengaluru",
  debounceMs = 300,
}: UsePlacesSearchProps): UsePlacesSearchResult {
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery.trim());
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<DiscoveryItem[]>([]);
  const [searchCoordinates, setSearchCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [resolvedLocationName, setResolvedLocationName] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const requestCounterRef = useRef(0);

  // Debounce the input search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, debounceMs);
    return () => clearTimeout(handler);
  }, [searchQuery, debounceMs]);

  // Execute search whenever debouncedQuery or subCategoryFilter changes
  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults([]);
      setSearchCoordinates(null);
      setResolvedLocationName(null);
      setIsLoading(false);
      setSearchError(null);
      return;
    }

    const currentRequestId = ++requestCounterRef.current;
    setIsLoading(true);
    setSearchError(null);

    searchDiscoveryPlaces({
      category,
      query: debouncedQuery,
      subCategoryFilter,
      currentCoordinates,
      defaultCity: currentCity,
    })
      .then((res) => {
        // Discard if a newer search was initiated
        if (currentRequestId !== requestCounterRef.current) return;
        setSearchResults(res.items);
        setSearchCoordinates(res.searchCoordinates);
        setResolvedLocationName(res.resolvedLocationName);
        setIsLoading(false);
      })
      .catch((err) => {
        if (currentRequestId !== requestCounterRef.current) return;
        console.error(`[usePlacesSearch] Failed search for ${category} "${debouncedQuery}":`, err);
        setSearchError(err?.message || "Failed to search places.");
        setIsLoading(false);
      });
  }, [debouncedQuery, subCategoryFilter, category, currentCoordinates, currentCity]);

  return {
    isSearching: Boolean(searchQuery.trim()),
    isLoading: Boolean(searchQuery.trim()) && isLoading,
    isSearchLoading: Boolean(searchQuery.trim()) && isLoading,
    searchResults,
    searchCoordinates,
    activeSearchCoordinates: searchCoordinates,
    resolvedLocationName,
    searchError,
  };
}
