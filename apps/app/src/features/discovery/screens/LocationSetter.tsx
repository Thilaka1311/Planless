import React, { useState } from "react";
import { ArrowLeft, MapPin, Navigation, Loader2, AlertCircle, Compass } from "lucide-react";
import { useGooglePlacesAutocomplete } from "../../../shared/hooks/useGooglePlacesAutocomplete";
import { SearchBar } from "../../../shared/components/SearchBar";

export interface DiscoveryLocation {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  city?: string;
  locality?: string;
}

export interface LocationSetterProps {
  currentCity?: string;
  currentLocality?: string;
  currentCoordinates?: { latitude: number; longitude: number };
  hasLocation?: boolean;
  onBack: () => void;
  onSelectLocation: (location: DiscoveryLocation) => void;
}

export const LocationSetter: React.FC<LocationSetterProps> = ({
  currentCity = "Bengaluru",
  currentLocality = "Nearby",
  currentCoordinates,
  hasLocation,
  onBack,
  onSelectLocation,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isResolvingPlaceId, setIsResolvingPlaceId] = useState<string | null>(null);
  const [isLocatingDevice, setIsLocatingDevice] = useState(false);
  const [deviceLocationError, setDeviceLocationError] = useState<string | null>(null);

  // Check if location is already set/available
  const isLocationAlreadySet =
    hasLocation !== undefined
      ? hasLocation
      : typeof window !== "undefined" &&
        Boolean(
          localStorage.getItem("planless_selected_discovery_loc") ||
          sessionStorage.getItem("planless_selected_discovery_loc")
        );

  // Reuse the exact same Google Places Autocomplete hook used across the app
  const {
    suggestions,
    isLoading: isAutocompleteLoading,
    error: autocompleteError,
    getPlaceDetails,
    reverseGeocode,
    clearSuggestions,
  } = useGooglePlacesAutocomplete(searchQuery);

  // ── Handle Place Selection from Google Places Suggestions ────────────────
  const handleSelectSuggestion = async (suggestion: typeof suggestions[0]) => {
    setIsResolvingPlaceId(suggestion.place_id);
    clearSuggestions();

    try {
      const details = await getPlaceDetails(suggestion.place_id);
      const lat = details?.geometry?.location?.lat;
      const lng = details?.geometry?.location?.lng;

      const mainText = suggestion.structured_formatting?.main_text || suggestion.description;
      const secondaryText = suggestion.structured_formatting?.secondary_text || "";

      // Extract city & locality from secondary text or main text
      let city = "Bengaluru";
      let locality = mainText;

      if (secondaryText) {
        const parts = secondaryText.split(",").map((p) => p.trim());
        if (parts.length > 0) {
          city = parts[0];
        }
      }

      // If coordinates are missing from details, use default fallback or best effort
      const resolvedLat = typeof lat === "number" ? lat : (currentCoordinates?.latitude || 12.9716);
      const resolvedLng = typeof lng === "number" ? lng : (currentCoordinates?.longitude || 77.5946);

      onSelectLocation({
        name: mainText,
        address: details?.formatted_address || suggestion.description,
        latitude: resolvedLat,
        longitude: resolvedLng,
        city: city || "Bengaluru",
        locality: locality || "Nearby",
      });
    } catch (err: any) {
      console.error("[LocationSetter] Failed to resolve place details:", err);
      // Fallback with best available info
      onSelectLocation({
        name: suggestion.structured_formatting?.main_text || suggestion.description,
        address: suggestion.description,
        latitude: currentCoordinates?.latitude || 12.9716,
        longitude: currentCoordinates?.longitude || 77.5946,
        city: "Bengaluru",
        locality: suggestion.structured_formatting?.main_text || "Nearby",
      });
    } finally {
      setIsResolvingPlaceId(null);
    }
  };

  // ── Handle "Use My Current Location" via Device GPS ──────────────────────
  const handleUseCurrentLocation = () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setDeviceLocationError("Geolocation is not supported by your browser.");
      return;
    }

    setIsLocatingDevice(true);
    setDeviceLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        try {
          // Reverse geocode using the existing Google Maps/Places infrastructure
          const resolved = await reverseGeocode(lat, lng);
          if (resolved) {
            onSelectLocation({
              name: resolved.name || resolved.locality || "Current Location",
              address: resolved.formatted_address,
              latitude: lat,
              longitude: lng,
              city: resolved.city,
              locality: resolved.locality,
            });
          } else {
            // Graceful fallback if reverse geocoding returned null
            onSelectLocation({
              name: "Current Location",
              address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
              latitude: lat,
              longitude: lng,
              city: "Bengaluru",
              locality: "Nearby",
            });
          }
        } catch (geocodeErr: any) {
          console.warn("[LocationSetter] Reverse geocoding failed, using raw coordinates:", geocodeErr);
          onSelectLocation({
            name: "Current Location",
            address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
            latitude: lat,
            longitude: lng,
            city: "Bengaluru",
            locality: "Nearby",
          });
        } finally {
          setIsLocatingDevice(false);
        }
      },
      (error) => {
        setIsLocatingDevice(false);
        if (error.code === error.PERMISSION_DENIED) {
          setDeviceLocationError("Location permission was denied. You can search for your area manually above.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setDeviceLocationError("Device location is currently unavailable. Please search manually.");
        } else if (error.code === error.TIMEOUT) {
          setDeviceLocationError("Location request timed out. Please try again or search manually.");
        } else {
          setDeviceLocationError("Unable to retrieve device location.");
        }
      },
      {
        timeout: 10000,
        enableHighAccuracy: true,
        maximumAge: 60000, // 1 minute max cached age
      }
    );
  };

  const showSuggestions = searchQuery.trim().length >= 3 && suggestions.length > 0;
  const showEmptySearch = searchQuery.trim().length >= 3 && !isAutocompleteLoading && suggestions.length === 0;

  return (
    <div
      className="flex-1 flex flex-col h-full bg-[#000000] overflow-y-auto no-scrollbar pb-12 text-left select-none"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* ── 1. Top Header Bar ── */}
      <div className="w-full shrink-0 px-4 pt-4 pb-2 flex items-center justify-between bg-[#000000]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-1 -ml-1 text-white hover:text-zinc-300 active:scale-95 transition flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-lg font-bold text-white tracking-tight leading-tight">
            Location
          </h1>
        </div>
      </div>

      {/* ── 2. Search Bar Connected to Google Places ── */}
      <div className="px-4 pt-2 pb-2 shrink-0">
        <SearchBar
          value={searchQuery}
          onChange={(val) => {
            setSearchQuery(val);
            if (!val) clearSuggestions();
          }}
          placeholder="Search city, area, or landmark..."
          autoFocus
        />

        {/* Autocomplete API Error Notification */}
        {autocompleteError && (
          <div className="mt-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-rose-400 text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{autocompleteError}</span>
          </div>
        )}
      </div>

      {/* ── 3. Search Suggestions List (when active) ── */}
      {showSuggestions && (
        <div className="px-4 pt-1 space-y-1">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1 py-1.5">
            Search Results
          </div>
          <div className="space-y-1">
            {suggestions.map((suggestion) => {
              const isResolving = isResolvingPlaceId === suggestion.place_id;
              const mainText = suggestion.structured_formatting?.main_text || suggestion.description;
              const subText = suggestion.structured_formatting?.secondary_text || "";

              return (
                <button
                  key={suggestion.place_id}
                  type="button"
                  disabled={isResolving}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className="w-full text-left p-3 rounded-2xl bg-[#0c0c0e] hover:bg-white/[0.06] active:bg-white/[0.1] border border-white/[0.05] transition flex items-center gap-3 cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-400 group-hover:text-[#FF6B2C] group-hover:bg-[#FF6B2C]/10 transition shrink-0">
                    {isResolving ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#FF6B2C]" />
                    ) : (
                      <MapPin className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white group-hover:text-white truncate">
                      {mainText}
                    </div>
                    {subText && (
                      <div className="text-xs text-zinc-400 truncate mt-0.5">
                        {subText}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 4. Empty Search State ── */}
      {showEmptySearch && (
        <div className="px-6 py-12 text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto text-zinc-500">
            <MapPin className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium text-white/90">
            No places found for &quot;{searchQuery}&quot;
          </p>
          <p className="text-xs text-zinc-400 max-w-xs mx-auto">
            Try searching for a different area, landmark, or city name.
          </p>
        </div>
      )}

      {/* ── 5. Standard Content (When Not Searching) ── */}
      {!searchQuery && (
        <div className="px-4 pt-1 space-y-4">
          {/* Device Location Action ("Use my current location") - only shown if user has NOT already given location */}
          {!isLocationAlreadySet && (
            <div className="space-y-2">
              <button
                type="button"
                disabled={isLocatingDevice}
                onClick={handleUseCurrentLocation}
                className="w-full text-left p-3.5 rounded-2xl bg-[#121216] hover:bg-[#18181e] active:scale-[0.99] border border-white/[0.08] hover:border-[#FF6B2C]/40 transition duration-200 flex items-center justify-between cursor-pointer group shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#FF6B2C]/10 border border-[#FF6B2C]/20 flex items-center justify-center text-[#FF6B2C] group-hover:scale-105 transition shrink-0">
                    {isLocatingDevice ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Navigation className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white group-hover:text-white truncate">
                      {isLocatingDevice ? "Detecting location..." : "Use my current location"}
                    </div>
                    <div className="text-xs text-zinc-400 truncate mt-0.5">
                      {isLocatingDevice
                        ? "Resolving coordinates and address..."
                        : "Find dining & sports around where you are now"}
                    </div>
                  </div>
                </div>
                <Compass className="w-4 h-4 text-zinc-500 group-hover:text-[#FF6B2C] transition shrink-0 ml-2" />
              </button>
            </div>
          )}

          {/* Permission denied / GPS error feedback */}
          {deviceLocationError && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-amber-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div className="flex-1">
                <span>{deviceLocationError}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
