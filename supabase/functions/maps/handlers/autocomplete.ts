import { getGoogleApiKey } from "../shared/google.ts";

const GOOGLE_PLACES_NEW_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";

/**
 * Handle Autocomplete queries using Google Places API (New) with India-specific relevance.
 *
 * Requirements:
 * - Uses POST https://places.googleapis.com/v1/places:autocomplete
 * - Applies India restriction via includedRegionCodes: ["in"] and regionCode: "in"
 * - Supports optional location biasing when user coordinates (lat/lng) are provided (max radius: 50,000m)
 * - Normalizes responses to the legacy contract expected by useGooglePlacesAutocomplete (status, predictions, structured_formatting, place_id)
 */
export async function handleAutocomplete(body: any): Promise<any> {
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  const sessionToken = body?.sessiontoken || body?.sessionToken;

  if (!input) {
    return {
      status: "ZERO_RESULTS",
      predictions: [],
    };
  }

  const apiKey = getGoogleApiKey();

  const requestBody: Record<string, any> = {
    input,
    includedRegionCodes: ["in"],
    regionCode: "in",
  };

  if (sessionToken) {
    requestBody.sessionToken = sessionToken;
  }

  // Location biasing: if user coordinates provided, bias search to user area (max 50,000m per Places New API)
  const userLat = typeof body?.latitude === "number" ? body.latitude : typeof body?.lat === "number" ? body.lat : undefined;
  const userLng = typeof body?.longitude === "number" ? body.longitude : typeof body?.lng === "number" ? body.lng : undefined;

  if (typeof userLat === "number" && typeof userLng === "number") {
    const rawRadius = typeof body?.radius === "number" ? body.radius : 25000;
    const safeRadius = Math.min(Math.max(rawRadius, 100), 50000.0);
    requestBody.locationBias = {
      circle: {
        center: {
          latitude: userLat,
          longitude: userLng,
        },
        radius: safeRadius,
      },
    };
    requestBody.origin = {
      latitude: userLat,
      longitude: userLng,
    };
  }

  try {
    const response = await fetch(GOOGLE_PLACES_NEW_AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorDetail = `Places API returned status ${response.status}`;
      try {
        const errorJson = await response.json();
        if (errorJson?.error?.message) {
          errorDetail = errorJson.error.message;
        }
      } catch {}
      console.error("[handleAutocomplete] Places API (New) error:", errorDetail);
      return {
        status: "ERROR",
        error_message: errorDetail,
        predictions: [],
      };
    }

    const data = await response.json();
    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];

    const predictions = suggestions
      .filter((s: any) => Boolean(s?.placePrediction))
      .map((s: any) => {
        const p = s.placePrediction;
        const placeId = p.placeId || (p.place ? p.place.replace(/^places\//, "") : "");
        const description = p.text?.text || "";
        const mainText = p.structuredFormat?.mainText?.text || description;
        const secondaryText = p.structuredFormat?.secondaryText?.text || "";
        const types = Array.isArray(p.types) ? p.types : [];

        return {
          place_id: placeId,
          description,
          structured_formatting: {
            main_text: mainText,
            secondary_text: secondaryText,
          },
          types,
          // Forward compatibility fields
          id: placeId,
          name: mainText,
        };
      });

    return {
      status: predictions.length > 0 ? "OK" : "ZERO_RESULTS",
      predictions,
    };
  } catch (err: any) {
    console.error("[handleAutocomplete] Request failed:", err);
    return {
      status: "ERROR",
      error_message: err.message || "Failed to process autocomplete request",
      predictions: [],
    };
  }
}
