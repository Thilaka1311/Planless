import { getGoogleApiKey, fetchGoogleApi } from "../shared/google.ts";

const GOOGLE_PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

export async function handlePlaceDetails(body: any): Promise<any> {
  const { placeid, sessiontoken } = body;
  if (!placeid) {
    throw new Error("Missing 'placeid' parameter.");
  }

  const apiKey = await getGoogleApiKey();
  const params = new URLSearchParams({
    place_id: placeid,
    key: apiKey,
    fields: "place_id,name,formatted_address,geometry",
  });

  if (sessiontoken) {
    params.append("sessiontoken", sessiontoken);
  }

  return fetchGoogleApi(GOOGLE_PLACE_DETAILS_URL, params);
}
