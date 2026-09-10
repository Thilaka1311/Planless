import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabaseClient";


export interface AutocompleteSuggestion {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

export interface PlaceDetails {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
}

/**
 * Extract underlying error message from Supabase Edge Function error or network error
 */
async function parseInvokeError(err: any): Promise<string> {
  if (!err) return "Failed to process maps request.";

  // Supabase FunctionsHttpError stores the Fetch Response in err.context
  if (err.context && typeof err.context === "object") {
    try {
      const response = typeof err.context.clone === "function" ? err.context.clone() : err.context;
      if (typeof response.json === "function") {
        const json = await response.json();
        if (json) {
          if (typeof json.error === "string") return json.error;
          if (typeof json.message === "string") return json.message;
          if (typeof json.error_message === "string") return json.error_message;
          if (typeof json.details === "string") return json.details;
        }
      }
    } catch {
      try {
        const response = typeof err.context.clone === "function" ? err.context.clone() : err.context;
        if (typeof response.text === "function") {
          const text = await response.text();
          if (text && text.trim().length > 0) return text.trim();
        }
      } catch {}
    }
  }

  return err.message || "Failed to process maps request.";
}

/**
 * useGooglePlacesAutocomplete
 * Pure data hook driven by a controlled external query value.
 */
export function useGooglePlacesAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate a persistent session token per autocompletion flow session
  const sessionTokenRef = useRef<string | null>(null);

  // Track the resolved Google Place ID to suppress autocomplete requests on programmatic overrides
  const selectedPlaceIdRef = useRef<string | null>(null);
  // Track whether we should currently ignore programmatic updates (e.g. while details resolve)
  const suppressRequestsRef = useRef<boolean>(false);
  // Keep the latest query string length so we can check it
  const lastUserTypedQueryRef = useRef<string>("");

  const getSessionToken = () => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = Math.random().toString(36).substring(2, 17);
    }
    return sessionTokenRef.current;
  };

  const resetSessionToken = () => {
    sessionTokenRef.current = null;
  };

  useEffect(() => {
    
    
    // 1. Minimum query length check (Ignore queries shorter than 3 characters)
    if (!query || query.trim().length < 3) {
      
      setSuggestions([]);
      return;
    }

    // 2. Ignore programmatic updates while resolving details
    if (suppressRequestsRef.current) {
      
      return;
    }

    // 3. Clear suggestions if user resumes typing after selection
    if (selectedPlaceIdRef.current && query !== lastUserTypedQueryRef.current) {
      
      selectedPlaceIdRef.current = null;
    }

    lastUserTypedQueryRef.current = query;

    const delayDebounce = setTimeout(async () => {
      
      setIsLoading(true);
      setError(null);
      try {
        const token = getSessionToken();
        const { data, error: invokeError } = await supabase.functions.invoke("maps", {
          body: { action: "autocomplete", input: query, sessiontoken: token },
        });

        if (invokeError) {
          throw invokeError;
        }
        
        if (data.status === "OK" || data.status === "ZERO_RESULTS") {
          const preds = data.predictions || [];
          
          setSuggestions(preds);
        } else {
          const errMsg = data.error_message || `API error status: ${data.status}`;
          console.error("[useGooglePlacesAutocomplete Hook] Google API error:", errMsg);
          setError(errMsg);
        }
      } catch (err: any) {
        const detailedError = await parseInvokeError(err);
        console.error("[useGooglePlacesAutocomplete Hook] Fetch exception:", detailedError, err);
        setError(detailedError);
      } finally {
        setIsLoading(false);
      }
    }, 400); // 400ms debounce

    return () => {
      
      clearTimeout(delayDebounce);
    };
  }, [query]);

  /**
   * Fetch details for a specific place suggestion
   */
  const getPlaceDetails = useCallback(async (placeId: string): Promise<PlaceDetails | null> => {
    setIsLoading(true);
    setError(null);
    suppressRequestsRef.current = true; // Lock autocomplete requests while resolving
    selectedPlaceIdRef.current = placeId;
    try {
      const token = getSessionToken();
      const { data, error: invokeError } = await supabase.functions.invoke("maps", {
        body: { action: "place-details", placeid: placeId, sessiontoken: token },
      });
      if (invokeError) {
        throw invokeError;
      }
      resetSessionToken(); // Invalidate token after final place details fetch

      if (data.status === "OK") {
        return data.result as PlaceDetails;
      } else {
        const errMsg = data.error_message || `API error status: ${data.status}`;
        setError(errMsg);
        return null;
      }
    } catch (err: any) {
      const detailedError = await parseInvokeError(err);
      console.error("[useGooglePlacesAutocomplete Hook] Place details exception:", detailedError, err);
      setError(detailedError);
      return null;
    } finally {
      setIsLoading(false);
      // Keep suppress flag active for a brief tick so state updates resolve cleanly
      setTimeout(() => {
        suppressRequestsRef.current = false;
      }, 100);
    }
  }, []);

  /**
   * Forward/Reverse geocode an address string
   */
  const geocodeAddress = useCallback(async (address: string): Promise<any | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("maps", {
        body: { action: "geocode", address },
      });
      if (invokeError) {
        throw invokeError;
      }
      if (data.status === "OK") {
        return data.results;
      } else {
        const errMsg = data.error_message || `API error status: ${data.status}`;
        setError(errMsg);
        return null;
      }
    } catch (err: any) {
      const detailedError = await parseInvokeError(err);
      console.error("[useGooglePlacesAutocomplete Hook] Geocode exception:", detailedError, err);
      setError(detailedError);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
  }, []);

  const setProgrammaticSelection = useCallback((placeId: string | null) => {
    selectedPlaceIdRef.current = placeId;
    if (placeId) {
      suppressRequestsRef.current = true;
      setTimeout(() => {
        suppressRequestsRef.current = false;
      }, 100);
    }
  }, []);

  return {
    suggestions,
    isLoading,
    error,
    getPlaceDetails,
    geocodeAddress,
    resetSessionToken,
    clearSuggestions,
    setProgrammaticSelection,
  };
}
