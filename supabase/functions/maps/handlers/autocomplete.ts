import { getGoogleApiKey, fetchGoogleApi } from "../shared/google.ts";

const GOOGLE_PLACES_AUTOCOMPLETE_URL = "https://maps.googleapis.com/maps/api/place/autocomplete/json";

export async function handleAutocomplete(body: any): Promise<any> {
  const { input, sessiontoken } = body;
  if (!input) {
    throw new Error("Missing 'input' parameter for search.");
  }

  const apiKey = await getGoogleApiKey();
  const params = new URLSearchParams({
    input,
    key: apiKey,
  });

  if (sessiontoken) {
    params.append("sessiontoken", sessiontoken);
  }

  return fetchGoogleApi(GOOGLE_PLACES_AUTOCOMPLETE_URL, params);
}
