# Feature Documentation: Admin

## 1. Overview

The **Admin** feature is Planless's internal Content Management System (CMS) and platform control center. It enables authorized administrators to manage, curate, update, and publish discovery content (turfs, sports courts, movies, dining venues, and recreational experiences) directly within the application interface.

* **Core Function**: A 3-tiered CMS interface providing:
  1. Content Type Directory (`home` tab): High-level category grid.
  2. Experience Listing & Manager (`list` tab): Inventory view of discovery cards with status badges and deletion triggers.
  3. Dynamic Entry/Edit Form (`form` tab): Schema-driven form engine supporting text inputs, subcategory selectors, venue locations, and automatic WebP image processing/uploading.
* **Product Role**: Administrative interface unlocked for users with `isAdmin === true` in `ProfileContext`. Accessible via internal developer toggles or the profile settings menu.
* **Scope & Boundaries**: Manages platform-curated discovery catalogs (`discovery_sections` and `discovery_items`). Does not modify user-created private plans, wallet transactions, or user account passwords.

---

## 2. User Flow

### 1. Accessing the Admin Console (`AdminScreen.tsx`)
* An authorized administrator accesses the Admin Center.
* The screen mounts in the `home` view, displaying the "Planless CMS Control" header and a grid of content types:
  * **Turfs**: Sports turf venues and outdoor pitches.
  * **Movies**: Cinema listings and blockbuster features.
  * **Dining & Drinks**: Curated eateries and lounges.

### 2. Inspecting Category Inventory (`activeTab === 'list'`)
* Admin taps a content type card (e.g. "Turfs").
* `fetchItems(config)` retrieves active records via `adminFetchItems(config.category)`.
* Screen displays a vertical list of inventory items:
  * Each card displays the resolved cover photo, title, sport/genre subcategory badge, location snippet, and display order.
  * Admin can tap the **Edit** icon (`Edit` / pencil) to modify an item or tap the **Delete** icon (`Trash`) to soft-delete it.
  * Admin can tap the floating **"+"** button in the bottom right to create a new experience card.

### 3. Creating or Editing an Experience (`activeTab === 'form'`)
* Admin enters the dynamic form editor:
  * If creating: fields initialize to schema defaults (`ADMIN_CONFIGS`).
  * If editing: fields pre-populate with the selected item's database values.
* Admin inputs experience metadata:
  * Title: e.g. "Play Arena Turf HSR".
  * Subcategory: Dropdown selection (e.g. Football, Badminton, Cricket).
  * Description: Overview of amenities, turf quality, or match rules.
  * Location: Venue physical street address.
  * Display Order: Numeric integer determining carousel placement.
* **Uploading Cover Image**:
  * Admin taps the image upload container.
  * Selects a local image file.
  * `handleImageUpload` delegates to `adminUploadImage`, which compresses the image to `.webp` format and uploads it to the `plan-covers` Supabase storage bucket.
  * The returned storage path is automatically bound to `formData.cover_image_url`.

### 4. Saving Content
* Admin taps **Save Experience / Publish**.
* Form dispatches:
  * `adminUpdateItem(id, payload, config)` if editing existing row.
  * `adminCreateItem(payload, config)` if creating new row.
* Screen invalidates the discovery cache and returns to the inventory list view.

---

## 3. UI Documentation

### Header Navigation (`AdminScreen.tsx`)
* **Header Bar**: Fixed top header (`px-5 py-4 border-b border-white/[0.04] bg-black/40 backdrop-blur-md flex items-center justify-between z-30`).
* **Back Navigation**: Left chevron button (`w-8 h-8 rounded-lg bg-zinc-900 border border-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-white transition active:scale-95`). Transitions back through tabs (`form` -> `list` -> `home` -> exit).
* **Typography**:
  * Title: Bold tracking-tight headline (`font-sans font-black text-[17px] tracking-tight leading-none text-white`) dynamically rendering "Admin Center", "[Category] Manager", or "Edit [Item]".
  * Subtitle: Monospace uppercase label (`text-[10px] font-medium text-zinc-400 font-mono tracking-wider mt-1`) displaying context ("Planless CMS Control" / "Internal Content Database").

### Content Type Selection Grid (`activeTab === 'home'`)
* **Layout**: 2-column grid (`grid grid-cols-2 gap-4 px-1`).
* **Category Card**:
  * Container: Rounded rectangular card (`p-5 rounded-2xl bg-zinc-950 border border-white/[0.06] hover:border-white/20 active:scale-[0.98] transition-all cursor-pointer flex flex-col justify-between h-36`).
  * Headline: Large category title in bold white (`text-lg font-bold text-white`).
  * Tagline: Monospace description badge (`text-xs text-zinc-500 font-mono`).

