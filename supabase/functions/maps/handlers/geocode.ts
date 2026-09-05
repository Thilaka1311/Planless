import { getGoogleApiKey, fetchGoogleApi } from "../shared/google.ts";

const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export async function handleGeocode(body: any): Promise<any> {
  const { address } = body;
  if (!address) {
    throw new Error("Missing 'address' parameter.");
  }

  const apiKey = await getGoogleApiKey();
  const params = new URLSearchParams({
    address,
    key: apiKey,
  });

  return fetchGoogleApi(GOOGLE_GEOCODE_URL, params);
}
