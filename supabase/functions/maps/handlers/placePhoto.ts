import { getGoogleApiKey } from "../shared/google.ts";
import { corsHeaders } from "../shared/cors.ts";

const GOOGLE_PLACE_PHOTO_URL = "https://maps.googleapis.com/maps/api/place/photo";

/**
 * Handle place photo retrieval with secure 302 redirect.
 * Supports both legacy photoreference strings and Google Places API (New) resource names
 * (e.g., "places/{placeId}/photos/{photoId}").
 * Client receives Google's signed CDN image URL without exposing the secret API key.
 */
export async function handlePlacePhoto(photoReference: string, maxWidth = "800"): Promise<Response> {
  const apiKey = getGoogleApiKey();
  const cleanRef = photoReference.trim();
  const isNewPlacesPhoto = cleanRef.startsWith("places/") || cleanRef.includes("/photos/");

  let photoUrl: string;
  if (isNewPlacesPhoto) {
    const resourceName = cleanRef.startsWith("places/") ? cleanRef : `places/${cleanRef}`;
    photoUrl = `https://places.googleapis.com/v1/${resourceName}/media?maxWidthPx=${maxWidth}&key=${apiKey}`;
  } else {
    const params = new URLSearchParams({
      maxwidth: maxWidth,
      photoreference: cleanRef,
      key: apiKey,
    });
    photoUrl = `${GOOGLE_PLACE_PHOTO_URL}?${params.toString()}`;
  }

  try {
    // Manual redirect inspection keeps Google CDN URL direct to client while hiding apiKey
    const res = await fetch(photoUrl, { redirect: "manual" });

    if (res.status === 302 || res.status === 301) {
      const location = res.headers.get("location");
      if (location) {
        return new Response(null, {
          status: 302,
          headers: {
            ...corsHeaders,
            Location: location,
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
          },
        });
      }
    }

    if (!res.ok && res.status !== 302) {
      return new Response(JSON.stringify({ error: "Failed to retrieve photo" }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(res.body, {
      status: res.status,
      headers: {
        ...corsHeaders,
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Failed to fetch place photo" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
