import { getGoogleApiKey, fetchGoogleApi } from "../shared/google.ts";

const GOOGLE_PLACES_AUTOCOMPLETE_URL = "https://maps.googleapis.com/maps/api/place/autocomplete/json";

// Geographic center of India (approx.) used for location bias
// Latitude: 20.5937°N, Longitude: 78.9629°E
const INDIA_CENTER_LAT = "20.5937";
const INDIA_CENTER_LNG = "78.9629";
// ~2000km radius covers all of India end-to-end
const INDIA_RADIUS = "2000000";

export async function handleAutocomplete(body: any): Promise<any> {
  const { input, sessiontoken } = body;
  if (!input) {
    throw new Error("Missing 'input' parameter for search.");
  }

  const apiKey = await getGoogleApiKey();
  const params = new URLSearchParams({
    input,
    key: apiKey,
    // Restrict results to India using ISO 3166-1 alpha-2 country code
    components: "country:in",
    // Bias results toward center of India for better relevance ordering
    location: `${INDIA_CENTER_LAT},${INDIA_CENTER_LNG}`,
    radius: INDIA_RADIUS,
    language: "en",
  });

  if (sessiontoken) {
    params.append("sessiontoken", sessiontoken);
  }

  return fetchGoogleApi(GOOGLE_PLACES_AUTOCOMPLETE_URL, params);
}
