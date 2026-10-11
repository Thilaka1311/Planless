# Discovery Venue Image Pipeline Audit Report

**Date:** 2026-10-11  
**Project:** Planless (`apps/app`)  
**Scope:** Discovery Category Image Pipeline (Sports, Dining, Activities, Movies, Events, Shared Venue Cards)  
**Deliverable Path:** `docs/discovery/DISCOVERY_IMAGE_LOADING_AUDIT.md`  
**Status:** Audit Completed (Read-Only Inspection — No code or database changes applied)

---

## 1. Executive Summary

### 1.1 Problem Statement
Across Planless discovery feeds, venue cards in **Sports**, **Dining**, **Activities**, and other venue-based categories are consistently failing to display actual venue images. Instead, every card in a given category renders an identical, static fallback asset (for example, all sports venues display the generic sports equipment illustration `sports.webp`, as seen in the user-provided screenshot).

### 1.2 Core Audit Findings
1. **Primary Root Cause — Google Cloud Project Billing & Quota Lockout:**
   The Google Maps API key configured in both local and production Supabase Edge Functions is authenticated against Google Cloud Project `#439259333682`. Google Cloud has disabled API calls because **billing is not enabled or active** on this project (`403 PERMISSION_DENIED: This API method requires billing to be enabled`), and legacy/new quotas are exhausted (`429 RESOURCE_EXHAUSTED: Quota exceeded for quota metric 'SearchTextRequest per day'`).
2. **Secondary Root Cause — Edge Function Photo Proxy Returns HTTP 403 JSON for `<img>` Elements:**
   When Google rejects the photo request, `supabase/functions/maps/handlers/placePhoto.ts` returns `HTTP 403 Forbidden` with a JSON payload (`{"error":"Failed to retrieve photo"}`). When the browser's native `<img>` tag attempts to render this JSON as an image, it triggers `<img onError>`, tripping `PlanImages.tsx` into a failure state and falling back to the generic category banner (`sports.webp`).
3. **Tertiary Root Cause — 100% of Database Overrides Rely Exclusively on Google Photo References:**
   In `public.discovery_place_overrides`, **100% of records** (80 of 80 rows in production, 85 of 85 in local) have `image_path = NULL`. All 71 overrides that specify images store only a `google_photo_reference`. When Google Places Photo API is blocked, **database overrides fail identically to live Google Places results**, completely nullifying the database override protection layer.
4. **Discovery Stream Cascading Effect:**
   Because Google Places Text Search is blocked with `REQUEST_DENIED` / `429`, live discovery returns zero venue candidates. The system triggers fallback `getDatabasePlacesForCategoryAndDistanceBand`, injecting only database override venues. Because their photo references also fail, the screen is filled with 100% database override venues that all fall back to `sports.webp`.
5. **Category Exception — Movies:**
   Movies do not use Google Places or `discovery_place_overrides`. Movies query TMDB (`https://image.tmdb.org/t/p/w500/...`) via `tmdbMovieService.ts`, and therefore display movie posters without issue.

---

## 2. Image Architecture & Data Flow

The diagram and trace below map the complete journey from data retrieval to final UI rendering:

