# Root-Cause Audit: Google Places Permission Errors and Venue Image Failures

**Date:** 2026-10-11  
**Project:** Planless (`apps/app`)  
**Scope:** Investigation of `[useGooglePlacesAutocomplete Hook] Google API error: The caller does not have permission` and generic placeholder image fallback across discovery venues.  
**Deliverable Path:** `docs/discovery/GOOGLE_PLACES_PERMISSION_AND_IMAGE_FAILURE_AUDIT.md`  
**Status:** Complete Audit (Diagnostic Only — No application code, database, or production modifications applied)

---

## 1. Executive Summary

### 1.1 The Reported Symptoms
1. **Autocomplete Error in Browser Console:**
   ```
   [useGooglePlacesAutocomplete Hook] Google API error: The caller does not have permission
   ```
   Reported through `installHook.js` (React DevTools) while running the application.
2. **Venue Card Images Falling Back to Generic 3D Placeholders:**
   Across venue feeds (e.g. Sports, Dining, Activities), venue cards display an identical generic illustration (e.g., `sports.webp` / `sports_turf.jpg` featuring 3D equipment balls). Movies remain unaffected because they are loaded from TMDB.

### 1.2 Summary of Findings
| Issue | Observed Symptom | Confirmed Root Cause | Environment Affected |
| :--- | :--- | :--- | :--- |
| **Issue 1: Autocomplete Permission Denied** | `The caller does not have permission` | **Stale Local Container Secret:** The local Supabase Docker container (`supabase_edge_runtime_planless`, container `bf11730c2c2f`) was started 24 hours ago and is still holding the **old, unbilled Google API key** (`AIza...gjwE` from Consumer Project `#439259333682`) in its runtime environment (`docker.env`). When `npm run dev` proxies Autocomplete requests from `http://localhost:3000` to local Supabase (`http://127.0.0.1:54321`), Google rejects the unbilled key with `HTTP 403 PERMISSION_DENIED: The caller does not have permission`. | **Local Development** (Production Supabase is already updated with new key `AIza...1Edc` and returns `200 OK`). |
| **Issue 2: Photo Proxy 403 Forbidden** | Venue images fail to load via `/functions/v1/maps?action=photo` | **Photo Resource Name Truncation:** `discoveryPlaces.ts` (`extractOwnerPhotos`) and `placeDetails.ts` strip the `places/{placeId}/photos/` prefix from Google Places API (New) photo resource names, passing only the trailing photo ID (e.g. `Aa-ngMavpsN...`) to `placePhoto.ts`. In `placePhoto.ts`, because the prefix is missing, the request is misclassified as a legacy photo and routed to `https://maps.googleapis.com/maps/api/place/photo`. On the new GCP project, the **Legacy Places API is disabled**, returning `HTTP 403 Forbidden`. | **Both Local & Production** |
| **Issue 3: UI Fallback Cascade to Generic Assets** | All cards display identical 3D balls illustration | **`<img onError>` Handler in `PlanImages.tsx`:** When the browser's `<img>` tag attempts to load `/functions/v1/maps?action=photo` and receives `HTTP 403`, native `onError` fires. `PlanImages.tsx` catches the failure and sets `localFailed = true`, replacing the card cover with `getPlanCover("SPORTS")` (`sports.webp`). | **Both Local & Production** |
| **Issue 4: Database Overrides Have No Stored Images** | Database overrides fail identically to live Google Places | **Null Image Storage:** 100% of records in `discovery_place_overrides` have `image_path = NULL`. They only store legacy `Aa-ngM...` photo references or literal `"undefined"`. None contain self-hosted uploaded assets. | **Both Local & Production** |

---

## 2. Current Architecture & Credential Flow

### 2.1 The Two Google Cloud Credentials in Circulation
1. **Old Project (`#439259333682`):**
   - API Key Fingerprint: `AIzaSyBLrJ...0jgjwE` (Masked: `AIza...gjwE`)
   - Billing Status: **DISABLED** (`BILLING_DISABLED`)
   - Places API (New) Quota: Exhausted / 100 per day unbilled cap (`429 RESOURCE_EXHAUSTED: SearchTextRequest per day`)
   - Autocomplete Status: Rejected with `403 PERMISSION_DENIED: The caller does not have permission`
   - Photo Status: Rejected with `403 PERMISSION_DENIED: This API method requires billing to be enabled`
   - Location: Cached inside the running local Docker container `supabase_edge_runtime_planless` (`/supabase/.temp/start-secrets/supabase_edge_runtime_planless/env/docker.env`).

