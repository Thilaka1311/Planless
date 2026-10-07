import { DiscoveryItem } from "../../../core/types/discovery";

/**
 * Common city, state, and country names that represent broad geographic entities
 * rather than specific neighborhood/area localities.
 */
const GENERIC_GEO_WORDS = new Set([
  "india",
  "usa",
  "united states",
  "uk",
  "united kingdom",
  "australia",
  "canada",
  "karnataka",
  "maharashtra",
  "delhi",
  "tamil nadu",
  "telangana",
  "kerala",
  "andhra pradesh",
  "west bengal",
  "gujarat",
  "rajasthan",
  "bengaluru",
  "bangalore",
  "bangalore urban",
  "bangalore rural",
  "mumbai",
  "bombay",
  "mumbai suburban",
  "new delhi",
  "delhi ncr",
  "chennai",
  "madras",
  "hyderabad",
  "secunderabad",
  "cyberabad",
  "kolkata",
  "calcutta",
  "pune",
  "ahmedabad",
  "jaipur",
  "chandigarh",
  "goa",
  "kochi",
]);

/**
 * Detects postal codes (e.g. "560102") or broad administrative regions (e.g. "Karnataka", "Bengaluru").
 */
function isPostalOrAdmin(s: string): boolean {
  if (/\b\d{5,6}\b/.test(s)) return true;
  const lower = s.trim().toLowerCase();
  for (const geo of GENERIC_GEO_WORDS) {
    if (lower === geo || lower.startsWith(geo + " ") || lower.endsWith(" " + geo)) {
      return true;
    }
  }
  return false;
}

/**
 * Detects street numbers, door numbers, or Google Plus codes (e.g. "XH9V+949", "No. 47", "#12/A").
 */
function isStreetNumberOrPureDigits(s: string): boolean {
  const trimmed = s.trim();
  return (
    /^[#\d\-/,\s]+$/.test(trimmed) ||
    /^[a-z0-9+]{4,8}\+[a-z0-9]{2,4}$/i.test(trimmed) ||
    /^no\.?\s*\d+/i.test(trimmed)
  );
}

/**
 * Detects likely physical street/road names (e.g. "100 Feet Rd", "Museum Road", "5th Cross").
 */
function isLikelyStreet(s: string): boolean {
  const lower = s.trim().toLowerCase();
  return (
    /\b(road|rd|street|st|lane|ln|cross|main rd|ave|avenue|blvd|boulevard|highway|floor|gate)\b/i.test(lower) ||
    /^\d+([a-z]{2})?\s+(main|cross|road|street)/i.test(lower)
  );
}

/**
 * Trims leading and trailing punctuation, spaces, or delimiter artifacts.
 */
function cleanLocalityString(str: string): string {
  return str
    .replace(/^[-–—|,\s]+/, "")
    .replace(/[-–—|,\s]+$/, "")
    .trim();
}

/**
 * Checks whether a candidate locality string is essentially identical to the venue title.
 */
function isDuplicateOfTitle(candidate: string, placeTitle?: string | null): boolean {
  if (!placeTitle) return false;
  const candNorm = candidate.toLowerCase().replace(/[,.\s]+/g, "");
  const titleNorm = placeTitle.toLowerCase().replace(/[,.\s]+/g, "");
  return candNorm === titleNorm;
}

/**
 * Extracts the single most relevant area or locality from a Google Places address or location string.
 * Walk backwards before city/postal code to identify the neighborhood (e.g. "HSR Layout", "Indiranagar").
 */
export function extractLocalityFromAddress(
  rawAddress?: string | null,
  placeTitle?: string | null
): string | null {
  if (!rawAddress || !rawAddress.trim()) return null;

  const trimmed = rawAddress.trim();
  if (
    trimmed.toLowerCase() === "nearby" ||
    trimmed.toLowerCase() === "location removed" ||
    trimmed.toLowerCase() === "in theatres"
  ) {
    return null;
  }

  // Split by comma or dash/pipe with surrounding spaces
  const parts = trimmed
    .split(/,|\s+[-–—|]\s+/)
    .map((p) => cleanLocalityString(p))
    .filter(Boolean);

  if (parts.length === 0) return null;

  const isValidLocalityCandidate = (p: string) => {
    if (!p || p.length < 2 || p.length > 60) return false;
    if (isPostalOrAdmin(p)) return false;
    if (isStreetNumberOrPureDigits(p)) return false;
    if (isDuplicateOfTitle(p, placeTitle)) return false;
    return true;
  };

  // 1. Primary pass (right-to-left): Find first candidate that is not a city/admin and NOT a pure street
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (isValidLocalityCandidate(p) && !isLikelyStreet(p)) {
      return p;
    }
  }

  // 2. Secondary fallback: If all candidates are street-like (e.g. "MG Road"), return the street name
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (isValidLocalityCandidate(p)) {
      return p;
    }
  }

  return null;
}

/**
 * Resolves the area/locality for a DiscoveryItem using:
 * 1. Google Places structured address_components if available
 * 2. place_address / location / vicinity strings
 */
export function resolveVenueLocality(item: DiscoveryItem): string | null {
  if (!item) return null;

  // 1. Check structured Google address_components if present
  const addressComponents =
    (item as any).address_components ||
    (item as any)._raw?.address_components ||
    null;

  if (Array.isArray(addressComponents) && addressComponents.length > 0) {
    const comp = addressComponents.find((c: any) =>
      c.types?.some((t: string) =>
        ["sublocality_level_1", "sublocality", "neighborhood", "sublocality_level_2"].includes(t)
      )
    );
    if (comp?.long_name) {
      return cleanLocalityString(comp.long_name);
    }
  }

  // 2. Derive from address / location / vicinity fields
  const rawAddress =
    item.place_address ||
    (item as any).vicinity ||
    (item as any).formatted_address ||
    item.location ||
    (item as any)._raw?.vicinity ||
    (item as any)._raw?.formatted_address ||
    (item.description && item.description !== item.title ? item.description : "") ||
    "";

  return extractLocalityFromAddress(rawAddress, item.title);
}
