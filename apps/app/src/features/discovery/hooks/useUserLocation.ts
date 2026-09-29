import { useState, useEffect, useCallback } from "react";

export interface UserCoordinates {
  latitude: number;
  longitude: number;
}

export interface DiscoveryLocation {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  city?: string;
  locality?: string;
}

// Fallback center: Bangalore (India's major hub)
export const DEFAULT_DISCOVERY_COORDINATES: UserCoordinates = {
  latitude: 12.9716,
  longitude: 77.5946,
};

export const DEFAULT_DISCOVERY_LOCATION: DiscoveryLocation = {
  name: "Bengaluru",
  address: "Bengaluru, Karnataka, India",
  latitude: 12.9716,
  longitude: 77.5946,
  city: "Bengaluru",
  locality: "Nearby",
};

const STORAGE_KEY = "planless_selected_discovery_loc";

// Module-level shared location state and subscriber set
let inMemoryLocation: DiscoveryLocation = (() => {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (
          parsed &&
          typeof parsed.latitude === "number" &&
          !isNaN(parsed.latitude) &&
          typeof parsed.longitude === "number" &&
          !isNaN(parsed.longitude)
        ) {
          return {
            name: parsed.name || parsed.city || "Bengaluru",
            address: parsed.address || "",
            latitude: Number(parsed.latitude),
            longitude: Number(parsed.longitude),
            city: parsed.city || parsed.name || "Bengaluru",
            locality: parsed.locality || "Nearby",
          };
        }
      }
    } catch {}
  }
  return DEFAULT_DISCOVERY_LOCATION;
})();

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error("[useUserLocation] Listener notification error:", err);
    }
  });
}

/**
 * Synchronously retrieves the current single source of truth Discovery Location.
 * Can be called anywhere (inside or outside React) for distance calculation.
 */
export function getStoredDiscoveryLocation(): DiscoveryLocation {
  return inMemoryLocation;
}

/**
 * Updates the single source of truth Discovery Location.
 * Persists to localStorage and sessionStorage, and notifies all active components.
 */
export function setStoredDiscoveryLocation(location: DiscoveryLocation): void {
  if (
    !location ||
    typeof location.latitude !== "number" ||
    isNaN(location.latitude) ||
    typeof location.longitude !== "number" ||
    isNaN(location.longitude)
  ) {
    console.warn("[useUserLocation] Attempted to set invalid discovery location:", location);
    return;
  }

  const normalized: DiscoveryLocation = {
    name: location.name || location.city || "Bengaluru",
    address: location.address || "",
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    city: location.city || location.name || "Bengaluru",
    locality: location.locality || "Nearby",
  };

  inMemoryLocation = normalized;

  if (typeof window !== "undefined") {
    try {
      const serialized = JSON.stringify(normalized);
      localStorage.setItem(STORAGE_KEY, serialized);
      sessionStorage.setItem(STORAGE_KEY, serialized);
    } catch {}
  }

  notifyListeners();
}

/**
 * Hook providing access to the current Discovery location.
 * Subscribes to changes so all discovery screens remain in sync.
 *
 * NOTE: Does NOT invoke background browser GPS on mount.
 * Device GPS is only triggered when the user explicitly chooses "Use my current location".
 */
export function useUserLocation() {
  const [currentLocation, setCurrentLocation] = useState<DiscoveryLocation>(() => getStoredDiscoveryLocation());

  useEffect(() => {
    const handleUpdate = () => {
      setCurrentLocation(getStoredDiscoveryLocation());
    };

    listeners.add(handleUpdate);
    // Ensure we have the latest value upon mounting
    handleUpdate();

    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  const setLocation = useCallback((location: DiscoveryLocation) => {
    setStoredDiscoveryLocation(location);
  }, []);

  const coordinates: UserCoordinates = {
    latitude: currentLocation.latitude,
    longitude: currentLocation.longitude,
  };

  const cityName = currentLocation.city || currentLocation.name || "Bengaluru";
  const localityName = currentLocation.locality || "Nearby";

  return {
    discoveryLocation: currentLocation,
    coordinates,
    cityName,
    localityName,
    hasResolvedLocation: true,
    locationPermissionDenied: false,
    setDiscoveryLocation: setLocation,
  };
}