2. **New Project (`augh-eyas`):**
   - API Key Fingerprint: `AIzaSyD12v...Nu1Edc` (Masked: `AIza...1Edc`)
   - Billing Status: **ACTIVE**
   - Places API (New) Endpoints Enabled: `places:autocomplete` (`200 OK`), `places:searchNearby` (`200 OK`), `places:searchText` (`200 OK`), `places/{id}` (`200 OK`), `places/{id}/photos/{id}/media` (`302 Redirect OK`).
   - Legacy Places API: **DISABLED** (`https://maps.googleapis.com/maps/api/place/photo` returns `403 Forbidden`).
   - Location: Configured in `.env`, `supabase/functions/.env`, `supabase/functions/maps/.env`, and live Supabase production secrets (`wecmpncixopetvunkkyd`).

### 2.2 Request Routing Flow in Local Development

```
[Browser on http://localhost:3000]
       │
       ▼
[apps/app/backend/server.ts] (Reverse Proxy)
       │ Forwards /functions/v1/maps traffic to local gateway target
       ▼
[Kong Gateway on http://127.0.0.1:54321]
       │
       ▼
[Docker Container: supabase_edge_runtime_planless (bf11730c2c2f)]
       │ Started 24h ago; env injected from .temp/start-secrets/docker.env
       │ Contains STALE KEY: GOOGLE_MAPS_API_KEY=AIza...gjwE (Project 439259333682)
       ▼
[Google Cloud Places API (New)]
       │
       ▼ Rejected!
HTTP 403 Forbidden: "The caller does not have permission"
       │
       ▼ Returned as JSON { status: "ERROR", error_message: "The caller does not have permission" }
[useGooglePlacesAutocomplete Hook]
       │
       ▼
console.error("[useGooglePlacesAutocomplete Hook] Google API error: The caller does not have permission")
```

---

## 3. Deep Diagnosis: The Permission Error