```
+---------------------------------------------------------------------------------------------------+
| 1. Discovery Stream Hook & Service                                                                |
|    - useDiscoveryStream.ts / useSportsStream.ts                                                   |
|    - discoveryStreamService.ts -> invokes Supabase Edge Function 'maps' (action: places-discovery)|
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| 2. Edge Function: discoveryPlaces.ts                                                             |
|    - Calls Google Places API (New) searchText                                                     |
|    - Extracts photos via extractOwnerPhotos() / isOwnerAuthor() filter                            |
|    - If Google API fails (403/429) -> Returns empty items array []                                |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| 3. Zero-Candidate Recovery: discoveryStreamService.ts                                             |
|    - getDatabasePlacesForCategoryAndDistanceBand() queries public.discovery_place_overrides       |
|    - Injects known override venues into discovery stream                                          |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| 4. Override Resolution: placeOverridesService.ts                                                 |
|    - applyPlaceOverrides() matches venue by cleanId                                               |
|    - Checks override.image_path (NULL for all 80 rows)                                            |
|    - Sets cover_image_url = `${SUPABASE_URL}/functions/v1/maps?action=photo&photo_reference=...`   |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| 5. UI Rendering: DiscoveryCard.tsx -> DiscoveryImages (PlanImages.tsx)                            |
|    - Mounts <img src={cover_image_url} onError={handleLoadFailure} />                             |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| 6. Image Request: GET /functions/v1/maps?action=photo&photo_reference=...                         |
|    - placePhoto.ts forwards to Google Places API (New) media endpoint                             |
|    - Google returns 403 PERMISSION_DENIED (Billing required)                                      |
|    - placePhoto.ts returns HTTP 403 JSON: {"error":"Failed to retrieve photo"}                     |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| 7. Fallback Trigger                                                                               |
|    - Browser fails to decode JSON as image -> fires onError                                       |
|    - PlanImages.tsx sets localFailed = true                                                       |
|    - Calls getPlanCover("sports") -> resolves /assets/plans/covers/sports.webp                     |
|    - Result: Generic sports equipment image displayed on all cards                                |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. Root Cause Analysis

### 3.1 Root Cause 1: Google Cloud Project Billing Disabled (Primary Cause)
* **Target Project:** Google Cloud Project `#439259333682`
* **Affected Endpoints:**
  1. `https://places.googleapis.com/v1/{photoReference}/media?maxHeightPx=1200&maxWidthPx=1200&skipHttpRedirect=true`
  2. `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photoreference={ref}`
  3. `https://places.googleapis.com/v1/places:searchText`
  4. `https://maps.googleapis.com/maps/api/place/textsearch/json`
* **Direct Error Output from Google:**
  ```json
  {
    "error": {
      "code": 403,
      "message": "This API method requires billing to be enabled. Please enable billing on project #439259333682 by visiting https://console.developers.google.com/billing/enable?project=439259333682 then retry. If you enabled billing for this project recently, wait a few minutes for the action to execute and retry.",
      "status": "PERMISSION_DENIED",
      "details": [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          "reason": "BILLING_DISABLED",
          "domain": "googleapis.com",
          "metadata": {
            "consumer": "projects/439259333682",
            "service": "places.googleapis.com"
          }
        }
      ]
    }
  }
  ```
  And on search endpoints:
  ```json
  {
    "error": {
      "code": 429,
      "message": "Quota exceeded for quota metric 'SearchTextRequest' and limit 'SearchTextRequest per day' of service 'places.googleapis.com' for consumer 'project_number:439259333682'.",
      "status": "RESOURCE_EXHAUSTED"
    }
  }
  ```
* **Impact:** Every single attempt to fetch a photo via Google Places API fails immediately with HTTP 403.

---

### 3.2 Root Cause 2: Edge Function Photo Proxy Returns HTTP 403 JSON Body to `<img>` Tags
* **File:** `supabase/functions/maps/handlers/placePhoto.ts` (lines 48–53)
* **Code:**
  ```typescript
  if (!response.ok) {
    console.error(`[places-photo] Error fetching photo: ${response.statusText}`);
    return new Response(JSON.stringify({ error: "Failed to retrieve photo" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  ```
* **Impact:** An HTML `<img src="...">` tag cannot parse JSON. When an HTTP 403 response with `Content-Type: application/json` is returned, the browser encounters a decoder failure and executes `<img onError>`.
* **Frontend Handling in `src/IMGfromDB/PlanImages.tsx`:**
  ```typescript
  const handleLoadFailure = () => {
    if (didFailRef.current) return;
    didFailRef.current = true;
    setLocalFailed(true);
    setLoaded(false);
    onLoadFailure?.();
  };
  ```
  Once `localFailed` is `true`, `PlanImages.tsx` defaults to `getPlanCover(category, title)`, resolving:
  - Sports: `/assets/plans/covers/sports.webp`
  - Dining: `/assets/plans/covers/dining.webp`
  - Activities: `/assets/plans/covers/activity.png`

---

### 3.3 Root Cause 3: Database Overrides Rely 100% on `google_photo_reference`
* **Table:** `public.discovery_place_overrides`
* **Columns Audited:**
  - `image_path`: Expected to hold a Supabase Storage path/URL (e.g., `https://...supabase.co/storage/v1/object/public/...`).
  - `google_photo_reference`: Holds Google Places photo references (e.g., `places/ChIJ.../photos/AUjq...` or legacy tokens).
* **Database State (Production):**
  - Total records: **80 rows**
  - Records with `image_path` populated: **0 rows (0%)** — 100% of records are `NULL`.
  - Records with `google_photo_reference` populated: **71 rows (88.75%)**.
  - Records with neither: 9 rows (11.25%).
