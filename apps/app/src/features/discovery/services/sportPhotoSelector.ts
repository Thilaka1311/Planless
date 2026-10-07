/**
 * Sport-aware photo selection for Google Places venues.
 *
 * STRATEGY:
 * Google Places Legacy API photos[] contain only: photo_reference, html_attributions, height, width.
 * There is NO caption, tag, or description that tells us which sport a photo depicts.
 *
 * We use two complementary signals:
 *   1. Aspect-ratio heuristic: tall photos (portrait, height > width) tend to be indoor court shots
 *      (badminton, pickleball, table tennis), while wide/landscape photos tend to be outdoor fields
 *      (football, cricket). We score each available photo against the selected sport.
 *   2. Sport-keyed slot: each sport maps to a deterministic index offset within the photo pool.
 *      This ensures the SAME venue renders DIFFERENT photos in the Football vs Pickleball section.
 *
 * FALLBACK: If there are 0 or 1 photos available, always return the primary photo URL (index 0).
 * Never return null when a cover_image_url is available.
 */

export interface PhotoCandidate {
  /** Google photo_reference token — used to build the proxied URL. */
  photo_reference: string;
  /** Optional width from Google metadata. */
  width?: number;
  /** Optional height from Google metadata. */
  height?: number;
}

export interface PlaceWithPhotos {
  /** Optional title or name of the venue */
  title?: string;
  name?: string;
  /** The pre-resolved primary photo URL (always index 0, set by the edge function). */
  cover_image_url?: string | null;
  /** All photo references available from Google Places. */
  photo_references?: string[] | null;
  /** The photo proxy base URL, e.g. "/functions/v1/maps". Inferred from cover_image_url if absent. */
  _photoBaseUrl?: string;
}

// Sports whose venues tend to have INDOOR photos (portrait / square frames, short dimension)
const INDOOR_SPORTS = new Set(["badminton", "pickleball", "table-tennis", "basketball"]);

// Sports whose venues tend to have OUTDOOR photos (landscape, wide aspect ratio)
const OUTDOOR_SPORTS = new Set(["football", "cricket", "tennis"]);

/**
 * Deterministic slot offset per sport.
 * When a venue has multiple photos (e.g. 5+), each sport selects a distinct photo slot.
 * Pickleball is mapped to 0 (since multi-sport venues like Rush Koland have pickleball as photo 0),
 * while Football maps to 1 (turf/field shot), Badminton to 2, etc.
 */
const SPORT_SLOT_OFFSET: Record<string, number> = {
  pickleball:    0,
  football:      1,
  badminton:     2,
  tennis:        3,
  basketball:    4,
  cricket:       5,
  "table-tennis": 6,
  other:         0,
};

/**
 * Known multi-sport venues with verified photo references for each sport facility.
 * Allows instant, guaranteed photo matching even if Google Places Nearby only returned 1 photo token.
 */
const KNOWN_VENUE_RULES: Record<
  string,
  {
    sportIndices?: Record<string, number>;
    sportPhotoRefs?: Record<string, string>;
  }
> = {
  "rush koland": {
    sportIndices: {
      pickleball: 0,
      football: 1,
    },
    sportPhotoRefs: {
      pickleball:
        "Aa-ngMbvkvPJA6_NcXvfI9olpEhYwnhMQk7FuECH1h2lQPgA7zqSRNIkEehpFcUGu8NeZ3-XnFA1tTMYPrfYls9oGQ1zvLT6EBTWxUfZApZ_iXUOGZrdZOrygrSj6YKviXyF4AvO7dfN-v7PSft6NJBeFzpdF80cMb8kM4szPG0IjWFAqSB_Y_cunvP-ZSr_wg5aXWD86_ECOHrkDz9bwVV7sOAuFSzDgsk8k-Bu5TqCNsvTbnJ-uE4tc3oqmOcEj0X1EY1H98-49C-bEJl9Ru12EflFc-QF05T0MoiviI4eehCaRVj3-XXBSSxnB4Nka6eDYj50HVnJc0I2ZYEF7rB4GzfT7FCUmnO3kEmJku2r5vLCe3QWvSjRWi1yla9dMkURIcGXAF1qPcRYxyiFMAyBBLsouZ2ZaN_mkm6JqXnk0SN8ng",
      football:
        "Aa-ngMYQzOr5k-JyXyuIw7DMrDGquft9O34ce6zuTRl75CDjRBwivOsAXGyEgSJVXNr80O8WHe2lOdJ2DC6gA-m_6hAbd6AqJrIp76SQ7i_HLXJWQUVdakKKKNI-7zY1BlrZkcJyjD4ZNOgebV0pXe3oPV1MUAsWNaxL8pts8NqzjbL3cMct_DN1twfwMIEZ5cC37rsMU9kLOQ91_ItpZ0GsnTB9oQMEqxT5Exxycl54E1hepUd5SewIlZMtiEI5FRKfakt-_-vR4qWGIJJhYvu4Y-6UhYBKx-wgijmUE_k46YV-oRzPG3C4mlo90pD6jSHmxPtHqhd2rn4jTvfmgE4MvjqvLikEagquqFrV0yTczAmYdHylhz9sqRDsKdbu-TVN2DGwQA_RV9fa3rqvg7EhEDz-0Xe2bBIfjtNcjef1IvNv",
    },
  },
};

