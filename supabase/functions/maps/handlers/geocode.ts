import { getGoogleApiKey, fetchGoogleApi } from "../shared/google.ts";

const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export async function handleGeocode(body: any): Promise<any> {
  const { address, latlng, latitude, longitude } = body;
  const apiKey = await getGoogleApiKey();
  const params = new URLSearchParams({
    key: apiKey,
  });

  if (address) {
    params.append("address", address);
  } else if (latlng) {
    params.append("latlng", latlng);
  } else if (latitude !== undefined && longitude !== undefined) {
    params.append("latlng", `${latitude},${longitude}`);
  } else {
    throw new Error("Missing 'address' or coordinates parameter.");
  }

  return fetchGoogleApi(GOOGLE_GEOCODE_URL, params);
}