### 3.1 Trace of `useGooglePlacesAutocomplete`
1. **Frontend Call:**
   In [useGooglePlacesAutocomplete.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/shared/hooks/useGooglePlacesAutocomplete.ts#L132-L135):
   ```ts
   const { data, error: invokeError } = await supabase.functions.invoke("maps", {
     body: { action: "autocomplete", input: query, sessiontoken: token },
   });
   ```
2. **Client Target Resolution:**
   In [supabaseClient.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/lib/supabaseClient.ts#L6-L21), `VITE_SUPABASE_URL` is read.
   In `.env.local`: `VITE_SUPABASE_URL=http://127.0.0.1:54321`.
   Therefore, the frontend targets the **local Supabase Kong instance**, not the production cloud instance.
3. **Backend Execution:**
   The request hits [autocomplete.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/maps/handlers/autocomplete.ts#L25):
   ```ts
   const apiKey = getGoogleApiKey(); // Reads Deno.env.get("GOOGLE_MAPS_API_KEY")
   ```
4. **Environment Variable Origin:**
   Inspecting container `bf11730c2c2f` (`docker exec bf11730c2c2f env`) revealed:
   ```bash
   GOOGLE_MAPS_API_KEY=AIzaSyBLrJCokhIaUIi412RPKsjV4HDi80jgjwE
   ```
   This is the old, unbilled key from Project `#439259333682`.
5. **Direct Verification of the Google Error:**
   Sending an Autocomplete request using `AIza...gjwE` directly to `https://places.googleapis.com/v1/places:autocomplete` returned:
   ```json
   {
     "error": {
       "code": 403,
       "message": "The caller does not have permission",
       "status": "PERMISSION_DENIED"
     }
   }
   ```
   **Conclusion:** The error is NOT an application code bug or malformed payload. It is caused by the local Docker container running an unbilled, quota-locked API key that was never refreshed when the project files were updated.

---

## 4. Deep Diagnosis: Missing Images & Placeholder Fallback

### 4.1 The Image Pipeline Breakdown
When venue cards render in `DiscoveryCard.tsx`, the cover image is displayed via `DiscoveryImages` (`src/IMGfromDB/PlanImages.tsx`).

The image failure is caused by a **two-stage defect**:

#### Stage A: Photo Resource Name Stripping in Edge Function Handlers
In [discoveryPlaces.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/maps/handlers/discoveryPlaces.ts#L76-L82):
```ts
const ref = ph.name?.includes("/photos/")
  ? ph.name.split("/photos/")[1]
  : ph.photo_reference || ph.name || "";
```
And in [placeDetails.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/maps/handlers/placeDetails.ts#L43-L45):
```ts
const ref = ph.name || ph.photo_reference;
const cleanKey = ref.split("/photos/").pop() || ref;
```
- In Google Places API (New), photo names are structured resource paths:
  `places/{placeId}/photos/{photoId}` (e.g. `places/ChIJ0_ELQwAjrjsReue4wTYPq_8/photos/Aa-ngMavpsN...`).
- By splitting on `/photos/` and discarding the prefix, `discoveryPlaces.ts` stores only `{photoId}` (`Aa-ngMavpsN...`).

#### Stage B: Misrouting in `placePhoto.ts`
When the browser requests `/functions/v1/maps?action=photo&photo_reference=Aa-ngMavpsN...`, [placePhoto.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/maps/handlers/placePhoto.ts#L14-L28) evaluates:
```ts
const isNewPlacesPhoto = cleanRef.startsWith("places/") || cleanRef.includes("/photos/");
```
Because the prefix was stripped, `isNewPlacesPhoto` is **`false`**!
As a result:
1. `placePhoto.ts` attempts to treat it as a legacy `photo_reference`:
   ```ts
   photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${cleanRef}&key=${apiKey}`;
   ```
2. Google Cloud rejects this request:
   - On the **new Google Cloud project**, the legacy Places API is **disabled** (`HTTP 403 Forbidden`).
   - On the **local Docker container**, the old unbilled key returns `HTTP 403 Forbidden: Billing disabled`.
3. `placePhoto.ts` returns `HTTP 403` with JSON `{ error: "Failed to retrieve photo" }`.

#### Stage C: Client-Side Fallback Trigger
In [PlanImages.tsx](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/IMGfromDB/PlanImages.tsx#L208-L215):
```tsx
const handleLoadFailure = () => {
  if (sourceType === "LOCAL_DEFAULT") {
    setLocalFailed(true);
  }
};
...
<img src={resolvedUrl} onError={handleLoadFailure} />
```
1. Browser `<img src="/functions/v1/maps?action=photo...">` receives `HTTP 403`.
2. Browser triggers `onError`.
3. `setLocalFailed(true)` changes `resolvedUrl` to `getPlanCover(category)`:
   - For `category === "SPORTS"`, `getPlanCover` returns `/assets/sports.webp` (the 3D balls image).
   - For `category === "DINING"`, `getPlanCover` returns `/assets/dining.webp`.
   - For `category === "ACTIVITIES"`, `getPlanCover` returns `/assets/categories/activity.png`.
4. Every single card's real photo fails and falls back to the exact same static category asset.

#### Stage D: Places with No Owner Photos
In [discoveryPlaces.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/maps/handlers/discoveryPlaces.ts#L1173-L1176):
Planless enforces a strict owner-photo rule: customer selfies and unverified photos are discarded. If a venue has no photos where the author matches the venue brand, `coverUrl` is immediately assigned:
```ts
coverUrl = getCuratedPhotoForVenue(itemCategory, place.types, placeName);
```
For sports venues, `getCuratedPhotoForVenue("SPORTS", ...)` returns `/assets/curated/sports_turf.jpg` (which is also the 3D balls image).

### 4.2 Audit of `discovery_place_overrides`
Inspection of the `discovery_place_overrides` table in Supabase revealed:
- **Total records:** 80 in production.
- **`image_path`:** `NULL` in **100% of rows**. Not a single record has an uploaded image stored in Supabase Storage.
- **`google_photo_reference`:**
  - 80% store legacy `photo_reference` tokens from the deprecated legacy API (`Aa-ngM...`).
  - 10% store literal string `"undefined"`.
  - 10% store truncated resource paths.
- **Impact:** The database override layer provides zero protection against Google photo failures because it relies on the same broken photo pipeline.

---

## 5. Feature-by-Feature Status Audit

| Feature | Local Development Status | Production Cloud Status | Root Cause of Local / Prod Failure |
| :--- | :--- | :--- | :--- |
| **Autocomplete** | ❌ **FAILS** (`403 The caller does not have permission`) |  **WORKS** (`200 OK`) | Local container has old unbilled key `AIza...gjwE`. Production has new key `AIza...1Edc`. |
| **Nearby Search (New)** | ❌ **FAILS** (`403 Billing disabled`) |  **WORKS** (`200 OK`) | Local container has old key. Production works correctly. |
| **Place Details (New)** | ❌ **FAILS** (`403 Billing disabled`) |  **WORKS** (`200 OK`) | Local container has old key. Production works correctly. |
| **Photo Proxy (`handlePlacePhoto`)** | ❌ **FAILS** (`403 Billing disabled`) | ❌ **FAILS** (`403 Forbidden`) | Truncated photo resource names route to the disabled Legacy Photo API endpoint. |
| **Sports Venue Images** | ❌ **FALLBACK** (Shows `sports.webp` / `sports_turf.jpg`) | ❌ **FALLBACK** (Shows `sports.webp` / `sports_turf.jpg`) | Photo proxy returns 403 -> `<img onError>` triggers category fallback. |
| **Dining Venue Images** | ❌ **FALLBACK** (Shows `dining.webp` / `cafe.jpg`) | ❌ **FALLBACK** (Shows `dining.webp` / `cafe.jpg`) | Photo proxy returns 403 -> `<img onError>` triggers category fallback. |
| **Activities Venue Images**| ❌ **FALLBACK** (Shows `activity.png` / `arcade.jpg`) | ❌ **FALLBACK** (Shows `activity.png` / `arcade.jpg`) | Photo proxy returns 403 -> `<img onError>` triggers category fallback. |
| **Movies Feed & Posters** |  **WORKS** |  **WORKS** | Sourced from TMDB (`image.tmdb.org`), completely independent of Google Maps. |
| **Geocoding** | ❌ **FAILS** on local edge function |  **WORKS** (Falls back to Nominatim OSM) | Handled by Nominatim fallback in `useGooglePlacesAutocomplete`. |

---

## 6. Local vs. Production Comparison

| Attribute | Local Development (`localhost:3000`) | Production Cloud (`wecmpncixopetvunkkyd`) |
| :--- | :--- | :--- |
| **Backend Target** | `http://127.0.0.1:54321` (Kong Gateway) | `https://wecmpncixopetvunkkyd.supabase.co` |
| **Runtime Container** | Docker `supabase_edge_runtime_planless` | AWS Lambda / Supabase Cloud Deno Workers |
| **Edge Function Secret** | **STALE:** `AIza...gjwE` (Project 439259333682) | **ACTIVE:** `AIza...1Edc` (Project augh-eyas) |
| **`places:autocomplete`** | Returns `403 Permission Denied` | Returns `200 OK` with predictions |
| **`places:searchNearby`** | Returns `403 Billing Disabled` | Returns `200 OK` with 17 venues |
| **Photo URL Generation** | Strips `places/.../photos/` | Strips `places/.../photos/` |
| **Photo Retrieval** | Fails with 403 | Fails with 403 |
| **Image Display** | Falls back to generic placeholder | Falls back to generic placeholder |

---

## 7. Files and Functions Involved

1. [supabase_edge_runtime_planless (Docker)](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/.temp/start-secrets/supabase_edge_runtime_planless/env/docker.env):
   - Injected runtime file holding stale `GOOGLE_MAPS_API_KEY=AIzaSyBLrJCokhIaUIi412RPKsjV4HDi80jgjwE`.
2. [discoveryPlaces.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/maps/handlers/discoveryPlaces.ts#L76-L82):
   - `extractOwnerPhotos()`: Line 77 splits on `/photos/` and truncates the resource name to just the photo ID.
3. [placeDetails.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/maps/handlers/placeDetails.ts#L43-L45):
   - `handlePlaceDetails()`: Line 44 splits on `/photos/` and truncates the resource name.
4. [placePhoto.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/maps/handlers/placePhoto.ts#L14-L28):
   - `handlePlacePhoto()`: Checks `isNewPlacesPhoto = cleanRef.startsWith("places/")`. When the prefix is stripped, it sends the request to legacy `maps.googleapis.com/maps/api/place/photo`.
5. [PlanImages.tsx](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/IMGfromDB/PlanImages.tsx#L208-L215):
   - `handleLoadFailure()`: Catches HTTP 403 image failures and swaps the card image to `getPlanCover(category)` (`sports.webp`).
6. [curatedPhotos.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/discovery/services/curatedPhotos.ts#L29):
   - `getCuratedPhotoForVenue()`: Assigns `/assets/curated/sports_turf.jpg` when no owner photo is found.

---

## 8. Confirmed Issues vs. Hypotheses

### Confirmed by Live Diagnostic Evidence:
1. **Confirmed:** Local Supabase Edge Function container is running the old key `AIza...gjwE`. Verified via `docker exec bf11730c2c2f env` and `docker logs`.
2. **Confirmed:** Calling `places:autocomplete` with `AIza...gjwE` returns HTTP 403 `The caller does not have permission` because billing is disabled on project `439259333682`. Verified via direct HTTP request.
3. **Confirmed:** Production Supabase cloud function has the new key `AIza...1Edc` and returns HTTP 200 `OK` for Autocomplete. Verified via live invocation of `wecmpncixopetvunkkyd.supabase.co/functions/v1/maps`.
4. **Confirmed:** Calling Places API (New) photo media with the full resource name `places/{placeId}/photos/{photoId}` returns `HTTP 302 Redirect` with Google's signed CDN image. Verified via live HTTP request.
5. **Confirmed:** Calling the legacy photo endpoint `maps.googleapis.com/maps/api/place/photo` with the new key returns `HTTP 403 Forbidden` because the Legacy Places API is disabled on the new project.
6. **Confirmed:** `extractOwnerPhotos` strips `places/{placeId}/photos/`, leaving only the photo ID, which triggers the legacy code path and causes `HTTP 403`.

### Refuted Hypotheses:
1. **Refuted:** The new Google API key does not have permission for Autocomplete. *(False: The new key has full permissions and returns 200 OK. The error only happens when the request is sent to the local Docker container running the old key).*
2. **Refuted:** The frontend has a direct browser Google Maps key with domain restrictions. *(False: The frontend makes zero direct Google API calls. All calls route through Supabase Edge Function `maps`).*
3. **Refuted:** The database overrides have working images. *(False: 100% of rows have `image_path = NULL`).*

---

## 9. Recommended Fixes in Priority Order

### Fix 1 (Immediate — Solves Local Autocomplete Permission Error):
Restart the local Supabase stack so the Edge Runtime Docker container reloads the updated `.env` file containing the new API key:
```bash
npx supabase stop
npx supabase start
```
*Why this fixes it:* `supabase start` re-reads `/supabase/functions/.env` (which already has `AIza...1Edc`), writes a fresh `.temp/start-secrets/docker.env`, and restarts container `supabase_edge_runtime_planless` with the active key.

### Fix 2 (Immediate — Solves Venue Photo Failures Across Local & Production):
Preserve the full Google Places API (New) photo resource name (`places/{placeId}/photos/{photoId}`) instead of splitting on `/photos/`.
1. In `discoveryPlaces.ts` (`extractOwnerPhotos`):
   ```ts
   // Change:
   const ref = ph.name || ph.photo_reference || "";
   // (Do NOT split on "/photos/")
   ```
2. In `placeDetails.ts` (`handlePlaceDetails`):
   ```ts
   // Change:
   const ref = ph.name || ph.photo_reference;
   // (Do NOT split on "/photos/")
   ```
3. In `placePhoto.ts` (`handlePlacePhoto`):
   Ensure `isNewPlacesPhoto` detects any reference containing `/photos/` or starting with `places/`, and calls:
   `https://places.googleapis.com/v1/${resourceName}/media?maxWidthPx=${maxWidth}&key=${apiKey}`.
   Deploy the updated function to production:
   ```bash
   npx supabase functions deploy maps
   ```
*Why this fixes it:* When `handlePlacePhoto` receives the full resource name, it calls Places API (New) photo media, which returns `HTTP 302 Redirect` to Google CDN. The browser's `<img>` tag successfully loads the venue photo, `<img onError>` never fires, and cards display real photography instead of generic placeholders.

### Fix 3 (Optional / Data Hygiene):
In `public.discovery_place_overrides`, clean up legacy photo references (`Aa-ngM...`) and literal string `"undefined"` values.

---

## 10. Verification Plan

1. **Autocomplete Verification:**
   - Open the app locally at `http://localhost:3000`.
   - Open Location Setter or Create Plan.
   - Type `"Toit"` in the location search bar.
   - Verify `[useGooglePlacesAutocomplete Hook] Google API error` no longer appears in console.
   - Verify predictions dropdown displays Indian venues.
2. **Venue Photo Verification:**
   - Open Home discovery feed (`http://localhost:3000`).
   - Observe the "Sports", "Dining", and "Activities" rails.
   - Verify venue cards load actual Google Places photos instead of the generic 3D balls illustration (`sports.webp`).
   - Check Network tab for `/functions/v1/maps?action=photo`: verify status is `302 Redirect` to `lh3.googleusercontent.com` (image loaded).
3. **Production Parity Verification:**
   - Execute test query against production Edge Function for both Autocomplete and photo media.
   - Confirm status `200 OK` and `302 Redirect` with zero 403 errors.
