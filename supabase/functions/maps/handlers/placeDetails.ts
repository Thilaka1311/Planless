import { getGoogleApiKey, fetchGoogleApi } from "../shared/google.ts";

const GOOGLE_PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

export async function handlePlaceDetails(body: any): Promise<any> {
  const targetPlaceId = body?.placeid || body?.placeId || body?.place_id;
  if (!targetPlaceId) {
    throw new Error("Missing 'placeid' parameter.");
  }

  const apiKey = await getGoogleApiKey();
  const wantAllPhotos = Boolean(body?.all_photos || body?.allPhotos);

  // 1. Fetch standard place details from Google legacy API
  const params = new URLSearchParams({
    place_id: targetPlaceId,
    key: apiKey,
    fields: "place_id,name,formatted_address,geometry,photos,rating,user_ratings_total,types,address_components",
  });

  if (body?.sessiontoken) {
    params.append("sessiontoken", body.sessiontoken);
  }

  const legacyData = await fetchGoogleApi(GOOGLE_PLACE_DETAILS_URL, params);

  // 2. If all photos requested (Admin Edit card opened), fetch complete photo set across
  // Place Details and Text Search to bypass Google's 10-photo single-call ceiling
  if (wantAllPhotos) {
    try {
      const photoMap = new Map<string, any>();

      let placeName = legacyData?.result?.name || "";
      let placeAddress = legacyData?.result?.formatted_address || "";

      // A. Query Places API (New) Place Details
      const newPlacesRes = await fetch(`https://places.googleapis.com/v1/places/${targetPlaceId}`, {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "id,displayName,formattedAddress,photos",
        },
      });

      if (newPlacesRes.ok) {
        const newData = await newPlacesRes.json();
        if (newData.displayName?.text) placeName = newData.displayName.text;
        if (newData.formattedAddress) placeAddress = newData.formattedAddress;

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
      }

      // B. Query Places API (New) Text Search for the specific venue to capture
      // search-ranked photos that differ from the place-details 10-photo set
      if (placeName) {
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
              (searchData.places || []).find((p: any) => p.id === targetPlaceId) ||
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
      }

      // C. Include legacy photos if not already present
      if (Array.isArray(legacyData?.result?.photos)) {
        for (const ph of legacyData.result.photos) {
          const ref = ph.photo_reference || ph.name;
          if (!ref) continue;
          const cleanKey = ref.split("/photos/").pop() || ref;
          if (!photoMap.has(cleanKey)) {
            photoMap.set(cleanKey, ph);
          }
        }
      }

      if (!legacyData.result) legacyData.result = {};
      legacyData.result.photos = Array.from(photoMap.values());
    } catch (newApiErr) {
      console.warn("[handlePlaceDetails] Failed to fetch all photos:", newApiErr);
    }
  }

  return legacyData;
}
