import { getGoogleApiKey, fetchGoogleApi } from "../shared/google.ts";

const GOOGLE_PLACES_NEW_DETAILS_BASE_URL = "https://places.googleapis.com/v1/places";
const GOOGLE_LEGACY_PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

export async function handlePlaceDetails(body: any): Promise<any> {
  const targetPlaceId = body?.placeid || body?.placeId || body?.place_id;
  if (!targetPlaceId) {
    throw new Error("Missing 'placeid' parameter.");
  }

  const apiKey = getGoogleApiKey();
  const wantAllPhotos = Boolean(body?.all_photos || body?.allPhotos);

  // 1. Fetch details via Places API (New) as primary source
  let placeResult: any = null;
  const photoMap = new Map<string, any>();

  try {
    const cleanPlaceId = targetPlaceId.startsWith("places/")
      ? targetPlaceId.replace(/^places\//, "")
      : targetPlaceId;

    const newPlacesRes = await fetch(`${GOOGLE_PLACES_NEW_DETAILS_BASE_URL}/${cleanPlaceId}`, {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,location,rating,userRatingCount,types,addressComponents,photos",
      },
    });

    if (newPlacesRes.ok) {
      const newData = await newPlacesRes.json();
      const placeName = newData.displayName?.text || "";
      const placeAddress = newData.formattedAddress || "";

      // Index initial photos
      if (Array.isArray(newData.photos)) {
        for (const ph of newData.photos) {
          const ref = ph.name || ph.photo_reference;
          if (!ref) continue;
          const cleanKey = ref.split("/photos/").pop() || ref;
          if (!photoMap.has(cleanKey)) {
            photoMap.set(cleanKey, {
              name: ph.name || ref,
              photo_reference: ph.name || ref,
              width: ph.widthPx,
              height: ph.heightPx,
              authorAttributions: ph.authorAttributions,
              html_attributions: (ph.authorAttributions || []).map((a: any) => a.displayName || ""),
            });
          }
        }
      }

      placeResult = {
        place_id: cleanPlaceId,
        id: cleanPlaceId,
        name: placeName,
        formatted_address: placeAddress,
        geometry: {
          location: {
            lat: newData.location?.latitude,
            lng: newData.location?.longitude,
          },
        },
        rating: newData.rating,
        user_ratings_total: newData.userRatingCount,
        types: Array.isArray(newData.types) ? newData.types : [],
        address_components: Array.isArray(newData.addressComponents)
          ? newData.addressComponents.map((c: any) => ({
              long_name: c.longText || c.shortText || "",
              short_name: c.shortText || c.longText || "",
              types: Array.isArray(c.types) ? c.types : [],
            }))
          : [],
        photos: Array.from(photoMap.values()),
      };

      // 2. If all photos requested (Admin Edit card opened), enrich photos via Places API (New) Text Search
      if (wantAllPhotos && placeName) {
        try {
          const searchQuery = placeAddress ? `${placeName} ${placeAddress}` : placeName;
          const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": "places.id,places.photos",
            },
            body: JSON.stringify({
              textQuery: searchQuery,
              pageSize: 5,
            }),
          });

          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const matchingPlace =
              (searchData.places || []).find((p: any) => p.id === cleanPlaceId) ||
              searchData.places?.[0];

            if (matchingPlace && Array.isArray(matchingPlace.photos)) {
              for (const ph of matchingPlace.photos) {
                const ref = ph.name || ph.photo_reference;
                if (!ref) continue;
                const cleanKey = ref.split("/photos/").pop() || ref;
                if (!photoMap.has(cleanKey)) {
                  photoMap.set(cleanKey, {
                    name: ph.name || ref,
                    photo_reference: ph.name || ref,
                    width: ph.widthPx,
                    height: ph.heightPx,
                    authorAttributions: ph.authorAttributions,
                    html_attributions: (ph.authorAttributions || []).map((a: any) => a.displayName || ""),
                  });
                }
              }
            }
          }
        } catch (searchErr) {
          console.warn("[handlePlaceDetails] Search enrichment error:", searchErr);
        }

        placeResult.photos = Array.from(photoMap.values());
      }
    }
  } catch (newApiErr) {
    console.warn("[handlePlaceDetails] Places API (New) Details failed, attempting fallback:", newApiErr);
  }

  // If Places API (New) succeeded, return normalized result
  if (placeResult) {
    return {
      status: "OK",
      result: placeResult,
    };
  }

  // Fallback to legacy API if Places API (New) failed
  try {
    const params = new URLSearchParams({
      place_id: targetPlaceId,
      key: apiKey,
      fields: "place_id,name,formatted_address,geometry,photos,rating,user_ratings_total,types,address_components",
    });

    if (body?.sessiontoken) {
      params.append("sessiontoken", body.sessiontoken);
    }

    return await fetchGoogleApi(GOOGLE_LEGACY_PLACE_DETAILS_URL, params);
  } catch (legacyErr: any) {
    console.error("[handlePlaceDetails] Legacy place details fallback also failed:", legacyErr);
    return {
      status: "NOT_FOUND",
      error_message: legacyErr?.message || "Failed to retrieve place details",
      result: null,
    };
  }
}
