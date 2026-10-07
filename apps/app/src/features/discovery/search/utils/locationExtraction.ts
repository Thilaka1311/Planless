import { normalizeSearchText } from "./stringMatching";
import { LocationQualifier } from "../types/intent";

const PREPOSITION_REGEX = /\b(near|in|around|at|close to|nearby)\s+([a-zA-Z0-9\s-]+)$/i;

// Common Bangalore localities for quick deterministic identification
const KNOWN_LOCALITIES = new Set([
  "koramangala",
  "indiranagar",
  "hsr layout",
  "hsr",
  "whitefield",
  "jp nagar",
  "jayanagar",
  "mg road",
  "brigade road",
  "church street",
  "richmond town",
  "richmond road",
  "bellandur",
  "marathahalli",
  "electronic city",
  "sarjapur",
  "sarjapur road",
  "btm layout",
  "btm",
  "banashankari",
  "malleshwaram",
  "rajajinagar",
  "sadashivanagar",
  "hebbal",
  "yelahanka",
  "vidyaranyapura",
  "kammanahalli",
  "kalyan nagar",
  "frazer town",
  "ulsoor",
  "halasuru",
  "vasanth nagar",
  "cunningham road",
  "lavelle road",
  "residency road",
]);

const EXCLUDED_LOCATION_TOKENS = new Set([
  "imax",
  "4dx",
  "3d",
  "2d",
  "hd",
  "english",
  "hindi",
  "kannada",
  "tamil",
  "telugu",
  "malayalam",
  "night",
  "morning",
  "evening",
]);

export interface ExtractedLocationResult {
  hasLocationQualifier: boolean;
  cleanSearchTerm: string;
  locationQualifier?: LocationQualifier;
  isPureLocation: boolean;
}

/**
 * Extracts location anchors from search queries.
 * E.g. "football turf near Koramangala" -> cleanSearchTerm: "football turf", location: "Koramangala"
 * E.g. "Koramangala" -> cleanSearchTerm: "Koramangala", isPureLocation: true
 */
export function extractQueryLocation(rawQuery: string): ExtractedLocationResult {
  const trimmed = rawQuery.trim();
  const normalized = normalizeSearchText(trimmed);

  if (!trimmed) {
    return { hasLocationQualifier: false, cleanSearchTerm: "", isPureLocation: false };
  }

  // 1. Check if the query is a pure known locality
  if (KNOWN_LOCALITIES.has(normalized)) {
    return {
      hasLocationQualifier: true,
      cleanSearchTerm: trimmed,
      locationQualifier: {
        raw: trimmed,
        normalized: normalized,
      },
      isPureLocation: true,
    };
  }

  // 2. Check for prepositions: "near <loc>", "in <loc>", "around <loc>"
  const match = trimmed.match(PREPOSITION_REGEX);
  if (match) {
    const rawPrepAndLoc = match[0]; // e.g. "near Koramangala"
    const locPart = match[2].trim(); // e.g. "Koramangala"
    const normLoc = normalizeSearchText(locPart);
    const cleanTerm = trimmed.slice(0, match.index).trim(); // e.g. "football turf"

    if (cleanTerm.length > 0 && locPart.length > 0 && !EXCLUDED_LOCATION_TOKENS.has(normLoc)) {
      return {
        hasLocationQualifier: true,
        cleanSearchTerm: cleanTerm,
        locationQualifier: {
          raw: locPart,
          normalized: normLoc,
        },
        isPureLocation: false,
      };
    }
  }

  return {
    hasLocationQualifier: false,
    cleanSearchTerm: trimmed,
    isPureLocation: false,
  };
}
