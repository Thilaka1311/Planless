import { ISearchProvider, SearchProviderType, SearchStrategy, ProviderCandidateResult, RawCandidatePlace } from "../types/provider";
import { supabase, SUPABASE_URL } from "../../../../../lib/supabaseClient";


export class GooglePlacesProvider implements ISearchProvider {
  readonly id: SearchProviderType = "GOOGLE_PLACES";

  async search(strategy: SearchStrategy): Promise<ProviderCandidateResult> {
    try {
      const photoBaseUrl = `${SUPABASE_URL}/functions/v1/maps`;
      const lat = strategy.locationBias?.latitude;
      const lng = strategy.locationBias?.longitude;
      const radius = strategy.locationBias?.radiusMeters || strategy.radiusMeters || 10000;

      const body: Record<string, any> = {
        action: "places-discovery",
        endpoint: strategy.endpoint === "nearby_search" ? "nearby" : "text_search",
        category: strategy.category || "ALL",
        latitude: lat,
        longitude: lng,
        city: strategy.city,
        cityBounds: strategy.cityBounds,
        radius,
        photoBaseUrl,
      };

      if (strategy.pageToken) {
        body.pageToken = strategy.pageToken;
      }

      if (strategy.query) {
        body.query = strategy.query;
        body.queries =
          strategy.queries && strategy.queries.length > 0
            ? [strategy.query, ...strategy.queries.filter((q) => q !== strategy.query)]
            : [strategy.query];
      } else if (strategy.queries && strategy.queries.length > 0) {
        body.queries = strategy.queries;
        body.query = strategy.queries[0];
      }

      const { data, error } = await supabase.functions.invoke("maps", {
        body,
      });

      if (error) {
        let errorDetail = error.message;
        try {
          if ((error as any).context && typeof (error as any).context.text === "function") {
            const status = (error as any).context.status;
            const text = await (error as any).context.clone().text();
            errorDetail = `HTTP ${status}: ${text || error.message}`;
          }
        } catch {}
        console.warn("[GooglePlacesProvider] Maps invocation error:", errorDetail);
        return {
          candidates: [],
          nextPageToken: null,
          searchCoordinates: lat && lng ? { latitude: lat, longitude: lng } : null,
        };
      }

      // Check for rawPlaces first, fallback to items or sections
      const rawPlaces: any[] = Array.isArray(data?.rawPlaces)
        ? data.rawPlaces
        : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.sections?.[0]?.items)
        ? data.sections[0].items
        : [];

      const candidates: RawCandidatePlace[] = rawPlaces
        .map((p: any) => {
          if (!p) return null;
          const placeId = p.place_id || (typeof p.id === "string" ? p.id.replace(/^place_/, "") : null);
          if (!placeId) return null;

          const pLat =
            typeof p.geometry?.location?.lat === "number"
              ? p.geometry.location.lat
              : typeof p.latitude === "number"
              ? p.latitude
              : null;

          const pLng =
            typeof p.geometry?.location?.lng === "number"
              ? p.geometry.location.lng
              : typeof p.longitude === "number"
              ? p.longitude
              : null;

          const name = p.name || p.title || "Unnamed Place";
          const vicinity = p.vicinity || p.formatted_address || p.place_address || p.location || "";

          return {
            place_id: placeId,
            name,
            title: name,
            category: p.category,
            subcategory: p.subcategory,
            description: p.description || vicinity,
            types: Array.isArray(p.types) ? p.types : [],
            latitude: pLat,
            longitude: pLng,
            vicinity,
            formatted_address: p.formatted_address || vicinity,
            rating: typeof p.rating === "number" ? p.rating : null,
            user_ratings_total: typeof p.user_ratings_total === "number" ? p.user_ratings_total : null,
            photos: Array.isArray(p.photos) ? p.photos : [],
            cover_image_url: p.cover_image_url || null,
            photo_references: Array.isArray(p.photo_references)
              ? p.photo_references
              : (Array.isArray(p.photos)
                ? p.photos.map((ph: any) => ph?.photo_reference).filter(Boolean)
                : null),
            // Retain raw object for downstream normalization
            _raw: p,
          };
        })
        .filter(Boolean) as RawCandidatePlace[];

      return {
        candidates,
        nextPageToken: data?.nextPageToken || null,
        searchCoordinates: lat && lng ? { latitude: lat, longitude: lng } : null,
      };
    } catch (err: any) {
      console.error("[GooglePlacesProvider] Search failed:", err);
      return {
        candidates: [],
        nextPageToken: null,
      };
    }
  }
}
