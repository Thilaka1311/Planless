import React, { useState, useRef, useEffect } from "react";
import { ChevronLeft, Search, MapPin, Navigation, X, Loader2, AlertCircle, Check, Compass } from "lucide-react";
import { useGooglePlacesAutocomplete } from "../../../shared/hooks/useGooglePlacesAutocomplete";

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
  onBack: () => void;
  onSelectLocation: (location: DiscoveryLocation) => void;
}

// Popular Bangalore / metro areas for instant 1-tap discovery selection
const POPULAR_DISCOVERY_HUBS = [
  { name: "Indiranagar", city: "Bengaluru", locality: "Indiranagar", latitude: 12.9784, longitude: 77.6408 },
  { name: "Koramangala", city: "Bengaluru", locality: "Koramangala", latitude: 12.9352, longitude: 77.6245 },
  { name: "HSR Layout", city: "Bengaluru", locality: "HSR Layout", latitude: 12.9121, longitude: 77.6446 },
  { name: "Whitefield", city: "Bengaluru", locality: "Whitefield", latitude: 12.9698, longitude: 77.7500 },
  { name: "Church Street", city: "Bengaluru", locality: "Central Bangalore", latitude: 12.9749, longitude: 77.6075 },
];

export const LocationSetter: React.FC<LocationSetterProps> = ({
  currentCity = "Bengaluru",
  currentLocality = "Nearby",
  currentCoordinates,
  onBack,
  onSelectLocation,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isResolvingPlaceId, setIsResolvingPlaceId] = useState<string | null>(null);
  const [isLocatingDevice, setIsLocatingDevice] = useState(false);
  const [deviceLocationError, setDeviceLocationError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Reuse the exact same Google Places Autocomplete hook used by Create Plan Review
  const {
    suggestions,
    isLoading: isAutocompleteLoading,
    error: autocompleteError,
    getPlaceDetails,
    reverseGeocode,
    clearSuggestions,
  } = useGooglePlacesAutocomplete(searchQuery);

  // Focus input automatically on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

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

  const handleSelectQuickHub = (hub: typeof POPULAR_DISCOVERY_HUBS[0]) => {
    onSelectLocation({
      name: hub.name,
      address: `${hub.name}, ${hub.city}`,
      latitude: hub.latitude,
      longitude: hub.longitude,
      city: hub.city,
      locality: hub.locality,
    });
  };

  const showSuggestions = searchQuery.trim().length >= 3 && suggestions.length > 0;
  const showEmptySearch = searchQuery.trim().length >= 3 && !isAutocompleteLoading && suggestions.length === 0;

  return (
    <div
      className="flex-1 flex flex-col h-full bg-[#000000] overflow-y-auto no-scrollbar pb-12 text-left select-none"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* ── 1. Top Header Bar ── */}
      <div className="w-full shrink-0 px-4 pt-3 pb-3 flex items-center justify-between border-b border-white/[0.08] bg-[#000000]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 transition cursor-pointer"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight leading-tight">
              Discovery Location
            </h1>
            <p className="text-[11px] text-zinc-400 font-normal leading-tight">
              Explore restaurants & sports near you
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. Search Bar Connected to Google Places ── */}
      <div className="px-5 pt-4 pb-2 shrink-0">
        <div className="relative flex items-center w-full rounded-2xl bg-[#121216] border border-white/[0.08] focus-within:border-[#FF6B2C]/60 focus-within:bg-[#16161b] transition-all px-3.5 py-2.5 shadow-inner">
          <Search className="w-4 h-4 text-zinc-400 shrink-0 mr-2.5" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search city, area, or landmark..."
            className="w-full bg-transparent text-sm font-medium text-white placeholder:text-zinc-500 focus:outline-none"
          />
          {isAutocompleteLoading && (
            <Loader2 className="w-4 h-4 text-zinc-400 animate-spin shrink-0 ml-2" />
          )}
          {searchQuery && !isAutocompleteLoading && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                clearSuggestions();
                searchInputRef.current?.focus();
              }}
              className="w-5 h-5 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition cursor-pointer shrink-0 ml-2"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

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
        <div className="px-5 pt-1 space-y-1">
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
            <Search className="w-5 h-5" />
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
        <div className="px-5 pt-3 space-y-5">
          {/* Current / Selected Discovery Location */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">
              Active Discovery Location
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0e0e11] border border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#FF6B2C]/10 border border-[#FF6B2C]/20 flex items-center justify-center text-[#FF6B2C] shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">
                    {currentCity}
                  </div>
                  <div className="text-xs text-zinc-400 truncate">
                    {currentLocality}
                  </div>
                </div>
              </div>
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold tracking-wide">
                Current
              </span>
            </div>
          </div>

          {/* Device Location Action ("Use my current location") */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">
              Device Location
            </div>
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

          {/* Quick Selection: Popular Bangalore Discovery Hubs */}
          <div className="space-y-2 pt-1">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">
              Popular Discovery Hubs
            </div>
            <div className="grid grid-cols-1 gap-2">
              {POPULAR_DISCOVERY_HUBS.map((hub) => {
                const isSelected =
                  currentCity.toLowerCase() === hub.name.toLowerCase() ||
                  currentLocality.toLowerCase().includes(hub.name.toLowerCase());

                return (
                  <button
                    key={hub.name}
                    type="button"
                    onClick={() => handleSelectQuickHub(hub)}
                    className={`w-full text-left p-3 rounded-2xl border transition duration-150 flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? "bg-[#18181d] border-[#FF6B2C]/40"
                        : "bg-[#0c0c0e] hover:bg-white/[0.04] active:bg-white/[0.08] border-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected
                            ? "bg-[#FF6B2C]/10 text-[#FF6B2C]"
                            : "bg-white/[0.04] text-zinc-400"
                        }`}
                      >
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {hub.name}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate">
                          {hub.city} • Popular Hangout & Sports Area
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-[#FF6B2C] shrink-0 ml-2" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