* **Application Mapping in `src/features/discovery/services/placeOverridesService.ts`:**
  ```typescript
  const imageUrl = override.image_path || (override.google_photo_reference
    ? `${supabaseUrl}/functions/v1/maps?action=photo&photo_reference=${encodeURIComponent(override.google_photo_reference)}`
    : null);
  ```
* **Impact:** Because `image_path` was never populated with self-hosted images, database overrides are completely dependent on the Google Places photo media API. When the Google Places API fails, the database overrides fail simultaneously.

---

### 3.4 Root Cause 4: Overly Strict Author Attribution Filter Drops Legitimate Google Photos
* **Files:**
  - `supabase/functions/maps/handlers/discoveryPlaces.ts` (lines 61–87)
  - `src/features/discovery/services/venueRelevance.ts` (lines 724–749)
* **Code in `venueRelevance.ts`:**
  ```typescript
  function isOwnerAuthor(authorName: string, venueName: string): boolean {
    const cleanAuthor = authorName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleanVenue = venueName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!cleanAuthor || !cleanVenue) return false;
    return cleanAuthor.includes(cleanVenue) || cleanVenue.includes(cleanAuthor);
  }
  ```
* **Impact:** Google Places returns crowdsourced user, local guide, and owner photos. On venues where the business owner did not upload the photo under their exact business name (common for sports grounds, turf venues, and independent cafes), `extractOwnerPhotos` discards **all** photo references.
* When stripped, `discoveryPlaces.ts` falls back to `getCuratedPhotoForVenue(place.name, place.category)`, which returns local stock images like `/assets/curated/sports_turf.jpg` or falls back to category defaults.

---

## 4. Database Override Findings

### 4.1 Schema Inspection
The table `public.discovery_place_overrides` exists in both local and production databases with identical structure:

| Column Name | Data Type | Nullable | Default | Purpose |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary Key |
| `place_id` | `text` | NO | None | Unique Place ID (Google Place ID or internal key) |
| `category` | `text` | YES | None | Discovery Category (`SPORTS`, `DINING`, `ACTIVITIES`, etc.) |
| `image_path` | `text` | YES | None | Storage asset path / direct URL |
| `google_photo_reference` | `text` | YES | None | Google Places Photo Resource Name / Reference |
| `title` | `text` | YES | None | Venue title override |
| `description` | `text` | YES | None | Venue description override |
| `is_active` | `boolean` | YES | `true` | Active status flag |
| `is_hidden` | `boolean` | YES | `false` | Soft-delete / hide flag |
| `display_order` | `integer` | YES | `0` | Card sorting order |
| `metadata` | `jsonb` | YES | `{}` | Tags, pricing, hours, contact details |
| `created_at` | `timestamptz` | YES | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | YES | `now()` | Record update timestamp |

### 4.2 Record Counts and Category Breakdown
Live query against production Supabase:
* **Total Rows:** 80
* **Category Breakdown:**
  - `SPORTS`: 31 records (all 31 have `google_photo_reference`, 0 have `image_path`)
  - `DINING`: 25 records (22 have `google_photo_reference`, 0 have `image_path`)
  - `ACTIVITIES`: 16 records (14 have `google_photo_reference`, 0 have `image_path`)
  - `OTHER`: 8 records (4 have `google_photo_reference`, 0 have `image_path`)

### 4.3 Permissions & Row Level Security (RLS)
* **RLS Status:** Enabled on `discovery_place_overrides`.
* **Policy:** `Allow public read on discovery_place_overrides` (`FOR SELECT USING (true)`).
* **Live Test:** An unauthenticated (`anon`) query executes with `status: 200`, `error: null`, returning all 80 rows. RLS is **not** blocking override reads.

### 4.4 Venue Identifier Matching
* In `src/features/discovery/services/placeOverridesService.ts`:
  ```typescript
  const cleanId = rawId.split("::")[0].replace(/^place_/, "");
  const override = overrides.get(rawId) || overrides.get(cleanId);
  ```
* Google Place IDs match format: `ChIJ...`
* Verified: A venue with `id = "ChIJj61dQgK_wjsRhx..."` matches override record with `place_id = "ChIJj61dQgK_wjsRhx..."`.
* The match succeeds and assigns `place._hasPlanlessOverride = true` and `place.cover_image_url = proxyUrl`.
* The failure occurs downstream when the browser attempts to fetch `proxyUrl`.

