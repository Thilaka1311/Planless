import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, MapPin, Loader2, AlertCircle } from "lucide-react";
import { useGooglePlacesAutocomplete } from "../../../shared/hooks/useGooglePlacesAutocomplete";
import { SearchBar } from "../../../shared/components/SearchBar";

import { getCityBoundingBox, CityBoundingBox } from "../services/cityBoundary";

export interface DiscoveryLocation {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  city?: string;
  locality?: string;
  cityBounds?: CityBoundingBox;
}

export interface LocationSetterProps {
  currentCity?: string;
  currentLocality?: string;
  currentCoordinates?: { latitude: number; longitude: number };
  hasLocation?: boolean;
  onBack: () => void;
  onSelectLocation: (location: DiscoveryLocation) => void;
}

export type LocationCardStatus = "AVAILABLE" | "NOT_PERMITTED" | "SERVICES_OFF";

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
  const [isDetecting, setIsDetecting] = useState(false);
  const [deviceLocationError, setDeviceLocationError] = useState<string | null>(null);

  // Initialize card status: if hasLocation is true or currentCoordinates provided, start AVAILABLE, otherwise NOT_PERMITTED
  const [cardStatus, setCardStatus] = useState<LocationCardStatus>(() => {
    if (hasLocation === true) return "AVAILABLE";
    if (hasLocation === false) return "NOT_PERMITTED";
    if (currentCoordinates && typeof currentCoordinates.latitude === "number") return "AVAILABLE";
    return "NOT_PERMITTED";
  });

  const [detectedLocation, setDetectedLocation] = useState<DiscoveryLocation | null>(() => {
    if (currentCoordinates && typeof currentCoordinates.latitude === "number") {
      const name =
        currentLocality && currentCity && currentLocality !== currentCity
          ? `${currentLocality}, ${currentCity}`
          : currentLocality || currentCity || "Current Location";
      return {
        name,
        address: `${currentCoordinates.latitude.toFixed(4)}, ${currentCoordinates.longitude.toFixed(4)}`,
        latitude: currentCoordinates.latitude,
        longitude: currentCoordinates.longitude,
        city: currentCity,
        locality: currentLocality,
      };
    }
    return null;
  });

  // Google Places Autocomplete hook used across the app
  const {
    suggestions,
    isLoading: isAutocompleteLoading,
    error: autocompleteError,
    getPlaceDetails,
    reverseGeocode,
    clearSuggestions,
  } = useGooglePlacesAutocomplete(searchQuery);

  // ── Detect Device Location using Real Geolocation & Permissions ──────────
  const detectDeviceLocation = useCallback(
    async (shouldSelect: boolean) => {
      if (typeof window === "undefined" || !("geolocation" in navigator)) {
        setCardStatus("NOT_PERMITTED");
        return;
      }

      setIsDetecting(true);
      setDeviceLocationError(null);

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          try {
            const resolved = await reverseGeocode(lat, lng);
            const city = resolved?.city || currentCity || "Bengaluru";
            const locality = resolved?.locality || resolved?.name || currentLocality || "Nearby";
            const readableName =
              locality && city && locality !== city
                ? `${locality}, ${city}`
                : resolved?.name || locality || city || "Current Location";

            const cityBounds = resolved?.cityBounds || (await getCityBoundingBox(city)) || undefined;

            const loc: DiscoveryLocation = {
              name: readableName,
              address: resolved?.formatted_address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
              latitude: lat,
              longitude: lng,
              city,
              locality,
              cityBounds,
            };

            setDetectedLocation(loc);
            setCardStatus("AVAILABLE");
            setIsDetecting(false);

            if (shouldSelect) {
              onSelectLocation(loc);
            }
          } catch (err: any) {
            console.warn("[LocationSetter] Reverse geocode error, fallback to coordinates:", err);
            const fallbackLoc: DiscoveryLocation = {
              name: currentCity ? `${currentCity}, Karnataka` : "Current Location",
              address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
              latitude: lat,
              longitude: lng,
              city: currentCity || "Bengaluru",
              locality: currentLocality || "Nearby",
            };
            setDetectedLocation(fallbackLoc);
            setCardStatus("AVAILABLE");
            setIsDetecting(false);

            if (shouldSelect) {
              onSelectLocation(fallbackLoc);
            }
          }
        },
        (error) => {
          setIsDetecting(false);
          if (error.code === error.PERMISSION_DENIED) {
            setCardStatus("NOT_PERMITTED");
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            setCardStatus("SERVICES_OFF");
          } else if (error.code === error.TIMEOUT) {
            setDeviceLocationError("Location request timed out. Tap to try again.");
          } else {
            setDeviceLocationError("Unable to retrieve device location. Tap to try again.");
          }
        },
        {
          timeout: 10000,
          enableHighAccuracy: true,
          maximumAge: 60000,
        }
      );
    },
    [currentCity, currentLocality, onSelectLocation, reverseGeocode]
  );

  // ── Auto-check Device Location Permission on Mount ───────────────────────
  useEffect(() => {
    let isMounted = true;

    if (typeof window !== "undefined" && "permissions" in navigator && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((permissionStatus) => {
          if (!isMounted) return;

          if (permissionStatus.state === "granted") {
            // Already permitted: automatically detect without re-prompting
            detectDeviceLocation(false);
          } else if (permissionStatus.state === "denied") {
            setCardStatus("NOT_PERMITTED");
          } else {
            // 'prompt' state
            if (hasLocation !== true) {
              setCardStatus("NOT_PERMITTED");
            }
          }

          permissionStatus.onchange = () => {
            if (!isMounted) return;
            if (permissionStatus.state === "granted") {
              detectDeviceLocation(false);
            } else if (permissionStatus.state === "denied") {
              setCardStatus("NOT_PERMITTED");
            }
          };
        })
        .catch(() => {
          // Permissions API unsupported or failed, keep existing fallback
          if (!isMounted) return;
          if (hasLocation !== true && !currentCoordinates) {
            setCardStatus("NOT_PERMITTED");
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [detectDeviceLocation, hasLocation, currentCoordinates]);

  // ── Handle Tapping the Location Status Card ──────────────────────────────
  const handleCardClick = () => {
    if (cardStatus === "AVAILABLE") {
      if (detectedLocation) {
        onSelectLocation(detectedLocation);
      } else {
        detectDeviceLocation(true);
      }
    } else if (cardStatus === "NOT_PERMITTED") {
      // Trigger native permission dialog & select on success
      detectDeviceLocation(true);
    } else if (cardStatus === "SERVICES_OFF") {
      // Retry detection (prompts OS settings/dialog where supported)
      detectDeviceLocation(true);
    }
  };

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

      let city = "";
      let locality = mainText;

      // Extract structured city & locality from Google's address_components
      if (Array.isArray(details?.address_components) && details.address_components.length > 0) {
        for (const comp of details.address_components) {
          if (comp.types.includes("locality")) {
            city = comp.long_name;
          } else if (!city && (comp.types.includes("administrative_area_level_2") || comp.types.includes("postal_town"))) {
            city = comp.long_name;
          }
          if (
            comp.types.includes("sublocality") ||
            comp.types.includes("sublocality_level_1") ||
            comp.types.includes("neighborhood")
          ) {
            locality = comp.long_name;
          }
        }
      }

      // Fallback: parse secondary text
      if (!city && secondaryText) {
        const parts = secondaryText.split(",").map((p) => p.trim());
        if (parts.length > 0) {
          city = parts[0];
        }
      }

      if (!city) {
        city = currentCity || "Bengaluru";
      }

      const resolvedLat = typeof lat === "number" ? lat : (currentCoordinates?.latitude || 12.9716);
      const resolvedLng = typeof lng === "number" ? lng : (currentCoordinates?.longitude || 77.5946);

      // Resolve city boundary box for strict geographical restriction
      const cityBounds = await getCityBoundingBox(city);

      onSelectLocation({
        name: mainText,
        address: details?.formatted_address || suggestion.description,
        latitude: resolvedLat,
        longitude: resolvedLng,
        city,
        locality: locality || "Nearby",
        cityBounds: cityBounds || undefined,
      });
    } catch (err: any) {
      console.error("[LocationSetter] Failed to resolve place details:", err);
      const fallbackCity = currentCity || "Bengaluru";
      const cityBounds = await getCityBoundingBox(fallbackCity);
      onSelectLocation({
        name: suggestion.structured_formatting?.main_text || suggestion.description,
        address: suggestion.description,
        latitude: currentCoordinates?.latitude || 12.9716,
        longitude: currentCoordinates?.longitude || 77.5946,
        city: fallbackCity,
        locality: suggestion.structured_formatting?.main_text || "Nearby",
        cityBounds: cityBounds || undefined,
      });
    } finally {
      setIsResolvingPlaceId(null);
    }
  };

  const getPrimaryText = () => {
    if (cardStatus === "AVAILABLE") {
      return "Using your current location";
    }
    if (cardStatus === "SERVICES_OFF") {
      return "Location is turned off";
    }
    return "Use your current location";
  };

  const getSecondaryText = () => {
    if (cardStatus === "AVAILABLE") {
      if (isDetecting) return "Detecting location...";
      if (detectedLocation) {
        const loc = detectedLocation.locality;
        const city = detectedLocation.city;
        if (loc && city && loc !== city) {
          return `${loc}, ${city}`;
        }
        return loc || city || detectedLocation.name || "Bengaluru, Karnataka";
      }
      if (currentLocality && currentCity) {
        return currentLocality !== currentCity ? `${currentLocality}, ${currentCity}` : currentCity;
      }
      return currentCity || "Bengaluru, Karnataka";
    }
    if (cardStatus === "SERVICES_OFF") {
      return "Tap to enable location";
    }
    return "Tap to enable location access";
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

        {/* ── 2b. Location Status Card (12–16px directly below SearchBar) ── */}
        <div className="mt-3.5">
          <button
            type="button"
            onClick={handleCardClick}
            disabled={isDetecting}
            className="w-full text-left p-3 rounded-2xl bg-[#111114] hover:bg-[#16161b] active:scale-[0.99] border border-white/[0.08] hover:border-white/[0.14] transition duration-150 flex items-center justify-between cursor-pointer group shadow-sm"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border transition ${
                  cardStatus === "AVAILABLE"
                    ? "bg-[#FF6B2C]/10 border-[#FF6B2C]/20 text-[#FF6B2C]"
                    : cardStatus === "SERVICES_OFF"
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                    : "bg-white/[0.04] border-white/[0.06] text-zinc-400 group-hover:text-white"
                }`}
              >
                {isDetecting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#FF6B2C]" />
                ) : (
                  <MapPin className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white group-hover:text-white truncate">
                  {getPrimaryText()}
                </div>
                <div className="text-xs text-zinc-400 truncate mt-0.5">
                  {getSecondaryText()}
                </div>
              </div>
            </div>
          </button>

          {/* Device Location Error / Feedback Notification */}
          {deviceLocationError && (
            <div className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-amber-300 text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
              <div className="flex-1">
                <span>{deviceLocationError}</span>
              </div>
            </div>
          )}
        </div>
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
    </div>
  );
};

