import { getGoogleApiKey, fetchGoogleApi } from "../shared/google.ts";

const GOOGLE_PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

export async function handlePlaceDetails(body: any): Promise<any> {
  const targetPlaceId = body?.placeid || body?.placeId || body?.place_id;
  if (!targetPlaceId) {
    throw new Error("Missing 'placeid' parameter.");
  }

  const apiKey = await getGoogleApiKey();
  const params = new URLSearchParams({
    place_id: targetPlaceId,
    key: apiKey,
    fields: "place_id,name,formatted_address,geometry",
  });

  if (body?.sessiontoken) {
    params.append("sessiontoken", body.sessiontoken);
  }

  return fetchGoogleApi(GOOGLE_PLACE_DETAILS_URL, params);
}