---

## 5. Google Places API Findings

### 5.1 Request Flow
1. Edge Function `supabase/functions/maps/handlers/placePhoto.ts` receives request:
   `GET /functions/v1/maps?action=photo&photo_reference=places/ChIJ.../photos/...&maxwidth=1200`
2. It detects the `places/.../photos/...` format and calls Places API (New):
   `GET https://places.googleapis.com/v1/{photoReference}/media?maxHeightPx=1200&maxWidthPx=1200&skipHttpRedirect=true`
3. Request includes header: `X-Goog-Api-Key: [GOOGLE_MAPS_API_KEY]`

### 5.2 Environment and Key Configuration
* **Configuration:** Both local `.env` and Supabase Edge Function Secrets contain `GOOGLE_MAPS_API_KEY`.
* **Validity:** The API key is authentic and recognized by Google.
* **Failure Mode:** Google Cloud Project `#439259333682` has rejected the requests due to:
  1. `BILLING_DISABLED` (`403 PERMISSION_DENIED`)
  2. Daily text search quota exceeded (`429 RESOURCE_EXHAUSTED`)

### 5.3 Error Swallowing
In `placePhoto.ts`, when the Google API call fails, the error is logged via `console.error` inside the Supabase Edge Function container, but only a generic `403 {"error":"Failed to retrieve photo"}` JSON is returned to the client. The frontend has no diagnostic visibility and assumes a generic network/render failure.

---

## 6. Discovery Category Comparison Matrix

| Category | Primary Data Source | Photo Pipeline | Database Override Support | Fallback Asset | Observed Status |
|---|---|---|---|---|---|
| **Sports** | Google Places + `discovery_place_overrides` | Edge Function `maps?action=photo` | Yes (31 records in DB, all photo refs) | `/assets/plans/covers/sports.webp` | **Failing** (Shows generic sports equipment) |
| **Dining** | Google Places + `discovery_place_overrides` | Edge Function `maps?action=photo` | Yes (25 records in DB) | `/assets/plans/covers/dining.webp` | **Failing** (Shows generic dining asset) |
| **Activities** | Google Places + `discovery_place_overrides` | Edge Function `maps?action=photo` | Yes (16 records in DB) | `/assets/plans/covers/activity.png` | **Failing** (Shows generic activity asset) |
| **Movies** | TMDB API (`tmdbMovieService.ts`) | TMDB CDN (`image.tmdb.org/t/p/w500`) | No (Direct TMDB IDs) | `/assets/plans/covers/movies.png` | **Working** (Renders movie posters) |
| **Nightlife / Other** | Google Places + `discovery_place_overrides` | Edge Function `maps?action=photo` | Yes (8 records in DB) | Category-specific default cover | **Failing** (Falls back to generic cover) |

---

## 7. Representative Evidence

### Trace 1: Database Override Venue (Sports)
* **Venue:** "Decathlon Mogappair"
* **Place ID:** `ChIJ7V...`
* **Raw Discovery Record:** Loaded via `getDatabasePlacesForCategoryAndDistanceBand` due to Google search outage.
* **Database Override Record:** Matched in `discovery_place_overrides`.
  - `image_path`: `null`
  - `google_photo_reference`: `places/ChIJ.../photos/AUjq...`
* **Resolved Image URL:**
  `https://[PROJECT].supabase.co/functions/v1/maps?action=photo&photo_reference=places%2FChIJ...`
* **HTTP Request Result:**
  - Status: `HTTP/1.1 403 Forbidden`
  - Response Body: `{"error":"Failed to retrieve photo"}`
* **UI Result:**
  - `<img onError>` triggers in `PlanImages.tsx`.
  - Final rendered asset: `/assets/plans/covers/sports.webp`.

### Trace 2: Live Google Places Venue (Dining)
* **Venue:** "The English Tearoom"
* **Place ID:** `ChIJh6...`
* **Edge Function Discovery Query:** `places-discovery` -> `places:searchText`.
* **API Result:** Google Places New API returns `429 RESOURCE_EXHAUSTED` / `403 PERMISSION_DENIED`.
* **Candidate Count:** 0 venues returned from live Google Places.
* **Recovery Action:** Stream recovers 25 dining places from `discovery_place_overrides`.
* **Image Request Result:** All 22 photo references return HTTP 403 Forbidden from Edge Function.
* **UI Result:** All dining cards display `/assets/plans/covers/dining.webp`.