### Inventory List View (`activeTab === 'list'`)
* **List Column**: Padded vertical list (`space-y-3 pb-28`).
* **Inventory Row**:
  * Layout: Full-width item (`p-3 rounded-2xl bg-zinc-950/80 border border-white/[0.06] flex items-center justify-between hover:border-white/10 transition-colors`).
  * Leading thumbnail: 52x52px rounded cover photo preview (`w-[52px] h-[52px] rounded-xl overflow-hidden bg-zinc-900 border border-white/10 flex-shrink-0 relative`).
  * Text details: Item title in bold white (`text-sm font-semibold text-white truncate`), subcategory pill tag (`text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400`), and venue address.
  * Action controls: Row containing edit pencil icon and red trash icon (`text-zinc-500 hover:text-red-400 p-2 cursor-pointer`).
* **Floating "+ New" Button**: Circular orange action button pinned bottom-right (`fixed z-40 w-12 h-12 rounded-full bg-[#FF6B2C] text-white flex items-center justify-center shadow-lg shadow-black/50 border border-white/20 active:scale-95`).

### Schema-Driven Form Editor (`activeTab === 'form'`)
* **Form Container**: Padded vertical form stack (`space-y-5 max-w-lg mx-auto pb-28`).
* **Input Fields**:
  * Text / Number Input: Rounded dark container (`h-12 w-full bg-zinc-950 border border-white/[0.08] rounded-xl px-4 text-sm text-white focus:border-white/20 focus:outline-none`).
  * Dropdown Select: Stylized dark select element with custom chevron icon.
  * Textarea: Multiline input with subtle vertical resize grip.
* **Image Upload Zone**:
  * Dashed drag-and-drop zone (`w-full h-40 rounded-2xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-2 hover:border-white/30 transition-colors cursor-pointer relative overflow-hidden bg-zinc-950`).
  * If uploaded: Renders full-bleed `.webp` preview thumbnail with an "Edit image" overlay chip.
  * If uploading: Displays animated spinner and "Optimizing WebP..." status label.
* **Submit Action**: Full-width submit button (`w-full py-3.5 rounded-xl bg-[#FF6B2C] hover:bg-[#FF854C] text-white font-semibold text-sm shadow-lg shadow-[#FF6B2C]/20 active:scale-[0.99]`).

---

## 4. Components

| Component | File Path | Responsibilities | Key Relationships |
|---|---|---|---|
| `AdminScreen` | `src/features/admin/screens/AdminScreen.tsx` | Root CMS console component. Renders tab switching, inventory lists, and dynamic field editing forms. | Calls `discoveryService.ts` and `discoveryAdminService.ts`. |
| `ADMIN_CONFIGS` | `src/features/admin/screens/AdminScreen.tsx` | Declarative field definition schemas (turfs, movies, dining) driving form inputs. | Consumed by `AdminScreen` form generator. |
| `adminUploadImage` | `src/features/discovery/services/discoveryAdminService.ts` | Image compression and storage service converting assets to `.webp` and writing to Supabase. | Called by `handleImageUpload`. |
| `discoveryService` | `src/features/discovery/services/discoveryService.ts` | CRUD interface dispatching admin mutations (`adminFetchItems`, `adminCreateItem`, `adminUpdateItem`, `adminDeleteItem`). | Calls `discoveryQueries.ts`. |

---

## 5. Data Flow

```text
[Admin Modifies Experience Form & Submits]
                    │
                    ▼
     [AdminScreen.handleSubmit]
                    │
    ├── 1. Image upload (if new file):
    │        adminUploadImage ──► Compresses to WebP ──► Storage Bucket 'plan-covers'
    │
    └── 2. Dispatches CRUD:
             adminCreateItem / adminUpdateItem
                    │
                    ▼
     [discoveryService ──► discoveryQueries]
                    │
                    ▼
   [Supabase REST: public.discovery_items]
    ├── INSERT / UPDATE row
    └── Enforces admin authorization via RLS / JWT
                    │
                    ▼
      [Invalidate Cached Discovery Sections]
                    │
                    ▼
     [Refreshes Admin List & Discovery Hub]
```

---

## 6. Backend & Database