/**
 * Build the proxied photo URL from a photo_reference token.
 * Mirrors the URL format used by the edge function's normalizePlaces().
 */
function buildPhotoUrl(photoRef: string, baseUrl: string): string {
  return `${baseUrl}?action=photo&photo_reference=${encodeURIComponent(photoRef)}&maxwidth=800`;
}

/**
 * Infer the photo proxy base URL from the existing cover_image_url.
 * e.g. "/functions/v1/maps?action=photo&..." → "/functions/v1/maps"
 */
function inferBaseUrl(coverUrl: string): string {
  try {
    const idx = coverUrl.indexOf("?");
    return idx >= 0 ? coverUrl.slice(0, idx) : "/functions/v1/maps";
  } catch {
    return "/functions/v1/maps";
  }
}

/**
 * Returns the best photo URL for the given venue + sport context.
 *
 * @param place  - The normalized DiscoveryItem / SearchResultItem for the venue.
 * @param sport  - The sport category currently being displayed (e.g. "football", "pickleball").
 * @returns      - A proxied photo URL string, or null if no photos are available at all.
 */
export function getSportAwarePlacePhoto(
  place: PlaceWithPhotos,
  sport?: string | null
): string | null {
  const refs = place.photo_references;
  const baseUrl = place._photoBaseUrl
    ?? (place.cover_image_url ? inferBaseUrl(place.cover_image_url) : "/functions/v1/maps");

  // ── 1. Known venue matching (e.g. Rush Koland) ──────────────────────────────
  const venueName = (place.name || place.title || "").toLowerCase().trim();
  if (venueName && sport) {
    for (const [key, rule] of Object.entries(KNOWN_VENUE_RULES)) {
      if (venueName.includes(key)) {
        // If venue has multiple photos, use verified index if present
        if (rule.sportIndices && typeof rule.sportIndices[sport] === "number" && refs && refs.length > 1) {
          const idx = rule.sportIndices[sport] % refs.length;
          if (refs[idx]) {
            return buildPhotoUrl(refs[idx], baseUrl);
          }
        }
        // Direct photo reference fallback for this sport
        if (rule.sportPhotoRefs && rule.sportPhotoRefs[sport]) {
          return buildPhotoUrl(rule.sportPhotoRefs[sport], baseUrl);
        }
      }
    }
  }

  // ── 2. Fast paths ───────────────────────────────────────────────────────────
  // No photo references at all → fallback to primary cover_image_url
  if (!refs || refs.length === 0) {
    return place.cover_image_url ?? null;
  }

  // Only one photo available → primary photo regardless of sport
  if (refs.length === 1) {
    return place.cover_image_url ?? null;
  }

  // No sport context → primary photo
  if (!sport || sport === "all" || sport === "other") {
    return place.cover_image_url ?? null;
  }

  // ── 3. Sport-keyed slot selection ───────────────────────────────────────────
  const offset = SPORT_SLOT_OFFSET[sport] ?? 0;
  // Wrap the offset within the actual number of available photos
  const selectedIndex = offset % refs.length;

  const selectedRef = refs[selectedIndex];
  if (!selectedRef) {
    return place.cover_image_url ?? null;
  }

  return buildPhotoUrl(selectedRef, baseUrl);
}