---

## 8. Fix Recommendations

The following recommendations are structured by priority and impact. In accordance with the audit guidelines, **no code has been altered during this audit**.

### Priority 1: Google Cloud Project Billing & Quota Activation (Immediate Fix)
* **Action:** In the Google Cloud Console for Project `#439259333682`:
  1. Link an active billing account at: `https://console.cloud.google.com/billing/linkedaccount?project=439259333682`
  2. Verify that **Places API (New)** and **Places API** are enabled.
  3. Ensure daily request quotas on `SearchTextRequest` and `PlacesPhotosMediaRequest` are set appropriately.
* **Expected Outcome:** Immediately restores live venue search and Google photo retrieval across Sports, Dining, Activities, and Nightlife.

### Priority 2: Edge Function Graceful Image Fallback (Resilience Fix)
* **File:** `supabase/functions/maps/handlers/placePhoto.ts`
* **Action:**
  - Currently, line 50 returns an HTTP 403 JSON object when Google fails.
  - Instead, the Edge Function should return an **HTTP 302 Redirect** to a reliable public fallback image or return a lightweight transparent/branded SVG/WebP with `Content-Type: image/webp`.
  - Returning an actual image payload or redirect prevents the browser from generating unhandled decode errors in `<img>` tags.

### Priority 3: Decouple Database Overrides from Google Photos (Architectural Hardening)
* **Issue:** 100% of database overrides currently have `image_path = NULL`. If Google Places has an outage or quota limit, all database overrides fail.
* **Action:**
  - In `AdminPlaceEditSheet.tsx` (the place override management UI), when an admin selects or uploads a photo for a venue, fetch and upload that image to Supabase Storage (`storage.from('discovery-images')`).
  - Populate the `image_path` column with the permanent Supabase public storage URL.
  - This guarantees that curated venues **never** break, regardless of Google API status or billing issues.

### Priority 4: Relax Author Attribution Filter in Venue Discovery
* **Files:**
  - `supabase/functions/maps/handlers/discoveryPlaces.ts`
  - `src/features/discovery/services/venueRelevance.ts`
* **Action:**
  - Update `extractOwnerPhotos` to fall back to the highest-resolution photo if no exact owner-matched author photo is present, rather than discarding all photos.
  - Most high-quality venue photos on Google Maps are uploaded by customers or Local Guides; dropping them leaves venues without any imagery.

---

## 9. Verification Plan

When the fixes are ready to be implemented, verify using the following protocol:

1. **Google Cloud Billing Verification:**
   ```bash
   curl -s "https://places.googleapis.com/v1/places:searchText" \
     -H "Content-Type: application/json" \
     -H "X-Goog-Api-Key: $GOOGLE_MAPS_API_KEY" \
     -H "X-Goog-FieldMask: places.displayName,places.photos" \
     -d '{"textQuery": "badminton courts in Chennai"}'
   ```
   *Expected Result:* Returns status 200 with `places` array containing valid photo resource names.

2. **Edge Function Photo Proxy Verification:**
   ```bash
   curl -I -s "https://[PROJECT].supabase.co/functions/v1/maps?action=photo&photo_reference=[TEST_PHOTO_REF]"
   ```
   *Expected Result:* Returns HTTP 302 redirecting to `lh3.googleusercontent.com` or HTTP 200 image binary, **not** HTTP 403 JSON.

3. **Database Override Verification:**
   - In Supabase Table Editor, verify at least one test venue has a valid public URL in `image_path`.
   - Open Planless discovery tab for that venue's category.
   - Verify the card displays the specific override image instead of the generic category fallback.

4. **Multi-Category UI Verification:**
   - Navigate to:
     - **Sports Feed:** Confirm badminton, turf, and gym cards show real venue photos.
     - **Dining Feed:** Confirm cafes and restaurants show food/interior photos.
     - **Activities Feed:** Confirm bowling/gaming venues show venue photos.
     - **Movies Feed:** Confirm TMDB movie posters continue loading without regressions.

---

## 10. Unverified Items

1. **Google Cloud Console Billing Administrator Access:**
   - Direct inspection of the Google Cloud Billing console was not possible from the code repository environment.
   - The billing status was verified directly via the Google Places API response error message and error codes.
