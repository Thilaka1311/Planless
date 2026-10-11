import { getGoogleApiKey } from "../shared/google.ts";
import { corsHeaders } from "../shared/cors.ts";

const GOOGLE_PLACE_PHOTO_URL = "https://maps.googleapis.com/maps/api/place/photo";

/**
 * Handle place photo retrieval with secure 302 redirect.
 * Supports both legacy photoreference strings and Google Places API (New) resource names
 * (e.g., "places/{placeId}/photos/{photoId}").
 * Client receives Google's signed CDN image URL without exposing the secret API key.
 */
export async function handlePlacePhoto(
  photoReference: string,
  maxWidth = "800",
  placeId?: string
): Promise<Response> {
  const apiKey = getGoogleApiKey();
  const cleanRef = (photoReference || "").trim();
  const cleanPlaceId = placeId ? (placeId.startsWith("places/") ? placeId.replace(/^places\//, "") : placeId) : "";

  // 1. Determine if this is a Places API (New) resource name
  const hasPhotosPath = cleanRef.includes("/photos/");
  const isExplicitNew = cleanRef.startsWith("places/") || hasPhotosPath;

  let newResourceName = "";
  if (isExplicitNew) {
    newResourceName = cleanRef.startsWith("places/") ? cleanRef : `places/${cleanRef}`;
  } else if (cleanPlaceId && cleanRef.length > 20 && !cleanRef.startsWith("CnR")) {
    // If we have a placeId and the reference looks like a Places API (New) photo UID
    newResourceName = `places/${cleanPlaceId}/photos/${cleanRef}`;
  }

  // 2. Attempt Places API (New) media retrieval if resource name is known
  if (newResourceName) {
    try {
      const newPhotoUrl = `https://places.googleapis.com/v1/${newResourceName}/media?maxWidthPx=${maxWidth}&key=${apiKey}`;
      const res = await fetch(newPhotoUrl, { redirect: "manual" });
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
    } catch (err) {
      console.warn("[handlePlacePhoto] New Places media fetch error:", err);
    }
  }

  // 3. Fallback: If legacy photoreference, attempt legacy Maps Photo API
  if (cleanRef) {
    try {
      const legacyParams = new URLSearchParams({
        maxwidth: maxWidth,
        photoreference: cleanRef,
        key: apiKey,
      });
      const legacyUrl = `${GOOGLE_PLACE_PHOTO_URL}?${legacyParams.toString()}`;
      const res = await fetch(legacyUrl, { redirect: "manual" });

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
    } catch (err) {
      console.warn("[handlePlacePhoto] Legacy photo fetch error:", err);
    }
  }

  // 4. Rescue layer: If legacy photo failed (disabled on project) or photo was dead,
  // query Places API (New) Place Details for the placeId to retrieve its latest valid photo
  if (cleanPlaceId) {
    try {
      const detailsRes = await fetch(`https://places.googleapis.com/v1/places/${cleanPlaceId}`, {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "photos",
        },
      });

      if (detailsRes.ok) {
        const detailsData = await detailsRes.json();
        const firstPhoto = Array.isArray(detailsData?.photos) ? detailsData.photos[0] : null;
        if (firstPhoto?.name) {
          const rescueUrl = `https://places.googleapis.com/v1/${firstPhoto.name}/media?maxWidthPx=${maxWidth}&key=${apiKey}`;
          const rescueRes = await fetch(rescueUrl, { redirect: "manual" });
          if (rescueRes.status === 302 || rescueRes.status === 301) {
            const location = rescueRes.headers.get("location");
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
        }
      }
    } catch (rescueErr) {
      console.warn("[handlePlacePhoto] Rescue photo fetch error:", rescueErr);
    }
  }

  return new Response(JSON.stringify({ error: "Failed to retrieve photo" }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
