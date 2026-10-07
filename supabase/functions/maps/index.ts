import { corsHeaders } from "./shared/cors.ts";
import { handleAutocomplete } from "./handlers/autocomplete.ts";
import { handlePlaceDetails } from "./handlers/placeDetails.ts";
import { handleGeocode } from "./handlers/geocode.ts";
import { handlePlacePhoto } from "./handlers/placePhoto.ts";
import { handleDiscoveryPlaces } from "./handlers/discoveryPlaces.ts";
import { handleMovies } from "./handlers/movies.ts";

declare const Deno: any;

Deno.serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Handle GET / HEAD requests (specifically for place photos in <img src="...">)
    if (req.method === "GET" || req.method === "HEAD") {
      const url = new URL(req.url);
      const action = url.searchParams.get("action");
      if (action === "photo" || action === "place-photo") {
        const photoRef = url.searchParams.get("photo_reference") || url.searchParams.get("photoreference");
        const maxWidth = url.searchParams.get("maxwidth") || "800";
        if (!photoRef) {
          return new Response(JSON.stringify({ error: "Missing photo_reference query parameter" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return await handlePlacePhoto(photoRef, maxWidth);
      }

      return new Response(JSON.stringify({ error: "Invalid GET request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    let result;
    if (action === "autocomplete") {
      result = await handleAutocomplete(body);
    } else if (action === "place-details") {
      result = await handlePlaceDetails(body);
    } else if (action === "geocode") {
      result = await handleGeocode(body);
    } else if (action === "places-discovery" || action === "nearby-places" || action === "places-search") {
      result = await handleDiscoveryPlaces(body, req);
    } else if (action === "photo" || action === "place-photo") {
      const photoRef = body?.photo_reference || body?.photoreference;
      const maxWidth = body?.maxwidth || "800";
      if (!photoRef) {
        throw new Error("Missing 'photo_reference' parameter.");
      }
      return await handlePlacePhoto(photoRef, maxWidth);
    } else if (
      action === "movies-discover" ||
      action === "movies-search" ||
      action === "movie-details" ||
      action === "movies-genres" ||
      action === "movies"
    ) {
      result = await handleMovies(body);
    } else {
      return new Response(JSON.stringify({ error: `Invalid action: ${action}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Edge Function Error]:", error);
    const status = error.message.includes("Missing") ? 400 : 500;
    return new Response(JSON.stringify({ error: error.message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
