declare const Deno: any;

export function getGoogleApiKey(): string {
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY environment variable is not set.");
  }
  return apiKey;
}

export async function fetchGoogleApi(url: string, params: URLSearchParams): Promise<any> {
  const response = await fetch(`${url}?${params.toString()}`);
  if (!response.ok) {
    let errorDetail = `Google API returned status ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson?.error_message) {
        errorDetail += `: ${errorJson.error_message}`;
      }
    } catch {}
    throw new Error(errorDetail);
  }
  return response.json();
}