* **Target Supabase Environment**: Local instance at `http://127.0.0.1:54321` (DB: `127.0.0.1:54322`, ref: `wecmpncixopetvunkkyd`).

### 1. Table: `public.discovery_items`
* **Role in Feature**: Primary entity managed by the Admin CMS.
* **Key Columns**:
  * `id` (`uuid`, PK): Item unique ID.
  * `section_id` (`uuid`, FK `discovery_sections.id`): Bound section category.
  * `title` (`text`, not null): Experience title.
  * `category` (`text`, not null): `'SPORTS'`, `'MOVIES'`, `'DINING'`, `'DRINKS'`.
  * `subcategory` (`text`, nullable): Specific sub-genre.
  * `description` (`text`, nullable): Long-form copy.
  * `location` (`text`, nullable): Street address.
  * `cover_image_url` (`text`, not null): Storage asset path.
  * `display_order` (`integer`, default 1): Carousel sorting index.
  * `status` (`text`, default `'ACTIVE'`): Soft-delete flag (`'ACTIVE'` vs `'INACTIVE'`).

### 2. Supabase Storage: `plan-covers` Bucket
* Dedicated storage bucket hosting curated experience covers in optimized WebP format.

### 3. Security & Row Level Security (RLS)
* **Access Control**: Administrative write operations (`INSERT`, `UPDATE`, `DELETE`) require admin claims. Client requests send the session token with the executing user's UUID.

---

## 7. States & Rules

### Admin Editing Rules
* **Soft Delete Policy**: Deleting an item executes `UPDATE discovery_items SET status = 'INACTIVE' WHERE id = ?`. Rows are never hard-deleted from Postgres.
* **UUID Pre-allocation**: When creating a new item with an image, the client generates a UUID (`crypto.randomUUID()`) beforehand so the uploaded storage asset path matches the item's database primary key (`/plan-covers/<category>/<subcategory>/<itemId>.webp`).
* **Category Section Binding**: Each category in `ADMIN_CONFIGS` binds to a fixed `section_id` UUID to ensure newly created items immediately anchor into their corresponding public discovery section.

---

## 8. Dependencies & Change Impact

### Upstream Dependencies
* **`ProfileContext` (`useProfileStore`)**: Authorizes admin navigation based on `isAdmin`.
* **`discoveryAdminService`**: Provides image compression pipelines and storage uploaders.

### Downstream Impact of Changes
* **Discovery Feed (`Discovery.tsx`, `DiscoverSports.tsx`)**: Any modification, reordering, or soft deletion made in Admin immediately affects the customer-facing discovery catalog.
* **Plan Creation Pre-fill**: Newly created admin experiences can immediately be selected by users to seed new plans.

---

## 9. Important Files

* `src/features/admin/screens/AdminScreen.tsx`: Root administrative CMS console.
* `src/features/discovery/services/discoveryService.ts`: Admin API callers.
* `src/features/discovery/services/discoveryQueries.ts`: Database query executions.
* `src/features/discovery/services/discoveryAdminService.ts`: Image processing pipeline.

---

## 10. Known Issues

### 1. Hardcoded Section UUIDs in `ADMIN_CONFIGS`
* **What Code Does**: `ADMIN_CONFIGS` contains static hardcoded UUIDs for `section_id` (e.g. `'6dca5b0c-81e8-405a-851b-1a84664af845'`).
* **What Database Does**: If the local database is reset or re-migrated with freshly generated `discovery_sections` UUIDs, foreign key constraint violations will occur when creating new items.
* **What is Unknown**: Whether section IDs should be dynamically queried by category string rather than hardcoded in the frontend.

---

## 11. Modification Notes

### Pre-Modification Checklist
1. **Verify Section ID Integrity**: Before adding new categories to `ADMIN_CONFIGS`, verify that a matching row exists in `public.discovery_sections` with the corresponding `section_id` UUID.
2. **Preserve WebP Pipeline**: Always route image uploads through `adminUploadImage` to maintain consistent image compression and prevent multi-megabyte raw camera uploads.

### Post-Modification Verification Steps
1. **CMS Create Round-Trip**:
   - Open Admin Screen -> select "Turfs" -> click "+ New".
   - Fill title, choose sport, upload an image, and save.
   - Verify item appears in Admin list and immediately displays on the public Discovery screen.
2. **Soft Delete Verification**:
   - Delete the newly created item: verify it disappears from public discovery and its database status is set to `'INACTIVE'`.
